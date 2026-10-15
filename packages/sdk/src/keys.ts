/**
 * Attribute tables for the SDK. Canonical share keys come from core's contract
 * (BASE_KEYS / PERSON_KEYS), so they can never drift from the share app.
 *
 * HTML lowercases attribute names, so `data-firstName` arrives as
 * `dataset.firstname` while `data-first-name` arrives as `dataset.firstName`.
 * Every key is therefore normalized (lowercased, dashes/underscores removed)
 * and looked up in one table of canonical names plus a small alias list.
 */
import { BASE_KEYS, PERSON_KEYS } from '@recordseek/core/share-params';

/** Source fields the SDK may send (a subset of core's BASE_KEYS). */
export const SOURCE_FIELDS = ['url', 'title', 'citation', 'notes', 'tags'] as const satisfies readonly (typeof BASE_KEYS)[number][];

const LEGACY_PERSON = ['eventType', 'eventDateFrom', 'eventDateTo', 'eventPlace'];

/** Person fields the SDK may send: core's PERSON_KEYS minus the legacy search-field names. */
export const PERSON_FIELDS: readonly string[] = PERSON_KEYS.filter((k) => !LEGACY_PERSON.includes(k));

/** Options that only affect the button or the SDK, never sent in the share URL. */
export const UI_FIELDS = [
  'bgColor',
  'fontColor',
  'label',
  'size',
  'shape',
  'iconType',
  'iconPosition',
  'class',
  'style',
  'partner',
  'scrape',
] as const;

export const SIZES = ['sm', 'md', 'lg'] as const;
export const SHAPES = ['rounded', 'pill', 'square'] as const;

/** Alias (normalized) -> canonical key. Keep this small. */
export const ALIASES: Readonly<Record<string, string>> = {
  firstname: 'givenName',
  first: 'givenName',
  given: 'givenName',
  forename: 'givenName',
  lastname: 'surname',
  last: 'surname',
  familyname: 'surname',
  sex: 'gender',
  dob: 'birthDate',
  dod: 'deathDate',
  bg: 'bgColor',
  background: 'bgColor',
  color: 'fontColor',
  icon: 'iconType',
  text: 'label',
  buttontext: 'label',
};

export type ShareField = (typeof SOURCE_FIELDS)[number] | string;

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  url: 'Page to cite. Relative values resolve against the current page. Default: scraped, else the current URL.',
  title: 'Source title. Default: scraped, else the page title.',
  citation: 'Ready-made citation text. Default: scraped.',
  notes: 'Notes to attach. Default: selected text, else the page description.',
  tags: 'Comma-separated tags.',
  givenName: 'Given (first) name of the person.',
  surname: 'Surname (family name).',
  gender: 'Male or Female.',
  birthDate: 'Birth date, any format (for example 1980 or 12 Mar 1980).',
  birthPlace: 'Birth place.',
  deathDate: 'Death date.',
  deathPlace: 'Death place.',
  fatherGivenName: "Father's given name.",
  fatherSurname: "Father's surname.",
  motherGivenName: "Mother's given name.",
  motherSurname: "Mother's surname.",
  spouseGivenName: "Spouse's given name.",
  spouseSurname: "Spouse's surname.",
  bgColor: 'Button background (any CSS color); sets --recordseek-bg. Default #1f6f43.',
  fontColor: 'Button text color (any CSS color); sets --recordseek-fg. Default #ffffff.',
  iconType: 'color (default, full-color mark), white (single-color white mark) or none (text only).',
  iconPosition: 'start (default) or end.',
  class: 'Replaces the default button classes entirely (space-separated). Default styles then do not apply.',
  style: 'none: do not inject the default stylesheet (you style .recordseek-button yourself).',
  label: 'Button text. Default "RecordSeek".',
  size: 'sm, md (default) or lg.',
  shape: 'rounded (default), pill or square.',
  partner: 'Your short partner id (letters, digits, . _ -), used for attribution.',
  scrape: 'Set to false to disable automatic page scraping for this button.',
};

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '');
}

/** normalized key -> canonical key, for share fields, UI fields and aliases. */
const LOOKUP: Map<string, string> = new Map();
for (const key of [...SOURCE_FIELDS, ...PERSON_FIELDS, ...UI_FIELDS]) LOOKUP.set(normalizeKey(key), key);
for (const [alias, key] of Object.entries(ALIASES)) LOOKUP.set(alias, key);

const SHARE_SET = new Set<string>([...SOURCE_FIELDS, ...PERSON_FIELDS]);

/** Canonical key for a raw attribute/data key, or undefined if unknown. */
export function canonicalKey(raw: string): string | undefined {
  return LOOKUP.get(normalizeKey(raw));
}

export interface ButtonOptions {
  bgColor?: string;
  fontColor?: string;
  label: string;
  /** `data-class`: replaces the default classes entirely (undefined = defaults). */
  className?: string;
  /** `data-style="none"`: do not inject the default stylesheet. */
  noStyle: boolean;
  iconType: 'color' | 'white' | 'none';
  iconPosition: 'start' | 'end';
  size: (typeof SIZES)[number];
  shape: (typeof SHAPES)[number];
}

export interface ParsedData {
  /** Explicit fields to send in the share URL (canonical keys). */
  share: Record<string, string>;
  ui: ButtonOptions;
  partner: string;
  scrape: boolean;
}

export const DEFAULT_LABEL = 'RecordSeek';

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/**
 * Normalize a dataset / API object: map keys through the alias table, drop
 * unknown keys (never forwarded), validate enums and the partner id.
 */
export function parseData(raw: Record<string, unknown> | undefined | null): ParsedData {
  const share: Record<string, string> = {};
  const out: ParsedData = {
    share,
    ui: { label: DEFAULT_LABEL, size: 'md', shape: 'rounded', iconType: 'color', iconPosition: 'start', noStyle: false },
    partner: '',
    scrape: true,
  };
  for (const key of Object.keys(raw || {})) {
    const canon = canonicalKey(key);
    const value = text((raw as Record<string, unknown>)[key]);
    if (!canon || !value) continue;
    if (SHARE_SET.has(canon)) {
      share[canon] = value;
      continue;
    }
    switch (canon) {
      case 'bgColor':
      case 'fontColor':
        out.ui[canon] = value;
        break;
      case 'label':
        out.ui.label = value.slice(0, 80);
        break;
      case 'size':
        if ((SIZES as readonly string[]).includes(value.toLowerCase())) out.ui.size = value.toLowerCase() as ButtonOptions['size'];
        break;
      case 'shape':
        if ((SHAPES as readonly string[]).includes(value.toLowerCase())) out.ui.shape = value.toLowerCase() as ButtonOptions['shape'];
        break;
      case 'iconType':
        if (['color', 'white', 'none'].includes(value.toLowerCase())) out.ui.iconType = value.toLowerCase() as ButtonOptions['iconType'];
        break;
      case 'iconPosition':
        if (['start', 'end'].includes(value.toLowerCase())) out.ui.iconPosition = value.toLowerCase() as ButtonOptions['iconPosition'];
        break;
      case 'class':
        out.ui.className = value;
        break;
      case 'style':
        out.ui.noStyle = value.toLowerCase() === 'none';
        break;
      case 'partner':
        out.partner = sanitizePartner(value);
        break;
      case 'scrape':
        out.scrape = !/^(false|0|no|off)$/i.test(value);
        break;
    }
  }
  return out;
}

const PARTNER_RE = /^[A-Za-z0-9._-]{1,64}$/;

/** Partner ids are limited to [A-Za-z0-9._-]{1,64}; anything else is dropped. */
export function sanitizePartner(value: string): string {
  return PARTNER_RE.test(value) ? value : '';
}

/** `birthDate` -> `data-birth-date`. */
function dataAttr(key: string): string {
  return 'data-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

export interface AttributeDoc {
  attribute: string;
  key: string;
  group: 'Source' | 'Person' | 'Button' | 'Other';
  aliases: string[];
  description: string;
}

/** The documented attribute list, generated from the same tables the parser uses. */
export function attributeDocs(): AttributeDoc[] {
  const aliasesFor = (key: string) =>
    Object.entries(ALIASES)
      .filter(([, v]) => v === key)
      .map(([a]) => a);
  const make = (key: string, group: AttributeDoc['group']): AttributeDoc => ({
    attribute: dataAttr(key),
    key,
    group,
    aliases: aliasesFor(key),
    description: DESCRIPTIONS[key] ?? '',
  });
  return [
    ...SOURCE_FIELDS.map((k) => make(k, 'Source')),
    ...PERSON_FIELDS.map((k) => make(k, 'Person')),
    ...UI_FIELDS.filter((k) => k !== 'partner' && k !== 'scrape').map((k) => make(k, 'Button')),
    make('partner', 'Other'),
    make('scrape', 'Other'),
  ];
}
