// 零点突围的弹药补给：枪里的备弹打完就没有了，只能从这几处补——
//   ① 击倒的武装分子掉弹匣（走过去自动捡，+30；弹药越少掉得越勤）；
//   ② 地图上十来个绿色弹药箱（走到跟前自动打开，+90，每局每箱一次；弹药不多时 HUD 上标出最近的三个）；
//   ③ 每完成一个目标 +30（中继机柜、证物箱里都有备用弹匣）；
//   ④ 坐载具时用车载机枪（直升机舱门机枪 / 装甲车车顶机枪），弹药不限、只会过热，不补也不耗步枪弹药。
// 备弹上限 300。第一次弹药见底时无线电提醒一次。
import * as THREE from 'three';
import { landAt, clear } from '../layout/nav.js';

export const AMMO = Object.freeze({ drop: 30, crate: 90, objective: 30, siegeObjective: 10, cap: 300, low: 60, pickupR: 1.5, crateR: 1.9, dropLife: 45 });

/** 弹药箱放在这些地方附近（找最近的一块空地）：一期各层中庭边、地下大厅、酒店、公寓、两个撤离点旁边 */
export const CRATE_SEEDS = Object.freeze([
  { floor: 'P1-1F', x: -150, z: -100 }, { floor: 'P1-1F', x: -205, z: -75 }, { floor: 'P1-1F', x: -95, z: -150 },
  { floor: 'P1-B1M', x: -140, z: -90 }, { floor: 'P1-2F', x: -130, z: -112 }, { floor: 'P1-3F', x: -165, z: -120 },
  { floor: 'H-1F', x: -247, z: -76 }, { floor: 'H-4F', x: -240, z: -86 }, { floor: 'A-1F', x: -35, z: -214 },
  { floor: 'A-B1', x: -46, z: -224 }, { floor: 'P1-RF', x: -172, z: -126 },
]);

/** 每个种子点附近找一块 1.2 米见方都空着的地方；找不到就不放 */
export function crateSites(layout, nav) {
  const out = [];
  for (const s of CRATE_SEEDS) {
    const lv = layout.levels.find((l) => l.id === s.floor);
    if (!lv) continue;
    const ok = (x, z) => { const st = landAt(nav, x, z, lv.elev + 0.6); return st && st.floor === s.floor && clear(nav, st); };
    let hit = null;
    for (let r = 0; r <= 10 && !hit; r += 1) for (let k = 0; k < Math.max(1, r * 8) && !hit; k++) {
      const a = (k / Math.max(1, r * 8)) * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      if ([[0, 0], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]].every(([dx, dz]) => ok(x + dx, z + dz))) hit = { floor: s.floor, x, z, y: lv.elev };
    }
    if (hit) out.push({ id: `ammo-${out.length}`, ...hit });
  }
  return out;
}

// ---- 模型 ----
let MATS = null;
function mats(G) {
  if (MATS) return MATS;
  const get = (name, fb) => { try { return G?.mats?.get?.(name, { triplanar: true }) || fb; } catch { return fb; } };
  MATS = {
    olive: get('hull_paint', new THREE.MeshStandardMaterial({ color: '#4b5a37', roughness: 0.7, metalness: 0.2 })),
    metal: get('steel_worn', new THREE.MeshStandardMaterial({ color: '#7c8286', roughness: 0.45, metalness: 0.8 })),
    dark: get('anodized_black', new THREE.MeshStandardMaterial({ color: '#1b1d1f', roughness: 0.5, metalness: 0.5 })),
    brass: get('brass', new THREE.MeshStandardMaterial({ color: '#c9a04a', roughness: 0.3, metalness: 0.9 })),
    fabric: get('glove_fabric', new THREE.MeshStandardMaterial({ color: '#5a6040', roughness: 0.95, metalness: 0 })),
    paint: new THREE.MeshStandardMaterial({ color: '#3f4d2e', roughness: 0.65, metalness: 0.25 }),
    label: new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.8, metalness: 0 }),
    glow: new THREE.MeshBasicMaterial({ color: '#7dffb0', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  };
  return MATS;
}
function labelTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#3f4d2e'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#e3c84a'; g.fillRect(0, 70, 256, 14);
  g.fillStyle = '#e8e2c8'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('弹药 7.62', 128, 46);
  g.font = 'bold 14px monospace'; g.fillText('CTG BALL M80 · 900 RDS', 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const box = (g, w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };

/** 绿色弹药箱：箱体、两侧提手、铰链盖（打开时掀起）、正面黄色标签，里面一排弹链 */
function crateModel(G) {
  const M = mats(G), g = new THREE.Group();
  box(g, 0.9, 0.42, 0.5, M.paint, 0, 0.21, 0);
  box(g, 0.92, 0.04, 0.52, M.metal, 0, 0.03, 0);
  const label = box(g, 0.6, 0.22, 0.005, M.label, 0, 0.22, 0.253); label.castShadow = false;
  for (const s of [-1, 1]) { box(g, 0.03, 0.05, 0.22, M.dark, s * 0.465, 0.3, 0); box(g, 0.06, 0.03, 0.03, M.metal, s * 0.3, 0.42, 0.25); }
  for (let k = 0; k < 7; k++) box(g, 0.05, 0.08, 0.38, M.brass, -0.3 + k * 0.1, 0.38, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.42, -0.25); g.add(lid);
  box(lid, 0.92, 0.05, 0.52, M.olive, 0, 0.025, 0.25);
  box(lid, 0.4, 0.03, 0.06, M.dark, 0, 0.06, 0.25);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32), M.glow); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  g.userData = { lid, ring };
  return g;
}
/** 掉落的弹匣：帆布弹匣包 + 两个弧形弹匣，地上一圈淡绿光 */
function dropModel(G) {
  const M = mats(G), g = new THREE.Group();
  box(g, 0.32, 0.1, 0.2, M.fabric, 0, 0.05, 0);
  for (const x of [-0.06, 0.06]) { const m = box(g, 0.075, 0.24, 0.035, M.dark, x, 0.17, 0); m.rotation.z = x * 1.2; box(g, 0.06, 0.02, 0.02, M.brass, x + x * 0.3, 0.29, 0); }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 24), M.glow); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015; g.add(ring);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}

/**
 * 接到游戏上。返回 { reset(), update(dt), crates, drops, markers(), give(n, why) }。
 * isRiding() 为真时（坐在载具上，用车载机枪、弹药不限）不捡地上的东西、不掉弹匣。
 */
export function createAmmoSupply(G, { scene, layout, nav, rng = Math.random, isRiding = () => false, rideKind = () => null }) {
  const root = new THREE.Group(); root.name = '零点突围弹药补给'; scene.add(root);
  const crates = crateSites(layout, nav).map((s) => {
    const model = crateModel(G); model.position.set(s.x, s.y, s.z); model.rotation.y = (s.x * 13 + s.z * 7) % Math.PI; root.add(model);
    return { ...s, model, pos: new THREE.Vector3(s.x, s.y, s.z), opened: false, open: 0 };
  });
  let drops = [], lowSaid = false, markerT = 0, lastLow = null;
  const weapon = () => G.weapon && !G.weapon.stub ? G.weapon : null;
  const total = () => { const w = weapon(); return w ? (w.ammo | 0) + (w.reserve | 0) : 999; };

  function give(n, why) {
    const w = weapon(); if (!w) return 0;
    const add = Math.max(0, Math.min(n, AMMO.cap - (w.reserve | 0)));
    if (add > 0) w.addAmmo(add);
    G.hud?.message?.(add > 0 ? `${why} · 弹药 +${add}` : `${why} · 备弹已满`, 2.2);
    return add;
  }
  function drop(pos) {
    if (drops.length > 24) { drops[0].model.removeFromParent(); drops.shift(); }
    const model = dropModel(G); model.position.set(pos.x, pos.y, pos.z); root.add(model);
    drops.push({ model, pos: pos.clone(), t: 0 });
  }

  G.events.on('enemy:killed', (e) => {
    if (G.game?.state !== 'playing') return;
    if (isRiding()) return; // 坐载具时用车载机枪（弹药不限），不掉弹匣也不补步枪弹药
    // 丧尸围城弹药紧：丧尸身上很少有弹匣（没子弹了才多掉一点），完成一步也只补 10 发
    const siege = !!G.siege?.enabled, chance = siege ? (total() < AMMO.low ? 0.35 : 0.12) : total() < AMMO.low ? 0.9 : 0.55;
    if (e?.pos && rng() < chance) drop(e.pos);
  });
  G.events.on('objective:done', () => give(G.siege?.enabled ? AMMO.siegeObjective : AMMO.objective, '缴获备用弹匣'));

  function reset() {
    for (const d of drops) d.model.removeFromParent();
    drops = []; lowSaid = false; lastLow = null;
    for (const c of crates) { c.opened = false; c.open = 0; c.model.userData.lid.rotation.x = 0; c.model.userData.ring.visible = true; }
  }

  /** HUD 标记：弹药少于 120 发时，标出最近的三个没开过的弹药箱 */
  function markers() {
    const p = G.player?.pos;
    if (!p || total() >= 120) return [];
    return crates.filter((c) => !c.opened).map((c) => ({ c, d: c.pos.distanceTo(p) })).sort((a, b) => a.d - b.d).slice(0, 3)
      .map(({ c }) => ({ id: c.id, short: '弹药', label: '弹药箱', pos: c.pos.clone().setY(c.pos.y + 0.6), kind: 'supply' }));
  }

  function update(dt) {
    const p = G.player?.pos, playing = G.game?.state === 'playing' && G.player?.alive !== false;
    for (const d of drops) { d.t += dt; d.model.children.at(-1).material.opacity = 0.25 + 0.15 * Math.sin(d.t * 4); }
    drops = drops.filter((d) => {
      if (d.t > AMMO.dropLife) { d.model.removeFromParent(); return false; }
      if (playing && p && !isRiding() && Math.hypot(d.pos.x - p.x, d.pos.z - p.z) < AMMO.pickupR && Math.abs(d.pos.y - p.y) < 1.8) { give(AMMO.drop, '捡到弹匣'); d.model.removeFromParent(); return false; }
      return true;
    });
    for (const c of crates) {
      if (c.opened) { c.open = Math.min(1, c.open + dt * 3); c.model.userData.lid.rotation.x = -1.9 * c.open; continue; }
      if (playing && p && !isRiding() && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < AMMO.crateR && Math.abs(c.pos.y - p.y) < 1.8) {
        c.opened = true; c.model.userData.ring.visible = false; give(AMMO.crate, G.actions?.give?.(1) ? '打开弹药箱 · 手雷 +1' : '打开弹药箱'); G.game?.refreshObjective?.();
      }
    }
    if (!playing) return;
    const t = total(), low = t < 120;
    if (!lowSaid && t < AMMO.low && !isRiding()) { lowSaid = true; G.hud?.radio?.('弹药不多了！击倒的敌人会掉弹匣，地图上的绿色弹药箱也能补给。', 4.5); }
    markerT -= dt;
    if (low !== lastLow || (low && markerT <= 0)) { lastLow = low; markerT = 3; G.game?.refreshObjective?.(); }
  }

  return { root, crates, get drops() { return drops; }, reset, update, markers, give,
    dispose() { root.removeFromParent(); } };
}
