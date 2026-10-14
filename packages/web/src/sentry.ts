import * as Sentry from '@sentry/react';

/** Query params that must never leave the browser (OAuth code, tokens). */
const SECRET_PARAMS = /([?&#](?:code|access_token|token|code_verifier)=)[^&#]*/gi;

function scrub(url: string | undefined): string | undefined {
  return url?.replace(SECRET_PARAMS, '$1[Filtered]');
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
    sendDefaultPii: false,
    beforeSend(event) {
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
