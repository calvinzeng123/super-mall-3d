# R1-R4 ~200 m: lift traffic (CIBSE Guide D / Barney up-peak, same formulas as ../calc/lifts.py) and fire-lift run.
import math
A, J, TP = 1.0, 1.5, 1.2
def flight(d, v, a=A, j=J):
    if d >= v*(v/a + a/j): return d/v + v/a + a/j
    if d >= 2*a**3/j**2:
        vp = 0.5*a*(-a/j + math.sqrt((a/j)**2 + 4*d/a)); return 2*(vp/a + a/j)
    return (32*d/j)**(1/3)
def zone(name, floors, df, v, cap, pop, express=0.0, to=2.0, tc=3.0, L=1, lobby_extra=0.0):
    N = floors; P = 0.8*cap
    S = N*(1 - (1 - 1/N)**P)
    H = N - sum((i/N)**P for i in range(1, N))
    ts = flight(df, v) - df/v + to + tc + 0.5
    rtt = 2*(express + lobby_extra + H*df)/v + (S+1)*ts + 2*P*TP
    hc5 = 300*P*L/rtt
    print(f"{name:<58} N={N:>2} v={v:.1f} cap={cap:>2} L={L} RTT={rtt:6.1f} INT={rtt/L:5.1f} s HC5={hc5:5.1f} pop={pop:4.0f} %POP={100*hc5/pop:5.1f}")
    return rtt/L, 100*hc5/pop
# Stack: 1F 4.8; typical 3.4; refuge 14F/27F/40F at 5.4 (outrigger) -> express adds the extra 2.0 m at each refuge passed.
print("== R1 53F (49 home floors x 2 homes = 98 homes; 3BR 4.0 / 4BR 5.0 -> ~4.45 p/home) ==")
pop = 98*4.45
zone('R1 single bank 3 x 1,050 kg (13p) 5.0 m/s', 49, 3.47, 5.0, 13, pop, L=3, lobby_extra=1.4)
zone('R1 single bank 3 x 1,050 kg (13p) 6.0 m/s', 49, 3.47, 6.0, 13, pop, L=3, lobby_extra=1.4)
zone('R1 single bank 4 x 1,050 kg (13p) 5.0 m/s', 49, 3.47, 5.0, 13, pop, L=4, lobby_extra=1.4)
zone('R1 single bank 2 x 1,350 kg (17p) 6.0 m/s', 49, 3.47, 6.0, 17, pop, L=2, lobby_extra=1.4)
print("-- two zones --")
lo = 24*2*4.45; hi = 25*2*4.45
zone('R1 low 2F-26F (24 home fl) 2 lifts 3.5 m/s 13p', 24, 3.47, 3.5, 13, lo, L=2, lobby_extra=1.4)
zone('R1 high 28F-53F (25 home fl) 2 lifts 6 m/s, express 91.8 m', 25, 3.47, 6.0, 13, hi, express=91.8, L=2, lobby_extra=1.4)
zone('R1 high 28F-53F (25 home fl) 2 lifts 5 m/s, express 91.8 m', 25, 3.47, 5.0, 13, hi, express=91.8, L=2, lobby_extra=1.4)
print("== R4 44F (40 home floors, 80 homes) ==")
zone('R4 single bank 3 x 13p 5.0 m/s', 40, 3.47, 5.0, 13, 80*4.45, L=3, lobby_extra=1.4)
zone('R4 single bank 3 x 13p 4.0 m/s', 40, 3.47, 4.0, 13, 80*4.45, L=3, lobby_extra=1.4)
print("== comparison: 3 homes/floor kept (03 north), R1 53F 49 home floors = 147 homes ==")
zone('3-home floor, single bank 4 x 13p 5 m/s', 49, 3.47, 5.0, 13, 147*4.33, L=4, lobby_extra=1.4)
zone('3-home floor, single bank 3 x 13p 5 m/s', 49, 3.47, 5.0, 13, 147*4.33, L=3, lobby_extra=1.4)
print("== fire lift 1F (0 m) -> top floor, a=0.9 m/s2, target <= 60 s (GB 50016 7.3.8-3) ==")
for name, h in (('R1 53F', 184.2), ('R2 50F', 174.0), ('R3 47F', 163.8), ('R4 44F', 153.6), ('B1 -> R1 53F', 188.4)):
    print(f"{name:<14} rise {h:6.1f} m:", {v: round(flight(h, v, a=0.9), 1) for v in (3.0, 3.5, 4.0, 5.0)})
print("== ride times for the game (1F -> top, a=1.0) ==")
for v in (5.0, 6.0):
    print(f"v={v}: 1F->53F {flight(184.2, v):.1f} s, 1F->27F {flight(91.8-0, v):.1f} s, one floor {flight(3.4, v):.1f} s")
print("== per tower, 4 lifts (L1-L3 + LF in normal service) at 5 m/s, 13p ==")
for t, fl, homes in (('R1', 49, 96), ('R2', 46, 90), ('R3', 43, 84), ('R4', 40, 78)):
    zone(f'{t} {fl} home fl, {homes} homes, 4 lifts', fl, 3.47, 5.0, 13, homes*4.45, L=4, lobby_extra=1.4)
    zone(f'{t} {fl} home fl, {homes} homes, 3 lifts (LF on fire duty)', fl, 3.47, 5.0, 13, homes*4.45, L=3, lobby_extra=1.4)
