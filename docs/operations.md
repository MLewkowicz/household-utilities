# Operations

Read this for imports, backups, database upgrades, notifications or publication. Everyday frontend work only needs the [project guide](../README.md) and [architecture](architecture.md).

## Backups and snapshots

Run `./export-ledgers.sh` for a read-only live export or `./export-ledgers.sh --local` for the local preview. Private combined backups go under `.local/backups/`; six sanitized fallback files go under `data/`. Publish only sanitized snapshots. Exports retain revisions and deleted records.

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

First names, utility amounts, service dates, per-person shares, payment method descriptions, and the complete correction history are public by design. The publishable key grants the narrowly scoped household RPCs; bills require the secret import credential. Tables live in a private schema with public table access revoked and RLS enabled. Public writes use scoped RPCs with version checks and retained revisions, not arbitrary table updates.

Miscellaneous descriptions, purchase dates, payer/participants, saved shares, repayments, and revision history are also public. Their data lives in separate private tables. Public access uses `utilities_misc_dashboard`, `utilities_save_misc_expense`, `utilities_save_misc_settlement`, and `utilities_export_misc_ledger`; these never write utility records. Migration `003_miscellaneous.sql` installs an empty ledger. Migration `004_expand_icon_catalog.sql` permits bounded icon IDs so future SVG additions need no database update; unknown IDs display the Receipt icon. Neither migration changes existing utility records, and `004` preserves all miscellaneous history. `configure.sh` applies each upgrade only when missing.

PDFs, addresses, full names, provider account numbers, original extracted text, local backups, and secret credentials are excluded from Git and deployment. PDFs never leave the computer through this tooling. The privacy check compares deploy artifacts with address/account strings extracted locally and rejects secret keys or tracked private files. `noindex` discourages search engines; it does not make a public site private.



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
