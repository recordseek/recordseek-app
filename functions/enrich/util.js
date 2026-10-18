export const TIMEOUT_MS = 6000;

export class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export class NotFoundError extends Error {}

/** GET JSON with a hard timeout. 404 -> NotFoundError, anything else bad -> UpstreamError. */
export async function getJson(fetchFn, url, headers = {}) {
  let res;
  try {
    res = await fetchFn(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'RecordSeek-enrich/1.0', ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new UpstreamError(e?.name === 'TimeoutError' ? 'upstream timeout' : 'upstream unreachable');
  }
  if (res.status === 404) throw new NotFoundError('not found');
  if (!res.ok) throw new UpstreamError(`upstream HTTP ${res.status}`, res.status);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError('upstream returned invalid JSON');
  }
}

export const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (typeof v === 'number') return String(v);
  return '';
}

/** Unique, non-empty strings from a scalar-or-array. */
export function strs(v) {
  return [...new Set(arr(v).map(str).filter(Boolean))];
}

export const isUri = (s) => /^(https?:\/\/|urn:)/i.test(s);

export function clip(text, max = 500) {
  const t = str(text);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Blank record with every field present, so consumers get a stable shape. */
export function emptyRecord() {
  return {
    title: '',
    creator: [],
    date: '',
    place: '',
    publisher: '',
    repository: '',
    collection: '',
    sourceType: 'database',
    recordType: '',
    language: '',
    rights: '',
    identifier: '',
    permalink: '',
    thumbnail: '',
    description: '',
  };
}
