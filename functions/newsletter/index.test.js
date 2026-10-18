import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleNewsletter, emailKey, cleanAccounts } from './index.js';

const FS = 'fs_' + 'a'.repeat(32);
const GENI = 'geni_' + 'b'.repeat(32);
const ZOT = 'zotero_' + 'c'.repeat(32);
const ORIGIN = 'https://recordseek.com';

/** Minimal in-memory Firestore: merge-set, update, get and a pass-through transaction. */
function fakeStore() {
  const data = new Map();
  const apply = (path, patch, merge) => {
    const cur = data.get(path);
    const next = merge || !cur ? { ...(cur ?? {}) } : { ...cur };
    for (const [k, v] of Object.entries(patch)) {
      if (v?.constructor?.name === 'ArrayUnionTransform') next[k] = [...new Set([...(next[k] ?? []), ...v.elements])];
      else next[k] = v;
    }
    data.set(path, next);
  };
  const doc = (col, id) => {
    const path = `${col}/${id}`;
    return {
      path,
      get: async () => ({ exists: data.has(path), data: () => data.get(path) }),
      set: async (d, opts) => apply(path, d, opts?.merge),
      update: async (d) => apply(path, d, true),
    };
  };
  return {
    data,
    collection: (col) => ({ doc: (id) => doc(col, id) }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d) => r.set(d), update: (r, d) => r.update(d) }),
  };
}
function fakeRes() {
  const res = { headers: {}, code: 0, body: null };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}
function req(method, action, body, origin = ORIGIN) {
  const headers = { origin };
  return { method, body, query: { action }, get: (h) => headers[h.toLowerCase()] };
}
async function call(store, action, body, origin) {
  const res = fakeRes();
  await handleNewsletter(req('POST', action, body, origin), res, store);
  return res;
}

test('subscribe stores the subscriber and links each account', async () => {
  const store = fakeStore();
  const res = await call(store, 'subscribe', { email: ' Ann@Example.com ', accounts: [FS, 'bogus', FS], source: 'fs' });
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { ok: true });
  const key = emailKey('ann@example.com');
  const sub = store.data.get(`subscribers/${key}`);
  assert.equal(sub.email, 'Ann@Example.com');
  assert.deepEqual(sub.accounts, [FS]);
  assert.equal(sub.confirmed, false);
  assert.ok(sub.createdAt);
  assert.equal(store.data.get(`subscriber_accounts/${FS}`).subscriber, key);
});

test('the same email again merges accounts and keeps createdAt', async () => {
  const store = fakeStore();
  await call(store, 'subscribe', { email: 'a@b.co', accounts: [FS] });
  const key = emailKey('a@b.co');
  const created = store.data.get(`subscribers/${key}`).createdAt;
  await call(store, 'subscribe', { email: 'A@B.co', accounts: [GENI] });
  const sub = store.data.get(`subscribers/${key}`);
  assert.deepEqual(sub.accounts, [FS, GENI]);
  assert.equal(sub.createdAt, created);
  assert.equal(store.data.get(`subscriber_accounts/${GENI}`).subscriber, key);
});

test('honeypot answers ok without storing', async () => {
  const store = fakeStore();
  const res = await call(store, 'subscribe', { email: 'a@b.co', accounts: [FS], website: 'spam' });
  assert.equal(res.code, 201);
  assert.equal(store.data.size, 0);
});

test('bad email is a 400', async () => {
  const store = fakeStore();
  const res = await call(store, 'subscribe', { email: 'nope', accounts: [FS] });
  assert.equal(res.code, 400);
  assert.equal(store.data.size, 0);
});

test('status is false for unknown accounts and empty lists', async () => {
  const store = fakeStore();
  assert.deepEqual((await call(store, 'status', { accounts: [FS] })).body, { subscribed: false });
  assert.deepEqual((await call(store, 'status', {})).body, { subscribed: false });
});

test('status is true for a linked account and never returns an email', async () => {
  const store = fakeStore();
  await call(store, 'subscribe', { email: 'a@b.co', accounts: [FS] });
  const res = await call(store, 'status', { accounts: [FS] });
  assert.deepEqual(res.body, { subscribed: true });
});

test('status links the other accounts seen with a subscribed one', async () => {
  const store = fakeStore();
  await call(store, 'subscribe', { email: 'a@b.co', accounts: [FS] });
  const res = await call(store, 'status', { accounts: [GENI, FS, ZOT] });
  assert.deepEqual(res.body, { subscribed: true });
  const key = emailKey('a@b.co');
  assert.equal(store.data.get(`subscriber_accounts/${GENI}`).subscriber, key);
  assert.equal(store.data.get(`subscriber_accounts/${ZOT}`).subscriber, key);
  assert.deepEqual(store.data.get(`subscribers/${key}`).accounts, [FS, GENI, ZOT]);
});

test('cleanAccounts caps the list at 10', () => {
  const many = Array.from({ length: 15 }, (_, i) => 'fs_' + String(i).padStart(32, '0'));
  assert.equal(cleanAccounts(many).length, 10);
});

test('refuses other origins and answers preflight', async () => {
  const store = fakeStore();
  assert.equal((await call(store, 'status', { accounts: [FS] }, 'https://evil.example')).code, 403);
  const res = fakeRes();
  await handleNewsletter(req('OPTIONS', undefined, undefined), res, store);
  assert.equal(res.code, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], ORIGIN);
});
