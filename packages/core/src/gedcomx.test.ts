import { describe, it, expect } from 'vitest';
import { parseSearchResults, parsePerson, personDetailUrl, buildGedcomxPerson } from './gedcomx';

const FEED = {
  entries: [
    {
      id: 'https://api.familysearch.org/platform/tree/persons/PRIMARY1',
      score: 4.2,
      content: {
        gedcomx: {
          persons: [
            {
              id: 'PRIMARY1',
              display: {
                name: 'John Smith',
                gender: 'Male',
                lifespan: '1850–1910',
                birthDate: '1850',
                birthPlace: 'Ohio',
                deathDate: '1910',
                deathPlace: 'Indiana',
              },
            },
            { id: 'FATHER1', display: { name: 'James Smith', gender: 'Male' } },
            { id: 'MOTHER1', display: { name: 'Mary Smith', gender: 'Female' } },
            { id: 'SPOUSE1', display: { name: 'Jane Smith', gender: 'Female' } },
          ],
          relationships: [
            { type: 'http://gedcomx.org/ParentChild', person1: { resourceId: 'FATHER1' }, person2: { resourceId: 'PRIMARY1' } },
            { type: 'http://gedcomx.org/ParentChild', person1: { resourceId: 'MOTHER1' }, person2: { resourceId: 'PRIMARY1' } },
            { type: 'http://gedcomx.org/Couple', person1: { resourceId: 'PRIMARY1' }, person2: { resourceId: 'SPOUSE1' } },
          ],
        },
      },
    },
  ],
};

describe('personDetailUrl', () => {
  it('builds a www.familysearch.org tree link', () => {
    expect(personDetailUrl('L123')).toBe('https://www.familysearch.org/tree/person/details/L123');
    expect(personDetailUrl('')).toBe('');
  });
});

describe('parseSearchResults', () => {
  it('extracts the primary person, vitals, score, and relatives', () => {
    const results = parseSearchResults(FEED);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.pid).toBe('PRIMARY1');
    expect(r.name).toBe('John Smith');
    expect(r.gender).toBe('Male');
    expect(r.url).toBe('https://www.familysearch.org/tree/person/details/PRIMARY1');
    expect(r.lifespan).toBe('1850–1910');
    expect(r.birthPlace).toBe('Ohio');
    expect(r.deathDate).toBe('1910');
    expect(r.score).toBe(4.2);
    expect(r.fathers.map((f) => f.name)).toEqual(['James Smith']);
    expect(r.mothers.map((m) => m.name)).toEqual(['Mary Smith']);
    expect(r.spouses.map((sp) => sp.name)).toEqual(['Jane Smith']);
    expect(r.fathers[0]!.url).toBe('https://www.familysearch.org/tree/person/details/FATHER1');
  });

  it('returns an empty list for an empty/missing feed', () => {
    expect(parseSearchResults({})).toEqual([]);
    expect(parseSearchResults(null)).toEqual([]);
  });

  it('skips malformed entries instead of throwing', () => {
    const feed = { entries: [{}, { content: { gedcomx: { persons: [] } } }, FEED.entries[0]] };
    const results = parseSearchResults(feed);
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('John Smith');
  });
});

describe('buildGedcomxPerson', () => {
  it('assembles a name, gender, and birth fact', () => {
    const person = buildGedcomxPerson({
      givenName: 'John',
      surname: 'Smith',
      gender: 'Male',
      living: false,
      birthDate: '1850',
      birthPlace: 'Ohio',
      deathDate: '1910',
    });
    expect(person.living).toBe(false);
    expect(person.gender).toEqual({ type: 'http://gedcomx.org/Male' });
    const names = person.names as Array<{ nameForms: Array<{ fullText: string; parts: Array<{ type: string; value: string }> }> }>;
    expect(names[0]!.nameForms[0]!.fullText).toBe('John Smith');
    expect(names[0]!.nameForms[0]!.parts).toEqual([
      { type: 'http://gedcomx.org/Given', value: 'John' },
      { type: 'http://gedcomx.org/Surname', value: 'Smith' },
    ]);
    const facts = person.facts as Array<{ type: string }>;
    expect(facts.map((f) => f.type)).toEqual(['http://gedcomx.org/Birth', 'http://gedcomx.org/Death']);
  });

  it('omits death facts for a living person', () => {
    const person = buildGedcomxPerson({ givenName: 'Jane', surname: 'Doe', gender: 'Female', living: true, deathDate: '2000' });
    expect(person.facts).toBeUndefined();
    expect(person.gender).toEqual({ type: 'http://gedcomx.org/Female' });
  });
});

describe('parsePerson', () => {
  it('returns null when there are no persons', () => {
    expect(parsePerson({ persons: [] })).toBeNull();
  });

  it('falls back to the first person when no primaryId matches', () => {
    const r = parsePerson({ persons: [{ id: 'X', display: { name: 'Only Person' } }] }, 'NOPE');
    expect(r?.name).toBe('Only Person');
  });
});
