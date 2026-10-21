# Household refresh roadmap

October 20, 2026 release: S1–S7 and the finalized artwork are implemented and verified. The October 21 follow-up implements Events, note reactions, expense balancing, and the agreed point catalog; utility rewards remain deferred. Architecture and setup are documented in [HANDOFF.md](HANDOFF.md).

## Agreed direction

Muted filled tiles identify Michal (lavender), Rina (rose), Ohm (cyan), and Rohil (amber). Assignee colors identify tasks; requester colors identify unassigned tasks; payer colors identify purchases; authors retain their note colors. Between-person repayments remain neutral with separate participant identities. Names and status labels remain readable independently of color. Light and dark surfaces are tuned separately.

All four characters are approved and integrated. Hashed, allowlisted WebP derivatives supply the app; source artwork remains outside the public build. Financial records are preserved. The user authorized one targeted retroactive change: split the existing trash routine into two 0.5-point items; The October 21 follow-up additionally adopts the agreed fixed job presets through recorded revisions.

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

## S8 — Events, points, reactions, and expense corrections

- [x] Expenses and To-dos replace the visible old tab names, preserving links and data identifiers. Expense tiles reuse the accepted corner peel; Alcohol joins the icon picker.
- [x] Automatic custom balancing preserves edited shares and distributes only the remainder. Conflicting edits are prevented; fixed shares can return to Auto. Excluding self with one recipient assigns the full total. Guest splitting is secondary, below ordinary split controls.
- [x] Separate Events tab, agenda/month calendar, festive invitation cards, interval proposals, Yes/Maybe/No responses, approving portraits, and host confirmation/cancellation. Time edits reopen voting; histories and retries remain intact.
- [x] Fixed household job presets plus custom effort. Explicit historical mapping, append-only adjustments and revisions, exact contributor credit, safe reversal, and preserved routine start dates. Utilities remain independent.
- [x] One changeable character reaction per person per note, six expressions, still cached thumbnails and brief selection animation. Author temperature is unchanged.
- [x] New migrations 013–015 rehearsed against the actual backup; original IDs, revision history, dates, owners, and completions preserved. User completed live schema setup.
- [x] Live historical scores verified, five fallback exports refreshed, and frontend release checks passed. Publication uses the existing Pages workflow; smoke checks make no live test entries.
- [ ] Later: alternate-time polling/when2meet, recurring events, external event guests, and opt-in event notifications.
- [ ] Later: utility-credit rewards after budget, eligibility, ties, and funding are agreed.

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

Release status: the user ran the schema upgrade locally. Live verification confirmed the independent half-point routines, bag icon, preserved occurrence IDs/completions, unchanged earned scores, both financial ledgers, and bulletin. Offline snapshots were refreshed. Frontend publication uses the [Pages workflow](https://github.com/MLewkowicz/household-utilities/actions/workflows/pages.yml). The earlier release preserved all financial data; the S8 implementation above supersedes its deferred Events and point-catalog scope. Utility-credit rewards remain deferred.

New optional task/step fields: `kind`; task-only `reminder_group_id`. Old snapshots remain readable through inferred kinds. Group creation is transactional and has a separate retry fingerprint. Existing `utilities_save_chore` adds `quick_complete`, with current-time completion and automatic assignment; no financial API changes.

## Validation and session handoff

- TypeScript check, 79 Node/database tests, 8 Python tests, build, and publication privacy check pass.
- All 39 browser scenarios pass, including the original workflows plus guest data isolation, independent reminders, deliberate swipe/keyboard completion, Undo, lazy loading, and delayed-read races. The events prototype was also exercised locally for navigation, availability, suggestions, and mobile overflow.
- Upgrade test installs migrations 001–008, creates legacy data, then applies 009 and compares all four ledgers, original revisions, and scores. Further tests cover arbitrary start dates, DST, repeated upgrades, half-point credit, and the exact trash conversion including preserved occurrence IDs and independent future edits.
- Local phone/desktop light/dark previews are in ignored `.local/previews/`. Test/demo entries exist only in isolated temporary local databases.

Character integration: TypeScript, build, privacy check, nine avatar/bulletin browser scenarios, and the standalone four-character animation checks pass. Approved artwork files are unchanged; the exported runtime can be refreshed with `node scripts/export-avatars.mjs --motion-only`.

Next starting point: iterate on the production Events experience and reaction artwork as requested. The release adds no utility credits.

## October 21 validation

86 Node/database tests, 8 Python tests, and 43 browser scenarios pass. New coverage includes exact-cent split balancing and conflicts, single-recipient requests, event lifecycle and DST boundaries, reaction retries/replacement/removal, preset enforcement, historical adjustment/reversal, and undo/recompletion. Existing financial, task, notification, avatar, and offline behavior remains covered. Visual checks include all four characters, mobile light/dark themes, and 320px navigation. Live score verification passed: Michal +1/3, Rina +1/3, Rohil −1/6, Ohm unchanged; financial ledgers, notes, and events unchanged.

## Queue timing correction — October 21

- [x] Explain and reproduce the edited-future-occurrence bug affecting the trash pair.
- [x] Make routines wait for their actual due date, including offset items and saved overrides.
- [x] Add **Show in queue** to task/routine forms; keep upcoming work in Week.
- [x] Apply readiness to active queues, sliders, detailed completion, and urgent badges; validate it server-side.
- [x] Preserve all records, current owner rotations, score history, retries, and financial ledgers; rehearse migration 016 with the fresh live backup.
- [x] Pass 92 Node/database tests, 8 Python tests, 45 browser scenarios, and a read-only desktop/mobile preview against live records.
- [x] Install migration 016 via local `./configure.sh`, verify all baseline live records and scores, preserve concurrent household additions, and refresh all five fallbacks.

Publication follows the existing Pages workflow. `.local/smoke-queue-timing.mjs` checks the published bundle and both trash cards on desktop/phone, with no test writes.

## Home refresh

The standalone assignments are saved in `docs/app-refresh-plan.md` and `docs/house-concept-brief.md`. House-concept work was stopped in this session at the user's request; it belongs to a separate session and has no production app dependencies.

- Implemented inset priority borders and shared bulletin corners, focused chore suggestions, Guinness search, and the full illustration catalog for reminders/requests. No accounting entries were corrected.
- Implemented Home, separate personal-task revision storage, combined assigned/personal feed, filters, completion/undo, retained deletion history, per-member order, drag and keyboard movement, independent source failures, scoped exports and fallback support. Shared forms initialize independently of the To-dos page.
- Implemented six event draft presets and optional persisted event illustrations. Existing events and cached clients remain supported.
- Implemented fourteen reactions, a 56-example development gallery, bounded still-image caching and motion controls. Author temperature remains independent.
- Validated migrations 017–019 in isolated local databases. After the user ran configuration, the read-only production capability check confirmed Home, event illustrations, and expanded reactions are available. Publication refreshes all six fallback snapshots before building and deploying.

Release sequence: run `./configure.sh` to install missing additive migrations, then `./publish.sh`. The publisher now verifies live capabilities, refreshes all six snapshots, and includes browser checks before pushing. The Pages workflow also blocks a deployment when those schema capabilities are missing. Use `npm run preview:reactions` for local expression review. Review screenshots and check logs are in ignored `.local/refresh-review/` and `.local/reaction-checks/`.

Validation passed: 97 Node/database tests, 8 Python tests, and all 54 browser scenarios, plus TypeScript checking, production build, privacy checks, and whitespace checks. After the final keyboard-focus adjustment, all five Home browser scenarios passed again. The six-snapshot export pipeline was also verified against an isolated database without replacing production fallbacks.

## Unified To-dos and continuous paper borders

- Merged Home into My tasks inside To-dos, alongside Household, Week, and Leaderboard. Navigation starts with To-dos and Expenses, with Utilities last. Old Home links redirect to matching task views; personal records and saved ordering use the existing APIs without a migration.
- Kept quick personal entry and added Personal to the unified Add task form, with independent source availability and preserved drafts.
- Removed explanatory info controls throughout, including the personal-task and September 1 notices. Relevant form guidance, errors, history, financial calculations, and avatar fallbacks remain.
- Replaced separate card borders and corner patches with one full-card SVG silhouette and outline. Personal/shared tasks, expenses, and bulletin notes share the frame, responsive geometry, accessible corner target, and observer cleanup.
- House-animation work remains outside this session. Review artifacts are in ignored `.local/paper-review/`.
