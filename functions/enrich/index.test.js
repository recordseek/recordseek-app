import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleEnrich, rateLimited, resetRateLimit, cacheKey } from './index.js';

beforeEach(resetRateLimit);

function fakeRes() {
  const res = { headers: {}, code: 0, body: null };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}
const req = (method, { origin = 'https://recordseek.com', query = {}, body } = {}) => {
  const headers = { origin, 'x-forwarded-for': '1.2.3.4' };
  return { method, query, body, get: (h) => headers[h.toLowerCase()] };
};
function fakeStore() {
  const docs = new Map();
  return { docs, collection: () => ({ doc: (id) => ({
    get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
    set: async (d) => { docs.set(id, d); },
  }) }) };
}
const DNZ = 'https://digitalnz.org/records/42';
const env = { DIGITALNZ_API_KEY: 'k' };
const upstream = (calls) => async () => { calls.n++; return { ok: true, status: 200, json: async () => ({ record: { title: 'T', display_content_partner: 'P' } }) }; };

test('unrecognised url -> supported:false with 200', async () => {
  const res = fakeRes();
  await handleEnrich(req('GET', { query: { url: 'https://example.com/a' } }), res, { store: fakeStore(), env });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { supported: false });
});

test('fetches, caches, then serves from cache', async () => {
  const store = fakeStore(); const calls = { n: 0 };
  const deps = { store, env, fetch: upstream(calls) };
  const res = fakeRes();
  await handleEnrich(req('GET', { query: { url: DNZ } }), res, deps);
  assert.equal(res.code, 200);
  assert.equal(res.body.provider, 'digitalnz');
  assert.equal(res.body.record.title, 'T');
  assert.ok(res.body.fetchedAt);
  const stored = store.docs.get(cacheKey('digitalnz', '42'));
  assert.ok(stored.expiresAt > new Date());
  const res2 = fakeRes();
  await handleEnrich(req('GET', { query: { url: DNZ } }), res2, deps);
  assert.equal(calls.n, 1);
  assert.equal(res2.body.cached, true);
});

test('expired cache entries are ignored', async () => {
  const store = fakeStore(); const calls = { n: 0 };
  store.docs.set(cacheKey('digitalnz', '42'), { record: { title: 'old' }, expiresAt: new Date(Date.now() - 1000) });
  const res = fakeRes();
  await handleEnrich(req('GET', { query: { url: DNZ } }), res, { store, env, fetch: upstream(calls) });
  assert.equal(res.body.record.title, 'T');
  assert.equal(calls.n, 1);
});

test('upstream errors are not cached', async () => {
  const store = fakeStore();
  const res = fakeRes();
  await handleEnrich(req('GET', { query: { url: DNZ } }), res, { store, env, fetch: async () => ({ ok: false, status: 500 }) });
  assert.equal(res.code, 502);
  assert.equal(store.docs.size, 0);
});

test('provider without key is skipped', async () => {
  const res = fakeRes();
  await handleEnrich(req('GET', { query: { url: 'https://trove.nla.gov.au/work/1' } }), res, { store: fakeStore(), env });
  assert.equal(res.body.supported, false);
  assert.equal(res.body.provider, 'trove');
});

test('POST with sufficient page data skips upstream', async () => {
  const calls = { n: 0 };
  const have = { title: 'T', creator: ['A'], date: '1900', repository: 'R', sourceType: 'image' };
  const res = fakeRes();
  await handleEnrich(req('POST', { body: { url: DNZ, have } }), res, { store: fakeStore(), env, fetch: upstream(calls) });
  assert.deepEqual(res.body, { supported: true, provider: 'digitalnz', skipped: 'page-data-sufficient' });
  assert.equal(calls.n, 0);
  const res2 = fakeRes();
  await handleEnrich(req('POST', { body: { url: DNZ, have: { title: 'T' } } }), res2, { store: fakeStore(), env, fetch: upstream(calls) });
  assert.equal(res2.body.record.title, 'T');
  assert.equal(calls.n, 1);
});

test('CORS, methods and rate limit', async () => {
  let res = fakeRes();
  await handleEnrich(req('GET', { origin: 'https://evil.example', query: { url: DNZ } }), res, { store: fakeStore(), env });
  assert.equal(res.code, 403);
  res = fakeRes();
  await handleEnrich(req('OPTIONS'), res, {});
  assert.equal(res.code, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://recordseek.com');
  res = fakeRes();
  await handleEnrich(req('DELETE'), res, {});
  assert.equal(res.code, 405);
  res = fakeRes();
  await handleEnrich(req('GET'), res, { store: fakeStore(), env });
  assert.equal(res.code, 400);
  resetRateLimit();
  const t = Date.now();
  for (let i = 0; i < 30; i++) assert.equal(rateLimited('ip', t), false);
  assert.equal(rateLimited('ip', t), true);
  assert.equal(rateLimited('ip', t + 61_000), false);
});
