import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedback, handleFeedback } from './index.js';

test('accepts an idea and normalises fields', () => {
  const { doc } = parseFeedback({ type: 'Idea', message: '  Add Zotero  ', email: '', source: 'share' });
  assert.equal(doc.type, 'idea');
  assert.equal(doc.message, 'Add Zotero');
  assert.equal(doc.email, null);
  assert.equal(doc.status, 'new');
});

test('rejects bad input and flags the honeypot', () => {
  assert.ok(parseFeedback({ type: 'rant', message: 'hi there' }).error);
  assert.ok(parseFeedback({ type: 'bug', message: '' }).error);
  assert.ok(parseFeedback({ type: 'bug', message: 'broken', email: 'nope' }).error);
  assert.equal(parseFeedback({ type: 'bug', message: 'broken', website: 'x' }).spam, true);
});

function fakeRes() {
  const res = { headers: {}, code: 0, body: null };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  return res;
}
function fakeReq(method, origin, body) {
  const headers = { origin, 'user-agent': 'test' };
  return { method, body, get: (h) => headers[h.toLowerCase()] };
}

test('stores a valid post from recordseek.com', async () => {
  const added = [];
  const store = { collection: () => ({ add: async (d) => added.push(d) }) };
  const res = fakeRes();
  await handleFeedback(fakeReq('POST', 'https://recordseek.com', { type: 'bug', message: 'It broke' }), res, store);
  assert.equal(res.code, 201);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://recordseek.com');
  assert.equal(added[0].message, 'It broke');
});

test('refuses other origins', async () => {
  const store = { collection: () => ({ add: async () => assert.fail('stored') }) };
  const res = fakeRes();
  await handleFeedback(fakeReq('POST', 'https://evil.example', { type: 'bug', message: 'x y z' }), res, store);
  assert.equal(res.code, 403);
});
