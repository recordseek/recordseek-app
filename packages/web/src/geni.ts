import { zoteroAuthUrl } from './zotero';

/** Public Geni app id (a client identifier, safe to ship). */
const GENI_APP_ID = '2301';
const API = 'https://www.geni.com/api/';
const TOKEN_KEY = 'rs_geni_token';
const NAME_KEY = 'rs_geni_me';
const ID_KEY = 'rs_geni_uid';
/** Waits between tries when Geni answers "Rate limit exceeded." (it allows ~10 calls per 10 s). */
export const GENI_RETRY_DELAYS_MS = [2000, 5000, 10000];

/**
 * Geni only accepts the registered site domain (recordseek.com) as the redirect
 * host, so login works on https://recordseek.com/share/ and not on the github.io
 * stage build or localhost. The static callback page sits beside index.html, so
 * its URL follows whatever base path the app is served from.
 */
export function geniRedirectUri(): string {
  return new URL(`${import.meta.env.BASE_URL}geni-callback.html`, window.location.origin).toString();
}

export function geniLoginUrl(): string {
  return `https://www.geni.com/platform/oauth/authorize?${new URLSearchParams({
    client_id: GENI_APP_ID,
    response_type: 'token',
    redirect_uri: geniRedirectUri(),
  })}`;
}

/** The token stored by geni-callback.html, or null when absent or expired. */
export function getGeniToken(now: number = Date.now()): string | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as {
      token?: string;
      expiresAt?: number;
    } | null;
    return parsed?.token && (!parsed.expiresAt || parsed.expiresAt > now) ? parsed.token : null;
  } catch {
    return null;
  }
}

export function clearGeniToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(NAME_KEY);
    sessionStorage.removeItem(ID_KEY);
    sessionStorage.removeItem('rs_geni_flow');
  } catch {
    /* storage unavailable */
  }
}

/** The signed-in user's name, cached with the token so Geni is asked at most once. */
export function getGeniName(): string | null {
  try {
    return sessionStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

/** The signed-in user's profile id, cached like the name (hashed for the newsletter invite). */
export function getGeniId(): string | null {
  try {
    return sessionStorage.getItem(ID_KEY);
  } catch {
    return null;
  }
}

export function setGeniId(id: string): void {
  try {
    sessionStorage.setItem(ID_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

export function setGeniName(name: string): void {
  try {
    sessionStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Ends this app's Geni access token on the server (GET /platform/oauth/invalidate_token,
 * answered {"result":"OK"}). Geni sends no CORS headers for us but honours `callback`, so JSONP.
 * It revokes RecordSeek's token only, not the user's own session on geni.com.
 */
export async function revokeGeniToken(token: string): Promise<void> {
  await jsonp('oauth/invalidate_token', { access_token: token }, 5000, 'https://www.geni.com/platform/');
}

export class GeniBusyError extends Error {
  constructor() {
    super('Geni rate limit exceeded');
  }
}
export class GeniError extends Error {
  /** Geni's error type, like "OAuthException" or "ApiException". */
  constructor(
    message: string,
    readonly type = '',
  ) {
    super(message);
  }
}

function failure(data: unknown): Error | null {
  const error = (data as { error?: { message?: string; type?: string } } | null)?.error;
  if (!error?.message) return null;
  return /rate limit/i.test(error.message) ? new GeniBusyError() : new GeniError(error.message, error.type ?? '');
}

/**
 * Only a dead token counts as an expired sign-in: Geni answers those with an
 * OAuthException ("Invalid access token"). Other refusals (a Pro-only feature,
 * a private profile) keep Geni's own wording.
 */
function isExpiredSignIn(err: unknown): boolean {
  return (
    err instanceof GeniError &&
    (err.type === 'OAuthException' || /invalid access token|token (has )?expired/i.test(err.message))
  );
}

let jsonpCount = 0;

/**
 * GET via JSONP: Geni sends CORS headers only for www.geni.com. A script that
 * fails to load (Geni answers 429 or 401 without a callback) rejects as busy,
 * so it is retried, then surfaces as an error.
 */
function jsonp(path: string, params: Record<string, string>, timeoutMs = 15000, base = API): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const name = `__rsGeni${(jsonpCount += 1)}`;
    const script = document.createElement('script');
    const win = window as unknown as Record<string, unknown>;
    const done = (fn: () => void) => {
      window.clearTimeout(timer);
      delete win[name];
      script.remove();
      fn();
    };
    const timer = window.setTimeout(() => done(() => reject(new GeniBusyError())), timeoutMs);
    win[name] = (data: unknown) => done(() => resolve(data));
    script.onerror = () => done(() => reject(new GeniBusyError()));
    script.src = `${base}${path}?${new URLSearchParams({ ...params, callback: name })}`;
    document.head.appendChild(script);
  });
}

/** Retries while Geni is rate limiting; retries are silent (the screen keeps its loading state); `onBusy` is optional. */
export async function withRetry<T>(
  call: () => Promise<T>,
  onBusy: () => void = () => {},
  delays: readonly number[] = GENI_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof GeniBusyError) || attempt >= delays.length) throw err;
      onBusy();
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

export interface GeniProfile {
  id: string;
  name: string;
  /** Short "b. 1712 – d. 1770" style line. */
  years: string;
  url: string;
  gender?: 'male' | 'female';
  birthYear?: number;
  deathYear?: number;
  birthPlace?: string;
  deathPlace?: string;
  /** Small mugshot, when the profile has one. */
  thumb?: string;
}

interface RawEvent {
  date?: { year?: number; formatted_date?: string };
  location?: {
    formatted_location?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface RawProfile {
  id: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  gender?: string;
  profile_url?: string;
  birth?: RawEvent;
  death?: RawEvent;
  mugshot_urls?: { thumb?: string; small?: string };
  edges?: Record<string, { rel?: string }>;
}

const FIELDS = 'id,name,first_name,last_name,gender,profile_url,birth,death,mugshot_urls';

function placeOf(event?: RawEvent): string | undefined {
  const loc = event?.location;
  return loc?.formatted_location || [loc?.city, loc?.state, loc?.country].filter(Boolean).join(', ') || undefined;
}

export function toProfile(raw: RawProfile): GeniProfile {
  const born = raw.birth?.date?.year;
  const died = raw.death?.date?.year;
  const profile: GeniProfile = {
    id: raw.id,
    name: raw.name || [raw.first_name, raw.last_name].filter(Boolean).join(' ') || raw.id,
    years: born || died ? `${born ?? '?'} – ${died ?? ''}`.trim() : '',
    url: raw.profile_url ?? '',
  };
  if (raw.gender === 'male' || raw.gender === 'female') profile.gender = raw.gender;
  if (born) profile.birthYear = born;
  if (died) profile.deathYear = died;
  const birthPlace = placeOf(raw.birth);
  const deathPlace = placeOf(raw.death);
  if (birthPlace) profile.birthPlace = birthPlace;
  if (deathPlace) profile.deathPlace = deathPlace;
  const thumb = raw.mugshot_urls?.thumb ?? raw.mugshot_urls?.small;
  if (thumb) profile.thumb = thumb;
  return profile;
}

/** What the search form collects. Geni's search only takes `names`; the rest is filtered here. */
export interface GeniCriteria {
  givenName: string;
  surname: string;
  gender: '' | 'male' | 'female';
  birthYear: string;
  birthPlace: string;
  deathYear: string;
  deathPlace: string;
  /** A pasted profile id, guid or geni.com link; skips the search. */
  pid: string;
}

export function emptyCriteria(): GeniCriteria {
  return {
    givenName: '',
    surname: '',
    gender: '',
    birthYear: '',
    birthPlace: '',
    deathYear: '',
    deathPlace: '',
    pid: '',
  };
}

/** The `names` query term: Geni takes a free-text name and nothing else. */
export function buildNames(c: GeniCriteria): string {
  return [c.givenName, c.surname]
    .map((t) => t.trim())
    .filter(Boolean)
    .join(' ');
}

/** Exactly what goes to profile/search for page `page` (1-based). */
export function buildSearchParams(c: GeniCriteria, page = 1): Record<string, string> {
  const params: Record<string, string> = {
    names: buildNames(c),
    fields: FIELDS,
  };
  if (page > 1) params.page = String(page);
  return params;
}

/** A search needs a name; birth, death and gender only narrow what comes back. */
export function canSearch(c: GeniCriteria): boolean {
  return buildNames(c) !== '';
}

/** True when anything beyond the name was entered (so the filter note applies). */
export function hasClientFilters(c: GeniCriteria): boolean {
  return Boolean(c.gender || c.birthYear.trim() || c.birthPlace.trim() || c.deathYear.trim() || c.deathPlace.trim());
}

const YEAR_SLACK = 2;

function yearOk(want: string, have?: number): boolean {
  const y = parseInt(want, 10);
  if (!Number.isFinite(y) || have === undefined) return true;
  return Math.abs(have - y) <= YEAR_SLACK;
}

function placeOk(want: string, have?: string): boolean {
  const w = want.trim().toLowerCase();
  if (!w || !have) return true;
  return have.toLowerCase().includes(w);
}

/**
 * Client-side narrowing of one page of results. A profile is dropped only when it
 * has the data and the data disagrees (years within 2, places by substring); a
 * profile with no birth or death on record stays, since Geni often has none.
 */
export function filterProfiles(profiles: GeniProfile[], c: GeniCriteria): GeniProfile[] {
  return profiles.filter(
    (p) =>
      (!c.gender || !p.gender || p.gender === c.gender) &&
      yearOk(c.birthYear, p.birthYear) &&
      yearOk(c.deathYear, p.deathYear) &&
      placeOk(c.birthPlace, p.birthPlace) &&
      placeOk(c.deathPlace, p.deathPlace),
  );
}

/** Geni API size of one search page. */
export const GENI_PAGE_SIZE = 50;

export interface GeniSearchPage {
  /** Profiles after the client-side filter. */
  profiles: GeniProfile[];
  /** How many Geni returned on this page, before filtering. */
  returned: number;
  total: number;
  page: number;
  hasNext: boolean;
}

export async function searchPeople(
  token: string,
  criteria: GeniCriteria,
  page = 1,
  onBusy?: () => void,
): Promise<GeniSearchPage> {
  const params = { ...buildSearchParams(criteria, page), access_token: token };
  const data = (await withRetry(() => jsonp('profile/search', params).then(check), onBusy)) as {
    results?: RawProfile[];
    total_count?: number;
    next_page?: string;
  };
  const all = (data.results ?? []).map(toProfile);
  return {
    profiles: filterProfiles(all, criteria),
    returned: all.length,
    total: data.total_count ?? all.length,
    page,
    hasNext: Boolean(data.next_page),
  };
}

export async function searchProfiles(token: string, names: string, onBusy?: () => void): Promise<GeniProfile[]> {
  const data = await withRetry(
    () =>
      jsonp('profile/search', {
        names,
        fields: FIELDS,
        access_token: token,
      }).then(check),
    onBusy,
  );
  return ((data as { results?: RawProfile[] }).results ?? []).map(toProfile);
}

export async function myProfile(token: string, onBusy?: () => void): Promise<GeniProfile> {
  const data = await withRetry(() => jsonp('profile', { fields: FIELDS, access_token: token }).then(check), onBusy);
  return toProfile(data as RawProfile);
}

/** A profile id (profile-123) or guid (6000000…) as the API path segment, or null. */
export function parseGeniId(raw: string): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  const direct = text.match(/^(?:profile-)?(g?)(\d+)$/i);
  if (direct) {
    const [, g, digits] = direct;
    if (g || /^6000000\d+$/.test(digits ?? '')) return `profile-g${digits}`;
    return `profile-${digits}`;
  }
  if (/geni\.com\//i.test(text)) {
    const guid = text.match(/\/(6000000\d{6,})(?:[/?#]|$)/);
    if (guid) return `profile-g${guid[1]}`;
    const id = text.match(/profile-(\d+)/i) ?? text.match(/[?&](?:profile|id)=(\d+)/i);
    if (id) return `profile-${id[1]}`;
  }
  return null;
}

/**
 * What the ID box shows: a recognised id, guid or link collapses to `profile-123`
 * or the bare guid (like FsSearch's normalizePid); anything else is kept as typed.
 */
export function normalizeGeniId(raw: string): string {
  const ref = parseGeniId(raw);
  if (!ref) return raw ?? '';
  return ref.startsWith('profile-g') ? ref.slice('profile-g'.length) : ref;
}

export function isValidGeniId(raw: string): boolean {
  return parseGeniId(raw) !== null;
}

/** One person by id or guid; null when Geni has no such (or no visible) profile. */
export async function getProfile(token: string, ref: string, onBusy?: () => void): Promise<GeniProfile | null> {
  const data = (await withRetry(
    () => jsonp(ref, { fields: FIELDS, access_token: token }).then(check),
    onBusy,
  )) as RawProfile & {
    results?: unknown[];
  };
  return data && typeof data.id === 'string' ? toProfile(data) : null;
}

export interface GeniFamily {
  parents: GeniProfile[];
  spouses: GeniProfile[];
  children: GeniProfile[];
  siblings: GeniProfile[];
}

interface RawNode extends RawProfile {
  edges?: Record<string, { rel?: string }>;
}

/** Splits a profile/immediate-family graph (profile and union nodes) into relatives of the focus. */
export function parseFamily(data: { focus?: RawProfile; nodes?: Record<string, RawNode> }): GeniFamily {
  const nodes = data.nodes ?? {};
  const focusId = data.focus?.id ?? '';
  const out: GeniFamily = {
    parents: [],
    spouses: [],
    children: [],
    siblings: [],
  };
  const seen = new Set<string>([focusId]);
  const add = (list: GeniProfile[], id: string): void => {
    const node = nodes[id];
    if (!id.startsWith('profile-') || !node || seen.has(id)) return;
    seen.add(id);
    list.push(toProfile(node));
  };
  for (const [unionId, edge] of Object.entries(nodes[focusId]?.edges ?? {})) {
    const union = nodes[unionId];
    if (!union?.edges) continue;
    const members = Object.entries(union.edges);
    if (edge.rel === 'child') {
      for (const [id, e] of members) add(e.rel === 'partner' ? out.parents : out.siblings, id);
    } else {
      for (const [id, e] of members) add(e.rel === 'partner' ? out.spouses : out.children, id);
    }
  }
  return out;
}

/** A person's immediate family; `ref` is an API path segment, or omit for the signed-in user. */
export async function immediateFamily(token: string, ref = 'profile', onBusy?: () => void): Promise<GeniFamily> {
  const data = await withRetry(
    () =>
      jsonp(`${ref}/immediate-family`, {
        fields: FIELDS,
        access_token: token,
      }).then(check),
    onBusy,
  );
  return parseFamily(data as { focus?: RawProfile; nodes?: Record<string, RawNode> });
}

function check(data: unknown): unknown {
  const err = failure(data);
  if (err) throw err;
  return data;
}

/** POST through the helper function (Geni has no CORS for us and no JSONP for writes). */
async function relay(path: string, form: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(`${zoteroAuthUrl()}?${new URLSearchParams({ action: 'geni', path })}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  if (res.status === 429) throw new GeniBusyError();
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok && !failure(data)) throw new GeniError(`Geni ${res.status}`);
  return check(data);
}

export interface GeniDocument {
  id: string;
  /** Page on geni.com showing the document. */
  url: string;
  /** True when every requested profile was tagged. */
  tagged: boolean;
  taggedIds: string[];
  failedIds: string[];
}

export interface GeniDocumentInput {
  token: string;
  title: string;
  text: string;
  sourceUrl: string;
  /** Profiles to tag, in order; the first is the main person. */
  profileIds: string[];
}

/**
 * Creates the document, then tags each profile in it, one call at a time (Geni
 * allows about 10 calls per 10 s). Geni's document/add has no privacy field
 * (documents follow Geni's own default). A tag that fails is reported, not fatal.
 */
export async function addDocument(
  input: GeniDocumentInput,
  onBusy?: () => void,
  fetchImpl: typeof fetch = fetch,
): Promise<GeniDocument> {
  const doc = (await withRetry(
    () =>
      relay(
        'document/add',
        {
          access_token: input.token,
          title: input.title,
          text: input.text,
          source_url: input.sourceUrl,
        },
        fetchImpl,
      ),
    onBusy,
  )) as { id?: string };
  if (!doc.id) throw new GeniError('Geni returned no document');
  const taggedIds: string[] = [];
  const failedIds: string[] = [];
  for (const profileId of input.profileIds) {
    try {
      await withRetry(() => relay(`${doc.id}/tag/${profileId}`, { access_token: input.token }, fetchImpl), onBusy);
      taggedIds.push(profileId);
    } catch {
      failedIds.push(profileId);
    }
  }
  return {
    id: doc.id,
    url: `https://www.geni.com/documents/view?doc_id=${doc.id.replace(/^document-/, '')}`,
    tagged: failedIds.length === 0,
    taggedIds,
    failedIds,
  };
}

/** A sign-in that ran out, or Geni being busy: expected, so not worth a Sentry event. */
export function isExpectedGeniError(err: unknown): boolean {
  return err instanceof GeniBusyError || isExpiredSignIn(err);
}

/** Plain-language copy for a Geni failure, in the style of the FamilySearch screens. */
export function describeGeniError(err: unknown): string {
  if (err instanceof GeniBusyError) return 'Geni is busy right now. Wait a minute and try again.';
  if (isExpiredSignIn(err)) return 'Your Geni sign-in has expired. Please sign in again.';
  if (err instanceof GeniError) return `Geni said: ${err.message}`;
  return "Geni couldn't complete the request. Check your internet connection and try again.";
}
