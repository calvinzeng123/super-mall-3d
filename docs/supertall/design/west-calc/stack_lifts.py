# 西苑 stacks S61 (≈200 m) and S47 (≈150 m): elevations, refuge checks, lift traffic (CIBSE/Barney up-peak, calc/lifts.py model).
import math
A, J, TP = 1.0, 1.5, 1.2
def flight(d, v, a=A, j=J):
    if d >= v*(v/a + a/j): return d/v + v/a + a/j
    if d >= 2*a**3/j**2:
        vp = 0.5*a*(-a/j + math.sqrt((a/j)**2 + 4*d/a)); return 2*(vp/a + a/j)
    return (32*d/j)**(1/3)
def zone(name, stops, df, v, cap, pop, express=0.0, to=2.0, tc=3.0, L=1, lobby_extra=0.0):
    N = stops; P = 0.8*cap
    S = N*(1 - (1 - 1/N)**P); H = N - sum((i/N)**P for i in range(1, N))
    ts = flight(df, v) - df/v + to + tc + 0.5
    rtt = 2*(express + lobby_extra + H*df)/v + (S+1)*ts + 2*P*TP
    hc5 = 300*P*L/rtt
    print(f"  {name:<52} stops={N:>2} v={v:.1f} L={L} RTT={rtt:6.1f} INT={rtt/L:5.1f} s HC5={100*hc5/pop:5.1f} %POP (pop {pop:.0f})")
def stack(top, refuge, lobby=4.5, typ=3.0, rh=4.5):
    out, y = [(1, 0.0, lobby, 'lobby')], lobby
    for n in range(2, top + 1):
        h = rh if n in refuge else typ
        out.append((n, round(y, 2), h, 'refuge' if n in refuge else 'home')); y += h
    return out, round(y, 2)
PERS = 19  # persons per floor: 4BR 5 + 3BR 4 + 3BR 4 + 2BR 3 + 2BR 3 (both towers today)
for name, top, refuge in (('S61 (≈200 m)', 61, (16, 31, 46)), ('S47 (≈150 m)', 47, (16, 31)), ('S54 (≈170 m)', 54, (16, 31, 46))):
    fl, rf = stack(top, refuge)
    homes = [f for f in fl if f[3] == 'home']; R = [f for f in fl if f[3] == 'refuge']
    print(f"\n{name}: 1F–{top}F, RF {rf} m, home floors {len(homes)} → {5*len(homes)} homes/tower; refuge " + ', '.join(f"{n}F@{e}" for n, e, h, k in R))
    gaps = [R[0][1]] + [R[i][1] - R[i-1][1] for i in range(1, len(R))]
    print(f"  refuge gaps {gaps} m; top floor {fl[-1][0]}F @ {fl[-1][1]} m = {round(fl[-1][1]-R[-1][1],1)} m above the last refuge; H/B {rf/19.2:.2f} (19.2 m), crown +11 → {rf+11:.0f} m")
    low = [f for f in homes if f[0] < 31]; high = [f for f in homes if f[0] > 31]
    print(f"  low zone 2F–30F: {len(low)} stops; high zone 32F–{top}F: {len(high)} stops, express 1F→32F {fl[31-1+1][1] if top>=32 else 0} m")
    e32 = [f for f in fl if f[0] == 32][0][1]
    zone('low bank L1 L2 F1, 1,000 kg 13p, 3.0 m/s', len(low), 3.0, 3.0, 13, len(low)*PERS, L=3, lobby_extra=1.5)
    zone('low bank, 2.5 m/s', len(low), 3.0, 2.5, 13, len(low)*PERS, L=3, lobby_extra=1.5)
    for v in (4.0, 5.0, 6.0):
        zone(f'high bank H1 H2 F2, 13p, {v} m/s', len(high), 3.0, v, 13, len(high)*PERS, express=e32, L=3, lobby_extra=1.5)
    zone('single bank of 3 (today\'s core), 4 m/s', len(homes), 3.0, 4.0, 13, len(homes)*PERS, L=3, lobby_extra=1.5)
    zone('single bank of 4, 5 m/s', len(homes), 3.0, 5.0, 13, len(homes)*PERS, L=4, lobby_extra=1.5)
    # fire lifts: 1F → top of zone (a = 0.9)
    t31 = [f for f in fl if f[0] == 31][0][1]
    print(f"  F1 1F→31F ({t31} m) at 3.0 m/s: {flight(t31, 3.0, a=0.9):.1f} s; F2 1F→{top}F ({fl[-1][1]} m) at 4/5 m/s: {flight(fl[-1][1], 4.0, a=0.9):.1f} / {flight(fl[-1][1], 5.0, a=0.9):.1f} s (≤ 60 s, GB 50016 §7.3.8-3)")
    # refuge area net (5 p/m²): people on floors served = floors from this refuge up to the next one
    for i, (n, e, h, k) in enumerate(R):
        nxt = R[i+1][0] if i + 1 < len(R) else top + 1
        p = sum(PERS for f in homes if n < f[0] < nxt)
        print(f"  refuge {n}F serves {n+1}F–{nxt-1}F: {p} people → net refuge area ≥ {p/5:.0f} m²")
    print("  game ride (Δy/7 m/s): 1F→top", round(fl[-1][1]/7, 1), "s; B2→RF", round((rf+8.4)/7, 1), "s")
