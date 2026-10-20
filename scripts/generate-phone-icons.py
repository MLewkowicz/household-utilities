"""Rasterize our four-roommate mark for iOS and Android installation icons."""
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
svg = """<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#141e17"/>
<rect x="128" y="128" width="112" height="112" rx="40" fill="#cba8ff"/>
<rect x="272" y="128" width="112" height="112" rx="40" fill="#ff91b1"/>
<rect x="128" y="272" width="112" height="112" rx="40" fill="#64dff4"/>
<rect x="272" y="272" width="112" height="112" rx="40" fill="#ffc76e"/>
</svg>"""
with pymupdf.open(stream=svg.encode(), filetype="svg") as document:
    for size in (192, 512):
        document[0].get_pixmap(matrix=pymupdf.Matrix(size/512, size/512), alpha=False).save(ROOT / f"public/icon-{size}.png")
