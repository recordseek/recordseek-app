const APP_KEY = 'rs_app';

// Per-tab (sessionStorage): it survives the same-tab sign-in redirects but never
// leaks into another visit, matching devFlag.
function readFlag(): string | null {
  try {
    return sessionStorage.getItem(APP_KEY);
  } catch {
    return null;
  }
}
function writeFlag(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(APP_KEY, '1');
    else sessionStorage.removeItem(APP_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** `app` from the query string or from the hash route's query (`#/?app=ios`). */
function requestedFlag(): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get('app');
  if (fromSearch !== null) return fromSearch;
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  return q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('app');
}

/**
 * True when the page runs inside a RecordSeek native app wrapper, which opens
 * the site with an `app=` marker (e.g. `app=ios`). Remembered for the tab so it
 * survives the Geni/Zotero/FamilySearch sign-in round-trips, which drop the
 * query. Used to hide anything that must not appear inside the app — notably the
 * PayPal donation link, which App Store guideline 3.1.1 forbids outside of
 * In-App Purchase. Donations stay available on the website. `app=0` turns it off.
 */
export function isNativeApp(): boolean {
  const requested = requestedFlag();
  if (requested !== null && requested !== '' && requested !== '0') writeFlag(true);
  else if (requested === '0') writeFlag(false);
  return readFlag() === '1';
}
