// Manual live smoke test: node smoke.js  (needs the api-keys env file loaded; never prints keys).
//   set -a; . ~/.config/recordseek/api-keys.env; set +a; node smoke.js
import { detect } from './providers/index.js';

const SAMPLES = [
  'https://www.europeana.eu/en/item/90402/SK_A_2344',
  'https://digitalnz.org/records/37954231',
  'https://dp.la/item/eb930b2f9ad638f921429e5e898f0a34',
  'https://trove.nla.gov.au/newspaper/article/12345678',
];
let failed = 0;
for (const url of SAMPLES) {
  const { provider, id } = detect(url);
  const key = process.env[provider.keyEnv];
  if (!key) { console.log(`SKIP ${provider.name} (no ${provider.keyEnv})`); continue; }
  try {
    const r = await provider.fetch(id, { fetch, key });
    const got = Object.entries(r).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k]) => k);
    console.log(`OK   ${provider.name}: ${r.title} | ${got.join(',')}`);
  } catch (e) { failed++; console.log(`FAIL ${provider.name}: ${e.message}`); }
}
process.exit(failed ? 1 : 0);
