# Household ledger

## Task and atlas update

**Games** is accessed above Home. Scroll upward at the top of Home, press PageUp, or choose **Games**: the house camera rises into the sky and approaches a rotatable 3D Earth. The six household tabs and horizontal house rotation stay unchanged. **Play geography** opens the quiz around the large globe. Drag to rotate, pinch/scroll to zoom, and use **Reset view** to restore a regional preset. NOAA ETOPO1 elevation data drives the raised terrain, 8K surface colors and detailed slope lighting. Country borders remain sharp during zoom, with native-resolution regional terrain textures loaded on demand for close views. A four-tile limit and smaller base textures/meshes on phones bound memory use. A plain map keeps the quiz available if WebGL fails. Select a country or territory, type its name, and use region-filtered suggestions. Correct answers turn green and reveal a card with capital, dated population, four historical excerpts where available, and landscape context. Practice World, continents, Caribbean, Central America, Micronesia, Polynesia or Melanesia. **Random country** zooms to an unanswered place; **Reset view** restores the selected region without resetting the round. Round settings offer optional time limits and lives; identified/remaining counts follow the region. Switch between **Terrain** and a plain **Paper** globe without resetting play. Untimed rounds offer progressive hints and triple-click/button reveals; revealed countries are counted separately from correct answers. Progress is saved per person on this device. See [atlas data and controls](docs/geography-data.md) for sources, coverage and limitations; the app itself has no historical source links.

The task editor now suggests one illustration as a title is typed, with the suggestion's title-copy option checked. The full catalog below defaults to preserving the typed title. Chores, reminders, requests and quick reminders share the picker. Personal tasks support optional New York deadlines, including editing/removing them. Unfinished tasks enter high priority within 48 hours, with overdue tasks ahead of upcoming deadlines; explicit pins remain first. Personal lists remain visible even when empty, list headings use drawn chevrons, and filters follow the lists.

Sweeping costs **1 point per selected space**: kitchen, living room and corridor. Choose several in one log to calculate 1–3 points; contributor splits remain exact. Migration **027** corrects Michal's existing two-point kitchen completions to kitchen + living room, retaining the total, completion details and original revisions. It also changes the catalog and future routine values. Migration **028** adds personal deadlines, preserves them during group changes and existing actions, and expands shared urgency counts to the 48-hour window. Apply both with `./configure.sh` before publishing this frontend; the release capability check enforces that dependency.

Time-of-day mode now has separate dawn and dusk palettes: blue and violet at dawn, plum with warm amber accents at dusk. The modeled sky uses violet/red/orange sunset bands or purple/blue sunrise bands, horizon glow, wispy clouds and a low sun. Explicit Light/Dark still override the clock.

## House entry integration preview

The house entry adds the approved house scenes above the existing feature pages and ships through the existing `main` → GitHub Pages workflow. The local integration preview is **http://127.0.0.1:4191/** and uses an isolated, in-memory test database.

Home fills the viewport with the animated environment and a house framed with breathing space. There are no gallery headings, scene descriptions or playback controls. Floating shortcuts form two rows of three on desktop and phones, with the theme icon beside Expenses and Settings directly below it. The bar docks flush to the top with a solid background when scrolling into a feature. The shared order is Home → To-dos → Expenses → Events → Bulletin → Utilities → Home. A horizontal drag or quick swipe selects the adjacent scene and leaves the viewport at the house. The house follows the drag direction; additional gestures and arrow presses are ignored until the current rotation settles, so rapid input cannot build a queue. Touch gestures recognize short diagonal swipes on narrow phones, with a 28–44px commit distance and a shorter settling animation. A small tentative drag rolls back without changing the route. Tapping the house plays its existing scene effect; taps on empty space and vertical scrolling do not. Arrow keys rotate, and Enter/Space trigger the effect with canvas focus.

A shortcut selects the feature immediately. Scrolling down from Home reveals To-dos without requiring a rotation; rotating first selects which feature appears below the house. Once the house leaves the viewport, it is removed from the scroll path while preserving the content position. Scrolling up at a feature’s top smoothly brings back that feature’s matching house scene (To-dos returns to the To-dos room). Scrolling past the bottom stays on the current page. A fresh upward wheel burst, downward finger swipe, or Page Up at the top starts the return; reaching an edge mid-gesture does not leave the page. Dialogs, task dragging, completion sliders and nested scroll areas retain their own gestures. The floating Home shortcut also restores the animation menu; all shortcuts remain available throughout. Direct feature URLs open the features without first downloading or starting WebGL. Browser history, task subroutes, notification links, original portraits and the existing System/Light/Dark preference are retained. Legacy `#home/personal` and `#home/assigned` links still target To-dos; bare `#home` is now the exterior.

The header theme icon cycles through Light, Dark, and Time of day; a clock marks Time of day. Settings contains System, Time of day, Light and Dark preferences, notification options and Refresh for the active section. System follows the device preference for the interface while the home scene follows New York time. Time of day also gradually blends the app’s colors. Dawn runs from 6–8am and dusk from 5–7pm; these are fixed local-time windows, not astronomical sunrise/sunset. Explicit Light/Dark choices override both the interface and scene, and all choices persist on this device. The environment is modeled in Three.js using the same geometry and materials as the house: an open sage lawn, trees framing the clearing, faceted mountain ridges, ground rocks and grass, modeled clouds, sun, moon and stars. Eleven unequal summits and side ridges have asymmetric rock faces, gullies and irregular snowcaps; their bases and foothills sit behind the trees without intersecting the foliage. The house and trees cast onto the same lawn. There are no landscape image downloads, SVG mountains or CSS sky objects.

Changing theme moves the sun/moon behind the terrain and interpolates the sky and landscape lighting over 4.5 seconds. Reversing the preference continues from the current light level. The roof, chimney and exterior walls dim into cool moonlight, while rooms and portraits retain their brightness and colors. Inward-facing side walls stay warm in the cutaway scenes. The theater's dim lighting and Rina's local room blackout remain scene-controlled. Separate house and landscape light rigs render through one camera and depth buffer, with a transparent receiver carrying the house shadow onto the lawn. Exterior shading uses the same theme blend within the existing house pass, preserving shared shadows without another render pass. Trees sway gently, clouds drift, and an occasional shooting star crosses the night sky. These use the existing player loop, stop when the house is hidden or a dialog opens, and become still with reduced motion. The app's color variables also follow the preference. Distant summit heights adapt to portrait framing without moving their bases out of the foothills.

The utilities upper floor retains Michal’s toilet repair and Rina’s isolated light switch. Downstairs, Ohm lounges on a bed with two wall AC units, a portable AC, a spinning fan and modeled airflow. Rohil sings in a tiled shower with a continuous instanced stream, ripples and floating musical notes. His three lyric bubbles cycle every 4.5 seconds; tapping advances the verse as part of the scene effect. The two lower rooms have separate builders in `src/house/utility-downstairs.ts` so they can be iterated independently. Water, fan and notes use the existing animation clock, pause with the scene and respect reduced motion.

The 3D player remains a separate lazy-loaded bundle; direct feature links start neither the player nor its environment. Feature navigation does not await WebGL. Rendering stops offscreen, in hidden documents and behind open dialogs. Pointer movements update the next frame instead of immediately rendering another scene. Ambient animation targets 30 fps; turns can use each display frame. The canvas keeps at least native CSS resolution, with DPR capped at 2 on Retina displays. House portraits use the approved 512-pixel assets. Ordinary-density screens use multisample antialiasing; Retina screens use supersampling without stacking an additional multisample pass. The earlier automatic resolution reduction has been removed because it visibly blurred the house. Static meshes are batched, stars are instanced, and the environment adds no texture assets or independent animation loops. Shadow and color passes remain synchronized. Tabs avoid live backdrop blur. Software preview frame rates still need to be distinguished from hardware graphics on a phone; this pass prioritizes a stable, sharp image.

The initial release measured 10.3/9.1/10.1 fps in Home/Utilities/Events at 390×844, DPR 1.5, Chromium SwiftShader and 4× CPU throttling. This software stress test remains below the animation target and is not a physical-device GPU benchmark; further animation optimization is planned after the initial release. Feature shortcuts showed the interface in 30 ms and local test data in 263 ms; hidden scenes added zero frames, and direct feature URLs created no WebGL canvas. The lazy scene bundle is 157.5 KiB gzipped. Renderer draw-call and triangle diagnostics include both scenes and their shadow passes.

Source boundaries: `src/house-navigation.ts` defines the shared route/scene order; `src/house-entry.ts` manages lazy loading and visibility; `src/section-scroll.ts` handles fresh gestures at section boundaries; `src/house/` contains the approved procedural scenes, their player and the modeled environment in `environment.ts`; `public/house-entry.css` styles the full-viewport entry and floating navigation. `src/app.ts` connects selection to the existing page loaders; `src/settings.ts` owns the theme preference and Settings dialog. No feature modules, accounting rules, RPCs or migrations are changed. The scene snapshot comes from Study 07 in the sibling `household-house-concepts` project, with app-specific routing, theme observation, relative avatar URLs and tap handling.

Run `npm run build` and `PORT=4191 UTILITIES_TEST_DB=1 node scripts/serve.mjs` for the isolated preview. `npm run test:house` starts a separate test database on port 4192 and checks navigation, gestures, loading independence, visibility, themes, fallback and the legacy task links. The original functionality checks remain available through `npm test` and `npm run test:browser`.

Initial house-release validation passed TypeScript, build, publication checks, live database capability checks, 101 unit/database tests and all 92 browser tests. The browser suite includes 20 house checks and six section-scroll checks at iPhone 13 Mini viewport dimensions, swipe direction and repeated-input guards, two-row docking and Settings behavior, landscape-light transition reversal, and rendered-pixel checks that the roof/facade change with the theme while all four utility rooms, portraits and theater lighting stay constant. Python checks passed with seven tests and one skipped test. `npm run measure:house` measures the running local preview and writes `.local/house-review/performance-latest.json`. It defaults to a phone viewport and 4× CPU throttling; set `HOUSE_WIDTH`, `HOUSE_HEIGHT`, `HOUSE_CPU_RATE` and `HOUSE_URL` to compare another setup. The output identifies the actual graphics renderer, which matters when comparing software previews with physical devices.


A small dashboard for Michal, Rina, Ohm, and Rohil, with **To-dos**, **Expenses**, **Events**, **Bulletin**, and **Utilities** tabs, in that order. GitHub Pages hosts the frontend; a free Supabase project stores shared history. There are no logins or private links. Changes are trust-based and names are self-reported. Settings supports System, Time of day, Light, and Dark, remembers the choice on this device, and applies to every tab. The header theme icon cycles through Light, Dark, and Time of day.

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

**Settings → Export ledger** downloads the currently selected tab, including its history. To refresh all six separate website snapshots and save a private combined backup locally:

```bash
./export-ledgers.sh          # live ledgers, read-only database access
./export-ledgers.sh --local  # local preview on port 4173
```

Snapshots are published on the next code deployment. If a ledger cannot connect, its dated snapshot is displayed and its writes are disabled. New entries are never silently queued offline. The other tabs can still connect independently.

## My tasks

To-dos (`/#chores`) opens to **My tasks** by default. Choose your name, type a personal task, then press Enter or Add task. The feed uses collapsible, nonempty **Personal**, **Reminders**, **Household**, and **Taking turns** lanes, with All, Personal, Assigned, and Unassigned source filters. Personal group chips narrow larger lists; group renaming and cross-group drag moves remain available. Compact paper tiles have lifted corners for secondary actions. Slide the bullet across the tile to complete: its background fills, both the outline and chevron border strengthen near the threshold, and the handle stays inset. The existing haptic helper ticks at the threshold and signals accepted completion. Shared chores and turns open the contributor form before saving; canceling it leaves the task untouched. Existing edit, pin, cancel/delete, restore, history, completion correction, and undo actions remain available. **Remind me** in the quick composer creates a one-time or weekly reminder for the selected person without selecting recipients; these share the Reminders lane with incoming reminders. Recurring schedules use the existing routine editor and queue dates. The **Household** view contains everyone’s shared work, including unassigned requests. Future routines stay unavailable until their existing queue date.

For layout exploration, run `npm run preview:todos` and open `http://127.0.0.1:4192`, or open [the standalone concept gallery](docs/todo-concepts/index.html) directly. Compare an overview grid, category lanes, and an overview with a focused card list at phone and desktop widths. The revised [category-lanes study](docs/todo-concepts/lanes.html) adds collapsible, nonempty lanes, personal group filters with a larger sample workload, compact paper tiles with lifted action corners, bounded swipe handles, near-completion border highlighting, and the app’s existing haptic feedback, and a quick **Remind me** mode for one-time or weekly self-reminders. Self-set and incoming reminders share one lane. Shared chores and turns ask who helped before completion; the preview shows equal credit splits and supports cancellation and undo. Every concept uses disposable sample data, including the illustrative milk rotation; no alerts are sent and nothing connects to the live database. The gallery stays outside the app build. The preview server rebuilds `docs/todo-concepts/shared.js` from the production paper geometry and haptic helpers; this generated file also lets the standalone gallery work offline.

The implemented To-do layout keeps these requirements: retain the existing edit forms and their illustration, assignment, contribution, dates, queue, expiry, and recurrence controls; pinning and ordering; deletion/cancellation, restoration, completion corrections, undo, and revision history; group editing; and multi-person completion with exact shared credit. The lifted corner exposes secondary actions without adding a separate task expander to the completion path. Reuse `src/tile-corner.ts` and `src/haptics.ts`; keep the swipe handle inset inside the tile at every width, progressively highlight its actual paper outline near completion, tick when the release threshold is crossed, and play success feedback only when completion is accepted (after contributor confirmation for shared work). Haptics remain best-effort and need a real-phone check before shipping. The standalone concept remains a separate sample-data preview; the app uses the existing versioned save APIs and needs no new database migration for this layout.

**Add task** starts with Personal and also offers Reminder, Request, Chore, and Routine. Personal creation needs only a title; the quick-entry field remains available in My tasks. Old `#home/personal` and `#home/assigned` links open the corresponding To-dos views; bare `#home` opens the house.

Use the completion slider or its Enter/Mark done alternative. The corner contains edit, pin, undo, deletion and revision history; **Completed & removed** includes deleted tasks. Personal tasks earn no points and send no notifications. “Personal” means ownership and organization; these records are public under the selected-name model.

Pinned items come first within each lane. Hold a tile’s text to drag it, or use Move up/down within a priority group; your order syncs across devices and new arrivals enter the top of their group. Moving shared work never changes its assignment or anyone else’s order. Personal and assigned sources load independently, with writes disabled only for the unavailable source. Failed saves leave the draft visible. My tasks export separates your personal history from your assigned-task history.

**Add task → Reminder** also handles payment reminders: for example, “Pay Michal for Bluebikes,” recipients, bicycle illustration, optional details and deadline. Completing it only marks the reminder done. Record money already sent in the existing Utilities or Expenses payment form.

## To-dos

**Add task → Routine → As needed** creates one undated next-turn task. Select the participants and set their order under **Rotation order**. Completing the task (or choosing **Skip turn** in its details) advances once to the next person; elapsed time never creates extra tasks, overdue flags, or date reminders. Pausing removes the pending turn; resuming retains who goes next. Undo withdraws an untouched next turn and restores the previous one; it refuses if a later turn was already edited or completed. Routine edits affect the next turn. The milk rotation can use this option with Michal, Rohil and Rina, and Request for zero household points.

Open **To-dos** at the same link (`/#chores`). Your selected identity is shared with Miscellaneous and Bulletin. The live board starts empty; shortcut illustrations and the trash-cycle template are drafts until someone saves them. Chores and credit never affect money balances.

- **My tasks** combines personal tasks, assigned work and unassigned shared tasks. **Household**, **Week**, and **Leaderboard** share the same page and identity controls. The To-dos badge retains its available pinned/overdue/due-today count.
- **Household** defaults to unassigned requests. Use **Assignee → Everyone** to see all household chores, or choose a roommate to see their assigned work. Its assignee filter is independent of the Week filter and resets to Unassigned on a fresh page load. Anyone can claim, hand back, reassign, edit, cancel, or complete a chore. The Household Show filter also reveals completed, missed, expired, and cancelled history within that view; the Week agenda retains its assignee filter. Each task has one card with expandable revisions, including the actor and optional change notes.
- **Week** is a Monday–Sunday agenda, with previous/next/Today and an assignee filter. It becomes a stacked agenda on phones. Undated requests remain on the board; spontaneous completions appear on the date done. Future routine previews extend 12 weeks.
- **Leaderboard** defaults to the current month, with week and all-time choices. Expand a person to see the completions behind their score. Equal exact scores share a rank.

**Request a chore** prompts you to choose your name if needed, then opens the form. It starts with 1 point, Anyone, and no pin or dates. Titles suggest bundled illustrations; the searchable category picker includes every expense illustration alongside chores, and manual selections survive title changes; the single title-driven suggestion offers title copying by default, while the catalog preserves your title by default. Recycling uses three chasing arrows. **Request a repair**, a speech bubble with a wrench, covers messaging the landlord or reporting a problem; **Fix something** covers doing the repair yourself. A deadline makes unfinished work overdue. **Expire tonight** removes it from active queues at the next New York midnight; another expiry can be specified. Expired requests retain history and earn no credit. One-off chores do not disappear merely because a week ends.

**Show in queue → On due date** keeps a task out of My tasks and Household until the start of its due date in New York. Upcoming items remain in **Week**, with editing available but no completion control. Ordinary tasks default to **Immediately**; routines default to **On due date**, including existing routines. A saved or individually edited future occurrence follows the same rule as its preview. For routines, **At cycle start** can make later-due items available earlier within that cycle; it never opens future cycles early. Overdue work remains available until completion, expiry, or the next routine cycle.

**Log something done** records spontaneous work. Completing an existing chore defaults to you as contributor; select helpers to split credit equally among the actual contributors, regardless of assignment. Tiny/quick/small/medium/large tasks earn 0.25/0.5/1/2/3 points. Choose **No points · reminder** for requests such as washing your own dishes. Reminders can still be pinned, assigned, scheduled, and marked done, but do not add points or contributions to the leaderboard. Their completion and revisions remain in task history. This option also works for recurring items and completion corrections; existing tasks keep their saved effort. Credit is computed exactly, including half-point work shared by four people, and displayed to at most two decimal places. Missed, cancelled, and expired chores earn zero, with no deductions. Correct the people, effort, or actual completion time (including past dates) from My tasks or Household history. **Undo** reverses the credit and restores the task's current scheduled/expired/missed status.

Use **Add task → Routine** or **Week → Manage routines** to repeat one item every 1–12 weeks. Enter the item once, choose its first due date (any weekday), and choose a fixed owner or roommates who take turns. Optional time, illustration, and context stay in a disclosure. The selected date is the first occurrence, with later occurrences at the chosen interval. There is no separate routine name or step builder for new routines. Date-only deadlines fall at the end of the day; all scheduling uses America/New_York, including daylight-saving changes.

Rotation advances with the schedule even if work is missed or someone covers. At the next cycle, unfinished recurring items become **Missed**. Routine edits and pauses apply from the next cycle; completed history and explicitly edited individual occurrences remain intact. The original cycle anchor and interval stay fixed after creation; pause the old routine and create another to change its cadence. Pausing does not cancel individually edited future occurrences—cancel those separately if needed.

Migration `005_chores.sql` adds separate private task and routine revision tables plus narrowly scoped dashboard, save, and export functions. Stable occurrence IDs and transactional materialization prevent duplicate tasks without requiring a background job or visits every week. Updates use expected versions and idempotent request IDs; statuses and exact leaderboard totals are derived by the server. Refreshing the board materializes scheduled occurrences, never financial entries. Migration `006_chore_reminders.sql` enables zero-point reminders and excludes their completions from the leaderboard without rewriting any saved tasks or scores. The public snapshot is `data/chores.json`; offline chores are read-only. Chore titles, notes, assignments, scores, and revision history are public under the same trust-based model as the ledgers; leave personal details out.

## Complaint and compliment corners

Open **Bulletin** at the same link (`/#bulletin`). Complaints and compliments share one board; the **Notes** filter optionally shows only one kind. The textured corkboard has a wooden frame and a post planted in a small grass patch at its bottom. It grows vertically as notes arrive, with natural page scrolling all the way to its base. Lined pieces of paper have varied, stable tilts and offsets, classic red pushpins, and softened versions of the author’s roommate color: Michal purple, Rina pink, Ohm cyan, and Rohil amber. The face, message, recipient names, sender, and small month/day date remain visible. Lift a gray paper corner to reveal editing, temperature details, and expandable **History**. Notes have no expiry or automatic archiving.

Choose your name and **Pin a note**, select one or more recipients, and write up to 600 characters. The temperature slider runs from a complaint at −100 to a compliment at +100; the neutral middle asks you to choose a direction before saving. The author's approved character follows the chosen temperature continuously: complaints build from annoyance to flushed, steaming anger; compliments bring smiles, blush, heart eyes, and floating hearts. Pinned notes keep looping at their saved temperature. Editing someone else's note keeps its original author's character. The small pause control beside the board heading stops motion; device reduced-motion preferences are also respected. Characters pause offscreen, behind the editor, and when another section or browser tab is active. The artwork and animation run locally without an image service. The red pushpin is the bundled [Twemoji pushpin SVG](https://github.com/twitter/twemoji/blob/v14.0.2/assets/svg/1f4cc.svg), by Twitter, Inc and other contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); the board links to its [art credits](public/credits.txt).

Anyone can edit, delete, or restore a note. Editing preserves its original author, paper color, and posting date while recording who changed it. Deleted notes leave the board and activity counts but remain available under **Show deleted**, with their revisions. **By the numbers** shows complaints and compliments written and received, plus leaders including ties, for all time, this month, or this week. A note counts once for its author and once for each recipient; edits never add extra counts. These are counts, not temperature-weighted scores, and never affect chore credit or either financial ledger.

Migration `007_bulletin.sql` creates an empty, separate note history and scoped save/read/export functions. Expected versions prevent overwriting someone else's changes; request IDs make retries safe. The anonymous API cannot access the underlying tables. This is the same public, trust-based household model: notes, identities, temperature, counts, and full revision history are publicly readable. Keep addresses and other personal information out of notes. The fallback snapshot is `data/bulletin.json`; offline views disable adding and editing. **Export ledger** on this tab includes all notes and revisions. The active board refreshes every 45 seconds when no form is open.

## Phone notifications

Open Settings → Notifications to opt in on each device. No email, password, or phone number is required.

- **iPhone/iPad (iOS 16.4+):** Open the site in Safari, choose Share → Add to Home Screen, then open that new icon. Open Settings → Notifications, select your name, and enable notifications.
- **Android:** Open the site in a current supported browser such as Chrome, open Settings → Notifications, select your name, and enable notifications. A Home Screen shortcut is optional.
- **Desktop:** Supported browsers can opt in through Settings → Notifications. Multiple devices can receive one roommate’s notifications.
- The subscribed name belongs to this device. Switching whose dashboard you view does not change it. Change the name explicitly in notification settings, or choose **Disable on this device**.
- Toggle chores, bills, notes, and events independently. Quiet hours are 10 p.m.–8 a.m. New York time, including daylight-saving changes. Your phone’s notification/Focus settings still apply.
- Chores notify on assignment by someone else and once when due. Date-only chores remind at 9 a.m.; timed chores remind at their due time. Recurring and zero-point chores are included. Unassigned, completed, cancelled, expired, and missed tasks do not notify. There are no daily overdue nags.
- New bill imports produce one alert per affected roommate per import. Reimports, revised bills, payments, and miscellaneous purchases do not notify.
- Notes notify their recipients, excluding the author, with **“Rina left you a note”**. The body, complaint/compliment classification, and temperature stay out of the notification. Text edits do not notify again; newly added recipients do.
- Events notify everyone except the person acting when an event or day poll is posted, a time is locked in or changed, or an event is cancelled. People who answered Yes or Maybe get one reminder two hours before the start. Title, location, description, poll-window and rough-time edits also notify after migration 024. Marking poll days, voting, icon-only edits and unchanged saves are silent. Devices enrolled before migration 023 are opted in to events and can untick it.
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

Migration **024** adds event-edit notifications. **025** adds quarter points and the Empty dishwasher preset, and appends the authorized dishwasher corrections while preserving original revisions and contributors. **026** adds as-needed rotations. **027** adds per-space sweeping and **028** adds personal deadlines. The publisher checks these capabilities before release.

Event polls and event notifications require additive migrations **022** and **023** (023 extends the notification functions from 008). Group renaming requires migration **021**. Existing installations need migrations **017–028** (and earlier prerequisites); `./configure.sh` installs any that are missing. Migration 017 stores separate personal task revisions and per-member task order; 018 preserves event illustrations; 019 expands reactions; 020 preserves personal group names in revisions and saves cross-group drag moves with task ordering in one transaction. Migration 021 adds atomic group renaming from the group header, including completed and deleted tasks, with version checks and retained history. Existing group names cannot be overwritten. The publisher verifies these capabilities and refreshes all six snapshots before deploying dependent UI. Existing records and prior revisions remain intact. Migration 013 adds Events; 014 adds note reactions; 015 adds fixed point presets and append-only adjustment support. Migration 016 adds queue timing and completion guards without rewriting any records or scores. The earlier migration 012 preserves the already split trash routines.

Personal tasks, shared tasks, expenses, and bulletin notes use one SVG paper silhouette with a continuous perimeter through the lifted corner. Pinning changes that same outline from 1px to 2px; no separate border ring or background patch is used. Frames resize with the content and release their observers when removed. Explanatory info buttons are removed throughout; necessary form guidance remains beside the relevant fields. Expenses retain payer-colored fills, amount and date; splits, history, and editing sit behind the corner. Existing `#miscellaneous` and `#chores` links still work. Alcohol remains in the expense catalog, including the Guinness keyword, and is removed from chore shortcuts. Existing Alcohol task icons still render.

### Events

**Find a day together** (the default for new events) creates a poll over a window of up to six weeks, with an optional rough time such as “Evening”. Each roommate drags across the day grid to paint the days that work, using the **Works** or **If needed** brush; tapping a painted day again clears it, and Enter/Space and the arrow keys do the same from a keyboard. The brush controls stay visible while marks save. The grid shades days by how many people are free and outlines days everyone can make. As New York days pass, old dates become read-only and leave the suggestions and host’s day picker; their marks remain in history. The host taps **Lock in a day**, picks one (the best days are listed first) and sets the time; the event then becomes confirmed, and Yes/Maybe/No become attendance answers. Changing the poll window clears everyone’s marks. Polls, marks and lock-ins are append-only revisions in migration **022**, included in exports (`format_version` 3). Choose **I know the time** for the original fixed-time flow below.

Open **Events** for the upcoming agenda or month calendar. Start with Movie night, Board games, Go for a walk, Skiing, Eat out, or Cook together, or enter a custom title. Presets fill a draft title and illustration, preserve date/time defaults, and require Save. Change the icon independently; old events use a calendar. Propose a start/end interval with optional location and details. All four roommates can answer Yes, Maybe, or No and change or clear their answer; approving portraits appear on the invitation card. The host confirms explicitly. Changing the interval clears current responses and reopens voting, retaining history. Text-only edits preserve responses. All times use New York time; nonexistent spring-forward times are rejected and the repeated autumn hour uses standard time. Past and cancelled events remain available in history. Event notifications cover posting, meaningful edits, confirmation, cancellation and reminders two hours before the start for Yes/Maybe attendees.

### Points

Tasks and routine items can select a **Household job** preset with fixed points, independent of the illustration. Custom jobs retain the 0/0.25/0.5/1/2/3 effort scale; reminders and personal requests earn zero. Presets: starting the dishwasher: 0.25; trash, bag replacement, recycling and bins out/return: 0.5; emptying the dishwasher, bananas and each swept space: 1; shared grocery pickup: 2; furniture pickup and repair of a shared household item: 3.

After installing the schema, preview the agreed historical adoption with `uv run --frozen python scripts/apply_point_policy.py`; use `--apply` to apply it. The tool saves a fresh private combined backup, an exact versioned preview, and the resulting records. It maps explicit job titles, never illustrations, keeps unmatched work unchanged, and appends task/routine revisions. `point_adjustments` records preserve before/after values and reasons. The service-only reversal API requires that the task has not changed since its adjustment. Undo and recompletion use the latest task snapshot, so credit is never counted twice. Utility-credit rewards are still deferred.

### Note reactions and rendering

Each roommate can leave one changeable reaction using their own character: crying laughing, confused, mogging, vomit, gentle laughing, disappointed, shocked, gasp, eye roll, sobbing, rage, heart eyes, smug, or facepalm. Selecting the same reaction removes it. Reactions never change the author’s temperature or note statistics. Static expression thumbnails are generated once and cached for up to 56 character/expression pairs. Only selection plays a brief animation; reduced motion stays still. Existing author-temperature animation remains independent. Source artwork stays outside the public build.

Each tab remains lazy loaded. Events and reactions use version checks, retry identifiers, exported histories, and read-only fallback behavior. See [ROADMAP.md](ROADMAP.md) for release validation and remaining iterations.

Personal tasks can be organized under named project headers. Type a new group or choose an existing name when adding or editing a task. Hold a tile briefly to drag it; neighboring tiles shift as you move, and dragging a personal task into another group changes its group. Pinned tasks remain in their priority section. A quick swipe still scrolls; completion uses its own slider. Keyboard users can tab to Move up/down controls, which appear on focus. Escape cancels a held move. Groups and task order sync with the selected name and remain part of history and exports.
