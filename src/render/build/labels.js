// 标注：屏幕恒定大小的文字精灵（入口、扶梯、电梯、洗手间、车库、天台打卡点等）与爆炸视图的楼层名。
import * as THREE from 'three';
import { labelTexture } from '../textures.js';
import { CORE_W, CORE_E, SERVICE } from '../../layout/constants.js';

const cache = new Map();
const STYLE = {
  facility: { bg: 'rgba(24,30,36,0.9)', accent: '#7fd3ff' },
  wc: { bg: 'rgba(24,30,36,0.9)', accent: '#ffffff' },
  entrance: { bg: 'rgba(15,111,134,0.95)', accent: '#bff3ff' },
  parking: { bg: 'rgba(29,78,216,0.95)', accent: '#ffffff' },
  food: { bg: 'rgba(180,83,9,0.95)', accent: '#ffe7b0' },
  fun: { bg: 'rgba(106,63,181,0.95)', accent: '#f5d0fe' },
  exit: { bg: 'rgba(15,138,74,0.95)', accent: '#ffffff' },
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

export function buildLabels(ctx) {
  const { layout } = ctx;
  const put = (group, text, x, y, z, style, icon, sub, size) => {
    const s = sprite(text, style, icon, sub, size);
    s.position.set(x, y, z);
    group.add(s);
    return s;
  };
  for (const lv of layout.levels) {
    const G = ctx.levels[lv.id].labels;
    const y = lv.elev;
    // 扶梯
    const pairs = new Map();
    for (const e of layout.escalators) if (e.from === lv.id || e.to === lv.id) pairs.set(e.pair, e);
    for (const e of pairs.values()) {
      const going = e.from === lv.id;
      const ux = Math.sign(e.top.x - e.bottom.x), uz = Math.sign(e.top.z - e.bottom.z);
      const p = going ? [e.bottom.x - ux * 3.2, e.bottom.z - uz * 3.2] : [e.top.x + ux * 3.2, e.top.z + uz * 3.2];
      const other = layout.levels.find((l) => l.id === (going ? e.to : e.from));
      put(G, going ? `扶梯 ↑ ${other.short}` : `扶梯 ↓ ${other.short}`, p[0] + (going ? 0 : 0.01), y + 2.6, p[1], 'facility', 'escalator');
    }
    // 观光梯
    for (const g of layout.elevators.filter((e) => e.type === 'glass' && e.serves.includes(lv.id))) put(G, '观光电梯', g.x, y + 3.4, g.z, 'facility', 'lift');
    // 客梯、货梯、洗手间
    put(G, '客梯', (CORE_W.lobby.x0 + CORE_W.lobby.x1) / 2, y + 3.8, CORE_W.lobby.z1 - 1, 'facility', 'lift', 'B2–RF');
    put(G, '客梯', (CORE_E.lobby.x0 + CORE_E.lobby.x1) / 2, y + 3.8, CORE_E.lobby.z0 + 1, 'facility', 'lift', 'B2–RF');
    if (lv.rooms.some((r) => r.type === 'freight')) put(G, '货梯', (SERVICE.lobby.x0 + SERVICE.lobby.x1) / 2, y + 3.2, SERVICE.lobby.z1 - 1, 'facility', 'lift');
    for (const r of lv.rooms.filter((m) => m.type === 'wc')) {
      const d = r.doors[0];
      put(G, '洗手间', (d.x0 + d.x1) / 2, y + 2.2, (d.z0 + d.z1) / 2 + (d.side === 'S' ? 1 : -1), 'wc', 'wc');
    }
    // 核心筒内的楼梯已有电梯厅标注，只给东西两端的独立楼梯加标注
    for (const r of lv.rooms.filter((m) => m.type === 'stair' && (m.id === 'ST-S4' || m.id === 'ST-S5'))) {
      const d = r.doors[0];
      put(G, '安全出口', (d.x0 + d.x1) / 2, y + 2.4, (d.z0 + d.z1) / 2, 'exit', 'exit', null, 0.018);
    }
    if (lv.id === '1F') {
      for (const e of layout.entrances) {
        const [nx, nz] = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[e.side];
        put(G, e.name, (e.seg.x0 + e.seg.x1) / 2 - nx * 4, y + 3.2, (e.seg.z0 + e.seg.z1) / 2 - nz * 4, 'entrance', 'info');
      }
      put(G, '服务台', 0, 2.6, 31, 'entrance', 'info');
    }
    if (lv.id === 'B1M') {
      put(G, '美食广场', 0, y + 3.6, -10, 'food', 'food', 'FOOD COURT');
      put(G, '云澜老街', -30, y + 3.6, 0, 'food', 'food', 'OLD STREET');
      put(G, '停车场扶梯厅', -16, y + 3.3, -30, 'parking', 'escalator');
    }
    if (lv.kind === 'parking') {
      for (const [t, x, z] of [['A区', -30, -12.5], ['B区', 30, -12.5], ['C区', -30, 12.5], ['D区', 30, 12.5]]) put(G, `${lv.short} · ${t}`, x, y + 2.6, z, 'parking', 'parking');
      put(G, '充电车位', 46, y + 2.0, 26.5, 'exit', 'parking', 'EV', 0.02);
      if (lv.id === 'B1') {
        put(G, '车库入口 ↓', -18, y + 4.5, -49.5, 'parking', 'parking', 'ENTRANCE');
        put(G, '车库出口 ↑', 18, y + 4.5, -49.5, 'parking', 'parking', 'EXIT');
        put(G, '下行至 B2', 52, y + 2.6, -37, 'parking', 'parking');
        put(G, '扶梯 → 美食广场', -13, y + 1.6, -35, 'food', 'escalator');
      } else {
        put(G, '上行至 B1 · 出口', 30, y + 2.6, -33, 'parking', 'parking');
      }
    }
    if (lv.id === 'RF') {
      put(G, '云澜之眼 摩天轮', 42, y + 4.2, 3, 'fun', 'wheel', 'SKY EYE');
      put(G, 'IP「云宝」打卡', 48, y + 8.6, 17, 'fun', 'star');
      put(G, '天空之镜', -4, y + 2.2, -32.5, 'fun', 'star');
      put(G, '玻璃观景台', 0, y + 2.4, 43, 'fun', 'star');
      put(G, '云澜汇立体字', 47, y + 5.6, 35.5, 'fun', 'star');
      put(G, '花艺拱门', -41, y + 4.0, 0, 'fun', 'star');
      put(G, '扶梯 ↓ 3F', -30, y + 5.4, 0, 'facility', 'escalator');
      put(G, '天台儿童乐园', -49, y + 3.0, 14, 'fun', 'star');
      for (const u of lv.units) put(G, u.brand.name, (u.rects[0].x0 + u.rects[0].x1) / 2, y + 5.0, 29, 'food', 'cup', u.brand.en, 0.022);
    }
    // 爆炸视图楼层名
    const title = put(ctx.levels[lv.id].group, `${lv.short}  ${lv.theme.label.split(' · ').slice(0, 2).join(' · ')}`, -66, y + 2, 44, 'facility', null, null, 0.03);
    title.visible = false;
    ctx.levels[lv.id].title = title;
  }
  // 全楼视图：场地标注
  const S = ctx.site.labels;
  for (const e of layout.entrances) {
    const [nx, nz] = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[e.side];
    put(S, e.name, (e.seg.x0 + e.seg.x1) / 2 + nx * 6, 6.5, (e.seg.z0 + e.seg.z1) / 2 + nz * 6, 'entrance', 'info');
  }
  put(S, '车库入口', -66, 6.5, -49.5, 'parking', 'parking', 'P · IN');
  put(S, '车库出口', 66, 6.5, -49.5, 'parking', 'parking', 'P · OUT');
  put(S, '卸货区', 17, 5.5, -50, 'facility', 'info');
  put(S, '天台花园 · 摩天轮', 42, 54, -4, 'fun', 'wheel');
}
