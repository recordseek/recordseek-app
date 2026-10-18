# zotero-auth

Cloud Run function behind the share app's hidden Zotero and Geni destinations.

- Project `recordseek`, region `us-central1`, URL https://us-central1-recordseek.cloudfunctions.net/zotero-auth
- Runs as `feedback-fn@recordseek.iam.gserviceaccount.com` (no extra permissions needed).
- Same allowed origins as `feedback` (recordseek.com, recordseek.github.io, localhost).

## Endpoints

- `GET ?action=start&return=<share url>` gets an OAuth 1.0a request token (HMAC-SHA1), keeps the
  token secret and the return page in a 15-minute AES-GCM sealed `HttpOnly` cookie (the function
  is stateless), and 302s to zotero.org/oauth/authorize with write access.
- `GET ?action=callback` (Zotero returns here) exchanges the verifier for the access token and 302s to
  `<return>zotero-callback.html#zk=<api key>&zu=<userID>&zn=<username>`. The key rides in a URL
  fragment of a static page, so it is in no server log or history entry. The page stores it in
  localStorage `rs_zotero`.
- `POST ?action=geni&path=document/add` (or `document-N/tag/profile-N`) relays a form body to
  geni.com/api. Geni sends CORS headers only for www.geni.com and document writes are POST-only (no JSONP).
  The Geni token is passed straight through, never stored or logged. Other paths are rejected.

## Secrets

`ZOTERO_CLIENT_KEY` and `ZOTERO_CLIENT_SECRET` (in `~/.config/recordseek/api-keys.env`). The deployer
service account can't create Secret Manager secrets, so they are plain env vars on the function.

## Deploy

```sh
set -a; source ~/.config/recordseek/api-keys.env; set +a   # do not echo the values
CLOUDSDK_ACTIVE_CONFIG_NAME=recordseek gcloud functions deploy zotero-auth --gen2 \
  --runtime=nodejs22 --region=us-central1 --source=. --entry-point=zoteroAuth \
  --trigger-http --allow-unauthenticated \
  --service-account=feedback-fn@recordseek.iam.gserviceaccount.com \
  --max-instances=2 --memory=256Mi \
  --set-env-vars="ZOTERO_CLIENT_KEY=$ZOTERO_CLIENT_KEY,ZOTERO_CLIENT_SECRET=$ZOTERO_CLIENT_SECRET"
```

Check: `curl -sI '<url>?action=start&return=https://recordseek.com/share/'` answers 302 to zotero.org.

Tests: `npm test`.
