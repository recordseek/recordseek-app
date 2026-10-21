import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';

/** Query params that must never leave the browser (OAuth code, tokens). */
const SECRET_PARAMS = /([?&#](?:code|access_token|token|code_verifier)=)[^&#]*/gi;

function scrub(url: string | undefined): string | undefined {
  return url?.replace(SECRET_PARAMS, '$1[Filtered]');
}

/**
 * The hosts whose fetch failures are real app errors worth reporting: our own
 * origin and FamilySearch. A `TypeError: Failed to fetch` to anything else is a
 * third-party request (analytics beacons, injected extensions) that the user's
 * network or an ad-blocker dropped — noise, not a bug. Returns the offending
 * host when an event is that noise, or '' when it should be kept.
 */
export function thirdPartyFetchNoiseHost(event: ErrorEvent, selfHost: string): string {
  const values = event.exception?.values;
  const v = values && values[values.length - 1];
  if (!v || v.type !== 'TypeError' || !/^Failed to fetch/.test(v.value ?? '')) return '';
  // Sentry appends the host to the message ("Failed to fetch (host)"); failing
  // that, fall back to the most recent fetch breadcrumb's URL.
  let host = /\(([^)]+)\)\s*$/.exec(v.value ?? '')?.[1] ?? '';
  if (!host) {
    const crumbs = event.breadcrumbs ?? [];
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const url = crumbs[i]?.data?.url;
      if (crumbs[i]?.category === 'fetch' && typeof url === 'string') {
        try {
          host = new URL(url).hostname;
        } catch {
          /* not a parseable URL */
        }
        break;
      }
    }
  }
  if (!host || host === selfHost || /(^|\.)familysearch\.org$/.test(host)) return '';
  return host;
}

/**
 * Error reporting for production builds only (same Sentry project as the legacy
 * app). Off in dev, tests and any build without VITE_SENTRY_DSN.
 */
export function initSentry(): void {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const dsn = env.VITE_SENTRY_DSN;
  if (!env.PROD || typeof dsn !== 'string' || !dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: typeof env.VITE_FS_ENV === 'string' && env.VITE_FS_ENV ? env.VITE_FS_ENV : 'production',
    release: typeof env.VITE_RELEASE === 'string' ? env.VITE_RELEASE : undefined,
    // v11 replaced sendDefaultPii with dataCollection: keep user info, cookies,
    // headers and bodies out of events (the old sendDefaultPii:false behaviour).
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    // Only errors thrown by our own scripts. Extensions and automation inject
    // code that runs as <anonymous> (RECORDSEEK-EY "n0_ is not defined" in injFunc).
    allowUrls: [window.location.origin],
    beforeSend(event) {
      // Drop third-party "Failed to fetch" noise (blocked analytics beacons,
      // injected extension requests); keep our own and FamilySearch failures.
      if (thirdPartyFetchNoiseHost(event, window.location.hostname)) {
        return null;
      }
      if (event.request?.url) {
        event.request.url = scrub(event.request.url);
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.data && typeof crumb.data.url === 'string') {
        crumb.data.url = scrub(crumb.data.url);
      }
      if (crumb.data && typeof crumb.data.to === 'string') {
        crumb.data.to = scrub(crumb.data.to);
      }
      if (crumb.data && typeof crumb.data.from === 'string') {
        crumb.data.from = scrub(crumb.data.from);
      }
      return crumb;
    },
  });
}

/** Report a handled error (one we show the user) so it still reaches Sentry. */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export const ErrorBoundary = Sentry.ErrorBoundary;
