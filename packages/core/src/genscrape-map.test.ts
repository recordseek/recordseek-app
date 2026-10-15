import { describe, it, expect } from 'vitest';
import { genscrapeToShareParams, genscrapePersonParams, gxShort } from './genscrape-map';

const G = 'http://gedcomx.org/';
const name = (given: string, surname: string) => ({
  nameForms: [{ parts: [{ type: `${G}Given`, value: given }, { type: `${G}Surname`, value: surname }] }],
});

const fixture = {
  sourceDescriptions: [
    { about: 'https://example.org/record/1', titles: [{ value: 'Census 1900' }], citations: [{ value: 'Census, 1900, p. 4' }] },
  ],
  persons: [
    { id: 'p0', names: [name('Wrong', 'Person')], facts: [{ type: `${G}Residence` }] },
    {
      id: 'p1',
      principal: true,
      names: [name('John', 'Smith')],
      gender: { type: `${G}Male` },
      facts: [
        { type: `${G}Birth`, date: { original: '12 Mar 1850' }, place: { original: 'Ohio' } },
        { type: `${G}Death`, date: { original: '1920' }, place: { original: 'Texas' } },
        { type: `${G}Birth` },
      ],
    },
    { id: 'p2', names: [name('Bob', 'Smith')], gender: { type: `${G}Male` } },
    { id: 'p3', names: [name('Mary', 'Jones')], gender: { type: `${G}Female` } },
    { id: 'p4', names: [name('Ann', 'Brown')], gender: { type: `${G}Female` } },
  ],
  relationships: [
    { type: `${G}ParentChild`, person1: { resource: '#p2' }, person2: { resource: '#p1' } },
    { type: `${G}ParentChild`, person1: { resource: '#p3' }, person2: { resource: '#p1' } },
    { type: `${G}Couple`, person1: { resource: '#p1' }, person2: { resource: '#p4' } },
  ],
};

describe('genscrape mapping', () => {
  it('shortens gedcomx types', () => {
    expect(gxShort(`${G}Birth`)).toBe('Birth');
    expect(gxShort('other:Type')).toBe('other:Type');
    expect(gxShort(undefined)).toBe('');
  });

  it('maps the principal person and relatives', () => {
    expect(genscrapePersonParams(fixture)).toEqual({
      givenName: 'John',
      surname: 'Smith',
      gender: 'Male',
      birthDate: '12 Mar 1850',
      birthPlace: 'Ohio',
      deathDate: '1920',
      deathPlace: 'Texas',
      fatherGivenName: 'Bob',
      fatherSurname: 'Smith',
      motherGivenName: 'Mary',
      motherSurname: 'Jones',
      spouseGivenName: 'Ann',
      spouseSurname: 'Brown',
    });
  });

  it('falls back to persons[0] when none is principal', () => {
    const data = { persons: [{ id: 'a', names: [name('Ada', 'Lovelace')] }, { id: 'b', names: [name('X', 'Y')] }] };
    expect(genscrapePersonParams(data)).toMatchObject({ givenName: 'Ada', surname: 'Lovelace' });
  });

  it('builds source fields, tags from the main person, and drops empties', () => {
    const out = genscrapeToShareParams(fixture);
    expect(out).toMatchObject({
      title: 'Census 1900',
      citation: 'Census, 1900, p. 4',
      url: 'https://example.org/record/1',
      tags: 'Birth,Death',
      givenName: 'John',
    });
    expect('fatherGivenName' in out).toBe(true);
  });

  it('uses the primary fact as the search event (census -> residence)', () => {
    const census = {
      persons: [
        {
          id: 'p1',
          principal: true,
          facts: [
            { type: 'http://gedcomx.org/Census', primary: true, date: { original: '1870' }, place: { original: 'Utah, United States' } },
            { type: 'http://gedcomx.org/Birth', date: { original: '1830-1831' }, place: { original: 'England' } },
          ],
        },
      ],
    };
    expect(genscrapePersonParams(census)).toMatchObject({
      eventType: 'residence',
      eventDateFrom: '1870',
      eventDateTo: '1870',
      eventPlace: 'Utah, United States',
      birthDate: '1830-1831',
    });
  });

  it('maps a FamilySearch census record that has no citation', () => {
    const record = {
      persons: [
        { id: 'p2', names: [name('Mary', 'Turner')] },
        {
          id: 'p1',
          principal: true,
          names: [name('Thomas', 'Turner')],
          sources: [{ description: '#sd2' }],
          facts: [{ type: 'http://gedcomx.org/Census', primary: true, date: { original: '1870' }, place: { original: 'Utah, United States' } }],
        },
      ],
      sourceDescriptions: [
        { id: 'sd1', titles: [{ value: 'United States Census, 1870' }] },
        {
          id: 'sd2',
          about: 'https://familysearch.org/ark:/61903/1:1:MNCT-SDC',
          titles: [{ value: 'Household of Thomas Turner, "United States Census, 1870"' }],
        },
      ],
    };
    expect(genscrapeToShareParams(record)).toEqual({
      title: 'Household of Thomas Turner, "United States Census, 1870"',
      url: 'https://familysearch.org/ark:/61903/1:1:MNCT-SDC',
      tags: 'Census',
      givenName: 'Thomas',
      surname: 'Turner',
      eventType: 'residence',
      eventDateFrom: '1870',
      eventDateTo: '1870',
      eventPlace: 'Utah, United States',
    });
  });

  it('finds the record person by persistent id when none is principal', () => {
    const record = {
      description: '#sd_p2',
      persons: [
        { id: 'p1', names: [name('Harry', 'Paukstys')], identifiers: { 'http://gedcomx.org/Persistent': ['https://www.familysearch.org/ark:/61903/1:1:FXBP'] } },
        { id: 'p2', names: [name('Albert', 'Paukstys')], identifiers: { 'http://gedcomx.org/Persistent': ['https://www.familysearch.org/ark:/61903/1:1:FXBL'] } },
      ],
      sourceDescriptions: [{ id: 'sd_p2', about: 'https://familysearch.org/ark:/61903/1:1:FXBL', titles: [{ value: 'Albert Paukstys' }] }],
    };
    expect(genscrapePersonParams(record)).toMatchObject({ givenName: 'Albert' });
  });

  it('leaves the event unset without a primary fact', () => {
    const p = { persons: [{ id: 'p1', facts: [{ type: 'http://gedcomx.org/Census', date: { original: '1870' } }] }] };
    expect(genscrapePersonParams(p).eventType).toBeUndefined();
  });

  it('tolerates bad data', () => {
    expect(genscrapeToShareParams(null)).toEqual({});
    expect(genscrapeToShareParams({})).toEqual({});
    expect(genscrapePersonParams({ persons: [] })).toEqual({});
  });
});
