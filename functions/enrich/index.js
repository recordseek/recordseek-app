import { createHash } from 'node:crypto';
import functions from '@google-cloud/functions-framework';
import { Firestore } from '@google-cloud/firestore';
import { detect } from './providers/index.js';
import { needsEnrichment } from './completeness.js';
import { NotFoundError, UpstreamError } from './util.js';

/** Pages allowed to call enrich: the share app, the website, stage and local dev. */
const ALLOWED_ORIGINS = [
  /^https:\/\/recordseek\.com$/,
  /^https:\/\/www\.recordseek\.com$/,
  /^https:\/\/recordseek\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
];
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const RATE_LIMIT = 30; // requests per IP per minute, per instance
const RATE_WINDOW_MS = 60_000;
const MAX_URL = 2000;

let db;
function firestore() {
  db ??= new Firestore({ databaseId: process.env.FIRESTORE_DATABASE || 'recordseek' });
  return db;
}

export const cacheKey = (provider, id) => createHash('sha256').update(provider + id).digest('hex');

const hits = new Map();
export function rateLimited(ip, now = Date.now(), limit = RATE_LIMIT) {
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset <= now) {
    hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  h.count += 1;
  return h.count > limit;
}
export const resetRateLimit = () => hits.clear();

async function readCache(store, key, now) {
  try {
    const snap = await store.collection('enrich_cache').doc(key).get();
    if (!snap.exists) return null;
    const d = snap.data();
    const exp = d.expiresAt?.toMillis ? d.expiresAt.toMillis() : +new Date(d.expiresAt);
    return exp > now ? d.record : null;
  } catch (e) {
    console.warn('cache read failed', e?.message);
    return null;
  }
}
async function writeCache(store, key, provider, id, record, now) {
  try {
    await store.collection('enrich_cache').doc(key).set({ provider, id, record, cachedAt: new Date(now), expiresAt: new Date(now + CACHE_TTL_MS) });
  } catch (e) {
    console.warn('cache write failed', e?.message);
  }
}

export async function handleEnrich(req, res, deps = {}) {
  const store = deps.store ?? firestore();
  const fetchFn = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now();

  const origin = req.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.some((re) => re.test(origin));
  if (allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    return res.status(204).send('');
  }
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  if (!allowed) return res.status(403).json({ error: 'Origin not allowed' });

  const ip = String(req.get('x-forwarded-for') ?? req.ip ?? '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip, now)) {
    res.set('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }

  const body = req.method === 'POST' && req.body && typeof req.body === 'object' ? req.body : {};
  const url = String((req.method === 'POST' ? body.url : req.query?.url) ?? '').trim();
  if (!url || url.length > MAX_URL) return res.status(400).json({ error: 'url is required' });

  const found = detect(url);
  if (!found) return res.status(200).json({ supported: false });
  const { provider, id } = found;

  // The API is only a fallback: skip it when the captured page already has what we need.
  if (req.method === 'POST' && body.have && typeof body.have === 'object' && !needsEnrichment(body.have)) {
    return res.status(200).json({ supported: true, provider: provider.name, skipped: 'page-data-sufficient' });
  }

  const key = env[provider.keyEnv];
  if (!key) return res.status(200).json({ supported: false, provider: provider.name, reason: 'provider not configured' });

  const ck = cacheKey(provider.name, id);
  let record = await readCache(store, ck, now);
  let cached = true;
  if (!record) {
    cached = false;
    try {
      record = await provider.fetch(id, { fetch: fetchFn, key });
    } catch (e) {
      if (e instanceof NotFoundError) return res.status(404).json({ supported: true, provider: provider.name, error: 'Record not found' });
      console.warn(`${provider.name} upstream error:`, e instanceof UpstreamError ? e.message : e?.name);
      return res.status(502).json({ supported: true, provider: provider.name, error: 'Upstream error' });
    }
    await writeCache(store, ck, provider.name, id, record, now);
  }
  res.set('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ supported: true, provider: provider.name, record, cached, fetchedAt: new Date(now).toISOString() });
}

functions.http('enrich', (req, res) => handleEnrich(req, res));
