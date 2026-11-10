"""Revision 2 checks for SPEC.md (after CRITIQUE.md). Imports the stacks of final.py and adds:
stair-engine depth/riser checks with multi-loop storeys (C-1), 北苑 4 m/s private lifts (C-4),
R L1-L3 without the penthouse upper level (C-35), H S1 normal vs fire-only landings (C-3),
gate / zone / hardstand deltas (C-3, C-7), lift-stop totals (C-14), roof-structure areas (C-33),
北苑 F lobby area (C-18).  python3 -I final2.py"""
import math, io, contextlib, runpy, os
here = os.path.dirname(os.path.abspath(__file__))
with contextlib.redirect_stdout(io.StringIO()):
    F = runpy.run_path(os.path.join(here, 'final.py'))
run, north, west, rtower, hotel, apt, el = F['run'], F['north'], F['west'], F['rtower'], F['hotel'], F['apt'], F['el']

RISER, TREAD, START, LANDING, MARGIN, MAXR = 0.17, 0.28, 1.85, 1.35, 0.6, 18

def storey_need(rise, max_risers=None):
    """tower-stairs.js geometry: two flights per loop; loops = ceil(rise / (2*18*0.17)) when max_risers is set."""
    loops = 1 if max_risers is None else max(1, math.ceil(rise / (2 * max_risers * RISER) - 1e-9))
    half = rise / loops / 2
    steps = math.ceil((half - 1e-7) / RISER)
    depth = START + steps * TREAD + LANDING + MARGIN
    return loops, steps, depth, half / steps

def stair_check(name, S, depth_have, max_risers=MAXR, label=''):
    worst, rows = 0, []
    for a, b in zip(S, S[1:]):
        if a['height'] is None:
            continue
        rise = round(b['elev'] - a['elev'], 3)
        loops, steps, need, r = storey_need(rise, max_risers)
        worst = max(worst, need)
        rows.append((a['short'], rise, loops, steps, need, r))
    tall = [f"{s}:{rise}m->{l}x2 flights,{st} risers ({r*1000:.0f} mm)" for s, rise, l, st, need, r in rows if l > 1]
    maxst = max(st for *_, st, need, r in [(x[0], x[1], x[2], x[3], x[4], x[5]) for x in rows])
    ok = worst <= depth_have + 1e-9 and maxst <= MAXR
    print(f"  {name}{label}: stair depth have {depth_have:.2f} need {worst:.2f} max risers/flight {maxst} {'OK' if ok else 'FAIL'}; multi-loop {tall or 'none'}")
    return ok

print('== C-1 stair engine (depth along the stair frame z; flights <= 18 risers) ==')
for rise in (3.3, 3.4, 3.6, 3.9, 4.2, 4.5, 4.8, 5.0, 5.4, 5.5, 6.0, 6.5, 6.8, 8.6):
    l1, s1, d1, _ = storey_need(rise)
    l2, s2, d2, r2 = storey_need(rise, MAXR)
    print(f"  storey {rise:4.1f} m: 2 flights {s1:2d} risers need {d1:5.2f} m | rule {l2} loop(s) {s2:2d} risers need {d2:5.2f} m")
T1, T2, W, H, A = north(33, 34), north(31, 32), west(), hotel(), apt()
p1 = [dict(short=s, elev=e, height=h) for s, e, h in (('P1-1F', 0.0, 6.5), ('P1-2F', 6.5, 5.5), ('P1-3F', 12.0, 5.5), ('P1-4F', 17.5, 5.5), ('P1-5F', 23.0, 5.5), ('P1-6F', 28.5, 5.5))]
stair_check('T1 (P1-1F..RF)', p1 + T1, 9.6)
stair_check('T2 (P1-1F..RF)', p1 + T2, 9.6)
stair_check('T1 today rule (no max)', p1 + T1, 9.6, max_risers=None)
stair_check('W1/W2', W, 8.4)
for k, top in (('R1', 53), ('R4', 44)):
    stair_check(k, rtower(top), 8.7)
stair_check('H new 4.4 x 9.6', H, 9.6)
stair_check('H as hotel-apt v2 (6.0 deep)', H, 6.0)
stair_check('A new 4.4 x 9.6', A, 9.6)
print('  flight width = min(1.6, (4.4 - 1.2) / 2) =', min(1.6, (4.4 - 1.2) / 2), 'm; two stairs -> capacity at 1.00 m / 100 p:', int(2 * 1.6 * 100), 'persons per floor')

print('\n== C-4 北苑 private lifts at 4.0 m/s (1,050 kg, 1.1 x 2.1 m) ==')
for k, S, ph in (('T1', T1, '34F'), ('T2', T2, '32F')):
    y = el(S, ph)
    print(f"  {k}: LW/LE 1F->{ph} ({y} m) real {run(y, 4.0, 1.0):.1f} s, game {y / 8:.1f} s; LF/LS 1F->top {run(el(S, S[-2]['short']), 4.0):.1f} s")
print(f"  F lobby: partitions at x=+-2.0 -> {4.0 * 3.2:.1f} m2 gross, net {(4.0 - 0.1) * (3.2 - 0.1):.2f} m2 (>= 12.0)")

print('\n== 西苑 (refuge 16F / 31F kept, C-17 option a) ==')
F['refuge_check']('W', W)
print('  RF garden (open air) above 31F:', round(el(W, 'RF') - el(W, '31F'), 1), 'm (exempt: not an enclosed storey); 47F above 31F', round(el(W, '47F') - el(W, '31F'), 1))
stops_w = dict(L1=31, L2=31, F1=33, H1=20, H2=20, F2=21)
print('  stops per tower', stops_w, sum(stops_w.values()))

print('\n== R (C-35: L1-L3 skip the penthouse upper level) ==')
Rstops = {}
for k, top in (('R1', 53), ('R2', 50), ('R3', 47), ('R4', 44)):
    S = rtower(top)
    homefl = [r for r in S if r['kind'] == 'home']
    L = 3 + len(homefl) - 1
    Rstops[k] = (L, len(S))
    print(f"  {k}: L1-L3 {L} stops (B2 B1 1F + {len(homefl) - 1} home entry floors), LF {len(S)}")
print('  R stops total', sum(3 * a + b for a, b in Rstops.values()))

print('\n== H (C-3: S1 normal vs fire-only) ==')
ids = [r['short'] for r in H]
normal = ['B2', 'B1', '1F'] + [f'{n}F' for n in range(3, 26)]
fire_only = [s for s in ids if s not in normal]
print(f"  levels {len(ids)}; S1 normal {len(normal)} ({normal[0]}..{normal[-1]}), fire-only {len(fire_only)} {fire_only[:3]}..{fire_only[-2:]}; S2 28")
reentry = [f'{n}F' for n in list(range(3, 13)) + list(range(14, 26))]
print(f"  apartment floors with re-entry gates: {len(reentry)} x 2 stairs = {2 * len(reentry)} gates")
print(f"  roof structures: lantern 22 x 19 = {22 * 19} m2 + stair housings / BMU / cooling screens 84 m2 = {22 * 19 + 84} m2 <= 1/4 x 2,112 = {2112 / 4:.0f}; A: {22 * 19 + 62} <= {2099 / 4:.0f}")

print('\n== totals ==')
gates = dict(base=16, north=4, west=0, r=4 * (3 + 2), ha=(3 + 2 * len(reentry)) + (4 + 1))
zones = dict(base=14, north=4, west=0, r=4 * 3, ha=(3 + len(reentry)) + 4)
print('  gates', gates, sum(gates.values()), ' zones', zones, sum(zones.values()))
hard = dict(base=2, r=4, ha=2)
print('  site.fireAccess hardstands', hard, sum(hard.values()))
stops = dict(north=(25 + 26 + 33 + 33) + (23 + 24 + 31 + 31), west=2 * sum(stops_w.values()),
             r=sum(3 * a + b for a, b in Rstops.values()), h=4 * 25 + 3 * 5 + 4 * 21 + 51 + 28, a=5 * 43 + 2 * 47)
print('  tower lift landings after', stops, sum(stops.values()), '(today 646)')
print(f"  closed-shaft glass (buildElevators, ~470 v/stop, 18 B/v): today {646 * 470 * 18 / 1e6:.1f} MB, naive after {sum(stops.values()) * 470 * 18 / 1e6:.1f} MB, after skip ~0")
print('  records 1520 / homes 1490; C-16 fallback: records', 1520 - 8, 'residenceAccess', 980 - 8)
