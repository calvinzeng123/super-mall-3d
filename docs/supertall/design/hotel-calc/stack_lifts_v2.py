# v2 (after DECISIONS.md): H re-stacked so the residence bank (RB) and the hotel locals (HL) can really share shaft
# footprints. Same lift model as stack_lifts.py (codes.md calc/lifts.py, up-peak, full cars, conservative).
import math, importlib.util, sys, io, contextlib
spec = importlib.util.spec_from_file_location('v1', __file__.replace('stack_lifts_v2.py', 'stack_lifts.py'))
v1 = importlib.util.module_from_spec(spec)
with contextlib.redirect_stdout(io.StringIO()): spec.loader.exec_module(v1)   # reuse flight/zone/show/fire/build/floors
flight, zone, show, fire, build, floors = v1.flight, v1.zone, v1.show, v1.fire, v1.build, v1.floors

# Hoistway figures, typical traction-lift data (≈, manufacturer catalogues; GB 7588 sets the method, not the numbers)
HEAD = {3.5: 5.2, 4.0: 5.6, 6.0: 7.0}      # top landing floor -> underside of the machine-room slab
PIT  = {3.5: 3.2, 4.0: 3.6, 6.0: 4.5}      # bottom landing floor -> pit floor
MR   = 3.2                                  # machine room clear height + slab

H = build('H v2 云澜酒店 (酒店公寓 3F–25F · 26F 双层高避难/转换层 · 27F 空中大堂 · 酒店 28F–46F)',
    [(1, 6.5, 'lobby', '酒店落客大堂 · 酒店公寓大堂'), (2, 5.0, 'podium', '会议中心 · 商场空中连廊')]
    + floors(range(3, 13), 3.4, 'residence', '云澜酒店公寓 8 套') + [(13, 4.5, 'refuge', '避难层兼设备层 R1')]
    + floors(range(14, 26), 3.4, 'residence', '云澜酒店公寓 8 套')
    + [(26, 8.6, 'refuge', '避难层 R2 + 双层高设备层: RB 机房 (核心筒夹层) · HL 底坑 · 酒店空调机组 · 转输水箱')]
    + [(27, 6.8, 'skylobby', '空中大堂 · 办理入住 · 全日餐厅 · 大堂吧 · 行政酒廊')]
    + [(28, 3.4, 'hotel', '酒店客房 8 间套房 · 核心筒南排 = 穿梭梯机房')] + floors(range(29, 37), 3.4, 'hotel', '酒店客房 8 间套房') + [(37, 6.0, 'refuge', '避难层兼设备层 R3')]
    + floors(range(38, 44), 3.4, 'hotel', '酒店客房 8 间套房') + floors(range(44, 47), 3.4, 'hotel', '行政楼层 8 间套房')
    + [(47, 6.0, 'amenity', '云境水疗 · 室内泳池 · 健身'), (48, 6.0, 'amenity', '云端餐厅 · 云端酒吧')])
el = {r[0]: r[1] for r in H}
A = v1.A; elA = {r[0]: r[1] for r in A}
def count(rows, kinds): return sum(1 for r in rows if r[3] in kinds)
print('\n== counts')
print('  H residence floors', count(H, ('residence',)), '-> homes', 8*count(H, ('residence',)), '| hotel floors', count(H, ('hotel',)), '-> keys', 8*count(H, ('hotel',)))
print('  A floors', count(A, ('apartment',)), '+ LOFT', count(A, ('loft',)), '-> units', 8*(count(A, ('apartment',)) + count(A, ('loft',))))
print('  H/B: H', round(H[-1][1]/32.0, 2), '| A', round(A[-1][1]/31.8, 2))

print('\n== stacked shafts (RB below, HL above, same footprint): vertical budget from 25F floor to 27F floor')
need = HEAD[3.5] + MR + PIT[4.0]; have = el[27] - el[25]
print(f'  RB top landing 25F @ {el[25]}: hoistway top {el[25]+HEAD[3.5]:.1f}; machine room to {el[25]+HEAD[3.5]+MR:.1f}; HL pit floor {el[27]-PIT[4.0]:.1f} (27F @ {el[27]})')
print(f'  need {need:.1f} m, have {have:.1f} m  ->  {"OK" if have >= need - 1e-6 else "SHORT by %.1f m" % (need-have)}')
print(f'  v1 stack had 25F @ 87.4, 27F @ 96.8: have 9.4 m -> SHORT by {need-9.4:.1f} m (why 26F grows from 6.0 to 8.6 m)')
print(f'  SH top landing 27F @ {el[27]}: hoistway top {el[27]+HEAD[6.0]:.1f} (28F floor {el[28]}): machine room in the 28F core, south row, {el[27]+HEAD[6.0]:.1f}–{el[27]+HEAD[6.0]+MR:.1f}')
print(f'  HL top landing 48F @ {el[48]}: hoistway top {el[48]+HEAD[4.0]:.1f} vs RF {H[-1][1]} -> machine room in the RF lantern')
print(f'  S1/S2 top landing RF @ {H[-1][1]}: hoistway top {H[-1][1]+HEAD[4.0]:.1f}, machine room to {H[-1][1]+HEAD[4.0]+MR:.1f}; deck slab + structure ≈ 1.6 -> pad ≈ {H[-1][1]+HEAD[4.0]+MR+1.6:.1f}')
print(f'  A: L1–L5 top landing 44F @ {elA[44]}: 5 m/s headroom ≈ 6.3 -> {elA[44]+6.3:.1f} vs RF {A[-1][1]}; S1/S2 to RF -> {A[-1][1]+HEAD[4.0]+MR:.1f}; lantern to ≈ RF + 10')

print('\n== refuge areas (GB 55037 §7.1.15-1; 5 p/m²)')
perH = {'residence': 16, 'hotel': 16, 'skylobby': 250, 'amenity': 160}
perA = {'apartment': 16, 'loft': 24, 'amenity': 120}
for name, rows, per in (('H', H, perH), ('A', A, perA)):
    refs = [r for r in rows if r[3] == 'refuge']
    for i, r in enumerate(refs):
        hi = refs[i+1][1] if i+1 < len(refs) else 1e9
        p = sum(per.get(q[3], 0) for q in rows if r[1] < q[1] < hi)
        print(f'  {name} {r[0]}F @ {r[1]} m: {p} people -> net refuge area >= {p/5:.0f} m²')

print('\n== lifts')
for L, v in ((3, 3.5), (4, 3.5)):
    show(zone(f'H RB ×{L} 3F–25F (22 stops), 176 homes', 22, 3.4, v, 18, 176*2, express=11.5-3.4, L=L))
for L, v in ((2, 6.0), (3, 6.0)):
    show(zone(f'H SH ×{L} 1F→27F (express {el[27]} m)', 1, el[27], v, 21, 144*1.5+150, to=1.8, tc=2.8, L=L))
for L, v in ((3, 4.0), (4, 4.0)):
    show(zone(f'H HL ×{L} 27F→28F–48F (20 stops)', 20, 3.4, v, 21, 144*1.5+80, to=1.8, tc=2.8, L=L))
show(zone('A single bank ×5 at 5 m/s (unchanged)', 39, 3.6, 5.0, 15, 304*2, express=11.5-3.6, L=5))
print('\n== fire lifts 1F -> top (GB 50016 §7.3.8-3 宜 <= 60 s), a = 0.9 m/s²')
for name, h in (('H 48F', el[48]), ('H RF', H[-1][1]), ('A 44F', elA[44]), ('A RF', A[-1][1])):
    print(f'  {name} {h} m:', {v: fire(h, v) for v in (4.0, 5.0)})
print('\n== game ride |dy|/7 s:', {k: round(v/7, 1) for k, v in (('H 1F->27F', el[27]), ('H 27F->48F', el[48]-el[27]), ('A 1F->44F', elA[44]))})
