import { describe, it, expect } from 'vitest';
import {
  accountHash,
  fsDistinctId,
  sanitizeEvent,
  sanitizeUrl,
  sanitizeReferrer,
  track,
  sanitizeHost,
  sanitizePartner,
  sanitizeSdkVersion,
  planAttribution,
  setCaptureAttribution,
  deployEnv,
  sanitizeClientVersion,
  planClient,
  setCaptureClient,
} from './analytics';

describe('analytics sanitizer', () => {
  it('strips the query string, keeps the hash route', () => {
    expect(sanitizeUrl('https://recordseek.com/share/?_=1&url=https%3A%2F%2Fx.com%2Fa&notes=secret#/fs-search')).toBe(
      'https://recordseek.com/share/#/fs-search',
    );
  });

  it('drops anything after ? in the hash and normalizes #!/', () => {
    expect(sanitizeUrl('https://recordseek.com/share/#/fs-results?code=abc')).toBe('https://recordseek.com/share/#/fs-results');
    expect(sanitizeUrl('https://recordseek.com/share/?url=x#!/fs-source')).toBe('https://recordseek.com/share/#/fs-source');
  });

  it('drops non-route fragments such as tokens', () => {
    expect(sanitizeUrl('https://recordseek.com/share/#access_token=abc&x=1')).toBe('https://recordseek.com/share/');
  });

  it('handles unparsable input without leaking a query', () => {
    expect(sanitizeUrl('not a url?code=1#/x')).toBe('not a url');
  });

  it('reduces referrers to origin', () => {
    expect(sanitizeReferrer('https://www.familysearch.org/auth?code=abc#x')).toBe('https://www.familysearch.org');
    expect(sanitizeReferrer('$direct')).toBe('$direct');
  });

  it('rewrites event properties, $pathname, $set and $set_once', () => {
    const event = sanitizeEvent({
      properties: {
        $current_url: 'https://recordseek.com/share/?url=https%3A%2F%2Fa.com&title=Jane#/citation?x=1',
        $pathname: '/share/',
        $referrer: 'https://example.com/page?q=secret',
        $initial_referrer: 'https://example.com/other?q=1',
        $referring_domain: 'example.com',
        $prev_pageview_pathname: '/share/',
        other: 'keep?me',
      },
      $set: { $current_url: 'https://recordseek.com/share/?code=1' },
      $set_once: {
        $initial_current_url: 'https://recordseek.com/share/?code=1#/fs-source?y=2',
        $initial_pathname: '/share/',
        $initial_referrer: 'https://example.com/z?k=v',
      },
    });
    expect(event?.properties).toMatchObject({
      $current_url: 'https://recordseek.com/share/#/citation',
      $pathname: '/share/#/citation',
      $referrer: 'https://example.com',
      $initial_referrer: 'https://example.com',
      $referring_domain: 'example.com',
      other: 'keep?me',
    });
    expect(event?.$set?.$current_url).toBe('https://recordseek.com/share/');
    expect(event?.$set_once).toEqual({
      $initial_current_url: 'https://recordseek.com/share/#/fs-source',
      $initial_pathname: '/share/',
      $initial_referrer: 'https://example.com',
    });
  });

  it('passes null through and track is a no-op before init', () => {
    expect(sanitizeEvent(null)).toBeNull();
    expect(() => track('x', { a: 1 })).not.toThrow();
  });
});

describe('fsDistinctId', () => {
  it('is a stable, prefixed hash that does not contain the FamilySearch id', async () => {
    const a = await fsDistinctId('cis.user.MMMM-ABCD');
    expect(a).toMatch(/^fs_[0-9a-f]{32}$/);
    expect(a).not.toContain('MMMM');
    expect(await fsDistinctId('cis.user.MMMM-ABCD')).toBe(a);
    expect(await fsDistinctId('cis.user.OTHER-USER')).not.toBe(a);
  });
});

describe('accountHash', () => {
  it('matches fsDistinctId for FamilySearch and is prefixed and separated per provider', async () => {
    expect(await accountHash('fs', 'cis.user.MMMM-ABCD')).toBe(await fsDistinctId('cis.user.MMMM-ABCD'));
    const geni = await accountHash('geni', '123');
    expect(geni).toMatch(/^geni_[0-9a-f]{32}$/);
    expect(await accountHash('zotero', '123')).toMatch(/^zotero_[0-9a-f]{32}$/);
    expect(geni.slice(5)).not.toBe((await accountHash('zotero', '123')).slice(7));
  });
});

describe('capture attribution', () => {
  it('accepts only bare hostnames', () => {
    expect(sanitizeHost('Example.COM')).toBe('example.com');
    expect(sanitizeHost('www.example.com')).toBe('example.com');
    expect(sanitizeHost('https://example.com')).toBe('');
    expect(sanitizeHost('example.com/path')).toBe('');
    expect(sanitizeHost('example.com:8080')).toBe('');
    expect(sanitizeHost('user@example.com')).toBe('');
    expect(sanitizeHost('')).toBe('');
  });

  it('limits partner ids and versions', () => {
    expect(sanitizePartner('acme-genealogy_2.0')).toBe('acme-genealogy_2.0');
    expect(sanitizePartner('bad partner')).toBe('');
    expect(sanitizePartner('<x>')).toBe('');
    expect(sanitizePartner('a'.repeat(65))).toBe('');
    expect(sanitizeSdkVersion('1.2.3')).toBe('1.2.3');
    expect(sanitizeSdkVersion('1.2.3-beta.1')).toBe('1.2.3-beta.1');
    expect(sanitizeSdkVersion('v1')).toBe('');
  });

  it('registers sdk attribution and clears the rest', () => {
    expect(planAttribution({ entry: 'sdk', host: 'example.com', partner: 'acme', sdkVersion: '1.0.0' })).toEqual({
      register: { capture_entry: 'sdk', referrer_host: 'example.com', referrer_partner: 'acme', sdk_version: '1.0.0' },
      unregister: [],
    });
    expect(planAttribution({ entry: 'sdk', host: 'http://bad', partner: 'no good' })).toEqual({
      register: { capture_entry: 'sdk' },
      unregister: ['referrer_host', 'referrer_partner', 'sdk_version'],
    });
  });

  it('clears everything for a non-SDK capture', () => {
    const all = ['capture_entry', 'referrer_host', 'referrer_partner', 'sdk_version'];
    expect(planAttribution({ entry: 'extension' })).toEqual({ register: {}, unregister: all });
    expect(planAttribution(null)).toEqual({ register: {}, unregister: all });
  });

  it('is a no-op before analytics is initialized', () => {
    expect(() => setCaptureAttribution({ entry: 'sdk', host: 'example.com' })).not.toThrow();
  });
});

describe('deployEnv', () => {
  it('maps hostnames to an environment', () => {
    expect(deployEnv('recordseek.com')).toBe('production');
    expect(deployEnv('www.recordseek.com')).toBe('production');
    expect(deployEnv('recordseek.github.io')).toBe('stage');
    expect(deployEnv('localhost')).toBe('development');
    expect(deployEnv('127.0.0.1')).toBe('development');
    expect(deployEnv('mybox.local')).toBe('development');
  });

  it('falls back to the bare host, then unknown', () => {
    expect(deployEnv('example.org')).toBe('example.org');
    expect(deployEnv('')).toBe('unknown');
  });
});

describe('capture client (version + type)', () => {
  it('accepts a short version-ish string only', () => {
    expect(sanitizeClientVersion('3.2.1')).toBe('3.2.1');
    expect(sanitizeClientVersion('1.0.0-beta+5')).toBe('1.0.0-beta+5');
    expect(sanitizeClientVersion('a space')).toBe('');
    expect(sanitizeClientVersion('<x>')).toBe('');
    expect(sanitizeClientVersion('v'.repeat(40))).toBe('');
    expect(sanitizeClientVersion(42)).toBe('');
  });

  it('registers the client type and version, clearing a missing version', () => {
    expect(planClient({ type: 'chrome_extension', version: '2.4.0' })).toEqual({
      register: { capture_client: 'chrome_extension', capture_client_version: '2.4.0' },
      unregister: [],
    });
    // A client with no (or junk) version clears the version key so a prior one does not linger.
    expect(planClient({ type: 'ios_app', version: 'bad ver' })).toEqual({
      register: { capture_client: 'ios_app' },
      unregister: ['capture_client_version'],
    });
  });

  it('clears both keys when there is no client', () => {
    const both = ['capture_client', 'capture_client_version'];
    expect(planClient({ type: '' })).toEqual({ register: {}, unregister: both });
    expect(planClient(null)).toEqual({ register: {}, unregister: both });
  });

  it('is a no-op before analytics is initialized', () => {
    expect(() => setCaptureClient({ type: 'safari_extension', version: '1.0.0' })).not.toThrow();
  });
});
