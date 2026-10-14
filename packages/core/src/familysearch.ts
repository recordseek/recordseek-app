/**
 * Framework-agnostic FamilySearch client — replaces the vendored fs-js-lite
 * (ES5 / XMLHttpRequest / callbacks / no PKCE, blocked in MV3 service workers).
 *
 * Design (per the FS API validation spec):
 *  - `fetch` + Web Crypto, so it runs identically in the Vite SPA, an MV3
 *    service worker, and Node 20+. Both are injectable for tests.
 *  - Authorization-code + PKCE (S256) by default.
 *  - Hosts derived from `environment` (no hardcoded api.familysearch.org).
 *  - Explicit lowercase headers + GEDCOM-X media types (the legacy capital
 *    `Header:` option was dead code).
 *  - Every failure throws a real {@link FsApiError} — never `reject(undefined)`
 *    (Sentry "UnhandledRejection value undefined") — and JSON parsing is
 *    guarded (Sentry "SyntaxError: Unexpected end of input").
 */

export type FsEnvironment = 'production' | 'beta' | 'integration';

const HOSTS: Record<FsEnvironment, { api: string; ident: string }> = {
  production: { api: 'https://api.familysearch.org', ident: 'https://ident.familysearch.org' },
  beta: { api: 'https://apibeta.familysearch.org', ident: 'https://identbeta.familysearch.org' },
  integration: { api: 'https://api-integ.familysearch.org', ident: 'https://identint.familysearch.org' },
};

const GEDCOMX_MEDIA = 'application/x-gedcomx-v1+json';
const FS_MEDIA = 'application/x-fs-v1+json';
/** Default OAuth scopes — same as the official fs-js-lite SDK. */
const DEFAULT_SCOPE = 'openid profile email qualifies_for_affiliate_account country';

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
export function resolveRedirectUri(origin: string): string {
  if (origin === 'http://localhost:9000' || origin === 'http://localhost:9001') {
    return origin;
  }
  return `${origin}/share/`;
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

export class FamilySearchClient {
  readonly appKey: string;
  readonly redirectUri: string;
  readonly environment: FsEnvironment;
  readonly apiHost: string;
  readonly identHost: string;
  private readonly doFetch: typeof fetch;
  private readonly tokens: TokenStore;

  constructor(config: FsConfig) {
    this.appKey = config.appKey;
    this.redirectUri = config.redirectUri;
    this.environment = config.environment ?? 'production';
    const hosts = HOSTS[this.environment];
    this.apiHost = hosts.api;
    this.identHost = hosts.ident;
    const injected = config.fetch ?? globalThis.fetch;
    if (!injected) {
      throw new Error('No fetch implementation available');
    }
    this.doFetch = injected.bind(globalThis);
    this.tokens = config.tokenStore ?? memoryTokenStore();
  }

  // --- auth ---------------------------------------------------------------

  buildAuthorizationUrl(options: { codeChallenge?: string; state?: string; scope?: string } = {}): string {
    const params = new URLSearchParams({
      response_type: 'code',
      scope: options.scope ?? DEFAULT_SCOPE,
      client_id: this.appKey,
      redirect_uri: this.redirectUri,
    });
    if (options.codeChallenge) {
      params.set('code_challenge', options.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    if (options.state) {
      params.set('state', options.state);
    }
    return `${this.identHost}/cis-web/oauth2/v3/authorization?${params.toString()}`;
  }

  async exchangeToken(code: string, codeVerifier?: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.appKey,
      redirect_uri: this.redirectUri,
    });
    if (codeVerifier) {
      body.set('code_verifier', codeVerifier);
    }
    const res = await this.doFetch(`${this.identHost}/cis-web/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new FsApiError(res.status, text, `Token exchange failed (HTTP ${res.status})`);
    }
    const token = safeJsonParse(text)?.access_token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new FsApiError(res.status, text, 'Token exchange returned no access_token');
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
    const url = path.startsWith('http') ? path : `${this.apiHost}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: options.accept ?? FS_MEDIA,
    };
    let payload: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = options.contentType ?? GEDCOMX_MEDIA;
      payload = JSON.stringify(options.body);
    }
    const res = await this.doFetch(url, { method, headers, body: payload, redirect: 'manual' });
    const text = await res.text();
    if (!res.ok) {
      throw new FsApiError(res.status, text, this.errorMessage(res.status, text));
    }
    return { status: res.status, headers: res.headers, data: safeJsonParse(text) };
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
