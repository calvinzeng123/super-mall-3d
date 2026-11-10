"""Recompute every number SPEC.md merges: stacks, refuge checks, fire-lift times, homes,
lift stops, H/B, campus totals.  python3 -I final.py"""
import math

A_FIRE, A_PASS, J = 0.9, 1.0, 1.5


def run(h, v, a=A_FIRE):
    """Jerk-limited flight time for a long run (codes.md section 4.3)."""
    return h / v + v / a + a / J


def stack(rows):
    """rows: (short, height, kind, band). Returns rows with elev filled from the first elev."""
    out, y = [], None
    for r in rows:
        short, h, kind, band, *e = r
        if e:
            y = e[0]
        out.append(dict(short=short, elev=round(y, 3), height=h, kind=kind, band=band))
        y = y + (h or 0)
    return out


def rep(prefix, a, b, h, kind, band):
    return [(f'{n}F', h, kind, band) for n in range(a, b + 1)]


def north(top_c, ph):  # 150 m variant
    rows = [('7F', 5.0, 'club', 'SKY', 34.0)]
    rows += [('8F', 3.6, 'community', 'L'), ('9F', 3.6, 'community', 'L'), ('10F', 3.6, 'refuge', 'R1')]
    rows += rep('', 11, 13, 3.6, 'community', 'L')
    rows += rep('', 14, 23, 3.3, 'community', 'D')
    rows += [('24F', 5.4, 'refuge', 'R2')]
    rows += rep('', 25, top_c, 3.9, 'community', 'C')
    rows += rep('', ph, ph + 1, 3.3, 'community', 'PH')
    rows += [('RF', 3.2, 'roof', 'RF')]
    return stack(rows)


def west():  # S47
    rows = [('B2', 3.9, 'garage-lobby', 'B', -8.4), ('B1', 4.5, 'garage-lobby', 'B'), ('1F', 4.5, 'lobby', 'LOBBY')]
    rows += rep('', 2, 15, 3.0, 'community', 'A') + [('16F', 4.5, 'refuge', 'R1')]
    rows += rep('', 17, 30, 3.0, 'community', 'B') + [('31F', 4.5, 'refuge', 'R2')]
    rows += rep('', 32, 47, 3.0, 'community', 'C') + [('RF', 3.0, 'roof', 'RF')]
    return stack(rows)


def rtower(top):
    rows = [('B2', 4.2, 'garage', 'B', -8.4), ('B1', 4.2, 'garage', 'B'), ('1F', 4.8, 'lobby', 'LOBBY')]
    rows += rep('', 2, 13, 3.4, 'home', 'L') + [('14F', 4.5, 'refuge', 'R1')]
    rows += rep('', 15, 26, 3.4, 'home', 'M') + [('27F', 5.4, 'refuge', 'R2')]
    rows += rep('', 28, 39, 3.4, 'home', 'H') + [('40F', 5.4, 'refuge', 'R3')]
    rows += rep('', 41, top - 2, 3.4, 'home', 'S') + rep('', top - 1, top, 3.4, 'home', 'PH')
    rows += [('RF', 3.2, 'roof', 'RF')]
    return stack(rows)


def hotel():
    rows = [('B2', 3.9, 'garage', 'B', -8.4), ('B1', 4.5, 'garage', 'B'), ('1F', 6.5, 'lobby', 'ARR'), ('2F', 5.0, 'public', 'CONF')]
    rows += rep('', 3, 12, 3.4, 'suite', 'RES') + [('13F', 4.5, 'refuge', 'R1')]
    rows += rep('', 14, 25, 3.4, 'suite', 'RES') + [('26F', 8.6, 'refuge', 'R2'), ('27F', 6.8, 'public', 'SKY')]
    rows += rep('', 28, 36, 3.4, 'suite', 'HOTEL') + [('37F', 6.0, 'refuge', 'R3')]
    rows += rep('', 38, 46, 3.4, 'suite', 'HOTEL') + [('47F', 6.0, 'public', 'SPA'), ('48F', 6.0, 'public', 'DINE'), ('RF', None, 'roof', 'RF')]
    return stack(rows)


def apt():
    rows = [('B2', 3.9, 'garage', 'B', -8.4), ('B1', 4.5, 'garage', 'B'), ('1F', 6.5, 'lobby', 'LOBBY'), ('2F', 5.0, 'public', 'CLUB')]
    rows += rep('', 3, 12, 3.4, 'suite', 'APT') + [('13F', 4.5, 'refuge', 'R1')]
    rows += rep('', 14, 25, 3.4, 'suite', 'APT') + [('26F', 6.0, 'refuge', 'R2')]
    rows += rep('', 27, 38, 3.4, 'suite', 'APT') + [('39F', 6.0, 'refuge', 'R3')]
    rows += rep('', 40, 43, 6.5, 'suite', 'LOFT') + [('44F', 5.0, 'public', 'SKYCLUB'), ('RF', None, 'roof', 'RF')]
    return stack(rows)


def el(S, short):
    return next(r['elev'] for r in S if r['short'] == short)


def refuge_check(name, S, ground=0.0):
    ref = [r for r in S if r['kind'] == 'refuge']
    occ = [r for r in S if r['kind'] not in ('roof', 'refuge', 'garage', 'garage-lobby') and r['elev'] > 0]
    first = ref[0]['elev'] - ground
    gaps = [round(b['elev'] - a['elev'], 1) for a, b in zip(ref, ref[1:])]
    top = max(r['elev'] for r in occ)
    last = round(top - ref[-1]['elev'], 1)
    ok = first <= 50 and all(g <= 50 for g in gaps) and last <= 50
    print(f"  {name}: refuge {[r['short'] + '@' + str(r['elev']) for r in ref]} first {first:.1f} gaps {gaps} top-occ {top} (+{last}) {'OK' if ok else 'FAIL'}")
    return ref


print('== 北苑 (150 m variant) ==')
T = {'T1': north(33, 34), 'T2': north(31, 32)}
crown = {'T1': 10.0, 'T2': 10.0}
for k, S in T.items():
    rf = el(S, 'RF')
    refuge_check(k, S)
    top_floor = [r for r in S if r['kind'] == 'community'][-1]
    print(f"  {k}: own levels {len(S)} top {top_floor['short']}@{top_floor['elev']} RF {rf} crown {rf + crown[k]:.1f}"
          f" H/B podium {(rf - 34) / 16:.2f} grade {rf / 16:.2f}"
          f" LF 4 m/s 1F->top {run(top_floor['elev'], 4):.1f}s ->RF {run(rf, 4):.1f}s; LW 5 m/s 1F->PH {run(el(S, top_floor['short']) - 3.3, 5, A_PASS):.1f}s")
    nC = sum(1 for r in S if r['band'] == 'C')
    # homes per tower: kept L flats 5 floors x2, 14E, 9 interlocked duplexes, new 23E, C flats, PH x2
    homes = 10 + 1 + 9 + 1 + 2 * nC + 2
    levels_units = 10 + 1 + 18 + 1 + 2 * nC + 4
    w_entries = [8, 9, 11, 12, 13, 14, 16, 18, 20, 22] + [r for r in range(25, 25 + nC)] + [25 + nC]
    e_entries = [8, 9, 11, 12, 13, 14, 15, 17, 19, 21, 23] + [r for r in range(25, 25 + nC)] + [25 + nC]
    lw, le = 3 + 1 + len(w_entries) + 1, 3 + 1 + len(e_entries) + 1
    lf = 3 + len(S)
    print(f"  {k}: homes {homes} level units {levels_units} W homes {len(w_entries) - 0 - 0} stops LW {lw} LE {le} LF/LS {lf}")
    T[k] = dict(S=S, homes=homes, units=levels_units, rf=rf, crown=rf + crown[k], nC=nC)
    # refuge areas
    pC = 4.5
    r2 = (2 * nC * pC + 2 * 6.0)
    print(f"  {k}: R1 serves 17 homes ~86 p -> {86 / 5:.1f} m2; R2 serves {2 * nC + 2} homes ~{r2:.0f} p -> {r2 / 5:.1f} m2")

print('\n== 西苑 S47 ==')
W = west()
refuge_check('W', W)
rf = el(W, 'RF')
print(f"  levels {len(W)} RF {rf} crown {rf + 11} H/B {rf / 19.2:.2f}; 47F {el(W, '47F')}")
print(f"  F1 3 m/s 1F->31F {run(93.0, 3):.1f}s; F2 4 m/s 1F->47F {run(142.5, 4):.1f}s")
home_floors = sum(1 for r in W if r['kind'] == 'community')
print(f"  home floors {home_floors} homes/tower {5 * home_floors} pair {10 * home_floors}")
print(f"  stops L {3 + 14 + 14} F1 {3 + 30} H {3 + 16 + 1} F2 {3 + 1 + 16 + 1}")
print(f"  refuge 16F serves 14 fl x19 = {14 * 19} p -> {14 * 19 / 5:.1f} m2; 31F 16 fl x19 = {16 * 19} p -> {16 * 19 / 5:.1f} m2")

print('\n== R1-R4 ==')
R = {}
for k, top in (('R1', 53), ('R2', 50), ('R3', 47), ('R4', 44)):
    S = rtower(top)
    rf = el(S, 'RF')
    refuge_check(k, S)
    nS = sum(1 for r in S if r['band'] == 'S')
    homes = 2 * (12 + 12 + 12 + nS) + 2
    recs = homes + 2
    homefl = [r for r in S if r['kind'] == 'home']
    L = 3 + len(homefl)
    LF = len(S)
    topf = homefl[-1]
    print(f"  {k}: levels {len(S)} top {topf['short']}@{topf['elev']} RF {rf:.1f} crown {rf + 13.3:.1f} H/B {rf / 31.8:.2f}/{rf / 40.8:.2f}"
          f" homes {homes} recs {recs} S {nS} L-stops {L} LF {LF} LF 5m/s {run(topf['elev'], 5):.1f}s (4m/s {run(topf['elev'], 4):.1f})")
    R[k] = dict(levels=len(S), homes=homes, recs=recs, rf=rf, crown=rf + 13.3, nS=nS)
types = dict(o1=sum(2 * 12 for _ in R) * 1, o2=sum(12 + 12 + 12 + v['nS'] for v in R.values()), o3=sum(12 + v['nS'] for v in R.values()), ph=8)
print('  types', types, 'sum', sum(types.values()))
print(f"  refuge 14F 12x9={12 * 9}p {12 * 9 / 5:.1f}m2; 27F 12x8={96}p {96 / 5:.1f}; 40F R1 11x9+12={11 * 9 + 12}p {(11 * 9 + 12) / 5:.1f}")

print('\n== H ==')
H = hotel()
refuge_check('H', H)
rf = el(H, 'RF')
res = sum(1 for r in H if r['band'] == 'RES')
hot = sum(1 for r in H if r['band'] == 'HOTEL')
print(f"  levels {len(H)} RF {rf} H/B {rf / 32:.2f} residences {8 * res} keys {8 * hot} S1 4m/s 1F->48F {run(el(H, '48F'), 4):.1f}s ->RF {run(rf, 4):.1f}")
print(f"  stops RB {3 + 22} SH 5 HL {1 + 9 + 11} S1 {len(H)} S2 {4 + 23 + 1}")
print(f"  26F->27F gap: 25F {el(H, '25F')} 27F {el(H, '27F')} = {el(H, '27F') - el(H, '25F'):.1f} m (need 5.2+3.2+3.6=12.0)")

print('\n== A ==')
Ap = apt()
refuge_check('A', Ap)
rf = el(Ap, 'RF')
apt_fl = sum(1 for r in Ap if r['band'] == 'APT')
print(f"  levels {len(Ap)} RF {rf} H/B {rf / 31.8:.2f} units {8 * apt_fl}+{8 * 4} S 4m/s 1F->44F {run(el(Ap, '44F'), 4):.1f}s")
print(f"  stops L {4 + 10 + 12 + 12 + 5} S {len(Ap)}")

print('\n== campus totals ==')
lv_before = 338
lv_after = 338 + (51 - 23) + (47 - 23) + (sum(v['levels'] for v in R.values()) - 128) + (2 * len(W) - 62) + (len(T['T1']['S']) + len(T['T2']['S']) - 38)
print('  levels', lv_before, '->', lv_after)
lifts = 76 + (13 - 2) + (7 - 2) + (16 - 8) + (12 - 6) + (8 - 6)
print('  lifts 76 ->', lifts)
recs_before, homes_before = 1066, 1046
recsH, recsA = 8 * res + 8 * hot, 8 * apt_fl + 32
recsR, homesR = sum(v['recs'] for v in R.values()), sum(v['homes'] for v in R.values())
recsW = 10 * home_floors
recsN, homesN = T['T1']['units'] + T['T2']['units'], T['T1']['homes'] + T['T2']['homes']
recs = recsH + recsA + recsR + recsW + recsN
homes = recsH + recsA + homesR + recsW + homesN
print(f"  residence records {recs_before} -> {recs}  homes {homes_before} -> {homes}  (H {recsH} A {recsA} R {recsR}/{homesR} W {recsW} N {recsN}/{homesN})")
print('  all units', 1730, '->', recs + 664)
gates = 16 + 3 * 4 + 3 + 4
zones = 14 + 3 * 4 + 3 + 4
print('  gates 16 ->', gates, ' zones 14 ->', zones)

print('\n== skyline (crown/top, m) ==')
sky = [('R1', R['R1']['crown']), ('H', 196.8), ('R2', R['R2']['crown']), ('A', 184.6), ('R3', R['R3']['crown']),
       ('R4', R['R4']['crown']), ('W1', 156.5), ('W2', 156.5), ('T1', T['T1']['crown']), ('T2', T['T2']['crown'])]
for k, v in sorted(sky, key=lambda x: -x[1]):
    print(f'  {k:3} {v:6.1f}')
