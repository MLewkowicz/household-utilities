"""Save separate backups and website snapshots for all household ledgers."""
from datetime import datetime, timezone
import sys
from import_bills import ROOT, load_config, rpc, write_json

def main():
    config = load_config("--local" in sys.argv)
    # Fetch all three before replacing snapshots, so a failed connection changes none.
    utilities = rpc(config, "export_ledger")
    miscellaneous = rpc(config, "export_misc_ledger")
    chores = rpc(config, "export_chores")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    write_json(ROOT / ".local/backups" / f"household_{stamp}.json", {"utilities": utilities, "miscellaneous": miscellaneous, "chores": chores})
    write_json(ROOT / "data/ledger.json", utilities)
    write_json(ROOT / "data/misc-ledger.json", miscellaneous)
    write_json(ROOT / "data/chores.json", chores)
    print("Saved a private backup and refreshed all three separate website snapshots. Publish to update the offline copies.")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyboardInterrupt) as exc:
        raise SystemExit(f"Export stopped: {exc}") from None
