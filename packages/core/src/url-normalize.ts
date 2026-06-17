/**
 * URL canonicalization for captured source links.
 *
 * Framework-agnostic port of the URL-cleanup logic in
 * legacy app/app/scripts/app.js:492-601. Each transform is a pure function so
 * it can be unit-tested in isolation. Behavior is preserved for the inputs the
 * extension produces; malformed input is handled defensively instead of
 * throwing.
 *
 * NOTE: title/publisher derivation (legacy app.js:551-580) intentionally lives
 * with the citation engine, not here — "publisher" is a CitationRecord field,
 * and the legacy last-segment split mis-handles titles like
 * "Wave • SimpleRain, Inc. • Invoice Datafutures-24" (splits on the hyphen).
 */

/** Whitelisted params kept when cleaning an Ancestry search/record URL. */
const ANCESTRY_KEEP_ORDER: readonly string[] = ['h', '_phsrc', 'pid'];

/** Ancestry access-variant hosts that should collapse to ancestry.com. */
const ANCESTRY_HOST_ALIASES: readonly string[] = [
  'ancestryinstitution.com',
  'ancestrylibrary.proquest.com',
  'ancestrylibrary.com',
  'ancestryclassroom.com',
];

/** BillionGraves URLs carry a client-side hash route that is not part of the source. */
export function stripBilliongravesHash(url: string): string {
  if (url.includes('billiongraves.com')) {
    return url.split('#')[0] ?? url;
  }
  return url;
}

/** Collapse Ancestry library/institution/classroom hostnames to the canonical ancestry.com. */
export function normalizeAncestryHost(url: string): string {
  if (!url.includes('ancestry')) {
    return url;
  }
  let out = url;
  for (const alias of ANCESTRY_HOST_ALIASES) {
    out = out.replaceAll(alias, 'ancestry.com');
  }
  return out;
}

function splitOffQuery(url: string): { base: string; query: string } {
  const hashless = url.split('#')[0] ?? url;
  const qIdx = hashless.indexOf('?');
  if (qIdx === -1) {
    return { base: hashless, query: '' };
  }
  return { base: hashless.slice(0, qIdx), query: hashless.slice(qIdx + 1) };
}

/**
 * Strip the noisy query string off an Ancestry search/record URL, keeping only
 * the params that identify the record: `indiv=try`, the db key (`dbid` or
 * `db`), and `h`/`_phsrc`/`pid` when present.
 */
export function cleanAncestrySearchUrl(url: string): string {
  if (!(url.includes('www.ancestry.') || url.includes('search.ancestry.'))) {
    return url;
  }
  const { base, query } = splitOffQuery(url);
  const params = new URLSearchParams(query);

  const out = new URLSearchParams();
  out.set('indiv', 'try');
  for (const key of ANCESTRY_KEEP_ORDER) {
    const value = params.get(key);
    if (value) {
      out.set(key, value);
    }
  }
  const dbKey = params.get('dbid') ? 'dbid' : 'db';
  const dbValue = params.get(dbKey);
  if (dbValue) {
    out.set(dbKey, dbValue);
  }

  const qs = out.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Full canonicalization pipeline applied to a captured source URL. */
export function normalizeUrl(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  let out = stripBilliongravesHash(url);
  out = normalizeAncestryHost(out);
  out = cleanAncestrySearchUrl(out);
  return out;
}

/**
 * Human-readable, capitalized host label for a URL
 * (e.g. "https://www.ancestry.com/x" -> "Ancestry.com"). Returns '' when no
 * host can be parsed. Port of app.js:587-593.
 */
export function extractDomain(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  const afterProtocol = url.split('//')[1];
  if (!afterProtocol) {
    return '';
  }
  const host = (afterProtocol.replace('www.', '').split('/')[0] ?? '').trim();
  if (!host) {
    return '';
  }
  return host.charAt(0).toUpperCase() + host.slice(1);
}
