import europeana from './europeana.js';
import digitalnz from './digitalnz.js';
import dpla from './dpla.js';
import trove from './trove.js';

/** Each provider: { name, keyEnv, match(url) -> id|null, fetch(id, {fetch, key}) -> record }. */
export const PROVIDERS = [europeana, digitalnz, dpla, trove];

export function detect(url) {
  for (const provider of PROVIDERS) {
    const id = provider.match(url);
    if (id) return { provider, id };
  }
  return null;
}
