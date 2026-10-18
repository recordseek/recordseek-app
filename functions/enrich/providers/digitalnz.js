import { getJson, emptyRecord, strs, str, clip, arr } from '../util.js';

const ITEM = /^https?:\/\/(?:www\.)?digitalnz\.org\/records\/(\d+)/;

const CATEGORY_TYPE = { Images: 'image', Books: 'book', Newspapers: 'book', Manuscripts: 'book', Documents: 'book' };

export default {
  name: 'digitalnz',
  keyEnv: 'DIGITALNZ_API_KEY',
  match(url) {
    return ITEM.exec(url)?.[1] ?? null;
  },
  async fetch(id, { fetch: fetchFn, key }) {
    const data = await getJson(fetchFn, `https://api.digitalnz.org/records/${id}.json`, { 'Authentication-Token': key });
    return normalise(data.record ?? {}, id);
  },
};

export function normalise(rec, id) {
  const r = emptyRecord();
  r.title = str(rec.title);
  r.creator = strs([...arr(rec.creator), ...arr(rec.author)]);
  r.date = str(rec.display_date) || strs(rec.date)[0] || '';
  r.place = strs(rec.placename)[0] || strs(rec.locality)[0] || '';
  r.publisher = strs(rec.publisher)[0] ?? '';
  r.repository = str(rec.display_content_partner) || strs(rec.content_partner)[0] || '';
  r.collection = strs(rec.collection_title)[0] ?? '';
  const category = strs(rec.category)[0] ?? '';
  const dnz = str(rec.dnz_type);
  r.recordType = (dnz && dnz !== 'Unknown' ? dnz : category).toLowerCase();
  r.sourceType = CATEGORY_TYPE[category] ?? 'database';
  r.language = strs(rec.language)[0] ?? '';
  r.rights = str(rec.rights) || strs(rec.usage)[0] || '';
  r.identifier = strs(rec.dc_identifier).find((s) => !/^https?:/i.test(s)) ?? String(id);
  r.permalink = `https://digitalnz.org/records/${id}`;
  r.thumbnail = str(rec.thumbnail_url);
  r.description = clip(rec.description);
  return r;
}
