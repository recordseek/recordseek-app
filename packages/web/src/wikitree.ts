import { zoteroAuthUrl } from './zotero';

/** WikiTree has no write API, so this screen only formats text and opens the edit page. */

/** WikiTree IDs look like Smith-123 (surname, hyphen, number). */
const WIKITREE_ID = /^[A-Za-z' -]+-\d+$/;

export function isValidWikiTreeId(id: string): boolean {
  return WIKITREE_ID.test(id.trim());
}

export function wikiTreeEditUrl(id: string): string {
  return `https://www.wikitree.com/index.php?title=Special:EditPerson&w=${encodeURIComponent(id.trim())}`;
}

/** A `<ref>` block: the citation text plus a `[url title]` wiki link. */
export function wikiTreeRef(citation: string, url: string, title: string): string {
  // "[" and "]" would break the wiki link early; newlines would break the one-line ref.
  const label = title.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim();
  const link = url ? `[${url}${label ? ` ${label}` : ''}]` : '';
  const text = citation.replace(/\s+/g, ' ').trim();
  return `<ref>${[text, link].filter(Boolean).join(' ')}</ref>`;
}

// ---- Sign-in, watchlist and search -------------------------------------------------
// api.wikitree.com answers CORS only for wikitree.com origins, so every call goes through
// the zotero-auth relay (action=wikitree). The WikiTree session cookie it hands back at
// login is kept in sessionStorage and returned in the body of later calls.

export const WIKITREE_APP_ID = 'RecordSeek';
const API_LOGIN = 'https://api.wikitree.com/api.php';
const AUTHCODE_KEY = 'rs_wikitree_authcode';
const SESSION_KEY = 'rs_wikitree_session';
const FIELDS = 'Id,Name,FirstName,LastNameAtBirth,LastNameCurrent,BirthDate,DeathDate';
const PAGE = 1000;

export interface WikiTreeSession {
  session: string;
  userName: string;
  userId: number;
}

export interface WikiTreePerson {
  id: number;
  /** WikiTree ID, like Smith-123. */
  name: string;
  display: string;
  years: string;
}

/** Where WikiTree sends the browser after login: the static page beside index.html. */
export function wikiTreeReturnUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}wikitree-callback.html`, window.location.origin).toString();
}

export function wikiTreeLoginUrl(): string {
  return `${API_LOGIN}?${new URLSearchParams({ action: 'clientLogin', returnURL: wikiTreeReturnUrl(), appId: WIKITREE_APP_ID })}`;
}

/** True when wikitree-callback.html left an authcode to confirm. */
export function hasAuthcode(): boolean {
  try {
    return Boolean(sessionStorage.getItem(AUTHCODE_KEY));
  } catch {
    return false;
  }
}

/** Reads and clears the authcode that wikitree-callback.html stashed. */
export function takeAuthcode(): string | null {
  try {
    const code = sessionStorage.getItem(AUTHCODE_KEY);
    sessionStorage.removeItem(AUTHCODE_KEY);
    return code || null;
  } catch {
    return null;
  }
}

export function getWikiTreeSession(): WikiTreeSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Partial<WikiTreeSession> | null;
    return s?.session && s.userName ? (s as WikiTreeSession) : null;
  } catch {
    return null;
  }
}

function saveSession(s: WikiTreeSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the user signs in again next time */
  }
}

/** Ends the WikiTree session server-side (clientLogin with doLogout=1) through the relay. */
export async function revokeWikiTreeSession(session: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const body = new URLSearchParams({
    appId: WIKITREE_APP_ID,
    action: 'clientLogin',
    doLogout: '1',
    session,
  });
  await fetchImpl(`${zoteroAuthUrl()}?action=wikitree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(5000),
  });
}

export function clearWikiTreeSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(AUTHCODE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class WikiTreeError extends Error {}
/** The session is gone or not accepted: sign in again. */
export class WikiTreeAuthError extends WikiTreeError {}

async function call(
  params: Record<string, string | number>,
  session: string | null,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const body = new URLSearchParams({
    appId: WIKITREE_APP_ID,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  if (session) body.set('session', session);
  const res = await fetchImpl(`${zoteroAuthUrl()}?action=wikitree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new WikiTreeError(`WikiTree ${res.status}`);
  const first = Array.isArray(data)
    ? (data[0] as { status?: unknown } | undefined)
    : (data as { status?: unknown } | null);
  const status = first?.status;
  if (typeof status === 'string' && status && status !== '0') {
    throw /login|auth|access|permission/i.test(status) ? new WikiTreeAuthError(status) : new WikiTreeError(status);
  }
  return Array.isArray(data) ? data[0] : data;
}

/** Confirms the authcode WikiTree returned; stores and returns the signed-in session. */
export async function confirmAuthcode(authcode: string, fetchImpl: typeof fetch = fetch): Promise<WikiTreeSession> {
  const data = (await call({ action: 'clientLogin', authcode }, null, fetchImpl)) as {
    clientLogin?: {
      result?: string;
      username?: string;
      userid?: number | string;
    };
    session?: string;
  };
  const login = data?.clientLogin;
  if (login?.result !== 'Success' || !login.username || !data.session)
    throw new WikiTreeAuthError('login not confirmed');
  const s = {
    session: data.session,
    userName: login.username,
    userId: Number(login.userid) || 0,
  };
  saveSession(s);
  return s;
}

interface RawPerson {
  Id?: number;
  Name?: string;
  FirstName?: string;
  LastNameAtBirth?: string;
  LastNameCurrent?: string;
  BirthDate?: string;
  DeathDate?: string;
}

const year = (d?: string) => (d && /^\d{4}/.test(d) && !d.startsWith('0000') ? d.slice(0, 4) : '');

export function toPerson(raw: RawPerson): WikiTreePerson | null {
  if (!raw.Name || !raw.Id) return null;
  const last = raw.LastNameAtBirth || raw.LastNameCurrent || '';
  const display = [raw.FirstName, last].filter(Boolean).join(' ') || raw.Name;
  const b = year(raw.BirthDate);
  const d = year(raw.DeathDate);
  return {
    id: raw.Id,
    name: raw.Name,
    display,
    years: b || d ? `${b || '?'}–${d}` : '',
  };
}

/** Every person on the user's watchlist (profiles they manage or follow), paged 1000 at a time. */
export async function fetchWatchlist(session: string, fetchImpl: typeof fetch = fetch): Promise<WikiTreePerson[]> {
  const people: WikiTreePerson[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const data = (await call(
      {
        action: 'getWatchlist',
        getPerson: 1,
        getSpace: 0,
        fields: FIELDS,
        limit: PAGE,
        offset,
        order: 'user_last_name_current',
      },
      session,
      fetchImpl,
    )) as {
      watchlist?: RawPerson[];
      items?: RawPerson[];
      watchlistCount?: number;
    };
    const rows = data?.watchlist ?? data?.items ?? [];
    for (const row of rows) {
      const p = toPerson(row);
      if (p) people.push(p);
    }
    if (rows.length < PAGE || (data.watchlistCount !== undefined && offset + rows.length >= data.watchlistCount)) break;
  }
  return people;
}

/** Search all of WikiTree by name (public data; no extra rights needed). */
export async function searchWikiTree(
  session: string | null,
  first: string,
  last: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WikiTreePerson[]> {
  const params: Record<string, string | number> = {
    action: 'searchPerson',
    fields: FIELDS,
    limit: 25,
  };
  if (first.trim()) params.FirstName = first.trim();
  if (last.trim()) params.LastName = last.trim();
  const data = (await call(params, session, fetchImpl)) as {
    matches?: RawPerson[];
  };
  return (data?.matches ?? []).map(toPerson).filter((p): p is WikiTreePerson => p !== null);
}

/** Client-side filter of the watchlist by name or WikiTree ID. */
export function filterPeople(people: WikiTreePerson[], query: string): WikiTreePerson[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return people;
  return people.filter((p) => {
    const hay = `${p.display} ${p.name}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
