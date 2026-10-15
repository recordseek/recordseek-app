/**
 * Map a genscrape GEDCOM X result onto RecordSeek share params. A faithful port
 * of the browser extension's content.js (gx_short, gx_find_person, gx_name_part,
 * gx_fact, gx_set_relative, gx_person_params and the genscrape 'data' handler),
 * so the extension, the SDK and any other client produce identical captures.
 */
import type { PersonParams } from './share-params';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gx = any;

/** Share params derived from a genscrape result (only fields that were found). */
export interface GenscrapeShareParams extends PersonParams {
  title?: string;
  citation?: string;
  url?: string;
  /** Comma-joined fact types of the first person. */
  tags?: string;
}

/** "http://gedcomx.org/Birth" -> "Birth"; other values pass through. */
export function gxShort(type: unknown): string {
  return type ? String(type).split('http://gedcomx.org/')[1] || String(type) : '';
}

function findPerson(data: Gx, id: unknown): Gx {
  if (!id) return null;
  const clean = String(id).replace(/^#/, '');
  const persons: Gx[] = data.persons || [];
  for (const p of persons) {
    if (p.id === clean) return p;
  }
  return null;
}

function namePart(person: Gx, partType: string): string {
  try {
    const parts: Gx[] = person.names[0].nameForms[0].parts;
    for (const part of parts) {
      if (gxShort(part.type) === partType) return part.value;
    }
  } catch {
    // no name
  }
  return '';
}

function fact(person: Gx, factType: string, field: 'date' | 'place'): string {
  const facts: Gx[] = (person && person.facts) || [];
  for (const f of facts) {
    if (gxShort(f.type) === factType && f[field] && f[field].original) {
      return f[field].original;
    }
  }
  return '';
}

/** The record's own event (FamilySearch marks it primary) -> search event type. */
const EVENT_TYPES: Record<string, string> = {
  Birth: 'birthLike',
  Christening: 'birthLike',
  Baptism: 'birthLike',
  Death: 'deathLike',
  Burial: 'deathLike',
  Cremation: 'deathLike',
  Marriage: 'marriageLike',
  MarriageBanns: 'marriageLike',
  MarriageLicense: 'marriageLike',
  MarriageContract: 'marriageLike',
  Census: 'residence',
  Residence: 'residence',
};

/** First and last 4-digit years in a date ("1830-1831" -> 1830, 1831). */
function yearRange(date: string): [string, string] {
  const years = date.match(/\b\d{4}\b/g) || [];
  return [years[0] || '', years[years.length - 1] || ''];
}

/** Event type, year range and place from the main person's primary fact. */
function primaryEvent(out: Record<string, string>, person: Gx): void {
  const facts: Gx[] = (person && person.facts) || [];
  const primary = facts.find((f) => f.primary === true && EVENT_TYPES[gxShort(f.type)]);
  const type = primary && EVENT_TYPES[gxShort(primary.type)];
  if (!type) return;
  out.eventType = type;
  [out.eventDateFrom, out.eventDateTo] = yearRange((primary.date && primary.date.original) || '');
  out.eventPlace = (primary.place && primary.place.original) || '';
}

function setRelative(out: Record<string, string>, prefix: string, person: Gx): void {
  if (!person) return;
  out[`${prefix}GivenName`] = namePart(person, 'Given');
  out[`${prefix}Surname`] = namePart(person, 'Surname');
}

/** Map the principal person (principal=true, else persons[0]) and close relatives. */
export function genscrapePersonParams(data: Gx): PersonParams {
  const out: Record<string, string> = {};
  const main: Gx = mainPerson(data);
  if (!main) return out;
  out.givenName = namePart(main, 'Given');
  out.surname = namePart(main, 'Surname');
  out.gender = main.gender ? gxShort(main.gender.type) : '';
  out.birthDate = fact(main, 'Birth', 'date');
  out.birthPlace = fact(main, 'Birth', 'place');
  out.deathDate = fact(main, 'Death', 'date');
  out.deathPlace = fact(main, 'Death', 'place');
  primaryEvent(out, main);
  const rels: Gx[] = data.relationships || [];
  const mainRef = `#${main.id}`;
  for (const r of rels) {
    const p1 = r.person1 && r.person1.resource;
    const p2 = r.person2 && r.person2.resource;
    const type = gxShort(r.type);
    if (type === 'ParentChild' && p2 === mainRef) {
      const parent = findPerson(data, p1);
      if (parent) {
        const g = parent.gender ? gxShort(parent.gender.type) : '';
        if (g === 'Male' && !out.fatherGivenName && !out.fatherSurname) setRelative(out, 'father', parent);
        else if (g === 'Female' && !out.motherGivenName && !out.motherSurname) setRelative(out, 'mother', parent);
      }
    } else if (type === 'Couple' && (p1 === mainRef || p2 === mainRef) && !out.spouseGivenName && !out.spouseSurname) {
      setRelative(out, 'spouse', findPerson(data, p1 === mainRef ? p2 : p1));
    }
  }
  return out;
}

/** The main person: principal=true, else persons[0]. */
function mainPerson(data: Gx): Gx {
  const persons: Gx[] = (data && data.persons) || [];
  return persons.find((p) => p.principal === true) || persons[0];
}

/**
 * The record's own source: the document's `description`, else the first titled
 * source the main person cites, else the first source description.
 */
function mainSource(data: Gx, main: Gx): Gx {
  const sources: Gx[] = (data && data.sourceDescriptions) || [];
  const refs: unknown[] = [data && data.description, ...((main && main.sources) || []).map((s: Gx) => s && s.description)];
  for (const ref of refs) {
    if (typeof ref !== 'string') continue;
    const sd = sources.find((x) => x.id === ref.replace(/^#/, ''));
    if (sd && sd.titles && sd.titles.length) return sd;
  }
  return sources[0];
}

/**
 * Full genscrape result -> share params: source title/citation/url, comma-joined
 * fact-type tags and person params, all from the main person. Each field is read
 * on its own, so a missing citation (FamilySearch records have none) doesn't drop
 * the person. Empty values are omitted. Returns {} when the data is unusable.
 */
export function genscrapeToShareParams(data: Gx): GenscrapeShareParams {
  const out: Record<string, string> = {};
  const read = (key: string, get: () => unknown): void => {
    try {
      const value = get();
      if (typeof value === 'string' && value) out[key] = value;
    } catch {
      // field not present
    }
  };
  try {
    const main = mainPerson(data);
    const source = mainSource(data, main);
    read('title', () => source.titles[0].value);
    read('citation', () => source.citations[0].value);
    read('url', () => source.about);
    const tags: string[] = [];
    for (const f of ((main && main.facts) || []) as Gx[]) {
      const t = gxShort(f.type);
      if (t && !tags.includes(t)) tags.push(t);
    }
    out.tags = tags.join();
    const person = genscrapePersonParams(data) as Record<string, string>;
    for (const key of Object.keys(person)) {
      if (person[key]) out[key] = person[key];
    }
  } catch {
    // keep whatever was mapped before the failure
  }
  for (const key of Object.keys(out)) {
    if (!out[key]) delete out[key];
  }
  return out;
}
