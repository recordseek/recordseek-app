import { generateCodeVerifier, deriveCodeChallenge, FsApiError, FsNetworkError } from '@recordseek/core';
import { identifyFsUser, resetAnalytics, track } from './analytics';
import { createFsClient, getFsConfig } from './auth/fsClient';

const VERIFIER_KEY = 'fs_pkce_verifier';
const RETURN_ROUTE_KEY = 'fs_return_route';
const UID_KEY = 'rs_fs_uid';

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isFsAuthenticated(): boolean {
  try {
    const token = createFsClient().getAccessToken();
    return typeof token === 'string' && token.length > 0 && token !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Start the FamilySearch OAuth (PKCE) login. Saves the verifier + the route to
 * resume afterwards, then redirects to FamilySearch. The captured source is
 * preserved separately (CaptureContext persists it to sessionStorage), so it
 * survives the round-trip.
 */
export async function beginFsLogin(returnRoute: string): Promise<void> {
  const client = createFsClient();
  session()?.setItem(RETURN_ROUTE_KEY, returnRoute);
  let codeChallenge: string | undefined;
  if (getFsConfig().pkce) {
    const verifier = generateCodeVerifier();
    session()?.setItem(VERIFIER_KEY, verifier);
    codeChallenge = await deriveCodeChallenge(verifier);
  } else {
    session()?.removeItem(VERIFIER_KEY);
  }
  // The page is about to navigate away to FamilySearch, so send immediately.
  track('fs_login_started', undefined, { beacon: true });
  window.location.href = client.buildAuthorizationUrl({ codeChallenge, state: 'recordseek' });
}

/** The signed-in user's FamilySearch id cached by fetchFsUser, or null. */
export function getFsUserId(): string | null {
  try {
    return session()?.getItem(UID_KEY) || null;
  } catch {
    return null;
  }
}

export interface FsDisplayUser {
  displayName?: string;
  givenName?: string;
}

/** Fetch the signed-in FamilySearch user's name (best-effort; null on any failure). */
export async function fetchFsUser(): Promise<FsDisplayUser | null> {
  try {
    const user = await createFsClient().getCurrentUser();
    if (!user) {
      return null;
    }
    if (typeof user.id === 'string') {
      void identifyFsUser(user.id);
      // Kept for this tab only, so the newsletter invite can hash it without another call.
      try {
        session()?.setItem(UID_KEY, user.id);
      } catch {
        /* storage unavailable */
      }
    }
    const givenName = typeof user.givenName === 'string' ? user.givenName : undefined;
    return { displayName: user.displayName, givenName };
  } catch {
    return null;
  }
}

/**
 * True when an error means the FamilySearch session is gone — an expired/invalid
 * token (401) or no token at all (status 0). These warrant a transparent re-auth;
 * a 400/500 is a real API error and should surface to the user instead.
 */
export function isFsAuthError(err: unknown): boolean {
  return err instanceof FsApiError && (err.status === 401 || err.status === 0);
}

/** End the FamilySearch session: revoke the token server-side and clear it locally. */
export async function logoutFs(): Promise<void> {
  try {
    await createFsClient().logout();
  } catch {
    // logout() clears the local token even if the network call fails.
  }
  try {
    session()?.removeItem(UID_KEY);
  } catch {
    /* storage unavailable */
  }
  resetAnalytics();
}

/** The route a pending sign-in should resume, for a retry after it failed. */
export function pendingReturnRoute(): string {
  return session()?.getItem(RETURN_ROUTE_KEY) ?? '/fs-source';
}

/**
 * If the current URL carries an OAuth `?code`, exchange it for a token and
 * return the route to resume. Returns null when there is no code.
 */
export async function completeFsLogin(retryDelayMs = 1000): Promise<string | null> {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) {
    return null;
  }
  const store = session();
  const verifier = store?.getItem(VERIFIER_KEY) ?? undefined;
  const route = store?.getItem(RETURN_ROUTE_KEY) ?? '/fs-source';
  const client = createFsClient();
  try {
    await client.exchangeToken(code, verifier);
  } catch (err) {
    // A dropped connection usually means the request never reached FamilySearch,
    // so the single-use code is still good: try once more (RECORDSEEK-F2).
    if (!(err instanceof FsNetworkError)) throw err;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    await client.exchangeToken(code, verifier);
  }
  store?.removeItem(VERIFIER_KEY);
  store?.removeItem(RETURN_ROUTE_KEY);
  return route;
}
