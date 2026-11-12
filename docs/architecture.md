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
| Games shell / observatory | `src/games-client.ts`, `src/observatory.ts`, `src/game-planets.ts`, `src/game-registry.ts` |
| Geography / quiz / scores / renderer | `src/geography-client.ts`, `src/geography.ts`, `src/geography-scores.ts`, `src/globe*.ts` |
| Daily games / practice / scoring | `src/trivia-client.ts`, `src/trivia-model.ts`, `src/trivia/` |
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

The six household scenes share an upward Games entrance. `sky-portal.ts` owns gesture eligibility/cancellation, and the house renderer owns the cloud ascent. Returning from a feature requires a fresh gesture before taking off. The return scroll waits for actual movement before applying its idle timer, so a delayed first rendered frame cannot dock the house again. The Games return link retains scene/feature context in session storage. Direct feature URLs avoid house initialization. Feature modules initialize once and refresh on demand; route versions prevent late requests from affecting another route. Active sections refresh every 45 seconds and on visibility return when no dialog is open. Background task badges use a summary RPC. House/character renderers suspend when hidden, offscreen or behind dialogs and honor reduced motion.

The build creates content-hashed JavaScript, styles and public config, with module preloads for the requested section and navigation intent. Keep dynamic imports intact: household pages must not eagerly download atlas data or Three.js. `public/sw.js` handles push only; it does not cache application pages or intercept payments.

## Data contracts

Supabase tables live in `ledger_private`, with RLS and direct anonymous table access revoked. The browser calls scoped `utilities_*` RPCs. Selected-name identity is public attribution, not authentication. Mutations validate expected versions, use request IDs for retries and retain revision/event records. Calculations are authoritative on the server; pure TypeScript helpers provide matching previews.

The local PGlite adapter loads migrations into a disposable or private local database. Schema changes require a new ordered SQL migration, local adapter support, setup detection, release capability checks and appropriate exports. Existing migrations, including one-time historical corrections, are necessary to reproduce/upgrade installations. Do not prune them as completed bookkeeping.

Six household fallback snapshots live in `data/`. Each source fails independently, labels saved data and disables its unavailable writes. Game progress is per person/device; competitive scores have a separate pending outbox and database RPCs. See [Atlas](geography-data.md).

## Validation and boundaries

Use `npm run check`, targeted domain tests and `npm run build` before browser checks. `tests/browser/` runs against the local isolated server; it must not create records on Supabase. Browser specs test saved records, retries, route transitions, mobile gestures and loading boundaries. Full release commands are in [README](../README.md); the deployment script also verifies live schema capabilities and refreshes snapshots.

Only sanitized data and approved derivatives enter `dist/`. Keep private PDF/import originals and artwork source packs outside it. GitHub Pages is the deployment target; this checkout is not a Sites-hosted project.

## Observatory and daily trivia

`src/games-client.ts` now owns the Games shell. The monumental observatory reuses the house cast and geometry helpers. Dragging, arrow keys, arrow buttons and planet labels control one azimuth: the building turns, the telescope aims at the selected planet, and Play opens that game. The renderer uses one animation-frame clock for drawing, resizing and resuming, with bounded elapsed time and shortest-path headings. It pauses while hidden or behind a dialog, respects reduced motion, and cancels interrupted pointer drags. Navigating away also closes game-owned dialogs so browser Back cannot leave a modal over the hub. Failed initial loads can retry on the next hub visit. Context loss shows the SVG building and rendered sky poster until graphics recover; the 3D backdrop is shown only after a successful frame. Scheduled refreshes retain active trivia boards and input focus; score screens still refresh. Geography is isolated in `src/geography-client.ts`; its assets load only when opening Geography or its scores. `#games` is the observatory; existing geography routes remain compatible. New game routes are `#games/{odd-one-out,passport-puzzle,clue-cascade,before-or-after,how-much-ish}`, with `/scores` for standings.

Trivia uses typed questions and pure practice scoring in `src/trivia-model.ts`. Each practice bank is dynamically imported independently. Daily content is private database data, with unrevealed answers omitted from RPC responses. Migration 031 adds versioned packs, attempts, and narrow start/action/scores/export RPCs. Migration 032 adds content v2 and preserves v1 packs and in-progress attempts. If someone started an older pack on rollout day, all roommates get that same version for that game until the next day. Migration 033 introduces Common Ground and sourced size comparisons as content v3; 034 retains the original typed-capital scoring, 035 adds capital-city dot scores, 036 adds server-validated daily border trails, and 037 adds the larger city catalog and its separate scoring category. The local adapter and release checks require migrations through 037. Selected names remain attribution, following the existing household trust model.

A day is midnight-to-midnight in America/New_York. One attempt per player/game/day resumes across devices. Answer writes serialize and reject conflicting retries; clue requests use an explicit target level, making retries idempotent. Daily scoring is server-authoritative. Expired attempts retain earned points, with unanswered questions worth zero. Monday–Sunday standings sum the five best days per game, with equal totals sharing rank. Geography scoring is independent, with separate name, find, mixed-city and historical capital-only categories; daily Border Trail has its own standings. Ranked trivia requires a connection; drafts and practice progress are local. A completed or expired attempt is immutable.

Content v2 has fourteen daily packs per game and separate practice banks (twenty questions, or four timelines). Practice consumes unseen puzzles before reshuffling. `scripts/trivia/curated-v2.py` contains edited category puzzles, word associations, landmarks and explicitly dated milestones. `build-content.py` deterministically packs them, generates country outlines from the existing atlas, and authors migration 032. Daily answers, aliases, explanations, sources and timeline dates remain private until submission. Future editorial revisions need a new content version and additive migration; do not rewrite released packs.

The five boards have distinct interactions: Odd One Out uses category tiles; Passport Puzzle uses country outlines with progressive field notes; Common Ground sorts sixteen words into four groups; Before or After uses illustrated cards with pointer/touch sorting, tap-to-place, and keyboard pickup/move/drop controls; How Much-ish resizes measured profiles. Each planet carries matching geometry: a compass globe, mismatched solids, an airport and landmarks, four linked gardens, a clockwork dial, and a giraffe with a tiny house and ruler. Static planet meshes are batched; only the selected planet animates. Reduced motion disables animation, and the fallback uses corresponding vector symbols.

Common Ground retains the `clue-cascade` route and database game key for compatibility. Four mistakes end the board; each solved group earns 250 points. Partial progress lives in `trivia_attempts.progress`, including solved groups and previous guesses. Group submissions lock the attempt; repeating the same four words in any order costs no extra mistake. A three-word overlap receives “One word away.” Unsolved categories remain private until the board ends. The old answer RPC is private and continues to serve pinned v1/v2 attempts. `scripts/trivia/groups-v3.py` authors twenty-six original boards: fourteen daily and twelve separate practice boards. `build-v3.py` writes content v3 and migration 033. Run it after the v2 builder, which also writes legacy practice banks. These are finite curated banks, not live generated trivia.

Design references researched during the overhaul: [Worldle](https://worldle.teuteuf.fr/) for geographic inference from shape; [Chronophoto](https://www.chronophoto.app/) for reasoning about time; [Size It Up](https://www.sizeitup.co/) for direct manipulation of relative scale; and four-group word sorting for Common Ground. Puzzle wording, boards and application code are original. Silhouettes come directly from openly licensed source repositories, with credits retained; no reference game's question data or SVG paths are imported.

How Much-ish v3 uses fifteen CC0/public-domain profiles from PhyloPic, Wikimedia Commons and Openclipart. `scripts/size-art/manifest.json` records authors, source and download links. The SVG pipeline whitelists geometry, removes backgrounds and measures visible bounds in Chromium. Downloaded SVG originals stay in the ignored `scripts/size-art/sources/` directory; retrieve them using the manifest’s download URLs when regenerating artwork. Run `python scripts/size-art/build.py`, then `node scripts/size-art/normalize.mjs`, then `python scripts/trivia/build-v3.py`. The generated `src/size-art.json` is bundled locally; gameplay makes no third-party art requests. Its measured height or length is exactly 100 SVG units, preserving the original aspect ratio. Both objects use the same pixels per metre. Axis marks show what is being compared; the correct size appears as a copper outline after submission. Range, drag and numeric input control one ratio, and viewport changes refit both objects together.

The size bank contains ninety distinct object pairs, split into seventy daily and twenty practice comparisons. `size-v3.py` records dimensions, qualifiers and measurement sources (NOAA, AMNH, San Diego Zoo, Georgia Aquarium, WWF, NPS and the Eiffel Tower operator). Human and bus dimensions are explicitly chosen references and are never unknown targets. Animals use stated adult/upper/record sizes rather than implying every individual has one exact size; profiles remain illustrative, with pose and tail differences disclosed where relevant. Measurement links and art credits are available after answering. Original rough profiles remain only as a compatibility fallback for attempts pinned to v1/v2.

The observatory backdrop is a three-layer celestial landscape in `src/observatory-cosmos.ts`, rendered in the same Three.js scene and lighting as the building. It keeps a small distant cratered moon and ringed planet at the edges, with sparse faceted clouds and asteroids and two small crystal constellations. The decorative planets are about one fifth of their original size, so the observatory and game planets remain the focal point. Stars are instanced; stationary geometry is batched. Pointer parallax changes each depth layer by a different amount, pauses when the hub is hidden, and is disabled with reduced motion. Scenery is positioned separately for narrow screens. There are no backdrop hit targets or extra UI controls.

`node scripts/render-observatory-sky.mjs` renders wide and phone WebP posters from that same geometry for loading and WebGL failure. `src/observatory-sky-assets.json` records their content-hashed filenames; the build only permits that explicit asset pattern. The posters replace the earlier flat SVG artwork. They are hidden once the live 3D scene is ready and return after context loss.

Border Trail uses the existing Paper renderer, showing only discovered country polygons with stable pastel fills and a gold destination; its pure rules are in `src/geography-route.ts`. Country and city games retain the complete globe. Cities use distinct location IDs, even within one country, and render/grade each city point independently. Practice progress from capital-only city rounds is extended; older ranked rounds are archived on-device and replaced with a fresh mixed-city round so their scores do not enter the new leaderboard.

`src/timeline-sort.ts` handles Before or After sorting without the old per-card arrow buttons. A lifted preview follows pointer or touch input while the faded original marks its destination; short screens scroll at the edge during a drag. Space/Enter picks up and places a card, arrow keys/Home/End change its position, and Escape cancels. Two taps also move a card without dragging. Reorders update the existing saved draft, and revealed timelines are static. Interrupted pointer gestures restore their starting order; reduced motion disables the tile slide animations.

All five trivia boards follow the shared household light/dark preference through `data-theme`, including System and Time of day. Dark styles in `public/games.css` keep each board's palette and cover selection, dragging, solved groups, answer reviews, and scores. The small game theme control reuses the house control's icons, labels, cycling, and stored preference through `themeToggleMarkup` in `src/settings.ts`; changing it updates colors without rerendering the puzzle or clearing its draft.
