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
  buildSearchParams,
  buildNames,
  canSearch,
  emptyCriteria,
  filterProfiles,
  parseGeniId,
  normalizeGeniId,
  parseFamily,
  searchPeople,
  type GeniProfile,
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
      { id: 'profile-1', name: 'Elizabeth Burke', years: '1712 – 1770', url: 'https://www.geni.com/people/x/1', birthYear: 1712, deathYear: 1770 },
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
  const input = { token: 'TOK', title: 'DPLA', text: 'Cite\n\nhttps://dp.la/', sourceUrl: 'https://dp.la/', profileIds: ['profile-9'] };
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

  it('creates the document then tags the profile, through the helper', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply({ id: 'document-555', guid: '6000000228285160853' })).mockResolvedValueOnce(reply({ id: 'profile-9' }));
    const doc = await addDocument(input, undefined, f as unknown as typeof fetch);
    expect(doc).toEqual({ id: 'document-555', url: 'https://www.geni.com/documents/view?doc_id=6000000228285160853', tagged: true, taggedIds: ['profile-9'], failedIds: [] });
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
    const partial = await addDocument(input, undefined, f as unknown as typeof fetch);
    expect(partial.tagged).toBe(false);
    expect(partial.failedIds).toEqual(['profile-9']);
    const g = vi.fn().mockResolvedValue(reply({ error: { message: 'Invalid token' } }));
    await expect(addDocument(input, undefined, g as unknown as typeof fetch)).rejects.toThrow('Invalid token');
  });
});

describe('addDocument with several people', () => {
  const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const input = { token: 'TOK', title: 'T', text: 'x', sourceUrl: 'https://x/', profileIds: ['profile-1', 'profile-2', 'profile-3'] };

  it('makes one document and tags every profile, one call after another', async () => {
    const f = vi.fn().mockResolvedValue(reply({ id: 'document-7' }));
    const doc = await addDocument(input, undefined, f as unknown as typeof fetch);
    const paths = f.mock.calls.map((c) => new URL((c as [string])[0]).searchParams.get('path'));
    expect(paths).toEqual(['document/add', 'document-7/tag/profile-1', 'document-7/tag/profile-2', 'document-7/tag/profile-3']);
    expect(doc.taggedIds).toEqual(['profile-1', 'profile-2', 'profile-3']);
    expect(doc.tagged).toBe(true);
  });

  it('keeps tagging after one tag fails and reports which', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reply({ id: 'document-7' }))
      .mockResolvedValueOnce(reply({ id: 'ok' }))
      .mockResolvedValueOnce(reply({ error: { message: 'nope' } }, 400))
      .mockResolvedValueOnce(reply({ id: 'ok' }));
    const doc = await addDocument(input, undefined, f as unknown as typeof fetch);
    expect(doc.taggedIds).toEqual(['profile-1', 'profile-3']);
    expect(doc.failedIds).toEqual(['profile-2']);
    expect(doc.tagged).toBe(false);
  });
});

describe('search param building', () => {
  it('sends only names (given + surname), the field list and the page', () => {
    const c = { ...emptyCriteria(), givenName: ' Elizabeth ', surname: 'Burke', birthYear: '1712', gender: 'female' as const };
    expect(buildNames(c)).toBe('Elizabeth Burke');
    const p1 = buildSearchParams(c);
    expect(p1.names).toBe('Elizabeth Burke');
    expect(p1.page).toBeUndefined();
    expect(Object.keys(p1).sort()).toEqual(['fields', 'names']);
    expect(buildSearchParams(c, 3).page).toBe('3');
  });

  it('needs a name to search; years, places and gender cannot search alone', () => {
    expect(canSearch({ ...emptyCriteria(), birthYear: '1712', gender: 'male' })).toBe(false);
    expect(canSearch({ ...emptyCriteria(), surname: 'Burke' })).toBe(true);
  });

  it('searchPeople requests the page, filters client-side and reports paging', async () => {
    const requested = answerJsonp({
      total_count: 120,
      next_page: 'https://www.geni.com/api/profile/search?page=3',
      results: [
        { id: 'profile-1', name: 'A', gender: 'female', birth: { date: { year: 1712 }, location: { formatted_location: 'Norfolk, Virginia' } } },
        { id: 'profile-2', name: 'B', gender: 'male', birth: { date: { year: 1712 } } },
        { id: 'profile-3', name: 'C', birth: { date: { year: 1800 } } },
        { id: 'profile-4', name: 'D' },
      ],
    });
    const c = { ...emptyCriteria(), surname: 'Burke', gender: 'female' as const, birthYear: '1713' };
    const page = await searchPeople('TOK', c, 2);
    expect(page.profiles.map((p) => p.id)).toEqual(['profile-1', 'profile-4']);
    expect(page.returned).toBe(4);
    expect(page.total).toBe(120);
    expect(page.hasNext).toBe(true);
    const url = new URL(requested());
    expect(url.searchParams.get('names')).toBe('Burke');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('birth_year')).toBeNull();
    vi.restoreAllMocks();
  });

  it('filters by place substring and keeps profiles without data', () => {
    const mk = (id: string, extra: Partial<GeniProfile>): GeniProfile => ({ id, name: id, years: '', url: '', ...extra });
    const rows = [mk('a', { birthPlace: 'Norfolk, Virginia, United States' }), mk('b', { birthPlace: 'Boston' }), mk('c', {})];
    expect(filterProfiles(rows, { ...emptyCriteria(), birthPlace: 'virginia' }).map((p) => p.id)).toEqual(['a', 'c']);
    expect(filterProfiles(rows, { ...emptyCriteria(), deathYear: '1900' })).toHaveLength(3);
  });
});

describe('parseGeniId', () => {
  it('accepts profile ids, bare numbers, guids and geni.com links', () => {
    expect(parseGeniId('profile-123')).toBe('profile-123');
    expect(parseGeniId(' PROFILE-123 ')).toBe('profile-123');
    expect(parseGeniId('34727630764')).toBe('profile-34727630764');
    expect(parseGeniId('6000000085123762838')).toBe('profile-g6000000085123762838');
    expect(parseGeniId('https://www.geni.com/people/Col-Albert-Smith/6000000085123762838')).toBe('profile-g6000000085123762838');
    expect(parseGeniId('https://www.geni.com/people/Col-Albert-Smith/6000000085123762838?through=1')).toBe('profile-g6000000085123762838');
    expect(parseGeniId('https://www.geni.com/api/profile-555')).toBe('profile-555');
  });

  it('rejects pasted citation text and other sites', () => {
    expect(parseGeniId('')).toBeNull();
    expect(parseGeniId('Elizabeth Burke')).toBeNull();
    expect(parseGeniId('https://example.com/people/x/6000000085123762838')).toBeNull();
    expect(parseGeniId('profile-')).toBeNull();
  });

  it('normalizes a link to the bare guid or profile id, and leaves other text alone', () => {
    expect(normalizeGeniId('https://www.geni.com/people/x/6000000085123762838')).toBe('6000000085123762838');
    expect(normalizeGeniId('https://www.geni.com/api/profile-555')).toBe('profile-555');
    expect(normalizeGeniId('abc')).toBe('abc');
  });
});

describe('parseFamily', () => {
  const node = (id: string, edges: Record<string, { rel: string }>) => ({ id, name: id, edges });
  it('splits parents, spouses, siblings and children around the focus', () => {
    const nodes = {
      'profile-me': node('profile-me', { 'union-parents': { rel: 'child' }, 'union-mine': { rel: 'partner' } }),
      'profile-dad': node('profile-dad', { 'union-parents': { rel: 'partner' } }),
      'profile-mom': node('profile-mom', { 'union-parents': { rel: 'partner' } }),
      'profile-sib': node('profile-sib', { 'union-parents': { rel: 'child' } }),
      'profile-wife': node('profile-wife', { 'union-mine': { rel: 'partner' } }),
      'profile-kid': node('profile-kid', { 'union-mine': { rel: 'child' } }),
      'union-parents': { id: 'union-parents', edges: { 'profile-dad': { rel: 'partner' }, 'profile-mom': { rel: 'partner' }, 'profile-me': { rel: 'child' }, 'profile-sib': { rel: 'child' } } },
      'union-mine': { id: 'union-mine', edges: { 'profile-me': { rel: 'partner' }, 'profile-wife': { rel: 'partner' }, 'profile-kid': { rel: 'child' } } },
    };
    const f = parseFamily({ focus: { id: 'profile-me' }, nodes });
    expect(f.parents.map((p) => p.id)).toEqual(['profile-dad', 'profile-mom']);
    expect(f.siblings.map((p) => p.id)).toEqual(['profile-sib']);
    expect(f.spouses.map((p) => p.id)).toEqual(['profile-wife']);
    expect(f.children.map((p) => p.id)).toEqual(['profile-kid']);
  });

  it('is empty for a person with no family', () => {
    expect(parseFamily({ focus: { id: 'profile-1' }, nodes: { 'profile-1': { id: 'profile-1', edges: {} } } })).toEqual({
      parents: [],
      spouses: [],
      children: [],
      siblings: [],
    });
  });
});
