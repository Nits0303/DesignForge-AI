# DesignForge AI — Internal API reference (Sprint 16)

**Full route index (all ~108 `route.ts` handlers):** see [`API_ROUTES_FULL.md`](./API_ROUTES_FULL.md).

Base URL: your deployment origin. All routes expect JSON unless noted. Authentication: **NextAuth session cookie** (browser) or equivalent session for server calls.

---

## Design generation (`/api/design/*`)

| Method | Route | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/design/generate` | User | Stream design generation (SSE). Body: `prompt`, `brandId`, optional `referenceImageUrl`, `projectId`, etc. |
| POST | `/api/design/revise` | User | Revision stream for a design. |
| GET | `/api/design/[id]` | User | Design detail. |

---

## Plugin (`/api/plugin/*`)

| Method | Route | Auth | Description |
|--------|------|------|-------------|
| * | `/api/plugin/*` | Plugin token / session | Figma plugin bridge; see route handlers under `src/app/api/plugin/`. |

---

## Analytics (admin)

| Method | Route | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/admin/overview` | Admin | Dashboard KPIs + charts + `abTestSummary` (Sprint 16). |
| GET | `/api/analytics/admin/prompt-scores` | Admin | Prompt score table. |
| GET | `/api/analytics/admin/templates` | Admin | Template performance. |
| GET | `/api/analytics/admin/learning` | Admin | Learning engine stats. |
| GET | `/api/analytics/admin/costs` | Admin | Cost breakdown. |
| GET | `/api/analytics/admin/batch` | Admin | Batch analytics. |
| GET | `/api/analytics/admin/system-logs` | Admin | Batch job logs. |

---

## Admin — A/B testing & webhooks (Sprint 16)

| Method | Route | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/ab-tests` | Admin | List tests. |
| POST | `/api/admin/ab-tests` | Admin | Create draft test. Body: `name`, `description`, `platform`, `format`, `variants` (2–4, allocations sum 100), `minSamplesPerVariant`, `significanceThreshold`, `baselineRate` (0–1, default 0.5), optional `power` (default 0.8), `autoPromoteWinner`, `excludeNewUsers`, `holdbackPercent`. Persists computed `minimumDetectableEffect`. |
| GET | `/api/admin/ab-tests/mde-preview` | Admin | Query: `n`, `baseline`, `alpha`, `power` — returns absolute/relative MDE estimates. |
| GET | `/api/admin/ab-tests/[id]` | Admin | Test + `abResults` + `promotions`. |
| PATCH | `/api/admin/ab-tests/[id]` | Admin | `action`: `pause` \| `resume` \| `launch` \| `cancel` \| `force_conclude`. For `force_conclude`: `winnerVariantId`, optional `note`, optional `forcePromoteDespiteConflict` (409 if promotion conflict). |
| GET | `/api/admin/prompt-versions` | Admin | Registry + `SystemPromptDefault` rows. |
| GET | `/api/admin/ab-test-suggestions` | Admin | Pending `ABTestSuggestion` rows. |
| PATCH | `/api/admin/ab-test-suggestions` | Admin | Body: `{ id, status }` (e.g. `dismissed`). |
| GET | `/api/admin/webhooks` | Admin | List current user’s webhook configs. |
| POST | `/api/admin/webhooks` | Admin | Body: `{ url, secret?, events?, isActive? }`. URL must be **HTTPS**. |
| PATCH | `/api/admin/webhooks/[id]` | Admin | Update webhook. |
| DELETE | `/api/admin/webhooks/[id]` | Admin | Delete webhook. |

### Webhook delivery

- POST body JSON: `{ event, timestamp, ...payload }`.
- Header `X-DesignForge-Signature`: HMAC-SHA256 of body with webhook `secret`.
- Retries: 3 attempts with backoff 2s / 8s / 32s; 10s request timeout; redirects rejected.

### Webhook events

`test.started`, `test.result_updated`, `test.winner_detected`, `test.completed`, `test.promoted`.

---

## Settings — webhooks UI

- **Page**: `/settings/webhooks` (admin session). Uses the same `/api/admin/webhooks` routes as programmatic clients.

## Environment (see `.env.local.example`)

- `WEBHOOK_SIGNING_SECRET` — optional default secret when creating webhooks without an explicit secret.
- `REDIS_URL`, `DATABASE_URL` — required for app + A/B assignment cache.
