# Build a floor stack bottom-up and insert refuge floors so that each refuge floor level is
# <= previous + GAP (first: <= GAP above the fire hardstand at 0 m), and the top occupied floor is
# <= last refuge + GAP. Floors are numbered including refuge floors (Chinese practice).
def stack(name, base_floors, typ_h, refuge_h, roof_target, gap=48.0, start_no=None, forbid=()):
    floors = list(base_floors)            # [(label_no, elev, height, kind)]
    last_ref = 0.0
    # check base floors against the first refuge limit
    no = floors[-1][0] + 1; e = floors[-1][1] + floors[-1][2]
    out = []
    refuges = []
    while True:
        # would the floor after next overshoot the gap? then this one becomes refuge
        if e >= roof_target - 1e-9: break
        if e - last_ref > gap + 2 - 1e-9:
            raise SystemExit(f'{name}: cannot place refuge, e={e}')
        nxt = e + typ_h
        if nxt - last_ref > gap and (roof_target - typ_h) - last_ref > gap and e not in forbid:
            floors.append((no, round(e, 2), refuge_h, 'REFUGE')); refuges.append((no, round(e, 2))); last_ref = e; e += refuge_h
        else:
            floors.append((no, round(e, 2), typ_h, 'home')); e += typ_h
        no += 1
    top = floors[-1]
    homes = sum(1 for f in floors if f[3] == 'home')
    print(f"{name:<34} roof {e:6.1f} m | top floor {top[0]}F @ {top[1]} m | home floors {homes:>2} | refuge {refuges} | top-last_ref {top[1]-last_ref:.1f} m")
    return floors
# 北苑: 7F 34.0 lobby 5.0, then floors 3.45 avg (3.6 flats / 3.3 duplex), refuge 4.5
nb = [(7, 34.0, 5.0, 'lobby')]
for tgt in (146, 150, 162, 200): stack(f'北苑 roof~{tgt}', nb, 3.45, 4.5, tgt)
# 西苑: 1F 4.5, floors 3.0, refuge 4.5
for tgt in (134, 150, 200): stack(f'西苑 roof~{tgt}', [(1, 0.0, 4.5, 'lobby')], 3.0, 4.5, tgt)
# R: 1F 4.8, floors 3.4, refuge 5.4 (outrigger)
for tgt in (188, 200): stack(f'R roof~{tgt}', [(1, 0.0, 4.8, 'lobby')], 3.4, 5.4, tgt)
# H / A: 1F 6.5, floors 3.4, refuge 6.0
for tgt in (188, 200): stack(f'H/A roof~{tgt}', [(1, 0.0, 6.5, 'lobby')], 3.4, 6.0, tgt)
print('--- efficient caps (2 refuge floors) ---')
stack('北苑 roof~143', nb, 3.45, 4.5, 143)
stack('西苑 roof~144', [(1, 0.0, 4.5, 'lobby')], 3.0, 4.5, 144)
stack('R roof~192 gap50', [(1, 0.0, 4.8, 'lobby')], 3.4, 5.4, 192, gap=50)
stack('H/A roof~192 gap50', [(1, 0.0, 6.5, 'lobby')], 3.4, 6.0, 192, gap=50)
