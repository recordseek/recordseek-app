import type { PersonParams } from '@recordseek/core';
import type { SearchCriteria } from './SessionContext';

function year(date: string | undefined): string {
  const m = /\b(\d{4})\b/.exec(date ?? '');
  return m?.[1] ?? '';
}

/**
 * Map genscrape person params onto search criteria (legacy parity: the legacy
 * app copied same-named params onto the search; birth/death become the event).
 */
export function personToSearch(p: PersonParams): Partial<SearchCriteria> {
  const out: Partial<SearchCriteria> = {};
  const set = (key: Exclude<keyof SearchCriteria, 'advanced'>, value: string | undefined): void => {
    if (value) out[key] = value;
  };
  set('givenName', p.givenName);
  set('surname', p.surname);
  const g = (p.gender ?? '').toLowerCase();
  if (g === 'male' || g === 'female') out.gender = g;
  set('fatherGivenName', p.fatherGivenName);
  set('fatherSurname', p.fatherSurname);
  set('motherGivenName', p.motherGivenName);
  set('motherSurname', p.motherSurname);
  set('spouseGivenName', p.spouseGivenName);
  set('spouseSurname', p.spouseSurname);

  if (p.eventType) {
    set('eventType', p.eventType);
    set('eventDateFrom', p.eventDateFrom);
    set('eventDateTo', p.eventDateTo);
    set('eventPlace', p.eventPlace);
  } else if (p.birthDate || p.birthPlace) {
    out.eventType = 'birthLike';
    set('eventDateFrom', year(p.birthDate));
    set('eventDateTo', year(p.birthDate));
    set('eventPlace', p.birthPlace);
  } else if (p.deathDate || p.deathPlace) {
    out.eventType = 'deathLike';
    set('eventDateFrom', year(p.deathDate));
    set('eventDateTo', year(p.deathDate));
    set('eventPlace', p.deathPlace);
  }
  return out;
}
