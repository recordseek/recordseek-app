/**
 * Parse a RecordSeek "/share/?..." capture URL (produced by the browser
 * extension) into a plain params object.
 *
 * This is a framework-agnostic port of `RecordSeek.helpers.decodeQueryString`
 * (legacy app/app/scripts/app.js:18-81). Observable behavior is preserved for
 * the inputs the extension actually produces, while three legacy hazards are
 * fixed:
 *   1. The legacy code `decodeURIComponent`-decoded the WHOLE url before
 *      splitting on "&", so a value containing an encoded "&" (%26) was split
 *      apart and corrupted. We split first, then decode each value once.
 *   2. `decodeURIComponent` on malformed input throws a URIError; we decode
 *      defensively and fall back to the raw token.
 *   3. `Object.keys(...)` / null dereferences (a real Sentry class:
 *      "Cannot convert undefined or null to object") are avoided with guards.
 *
 * Behavior kept intentionally identical to the legacy implementation:
 *   - empty values are dropped,
 *   - whitespace is collapsed and trimmed,
 *   - a leaked "#!/route" tail is stripped from a value (OAuth `code` return),
 *   - repeated keys collapse into an array,
 *   - any non-default (extra) params are folded onto the captured `url`.
 */

export type ShareParams = Record<string, string | string[]>;

/**
 * The keys the extension always sends. Anything else in the share URL is an
 * "extra" that gets appended to the captured source `url` (legacy app.js:64).
 */
const DEFAULT_KEYS: readonly string[] = ['_', 'h1', 'citation', 'title', 'e', 'ev', 'tags', 'url', 'notes'];

function safeDecode(token: string): string {
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function encodeParam(key: string, value: string | string[]): string {
  const encKey = encodeURIComponent(key);
  if (Array.isArray(value)) {
    return value.map((v) => `${encKey}=${encodeURIComponent(v)}`).join('&');
  }
  return `${encKey}=${encodeURIComponent(value)}`;
}

/**
 * Build a RecordSeek "/share/?…" capture URL from scraped fields. Inverse of
 * {@link parseShareParams}: empty/nullish values are skipped (matching the
 * legacy extension's open_tab), and each value is percent-encoded.
 */
export function buildShareUrl(
  params: Record<string, string | number | null | undefined>,
  base = 'https://recordseek.com/share/',
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `${base}?${parts.join('&')}` : base;
}

export function parseShareParams(input?: string | null): ShareParams {
  const obj: ShareParams = {};
  if (!input) {
    return obj;
  }

  // Drop the URL fragment (the "#!/fs-source" hashbang route) before parsing
  // the query. Real "#" inside a value is percent-encoded by the extension, so
  // the first literal "#" is always the fragment delimiter.
  const hashIdx = input.indexOf('#');
  const withoutHash = hashIdx === -1 ? input : input.slice(0, hashIdx);

  const queryIdx = withoutHash.indexOf('?');
  if (queryIdx === -1) {
    return obj;
  }

  let query = withoutHash.slice(queryIdx + 1);
  // Some share sources HTML-escape the separator as "&amp;".
  if (query.includes('&amp;')) {
    query = query.replace(/&amp;/g, '&');
  }

  for (const segment of query.split('&')) {
    if (!segment) {
      continue;
    }
    const eq = segment.indexOf('=');
    const key = safeDecode(eq === -1 ? segment : segment.slice(0, eq)).trim();
    if (!key) {
      continue;
    }

    let value = eq === -1 ? '' : safeDecode(segment.slice(eq + 1));
    value = normalizeWhitespace(value);
    if (!value) {
      continue; // legacy drops empty values
    }

    // Strip a leaked hashbang route tail (e.g. "ABC123#!/fs-source" -> "ABC123").
    const bangIdx = value.indexOf('#!');
    if (bangIdx !== -1) {
      value = value.slice(0, bangIdx).trim();
    }
    if (!value) {
      continue;
    }

    const existing = obj[key];
    if (existing === undefined) {
      obj[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      obj[key] = [existing, value];
    }
  }

  // Fold any non-default (extra) params onto the captured url, preserving the
  // legacy behavior that, e.g., genealogy fields carried in the share URL get
  // appended to the source link.
  const url = obj.url;
  if (typeof url === 'string') {
    const extras: string[] = [];
    for (const key of Object.keys(obj)) {
      if (DEFAULT_KEYS.includes(key)) {
        continue;
      }
      const value = obj[key];
      if (value === undefined) {
        continue;
      }
      extras.push(encodeParam(key, value));
    }
    if (extras.length > 0) {
      obj.url = url + (url.includes('?') ? '&' : '?') + extras.join('&');
    }
  }

  return obj;
}
