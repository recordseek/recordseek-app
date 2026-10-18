import { getJson, NotFoundError, emptyRecord, strs, str, clip, arr } from '../util.js';

const ITEM = /^https?:\/\/(?:www\.)?dp\.la\/item\/([0-9a-f]{32})/i;

const TYPE_MAP = { image: 'image', 'still image': 'image', text: 'book', book: 'book' };

export default {
  name: 'dpla',
  keyEnv: 'DPLA_API_KEY',
  match(url) {
    return ITEM.exec(url)?.[1].toLowerCase() ?? null;
  },
  async fetch(id, { fetch: fetchFn, key }) {
    const data = await getJson(fetchFn, `https://api.dp.la/v2/items/${id}?api_key=${encodeURIComponent(key)}`);
    const doc = arr(data.docs)[0] ?? data;
    if (!doc || !doc.sourceResource) throw new NotFoundError('not found');
    return normalise(doc, id);
  },
};

export function normalise(doc, id) {
  const sr = doc.sourceResource ?? {};
  const r = emptyRecord();
  const nameOf = (v) => arr(v).map((x) => (typeof x === 'object' ? str(x?.name) : str(x))).filter(Boolean);
  r.title = strs(sr.title)[0] ?? '';
  r.creator = strs(sr.creator);
  const d = arr(sr.date)[0];
  r.date = d && typeof d === 'object' ? str(d.displayDate) || str(d.begin) : str(d);
  r.date = r.date.replace(/^(\d{4}-\d{2}-\d{2})T00:00:00Z$/, '$1');
  r.place = nameOf(sr.spatial)[0] ?? '';
  r.publisher = strs(sr.publisher)[0] ?? '';
  r.repository = str(doc.dataProvider?.name ?? arr(doc.dataProvider)[0]);
  r.collection = nameOf(sr.collection?.title ?? sr.collection)[0] ?? '';
  const type = strs(sr.type)[0] ?? '';
  r.recordType = type.toLowerCase();
  r.sourceType = TYPE_MAP[r.recordType] ?? 'database';
  r.language = nameOf(sr.language)[0] ?? '';
  r.rights = strs(sr.rights)[0] ?? '';
  r.identifier = strs(sr.identifier)[0] ?? id;
  r.permalink = `https://dp.la/item/${id}`;
  r.thumbnail = str(doc.object);
  r.description = clip(strs(sr.description)[0]);
  return r;
}
