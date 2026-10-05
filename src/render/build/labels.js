// 标注（数据驱动）：屏幕恒定大小的文字精灵（入口、扶梯、观光梯、客梯、洗手间、安全出口、车库、天台打卡点等），
// 爆炸视图的楼层名，园区视角的各期名称与入口。
import * as THREE from 'three';
import { labelTexture } from '../textures.js';
import { toW } from '../../layout/geom.js';

const cache = new Map();
const STYLE = {
  facility: { bg: 'rgba(24,30,36,0.9)', accent: '#7fd3ff' },
  wc: { bg: 'rgba(24,30,36,0.9)', accent: '#ffffff' },
  entrance: { bg: 'rgba(15,111,134,0.95)', accent: '#bff3ff' },
  parking: { bg: 'rgba(29,78,216,0.95)', accent: '#ffffff' },
  food: { bg: 'rgba(180,83,9,0.95)', accent: '#ffe7b0' },
  fun: { bg: 'rgba(106,63,181,0.95)', accent: '#f5d0fe' },
  exit: { bg: 'rgba(15,138,74,0.95)', accent: '#ffffff' },
  title: { bg: 'rgba(20,26,32,0.92)', accent: '#ffc83d' },
};

export function sprite(text, style = 'facility', icon = null, sub = null, size = 0.026) {
  const key = `${text}|${style}|${icon}|${sub}`;
  if (!cache.has(key)) {
    const s = STYLE[style];
    const { texture, aspect } = labelTexture(text, { bg: s.bg, accent: s.accent, icon, sub });
    cache.set(key, { mat: new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }), aspect });
  }
  const { mat, aspect } = cache.get(key);
  const sp = new THREE.Sprite(mat);
  sp.center.set(0.5, 0);
  const h = sub ? size * 1.3 : size;
  sp.scale.set(h * aspect, h, 1);
  sp.renderOrder = 20;
  sp.layers.set(1); // 标注在泛光之后单独渲染，保持清晰
  return sp;
}

const FEATURE_LABEL = {
  ferris: ['fun', 'wheel', 4.2], ip: ['fun', 'star', 8.6], mirror: ['fun', 'star', 2.2], skywalk: ['fun', 'star', 2.4],
  letters: ['fun', 'star', 5.6], arch: ['fun', 'star', 4.0], playground: ['fun', 'star', 3.0], pavilion: ['facility', 'escalator', 5.2],
  track: ['fun', 'star', 2.4], court: ['fun', 'star', 4.4], lawn: ['fun', 'star', 1.6],
  'cinema-open': ['fun', 'star', 10.5], farm: ['fun', 'star', 5.0], viewdeck: ['fun', 'star', 3.0],
  plaza: ['fun', 'star', 7.5], stage: ['fun', 'star', 6.2], fountain: ['fun', 'star', 3.4], grove: ['fun', 'star', 6.5],
};

export function buildLabels(ctx) {
  const { layout } = ctx;
  const put = (group, text, x, y, z, style, icon, sub, size) => {
    const s = sprite(text, style, icon, sub, size);
    s.position.set(x, y, z);
    group.add(s);
    return s;
  };
  // 同一期的入口、出口坡道并排，标注沿两条车道的连线方向各自外移，避免重叠
  const rampOffset = (r) => {
    const other = layout.ramps.find((x) => x.building === r.building && x !== r && x.type.startsWith('street'));
    if (!other) return [0, 0];
    const c = (q) => [(q.from.x + q.to.x) / 2, (q.from.z + q.to.z) / 2];
    const a = c(r), b = c(other);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    return [((a[0] - b[0]) / d) * 7, ((a[1] - b[1]) / d) * 7];
  };
  const featurePos = (f) => (f.rect ? toW(f.frame, (f.rect.x0 + f.rect.x1) / 2, (f.rect.z0 + f.rect.z1) / 2) : toW(f.frame, f.lu, f.lv));
  for (const lv of layout.levels) {
    const L = ctx.levels[lv.id];
    const G = L.labels;
    const y = lv.elev;
    const short = (id) => ctx.lvById[id].short;
    // 扶梯（每对一个）
    const pairs = new Map();
    for (const e of layout.escalators) if (e.from === lv.id || e.to === lv.id) pairs.set(e.pair, e);
    for (const e of pairs.values()) {
      const going = e.from === lv.id;
      const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
      const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
      const p = going ? [e.bottom.x - ux * 3.2, e.bottom.z - uz * 3.2] : [e.top.x + ux * 3.2, e.top.z + uz * 3.2];
      put(G, going ? `扶梯 ↑ ${short(e.to)}` : `扶梯 ↓ ${short(e.from)}`, p[0], y + 2.6, p[1], 'facility', 'escalator');
    }
    // 观光梯、客梯（每个核心筒一个）
    for (const g of layout.elevators.filter((e) => e.type === 'glass' && e.serves.includes(lv.id))) put(G, '观光电梯', g.x, y + 3.4, g.z, 'facility', 'lift');
    for (const e of layout.elevators.filter((x) => x.exterior && x.serves.includes(lv.id))) {
      const [x, z] = toW(e.frame, e.lu - 3.2, e.lv);
      put(G, '客梯', x, y + 3.4, z, 'facility', 'lift', `${short(e.serves[0])}–${short(e.serves[e.serves.length - 1])}`);
    }
    for (const r of lv.rooms.filter((m) => m.type === 'stair' && /-KS\d$/.test(m.id))) {
      const d = r.wdoors[0];
      const t = lv.kind === 'parking' ? ['楼梯 → 街区', 'exit', 'exit'] : ['地库出入口', 'parking', 'parking'];
      put(G, t[0], (d.x0 + d.x1) / 2 + d.nx * 1.4, y + (lv.kind === 'parking' ? 2.4 : 4.6), (d.z0 + d.z1) / 2 + d.nz * 1.4, t[1], t[2], null, 0.02);
    }
    for (const e of layout.elevators.filter((x) => x.type === 'passenger' && x.serves.includes(lv.id) && x.id.endsWith('L1'))) {
      const s = e.door === 'N' ? -1 : 1;
      const [x, z] = toW(e.frame, e.lu + 1.5, e.lv + s * 3.2);
      put(G, '客梯', x, y + 3.6, z, 'facility', 'lift', `${short(e.serves[0])}–${short(e.serves[e.serves.length - 1])}`);
    }
    // 洗手间
    for (const r of lv.rooms.filter((m) => m.type === 'wc')) {
      const d = r.wdoors[0];
      put(G, '洗手间', (d.x0 + d.x1) / 2 + d.nx * 1.2, y + 2.2, (d.z0 + d.z1) / 2 + d.nz * 1.2, 'wc', 'wc');
    }
    // 端部楼梯（安全出口）
    for (const r of lv.rooms.filter((m) => m.type === 'stair' && /-ST[LR]$/.test(m.id))) {
      const d = r.wdoors[0];
      put(G, '安全出口', (d.x0 + d.x1) / 2 + d.nx * 0.8, y + 2.4, (d.z0 + d.z1) / 2 + d.nz * 0.8, 'exit', 'exit', null, 0.018);
    }
    // 入口
    for (const e of layout.entrances.filter((x) => x.level === lv.id)) {
      const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
      put(G, e.name, mx - e.nx * 4, y + 3.2, mz - e.nz * 4, 'entrance', 'info');
    }
    // 美食层
    if (lv.kind === 'food') {
      for (const w of lv.walk.filter((x) => x.kind === 'foodcourt').slice(0, 1)) {
        const r = ctx.bById[lv.building].rotundas.find((x) => x.id === w.rot);
        put(G, '美食广场', r.x, y + 3.6, r.z, 'food', 'food', 'FOOD COURT');
      }
      const old = lv.units.find((u) => u.style === 'oldstreet');
      if (old) {
        const w = ctx.bById[lv.building].wings.find((x) => x.id === old.wing);
        const [x, z] = toW(w.F, (w.u0 + w.uEnd) / 2, 0);
        put(G, '云澜老街', x, y + 3.6, z, 'food', 'food', 'OLD STREET');
      }
    }
    // 三期街巷：广场、舞台、水景；屋顶露台酒吧
    if (lv.kind === 'street') {
      for (const f of lv.features) {
        const m = FEATURE_LABEL[f.type];
        if (m && f.name) put(G, f.name, f.x, y + m[2], f.z, m[0], m[1], f.en || null, 0.022);
      }
      for (const u of lv.units.filter((x) => x.style === 'pavilion')) {
        const [x, z] = toW(u.frame, (u.rects[0].x0 + u.rects[0].x1) / 2, (u.rects[0].z0 + u.rects[0].z1) / 2);
        put(G, u.brand.name, x, y + 5.0, z, 'food', 'cup', u.brand.en, 0.022);
      }
    }
    // 停车层
    if (lv.kind === 'parking') {
      const b = ctx.bById[lv.building];
      if (b.kind === 'street') for (const [zone, x] of [['G', -188], ['H', -91]]) put(G, `${lv.short} · ${zone}区`, x, y + 2.6, 112, 'parking', 'parking');
      if (b.square) {
        const [x, z] = toW(b.square.F, 0, 0);
        put(G, `${lv.short} · ${b.square.zone}区`, x, y + 2.6, z, 'parking', 'parking');
      }
      for (const w of b.wings) {
        if (w.link) continue;
        const [x, z] = toW(w.F, (w.u0 + w.uEnd - 12) / 2, 15);
        put(G, `${lv.short} · ${w.zone || w.id}区`, x, y + 2.6, z, 'parking', 'parking');
      }
      for (const r of layout.ramps.filter((x) => x.building === lv.building)) {
        const [ox, oz] = rampOffset(r);
        if (r.type === 'street-in' && r.to.level === lv.id) put(G, '车库入口 ↓', r.to.x + ox, y + 3.2, r.to.z + oz, 'parking', 'parking', 'ENTRANCE');
        if (r.type === 'street-out' && r.from.level === lv.id) put(G, '车库出口 ↑', r.from.x + ox, y + 3.2, r.from.z + oz, 'parking', 'parking', 'EXIT');
        if (r.type === 'down' && r.from.level === lv.id) put(G, `下行至 ${short(r.to.level)}`, r.from.x, y + 2.6, r.from.z, 'parking', 'parking');
        if (r.type === 'up' && r.from.level === lv.id) put(G, `上行至 ${short(r.to.level)}`, r.from.x, y + 2.6, r.from.z, 'parking', 'parking');
      }
      for (const w of lv.walk.filter((x) => x.kind === 'eschall')) {
        const [x, z] = toW(w.frame, (w.rect.x0 + w.rect.x1) / 2, 0);
        put(G, '扶梯 → 美食广场', x, y + 2.2, z, 'food', 'escalator');
      }
      const ev = lv.parking.stalls.filter((s) => s.type === 'ev');
      if (ev.length) put(G, '充电车位', ev[0].x, y + 2.0, ev[0].z, 'exit', 'parking', 'EV', 0.02);
    }
    // 天台
    if (lv.kind === 'roof') {
      for (const f of lv.features) {
        const m = FEATURE_LABEL[f.type];
        if (!m || !f.name) continue;
        const [x, z] = featurePos(f);
        put(G, f.name, x, y + m[2], z, m[0], m[1], f.en || null);
      }
      for (const u of lv.units) {
        const [x, z] = toW(u.frame, (u.rects[0].x0 + u.rects[0].x1) / 2, (u.rects[0].z0 + u.rects[0].z1) / 2);
        put(G, u.brand.name, x, y + 5.0, z, 'food', 'cup', u.brand.en, 0.022);
      }
    }
    // 爆炸视图楼层名
    const b = ctx.bById[lv.building];
    const lw = b.wings[0];
    const [tx, tz] = lw ? toW(lw.F, lw.uEnd + 8, -26) : [Math.max(...b.outline.map((p) => p[0])) + 14, Math.min(...b.outline.map((p) => p[1]))];
    const title = put(L.group, `${lv.short}  ${lv.theme.label.split(' · ').slice(0, 2).join(' · ')}`, tx, y + 2, tz, 'facility', null, null, 0.03);
    title.visible = false;
    L.title = title;
  }
  // 园区视角：各期名称、入口、车库
  const S = ctx.site.labels;
  for (const b of layout.buildings) {
    const top = Math.max(...layout.levels.filter((l) => l.building === b.id).map((l) => l.elev));
    put(S, b.name, b.center[0], top + 26, b.center[1], 'title', 'star', b.en, 0.03);
  }
  for (const e of layout.entrances.filter((x) => x.to === 'site')) {
    const mx = (e.seg.x0 + e.seg.x1) / 2, mz = (e.seg.z0 + e.seg.z1) / 2;
    put(S, e.name, mx + e.nx * 6, 6.5, mz + e.nz * 6, 'entrance', 'info', null, 0.022);
  }
  for (const r of layout.ramps.filter((x) => x.type === 'street-in')) {
    const [ox, oz] = rampOffset(r);
    put(S, '车库入口', r.from.x + ox, 6, r.from.z + oz, 'parking', 'parking', 'P · IN', 0.022);
  }
  for (const r of layout.ramps.filter((x) => x.type === 'street-out')) {
    const [ox, oz] = rampOffset(r);
    put(S, '车库出口', r.to.x + ox, 6, r.to.z + oz, 'parking', 'parking', 'P · OUT', 0.022);
  }
  // 天桥、落地塔、公园与地铁口
  const br = layout.bridges;
  if (br) {
    put(S, '云环天桥', 0, br.y + 9, -br.R, 'title', 'star', 'SKY RING', 0.026);
    for (const t of br.towers) put(S, t.name, t.center[0], br.y + 7, t.center[1], 'facility', 'escalator', '楼梯 · 扶梯 · 电梯', 0.02);
  }
  const pk = layout.site.park;
  if (pk) {
    put(S, '中央公园', pk.center[0], 16, pk.center[1], 'title', 'star', 'CENTRAL PARK', 0.03);
    put(S, pk.metro.name, pk.metro.x, 7, pk.metro.z, 'entrance', 'info', 'METRO', 0.022);
  }
}
