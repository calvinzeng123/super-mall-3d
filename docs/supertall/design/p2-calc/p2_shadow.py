# Game sun (src/render/env.js sunDir (-0.55, 0.78, 0.62)): shadow direction/length of the R crowns, and whether each crown
# stays inside the campus shadow camera (setShadowFocus(origin, 340): ortho box +-340 in light space).  python3 -I p2_shadow.py
import math
s = (-0.55, 0.78, 0.62); n = math.sqrt(sum(c * c for c in s)); s = tuple(c / n for c in s)
el = math.degrees(math.asin(s[1])); az = math.degrees(math.atan2(-s[0], s[2]))
hor = math.hypot(s[0], s[2]); k = hor / s[1]                     # shadow length per metre of height
d = (-s[0] / hor, -s[2] / hor)                                    # shadow direction on the ground (x, z)
xc = (s[2], 0, -s[0]); m = math.hypot(xc[0], xc[2]); xc = (xc[0] / m, 0, xc[2] / m)
yc = (s[1] * xc[2] - s[2] * xc[1], s[2] * xc[0] - s[0] * xc[2], s[0] * xc[1] - s[1] * xc[0])
print(f"sun elevation {el:.1f} deg, azimuth {az:.1f} deg west of south; shadow = {k:.2f} x height toward ({d[0]:+.3f}, {d[1]:+.3f}) (x east, z south)")
for t, x, top_today, top_new in (('R1', 49, 106.6, 200.0), ('R2', 115, 106.6, 189.8), ('R3', 181, 106.6, 179.6), ('R4', 247, 106.6, 169.4), ('R4 @200', 247, 106.6, 200.0)):
    z = -218.0
    ly = lambda h: x * yc[0] + h * yc[1] + z * yc[2]
    lx = x * xc[0] + z * xc[2]
    tip = (x + d[0] * k * top_new, z + d[1] * k * top_new)
    print(f"{t:<8} crown {top_new:5.1f} m: shadow {k * top_new:5.0f} m long, tip at ({tip[0]:.0f}, {tip[1]:.0f}); light-space x {lx:6.1f}, y today {ly(top_today):6.1f} -> new {ly(top_new):6.1f}  ({'inside' if abs(ly(top_new)) <= 340 else 'OUTSIDE'} +-340)")
print("river water z [-414, -300]; promenade z [-300, -268]; 北外环 z [-268, -256]; P2 roof z [-136, -29] (south of the towers)")
