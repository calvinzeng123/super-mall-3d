# R1-R4 ~200 m storey stacks: elevations, refuge spacing, families, homes, H/B, fire-lift run.  python3 -I p2_stack.py
import math
LOBBY, TYP = 4.8, 3.4
REFUGE = {14: 4.5, 27: 5.4, 40: 5.4}          # refuge floors (light / outrigger + belt)
CROWN = 13.3                                  # same crown on every tower
TOPS = {'R1': 53, 'R2': 50, 'R3': 47, 'R4': 44}
B_NS, B_EW = 31.8, 40.8                        # plate depth (core N face to S wing face) and width
def family(n, top):
    if n in REFUGE: return 'REFUGE'
    if n >= top - 1: return 'PH'               # duplex penthouse, two storeys
    if n <= 13: return 'L'                     # 01 + 02, open balconies
    if n <= 26: return 'M'                     # 03 + 02, open balconies
    if n <= 39: return 'H'                     # 01 + 02, enclosed balconies (> 100 m)
    return 'S'                                 # 03 + 02, enclosed balconies
POP = {'L': 8.0, 'M': 9.0, 'H': 8.0, 'S': 9.0, 'PH': 6.0}   # persons per storey (3BR 4.0, 4BR 5.0, PH 6 per duplex / 2 storeys x 2)
def flight(d, v, a=0.9, j=1.5):
    return d / v + v / a + a / j if d >= v * (v / a + a / j) else None
total = {'homes': 0, 'records': 0, 'levels': 0}
for t, top in TOPS.items():
    rows, y = [], 0.0
    rows.append(('B1', -4.2, 4.2, 'garage'))
    for n in range(1, top + 1):
        h = LOBBY if n == 1 else REFUGE.get(n, TYP)
        rows.append((f'{n}F', round(y, 1), h, 'lobby' if n == 1 else family(n, top)))
        y += h
    rf = round(y, 1); rows.append(('RF', rf, 3.2, 'roof'))
    fam = {}
    for _, _, _, f in rows: fam[f] = fam.get(f, 0) + 1
    homes = 2 * sum(fam.get(k, 0) for k in 'LMHS') + 2          # two PH duplexes
    records = 2 * sum(fam.get(k, 0) for k in 'LMHS') + 4
    ref = [(s, e) for s, e, h, f in rows if f == 'REFUGE']
    top_fl = rows[-2]
    gaps = [ref[0][1]] + [round(ref[i + 1][1] - ref[i][1], 1) for i in range(len(ref) - 1)] + [round(top_fl[1] - ref[-1][1], 1)]
    # people served by each refuge floor = floors from it up to the next refuge floor (GB 55037 7.1.15-1)
    serve = []
    for i, (s, e) in enumerate(ref):
        hi = ref[i + 1][1] if i + 1 < len(ref) else 1e9
        p = sum(POP.get(f, 0) for _, el, _, f in rows if e < el < hi)
        serve.append(f'{s}: {p:.0f} p -> {p / 5:.1f} m2')
    print(f"== {t}: top floor {top_fl[0]} @ {top_fl[1]} m, RF (main roof) {rf} m, crown {rf + CROWN:.1f} m")
    print(f"   refuge floors {[s for s, _ in ref]} @ {[e for _, e in ref]}; first/spacings/top gap (m) {gaps}")
    print(f"   families {dict((k, fam.get(k, 0)) for k in ['L', 'M', 'H', 'S', 'PH', 'REFUGE'])}; homes {homes}; unit records {records}; levels {len(rows)}")
    print(f"   H/B (main roof) N-S {rf / B_NS:.2f}  E-W {rf / B_EW:.2f}; core 14.3 x 17.6 -> H/b {rf / 14.3:.1f} / {rf / 17.6:.1f}")
    print(f"   refuge area needed: {'; '.join(serve)}")
    print(f"   fire lift 1F -> {top_fl[0]} ({top_fl[1]} m): 4 m/s {flight(top_fl[1], 4.0):.1f} s, 5 m/s {flight(top_fl[1], 5.0):.1f} s (<= 60 s)")
    total['homes'] += homes; total['records'] += records; total['levels'] += len(rows)
    if t == 'R1':
        for s, e, h, f in rows: print(f"      {s:>4} {e:7.1f} {h:4.1f} {f}")
print('TOTAL', total, '(today: 348 homes, 348 records, 128 levels)')
