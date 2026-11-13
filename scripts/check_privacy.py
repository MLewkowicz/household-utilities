"""Check the publication allowlist and compare assets against private PDF details."""
from pathlib import Path
import re
import json
import hashlib
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
violations = []
avatar_manifest = json.loads((ROOT / 'public/avatars/v1/manifest.json').read_text())
approved_avatars = {f'avatars/v1/{name}': info for name, info in avatar_manifest['files'].items()}
globe_manifest = json.loads((ROOT / 'public/globe/manifest.json').read_text())
approved_globe = {f'globe/{name}': info for name, info in globe_manifest['files'].items()}
sky_manifest = json.loads((ROOT / 'src/observatory-sky-assets.json').read_text())
approved_skies = set(sky_manifest.values())
card_manifest = json.loads((ROOT / 'src/game-card-assets.json').read_text())
approved_cards = set(card_manifest.values())
photo_manifest = json.loads((ROOT / 'src/size-photo-assets.json').read_text())
approved_photos = {info['file']: info for info in photo_manifest.values()}
for name, info in approved_photos.items():
    asset = ROOT / 'public' / name
    if (not re.fullmatch(r'size-photos/[a-z0-9-]+-[a-f0-9]{12}\.png', name)
            or not asset.is_file() or hashlib.sha256(asset.read_bytes()).hexdigest() != info['sha256']
            or not info['source'].startswith('https://commons.wikimedia.org/')
            or not info['license'] or not info['author']):
        violations.append('Invalid photographic silhouette manifest')
for name in approved_cards:
    match = re.fullmatch(r'game-card-[a-z-]+-([a-f0-9]{12})\.webp', name)
    asset = ROOT / 'public' / name
    if not match or not asset.is_file() or not hashlib.sha256(asset.read_bytes()).hexdigest().startswith(match[1]):
        violations.append('Invalid generated game card manifest')
for name in approved_skies:
    match = re.fullmatch(r'observatory-sky-(wide|phone)-([a-f0-9]{12})\.webp', name)
    asset = ROOT / 'public' / name
    if not match or not asset.is_file() or not hashlib.sha256(asset.read_bytes()).hexdigest().startswith(match[2]):
        violations.append('Invalid generated observatory sky manifest')
for p in (ROOT / "dist").rglob("*"):
    if p.is_file() and p.relative_to(ROOT / 'dist').as_posix() in approved_photos:
        info = approved_photos[p.relative_to(ROOT / 'dist').as_posix()]
        if hashlib.sha256(p.read_bytes()).hexdigest() != info['sha256']:
            violations.append(f"Photograph checksum mismatch: {p.relative_to(ROOT)}")
        continue
    if p.is_file() and p.relative_to(ROOT / 'dist').as_posix() in approved_cards:
        if p.read_bytes() != (ROOT / 'public' / p.name).read_bytes():
            violations.append(f"Game card checksum mismatch: {p.relative_to(ROOT)}")
        continue
    if p.is_file() and p.relative_to(ROOT / 'dist').as_posix() in approved_skies:
        if p.read_bytes() != (ROOT / 'public' / p.name).read_bytes():
            violations.append(f"Observatory sky checksum mismatch: {p.relative_to(ROOT)}")
        continue
    if p.is_file() and p.relative_to(ROOT / 'dist').as_posix() in approved_globe:
        info = approved_globe[p.relative_to(ROOT / 'dist').as_posix()]
        if hashlib.sha256(p.read_bytes()).hexdigest() != info['sha256']:
            violations.append(f"Globe checksum mismatch: {p.relative_to(ROOT)}")
        continue
    if p.is_file() and p.relative_to(ROOT / 'dist').as_posix() in approved_avatars:
        info = approved_avatars[p.relative_to(ROOT / 'dist').as_posix()]
        if hashlib.sha256(p.read_bytes()).hexdigest() != info['sha256']:
            violations.append(f"Avatar checksum mismatch: {p.relative_to(ROOT)}")
        continue
    if p.is_file() and p.suffix.lower() not in (".html", ".css", ".js", ".svg", ".txt", ".json") and p.name not in (".nojekyll", "manifest.webmanifest", "icon-192.png", "icon-512.png"):
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
        if file.lower().endswith(".pdf") or file.startswith(("bitmoji_photos/", "scripts/size-art/sources/", "bills/", ".local/", ".venv/", ".tools/", "node_modules/", ".env", ".dev.vars")):
            violations.append(f"Private file tracked by Git: {file}")
if violations:
    print("\n".join(sorted(set(violations))), file=sys.stderr)
    sys.exit(1)
print("Privacy check passed: deployment contains only approved assets and sanitized ledger data.")
