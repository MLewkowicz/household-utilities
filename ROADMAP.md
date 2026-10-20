# Household refresh roadmap

October 20, 2026 release: S1–S7 and the finalized artwork are implemented and verified. S8 remains a separate design follow-up. Architecture and setup are documented in [HANDOFF.md](HANDOFF.md).

## Agreed direction

Muted filled tiles identify Michal (lavender), Rina (rose), Ohm (cyan), and Rohil (amber). Assignee colors identify tasks; requester colors identify unassigned tasks; payer colors identify purchases; authors retain their note colors. Between-person repayments remain neutral with separate participant identities. Names and status labels remain readable independently of color. Light and dark surfaces are tuned separately.

All four characters are approved and integrated. Hashed, allowlisted WebP derivatives supply the app; source artwork remains outside the public build. Financial records are preserved. The user authorized one targeted retroactive change: split the existing trash routine into two 0.5-point items; no other point policy is applied.

## Implemented locally

### S1 — Foundations

- [x] S1.1 Shared avatar renderer and approved four-character catalog (`src/people.ts`, `src/avatars/catalog.ts`). All four sections use small still portraits with a text fallback.
- [x] S1.2 Shared information popovers, filled person surfaces, expandable card styling, and fixed avatar geometry.
- [x] S1.3 Extracted chore cards and completion gesture handling from the main controller.
- [x] S1.4 Reproducible local performance baseline and comparison in [docs/performance.md](docs/performance.md).

### S2 — Compact chores

- [x] S2.1 Smaller tiles with a short title, illustration, recipient, applicable points, and due date/time. A sender-colored “From” badge uses the shared avatar renderer, using the approved character portraits. A small peeled-paper corner opens context, expiry, full dates, history, and administrative actions in both queue and week views. The curl sits on the bottom-right edge with a continuous tile-colored border and soft shadows above and beneath the fold; its larger invisible tap target extends into the tile. Representative phone tile height is 157px, down from 241px.
- [x] S2.2 Slim completion track with a pale rectangular handle and fine SVG chevrons. Deliberate horizontal drag from the handle; vertical movement cancels. Enter/Space on the handle provides accessible completion.
- [x] S2.3 Atomic claim-and-complete for unassigned tasks; selected-person completion for assigned tasks. Covering another person and shared credit use expanded completion details.
- [x] S2.4 Server-side time/points, expected versions, idempotent retry, pending/success/error feedback, and Undo. Undo retains assignment and reverses credit.
- [x] S2.5 Dragging defers card rerenders, and an old in-flight dashboard response cannot overwrite a successful local mutation. Acknowledged completions update the tile immediately; overlapping reads queue a fresh dashboard refresh.

### S3 — Task types

- [x] S3.1 Creation choices for reminders, requests, chores, and routines; advanced context/scheduling is collapsed.
- [x] S3.2 Multi-recipient one-off reminders create linked, independently assigned tasks in one transaction. Each recipient completes their own. Requests and chores remain single shared tasks.
- [x] S3.3 Reminders/requests earn zero points. Existing zero-point records remain supported without rewriting stored revisions.
- [x] S3.4 New routines are one recurring item starting on any selected date. Optional fixed ownership/rotation, next-occurrence changes, missed occurrences, and notification links are preserved.
- [x] S3.6 Half-point effort is supported throughout creation, recurrence, completion, correction, shared credit, and export. Migration 012 splits the existing trash pair into independent routines and gives the replacement bag its own icon, keeping stable occurrence IDs and history.
- [x] S3.5 Type filters alongside the existing My queue, Household, Week, and Leaderboard views.

### S4 — Points race

- [x] S4.1 Four colored race lanes, angled bar ends, approved avatars, numeric scores, ranks, and expandable contributions.
- [x] S4.2 Month/week/all-time views and existing exact shared credit. Only the authorized trash pair changes to 0.5 points each; no utility rewards are applied.
- [x] S4.3 Read-only historical adjustment preview tooling; policy selection remains in S8.

### S5 — Guest calculator

- [x] S5.1 2–4 selected roommates plus 1–4 anonymous guests, with the normal expense payer remaining a roommate.
- [x] S5.2 Final receipt total, equal/custom amounts, fractions, percentages, and blank shares that divide the remainder. Rational arithmetic and largest remainders preserve cents.
- [x] S5.3 Only roommate shares and their subtotal transfer into the ordinary custom-expense form. Guests never enter an RPC, local storage, export, or database table.
- [x] S5.4 Closing the calculator removes its DOM and clears transient inputs. Saving the expense remains a separate confirmation.
- [ ] Later, only if requested: itemized receipts and guest payers.

### S6 — App-wide cleanup

- [x] S6.1 Muted filled balance, purchase, task, identity, and score tiles; author-colored bulletin paper retained.
- [x] S6.2 Purchase details/actions/history are expandable; explanations such as the September utility cutoff use accessible info controls.
- [x] S6.3 Errors, offline/stale status, missing coverage, and validation stay visible. Pinned notes and the temperature editor animate the original author’s approved character at the exact selected temperature. Other app tiles keep still portraits.

### S7 — Loading and reliability

- [x] S7.1 Hashed ES modules split by section. Preload only the selected section and its shared dependencies, including navigation intent; unopened sections do not initialize forms or fetch full dashboards.
- [x] S7.2 Lightweight chore counts outside Chores, only when an identity is selected. The active page does not await this request.
- [x] S7.3 Shared in-flight read deduplication and mutation invalidation; inactive sections refresh on return, while visible sections refresh every 45 seconds with no open dialog.
- [x] S7.4 Chore/purchase history markup is deferred until details open; open panels survive refreshes. Saved fallback data remains read-only and isolated by module.
- [x] S7.5 Notification links, exports, themes, identity, retries, and cached deployments covered by regression checks.

## S8 — Design artifacts ready; decisions deliberately pending

- [x] S8.1 [Interactive events prototype](docs/events-prototype.html): separate tab versus Chores subview, time responses, alternate suggestions, and an availability grid. Open locally; sample data only, no backend calls or persistence.
- [x] S8.2 `scripts/preview-points.mjs` produces before/after totals and per-task changes from an exported ledger and a proposed policy. It has no database client or mutation path.
- [ ] S8.3 Choose event placement, organizer/finalization controls, response editing, cancellation, and notification rules before adding production event APIs.
- [ ] S8.4 Choose point values, date range, ties/eligibility, reward budget, funding, and treatment of Michal as the bill payer. Inspect the preview before applying any adjustment.
- [ ] S8.5 Implement append-only point adjustments and separate utility-credit entries only after that policy is agreed. Never turn a credit into a fake provider bill or reimbursement.

See [next design session](docs/next-design-session.md) for concrete decisions and preview usage.

## Independent artwork track

- [x] A1 All four finalized characters approved by the user.
- [x] A2 Optimized derivatives with hashed filenames, manifest checksums, and explicit publication allowlisting; source originals retained outside the build.
- [x] A3 Default avatars integrated across sections; author-specific looping bulletin characters and live editor previews use the saved temperature.
- [x] A4 Verified both themes, fixed canvas geometry, static fallback, reduced motion, pause/resume, route/offscreen/tab suspension, image reuse, and cancellation during loading. One shared 30 fps clock serves visible characters; prepared face layers are cached per character. Asset sizes and memory bounds are in [performance notes](docs/performance.md).

## Upgrade and publication

1. Finish release checks and review the working tree. Never replace production from bundled snapshots.
2. Export a private recovery backup before the upgrade. A pre-conversion backup is saved in ignored `.local/backups/before-routine-split-20261020T224002Z.json`; refresh it at release if live records change.
3. Run `./configure.sh` locally with the Supabase management-token prompt. It detects and installs missing **009_task_refresh.sql**, **010_routine_start_dates.sql**, **011_half_point_chores.sql**, and **012_split_trash_routine.sql**, in order. Migration 012 targets only the identified household trash routine and checks its item IDs/titles before converting it.
4. Run `./export-ledgers.sh` after the upgrade to refresh offline snapshots, then `./publish.sh`. GitHub Actions publishes the refreshed frontend. The user has explicitly authorized deployment once checks pass.
5. Smoke-test reads, navigation, theme, routines, and notification links. Do not create fake live entries. Check both trash routines have one 0.5-point item, the bag icon is set, and occurrence IDs/completions and unrelated records survive.

Release status: the user ran the schema upgrade locally. Live verification confirmed the independent half-point routines, bag icon, preserved occurrence IDs/completions, unchanged earned scores, both financial ledgers, and bulletin. Offline snapshots were refreshed. Frontend publication uses the [Pages workflow](https://github.com/MLewkowicz/household-utilities/actions/workflows/pages.yml). Events and the broader utility-credit policy remain the separate S8 follow-up phase; they are not enabled by this release.

New optional task/step fields: `kind`; task-only `reminder_group_id`. Old snapshots remain readable through inferred kinds. Group creation is transactional and has a separate retry fingerprint. Existing `utilities_save_chore` adds `quick_complete`, with current-time completion and automatic assignment; no financial API changes.

## Validation and session handoff

- TypeScript check, 79 Node/database tests, 8 Python tests, build, and publication privacy check pass.
- All 39 browser scenarios pass, including the original workflows plus guest data isolation, independent reminders, deliberate swipe/keyboard completion, Undo, lazy loading, and delayed-read races. The events prototype was also exercised locally for navigation, availability, suggestions, and mobile overflow.
- Upgrade test installs migrations 001–008, creates legacy data, then applies 009 and compares all four ledgers, original revisions, and scores. Further tests cover arbitrary start dates, DST, repeated upgrades, half-point credit, and the exact trash conversion including preserved occurrence IDs and independent future edits.
- Local phone/desktop light/dark previews are in ignored `.local/previews/`. Test/demo entries exist only in isolated temporary local databases.

Character integration: TypeScript, build, privacy check, nine avatar/bulletin browser scenarios, and the standalone four-character animation checks pass. Approved artwork files are unchanged; the exported runtime can be refreshed with `node scripts/export-avatars.mjs --motion-only`.

Next starting point: continue the deliberately deferred S8 events and reward-policy design decisions. The current release adds no utility credits or production events.
