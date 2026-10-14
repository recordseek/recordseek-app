import { describe, it, expect } from 'vitest';
import {
  FamilySearchClient,
  FsApiError,
  memoryTokenStore,
  resolveRedirectUri,
  generateCodeVerifier,
  deriveCodeChallenge,
} from './familysearch';

interface MockReply {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

function mockFetch(handler: (url: string, init: RequestInit) => MockReply) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const reply = handler(String(url), init);
    const status = reply.status ?? 200;
    const nullBody = status === 204 || status === 205 || status === 304;
    return new Response(nullBody ? null : (reply.body ?? ''), { status, headers: reply.headers });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function headerOf(init: RequestInit, key: string): string {
  // fs-js-lite sends canonical-case header names; compare case-insensitively.
  const headers = init.headers as Record<string, string>;
  const name = Object.keys(headers).find((k) => k.toLowerCase() === key.toLowerCase());
  return name ? headers[name]! : '';
}

const baseConfig = (overrides = {}) => ({
  appKey: 'TEST-APP-KEY',
  redirectUri: 'https://recordseek.com/share/',
  tokenStore: memoryTokenStore('valid-token'),
  ...overrides,
});

describe('PKCE (S256)', () => {
  it('matches the RFC 7636 Appendix B test vector', async () => {
    const challenge = await deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generates a 43-char base64url verifier that varies each call', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});

describe('resolveRedirectUri (local-dev parity)', () => {
  it('serves production under /share/ and localhost from the root', () => {
    expect(resolveRedirectUri('https://recordseek.com')).toBe('https://recordseek.com/share/');
    expect(resolveRedirectUri('http://localhost:9000')).toBe('http://localhost:9000');
    expect(resolveRedirectUri('http://localhost:9001')).toBe('http://localhost:9001');
  });
});

describe('authorization URL + token exchange', () => {
  it('builds an authorize URL with PKCE params', () => {
    const client = new FamilySearchClient(baseConfig());
    const url = client.buildAuthorizationUrl({ codeChallenge: 'CHAL', state: 'xyz' });
    expect(url).toContain('https://ident.familysearch.org/cis-web/oauth2/v3/authorization?');
    expect(url).toContain('response_type=code');
    expect(url).toContain('client_id=TEST-APP-KEY');
    expect(url).toContain('code_challenge=CHAL');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('state=xyz');
  });

  it('exchanges a code (with verifier) and stores the token', async () => {
    const store = memoryTokenStore(null);
    const { fn, calls } = mockFetch(() => ({ body: JSON.stringify({ access_token: 'tok-123' }) }));
    const client = new FamilySearchClient(baseConfig({ tokenStore: store, fetch: fn }));
    const token = await client.exchangeToken('the-code', 'the-verifier');
    expect(token).toBe('tok-123');
    expect(store.get()).toBe('tok-123');
    expect(String(calls[0]?.init.body)).toContain('grant_type=authorization_code');
    expect(String(calls[0]?.init.body)).toContain('code_verifier=the-verifier');
  });

  it('throws FsApiError on a failed token exchange', async () => {
    const { fn } = mockFetch(() => ({ status: 400, body: '{"error":"invalid_grant"}' }));
    const client = new FamilySearchClient(baseConfig({ tokenStore: memoryTokenStore(null), fetch: fn }));
    await expect(client.exchangeToken('bad')).rejects.toBeInstanceOf(FsApiError);
  });
});

describe('Sentry-bug fixes', () => {
  it('throws a real FsApiError (not silent) when there is no token', async () => {
    const client = new FamilySearchClient(baseConfig({ tokenStore: memoryTokenStore(null) }));
    await expect(client.getCurrentUser()).rejects.toMatchObject({
      name: 'FsApiError',
      message: expect.stringContaining('No authenticated'),
    });
  });

  it('throws FsApiError (not SyntaxError) when an error body is non-JSON HTML', async () => {
    const { fn } = mockFetch(() => ({ status: 401, body: '<html><body>Unauthorized</body></html>' }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    const error = await client.getCurrentUser().catch((e) => e);
    expect(error).toBeInstanceOf(FsApiError);
    expect(error.status).toBe(401);
  });
});

describe('fs-js-lite transport behavior', () => {
  it('posts the token request to the ident host with redirect_uri and a form body', async () => {
    const { fn, calls } = mockFetch(() => ({ body: '{"access_token":"t"}', headers: { 'content-type': 'application/json' } }));
    const client = new FamilySearchClient(baseConfig({ tokenStore: memoryTokenStore(null), fetch: fn }));
    await client.exchangeToken('c');
    expect(calls[0]!.url).toBe(
      'https://ident.familysearch.org/cis-web/oauth2/v3/token?redirect_uri=https://recordseek.com/share/',
    );
    expect(headerOf(calls[0]!.init, 'content-type')).toBe('application/x-www-form-urlencoded');
    expect(calls[0]!.init.method).toBe('POST');
  });

  it('asks the API not to answer with automatic redirects', async () => {
    const { fn, calls } = mockFetch(() => ({ body: '{}' }));
    await new FamilySearchClient(baseConfig({ fetch: fn })).getCurrentUser();
    expect(headerOf(calls[0]!.init, 'x-expect-override')).toBe('200-ok');
  });

  it('rejects network failures with a real non-FsApiError (so they are not treated as auth loss)', async () => {
    const fn = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const error = await new FamilySearchClient(baseConfig({ fetch: fn })).getCurrentUser().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(FsApiError);
  });
});

describe('resources', () => {
  it('reads the current user', async () => {
    const { fn } = mockFetch(() => ({ body: JSON.stringify({ users: [{ id: 'U1', personId: 'P1' }] }) }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    expect(await client.getCurrentUser()).toEqual({ id: 'U1', personId: 'P1' });
  });

  it('creates a source description with GEDCOM-X media type and returns the entity id', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 201, headers: { 'x-entity-id': 'SD-123' }, body: '{}' }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    const id = await client.createSourceDescription({
      about: 'https://example.com/record',
      citation: 'A formatted citation.',
      title: 'A title',
    });
    expect(id).toBe('SD-123');
    expect(headerOf(calls[0]!.init, 'content-type')).toBe('application/x-gedcomx-v1+json');
    expect(headerOf(calls[0]!.init, 'authorization')).toBe('Bearer valid-token');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toEqual({
      sourceDescriptions: [
        {
          about: 'https://example.com/record',
          citations: [{ value: 'A formatted citation.' }],
          titles: [{ value: 'A title' }],
        },
      ],
    });
  });

  it('falls back to the Location header for the new entity id', async () => {
    const { fn } = mockFetch(() => ({
      status: 201,
      headers: { location: 'https://api.familysearch.org/platform/sources/descriptions/SD-77' },
      body: '',
    }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    expect(await client.createSourceDescription({ about: 'https://example.com' })).toBe('SD-77');
  });

  it('files a description into a folder by id', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 204, body: '' }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    await client.addDescriptionToCollection('https://api.familysearch.org/platform/sources/collections/C1/descriptions', 'SD-1');
    expect(calls[0]!.url).toBe('https://api.familysearch.org/platform/sources/collections/C1/descriptions');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ sourceDescriptions: [{ id: 'SD-1' }] });
  });

  it('attaches a person source reference with the correct envelope', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 201, body: '{}' }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    await client.createPersonSourceRef('LZ12-345', {
      descriptionUrl: 'https://api.familysearch.org/platform/sources/descriptions/SD-123',
      tags: ['http://gedcomx.org/Birth'],
      changeMessage: 'Source created by RecordSeek.com',
      contributorId: 'U1',
    });
    expect(calls[0]!.url).toBe('https://api.familysearch.org/platform/tree/persons/LZ12-345');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.persons[0].sources[0].description).toBe(
      'https://api.familysearch.org/platform/sources/descriptions/SD-123',
    );
    expect(body.persons[0].sources[0].tags).toEqual([{ resource: 'http://gedcomx.org/Birth' }]);
    expect(body.persons[0].sources[0].attribution.changeMessage).toBe('Source created by RecordSeek.com');
  });

  it('clears the local token on logout even when the request 401s', async () => {
    const store = memoryTokenStore('valid-token');
    const { fn } = mockFetch(() => ({ status: 401, body: '' }));
    const client = new FamilySearchClient(baseConfig({ tokenStore: store, fetch: fn }));
    await client.logout();
    expect(store.get()).toBeNull();
  });
});

describe('tree read / search / create', () => {
  it('reads a person', async () => {
    const { fn, calls } = mockFetch(() => ({ body: JSON.stringify({ id: 'PID-1', display: { name: 'John' } }) }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    const person = await client.getPerson('PID-1');
    expect(calls[0]!.url).toBe('https://api.familysearch.org/platform/tree/persons/PID-1');
    expect(headerOf(calls[0]!.init, 'accept')).toBe('application/x-gedcomx-v1+json');
    expect(person).toEqual({ id: 'PID-1', display: { name: 'John' } });
  });

  it('searches with q.<field> params, skipping empty fields', async () => {
    const { fn, calls } = mockFetch(() => ({ body: '{"entries":[]}' }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    await client.searchPersons({ givenName: 'John', surname: 'Smith', spouseGivenName: '' }, { count: 15, offset: 30 });
    const url = calls[0]!.url;
    expect(url).toContain('/platform/tree/search?');
    expect(url).toContain('q.givenName=John');
    expect(url).toContain('q.surname=Smith');
    expect(url).not.toContain('spouseGivenName');
    expect(url).toContain('count=15');
    expect(url).toContain('offset=30');
    expect(headerOf(calls[0]!.init, 'accept')).toBe('application/x-gedcomx-atom+json');
  });

  it('creates a person and returns its new entity id', async () => {
    const { fn, calls } = mockFetch(() => ({ status: 201, headers: { 'x-entity-id': 'NEW-PID' }, body: '{}' }));
    const client = new FamilySearchClient(baseConfig({ fetch: fn }));
    const id = await client.createPerson({ names: [{ nameForms: [{ fullText: 'Jane Doe' }] }] });
    expect(id).toBe('NEW-PID');
    expect(calls[0]!.url).toBe('https://api.familysearch.org/platform/tree/persons');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      persons: [{ names: [{ nameForms: [{ fullText: 'Jane Doe' }] }] }],
    });
    expect(headerOf(calls[0]!.init, 'content-type')).toBe('application/x-gedcomx-v1+json');
  });
});

describe('environment-derived hosts (no hardcoded api host)', () => {
  it('uses beta hosts when configured', () => {
    const client = new FamilySearchClient(baseConfig({ environment: 'beta' }));
    expect(client.apiHost).toBe('https://apibeta.familysearch.org');
    expect(client.buildAuthorizationUrl()).toContain('https://identbeta.familysearch.org/');
    expect(client.descriptionUrl('SD-9')).toBe('https://apibeta.familysearch.org/platform/sources/descriptions/SD-9');
  });
});
