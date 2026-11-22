import { towerStairPlan, GOING } from '../../layout/tower-stairs.js';
import { landingAt } from '../../layout/elevator-shafts.js';
import * as THREE from 'three';
import { BatchSet, frameMatrix, instanceMatrix, tpl } from '../batch.js';

const WALL = '#dce1d8', STEP = '#c8cec3', METAL = '#607967';
/**
 * 楼梯间细部的顶点色。实例化模板只有两个批次（不加绘制调用）：
 * 刷漆、水泥踏步、木扶手这些不该反光的面走「抹灰」批次（plaster：无缝的细抹灰，没有清水混凝土那种一道道模板缝——
 * 模板缝铺在平台上像木地板、竖在墙上像挂板）；材质表里没有 plaster（单元测试只给 concrete / extMetal）时退回 concrete。
 * 真金属（栏杆、门框、管卡、电梯门套）走 extMetal。
 * 停电时只有手电照明，颜色压在中灰附近：太白的面在手电光斑里会过曝，太黑的又什么都看不见。
 */
export const STAIR_PAINT = Object.freeze({
  tread: '#b4b1a7', riser: '#9d9e97', landing: '#aba99f', nosing: '#2b2e2c', soffit: '#c4c6bf',
  // 墙裙是油漆：和上面墙面的反差留给那道深色腰线，整片色块不要压得太深（太深像贴了一层茶色玻璃）
  dado: '#9aa49a', dadoLine: '#47524b', skirting: '#4a4f4b', wall: '#cfd0c7', threshold: '#8f8c85',
  rail: '#5b4130', baluster: '#3a433e', bracket: '#5f6662',
  pipe: '#952c24', conduit: '#7d827c', lamp: '#ebe3cc', lampBase: '#3f4341', cage: '#2c2f2e',
  frame: '#4b524e', closer: '#6d726e',
  // 消火栓箱：不锈钢包边、红色烤漆门、玻璃后面是深色箱膛和卷盘；白字
  hydrant: '#a12a22', hydrantFrame: '#b9bebf', hydrantInside: '#2b2d2c', hydrantGlass: '#5e6d72', hoseReel: '#7d241d',
  hydrantLabel: '#ece7da', meter: '#8a918b', meterSeam: '#4c524e',
  // 候梯厅：拉丝不锈钢门套和召唤盒、黑色按钮、红色手动报警按钮
  steel: '#bcc1c3', button: '#2c3032', alarm: '#b02a22', lobbySkirting: '#4b4c48', lampRim: '#3b3e3d', panel: '#8f8d86',
});
/** 墙裙（梯段处沿踏步前缘斜着走）、踢脚线的高度。 */
export const DADO_HEIGHT = 1.2, SKIRTING_HEIGHT = .16;

const box = (B, key, r, y, height, color) => B.get(key).box((r.x0+r.x1)/2,y+height/2,(r.z0+r.z1)/2,r.x1-r.x0,height,r.z1-r.z0,color);
const rail = (B, a, b) => {
  B.get('extMetal').bar(a,b,.045,METAL);
  const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.9));
  for(let i=0;i<=n;i++) {
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
    B.get('extMetal').bar({x,y:y-.95,z},{x,y,z},.025,METAL);
  }
};

const protectedFlight = f => f.kind !== 'interior-stair' && !!f.localBottom;

/**
 * The 分隔 of stair s on level id (stair frame): { doors: [door1, door2], partition } or null, from P0a's
 * towerStairPlan(s).breakAt(id) (s.breakLevels with s.breakDoors[id] = { door2, partition }, else the partition up
 * the middle of the door landing and door2 mirrored about it): the same doors applyStairBreaks() gives the stair room.
 */
export function stairBreak(s, p, id) {
  const at = (p || towerStairPlan(s)).breakAt(id);
  return at ? { doors: at.doors, partition: at.partition } : null;
}

// ---------- 细部几何的小工具：剪切的盒子 / 面片（梯段旁的墙裙、踢脚、底板要顺着坡度走，两端仍是竖直的） ----------
const _m = new THREE.Matrix4(), _c0 = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/**
 * 以中心 c、三根轴向量 a0 / a1 / a2（模板的 x / y / z 方向，含长度）放一个模板。轴不必正交，
 * 所以斜着的墙裙两端仍然竖直、和平台那一段严丝合缝。行列式为负时翻 a0，保持三角形朝外。
 * 测试里的记录器只有 box / bar：没有 push 的批次直接跳过（只是外观，不影响任何实体）。
 */
function sheared(g, name, c, a0, a1, a2, color) {
  if (!g.push) return;
  _c0.copy(a0); _c1.copy(a1); _c2.copy(a2);
  if (_d.crossVectors(_c0, _c1).dot(_c2) < 0) _c0.negate();
  _m.makeBasis(_c0, _c1, _c2).setPosition(c);
  g.push(tpl(name), _m, color);
}
/** 贴墙的一条（墙裙、腰线、踢脚）：沿墙从 a 到 b（[x, z]），底边从 ya 斜到 yb，竖直高 h，面朝 n（[nx, nz]，单位向量）。 */
function wallStrip(g, a, b, ya, yb, h, n, color) {
  _p.set((a[0] + b[0]) / 2, (ya + yb) / 2 + h / 2, (a[1] + b[1]) / 2);
  sheared(g, 'plane', _p, _s.set(b[0] - a[0], yb - ya, b[1] - a[1]), new THREE.Vector3(0, h, 0), new THREE.Vector3(n[0], 0, n[1]), color);
}
/** 竖直的一片面，朝 +z（nz = 1）或 −z；没有 shape 的批次（测试记录器）退回薄盒子。 */
function vface(g, x, y, z, w, h, nz, color, t = .035) {
  if (!g.shape) { g.box(x, y, z, w, h, t, color); return; }
  _q.setFromAxisAngle(UP, nz > 0 ? 0 : Math.PI);
  g.shape('plane', _p.set(x, y, z), _q, _s.set(w, h, 1), color);
}
/** 朝上的一片（防滑条）；没有 flat 的批次退回薄盒子。 */
function upface(g, x, y, z, w, d, color) {
  if (g.flat) g.flat(x, y, z, w, d, color); else g.box(x, y - .003, z, w, .006, d, color);
}
/** 两点之间的圆管（6 棱，扶手、立管）；没有 shape 的批次退回方杆。 */
function tube(g, a, b, r, color) {
  if (!g.shape) { g.bar(a, b, r * 2, color); return; }
  _d.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = _d.length();
  if (len < 1e-6) return;
  _q.setFromUnitVectors(UP, _d.divideScalar(len));
  g.shape('cyl6', _p.set(a.x, a.y, a.z), _q, _s.set(r * 2, len, r * 2), color);
}

// 栏杆立杆用的方杆：只有四个侧面（上下两头的端面看不见），8 个三角形，盒子是 12 个——一层楼梯一百多根，省下三成。
let POST = null;
function postTpl() {
  if (POST) return POST;
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), P = g.attributes.position.array, N = g.attributes.normal.array, pos = [], nor = [];
  for (let i = 0; i < P.length / 3; i++) if (Math.abs(N[i * 3 + 1]) < .5) { pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); }
  g.dispose();
  return (POST = { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: null, count: pos.length / 3 });
}
/** 竖直方杆（中心 x, y, z，截面 w × d，高 h）；没有 push 的批次（测试记录器）退回盒子。 */
function post(g, x, y, z, w, h, d, color) {
  if (!g.push) { g.box(x, y, z, w, h, d, color); return; }
  _m.compose(_p.set(x, y, z), _q.identity(), _s.set(w, h, d));
  g.push(postTpl(), _m, color);
}

/**
 * 楼层 lv 上各部楼梯的细部做法（纯数据，决定实例化模板怎么分组）：
 *   inset   墙内皮离楼梯间外框的距离：社区塔楼自己楼层的墙骑在外框线上（0.2 厚 → 0.1），
 *           酒店 / 公寓的围护墙和一期宿主楼层（residential-cores）的墙在外框以内（→ 0.2）
 *   doors   每部楼梯这一层的门（穿越层没有门 → []；分隔层两樘）
 *   lobby   门外前室墙上挂什么：'hydrant'（消火栓 + 灭火器箱）/ 'meter'（电表箱 + 弱电箱）/ null，
 *           只在社区塔楼自己的楼层、而且门外那段墙确实落在候梯厅 / 走廊里时才挂
 *   wellGuard  门口平台临梯井一侧的短护栏（酒店 / 公寓的围护墙那边已经画了，社区塔楼这里补）
 * 同一层高、同一做法的楼层共用一份实例化模板；做法不同（穿越层、分隔层）的另起一组。
 */
export function stairDetailSpec(building, lv, stairs, elevators = null) {
  const own = !!building.community && lv.building === building.id, inset = own ? .1 : .2;
  const cp = lv.corePlan, rooms = [...(cp?.landings || []).map((q) => q.rect), ...(cp?.corridor ? [cp.corridor] : [])];
  const inside = (x0, x1, z) => rooms.some((r) => x0 >= r.x0 + .1 && x1 <= r.x1 - .1 && z > r.z0 + .1 && z < r.z1 - .1);
  const sorted = [...stairs].sort((a, b) => a.rect.x0 - b.rect.x0);
  // 门洞上沿：社区塔楼自己楼层 2.3（community.js 的过梁），一期宿主楼层 2.2（residential-cores 的门头），其余 2.35。
  const head = own ? 2.3 : building.community ? 2.2 : 2.35;
  // lining：楼梯间的墙不是社区塔楼自己的抹灰墙（酒店 / 公寓、一期宿主楼层是清水混凝土或石材），模板里贴一层抹灰面
  const out = { inset, head, wellGuard: !!building.community, lining: !own, stairs: {} };
  // 社区塔楼自己的楼层：楼梯门正对的候梯厅（lobbySpec）。消火栓箱、表箱挂在出楼梯门迎面那道电梯墙的墙垛上；
  // 楼梯门这道墙上只留手动报警按钮（门边 1.4 m）。
  const lobby = own ? lobbySpec(lv, sorted, elevators) : null;
  sorted.forEach((s, k) => {
    const passes = (s.passLevels || []).includes(lv.id) || !(s.serves || [lv.id]).includes(lv.id);
    const brk = passes ? null : stairBreak(s, null, lv.id);
    const doors = passes ? [] : brk ? brk.doors.map((d) => ({ x0: d.x0, x1: d.x1 })) : [{ x0: s.door.x0, x1: s.door.x1 }];
    let inner = null;
    // 酒店 / 公寓的楼梯门外是走廊或住户门面，没有可挂箱子的整片墙：消火栓箱挂在楼梯间里门口平台的侧墙上
    // （门口平台 2 m 深，第一跑从 2 m 处起步，箱子占 0.74–1.46 m，凸出墙面 4.5 cm，不进梯段也不挡门）。
    if (!building.community && doors.length === 1 && !brk) inner = { kind: 'hydrant', side: k % 2 ? 'R' : 'L', v: 1.1, w: .72 };
    out.stairs[s.id] = { doors, partition: brk ? brk.partition.x0 : null, lobby: null, inner };
  });
  out.lobby = lobby;
  return out;
}

/**
 * 候梯厅（社区塔楼自己的楼层）：电梯墙在候梯厅一边、楼梯门墙在另一边（北苑：电梯门朝南 z = −4.8，楼梯门朝北 z = −1.6）。
 * 只认这种「电梯墙正对楼梯门墙」的核心筒，别的做法返回 null（不画）。
 *   z0 / z1   电梯墙面 / 楼梯门墙面（候梯厅一侧）的 z；nz 从电梯墙指向楼梯门墙（+1：z 增大）
 *   x0 / x1   候梯厅两头
 *   gaps      全部电梯门洞（踢脚线按它让开；停不停靠都让，免得隔层停靠的电梯把模板分成两组）
 *   face      正对楼梯门的那部电梯（门中心落在两樘楼梯门之间、这一层停靠）：拉丝不锈钢门套
 *   boxes     迎面西侧墙垛上的消火栓箱；alarm 两樘楼梯门之间的手动报警按钮
 * 这些都只是外观（导航、碰撞照旧），按「同一层高 + 同一做法」进实例化模板。
 */
function lobbySpec(lv, stairs, elevators) {
  const cp = lv.corePlan;
  if (!cp?.lifts?.length || !cp.landings?.length || !stairs.length) return null;
  const lifts = cp.lifts, side = lifts[0].door, sd = stairs[0].door.side;
  if (!['N', 'S'].includes(side) || !['N', 'S'].includes(sd) || side === sd || lifts.some((L) => L.door !== side) || stairs.some((s) => s.door.side !== sd)) return null;
  const lineOf = (L) => (side === 'S' ? L.rect.z1 : L.rect.z0), line = lineOf(lifts[0]), doorLine = stairs[0].door.z0, nz = Math.sign(doorLine - line);
  if (!nz || lifts.some((L) => Math.abs(lineOf(L) - line) > 1e-3) || stairs.some((s) => Math.abs(s.door.z0 - doorLine) > 1e-3)) return null;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const x0 = Math.min(...cp.landings.map((q) => q.rect.x0)), x1 = Math.max(...cp.landings.map((q) => q.rect.x1));
  const rec = (L) => elevators?.find((e) => e.id === L.id);
  const half = (L) => (L.doorWidth ?? rec(L)?.doorWidth ?? 1.1) / 2, mid = (L) => (L.rect.x0 + L.rect.x1) / 2;
  const kind = (L) => (rec(L) ? landingAt(rec(L), lv.id) : L.landing === false ? null : 'normal');
  const gaps = lifts.map((L) => [r3(mid(L) - half(L)), r3(mid(L) + half(L))]).sort((a, b) => a[0] - b[0]);
  const sx0 = Math.min(...stairs.map((s) => s.door.x0)), sx1 = Math.max(...stairs.map((s) => s.door.x1));
  const faced = lifts.find((L) => mid(L) > sx0 && mid(L) < sx1 && kind(L));
  const face = faced ? { x0: r3(mid(faced) - half(faced)), x1: r3(mid(faced) + half(faced)) } : null;
  // 前室：迎面电梯所在、每层都开着的那块（北苑 x −1.4..1.4）。两边的候梯厅隔层封死（封死的一块是实心核心筒），
  // 所以箱子、召唤盒、报警按钮都只挂在前室里，不然隔一层就有一半埋进墙里。
  const fl = face && cp.landings.find((q) => q.open && q.rect.x0 < (face.x0 + face.x1) / 2 && q.rect.x1 > (face.x0 + face.x1) / 2)?.rect;
  // 西侧墙垛挂消火栓箱（宽 0.66，两边各留 5 cm）。东侧墙垛留给住户楼层自己的呼梯面板（residence-interiors 在每部电梯
  // 门右手 w/2 − 0.18 处画，带楼层指示），这里不再画第二个。
  const boxes = [];
  if (face && fl) {
    const a = fl.x0 + .05, b = face.x0 - .07;
    if (b - a >= .62) { const w = r3(Math.min(.66, b - a - .08)); boxes.push({ kind: 'hydrant', x: r3((a + b) / 2), w }); }
  }
  // 两部楼梯门之间的墙垛（比门两侧的墙退进 10 cm）上一个手动报警按钮 + 消防电话插孔
  const between = stairs.length === 2 ? [stairs[0].door.x1, stairs[1].door.x0].sort((a, b) => a - b) : null;
  const alarm = between && between[1] - between[0] >= .2 ? r3((between[0] + between[1]) / 2) : null;
  return { z0: r3(line + nz * .06), z1: r3(doorLine - nz * .1), nz, x0, x1, gaps, face, boxes, alarm,
    fire: fl ? [fl.x0, fl.x1] : null, stairDoors: stairs.map((s) => [s.door.x0, s.door.x1]), doorLine, ceiling: r3(lv.height - .31) };
}
/** 分组用的签名：层高 + 做法。 */
export const stairDetailKey = (lv, spec) => `${lv.height.toFixed(4)}|${JSON.stringify(spec)}`;

/** Called inside the building frame, batched into its permanent clipped shell.
 * Mid-flight geometry must survive loading the next visited dwelling floor.
 * detail（只在逐层实例化的模板里传）：stairDetailSpec 的结果；paint：刷漆面用哪个批次（模板里是 plaster，没有就 concrete）。
 * 有了 detail，踏步伸到墙边、梯段下有斜底板，临井一侧是密排方钢栏杆和木扶手，靠墙一侧换成墙上扶手，
 * 再画墙裙、踢脚、门框、闭门器、防潮吸顶灯、立管、门口平台的水泥面层和门槛石（stairDetails），
 * 社区塔楼自己的楼层还有门外候梯厅的电梯门套、召唤盒、消火栓箱、表箱、踢脚和吸顶灯（lobbyDetails）。 */
export function buildTowerStairGeometry(B, building, levels, stairs, { enclosures = true, flights = true, detail = null, paint = 'concrete' } = {}) {
  if (!building.access?.protected) return;
  if (enclosures) for (const s of stairs) {
    const p=towerStairPlan(s),r=s.rect;
    for(const lv of levels.filter(l=>!l.playableCap&&s.serves.includes(l.id))) {
      const y=lv.elev,h=lv.kind==='roof'?2.9:lv.height, dz=s.door.z0;
      box(B,'concrete',{x0:r.x0,z0:r.z0,x1:r.x0+.2,z1:r.z1},y,h,WALL);
      box(B,'concrete',{x0:r.x1-.2,z0:r.z0,x1:r.x1,z1:r.z1},y,h,WALL);
      const back=s.door.side==='S'?r.z0:r.z1-.2;
      box(B,'concrete',{x0:r.x0,z0:back,x1:r.x1,z1:back+.2},y,h,WALL);
      const front=s.door.side==='S'?dz-.2:dz;
      // 分隔 (breakLevels): a second door in the same wall and a lane partition across the door landing, so the run
      // from below arrives through one door and the run above leaves through the other (SPEC §2.2 stairs).
      const brk=stairBreak(s,p,lv.id),doors=brk?brk.doors:[s.door];
      const sorted=[...doors].sort((a,b)=>a.x0-b.x0);
      let x=r.x0;
      for(const d of sorted){box(B,'concrete',{x0:x,z0:front,x1:d.x0,z1:front+.2},y,h,WALL);x=d.x1;}
      box(B,'concrete',{x0:x,z0:front,x1:r.x1,z1:front+.2},y,h,WALL);
      const entryZ=dz-p.direction*.045;
      for(const d of sorted) {
        box(B,'concrete',{x0:d.x0,z0:front,x1:d.x1,z1:front+.2},y+2.35,h-2.35,WALL);
        // Open door leaves are parked against the entry wall, not through the
        // 1.8m clear landing or the route between the two stair flights.
        const leaf=Math.min(.65,(d.x1-d.x0)*.6);
        if(!brk){B.get('extMetal').box(d.x0-.35,y+1.09,entryZ,.65,2.18,.055,METAL);B.get('extMetal').box(d.x1+.35,y+1.09,entryZ,.65,2.18,.055,METAL);}
        else {const out=(d.x0+d.x1)/2<brk.partition.x0?-1:1;B.get('extMetal').box(out<0?d.x0-leaf/2-.03:d.x1+leaf/2+.03,y+1.09,entryZ,leaf,2.18,.055,METAL);}
        B.get('glowSoft').box((d.x0+d.x1)/2,y+2.55,entryZ,Math.min(.85,d.x1-d.x0),.23,.07,'#78b98b');
      }
      if(brk) {
        const P=brk.partition,z0=Math.min(P.z0,P.z1),z1=Math.max(P.z0,P.z1);
        box(B,'concrete',{x0:P.x0-.06,z0,x1:P.x0+.06,z1},y,h,WALL);
        // A lit 「nF 避难层」 plate on each side of the partition, at the doors.
        for(const sg of [-1,1])B.get('glowSoft').box(P.x0+sg*.075,y+1.9,(z0+z1)/2,.012,.3,.9,'#d9e8d2');
      }
      const cx=(s.door.x0+s.door.x1)/2;
      const q=p.point(cx,1.05);
      B.get('glowSoft').box(q[0],y+h-.13,q[1],1.2,.055,.3,'#f5ebd6');
      const frontEdge=p.point(0,2);
      // 门口平台临梯井的护栏：和梯段栏杆同一做法（深色方钢立杆 + 木色扶手），不再是另一种绿色的管栏。
      const ga={x:p.centers[0]+p.width/2,y:y+1.05,z:frontEdge[1]},gb={x:p.centers[1]-p.width/2,y:y+1.05,z:frontEdge[1]};
      B.get('extMetal').bar(ga,gb,.05,STAIR_PAINT.rail);
      const gn=Math.max(1,Math.round(Math.abs(gb.x-ga.x)/.2));
      for(let i=0;i<=gn;i++){const gx=ga.x+(gb.x-ga.x)*i/gn;B.get('extMetal').bar({x:gx,y:y,z:ga.z},{x:gx,y:y+1.03,z:ga.z},.018,STAIR_PAINT.baluster);}
      if(lv.kind==='roof') box(B,'concrete',r,y+h,.18,'#b2bbae');
    }
  }
  if (!flights) return;
  const plans = new Map(stairs.map((s) => [s.id, towerStairPlan(s)]));
  const own = building.access.flights.filter(protectedFlight);
  // Duplex 套内楼梯 flights belong to the home interiors, not the protected stair shells.
  for(const f of own) {
    const [x0,z0]=f.localBottom,[x1,z1]=f.localTop,dy=f.top.y-f.bottom.y;
    const s = stairs.find((q) => q.id === f.stair), p = plans.get(f.stair), d = detail && s && p && detail.stairs?.[s.id];
    // 靠墙一侧：有细部时踏步伸到墙皮（导航仍按梯段宽，只是看上去顶到墙），否则停在梯段边。
    const well = p ? Math.sign((p.centers[0] + p.centers[1]) / 2 - x0) || 1 : 1;
    const wallX = d ? (well > 0 ? s.rect.x0 + detail.inset : s.rect.x1 - detail.inset) : x0 - well * f.width / 2;
    const edgeX = x0 + well * f.width / 2, tx = (wallX + edgeX) / 2, tw = Math.abs(edgeX - wallX);
    const sz = Math.sign(z1 - z0) || 1, rise = dy / f.steps, run = f.run / f.steps;
    const tread = d ? STAIR_PAINT.tread : STEP, riser = d ? STAIR_PAINT.riser : STEP;
    const C = B.get(d ? paint : 'concrete'), M = B.get('extMetal');
    for(let i=0;i<f.steps;i++) {
      const t=(i+.5)/f.steps,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t,y=f.bottom.y+dy*(i+1)/f.steps;
      const edgeZ=z0+(z1-z0)*i/f.steps;
      if (d) {
        // 水泥踏步 + 略深的踢面；前缘一条黑色金刚砂防滑条（两端留 6 cm，像真的嵌条）。
        C.box(tx,y-.07,z,tw,.14,f.run/f.steps+.006,tread);
        // 踢面盖住踏步板的前脸（踏步前脸比 edgeZ 外凸 3 mm），整级踢面一个颜色。
        vface(C, tx, y - rise / 2, edgeZ - sz * .0045, tw, rise, -sz, riser);
        upface(C, x, y + .002, edgeZ + sz * .035, f.width - .12, .045, STAIR_PAINT.nosing);
      } else {
        B.get('concrete').box(x,y-.07,z,f.width,.14,f.run/f.steps+.006,STEP);
        B.get('concrete').box(x,y-dy/f.steps/2,edgeZ,f.width,dy/f.steps,.035,STEP);
        B.get('extMetal').box(x,y+.006,edgeZ,f.width,.012,.035,'#8e9e8a');
      }
    }
    if (!d) {
      for(const sign of [-1,1]) rail(B,
        {x:x0+sign*f.width/2,y:f.bottom.y+1.05,z:z0},
        {x:x1+sign*f.width/2,y:f.top.y+1.05,z:z1});
      continue;
    }
    // 梯段底板：一块顺坡的现浇板，上皮过每级踏步的后下角，从下面看是一整块斜板而不是一级级悬空的踏步。
    const zA = z0, zB = z1, yA = f.bottom.y - .14, yB = f.top.y - .14, th = .16;
    sheared(C, 'box', _p.set(tx, (yA + yB) / 2 - th / 2, (zA + zB) / 2), new THREE.Vector3(tw, 0, 0), new THREE.Vector3(0, th, 0), new THREE.Vector3(0, yB - yA, zB - zA), STAIR_PAINT.soffit);
    // 临井一侧：住宅楼梯的做法——方钢立杆净距不大于 11 cm（每级三根，中距约 9 cm）、离踏步 10 cm 的底横杆、
    // 顶上一根木扶手，两端各一根粗一点的望柱。
    const nose = (k) => ({ z: z0 + (z1 - z0) * k / f.steps, y: f.bottom.y + rise * (k + 1) }), H = .95, bx = edgeX - well * .035;
    const top = (k) => { const n = nose(k); return { x: bx, y: n.y + H, z: n.z }; };
    for (let i = 0; i < f.steps; i++) for (const u of BALUSTERS) {
      // 扶手线过各级前缘 + H：踏步上离前缘 u 级处的立杆比前缘处高 u 级。
      const zc = z0 + (z1 - z0) * (i + u) / f.steps, yb = f.bottom.y + rise * (i + 1), yt = yb + H + rise * u;
      post(M, bx, (yb + yt) / 2, zc, .015, yt - yb, .015, STAIR_PAINT.baluster);
    }
    const a = top(0), b = top(f.steps - 1);
    const ext = (q, dz) => ({ x: q.x, y: q.y + dz / run * rise, z: q.z + sz * dz });
    const ra = ext(a, -run * .5), rb = ext(b, run * .5);
    tube(C, ra, rb, .028, STAIR_PAINT.rail);
    M.bar({ x: bx, y: ra.y - H + .1, z: ra.z }, { x: bx, y: rb.y - H + .1, z: rb.z }, .022, STAIR_PAINT.baluster);
    // 望柱落到所在的楼面（下端门口 / 平台，上端最后一级踏步）。
    for (const [q, foot] of [[ra, f.bottom.y], [rb, f.top.y]]) M.box(bx, (q.y + .03 + foot) / 2, q.z, .045, q.y + .03 - foot, .045, STAIR_PAINT.baluster);
    // 靠墙一侧：墙上一根圆管扶手，三个托架。
    const wx = wallX + well * .075, wa = { x: wx, y: f.bottom.y + rise + .9, z: z0 }, wb = { x: wx, y: f.top.y + .9, z: z1 - sz * run };
    tube(M, wa, wb, .02, STAIR_PAINT.bracket);
    for (const t of [.12, .5, .88]) {
      const y = wa.y + (wb.y - wa.y) * t, z = wa.z + (wb.z - wa.z) * t;
      M.box((wallX + wx) / 2, y - .03, z, .075, .018, .02, STAIR_PAINT.bracket);
    }
  }
  for(const s of building.access.surfaces) {
    const stair=stairs.find(q=>q.id===s.stair);
    if(!stair||!s.rect)continue;
    const dir=towerStairPlan(stair).direction;
    const z=dir<0?s.rect.z0:s.rect.z1;
    const d = detail?.stairs?.[stair.id];
    if (!d) {
      box(B,'concrete',s.rect,s.elev-.15,.15,STEP);
      rail(B,{x:s.rect.x0,y:s.elev+1.05,z},{x:s.rect.x1,y:s.elev+1.05,z});
      continue;
    }
    // 半层平台：伸到两侧墙皮，0.25 厚（接得住梯段底板），水泥面层；临空的一边是密排栏杆（中距约 11 cm）和木扶手。
    const C = B.get(paint), x0 = stair.rect.x0 + detail.inset, x1 = stair.rect.x1 - detail.inset;
    box(B, paint, { ...s.rect, x0, x1 }, s.elev - .25, .25, STAIR_PAINT.landing);
    const gz = z - dir * .04, n = Math.max(2, Math.round((x1 - x0 - .1) / .11));
    for (let k = 1; k < n; k++) post(B.get('extMetal'), x0 + (x1 - x0) * k / n, s.elev + .53, gz, .015, 1.06, .015, STAIR_PAINT.baluster);
    B.get('extMetal').box((x0 + x1) / 2, s.elev + .1, gz, x1 - x0, .022, .022, STAIR_PAINT.baluster);
    tube(C, { x: x0, y: s.elev + 1.07, z: gz }, { x: x1, y: s.elev + 1.07, z: gz }, .028, STAIR_PAINT.rail);
    // 平台前缘一条黑色防滑条，和踏步一样。
    upface(C, (stair.rect.x0 + stair.rect.x1) / 2, s.elev + .002, (dir < 0 ? s.rect.z1 : s.rect.z0) + dir * .045, x1 - x0 - .3, .05, STAIR_PAINT.nosing);
  }
  if (detail) stairDetails(B, building, stairs, detail, own, paint);
  if (detail?.lobby) lobbyDetails(B, detail.lobby, paint);
}
/** 每级踏步上栏杆立杆的位置（离前缘几分之几级）：三根，中距约 9 cm。 */
const BALUSTERS = [1 / 6, .5, 5 / 6];

/**
 * 楼梯间的墙面和门口（只在实例化模板里画，y 以本层楼面为 0）：
 *   两侧墙：墙裙（灰绿色，1.2 m，梯段处沿踏步前缘斜着走）、上沿一道深色腰线、踢脚线；
 *   lining：酒店 / 公寓、一期宿主楼层的楼梯间墙是清水混凝土（一道道模板缝），整面贴一层抹灰面；
 *   门所在的墙：门两边的墙裙和踢脚，钢门框两面都有，楼梯间一侧装闭门器，门上方一盏防潮吸顶灯；
 *   门口平台：水泥面层盖住楼层的地砖（地砖停在门口），门洞下一条门槛石；
 *   半层平台上方一盏防潮吸顶灯（不亮）和一段穿线管，靠墙一根红色消防立管（逐层接起来是一根）；
 *   酒店 / 公寓：门口平台侧墙上的消火栓箱。
 * 梯段数不是标准两跑（maxRisers 拆成多个回合）的楼梯只画门口那部分。
 */
function stairDetails(B, building, stairs, detail, flights, paint) {
  const C = B.get(paint), M = B.get('extMetal'), inset = detail.inset;
  for (const s of stairs) {
    const d = detail.stairs?.[s.id];
    if (!d) continue;
    const p = towerStairPlan(s), dir = p.direction, r = s.rect, dz = s.door.z0;
    const Z = (v) => dz + dir * v, vf = inset, vo = inset - .2, vBack = p.depth - inset;
    const xl = r.x0 + inset, xr = r.x1 - inset;
    const mine = flights.filter((f) => f.stair === s.id);
    const f1 = mine.find((f) => f.id.endsWith('-flight-1')), f2 = mine.find((f) => f.id.endsWith('-flight-2'));
    const V = (z) => (z - dz) * dir;
    const doors = [...d.doors].sort((a, b) => a.x0 - b.x0), nIn = [0, dir];
    const standard = f1 && f2 && mine.length === 2, h = standard ? f2.top.y : null;
    // ---- 抹灰面层（贴在混凝土墙上，3 mm）：两侧墙、后墙、门墙（让开门洞，门头以上补满）----
    if (detail.lining && h) {
      const W = STAIR_PAINT.wall;
      for (const [x, n] of [[xl, 1], [xr, -1]]) wallStrip(C, [x + n * .003, Z(vf)], [x + n * .003, Z(vBack)], 0, 0, h, [n, 0], W);
      wallStrip(C, [xl, Z(vBack - .003)], [xr, Z(vBack - .003)], 0, 0, h, [0, -dir], W);
      let x = xl;
      for (const q of doors) {
        if (q.x0 - x > .02) wallStrip(C, [x, Z(vf + .003)], [q.x0, Z(vf + .003)], 0, 0, h, nIn, W);
        wallStrip(C, [q.x0, Z(vf + .003)], [q.x1, Z(vf + .003)], detail.head, detail.head, h - detail.head, nIn, W);
        x = q.x1;
      }
      if (xr - x > .02) wallStrip(C, [x, Z(vf + .003)], [xr, Z(vf + .003)], 0, 0, h, nIn, W);
    }
    // ---- 两侧墙：沿行走面（门口平台 0、梯段前缘线、半层平台）的折线画墙裙 / 腰线 / 踢脚 ----
    let vE = null, vEnd = null, mid = null;
    if (standard) {
      const run = GOING, land = building.access.surfaces.find((q) => q.stair === s.id && Math.abs(q.elev - f1.top.y) < 1e-6);
      mid = f1.top.y;
      vEnd = land ? Math.max(V(land.rect.z0), V(land.rect.z1)) : V(f1.localTop[1]) + 1.35;
      const vS = V(f1.localBottom[1]);
      vE = V(f1.localTop[1]);
      // 折线的斜段过每级踏步前缘，往两头延长到与平台标高相交（差一级的水平距离），两端接平台的水平段。
      const left = [[vf, 0], [vS - run, 0], [vE - run, mid], [vEnd, mid]];
      // 右墙（第二跑）：门口平台那段属于本层（下一层的第二跑在这里落地），本层第二跑从半层平台升到上一层。
      const rightOwn = [[vf, 0], [vS + run, 0]], rightRun = [[vE + run, mid], [vS + run, h]], rightLand = [[vE + run, mid], [vEnd, mid]];
      const paintWall = (x, n, pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const [va, ya] = pts[i], [vb, yb] = pts[i + 1];
          if (Math.abs(vb - va) < 1e-3) continue;
          const a = [x + n * .006, Z(va)], b = [x + n * .006, Z(vb)], nn = [n, 0];
          wallStrip(C, a, b, ya - .03, yb - .03, DADO_HEIGHT + .03, nn, STAIR_PAINT.dado);
          wallStrip(C, [a[0] + n * .003, a[1]], [b[0] + n * .003, b[1]], ya + DADO_HEIGHT - .035, yb + DADO_HEIGHT - .035, .035, nn, STAIR_PAINT.dadoLine);
          wallStrip(C, [a[0] + n * .006, a[1]], [b[0] + n * .006, b[1]], ya - .03, yb - .03, SKIRTING_HEIGHT + .03, nn, STAIR_PAINT.skirting);
        }
      };
      paintWall(xl, 1, left);
      paintWall(xr, -1, rightOwn);
      paintWall(xr, -1, rightRun);
      paintWall(xr, -1, rightLand);
      // 半层平台上方的防潮吸顶灯：贴左墙、平台中间，离平台 2.2 m（第一跑往上走时在前方左手边，转身上第二跑时在身后）；
      // 一根穿线管从灯顶上到上一层平台底。不吸在上一层半层平台的板底：最顶上一层往上是屋面，板底不存在，
      // 而它和下面的楼层共用一份模板（分出去要多存一份模板）。
      const lz = Z((vE + vEnd) / 2), ly = mid + Math.min(2.2, h - .7), top = mid + h - .25;
      bulkhead(C, M, [xl, lz], [1, 0], ly);
      M.box(xl + .025, (ly + .15 + top) / 2, lz, .022, Math.max(.05, top - ly - .15), .022, STAIR_PAINT.conduit);
      // 红色消防立管：半层平台外沿再往里 15 cm，贴左墙，整层高（上下层接成一根），两道管卡。
      const pv = Math.min(vEnd + .16, p.depth - inset - .1), px = xl + .09;
      tube(M, { x: px, y: 0, z: Z(pv) }, { x: px, y: h, z: Z(pv) }, .055, STAIR_PAINT.pipe);
      for (const y of [.6, mid + .6]) M.box(xl + .04, y, Z(pv), .08, .05, .13, STAIR_PAINT.bracket);
    }
    // ---- 门口平台：水泥面层（楼层地砖停在门口，楼梯间里是水泥地），门洞下一条门槛石 ----
    if (doors.length) {
      // 一直铺到楼板开洞处（梯井洞口从 2 m 起，towerStairPlan.shaftRect），第一级踏步下面那一小条也盖住
      const vEdge = 2;
      upface(C, (xl + xr) / 2, .008, Z((vf + vEdge) / 2), xr - xl, vEdge - vf, STAIR_PAINT.landing);
      for (const q of doors) C.box((q.x0 + q.x1) / 2, .007, Z((vf + vo) / 2), q.x1 - q.x0, .014, vf - vo + .04, STAIR_PAINT.threshold);
    }
    // ---- 门所在的墙（楼梯间一侧）：门两边的墙裙和踢脚 ----
    let x = xl;
    const spans = [];
    for (const q of doors) { spans.push([x, q.x0 - .07]); x = q.x1 + .07; }
    spans.push([x, xr]);
    for (const [a, b] of spans) {
      if (b - a < .05) continue;
      if (d.partition != null && a < d.partition && b > d.partition) continue;
      const z = Z(vf + .006);
      wallStrip(C, [a, z], [b, z], -.03, -.03, DADO_HEIGHT + .03, nIn, STAIR_PAINT.dado);
      wallStrip(C, [a, Z(vf + .009)], [b, Z(vf + .009)], DADO_HEIGHT - .035, DADO_HEIGHT - .035, .035, nIn, STAIR_PAINT.dadoLine);
      wallStrip(C, [a, Z(vf + .012)], [b, Z(vf + .012)], -.03, -.03, SKIRTING_HEIGHT + .03, nIn, STAIR_PAINT.skirting);
    }
    // ---- 钢门框（两面各一圈贴脸）、楼梯间一侧的闭门器、门上方的防潮吸顶灯 ----
    const headY = detail.head;
    for (const q of doors) {
      const w = q.x1 - q.x0, cx = (q.x0 + q.x1) / 2;
      for (const v of [vf + .012, vo - .012]) {
        const z = Z(v);
        for (const jx of [q.x0 - .03, q.x1 + .03]) M.box(jx, headY / 2, z, .06, headY, .024, STAIR_PAINT.frame);
        M.box(cx, headY + .03, z, w + .12, .06, .024, STAIR_PAINT.frame);
      }
      // 门洞的侧壁和顶面包一圈门框（墙厚那一段），不然门洞里露出白色墙芯，看着像墙上挖了个洞而不是装了樘门；
      // 只贴 4 mm，不进门洞净宽。
      const vm = (vf + vo) / 2, dv = vf - vo;
      for (const [jx, s] of [[q.x0, 1], [q.x1, -1]]) M.box(jx + s * .001, headY / 2, Z(vm), .006, headY, dv, STAIR_PAINT.frame);
      M.box(cx, headY - .003, Z(vm), w, .006, dv, STAIR_PAINT.frame);
      const hinge = d.partition != null && cx > d.partition ? q.x1 : q.x0;
      const cz = Z(vf + .045), sx = hinge === q.x0 ? 1 : -1;
      M.box(hinge + sx * .3, headY + .14, cz, .3, .07, .06, STAIR_PAINT.closer);
      M.box(hinge + sx * .48, headY + .1, Z(vf + .07), .26, .02, .02, STAIR_PAINT.closer);
      if (h && h - headY > .75) {
        const ly = headY + .4, ceilY = h - .3;
        bulkhead(C, M, [cx, Z(vf)], nIn, ly);
        M.box(cx, (ly + .15 + ceilY) / 2, Z(vf + .022), .022, Math.max(.05, ceilY - ly - .15), .022, STAIR_PAINT.conduit);
      }
    }
    // 门口平台临梯井的一侧：社区塔楼没有围护墙那边画的护栏，这里补一段短栏杆。
    if (detail.wellGuard && f1 && f2) {
      const gx0 = p.centers[0] + p.width / 2 + .02, gx1 = p.centers[1] - p.width / 2 - .02, gz = Z(2 - .03);
      if (gx1 - gx0 > .1) {
        tube(C, { x: gx0, y: 1.07, z: gz }, { x: gx1, y: 1.07, z: gz }, .028, STAIR_PAINT.rail);
        const n = Math.max(1, Math.round((gx1 - gx0) / .11));
        for (let k = 0; k <= n; k++) post(M, gx0 + (gx1 - gx0) * k / n, .53, gz, .015, 1.06, .015, STAIR_PAINT.baluster);
      }
    }
    // ---- 门口平台侧墙上的消火栓箱（酒店 / 公寓）：盖在墙裙外面（墙裙、腰线、踢脚最外 1.2 cm） ----
    if (d.inner) {
      const n = d.inner.side === 'L' ? 1 : -1, wx = (n > 0 ? xl : xr) + n * .014;
      // u 沿墙朝里（离门越来越远）；箱子把手在离门远的一边。
      lobbyBox(B, d.inner, (u, o) => [wx + n * o, Z(d.inner.v + u)], false, paint);
    }
  }
}

/**
 * 防潮吸顶灯（楼梯间常见的那种圆形壁灯，不亮）：深灰铸铝底座（8 边形，直径 30 cm）、
 * 5.5 cm 厚的乳白灯罩（比墙面暖、亮一点，手电一扫就看得出是盏灯）、一横一竖两道黑色护栏。
 * at：墙面上的点 [x, z]；n：墙面朝外的法线 [nx, nz]，y：灯中心高度；n 为 null 时吸顶，y 是板底标高。
 */
function bulkhead(C, M, at, n, y) {
  const [x, z] = at;
  if (!n) {
    // 吸顶：y 是板底，灯往下挂
    ceilingDisc(M, x, y, z, .15, .024, STAIR_PAINT.lampBase);
    ceilingDisc(C, x, y - .022, z, .12, .055, STAIR_PAINT.lamp);
    M.box(x, y - .083, z, .26, .012, .014, STAIR_PAINT.cage);
    M.box(x, y - .083, z, .014, .012, .26, STAIR_PAINT.cage);
    return;
  }
  const [nx, nz] = n, P = (o) => [x + nx * o, z + nz * o];
  puck(M, P(0), n, y, .15, .024, STAIR_PAINT.lampBase);
  puck(C, P(.022), n, y, .12, .055, STAIR_PAINT.lamp);
  const [cx, cz] = P(.083);
  const across = Math.abs(nx) > .5;
  M.box(cx, y, cz, across ? .012 : .26, .014, across ? .26 : .012, STAIR_PAINT.cage);
  M.box(cx, y, cz, across ? .012 : .014, .26, across ? .014 : .012, STAIR_PAINT.cage);
}
/** 贴墙的扁圆柱（底面在墙上，轴线沿法线 n）；没有 shape 的批次（测试记录器）退回盒子。 */
function puck(g, at, n, y, r, depth, color) {
  if (!g.shape) { g.box(at[0] + n[0] * depth / 2, y, at[1] + n[1] * depth / 2, Math.abs(n[0]) > .5 ? depth : 2 * r, 2 * r, Math.abs(n[0]) > .5 ? 2 * r : depth, color); return; }
  _q.setFromUnitVectors(UP, _d.set(n[0], 0, n[1]));
  g.shape('cyl8', _p.set(at[0], y, at[1]), _q, _s.set(2 * r, depth, 2 * r), color);
}

/**
 * 候梯厅（社区塔楼自己的楼层，lobbySpec 的结果）：
 *   迎面电梯：拉丝不锈钢门套（6.5 cm 宽，压在原来的门头上）；呼梯面板是 residence-interiors 画的，不重复；
 *   电梯墙垛：消火栓箱（西侧），出楼梯门迎面就看得到；两樘楼梯门之间：手动报警按钮和消防电话插孔；
 *   踢脚：电梯墙、楼梯门墙沿墙一圈（让开电梯门洞和楼梯门）；
 *   吊顶：两盏 36 cm 圆形吸顶灯（深色边框 + 乳白灯罩，停电时手电照得出来）和一块 60 cm 检修口。
 */
function lobbyDetails(B, L, paint) {
  const C = B.get(paint), M = B.get('extMetal'), { z0, z1, nz } = L;
  const skirt = (z, n, ranges, gaps) => {
    for (const [a0, b0] of ranges) {
      let ivs = [[a0, b0]];
      for (const [a, b] of gaps) ivs = ivs.flatMap(([p, q]) => [[p, Math.min(q, a)], [Math.max(p, b), q]]).filter(([p, q]) => q - p > .05);
      for (const [a, b] of ivs) C.box((a + b) / 2, .06, z + n * .008, b - a, .12, .016, STAIR_PAINT.lobbySkirting);
    }
  };
  // 电梯墙：门洞两边各让 0.1 m（门套）；楼梯门墙：只在两部楼梯各自的墙段上（中间那道缝是核心筒的墙垛，退进 10 cm）
  skirt(z0, nz, [[L.x0, L.x1]], L.gaps.map(([a, b]) => [a - .1, b + .1]));
  const doorWall = L.stairDoors.map(([a, b]) => [a, b]);
  skirt(z1, -nz, [[L.x0, Math.min(...doorWall.map((q) => q[1])) + .05], [Math.max(...doorWall.map((q) => q[0])) - .05, L.x1]], doorWall.map(([a, b]) => [a - .07, b + .07]));
  if (L.face) {
    const { x0, x1 } = L.face, w = x1 - x0, zf = z0 + nz * .015;
    // 门套同理走刷漆批次（浅钢灰），手电照上去是一圈亮边
    for (const jx of [x0 - .035, x1 + .035]) C.box(jx, 1.17, zf, .065, 2.34, .03, STAIR_PAINT.steel);
    C.box((x0 + x1) / 2, 2.37, zf, w + .135, .07, .03, STAIR_PAINT.steel);
  }
  for (const b of L.boxes) lobbyBox(B, b, (u, o) => [b.x + u, z0 + nz * o], true, paint);
  // 手动报警按钮 + 消防电话插孔：两部楼梯门之间那道墙垛上（1.4 m / 1.25 m 高）
  if (L.alarm != null) {
    const zf = L.doorLine - nz * .012;
    C.box(L.alarm, 1.4, zf, .1, .1, .024, STAIR_PAINT.alarm);
    M.box(L.alarm, 1.4, zf - nz * .013, .05, .05, .004, STAIR_PAINT.hydrantLabel);
    C.box(L.alarm, 1.25, zf, .07, .07, .02, STAIR_PAINT.alarm);
  }
  // 吊顶：灯在候梯厅中线、迎面电梯两侧（让开 community 那三条灯带），检修口在两灯之间靠楼梯门一侧
  const cy = L.ceiling, zc = (z0 + z1) / 2, lampX = L.face && L.fire ? [(L.fire[0] + L.face.x0) / 2, (L.face.x1 + L.fire[1]) / 2] : [];
  for (const x of lampX) {
    ceilingDisc(M, x, cy, zc, .18, .03, STAIR_PAINT.lampRim);
    ceilingDisc(C, x, cy - .03, zc, .145, .018, STAIR_PAINT.lamp);
  }
  if (L.face) {
    const px = (L.face.x0 + L.face.x1) / 2, pz = z1 - nz * .55;
    // 检修口：和吊顶差不多的灰，只有一圈深色缝看得出来（抹灰批次夜里有一点自发光，太浅会像一块灯片）
    C.box(px, cy - .004, pz, .62, .008, .62, STAIR_PAINT.lampRim);
    C.box(px, cy - .009, pz, .58, .004, .58, STAIR_PAINT.panel);
  }
}
/** 吸顶的扁圆柱（顶面贴在 y 处的吊顶上，往下 depth）；没有 shape 的批次退回盒子。 */
function ceilingDisc(g, x, y, z, r, depth, color) {
  if (!g.shape) { g.box(x, y - depth / 2, z, 2 * r, depth, 2 * r, color); return; }
  _q.identity();
  g.shape('cyl8', _p.set(x, y - depth, z), _q, _s.set(2 * r, depth, 2 * r), color);
}

/**
 * 嵌墙箱子。坐标按墙走：u 沿墙（箱子中心 0），o 离墙面往外；at(u, o) 换成模板的 [x, z]，
 * alongX 表示墙沿 x 走（门所在的墙、电梯墙）还是沿 z 走（楼梯间侧墙）。
 * paint / metal：刷漆面 / 金属的批次（模板里是 plaster / extMetal；一期宿主楼层的候梯厅用 satin / metal）；y0：楼面标高。
 */
export function lobbyBox(B, lobby, at, alongX, paint = 'concrete', metal = 'extMetal', y0 = 0) {
  const C = B.get(paint), M = B.get(metal), w = lobby.w;
  const put = (g, u, y, o, su, sy, so, color) => { const [x, z] = at(u, o); g.box(x, y0 + y, z, alongX ? su : so, sy, alongX ? so : su, color); };
  const ring = (g, u, y, o, wu, hy, t, depth, color) => {
    put(g, u, y + hy / 2 - t / 2, o, wu, t, depth, color); put(g, u, y - hy / 2 + t / 2, o, wu, t, depth, color);
    put(g, u - wu / 2 + t / 2, y, o, t, hy - 2 * t, depth, color); put(g, u + wu / 2 - t / 2, y, o, t, hy - 2 * t, depth, color);
  };
  // 贴在箱面上的一片（白字的笔画）：只画朝外的一面，2 个三角形
  const [ox, oz] = at(0, 0), [nx1, nz1] = at(0, 1), out = new THREE.Vector3(nx1 - ox, 0, nz1 - oz).normalize();
  const faceQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
  const face = (g, u, y, o, su, sy, color) => {
    if (!g.shape) { put(g, u, y, o, su, sy, .002, color); return; }
    const [x, z] = at(u, o); g.shape('plane', _p.set(x, y0 + y, z), faceQ, _s.set(su, sy, 1), color);
  };
  const P = STAIR_PAINT;
  if (lobby.kind === 'hydrant') {
    // 消火栓 + 灭火器组合箱（嵌墙，凸出 3.6 cm）：一圈 3.5 cm 不锈钢包边，红色烤漆门分上下两樘（中间 2 cm 缝）。
    // 上樘消火栓门：大玻璃窗（门高六成，退进 1 cm），后面是深色箱膛和红色水带卷盘，玻璃上白字「消火栓」；
    // 下樘灭火器门：白字「灭火器」。两樘门都有一个深色拉手槽（离门轴远的一边）。
    const H0 = .1, H1 = 1.9, hu = .02, split = .78, f = .035;
    // 包边用刷漆批次的浅灰：金属批次在停电的暗处没有东西可反射，会变成一圈发蓝的黑框，读不出是不锈钢
    ring(C, 0, (H0 + H1) / 2, .018, w, H1 - H0, f, .036, P.hydrantFrame);
    put(C, 0, (H0 + H1) / 2, .006, w - 2 * f + .004, H1 - H0 - 2 * f + .004, .012, P.hydrantInside);   // 箱膛（门缝里看得到）
    const iw = w - 2 * f - .006, upper = [split + hu / 2, H1 - f - .003], lower = [H0 + f + .003, split - hu / 2];
    // 下樘门
    put(C, 0, (lower[0] + lower[1]) / 2, .024, iw, lower[1] - lower[0], .02, P.hydrant);
    // 上樘门：窗框四边是门板，中间开窗
    const gy0 = upper[0] + .22, gy1 = upper[1] - .09, gw = iw - .14;
    put(C, 0, (upper[0] + gy0) / 2, .024, iw, gy0 - upper[0], .02, P.hydrant);
    put(C, 0, (gy1 + upper[1]) / 2, .024, iw, upper[1] - gy1, .02, P.hydrant);
    for (const s of [-1, 1]) put(C, s * (gw / 2 + (iw - gw) / 4), (gy0 + gy1) / 2, .024, (iw - gw) / 2, gy1 - gy0, .02, P.hydrant);
    // 窗里：箱膛上挂着水带卷盘（深红圆盘 + 银色盘心）；玻璃退进 1 cm，只画一圈压条（玻璃本身不画，免得挡住卷盘）
    const ry = (gy0 + gy1) / 2 - .02;
    if (C.shape && M.shape) {
      _q.setFromUnitVectors(UP, out);
      const [rx, rz] = at(-.04, .012), [hx, hz] = at(-.04, .026);
      C.shape('cyl8', _p.set(rx, y0 + ry, rz), _q, _s.set(.36, .014, .36), P.hoseReel);
      M.shape('cyl8', _p.set(hx, y0 + ry, hz), _q, _s.set(.1, .005, .1), P.hydrantFrame);
    } else put(C, -.04, ry, .019, .36, .36, .014, P.hoseReel);
    ring(M, 0, (gy0 + gy1) / 2, .025, gw, gy1 - gy0, .012, .006, P.hydrantGlass);
    // 白字：玻璃上沿「消火栓」三个字块，下樘门「灭火器」三个字块（顶点色字块，近看是字的轮廓，远看是一行白字）
    // 每个字：左边一竖（偏旁）、右边上中下三横和一竖，远看就是一行方块字（不是哪个具体的字，免得笔画糊成怪符号）
    const glyphs = (y, o, size) => { for (const k of [-1, 0, 1]) {
      const u = k * size * 1.3, t = size * .13;
      face(C, u - size * .36, y, o, t, size * .85, P.hydrantLabel);
      for (const [dy, w] of [[.36, .62], [0, .5], [-.36, .66]]) face(C, u + size * .1, y + dy * size, o, size * w, t, P.hydrantLabel);
      face(C, u + size * .12, y, o, t, size * .78, P.hydrantLabel);
    } };
    glyphs(gy1 - .05, .0325, .075);
    glyphs((lower[0] + lower[1]) / 2 + .1, .037, .07);
    // 拉手槽
    for (const yc of [(upper[0] + upper[1]) / 2, (lower[0] + lower[1]) / 2]) put(M, iw / 2 - .05, yc, .0345, .022, .13, .004, P.hydrantInside);
  } else {
    // 电表箱 + 弱电箱：灰色钢门，上大下小两樘，一圈分缝，门锁和百叶。
    for (const [y, h] of [[1.55, .72], [.82, .58]]) {
      put(C, 0, y, .012, w, h, .024, P.meter);
      put(M, 0, y + h / 2 - .012, .026, w, .01, .006, P.meterSeam);
      put(M, 0, y - h / 2 + .012, .026, w, .01, .006, P.meterSeam);
      put(M, w / 2 - .08, y, .03, .025, .07, .02, P.bracket);
      for (let k = 0; k < 4; k++) put(M, -.1, y - h / 2 + .1 + k * .035, .026, w * .4, .012, .006, P.meterSeam);
    }
    // 上樘的观察窗（看电表读数）
    put(M, .08, 1.68, .025, .26, .12, .004, P.hydrantGlass);
  }
}

/**
 * 模板几何去重成带索引的几何：合批出来的盒子每个面各自 6 个顶点（一个盒子 36 个），位置、法线、颜色、UV 完全相同的
 * 顶点其实只要存一份（盒子 24 个、平面 4 个、圆柱侧面共用）。模板常驻显存、每层实例都要过一遍顶点着色器，
 * 去重后顶点少三成多，画面一个像素都不变。键是各属性的原始数值，完全相等才合并。
 */
function indexTemplate(g) {
  const n = g.attributes.position.count;
  if (g.index || n < 3) return g;
  // 每个顶点的各属性按原始位打包成几个 32 位字（浮点取位模式，8 / 16 位整数挤进一个字），哈希表开放寻址，逐字比较确认。
  // 一份模板一两万个顶点，几毫秒（拼字符串做键要几十毫秒，酒店、公寓建楼时会卡一下）。
  const parts = Object.values(g.attributes).map((a) => {
    const arr = a.array, k = a.itemSize;
    if (arr instanceof Float32Array) return { words: k, get: (i, out, o) => { for (let c = 0; c < k; c++) { F32[0] = arr[i * k + c]; out[o + c] = U32[0]; } } };
    const bits = arr.BYTES_PER_ELEMENT * 8, per = Math.floor(32 / bits), words = Math.ceil(k / per), mask = bits === 32 ? -1 : (1 << bits) - 1;
    return { words, get: (i, out, o) => { for (let w = 0; w < words; w++) { let v = 0; for (let c = w * per; c < Math.min(k, (w + 1) * per); c++) v |= (arr[i * k + c] & mask) << ((c - w * per) * bits); out[o + w] = v >>> 0; } } };
  });
  const W = parts.reduce((t, q) => t + q.words, 0), words = new Uint32Array(n * W);
  for (let i = 0; i < n; i++) { let o = i * W; for (const q of parts) { q.get(i, words, o); o += q.words; } }
  let size = 1; while (size < n * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1), remap = new Uint32Array(n), keep = [];
  for (let i = 0; i < n; i++) {
    let h = 2166136261;
    for (let c = 0; c < W; c++) h = Math.imul(h ^ words[i * W + c], 16777619);
    let slot = (h >>> 0) & (size - 1), j;
    for (;;) {
      j = table[slot];
      if (j < 0) { j = keep.length; table[slot] = j; keep.push(i); break; }
      const a = keep[j] * W, b = i * W; let same = true;
      for (let c = 0; c < W; c++) if (words[a + c] !== words[b + c]) { same = false; break; }
      if (same) break;
      slot = (slot + 1) & (size - 1);
    }
    remap[i] = j;
  }
  if (keep.length > n * .9) return g;
  for (const [name, a] of Object.entries(g.attributes)) {
    const out = new a.array.constructor(keep.length * a.itemSize), k = a.itemSize;
    for (let j = 0; j < keep.length; j++) for (let c = 0; c < k; c++) out[j * k + c] = a.array[keep[j] * k + c];
    g.setAttribute(name, new THREE.BufferAttribute(out, k, a.normalized));
  }
  g.setIndex(new THREE.BufferAttribute(keep.length < 65536 ? new Uint16Array(remap) : remap, 1));
  return g;
}
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);

/** Repeated 3.4m flights share one geometry per material. Only the current,
 * preceding and following floors need visible flights inside an enclosed shaft;
 * the protective walls and roof housings remain in the permanent facade batch.
 * 同一层高、同一细部做法（stairDetailKey）的楼层共用一份模板：墙裙、扶手、门框这些逐层重复的细部都在模板里，
 * 不会逐层复制。 */
export function buildTowerStairInstances(ctx, building, levels, stairs, materials, exterior, { idle = null, follow = false, lazy = false } = {}) {
  if (!building.access?.protected) return;
  const buckets=new Map(),records=[],flightsOf=id=>building.access.flights.filter(f=>f.parentFloor===id&&protectedFlight(f));
  for(const lv of levels.filter(l=>flightsOf(l.id).length)) {
    const spec=stairDetailSpec(building,lv,stairs,ctx.layout?.elevators),key=stairDetailKey(lv,spec);
    if(!buckets.has(key))buckets.set(key,{spec,members:[]});
    buckets.get(key).members.push(lv);
  }
  // lazy: a storey-height bucket builds its flight geometry the first time one of its floors shows.
  const instance=record=>{
    const {members,spec}=record,lv=members[0],offset=lv.elev;
    const access={protected:true,
      flights:flightsOf(lv.id).map(f=>({...f,
        bottom:{...f.bottom,y:f.bottom.y-offset},top:{...f.top,y:f.top.y-offset}})),
      surfaces:building.access.surfaces.filter(s=>s.parentFloor===lv.id).map(s=>({...s,elev:s.elev-offset})),
    };
    const batch=new BatchSet(materials),template=new THREE.Group();
    // 刷漆面走 plaster（无缝抹灰）；材质表里没有就退回 concrete，模板仍然只有两个批次。
    buildTowerStairGeometry(batch,{...building,access},[],stairs,{enclosures:false,detail:spec,paint:materials.plaster?'plaster':'concrete'});
    batch.flush(template);
    const meshes=[];
    for(const source of [...template.children]) {
      indexTemplate(source.geometry);
      const mesh=new THREE.InstancedMesh(source.geometry,source.material,members.length);
      mesh.name=`${building.id}-protected-stairs-${lv.height}-${source.name}`;
      mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
      mesh.userData.towerStairs=true;mesh.sourceMesh=source;mesh.count=0;mesh.visible=false;
      exterior.add(mesh);meshes.push(mesh);
    }
    template.clear();record.meshes=meshes;
  };
  for(const {members,spec} of buckets.values()){const record={members,spec,meshes:null};if(!lazy)instance(record);records.push(record);}
  let last='';
  const update=app=>{
    // follow: a core rising through host levels shows its flights wherever the visitor walks them.
    const state=app.state,inside=state.explore?.building===building.id||(follow&&!!state.explore&&levels.some(l=>l.id===state.explore.level));
    const current=inside?state.explore.level:state.building===building.id?state.focus:null;
    const index=levels.findIndex(l=>l.id===current);
    const active=index>=0?levels.slice(Math.max(0,index-1),index+(inside?2:1)).map(l=>l.id)
      : idle||[levels.find(l=>l.short==='1F')?.id,levels.at(-2).id];
    const signature=active.join('|');if(signature===last)return;last=signature;
    for(const record of records) {
      const selected=record.members.filter(l=>active.includes(l.id));
      if(!record.meshes&&selected.length)instance(record);
      for(const mesh of record.meshes||[]) {
        for(const [i,lv] of selected.entries()) {
          const matrix=frameMatrix(building.frame);matrix.elements[13]=lv.elev;
          mesh.setMatrixAt(i,instanceMatrix(mesh.sourceMesh,matrix));
        }
        mesh.count=selected.length;mesh.visible=selected.length>0;
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.visible){mesh.boundingSphere=null;mesh.computeBoundingSphere();}
      }
    }
  };
  update({state:{}});
  ctx.dynamic.push({name:`${building.id}-protected-stairs`,update:(dt,time,app)=>update(app)});
}
