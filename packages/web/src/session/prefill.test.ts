import { describe, it, expect } from 'vitest';
import { personToSearch } from './prefill';

describe('personToSearch', () => {
  it('copies name, relatives and normalizes gender', () => {
    const out = personToSearch({
      givenName: 'John',
      surname: 'Smith',
      gender: 'MALE',
      fatherGivenName: 'Bob',
      fatherSurname: 'Smith',
      motherGivenName: 'Jane',
      motherSurname: 'Doe',
      spouseGivenName: 'Mary',
      spouseSurname: 'Jones',
    });
    expect(out).toMatchObject({
      givenName: 'John',
      surname: 'Smith',
      gender: 'male',
      fatherGivenName: 'Bob',
      spouseSurname: 'Jones',
    });
  });

  it('drops empty fields and an unknown gender', () => {
    const out = personToSearch({ givenName: 'John', surname: '', gender: 'unknown' });
    expect(out.givenName).toBe('John');
    expect('surname' in out).toBe(false);
    expect('gender' in out).toBe(false);
  });

  it('uses an explicit event type over birth/death', () => {
    const out = personToSearch({
      eventType: 'marriageLike',
      eventDateFrom: '1850',
      eventDateTo: '1851',
      eventPlace: 'Ohio',
      birthDate: '1800',
    });
    expect(out.eventType).toBe('marriageLike');
    expect(out.eventDateFrom).toBe('1850');
    expect(out.eventPlace).toBe('Ohio');
  });

  it('falls back to birth, extracting the year from a full date', () => {
    const out = personToSearch({ birthDate: '12 Mar 1850', birthPlace: 'Ohio' });
    expect(out.eventType).toBe('birthLike');
    expect(out.eventDateFrom).toBe('1850');
    expect(out.eventDateTo).toBe('1850');
    expect(out.eventPlace).toBe('Ohio');
  });

  it('falls back to death when there is no birth', () => {
    const out = personToSearch({ deathDate: '1899', deathPlace: 'Kent' });
    expect(out.eventType).toBe('deathLike');
    expect(out.eventDateFrom).toBe('1899');
    expect(out.eventPlace).toBe('Kent');
  });

  it('returns no event when there is nothing to anchor it', () => {
    const out = personToSearch({ givenName: 'John' });
    expect('eventType' in out).toBe(false);
  });
});
