// 超级商业中心（游览模式）第一步：方庭、西北翼、圆厅之间补两块楼面（A、B），三处中庭连成一个大中庭。
// 用户的要求：「和方庭连在一起，要有一眼望到头的感觉，开口要很大」。做法：
//   · A（方庭东边、北翼西边）、B（西北翼南边、西翼北边）两块并进一期 1F–6F 和屋面（地下室不动）；
//   · 2F–6F 的洞口 = 圆厅洞口 + 一段「颈」（圆厅到西北翼）+ 西北翼上一个大椭圆（往 A 那边鼓出去）+ 方庭洞口，合成一个；
//     椭圆每层往外退，6F 约 72×56 米；避开北翼的口袋楼梯（N-PSR、N-ST）和西北翼楼梯（NW-ST）；
//   · 椭圆里原来的西北翼铺位、卫生间去掉；西北翼两部客梯只到 1F；原来的西北翼扶梯（K7、K8）换成 A 里的一组交叉扶梯（p1-expansion-spec.js）。
// 坐标：西北翼局部坐标（NW 翼 frame：原点圆厅圆心、u 沿 225° 朝方庭，v 正向朝北翼一侧 = A、负向 = B）。
import clipping from 'polygon-clipping';
import { frame, toW } from './geom.js';

export const NW_FRAME = frame(-106, -106, 225, 'P1-NW-MEGA');
/** 新增楼面（世界坐标），按 polygon-clipping 算出的空地取整 */
export const INFILL = {
  A: [[-160, -207], [-104, -207], [-102.9, -196.3], [-105.4, -197], [-117.9, -150.4], [-160, -192.5]],
  B: [[-210, -160], [-192.5, -160], [-150.4, -117.9], [-204.7, -103.4], [-203.8, -100], [-210, -100]],
};
/** 大椭圆（西北翼局部）：圆心、每层的半长（沿 u）和半宽（沿 v） */
export const MEGA_OVAL = { u: 82, v: 11, steps: { '2F': [28, 16], '3F': [30, 19], '4F': [32, 22], '5F': [34, 25], '6F': [36, 28] } };
/** 圆厅到大椭圆的「颈」：u 20–52，半宽（避开北翼口袋楼梯 v≥13.6） */
export const MEGA_NECK = { u0: 20, u1: 52, steps: { '2F': 6, '3F': 7, '4F': 8, '5F': 9, '6F': 9 } };
const UPPER = ['2F', '3F', '4F', '5F', '6F'];
const ABOVE = ['1F', ...UPPER, 'RF'];

const snap = (p) => p.map(([x, z]) => [Math.round(x * 1e4) / 1e4, Math.round(z * 1e4) / 1e4]);
const close0 = (p) => (p.length && (p[0][0] !== p.at(-1)[0] || p[0][1] !== p.at(-1)[1]) ? [...p, p[0]] : p);
const close = (p) => close0(snap(p));
const open = (p) => p.slice(0, -1);
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a / 2; };
const nw = (u, v) => toW(NW_FRAME, u, v);

export function megaVoidParts(short) {
  const [a, b] = MEGA_OVAL.steps[short], h = MEGA_NECK.steps[short];
  const oval = Array.from({ length: 64 }, (_, i) => { const t = (i / 64) * Math.PI * 2; return nw(MEGA_OVAL.u + a * Math.cos(t), MEGA_OVAL.v + b * Math.sin(t)); });
  const neck = [[MEGA_NECK.u0, -h], [MEGA_NECK.u1, -h], [MEGA_NECK.u1, h], [MEGA_NECK.u0, h]].map(([u, v]) => nw(u, v));
  return { oval, neck };
}

/** 多边形集合 → 不带洞的简单多边形（带洞的块从洞的中线竖切开） */
function noHoles(mp, depth = 0) {
  const out = [];
  for (const poly of mp) {
    if (poly.length === 1 || depth > 8) { const p = open(poly[0]); if (Math.abs(area(p)) >= 1) out.push(p); continue; }
    const xs = poly[1].map((q) => q[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const zs = poly[0].map((q) => q[1]), z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1, xa = Math.min(...poly[0].map((q) => q[0])) - 1, xb = Math.max(...poly[0].map((q) => q[0])) + 1;
    for (const half of [[[xa, z0], [cx, z0], [cx, z1], [xa, z1]], [[cx, z0], [xb, z0], [xb, z1], [cx, z1]]]) out.push(...noHoles(clipping.intersection([poly], [close(half)]), depth + 1));
  }
  return out;
}
const INFILL_BOX = (() => { const pts = [...INFILL.A, ...INFILL.B]; return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; })();
const bboxHit = (p, [x0, z0, x1, z1]) => p.some(([x, z]) => x >= x0 && x <= x1 && z >= z0 && z <= z1) || (Math.min(...p.map((q) => q[0])) < x1 && Math.max(...p.map((q) => q[0])) > x0 && Math.min(...p.map((q) => q[1])) < z1 && Math.max(...p.map((q) => q[1])) > z0);
const inside = ([x, z], P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const hit = (a, b) => clipping.intersection([[close(a)]], [[close(b)]]).length > 0;

export function applyP1Mega(layout) {
  const P1 = layout.buildings.find((b) => b.id === 'P1');
  if (!P1) return layout;
  const infill = [INFILL.A, INFILL.B].map(close);
  // 楼栋外轮廓（总图、立面、屋面都用它）
  P1.outline = open(clipping.union([[close(P1.outline)]], ...infill.map((p) => [p]))[0][0]);
  for (const lv of layout.levels.filter((l) => l.building === 'P1' && ABOVE.includes(l.short))) {
    const before = lv.outline;
    const merged = clipping.union([[close(lv.outline)]], ...infill.map((p) => [p]));
    lv.outline = open(merged.sort((x, y) => Math.abs(area(open(y[0]))) - Math.abs(area(open(x[0]))))[0][0]);
    let holes = [], removed = [];
    if (UPPER.includes(lv.short)) {
      const { oval, neck } = megaVoidParts(lv.short);
      const old = lv.voids.filter((v) => v.id === 'C-void' || v.id === 'SQ-void');
      const parts = [...old.map((v) => close(v.poly)), close(oval), close(neck)];
      const u = clipping.union(...parts.map((p) => [[p]]));
      const deck = old.find((v) => v.id === 'SQ-void')?.deck || null;
      lv.voids = lv.voids.filter((v) => v.id !== 'C-void' && v.id !== 'SQ-void');
      // 合起来的洞口可能是一块，也可能还分成几块（低层的方庭、圆厅洞口还没连上椭圆）：每块单独一个记录，
      // 含圆厅圆心的叫 C-void，含方庭中心的叫 SQ-void（两个都含就叫 C-void），其余叫 MEGA-void
      const rc = toW(NW_FRAME, 0, 0), sc = [-220, -200];
      u.forEach((piece, i) => {
        const poly = open(piece[0]);
        const hasC = inside(rc, poly), hasS = inside(sc, poly);
        const id = hasC ? 'C-void' : hasS ? 'SQ-void' : `MEGA-void${i ? `-${i}` : ''}`;
        lv.voids.push({ id, kind: 'atrium', poly, frame: NW_FRAME, mega: true, square: hasS, deck: hasS ? deck : null });
        holes.push(poly);
      });
      const poly = holes[0];
      // 洞口里的铺位、卫生间、客梯厅去掉
      removed = lv.units.filter((x) => x.polys.some((p) => holes.some((h) => hit(p, h))));
      lv.units = lv.units.filter((x) => !removed.includes(x));
      lv.rooms = (lv.rooms || []).filter((r) => !(['NW-core', 'NW-wc'].includes(r.id)));
    }
    lv.slab = { pieces: [{ outer: lv.outline, holes: lv.voids.map((v) => v.poly) }] };
    // 走道：原来的走道减去洞口，再加上 A、B 两块（减去洞口、铺位、井道、扶梯开洞）
    const cut = [...holes, ...lv.voids.filter((v) => v.kind === 'shaft' || v.kind === 'escalator' || v.kind === 'stair').map((v) => v.poly),
      ...lv.units.flatMap((x) => x.polys)];
    const walk = [];
    for (const w of lv.walk) {
      if (!holes.length || !holes.some((h) => hit(w.poly, h))) { walk.push(w); continue; }
      noHoles(clipping.difference([[close(w.poly)]], ...holes.map((h) => [[close(h)]]))).forEach((p, i) => walk.push({ ...w, id: `${w.id}-m${i}`, poly: p, rect: undefined, lpoly: undefined }));
    }
    // 原来的走道都在改造前的楼层轮廓里，新走道 = A、B − 原轮廓 − 洞口、铺位、井道
    // 一块一块减（一次减几百个多边形 polygon-clipping 容易算不出来）；只减和 A、B 有交的
    let add = clipping.difference(clipping.union(...infill.map((p) => [p])), [[close(before)]]);
    // 去掉的铺位原地变成走道（铺位里原来没有走道）
    for (const x of removed) for (const p of x.polys) { try { add = clipping.union(add, [[close(p)]]); } catch { /* 跳过 */ } }
    for (const r of (lv.rooms || []).filter((q) => q._megaRemoved)) for (const p of r._megaRemoved) { try { add = clipping.union(add, [[close(p)]]); } catch { /* 跳过 */ } }
    for (const c of cut) {
      if (!bboxHit(c, INFILL_BOX)) continue;
      try { add = clipping.difference(add, [[close(c)]]); } catch { /* 极少数共线边算不出来：跳过这一块，走道略大一点 */ }
    }
    noHoles(add).forEach((p, i) => walk.push({ id: `P1-mega-${lv.short}-${i}`, kind: lv.kind === 'roof' ? 'deck' : 'atrium', poly: p, frame: NW_FRAME, mega: true }));
    lv.walk = walk;
  }
  // 西北翼两部客梯：洞口里只到 1F
  for (const e of layout.elevators.filter((q) => q.id === 'P1-NW-L1' || q.id === 'P1-NW-L2')) e.serves = e.serves.filter((id) => !UPPER.some((s) => id === `P1-${s}`) && id !== 'P1-RF');
  layout.fidelity = { ...(layout.fidelity || {}), mega: { version: 1 } };
  return layout;
}

