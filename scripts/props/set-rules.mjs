// 成组陈设（口袋休息区的 18 组、家居店的 4 种风格 × 4 个位置）逐组摆出来，按常理检查一遍。
// 纯计算，不读模型文件、不开浏览器：只用运行时目录里每个模型的包围盒。单元测试和 audit-sets.mjs 都用它。
//
// 规则：
//   wall      挂墙的（画、镜子、钟、飞镖盘）背面要贴着展墙，正面朝外
//   support   不落地的东西下面要有承托：台座（程序化的方块）或别的模型
//   overlap   落地的模型之间、模型和台座 / 展墙之间不能互相穿插（椅子塞进桌下 0.32 m 以内算正常）
//   facing    椅子、沙发旁边有桌子就要朝着桌子；有靠背的家具不能背对着看的人
//   extent    一组不能超出它那块地方（口袋 2.5 m × 3.6 m，样板间 2.4 m × 2.6 m），否则会和旁边的东西撞上
import { PROP_ASSETS } from '../../src/render/props/prop-data.js';
import { pocketSet, homeShowroom } from '../../src/render/build/prop-sets.js';

export const SEATS = new Set(['shell_chair', 'dining_chair', 'outdoor_chair', 'cafe_chair', 'cn_armchair', 'green_chair', 'armchair', 'lounge_chair', 'sofa2', 'sofa3', 'sofa_leather', 'cn_sofa']);
export const TABLES = new Set(['cafe_table', 'outdoor_table', 'cafe_table_round', 'dining_table', 'cn_tea_table', 'coffee_table', 'coffee_table_round']);
/** 有明确正反面的大件：背面不该对着看的人。 */
const BACKED = /^(sofa|cn_sofa|shelf_|cn_cabinet|cn_console|screen|clock_tall|armchair|lounge_chair|green_chair|cn_armchair|bench_wood)/;
const PLANT = /^(plant_|flower_)/;
const INFO = new Map(PROP_ASSETS.map((p) => [p.id, p]));

/** 一组陈设各自能占的地方（以这一组的中心为原点的半宽、半深，米）。 */
export const EXTENT = Object.freeze({ pocket: [1.25, 1.8], showroom: [1.2, 1.3] });

function placed(id, x, y, z, ry = 0, scale = 1) {
  const info = INFO.get(id);
  if (!info) throw new Error(`目录里没有模型 ${id}`);
  const s = Array.isArray(scale) ? scale : [scale, scale, scale], cos = Math.cos(ry), sin = Math.sin(ry);
  const at = (lx, lz) => [x + lx * s[0] * cos + lz * s[2] * sin, z - lx * s[0] * sin + lz * s[2] * cos];
  return {
    id, mount: info.mount, x, y, z, ry, scale: s, front: [sin, cos],
    y0: y + info.min[1] * s[1], y1: y + info.max[1] * s[1],
    corners: [at(info.min[0], info.min[2]), at(info.max[0], info.min[2]), at(info.max[0], info.max[2]), at(info.min[0], info.max[2])],
    centre: at((info.min[0] + info.max[0]) / 2, (info.min[2] + info.max[2]) / 2),
  };
}

/** 一个只做记录的批次：记下摆了哪些模型、画了哪些方块。 */
function recorder() {
  const items = [], boxes = [];
  const B = {
    hasProp: () => true,
    blob() {},
    get: () => ({
      box(x, y, z, sx, sy, sz, color, rot = 0) {
        const cos = Math.cos(rot), sin = Math.sin(rot), at = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
        boxes.push({ x, z, y0: y - sy / 2, y1: y + sy / 2, corners: [at(-sx / 2, -sz / 2), at(sx / 2, -sz / 2), at(sx / 2, sz / 2), at(-sx / 2, sz / 2)] });
      },
      cyl() {}, sphere() {},
    }),
    prop(id, x, y, z, ry, scale) { items.push(placed(id, x, y, z, ry, scale)); return true; },
  };
  return { B, items, boxes };
}

/** 把每一组陈设各摆一遍（以原点为这一组的中心，楼面标高 0）。返回 [{ name, kind, view, items, boxes }]。 */
export function themedSets({ clearHeight = 5 } = {}) {
  const out = [];
  const count = pocketSet(recorder().B, 0, 0, 0, 0, -1);
  for (let index = 0; index < count; index++) for (const end of [-1, 1]) {
    const r = recorder();
    pocketSet(r.B, index, 0, 0, 0, end);
    // 摆在 −u 一端的面朝 +u（口袋中间），摆在 +u 一端的面朝 −u
    out.push({ name: `口袋 ${index + 1}${end > 0 ? '（+u 端）' : ''}`, kind: 'pocket', view: [-end, 0], items: r.items, boxes: r.boxes });
  }
  const styles = homeShowroom(() => true, 0, 0, 0, 0, clearHeight);
  for (let variant = 0; variant < styles; variant++) for (let slot = 0; slot < 4; slot++) {
    const items = [];
    // 样板间的摆放函数：face = 0 朝店内（+b），Math.PI 朝门口，Math.PI / 2 朝 +a（和 interiors.js 里的一致）
    homeShowroom((id, a, b, h = 0, face = Math.PI, scale = 1) => { items.push(placed(id, a, h, b, face, scale)); return true; }, variant, slot, 0, 0, clearHeight);
    out.push({ name: `样板间 ${['现代', '中式', '古典', '餐厅'][variant] || variant} · 位置 ${slot + 1}`, kind: 'showroom', view: [0, -1], items, boxes: [], clearHeight });
  }
  return out;
}

const inside = (p, quad) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4], cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
};
/** 两个朝向任意的矩形的最小穿插深度（分离轴）；不相交返回 0。 */
export function penetration(A, B) {
  let best = Infinity;
  for (const P of [A, B]) for (let i = 0; i < 2; i++) {
    const ax = P[i + 1][0] - P[i][0], az = P[i + 1][1] - P[i][1], len = Math.hypot(ax, az) || 1, nx = -az / len, nz = ax / len;
    const proj = (Q) => Q.map(([x, z]) => x * nx + z * nz), a = proj(A), b = proj(B);
    const overlap = Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b));
    if (overlap <= 0) return 0;
    best = Math.min(best, overlap);
  }
  return best;
}

/**
 * 检查一组陈设。返回 { findings: [{ rule, id, why }], resting: [{ guest, host }] }：
 * resting 是「放在别的模型上」的配对，高度对不对要量模型的台面才知道（audit-sets.mjs 去量）。
 */
export function checkSet(set) {
  const findings = [], resting = [];
  const flag = (rule, it, why) => findings.push({ rule, id: it.id, why });
  const { items, boxes, view } = set, [limitX, limitZ] = EXTENT[set.kind];
  const onFloor = (it) => it.mount === 'floor' && it.y0 <= 0.03;
  for (const it of items) {
    // extent
    const reach = it.corners.reduce((m, c) => [Math.max(m[0], Math.abs(c[0])), Math.max(m[1], Math.abs(c[1]))], [0, 0]);
    if (reach[0] > limitX + 1e-6 || reach[1] > limitZ + 1e-6) flag('extent', it, `伸到了离中心 ${reach[0].toFixed(2)} × ${reach[1].toFixed(2)} m，这一组只能占 ${limitX} × ${limitZ} m`);
    if (it.mount === 'wall') {
      // 背面往后 3 cm 应该在展墙里，正面往前 1.2 cm 应该在展墙外
      const back = [it.x - it.front[0] * 0.03, it.z - it.front[1] * 0.03], ahead = [it.x + it.front[0] * 0.012, it.z + it.front[1] * 0.012];
      const hit = (p) => boxes.find((b) => inside(p, b.corners) && it.y0 >= b.y0 - 0.01 && it.y1 <= b.y1 + 0.01);
      if (!hit(back)) flag('wall', it, '背后 3 cm 内没有墙面（离墙悬空，或者超出了展墙的高度）');
      else if (hit(ahead)) flag('wall', it, '陷进了墙里');
      if (it.front[0] * view[0] + it.front[1] * view[1] < 0.7) flag('facing', it, '挂墙件没有朝外');
      continue;
    }
    if (it.mount === 'ceiling') {
      if (set.clearHeight && Math.abs(it.y - (set.clearHeight - 0.08)) > 0.2) flag('support', it, `吊装件的顶在 ${it.y.toFixed(2)} m，天花净高 ${set.clearHeight} m`);
      continue;
    }
    if (it.y0 < -0.02) flag('support', it, `底面比楼面低 ${(-it.y0).toFixed(2)} m`);
    if (!onFloor(it)) {
      const box = boxes.find((b) => Math.abs(b.y1 - it.y0) <= 0.03 && inside(it.centre, b.corners));
      const host = !box && items.find((o) => o !== it && o.mount === 'floor' && inside(it.centre, o.corners) && o.y1 >= it.y0 - 0.02 && it.y0 >= o.y0 + 0.15);
      if (host) resting.push({ guest: it, host });
      else if (!box) flag('support', it, `离楼面 ${it.y0.toFixed(2)} m，下面没有台座，也没有别的模型托着`);
    }
    // facing
    if (SEATS.has(it.id) && onFloor(it)) {
      const reachTable = /sofa|armchair|lounge/.test(it.id) ? 2.3 : 1.4;
      let table = null, best = reachTable;
      for (const o of items) { if (!TABLES.has(o.id) || !onFloor(o)) continue; const d = Math.hypot(o.centre[0] - it.centre[0], o.centre[1] - it.centre[1]); if (d < best) { best = d; table = o; } }
      if (table) {
        const dot = (it.front[0] * (table.centre[0] - it.centre[0]) + it.front[1] * (table.centre[1] - it.centre[1])) / (best || 1);
        if (dot < 0.2) flag('facing', it, `${best.toFixed(2)} m 外有一张 ${table.id}，但它没有朝着桌子（夹角余弦 ${dot.toFixed(2)}）`);
        continue;
      }
    }
    if (BACKED.test(it.id) && onFloor(it) && it.front[0] * view[0] + it.front[1] * view[1] < -0.35) flag('facing', it, '背对着看的人');
  }
  // overlap
  const floor = items.filter(onFloor);
  for (let i = 0; i < floor.length; i++) {
    const a = floor[i];
    for (let j = i + 1; j < floor.length; j++) {
      const b = floor[j];
      if (PLANT.test(a.id) && PLANT.test(b.id)) continue;
      const depth = penetration(a.corners, b.corners);
      const seatTable = (SEATS.has(a.id) && TABLES.has(b.id)) || (SEATS.has(b.id) && TABLES.has(a.id));
      if (depth > (seatTable ? 0.32 : 0.1)) flag('overlap', a, `和 ${b.id} 互相穿插 ${depth.toFixed(2)} m`);
    }
    for (const box of boxes) {
      if (box.y1 < 0.12) continue; // 贴地的踢脚不算
      const depth = penetration(a.corners, box.corners);
      if (depth > 0.05) flag('overlap', a, `和一块台座 / 展墙互相穿插 ${depth.toFixed(2)} m`);
    }
  }
  return { findings, resting };
}

/** 所有成组陈设的检查结果：[{ name, findings, resting }]。 */
export function auditSets(options) {
  return themedSets(options).map((set) => ({ name: set.name, ...checkSet(set) }));
}
