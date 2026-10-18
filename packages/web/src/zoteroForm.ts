import type { ZoteroItem } from './zotero';

/** Item types that suit genealogy sources (about ten, as Zotero names them). */
export const ZOTERO_ITEM_TYPES = [
  { value: 'webpage', label: 'Web Page' },
  { value: 'document', label: 'Document' },
  { value: 'newspaperArticle', label: 'Newspaper Article' },
  { value: 'book', label: 'Book' },
  { value: 'manuscript', label: 'Manuscript' },
  { value: 'letter', label: 'Letter' },
  { value: 'artwork', label: 'Artwork / Photograph' },
  { value: 'map', label: 'Map' },
  { value: 'report', label: 'Report' },
  { value: 'interview', label: 'Interview' },
] as const;

export type ZoteroItemType = (typeof ZOTERO_ITEM_TYPES)[number]['value'];

export interface SchemaField {
  field: string;
  label: string;
}
export interface SchemaCreatorType {
  creatorType: string;
  label: string;
}
/** What the Zotero schema says one item type accepts. */
export interface ItemSchema {
  itemType: string;
  fields: SchemaField[];
  creatorTypes: SchemaCreatorType[];
}

const f = (field: string, label: string): SchemaField => ({ field, label });
const c = (creatorType: string, label: string): SchemaCreatorType => ({ creatorType, label });

/** Embedded copies of the schema, used offline or when api.zotero.org can't be reached. */
const FALLBACK: Record<string, ItemSchema> = {
  webpage: {
    itemType: 'webpage',
    fields: [
      f('title', 'Title'), f('abstractNote', 'Abstract'), f('websiteTitle', 'Website Title'), f('websiteType', 'Website Type'),
      f('date', 'Date'), f('publisher', 'Publisher'), f('place', 'Place'), f('DOI', 'DOI'), f('citationKey', 'Citation Key'),
      f('url', 'URL'), f('accessDate', 'Accessed'), f('shortTitle', 'Short Title'), f('language', 'Language'),
      f('rights', 'License'), f('extra', 'Extra'),
    ],
    creatorTypes: [c('author', 'Author'), c('contributor', 'Contributor'), c('translator', 'Translator')],
  },
  document: {
    itemType: 'document',
    fields: [
      f('title', 'Title'), f('abstractNote', 'Abstract'), f('type', 'Type'), f('date', 'Date'), f('publisher', 'Publisher'),
      f('place', 'Place'), f('DOI', 'DOI'), f('citationKey', 'Citation Key'), f('url', 'URL'), f('accessDate', 'Accessed'),
      f('archive', 'Archive'), f('archiveLocation', 'Loc. in Archive'), f('shortTitle', 'Short Title'), f('language', 'Language'),
      f('libraryCatalog', 'Library Catalog'), f('callNumber', 'Call Number'), f('rights', 'License'), f('extra', 'Extra'),
    ],
    creatorTypes: [
      c('author', 'Author'), c('contributor', 'Contributor'), c('editor', 'Editor'), c('reviewedAuthor', 'Reviewed Author'),
      c('translator', 'Translator'),
    ],
  },
};

/** Any other type, offline: only fields every Zotero type shares. Strict, so it can never 400. */
function genericFallback(itemType: string): ItemSchema {
  return {
    itemType,
    fields: [
      f('title', 'Title'), f('abstractNote', 'Abstract'), f('date', 'Date'), f('url', 'URL'), f('accessDate', 'Accessed'),
      f('archive', 'Archive'), f('archiveLocation', 'Loc. in Archive'), f('shortTitle', 'Short Title'), f('language', 'Language'),
      f('rights', 'License'), f('extra', 'Extra'),
    ],
    creatorTypes: [c('author', 'Author'), c('contributor', 'Contributor')],
  };
}

export function fallbackSchema(itemType: string): ItemSchema {
  return FALLBACK[itemType] ?? genericFallback(itemType);
}

const API = 'https://api.zotero.org';
const cache = new Map<string, ItemSchema>();

/** Fetch (and remember) the fields and creator types for an item type; embedded fallback on any failure. */
export async function loadItemSchema(itemType: string, fetchImpl: typeof fetch = fetch): Promise<ItemSchema> {
  const hit = cache.get(itemType);
  if (hit) return hit;
  try {
    const q = encodeURIComponent(itemType);
    const [fr, cr] = await Promise.all([
      fetchImpl(`${API}/itemTypeFields?itemType=${q}`),
      fetchImpl(`${API}/itemTypeCreatorTypes?itemType=${q}`),
    ]);
    if (!fr.ok || !cr.ok) throw new Error('schema unavailable');
    const fields = ((await fr.json()) as Array<{ field: string; localized?: string }>).map((x) => f(x.field, x.localized ?? x.field));
    const creatorTypes = ((await cr.json()) as Array<{ creatorType: string; localized?: string }>).map((x) =>
      c(x.creatorType, x.localized ?? x.creatorType),
    );
    if (!fields.length || !creatorTypes.length) throw new Error('empty schema');
    const schema = { itemType, fields, creatorTypes };
    cache.set(itemType, schema);
    return schema;
  } catch {
    return fallbackSchema(itemType);
  }
}

/** Test hook. */
export function clearSchemaCache(): void {
  cache.clear();
}

/** Fields tucked under "More fields" so the default view stays short. */
export const MORE_FIELDS: ReadonlySet<string> = new Set([
  'DOI', 'citationKey', 'shortTitle', 'series', 'seriesTitle', 'seriesText', 'seriesNumber', 'callNumber', 'libraryCatalog',
  'ISBN', 'ISSN', 'edition', 'volume', 'numberOfVolumes', 'issue', 'section', 'pages', 'numPages', 'websiteType', 'abstractNote', 'extra',
]);

export interface ZoteroCreator {
  creatorType: string;
  /** One name field (an institution) instead of last and first. */
  single: boolean;
  lastName: string;
  firstName: string;
  name: string;
}

export interface ZoteroForm {
  itemType: ZoteroItemType;
  /** Every value the user has seen or typed, by field name; only fields valid for the type are sent. */
  fields: Record<string, string>;
  creators: ZoteroCreator[];
  /** Comma-separated. */
  tags: string;
  /** Child note: citation, then the user's notes. */
  citation: string;
  notes: string;
  collectionKey?: string;
}

export function emptyCreator(creatorType: string): ZoteroCreator {
  return { creatorType, single: false, lastName: '', firstName: '', name: '' };
}

/** What a capture can tell us; the scraper's m_* metadata plugs in through {@link metaFromCapture}. */
export interface CaptureMeta {
  publisher?: string;
  creators?: string[];
  date?: string;
  place?: string;
  repository?: string;
  collection?: string;
  identifier?: string;
  rights?: string;
  language?: string;
}

/** The ONE place that reads a capture for Zotero prefill. Extend this when the capture carries scraped metadata. */
export function metaFromCapture(capture: { publisher?: string; meta?: CaptureMeta }): CaptureMeta {
  return { ...capture.meta, publisher: capture.meta?.publisher || capture.publisher || undefined };
}

/** "Last, First" or "First Last" into a creator; a single word is an institution. */
export function parseCreatorName(raw: string, creatorType: string): ZoteroCreator | null {
  const text = raw.trim();
  if (!text) return null;
  const base = emptyCreator(creatorType);
  const comma = text.indexOf(',');
  if (comma > 0) return { ...base, lastName: text.slice(0, comma).trim(), firstName: text.slice(comma + 1).trim() };
  const space = text.lastIndexOf(' ');
  if (space < 0) return { ...base, single: true, name: text };
  return { ...base, lastName: text.slice(space + 1), firstName: text.slice(0, space).trim() };
}

const has = (schema: ItemSchema, name: string): boolean => schema.fields.some((x) => x.field === name);
const firstIn = (schema: ItemSchema, names: string[]): string | undefined => names.find((n) => has(schema, n));

/** Meta key -> candidate Zotero fields, first one the type has wins. */
const PREFILL: Array<[keyof CaptureMeta, string[]]> = [
  ['publisher', ['websiteTitle', 'publicationTitle', 'publisher']],
  ['date', ['date']],
  ['place', ['place', 'eventPlace']],
  ['repository', ['archive']],
  ['identifier', ['archiveLocation']],
  ['collection', ['series', 'seriesTitle']],
  ['rights', ['rights']],
  ['language', ['language']],
];

/** Fill only the empty fields (and an empty creator list) the type has, from the capture's metadata. */
export function applyPrefill(form: ZoteroForm, meta: CaptureMeta, schema: ItemSchema): ZoteroForm {
  const fields = { ...form.fields };
  for (const [key, names] of PREFILL) {
    const value = meta[key];
    const target = typeof value === 'string' && value.trim() ? firstIn(schema, names) : undefined;
    if (target && !fields[target]?.trim()) fields[target] = (value as string).trim();
  }
  let creators = form.creators;
  if (!creators.some((x) => x.lastName || x.name) && meta.creators?.length) {
    const type = defaultCreatorType(schema);
    const parsed = meta.creators.map((n) => parseCreatorName(n, type)).filter((x): x is ZoteroCreator => x !== null);
    if (parsed.length) creators = parsed;
  }
  return { ...form, fields, creators };
}

export function defaultCreatorType(schema: ItemSchema): string {
  return schema.creatorTypes[0]?.creatorType ?? 'author';
}

/** Where a publisher-like value travels when the type changes. */
const PUBLISHER_ALIASES = ['websiteTitle', 'publicationTitle', 'publisher'];

/**
 * Change item type. Values stay in `fields`, so anything the two types share is kept (and
 * anything not valid is simply not sent); a publisher-like value moves to the new type's slot
 * and creator types the new type lacks fall back to its first.
 */
export function switchItemType(form: ZoteroForm, itemType: ZoteroItemType, schema: ItemSchema): ZoteroForm {
  const fields = { ...form.fields };
  const carried = PUBLISHER_ALIASES.map((n) => fields[n]).find((v) => v?.trim());
  const slot = firstIn(schema, PUBLISHER_ALIASES);
  if (carried && slot && !fields[slot]?.trim()) fields[slot] = carried;
  const valid = new Set(schema.creatorTypes.map((x) => x.creatorType));
  const creators = form.creators.map((x) => (valid.has(x.creatorType) ? x : { ...x, creatorType: defaultCreatorType(schema) }));
  return { ...form, itemType, fields, creators };
}

/** Problems that would stop a save, by field name (`creator-N` for creator rows). */
export function validateZoteroForm(form: ZoteroForm, schema: ItemSchema): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.fields.title?.trim()) errors.title = 'A title is required.';
  const url = form.fields.url?.trim();
  if (url && has(schema, 'url')) {
    try {
      new URL(url);
    } catch {
      errors.url = 'Enter a full URL, like https://example.com/page.';
    }
  }
  const accessed = form.fields.accessDate?.trim();
  if (accessed && has(schema, 'accessDate') && (!/^\d{4}-\d{2}-\d{2}$/.test(accessed) || Number.isNaN(Date.parse(accessed)))) {
    errors.accessDate = 'Use a date like 2026-10-18.';
  }
  const valid = new Set(schema.creatorTypes.map((x) => x.creatorType));
  form.creators.forEach((cr, i) => {
    const touched = cr.single ? cr.name.trim() : cr.lastName.trim() || cr.firstName.trim();
    if (!touched) return; // an untouched row is dropped, not an error
    if (!valid.has(cr.creatorType)) errors[`creator-${i}`] = `${cr.creatorType} isn’t valid for this item type.`;
    else if (!cr.single && !cr.lastName.trim()) errors[`creator-${i}`] = 'A last name is required (or switch to a single field).';
  });
  return errors;
}

export function parseTags(raw: string): Array<{ tag: string }> {
  const seen = new Set<string>();
  const out: Array<{ tag: string }> = [];
  for (const part of raw.split(',')) {
    const tag = part.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push({ tag });
    }
  }
  return out;
}

/** Zotero wants ISO 8601 UTC; the form holds a plain YYYY-MM-DD. */
function accessIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

/** Today as YYYY-MM-DD, for the Accessed default. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The item to POST: only fields and creator types the schema lists for the type, so Zotero never 400s. */
export function buildZoteroItem(form: ZoteroForm, schema: ItemSchema, key?: string): ZoteroItem {
  const item: ZoteroItem = { itemType: form.itemType };
  for (const { field } of schema.fields) {
    const raw = form.fields[field]?.trim();
    if (raw) item[field] = field === 'accessDate' ? accessIso(raw) : raw;
  }
  const valid = new Set(schema.creatorTypes.map((x) => x.creatorType));
  item.creators = form.creators
    .filter((x) => valid.has(x.creatorType))
    .map((x) =>
      x.single
        ? { creatorType: x.creatorType, name: x.name.trim() }
        : { creatorType: x.creatorType, lastName: x.lastName.trim(), firstName: x.firstName.trim() },
    )
    .filter((x) => ('name' in x ? x.name : x.lastName || x.firstName));
  item.tags = parseTags(form.tags);
  item.collections = form.collectionKey ? [form.collectionKey] : [];
  if (key) item.key = key;
  return item;
}
