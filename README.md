# Household ledger

## House entry integration preview

This checkout (`ui/house-entry`) adds the approved house scenes above the existing feature pages. The local integration preview is **http://127.0.0.1:4191/** and uses an isolated, in-memory test database. The deployed website remains the existing release until this integration is reviewed and published.

Home fills the viewport with the animated environment and a house framed with breathing space. There are no gallery headings, scene descriptions or playback controls. Larger floating shortcuts form one centered row at the top on desktop, and two rows of three on phones. The shared order is Home → To-dos → Expenses → Events → Bulletin → Utilities → Home. A horizontal drag or quick swipe selects the adjacent scene and leaves the viewport at the house. A short drag rolls back without changing the route. Tapping the house plays its existing scene effect; taps on empty space and vertical scrolling do not. Arrow keys rotate, and Enter/Space trigger the effect with canvas focus.

A shortcut selects the feature immediately. Scrolling down from a selected scene also enters that feature: once the house leaves the viewport, it is removed from the scroll path while preserving the content position. The feature scrolls normally, and scrolling up stays in the feature. The floating Home shortcut restores the animation menu. Shortcuts stay available throughout. Direct feature URLs open the features without first downloading or starting WebGL. Browser history, task subroutes, notification links, original portraits and the existing System/Light/Dark preference are retained. Legacy `#home/personal` and `#home/assigned` links still target To-dos; bare `#home` is now the exterior.

The shared System/Light/Dark control and notification bell remain visible beside the floating tabs. The environment is modeled in Three.js using the same geometry and materials as the house: an open sage lawn, trees framing the clearing, faceted mountain ridges, ground rocks and grass, modeled clouds, sun, moon and stars. Eleven unequal summits and side ridges have asymmetric rock faces, gullies and irregular snowcaps; their bases and foothills sit behind the trees without intersecting the foliage. The house and trees cast onto the same lawn. There are no landscape image downloads, SVG mountains or CSS sky objects.

Changing theme moves the sun/moon behind the terrain and interpolates the sky and landscape lighting over 4.5 seconds. Reversing the preference continues from the current light level. The roof, chimney and exterior walls dim into cool moonlight, while rooms and portraits retain their brightness and colors. Inward-facing side walls stay warm in the cutaway scenes. The theater's dim lighting and Rina's local room blackout remain scene-controlled. Separate house and landscape light rigs render through one camera and depth buffer, with a transparent receiver carrying the house shadow onto the lawn. Exterior shading uses the same theme blend within the existing house pass, preserving shared shadows without another render pass. Trees sway gently, clouds drift, and an occasional shooting star crosses the night sky. These use the existing player loop, stop when the house is hidden or a dialog opens, and become still with reduced motion. The app's color variables also follow the preference. Distant summit heights adapt to portrait framing without moving their bases out of the foothills.

The 3D player remains a separate lazy-loaded bundle; direct feature links start neither the player nor its environment. Feature navigation does not await WebGL. Rendering stops offscreen, in hidden documents and behind open dialogs. Pointer movements update the next frame instead of immediately rendering another scene. Ambient animation targets 30 fps; turns can use each display frame. The canvas keeps at least native CSS resolution, with DPR capped at 1.5 on Retina displays. Ordinary-density screens use multisample antialiasing; Retina screens use supersampling without stacking an additional multisample pass. The earlier automatic resolution reduction has been removed because it visibly blurred the house. Static meshes are batched, stars are instanced, and the environment adds no texture assets or independent animation loops. Shadow and color passes remain synchronized. Tabs avoid live backdrop blur. Software preview frame rates still need to be distinguished from hardware graphics on a phone; this pass prioritizes a stable, sharp image.

Before the snowcap and independent-lighting pass, measurements at 390×844, DPR 1.5, Chromium SwiftShader and 4× CPU throttling showed that removing the redundant Retina multisample pass improved Home/Utilities/Events from 7.5/6.8/6.0 fps to 12.1/9.7/9.5 fps at the same resolution. This software stress test remains below the animation target. At 1440×900, DPR 1 with multisample antialiasing and no CPU throttle, the same software renderer measured 6.4 fps in Home. These are prior baseline measurements, not physical-device GPU results or a benchmark of the new lighting pass; animation performance remains unfinished. Feature shortcuts showed the interface in 31 ms and local test data in 269 ms; hidden scenes added zero frames, and direct feature URLs created no WebGL canvas. Renderer draw-call and triangle diagnostics now include both scenes and their shadow passes.

Source boundaries: `src/house-navigation.ts` defines the shared route/scene order; `src/house-entry.ts` manages lazy loading and visibility; `src/house/` contains the approved procedural scenes, their player and the modeled environment in `environment.ts`; `public/house-entry.css` styles the full-viewport entry and floating navigation. `src/app.ts` connects selection to the existing page loaders. No feature modules, accounting rules, RPCs or migrations are changed. The scene snapshot comes from Study 07 in the sibling `household-house-concepts` project, with app-specific routing, theme observation, relative avatar URLs and tap handling.

Run `npm run build` and `PORT=4191 UTILITIES_TEST_DB=1 node scripts/serve.mjs` for the isolated preview. `npm run test:house` starts a separate test database on port 4192 and checks navigation, gestures, loading independence, visibility, themes, fallback and the legacy task links. The original functionality checks remain available through `npm test` and `npm run test:browser`.

Validation for this pass includes TypeScript, build, publication checks and 17 house browser checks, including landscape-light transition reversal and rendered-pixel checks that the roof/facade change with the theme while all four utility rooms, portraits and theater lighting stay constant. The prior integration also passed 101 unit/database tests and 28 other feature browser checks; those feature modules are unchanged. `npm run measure:house` measures the running local preview and writes `.local/house-review/performance-latest.json`. It defaults to a phone viewport and 4× CPU throttling; set `HOUSE_WIDTH`, `HOUSE_HEIGHT`, `HOUSE_CPU_RATE` and `HOUSE_URL` to compare another setup. The output identifies the actual graphics renderer, which matters when comparing software previews with physical devices.


A small dashboard for Michal, Rina, Ohm, and Rohil, with **To-dos**, **Expenses**, **Events**, **Bulletin**, and **Utilities** tabs, in that order. GitHub Pages hosts the frontend; a free Supabase project stores shared history. There are no logins or private links. Changes are trust-based and names are self-reported. The header theme control supports System, Light, and Dark, remembers the choice on this device, and applies to every tab.

Website: **https://mlewkowicz.github.io/household-utilities/**

## Utilities

Send money to Michal with your normal payment app, then select **Record a payment**, enter the amount and date, and choose Venmo, Zelle, or Other. The form records a reimbursement; it does not transfer money or verify a bank transaction.

Anyone using the site can record or correct a payment. Edits and deletions create new history events instead of erasing old records. “Changed by” records the selected person, not a verified identity. No visitor can edit bills or erase the audit trail through the public API. Use **All activity** to see changes and **Export ledger** to download a backup.

The four cards show current balances. Michal’s card shows remaining reimbursements and his own share. The monthly table shows **charges before reimbursements**, with household and individual views. Payments apply to the overall balance. An overpayment becomes a credit. Missing statements say “Not imported”; partial months show the covered days.

## Expenses

Open **Expenses** at the same link, or go directly to `/#miscellaneous` after the repository path. Choose your name first; the site remembers it on this device and provides **Switch person**. This is a convenience, not authentication.

Choose **Add expense**, describe what you already bought, and enter its amount and date. All four roommates start included. Tap the other three tiles to exclude people, or switch off **Include my share** for something bought entirely for others. Equal shares preview immediately; **Custom amounts** preserves shares you edit and divides the remaining cents among people on **Auto**. Tap **Fixed** to release a share. A conflicting edit is prevented without changing earlier fixed amounts or the purchase total. Excluding yourself when one other person remains assigns that person the entire total. Purchases use USD and one payer. Rohil’s September utility cutoff does not apply to this ledger.

Use **Calculator** under a purchase or repayment amount to add items or evaluate arithmetic such as `12.50 + 8.75` or `60 × 25%`. In **Custom amounts**, each person's **÷** button opens a calculator with **Fraction / %**: `1/3` or `25%` applies to the purchase total. Calculator results use the same automatic balancing and preserve earlier edited shares. **Split with guests** is a secondary action below the regular split controls; only the household subtotal and shares are saved. Calculations only fill the form, and nothing is recorded until the expense or repayment is confirmed.

The 42 bundled SVG icons have local keyword suggestions and a searchable category picker, including specific foods and bathroom supplies. Typing previews an icon without marking it selected. Tapping an icon selects it and fills the description with its name by default; the text remains editable and the selected icon stays fixed. Switch off **Use icon name as description** to change only the icon. Descriptions and method notes are public: omit addresses, account details, and other personal information. There are no receipt uploads or external icon/AI services.

Each participant owes their share to the payer. Debts offset only between the same two people. **Record repayment** records money already sent between those people via Venmo, Zelle, or Other. Partial payments and overpayments are supported. The cards separately show what each person must pay and collect; all these amounts remain separate from utilities.

Opening a repayment from a debt card pre-fills that debt's amount and focuses the heading, so an input does not summon the phone keyboard. Tap an input when a correction or partial repayment is needed.

Anyone can edit or delete entries. Each card shows its latest version, with an expandable **History** listing changes and actors. **Show deleted** reveals removed entries. There is no approval queue. Concurrent edits must refresh before saving; retries are idempotent. New or changed equal splits rotate extra pennies using a separate transactional cursor. Saved shares on unrelated purchases never change, and description/icon edits or retries do not consume turns.

For an explicitly requested permanent cleanup, `./remove-deleted-expense.sh EXPENSE_ID --expected-version VERSION` removes only an already-deleted expense and its revisions. It requires a Supabase personal access token entered locally, saves a private recovery copy, checks the latest version, and verifies that other ledger data and balances are unchanged in the same transaction. It is not exposed to website visitors. Refresh the saved snapshots after cleanup.

**Export ledger** downloads the currently selected tab, including its history. To refresh all six separate website snapshots and save a private combined backup locally:

```bash
./export-ledgers.sh          # live ledgers, read-only database access
./export-ledgers.sh --local  # local preview on port 4173
```

Snapshots are published on the next code deployment. If a ledger cannot connect, its dated snapshot is displayed and its writes are disabled. New entries are never silently queued offline. The other tabs can still connect independently.

## My tasks

To-dos (`/#chores`) opens to **My tasks** by default. Choose your name, type a personal task, then press Enter or Add. Personal tasks and available work assigned to you share one feed, with All, Personal, and Assigned filters. The **Household** view contains everyone’s shared work, including unassigned requests. Future routines stay unavailable until their existing queue date.

**Add task** starts with Personal and also offers Reminder, Request, Chore, and Routine. Personal creation needs only a title; the quick-entry field remains available in My tasks. Old `#home`, `#home/personal`, and `#home/assigned` links open the corresponding To-dos views.

Use the completion slider or its Enter/Mark done alternative. The corner contains edit, pin, undo, deletion and revision history; **Completed & history** includes deleted tasks. Personal tasks earn no points and send no notifications. “Personal” means ownership and organization; these records are public under the selected-name model.

Pinned items come first. Drag a reorder handle or use Move up/down within a priority group; your order syncs across devices and new arrivals enter the top of their group. Moving shared work never changes its assignment or anyone else’s order. Personal and assigned sources load independently, with writes disabled only for the unavailable source. Failed saves leave the draft visible. My tasks export separates your personal history from your assigned-task history.

**Add task → Reminder** also handles payment reminders: for example, “Pay Michal for Bluebikes,” recipients, bicycle illustration, optional details and deadline. Completing it only marks the reminder done. Record money already sent in the existing Utilities or Expenses payment form.

## To-dos

Open **To-dos** at the same link (`/#chores`). Your selected identity is shared with Miscellaneous and Bulletin. The live board starts empty; shortcut illustrations and the trash-cycle template are drafts until someone saves them. Chores and credit never affect money balances.

- **My tasks** combines personal tasks and assigned work. **Household**, **Week**, and **Leaderboard** share the same page and identity controls. The To-dos badge retains its available pinned/overdue/due-today count.
- **Household** defaults to unassigned requests. Use **Assignee → Everyone** to see all household chores, or choose a roommate to see their assigned work. Its assignee filter is independent of the Week filter and resets to Unassigned on a fresh page load. Anyone can claim, hand back, reassign, edit, cancel, or complete a chore. The Household Show filter also reveals completed, missed, expired, and cancelled history within that view; the Week agenda retains its assignee filter. Each task has one card with expandable revisions, including the actor and optional change notes.
- **Week** is a Monday–Sunday agenda, with previous/next/Today and an assignee filter. It becomes a stacked agenda on phones. Undated requests remain on the board; spontaneous completions appear on the date done. Future routine previews extend 12 weeks.
- **Leaderboard** defaults to the current month, with week and all-time choices. Expand a person to see the completions behind their score. Equal exact scores share a rank.

**Request a chore** prompts you to choose your name if needed, then opens the form. It starts with 1 point, Anyone, and no pin or dates. Titles suggest bundled illustrations; the searchable category picker includes every expense illustration alongside chores, and manual selections survive title changes; the editable shortcuts include bananas, trash, recycling, and bins. Recycling uses three chasing arrows. **Request a repair**, a speech bubble with a wrench, covers messaging the landlord or reporting a problem; **Fix something** covers doing the repair yourself. A deadline makes unfinished work overdue. **Expire tonight** removes it from active queues at the next New York midnight; another expiry can be specified. Expired requests retain history and earn no credit. One-off chores do not disappear merely because a week ends.

**Show in queue → On due date** keeps a task out of My tasks and Household until the start of its due date in New York. Upcoming items remain in **Week**, with editing available but no completion control. Ordinary tasks default to **Immediately**; routines default to **On due date**, including existing routines. A saved or individually edited future occurrence follows the same rule as its preview. For routines, **At cycle start** can make later-due items available earlier within that cycle; it never opens future cycles early. Overdue work remains available until completion, expiry, or the next routine cycle.

**Log something done** records spontaneous work. Completing an existing chore defaults to you as contributor; select helpers to split credit equally among the actual contributors, regardless of assignment. Quick/small/medium/large tasks earn 0.5/1/2/3 points. Choose **No points · reminder** for requests such as washing your own dishes. Reminders can still be pinned, assigned, scheduled, and marked done, but do not add points or contributions to the leaderboard. Their completion and revisions remain in task history. This option also works for recurring items and completion corrections; existing tasks keep their saved effort. Credit is computed exactly, including half-point work shared by four people, and displayed to at most two decimal places. Missed, cancelled, and expired chores earn zero, with no deductions. Correct the people, effort, or actual completion time (including past dates) from My tasks or Household history. **Undo** reverses the credit and restores the task's current scheduled/expired/missed status.

Use **Add task → Routine** or **Week → Manage routines** to repeat one item every 1–12 weeks. Enter the item once, choose its first due date (any weekday), and choose a fixed owner or roommates who take turns. Optional time, illustration, and context stay in a disclosure. The selected date is the first occurrence, with later occurrences at the chosen interval. There is no separate routine name or step builder for new routines. Date-only deadlines fall at the end of the day; all scheduling uses America/New_York, including daylight-saving changes.

Rotation advances with the schedule even if work is missed or someone covers. At the next cycle, unfinished recurring items become **Missed**. Routine edits and pauses apply from the next cycle; completed history and explicitly edited individual occurrences remain intact. The original cycle anchor and interval stay fixed after creation; pause the old routine and create another to change its cadence. Pausing does not cancel individually edited future occurrences—cancel those separately if needed.

Migration `005_chores.sql` adds separate private task and routine revision tables plus narrowly scoped dashboard, save, and export functions. Stable occurrence IDs and transactional materialization prevent duplicate tasks without requiring a background job or visits every week. Updates use expected versions and idempotent request IDs; statuses and exact leaderboard totals are derived by the server. Refreshing the board materializes scheduled occurrences, never financial entries. Migration `006_chore_reminders.sql` enables zero-point reminders and excludes their completions from the leaderboard without rewriting any saved tasks or scores. The public snapshot is `data/chores.json`; offline chores are read-only. Chore titles, notes, assignments, scores, and revision history are public under the same trust-based model as the ledgers; leave personal details out.

## Complaint and compliment corners

Open **Bulletin** at the same link (`/#bulletin`). Complaints and compliments share one board; the **Notes** filter optionally shows only one kind. The textured corkboard has a wooden frame and a post planted in a small grass patch at its bottom. It grows vertically as notes arrive, with natural page scrolling all the way to its base. Lined pieces of paper have varied, stable tilts and offsets, classic red pushpins, and softened versions of the author’s roommate color: Michal purple, Rina pink, Ohm cyan, and Rohil amber. The face, message, recipient names, sender, and small month/day date remain visible. Lift a gray paper corner to reveal editing, temperature details, and expandable **History**. Notes have no expiry or automatic archiving.

Choose your name and **Pin a note**, select one or more recipients, and write up to 600 characters. The temperature slider runs from a complaint at −100 to a compliment at +100; the neutral middle asks you to choose a direction before saving. The author's approved character follows the chosen temperature continuously: complaints build from annoyance to flushed, steaming anger; compliments bring smiles, blush, heart eyes, and floating hearts. Pinned notes keep looping at their saved temperature. Editing someone else's note keeps its original author's character. The small pause control beside the board heading stops motion; device reduced-motion preferences are also respected. Characters pause offscreen, behind the editor, and when another section or browser tab is active. The artwork and animation run locally without an image service. The red pushpin is the bundled [Twemoji pushpin SVG](https://github.com/twitter/twemoji/blob/v14.0.2/assets/svg/1f4cc.svg), by Twitter, Inc and other contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the board links to its [art credits](public/credits.txt).

Anyone can edit, delete, or restore a note. Editing preserves its original author, paper color, and posting date while recording who changed it. Deleted notes leave the board and activity counts but remain available under **Show deleted**, with their revisions. **By the numbers** shows complaints and compliments written and received, plus leaders including ties, for all time, this month, or this week. A note counts once for its author and once for each recipient; edits never add extra counts. These are counts, not temperature-weighted scores, and never affect chore credit or either financial ledger.

Migration `007_bulletin.sql` creates an empty, separate note history and scoped save/read/export functions. Expected versions prevent overwriting someone else's changes; request IDs make retries safe. The anonymous API cannot access the underlying tables. This is the same public, trust-based household model: notes, identities, temperature, counts, and full revision history are publicly readable. Keep addresses and other personal information out of notes. The fallback snapshot is `data/bulletin.json`; offline views disable adding and editing. **Export ledger** on this tab includes all notes and revisions. The active board refreshes every 45 seconds when no form is open.

## Phone notifications

Tap the bell in the header to opt in on each device. No email, password, or phone number is required.

- **iPhone/iPad (iOS 16.4+):** Open the site in Safari, choose Share → Add to Home Screen, then open that new icon. Tap the bell, select your name, and enable notifications.
- **Android:** Open the site in a current supported browser such as Chrome, tap the bell, select your name, and enable notifications. A Home Screen shortcut is optional.
- **Desktop:** Supported browsers can opt in through the same bell. Multiple devices can receive one roommate’s notifications.
- The subscribed name belongs to this device. Switching whose dashboard you view does not change it. Change the name explicitly in notification settings, or choose **Disable on this device**.
- Toggle chores, bills, and notes independently. Quiet hours are 10 p.m.–8 a.m. New York time, including daylight-saving changes. Your phone’s notification/Focus settings still apply.
- Chores notify on assignment by someone else and once when due. Date-only chores remind at 9 a.m.; timed chores remind at their due time. Recurring and zero-point chores are included. Unassigned, completed, cancelled, expired, and missed tasks do not notify. There are no daily overdue nags.
- New bill imports produce one alert per affected roommate per import. Reimports, revised bills, payments, and miscellaneous purchases do not notify.
- Notes notify their recipients, excluding the author, with **“Rina left you a note”**. The body, complaint/compliment classification, and temperature stay out of the notification. Text edits do not notify again; newly added recipients do.
- A tap opens the corresponding item. The **Send test notification** button queues an alert only for this device, bypasses quiet hours, and does not create a household record.

Run `./configure.sh` once to install migration `008_notifications.sql`, deploy the `household-push` Edge Function, store signing material in Supabase Vault/Edge secrets, and schedule a minute-by-minute sender. Use a Supabase personal access token with database, Edge Function, and secrets access. The token stays in the terminal session. Reruns preserve existing signing keys and subscriptions; setup checks worker readiness without sending a notification. `--manual` configures only the importer, not the push worker.

The service worker handles push and notification clicks only; it does not cache pages or intercept financial requests. Manifest and worker paths are relative to the GitHub Pages project directory. Phone icons can be regenerated with `uv run --frozen python scripts/generate-phone-icons.py`.

Subscriptions, opaque device-token hashes, delivery attempts, and signing keys are private and excluded from exports and publication. Device enrollment follows the site's existing choose-a-name trust model; it is not verified identity. Only the server can claim/send alerts. Endpoints are restricted to browser push providers. Temporary failures retry with backoff; expired subscriptions are disabled. Delivery records expire after 30 days. Public ledger data and revision history remain untouched.

For administration, the Supabase SQL Editor can inspect queue health without exposing device endpoints:

```sql
SELECT e.kind, d.state, count(*), max(d.sent_at) AS last_accepted,
       max(d.last_error) AS last_error
FROM ledger_private.push_deliveries d
JOIN ledger_private.push_events e ON e.id=d.event_id
GROUP BY e.kind,d.state;
SELECT start_time,status,return_message
FROM cron.job_run_details
WHERE jobid=(SELECT jobid FROM cron.job WHERE jobname='household-push')
ORDER BY start_time DESC LIMIT 10;
```

The Edge Function logs operational batch failures without subscription URLs or message bodies. A successful push-service response means accepted, not confirmed displayed. Phones can delay delivery, and a paused/unavailable Supabase project cannot send reminders. Real lock-screen delivery must be checked on an opted-in iPhone and Android phone; automated tests mock browser permission and push-service delivery without contacting anyone.

## Import and organize PDFs

Drop new PDFs in this folder or `inbox/`, with **any filename**—there is no need to rename them first—then run:

```bash
./import-bills.sh
```

The script extracts text locally, previews the service dates and charges, asks for confirmation, sends only structured bill information to Supabase, and then moves PDFs into:

```text
bills/
  2026/
    electricity/2026-08-21_to_2026-09-17_eversource_electricity_94.98_3193bb4e.pdf
    gas/2026-08-21_to_2026-09-17_eversource_gas_48.21_5170bd6f.pdf
    wifi/2026-08-01_to_2026-08-31_xfinity_wifi_50.94_a29665ea.pdf
```

Names contain service dates, provider, utility, current charges, and a short SHA-256 hash. Copies never overwrite an existing file. Reimporting the same bill does not add charges twice. Normal imports scan only the root and inbox, leaving previously archived revisions alone. No site rebuild is needed: visitors read the latest shared database on load, refresh, or return to the tab.

Useful commands:

```bash
./import-bills.sh --dry-run                   # preview new PDFs; change nothing
./import-bills.sh --organize-only             # organize all PDFs locally, no database writes
./import-bills.sh --include-archive --dry-run # inspect previous and new PDFs
./import-bills.sh path/to/statement.pdf        # import a specific statement or revision
./import-bills.sh --export                    # local backup + sanitized website snapshot
./import-bills.sh --local                     # use the local preview, not the live database
```

Unknown formats, scanned PDFs, ambiguous totals, unusual fees, and inconsistent day counts stop the batch before files move or bills are published. Source PDFs remain available after an upload failure. Successful database imports are idempotent, so rerunning after a lost response is safe. The local export is in `.local/backups/`.

For a statement that needs correction or manual classification, create an **ignored** file such as `.local/overrides.json`. Keys are the PDF’s filename or full SHA-256 hash:

```json
{
  "statement.pdf": {
    "provider": "xfinity",
    "bill": {
      "utility": "wifi",
      "start_date": "2026-11-01",
      "end_date": "2026-11-30",
      "charges": [
        {"kind": "recurring", "amount_cents": 5094, "label": "Monthly service and tax"},
        {"kind": "one_time", "amount_cents": 2000, "label": "Equipment"}
      ]
    }
  }
}
```

Run `./import-bills.sh statement.pdf --overrides .local/overrides.json`. Amounts are integer cents; credits are negative. Use neutral labels without personal or account details. To change a statement’s dates, include its existing `id` so it becomes a revision instead of a second overlapping bill. Previously published values are shown before confirmation.

If an unknown-date opening charge is ever added, its original statement must explicitly replace it when imported. Add `"replaces_opening": [{"id": "opening-gas", "expected_version": 1}]` inside that bill’s override after checking the full opening amount is accounted for. This replaces the whole opening charge; if it covers multiple earlier bills, import all of them together. The old opening record remains in the history. Overlapping service periods are rejected.

## Billing rules

- Michal pays providers; Rina, Ohm, and Rohil reimburse him. The ledger tracks shared expenses independently of whether the provider account has been paid.
- Rohil’s recurring share starts **September 1, 2026**. Earlier service days split three ways; later days split four ways.
- Recurring charges, taxes, and fees are spread uniformly over the statement’s inclusive service days. Original statements remain the source for service dates; the parser checks printed day counts.
- One-time installation/equipment charges split among all four, allocated to the service-start month. Review and classify unusual charges manually.
- Calculate person/month shares before rounding. Largest-remainder allocation conserves every statement’s cents and month totals. Tied pennies rotate among eligible roommates across bills in service-date order (then end date, utility, ID, and charge order); whole tied groups do not consume a turn. Credits rotate separately. Reimports, page refreshes, and payments do not advance the rotation. Backdated bills and corrections replay it, so later shares may move by pennies.
- The five initial statements contribute $296.01 in new charges. The earlier electricity ($100.54) and gas ($30.98) charges cover **August 1–20, 2026**, as confirmed by the household. They add $131.52, for **$427.53** total, and appear in August’s breakdown. The next cycle begins August 21, so there is no overlap. The previous unknown-date records remain only in the correction history.
- August’s $25 Xfinity EFT is a provider payment, not an expense or roommate reimbursement. August Wi-Fi costs $50.94 and splits into three shares of $16.98.

## Setup and development

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then:

```bash
./setup.sh
./dev.sh
```

`setup.sh` syncs Python through `pyproject.toml`/`uv.lock` and JavaScript through `package.json`/`package-lock.json`. If Node is missing, it installs a checksum-verified official Node 24 LTS binary into ignored `.tools/`; no system configuration changes. Python dependencies are isolated in `.venv`. JavaScript dependencies live in ignored `node_modules/` because uv does not manage npm packages.

The local dashboard is at **http://127.0.0.1:4173**. It uses a private local PostgreSQL-compatible PGlite database, seeded with the sanitized initial bills. Local payment changes do not affect Supabase. Local data lives in `.local/database/`.

To run checks (use `source scripts/runtime.sh` first if Node is installed only in `.tools`):

```bash
source scripts/runtime.sh
npm run check
npm test
uv run --frozen python -m unittest discover -s tests -p 'test_*.py'
npm run build
npm run test:browser
uv run --frozen python scripts/check_privacy.py
```

Browser checks start an isolated temporary database on port 4174. They never write test entries to Supabase. If Chromium is unavailable, run `npx playwright install chromium` once. Accounting, database permissions, stale updates, idempotency, PDF extraction, archive collisions, and desktop/mobile flows have automated coverage, including miscellaneous shares, repayments, themes, retrying lost save responses, chore rotations, shared credit, DST boundaries, concurrent completion, bulletin temperatures and activity counts, long-board scrolling, and financial-ledger invariance.

The reaction development gallery runs with `npm run preview:reactions` at `http://127.0.0.1:4191`. It compares all 14 expressions for all four housemates against their static thumbnails. Play any example, replay the selection, or pause motion; keyboard controls work normally. Reduced motion keeps expressive stills, and hidden/offscreen previews suspend drawing. The gallery uses the approved public avatar pack and never connects to Supabase. `npx playwright test tests/browser/reaction-gallery.spec.ts` verifies all 56 transparent image bounds and motion controls, saving desktop comparisons and a phone screenshot under `.local/reaction-checks/`. This development gallery is separate from the published app.

## Supabase and publication

Keep the Supabase organization on **Free**. `config.public.json` contains only the project URL and public publishable key. The public key is intended for browser use. Bill imports need the separate secret key in `.env.local`.

Initial setup:

```bash
./configure.sh
./import-bills.sh --initial-august
./publish.sh
```

`configure.sh` prompts locally for a Supabase personal access token, installs missing SQL migrations from `supabase/migrations/`, retrieves the importer credential, and saves it to `.env.local` with owner-only permissions. It does not save the access token. Rerun it to apply database upgrades; existing bills and payments are preserved. Alternatively, run only the missing SQL files in order in the Supabase SQL Editor, then use `./configure.sh --manual` to enter a secret/service-role key locally. Never put secret keys in the public configuration or GitHub Actions.

`publish.sh` uses the authenticated GitHub account and a public `household-utilities` repository. It checks the app, stages an explicit source allowlist, performs the privacy check, pushes `main`, and enables GitHub Pages. The workflow deploys only `dist/`. Later code changes deploy on pushes to `main`; normal bill/payment updates go directly to Supabase.

Supabase Free can pause low-activity projects after a week. If the site shows an unavailable connection, open the [Supabase project dashboard](https://supabase.com/dashboard/project/obgjjeypflwzzouhjzkx) and resume the project, then refresh. No paid service or automatic upgrade is configured. Until connectivity returns, the app clearly labels its last available snapshot and disables payment entry; it never pretends an offline payment was saved. The published fallback snapshot changes on the next code deployment, not on every database update.

### What is public

First names, utility amounts, service dates, per-person shares, payment method descriptions, and the complete correction history are public by design. The publishable key grants only the narrowly scoped read and payment functions; bills require the secret import credential. Tables live in a private schema with public table access revoked and RLS enabled. Public writes append payment events, not arbitrary table updates.

Miscellaneous descriptions, purchase dates, payer/participants, saved shares, repayments, and revision history are also public. Their data lives in separate private tables. Public access uses `utilities_misc_dashboard`, `utilities_save_misc_expense`, `utilities_save_misc_settlement`, and `utilities_export_misc_ledger`; these never write utility records. Migration `003_miscellaneous.sql` installs an empty ledger. Migration `004_expand_icon_catalog.sql` permits bounded icon IDs so future SVG additions need no database update; unknown IDs display the Receipt icon. Neither migration changes existing utility records, and `004` preserves all miscellaneous history. `configure.sh` applies each upgrade only when missing.

PDFs, addresses, full names, provider account numbers, original extracted text, local backups, and secret credentials are excluded from Git and deployment. PDFs never leave the computer through this tooling. The privacy check compares deploy artifacts with address/account strings extracted locally and rejects secret keys or tracked private files. `noindex` discourages search engines; it does not make a public site private.


## Current household refresh

Group renaming requires additive migration **021**. Existing installations need migrations **017–021** (and earlier prerequisites); `./configure.sh` installs any that are missing. Migration 017 stores separate personal task revisions and per-member task order; 018 preserves event illustrations; 019 expands reactions; 020 preserves personal group names in revisions and saves cross-group drag moves with task ordering in one transaction. Migration 021 adds atomic group renaming from the group header, including completed and deleted tasks, with version checks and retained history. Existing group names cannot be overwritten. The publisher verifies these capabilities and refreshes all six snapshots before deploying dependent UI. Existing records and prior revisions remain intact. Migration 013 adds Events; 014 adds note reactions; 015 adds fixed point presets and append-only adjustment support. Migration 016 adds queue timing and completion guards without rewriting any records or scores. The earlier migration 012 preserves the already split trash routines.

Personal tasks, shared tasks, expenses, and bulletin notes use one SVG paper silhouette with a continuous perimeter through the lifted corner. Pinning changes that same outline from 1px to 2px; no separate border ring or background patch is used. Frames resize with the content and release their observers when removed. Explanatory info buttons are removed throughout; necessary form guidance remains beside the relevant fields. Expenses retain payer-colored fills, amount and date; splits, history, and editing sit behind the corner. Existing `#miscellaneous` and `#chores` links still work. Alcohol remains in the expense catalog, including the Guinness keyword, and is removed from chore shortcuts. Existing Alcohol task icons still render.

### Events

Open **Events** for the upcoming agenda or month calendar. Start with Movie night, Board games, Go for a walk, Skiing, Eat out, or Cook together, or enter a custom title. Presets fill a draft title and illustration, preserve date/time defaults, and require Save. Change the icon independently; old events use a calendar. Propose a start/end interval with optional location and details. All four roommates can answer Yes, Maybe, or No and change or clear their answer; approving portraits appear on the invitation card. The host confirms explicitly. Changing the interval clears current responses and reopens voting, retaining history. Text-only edits preserve responses. All times use New York time; nonexistent spring-forward times are rejected and the repeated autumn hour uses standard time. Past and cancelled events remain available in history. Events have no push notifications yet.

### Points

Tasks and routine items can select a **Household job** preset with fixed points, independent of the illustration. Custom jobs retain the 0/0.5/1/2/3 effort scale; reminders and personal requests earn zero. Presets: trash, bag replacement, recycling, bins out/return, and starting the dishwasher: 0.5; bananas and corridor sweeping: 1; kitchen/living-room sweeping and shared grocery pickup: 2; furniture pickup and repair of a shared household item: 3.

After installing the schema, preview the agreed historical adoption with `uv run --frozen python scripts/apply_point_policy.py`; use `--apply` to apply it. The tool saves a fresh private combined backup, an exact versioned preview, and the resulting records. It maps explicit job titles, never illustrations, keeps unmatched work unchanged, and appends task/routine revisions. `point_adjustments` records preserve before/after values and reasons. The service-only reversal API requires that the task has not changed since its adjustment. Undo and recompletion use the latest task snapshot, so credit is never counted twice. Utility-credit rewards are still deferred.

### Note reactions and rendering

Each roommate can leave one changeable reaction using their own character: crying laughing, confused, mogging, vomit, gentle laughing, disappointed, shocked, gasp, eye roll, sobbing, rage, heart eyes, smug, or facepalm. Selecting the same reaction removes it. Reactions never change the author’s temperature or note statistics. Static expression thumbnails are generated once and cached for up to 56 character/expression pairs. Only selection plays a brief animation; reduced motion stays still. Existing author-temperature animation remains independent. Source artwork stays outside the public build.

Each tab remains lazy loaded. Events and reactions use version checks, retry identifiers, exported histories, and read-only fallback behavior. See [ROADMAP.md](ROADMAP.md) for release validation and remaining iterations.

Personal tasks can be organized under named project headers. Type a new group or choose an existing name when adding or editing a task. Hold a tile briefly to drag it; neighboring tiles shift as you move, and dragging a personal task into another group changes its group. Pinned tasks remain in their priority section. A quick swipe still scrolls; completion uses its own slider. Keyboard users can tab to Move up/down controls, which appear on focus. Escape cancels a held move. Groups and task order sync with the selected name and remain part of history and exports.
