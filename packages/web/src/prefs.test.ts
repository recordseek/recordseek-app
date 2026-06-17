import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedCitationStyle, getLastService, saveLastService, clearLastService } from './prefs';

describe('prefs', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and clears the last service', () => {
    expect(getLastService()).toBeNull();
    saveLastService('Ancestry');
    expect(getLastService()).toBe('Ancestry');
    clearLastService();
    expect(getLastService()).toBeNull();
  });

  it('ignores an invalid stored service or citation style', () => {
    localStorage.setItem('recordseek-last-service', 'Bogus');
    expect(getLastService()).toBeNull();
    localStorage.setItem('recordseek_source_format', 'not-a-style');
    expect(getSavedCitationStyle()).toBeNull();
    localStorage.setItem('recordseek_source_format', 'mla');
    expect(getSavedCitationStyle()).toBe('mla');
  });
});
