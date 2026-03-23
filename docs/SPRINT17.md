# Sprint 17 — Template Marketplace (implementation summary)

## Database

- **`Template`**: community fields (`contributorUserId`, submission/review workflow, marketplace metadata, `reviewClaimedAt`, ratings aggregates, flags, `similarityFlagged`, `renderCheckFailed`, etc.).
- **`TemplateInstallation`**, **`TemplateRating`**, **`TemplateCollection`**, **`TemplateReport`**.
- **Migration** `prisma/migrations/20260320140000_sprint17_marketplace_fts`: `reviewClaimedAt`, `search_vector` tsvector + GIN index + trigger to keep search vector updated.

Run: `npx prisma migrate deploy` (or `db push` in dev) and **`npx prisma generate`** (retry if Windows EPERM locks `query_engine`).

## API (high level)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/templates/marketplace` | Filters, sort, Redis list cache; FTS via `search_vector` when present |
| GET | `/api/templates/marketplace/[id]` | Detail + rating distribution (`groupBy`) |
| GET | `/api/templates/marketplace/[id]/reviews` | Paginated reviews; sort `rating` \| `recent` |
| POST/DELETE | `/api/templates/[id]/install` | Atomic `installCount` via `$executeRaw`; records install digest |
| POST | `/api/templates/[id]/rate` | Upsert rating + aggregate + cache bust |
| GET | `/api/templates/my-library`, `/api/templates/my-contributions` | |
| POST | `/api/templates/contribute` | Draft / submit; similarity + render checks; link policy |
| PUT | `/api/templates/[id]/contribute` | Update draft / resubmit / approved revision |
| PATCH | `/api/templates/installations/[id]` | Toggle `isActive` |
| POST | `/api/templates/[id]/report` | Moderation report + admin notification |
| GET | `/api/templates/collections`, `/api/templates/collections/[id]` | Public collections |
| POST | `/api/templates/collections/[id]/install-all` | Batch install |
| GET | `/api/admin/templates/review-queue` | |
| POST | `/api/admin/templates/[id]/claim-review` | Sets `under_review` + `reviewClaimedAt` |
| PUT | `/api/admin/templates/[id]/review` | Approve / request changes / reject |
| POST | `/api/admin/templates/review-bulk` | Bulk approve |
| GET | `/api/admin/templates/[id]` | Admin template payload (incl. HTML) |
| GET/POST | `/api/admin/template-collections` | |
| PUT | `/api/admin/template-collections/[id]` | |
| POST | `/api/cron/marketplace-stale-reviews` | Header `x-cron-secret: $CRON_SECRET` |
| POST | `/api/cron/marketplace-auto-collections` | Trending (7-day installs) / New collections |
| POST | `/api/cron/marketplace-install-digest` | Daily batched “your templates were installed” digest |

## UI

- `/templates` — marketplace grid + collections carousel  
- `/templates/[id]` — detail, install, report, **reviews** (sortable)  
- `/templates/contribute` (+ `/success`) — multi-step contribution  
- `/templates/guidelines`  
- `/templates/my-library`  
- `/templates/collections/[id]`  
- `/admin/templates/review`, `/admin/templates/review/[id]`  
- Sidebar **Templates** link; workspace **Template browser**: Contribute + **My library** section  
- Dashboard **New in the marketplace** widget  
- **Settings** — notification toggles: `notify_template_installed`, `notify_template_rated`  

## Learning batch (nightly)

`runLearningBatch` includes:

| Job name | Purpose |
|----------|---------|
| `contributor_reputation` | Recompute `contributorReputation` / `contributorTrusted` from approved templates |
| `marketplace_quality_flags` | Flag sustained low-rated templates (10+ ratings, avg &lt; 2.5); notify contributor + admins |

The consolidated **`learning_engine_audit`** row includes `contributorReputation` and `marketplaceQualityFlags` summaries in `auditDetails`.

## Ops / env

- **`CRON_SECRET`**: protect cron routes (`x-cron-secret` header).  
- **`REDIS_URL`**: marketplace list cache, rate limits, **install digest** keys (`marketplace:install_digest:{userId}:{date}`).  
- **`PUPPETEER_SERVICE_URL`**: optional; when set, contribution pipeline runs a render/thumbnail check via `puppeteerClient.thumbnail()`.  

## Stretch items (implemented)

- **Similarity check** on submit (cosine on Tailwind class tokens vs approved same platform/category).  
- **Render check** when Puppeteer service is configured.  
- **Contributor reputation** + **trusted** thresholds (batch job).  
- **Quality floor** automation + notifications.  
- **Install digest** cron + per-user prefs (`notify_template_installed`).  
- **Rating milestones** + prefs (`notify_template_rated`).  
- **Account deletion**: contributor unlinked + `source: community_legacy` (see `accountDeletionPurgeCron`).  
- **Reviews** API + template detail UI.  

## Known behaviour / caveats

- Templates pin Tailwind via CDN in HTML; see guidelines page for version-freezing note.  
- PostgreSQL trigger compatibility on older PG versions may need `EXECUTE PROCEDURE` vs `EXECUTE FUNCTION` in migration SQL.  
- **`marketplaceQualityFlagged`**: templates flagged by the nightly quality job are **hidden** from marketplace browse, detail, reviews, search FTS, trending/new collections, and **new installs** (403). List/detail caches are invalidated when a template is flagged.  
- Redis: install-digest cron and marketplace list cache invalidation use **`SCAN`** (not `KEYS`) for key enumeration.  
- Install digest notification deep-links to **`/templates/my-library?tab=contributions`**.  
