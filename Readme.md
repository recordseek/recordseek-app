# RecordSeek

Turn any web page into a properly-formatted genealogical source citation and
attach it to a person in your FamilySearch tree (or save it to Ancestry) — with
almost no effort. A browser extension scrapes the current page into a
`recordseek.com/share/?…` URL; this web app decodes it, builds a citation, and
walks the user through finding the person and writing the source into FamilySearch.

This repository is a fully-tested TypeScript monorepo. It replaced the legacy
AngularJS 1.x app (`app/`), the PHP site (`public/`) and the `api/` backend; those
were removed from `master` and their history lives on the **`legacy`** branch.

## Monorepo layout

```
packages/
  core/   @recordseek/core  — framework-agnostic, fully unit-tested TS:
            • share-params    parse the extension's /share/?… capture URL
            • url-normalize   Ancestry/BillionGraves URL canonicalization
            • citation        pluggable citation engine (Evidence Explained,
                              Chicago, NGSQ, MLA, APA, Harvard + GEDCOM-X)
            • familysearch    typed, promise-based wrapper over fs-js-lite v3
                              (PKCE S256, token store, FsApiError)
  web/    @recordseek/web   — Vite 8 + React 19 + TypeScript SPA
```

Stack: TypeScript 7, React 19, React Router 7 (hash routing), Vite 8, Vitest 5,
Sentry 11, pnpm workspaces.

## Develop

Requires Node ≥ 22.12 (CI runs Node 24) and pnpm 9.

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

The FamilySearch client (`@recordseek/core`) wraps the official
[fs-js-lite](https://github.com/FamilySearch/fs-js-lite) **v3** SDK. npm only
carries the old 2.x release, so it is installed from GitHub, pinned to commit
`575dc7b` (v3.0.0; see `packages/core/package.json`). In the browser it uses
XMLHttpRequest (the package's `browser` field swaps out the axios handler).
The wrapper adds promises, typed resource helpers and `FsApiError`, and is
configured with an app key, environment, and redirect URI:

- **redirect_uri parity** — production uses `https://recordseek.com/share/`
  (trailing slash); local dev uses `http://localhost:9000` (root, no `/share/`).
  Both must be registered against the FamilySearch app key (FS requires exact
  matches, no wildcards). See `resolveRedirectUri()` in `packages/core`.
- **OAuth** — authorization-code flow with **PKCE (S256)**.
- **Hosts** come from fs-js-lite, derived from `environment` (`production` | `beta` | `integration`).

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
- **`.github/workflows/deploy-stage.yml`** — on every push to **`master`**:
  runs the same checks, then builds with `pnpm --filter @recordseek/web build:pages`
  (`vite build --mode pages`, which sets Vite `base` to `/recordseek-app/`) and
  publishes `packages/web/dist` to **GitHub Pages**.

**Stage URL:** https://recordseek.github.io/recordseek-app/

One-time setup in **Settings → Pages**: set **Source = "GitHub Actions"** (the
workflow also attempts to enable this automatically via `configure-pages`).

Optional repo **Variables** (Settings → Secrets and variables → Actions →
Variables) configure the FamilySearch client at build time; both are optional:

| Variable | Purpose |
|---|---|
| `VITE_FS_APP_KEY` | FamilySearch app key |
| `VITE_FS_ENV` | `production` \| `beta` \| `integration` |

> **Stage login:** the stage build sends FamilySearch back to
> `https://recordseek.github.io/recordseek-app/` (the redirect follows Vite's
> `base`). FamilySearch only accepts registered redirect URIs, so that URL must
> be added to the app key's redirect list in the FamilySearch developer portal
> before login works on stage.

## Status

| Area | State |
|---|---|
| Monorepo + Vitest test runner | ✅ done |
| `@recordseek/core` (share-params, url-normalize, citation, familysearch) | ✅ done, unit-tested |
| FamilySearch API validation + fs-js-lite v3 / PKCE client | ✅ done (live verify pending) |
| Web app (shell, routing, capture, wizard screens) | ✅ done |
| Browser extension → Manifest V3 | ⏳ |
| genscrape update | ⏳ |

## Legacy code

The AngularJS app, PHP site and API were deleted from `master`; browse them on
the `legacy` branch (`git checkout legacy`).
