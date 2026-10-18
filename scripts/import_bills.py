"""Extract bills locally, publish approved fields, and archive PDFs privately."""
import argparse
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import urllib.error
import urllib.request
import uuid
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
UTILITIES = ("gas", "electricity", "wifi")

def cents(value):
    amount = Decimal(str(value).replace(",", "").replace("$", "").strip()) * 100
    if amount != amount.to_integral_value():
        raise ValueError("A charge contains fractional cents.")
    return int(amount)

def unique_amount(values, label):
    amounts = set(cents(v) for v in values)
    if len(amounts) != 1:
        raise ValueError(f"Could not identify one unambiguous {label}. Use a manual override.")
    return amounts.pop()

def parse_text(text, digest):
    """Never return raw text, customer names, addresses, or account identifiers."""
    text = text.replace("\u00a0", " ")
    money = r"\$\s*(-?\d[\d,]*\.\d{2})"
    prior = None
    if "Eversource" in text:
        provider = "eversource"
        utility = "electricity" if "Electric Account Summary" in text else "gas" if "Gas Account Summary" in text else None
        if utility is None:
            raise ValueError("Unknown Eversource statement type.")
        periods = set(re.findall(r"Service from\s+(\d{2}/\d{2}/\d{2})\s*-\s*(\d{2}/\d{2}/\d{2})\s+(\d+) Days", text))
        if len(periods) != 1:
            raise ValueError("Cannot identify one Eversource service period.")
        start, end, days = periods.pop()
        start = datetime.strptime(start, "%m/%d/%y").date()
        end = datetime.strptime(end, "%m/%d/%y").date()
        if (end - start).days + 1 != int(days):
            raise ValueError("Printed day count differs from inclusive service dates; review required.")
        amount = unique_amount(re.findall(money + r"\s*\nTotal Current Charges", text), "current charge")
        summary = text.split("Electric Account Summary" if utility == "electricity" else "Gas Account Summary", 1)[1].split("Current Charges/Credits", 1)[0]
        balances = re.findall(money + r"\s*\nBalance Forward", summary) if utility == "electricity" else re.findall(r"Balance Forward\s*\n" + money, summary)
        if balances:
            prior = unique_amount(balances, "prior balance")
    elif "Xfinity" in text or "COMCAST" in text:
        provider, utility = "xfinity", "wifi"
        periods = set(re.findall(r"Services From\s*\n([A-Za-z]{3} \d{2}, \d{4}) to ([A-Za-z]{3} \d{2}, \d{4})", text))
        if len(periods) != 1:
            raise ValueError("Cannot identify one Xfinity service period.")
        start, end = periods.pop()
        start = datetime.strptime(start, "%b %d, %Y").date()
        end = datetime.strptime(end, "%b %d, %Y").date()
        amount = unique_amount(re.findall(r"New charges(?: due[^\n]*)?\s*\n" + money, text, re.I), "new charge")
        regular = re.findall(r"Regular monthly charges\s*\n(?:Page\s*\d+\s*\n)?" + money, text)
        tax = re.findall(r"Taxes, fees and other charges\s*\n(?:Page\s*\d+\s*\n)?" + money, text)
        if not regular or not tax or unique_amount(regular, "monthly charge") + unique_amount(tax, "taxes") != amount:
            raise ValueError("Wi-Fi total includes unclassified charges or credits. Classify them in an override.")
    else:
        raise ValueError("Unsupported provider or scanned PDF. Supply a manual override; no text is uploaded.")
    if re.search(r"(?:one[- ]time charges|installation fee|activation fee|late payment charge|equipment purchase)\s*\n", text, re.I):
        raise ValueError("Possible one-time charge found. Classify it separately with an override.")
    bill = {
        "id": f"{utility}:{start.isoformat()}:{end.isoformat()}",
        "utility": utility, "start_date": start.isoformat(), "end_date": end.isoformat(),
        "charges": [{"kind": "recurring", "amount_cents": amount, "label": "Service and applicable taxes"}],
        "source_hash": digest, "note": "", "opening_before": None,
    }
    return {"bill": bill, "provider": provider, "prior_balance_cents": prior}

def validate(record):
    b = record["bill"]
    if b.get("utility") not in UTILITIES:
        raise ValueError("Unknown utility in override.")
    start, end = date.fromisoformat(b["start_date"]), date.fromisoformat(b["end_date"])
    if not 0 <= (end-start).days <= 369:
        raise ValueError("Service period must cover between 1 and 370 days.")
    if not isinstance(b.get("charges"), list) or not 1 <= len(b["charges"]) <= 20:
        raise ValueError("Provide 1–20 charge lines.")
    for c in b["charges"]:
        if c.get("kind") not in ("recurring", "one_time") or type(c.get("amount_cents")) is not int or abs(c["amount_cents"]) > 100_000_000:
            raise ValueError("Invalid charge classification or amount.")
        if not 1 <= len(c.get("label", "")) <= 120:
            raise ValueError("Charge label must contain 1–120 characters.")
    if not re.fullmatch(r"[a-z0-9_-]{1,40}", record["provider"]):
        raise ValueError("Provider must be a short lowercase label, without personal details.")
    if not re.fullmatch(r"[A-Za-z0-9:_-]{1,120}", b["id"]):
        raise ValueError("Invalid bill ID.")

def read_pdf(path, overrides=None):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    override = (overrides or {}).get(digest) or (overrides or {}).get(path.name)
    if override:
        b = override["bill"]
        b = {k: b[k] for k in ("utility", "start_date", "end_date", "charges")}
        b.update({"id": override["bill"].get("id", f'{b["utility"]}:{b["start_date"]}:{b["end_date"]}'),
                  "source_hash": digest, "note": "", "opening_before": None})
        if "replaces_opening" in override["bill"]:
            b["replaces_opening"] = override["bill"]["replaces_opening"]
        result = {"bill": b, "provider": override.get("provider", "manual"), "prior_balance_cents": None}
    else:
        with pymupdf.open(path) as pdf:
            if pdf.needs_pass:
                raise ValueError("PDF is password protected.")
            text = "\n".join(page.get_text() for page in pdf)
        result = parse_text(text, digest)
    validate(result)
    return result

def archive_path(record):
    b = record["bill"]
    amount = sum(c["amount_cents"] for c in b["charges"])
    name = f'{b["start_date"]}_to_{b["end_date"]}_{record["provider"]}_{b["utility"]}_{amount/100:.2f}_{b["source_hash"][:8]}.pdf'
    return ROOT / "bills" / b["start_date"][:4] / b["utility"] / name

def archive(source, record):
    target = archive_path(record)
    if source.resolve() == target.resolve():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    # Preserve every input, including exact duplicate copies, without overwrites.
    n = 2
    candidate = target
    while candidate.exists():
        candidate = target.with_stem(target.stem + f"_copy{n}")
        n += 1
    shutil.move(str(source), str(candidate))
    candidate.chmod(0o600)
    return candidate

def load_config(local=False):
    if local:
        return {"url": "http://127.0.0.1:4173", "key": (ROOT / ".local/import-key").read_text().strip()}
    config = json.loads((ROOT / "config.public.json").read_text())
    env = {}
    file = ROOT / ".env.local"
    if file.exists():
        for line in file.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    key = os.environ.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SECRET_KEY")
    if not key:
        raise ValueError("Run ./configure.sh to set up the private import credential, or use --local with ./dev.sh running.")
    return {"url": config["url"], "key": key}

def rpc(config, name, payload=None):
    headers = {"Content-Type": "application/json", "apikey": config["key"]}
    if config["key"].startswith("eyJ"):
        headers["Authorization"] = "Bearer " + config["key"]
    req = urllib.request.Request(config["url"] + "/rest/v1/rpc/utilities_" + name,
        data=json.dumps({"p": payload} if payload is not None else {}).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            message = json.load(exc).get("message", "Request failed")
        except (ValueError, AttributeError):
            message = "Request failed"
        raise ValueError(f"Import server returned {exc.code}: {message}") from None

def write_json(path, data):
    path.parent.mkdir(exist_ok=True, parents=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, indent=2) + "\n")
    temp.replace(path)

def initial_august_bills(records):
    results = []
    for r in records:
        b = r["bill"]
        if b["start_date"] != "2026-08-21" or b["end_date"] != "2026-09-17" or b["utility"] not in ("electricity", "gas"):
            continue
        expected = {"electricity": 10054, "gas": 3098}[b["utility"]]
        if r["prior_balance_cents"] != expected:
            raise ValueError("Opening charge differs from the approved initial statement. Review it manually.")
        start, end = "2026-08-01", (date.fromisoformat(b["start_date"]) - timedelta(days=1)).isoformat()
        results.append({"id": f'{b["utility"]}:{start}:{end}', "utility": b["utility"], "start_date": start, "end_date": end,
            "charges": [{"kind": "recurring", "amount_cents": expected, "label": "Service and applicable taxes"}],
            "source_hash": b["source_hash"], "note": "Service dates confirmed by household; amount carried forward on the next statement.", "opening_before": None})
    return results

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="*", type=Path, help="PDF files or directories; default scans root and inbox/.")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing or contacting the database.")
    parser.add_argument("--organize-only", action="store_true", help="Organize locally without publishing charges.")
    parser.add_argument("--local", action="store_true", help="Import into the local preview database.")
    parser.add_argument("--yes", action="store_true", help="Accept the displayed import without prompting.")
    parser.add_argument("--initial-august", "--initial-openings", dest="initial_august", action="store_true", help="Include the approved August 1–20 gas and electricity charges; the old flag remains an alias.")
    parser.add_argument("--include-archive", action="store_true", help="Also scan already organized PDFs (normally skipped to preserve revisions).")
    parser.add_argument("--overrides", type=Path, help="Private JSON with reviewed classifications for unfamiliar PDFs.")
    parser.add_argument("--export", action="store_true", help="Back up the entire live ledger locally and refresh the sanitized snapshot.")
    args = parser.parse_args()
    if args.export:
        result = rpc(load_config(args.local), "export_ledger")
        path = ROOT / ".local/backups" / (datetime.now(timezone.utc).strftime("ledger_%Y-%m-%d_%H-%M-%S.json"))
        write_json(path, result)
        write_json(ROOT / "data/ledger.json", result)
        print("Saved ledger backup:", path.relative_to(ROOT))
        return
    overrides = json.loads(args.overrides.read_text()) if args.overrides else {}
    paths = []
    default_paths = [ROOT, ROOT / "inbox"]
    if args.include_archive or args.initial_august or args.organize_only:
        default_paths.append(ROOT / "bills")
    for p in args.paths or default_paths:
        p = p.resolve()
        if p.is_file():
            paths.append(p)
        elif p.is_dir():
            paths.extend(x for x in (p.iterdir() if p == ROOT else p.rglob("*")) if x.is_file() and x.suffix.lower() == ".pdf")
    paths = sorted(set(paths))
    if not paths:
        print("No PDFs found. Put new statements in this folder or inbox/.")
        return
    parsed, failures = [], []
    for path in paths:
        try:
            record = read_pdf(path, overrides)
            parsed.append((path, record))
        except Exception as exc:
            failures.append(f"{path.name}: {exc}")
    if failures:
        print("Nothing imported or moved. Review these files:\n" + "\n".join(failures), file=sys.stderr)
        raise ValueError("Unrecognized statements require an override; see README.md.")
    bills_by_id = {}
    for _, r in parsed:
        b = r["bill"]
        if b["id"] in bills_by_id and bills_by_id[b["id"]] != b:
            raise ValueError(f'Two PDFs describe the same bill with different contents: {b["id"]}. Import the reviewed file explicitly.')
        bills_by_id[b["id"]] = b
    bills = list(bills_by_id.values())
    if args.initial_august:
        bills += list({b["id"]: b for b in initial_august_bills([r for _, r in parsed])}.values())
    for b in bills:
        print(f'{b["utility"]:12} {b["start_date"] or "unknown":10} → {b["end_date"] or "unknown":10}  ${sum(c["amount_cents"] for c in b["charges"])/100:8.2f}  {b["id"]}')
    print(f"\n{len(parsed)} PDFs → bills/<year>/<utility>/ with provider, service dates, amount, and hash in each filename.")
    if args.dry_run:
        for source, record in parsed:
            print(f"  {source.name} → {archive_path(record).relative_to(ROOT)}")
        return
    config = None
    if not args.organize_only:
        config = load_config(args.local)
        current = rpc(config, "dashboard")
        existing = {b["id"]: b for b in current["bills"]}
        historical_ids = {b["bill_id"] for b in current.get("bill_history", [])}
        # Opening charges already reconciled must never be resurrected by a re-import.
        bills = [b for b in bills if not (b["id"].startswith("opening-") and b["id"] in historical_ids and b["id"] not in existing)]
        for b in bills:
            b["expected_version"] = existing.get(b["id"], {}).get("version", 0)
            prior = existing.get(b["id"])
            if prior:
                changed = any(b[k] != prior.get(k) for k in ("utility", "start_date", "end_date", "charges", "source_hash", "note", "opening_before"))
                if changed:
                    print(f'REVISION: {b["id"]}: ${sum(c["amount_cents"] for c in prior["charges"])/100:.2f} → ${sum(c["amount_cents"] for c in b["charges"])/100:.2f}. Review dates and categories too.')
    if not args.yes:
        verb = "Organize these PDFs locally" if args.organize_only else "Publish these charges and organize the PDFs"
        if input(verb + "? [y/N] ").strip().lower() not in ("y", "yes"):
            print("Cancelled; no changes made.")
            return
    if config:
        # Stable request payload is saved before sending; network retries are idempotent.
        signature = hashlib.sha256(json.dumps(bills, sort_keys=True).encode()).hexdigest()
        payload = {"request_id": "import_" + signature, "bills": bills}
        write_json(ROOT / ".local/last-import.json", payload)
        result = rpc(config, "import_bills", payload)
        print("Ledger:", ", ".join(f'{r["id"]} {r["status"]}' for r in result))
        snapshot = rpc(config, "export_ledger")
        write_json(ROOT / "data/ledger.json", snapshot)
        write_json(ROOT / ".local/backups" / (datetime.now(timezone.utc).strftime("ledger_%Y-%m-%d_%H-%M-%S.json")), snapshot)
    manifest = []
    for source, record in parsed:
        target = archive(source, record)
        manifest.append({"path": str(target.relative_to(ROOT)), "sha256": record["bill"]["source_hash"], "bill_id": record["bill"]["id"]})
    write_json(ROOT / ".local/pdf-manifest.json", manifest)
    print("PDFs organized. " + ("Shared dashboard updated." if config else "No ledger changes were published."))

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, urllib.error.URLError, KeyboardInterrupt) as exc:
        print(f"Stopped: {exc}", file=sys.stderr)
        sys.exit(1)
