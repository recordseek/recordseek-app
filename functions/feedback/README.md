# feedback

Cloud Run function that stores "Have an idea? Found a bug?" submissions from the
share app and the website.

- Project `recordseek`, region `us-central1`, URL https://us-central1-recordseek.cloudfunctions.net/feedback
- Stores to Firestore database **`recordseek`** (native mode), collection `feedback`
  (`type`, `message`, `email`, `page`, `source`, `release`, `status: "new"`, `createdAt`).
  The project's `(default)` database is a legacy, empty Datastore-mode one; don't use it.
- Runs as `feedback-fn@recordseek.iam.gserviceaccount.com` (Firestore write only).
- Only recordseek.com, recordseek.github.io and localhost origins may post; a hidden
  `website` field is a bot honeypot.

Deploy (uses the `recordseek-deployer` service account, no interactive login):

```sh
CLOUDSDK_ACTIVE_CONFIG_NAME=recordseek gcloud functions deploy feedback --gen2 \
  --runtime=nodejs22 --region=us-central1 --source=. --entry-point=feedback \
  --trigger-http --allow-unauthenticated \
  --service-account=feedback-fn@recordseek.iam.gserviceaccount.com \
  --max-instances=2 --memory=256Mi --set-env-vars=FIRESTORE_DATABASE=recordseek
```

Tests: `npm test`.
