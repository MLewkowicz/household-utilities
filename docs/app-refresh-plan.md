# Brief A — Household app functionality and interface

Goal: Make the app faster, clearer, and more expressive. Home is the single place to manage personal tasks and work assigned by other people. Keep TypeScript/esbuild, Supabase, GitHub Pages, selected-name identity, roommate colors, illustrations, and all financial accounting rules.

## Release 1: Tile and illustration fixes

- Reproduce pinned-card border overflow in both themes, including Week. Replace exterior priority shadows with an inset treatment following the tile and fold.
- Use the shared corner-tab component for bulletin notes, preserving paper colors, tilts, controls, and history, with shared geometry, hover, and keyboard behavior.
- Keep Alcohol in Expenses; remove it from dedicated chore suggestions, retaining old-record rendering. Add Guinness to Alcohol keywords. Snapshots contain no identifiable Guinness entry: do not infer an accounting correction.
- Reminders and requests access all original expense illustrations plus chores, using searchable categories and retaining manually selected icons on title changes.
- Payment reminders use Add task → Reminder, a title such as “Pay Michal for Bluebikes,” recipients, illustration, optional details/deadline. Reuse per-recipient reminders and notifications. Completion marks done only; no repayment, balance change, payment integration, ledger, or dedicated payment workflow.

## Release 2: Home and personal tasks

- Add #home, default for empty/unrecognized routes and brand destination. Preserve Utilities, Expenses, To-dos, Events, Bulletin, and notification deep links.
- Compact heading, personal quick entry, Add task shared form, and one combined feed. Labels: Personal or shared type and requester. All / Personal / Assigned filters, default All.
- Include all available active tasks assigned to the selected person. Unassigned requests remain in To-dos. Preserve routine availability and completion guards. Replace My queue with a link to Home’s Assigned filter; retain Household, Week, Leaderboard.
- Personal quick entry saves title immediately under selected identity, without assignee dialog. Support editing, pinning, completion slider and accessible alternative, undo, completed history, deletion retaining history. No points, notifications, routines, subtasks, or scheduling. Ownership is public under existing selected-name model, not privacy.
- Pinned before ordinary; initial shared urgency/date ordering and newest personal first within group. Drag within groups and keyboard Move up/down. Persist per-viewer order across devices. New arrivals enter top of group, preserving existing relative order. Personal pins change task; shared priority retains current behavior. Home order never changes assignment or others’ order. Refresh must not interrupt typing/dragging.
- Separate personal tables: owner, title, pinned, completion/deletion state, version, revision history. Scoped read/save/export and per-member order RPCs, expected versions, idempotent requests.
- Discriminated personal/shared feed union; dispatch appropriate APIs. Extract shared loading/actions from To-dos rendering so Home avoids initializing the screen.
- Load sources independently; partial failure keeps available source visible, shows concise notice, disables unavailable writes.
- Extend local DB, exports, snapshots, migration detection, route preloading/refresh/titles, notification focus, and Home export. Home export separates selected member’s personal tasks and assigned history.

## Release 3: Events and interface

Six illustrated event draft presets: Movie night → Movie; Board games → Board game; Go for a walk → Walking; Skiing → Skis; Eat out → Restaurant; Cook together → Cooking. Reuse SVGs and add matching vectors as needed. Presets fill editable title/icon; preserve dates/defaults, require explicit save, allow custom title and independent icon. Optional icon_id survives save/read/history/export, with neutral calendar fallback for old records. Preserve voting, confirmation, cancellation, timezone, and response reset behavior.

Use concise section names. Remove slogans, redundant introductions, numbered eyebrows, repetitive empty states. Keep errors/offline status/payment entry meaning; place occasional explanations in disclosures. Standardize spacing, headings, action placement, corners, and touch targets. No architectural redesign in production.

## Release 4: Reactions

Preserve six existing IDs; add shocked, gasp, eye-roll, sobbing, rage, heart-eyes, smug, facepalm. Development gallery: all 14 × four characters, replay and still comparison. Exaggerate old/new expressions with expression-specific canvas geometry/timing: vomit shaking + substantial stream/droplets; mogging chin/jaw deformation and confident pose; shock/gasp eyes/brows/mouth/recoil; stronger laughing/crying/confusion/disappointment. Preserve hair/glasses/facial hair/proportions and separate author temperature animation. Expand server/types; bounded expanded cache; static thumbnails, animation on selection/replay only; reduced motion, pause, offscreen/hidden suspension.

## Validation and release

Order: tiles/icons → Home → events/interface → reactions. Brief B proceeds independently in sibling project. Use isolated DB/browser tests. Each milestone: types, relevant unit/DB tests, build, browser checks. Full required release checks before publishing. Additive migrations before dependent UI; refresh snapshots; support cached old clients.

Acceptance: folded pinned borders on phone/desktop/light/dark; bicycle Bluebikes reminder without expense and duplicate notification retries; identity-filtered combined Home with persisted order/completion/undo/partial outages; personal tasks never affect points/money; concurrent edits/retries/save failures retain data/drafts; event icon edit/export/fallback and old events; all 56 reaction combinations with unclipped recognizable stills; existing links, routine timing, balances, history correct.

## Follow-up: personal organization and quieter controls

The user requested larger faces on notes and reactions, plain Events-style identity switchers for every member, and press-and-hold task reordering with a dashed held tile and live movement of surrounding tiles. Move up/down controls remain available on keyboard focus. Personal tasks can have a named group chosen from existing names or typed anew, with clear project headers. Dragging a personal task across groups changes its group; pinned and ordinary priority sections remain separate. Migration 020 adds group metadata to append-only personal history and atomically applies a group move with per-member ordering. Preserve old-client edits, idempotent retries, partial-source failures, normal touch scrolling, reduced motion, and exports. No house animation work belongs to this task.

Group headers also offer Rename, updating the selected owner’s whole group (including completed/deleted tasks and both priority sections) in one transaction. Migration 021 retains prior names in history, checks the complete group snapshot for concurrent changes, and makes retries idempotent. Renaming to another existing group is rejected to avoid accidental merges.

Expanded tiles show current task, expense, note, or event details with one latest-update timestamp. Full revision logs stay in the database and exports. Routine panels show the current schedule; payments retain their current entries and a Show deleted option. Expanded footers use compact spacing with room for the corner control.
