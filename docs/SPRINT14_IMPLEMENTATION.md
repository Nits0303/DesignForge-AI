# Sprint 14 — Mobile App UI (implementation status)

## Delivered in this pass

- **Platforms (`src/constants/platforms.ts`)** — Mobile formats: `onboarding_flow`, `home_feed`, `profile_screen`, `settings_screen`, `auth_flow`, `product_detail`, `checkout_flow`, `search_screen`, `notification_screen`, `empty_state`, `dashboard_screen`, `map_screen`, `chat_screen`, `media_player`, plus legacy `screen`. Default size **390×844**.
- **Devices & safe areas (`src/constants/mobileDevices.ts`)** — Presets: iOS Standard/Small, Android Standard/Large, Tablet; `applyOrientation` for landscape.
- **App categories (`src/constants/mobileAppCategories.ts`)** — Style notes per category for prompts.
- **Parsed intent (`src/types/ai.ts`)** — `appOS`, `appCategory`, `appTheme`, `screenPlan`, `MobileScreenDescriptor`.
- **Smart Router v2 (`src/lib/ai/prompts/smartRouterSystemPrompt.ts` + `smartRouter.ts`)** — Mobile rules and merged JSON fields.
- **Prompt assembly** — `<mobile_context>` + per-screen `<current_screen>` / `<previous_screens>` via `mobilePromptBlocks.ts` and `mobileConventions.ts`.
- **Mobile flow generator (`src/lib/ai/mobileFlowGenerator.ts`)** — Flows when `platform === "mobile"` and format ends with `_flow`. Screen plan from router or Haiku; sequential Sonnet generations with structural summary context; **Haiku plan tokens/cost** folded into `costUsd`; `htmlContent` stored as **JSON string array**.
- **Single-screen generator (`src/lib/ai/mobileSingleScreenGenerator.ts`)** — Shared Sonnet + post-process path for **regenerate-screen** and **extend-flow**.
- **Orchestrator** — Runs mobile flow before website multi-section; sets `DesignVersion.isMultiScreen` / `screenCount`.
- **Prisma** — `DesignVersion.isMultiScreen`, `DesignVersion.screenCount`.
- **SSE** — `screen_start`, `screen_complete` in `/api/design/generate`; client updates in `useDesignGeneration` (including JSON array preview on complete).
- **Component selector** — OS/category relevance boost for mobile.
- **Seeds** — `prisma/seed/tier2/mobile.ts` (**34** templates: 8 curated + 26 pattern variants); Tier 3 mobile patterns; `seed/index.ts` wired.
- **Phone frames** — `WorkspacePreviewPanel` uses `IosFrame` / `AndroidFrame` / `TabletFrame` + `MobileStatusBar`; device switcher + portrait/landscape bound to **`activeDeviceId` / `deviceOrientation`** (`useWorkspaceStore`).
- **Post-process** — `htmlPostProcessor` injects **CSS safe-area** (`env(safe-area-inset-*)`) for `platform === "mobile"`.
- **Export** — `imageExporter` detects JSON multi-screen `htmlContent`, **post-processes each screen**, exports per-screen PNGs + ZIP when multiple; `/api/export/image` **slide count** respects mobile JSON arrays.
- **APIs** — `POST /api/design/regenerate-screen` (optional `hint`), `POST /api/design/extend-flow` — **fully wired** (new `DesignVersion`, ownership checks).
- **Helpers** — `src/lib/mobile/parseMobileVersionHtml.ts`.

## Stretch / later

- **Export** — True device-framed PNG compositing in Puppeteer (beyond per-screen viewport capture); App Store preset size matrix.
- **Parallel pair generation** for paired screens.
- **Workspace** — Dedicated screen-flow editor timeline (beyond thumbnails + slide index).
- **Post-process** — Cross-screen color consistency warnings.
