import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applyPrefill,
  buildZoteroItem,
  clearSchemaCache,
  emptyCreator,
  fallbackSchema,
  loadItemSchema,
  metaFromCapture,
  parseCreatorName,
  parseTags,
  switchItemType,
  validateZoteroForm,
  type ZoteroForm,
} from './zoteroForm';

const base = (over: Partial<ZoteroForm> = {}): ZoteroForm => ({
  itemType: 'webpage',
  fields: { title: 'Mike Ditka (1939-2026)', url: 'https://www.findagrave.com/memorial/1/x', accessDate: '2026-10-18', websiteTitle: 'Find a Grave' },
  creators: [],
  tags: '',
  citation: 'cite',
  notes: '',
  ...over,
});

describe('zoteroForm', () => {
  beforeEach(() => clearSchemaCache());

  it('builds a webpage payload with only valid fields', () => {
    const form = base({
      fields: { ...base().fields, publicationTitle: 'Nope', extra: '', date: '1939' },
      creators: [{ ...emptyCreator('author'), lastName: 'Ditka', firstName: 'Mike' }],
      tags: 'football, chicago',
      collectionKey: 'C1',
    });
    expect(buildZoteroItem(form, fallbackSchema('webpage'), 'KEY12345')).toEqual({
      itemType: 'webpage',
      key: 'KEY12345',
      title: 'Mike Ditka (1939-2026)',
      url: 'https://www.findagrave.com/memorial/1/x',
      accessDate: '2026-10-18T00:00:00Z',
      websiteTitle: 'Find a Grave',
      date: '1939',
      creators: [{ creatorType: 'author', lastName: 'Ditka', firstName: 'Mike' }],
      tags: [{ tag: 'football' }, { tag: 'chicago' }],
      collections: ['C1'],
    });
  });

  it('builds a newspaperArticle from a live schema', async () => {
    const f = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('Fields')
          ? [{ field: 'title', localized: 'Title' }, { field: 'publicationTitle', localized: 'Publication' }, { field: 'url', localized: 'URL' }]
          : [{ creatorType: 'author', localized: 'Author' }],
    })) as unknown as typeof fetch;
    const schema = await loadItemSchema('newspaperArticle', f);
    const form = switchItemType(base(), 'newspaperArticle', schema);
    const item = buildZoteroItem(form, schema);
    expect(item).toMatchObject({ itemType: 'newspaperArticle', publicationTitle: 'Find a Grave', title: 'Mike Ditka (1939-2026)' });
    expect(item).not.toHaveProperty('websiteTitle');
    expect(item).not.toHaveProperty('accessDate');
    await loadItemSchema('newspaperArticle', f);
    expect(f).toHaveBeenCalledTimes(2); // cached after the first load (fields + creator types)
  });

  it('falls back to the embedded schema when the fetch fails', async () => {
    const schema = await loadItemSchema('document', vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch);
    expect(schema.fields.map((x) => x.field)).toContain('archiveLocation');
  });

  it('keeps common fields when switching types and drops the rest from the payload', () => {
    const doc = fallbackSchema('document');
    const form = switchItemType(base({ fields: { ...base().fields, date: '1939', websiteTitle: 'Find a Grave' } }), 'document', doc);
    const item = buildZoteroItem(form, doc);
    expect(item).toMatchObject({ itemType: 'document', title: 'Mike Ditka (1939-2026)', date: '1939', publisher: 'Find a Grave' });
    expect(item).not.toHaveProperty('websiteTitle');
    // Switching back restores the website title (values are never discarded).
    expect(switchItemType(form, 'webpage', fallbackSchema('webpage')).fields.websiteTitle).toBe('Find a Grave');
  });

  it('remaps creator types the new type lacks', () => {
    const form = base({ itemType: 'document', creators: [{ ...emptyCreator('editor'), lastName: 'X' }] });
    expect(switchItemType(form, 'webpage', fallbackSchema('webpage')).creators[0]?.creatorType).toBe('author');
  });

  it('builds person and institution creators and drops empty rows', () => {
    const form = base({
      creators: [
        { ...emptyCreator('author'), lastName: 'Ditka', firstName: 'Mike' },
        { ...emptyCreator('contributor'), single: true, name: 'Find a Grave' },
        emptyCreator('author'),
        { ...emptyCreator('editor'), lastName: 'invalid for webpage' },
      ],
    });
    expect(buildZoteroItem(form, fallbackSchema('webpage')).creators).toEqual([
      { creatorType: 'author', lastName: 'Ditka', firstName: 'Mike' },
      { creatorType: 'contributor', name: 'Find a Grave' },
    ]);
  });

  it('parses names and tags', () => {
    expect(parseCreatorName('Ditka, Mike', 'author')).toMatchObject({ lastName: 'Ditka', firstName: 'Mike', single: false });
    expect(parseCreatorName('Mike Ditka', 'author')).toMatchObject({ lastName: 'Ditka', firstName: 'Mike' });
    expect(parseCreatorName('Ancestry', 'author')).toMatchObject({ single: true, name: 'Ancestry' });
    expect(parseTags(' a, b ,,A, c ')).toEqual([{ tag: 'a' }, { tag: 'b' }, { tag: 'c' }]);
  });

  it('prefills from capture metadata through one mapping', () => {
    const meta = metaFromCapture({
      publisher: 'Find a Grave',
      meta: { creators: ['Ditka, Mike'], date: '1939', place: 'Chicago', repository: 'Oak Hill', rights: 'CC', language: 'en' },
    });
    const form = applyPrefill({ ...base(), fields: { title: 'T' } }, meta, fallbackSchema('document'));
    expect(form.fields).toMatchObject({ publisher: 'Find a Grave', date: '1939', place: 'Chicago', archive: 'Oak Hill', rights: 'CC', language: 'en' });
    expect(form.creators).toEqual([{ creatorType: 'author', single: false, lastName: 'Ditka', firstName: 'Mike', name: '' }]);
    // never overwrites what the user typed
    expect(applyPrefill({ ...base(), fields: { date: 'mine' } }, meta, fallbackSchema('document')).fields.date).toBe('mine');
  });

  it('validates the title, url, accessed date and creators', () => {
    const schema = fallbackSchema('webpage');
    expect(validateZoteroForm(base(), schema)).toEqual({});
    const bad = base({
      fields: { title: ' ', url: 'nope', accessDate: '18/10/2026' },
      creators: [{ ...emptyCreator('author'), firstName: 'Mike' }, { ...emptyCreator('editor'), lastName: 'X' }],
    });
    expect(Object.keys(validateZoteroForm(bad, schema)).sort()).toEqual(['accessDate', 'creator-0', 'creator-1', 'title', 'url']);
  });
});
