import { getJson, emptyRecord, strs, str, clip, arr } from '../util.js';

const ARTICLE = [
  /^https?:\/\/(?:www\.)?trove\.nla\.gov\.au\/newspaper\/article\/(\d+)/i,
  /^https?:\/\/(?:www\.)?trove\.nla\.gov\.au\/ndp\/del\/article\/(\d+)/i,
  /^https?:\/\/(?:www\.)?nla\.gov\.au\/nla\.news-article(\d+)/i,
];
const WORK = /^https?:\/\/(?:www\.)?trove\.nla\.gov\.au\/work\/(\d+)/i;

export default {
  name: 'trove',
  keyEnv: 'TROVE_API_KEY',
  /** Id is "article:<n>" or "work:<n>". */
  match(url) {
    for (const re of ARTICLE) {
      const m = re.exec(url);
      if (m) return `article:${m[1]}`;
    }
    const w = WORK.exec(url);
    return w ? `work:${w[1]}` : null;
  },
  async fetch(id, { fetch: fetchFn, key }) {
    const [kind, n] = id.split(':');
    const headers = { 'X-API-KEY': key };
    if (kind === 'article') {
      const data = await getJson(fetchFn, `https://api.trove.nla.gov.au/v3/newspaper/${n}?encoding=json&include=articletext`, headers);
      return normaliseArticle(data, n);
    }
    const data = await getJson(fetchFn, `https://api.trove.nla.gov.au/v3/work/${n}?encoding=json`, headers);
    return normaliseWork(data, n);
  },
};

export function normaliseArticle(a, n) {
  const r = emptyRecord();
  const title = a.title && typeof a.title === 'object' ? a.title : {};
  r.title = str(a.heading);
  r.date = str(a.date);
  r.publisher = str(title.title);
  r.collection = str(title.title);
  r.repository = 'National Library of Australia (Trove)';
  r.sourceType = 'book';
  r.recordType = str(a.category).toLowerCase() || 'newspaper article';
  r.language = 'English';
  r.identifier = str(a.identifier) || `nla.news-article${n}`;
  r.permalink = str(a.troveUrl) || `https://trove.nla.gov.au/newspaper/article/${n}`;
  r.description = clip(a.articleText ?? a.snippet);
  r.rights = str(a.rights);
  r.page = str(a.page) || str(a.pageSequence);
  r.edition = str(a.edition);
  r.newspaper = str(title.title);
  r.creator = strs(a.byline);
  return r;
}

export function normaliseWork(w, n) {
  const r = emptyRecord();
  r.title = str(w.title);
  r.creator = strs(w.contributor);
  r.date = str(w.issued) || strs(w.date)[0] || '';
  r.publisher = strs(w.publisher)[0] ?? '';
  r.place = strs(w.placeOfPublication)[0] ?? '';
  r.repository = 'National Library of Australia (Trove)';
  r.collection = strs(w.isPartOf)[0] ?? '';
  const types = strs(w.type);
  r.recordType = (types[0] ?? '').toLowerCase();
  r.sourceType = /image|photo|picture/i.test(types.join(' ')) ? 'image' : /book|article|journal|manuscript|map|periodical/i.test(types.join(' ')) ? 'book' : 'database';
  r.language = strs(w.language)[0] ?? '';
  r.rights = str(w.rights);
  r.identifier = str(arr(w.identifier).find((i) => i?.type !== 'url' && i?.value)?.value) || String(n);
  r.permalink = str(w.troveUrl) || `https://trove.nla.gov.au/work/${n}`;
  r.description = clip(w.abstract ?? w.notes);
  return r;
}
