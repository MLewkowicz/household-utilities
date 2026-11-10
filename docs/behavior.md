# Behavior and invariants

Use this for product rules; use [architecture](architecture.md) to locate code and [operations](operations.md) for administrative procedures.

## Identity and presentation

Choosing Michal, Rina, Ohm or Rohil changes the shared device identity. It is not authentication. Preserve their purple, pink, cyan and amber colors, approved portraits, paper tiles and folded detail corners. System, Time of day, Light and Dark remain available; Time of day follows fixed New York dawn/dusk windows. Errors, validation, saved/offline status and meaningful form guidance must remain visible when simplifying copy.

## Utilities and expenses

Utility reimbursement is separate from miscellaneous purchase/repayment balances. Michal pays providers; payments record money already sent to him. Rohil joins recurring utility shares on September 1, 2026. Recurring charges allocate across inclusive service days, with exact-cent rules implemented in `ledger.ts` and SQL; one-time charges retain their explicit allocation. Do not infer accounting corrections from labels or illustrations. [Operations](operations.md#billing-rules) preserves the detailed billing/import rules.

Expenses support roommate payer/participants, equal or custom shares, exact cent balancing, repayments, revisions and deleted entries. Edited custom shares stay fixed while Auto shares split the remainder. The optional guest calculator transfers only roommate shares/subtotal into a normal draft. Anonymous guests remain transient and never enter household records; saving is a separate action.

## To-dos

My tasks combines personal tasks, reminders, shared work/requests and as-needed turns in collapsible lanes. Personal lists remain visible when empty; named groups, pinning, cross-group drag moves, keyboard reordering and group renaming retain history and per-person order. Filters, Household, Week and Leaderboard remain available. The Household assignee filter starts at Everyone in the current controller.

Personal tasks earn no points. Optional deadlines use New York time; unfinished work becomes high priority within 48 hours, with explicit pins first and overdue deadlines ahead of upcoming ones. Personal/shared sources load independently; an unavailable source cannot disable the other source's valid actions.

Reminders can create independent tasks for multiple recipients. Requests earn zero; chores and routines can earn credit. Quick completion claims unassigned work atomically or completes the selected person's task. Covering someone and shared credit use completion details. Undo reverses credit without erasing history. Completed, cancelled, expired and missed tasks remain inspectable/exportable.

Scheduled routines repeat every 1–12 weeks, starting on the chosen date, with fixed or rotating owners. Queue availability is separate from due/expiry dates: future tasks can remain in Week until their due date or cycle start. As-needed routines keep one undated next turn; complete/skip advances once, pause/resume preserves rotation, and undo refuses to overwrite an already changed next turn. Do not loosen server-side completion guards.

Fixed job presets and custom 0/0.25/0.5/1/2/3 points coexist. Starting a dishwasher is 0.25; emptying it is 1; sweeping is 1 per selected space. Exact contributor credit is separate from money. `point-presets.ts` and migrations define the full policy. Historical corrections append revisions/adjustments; reward credits are not implemented.

## Events

Events offers Agenda and Calendar, plus past/cancelled history. Presets fill editable drafts. A new event can poll availability over up to six weeks or use a fixed interval. Poll participants mark Works/If needed; the host locks in a day/time. Past days retain marks but cannot receive new answers. Changing the poll window resets marks; changing a fixed interval resets attendance and reopens voting; text-only edits preserve responses. Yes/Maybe/No, host confirmation/cancellation and New York DST handling remain intact.

Opt-in notifications cover meaningful event changes and reminders two hours before confirmed start for Yes/Maybe attendees. Availability marking, voting and icon-only edits do not notify. See [operations](operations.md#phone-notifications).

## Bulletin

Notes are complaints/compliments with recipients and a −100 to +100 temperature. The author’s character and paper color remain attached to the original author when edited. Notes do not expire automatically. Delete/restore, filters, activity counts, reactions and exported revisions remain supported. Counts are unweighted, one per author and recipient, and do not affect money or chore points.

Each person can choose one of 14 character reactions per note; selecting it again removes it. Cached stills and brief reaction animation are independent of author-temperature animation. Motion pauses offscreen, behind dialogs or when the section/tab is hidden; reduced motion and the board pause control remain available. Source artwork is not deployed.

## Games

See [Atlas](geography-data.md) for modes, country sets, scoring, data sources and fallback behavior. The Games shortcut opens the hub from every feature. Back returns to the previous household route, including a task subview, and survives reload within the tab. A fresh direct Games visit defaults to To-dos. Every house scene supports the optional sky journey: scroll up at the top, use Page Up or choose Games. The same house renderer lifts through faceted clouds and stars; Escape/Cancel restores the scene, and reduced motion skips the flight. Entry from a scene returns to that scene; direct feature entry returns to its feature. Leaving the game does not reset a round; existing timed-round behavior remains unchanged.
