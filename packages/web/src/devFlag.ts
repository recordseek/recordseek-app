const DEV_KEY = 'rs_dev';

function readFlag(): string | null {
  try {
    return localStorage.getItem(DEV_KEY);
  } catch {
    return null;
  }
}
function writeFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(DEV_KEY, '1');
    else localStorage.removeItem(DEV_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** `dev` from the query string or from the hash route's query (`#/?dev=1`). */
function requestedFlag(): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get('dev');
  if (fromSearch !== null) return fromSearch;
  const hash = window.location.hash;
  const q = hash.indexOf('?');
  return q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('dev');
}

/**
 * Hidden-feature switch. `dev=1` in the URL turns it on and remembers it (so it
 * survives the Geni/Zotero sign-in round-trips, which drop the query); `dev=0`
 * turns it off.
 */
export function isDevMode(): boolean {
  const requested = requestedFlag();
  if (requested === '1') writeFlag(true);
  else if (requested === '0') writeFlag(false);
  return readFlag() === '1';
}
