# enrich

Cloud Run function that turns a captured archive record URL into structured citation
metadata. It is a **fallback**: when the captured page already has the data, the share
app should not call the API (see `completeness.js`).

- URL https://enrich-3456kzpnna-uc.a.run.app (also `us-central1-recordseek.cloudfunctions.net/enrich`)
- Runs as `feedback-fn@recordseek.iam.gserviceaccount.com`; cache in Firestore DB `recordseek`,
  collection `enrich_cache` (doc id `sha256(provider+id)`, `expiresAt` = 30 days, TTL policy enabled on `expiresAt`; also checked on read).
- Same CORS allow-list as `feedback`. Per-instance rate limit 30 requests/min/IP. Upstream timeout 6 s; upstream errors are never cached.

## API

`GET ?url=<page URL>` or `POST {url, have}` returns
`{supported, provider, record, cached, fetchedAt}`; unrecognised URLs give `{supported:false}` (200).
`record` = `title, creator[], date, place, publisher, repository, collection, sourceType, recordType,
language, rights, identifier, permalink, thumbnail, description (<=500)`; `sourceType` is a
`CitationRecord` SourceType. Trove articles add `page`, `edition`, `newspaper`.
With POST, if `needsEnrichment(have)` is false the response is
`{supported:true, provider, skipped:'page-data-sufficient'}` and upstream is not called.
Statuses: 404 record not found, 502 upstream error, 429 rate limited, 403 origin.

## Providers

Each module in `providers/` exports `{name, keyEnv, match(url) -> id|null, fetch(id, {fetch, key})}`;
register new ones in `providers/index.js`.

| Provider | Item URL | Upstream | Key env |
|---|---|---|---|
| Europeana | `europeana.eu/<lang>/item/<dataset>/<id>` | `api.europeana.eu/record/v2/<id>.json?wskey=` | `EUROPEANA_API_KEY` |
| DigitalNZ | `digitalnz.org/records/<id>` | `api.digitalnz.org/records/<id>.json`, header `Authentication-Token` | `DIGITALNZ_API_KEY` |
| DPLA | `dp.la/item/<32 hex>` | `api.dp.la/v2/items/<id>?api_key=` | `DPLA_API_KEY` |
| Trove | `trove.nla.gov.au/newspaper/article/<id>`, `nla.gov.au/nla.news-article<id>`, `trove.nla.gov.au/work/<id>` | `api.trove.nla.gov.au/v3/newspaper/<id>`, `/v3/work/<id>`, header `X-API-KEY` | `TROVE_API_KEY` (skipped when unset; fixture-tested only) |

## Deploy

Keys are passed as env vars from `~/.config/recordseek/api-keys.env` (Secret Manager is enabled but the
deployer account cannot create secrets). Build a temp env file without echoing, then delete it:

```sh
export CLOUDSDK_ACTIVE_CONFIG_NAME=recordseek
set -a; . ~/.config/recordseek/api-keys.env; set +a
F=$(mktemp); { echo "FIRESTORE_DATABASE: recordseek"
  for k in EUROPEANA_API_KEY DIGITALNZ_API_KEY DPLA_API_KEY TROVE_API_KEY; do [ -n "$(printenv $k)" ] && echo "$k: \"$(printenv $k)\""; done; } > $F
gcloud functions deploy enrich --gen2 \
  --runtime=nodejs22 --region=us-central1 --source=. --entry-point=enrich \
  --trigger-http --allow-unauthenticated \
  --service-account=feedback-fn@recordseek.iam.gserviceaccount.com \
  --max-instances=3 --memory=256Mi --env-vars-file=$F; rm -f $F
# one-time: gcloud firestore fields ttls update expiresAt --collection-group=enrich_cache --enable-ttl --database=recordseek
```

## Tests

`npm test` (mocked fetch, no network). Live smoke test, manual: load the env file, then `npm run smoke`.
