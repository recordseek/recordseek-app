import { test } from 'node:test';
import assert from 'node:assert/strict';
import europeana from './europeana.js';
import digitalnz from './digitalnz.js';
import dpla from './dpla.js';
import trove from './trove.js';
import { detect } from './index.js';

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });
const status = (s) => async () => ({ ok: false, status: s, json: async () => ({}) });
const ctx = (f) => ({ fetch: f, key: 'K' });

test('url matching', () => {
  assert.equal(europeana.match('https://www.europeana.eu/en/item/90402/SK_A_2344?x=1'), '90402/SK_A_2344');
  assert.equal(europeana.match('https://www.europeana.eu/item/90402/SK_A_2344'), '90402/SK_A_2344');
  assert.equal(europeana.match('https://www.europeana.eu/en/search?query=x'), null);
  assert.equal(digitalnz.match('https://digitalnz.org/records/37954231?text=x'), '37954231');
  assert.equal(digitalnz.match('https://digitalnz.org/records'), null);
  assert.equal(dpla.match('https://dp.la/item/EB930B2F9AD638F921429E5E898F0A34'), 'eb930b2f9ad638f921429e5e898f0a34');
  assert.equal(dpla.match('https://dp.la/search?q=x'), null);
  assert.equal(trove.match('https://trove.nla.gov.au/newspaper/article/12345678'), 'article:12345678');
  assert.equal(trove.match('https://nla.gov.au/nla.news-article12345678'), 'article:12345678');
  assert.equal(trove.match('https://trove.nla.gov.au/work/9876'), 'work:9876');
  assert.equal(detect('https://example.com/x'), null);
  assert.equal(detect('https://digitalnz.org/records/5').provider.name, 'digitalnz');
});

test('europeana normalises and builds the request', async () => {
  let called;
  const body = { object: {
    type: 'IMAGE',
    agents: [{ about: 'urn:a', prefLabel: { en: ['Vermeer, Johannes'] } }],
    organizations: [{ about: 'o', prefLabel: { en: ['Rijksmuseum'] } }],
    aggregations: [{ edmDataProvider: { def: ['http://data.europeana.eu/organization/4579'] }, edmRights: { def: ['http://creativecommons.org/publicdomain/mark/1.0/'] }, edmObject: 'https://img/x.jpg' }],
    proxies: [
      { europeanaProxy: true, dctermsCreated: { def: ['#1660'] } },
      { europeanaProxy: false, dcTitle: { en: ['The Milkmaid'], nl: ['Het melkmeisje'] }, dcCreator: { def: ['urn:a'] }, dctermsCreated: { def: ['1660'] },
        dcIdentifier: { def: ['http://hdl.handle.net/1', 'SK-A-2344'] }, dcLanguage: { def: ['nl'] }, dcDescription: { en: ['x'.repeat(900)] }, dctermsIsPartOf: { def: ['collection: paintings'] } },
    ],
  } };
  const r = await europeana.fetch('90402/SK_A_2344', ctx(async (u) => { called = u; return ok(body)(); }));
  assert.match(called, /api\.europeana\.eu\/record\/v2\/90402\/SK_A_2344\.json\?wskey=K/);
  assert.equal(r.title, 'The Milkmaid');
  assert.deepEqual(r.creator, ['Vermeer, Johannes']);
  assert.equal(r.date, '1660');
  assert.equal(r.repository, 'Rijksmuseum');
  assert.equal(r.sourceType, 'image');
  assert.equal(r.identifier, 'SK-A-2344');
  assert.equal(r.permalink, 'https://www.europeana.eu/item/90402/SK_A_2344');
  assert.equal(r.collection, 'collection: paintings');
  assert.ok(r.description.length <= 500);
});

test('digitalnz normalises and sends the token header', async () => {
  let h;
  const body = { record: { title: 'NZ Grand Prix', creator: ['Wilson, John'], display_date: '1961-01-07', display_content_partner: 'Auckland Libraries',
    collection_title: ['Photographs', 'Herald'], category: ['Images'], dnz_type: 'Unknown', rights: 'All rights reserved', dc_identifier: ['1370-198', 'http://x'],
    thumbnail_url: 'https://t/x.jpg', description: 'd', language: [] } };
  const r = await digitalnz.fetch('1', ctx(async (u, o) => { h = o.headers; return ok(body)(); }));
  assert.equal(h['Authentication-Token'], 'K');
  assert.equal(r.repository, 'Auckland Libraries');
  assert.deepEqual(r.creator, ['Wilson, John']);
  assert.equal(r.date, '1961-01-07');
  assert.equal(r.sourceType, 'image');
  assert.equal(r.recordType, 'images');
  assert.equal(r.identifier, '1370-198');
  assert.equal(r.permalink, 'https://digitalnz.org/records/1');
});

test('dpla normalises', async () => {
  const body = { docs: [{ id: 'a'.repeat(32), object: 'http://t.jpg', dataProvider: { name: 'Middlebury College' },
    sourceResource: { title: ['Lincoln Village'], creator: ['Beers, F. W.'], date: [{ displayDate: '1871-01-01T00:00:00Z' }], publisher: ['New York: Beers'],
      identifier: ['vtmaps_1'], rights: ['r'], type: 'image', description: ['desc'], spatial: [{ name: 'Lincoln (Vt.)' }] } }] };
  const r = await dpla.fetch('a'.repeat(32), ctx(ok(body)));
  assert.equal(r.title, 'Lincoln Village');
  assert.equal(r.date, '1871-01-01');
  assert.equal(r.repository, 'Middlebury College');
  assert.equal(r.publisher, 'New York: Beers');
  assert.equal(r.place, 'Lincoln (Vt.)');
  assert.equal(r.sourceType, 'image');
});

test('trove newspaper article (v3 shaped fixture)', async () => {
  let u, h;
  const body = { id: '12345678', heading: 'LOCAL AND GENERAL.', category: 'Article',
    title: { id: '35', title: 'The Sydney Morning Herald (NSW : 1842 - 1954)' }, date: '1925-04-02', page: '5', pageSequence: '5', edition: 'Late Final',
    identifier: 'https://nla.gov.au/nla.news-article12345678', troveUrl: 'https://trove.nla.gov.au/newspaper/article/12345678',
    wordCount: 120, articleText: 'Some text' };
  const r = await trove.fetch('article:12345678', ctx(async (url, o) => { u = url; h = o.headers; return ok(body)(); }));
  assert.match(u, /api\.trove\.nla\.gov\.au\/v3\/newspaper\/12345678\?encoding=json&include=/);
  assert.equal(h['X-API-KEY'], 'K');
  assert.equal(r.title, 'LOCAL AND GENERAL.');
  assert.equal(r.newspaper, 'The Sydney Morning Herald (NSW : 1842 - 1954)');
  assert.equal(r.date, '1925-04-02');
  assert.equal(r.page, '5');
  assert.equal(r.edition, 'Late Final');
  assert.equal(r.permalink, 'https://trove.nla.gov.au/newspaper/article/12345678');
  assert.equal(r.recordType, 'article');
});

test('trove work (v3 shaped fixture)', async () => {
  let u;
  const body = { id: '9876', title: 'A history of Sydney', contributor: ['Smith, John'], issued: '1990', type: ['Book'], language: 'English',
    abstract: 'About Sydney', troveUrl: 'https://trove.nla.gov.au/work/9876', identifier: [{ type: 'isbn', value: '978' }] };
  const r = await trove.fetch('work:9876', ctx(async (url) => { u = url; return ok(body)(); }));
  assert.match(u, /\/v3\/work\/9876\?encoding=json/);
  assert.deepEqual(r.creator, ['Smith, John']);
  assert.equal(r.date, '1990');
  assert.equal(r.sourceType, 'book');
  assert.equal(r.identifier, '978');
});

test('404 and 5xx map to distinct errors', async () => {
  await assert.rejects(() => digitalnz.fetch('1', ctx(status(404))), { name: 'Error', message: 'not found' });
  await assert.rejects(() => digitalnz.fetch('1', ctx(status(500))), /upstream HTTP 500/);
  await assert.rejects(() => digitalnz.fetch('1', ctx(async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); })), /timeout/);
});
