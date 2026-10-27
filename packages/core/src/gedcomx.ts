/**
 * Minimal, defensive GEDCOM-X reader for FamilySearch tree search/read results.
 *
 * Port of the legacy fsResult.js / fsutils.js extraction, with the bugs removed:
 *  - every entry/relationship parse is guarded so one malformed result can't
 *    abort the whole list (legacy threw 'Cannot read properties of undefined');
 *  - getSpouses() actually returns its matches (the legacy filter callback
 *    forgot to return);
 *  - vitals come from the FS `display` element consistently.
 *
 * The shapes FS returns are loosely typed (`unknown`-ish) so we read them
 * defensively rather than asserting a schema.
 */

export interface RelativeRef {
  pid: string;
  name: string;
  url: string;
}

export interface PersonResult {
  pid: string;
  name: string;
  gender: string; // 'Male' | 'Female' | 'Unknown'
  url: string;
  lifespan: string;
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
  score: number | null;
  fathers: RelativeRef[];
  mothers: RelativeRef[];
  spouses: RelativeRef[];
}

const PROD_API = 'https://api.familysearch.org';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function personDetailUrl(pid: string, apiHost: string = PROD_API): string {
  if (!pid) return '';
  return `${apiHost.replace('api.', 'www.')}/tree/person/details/${pid}`;
}

/** The FamilySearch web page for a single source description (view/edit). */
export function sourceViewUrl(id: string, apiHost: string = PROD_API): string {
  if (!id) return '';
  return `${apiHost.replace('api.', 'www.')}/en/tree/sources/viewedit/${id}`;
}

/** The FamilySearch web Source Box (the current URL; the old /search/sourcebox 404s). */
export function sourceBoxUrl(apiHost: string = PROD_API): string {
  return `${apiHost.replace('api.', 'www.')}/en/tree/sources/sourceBox/`;
}

function normalizeGender(raw: unknown): string {
  const g = str(raw);
  if (/female/i.test(g)) return 'Female';
  if (/male/i.test(g)) return 'Male';
  return 'Unknown';
}

function nameOf(person: Any): string {
  const display = person?.display ?? {};
  const displayName = str(display.name);
  if (displayName) return displayName;
  return str(person?.names?.[0]?.nameForms?.[0]?.fullText);
}

function relativeRef(person: Any, apiHost: string): RelativeRef {
  const pid = str(person?.id);
  return { pid, name: nameOf(person), url: personDetailUrl(pid, apiHost) };
}

/** Parse one GEDCOM-X document into a single primary PersonResult (with relatives). */
export function parsePerson(gedcomx: Any, primaryId?: string, apiHost: string = PROD_API): PersonResult | null {
  const persons: Any[] = Array.isArray(gedcomx?.persons) ? gedcomx.persons : [];
  if (persons.length === 0) return null;
  const primary = (primaryId && persons.find((p) => p?.id === primaryId)) || persons[0];
  if (!primary) return null;

  const pid = str(primary.id);
  const display = primary.display ?? {};
  const byId = new Map<string, Any>(persons.filter((p) => p?.id).map((p) => [p.id as string, p]));
  const relationships: Any[] = Array.isArray(gedcomx?.relationships) ? gedcomx.relationships : [];

  const fathers: RelativeRef[] = [];
  const mothers: RelativeRef[] = [];
  const spouses: RelativeRef[] = [];

  for (const rel of relationships) {
    try {
      const type = str(rel?.type);
      const p1 = str(rel?.person1?.resourceId);
      const p2 = str(rel?.person2?.resourceId);
      if (type.includes('ParentChild') && p2 === pid) {
        const parent = byId.get(p1);
        if (parent) {
          const ref = relativeRef(parent, apiHost);
          if (normalizeGender(parent?.display?.gender ?? parent?.gender?.type) === 'Female') {
            mothers.push(ref);
          } else {
            fathers.push(ref);
          }
        }
      } else if (type.includes('Couple') && (p1 === pid || p2 === pid)) {
        const spouse = byId.get(p1 === pid ? p2 : p1);
        if (spouse) spouses.push(relativeRef(spouse, apiHost));
      }
    } catch {
      /* skip malformed relationship */
    }
  }

  return {
    pid,
    name: nameOf(primary),
    gender: normalizeGender(display.gender ?? primary?.gender?.type),
    url: personDetailUrl(pid, apiHost),
    lifespan: str(display.lifespan),
    birthDate: str(display.birthDate),
    birthPlace: str(display.birthPlace),
    deathDate: str(display.deathDate),
    deathPlace: str(display.deathPlace),
    score: null,
    fathers,
    mothers,
    spouses,
  };
}

export interface PersonVitals {
  givenName: string;
  surname: string;
  gender: string; // 'Male' | 'Female' | 'Unknown'
  living: boolean;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
}

const GENDER_URI: Record<string, string> = {
  Male: 'http://gedcomx.org/Male',
  Female: 'http://gedcomx.org/Female',
  Unknown: 'http://gedcomx.org/Unknown',
};

/**
 * A FamilySearch tree person must have at least one non-empty name part.
 * Creating one without a name fails with an opaque 400 ("Failure in upstream
 * call: Unable to create TF person" — RECORDSEEK-EZ), so callers must check
 * this before `createPerson`.
 */
export function hasPersonName(v: PersonVitals): boolean {
  return [v.givenName, v.surname].filter(Boolean).join(' ').trim().length > 0;
}

/** Assemble a minimal GEDCOM-X person (Standard name template) for createPerson. */
export function buildGedcomxPerson(v: PersonVitals): Record<string, unknown> {
  const fullText = [v.givenName, v.surname].filter(Boolean).join(' ').trim();
  const parts: Array<Record<string, string>> = [];
  if (v.givenName) parts.push({ type: 'http://gedcomx.org/Given', value: v.givenName });
  if (v.surname) parts.push({ type: 'http://gedcomx.org/Surname', value: v.surname });

  const facts: Array<Record<string, unknown>> = [];
  if (v.birthDate || v.birthPlace) {
    facts.push({
      type: 'http://gedcomx.org/Birth',
      ...(v.birthDate ? { date: { original: v.birthDate } } : {}),
      ...(v.birthPlace ? { place: { original: v.birthPlace } } : {}),
    });
  }
  if (!v.living && (v.deathDate || v.deathPlace)) {
    facts.push({
      type: 'http://gedcomx.org/Death',
      ...(v.deathDate ? { date: { original: v.deathDate } } : {}),
      ...(v.deathPlace ? { place: { original: v.deathPlace } } : {}),
    });
  }

  const person: Record<string, unknown> = {
    living: v.living,
    gender: { type: GENDER_URI[v.gender] ?? GENDER_URI.Unknown },
    names: [
      {
        type: 'http://gedcomx.org/BirthName',
        preferred: true,
        nameForms: [{ fullText, parts }],
      },
    ],
  };
  if (facts.length > 0) person.facts = facts;
  return person;
}

/** Parse a GEDCOM-X Atom search feed into a list of PersonResults. */
export function parseSearchResults(feed: Any, apiHost: string = PROD_API): PersonResult[] {
  const entries: Any[] = Array.isArray(feed?.entries) ? feed.entries : [];
  const out: PersonResult[] = [];
  for (const entry of entries) {
    try {
      const gedcomx = entry?.content?.gedcomx ?? entry?.gedcomx ?? entry;
      const primaryId = str(entry?.id).split('/').pop() || undefined;
      const result = parsePerson(gedcomx, primaryId, apiHost);
      if (result) {
        out.push({ ...result, score: typeof entry?.score === 'number' ? entry.score : null });
      }
    } catch {
      /* skip malformed entry */
    }
  }
  return out;
}

/**
 * Total number of matches a tree-search feed reports. The GEDCOM-X Atom feed
 * carries this as a top-level `results` field (e.g. 3902); it's what drives the
 * "X-Y of N results" count and the page numbers. Returns 0 when absent.
 */
export function parseSearchTotal(feed: Any): number {
  const total = Number(feed?.results);
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}
