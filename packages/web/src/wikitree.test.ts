import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearWikiTreeSession,
  confirmAuthcode,
  fetchWatchlist,
  filterPeople,
  getWikiTreeSession,
  isValidWikiTreeId,
  searchWikiTree,
  takeAuthcode,
  toPerson,
  wikiTreeEditUrl,
  wikiTreeLoginUrl,
  wikiTreeRef,
  WikiTreeAuthError,
} from './wikitree';

describe('wikitree helpers', () => {
  it('validates WikiTree IDs', () => {
    for (const ok of ['Smith-123', "O'Brien-7", 'Van Dyke-45', ' Smith-1 ']) expect(isValidWikiTreeId(ok)).toBe(true);
    for (const bad of ['', 'Smith', 'Smith-', '123', 'Smith-12a', '-12', 'Sm1th-2']) expect(isValidWikiTreeId(bad)).toBe(false);
  });

  it('builds the edit URL', () => {
    expect(wikiTreeEditUrl('Smith-123')).toBe('https://www.wikitree.com/index.php?title=Special:EditPerson&w=Smith-123');
    expect(wikiTreeEditUrl("O'Brien-7")).toContain('w=O\'Brien-7');
  });

  it('builds a one-line ref with a wiki link', () => {
    expect(wikiTreeRef('Some\n citation.', 'https://dp.la/', 'DPLA [beta]')).toBe(
      '<ref>Some citation. [https://dp.la/ DPLA (beta)]</ref>',
    );
    expect(wikiTreeRef('Cite.', '', '')).toBe('<ref>Cite.</ref>');
  });
});

const reply = (data: unknown, status = 200) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => data }) as unknown as typeof fetch;
const bodyOf = (f: unknown, call = 0) => (f as ReturnType<typeof vi.fn>).mock.calls[call]?.[1].body as URLSearchParams;
const raw = (n: number) => ({ Id: n, Name: `Smith-${n}`, FirstName: 'Ann', LastNameAtBirth: 'Smith', BirthDate: '1850-00-00', DeathDate: '0000-00-00' });

describe('wikitree sign-in and lists', () => {
  beforeEach(() => sessionStorage.clear());

  it('builds the clientLogin URL with returnURL and appId', () => {
    const u = new URL(wikiTreeLoginUrl());
    expect(u.origin + u.pathname).toBe('https://api.wikitree.com/api.php');
    expect(u.searchParams.get('action')).toBe('clientLogin');
    expect(u.searchParams.get('appId')).toBe('RecordSeek');
    expect(u.searchParams.get('returnURL')).toMatch(/wikitree-callback\.html$/);
  });

  it('takes the authcode once', () => {
    sessionStorage.setItem('rs_wikitree_authcode', 'abc');
    expect(takeAuthcode()).toBe('abc');
    expect(takeAuthcode()).toBeNull();
  });

  it('confirms an authcode and stores the session', async () => {
    const f = reply({ clientLogin: { result: 'Success', username: 'Smith-1', userid: 5 }, session: 'c=1' });
    const s = await confirmAuthcode('code', f);
    expect(s).toEqual({ session: 'c=1', userName: 'Smith-1', userId: 5 });
    expect(getWikiTreeSession()?.userName).toBe('Smith-1');
    const body = bodyOf(f);
    expect(body.get('authcode')).toBe('code');
    expect(body.get('appId')).toBe('RecordSeek');
    clearWikiTreeSession();
    expect(getWikiTreeSession()).toBeNull();
  });

  it('rejects an unconfirmed login', async () => {
    await expect(confirmAuthcode('x', reply({ clientLogin: { result: 'error' } }))).rejects.toBeInstanceOf(WikiTreeAuthError);
  });

  it('maps profiles and drops unusable ones', () => {
    expect(toPerson(raw(7))).toEqual({ id: 7, name: 'Smith-7', display: 'Ann Smith', years: '1850–' });
    expect(toPerson({ Id: 9 })).toBeNull();
  });

  it('pages through the whole watchlist', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => raw(i + 1));
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ status: 0, watchlistCount: 1001, watchlist: page1 }] })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ status: 0, watchlistCount: 1001, watchlist: [raw(1001)] }] });
    const people = await fetchWatchlist('c=1', f as unknown as typeof fetch);
    expect(people).toHaveLength(1001);
    expect(bodyOf(f, 1).get('offset')).toBe('1000');
    expect(bodyOf(f).get('session')).toBe('c=1');
  });

  it('treats an access error as a lost session', async () => {
    await expect(fetchWatchlist('c=1', reply([{ status: 'Access denied: login required' }]))).rejects.toBeInstanceOf(WikiTreeAuthError);
  });

  it('searches WikiTree', async () => {
    const f = reply([{ status: 0, matches: [raw(1)], total: 1 }]);
    expect(await searchWikiTree(null, ' Ann ', 'Smith', f)).toHaveLength(1);
    const body = bodyOf(f);
    expect(body.get('FirstName')).toBe('Ann');
    expect(body.get('LastName')).toBe('Smith');
    expect(body.has('session')).toBe(false);
  });

  it('filters by name or ID', () => {
    const people = [toPerson(raw(1))!, toPerson({ ...raw(2), FirstName: 'Bob' })!];
    expect(filterPeople(people, '')).toHaveLength(2);
    expect(filterPeople(people, 'bob smith')).toHaveLength(1);
    expect(filterPeople(people, 'smith-1')).toHaveLength(1);
  });
});
