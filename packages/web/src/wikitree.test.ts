import { describe, it, expect } from 'vitest';
import { isValidWikiTreeId, wikiTreeEditUrl, wikiTreeRef } from './wikitree';

describe('wikitree helpers', () => {
  it('validates WikiTree IDs', () => {
    for (const ok of ['Smith-123', "O'Brien-7", 'Van Dyke-45', ' Smith-1 ']) expect(isValidWikiTreeId(ok)).toBe(true);
    for (const bad of ['', 'Smith', 'Smith-', '123', 'Smith-12a', '-12', 'Sm1th-2']) expect(isValidWikiTreeId(bad)).toBe(false);
  });

  it('builds the edit URL', () => {
    expect(wikiTreeEditUrl('Smith-123')).toBe('https://www.wikitree.com/index.php?title=Special:EditPerson&w=Smith-123');
    expect(wikiTreeEditUrl("O'Brien-7")).toContain('w=O\'Brien-7');
  });

  it('builds a one-line ref with a wiki link', () => {
    expect(wikiTreeRef('Some\n citation.', 'https://dp.la/', 'DPLA [beta]')).toBe(
      '<ref>Some citation. [https://dp.la/ DPLA (beta)]</ref>',
    );
    expect(wikiTreeRef('Cite.', '', '')).toBe('<ref>Cite.</ref>');
  });
});
