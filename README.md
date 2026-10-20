# Household ledger

A small dashboard for Michal, Rina, Ohm, and Rohil, with separate **Utilities** and **Miscellaneous** tabs. GitHub Pages hosts the frontend; a free Supabase project stores shared history. There are no logins or private links. Changes are trust-based and names are self-reported. The header theme control supports System, Light, and Dark, remembers the choice on this device, and applies to both tabs.

Website: **https://mlewkowicz.github.io/household-utilities/**

## Utilities

Send money to Michal with your normal payment app, then select **Record a payment**, enter the amount and date, and choose Venmo, Zelle, or Other. The form records a reimbursement; it does not transfer money or verify a bank transaction.

Anyone using the site can record or correct a payment. Edits and deletions create new history events instead of erasing old records. “Changed by” records the selected person, not a verified identity. No visitor can edit bills or erase the audit trail through the public API. Use **All activity** to see changes and **Export ledger** to download a backup.

The four cards show current balances. Michal’s card shows remaining reimbursements and his own share. The monthly table shows **charges before reimbursements**, with household and individual views. Payments apply to the overall balance. An overpayment becomes a credit. Missing statements say “Not imported”; partial months show the covered days.

## Miscellaneous purchases

Open **Miscellaneous** at the same link, or go directly to `/#miscellaneous` after the repository path. Choose your name first; the site remembers it on this device and provides **Switch person**. This is a convenience, not authentication.

Choose **Add expense**, describe what you already bought, and enter its amount and date. All four roommates start included. Tap the other three tiles to exclude people, or switch off **Include my share** for something bought entirely for others. Equal shares preview immediately; **Custom amounts** lets you assign exact dollar amounts, which must sum to the total. Purchases use USD and one payer. Rohil’s September utility cutoff does not apply to this ledger.

Use **Calculator** under a purchase or repayment amount to add items or evaluate arithmetic such as `12.50 + 8.75` or `60 × 25%`. In **Custom amounts**, each person's **÷** button opens a calculator with **Fraction / %**: `1/3` or `25%` applies to the purchase total. Optionally check **Split the rest equally among the others** to allocate the remainder to the other selected roommates. Results are rounded to cents; the saved custom shares must still add up exactly. Calculations only fill the form, and nothing is recorded until the expense or repayment is confirmed.

The 41 bundled SVG icons have local keyword suggestions and a searchable category picker, including specific foods and bathroom supplies. Typing previews an icon without marking it selected. Tapping an icon selects it and fills the description with its name by default; the text remains editable and the selected icon stays fixed. Switch off **Use icon name as description** to change only the icon. Descriptions and method notes are public: omit addresses, account details, and other personal information. There are no receipt uploads or external icon/AI services.

Each participant owes their share to the payer. Debts offset only between the same two people. **Record repayment** records money already sent between those people via Venmo, Zelle, or Other. Partial payments and overpayments are supported. The cards separately show what each person must pay and collect; all these amounts remain separate from utilities.

Opening a repayment from a debt card pre-fills that debt's amount and focuses the heading, so an input does not summon the phone keyboard. Tap an input when a correction or partial repayment is needed.

Anyone can edit or delete entries. Each card shows its latest version, with an expandable **History** listing changes and actors. **Show deleted** reveals removed entries. There is no approval queue. Concurrent edits must refresh before saving; retries are idempotent. New or changed equal splits rotate extra pennies using a separate transactional cursor. Saved shares on unrelated purchases never change, and description/icon edits or retries do not consume turns.

For an explicitly requested permanent cleanup, `./remove-deleted-expense.sh EXPENSE_ID --expected-version VERSION` removes only an already-deleted expense and its revisions. It requires a Supabase personal access token entered locally, saves a private recovery copy, checks the latest version, and verifies that other ledger data and balances are unchanged in the same transaction. It is not exposed to website visitors. Refresh the saved snapshots after cleanup.

**Export ledger** downloads the currently selected tab, including its history. To refresh both separate website snapshots and save a private combined backup locally:

```bash
./export-ledgers.sh          # live ledgers, read-only database access
./export-ledgers.sh --local  # local preview on port 4173
```

Snapshots are published on the next code deployment. If a ledger cannot connect, its dated snapshot is displayed and its writes are disabled. New entries are never silently queued offline. The other tab can still connect independently.

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

Browser checks start an isolated temporary database on port 4174. They never write test entries to Supabase. If Chromium is unavailable, run `npx playwright install chromium` once. Accounting, database permissions, stale updates, idempotency, PDF extraction, archive collisions, and desktop/mobile flows have automated coverage, including miscellaneous shares, repayments, themes, and retrying lost save responses.

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
