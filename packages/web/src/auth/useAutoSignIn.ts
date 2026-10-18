import { useCallback, useEffect, useState } from 'react';

const key = (provider: string) => `rs_auth_attempted_${provider}`;

function read(provider: string): boolean {
  try {
    return sessionStorage.getItem(key(provider)) === '1';
  } catch {
    return false;
  }
}
function write(provider: string, on: boolean): void {
  try {
    if (on) sessionStorage.setItem(key(provider), '1');
    else sessionStorage.removeItem(key(provider));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Sends a signed-out visitor straight to the provider's sign-in, like the FamilySearch
 * tile. A sessionStorage marker is set before the redirect, so a return without a token
 * (denied, or an error) reports `failed` instead of redirecting again. `suspend` holds the
 * redirect while a returning sign-in is being confirmed.
 */
export function useAutoSignIn(provider: string, authed: boolean, start: () => void, suspend = false) {
  const [attempted, setAttempted] = useState(() => read(provider));
  // True from the moment this page starts the redirect, so the page keeps showing Loading until it unloads.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (authed) {
      write(provider, false);
      setAttempted(false);
      setStarted(false);
      return;
    }
    if (suspend || attempted) return;
    write(provider, true);
    setAttempted(true);
    setStarted(true);
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, suspend, attempted, provider]);

  /** Mark the attempt as used up without redirecting (failed return, or the user signed out). */
  const hold = useCallback(() => {
    write(provider, true);
    setAttempted(true);
    setStarted(false);
  }, [provider]);

  /** Forget the used-up attempt, so the next visit redirects again (the page leaves first). */
  const reset = useCallback(() => write(provider, false), [provider]);

  /** Try again: redirect now. */
  const retry = useCallback(() => {
    write(provider, true);
    setAttempted(true);
    setStarted(true);
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return { authed, redirecting: !authed && !suspend && (!attempted || started), failed: !authed && attempted && !started, hold, retry, reset };
}
