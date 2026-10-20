# Household ledger: agent handoff

Prepared October 20, 2026, from the current repository and the project's setup and troubleshooting history.

This document describes the implemented application, its operating rules, and context that should be preserved when making changes. The repository and live database may evolve after this handoff; inspect their current state before altering anything.

## Project and current state

This is a shared household application for **Michal, Rina, Ohm, and Rohil**, with four tabs:

1. Utilities
2. Miscellaneous expenses
3. Chores
4. Bulletin: complaints and compliments

It also supports optional browser push notifications and installation on a phone's Home Screen.

- **Workspace:** `/home/mlewkowicz/utilities`
- **Live website:** <https://mlewkowicz.github.io/household-utilities/>
- **GitHub repository:** <https://github.com/MLewkowicz/household-utilities>
- **Branch:** `main`
- **Application commit at handoff:** `c131006b4baf498116a07d08b63813c74de59a50` — `Add opt-in iPhone and Android household notifications`
- **Working tree before creating this document:** clean.
- **Supabase project:** `https://obgjjeypflwzzouhjzkx.supabase.co`
- **Primary documentation:** [README.md](README.md)

Database migrations `001`–`008` have already been installed. The notification sender and schedule have been configured. Actual notifications have worked on both an iPhone and Android.

The handoff was prepared through repository inspection; no application records were changed and no new test notifications were sent. Test suites were not rerun solely to prepare this document.

## Product principles and preferences

- Keep the application minimal, polished, and usable on phones and desktop.
- Preserve the existing illustrations and overall visual style.
- Support **System, Light, and Dark** themes throughout.
- Roommate colors are consistent across cards, participant tiles, history, and notes:
  - Michal: purple
  - Rina: pink
  - Ohm: cyan
  - Rohil: amber
- There is deliberately **no login, password, email verification, or private-link system**. Selecting a name is a convenience and attribution mechanism, not authentication.
- The website and its household records are public by design. Only first names and relevant household information should appear.
- Never publish PDFs, addresses, provider account numbers, extracted statement text, secret credentials, or private backups.
- Utilities, miscellaneous balances, chore credit, and bulletin statistics remain independent.
- Preserve existing records and audit history. The household uses the app for real transactions.
- Do not create fake entries in the live database for testing.
- Payment forms record money already sent elsewhere. They do not initiate or verify Venmo, Zelle, or bank transfers.
- Keep the existing GitHub Pages + free Supabase arrangement unless the user requests a change.

## Utilities

Michal pays the utility providers. Rina, Ohm, and Rohil record reimbursements to him.

Supported utilities:

- Gas
- Electricity
- Wi-Fi

The dashboard provides:

- Per-person balances, including credits from overpayment.
- Michal's remaining reimbursements and own share.
- Monthly charges, with household and individual views.
- Expandable bill/service-period details.
- Clear missing-statement and partial-month coverage indicators.
- Payment recording, correction, deletion, and activity history.
- Export of the ledger and its history.

The monthly table displays **charges before reimbursements**. Payments reduce the overall balance rather than being assigned to a particular month.

### Accounting rules

- All money uses integer USD cents.
- Rohil's recurring utility liability begins **September 1, 2026**.
- Service days before that date split among Michal, Rina, and Ohm.
- Service days on or after that date split among all four.
- Recurring charges are spread uniformly across the statement's **inclusive service dates**, allowing off-cycle gas and electricity statements to be prorated across months and the September cutoff.
- One-time installation/equipment charges split among all four and belong to the service-start month.
- Largest-remainder allocation preserves the exact total.
- Extra pennies rotate among eligible tied roommates in canonical bill order. Credits have a separate rotation.
- Refreshing, recording a payment, or reimporting an unchanged bill does not advance the rotation.
- Backdated bills or corrected charges replay allocation and can shift later shares by pennies.
- The user specifically requested that the rounding explanation remain internal rather than cluttering the dashboard.

An important historical correction is already recorded:

- Earlier electricity charges of **$100.54** and gas charges of **$30.98** cover **August 1–20, 2026**.
- The next cycle starts August 21.
- These are already included. Do not recreate them as new bills.
- The former unknown-date opening records remain in correction history.
- An August Xfinity EFT was a payment to the provider, not an additional expense or roommate reimbursement.

Payment methods are Venmo, Zelle, and Other; Other includes explanatory text. Changes append revisions instead of erasing the previous values. Public visitors cannot edit imported bills or erase the utility audit trail.

## PDF importing and organization

New statements can be dropped into the project root or `inbox/` with **any filename**.

```bash
./import-bills.sh
```

The importer:

1. Extracts PDF text locally using PyMuPDF.
2. Identifies supported Eversource gas/electricity or Xfinity Wi-Fi statements.
3. Extracts service dates and relevant charges.
4. Shows a preview and asks for confirmation.
5. Uploads only sanitized structured bill data.
6. Organizes the original PDFs into descriptive folders and filenames.

Example:

```text
bills/2026/electricity/
  2026-08-21_to_2026-09-17_eversource_electricity_94.98_3193bb4e.pdf
```

Names include service dates, provider, utility, charges, and a short content hash.

Useful commands:

```bash
./import-bills.sh --dry-run
./import-bills.sh --organize-only
./import-bills.sh --include-archive --dry-run
./import-bills.sh path/to/statement.pdf
./import-bills.sh --export
./import-bills.sh --local
```

Normal imports scan the root and inbox. Archive inspection is explicit. Duplicate imports do not duplicate charges, and files are not silently overwritten.

Scanned, unsupported, ambiguous, or inconsistent statements stop the batch before publication or file moves. Manual overrides belong in an ignored local JSON file; the README documents the format. When revising statement dates, preserve the existing bill ID to avoid creating a duplicate.

PDFs remain local. Normal bill imports update the live application through Supabase without requiring a frontend deployment.

## Miscellaneous expenses

This is a separate Splitwise-style ledger for purchases already made.

An expense includes:

- Payer
- Description
- Purchase date
- Total amount
- Illustration
- Selected participants
- Equal or custom shares

All four people start selected. The payer can exclude their own share or exclude other people. The September utility cutoff does not apply here.

Splitting supports:

- Equal shares with rotating extra pennies.
- Exact custom dollar amounts.
- A calculator for totals and repayments.
- Per-person fractions and percentages, such as `1/3` or `25%` of the purchase total.
- Optionally dividing the remainder equally among other selected participants.

Custom shares must sum exactly to the total. The calculator fills the form; saving still requires confirmation.

The miscellaneous rounding cursor is separate from utility rounding. Editing only text or an icon does not consume a rounding turn. Other saved expenses retain their original shares.

Debts are calculated **between each pair of people**. Opposite debts within that pair offset each other; the app does not perform household-wide debt simplification.

Repayments support partial payments, overpayments, Venmo, Zelle, and Other. Opening a repayment from a debt card prefills the amount and focuses the dialog heading so the phone keyboard does not immediately open.

### Illustrations

- 41 bundled SVG icons.
- Searchable categories and local keyword suggestions.
- Food options include pasta, fish, kimchi, chicken, yogurt, and broccoli.
- Household options include shampoo, body wash, hand soap, and other supplies.
- Typing suggests an illustration without marking it explicitly selected.
- Tapping an icon selects it and fills the description with its name by default.
- The description can then be edited while keeping the selected icon.
- “Use icon name as description” can be disabled to change only the icon.

Anyone can edit or delete entries. Each card has expandable revision history; deleted entries can be revealed. There is no approval/veto system.

A separate administrative cleanup script exists for an **explicitly requested permanent removal of an already-deleted expense**:

```bash
./remove-deleted-expense.sh EXPENSE_ID --expected-version VERSION
```

It requires a locally entered management token, saves a recovery copy, and checks that unrelated records and balances remain unchanged. Do not use it for routine deletion.

## Chore Corner

The chore system supports one-off requests, spontaneous completed work, recurring rotations, personal queues, a weekly agenda, and contribution scores.

### Views

- **My queue:** assigned tasks for the selected person, plus muted unassigned tasks anyone can claim.
- **Household:** defaults to unassigned tasks; its assignee filter can show Everyone or a specific roommate.
- **Week:** Monday–Sunday agenda, with navigation and an assignee filter; stacks vertically on phones.
- **Leaderboard:** current month by default, with week and all-time options and expandable contributions.

The Household filter and Week filter are independent. Household returns to Unassigned on a fresh page load.

Queue ordering prioritizes pinned tasks, then overdue, due today, upcoming, and undated work, with deadlines and age breaking ties. The tab badge counts distinct pinned, overdue, or due-today tasks for the selected person.

### Tasks and credit

Chore fields and actions include:

- Title, illustration, and optional context.
- Requester and optional assignee.
- Priority pin.
- Due date and optional time.
- Optional expiry, including “Expire tonight.”
- Effort of zero, one, two, or three points.
- Claim, hand back, reassign, edit, cancel, complete, and undo completion.
- Expandable revision history and change attribution.

Requesting a chore without selecting an identity prompts for a name and then continues into the form.

Zero-point chores are intentional reminders: they can be urgent, assigned, recurring, and completed, but add neither points nor contributions to the leaderboard.

Completing a chore credits the **actual contributors**, not necessarily the assignee. Multiple people can share credit equally. Credit is stored in exact twelfths and displayed to at most two decimal places. Completion details and time can be corrected; undo reverses the credit. Missed or expired work causes no negative points.

Illustrations distinguish:

- Recycling: three chasing arrows.
- Request a repair: messaging the landlord/reporting a problem.
- Fix something: doing the repair yourself.

### Scheduling and routines

Scheduling uses **America/New_York**, including DST.

- A date-only deadline becomes overdue after that day ends.
- “Expire tonight” expires at the next New York midnight.
- One-off tasks do not disappear merely because a week ends.
- Historical completed, cancelled, expired, and missed tasks remain inspectable.

Recurring routines:

- Every 1–12 weeks.
- Fixed owner or rotation through an ordered subset of roommates.
- Any first due date and first rotation owner (migration 010 removes the original Monday restriction).
- New routines contain one recurring item; no step builder.
- Optional time, illustration, context, and 0/0.5/1/2/3 points (011 adds half-points with exact shared credit).
- Migration 012 converts the explicitly authorized, existing grouped trash routine into two independent 0.5-point routines. “Put in new trash bag” uses the `trash-bag` icon. Other routines remain untouched.
- The split preserves occurrence IDs through a server-controlled `occurrence_root`, as well as dates, ownership, completion state, and revision metadata. Existing point values for that trash pair are the sole intentional retroactive adjustment.
- Rotation advances according to the calendar, regardless of completion or someone covering.
- Unfinished previous-cycle items become missed.
- Routine changes and pauses apply from the next cycle.
- Completed history and explicitly edited occurrences remain intact.
- Changing the original cadence requires pausing the routine and creating another.
- Future previews extend 12 weeks.

Stable occurrence IDs and transactional materialization prevent duplicate recurring tasks. Materialization happens during relevant reads/saves and through the notification worker.

## Bulletin: complaints and compliments

There is **one combined bulletin board**, with optional filters for complaint/compliment and recipient.

### Visual design

- Textured corkboard.
- Wooden frame.
- A post and grass patch at the bottom.
- Board grows vertically with normal page scrolling.
- Lined paper in softened versions of the author's roommate color.
- Stable randomized tilt and offset.
- Classic red thumbtacks.
- Face, message, recipients, sender, and a small date visible.
- A folded gray corner reveals editing, temperature details, and history.

Notes remain until deleted. There is no expiry or automatic archiving.

A note has:

- Immutable original author and posting date.
- One or more recipients.
- Up to 600 characters.
- Temperature from `-100` to `+100`, excluding neutral zero.

Negative temperatures represent complaints; positive temperatures represent compliments. The original local SVG face changes continuously through annoyance, red/steaming anger, appreciation, smiling, heart eyes, and floating hearts. Reduced-motion preferences are respected.

Anyone can edit, delete, or restore notes. Edits preserve the original author/color/date and record the editor. Deleted notes are hidden from the board and statistics but remain available with their history.

“By the numbers” shows complaints and compliments written and received for week, month, or all time. Notes count once for the author and once for each recipient. These are counts, not temperature-weighted scores. Edits do not create additional counts.

The thumbtack uses a bundled Twemoji SVG. Preserve its attribution in [public/credits.txt](public/credits.txt).

## Notifications and Home Screen installation

Notifications use standard Web Push. There is no SMS integration, native App Store application, or account sign-in.

Users opt in through the header bell on each device:

- iPhone/iPad: supported iOS version (iOS 16.4+), install through Safari → Add to Home Screen, then enable from the installed app.
- Android: supported Chrome/browser; installation is optional for notifications.
- Desktop: supported browsers can subscribe.
- Multiple devices can subscribe for the same roommate.

A device's subscribed identity is separate from the person currently selected in the dashboard. Changing dashboard identity does not redirect notifications.

Settings include:

- Chores, bills, and notes toggles.
- Disable notifications on this device.
- A test notification for that device only.
- Quiet hours: **10 p.m.–8 a.m. New York time**.

### Notification rules

- Chore assignment by someone else notifies the assignee.
- Chores remind once when due: 9 a.m. for date-only tasks, or at the specified time.
- Recurring and zero-point chores are included.
- Unassigned, completed, cancelled, expired, and missed tasks do not notify.
- No repeated daily overdue reminders.
- New bills generate one alert per affected roommate per import.
- Reimports, bill corrections, utility payments, and miscellaneous activity do not notify.
- Notes notify recipients other than the author.
- Note notifications say something like “Rina left you a note”; they omit the body, complaint/compliment type, and temperature.
- Text edits do not notify again; newly added recipients can be notified.
- Tapping a notification opens its associated item.
- Test notifications bypass quiet hours.

### Backend implementation

- Migration `008_notifications.sql`.
- Supabase Edge Function `household-push`.
- Standard encrypted Web Push using VAPID and `web-push`.
- A minute-by-minute `pg_cron` job invokes the sender through `pg_net`.
- Keys and sender secrets live in Vault/Edge secrets.
- Subscription data and device-token hashes are private and excluded from exports.
- Database outbox, delivery leases, bounded retries/backoff, expired-subscription handling, and delivery-time eligibility checks.
- Old delivery records are cleaned up after 30 days.
- Successful delivery means the push provider accepted it, not that a phone definitely displayed it.

The service worker handles **push and notification clicks only**. It has no fetch handler and does not cache application pages.

## Architecture and source map

The frontend is handwritten TypeScript and DOM code, bundled with esbuild. There is no React, Vue, or Vite.

| Area | Main files |
|---|---|
| Navigation, theme, refresh lifecycle | `src/app.ts` |
| Shared identity | `src/identity.ts` |
| DOM helpers, RPC, formatting | `src/ui.ts` |
| Utilities UI/accounting | `src/client.ts`, `src/ledger.ts` |
| Miscellaneous UI/accounting | `src/misc-client.ts`, `src/misc-ledger.ts` |
| Calculator | `src/calculator.ts`, `src/calculator-ui.ts` |
| Chores | `src/chores-client.ts`, `src/chores.ts`, `src/chore-icons.ts` |
| Bulletin | `src/bulletin-client.ts`, `src/bulletin.ts`, `src/bulletin-art.ts`, `src/reactions.ts` |
| Purchase illustrations | `src/icons.ts` |
| Notification settings | `src/notifications.ts` |
| HTML and styling | `public/index.html`, `public/style.css` |
| PWA assets | `public/sw.js`, `public/manifest.webmanifest` |
| Database definitions | `supabase/migrations/` |
| Push sender | `supabase/functions/household-push/` |
| Import/configuration/export tooling | `scripts/` |
| Tests | `tests/`, `tests/browser/` |

Routes use hashes:

```text
#utilities
#miscellaneous
#chores
#bulletin
```

Local storage includes:

- `household-person`
- `household-theme`
- Device-specific notification credentials/preferences

Visible pages refresh chores every 45 seconds; the active bulletin also refreshes periodically. Returning to the page refreshes data when no dialog is open.

The build gives JavaScript, CSS, and public configuration **content-hashed filenames**. Preserve this: earlier mismatched cached assets caused broken tab styling and theme behavior.

## Database and mutation model

Tables live in `ledger_private`, with RLS and direct anonymous table access revoked. The browser uses narrowly scoped `utilities_*` RPC functions.

Principal RPC groups:

```text
utilities_dashboard
utilities_save_payment

utilities_misc_dashboard
utilities_save_misc_expense
utilities_save_misc_settlement

utilities_chores_dashboard
utilities_save_chore
utilities_save_chore_routine

utilities_bulletin_dashboard
utilities_save_bulletin_note
```

There are corresponding exports, privileged bill import functions, and notification configuration/device/sender functions.

Mutations generally use:

- Append-only revision/event records.
- Expected versions to reject stale concurrent edits.
- Request IDs and payload checks for safe retries.
- Server-side validation and authoritative calculations.

A private database schema does **not** make the dashboard content private: public RPCs intentionally expose household records and their histories.

Migration sequence:

```text
001  Utilities
002  Rotating utility rounding
003  Miscellaneous ledger
004  Expanded icon support
005  Chores and routines
006  Zero-point reminders
007  Bulletin
008  Notifications
009  Task types, recipient reminders, quick completion, summary counts
010  Recurring items may start on any date
011  Half-point chores and exact shared credit
012  Authorized split of the existing trash pair into independent routines
```

For future database changes, add an upgrade migration and update both provisioning and the local database adapter. Editing an already-installed migration alone does not upgrade production. Provisioning currently detects installed features through specific database functions.

## Offline behavior and the recent Android incident

Supabase is the live source of truth.

Each module has a sanitized bundled fallback:

```text
data/ledger.json
data/misc-ledger.json
data/chores.json
data/bulletin.json
```

If a live fetch fails, the app shows a dated saved view and disables writes for that module. It does not queue offline edits. Other modules can still connect independently.

Snapshots update only when exported and subsequently deployed:

```bash
./export-ledgers.sh
```

This reads all four live ledgers, saves a private combined backup, and refreshes the four public snapshot files.

### October 20 Android incident

- The Android Home Screen app temporarily showed an old chore snapshot and disabled editing.
- iPhones continued loading live data.
- Read-only backend checks confirmed that the morning chores and their history were still in Supabase.
- Android recovered after a delay.
- No chores were deleted, restored, or modified during diagnosis.
- The precise transient failure was not established.

Do not “restore” an old snapshot over the database to address this symptom.

Two potential UX improvements remain unimplemented:

- More useful notification-permission diagnostics. Android initially showed a generic opt-in failure; enabling Chrome notification permissions resolved it.
- Better live-fetch error detail/retry feedback and explicit Android installation guidance.

## Development, testing, and deployment

Python tooling is managed with **uv**, `pyproject.toml`, and `uv.lock`; PyMuPDF is the main Python dependency. JavaScript tooling uses npm and its lockfile.

Start locally:

```bash
cd /home/mlewkowicz/utilities
./setup.sh
./dev.sh
```

The development server uses a local PGlite database at port `4173`, with state in `.local/database/`. Local edits do not affect Supabase.

### Checks

```bash
source scripts/runtime.sh

npm run check
npm test
uv run --frozen python -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run test:browser
uv run --frozen python scripts/check_privacy.py
```

Browser tests use an isolated temporary database on port `4174`. Coverage includes accounting, rounding, database permissions, concurrency, retries, PDF extraction, calculator behavior, chore rotations and DST, bulletin behavior, mobile layouts, deployment assets, and mocked notification delivery.

### Infrastructure upgrades

For database or notification infrastructure upgrades:

```bash
./configure.sh
```

The user enters a Supabase personal access token locally. It is not saved. The script saves only the importer credential in ignored `.env.local`, with restrictive permissions. The public publishable key and importer credential cannot perform all management operations needed for schema and Edge Function deployment.

An earlier configuration error from an empty successful API response was fixed; do not regress the handling of empty `201`/`204` bodies.

### Publication

For frontend publication:

```bash
./publish.sh
```

GitHub Actions deploys `dist/` on pushes to `main`. CI runs TypeScript, Node/database tests, Python tests, the build, and privacy checks. Playwright browser tests are currently run locally.

Only allowlisted public assets enter deployment. Keep `.env.local`, `.local/`, PDFs, inbox/archive folders, and private backups out of commits. Preserve the existing privacy checks and separate production infrastructure changes from ordinary frontend deployments.


## Working-tree refresh after this handoff

See [ROADMAP.md](ROADMAP.md) for the implementation status, upgrade order, validation, and remaining artwork/event/reward decisions. The historical production description above predates this working-tree change. Missing migrations 009–012 must be installed before releasing the refreshed frontend. Migration 012 is the user-authorized retroactive trash split; all other records are preserved. Production deployment status is recorded in ROADMAP.md.

The refresh adds muted filled tiles, compact expandable chores and purchases, atomic swipe completion, recipient reminders/task types, a points race, transient guest splitting, and lazy section loading. All four approved character derivatives now appear in the app. Pinned notes and the editor use the original author’s character, looping at the saved temperature; shared rendering, offscreen suspension, reduced motion, and a pause control keep the board lightweight. Source originals remain outside the build. Utility balances are unchanged; only the authorized trash pair receives the 0.5-point conversion. Public snapshots remain compatible; use the existing export workflow when refreshing them.
