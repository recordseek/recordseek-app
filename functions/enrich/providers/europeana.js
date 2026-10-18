import { getJson, emptyRecord, strs, str, clip, isUri, arr } from '../util.js';

const ITEM = /^https?:\/\/(?:www\.)?europeana\.eu\/(?:[a-z]{2}(?:-[A-Za-z]+)?\/)?item\/([0-9A-Za-z_]+)\/([0-9A-Za-z_\-.%]+)/;

/** Europeana language map ({en:[..], def:[..]}) -> strings, preferring English then language-neutral. */
export function langValues(map) {
  if (map == null) return [];
  if (typeof map === 'string' || Array.isArray(map)) return strs(map);
  for (const k of ['en', 'def']) if (map[k]) return strs(map[k]);
  const first = Object.values(map)[0];
  return strs(first);
}

const TYPE_MAP = { IMAGE: 'image', TEXT: 'book', SOUND: 'database', VIDEO: 'database', '3D': 'database' };

export default {
  name: 'europeana',
  keyEnv: 'EUROPEANA_API_KEY',
  match(url) {
    const m = ITEM.exec(url);
    return m ? `${m[1]}/${m[2]}` : null;
  },
  async fetch(id, { fetch: fetchFn, key }) {
    const data = await getJson(fetchFn, `https://api.europeana.eu/record/v2/${id}.json?wskey=${encodeURIComponent(key)}`);
    return normalise(data.object ?? {}, id);
  },
};

export function normalise(obj, id) {
  const r = emptyRecord();
  const proxies = arr(obj.proxies).filter((p) => !p.europeanaProxy);
  const pick = (field) => {
    for (const p of proxies) {
      const v = langValues(p[field]).filter((s) => !isUri(s));
      if (v.length) return v;
    }
    return [];
  };
  const agentsByUri = new Map(arr(obj.agents).map((a) => [a.about, langValues(a.prefLabel)[0]]));

  r.title = pick('dcTitle')[0] ?? '';
  let creators = pick('dcCreator');
  if (!creators.length) {
    // Creators are sometimes only given as references into the agents list.
    const refs = proxies.flatMap((p) => ['dcCreator', 'dcContributor'].flatMap((f) => langValues(p[f])));
    creators = refs.map((u) => agentsByUri.get(u)).filter(Boolean);
  }
  if (!creators.length && arr(obj.agents).length === 1) creators = [...agentsByUri.values()].filter(Boolean);
  r.creator = [...new Set(creators)];
  r.date = pick('dcDate')[0] ?? pick('dctermsCreated')[0] ?? pick('dctermsIssued')[0] ?? '';
  r.place = pick('dctermsSpatial')[0] ?? '';
  r.publisher = pick('dcPublisher')[0] ?? '';
  const org = arr(obj.organizations)[0];
  const agg = arr(obj.aggregations)[0] ?? {};
  const dp = langValues(agg.edmDataProvider)[0];
  r.repository = (org && langValues(org.prefLabel)[0]) || (dp && !isUri(dp) ? dp : '') || '';
  r.collection = pick('dctermsIsPartOf')[0] ?? '';
  r.recordType = pick('dcType').find((s) => s) ?? str(obj.type).toLowerCase();
  const rawType = arr(proxies[0]?.edmType ?? obj.type)[0] ?? obj.type;
  r.sourceType = TYPE_MAP[String(rawType).toUpperCase()] ?? 'database';
  r.language = pick('dcLanguage')[0] ?? '';
  r.rights = langValues(agg.edmRights)[0] ?? '';
  r.identifier = pick('dcIdentifier').find((s) => !isUri(s)) ?? id;
  r.permalink = `https://www.europeana.eu/item/${id}`;
  r.thumbnail = str(agg.edmObject) || str(agg.edmIsShownBy);
  r.description = clip(pick('dcDescription')[0]);
  return r;
}
