# Up-peak round-trip-time (CIBSE Guide D / Barney) with optional express run.
import math
A, J = 1.0, 1.5          # m/s2, m/s3 (passenger comfort)
TP = 1.2                 # s per passenger transfer
def flight(d, v, a=A, j=J):
    if d >= v*(v/a + a/j): return d/v + v/a + a/j
    if d >= 2*a**3/j**2:
        vp = 0.5*a*(-a/j + math.sqrt((a/j)**2 + 4*d/a)); return 2*(vp/a + a/j)
    return (32*d/j)**(1/3)
def zone(name, floors, df, v, cap, pop, express=0.0, to=2.0, tc=3.0, L=1, lobby_extra=0.0):
    N = floors; P = 0.8*cap
    S = N*(1 - (1 - 1/N)**P)
    H = N - sum((i/N)**P for i in range(1, N))
    tv = df/v
    ts = flight(df, v) - tv + to + tc + 0.5
    rtt = 2*(express + lobby_extra + H*df)/v + (S+1)*ts + 2*P*TP
    hc5 = 300*P*L/rtt
    return dict(name=name, N=N, v=v, cap=cap, L=L, P=round(P,1), S=round(S,1), H=round(H,1),
                rtt=round(rtt,1), int=round(rtt/L,1), hc5=round(hc5,1), pct=round(100*hc5/pop,1), pop=pop)
def fire60(h, v, a=0.9): return round(flight(h, v, a), 1)
def show(r): print(f"{r['name']:<46} N={r['N']:>2} v={r['v']:.1f} cap={r['cap']:>2} L={r['L']} P={r['P']:>4} S={r['S']:>4} H={r['H']:>4} RTT={r['rtt']:>6} INT={r['int']:>5} HC5={r['hc5']:>5} pop={r['pop']:>5} %POP={r['pct']:>4}")

print("== fire lift run time 1F->top (a=0.9 m/s2, j=1.5), target <= 60 s (GB 50016 7.3.8-3) ==")
for h in (100, 130, 160, 190, 200, 210):
    print(h, {v: fire60(h, v) for v in (2.5, 3.0, 3.5, 4.0, 5.0, 6.0)})

print("\n== 西苑 ~200 m, 5 homes/floor, 3.0 m floors, 3.6 pers/home ==")
# today: 27 home floors on 3 lifts (2 pax + fire) at 2.5 m/s, 1F 4.5 m
show(zone('W today 27F, 3 lifts 2.5 m/s 13p', 27, 3.0, 2.5, 13, 27*5*3.6, L=3, lobby_extra=1.5))
show(zone('W 62F single bank 3 lifts 4 m/s', 62, 3.0, 4.0, 13, 62*5*3.6, L=3, lobby_extra=1.5+4.5))
show(zone('W 62F single bank 4 lifts 5 m/s 15p', 62, 3.0, 5.0, 15, 62*5*3.6, L=4, lobby_extra=1.5+4.5))
show(zone('W low zone 2F-32F (31 fl) 3 lifts 3.0 m/s', 31, 3.0, 3.0, 13, 31*5*3.6, L=3, lobby_extra=1.5+1.5))
show(zone('W high zone 33F-63F express 95 m, 3 lifts 6 m/s', 31, 3.0, 6.0, 13, 31*5*3.6, express=96, L=3, lobby_extra=1.5+1.5))
show(zone('W high zone same, 3 lifts 5 m/s', 31, 3.0, 5.0, 13, 31*5*3.6, express=96, L=3, lobby_extra=1.5+1.5))

print("\n== R1-R4 ~200 m, 3 homes/floor, 3.4 m floors, 4 pers/home ==")
show(zone('R today 29F, 2 lifts 2.5 m/s 13p', 29, 3.4, 2.5, 13, 29*3*4, L=2, lobby_extra=1.4))
show(zone('R 56F single bank 3 lifts 5 m/s 13p', 56, 3.4, 5.0, 13, 56*3*4, L=3, lobby_extra=1.4+4.8))
show(zone('R 56F single bank 4 lifts 5 m/s 13p', 56, 3.4, 5.0, 13, 56*3*4, L=4, lobby_extra=1.4+4.8))
show(zone('R low 2F-29F (28 fl) 3 lifts 3 m/s', 28, 3.4, 3.0, 13, 28*3*4, L=3, lobby_extra=1.4))
show(zone('R high 30F-57F express 100 m, 3 lifts 6 m/s', 28, 3.4, 6.0, 13, 28*3*4, express=100, L=3, lobby_extra=1.4))

print("\n== 北苑 一梯一户: private lift, 1 family per trip ==")
for top, v in ((150, 4.0), (160, 4.0), (190, 5.0), (200, 6.0)):
    # one call: car goes from podium-host 1F (0 m) to an average home at ~ (39+top)/2, single stop each way
    d = (39 + top)/2
    rtt = 2*flight(d, v) + 2*(2.0 + 3.0 + 0.5) + 2*3*TP
    print(f"top {top} m v={v}: avg home at {d:.0f} m, private-lift RTT {rtt:.0f} s, avg wait ~{rtt/2:.0f} s (one car)")

print("\n== H hotel ~200 m: 10 keys/floor, 3.4 m floors, 1.5 pers/key (CIBSE 1.5-1.9) ==")
show(zone('H today 19 guest fl, 2 lifts 2.5 m/s 13p', 19, 3.4, 2.5, 13, 190*1.5, L=2, lobby_extra=3.1))
show(zone('H low 3F-27F (25 fl) 4 lifts 4 m/s 18p', 25, 3.4, 4.0, 18, 250*1.5, L=4, to=1.8, tc=2.8, lobby_extra=3.1+3.4))
show(zone('H high 28F-52F express 90 m, 4 lifts 6 m/s 18p', 25, 3.4, 6.0, 18, 250*1.5, express=90, L=4, to=1.8, tc=2.8, lobby_extra=3.1+3.4))
show(zone('H single bank 50 fl 6 lifts 6 m/s 18p', 50, 3.4, 6.0, 18, 500*1.5, L=6, to=1.8, tc=2.8, lobby_extra=3.1+3.4))

print("\n== A serviced apartment ~200 m: 10 units/floor, 2.0 pers/unit ==")
show(zone('A low 2F-26F (25 fl) 4 lifts 4 m/s 15p', 25, 3.4, 4.0, 15, 250*2.0, L=4, lobby_extra=3.1))
show(zone('A high 27F-51F express 85 m, 4 lifts 6 m/s 15p', 25, 3.4, 6.0, 15, 250*2.0, express=85, L=4, lobby_extra=3.1))
show(zone('A low 3 lifts', 25, 3.4, 4.0, 15, 250*2.0, L=3, lobby_extra=3.1))

print("\n== extra ==")
show(zone('A single bank 50 fl 6 lifts 6 m/s 15p', 50, 3.4, 6.0, 15, 500*2.0, L=6, lobby_extra=3.1))
show(zone('H single bank 50 fl 6 lifts 6 m/s 21p', 50, 3.4, 6.0, 21, 500*1.5, L=6, to=1.8, tc=2.8, lobby_extra=3.1+3.4))
show(zone('W 62F single bank 5 lifts 5 m/s 13p', 62, 3.0, 5.0, 13, 62*5*3.6, L=5, lobby_extra=6.0))
show(zone('N 45 home fl, private lift, 1 family (P=3) 4 m/s', 22, 3.4, 4.0, 4, 22*1*4.5, L=1, express=39))
