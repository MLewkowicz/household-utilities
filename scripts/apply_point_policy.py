"""Preview/adopt the agreed household-v1 point catalog, retaining a private recovery copy."""
import json
import os
import sys
from datetime import datetime, timezone
from uuid import uuid4
from import_bills import ROOT, load_config, rpc, write_json


def main():
    config = load_config("--local" in sys.argv)
    backup = {name: rpc(config, function) for name, function in [
        ("utilities", "export_ledger"), ("miscellaneous", "export_misc_ledger"),
        ("chores", "export_chores"), ("bulletin", "export_bulletin"), ("events", "export_events")
    ]}
    preview = rpc(config, "point_policy_preview")
    delta = {m: 0 for m in ("michal", "rina", "ohm", "rohil")}
    for row in preview["tasks"]:
        before, after = row["before_data"], row["after_data"]
        print(f"{before['title']}: {before['points']} → {after['points']} points ({before['state']})")
        if before["state"] == "completed":
            people = before["completion"]["contributors"]
            for member in people:
                delta[member] += (after["points"] - before["points"]) * 12 / len(people)
    print("Historical score changes:", ", ".join(f"{m}: {v / 12:+.4f}" for m, v in delta.items()))
    print(f"{len(preview['routines'])} routine(s) will adopt the presets at the next effective occurrence.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = ROOT / ".local/backups" / f"point-policy-{stamp}.json"
    request = {"actor": "michal", "request_id": str(uuid4()), "expected_preview": preview}
    write_json(path, {"before": backup, "request": request, "delta_units": delta})
    os.chmod(path, 0o600)
    print("Recovery and exact preview:", path)
    if "--apply" not in sys.argv:
        print("Preview only. Add --apply to adopt the agreed catalog.")
        return
    result = rpc(config, "apply_point_policy", request)
    after = {name: rpc(config, function) for name, function in [
        ("utilities", "export_ledger"), ("miscellaneous", "export_misc_ledger"),
        ("chores", "export_chores"), ("bulletin", "export_bulletin"), ("events", "export_events")
    ]}
    # Timestamps are read-time metadata, not records.
    for name in ("utilities", "miscellaneous", "bulletin", "events"):
        clean = lambda value: {k: v for k, v in value.items() if k not in ("updated_at", "exported_at")}
        if clean(backup[name]) != clean(after[name]):
            raise ValueError(f"{name} changed during adoption; compare the private backup before publication")
    before_scores = {s["member"]: s["units"] for s in backup["chores"]["leaderboard"] if s["period"] == "all"}
    for score in after["chores"]["leaderboard"]:
        if score["period"] == "all" and score["units"] != before_scores[score["member"]] + delta[score["member"]]:
            raise ValueError("Score verification failed; inspect the recovery copy before publication")
    write_json(path, {"before": backup, "request": request, "delta_units": delta, "result": result, "after": after})
    os.chmod(path, 0o600)
    print("Adopted and verified:", json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyboardInterrupt) as exc:
        raise SystemExit(f"Point adoption stopped: {exc}") from None
