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

/** Never reject with a non-Error (xhr.onerror hands us a ProgressEvent). */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Network error contacting FamilySearch');
}

export class FamilySearchClient {
  readonly appKey: string;
  readonly redirectUri: string;
  readonly environment: FsEnvironment;
  readonly apiHost: string;
  readonly identHost: string;
  private readonly fs: FsJsLiteClient;
  private readonly tokens: TokenStore;

  constructor(config: FsConfig) {
    this.appKey = config.appKey;
    this.redirectUri = config.redirectUri;
    this.environment = config.environment ?? 'production';
    this.tokens = config.tokenStore ?? memoryTokenStore();
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
      this.fs.request(path, { method, headers, body: options.body }, (error, response) => {
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

  /** Create a source description; returns its new entity id. */
  async createSourceDescription(draft: SourceDescriptionDraft): Promise<string | null> {
    const description: Record<string, unknown> = {};
    if (draft.about) description.about = draft.about;
    if (draft.citation) description.citations = [{ value: draft.citation }];
    if (draft.title) description.titles = [{ value: draft.title }];
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

  /** Attach a source reference to a person in the tree. */
  async createPersonSourceRef(personId: string, ref: PersonSourceRef): Promise<RawResponse> {
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
    return this.request('POST', `/platform/tree/persons/${personId}`, {
      body: { persons: [{ sources: [source] }] },
    });
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
