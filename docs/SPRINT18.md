# Sprint 18 — External API & Team Collaboration (implementation status)

## Database

New models: `ApiKey`, `ApiUsageLog`, `WebhookDeliveryAttempt`, `ApiGenerationJob`, `Team`, `TeamMember`, `TeamInvitation`, `TeamInviteLink`, `WhiteLabelConfig`, `ActivityLog`.

Extended: `Design` (team + approval + `personalBrandInTeam`), `BrandProfile`, `Project`, `BatchJob`, `Template`, `TemplateCollection` — optional `teamId`.

Apply schema:

```bash
npx prisma generate
npx prisma db push
# or: npx prisma migrate dev --name sprint18_api_teams
```

## Implemented

- **Prisma schema** for API keys, usage logs, webhook attempts, teams, invitations, invite links, white-label, activity log, and team scoping fields.
- **`src/lib/auth/apiKeyAuth.ts`** — Bearer / `X-API-Key`, SHA-256 verification, per-tier Redis rate limits, async usage logging.
- **`src/lib/auth/teamPermissions.ts`** — role checks with Redis cache (5 min).
- **`src/constants/teamPermissions.ts`** — role matrix.
- **`src/constants/apiKeyPermissions.ts`** — scope labels (includes `design:approve`, `webhooks:test`, `keys:rotate`).
- **`src/lib/api/v1/envelope.ts`** + **`src/lib/api/v1/handleV1.ts`** — `success` + `requestId` + permission wrapper.
- **`src/lib/api/apiKeyFactory.ts`** — create key (`dfa_` + hex), hash, optional webhook secret.
- **`src/lib/api/webhookDelivery.ts`** — HMAC signing, POST, **`WebhookDeliveryAttempt` persistence** per attempt.
- **`src/lib/batch/createBatchJobForUser.ts`** — shared batch create (used by app + v1).
- **Session API keys** — `GET/POST /api/settings/api-keys`, `PATCH /api/settings/api-keys/[id]` (revoke **or** update name/permissions/webhook without rotating), `POST .../rotate`, **`GET /api/settings/api-keys/usage`** (30-day series).
- **External API (v1)** — `health`, `me`, designs list/detail/status/html/**generate** (sync **200** or async **202** + `GET /api/v1/jobs/generation/[id]`), **revise**, **export** (202 + export worker); approve; brands; templates; batch jobs; export job status; webhooks test; keys rotate.
- **Async generation** — `ApiGenerationJob` + Redis `v1_generation_queue`; inline `processApiGenerationJob` after enqueue; optional worker `npm run worker:v1-gen` (tsx); cron `POST /api/cron/v1-generation` with `CRON_SECRET`.
- **Webhook retries** — failed deliveries enqueue to Redis sorted set `webhook:retry_zset`; cron `POST /api/cron/webhook-retries`.
- **Teams** — `GET|POST /api/teams`; **`POST /api/teams/[teamId]/invitations`**, **`POST /api/teams/[teamId]/invite-links`**, **`POST /api/invite/team/accept`**, **`GET /api/teams/[teamId]/activity`**; pages `/teams`, `/teams/[slug]` (invites + activity), `/invite/team`.
- **Account** — `DELETE /api/user/account` **blocked** if user owns any team (`TEAM_OWNERSHIP`).
- **Settings** — `/settings/api` with `ApiSettingsClient` (keys + **usage chart**).
- **Docs** — `/docs/api` reference list; **`docs/SPRINT18.md`** (this file).
- **White-label** — `GET/PATCH /api/admin/white-label` (admin), **`GET /api/public/white-label`**, runtime theming in root `layout.tsx` (metadata + CSS variables when enabled).
- **Dashboard nav** — Teams, API Docs.

## Tooling note

- **Next.js 16** no longer ships a `next lint` CLI subcommand. The `npm run lint` script runs **`tsc --noEmit`** (same as `typecheck`). Add ESLint separately if you want style rules.

## Follow-ups (optional polish)

- Email delivery for team invitations (API returns `inviteUrl` today).
- Stronger locking if multiple v1 generation workers run hot.

## Ops

- **Cron** (Vercel or external): `POST /api/cron/v1-generation` and `POST /api/cron/webhook-retries` with header `x-cron-secret: $CRON_SECRET` (or `Authorization: Bearer $CRON_SECRET`).
- **Worker**: `npm run worker:v1-gen` (uses `npx tsx`) to drain Redis `v1_generation_queue` if you prefer a dedicated process.

## Brand API

- `PUT /api/brands/[id]` optional **`expectedUpdatedAt`** (ISO, must match `updatedAt`) — **409 CONFLICT** if stale.

See the Sprint 18 product spec for the full matrix.
