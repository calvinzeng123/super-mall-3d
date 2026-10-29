"""Draw the concept-fidelity masterplan and the phase-one vehicle access plan.

Usage (repo root):
  node docs/planning/2026-10-29-p1-concept-fidelity/export-design-data.mjs
  python3 docs/planning/2026-10-29-p1-concept-fidelity/draw-design.py
Writes masterplan.svg and parking-plan.svg next to this file.
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
D = json.loads((ROOT / 'design-data.json').read_text())
PR = D['proposal']
DS = PR['design']
FONT = "'PingFang SC','Microsoft YaHei','WenQuanYi Zen Hei','Noto Sans CJK SC',sans-serif"
INK, MUTED, LINE = '#24413a', '#6f7a70', '#d9d5c8'
NEW, OLD = '#d2522f', '#5f7584'
ZONE = {
    'P1': '#d8c6a3', 'P1C': '#b86f50', 'P1S': '#c9936d', 'P1E': '#86a48c', 'P1E2': '#86a48c',
    'P1W1': '#a8735c', 'P1W2': '#b9a586', 'P1W3': '#a48662', 'P1W4': '#8aa3a2', 'H': '#7f979b', 'A': '#7f979b',
}


class Svg:
    def __init__(self, w, h, scale, ox, oz):
        self.w, self.h, self.s, self.ox, self.oz, self.out = w, h, scale, ox, oz, []

    def X(self, x): return self.ox + x * self.s
    def Y(self, z): return self.oz + z * self.s
    def add(self, s): self.out.append(s)

    def text(self, x, y, t, size=18, color=INK, weight=400, anchor='start', extra=''):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{color}" font-weight="{weight}" '
                 f'text-anchor="{anchor}" {extra}>{html.escape(str(t))}</text>')

    def vtext(self, x, y, t, size=18, color=INK, weight=600):
        for i, ch in enumerate(t):
            self.text(x, y + i * size * 1.15, ch, size, color, weight, 'middle')

    def path(self, poly): return 'M' + ' L'.join(f'{self.X(x):.1f},{self.Y(z):.1f}' for x, z in poly) + ' Z'

    def poly(self, p, fill, stroke='none', w=1, extra=''):
        self.add(f'<path d="{self.path(p)}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" {extra}/>')

    def rect(self, r, fill, stroke='none', w=1, rad=0, extra=''):
        self.add(f'<rect x="{self.X(r["x0"]):.1f}" y="{self.Y(r["z0"]):.1f}" width="{(r["x1"]-r["x0"])*self.s:.1f}" '
                 f'height="{(r["z1"]-r["z0"])*self.s:.1f}" rx="{rad*self.s:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" {extra}/>')

    def circle(self, x, z, r, fill, stroke='none', w=1, extra=''):
        self.add(f'<circle cx="{self.X(x):.1f}" cy="{self.Y(z):.1f}" r="{r*self.s:.1f}" fill="{fill}" stroke="{stroke}" stroke-width="{w}" {extra}/>')

    def line(self, a, b, color, w=2, extra=''):
        self.add(f'<path d="M{self.X(a[0]):.1f},{self.Y(a[1]):.1f} L{self.X(b[0]):.1f},{self.Y(b[1]):.1f}" stroke="{color}" stroke-width="{w}" fill="none" {extra}/>')

    def arrow(self, a, b, color, w=4):
        self.line(a, b, color, w, 'marker-end="url(#arrow-' + color.strip('#') + ')"')

    def badge(self, x, z, num, title, sub=None, dark='#24483e'):
        xx, yy = self.X(x), self.Y(z)
        n = max(len(title) * 17 + 58, len(sub or '') * 13 + 24)
        self.add(f'<rect x="{xx-n/2:.1f}" y="{yy-22:.1f}" width="{n:.1f}" height="{62 if sub else 44}" rx="9" fill="#fffdf7" opacity=".96" stroke="#d1c9b9"/>')
        self.add(f'<circle cx="{xx-n/2+22:.1f}" cy="{yy:.1f}" r="14" fill="{dark}"/>')
        self.text(xx - n / 2 + 22, yy + 5, num, 13, 'white', 700, 'middle')
        self.text(xx - n / 2 + 45, yy + 6, title, 17, INK, 650)
        if sub:
            self.text(xx, yy + 29, sub, 13, MUTED, 400, 'middle')

    def svg(self):
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" '
                f'font-family="{FONT}">')
        defs = ['<defs>',
                '<pattern id="glass" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#c7dbd6"/>'
                '<path d="M0 12L12 0M-3 3L3 -3M9 15L15 9" stroke="#ffffff" stroke-width="1.2"/></pattern>',
                '<pattern id="dome" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="#cfe1dc"/>'
                '<path d="M0 7H14M7 0V14" stroke="#ffffff" stroke-width="1"/><circle cx="7" cy="7" r="2" fill="none" stroke="#9db8b0"/></pattern>',
                '<pattern id="stall" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#eceee8"/>'
                '<path d="M0 0V10" stroke="#c8ccc5" stroke-width="1.4"/></pattern>',
                '<pattern id="steps" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e6dccb"/>'
                '<path d="M0 4H8" stroke="#c3b59c" stroke-width="2"/></pattern>',
                '<pattern id="roof" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#c99272"/>'
                '<path d="M0 9L9 0" stroke="#a86f50" stroke-width="1.6"/></pattern>',
                '<filter id="shadow"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#1c3528" flood-opacity=".14"/></filter>']
        for color in (NEW, OLD, '#2f6fd6', '#8a8f86'):
            c = color.strip('#')
            defs.append(f'<marker id="arrow-{c}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">'
                        f'<path d="M0 0L10 5L0 10Z" fill="{color}"/></marker>')
        defs.append('</defs>')
        return head + ''.join(defs) + ''.join(self.out) + '</svg>'


def centroid(p):
    return sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p)


def bounds(p):
    xs, zs = [q[0] for q in p], [q[1] for q in p]
    return {'x0': min(xs), 'z0': min(zs), 'x1': max(xs), 'z1': max(zs)}


def ramp_arrow(g, ramp, color):
    (ax, az), (bx, bz) = ramp['from'], ramp['to']
    if ramp['side'] == 'out':
        ax, az, bx, bz = bx, bz, ax, az
    k0, k1 = .18, .82
    g.arrow((ax + (bx - ax) * k0, az + (bz - az) * k0), (ax + (bx - ax) * k1, az + (bz - az) * k1), color, 3.2)


SQ = DS['squareRoof']
SQ_W, SQ_D = round(SQ['rect']['x1'] - SQ['rect']['x0']), round(SQ['rect']['z1'] - SQ['rect']['z0'])
RAMP = {r['id']: r for r in PR['garage']}
LOOP = DS['hotelLoop']


def rounded_rect(g, r, rad, fill, stroke='none', w=1):
    g.rect(r, fill, stroke, w, rad)


def masterplan():
    g = Svg(1920, 1500, 4.0, 1300, 1372)
    g.add('<rect width="1920" height="1500" fill="#f5f2e9"/>')
    g.text(80, 70, 'YUNLAN  /  PHASE 01  /  CONCEPT A · FIDELITY', 18, '#7c826f', 600, extra='letter-spacing="4"')
    g.text(80, 134, '云澜汇一期 · 概念 A 对图深化方案', 50, INK, 650)
    g.text(80, 178, '以已批准效果图为唯一外观依据：平面位置保持，补齐穹顶、天幕、屋顶景观与车行出入口', 22, '#687568')
    dome = DS['dome']
    stats = [('4 → 6 对', '共享地库对外坡道'), ('3 → 6 口', '西侧地面停车场车行口'),
             (f"Ø{dome['radius'] * 2:.0f}m · {dome['apex']:.0f}m", '06 光穹直径 / 顶高'), (f'{SQ_W}×{SQ_D}m', '01 方庭玻璃天幕')]
    for i, (n, t) in enumerate(stats):
        g.text(80 + i * 330, 238, n, 32, INK, 650)
        g.text(80 + i * 330, 266, t, 16, '#7a8276')
    g.add('<path d="M80 292H1840" stroke="#d9d7ca"/>')
    # Map frame: x [-300, 4], z [-268, -8]
    g.add('<clipPath id="map"><rect x="100" y="300" width="1222" height="1060"/></clipPath><g clip-path="url(#map)">')
    for r in D['roads']:
        g.poly(r['poly'], '#d6dbd6')
    g.rect(D['plot'], '#e6e9df')
    # Tree belts
    for x, z in DS['trees']:
        g.circle(x, z, 1.6, '#7f9f78', '#fffdf7', 1)
    # Ground floor footprints
    for b in D['buildings']:
        fill = ZONE.get(b['id'], '#cfc6b3')
        g.poly(b['ground'], fill, '#fffdf7', 3, 'filter="url(#shadow)"')
    # Sunken amphitheatre
    g.poly(D['sunken'], '#e8dcc4', '#b39b72', 2)
    # Rooftop elements (dashed so they read as upper-level design)
    sq = DS['squareRoof']['rect']
    g.rect(sq, 'url(#glass)', '#ffffff', 3, 2)
    g.rect(sq, 'none', '#3c6f65', 1.4, 2, 'stroke-dasharray="7 5"')
    dome = DS['dome']
    g.circle(dome['cx'], dome['cz'], dome['radius'], 'url(#dome)', '#ffffff', 4)
    g.circle(dome['cx'], dome['cz'], dome['radius'], 'none', '#3c6f65', 1.6, 'stroke-dasharray="7 5"')
    for x, z in dome['columns']:
        g.circle(x, z, .9, '#3c6f65')
    g.poly(DS['canyon']['poly'], 'url(#glass)', '#3c6f65', 1.6, 'stroke-dasharray="6 4"')
    for a in DS['annexRoofs']:
        fill = 'url(#glass)' if a['type'] == 'glass-pavilion' else 'url(#roof)'
        g.rect(a['rect'], fill, '#7a4e34', 1.4, 0, 'stroke-dasharray="5 4"')
    # Courtyards, SE steps, hotel loop
    for c in DS['courtyards']:
        g.circle(c['x'], c['z'], c['r'], '#a9cdd8', '#ffffff', 3)
        g.circle(c['x'], c['z'], 1.2, '#ffffff', '#6d97a3', 1.5)
    g.poly(DS['seSteps']['poly'], 'url(#steps)', '#b39b72', 1.5)
    rounded_rect(g, LOOP['rect'], LOOP['corner'], '#9aa09d', '#fffdf7', 2)
    g.poly(LOOP['planterPoly'], '#87a77b', '#fffdf7', 2)
    # Bridges
    for b in D['bridges']:
        for q in b['polys']:
            g.poly(q, '#fff7e9', '#b88637', 1.2, 'opacity=".9"')
    # Existing ramps and kiosks
    for r in D['existingRamps']:
        if r['type'].startswith('street') and near_plot(r['poly']):
            g.poly(r['poly'], '#a8b3bb', '#637786', 1)
    for k in D['kiosks']:
        if near_plot(k['poly']):
            g.poly(k['poly'], '#5f7584', '#fffdf7', 1.2)
    # New garage ramps
    for a in PR['garageAprons']:
        g.poly(a['poly'], '#8d8f8a', '#fffdf7', 1.5)
    for r in PR['garage']:
        g.poly(r['poly'], '#f0b9a5', NEW, 1.6)
        g.poly(r['open'], NEW, NEW, 1.2, 'opacity=".85"')
        ramp_arrow(g, r, '#ffffff')
    g.add('</g>')
    g.rect(D['plot'], 'none', '#c55f43', 3)
    # Road labels
    g.text(g.X(-150), g.Y(-262) + 7, '北 外 环', 18, '#5d6a62', 600, 'middle')
    g.text(g.X(-150), g.Y(0) + 7, '云 澜 大 道', 22, '#5d6a62', 600, 'middle')
    g.vtext(g.X(0), g.Y(-150), '星湾路', 20, '#5d6a62')
    g.vtext(g.X(-292), g.Y(-215), '西外环', 18, '#5d6a62')
    # Zone badges (01..06 follow the concept image)
    g.badge(-220, -228, '01', '方庭玻璃天幕', '6F + 天幕 · 屋顶外摆环')
    g.badge(-129, -229, '02', '艺文馆', '7F · 屋顶玻璃亭')
    g.badge(-156, -44, '03', '南庭曲廊', '3F · 木构折板顶')
    g.badge(-42, -147, '04', '东庭花园馆', '4F / 3F · 屋顶花园')
    g.badge(-238, -142, '05', '西里', '2–3F · 坡屋顶')
    g.badge(-106, -106, '06', '云澜光穹', 'Ø60m · 顶高 54m')
    g.badge(-247, -88, 'H', '酒店', '20F · 南侧落客环岛', '#5e7276')
    g.badge(-35, -214, 'A', '公寓', '20F · 保留', '#5e7276')
    g.badge(-79, -197, 'N', '北翼采光峡谷', '摩天轮移除 · 林荫步道')
    for c in DS['courtyards']:
        g.text(g.X(c['x']), g.Y(c['z'] + c['r']) + 20, c['name'], 14, '#3e6d79', 600, 'middle')
    g.text(g.X(-50), g.Y(-27) + 4, '东南大台阶', 14, '#8a6f4b', 600, 'middle')
    g.text(g.X(-108.5), g.Y(-24) + 2, '下沉剧场', 14, '#8a6f4b', 600, 'middle')
    # New ramp call-outs
    n, e = RAMP['P1-N-IN'], RAMP['P1-E-IN']
    g.text(g.X(-196), g.Y(-256) - 10, f"新增 方庭北口 · 入/出 2×{n['width']}m · {n['length']:.0f}m · {n['slope']:.0f}%", 15, NEW, 700, 'middle')
    g.add(f'<path d="M{g.X(-27.5):.1f},{g.Y(-80):.1f} L{g.X(-52):.1f},{g.Y(-80):.1f}" stroke="{NEW}" stroke-width="1.6"/>')
    g.text(g.X(-53), g.Y(-80) - 4, '新增 星湾东口', 15, NEW, 700, 'end')
    g.text(g.X(-53), g.Y(-80) + 15, f"入/出 2×{e['width']}m · {e['length']:.0f}m · {e['slope']:.0f}%", 13, NEW, 600, 'end')
    # Right panel
    x0 = 1350
    g.text(x0, 340, '对图要点', 28, INK, 650)
    notes = [
        ('平面', '位置、Y 形骨架、附楼与连廊已与效果图吻合，保持不动'),
        ('06', f"圆厅升起 Ø{dome['radius'] * 2:.0f}m 网格玻璃穹顶，{len(dome['columns'])} 柱，顶高 {dome['apex']}m"),
        ('01', f"方庭中心 {SQ_W}×{SQ_D}m 四坡玻璃天幕，檐口 {SQ['eave']}m，脊 {SQ['ridge']}m"),
        ('屋顶', f"浅色石材屋面 + {DS['roofGarden']['planters']} 处花池 + {DS['roofGarden']['cafes']} 组伞座外摆"),
        ('附楼', '02 玻璃亭 · 03 木构棚架 · 04 屋顶花园 · 05 坡屋顶'),
        ('立面', '主楼 3F 以上铜木竖向格栅与暖光玻璃，三块画屏'),
        ('景观', f"两处喷泉雕塑、东南大台阶、沿街行道树 {len(DS['trees'])} 株"),
        ('酒店', f"前场改落客环岛，地面车位 {LOOP['stallsBefore']} → {LOOP['stallsAfter']}"),
        ('车行', '新增 2 对地库坡道 + 西侧停车场 3 个车行口'),
    ]
    y = 384
    for k, t in notes:
        g.add(f'<rect x="{x0}" y="{y-20}" width="62" height="28" rx="6" fill="#24483e"/>')
        g.text(x0 + 31, y, k, 14, 'white', 700, 'middle')
        g.text(x0 + 76, y, t, 15, '#3d4a42')
        y += 46
    y += 14
    g.text(x0, y, '图例', 22, INK, 650)
    y += 30
    legend = [
        ('#d8c6a3', '主楼 1F 轮廓（现状）'), ('#b86f50', '附楼（现状）'), ('url(#glass)', '天幕 / 采光峡谷（新增）'),
        ('url(#dome)', '光穹（新增）'), ('url(#roof)', '坡屋顶 / 棚架（新增）'), (NEW, '新增坡道敞开段'), ('#f0b9a5', '新增坡道暗埋段'),
        ('#a8b3bb', '既有对外坡道'), ('#5f7584', '既有地库电梯/楼梯厅'), ('#a9cdd8', '喷泉水院（新增）'),
    ]
    for fill, t in legend:
        g.add(f'<rect x="{x0}" y="{y-14}" width="30" height="18" rx="3" fill="{fill}" stroke="#c9c3b5"/>')
        g.text(x0 + 42, y, t, 15, '#3d4a42')
        y += 30
    g.add('<path d="M80 1384H1840" stroke="#d9d7ca"/>')
    g.text(80, 1418, '坐标与尺寸取自当前游戏布局（x 向东、z 向南，单位 m）；屋顶构件按顶层位置投影绘制。效果图里酒店约 12 层，游戏保留 20 层客房不改。', 16, MUTED)
    g.text(80, 1448, f'数据：design-data.json（{D["generated"]} 由 export-design-data.mjs 从 buildLayout() 导出）', 16, MUTED)
    g.text(1840, 1448, 'CONCEPT A · FIDELITY · 2026.10.29', 15, '#8a8f86', 500, 'end')
    (ROOT / 'masterplan.svg').write_text(g.svg())


def near_plot(poly):
    return any(-300 < x < 0 and -270 < z < -10 for x, z in poly)


def parking():
    g = Svg(1920, 1300, 2.75, 1430, 962)
    g.add('<rect width="1920" height="1360" fill="#f5f2e9"/>')
    g.text(80, 70, 'YUNLAN  /  PHASE 01  /  VEHICLE ACCESS', 18, '#7c826f', 600, extra='letter-spacing="4"')
    g.text(80, 130, '一期停车出入口组织', 46, INK, 650)
    g.text(80, 170, '共享地库四面进出，西侧地面停车场由单侧 3 口增至三面 6 口；坡道均按游戏实际高差与车位网格核验', 21, '#687568')
    g.add('<path d="M80 194H1840" stroke="#d9d7ca"/>')
    g.add('<clipPath id="pmap"><rect x="60" y="206" width="1440" height="820"/></clipPath><g clip-path="url(#pmap)">')
    for r in D['roads']:
        g.poly(r['poly'], '#d3d8d3')
    g.rect(D['plot'], '#e7e9df')
    w = D['west']
    g.rect(w['bounds'], '#e4e6dd')
    for lot in w['lots']:
        g.rect(lot['rect'], 'url(#stall)', '#c8ccc5', 1)
    for r in w['roads']:
        for q in r['polys']:
            g.poly(q, '#c2c6c1')
    g.poly(w['transit'], '#cfe3e6', '#5f9aa6', 1.5)
    # Garage decks (underground) as dashed outlines
    for deck, label in ((D['b1Deck'], '一期共享地库 B1/B2（-8.4 / -12m）'), (D['wpgDeck'], '西侧共享地库 B1/B2（-4.5 / -8.4m）')):
        g.rect(deck, 'none', '#2f6fd6', 2, 0, 'stroke-dasharray="10 7" opacity=".75"')
        g.text(g.X(deck['x0']) + 10, g.Y(deck['z1']) - 10, label, 15, '#2f6fd6', 600)
    for b in D['buildings']:
        g.poly(b['ground'], '#d4ccbb', '#fffdf7', 2)
    g.poly(D['sunken'], '#e8dcc4', '#b39b72', 1.5)
    for p in D['metroTunnel']:
        if bounds(p)['z1'] < -10:
            g.poly(p, 'none', '#b84a4a', 1.5, 'stroke-dasharray="5 4"')
    for k in D['kiosks']:
        g.poly(k['poly'], '#5f7584')
    # Existing street ramps and gates
    for r in D['existingRamps']:
        if r['type'].startswith('street'):
            g.poly(r['poly'], OLD, OLD, 1)
            ramp_arrow(g, {'from': (r['from']['x'], r['from']['z']), 'to': (r['to']['x'], r['to']['z']), 'side': 'in'}, '#ffffff')
    for gt in w['gates']:
        g.add(f'<rect x="{g.X(gt["x"]-4):.1f}" y="{g.Y(gt["z"]-3.5):.1f}" width="{8*g.s:.1f}" height="{7*g.s:.1f}" fill="{OLD}"/>')
    # New
    for a in PR['garageAprons']:
        g.poly(a['poly'], '#8d8f8a', NEW, 1.2)
    for r in PR['garage']:
        g.poly(r['poly'], '#f0b9a5', NEW, 1.6)
        g.poly(r['open'], NEW, NEW, 1)
        ramp_arrow(g, r, '#ffffff')
    for a in PR['garageArrivals']:
        g.poly(a['poly'], 'none', NEW, 1.2, 'stroke-dasharray="4 3"')
    for gt in PR['westGates']:
        g.poly(gt['poly'], NEW, '#fffdf7', 1.5)
    g.add('</g>')
    # Road names
    for x, z, t, vertical in ((-150, -262, '北外环', False), (-400, -262, '北环（西延）', False), (-150, 0, '云澜大道', False),
                              (-400, 0, '云澜大道（西延）', False), (-292, -150, '西外环', True), (0, -150, '星湾路', True)):
        if vertical:
            g.vtext(g.X(x), g.Y(z), t, 16, '#56635b', 650)
        else:
            g.text(g.X(x), g.Y(z) + 6, t, 16, '#56635b', 650, 'middle', 'letter-spacing="3"')
    # Call-outs
    def callout(x, z, dx, dy, title, sub, color=NEW):
        xx, yy = g.X(x), g.Y(z)
        g.add(f'<path d="M{xx:.1f},{yy:.1f} L{xx+dx:.1f},{yy+dy:.1f}" stroke="{color}" stroke-width="1.6"/>')
        g.add(f'<circle cx="{xx:.1f}" cy="{yy:.1f}" r="4" fill="{color}"/>')
        tx = xx + dx + (8 if dx >= 0 else -8)
        anchor = 'start' if dx >= 0 else 'end'
        g.text(tx, yy + dy + 2, title, 16, color, 700, anchor)
        g.text(tx, yy + dy + 22, sub, 13, '#4c5a52', 500, anchor)
    n, e = RAMP['P1-N-IN'], RAMP['P1-E-IN']
    callout(-196, -249, -30, -60, '① 方庭北口（新增）', f"北外环右进右出 · 坡长 {n['length']:.0f}m · {n['slope']:.0f}% · 落 P1-B1")
    callout(-21.75, -66, -40, 290, '② 星湾东口（新增）', f"星湾路右进右出 · {e['length']:.0f}m · {e['slope']:.0f}% · 距大道红线 {-20 - e['from'][1]:.1f}m")
    callout(-422, -251, -20, -64, '③ 北环西口（新增）', '西侧停车场 · 7m 双向')
    callout(-375, -251, 30, -64, '④ 北环东口（新增）', '距西外环 77m · 7m 双向')
    callout(-375, -25, 34, 116, '⑤ 大道口（新增）', '云澜大道西延段右进右出 · 距西外环 76m')
    callout(-262, -41, 40, 120, '酒店南口（保留）', '西外环 · 现落酒店 B1 再下 B2', OLD)
    callout(-52.5, -253.5, 60, -12, '公寓北口（保留）', '北外环 · 公寓 B1 → B2', OLD)
    callout(-359, -159, -40, 120, '西侧公共口 ×2（保留）', '地面场内 · 西库 B1', OLD)
    # Right panel: counts
    x0 = 1525
    g.text(x0, 250, '出入口统计', 26, INK, 650)
    rows = [('共享地库对外坡道', '8 条 / 4 对', '12 条 / 6 对'), ('其中一期地块内', '4 条 / 2 对', '8 条 / 4 对'),
            ('西侧地面停车场', '3 口 · 单侧', '6 口 · 三侧'), ('临街方向', '西 · 北', '西 · 北 · 东 · 南*')]
    y = 290
    g.text(x0, y, '项目', 14, MUTED, 600)
    g.text(x0 + 190, y, '现状', 14, MUTED, 600)
    g.text(x0 + 290, y, '本方案', 14, NEW, 700)
    for name, a, b in rows:
        y += 38
        g.add(f'<path d="M{x0} {y-26}H{x0+380}" stroke="{LINE}"/>')
        g.text(x0, y, name, 15, '#3d4a42')
        g.text(x0 + 190, y, a, 15, '#3d4a42')
        g.text(x0 + 290, y, b, 15, NEW, 700)
    y += 34
    g.text(x0, y, '* 南侧经西侧停车场大道口进入；一期地块南沿', 13, MUTED)
    g.text(x0, y + 20, '  被美食层、下沉剧场与地铁通道占用，不设坡道', 13, MUTED)
    stalls, after = D['stalls'], D['stallsAfter']
    y += 66
    g.text(x0, y, '车位', 20, INK, 650)
    g.text(x0 + 250, y, '现状', 14, MUTED, 600, 'end')
    g.text(x0 + 340, y, '本方案', 14, NEW, 700, 'end')
    for name, key in (('一期 B1', 'P1-B1'), ('一期 B2', 'P1-B2'), ('西库 B1', 'WPG-B1'), ('西库 B2', 'WPG-B2'),
                      ('西侧地面', 'westSurface'), ('酒店地面（落客环岛）', 'hotelSurface')):
        y += 30
        g.text(x0, y, name, 15, '#3d4a42')
        g.text(x0 + 250, y, f'{stalls[key]:,}', 15, INK, 650, 'end')
        g.text(x0 + 340, y, f'{after[key]:,}', 15, NEW if after[key] != stalls[key] else INK, 700, 'end')
    y += 52
    g.text(x0, y, '控制规则', 20, INK, 650)
    for t in ('车行口距道路交叉口红线 ≥ 70m', '距人行横道 ≥ 5m · 距地铁口/公交站 ≥ 15m', '坡度 ≤ 15%，敞开段至板下 3.05m',
              '右进右出，不跨中央分隔带', '坡道仅占 B1 实际净高段的车位'):
        y += 28
        g.text(x0, y, '· ' + t, 14, '#3d4a42')
    g.add('<path d="M80 1240H1840" stroke="#d9d7ca"/>')
    g.text(80, 1272, '蓝色虚线为地下车库范围；红色虚线为地铁 B1 通道。距离按游戏坐标量取，规则取常见地方停车场标准数值，作为游戏场景设计约束而非施工审批依据。', 15, MUTED)
    (ROOT / 'parking-plan.svg').write_text(g.svg())


masterplan()
parking()
print('wrote masterplan.svg, parking-plan.svg')
