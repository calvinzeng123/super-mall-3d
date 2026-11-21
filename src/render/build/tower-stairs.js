import { towerStairPlan, GOING } from '../../layout/tower-stairs.js';
import * as THREE from 'three';
import { BatchSet, frameMatrix, instanceMatrix, tpl } from '../batch.js';

const WALL = '#dce1d8', STEP = '#c8cec3', METAL = '#607967';
/**
 * 楼梯间细部的顶点色。全部写进已有的 concrete / extMetal 两个批次（不加绘制调用）：
 * 刷漆、水磨石、木扶手这些不该反光的面走 concrete（粗糙、非金属），真金属（栏杆、门框、管卡）走 extMetal。
 * 停电时只有手电照明，颜色压在中灰附近：太白的面在手电光斑里会过曝，太黑的又什么都看不见。
 */
export const STAIR_PAINT = Object.freeze({
  tread: '#b4b1a7', riser: '#9d9e97', landing: '#aba99f', nosing: '#2b2e2c', soffit: '#c4c6bf',
  dado: '#89938a', dadoLine: '#47524b', skirting: '#4a4f4b',
  rail: '#5b4130', baluster: '#3a433e', bracket: '#5f6662',
  pipe: '#952c24', conduit: '#80857f', lamp: '#d7d3c2', lampBase: '#575c59',
  frame: '#4b524e', closer: '#6d726e',
  hydrant: '#8a2620', hydrantGlass: '#b9c7c6', hydrantLabel: '#e6e1d3', meter: '#8a918b', meterSeam: '#4c524e',
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
export function stairDetailSpec(building, lv, stairs) {
  const own = !!building.community && lv.building === building.id, inset = own ? .1 : .2;
  const cp = lv.corePlan, rooms = [...(cp?.landings || []).map((q) => q.rect), ...(cp?.corridor ? [cp.corridor] : [])];
  const inside = (x0, x1, z) => rooms.some((r) => x0 >= r.x0 + .1 && x1 <= r.x1 - .1 && z > r.z0 + .1 && z < r.z1 - .1);
  const sorted = [...stairs].sort((a, b) => a.rect.x0 - b.rect.x0);
  // 门洞上沿：社区塔楼自己楼层 2.3（community.js 的过梁），一期宿主楼层 2.2（residential-cores 的门头），其余 2.35。
  const head = own ? 2.3 : building.community ? 2.2 : 2.35;
  const out = { inset, head, wellGuard: !!building.community, stairs: {} };
  sorted.forEach((s, k) => {
    const passes = (s.passLevels || []).includes(lv.id) || !(s.serves || [lv.id]).includes(lv.id);
    const brk = passes ? null : stairBreak(s, null, lv.id);
    const doors = passes ? [] : brk ? brk.doors.map((d) => ({ x0: d.x0, x1: d.x1 })) : [{ x0: s.door.x0, x1: s.door.x1 }];
    let lobby = null;
    if (own && doors.length === 1 && rooms.length) {
      const d = doors[0], dir = s.door.side === 'S' ? -1 : 1, z = s.door.z0 - dir * (.2 - inset) - dir * .3;
      const left = d.x0 - (s.rect.x0 + inset), right = (s.rect.x1 - inset) - d.x1, w = .72;
      const x = left >= right ? d.x0 - .16 - w / 2 : d.x1 + .16 + w / 2;
      if (Math.max(left, right) >= w + .3 && inside(x - w / 2, x + w / 2, z)) lobby = { kind: k % 2 ? 'meter' : 'hydrant', x, w };
    }
    out.stairs[s.id] = { doors, partition: brk ? brk.partition.x0 : null, lobby };
  });
  return out;
}
/** 分组用的签名：层高 + 做法。 */
export const stairDetailKey = (lv, spec) => `${lv.height.toFixed(4)}|${JSON.stringify(spec)}`;

/** Called inside the building frame, batched into its permanent clipped shell.
 * Mid-flight geometry must survive loading the next visited dwelling floor.
 * detail（只在逐层实例化的模板里传）：stairDetailSpec 的结果，外加 height（这一层层高）；
 * 有了它，踏步伸到墙边、梯段下有斜底板，临井一侧是一步一根的栏杆和木扶手，靠墙一侧换成墙上扶手，
 * 再画墙裙、踢脚、门框、闭门器、壁灯、立管和门外的消火栓 / 表箱（stairDetails）。 */
export function buildTowerStairGeometry(B, building, levels, stairs, { enclosures = true, flights = true, detail = null } = {}) {
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
      rail(B,{x:p.centers[0]+p.width/2,y:y+1.05,z:frontEdge[1]},
        {x:p.centers[1]-p.width/2,y:y+1.05,z:frontEdge[1]});
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
    for(let i=0;i<f.steps;i++) {
      const t=(i+.5)/f.steps,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t,y=f.bottom.y+dy*(i+1)/f.steps;
      const edgeZ=z0+(z1-z0)*i/f.steps;
      if (d) {
        // 水磨石踏步 + 略深的踢面；前缘一条黑色金刚砂防滑条（两端留 6 cm，像真的嵌条）。
        B.get('concrete').box(tx,y-.07,z,tw,.14,f.run/f.steps+.006,tread);
        // 踢面盖住踏步板的前脸（踏步前脸比 edgeZ 外凸 3 mm），整级踢面一个颜色。
        vface(B.get('concrete'), tx, y - rise / 2, edgeZ - sz * .0045, tw, rise, -sz, riser);
        upface(B.get('concrete'), x, y + .002, edgeZ + sz * .045, f.width - .12, .05, STAIR_PAINT.nosing);
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
    const C = B.get('concrete'), M = B.get('extMetal');
    const zA = z0, zB = z1, yA = f.bottom.y - .14, yB = f.top.y - .14, th = .16;
    sheared(C, 'box', _p.set(tx, (yA + yB) / 2 - th / 2, (zA + zB) / 2), new THREE.Vector3(tw, 0, 0), new THREE.Vector3(0, th, 0), new THREE.Vector3(0, yB - yA, zB - zA), STAIR_PAINT.soffit);
    // 临井一侧：一级一根方钢立杆、离踏步 10 cm 的底横杆、顶上一根木扶手，两端各一根粗一点的望柱。
    const nose = (k) => ({ z: z0 + (z1 - z0) * k / f.steps, y: f.bottom.y + rise * (k + 1) }), H = .95, bx = edgeX - well * .035;
    const top = (k) => { const n = nose(k); return { x: bx, y: n.y + H, z: n.z }; };
    for (let i = 0; i < f.steps; i++) {
      // 扶手线过各级前缘 + H，立杆在踏步中间，所以比前缘处高半级。
      const zc = z0 + (z1 - z0) * (i + .5) / f.steps, yb = f.bottom.y + rise * (i + 1), yt = yb + H + rise / 2;
      M.box(bx, (yb + yt) / 2, zc, .018, yt - yb, .018, STAIR_PAINT.baluster);
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
    // 半层平台：伸到两侧墙皮，0.25 厚（接得住梯段底板）；临空的一边是栏杆（间距 0.25 m）和木扶手。
    const x0 = stair.rect.x0 + detail.inset, x1 = stair.rect.x1 - detail.inset;
    box(B, 'concrete', { ...s.rect, x0, x1 }, s.elev - .25, .25, STAIR_PAINT.landing);
    const gz = z - dir * .04, n = Math.max(2, Math.round((x1 - x0 - .1) / .25));
    for (let k = 1; k < n; k++) B.get('extMetal').box(x0 + (x1 - x0) * k / n, s.elev + .53, gz, .018, 1.06, .018, STAIR_PAINT.baluster);
    B.get('extMetal').box((x0 + x1) / 2, s.elev + .1, gz, x1 - x0, .022, .022, STAIR_PAINT.baluster);
    tube(B.get('concrete'), { x: x0, y: s.elev + 1.07, z: gz }, { x: x1, y: s.elev + 1.07, z: gz }, .028, STAIR_PAINT.rail);
    // 平台前缘一条黑色防滑条，和踏步一样。
    upface(B.get('concrete'), (stair.rect.x0 + stair.rect.x1) / 2, s.elev + .002, (dir < 0 ? s.rect.z1 : s.rect.z0) + dir * .045, x1 - x0 - .3, .05, STAIR_PAINT.nosing);
  }
  if (detail) stairDetails(B, building, stairs, detail, own);
}

/**
 * 楼梯间的墙面和门口（只在实例化模板里画，y 以本层楼面为 0）：
 *   两侧墙：墙裙（灰绿色，1.2 m，梯段处沿踏步前缘斜着走）、上沿一道深色腰线、踢脚线；
 *   门所在的墙：门两侧的墙裙和踢脚，钢门框两面都有，楼梯间一侧装闭门器；
 *   半层平台上方一盏防潮壁灯（不亮）和一段穿线管，靠墙一根红色消防立管（逐层接起来是一根）；
 *   门外（社区塔楼）：嵌墙的消火栓 + 灭火器组合箱，或电表箱 + 弱电箱。
 * 梯段数不是标准两跑（maxRisers 拆成多个回合）的楼梯只画门口那部分。
 */
function stairDetails(B, building, stairs, detail, flights) {
  const C = B.get('concrete'), M = B.get('extMetal'), inset = detail.inset;
  for (const s of stairs) {
    const d = detail.stairs?.[s.id];
    if (!d) continue;
    const p = towerStairPlan(s), dir = p.direction, r = s.rect, dz = s.door.z0;
    const Z = (v) => dz + dir * v, vf = inset, vo = inset - .2;
    const xl = r.x0 + inset, xr = r.x1 - inset;
    const mine = flights.filter((f) => f.stair === s.id);
    const f1 = mine.find((f) => f.id.endsWith('-flight-1')), f2 = mine.find((f) => f.id.endsWith('-flight-2'));
    const V = (z) => (z - dz) * dir;
    // ---- 两侧墙：沿行走面（门口平台 0、梯段前缘线、半层平台）的折线画墙裙 / 腰线 / 踢脚 ----
    if (f1 && f2 && mine.length === 2) {
      const run = GOING, mid = f1.top.y, h = f2.top.y, land = building.access.surfaces.find((q) => q.stair === s.id && Math.abs(q.elev - mid) < 1e-6);
      const vEnd = land ? Math.max(V(land.rect.z0), V(land.rect.z1)) : V(f1.localTop[1]) + 1.35;
      const vS = V(f1.localBottom[1]), vE = V(f1.localTop[1]);
      // 折线的斜段过每级踏步前缘，往两头延长到与平台标高相交（差一级的水平距离），两端接平台的水平段。
      const left = [[vf, 0], [vS - run, 0], [vE - run, mid], [vEnd, mid]];
      // 右墙（第二跑）：门口平台那段属于本层（下一层的第二跑在这里落地），本层第二跑从半层平台升到上一层。
      const rightOwn = [[vf, 0], [vS + run, 0]], rightRun = [[vE + run, mid], [vS + run, h]], rightLand = [[vE + run, mid], [vEnd, mid]];
      const paint = (x, n, pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const [va, ya] = pts[i], [vb, yb] = pts[i + 1];
          if (Math.abs(vb - va) < 1e-3) continue;
          const a = [x + n * .006, Z(va)], b = [x + n * .006, Z(vb)], nn = [n, 0];
          wallStrip(C, a, b, ya - .03, yb - .03, DADO_HEIGHT + .03, nn, STAIR_PAINT.dado);
          wallStrip(C, [a[0] + n * .003, a[1]], [b[0] + n * .003, b[1]], ya + DADO_HEIGHT - .035, yb + DADO_HEIGHT - .035, .035, nn, STAIR_PAINT.dadoLine);
          wallStrip(C, [a[0] + n * .006, a[1]], [b[0] + n * .006, b[1]], ya - .03, yb - .03, SKIRTING_HEIGHT + .03, nn, STAIR_PAINT.skirting);
        }
      };
      paint(xl, 1, left);
      paint(xr, -1, rightOwn);
      paint(xr, -1, rightRun);
      paint(xr, -1, rightLand);
      // 半层平台上方的防潮壁灯（铸铝底座 + 乳白灯罩 + 两道护栏），一段穿线管往上接到上一层平台底。
      const lz = Z((vE + vEnd) / 2), ly = mid + Math.min(2.25, h - .6);
      M.box(xl + .02, ly, lz, .04, .2, .3, STAIR_PAINT.lampBase);
      C.box(xl + .07, ly, lz, .07, .14, .24, STAIR_PAINT.lamp);
      for (const o of [-.045, .045]) M.box(xl + .108, ly + o, lz, .012, .012, .25, STAIR_PAINT.lampBase);
      M.box(xl + .02, (ly + .1 + mid + h - .25) / 2, lz, .025, Math.max(.05, h - .35 - (ly + .1 - mid)), .025, STAIR_PAINT.conduit);
      // 红色消防立管：半层平台外沿再往里 15 cm，贴左墙，整层高（上下层接成一根），两道管卡。
      const pv = Math.min(vEnd + .16, p.depth - inset - .1), px = xl + .09;
      tube(M, { x: px, y: 0, z: Z(pv) }, { x: px, y: h, z: Z(pv) }, .055, STAIR_PAINT.pipe);
      for (const y of [.6, mid + .6]) M.box(xl + .04, y, Z(pv), .08, .05, .13, STAIR_PAINT.bracket);
    }
    // ---- 门所在的墙（楼梯间一侧）：门两边的墙裙和踢脚 ----
    const doors = [...d.doors].sort((a, b) => a.x0 - b.x0), nIn = [0, dir];
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
    // ---- 钢门框（两面各一圈贴脸）和楼梯间一侧的闭门器 ----
    const headY = detail.head;
    for (const q of doors) {
      const w = q.x1 - q.x0, cx = (q.x0 + q.x1) / 2;
      for (const v of [vf + .012, vo - .012]) {
        const z = Z(v);
        for (const jx of [q.x0 - .03, q.x1 + .03]) M.box(jx, headY / 2, z, .06, headY, .024, STAIR_PAINT.frame);
        M.box(cx, headY + .03, z, w + .12, .06, .024, STAIR_PAINT.frame);
      }
      const hinge = d.partition != null && cx > d.partition ? q.x1 : q.x0;
      const cz = Z(vf + .045), sx = hinge === q.x0 ? 1 : -1;
      M.box(hinge + sx * .3, headY + .14, cz, .3, .07, .06, STAIR_PAINT.closer);
      M.box(hinge + sx * .48, headY + .1, Z(vf + .07), .26, .02, .02, STAIR_PAINT.closer);
    }
    // 门口平台临梯井的一侧：社区塔楼没有围护墙那边画的护栏，这里补一段短栏杆。
    if (detail.wellGuard && f1 && f2) {
      const gx0 = p.centers[0] + p.width / 2 + .02, gx1 = p.centers[1] - p.width / 2 - .02, gz = Z(2 - .03);
      if (gx1 - gx0 > .1) {
        tube(C, { x: gx0, y: 1.07, z: gz }, { x: gx1, y: 1.07, z: gz }, .028, STAIR_PAINT.rail);
        const n = Math.max(1, Math.round((gx1 - gx0) / .2));
        for (let k = 0; k <= n; k++) M.box(gx0 + (gx1 - gx0) * k / n, .53, gz, .018, 1.06, .018, STAIR_PAINT.baluster);
      }
    }
    // ---- 门外：前室墙上的消火栓箱 / 表箱，嵌墙只凸出 3 cm ----
    if (d.lobby) lobbyBox(B, d.lobby, Z(vo), -dir);
  }
}

/** 嵌墙箱子：外皮在 zf（墙外皮），面朝 nz（±1）。 */
function lobbyBox(B, lobby, zf, nz) {
  const C = B.get('concrete'), M = B.get('extMetal'), { x, w } = lobby, Z = (o) => zf + nz * o;
  if (lobby.kind === 'hydrant') {
    // 消火栓 + 灭火器组合箱：红色箱门，上格是带玻璃观察窗的消火栓门，下格灭火器门，各一条白色标识条。
    C.box(x, .9, Z(.015), w, 1.8, .03, STAIR_PAINT.hydrant);
    M.box(x, 1.24, Z(.032), w - .08, .012, .006, STAIR_PAINT.meterSeam);   // 上下两格的分缝
    C.box(x + .06, 1.62, Z(.033), w - .3, .38, .006, STAIR_PAINT.hydrantGlass);
    C.box(x, 1.37, Z(.033), w - .26, .07, .006, STAIR_PAINT.hydrantLabel);
    C.box(x, .95, Z(.033), w - .3, .06, .006, STAIR_PAINT.hydrantLabel);
    M.box(x + w / 2 - .07, 1.5, Z(.045), .03, .14, .03, STAIR_PAINT.bracket);  // 把手
    M.box(x + w / 2 - .07, .7, Z(.045), .03, .12, .03, STAIR_PAINT.bracket);
  } else {
    // 电表箱 + 弱电箱：灰色钢门，上大下小两樘，一圈分缝，门锁和百叶。
    for (const [y, h] of [[1.55, .72], [.82, .58]]) {
      C.box(x, y, Z(.012), w, h, .024, STAIR_PAINT.meter);
      M.box(x, y + h / 2 - .012, Z(.026), w, .01, .006, STAIR_PAINT.meterSeam);
      M.box(x, y - h / 2 + .012, Z(.026), w, .01, .006, STAIR_PAINT.meterSeam);
      M.box(x + w / 2 - .08, y, Z(.03), .025, .07, .02, STAIR_PAINT.bracket);
      for (let k = 0; k < 4; k++) M.box(x - .1, y - h / 2 + .1 + k * .035, Z(.026), w * .4, .012, .006, STAIR_PAINT.meterSeam);
    }
  }
}

/** Repeated 3.4m flights share one geometry per material. Only the current,
 * preceding and following floors need visible flights inside an enclosed shaft;
 * the protective walls and roof housings remain in the permanent facade batch.
 * 同一层高、同一细部做法（stairDetailKey）的楼层共用一份模板：墙裙、扶手、门框这些逐层重复的细部都在模板里，
 * 不会逐层复制。 */
export function buildTowerStairInstances(ctx, building, levels, stairs, materials, exterior, { idle = null, follow = false, lazy = false } = {}) {
  if (!building.access?.protected) return;
  const buckets=new Map(),records=[],flightsOf=id=>building.access.flights.filter(f=>f.parentFloor===id&&protectedFlight(f));
  for(const lv of levels.filter(l=>flightsOf(l.id).length)) {
    const spec=stairDetailSpec(building,lv,stairs),key=stairDetailKey(lv,spec);
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
    buildTowerStairGeometry(batch,{...building,access},[],stairs,{enclosures:false,detail:spec});
    batch.flush(template);
    const meshes=[];
    for(const source of [...template.children]) {
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
