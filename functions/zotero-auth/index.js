import functions from '@google-cloud/functions-framework';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

/** Pages that may start a login, receive the result, or call the Geni proxy. */
const ALLOWED_ORIGINS = [
  /^https:\/\/recordseek\.com$/,
  /^https:\/\/www\.recordseek\.com$/,
  /^https:\/\/recordseek\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
];

const ZOTERO = {
  request: 'https://www.zotero.org/oauth/request',
  authorize: 'https://www.zotero.org/oauth/authorize',
  access: 'https://www.zotero.org/oauth/access',
};
const GENI_API = 'https://www.geni.com/api/';
/** The only Geni writes the share app makes: create a document, tag a profile in it. */
const GENI_PATHS = [/^document\/add$/, /^document-\d+\/tag\/profile-\d+$/];
const WIKITREE_API = 'https://api.wikitree.com/api.php';
/** WikiTree calls the share app makes: confirm a login, read the watchlist, search, look up one profile. */
const WIKITREE_ACTIONS = ['clientLogin', 'getWatchlist', 'searchPerson', 'getProfile'];
/** How long the user has to approve on zotero.org before the sign-in expires. */
const STATE_TTL_MS = 15 * 60 * 1000;

export function originAllowed(origin) {
  return ALLOWED_ORIGINS.some((re) => re.test(origin ?? ''));
}

/**
 * Validates the page to send the user back to. Returns its URL without query or
 * hash, or null when it is not an allowed https/localhost page.
 */
export function validateReturn(raw) {
  try {
    const url = new URL(raw);
    if (!originAllowed(url.origin) || url.username || url.password) return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}

/** RFC 3986 percent-encoding, as OAuth 1.0a requires. */
export function pct(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** The OAuth 1.0a HMAC-SHA1 signature for a request (RFC 5849 section 3.4). */
export function sign(method, url, params, consumerSecret, tokenSecret = '') {
  const normalized = Object.entries(params)
    .map(([k, v]) => [pct(k), pct(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = [method.toUpperCase(), pct(url), pct(normalized)].join('&');
  return createHmac('sha1', `${pct(consumerSecret)}&${pct(tokenSecret)}`).update(base).digest('base64');
}

/** The `Authorization: OAuth …` header for a signed request. */
export function authHeader(method, url, extra, { key, secret }, tokenSecret = '', nonce = randomBytes(16).toString('hex'), timestamp = Math.floor(Date.now() / 1000)) {
  const params = {
    oauth_consumer_key: key,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_version: '1.0',
    ...extra,
  };
  params.oauth_signature = sign(method, url, params, secret, tokenSecret);
  return 'OAuth ' + Object.entries(params).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

function aesKey(clientSecret) {
  return createHash('sha256').update(`recordseek-zotero-state:${clientSecret}`).digest();
}

/**
 * Packs what the callback needs (request token secret, return page) into an
 * opaque AES-GCM string, so the function holds no state. GCM also authenticates
 * it: a tampered or foreign state fails to open.
 */
export function sealState(payload, clientSecret, now = Date.now()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey(clientSecret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...payload, exp: now + STATE_TTL_MS }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** Opens a {@link sealState} string; null when invalid or expired. */
export function openState(state, clientSecret, now = Date.now()) {
  try {
    const raw = Buffer.from(String(state), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', aesKey(clientSecret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return payload.exp > now ? payload : null;
  } catch {
    return null;
  }
}

function credentials() {
  const key = process.env.ZOTERO_CLIENT_KEY;
  const secret = process.env.ZOTERO_CLIENT_SECRET;
  if (!key || !secret) throw new Error('Zotero client credentials are not configured');
  return { key, secret };
}

async function oauthPost(url, creds, extra, tokenSecret, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: authHeader('POST', url, extra, creds, tokenSecret) },
  });
  if (!res.ok) throw new Error(`Zotero ${new URL(url).pathname} returned ${res.status}`);
  return new URLSearchParams(await res.text());
}

/**
 * The URL of this function, for the OAuth callback. Not derived from the
 * request: the cloudfunctions.net front end strips the `/zotero-auth` path,
 * so a host+path guess sends Zotero back to the bare domain.
 */
const SELF_URL = process.env.SELF_URL || 'https://us-central1-recordseek.cloudfunctions.net/zotero-auth';

function fail(res, code, message) {
  return res.status(code).type('text/plain').send(message);
}

const COOKIE = 'rs_zotero_state';

function readCookie(req, name) {
  const header = req.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return '';
}

/**
 * Step 1: get a request token, keep its secret and the return page in a short
 * sealed cookie (the function stays stateless), then send the user to zotero.org.
 */
export async function handleStart(req, res, fetchImpl = fetch) {
  const returnTo = validateReturn(req.query.return);
  if (!returnTo) return fail(res, 400, 'return must be a RecordSeek page');
  const creds = credentials();
  const callback = `${SELF_URL}?action=callback`;
  const token = await oauthPost(ZOTERO.request, creds, { oauth_callback: callback }, '', fetchImpl);
  const oauthToken = token.get('oauth_token');
  const tokenSecret = token.get('oauth_token_secret');
  if (!oauthToken || !tokenSecret) throw new Error('Zotero returned no request token');
  const state = sealState({ t: oauthToken, s: tokenSecret, r: returnTo }, creds.secret);
  res.set('Set-Cookie', `${COOKIE}=${state}; Max-Age=${STATE_TTL_MS / 1000}; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.set('Cache-Control', 'no-store');
  const authorize = new URL(ZOTERO.authorize);
  authorize.searchParams.set('oauth_token', oauthToken);
  authorize.searchParams.set('name', 'RecordSeek');
  authorize.searchParams.set('library_access', '1');
  authorize.searchParams.set('write_access', '1');
  return res.redirect(302, authorize.toString());
}

/**
 * Step 2: Zotero sends the user back with a verifier. Exchange it for the access
 * token (whose "secret" is the user's API key) and hand it to the share app in a
 * URL fragment of a static page, so it never reaches a server log or history.
 */
export async function handleCallback(req, res, fetchImpl = fetch) {
  const creds = credentials();
  const state = openState(readCookie(req, COOKIE), creds.secret);
  const oauthToken = String(req.query.oauth_token ?? '');
  const verifier = String(req.query.oauth_verifier ?? '');
  res.set('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  res.set('Cache-Control', 'no-store');
  // Re-validate: the return page was checked at start, but the cookie is the only link.
  const returnTo = state && validateReturn(state.r);
  if (!state || !returnTo || state.t !== oauthToken || !verifier) {
    return fail(res, 400, 'This Zotero sign-in expired or was not started here. Please try again from RecordSeek.');
  }
  const access = await oauthPost(
    ZOTERO.access,
    creds,
    { oauth_token: oauthToken, oauth_verifier: verifier },
    state.s,
    fetchImpl,
  );
  const dest = new URL('zotero-callback.html', returnTo);
  dest.hash = new URLSearchParams({
    zk: access.get('oauth_token_secret') ?? '',
    zu: access.get('userID') ?? '',
    zn: access.get('username') ?? '',
  }).toString();
  return res.redirect(302, dest.toString());
}

function setCors(req, res, methods) {
  const origin = req.get('origin') ?? '';
  const allowed = originAllowed(origin);
  if (allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', methods);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
  }
  return allowed;
}

/**
 * Geni's API sends no CORS headers for recordseek.com and document writes are
 * POST-only (no JSONP), so the share app relays those two calls through here.
 * The Geni token rides in the form body and is passed straight on, never stored.
 */
export async function handleGeni(req, res, fetchImpl = fetch) {
  const allowed = setCors(req, res, 'POST');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!allowed) return res.status(403).json({ error: 'Origin not allowed' });
  const path = String(req.query.path ?? '');
  if (!GENI_PATHS.some((re) => re.test(path))) return res.status(400).json({ error: 'path not allowed' });
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(req.body ?? {})) body.set(k, String(v));
  const upstream = await fetchImpl(GENI_API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return res.status(upstream.status).type('application/json').send(await upstream.text());
}

/** "a=1; b=2" from upstream Set-Cookie headers, skipping deleted/empty cookies. */
export function cookiePairs(setCookies) {
  return setCookies
    .map((c) => c.split(';')[0].trim())
    .filter((pair) => pair.includes('=') && !/=(deleted)?$/.test(pair))
    .join('; ');
}

/**
 * WikiTree's API answers CORS only for wikitree.com origins, so the browser
 * cannot read its responses from recordseek.com. This relays a narrow set of
 * actions. The WikiTree session cookie (set when the authcode is confirmed) is
 * handed back to the page as \`session\` and sent back in the body on later
 * calls; it is passed on as a Cookie header and never stored here.
 */
export async function handleWikiTree(req, res, fetchImpl = fetch) {
  const allowed = setCors(req, res, 'POST');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!allowed) return res.status(403).json({ error: 'Origin not allowed' });
  const { session, ...params } = req.body ?? {};
  if (!WIKITREE_ACTIONS.includes(String(params.action ?? ''))) return res.status(400).json({ error: 'action not allowed' });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (session) headers.Cookie = String(session);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.set(k, String(v));
  const upstream = await fetchImpl(WIKITREE_API, { method: 'POST', headers, body, redirect: 'manual' });
  const text = await upstream.text();
  const fresh = cookiePairs(upstream.headers?.getSetCookie?.() ?? []);
  if (params.action === 'clientLogin' && fresh) {
    try {
      return res.status(upstream.status).json({ ...JSON.parse(text), session: fresh });
    } catch {
      return res.status(502).json({ error: 'unexpected WikiTree reply' });
    }
  }
  return res.status(upstream.status).type('application/json').send(text);
}

export async function handleZoteroAuth(req, res, fetchImpl = fetch) {
  try {
    const action = String(req.query.action ?? '');
    if (action === 'geni') return await handleGeni(req, res, fetchImpl);
    if (action === 'wikitree') return await handleWikiTree(req, res, fetchImpl);
    if (req.method !== 'GET') return fail(res, 405, 'GET only');
    if (action === 'start') return await handleStart(req, res, fetchImpl);
    if (action === 'callback') return await handleCallback(req, res, fetchImpl);
    return fail(res, 400, 'action must be start, callback or geni');
  } catch (err) {
    console.error('zotero-auth failed', err instanceof Error ? err.message : err);
    return fail(res, 502, 'Could not reach the service. Please try again.');
  }
}

functions.http('zoteroAuth', (req, res) => handleZoteroAuth(req, res));
