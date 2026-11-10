# H / A ~200 m: storey stacks (refuge checks), refuge areas, lift traffic (codes.md calc/lifts.py model, copied), fire-lift 60 s.
import math
A_, J = 1.0, 1.5; TP = 1.2
def flight(d, v, a=A_, j=J):
    if d >= v*(v/a + a/j): return d/v + v/a + a/j
    if d >= 2*a**3/j**2:
        vp = 0.5*a*(-a/j + math.sqrt((a/j)**2 + 4*d/a)); return 2*(vp/a + a/j)
    return (32*d/j)**(1/3)
def zone(name, N, df, v, cap, pop, express=0.0, to=2.0, tc=3.0, L=1):
    P = 0.8*cap; S = N*(1-(1-1/N)**P); H = N - sum((i/N)**P for i in range(1, N))
    ts = flight(df, v) - df/v + to + tc + 0.5
    rtt = 2*(express + H*df)/v + (S+1)*ts + 2*P*TP
    return dict(name=name, N=N, v=v, cap=cap, L=L, rtt=round(rtt, 1), int=round(rtt/L, 1), hc5=round(300*P*L/rtt, 1), pct=round(100*300*P*L/rtt/pop, 1), pop=pop)
def show(r): print(f"  {r['name']:<58} N={r['N']:>2} v={r['v']:.1f} {r['cap']}p L={r['L']} RTT={r['rtt']:>6} INT={r['int']:>5} s HC5={r['hc5']:>5} ({r['pct']:>4} % of {r['pop']})")
def fire(h, v): return round(flight(h, v, a=0.9), 1)

def build(name, rows):
    e, out = 0.0, []
    for no, h, kind, label in rows:
        out.append((no, round(e, 2), h, kind, label)); e += h
    out.append(('RF', round(e, 2), 3.2, 'roof', '屋面'))
    print(f'\n== {name}: RF {e:.1f} m')
    last_ref, prev = 0.0, None
    for no, el, h, kind, label in out:
        tag = ''
        if kind == 'refuge': tag = f'   <- refuge, +{el-last_ref:.1f} m from {"hardstand" if last_ref == 0 else "previous"}'; last_ref = el
        print(f'  {str(no)+("F" if no != "RF" else ""):>4} {el:7.2f} m  h {h:4.1f}  {kind:<10} {label}{tag}')
    occ = [r for r in out if r[3] not in ('refuge', 'roof')]
    print(f'  top occupied floor {occ[-1][0]}F @ {occ[-1][1]} m, {occ[-1][1]-last_ref:.1f} m above the last refuge floor')
    return out

def floors(nos, h, kind, label): return [(n, h, kind, label) for n in nos]
# ---- H, recommended: 1F lobbies + 2F conference/link + branded residences + sky lobby + hotel + spa + sky dining
H = build('H 云澜酒店 (recommended: 酒店公寓 + 空中大堂 + 酒店)',
    [(1, 6.5, 'lobby', '酒店落客大堂 · 酒店公寓大堂'), (2, 5.0, 'podium', '会议中心 · 商场空中连廊')]
    + floors(range(3, 13), 3.4, 'residence', '云澜酒店公寓 8 套') + [(13, 4.5, 'refuge', '避难层兼设备层 R1')]
    + floors(range(14, 26), 3.4, 'residence', '云澜酒店公寓 8 套') + [(26, 6.0, 'refuge', '避难层兼设备层 R2 (低区电梯机房)')]
    + [(27, 6.8, 'skylobby', '空中大堂 · 办理入住 · 全日餐厅 · 大堂吧')]
    + floors(range(28, 38), 3.4, 'hotel', '酒店客房 8 间套房') + [(38, 6.0, 'refuge', '避难层兼设备层 R3')]
    + floors(range(39, 48), 3.4, 'hotel', '酒店客房 8 间套房 (45–47F 行政楼层)')
    + [(48, 6.0, 'amenity', '云境水疗 · 室内泳池 · 健身'), (49, 6.0, 'amenity', '云端餐厅 · 云端酒吧')])
# ---- H alternative O: offices low (4.2 m)
HO = build('H alternative O (写字楼 + 酒店)',
    [(1, 6.5, 'lobby', '酒店落客大堂 · 写字楼大堂'), (2, 5.0, 'podium', '会议中心 · 商场空中连廊')]
    + floors(range(3, 11), 4.2, 'office', '写字楼') + [(11, 4.5, 'refuge', 'R1')]
    + floors(range(12, 22), 4.2, 'office', '写字楼') + [(22, 6.0, 'refuge', 'R2')]
    + [(23, 6.8, 'skylobby', '空中大堂')]
    + floors(range(24, 33), 3.4, 'hotel', '客房') + [(33, 6.0, 'refuge', 'R3')]
    + floors(range(33+1, 43), 3.4, 'hotel', '客房') + [(43, 6.0, 'amenity', '水疗泳池'), (44, 6.0, 'amenity', '云端餐厅酒吧')])
# ---- A
A = build('A 云澜服务公寓',
    [(1, 6.5, 'lobby', '迎宾与生活大堂'), (2, 5.0, 'podium', '住客会所 · 健身洗衣 · 共享办公 · 商场连廊（刷卡）')]
    + floors(range(3, 13), 3.4, 'apartment', '服务公寓 8 套') + [(13, 4.5, 'refuge', '避难层兼设备层 R1')]
    + floors(range(14, 26), 3.4, 'apartment', '服务公寓 8 套') + [(26, 6.0, 'refuge', '避难层兼设备层 R2')]
    + floors(range(27, 39), 3.4, 'apartment', '服务公寓 8 套') + [(39, 6.0, 'refuge', '避难层兼设备层 R3')]
    + floors(range(40, 44), 6.5, 'loft', 'LOFT 复式公寓 8 套') + [(44, 5.0, 'amenity', '空中会所 · 住客酒廊 · 健身 · 共享厨房')])

def count(rows, kinds): return sum(1 for r in rows if r[3] in kinds)
print('\n== counts')
print('  H residence floors', count(H, ('residence',)), '-> homes', 8*count(H, ('residence',)), '| hotel floors', count(H, ('hotel',)), '-> keys', 8*count(H, ('hotel',)))
print('  HO office floors', count(HO, ('office',)), '| hotel floors', count(HO, ('hotel',)), '-> keys', 8*count(HO, ('hotel',)))
print('  A apartment floors', count(A, ('apartment',)), '-> units', 8*count(A, ('apartment',)), '+ LOFT', 8*count(A, ('loft',)), '=', 8*(count(A, ('apartment',))+count(A, ('loft',))))
print('  H/B: H', round(H[-1][1]/32.0, 2), '(B 32.0) | A', round(A[-1][1]/31.8, 2), '(B 31.8)')

print('\n== refuge areas (GB 55037 §7.1.15-1: everyone between this refuge floor and the next one up; 5 p/m²)')
def pop_between(rows, lo, hi, per):
    return sum(per.get(r[3], 0) for r in rows if lo < r[1] < hi)
perH = {'residence': 16, 'hotel': 16, 'skylobby': 250, 'amenity': 160}     # 8 units × 2 p; sky lobby 250; spa 80 / dining 240 averaged
perA = {'apartment': 16, 'loft': 24, 'amenity': 120}
for name, rows, per in (('H', H, perH), ('A', A, perA)):
    refs = [r for r in rows if r[3] == 'refuge']
    for i, r in enumerate(refs):
        hi = refs[i+1][1] if i+1 < len(refs) else 1e9
        p = pop_between(rows, r[1], hi, per)
        print(f'  {name} {r[0]}F @ {r[1]} m: {p} people -> net refuge area >= {p/5:.0f} m²')

print('\n== lifts (up-peak, codes.md model; residential-type intervals are upper bounds)')
el = {r[0]: r[1] for r in H}
# H residences bank: 1F -> 3F..25F (22 stops), express 1F->3F 11.5 m
for L, v, cap in ((3, 3.5, 18), (4, 3.5, 18), (4, 4.0, 18)):
    show(zone(f'H 酒店公寓客梯 RB ×{L}, 3F–25F (22 stops)', 22, 3.4, v, cap, 176*2, express=11.5-3.4, L=L))
# shuttles: 1F -> 27F, express 96.8 m (2F stop ignored in up-peak)
for L, v in ((2, 6.0), (2, 7.0), (3, 6.0)):
    show(zone(f'H 穿梭梯 SH ×{L} 1F→27F 空中大堂 (express {el[27]} m)', 1, el[27], v, 21, 152*1.5+150, to=1.8, tc=2.8, L=L))
# hotel locals from the sky lobby: 28F..49F minus 38F -> 21 stops, df 3.4 (the 6 m spa/dining floors approximated)
for L, v in ((3, 4.0), (4, 4.0), (4, 5.0)):
    show(zone(f'H 酒店客梯 HL ×{L} 27F→28F–49F (21 stops)', 21, 3.4, v, 21, 152*1.5+80, to=1.8, tc=2.8, L=L))
elA = {r[0]: r[1] for r in A}
show(zone('A single bank ×6, 3F–44F (39 stops) 6 m/s', 39, 3.6, 6.0, 15, 304*2, express=11.5-3.6, L=6))
show(zone('A single bank ×6 at 5 m/s', 39, 3.6, 5.0, 15, 304*2, express=11.5-3.6, L=6))
show(zone('A single bank ×5 at 5 m/s', 39, 3.6, 5.0, 15, 304*2, express=11.5-3.6, L=5))
show(zone('A low bank ×3, 3F–25F (22 stops) 3.5 m/s', 22, 3.4, 3.5, 15, 176*2, express=11.5-3.4, L=3))
show(zone(f'A high bank ×3, 27F–44F (17 stops) 6 m/s express {elA[27]-3.4:.1f}', 17, 3.9, 6.0, 15, 128*2+60, express=elA[27]-3.4, L=3))
show(zone(f'A high bank ×4, same', 17, 3.9, 6.0, 15, 128*2+60, express=elA[27]-3.4, L=4))
print('\n== fire lifts 1F -> top storey (GB 50016 §7.3.8-3: <= 60 s), a = 0.9 m/s²')
for name, h in (('H 49F', el[49]), ('H RF', H[-1][1]), ('A 44F', elA[44]), ('A RF', A[-1][1])):
    print(f'  {name} {h} m:', {v: fire(h, v) for v in (3.0, 4.0, 5.0)})
print('\n== game ride today |dy|/7 s:', {k: round(v/7, 1) for k, v in (('H 1F->27F', el[27]), ('H 27F->49F', el[49]-el[27]), ('A 1F->44F', elA[44]))})
