"""Label the top-down garage screenshots map-style.

Each top view looks straight down from above its centre, so world (x, z) maps
to pixels with one scale per image, taken from that view's camera in
shot-views.json. Labels use WenQuanYi Zen Hei (fonts-wqy-zenhei).

Usage (repo root), after capture-shots.cjs:
  python3 docs/planning/2026-10-29-parking-system/label-shots.py <raw_dir> <labeled_dir>
Writes <name>-labeled.jpg into <labeled_dir> for views 01-06 and 17.
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
raw, out = map(Path, sys.argv[1:3])
D = json.loads((ROOT / 'parking-data.json').read_text(encoding='utf8'))
VIEWS = {v['name'][:2]: v for v in json.loads((ROOT / 'shot-views.json').read_text(encoding='utf8'))}
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
COL = {'street': '#ff6a00', 'inner': '#7b5cff', 'vehicle': '#1f6fff', 'walk': '#0f9d63', 'gate': '#ff6a00', 'name': '#1f2d3d'}
ramp = {r['id']: r for r in D['ramps']}
mid = lambda *ids: (sum((ramp[i]['low']['x'] + ramp[i]['high']['x']) / 2 for i in ids) / len(ids),
                    sum((ramp[i]['low']['z'] + ramp[i]['high']['z']) / 2 for i in ids) / len(ids))
mouth = lambda *ids: (sum(ramp[i]['high']['x'] for i in ids) / len(ids), sum(ramp[i]['high']['z'] for i in ids) / len(ids))


def project(v, x, z):
    s = v['h'] / (2 * (v['pos'][1] - v['target'][1]) * math.tan(math.radians(v['fov'] / 2)))
    return v['w'] / 2 + (x - v['target'][0]) * s, v['h'] / 2 + (z - v['target'][2]) * s


def pill(d, x, y, text, color, size, dx, dy, anchor=True):
    f = ImageFont.truetype(FONT, size)
    tw, th = d.textbbox((0, 0), text, font=f)[2:]
    bx, by = x + dx, y + dy
    pad = size * .45
    box = [bx - pad, by - th / 2 - pad * .8, bx + tw + pad, by + th / 2 + pad * .8]
    if dx < 0: box = [bx - tw - pad, box[1], bx + pad, box[3]]
    if anchor:
        d.line([(x, y), ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)], fill=color, width=3)
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=color, outline='#ffffff', width=3)
    d.rounded_rectangle(box, radius=pad * 1.3, fill='#ffffff', outline=color, width=3)
    d.text((box[0] + pad, box[1] + pad * .8), text, fill='#1f2d3d', font=f)


def title(d, text, sub):
    f, fs = ImageFont.truetype(FONT, 34), ImageFont.truetype(FONT, 22)
    tw = max(d.textbbox((0, 0), text, font=f)[2], d.textbbox((0, 0), sub, font=fs)[2])
    d.rounded_rectangle([20, 18, 20 + tw + 44, 118], radius=14, fill='#ffffff', outline='#d5dae1', width=2)
    d.rectangle([20, 18, 30, 118], fill='#2c6bff')
    d.text((44, 30), text, fill='#1f2d3d', font=f)
    d.text((44, 78), sub, fill='#5b6676', font=fs)


gate = {g['id']: g for g in D['surface']['west']['gates']}
st = lambda lv: next(l for l in D['levels'] if l['id'] == lv)['stallCount']

# Per view: title, subtitle, and labels as ((x, z), text, kind, dx, dy); dx/dy offset the pill from its anchor in pixels.
LABELS = {
 '01': ('一期 B1 · -8.4m', f'{st("P1-B1"):,} 个车位 · 车位 2.5×5.0m · 主车道 6m · 柱网 8m', [
   (mid('P1-N-IN', 'P1-N-OUT'), '方庭北口 入/出 ↑北外环 60m·14%', 'street', 30, -70),
   (mid('P1-E-IN', 'P1-E-OUT'), '星湾东口 入/出 ↑星湾路 56m·15%', 'street', -40, -90),
   (mid('P1-DN', 'P1-UP'), '中庭坡道 ↕ 一期 B2（-12m）', 'inner', 40, 60),
   (mid('P1-SHARED-N-DN', 'P1-SHARED-N-UP'), '北侧坡道 ↕ 一期 B2', 'inner', 30, 70),
   ((-286, -179), '← 跨西外环隧道 → 西库 B2', 'vehicle', 40, -60),
   ((-207, -81.2), '← 酒店 B2（平层车行）', 'vehicle', 40, 70),
   ((-57, -173.5), '公寓 B2（平层车行）→', 'vehicle', -40, 70)]),
 '02': ('一期 B2 · -12m', f'{st("P1-B2"):,} 个车位 · 只经两对坡道与一期 B1 相连', [
   (mid('P1-DN', 'P1-UP'), '中庭坡道 ↕ 一期 B1（-8.4m）', 'inner', 40, 60),
   (mid('P1-SHARED-N-DN', 'P1-SHARED-N-UP'), '北侧坡道 ↕ 一期 B1', 'inner', 30, 70)]),
 '03': ('西侧公共车库 B1 · -4.5m', f'{st("WPG-B1"):,} 个车位 · 两处坡道直通地面停车场', [
   (mid('WPG-IN', 'WPG-OUT'), '西北公共口 入/出 ↑地面停车场', 'street', 40, 40),
   (mid('WPG-SOUTH-IN', 'WPG-SOUTH-OUT'), '西南公共口 入/出 ↑地面停车场', 'street', 40, 60),
   (mid('WPG-DN', 'WPG-UP'), '坡道 ↕ 西库 B2', 'inner', 40, -60),
   (mid('WPG-SHARED-DN', 'WPG-SHARED-UP'), '共享坡道 ↕ 西库 B2', 'inner', 30, -60),
   ((-301, -200), '步行连廊 → 一期 B1M', 'walk', -40, -70)]),
 '04': ('西侧公共车库 B2 · -8.4m', f'{st("WPG-B2"):,} 个车位 · 与一期 B1 同标高', [
   (mid('WPG-DN', 'WPG-UP'), '坡道 ↕ 西库 B1（-4.5m）', 'inner', 40, -60),
   (mid('WPG-SHARED-DN', 'WPG-SHARED-UP'), '共享坡道 ↕ 西库 B1', 'inner', 30, -60),
   ((-301, -179), '跨西外环隧道 → 一期 B1', 'vehicle', -40, 70)]),
 '05': ('-8.4m 层：平层互通', '一期 B1 · 西库 B2 · 酒店 B2 · 公寓 B2 同在 -8.4m，经隧道与连接道直接开车互通', [
   ((-391, -60), '西侧公共车库 B2', 'name', 0, 0),
   ((-203, -124), '一期 B1', 'name', 0, 0),
   ((-293, -179), '跨西外环车行隧道', 'vehicle', 20, -90),
   ((-207, -81.2), '酒店 B2 ↔ 一期 B1', 'vehicle', 40, 80),
   ((-57, -173.5), '公寓 B2 ↔ 一期 B1', 'vehicle', -30, 90),
   (mid('P1-N-IN', 'P1-N-OUT'), '↑北外环', 'street', 20, -55),
   (mid('P1-E-IN', 'P1-E-OUT'), '↑星湾路', 'street', 30, 60),
   (mid('P1-DN', 'P1-UP'), '↓一期 B2', 'inner', 30, 50),
   (mid('P1-SHARED-N-DN', 'P1-SHARED-N-UP'), '↓一期 B2', 'inner', 20, 55),
   (mid('WPG-DN', 'WPG-UP'), '↑西库 B1', 'inner', 30, -45),
   (mid('WPG-SHARED-DN', 'WPG-SHARED-UP'), '↑西库 B1', 'inner', -30, -45),
   (mid('H-DN', 'H-UP'), '↑酒店 B1', 'inner', -30, 55),
   (mid('A-DN', 'A-UP'), '↑公寓 B1', 'inner', 30, 40)]),
 '06': ('-4.5m 层：步行为主', '西库 B1 · 酒店 B1 · 公寓 B1 停车；一期 B1M 是美食广场与地铁站厅，只走人', [
   ((-430, -236), '西侧公共车库 B1', 'name', 0, 0),
   ((-176, -142), '一期 B1M 美食 · 地铁', 'name', 0, 0),
   ((-292, -200), '步行连廊 西库 ↔ B1M', 'walk', 10, -80),
   ((-208.5, -81.2), '酒店 B1 ↔ B1M 步行', 'walk', 40, 60),
   ((-46, -173.5), '公寓 B1 ↔ B1M 步行', 'walk', 20, 60),
   (mid('WPG-IN', 'WPG-OUT'), '西北公共口 ↑地面', 'street', 30, 40),
   (mid('WPG-SOUTH-IN', 'WPG-SOUTH-OUT'), '西南公共口 ↑地面', 'street', 30, 50),
   (mid('H-IN', 'H-OUT'), '酒店南口 ↑西外环', 'street', 40, 40),
   (mid('A-IN', 'A-OUT'), '公寓北口 ↑北外环', 'street', -20, 55),
   (mid('H-DN', 'H-UP'), '↓酒店 B2', 'inner', 40, -40),
   (mid('A-DN', 'A-UP'), '↓公寓 B2', 'inner', -30, 50)]),
 '17': ('西侧地面停车场', f'{D["surface"]["west"]["stallCount"]} 个车位（充电 {D["surface"]["west"]["evCount"]} · 无障碍 {D["surface"]["west"]["accessibleCount"]}）· 6 个车行口', [
   ((gate['WP-G1']['x'], gate['WP-G1']['z']), '北口 ↔ 西外环', 'gate', -30, 50),
   ((gate['WP-G2']['x'], gate['WP-G2']['z']), '中央口 ↔ 西外环', 'gate', -30, 50),
   ((gate['WP-G3']['x'], gate['WP-G3']['z']), '南口 ↔ 西外环', 'gate', -30, -50),
   ((gate['WP-G4']['x'], gate['WP-G4']['z']), '北环西口（新增）', 'gate', 10, 60),
   ((gate['WP-G5']['x'], gate['WP-G5']['z']), '北环东口（新增）', 'gate', 20, 110),
   ((gate['WP-G6']['x'], gate['WP-G6']['z']), '大道口（新增）', 'gate', 20, -60),
   (mouth('WPG-IN', 'WPG-OUT'), '西北公共口 ↓西库 B1', 'street', 30, 30),
   (mouth('WPG-SOUTH-IN', 'WPG-SOUTH-OUT'), '西南公共口 ↓西库 B1', 'street', 30, -50)]),
}

out.mkdir(parents=True, exist_ok=True)
for key, (t, sub, labels) in LABELS.items():
    v = VIEWS[key]
    im = Image.open(raw / f'{v["name"]}.jpg').convert('RGB')
    d = ImageDraw.Draw(im)
    size = 24 if v['w'] >= 1600 else 22
    for (x, z), text, kind, dx, dy in labels:
        px, py = project(v, x, z)
        if kind == 'name': pill(d, px, py, text, COL[kind], size + 6, dx, 0, anchor=False)
        else: pill(d, px, py, text, COL[kind], size, dx, dy)
    title(d, t, sub)
    im.save(out / f'{v["name"]}-labeled.jpg', quality=86)
    print('labeled', v['name'])
