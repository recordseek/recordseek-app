import { describe, it, expect } from 'vitest';
import {
  formatCitation,
  toGedcomxSourceCitation,
  deriveSourceMetadata,
  CITATION_STYLES,
  CITATION_STYLE_LABELS,
  DEFAULT_CITATION_STYLE,
  type CitationRecord,
  type CitationStyle,
} from './citation';

const website: CitationRecord = {
  sourceType: 'database',
  author: 'Ancestry.com',
  title: '1880 United States Federal Census',
  publisher: 'Ancestry',
  date: '2010',
  url: 'https://www.ancestry.com/search/collections/6742',
  accessedDate: '16 June 2026',
};

const census: CitationRecord = {
  sourceType: 'census',
  date: '1880',
  place: 'Cook County, Illinois',
  ED: '042',
  sheet: '7B',
  dwelling: '101',
  family: '103',
  person: 'John Smith',
  publisher: 'Ancestry',
  url: 'https://www.ancestry.com/discoveryui-content/view/12345',
  accessedDate: '16 June 2026',
};

describe('registry', () => {
  it('exposes six styles with the genealogical default', () => {
    expect(CITATION_STYLES).toHaveLength(6);
    expect(CITATION_STYLES).toContain('evidenceExplained');
    expect(DEFAULT_CITATION_STYLE).toBe('evidenceExplained');
  });

  it('has a human label for every style', () => {
    for (const style of CITATION_STYLES) {
      expect(CITATION_STYLE_LABELS[style]).toBeTruthy();
    }
  });

  it('defaults to Evidence Explained when no style is given', () => {
    expect(formatCitation(website)).toBe(formatCitation(website, 'evidenceExplained'));
  });

  it('falls back to the default for an unknown style instead of throwing', () => {
    expect(formatCitation(website, 'bogus' as CitationStyle)).toBe(formatCitation(website, DEFAULT_CITATION_STYLE));
  });

  it('wraps the formatted citation for the GEDCOM-X machine target', () => {
    expect(toGedcomxSourceCitation(website)).toEqual({ value: formatCitation(website) });
  });
});

describe('Evidence Explained (exact)', () => {
  it('formats a generic online database record', () => {
    expect(formatCitation(website, 'evidenceExplained')).toBe(
      'Ancestry.com, "1880 United States Federal Census," Ancestry (2010); ' +
        'https://www.ancestry.com/search/collections/6742 : accessed 16 June 2026.',
    );
  });

  it('formats a census record with its specific locators', () => {
    expect(formatCitation(census, 'evidenceExplained')).toBe(
      '1880 U.S. census, Cook County, Illinois, ED 042, sheet 7B, dwelling 101, family 103, John Smith; ' +
        'Ancestry (https://www.ancestry.com/discoveryui-content/view/12345 : accessed 16 June 2026).',
    );
  });
});

describe('academic styles (structure)', () => {
  it('MLA quotes the title and notes the access date', () => {
    const out = formatCitation(website, 'mla');
    expect(out).toContain('"1880 United States Federal Census."');
    expect(out).toContain('Accessed 16 June 2026.');
  });

  it('APA leads with the date in parens', () => {
    expect(formatCitation(website, 'apa')).toContain('(2010).');
  });

  it('Harvard uses "viewed" and angle-bracketed URL', () => {
    const out = formatCitation(website, 'harvard');
    expect(out).toContain('viewed 16 June 2026');
    expect(out).toContain('<https://www.ancestry.com/search/collections/6742>');
  });

  it('Chicago builds the (Publisher, Date) imprint', () => {
    expect(formatCitation(website, 'chicago')).toContain('(Ancestry, 2010)');
  });

  it('NGSQ appends the database credit with access date', () => {
    expect(formatCitation(website, 'ngsq')).toContain(
      '; Ancestry, https://www.ancestry.com/search/collections/6742 : accessed 16 June 2026.',
    );
  });
});

describe('invariants across every style', () => {
  for (const style of CITATION_STYLES) {
    it(`${style}: no placeholders, trimmed, single-spaced`, () => {
      const out = formatCitation(website, style);
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toMatch(/undefined|null/);
      expect(out).not.toMatch(/\s{2,}/);
      expect(out).toBe(out.trim());
    });
  }

  it('does not emit stray placeholders for a sparse record', () => {
    const sparse: CitationRecord = { sourceType: 'website', title: 'Some Page' };
    for (const style of CITATION_STYLES) {
      const out = formatCitation(sparse, style);
      expect(out).not.toMatch(/undefined|null/);
    }
  });
});

describe('deriveSourceMetadata (fixes the legacy title/publisher mis-split)', () => {
  it('keeps a bulleted title intact and takes the publisher from the domain (Wave invoice)', () => {
    expect(
      deriveSourceMetadata({
        url: 'https://next.waveapps.com/c6649ee8/invoices/2155475081466295994/view',
        title: 'Wave • SimpleRain, Inc. • Invoice Datafutures-24',
      }),
    ).toEqual({
      title: 'Wave • SimpleRain, Inc. • Invoice Datafutures-24', // NOT mangled to "...Datafutures" / publisher "24"
      publisher: 'Wave',
      domain: 'Next.waveapps.com',
    });
  });

  it('strips a trailing site-name segment ("… - Ancestry.com")', () => {
    expect(
      deriveSourceMetadata({
        url: 'https://www.ancestry.com/discoveryui-content/view/123',
        title: 'John Smith in the 1880 Census - Ancestry.com',
      }),
    ).toEqual({
      title: 'John Smith in the 1880 Census',
      publisher: 'Ancestry',
      domain: 'Ancestry.com',
    });
  });

  it('maps a known site and preserves a word-internal hyphen in the kept title', () => {
    expect(
      deriveSourceMetadata({
        url: 'https://www.findagrave.com/memorial/123/john-smith',
        title: 'John Smith (1820-1880) - Find a Grave Memorial',
      }),
    ).toEqual({
      title: 'John Smith (1820-1880)',
      publisher: 'Find a Grave',
      domain: 'Findagrave.com',
    });
  });

  it('returns empty fields for empty input', () => {
    expect(deriveSourceMetadata({})).toEqual({ title: '', publisher: '', domain: '' });
  });
});
