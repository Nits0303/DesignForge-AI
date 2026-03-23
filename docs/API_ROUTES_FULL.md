# DesignForge AI — Full HTTP API route map

Base URL: your deployment origin (e.g. `https://app.example.com`).  
Dynamic segments: `[id]`, `[num]`, `[jobId]`, `[exportId]`, `[itemId]`, `[assetId]` are path parameters.

Unless noted, routes expect a **session cookie** (NextAuth) or appropriate auth for that surface (e.g. plugin token for `/api/plugin/*`).

---

## Legend

| Auth | Meaning |
|------|---------|
| **Session** | Logged-in user cookie |
| **Admin** | `user.isAdmin` |
| **Plugin** | Figma plugin token / plugin session |
| **Public** | Unauthenticated or health checks |
| **Varies** | Check handler (e.g. share links) |

---

## Admin (Sprint 16+)

| Path | Typical methods | Auth |
|------|-----------------|------|
| `/api/admin/ab-tests` | GET, POST | Admin |
| `/api/admin/ab-tests/[id]` | GET, PATCH (`pause`, `resume`, `launch`, `cancel`, `force_conclude`) | Admin |
| `/api/admin/ab-tests/mde-preview` | GET (query: `n`, `baseline`, `alpha`, `power`) | Admin |
| `/api/admin/ab-test-suggestions` | GET, PATCH | Admin |
| `/api/admin/prompt-versions` | GET | Admin |
| `/api/admin/webhooks` | GET, POST | Admin |
| `/api/admin/webhooks/[id]` | PATCH, DELETE | Admin |
| `/api/admin/webhooks/[id]/deliveries` | GET (delivery log) | Admin |
| `/api/admin/learning/run-batch` | POST | Admin |

## Analytics

| Path | Notes |
|------|--------|
| `/api/analytics/admin/overview` | Admin dashboard aggregates (incl. promotion impact & attribution) |
| `/api/analytics/admin/prompt-scores` | Admin |
| `/api/analytics/admin/templates` | Admin |
| `/api/analytics/admin/learning` | Admin |
| `/api/analytics/admin/costs` | Admin |
| `/api/analytics/admin/batch` | Admin |
| `/api/analytics/admin/system-logs` | Admin |
| `/api/analytics/admin/export` | Admin CSV export |
| `/api/analytics/admin/recalculate` | Admin |
| `/api/analytics/admin/template-recommendations/[id]` | Admin |
| `/api/analytics/dashboard` | Session |
| `/api/analytics/costs` | Session |
| `/api/analytics/costs/summary` | Session |
| `/api/analytics/designs` | Session |
| `/api/analytics/export` | Session |
| `/api/analytics/learning` | Session |
| `/api/analytics/revisions` | Session |
| `/api/analytics/templates` | Session |

## Auth & user

| Path | Notes |
|------|--------|
| `/api/auth/[...nextauth]` | NextAuth |
| `/api/auth/me` | Session |
| `/api/auth/register` | Public |
| `/api/auth/forgot-password` | Public |
| `/api/auth/reset-password` | Public |
| `/api/auth/change-password` | Session |
| `/api/auth/disconnect-google` | Session |
| `/api/user/account` | Session (DELETE account) |
| `/api/user/export-data` | Session |

## Design & designs

| Path | Notes |
|------|--------|
| `/api/design/generate` | SSE stream, Session |
| `/api/design/revise` | Session |
| `/api/design/regenerate` | Session |
| `/api/design/regenerate-screen` | Session |
| `/api/design/extend-flow` | Session |
| `/api/design/[id]` | Session |
| `/api/design/[id]/approve` | Session |
| `/api/design/[id]/restore` | Session |
| `/api/design/[id]/share` | Varies |
| `/api/design/[id]/version/[num]` | Session |
| `/api/designs` | Session |
| `/api/designs/recent` | Session |

## Brands & uploads

| Path | Notes |
|------|--------|
| `/api/brands` | Session |
| `/api/brands/[id]` | Session |
| `/api/brands/[id]/assets` | Session |
| `/api/brands/[id]/assets/[assetId]` | Session |
| `/api/brands/[id]/duplicate` | Session |
| `/api/brands/[id]/set-default` | Session |
| `/api/upload/brand-asset` | Session |
| `/api/upload/image` | Session |

## Batch

| Path | Notes |
|------|--------|
| `/api/batch` | Session |
| `/api/batch/create` | Session |
| `/api/batch/[id]` | Session |
| `/api/batch/[id]/cancel` | Session |
| `/api/batch/[id]/metrics` | Session |
| `/api/batch/[id]/cost-summary` | Session |
| `/api/batch/[id]/approve-items` | Session |
| `/api/batch/[id]/remove-items` | Session |
| `/api/batch/[id]/retry-failed` | Session |
| `/api/batch/[id]/items/[itemId]/revision-metadata` | Session |
| `/api/batch/[id]/items/[itemId]/revision-complete` | Session |
| `/api/batch/template-csv` | Session |
| `/api/batch/upload-csv` | Session |

## Templates

| Path | Notes |
|------|--------|
| `/api/templates` | Session |
| `/api/templates/[id]` | Session |
| `/api/templates/admin/[id]` | Admin |
| `/api/templates/recommend` | Session |

## Projects & references

| Path | Notes |
|------|--------|
| `/api/projects` | Session |
| `/api/projects/[id]` | Session |
| `/api/references` | Session |
| `/api/references/[id]` | Session |
| `/api/references/[id]/activate` | Session |
| `/api/references/from-url` | Session |
| `/api/analyze/reference` | Session |

## Export

| Path | Notes |
|------|--------|
| `/api/export/bulk` | Session |
| `/api/export/bulk-status/[jobId]` | Session |
| `/api/export/code` | Session |
| `/api/export/image` | Session |
| `/api/export/pdf` | Session |
| `/api/export/figma-bridge` | Session |
| `/api/export/figma-plugin-notify` | Plugin / internal |
| `/api/export/status/[exportId]` | Session |
| `/api/exports/[designId]` | Session |

## Plugin (Figma)

| Path | Notes |
|------|--------|
| `/api/plugin/auth/verify` | Plugin |
| `/api/plugin/auth/refresh` | Plugin |
| `/api/plugin/token/create` | Plugin |
| `/api/plugin/token/revoke` | Plugin |
| `/api/plugin/token/status` | Plugin |
| `/api/plugin/designs` | Plugin |
| `/api/plugin/designs/[id]` | Plugin |
| `/api/plugin/designs/[id]/export-log` | Plugin |
| `/api/plugin/designs/[id]/version/[num]/html` | Plugin |
| `/api/plugin/notifications/pending` | Plugin |
| `/api/plugin/notifications/[id]/read` | Plugin |
| `/api/plugin/feedback/uncovered-classes` | Plugin |

## Misc

| Path | Notes |
|------|--------|
| `/api/dashboard/stats` | Session |
| `/api/preferences` | Session |
| `/api/preferences/[key]` | Session |
| `/api/settings/bootstrap` | Session |
| `/api/notifications/unread` | Session |
| `/api/notifications/mark-all-read` | Session |
| `/api/files/[...path]` | Varies (static/signed) |
| `/api/health` | Public |

---

## Machine-readable list

All `route.ts` files under `src/app/api` map to `/api/...` by replacing `src/app/api` with `/api` and removing `route.ts`.  
This document was generated to match that layout (see repo for the exact 108 route entrypoints).
