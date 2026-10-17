import { describe, it, expect, beforeEach } from 'vitest';
import { getSavedCitationStyle, getLastService, saveLastService, clearLastService, getSaveToSourceBox } from './prefs';

describe('prefs', () => {
  beforeEach(() => localStorage.clear());

  it('saves to the source box only when turned on', () => {
    expect(getSaveToSourceBox()).toBe(false);
    localStorage.setItem('recordseek-save-to-sourcebox', 'false');
    expect(getSaveToSourceBox()).toBe(false);
    localStorage.setItem('recordseek-save-to-sourcebox', 'true');
    expect(getSaveToSourceBox()).toBe(true);
  });

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
