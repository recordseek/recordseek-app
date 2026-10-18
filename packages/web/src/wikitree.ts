/** WikiTree has no write API, so this screen only formats text and opens the edit page. */

/** WikiTree IDs look like Smith-123 (surname, hyphen, number). */
const WIKITREE_ID = /^[A-Za-z' -]+-\d+$/;

export function isValidWikiTreeId(id: string): boolean {
  return WIKITREE_ID.test(id.trim());
}

export function wikiTreeEditUrl(id: string): string {
  return `https://www.wikitree.com/index.php?title=Special:EditPerson&w=${encodeURIComponent(id.trim())}`;
}

/** A `<ref>` block: the citation text plus a `[url title]` wiki link. */
export function wikiTreeRef(citation: string, url: string, title: string): string {
  // "[" and "]" would break the wiki link early; newlines would break the one-line ref.
  const label = title.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim();
  const link = url ? `[${url}${label ? ` ${label}` : ''}]` : '';
  const text = citation.replace(/\s+/g, ' ').trim();
  return `<ref>${[text, link].filter(Boolean).join(' ')}</ref>`;
}
