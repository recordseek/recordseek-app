import { generateCodeVerifier, deriveCodeChallenge, FsApiError } from '@recordseek/core';
import { createFsClient, getFsConfig } from './auth/fsClient';

const VERIFIER_KEY = 'fs_pkce_verifier';
const RETURN_ROUTE_KEY = 'fs_return_route';

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
  window.location.href = client.buildAuthorizationUrl({ codeChallenge, state: 'recordseek' });
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
}

/**
 * If the current URL carries an OAuth `?code`, exchange it for a token and
 * return the route to resume. Returns null when there is no code.
 */
export async function completeFsLogin(): Promise<string | null> {
  const code = new URLSearchParams(window.location.search).get('code');
  if (!code) {
    return null;
  }
  const store = session();
  const verifier = store?.getItem(VERIFIER_KEY) ?? undefined;
  const route = store?.getItem(RETURN_ROUTE_KEY) ?? '/fs-source';
  await createFsClient().exchangeToken(code, verifier);
  store?.removeItem(VERIFIER_KEY);
  store?.removeItem(RETURN_ROUTE_KEY);
  return route;
}
