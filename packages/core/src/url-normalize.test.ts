import { describe, it, expect } from 'vitest';
import {
  stripBilliongravesHash,
  normalizeAncestryHost,
  cleanAncestrySearchUrl,
  normalizeUrl,
  extractDomain,
} from './url-normalize';

describe('stripBilliongravesHash', () => {
  it('strips the hash route from a BillionGraves URL', () => {
    expect(stripBilliongravesHash('https://billiongraves.com/grave/John/123#/foo')).toBe(
      'https://billiongraves.com/grave/John/123',
    );
  });
  it('leaves non-BillionGraves URLs (and their hashes) alone', () => {
    expect(stripBilliongravesHash('https://example.com/x#frag')).toBe('https://example.com/x#frag');
  });
});

describe('normalizeAncestryHost', () => {
  it.each([
    ['ancestryinstitution.com'],
    ['ancestrylibrary.com'],
    ['ancestrylibrary.proquest.com'],
    ['ancestryclassroom.com'],
  ])('collapses %s to ancestry.com', (host) => {
    expect(normalizeAncestryHost(`https://www.${host}/search/1`)).toBe('https://www.ancestry.com/search/1');
  });
  it('leaves plain ancestry.com unchanged', () => {
    expect(normalizeAncestryHost('https://www.ancestry.com/x')).toBe('https://www.ancestry.com/x');
  });
  it('leaves non-ancestry URLs untouched', () => {
    expect(normalizeAncestryHost('https://familysearch.org/x')).toBe('https://familysearch.org/x');
  });
});

describe('cleanAncestrySearchUrl', () => {
  it('keeps only the record-identifying params (dbid variant), dropping junk', () => {
    const url =
      'https://www.ancestry.com/search/collections/1234/?name=John&dbid=5678&h=999&_phsrc=abc&pid=111&foo=bar';
    expect(cleanAncestrySearchUrl(url)).toBe(
      'https://www.ancestry.com/search/collections/1234/?indiv=try&h=999&_phsrc=abc&pid=111&dbid=5678',
    );
  });

  it('uses the db key when dbid is absent and omits missing params', () => {
    const url = 'https://search.ancestry.com/cgi-bin/sse.dll?db=1850census&h=42&gss=x&pid=7';
    expect(cleanAncestrySearchUrl(url)).toBe(
      'https://search.ancestry.com/cgi-bin/sse.dll?indiv=try&h=42&pid=7&db=1850census',
    );
  });

  it('leaves non-Ancestry URLs untouched', () => {
    const url = 'https://familysearch.org/ark:/1?a=1&b=2';
    expect(cleanAncestrySearchUrl(url)).toBe(url);
  });
});

describe('normalizeUrl', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl(undefined)).toBe('');
  });

  it('composes host normalization + ancestry search cleanup', () => {
    const url = 'https://www.ancestryinstitution.com/search/collections/1234/?dbid=5678&h=999&junk=z';
    expect(normalizeUrl(url)).toBe(
      'https://www.ancestry.com/search/collections/1234/?indiv=try&h=999&dbid=5678',
    );
  });

  it('strips the BillionGraves hash', () => {
    expect(normalizeUrl('https://billiongraves.com/grave/Jane/42#/tab')).toBe(
      'https://billiongraves.com/grave/Jane/42',
    );
  });

  it('leaves an ordinary captured URL unchanged', () => {
    const url = 'https://next.waveapps.com/c6649ee8/invoices/2155475081466295994/view';
    expect(normalizeUrl(url)).toBe(url);
  });
});

describe('extractDomain', () => {
  it.each([
    ['https://www.ancestry.com/search/1', 'Ancestry.com'],
    ['https://next.waveapps.com/x', 'Next.waveapps.com'],
    ['https://recordseek.com/', 'Recordseek.com'],
    ['http://localhost:9000/?x=1', 'Localhost:9000'],
  ])('%s -> %s', (url, expected) => {
    expect(extractDomain(url)).toBe(expected);
  });

  it('returns empty string when no host can be parsed', () => {
    expect(extractDomain('not-a-url')).toBe('');
    expect(extractDomain('')).toBe('');
    expect(extractDomain(null)).toBe('');
  });
});
