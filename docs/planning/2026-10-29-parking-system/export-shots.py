"""Write the screenshots the parking map shows, preferring labeled versions.

Usage (repo root), after capture-shots.cjs and label-shots.py:
  python3 docs/planning/2026-10-29-parking-system/export-shots.py <raw_dir> <labeled_dir>
Writes shots/<name>.jpg (at most 1600 px wide) and shots/thumbs/<name>.jpg
(within 480 x 480) next to this file.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
raw, labeled = map(Path, sys.argv[1:3])
shots = ROOT / 'shots'
(shots / 'thumbs').mkdir(parents=True, exist_ok=True)
total = 0
for f in sorted(raw.glob('[0-9][0-9]-*.jpg')):
    src = labeled / f'{f.stem}-labeled.jpg'
    im = Image.open(src if src.exists() else f).convert('RGB')
    if im.width > 1600: im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    im.save(shots / f.name, quality=80, optimize=True, progressive=True)
    th = im.copy(); th.thumbnail((480, 480)); th.save(shots / 'thumbs' / f.name, quality=76, optimize=True)
    total += (shots / f.name).stat().st_size + (shots / 'thumbs' / f.name).stat().st_size
print('images', len(list(shots.glob('*.jpg'))), 'MB', round(total / 1048576, 2))
