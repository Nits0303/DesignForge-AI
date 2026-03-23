# Sprint 15 — Custom Figma Plugin (implementation summary)

## Database

- **`PluginToken`** — SHA-256 hashed bearer tokens, 90-day expiry, `lastUsedAt`.
- **`PluginFeedback`** — arrays of uncovered Tailwind classes from the plugin translator.
- **`Notification.metadata`** (JSON) — e.g. `figma_push_ready` payload (`designId`, `shareToken`, `shareUrl`, …).
- **`Export.figmaFileKey` / `figmaNodeId`** — optional deep-link fields for plugin exports.

Migration: `prisma/migrations/20260320120000_sprint15_figma_plugin/migration.sql`  
Run: `npx prisma migrate deploy` (or `migrate dev`) and `npx prisma generate` (retry if Windows EPERM on `query_engine`).

## Backend (`src/app/api/plugin/`)

| Route | Auth |
|-------|------|
| `POST /api/plugin/token/create` | Session |
| `GET /api/plugin/token/status` | Session |
| `POST /api/plugin/token/revoke` | Session |
| `GET /api/plugin/auth/verify` | Bearer |
| `POST /api/plugin/auth/refresh` | Bearer |
| `GET /api/plugin/designs` | Bearer (Redis cache 120s) |
| `GET /api/plugin/designs/[id]` | Bearer |
| `GET /api/plugin/designs/[id]/version/[num]/html` | Bearer (plain HTML) |
| `POST /api/plugin/designs/[id]/export-log` | Bearer |
| `GET /api/plugin/notifications/pending` | Bearer |
| `POST /api/plugin/notifications/[id]/read` | Bearer |
| `POST /api/plugin/feedback/uncovered-classes` | Bearer |

- **`src/lib/auth/pluginAuth.ts`** — `validatePluginBearer`, `hashPluginToken`, `getMinimumPluginVersion` (`MINIMUM_PLUGIN_VERSION` env, default `1.0.0`).

## Workspace / settings

- **`/settings/integrations`** — token lifecycle, Figma Community link, dev manifest hint, disconnect.
- **Export modal → Figma** — “Have the plugin?” Yes/No (preference `figma_plugin_installed`). Yes → **`POST /api/export/figma-plugin-notify`** (creates share link + `figma_push_ready` notification). No → existing **html.to.design** flow.

## Figma plugin (`plugins/figma/`)

- **Build:** `npm run plugin:build` from repo root (or `cd plugins/figma && npm run build`).
- **Outputs:** `plugins/figma/dist/` — `code.js`, `ui.html`, `ui.js`, `manifest.json`.
- **Dev:** Figma → Plugins → Development → **Import plugin from manifest** → select `plugins/figma/dist/manifest.json`.
- **API base URL:** set `DESIGNFORGE_API_URL` when building the UI bundle (webpack `DefinePlugin` → `__API_BASE__`). Default `http://localhost:3000`.
- **Network:** extend `manifest.json` → `networkAccess.allowedDomains` for your production host.

### Implemented in plugin

- Preact UI: connect with token, **search**, **platform chips**, **paginated list** (load more), **refresh**, **30s polling** for `figma_push_ready` + **“Push now”** banner, **auto token refresh** when `refreshRecommended` &lt;7 days (`GET /api/plugin/auth/verify` + `POST /api/plugin/auth/refresh`).
- Main thread: `normalizeHtmlInput` unwraps **mobile multi-screen** JSON `string[]` into stacked `<section>` roots; HTML → `node-html-parser` + Tailwind resolver (many palettes, spacing, flex, shadows, borders, arbitrary `bg-[#hex]`, `w-[100px]`, etc.).
- **`<img>`**: main-thread `fetch` + `data:` URLs → `figma.createImage` + rectangle fill; **`apiBase`** on push resolves relative `<img src>`.
- `figma.clientStorage` for token; Vitest: resolver, html-parser, **fetchImageBytes**, **translateTree (mock figma)**.

### Roadmap (optional polish)

- **Gradients** (`bg-gradient-to-*`) and arbitrary background-image URLs / full CSS shadow parity.
- **Deeper layout** (margin, gap-x/y, counterAxisSpacing) and richer Figma text styles (Inter Italic/Bold matrix).
- **More snapshot tests** (golden layer trees) if desired.

## Known gaps & ops

- **Prisma migrate + generate** must be applied; Windows **EPERM** on `query_engine` → close Node/IDE and retry.
- **Redis** cache for `GET /api/plugin/designs` is **invalidated** on `Design` create/update/delete (via Prisma extension); TTL remains **120s** when not invalidated.
- **Platform filter** in API expects lowercase platform strings matching DB (e.g. `instagram`, `mobile`); plugin chips use the same ids.
- **Manifest** `allowedDomains` must include your production API origin or the plugin iframe fetch will fail.

## Env

- `MINIMUM_PLUGIN_VERSION` — returned from `/api/plugin/auth/verify`.
- `DESIGNFORGE_API_URL` — plugin UI build-time API origin.
