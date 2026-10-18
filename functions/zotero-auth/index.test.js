import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sign,
  authHeader,
  pct,
  validateReturn,
  sealState,
  openState,
  handleStart,
  handleCallback,
  handleGeni,
  handleZoteroAuth,
} from './index.js';

process.env.ZOTERO_CLIENT_KEY = 'ckey';
process.env.ZOTERO_CLIENT_SECRET = 'csecret';

test('signs the documented OAuth 1.0a example request', () => {
  // Worked example from Twitter's "Creating a signature" guide.
  const params = {
    status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
    include_entities: 'true',
    oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
    oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: '1318622958',
    oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    oauth_version: '1.0',
  };
  const sig = sign(
    'POST',
    'https://api.twitter.com/1.1/statuses/update.json',
    params,
    'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  );
  assert.equal(sig, 'hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
});

test('percent-encodes per RFC 3986', () => {
  assert.equal(pct("a b!'()*~"), 'a%20b%21%27%28%29%2A~');
});

test('builds an Authorization header with a signature', () => {
  const header = authHeader('POST', 'https://x.test/a', { oauth_callback: 'https://f.test/?a=1' }, { key: 'k', secret: 's' }, '', 'n', 1);
  assert.match(header, /^OAuth oauth_consumer_key="k", oauth_nonce="n"/);
  assert.match(header, /oauth_callback="https%3A%2F%2Ff\.test%2F%3Fa%3D1"/);
  assert.match(header, /oauth_signature="[^"]+%3D"/);
});

test('validates the return page', () => {
  assert.equal(validateReturn('https://recordseek.com/share/?url=x#/y'), 'https://recordseek.com/share/');
  assert.equal(validateReturn('https://recordseek.github.io/recordseek-app/'), 'https://recordseek.github.io/recordseek-app/');
  assert.equal(validateReturn('http://localhost:9000/'), 'http://localhost:9000/');
  assert.equal(validateReturn('https://evil.example/share/'), null);
  assert.equal(validateReturn('https://recordseek.com.evil.example/'), null);
  assert.equal(validateReturn('https://recordseek.com@evil.example/'), null);
  assert.equal(validateReturn('http://recordseek.com/'), null);
  assert.equal(validateReturn('javascript:alert(1)'), null);
  assert.equal(validateReturn(undefined), null);
});

test('state round-trips, expires, and rejects tampering or another secret', () => {
  const state = sealState({ s: 'tok-secret', r: 'https://recordseek.com/share/' }, 'csecret', 1000);
  assert.equal(openState(state, 'csecret', 2000).s, 'tok-secret');
  assert.equal(openState(state, 'csecret', 1000 + 16 * 60 * 1000), null);
  assert.equal(openState(state, 'other', 2000), null);
  assert.equal(openState(state.slice(0, -2) + 'AA', 'csecret', 2000), null);
  assert.equal(openState('', 'csecret'), null);
});

function fakeRes() {
  const res = { headers: {}, code: 0, body: null, location: null };
  res.set = (k, v) => ((res.headers[k] = v), res);
  res.status = (c) => ((res.code = c), res);
  res.type = () => res;
  res.json = (b) => ((res.body = b), res);
  res.send = (b) => ((res.body = b), res);
  res.redirect = (c, url) => ((res.code = c), (res.location = url), res);
  return res;
}
function fakeReq(method, query, { origin, cookie, body } = {}) {
  const headers = { host: 'fn.test', origin, cookie };
  return { method, query, body, path: '/', get: (h) => headers[h.toLowerCase()] };
}
const reply = (text, status = 200) => async () => ({ ok: status < 400, status, text: async () => text });

test('start redirects to zotero.org with write access and sets the state cookie', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => 'oauth_token=RT&oauth_token_secret=RS&oauth_callback_confirmed=true' };
  };
  const res = fakeRes();
  await handleStart(fakeReq('GET', { action: 'start', return: 'https://recordseek.com/share/#/zotero' }), res, fetchImpl);
  assert.equal(res.code, 302);
  const loc = new URL(res.location);
  assert.equal(loc.origin + loc.pathname, 'https://www.zotero.org/oauth/authorize');
  assert.equal(loc.searchParams.get('oauth_token'), 'RT');
  assert.equal(loc.searchParams.get('write_access'), '1');
  assert.match(res.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
  assert.match(calls[0].init.headers.Authorization, /oauth_callback="https%3A%2F%2Ffn\.test%3Faction%3Dcallback"/);
  assert.ok(!JSON.stringify(res).includes('csecret'));
});

test('start rejects a return page that is not RecordSeek', async () => {
  const res = fakeRes();
  await handleStart(fakeReq('GET', { action: 'start', return: 'https://evil.example/' }), res, reply(''));
  assert.equal(res.code, 400);
});

test('callback exchanges the verifier and redirects with the key in the fragment', async () => {
  const state = sealState({ t: 'RT', s: 'RS', r: 'https://recordseek.com/share/' }, 'csecret');
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(init.headers.Authorization);
    return { ok: true, status: 200, text: async () => 'oauth_token=T&oauth_token_secret=APIKEY&userID=42&username=jane' };
  };
  const res = fakeRes();
  await handleCallback(
    fakeReq('GET', { action: 'callback', oauth_token: 'RT', oauth_verifier: 'V' }, { cookie: `rs_zotero_state=${state}` }),
    res,
    fetchImpl,
  );
  assert.equal(res.code, 302);
  const dest = new URL(res.location);
  assert.equal(dest.origin + dest.pathname, 'https://recordseek.com/share/zotero-callback.html');
  assert.equal(dest.search, '');
  const hash = new URLSearchParams(dest.hash.slice(1));
  assert.deepEqual([hash.get('zk'), hash.get('zu'), hash.get('zn')], ['APIKEY', '42', 'jane']);
  assert.match(seen[0], /oauth_verifier="V"/);
});

test('callback refuses a missing, mismatched or expired state', async () => {
  for (const [query, cookie] of [
    [{ oauth_token: 'RT', oauth_verifier: 'V' }, ''],
    [{ oauth_token: 'OTHER', oauth_verifier: 'V' }, `rs_zotero_state=${sealState({ t: 'RT', s: 'RS', r: 'https://recordseek.com/' }, 'csecret')}`],
    [{ oauth_token: 'RT', oauth_verifier: 'V' }, `rs_zotero_state=${sealState({ t: 'RT', s: 'RS', r: 'https://evil.example/' }, 'csecret')}`],
  ]) {
    const res = fakeRes();
    await handleCallback(fakeReq('GET', { action: 'callback', ...query }, { cookie }), res, reply(''));
    assert.equal(res.code, 400);
  }
});

test('router: unknown action is 400 and an upstream failure is 502', async () => {
  let res = fakeRes();
  await handleZoteroAuth(fakeReq('GET', { action: 'nope' }), res, reply(''));
  assert.equal(res.code, 400);
  res = fakeRes();
  await handleZoteroAuth(fakeReq('GET', { action: 'start', return: 'https://recordseek.com/share/' }), res, reply('', 500));
  assert.equal(res.code, 502);
});

test('geni proxy only relays allowed paths from allowed origins', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, body: init.body.toString() });
    return { status: 200, text: async () => '{"id":"document-1"}' };
  };
  let res = fakeRes();
  await handleGeni(fakeReq('POST', { path: 'document/add' }, { origin: 'https://recordseek.com', body: { title: 'T', access_token: 'x' } }), res, fetchImpl);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://recordseek.com');
  assert.equal(sent[0].url, 'https://www.geni.com/api/document/add');
  assert.equal(sent[0].body, 'title=T&access_token=x');

  res = fakeRes();
  await handleGeni(fakeReq('POST', { path: 'document-12/tag/profile-34' }, { origin: 'https://recordseek.com', body: {} }), res, fetchImpl);
  assert.equal(res.code, 200);

  for (const path of ['profile/delete', 'document/add/../../x', 'document-1/delete']) {
    res = fakeRes();
    await handleGeni(fakeReq('POST', { path }, { origin: 'https://recordseek.com', body: {} }), res, fetchImpl);
    assert.equal(res.code, 400);
  }
  res = fakeRes();
  await handleGeni(fakeReq('POST', { path: 'document/add' }, { origin: 'https://evil.example', body: {} }), res, fetchImpl);
  assert.equal(res.code, 403);
  assert.equal(sent.length, 2);
});
