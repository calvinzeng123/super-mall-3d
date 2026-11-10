# Skyline check for DECISIONS.md item 4 (错落): apparent top elevation angle and left-to-right order of every tall tower
# from the views the user sees (tour steps + two street views). Tower centres from buildLayout({expansion:true}).
# Heights: 西苑 S47 crown 156.5 (west.md), 北苑 150 m variant T1 ≈ 151 / T2 ≈ 143 (north.md §6.3),
# R1–R4 200 / 189.8 / 179.6 / 169.4 (p2.md), H / A this study. World: x east, z south, y up.
import math
C = {'W1': (-458.3, -236.4), 'W2': (-392.3, -236.4), 'T1': (-260, -232), 'T2': (-212, -232), 'H': (-247, -81.15),
     'A': (-35, -214), 'R1': (49, -218), 'R2': (115, -218), 'R3': (181, -218), 'R4': (247, -218)}
BASE = {'W1': 156.5, 'W2': 156.5, 'T1': 151, 'T2': 143, 'A': 184.6, 'R1': 200.0, 'R2': 189.8, 'R3': 179.6, 'R4': 169.4}
VIEWS = {  # name: (eye, look-at)
  '园区全景 tour (110,430,480)':            ((110, 430, 480), (0, 0, 0)),
  '云澜江·星湾桥 tour (120,46,-560)':        ((120, 46, -560), (-120, 14, -300)),
  '对岸看北苑 tour (-196,1.7,-446)':        ((-196, 1.7, -446), (-215, 30, -245)),
  '星湾桥 midspan, facing the campus':      ((12.5, 1.7, -350), (12.5, 1.7, 0)),
  '北苑 tour (-150,115,-380)':              ((-150, 115, -380), (-236, 55, -232)),
  '星湾路 at 北外环 (0,1.7,-290)':           ((0, 1.7, -290), (0, 1.7, 0)),
  '三期 中心广场 (-60,1.7,40), facing N':    ((-60, 1.7, 40), (-60, 1.7, -300)),
}
def run(label, H):
    hts = dict(BASE, H=H)
    print(f'\n### H top {H} m, A top {hts["A"]} m  ({label})')
    for vn, (e, t) in VIEWS.items():
        fx, fz = t[0]-e[0], t[2]-e[2]; f = math.atan2(fx, -fz)
        rows = []
        for k, (x, z) in C.items():
            dx, dz = x-e[0], z-e[2]; d = math.hypot(dx, dz)
            az = math.degrees((math.atan2(dx, -dz) - f + math.pi) % (2*math.pi) - math.pi)
            if abs(az) > 60: continue
            rows.append((az, k, d, math.degrees(math.atan2(hts[k]-e[1], d))))
        rows.sort()
        seq = '  '.join(f'{k}:{el:4.1f}°' for az, k, d, el in rows)
        top = max(rows, key=lambda r: r[3])
        print(f'  {vn:<38} L→R  {seq}   | summit {top[1]}')
for label, H in (('recommended: pad ≈ RF 185.4 + 11', 196.4), ('lower: RF ≈ 175', 186), ('higher: 215 class', 212)):
    run(label, H)
