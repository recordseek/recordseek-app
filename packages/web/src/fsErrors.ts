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

/**
 * FamilySearch's own detail for a failed API call, as flat, bounded fields for
 * Sentry. Every recent tree-write bug (RECORDSEEK-EZ/EX/F0/EV/F2) surfaced as
 * the same opaque `FsApiError` message, so the status plus FS's parsed
 * `errors[0]` (code/label/message) is what lets one 400 be told from another
 * without guesswork. Messages are capped and no request body is included.
 */
export function fsErrorContext(err: unknown): Record<string, unknown> {
  if (!(err instanceof FsApiError)) return {};
  const ctx: Record<string, unknown> = { fsStatus: err.status };
  try {
    const parsed = JSON.parse(err.body) as {
      errors?: Array<{ code?: unknown; label?: unknown; message?: unknown }>;
    };
    const first = parsed?.errors?.[0];
    if (first) {
      if (first.code != null) ctx.fsCode = first.code;
      if (typeof first.label === 'string') ctx.fsLabel = first.label.slice(0, 120);
      if (typeof first.message === 'string') ctx.fsMessage = first.message.slice(0, 200);
    }
  } catch {
    // Body wasn't JSON; a short snippet of it still helps triage.
    if (err.body) ctx.fsBodySnippet = err.body.slice(0, 200);
  }
  return ctx;
}

/** Report only failures that may be our bug: not sign-in expiry, not outages. */
export function reportFsError(err: unknown, context?: Record<string, unknown>): void {
  if (isFsAuthError(err) || isTransientFsError(err)) return;
  reportError(err, { ...fsErrorContext(err), ...context });
}
