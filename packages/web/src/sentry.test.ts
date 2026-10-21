import { describe, it, expect } from 'vitest';
import type { ErrorEvent } from '@sentry/react';
import { thirdPartyFetchNoiseHost } from './sentry';

const SELF = 'recordseek.com';

function failedToFetch(value: string, breadcrumbUrl?: string): ErrorEvent {
  return {
    exception: { values: [{ type: 'TypeError', value }] },
    breadcrumbs: breadcrumbUrl ? [{ category: 'fetch', data: { url: breadcrumbUrl } }] : undefined,
  } as unknown as ErrorEvent;
}

describe('thirdPartyFetchNoiseHost', () => {
  it('flags a blocked analytics beacon (host in the message)', () => {
    const e = failedToFetch('Failed to fetch (d3ipkij04uno1k.cloudfront.net)');
    expect(thirdPartyFetchNoiseHost(e, SELF)).toBe('d3ipkij04uno1k.cloudfront.net');
  });

  it('flags a bare "Failed to fetch" via the fetch breadcrumb URL', () => {
    const e = failedToFetch('Failed to fetch', 'https://us.i.posthog.com/c');
    expect(thirdPartyFetchNoiseHost(e, SELF)).toBe('us.i.posthog.com');
  });

  it('keeps a FamilySearch fetch failure', () => {
    const e = failedToFetch('Failed to fetch (api.familysearch.org)');
    expect(thirdPartyFetchNoiseHost(e, SELF)).toBe('');
  });

  it('keeps a failure on our own origin', () => {
    const e = failedToFetch('Failed to fetch (recordseek.com)');
    expect(thirdPartyFetchNoiseHost(e, SELF)).toBe('');
  });

  it('ignores errors that are not "Failed to fetch"', () => {
    const e = {
      exception: { values: [{ type: 'ReferenceError', value: 'x is not defined' }] },
    } as unknown as ErrorEvent;
    expect(thirdPartyFetchNoiseHost(e, SELF)).toBe('');
  });

  it('keeps a "Failed to fetch" with no discoverable host', () => {
    const e = failedToFetch('Failed to fetch');
    expect(thirdPartyFetchNoiseHost(e, SELF)).toBe('');
  });
});
