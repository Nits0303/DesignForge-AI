# Sprint 16 — Status

## Implemented

- **Multi-step create wizard** — `/admin/tests/new` (`AdminAbTestCreateWizard`): basics → variants → power/MDE with curve, **sensitivity grid**, and **Bayesian / nightly evaluation** notes.
- **MDE** — `POST /api/admin/ab-tests` stores `minimumDetectableEffect`; `GET /api/admin/ab-tests/mde-preview`; `src/lib/learning/abTestMde.ts`.
- **Webhooks** — `/settings/webhooks`: create, **edit** (URL, events, optional new secret), pause/resume, delete, **delivery log** (`GET /api/admin/webhooks/[id]/deliveries`). PATCH responses omit raw secrets.
- **Admin overview** — Promotion chart + **pre/post 7d windows** around each promotion (`promotionAttribution`) with explicit **non-causal** methodology text.
- **Test detail** — Charts + **Launch / Pause / Resume / Cancel** (`AdminAbTestDetailActions`).
- **Prompt registry** — `DynamicPromptVersion`, promotion flow, `resolvePromptVersionForGeneration`.
- **Docs** — `docs/API.md`, **`docs/API_ROUTES_FULL.md`** (full route map), **`docs/OPS_PRISMA.md`** (migrations / CI).
- **Polish** — `AdminSectionErrorBoundary` on **admin templates**; webhooks UI uses fieldsets / `role="alert"` where appropriate.

## Operational notes

- **Prisma**: prefer `migrate deploy` in CI; see `docs/OPS_PRISMA.md` if shadow DB errors occur.
- **Causal impact**: pre/post tables are **descriptive** only; confounders remain.

## Sprint 16 completion

All items from the “remaining gaps” checklist (full API doc map, ops notes, webhook delivery UI + edit, test actions, attribution methodology, MDE sensitivity + Bayesian copy, admin error boundaries) are **addressed** in repo. Further work is optional product depth (e.g. formal experiment design tooling, full a11y/i18n audit).
