# RecordSeek

Turn any web page into a properly-formatted genealogical source citation and
attach it to a person in your FamilySearch tree (or save it to Ancestry) — with
almost no effort. A browser extension scrapes the current page into a
`recordseek.com/share/?…` URL; this web app decodes it, builds a citation, and
walks the user through finding the person and writing the source into FamilySearch.

This repository is mid-migration from a legacy AngularJS 1.x app to a modern,
fully-tested TypeScript monorepo. See **Status** below.

## Monorepo layout

```
packages/
  core/   @recordseek/core  — framework-agnostic, fully unit-tested TS:
            • share-params    parse the extension's /share/?… capture URL
            • url-normalize   Ancestry/BillionGraves URL canonicalization
            • citation        pluggable citation engine (Evidence Explained,
                              Chicago, NGSQ, MLA, APA, Harvard + GEDCOM-X)
            • familysearch    fetch + PKCE FamilySearch client (replaces fs-js-lite)
  web/    @recordseek/web   — Vite + React + TypeScript SPA (replaces app/)
app/      legacy AngularJS 1.x app (being replaced; still the production source)
```

## Develop

Requires Node ≥ 20 and pnpm.

```bash
pnpm install         # install all workspaces
pnpm dev             # web app on http://localhost:9000  (legacy dev parity)
pnpm test            # run every package's test suite (Vitest)
pnpm typecheck       # strict tsc --noEmit across packages
pnpm build           # production build(s)
```

The dev server serves the capture URL at the **root** in development
(`http://localhost:9000/?_=…&url=…&h1=…&title=…&notes=…`), matching the legacy
behavior. In production the app is served under `/share/`.

## FamilySearch / config

The FamilySearch client (`@recordseek/core`) is configured with an app key,
environment, and redirect URI:

- **redirect_uri parity** — production uses `https://recordseek.com/share/`
  (trailing slash); local dev uses `http://localhost:9000` (root, no `/share/`).
  Both must be registered against the FamilySearch app key (FS requires exact
  matches, no wildcards). See `resolveRedirectUri()` in `packages/core`.
- **OAuth** — authorization-code flow with **PKCE (S256)**.
- **Hosts** are derived from `environment` (`production` | `beta` | `integration`).

Live end-to-end verification of the FamilySearch flow (create source → file in
collection → attach to person) requires a real app key and one human OAuth login.

## Deploy

### Local / production build

`pnpm --filter @recordseek/web build` emits a static bundle (`packages/web/dist`)
with assets at the site root (`/`). Routing is hash-based (`#/…`), so no SPA
server fallback is required. In production the app is served under `/share/`.

### CI (GitHub Actions)

- **`.github/workflows/ci.yml`** — on every PR (and pushes to `master`): install,
  `typecheck`, `test`, and build the web app.
- **`.github/workflows/deploy-stage.yml`** — on every push to **`modernization`**:
  runs the same checks, then builds with `pnpm --filter @recordseek/web build:pages`
  (`vite build --mode pages`, which sets Vite `base` to `/recordseek/`) and
  publishes `packages/web/dist` to **GitHub Pages**.

**Stage URL:** https://dovy.github.io/recordseek/

One-time setup in **Settings → Pages**: set **Source = "GitHub Actions"** (the
workflow also attempts to enable this automatically via `configure-pages`).

Optional repo **Variables** (Settings → Secrets and variables → Actions →
Variables) configure the FamilySearch client at build time; both are optional:

| Variable | Purpose |
|---|---|
| `VITE_FS_APP_KEY` | FamilySearch app key |
| `VITE_FS_ENV` | `production` \| `beta` \| `integration` |

> **Stage limitation:** live FamilySearch login does **not** work on the
> `dovy.github.io/recordseek/` stage — FamilySearch only honors a registered
> `redirect_uri`, and a `github.io` URL can't be registered for the app key.
> Everything else (UI, Ancestry hand-off, "Save to Somewhere Else"/citation,
> capture parsing) works. A future prod / custom-domain deploy (e.g.
> `recordseek.com`) restores the FS flow.

## Status

| Area | State |
|---|---|
| Monorepo + Vitest test runner | ✅ done |
| `@recordseek/core` (share-params, url-normalize, citation, familysearch) | ✅ done, unit-tested |
| FamilySearch API validation + fetch/PKCE client | ✅ done (live verify pending) |
| Web app shell, routing, capture bootstrap, citation switcher | 🔄 in progress |
| Remaining wizard screens (search → results → attach → create → complete) | ⏳ |
| Browser extension → Manifest V3 | ⏳ |
| genscrape update | ⏳ |

## Legacy app

The `app/` directory holds the original AngularJS 1.x app (Grunt/Bower). It
remains the production source until the `web/` rewrite reaches parity. Its run
instructions: `cd app && npm install && bower install && grunt serve`.
