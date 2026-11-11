// 云澜大中庭 · 第一轮：方庭超大退台中庭（游览模式；FPS 用的旧方庭不变）。
// 用户的预想图是层层退台的超大中庭：这里把方庭原来 34×20 的小中庭开成 74–84 米长的大中庭，
//   · 洞口每层往外退：南北两侧每层退 2.5 米、东端每层退 2–3 米；西端固定在 x=−44，是一面 6F 顶落到 1F 的大瀑布；
//   · 中间 8 个岛铺、西侧一排和东边商铺带让出来：西侧变成瀑布后面的观瀑平台；两部观光梯在北边长边上；
//   · 原来在中庭里的扶梯（1F↔2F、2F↔3F、3F↔6F、到天台）改成东北角一组交叉扶梯（1F 到 6F 连续，左右交替）；
//   · 2F–6F 各有一个玻璃观景台悬挑进中庭，位置错开；
//   · 天台天窗开到和方庭玻璃天幕一样大，从中庭里能看到上面的玻璃屋顶。
// 方庭局部坐标（F_SQ，不旋转，原点 (−220, −200)）：x∈[−60, 60]、z∈[−40, 40]，商铺带在 z=±24 以外、x=±44 以外。
import clipping from 'polygon-clipping';
import { rect, lrectPoly, lroundPoly } from './geom.js';
import { F_SQ, squareSetup, squareLevel } from './square.js';

/** 每层洞口（局部）：[x0, x1, 进深的一半, 圆角] */
// 东端每层退 2–3 米：2F 到 x=30，6F 到 x=40（东边商铺带让出来，交叉扶梯挪到东北角）；6F 洞口约 84×38 米
export const SQ_STEPS = { '2F': [-44, 30, 9, 7], '3F': [-44, 33, 11.5, 8], '4F': [-44, 36, 14, 9], '5F': [-44, 38, 16.5, 10], '6F': [-44, 40, 19, 11] };
/** 天台天窗（和方庭玻璃天幕对齐，柱子在天窗外） */
export const SQ_SKY = { rect: rect(-36.5, -16.5, 26, 16.5), r: 6 };
/** 玻璃观景台：悬挑进洞口的一块（局部矩形），每层一个、位置错开 */
export const SQ_DECKS = {
  '2F': rect(-6, 3.5, 4, 9.5), '3F': rect(-14, -11.6, -4, -6), '4F': rect(-28, 8.5, -18, 14.1), '5F': rect(2, -16.6, 12, -11), '6F': rect(-38, -19.1, -29, -13),
};
/** 大瀑布：落水面在 x=−43.4，宽 20 米；1F 水池（局部） */
export const WATERFALL = { x: -43.4, z0: -10, z1: 10, pool: rect(-44, -11, -31, 11), top: 33.6 };
/** 1F 中庭地面：沿中轴的花坛（灌木 + 花）和三处咖啡外摆（局部矩形），都挡人。
 * 避开 B1M↔1F 扶梯洞口（|x|<5、|z|<8）、东门（z=±4）、服务台（14, 13）、观光梯门口、瀑布水池和棕榈。 */
export const SQ_GROUND = {
  beds: [rect(-25, 5.8, -19, 8.2), rect(-25, -8.2, -19, -5.8), rect(17, 7.8, 23, 10.2), rect(17, -10.2, 23, -7.8), rect(27, 7.8, 33, 10.2), rect(27, -10.2, 33, -7.8)],
  cafes: [rect(-12.5, 11.5, -7, 16.5), rect(-12.5, -16.5, -7, -11.5), rect(31, 11, 38, 16.5)],
};
/** 两部观光梯：立在中庭北边长边上（6F 洞口边上），门朝商铺那一侧。
 * 西侧观瀑平台在 4F 以上南半边是室外退台（外墙往里收），放不下。 */
// 都在北边：南边 6F 外墙收到 z=24、天台边在 z=20，南边的观光梯到不了天台。
// x=−21.5 / −2.5 关于中庭中线（x=−12）对称，各落在天台玻璃天幕两根周边柱（x=−27/−16、−16/−5）之间。
// z=−17.5：井道正好站在 6F 洞口北边（6F 上两部梯都在中庭里，门口对着楼板边），也在天台玻璃天幕（z≥−18）底下。
export const SQ_GLASS = [['GW', -21.5, -17.5, 'N'], ['GE', -2.5, -17.5, 'N']];
/** 东端交叉扶梯：1F→2F 往西上、2F→3F 往东上……两组左右错开 */
// 东北角（原 NE、E1 铺位）：两道错开 z=−20 / −16，西头落在 x=46（离 6F 洞口 6 米），东头到 x≈57（离东墙 3 米）；东门（z=±4）和 S5 楼梯（z −10..−4）都不挡
export const SQ_STACK = [['1F', '2F', -1, -20], ['2F', '3F', 1, -16], ['3F', '4F', -1, -20], ['4F', '5F', 1, -16], ['5F', '6F', -1, -20]];
const STACK_END = 46;
/** 让出来的铺位 */
const DROP = new Set(['W1', 'W2', 'W3', 'INW-a', 'INW-b', 'ISW-a', 'ISW-b', 'INE-a', 'INE-b', 'ISE-a', 'ISE-b', 'arcade', 'NE', 'E1']);
const LEVELS = ['1F', '2F', '3F', '4F', '5F', '6F', 'RF'];

/** 改造方庭的扶梯表：去掉原来在中庭里的，加上东端交叉扶梯 */
export function grandSquareEscalators(list) {
  const keep = list.filter((e) => !(e.square && (['SQ-P3', 'SQ-P4', 'SQ-P5', 'SQ-P6', 'SQ-P7'].includes(e.pair) || e.pair.startsWith('SQ-ART'))));
  const stack = SQ_STACK.map(([from, to, sign, cross], i) => ({
    pair: `SQ-X${i + 1}`, from, to, axis: 'x', sign, cross, slot: true, frame: F_SQ, square: true, label: `方庭 ${from} ↔ ${to}`,
    ...(sign < 0 ? { top: STACK_END } : { bottom: STACK_END }),
  }));
  return [...keep, ...stack];
}

/** 观光梯挪到南北长边中段，1F 到天台（天台上住户回家、去江景台都靠它们） */
export function grandSquareSetup(bid, byShort, lift) {
  const r = squareSetup(bid, byShort, lift);
  const serves = LEVELS.filter((s) => byShort[s]).map((s) => byShort[s].id);
  r.elevators = r.elevators.map((e) => {
    const g = SQ_GLASS.find(([id]) => e.id === `${bid}-SQ-${id}`);
    return g ? { ...lift(e.id, bid, 'glass', F_SQ, g[1], g[2], 2.6, 2.6, g[3], serves), square: true } : e;
  });
  return r;
}

const shaftPoly = (x, z) => lrectPoly(F_SQ, rect(x - 1.3, z - 1.3, x + 1.3, z + 1.3));
const toPolys = (mp) => mp.map((p) => p[0].slice(0, -1)); // 外环、去掉闭合点（只用在不会有洞的地方）

/** 原来的方庭楼层，再按大中庭改：洞口、铺位、走道、观光梯井、天台 */
export function grandSquareLevel(lv, picker, state) {
  const out = squareLevel(lv, picker, state);
  const s = lv.short;
  if (lv.kind === 'parking' || s === 'B1M') return out;
  // 让出来的铺位
  // 改造前这一层全部铺位的原顺序记在一个不可枚举的字段上：p1-expansion 给 4F–6F 重新取店名时按原顺序（连让出来的铺位一起）取，
  // 品牌池的消耗和改造前一模一样，后面八座附楼的店名不跟着挪
  Object.defineProperty(lv, 'grandOrder', { value: [...lv.units], enumerable: false, configurable: true });
  lv.units = lv.units.filter((u) => !(u.square && DROP.has(u.slot.replace(/^SQ-/, ''))));
  for (const u of lv.units.filter((q) => q.square && q.slot === 'SQ-kids')) {
    // 儿童乐园原来延伸到 z=−10，挡住观瀑平台；收到 z=−18（和西北角铺位齐）
    u.rects = [rect(-60, -40, -44, -18)];
    u.fronts = [{ x0: -44, z0: -24, x1: -44, z1: -18, side: 'E' }];
  }
  for (const u of lv.units.filter((q) => q.square && q.slot === 'SQ-cinema')) {
    // 影院原来拐进东边商铺带，那里现在是交叉扶梯；只留北边商铺带那一块
    u.rects = [rect(20, -40, 44, -24)];
    u.fronts = [{ x0: 20, z0: -24, x1: 44, z1: -24, side: 'S' }];
  }
  // 原来的观光梯井（x=±15.5）
  lv.voids = lv.voids.filter((v) => !/^SQ-(ground|roof)-shaft/.test(v.id));
  if (lv.kind === 'roof') {
    lv.voids = lv.voids.filter((v) => v.id !== 'SQ-sky');
    const sky = lroundPoly(F_SQ, SQ_SKY.rect, SQ_SKY.r);
    lv.voids.push({ id: 'SQ-sky', kind: 'skylight', poly: sky, frame: F_SQ, rect: SQ_SKY.rect, radius: SQ_SKY.r, square: true });
    // 原来西侧扶梯的玻璃亭不要了；屋顶农场收到天窗西边
    lv.features = lv.features.filter((f) => !(f.square && f.type === 'pavilion'));
    for (const f of lv.features.filter((q) => q.type === 'farm' && q.frame === F_SQ)) f.rect = rect(-58, -22, -38.5, 20);
    for (const [id, x, z] of SQ_GLASS) lv.voids.push({ id: `SQ-glass-shaft-${id}`, kind: 'shaft', poly: shaftPoly(x, z), frame: F_SQ, rect: rect(x - 1.3, z - 1.3, x + 1.3, z + 1.3), square: true });
    lv.walk = cutWalk(lv.walk, [sky, ...SQ_GLASS.map(([, x, z]) => shaftPoly(x, z))], (w) => w.frame === F_SQ);
    return out;
  }
  for (const [id, x, z] of SQ_GLASS) lv.voids.push({ id: `SQ-glass-shaft-${id}`, kind: 'shaft', poly: shaftPoly(x, z), frame: F_SQ, rect: rect(x - 1.3, z - 1.3, x + 1.3, z + 1.3), square: true });
  let holes = [];
  if (SQ_STEPS[s]) {
    const [x0, x1, h, r] = SQ_STEPS[s];
    lv.voids = lv.voids.filter((v) => v.id !== 'SQ-void');
    let poly = lroundPoly(F_SQ, rect(x0, -h, x1, h), r);
    const deck = SQ_DECKS[s];
    if (deck) poly = toPolys(clipping.difference([[poly]], [[lrectPoly(F_SQ, deck)]]))[0];
    lv.voids.push({ id: 'SQ-void', kind: 'atrium', poly, frame: F_SQ, rect: rect(x0, -h, x1, h), radius: r, square: true, deck: deck || null });
    holes = [poly];
  } else holes = lv.voids.filter((v) => v.id === 'SQ-void').map((v) => v.poly);
  // 走道：方庭中间整块（商铺带以内）+ 西侧观瀑平台，减去洞口、铺位、扶梯开洞；南北各算一半（避免带洞的多边形）
  const zone = [lrectPoly(F_SQ, rect(-44, -24, 44, 24)), lrectPoly(F_SQ, rect(-60, -18, -44, 18)), lrectPoly(F_SQ, rect(44, -24, 60, 4))];
  const cut = [...holes, ...lv.voids.filter((v) => v.kind === 'shaft' || v.kind === 'escalator').map((v) => v.poly),
    ...lv.units.filter((u) => u.square).flatMap((u) => u.rects.map((q) => lrectPoly(F_SQ, q))),
    ...(lv.rooms || []).filter((r) => r.frame === F_SQ).flatMap((r) => r.rects.map((q) => lrectPoly(F_SQ, q)))];
  const replace = new Set(['SQ-ringN', 'SQ-ringS', 'SQ-ringW', 'SQ-ringE', 'SQ-passW', 'SQ-passE', 'SQ-innerN', 'SQ-innerS', 'SQ-innerW', 'SQ-innerE',
    'SQ-promN', 'SQ-promS', 'SQ-surrW', 'SQ-surrE', 'SQ-loungeW', 'SQ-entW', 'SQ-loungeE', 'SQ-eNook', 'SQ-entE']);
  lv.walk = lv.walk.filter((w) => !replace.has(w.id));
  const area = clipping.difference(clipping.union(...zone.map((p) => [p])), ...cut.map((p) => [p]));
  let k = 0;
  for (const p of noHoles(area)) lv.walk.push({ id: `SQ-grand-${k++}`, kind: 'atrium', poly: p, frame: F_SQ, square: true });
  if (s === '1F') {
    lv.navObstacles ||= [];
    lv.navObstacles.push({ id: 'SQ-waterfall-pool', poly: lroundPoly(F_SQ, WATERFALL.pool, 4) });
    SQ_GROUND.beds.forEach((r, i) => lv.navObstacles.push({ id: `SQ-bed-${i}`, poly: lroundPoly(F_SQ, r, 1) }));
    SQ_GROUND.cafes.forEach((r, i) => lv.navObstacles.push({ id: `SQ-cafe-${i}`, poly: lrectPoly(F_SQ, r) }));
  }
  return out;
}

/** 多边形集合 → 不带洞的简单多边形：带洞的块从洞的中线切开（竖切），直到没有洞 */
function noHoles(mp, depth = 0) {
  const out = [];
  for (const poly of mp) {
    if (poly.length === 1 || depth > 8) { const p = poly[0].slice(0, -1); if (Math.abs(areaOf(p)) >= 1) out.push(p); continue; }
    const xs = poly[1].map((q) => q[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const zs = poly[0].map((q) => q[1]), z0 = Math.min(...zs) - 1, z1 = Math.max(...zs) + 1, xa = Math.min(...poly[0].map((q) => q[0])) - 1, xb = Math.max(...poly[0].map((q) => q[0])) + 1;
    for (const half of [[[xa, z0], [cx, z0], [cx, z1], [xa, z1]], [[cx, z0], [xb, z0], [xb, z1], [cx, z1]]]) out.push(...noHoles(clipping.intersection([poly], [half]), depth + 1));
  }
  return out;
}

function areaOf(P) { let a = 0; for (let i = 0; i < P.length; i++) { const [x0, z0] = P[i], [x1, z1] = P[(i + 1) % P.length]; a += x0 * z1 - x1 * z0; } return a / 2; }

/** 走道减去洞口（只处理 pick 选中的走道） */
function cutWalk(walk, holes, pick) {
  const outW = [];
  for (const w of walk) {
    if (!pick(w)) { outW.push(w); continue; }
    const res = noHoles(clipping.difference([[w.poly]], ...holes.map((h) => [[h]])));
    res.forEach((p, i) => { if (Math.abs(areaOf(p)) >= 1) outW.push({ ...w, id: res.length > 1 ? `${w.id}-${i}` : w.id, poly: p, rect: undefined, lpoly: undefined }); });
  }
  return outW;
}

