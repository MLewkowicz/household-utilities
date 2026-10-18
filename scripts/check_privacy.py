"""Check the publication allowlist and compare assets against private PDF details."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
violations = []
for p in (ROOT / "dist").rglob("*"):
    if p.is_file() and p.suffix.lower() not in (".html", ".css", ".js", ".svg", ".txt", ".json") and p.name != ".nojekyll":
        violations.append(f"Unexpected deploy artifact: {p.relative_to(ROOT)}")
paths = [p for folder in ("dist", "data", "src", "public", "supabase") for p in (ROOT/folder).rglob("*") if p.is_file()]
texts = {p: p.read_text(errors="ignore") for p in paths}
for p, text in texts.items():
    if re.search(r"sb_secret_[A-Za-z0-9_-]{15,}", text):
        violations.append(f"Secret key found in {p.relative_to(ROOT)}")
    if re.search(r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", text):
        violations.append(f"Unexpected JWT in {p.relative_to(ROOT)}")
try:
    import pymupdf
    private_tokens = set()
    pdfs = list(ROOT.glob("*.pdf")) + list((ROOT/"bills").rglob("*.pdf"))
    for p in pdfs:
        with pymupdf.open(p) as doc:
            text = "\n".join(page.get_text() for page in doc)
        for line in text.splitlines():
            if re.search(r"\b\d+[A-Z]?\s+[A-Z][A-Z ]+\s(?:ST|RD|AVE|DR|STREET|ROAD)\b", line):
                private_tokens.add(line.strip().removeprefix("For "))
        for match in re.finditer(r"Account [Nn]umber\s*:?\s*\n([\d ]{8,})", text):
            private_tokens.add(match.group(1).strip())
    for p, text in texts.items():
        for token in private_tokens:
            if len(token)>8 and token.casefold() in text.casefold():
                violations.append(f"Private statement detail found in {p.relative_to(ROOT)}")
except ImportError:
    raise SystemExit("Run this command with uv run --frozen.")
if (ROOT/".git").exists():
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")
    for file in filter(None,tracked):
        if file.lower().endswith(".pdf") or file.startswith(("bills/", ".local/", ".venv/", ".tools/", "node_modules/", ".env", ".dev.vars")):
            violations.append(f"Private file tracked by Git: {file}")
if violations:
    print("\n".join(sorted(set(violations))), file=sys.stderr)
    sys.exit(1)
print("Privacy check passed: deployment contains only approved assets and sanitized ledger data.")
