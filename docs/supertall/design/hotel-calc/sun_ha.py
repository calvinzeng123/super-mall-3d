# 大寒日 (δ = −20.2°) direct sun 08:00–16:00 true solar time, 30.3°N, box model (same model as west-calc/sun.py).
# World: x east, z south (north = −z), y up. Question: what do H (~200 m) and A (~183 m) take from 北苑, the P1 roof, R1 and 西苑?
import math
PHI, DEC = math.radians(30.3), math.radians(-20.2)
def sun(t):
    H = math.radians(15 * t); sa = math.sin(PHI)*math.sin(DEC) + math.cos(PHI)*math.cos(DEC)*math.cos(H)
    alt = math.asin(sa); ca = (math.sin(DEC) - sa*math.sin(PHI)) / (math.cos(alt)*math.cos(PHI))
    az = math.acos(max(-1, min(1, ca)));  az = 2*math.pi - az if t > 0 else az
    return alt, az, (math.sin(az)*math.cos(alt), math.sin(alt), -math.cos(az)*math.cos(alt))
def hit(p, d, b):
    lo, hi = 1e-6, 1e9
    for k, (a, c) in enumerate(((b[0], b[2]), (0, b[4]), (b[1], b[3]))):
        o, v = p[k], d[k]
        if abs(v) < 1e-12:
            if o < a or o > c: return False
            continue
        s0, s1 = (a-o)/v, (c-o)/v
        if s0 > s1: s0, s1 = s1, s0
        lo, hi = max(lo, s0), min(hi, s1)
        if lo > hi: return False
    return True
def world(scn):
    B = {'P1C': (-153, -246, -105, -207, 43.5),
         'T1': (-278, -240, -242, -224, scn['T1']), 'T2': (-228, -240, -196, -224, scn['T2']),
         'W1': (-480, -246, -436.6, -226.8, scn['W']), 'W2': (-414, -246, -370.6, -226.8, scn['W'])}
    for i, x in enumerate((28, 94, 160, 226)): B[f'R{i+1}'] = (x, -234.6, x+42, -201.4, scn['R'][i])
    if scn['H'] == 'today': B['H'] = (-284, -100.15, -210, -62.15, 74.3)
    else:
        wing, spine = scn['H']
        B['H'] = (-284, -97.95, -218, -62.15, wing); B['Hs'] = (-262, -97.95, -240, -62.15, spine)
        B['Hp'] = (-284, -100.15, -210, -62.15, 6.5)
    if scn['A'] == 'today': B['A'] = (-54, -251, -16, -177, 77.4)
    else:
        wing, spine = scn['A']
        B['A'] = (-48, -247, -16, -181, wing); B['As'] = (-48, -225, -16, -203, spine)
        B['Ap'] = (-54, -251, -16, -177, 6.5)
    return B
def hours(B, own, p, normal):
    n = 0; first = last = None
    for m in range(0, 481):
        t = -4 + m/60; alt, az, d = sun(t)
        if alt <= 0: continue
        if normal and d[0]*normal[0] + d[2]*normal[1] <= 0: continue
        if any(hit(p, d, b) for k, b in B.items() if not k.startswith(own)): continue
        n += 1
    return n/60
def blocked_by(B, own, p, normal):
    by = {}
    for m in range(0, 481):
        t = -4 + m/60; alt, az, d = sun(t)
        if alt <= 0 or (normal and d[0]*normal[0] + d[2]*normal[1] <= 0): continue
        for k, b in B.items():
            if not k.startswith(own) and hit(p, d, b): by[k[0] if k[0] in 'HA' else k] = by.get(k[0] if k[0] in 'HA' else k, 0) + 1/60; break
    return {k: round(v, 2) for k, v in by.items()}
NORTH = dict(T1=199.9, T2=184.7, W=156.5, R=[186, 198, 210, 198])
SCN = {
  'today':          dict(T1=100.1, T2=100.1, W=88.7, R=[106.6]*4, H='today', A='today'),
  'H200 A183':      dict(NORTH, H=(189, 200), A=(175, 183)),
  'H170 A183':      dict(NORTH, H=(160, 170), A=(175, 183)),
  'H150 A183':      dict(NORTH, H=(142, 150), A=(175, 183)),
  'Htoday A183':    dict(NORTH, H='today', A=(175, 183)),
}
PTS = {  # name: (own box prefix, point, outward normal (x,z) or None for a horizontal deck)
  'T1 S 8F sill x-272': ('T1', (-272, 39.5, -223.95), (0, 1)), 'T1 S 8F sill x-260': ('T1', (-260, 39.5, -223.95), (0, 1)),
  'T1 S 8F sill x-248': ('T1', (-248, 39.5, -223.95), (0, 1)), 'T1 S 24F x-260': ('T1', (-260, 94.5, -223.95), (0, 1)),
  'T1 S 36F x-260': ('T1', (-260, 143, -223.95), (0, 1)),
  'T2 S 8F sill x-222': ('T2', (-222, 39.5, -223.95), (0, 1)), 'T2 S 8F sill x-212': ('T2', (-212, 39.5, -223.95), (0, 1)),
  'T2 S 8F sill x-202': ('T2', (-202, 39.5, -223.95), (0, 1)), 'T2 S 24F x-212': ('T2', (-212, 94.5, -223.95), (0, 1)),
  'P1-RF deck SQ-D1 (-258,-200)': ('P1', (-258, 35.5, -200), None), 'P1-RF deck SQ-D4 (-182,-200)': ('P1', (-182, 35.5, -200), None),
  'P1-RF W deck (-195,-80)': ('P1', (-195, 35.5, -80), None), 'P1-RF W deck (-165,-100)': ('P1', (-165, 35.5, -100), None),
  'R1 W face 2F z-218': ('R1', (27.95, 5.7, -218), (-1, 0)), 'R1 W face 2F z-205': ('R1', (27.95, 5.7, -205), (-1, 0)),
  'R1 S face 2F x32': ('R1', (32, 5.7, -201.35), (0, 1)), 'R1 S face 2F x49': ('R1', (49, 5.7, -201.35), (0, 1)),
  'W2 S 2F sill SE slot': ('W2', (-380.3, 5.4, -226.75), (0, 1)), 'W2 S 50 m SE slot': ('W2', (-380.3, 50, -226.75), (0, 1)),
}
for s, scn in SCN.items():
    B = world(scn)
    print(f'== {s}')
    for name, (own, p, nrm) in PTS.items():
        h = hours(B, own, p, nrm)
        by = blocked_by(B, own, p, nrm)
        print(f'  {name:<32} {h:4.2f} h   lost to {by}')
alt, az, d = sun(0)
print(f'noon altitude {math.degrees(alt):.1f}°; shadow length of 200 m: {200/math.tan(alt):.0f} m; H north face z −97.95 → T1/T2 south face z −224 = {224-97.95:.1f} m')
for t in (-4, -3, -2, -1, 0, 1, 2, 3, 4):
    a, z, _ = sun(t); print(f'  {12+t:02d}:00 alt {math.degrees(a):5.1f}° az {math.degrees(z):6.1f}°')
