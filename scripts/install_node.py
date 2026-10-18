"""Install a checksum-verified local Node LTS; no system configuration changes."""
import hashlib
import json
from pathlib import Path
import platform
import tarfile
import urllib.request

root = Path(__file__).resolve().parent.parent / ".tools"
root.mkdir(exist_ok=True)
os_name = {"Linux": "linux", "Darwin": "darwin"}.get(platform.system())
arch = {"x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(platform.machine())
if not os_name or not arch:
    raise SystemExit("Install Node.js 24 LTS manually on this platform, then rerun ./setup.sh.")
versions = json.load(urllib.request.urlopen("https://nodejs.org/dist/index.json", timeout=30))
version = next(v["version"] for v in versions if v["version"].startswith("v24.") and v["lts"])
name = f"node-{version}-{os_name}-{arch}"
base = f"https://nodejs.org/dist/{version}/"
archive = root / f"{name}.tar.gz"
urllib.request.urlretrieve(base + archive.name, archive)
sums = urllib.request.urlopen(base + "SHASUMS256.txt", timeout=30).read().decode()
expected = next(line.split()[0] for line in sums.splitlines() if line.endswith(" " + archive.name))
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
    raise SystemExit("Node archive checksum mismatch; installation aborted.")
with tarfile.open(archive) as tar:
    tar.extractall(root, filter="data")
(root / "node").symlink_to(name, target_is_directory=True)
archive.unlink()
print(f"Installed Node {version} in .tools/node.")
