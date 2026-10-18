# newsletter

Cloud Run function behind the opt-in "Get RecordSeek updates" invite in the share app.

- Project `recordseek`, region `us-central1`, URL https://us-central1-recordseek.cloudfunctions.net/newsletter
- Firestore database **`recordseek`** (native mode):
  - `subscribers/{sha256(lowercased email)}`: `email`, `accounts` (hashes), `source`, `release`,
    `confirmed: false`, `createdAt`, `updatedAt`. One email is one document.
  - `subscriber_accounts/{accountHash}`: `{ subscriber, linkedAt }`.
- Account hashes are `fs_`, `geni_` or `zotero_` + 32 hex, the same one-way scheme PostHog uses; the
  server never sees provider ids, names or emails of the accounts.
- `POST ?action=subscribe` `{ email, accounts, source, release, website }` (`website` is a bot honeypot).
- `POST ?action=status` `{ accounts }` returns `{ subscribed }` and never an email. When any account is
  linked, the others sent with it are linked to the same subscriber (one browser, one person).
- Runs as `feedback-fn@recordseek.iam.gserviceaccount.com`. Only recordseek.com, recordseek.github.io and
  localhost origins may post.

Deploy (uses the `recordseek-deployer` service account, no interactive login):

```sh
CLOUDSDK_ACTIVE_CONFIG_NAME=recordseek gcloud functions deploy newsletter --gen2 \
  --runtime=nodejs22 --region=us-central1 --source=. --entry-point=newsletter \
  --trigger-http --allow-unauthenticated \
  --service-account=feedback-fn@recordseek.iam.gserviceaccount.com \
  --max-instances=2 --memory=256Mi --set-env-vars=FIRESTORE_DATABASE=recordseek
```

Tests: `npm test`.
