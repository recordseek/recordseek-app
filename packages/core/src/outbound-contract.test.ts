import { describe, it, expect } from 'vitest';
import { parseShareParams } from './share-params';
import { FamilySearchClient, memoryTokenStore } from './familysearch';

/**
 * End-to-end contract for the seam that caused two production regressions
 * (Sentry RECORDSEEK-EV and its predecessor): the browser extension / native
 * app builds a `/share/?…` URL, the web app parses it, and whatever lands in
 * `params.url` is sent to FamilySearch as the source `about`. Twice, a control
 * param (`app=ios` / `app=safari`) folded onto that URL and FamilySearch then
 * rejected the source ("Failure in upstream call: Unable to create source").
 *
 * These tests drive the real parse -> send pipeline and assert that NO control
 * param ever reaches the wire. They are intentionally paranoid: a future param
 * added to a share URL without being registered as a known key will leak onto
 * `about` and fail here, before it can fail a user.
 */

/** Capture every outbound FamilySearch request (url + parsed JSON body). */
function captureClient() {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const fetchImpl = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: String(init.method ?? 'GET'),
      body: typeof init.body === 'string' ? init.body : '',
    });
    // Echo a Location so createSourceDescription can resolve a new entity id.
    return new Response('', { status: 201, headers: { 'X-ENTITY-ID': 'SD-1' } });
  }) as unknown as typeof fetch;
  const client = new FamilySearchClient({
    appKey: 'TEST-APP-KEY',
    redirectUri: 'https://recordseek.com/share/',
    tokenStore: memoryTokenStore('valid-token'),
    fetch: fetchImpl,
  });
  return { client, calls };
}

const CONTROL_MARKERS = ['app=ios', 'app=safari', 'app=', 'dev=1', 'dev='];

describe('share URL -> FamilySearch source (regression seam)', () => {
  it('never folds the native-app marker onto the source about URL', async () => {
    // Exactly what the Safari/iOS app produces: an `app` marker alongside the
    // real FamilySearch ark, plus the cache-buster the extension always sends.
    const ark = 'https://www.familysearch.org/ark:/61903/1:1:ABCD-123';
    const share =
      'https://recordseek.com/share/?_=1781619125868' +
      `&app=ios&url=${encodeURIComponent(ark)}` +
      '&title=Census%20of%201880&citation=Some%20citation&dev=1';

    const p = parseShareParams(share);
    expect(p.url).toBe(ark); // the parser already strips the markers...

    const { client, calls } = captureClient();
    await client.createSourceDescription({
      about: String(p.url),
      citation: String(p.citation),
      title: String(p.title),
    });

    const post = calls.find((c) => c.method === 'POST');
    expect(post).toBeDefined();
    const sent = JSON.parse(post!.body).sourceDescriptions[0];
    // ...and the clean ark is what actually reaches the wire.
    expect(sent.about).toBe(ark);
    for (const marker of CONTROL_MARKERS) {
      expect(post!.body).not.toContain(marker);
      expect(post!.url).not.toContain(marker);
    }
  });

  it('preserves a real query string on the source URL while dropping control params', async () => {
    // A FindAGrave memorial carries its own id in the query — that must survive;
    // only our own control params are stripped.
    const record = 'https://www.findagrave.com/memorial/12345/john-smith?foo=bar';
    const share =
      'https://recordseek.com/share/?url=' + encodeURIComponent(record) + '&app=safari&dev=1';

    const p = parseShareParams(share);
    expect(p.url).toBe(record);

    const { client, calls } = captureClient();
    await client.createSourceDescription({ about: String(p.url), title: 'John Smith' });

    const post = calls.find((c) => c.method === 'POST')!;
    const sent = JSON.parse(post.body).sourceDescriptions[0];
    expect(sent.about).toBe(record);
    expect(sent.about).toContain('foo=bar'); // the record's own query is kept
    for (const marker of CONTROL_MARKERS) {
      expect(post.body).not.toContain(marker);
    }
  });
});
