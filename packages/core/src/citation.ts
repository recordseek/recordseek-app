/**
 * Pluggable citation engine.
 *
 * Replaces the legacy hardcoded 4-template string-replace chain
 * (app/app/scripts/app.js:281-306) with a single normalized {@link CitationRecord}
 * field model feeding a registry of formatters. Users can switch among
 * academic and genealogical styles; the genealogical default is Evidence
 * Explained.
 *
 * Copyright note: Evidence Explained (Elizabeth Shown Mills) prescribes
 * source-type-specific templates that are themselves copyrighted. We generate
 * citations *structurally* from the record fields following the published
 * patterns — we do not embed EE's verbatim example text.
 */

import { extractDomain } from './url-normalize';

export type SourceType =
  | 'website'
  | 'database'
  | 'census'
  | 'vitalRecord'
  | 'church'
  | 'book'
  | 'gravestone'
  | 'image';

/** Normalized record that drives every formatter (research spec C1). */
export interface CitationRecord {
  sourceType: SourceType;
  author?: string;
  title?: string;
  publisher?: string;
  place?: string;
  date?: string;
  repository?: string;
  url?: string;
  accessedDate?: string;
  // genealogical locators
  page?: string;
  ED?: string;
  sheet?: string;
  dwelling?: string;
  family?: string;
  person?: string;
  // provenance layering (GEDCOM-X SourceCitation model)
  originalData?: string;
  parentSource?: CitationRecord;
}

export type CitationStyle = 'evidenceExplained' | 'chicago' | 'ngsq' | 'mla' | 'apa' | 'harvard';

export const CITATION_STYLES: readonly CitationStyle[] = [
  'evidenceExplained',
  'chicago',
  'ngsq',
  'mla',
  'apa',
  'harvard',
];

export const CITATION_STYLE_LABELS: Record<CitationStyle, string> = {
  evidenceExplained: 'Evidence Explained',
  chicago: 'Chicago (notes)',
  ngsq: 'NGSQ',
  mla: 'MLA',
  apa: 'APA',
  harvard: 'Harvard',
};

export const DEFAULT_CITATION_STYLE: CitationStyle = 'evidenceExplained';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const clean = (s?: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

const joinParts = (parts: Array<string | undefined | null>, sep: string): string =>
  parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0)
    .join(sep);

const withPeriod = (s: string): string => {
  const t = s.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

const endWithPeriod = (s: string): string => (s && !/[.]$/.test(s) ? `${s}.` : s);

// ---------------------------------------------------------------------------
// academic styles
// ---------------------------------------------------------------------------

function formatMla(r: CitationRecord): string {
  return joinParts(
    [
      clean(r.author) ? withPeriod(clean(r.author)) : '',
      clean(r.title) ? `"${withPeriod(clean(r.title))}"` : '',
      clean(r.publisher) ? `${clean(r.publisher)},` : '',
      clean(r.date) ? `${clean(r.date)},` : '',
      clean(r.url) ? withPeriod(clean(r.url)) : '',
      clean(r.accessedDate) ? `Accessed ${withPeriod(clean(r.accessedDate))}` : '',
    ],
    ' ',
  );
}

function formatApa(r: CitationRecord): string {
  return joinParts(
    [
      clean(r.author) ? withPeriod(clean(r.author)) : '',
      clean(r.date) ? `(${clean(r.date)}).` : '',
      clean(r.title) ? withPeriod(clean(r.title)) : '',
      clean(r.publisher) ? withPeriod(clean(r.publisher)) : '',
      clean(r.url),
    ],
    ' ',
  );
}

function formatHarvard(r: CitationRecord): string {
  const head = joinParts([clean(r.author), clean(r.date)], ' ');
  const body = joinParts(
    [
      head,
      clean(r.title),
      clean(r.publisher),
      clean(r.place),
      clean(r.accessedDate) ? `viewed ${clean(r.accessedDate)}` : '',
    ],
    ', ',
  );
  const url = clean(r.url) ? `<${clean(r.url)}>` : '';
  return endWithPeriod(joinParts([body, url], ', '));
}

/** Shared "(Place: Publisher, Date)" imprint for Chicago/NGSQ. */
function imprint(r: CitationRecord): string {
  const place = clean(r.place);
  const publisher = clean(r.publisher);
  const date = clean(r.date);
  let inner = '';
  if (place && publisher) inner = `${place}: ${publisher}`;
  else inner = publisher || place;
  if (date) inner = inner ? `${inner}, ${date}` : date;
  return inner ? `(${inner})` : '';
}

function formatChicago(r: CitationRecord): string {
  const head = joinParts([clean(r.author) ? `${clean(r.author)},` : '', clean(r.title)], ' ');
  const tail = joinParts([imprint(r), clean(r.page), clean(r.url)], ', ');
  return endWithPeriod(joinParts([head, tail], ', '));
}

function formatNgsq(r: CitationRecord): string {
  const head = joinParts([clean(r.author) ? `${clean(r.author)},` : '', clean(r.title)], ' ');
  const onlineBase = joinParts([clean(r.repository) || clean(r.publisher), clean(r.url)], ', ');
  const online = clean(r.accessedDate)
    ? joinParts([onlineBase, `accessed ${clean(r.accessedDate)}`], ' : ')
    : onlineBase;
  let s = joinParts([head, imprint(r)], ' ');
  if (online) s = s ? `${s}; ${online}` : online;
  return endWithPeriod(s);
}

// ---------------------------------------------------------------------------
// Evidence Explained (source-type specific, structural)
// ---------------------------------------------------------------------------

function eeOnline(r: CitationRecord): string {
  return clean(r.accessedDate)
    ? joinParts([clean(r.url), `accessed ${clean(r.accessedDate)}`], ' : ')
    : clean(r.url);
}

function formatEeGeneric(r: CitationRecord): string {
  const head = joinParts(
    [clean(r.author) ? `${clean(r.author)},` : '', clean(r.title) ? `"${clean(r.title)},"` : ''],
    ' ',
  );
  const pubPlace = joinParts([clean(r.publisher), clean(r.place)], ', ');
  const body = joinParts([pubPlace, clean(r.date) ? `(${clean(r.date)})` : ''], ' ');
  const online = joinParts([clean(r.repository), eeOnline(r)], ', ');
  let s = joinParts([head, body], ' ');
  if (online) s = s ? `${s}; ${online}` : online;
  return endWithPeriod(s);
}

function formatEeCensus(r: CitationRecord): string {
  const head = joinParts(
    [
      clean(r.date) ? `${clean(r.date)} U.S. census` : 'U.S. census',
      clean(r.place),
      clean(r.ED) ? `ED ${clean(r.ED)}` : '',
      clean(r.sheet) ? `sheet ${clean(r.sheet)}` : '',
      clean(r.dwelling) ? `dwelling ${clean(r.dwelling)}` : '',
      clean(r.family) ? `family ${clean(r.family)}` : '',
      clean(r.person),
    ],
    ', ',
  );
  const credit = clean(r.publisher) || clean(r.repository);
  const online = eeOnline(r);
  const tail = credit ? `${credit} (${online})` : online ? `(${online})` : '';
  return endWithPeriod(tail ? `${head}; ${tail}` : head);
}

function formatEeGravestone(r: CitationRecord): string {
  const head = joinParts(
    [clean(r.person) ? `${clean(r.person)} memorial` : clean(r.title), clean(r.place)],
    ', ',
  );
  const credit = clean(r.publisher) || clean(r.repository);
  const online = eeOnline(r);
  const tail = credit ? `${credit} (${online})` : online ? `(${online})` : '';
  return endWithPeriod(tail ? `${head}; ${tail}` : head);
}

function formatEvidenceExplained(r: CitationRecord): string {
  switch (r.sourceType) {
    case 'census':
      return formatEeCensus(r);
    case 'gravestone':
      return formatEeGravestone(r);
    default:
      return formatEeGeneric(r);
  }
}

// ---------------------------------------------------------------------------
// registry + public API
// ---------------------------------------------------------------------------

const FORMATTERS: Record<CitationStyle, (r: CitationRecord) => string> = {
  evidenceExplained: formatEvidenceExplained,
  chicago: formatChicago,
  ngsq: formatNgsq,
  mla: formatMla,
  apa: formatApa,
  harvard: formatHarvard,
};

export function formatCitation(record: CitationRecord, style: CitationStyle = DEFAULT_CITATION_STYLE): string {
  const formatter = FORMATTERS[style] ?? FORMATTERS[DEFAULT_CITATION_STYLE];
  return formatter(record);
}

/**
 * The machine target POSTed to FamilySearch as
 * `sourceDescriptions[].citations[].value` (research spec C2 #7).
 */
export function toGedcomxSourceCitation(
  record: CitationRecord,
  style: CitationStyle = DEFAULT_CITATION_STYLE,
): { value: string } {
  return { value: formatCitation(record, style) };
}

// ---------------------------------------------------------------------------
// title / publisher derivation (fixes the legacy last-segment mis-split)
// ---------------------------------------------------------------------------

const KNOWN_PUBLISHERS: ReadonlyArray<readonly [string, string]> = [
  ['ancestry.com', 'Ancestry'],
  ['familysearch.org', 'FamilySearch'],
  ['findagrave.com', 'Find a Grave'],
  ['billiongraves.com', 'BillionGraves'],
  ['newspapers.com', 'Newspapers.com'],
  ['fold3.com', 'Fold3'],
  ['myheritage.com', 'MyHeritage'],
  ['waveapps.com', 'Wave'],
];

function hostOf(url: string): string {
  const afterProtocol = url.split('//')[1];
  if (!afterProtocol) return '';
  const host = afterProtocol.split('/')[0] ?? '';
  return host.replace(/^www\./, '').toLowerCase();
}

function registrableLabel(host: string): string {
  if (!host) return '';
  const labels = (host.split(':')[0] ?? '').split('.');
  const n = labels.length;
  const label = n >= 2 ? labels[n - 2] : labels[0];
  return label ?? '';
}

function publisherFromDomain(url: string): string {
  const host = hostOf(url);
  if (!host) return '';
  for (const [domain, name] of KNOWN_PUBLISHERS) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  const label = registrableLabel(host);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

/** Strong, space-aware separators only — a word-internal hyphen never splits. */
const TITLE_SEPARATOR = /\s+[|•·–—]\s+|\s+-\s+|\s+;\s+/;

function cleanTitle(rawTitle: string, url: string, publisher: string): string {
  let title = (rawTitle ?? '').replace(/"/g, "'").trim();
  if (url && title.includes(url)) {
    title = title.replace(url, '').trim();
  }
  if (!title) return '';

  const segments = title.split(TITLE_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) return title;

  const domainLabel = registrableLabel(hostOf(url)).toLowerCase();
  const pub = publisher.toLowerCase();
  const isSiteName = (segment: string): boolean => {
    const s = segment.toLowerCase();
    return (pub.length > 0 && s.includes(pub)) || (domainLabel.length > 0 && s.includes(domainLabel));
  };

  // Strip trailing "— Site Name" segments only; keep the original string if
  // nothing site-like trails (so e.g. "Wave • … • Invoice Datafutures-24"
  // stays intact while "John Smith - Ancestry.com" loses its suffix).
  let end = segments.length;
  while (end > 1 && isSiteName(segments[end - 1] ?? '')) end -= 1;
  if (end === segments.length) return title;
  return segments.slice(0, end).join(' — ');
}

export interface SourceMetadata {
  title: string;
  publisher: string;
  domain: string;
}

/**
 * Derive a clean title + publisher + display domain from a captured page's
 * raw title and URL. Publisher comes from the domain (reliable) rather than
 * the last title segment (the legacy bug), and the title is only trimmed when
 * a trailing segment is clearly the site name.
 */
export function deriveSourceMetadata(input: { url?: string | null; title?: string | null }): SourceMetadata {
  const url = clean(input.url);
  const publisher = publisherFromDomain(url);
  return {
    title: cleanTitle(input.title ?? '', url, publisher),
    publisher,
    domain: extractDomain(url),
  };
}
