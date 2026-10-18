import functions from '@google-cloud/functions-framework';
import { Firestore, FieldValue } from '@google-cloud/firestore';

/** Pages allowed to post feedback: the share app, the website, stage and local dev. */
const ALLOWED_ORIGINS = [
  /^https:\/\/recordseek\.com$/,
  /^https:\/\/www\.recordseek\.com$/,
  /^https:\/\/recordseek\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
];
const TYPES = new Set(['idea', 'bug']);
const MAX_MESSAGE = 5000;

let db;
function firestore() {
  // The project's (default) database is a legacy Datastore-mode one; feedback
  // lives in the Firestore-native `recordseek` database.
  db ??= new Firestore({ databaseId: process.env.FIRESTORE_DATABASE || 'recordseek' });
  return db;
}

function clip(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Validates a submission. Returns the document to store, or an error string.
 * `website` is a honeypot: people never see it, bots fill it in.
 */
export function parseFeedback(body) {
  if (!body || typeof body !== 'object') return { error: 'Invalid body' };
  if (clip(body.website, 200)) return { spam: true };
  const type = clip(body.type, 10).toLowerCase();
  if (!TYPES.has(type)) return { error: 'type must be idea or bug' };
  const message = clip(body.message, MAX_MESSAGE);
  if (message.length < 3) return { error: 'message is required' };
  const email = clip(body.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'email looks invalid' };
  return {
    doc: {
      type,
      message,
      email: email || null,
      page: clip(body.page, 500) || null,
      source: clip(body.source, 40) || null,
      release: clip(body.release, 80) || null,
      status: 'new',
    },
  };
}

export async function handleFeedback(req, res, store = firestore()) {
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

  const parsed = parseFeedback(req.body);
  // Answer bots as if it worked, so they don't retry.
  if (parsed.spam) return res.status(201).json({ ok: true });
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  await store.collection('feedback').add({
    ...parsed.doc,
    userAgent: clip(req.get('user-agent'), 300) || null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return res.status(201).json({ ok: true });
}

functions.http('feedback', (req, res) => handleFeedback(req, res));
