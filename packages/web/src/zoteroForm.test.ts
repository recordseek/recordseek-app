import { describe, it, expect } from 'vitest';
import { accessedIso, buildZoteroItem, isoDate, validateZoteroForm, type ZoteroForm } from './zoteroForm';
import { buildCapture } from './capture/CaptureContext';

const form = (over: Partial<ZoteroForm> = {}): ZoteroForm => ({
  title: 'Mike Ditka',
  url: 'https://www.findagrave.com/memorial/1/x',
  publisher: 'Find a Grave',
  accessed: '2026-10-18',
  ...over,
});

describe('accessedIso', () => {
  it('parses the real capture format ("18 October 2026")', () => {
    expect(accessedIso('18 October 2026')).toBe('2026-10-18');
    expect(accessedIso('1 January 2026')).toBe('2026-01-01');
    expect(accessedIso('31 December 2025')).toBe('2025-12-31');
  });

  it('round-trips what CaptureContext actually produces', () => {
    const ts = new Date(2026, 9, 18, 15, 30).getTime();
    const c = buildCapture(`http://localhost:9000/?_=${ts}&url=https%3A%2F%2Fdp.la%2F&title=DPLA`);
    expect(c.accessedDate).toBe('18 October 2026');
    expect(accessedIso(c.accessedDate)).toBe('2026-10-18');
  });

  it('falls back to today when unreadable', () => {
    const today = new Date(2026, 5, 2);
    expect(accessedIso('', today)).toBe('2026-06-02');
    expect(accessedIso('31 Foo 2026', today)).toBe('2026-06-02');
    expect(accessedIso('31 February 2026', today)).toBe('2026-06-02');
    expect(isoDate(today)).toBe('2026-06-02');
  });
});

describe('buildZoteroItem', () => {
  it('builds a webpage with websiteTitle, accessDate and tags', () => {
    expect(buildZoteroItem(form({ collectionKey: 'C1', tags: ['a', 'b'] }), 'KEY12345')).toEqual({
      itemType: 'webpage',
      key: 'KEY12345',
      version: 0,
      title: 'Mike Ditka',
      url: 'https://www.findagrave.com/memorial/1/x',
      websiteTitle: 'Find a Grave',
      accessDate: '2026-10-18T00:00:00Z',
      creators: [],
      tags: [{ tag: 'a' }, { tag: 'b' }],
      collections: ['C1'],
    });
  });

  it('omits empty optional fields', () => {
    const item = buildZoteroItem(form({ publisher: ' ', url: '' }));
    expect(item).not.toHaveProperty('websiteTitle');
    expect(item).not.toHaveProperty('url');
    expect(item.collections).toEqual([]);
  });
});

describe('validateZoteroForm', () => {
  it('requires a title and a full URL', () => {
    expect(validateZoteroForm(form())).toEqual({});
    expect(validateZoteroForm(form({ title: ' ' })).title).toBeTruthy();
    expect(validateZoteroForm(form({ url: 'nope' })).url).toBeTruthy();
  });
});
