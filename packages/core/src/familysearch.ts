/**
 * Framework-agnostic, typed FamilySearch client: a thin promise-based wrapper
 * over the official fs-js-lite v3 SDK (https://github.com/FamilySearch/fs-js-lite).
 *
 * fs-js-lite owns the transport (XMLHttpRequest in the browser, axios in Node),
 * environment hosts, default FS headers, throttling retries, the OAuth URL and
 * the token request. This module adds what the app needs on top:
 *  - promises, and a real {@link FsApiError} for every HTTP failure — never
 *    `reject(undefined)` (Sentry "UnhandledRejection value undefined") — with
 *    guarded JSON parsing (Sentry "SyntaxError: Unexpected end of input");
 *  - authorization-code + PKCE (S256) via Web Crypto;
 *  - an injectable {@link TokenStore} and an optional injectable `fetch`
 *    transport (tests, MV3 service workers where XMLHttpRequest is missing);
 *  - GEDCOM-X media types and the resource helpers used by the share flow.
 */
/// <reference path="./fs-js-lite.d.ts" />
import FamilySearch from 'fs-js-lite';
import type { FsJsLiteClient, FsJsLiteRequest, FsJsLiteResponse } from 'fs-js-lite';
import { extractDomain } from './url-normalize';

export type FsEnvironment = 'production' | 'beta' | 'integration';

const GEDCOMX_MEDIA = 'application/x-gedcomx-v1+json';
const FS_MEDIA = 'application/x-fs-v1+json';

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export function memoryTokenStore(initial: string | null = null): TokenStore {
  let token = initial;
  return {
    get: () => token,
    set: (t: string) => {
      token = t;
    },
    clear: () => {
      token = null;
    },
  };
}

export interface FsConfig {
  appKey: string;
  redirectUri: string;
  environment?: FsEnvironment;
  /** Replace fs-js-lite's own transport (XHR / axios) with this `fetch`. */
  fetch?: typeof fetch;
  tokenStore?: TokenStore;
  /** Give up on an API call after this long (default 30s) instead of hanging. */
  timeoutMs?: number;
}

export interface FsUser {
  id: string;
  personId?: string;
  displayName?: string;
  [key: string]: unknown;
}

export interface FsCollection {
  id: string;
  title?: string;
  [key: string]: unknown;
}

export interface SourceDescriptionDraft {
  about?: string;
  citation?: string;
  title?: string;
  text?: string;
  changeMessage?: string;
  contributorId?: string;
}

export interface PersonSourceRef {
  descriptionUrl: string;
  changeMessage?: string;
  contributorId?: string;
  /** canonical gedcomx.org conclusion URIs, e.g. "http://gedcomx.org/Birth" */
  tags?: string[];
}

/** A couple (spouse) relationship the person is part of. */
export interface Spouse {
  /** the couple-relationship id (crid), used to attach a marriage source ref */
  coupleId: string;
  spouseId: string;
  spouseName: string;
}

/**
 * FamilySearch rejects long source titles with a bare 400 "Unable to create
 * source" (RECORDSEEK-EV: 282-char page titles). Cap them, on a word boundary.
 */
export const MAX_SOURCE_TITLE = 255;

export function clampSourceTitle(title: string): string {
  if (title.length <= MAX_SOURCE_TITLE) return title;
  const cut = title.slice(0, MAX_SOURCE_TITLE - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MAX_SOURCE_TITLE * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * FamilySearch rejects an over-long `about` URI with the same bare 400 "Unable
 * to create source" (RECORDSEEK-F2: 2.1–2.7 KB capture URLs). 2048 is the
 * conventional URL ceiling. When a URL is too long — almost always a huge query
 * string on a record link — drop the query (and hash) to keep a working link;
 * fall back to the site origin if even the origin+path is too long (`about` is
 * the one required field of a create, so it is never omitted).
 */
export const MAX_SOURCE_ABOUT = 2048;

export function clampSourceAbout(url: string): string {
  if (url.length <= MAX_SOURCE_ABOUT) return url;
  const trimmed = url.split(/[?#]/)[0] ?? '';
  if (trimmed.length <= MAX_SOURCE_ABOUT) return trimmed;
  // `about` is required by the API, so fall back to the site rather than omit it.
  const u = strictUri(url);
  return u ? `${u.protocol}//${u.host}/` : '';
}

/**
 * Characters the WHATWG URL serializer leaves raw (so `location.href` can carry
 * them) but RFC 3986 forbids outside the host. A strict server-side URI parser
 * rejects them, so they are percent-encoded before a fallback retry.
 */
const RFC3986_UNSAFE = /[\s"<>\\^`{|}\[\]]/g;

function strictUri(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Rung of the `about` fallback ladder that a source was finally created with. */
export type SourceAboutRung = 'encoded' | 'fragment' | 'path' | 'origin';

/**
 * Simpler `about` values to retry with, in order, after FamilySearch rejects a
 * source with a 400. FamilySearch checks (categorizes) the `about` URI
 * server-side, and a URI it cannot handle fails the whole create with the
 * opaque "Failure in upstream call: Unable to create source" (RECORDSEEK-EV:
 * 1.3 KB and 2.0 KB record links, under any fixed length cap we could guess).
 * FamilySearch's docs say the URI "indicates the type of source" (a records
 * URI resolves to a persona), so that lookup is the "upstream call". Each rung
 * keeps as much of the link as possible: strictly encoded, then without its
 * query and fragment, then just the site. A link with a `#fragment` first
 * loses only the fragment (rung `fragment`, query kept): FamilySearch rejects
 * `#` in OAuth callbacks, and a fragment is client-side only, so it may refuse
 * one on a source too. It is kept on the first try because some record sites
 * route by it (`/app/#/record/123`). `about` is the one required field of
 * a create, so it is never dropped; title, citation and notes always ride
 * along. Duplicates are skipped.
 */
export function sourceAboutFallbacks(url: string): Array<{ rung: SourceAboutRung; about: string }> {
  const sent = clampSourceAbout(url);
  const out: Array<{ rung: SourceAboutRung; about: string }> = [];
  const seen = new Set([sent]);
  const push = (rung: SourceAboutRung, about: string) => {
    if (seen.has(about)) return;
    seen.add(about);
    out.push({ rung, about });
  };
  const u = strictUri(url);
  if (u) {
    const enc = (part: string) => part.replace(RFC3986_UNSAFE, (c) => encodeURIComponent(c));
    const base = `${u.protocol}//${u.host}`;
    // Strictly encoded, minus the fragment when there is one.
    const strict = clampSourceAbout(`${base}${enc(u.pathname)}${enc(u.search)}`);
    if (strict) push(u.hash ? 'fragment' : 'encoded', strict);
    const path = `${base}${enc(u.pathname)}`;
    if (path.length <= MAX_SOURCE_ABOUT) push('path', path);
    push('origin', `${base}/`);
  }
  return out;
}

export interface CreateSourceOptions {
  /** Called when the source was only accepted with a simplified `about`. */
  onAboutFallback?: (info: { rung: SourceAboutRung; attempts: number; status: number }) => void;
}

export class FsApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `FamilySearch API error ${status}`);
    this.name = 'FsApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Resolve the OAuth redirect_uri for an origin, preserving local-dev parity:
 * production serves the app under `/share/`; localhost serves it from the root.
 * (Mirrors legacy familysearch.js:30-34.)
 */
export function resolveRedirectUri(origin: string, basePath = '/share/'): string {
  if (origin === 'http://localhost:9000' || origin === 'http://localhost:9001') {
    return origin;
  }
  return `${origin}${basePath}`;
}

// ---------------------------------------------------------------------------
// PKCE (S256)
// ---------------------------------------------------------------------------

function webCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment');
  }
  return c;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  webCrypto().getRandomValues(bytes);
  return base64UrlEncode(bytes); // 43-char base64url
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await webCrypto().subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------

/** New entity id from X-ENTITY-ID, else the last path segment of Location. */
function entityId(headers: Headers): string | null {
  const id = headers.get('x-entity-id');
  if (id) return id;
  const location = headers.get('location');
  const path = location?.split('?')[0] ?? '';
  return path.split('/').filter(Boolean).pop() ?? null;
}

function safeJsonParse(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface RawResponse {
  status: number;
  headers: Headers;
  data: any;
}

/** Route fs-js-lite requests through an injected `fetch` instead of XHR/axios. */
function fetchTransport(doFetch: typeof fetch) {
  return (_client: unknown, request: FsJsLiteRequest, next: (error?: unknown, response?: FsJsLiteResponse) => void) => {
    doFetch(request.url, {
      method: request.method,
      headers: request.getHeaders(),
      body: request.body as BodyInit | undefined,
      redirect: 'manual',
    }).then(
      async (res) => {
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
        next(undefined, {
          statusCode: res.status,
          statusText: res.statusText,
          headers,
          originalUrl: request.url,
          effectiveUrl: request.url,
          redirected: false,
          requestMethod: request.method,
          requestHeaders: request.headers,
          body: await res.text(),
          retries: 0,
          throttled: false,
        });
      },
      (error) => next(error ?? new Error('Network request failed')),
    );
  };
}

function toHeaders(map: Record<string, unknown>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(map)) {
    if (value !== undefined && value !== null) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

/** FamilySearch could not be reached at all: offline, DNS, CORS, or a timeout. */
export class FsNetworkError extends Error {
  readonly timedOut: boolean;
  constructor(message: string, timedOut = false) {
    super(message);
    this.name = 'FsNetworkError';
    this.timedOut = timedOut;
  }
}

/** Never reject with a non-Error (xhr.onerror hands us a ProgressEvent). */
function toError(error: unknown): Error {
  if (error instanceof FsApiError || error instanceof FsNetworkError) return error;
  return new FsNetworkError(
    error instanceof Error && error.message ? error.message : 'Network error contacting FamilySearch',
  );
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class FamilySearchClient {
  readonly appKey: string;
  readonly redirectUri: string;
  readonly environment: FsEnvironment;
  readonly apiHost: string;
  readonly identHost: string;
  private readonly fs: FsJsLiteClient;
  private readonly tokens: TokenStore;
  private readonly timeoutMs: number;

  constructor(config: FsConfig) {
    this.appKey = config.appKey;
    this.redirectUri = config.redirectUri;
    this.environment = config.environment ?? 'production';
    this.tokens = config.tokenStore ?? memoryTokenStore();
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fs = new FamilySearch({
      appKey: this.appKey,
      redirectUri: this.redirectUri,
      environment: this.environment,
    });
    this.apiHost = this.fs.platformHost();
    this.identHost = this.fs.identHost();
    if (config.fetch) {
      this.fs.addRequestMiddleware(fetchTransport(config.fetch.bind(globalThis)));
    }
  }

  // --- auth ---------------------------------------------------------------

  buildAuthorizationUrl(options: { codeChallenge?: string; state?: string; scope?: string } = {}): string {
    return this.fs.oauthRedirectURL({
      state: options.state,
      codeChallenge: options.codeChallenge,
      scope: options.scope,
    });
  }

  async exchangeToken(code: string, codeVerifier?: string): Promise<string> {
    const res = await new Promise<FsJsLiteResponse>((resolve, reject) => {
      this.fs.oauthToken(code, codeVerifier, (error, response) => {
        if (response) {
          resolve(response);
        } else {
          reject(toError(error));
        }
      });
    });
    const text = res.body ?? '';
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new FsApiError(res.statusCode, text, `Token exchange failed (HTTP ${res.statusCode})`);
    }
    const token = (res.data ?? safeJsonParse(text))?.access_token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new FsApiError(res.statusCode, text, 'Token exchange returned no access_token');
    }
    this.tokens.set(token);
    return token;
  }

  getAccessToken(): string | null {
    return this.tokens.get();
  }

  setAccessToken(token: string): void {
    this.tokens.set(token);
  }

  descriptionUrl(id: string): string {
    return `${this.apiHost}/platform/sources/descriptions/${id}`;
  }

  // --- core request -------------------------------------------------------

  private async request(
    method: string,
    path: string,
    options: { body?: unknown; contentType?: string; accept?: string } = {},
  ): Promise<RawResponse> {
    const token = this.tokens.get();
    if (!token || token === 'undefined') {
      throw new FsApiError(0, '', 'No authenticated FamilySearch user');
    }
    // fs-js-lite adds the Authorization header from its own token; the
    // TokenStore stays the source of truth (another client may have refreshed it).
    this.fs.setAccessToken(token);
    const headers: Record<string, string> = { Accept: options.accept ?? FS_MEDIA };
    if (options.body !== undefined) {
      headers['Content-Type'] = options.contentType ?? GEDCOMX_MEDIA;
    }
    const res = await new Promise<FsJsLiteResponse>((resolve, reject) => {
      // A hung request would leave the UI on a spinner forever; fail it instead.
      const timer = setTimeout(
        () => reject(new FsNetworkError('FamilySearch took too long to respond', true)),
        this.timeoutMs,
      );
      this.fs.request(path, { method, headers, body: options.body }, (error, response) => {
        clearTimeout(timer);
        // fs-js-lite attaches the response to a JSON-parse error; surface its status instead.
        const received = response ?? (error as { response?: FsJsLiteResponse } | undefined)?.response;
        if (received) {
          resolve(received);
        } else {
          reject(toError(error));
        }
      });
    });
    const text = res.body ?? '';
    if (res.statusCode === 401) {
      // The token is dead; drop it so the app sees a signed-out user and re-authenticates.
      this.tokens.clear();
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new FsApiError(res.statusCode, text, this.errorMessage(res.statusCode, text));
    }
    return { status: res.statusCode, headers: toHeaders(res.headers), data: res.data ?? safeJsonParse(text) };
  }

  private errorMessage(status: number, text: string): string {
    const parsed = safeJsonParse(text);
    const first = parsed?.errors?.[0];
    const detail = first?.message ?? first?.stacktrace;
    return detail
      ? `FamilySearch API ${status}: ${detail}`
      : `FamilySearch returned an unexpected response (HTTP ${status}).`;
  }

  // --- resources ----------------------------------------------------------

  async getCurrentUser(): Promise<FsUser | null> {
    const res = await this.request('GET', '/platform/users/current');
    return res.data?.users?.[0] ?? null;
  }

  async getUserCollections(userId: string): Promise<FsCollection[]> {
    const res = await this.request('GET', `/platform/sources/${userId}/collections`);
    return res.data?.collections ?? [];
  }

  /**
   * Create a source description; returns its new entity id. If FamilySearch
   * rejects it with a 400 and it carries a link, it is retried with simpler
   * links (see {@link sourceAboutFallbacks}) so the user's source still saves.
   */
  async createSourceDescription(
    draft: SourceDescriptionDraft,
    options: CreateSourceOptions = {},
  ): Promise<string | null> {
    const first = draft.about ? clampSourceAbout(draft.about) : '';
    try {
      return await this.postSourceDescription(draft, first);
    } catch (err) {
      if (!(err instanceof FsApiError) || err.status !== 400 || !draft.about) throw err;
      let attempts = 1;
      let lastError: FsApiError = err;
      for (const { rung, about } of sourceAboutFallbacks(draft.about)) {
        attempts++;
        try {
          const id = await this.postSourceDescription(draft, about);
          options.onAboutFallback?.({ rung, attempts, status: lastError.status });
          return id;
        } catch (retryErr) {
          if (!(retryErr instanceof FsApiError) || retryErr.status !== 400) throw retryErr;
          lastError = retryErr;
        }
      }
      throw lastError;
    }
  }

  private async postSourceDescription(draft: SourceDescriptionDraft, about: string): Promise<string | null> {
    const description: Record<string, unknown> = {};
    if (about) description.about = about;
    // FamilySearch: "Title. The name of the source, always required." A page with
    // no title ("A title for the source must be supplied", RECORDSEEK-EV) gets
    // the site's name instead of a failed save.
    const title = draft.title?.trim() || (about ? extractDomain(about) : '') || 'Web page';
    if (draft.citation) description.citations = [{ value: draft.citation }];
    description.titles = [{ value: clampSourceTitle(title) }];
    if (draft.text) description.notes = [{ text: draft.text }];
    if (draft.changeMessage) {
      const attribution: Record<string, unknown> = { changeMessage: draft.changeMessage };
      if (draft.contributorId) {
        attribution.contributor = {
          resource: `${this.apiHost}/platform/users/agents/${draft.contributorId}`,
          resourceId: draft.contributorId,
        };
      }
      description.attribution = attribution;
    }
    const res = await this.request('POST', '/platform/sources/descriptions', {
      body: { sourceDescriptions: [description] },
    });
    return entityId(res.headers);
  }

  /** Create a source-box folder (collection). */
  async createCollection(collection: { title: string }): Promise<RawResponse> {
    return this.request('POST', '/platform/sources/collections', {
      body: { collections: [collection] },
    });
  }

  /** File an existing source description into a folder. */
  async addDescriptionToCollection(collectionUrl: string, descriptionId: string): Promise<RawResponse> {
    return this.request('POST', collectionUrl, {
      body: { sourceDescriptions: [{ id: descriptionId }] },
    });
  }

  /** The GEDCOM-X source object shared by person and couple source references. */
  private buildSourceRef(ref: PersonSourceRef): Record<string, unknown> {
    const source: Record<string, unknown> = {
      description: ref.descriptionUrl,
    };
    if (ref.tags && ref.tags.length > 0) {
      source.tags = ref.tags.map((resource) => ({ resource }));
    }
    if (ref.changeMessage) {
      const attribution: Record<string, unknown> = { changeMessage: ref.changeMessage };
      if (ref.contributorId) {
        attribution.contributor = {
          resource: `${this.apiHost}/platform/users/agents/${ref.contributorId}`,
          resourceId: ref.contributorId,
        };
      }
      source.attribution = attribution;
    }
    return source;
  }

  /** Attach a source reference to a person in the tree. */
  async createPersonSourceRef(personId: string, ref: PersonSourceRef): Promise<RawResponse> {
    return this.request('POST', `/platform/tree/persons/${personId}`, {
      body: { persons: [{ sources: [this.buildSourceRef(ref)] }] },
    });
  }

  /**
   * Attach a source reference to a couple (marriage) relationship. Used to tag a
   * source with http://gedcomx.org/Marriage, which is a couple fact, not a
   * person fact — so it can't go on a person source ref.
   */
  async createCoupleSourceRef(coupleId: string, ref: PersonSourceRef): Promise<RawResponse> {
    // Mirror the person source-ref write, which posts the source onto the entity
    // itself (POST /persons/{id} with {persons:[{sources}]}) rather than the
    // dedicated /source-references sub-resource. The sub-resource returned a 400
    // ("CreateTfEntityReference") in production, so we post onto the couple
    // relationship entity the same way the working person path does.
    return this.request('POST', `/platform/tree/couple-relationships/${coupleId}`, {
      body: { relationships: [{ sources: [this.buildSourceRef(ref)] }] },
    });
  }

  /**
   * The couple (spouse) relationships a person is part of. FamilySearch's
   * /spouses collection may also list co-parents who share no couple
   * relationship, so we keep only entries with a real Couple relationship id.
   * Returns [] on a 204 (no relationships).
   */
  async getPersonSpouses(personId: string): Promise<Spouse[]> {
    const res = await this.request('GET', `/platform/tree/persons/${personId}/spouses`, {
      accept: 'application/x-gedcomx-v1+json',
    });
    const data = (res.data ?? {}) as {
      relationships?: Array<{
        id?: string;
        type?: string;
        person1?: { resourceId?: string };
        person2?: { resourceId?: string };
      }>;
      persons?: Array<{ id?: string; display?: { name?: string } }>;
    };
    const nameById = new Map<string, string>();
    for (const p of data.persons ?? []) {
      if (p.id) nameById.set(p.id, p.display?.name ?? '');
    }
    const spouses: Spouse[] = [];
    for (const rel of data.relationships ?? []) {
      if (!rel.id || !/Couple$/.test(rel.type ?? '')) continue;
      const p1 = rel.person1?.resourceId;
      const p2 = rel.person2?.resourceId;
      const spouseId = p1 === personId ? p2 : p1;
      if (!spouseId) continue;
      spouses.push({ coupleId: rel.id, spouseId, spouseName: nameById.get(spouseId) ?? '' });
    }
    return spouses;
  }

  /** Read a single tree person (GEDCOM-X). */
  async getPerson(personId: string): Promise<unknown> {
    const res = await this.request('GET', `/platform/tree/persons/${personId}`, {
      accept: 'application/x-gedcomx-v1+json',
    });
    return res.data;
  }

  /**
   * Search the tree. `query` keys are bare field names (givenName, surname,
   * birthLikeDate, …); they're sent as `q.<field>`. Returns the raw GEDCOM-X
   * Atom feed.
   */
  async searchPersons(
    query: Record<string, string>,
    options: { count?: number; offset?: number } = {},
  ): Promise<unknown> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) {
        params.set(`q.${key}`, value);
      }
    }
    params.set('count', String(options.count ?? 20));
    params.set('offset', String(options.offset ?? 0));
    const res = await this.request('GET', `/platform/tree/search?${params.toString()}`, {
      accept: 'application/x-gedcomx-atom+json',
    });
    return res.data;
  }

  /** Create a brand-new tree person; returns its new entity id. */
  async createPerson(person: unknown): Promise<string | null> {
    const res = await this.request('POST', '/platform/tree/persons', {
      body: { persons: [person] },
    });
    return entityId(res.headers);
  }

  async logout(): Promise<void> {
    try {
      await this.request('POST', '/platform/logout');
    } catch (err) {
      if (!(err instanceof FsApiError)) {
        throw err;
      }
      // a failed logout still clears the local token below
    } finally {
      this.tokens.clear();
    }
  }
}
