"""Dump every stack from final.py and check the SPEC.md storey-table elevations against them."""
import io, contextlib, runpy, os, re
here = os.path.dirname(os.path.abspath(__file__))
with contextlib.redirect_stdout(io.StringIO()):
    F = runpy.run_path(os.path.join(here, 'final.py'))
S = {'T1': F['north'](33, 34), 'T2': F['north'](31, 32), 'W': F['west'](), 'R1': F['rtower'](53), 'R2': F['rtower'](50),
     'R3': F['rtower'](47), 'R4': F['rtower'](44), 'H': F['hotel'](), 'A': F['apt']()}
for k, st in S.items():
    print(k, ' '.join(f"{r['short']}={r['elev']:g}" for r in st))
spec = open(os.path.join(here, '..', 'SPEC.md'), encoding='utf-8').read()
# spot checks: every "nF @ x" pattern in the spec must match a stack value of some tower
bad = []
for m in re.finditer(r'(\d{1,2})F @ (\d{1,3}\.\d)', spec):
    fl, y = f'{m.group(1)}F', float(m.group(2))
    hits = [k for k, st in S.items() if any(r['short'] == fl and abs(r['elev'] - y) < 0.051 for r in st)]
    if not hits:
        bad.append(m.group(0))
print('nF @ elev patterns checked:', len(re.findall(r'(\d{1,2})F @ (\d{1,3}\.\d)', spec)), 'unmatched:', bad)

# storey-table rows: "| 14F–25F | 50.0 … 87.4 |" or "| **13F** | **45.5** |"
rows = 0; bad2 = []
for line in spec.split('\n'):
    cells = [c.strip().strip('*') for c in line.split('|')[1:3]] if line.startswith('|') else []
    if len(cells) < 2:
        continue
    f, e = cells
    fl = re.findall(r'(\d{1,2})F', f)
    ys = re.findall(r'-?−?\d{1,3}\.\d', e.replace('−', '-'))
    if not fl or not ys or not re.fullmatch(r'[\d.\s…·/→,\-−]+', e.replace('−', '-').replace('*', '')):
        continue
    rows += 1
    pairs = list(zip(fl, ys)) if len(fl) == len(ys) else [(fl[0], ys[0]), (fl[-1], ys[-1])]
    for a, y in pairs:
        y = float(y)
        if not any(any(r['short'] == f'{a}F' and abs(r['elev'] - y) < 0.051 for r in st) for st in S.values()):
            bad2.append(line[:80])
print('storey-table rows checked:', rows, 'mismatches:', bad2)
