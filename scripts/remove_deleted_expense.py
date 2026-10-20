"""Permanently remove one explicitly selected, already-deleted miscellaneous expense."""
import argparse
from datetime import datetime, timezone
import getpass
import json
import os
import sys
from uuid import UUID
from configure import ROOT, request


def cleanup_sql(record_id, version):
    record_id = str(UUID(record_id))
    version = int(version)
    if version < 1:
        raise ValueError("Expected version must be positive.")
    return f"""DO $$
DECLARE
 target record; before_misc jsonb; after_misc jsonb; before_utilities jsonb;
BEGIN
 LOCK TABLE ledger_private.misc_expense_events,ledger_private.misc_settlement_events IN EXCLUSIVE MODE;
 SELECT * INTO target FROM ledger_private.current_misc_expenses WHERE record_id='{record_id}';
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT target.deleted OR target.version<>{version} THEN
   RAISE EXCEPTION 'Expense is active or its version changed; nothing was removed';
 END IF;
 before_misc:=public.utilities_misc_dashboard();
 before_utilities:=public.utilities_dashboard();
 before_misc:=jsonb_set(before_misc,'{{expenses}}',coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(before_misc->'expenses') e WHERE e->>'id'<>'{record_id}'),'[]'::jsonb));
 before_misc:=jsonb_set(before_misc,'{{expense_history}}',coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(before_misc->'expense_history') e WHERE e->>'id'<>'{record_id}'),'[]'::jsonb));
 DELETE FROM ledger_private.misc_expense_events WHERE record_id='{record_id}';
 after_misc:=public.utilities_misc_dashboard();
 IF before_misc-'updated_at' IS DISTINCT FROM after_misc-'updated_at'
    OR before_utilities-'updated_at' IS DISTINCT FROM public.utilities_dashboard()-'updated_at' THEN
   RAISE EXCEPTION 'Unrelated ledger data changed; cleanup rolled back';
 END IF;
END;
$$;"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("expense_id", type=lambda value: str(UUID(value)))
    parser.add_argument("--expected-version", type=int, required=True)
    args = parser.parse_args()
    sql = cleanup_sql(args.expense_id, args.expected_version)
    print("This removes only the selected deleted expense and its revisions. Other entries are preserved.")
    token = os.environ.get("SUPABASE_ACCESS_TOKEN") or getpass.getpass("Supabase personal access token (hidden, not saved): ").strip()
    if not token:
        raise ValueError("No token provided; nothing changed.")
    config = json.loads((ROOT / "config.public.json").read_text())
    ref = config["url"].split("//")[1].split(".")[0]
    url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
    backup = request(url, token, {"query": f"SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY version),'[]'::jsonb) AS events FROM ledger_private.misc_expense_events e WHERE record_id='{args.expense_id}'"})
    events = backup[0]["events"]
    if not events:
        print("This expense is already absent; nothing changed.")
        return
    if not events[-1]["deleted"] or events[-1]["version"] != args.expected_version:
        raise ValueError("Expense is active or its version changed; nothing was removed.")
    folder = ROOT / ".local/backups"
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    target = folder / f"removed_expense_{args.expense_id}_{stamp}.json"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as out:
        json.dump(events, out, indent=2)
    request(url, token, {"query": sql})
    print(f"Removed the deleted expense and its {len(events)} history rows. Other entries and balances are unchanged.")
    print("A private recovery copy was saved in .local/backups/.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, OSError, KeyboardInterrupt) as exc:
        sys.exit(f"Cleanup stopped: {exc}")
