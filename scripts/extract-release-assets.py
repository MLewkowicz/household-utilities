"""Read only top-level immutable JS/CSS from a published Pages artifact."""
from pathlib import Path
import re
import sys
import tarfile

destination = Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True)
pattern = re.compile(r"(?:(?:app|chunk)-[A-Z0-9]{8}\.js|config-[a-f0-9]{12}\.js|(?:style|events-refresh|house-entry|games)-[a-f0-9]{12}\.css)")
with tarfile.open(sys.argv[1]) as archive:
    for member in archive:
        name = member.name.removeprefix('./')
        if member.isfile() and pattern.fullmatch(name):
            (destination / name).write_bytes(archive.extractfile(member).read())
