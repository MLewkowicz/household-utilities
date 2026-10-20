"""Provision this project's schema without putting credentials in shell history."""
import getpass
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
from configure_notifications import configure_notifications

ROOT = Path(__file__).resolve().parent.parent

def request(url, token, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            # Management writes such as uploading Edge Function secrets can
            # succeed with an empty 201/204 response body.
            body = response.read()
            return json.loads(body) if body.strip() else None
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Supabase returned HTTP {exc.code}. Check the token and project access.") from None

def main():
    config = json.loads((ROOT / "config.public.json").read_text())
    if "--manual" in sys.argv:
        print("First install any missing migrations from supabase/migrations/ in order in the SQL Editor.")
        print("Existing projects need migrations 009 through 012 (and any earlier missing migrations); do not rerun installed migrations.")
        print("Phone delivery also needs the normal ./configure.sh flow to deploy its worker, signing keys, and schedule.")
        key = getpass.getpass("Supabase secret key or legacy service_role key (hidden): ").strip()
    else:
        print("Create a personal access token at https://supabase.com/dashboard/account/tokens")
        print("It is used only for setup and will not be saved. The local importer key will be saved privately.")
        token = os.environ.get("SUPABASE_ACCESS_TOKEN") or getpass.getpass("Supabase personal access token (hidden): ").strip()
        if not token:
            raise RuntimeError("No token provided; nothing changed.")
        ref = config["url"].split("//")[1].split(".")[0]
        base = f"https://api.supabase.com/v1/projects/{ref}"
        result = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('public.utilities_dashboard()')::text AS fn"})
        if not result or not result[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/001_utilities.sql").read_text()})
            print("Database schema installed.")
        else:
            print("Base database schema already installed.")
        rotation = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('ledger_private.allocate_ledger(jsonb)')::text AS fn"})
        if not rotation or not rotation[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/002_rotating_rounding.sql").read_text()})
            print("Rotating rounding installed; bill and payment history preserved.")
        else:
            print("Rotating rounding is already installed.")
        misc = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('public.utilities_misc_dashboard()')::text AS fn"})
        if not misc or not misc[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/003_miscellaneous.sql").read_text()})
            print("Miscellaneous ledger installed, initially empty. Utilities preserved.")
        icons = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('ledger_private.valid_misc_icon_id(text)')::text AS fn"})
        if not icons or not icons[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/004_expand_icon_catalog.sql").read_text()})
            print("Expanded icon support installed; balances and all history preserved.")
        chores = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('public.utilities_chores_dashboard()')::text AS fn"})
        if not chores or not chores[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/005_chores.sql").read_text()})
            print("Chore Corner installed, initially empty. Both financial ledgers and all history preserved.")
        reminders = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('ledger_private.chore_credit_units(jsonb)')::text AS fn"})
        if not reminders or not reminders[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/006_chore_reminders.sql").read_text()})
            print("No-points reminders installed; existing chores, scores, and financial history preserved.")
        bulletin = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('public.utilities_bulletin_dashboard()')::text AS fn"})
        if not bulletin or not bulletin[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/007_bulletin.sql").read_text()})
            print("Bulletin board installed, initially empty. Existing ledgers, chores, and scores preserved.")
        keys = request(base + "/api-keys", token)
        candidates = [k for k in keys if k.get("name") == "service_role" or k.get("type") == "secret"]
        if not candidates:
            raise RuntimeError("Schema installed. Run ./configure.sh --manual with a secret key from Project Settings > API Keys.")
        key = candidates[0]["api_key"]
        configure_notifications(base, token, config, request)
        tasks = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('public.utilities_save_reminders(jsonb)')::text AS fn"})
        if not tasks or not tasks[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/009_task_refresh.sql").read_text()})
            print("Task types, recipient reminders, and quick completion installed; existing records preserved.")
        routines = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('ledger_private.chore_routine_start(text)')::text AS fn"})
        if not routines or not routines[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/010_routine_start_dates.sql").read_text()})
            print("Routines can start on any date; existing schedules and history preserved.")
        points = request(base + "/database/query", token, {"query": "SELECT to_regprocedure('ledger_private.chore_effort(jsonb)')::text AS fn"})
        if not points or not points[0].get("fn"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/011_half_point_chores.sql").read_text()})
            print("Half-point chores installed with exact shared credit.")
        split = request(base + "/database/query", token, {"query": "SELECT to_regclass('ledger_private.chore_routine_splits')::text AS marker"})
        if not split or not split[0].get("marker"):
            request(base + "/database/query", token, {"query": (ROOT / "supabase/migrations/012_split_trash_routine.sql").read_text()})
            print("Trash and replacement-bag routines split into separate half-point items.")
    if not key.startswith(("sb_secret_", "eyJ")):
        raise RuntimeError("Use a secret/service_role key, not the publishable key.")
    target = ROOT / ".env.local"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as out:
        out.write(f"SUPABASE_SECRET_KEY={key}\n")
    print("Importer configured in .env.local (excluded from Git).")
    print("Use ./import-bills.sh for new statements, or ./export-ledgers.sh to refresh all saved snapshots.")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyboardInterrupt) as exc:
        print(f"Setup stopped: {exc}", file=sys.stderr)
        sys.exit(1)
