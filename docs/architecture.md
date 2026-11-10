# Architecture

Read [README](../README.md) first. This is a source map, not a release log.

## Entry points

| Area | Files |
|---|---|
| Router, lazy loading, refresh/export | `src/app.ts` |
| Route/scene mapping, scroll and sky entry | `src/house-navigation.ts`, `src/house-entry.ts`, `src/section-scroll.ts`, `src/sky-portal.ts` |
| Games shortcut and remembered return | `src/game-navigation.ts` |
| House scene and animation | `src/house/` (`stage-player.ts` owns the player; `sky-journey.ts` models the cloud passage) |
| Utilities UI / accounting | `src/client.ts`, `src/ledger.ts` |
| Expenses / split calculations | `src/misc-client.ts`, `src/misc-ledger.ts`, `src/expense-split.ts`, `src/guest-split*.ts`, `src/calculator*.ts` |
| Tasks / shared loading / personal feed | `src/chores-client.ts`, `src/chore-store.ts`, `src/my-tasks-client.ts`, `src/home.ts` |
| Task rules / ordering / cards | `src/chores.ts`, `src/task-deadlines.ts`, `src/task-reorder.ts`, `src/chore-cards.ts`, `src/point-presets.ts` |
| Events / polls | `src/events-client.ts`, `src/events.ts`, `src/event-availability.ts` |
| Bulletin / portraits / reactions | `src/bulletin-client.ts`, `src/bulletin.ts`, `src/bulletin-avatars.ts`, `src/note-reactions.ts`, `src/avatars/` |
| Games / quiz / scores / renderer | `src/games-client.ts`, `src/geography.ts`, `src/geography-scores.ts`, `src/globe*.ts` |
| Shared DOM, RPC and read cache | `src/ui.ts` |
| Identity / themes / notifications / release notes | `src/identity.ts`, `src/settings.ts`, `src/daylight.ts`, `src/notifications.ts`, `src/updates.ts` |
| HTML / CSS | `public/index.html`, `public/style.css`, `public/events-refresh.css`, `public/house-entry.css`, `public/games.css` |
| Build / local server / local DB | `scripts/build.mjs`, `scripts/serve.mjs`, `scripts/database.mjs` |
| Schema / push sender | `supabase/migrations/`, `supabase/functions/household-push/` |

`home.ts` is still used for personal/shared task feed logic; its name predates the house Home screen. Do not delete it as obsolete.

## Routes and lifecycle

- `#home` (also the fallback for unknown routes): house exterior, with To-dos below it.
- `#chores`: My tasks; `/personal`, `/assigned`, `/unassigned`, `/household`, `/week`, `/leaderboard` preserve view selection.
- `#miscellaneous`, `#events`, `#bulletin`, `#utilities`: current feature routes. Visible labels are Expenses and To-dos; old identifiers remain intentional.
- `#games`, `#games/geography`, `#games/scores`: hub, play and scores.
- Legacy `#home/personal` and `#home/assigned` redirect to To-dos. Notification query parameters focus the relevant record.

The six household scenes share an upward Games entrance. `sky-portal.ts` owns gesture eligibility/cancellation, and the house renderer owns the cloud ascent. Returning from a feature requires a fresh gesture before taking off. The Games return link retains scene/feature context in session storage. Direct feature URLs avoid house initialization. Feature modules initialize once and refresh on demand; route versions prevent late requests from affecting another route. Active sections refresh every 45 seconds and on visibility return when no dialog is open. Background task badges use a summary RPC. House/character renderers suspend when hidden, offscreen or behind dialogs and honor reduced motion.

The build creates content-hashed JavaScript, styles and public config, with module preloads for the requested section and navigation intent. Keep dynamic imports intact: household pages must not eagerly download atlas data or Three.js. `public/sw.js` handles push only; it does not cache application pages or intercept payments.

## Data contracts

Supabase tables live in `ledger_private`, with RLS and direct anonymous table access revoked. The browser calls scoped `utilities_*` RPCs. Selected-name identity is public attribution, not authentication. Mutations validate expected versions, use request IDs for retries and retain revision/event records. Calculations are authoritative on the server; pure TypeScript helpers provide matching previews.

The local PGlite adapter loads migrations into a disposable or private local database. Schema changes require a new ordered SQL migration, local adapter support, setup detection, release capability checks and appropriate exports. Existing migrations, including one-time historical corrections, are necessary to reproduce/upgrade installations. Do not prune them as completed bookkeeping.

Six household fallback snapshots live in `data/`. Each source fails independently, labels saved data and disables its unavailable writes. Game progress is per person/device; competitive scores have a separate pending outbox and database RPCs. See [Atlas](geography-data.md).

## Validation and boundaries

Use `npm run check`, targeted domain tests and `npm run build` before browser checks. `tests/browser/` runs against the local isolated server; it must not create records on Supabase. Browser specs test saved records, retries, route transitions, mobile gestures and loading boundaries. Full release commands are in [README](../README.md); the deployment script also verifies live schema capabilities and refreshes snapshots.

Only sanitized data and approved derivatives enter `dist/`. Keep private PDF/import originals and artwork source packs outside it. GitHub Pages is the deployment target; this checkout is not a Sites-hosted project.
