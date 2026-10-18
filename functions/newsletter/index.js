import { createHash } from 'node:crypto';
import functions from '@google-cloud/functions-framework';
import { Firestore, FieldValue } from '@google-cloud/firestore';

/** Pages allowed to post: the share app, the website, stage and local dev. */
const ALLOWED_ORIGINS = [
  /^https:\/\/recordseek\.com$/,
  /^https:\/\/www\.recordseek\.com$/,
  /^https:\/\/recordseek\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
];
const ACCOUNT_RE = /^(fs|geni|zotero)_[0-9a-f]{32}$/;
const MAX_ACCOUNTS = 10;

let db;
function firestore() {
  // The project's (default) database is a legacy Datastore-mode one; use the native `recordseek` one.
  db ??= new Firestore({ databaseId: process.env.FIRESTORE_DATABASE || 'recordseek' });
  return db;
}

function clip(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Keeps well-formed, unique account hashes only (never raw provider ids). */
export function cleanAccounts(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((a) => typeof a === 'string' && ACCOUNT_RE.test(a)))].slice(0, MAX_ACCOUNTS);
}

/** One email is one document: the key is the SHA-256 of the lowercased, trimmed address. */
export function emailKey(email) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/** Validates a subscribe body. Returns the cleaned fields, `{ spam }` or `{ error }`. */
export function parseSubscribe(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid body' };
  if (clip(body.website, 200)) return { spam: true };
  const email = clip(body.email, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'email looks invalid' };
  return {
    email,
    accounts: cleanAccounts(body.accounts),
    source: clip(body.source, 40) || null,
    release: clip(body.release, 80) || null,
  };
}

async function link(store, hashes, key) {
  const col = store.collection('subscriber_accounts');
  await Promise.all(
    hashes.map((h) => col.doc(h).set({ subscriber: key, linkedAt: FieldValue.serverTimestamp() }, { merge: true })),
  );
}

async function subscribe(store, parsed) {
  const key = emailKey(parsed.email);
  const ref = store.collection('subscribers').doc(key);
  // A transaction keeps createdAt from being overwritten when the email signs up again.
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = FieldValue.serverTimestamp();
    if (snap.exists) {
      tx.update(ref, { accounts: FieldValue.arrayUnion(...parsed.accounts), updatedAt: now });
    } else {
      tx.set(ref, {
        email: parsed.email,
        accounts: parsed.accounts,
        source: parsed.source,
        release: parsed.release,
        confirmed: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  await link(store, parsed.accounts, key);
}

async function status(store, body) {
  const accounts = cleanAccounts(body?.accounts);
  const col = store.collection('subscriber_accounts');
  const snaps = await Promise.all(accounts.map((h) => col.doc(h).get()));
  const found = snaps.find((s) => s.exists);
  if (!found) return { subscribed: false };
  const key = found.data().subscriber;
  const unlinked = accounts.filter((_, i) => !snaps[i].exists);
  // Accounts seen together in one browser belong to the same person.
  if (unlinked.length) {
    await link(store, unlinked, key);
    await store.collection('subscribers').doc(key).set(
      { accounts: FieldValue.arrayUnion(...unlinked), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  return { subscribed: true };
}

export async function handleNewsletter(req, res, store = firestore()) {
  const origin = req.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin));
  if (allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    return res.status(204).send('');
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!allowed) return res.status(403).json({ error: 'Origin not allowed' });

  const action = req.query?.action;
  if (action === 'subscribe') {
    const parsed = parseSubscribe(req.body);
    // Answer bots as if it worked, so they don't retry.
    if (parsed.spam) return res.status(201).json({ ok: true });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await subscribe(store, parsed);
    return res.status(201).json({ ok: true });
  }
  if (action === 'status') return res.status(200).json(await status(store, req.body));
  return res.status(400).json({ error: 'action must be subscribe or status' });
}

functions.http('newsletter', (req, res) => handleNewsletter(req, res));
