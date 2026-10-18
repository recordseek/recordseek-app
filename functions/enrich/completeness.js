/** Source types where a missing creator still leaves the citation incomplete. */
export const CREATOR_MATTERS = new Set(['book', 'image', 'website']);

const has = (v) => (Array.isArray(v) ? v.some((x) => String(x ?? '').trim()) : String(v ?? '').trim() !== '');

/**
 * Should the server be asked to enrich this captured record?
 * True only when title, date or repository/publisher is missing, or when
 * creator is missing for source types where it matters (book, image, website).
 * Accepts `creator` (array or string) or CitationRecord's `author`.
 * Pure; the share app copies this rule.
 */
export function needsEnrichment(record) {
  const r = record ?? {};
  if (!has(r.title) || !has(r.date)) return true;
  if (!has(r.repository) && !has(r.publisher)) return true;
  if (CREATOR_MATTERS.has(r.sourceType) && !has(r.creator) && !has(r.author)) return true;
  return false;
}
