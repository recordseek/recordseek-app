import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  addDocument,
  geniLoginUrl,
  geniRedirectUri,
  getGeniToken,
  GeniBusyError,
  GeniError,
  searchProfiles,
  withRetry,
} from './geni';

afterEach(() => vi.useRealTimers());

describe('geni login', () => {
  it('builds the implicit-flow URL with the callback page beside the app', () => {
    expect(geniRedirectUri()).toBe(`${window.location.origin}/geni-callback.html`);
    const url = new URL(geniLoginUrl());
    expect(url.origin + url.pathname).toBe('https://www.geni.com/platform/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('2301');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('redirect_uri')).toBe(geniRedirectUri());
  });

  it('returns the stored token only while it is valid', () => {
    expect(getGeniToken()).toBeNull();
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'T', expiresAt: Date.now() + 60000 }));
    expect(getGeniToken()).toBe('T');
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'T', expiresAt: Date.now() - 1 }));
    expect(getGeniToken()).toBeNull();
  });
});

describe('withRetry', () => {
  it('retries a busy Geni on the 2s/5s/10s schedule, then gives up', async () => {
    vi.useFakeTimers();
    const call = vi.fn().mockRejectedValue(new GeniBusyError());
    const onBusy = vi.fn();
    const result = withRetry(call, onBusy).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000 + 5000 + 10000);
    expect(await result).toBeInstanceOf(GeniBusyError);
    expect(call).toHaveBeenCalledTimes(4);
    expect(onBusy).toHaveBeenCalledTimes(3);
  });

  it('succeeds after a busy answer and does not retry other errors', async () => {
    vi.useFakeTimers();
    const call = vi.fn().mockRejectedValueOnce(new GeniBusyError()).mockResolvedValue('ok');
    const result = withRetry(call);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe('ok');
    const bad = vi.fn().mockRejectedValue(new GeniError('nope'));
    await expect(withRetry(bad)).rejects.toThrow('nope');
    expect(bad).toHaveBeenCalledTimes(1);
  });
});

/** Answers the JSONP <script> by calling its callback, as Geni would. */
function answerJsonp(data: unknown): () => string {
  let requested = '';
  const append = document.head.appendChild.bind(document.head);
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (node instanceof HTMLScriptElement) {
      requested = node.src;
      const cb = new URL(node.src).searchParams.get('callback') as string;
      queueMicrotask(() => (window as unknown as Record<string, (d: unknown) => void>)[cb]?.(data));
      return node;
    }
    return append(node);
  });
  return () => requested;
}

describe('searchProfiles', () => {
  it('maps the results[] shape', async () => {
    const requested = answerJsonp({
      results: [
        { id: 'profile-1', name: 'Elizabeth Burke', profile_url: 'https://www.geni.com/people/x/1', birth: { date: { year: 1712 } }, death: { date: { year: 1770 } } },
        { id: 'profile-2', name: 'Smith' },
      ],
    });
    const rows = await searchProfiles('TOK', 'burke');
    expect(rows).toEqual([
      { id: 'profile-1', name: 'Elizabeth Burke', years: '1712 – 1770', url: 'https://www.geni.com/people/x/1' },
      { id: 'profile-2', name: 'Smith', years: '', url: '' },
    ]);
    const url = new URL(requested());
    expect(url.origin + url.pathname).toBe('https://www.geni.com/api/profile/search');
    expect(url.searchParams.get('names')).toBe('burke');
    expect(url.searchParams.get('access_token')).toBe('TOK');
    vi.restoreAllMocks();
  });

  it('turns a 200 rate-limit body into a busy error', async () => {
    vi.useFakeTimers();
    answerJsonp({ error: { message: 'Rate limit exceeded.' } });
    const onBusy = vi.fn();
    const result = searchProfiles('T', 'x', onBusy).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(17000);
    expect(await result).toBeInstanceOf(GeniBusyError);
    expect(onBusy).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });
});

describe('addDocument', () => {
  const input = { token: 'TOK', title: 'DPLA', text: 'Cite\n\nhttps://dp.la/', sourceUrl: 'https://dp.la/', profileId: 'profile-9' };
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

  it('creates the document then tags the profile, through the helper', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply({ id: 'document-555' })).mockResolvedValueOnce(reply({ id: 'profile-9' }));
    const doc = await addDocument(input, undefined, f as unknown as typeof fetch);
    expect(doc).toEqual({ id: 'document-555', url: 'https://www.geni.com/documents/view?doc_id=555', tagged: true });
    const [addUrl, addInit] = f.mock.calls[0] as [string, RequestInit];
    expect(new URL(addUrl).searchParams.get('action')).toBe('geni');
    expect(new URL(addUrl).searchParams.get('path')).toBe('document/add');
    const body = new URLSearchParams((addInit.body as URLSearchParams).toString());
    expect(body.get('title')).toBe('DPLA');
    expect(body.get('source_url')).toBe('https://dp.la/');
    expect(body.get('text')).toBe('Cite\n\nhttps://dp.la/');
    expect(new URL((f.mock.calls[1] as [string])[0]).searchParams.get('path')).toBe('document-555/tag/profile-9');
  });

  it('still succeeds when only the tag fails, and fails when Geni rejects the document', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply({ id: 'document-1' })).mockResolvedValueOnce(reply({ error: { message: 'no' } }, 400));
    expect((await addDocument(input, undefined, f as unknown as typeof fetch)).tagged).toBe(false);
    const g = vi.fn().mockResolvedValue(reply({ error: { message: 'Invalid token' } }));
    await expect(addDocument(input, undefined, g as unknown as typeof fetch)).rejects.toThrow('Invalid token');
  });
});
