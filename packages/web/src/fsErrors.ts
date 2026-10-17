import { FsApiError, FsNetworkError } from '@recordseek/core';
import { reportError } from './sentry';
import { isFsAuthError } from './fsAuth';

function statusOf(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Failures that are FamilySearch's or the network's, not ours: offline,
 * timeouts, rate limits and outages. Worth a retry, not worth a Sentry event.
 */
export function isTransientFsError(err: unknown): boolean {
  if (err instanceof FsNetworkError) return true;
  const status = statusOf(err);
  return status === 429 || (status !== null && status >= 500);
}

/** A plain-language message for a FamilySearch failure, without HTTP jargon. */
export function describeFsError(err: unknown): string {
  if (err instanceof FsNetworkError) {
    return err.timedOut
      ? 'FamilySearch is taking too long to respond. Check your internet connection and try again.'
      : "Couldn't reach FamilySearch. Check your internet connection and try again.";
  }
  const status = statusOf(err);
  if (err instanceof FsApiError || status !== null) {
    if (status === 401 || status === 0) return 'Your FamilySearch sign-in has expired. Please sign in again.';
    if (status === 403) return "FamilySearch didn't allow this for your account.";
    if (status === 429) return 'FamilySearch is busy right now. Wait a minute and try again.';
    if (status !== null && status >= 500) {
      return 'FamilySearch is having trouble right now. Try again in a few minutes.';
    }
    return `FamilySearch couldn't complete the request (error ${status ?? 'unknown'}).`;
  }
  return err instanceof Error && err.message ? err.message : 'Something went wrong.';
}

/** Report only failures that may be our bug: not sign-in expiry, not outages. */
export function reportFsError(err: unknown, context?: Record<string, unknown>): void {
  if (isFsAuthError(err) || isTransientFsError(err)) return;
  reportError(err, context);
}
