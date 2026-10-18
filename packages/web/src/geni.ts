import { zoteroAuthUrl } from './zotero';

/** Public Geni app id (a client identifier, safe to ship). */
const GENI_APP_ID = '2301';
const API = 'https://www.geni.com/api/';
const TOKEN_KEY = 'rs_geni_token';
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
    const parsed = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token?: string; expiresAt?: number } | null;
    return parsed?.token && (!parsed.expiresAt || parsed.expiresAt > now) ? parsed.token : null;
  } catch {
    return null;
  }
}

export function clearGeniToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class GeniBusyError extends Error {
  constructor() {
    super('Geni rate limit exceeded');
  }
}
export class GeniError extends Error {}

function failure(data: unknown): Error | null {
  const message = (data as { error?: { message?: string } } | null)?.error?.message;
  if (!message) return null;
  return /rate limit/i.test(message) ? new GeniBusyError() : new GeniError(message);
}

let jsonpCount = 0;

/**
 * GET via JSONP: Geni sends CORS headers only for www.geni.com. A script that
 * fails to load (Geni answers 429 or 401 without a callback) rejects as busy,
 * so it is retried, then surfaces as an error.
 */
function jsonp(path: string, params: Record<string, string>, timeoutMs = 15000): Promise<unknown> {
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
    script.src = `${API}${path}?${new URLSearchParams({ ...params, callback: name })}`;
    document.head.appendChild(script);
  });
}

/** Retries while Geni is rate limiting; `onBusy` lets the screen say so. */
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
}

interface RawProfile {
  id: string;
  name?: string;
  profile_url?: string;
  birth?: { date?: { year?: number } };
  death?: { date?: { year?: number } };
}

const FIELDS = 'id,name,profile_url,birth,death';

function toProfile(raw: RawProfile): GeniProfile {
  const born = raw.birth?.date?.year;
  const died = raw.death?.date?.year;
  return {
    id: raw.id,
    name: raw.name || raw.id,
    years: born || died ? `${born ?? '?'} – ${died ?? ''}`.trim() : '',
    url: raw.profile_url ?? '',
  };
}

export async function searchProfiles(token: string, names: string, onBusy?: () => void): Promise<GeniProfile[]> {
  const data = await withRetry(() => jsonp('profile/search', { names, fields: FIELDS, access_token: token }).then(check), onBusy);
  return ((data as { results?: RawProfile[] }).results ?? []).map(toProfile);
}

export async function myProfile(token: string, onBusy?: () => void): Promise<GeniProfile> {
  const data = await withRetry(() => jsonp('profile', { fields: FIELDS, access_token: token }).then(check), onBusy);
  return toProfile(data as RawProfile);
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
  tagged: boolean;
}

export interface GeniDocumentInput {
  token: string;
  title: string;
  text: string;
  sourceUrl: string;
  profileId: string;
}

/**
 * Creates the document, then tags the profile in it. Geni's document/add has no
 * privacy field (documents follow Geni's own default); tagging is a separate call.
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
        { access_token: input.token, title: input.title, text: input.text, source_url: input.sourceUrl },
        fetchImpl,
      ),
    onBusy,
  )) as { id?: string };
  if (!doc.id) throw new GeniError('Geni returned no document');
  let tagged = true;
  try {
    await withRetry(() => relay(`${doc.id}/tag/${input.profileId}`, { access_token: input.token }, fetchImpl), onBusy);
  } catch {
    tagged = false;
  }
  return { id: doc.id, url: `https://www.geni.com/documents/view?doc_id=${doc.id.replace(/^document-/, '')}`, tagged };
}
