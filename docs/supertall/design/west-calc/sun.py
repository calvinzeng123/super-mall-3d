# 大寒日 (Jan 20, δ = −20.2°) direct-sun hours on the 西苑 south facades, 08:00–16:00 true solar time, box model.
# World: x east, z south (north = −z), y up. Latitude 30.3°N (PLAN.md sun model). 1-minute steps.
import math
PHI, DEC = math.radians(30.3), math.radians(-20.2)
def sun(t):                      # t = hours from solar noon
    H = math.radians(15 * t)
    sa = math.sin(PHI) * math.sin(DEC) + math.cos(PHI) * math.cos(DEC) * math.cos(H)
    alt = math.asin(sa)
    ca = (math.sin(DEC) - sa * math.sin(PHI)) / (math.cos(alt) * math.cos(PHI))
    az = math.acos(max(-1, min(1, ca)))            # from north, toward east
    if t > 0: az = 2 * math.pi - az
    return alt, az, (math.sin(az) * math.cos(alt), math.sin(alt), -math.cos(az) * math.cos(alt))
def hit(p, d, b):               # ray p + s d (s > 0) vs box (x0, z0, x1, z1, top)
    lo, hi = 1e-6, 1e9
    for k, (a, c) in enumerate(((b[0], b[2]), (0, b[4]), (b[1], b[3]))):
        o, v = p[k], d[k]
        if abs(v) < 1e-12:
            if o < a or o > c: return False
            continue
        s0, s1 = (a - o) / v, (c - o) / v
        if s0 > s1: s0, s1 = s1, s0
        lo, hi = max(lo, s0), min(hi, s1)
        if lo > hi: return False
    return True
def boxes(h):
    B = {'P1': (-280, -240, -30.3, -30.3, 40.0), 'P1C': (-153, -246, -105, -207, 43.5), 'P2': (29, -136.1, 277.2, -29, 29.0),
         'H': (-284, -100.2, -210, -62.2, h['H']), 'A': (-54, -251, -16, -177, h['A']),
         'T1': (-278, -240, -242, -224, h['T1']), 'T2': (-228, -240, -196, -224, h['T2']),
         'W1': (-480, -246, -436.6, -226.8, h['W']), 'W2': (-414, -246, -370.6, -226.8, h['W'])}
    for i, x in enumerate((28, 94, 160, 226)): B[f'R{i+1}'] = (x, -234.6, x + 42, -201.4, h['R'][i])
    return B
TODAY = dict(H=74.3, A=77.4, T1=100.1, T2=100.1, W=88.7, R=[106.6] * 4)
NEW = dict(H=200, A=190, T1=200, T2=185, W=200, R=[186, 198, 210, 198])     # crowns included (codes.md §3.3 staggering)
SLOTS = {'W1': [('SW', -480 + 8.5), ('S', -463.0 + 5.3), ('SE', -452.4 + 7.9)], 'W2': [('SW', -414 + 7.3), ('S', -399.4 + 5.6), ('SE', -388.2 + 8.8)]}
def hours(B, own, x, y):
    p, n = (x, y, -226.8 + 0.05), 0
    for m in range(0, 481):
        t = -4 + m / 60
        alt, az, d = sun(t)
        if alt <= 0 or d[2] <= 0: continue          # sun must be in front of the south facade
        if any(hit(p, d, b) for k, b in B.items() if k != own): continue
        n += 1
    return n / 60
for label, h in (('today', TODAY), ('supertall', NEW)):
    B = boxes(h)
    for tid, slots in SLOTS.items():
        for y in (5.4, 50.0, 100.0):
            print(f"{label:<9} {tid} sill {y:>5} m: " + '  '.join(f"{s} {hours(B, tid, x, y):.2f} h" for s, x in slots))
# noon shadow length of the 西苑 crown and the north-bank city blocks
alt, az, d = sun(0)
print(f"noon altitude {math.degrees(alt):.1f}°, 200 m crown shadow {200 / math.tan(alt):.0f} m north of the north facade (z −246 → {-246 - 200 / math.tan(alt):.0f}); river z −300…−412, north-bank blocks from z −530")
