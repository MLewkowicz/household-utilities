"""Provision this project's schema without putting credentials in shell history."""
import getpass
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent

def request(url, token, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Supabase returned HTTP {exc.code}. Check the token and project access.") from None

def main():
    config = json.loads((ROOT / "config.public.json").read_text())
    if "--manual" in sys.argv:
        print("First install any missing migrations from supabase/migrations/ in order in the SQL Editor.")
        print("Projects with the miscellaneous ledger need 004_expand_icon_catalog.sql; do not rerun installed migrations.")
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
        keys = request(base + "/api-keys", token)
        candidates = [k for k in keys if k.get("name") == "service_role" or k.get("type") == "secret"]
        if not candidates:
            raise RuntimeError("Schema installed. Run ./configure.sh --manual with a secret key from Project Settings > API Keys.")
        key = candidates[0]["api_key"]
    if not key.startswith(("sb_secret_", "eyJ")):
        raise RuntimeError("Use a secret/service_role key, not the publishable key.")
    target = ROOT / ".env.local"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w") as out:
        out.write(f"SUPABASE_SECRET_KEY={key}\n")
    print("Importer configured in .env.local (excluded from Git).")
    print("Use ./import-bills.sh for new statements, or ./export-ledgers.sh to refresh both saved snapshots.")

if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyboardInterrupt) as exc:
        print(f"Setup stopped: {exc}", file=sys.stderr)
        sys.exit(1)
