// 住宅 / 公寓 / 酒店的单层内饰。调用方按当前楼层加载、移除，禁止全楼常驻。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { toW } from '../../layout/geom.js';
import { interiorDetail } from './interior-detail.js';
import { buildSuiteModels } from './suite-models.js';
import { buildResidentialModels } from './residential-models.js';

const roomCenter = (r) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const WARM = '#eee6d6';
const WOOD = '#ede2cd';
const DARK = '#354743';

/**
 * Return an unattached group and an idempotent disposer. All public coordinates
 * remain at lv.elev; the parent level group supplies exploded-floor offsets.
 * Shared ctx.mats.base materials / CC0 textures are never disposed here.
 */
export function buildResidenceFloor(ctx, L) {
  const lv = L.lv;
  const group = new THREE.Group();
  group.name = `residence-${lv.id}`;
  const B = new BatchSet(ctx.mats.base);
  const height = Math.max(2.6, (lv.height || lv.h || 3.5) - .30);
  const y0 = lv.elev;
  const labels = [];
  const wallKeys = new Set();

  for (const u of lv.units) {
    const residence = u.residence;
    if (!residence) continue;
    if (residence.prototype || (residence.suitePlan && ctx.suiteAsset)) {
      const entry = residence.entryDoor;
      const [x,z] = toW(u.frame, entry.at - entry.width / 2 - .24, -.12);
      const [nx,nz] = toW(u.frame,0,-1), [ox,oz] = toW(u.frame,0,0);
      labels.push({x,z,nx:nx-ox,nz:nz-oz,text:u.code.split('-').at(-1)});
      continue;
    }
    B.frame(u.frame, () => {
      const r = u.rects[0];
      const w = r.x1 - r.x0;
      const room = makeRoomTools(B, y0);
      const { box, cylinder, line } = room;
      // 木地板贯穿入户、起居与卧室，卫生间及阳台另做湿区材质。
      box('wood', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, .02, w - .14, r.z1 - r.z0 - .14, .024, WOOD);
      const front = u.fronts[0];
      const entry = residence.entryDoor || { at: w / 2, width: 1.25 };
      // 单元分隔墙共边只生成一次；所有门洞跟布局数据共用尺寸。
      wall([r.x0, r.z0], [r.x1, r.z0], entry, u, '#e6e0d2');
      wall([r.x0, r.z0], [r.x0, r.z1], null, u, '#eee8dc');
      wall([r.x1, r.z0], [r.x1, r.z1], null, u, '#eee8dc');
      for (const partition of residence.partitions || []) wall(partition.a, partition.b, partition.door, u, '#eee8dc');

      const doorX = front.x0 + entry.at;
      // 开放门扇靠入户墙边，门洞前后仍有连续净空。
      box('wood', doorX - entry.width / 2 + .055, r.z0 + .49, 1.08, .045, .94, 2.13, '#d9cab1');
      cylinder('metal', doorX - entry.width / 2 + .085, r.z0 + .82, 1.05, .018, .13, '#9a8b6b', 6);
      box('metal', doorX - entry.width / 2 - .29, r.z0 - .094, 1.59, .28, .025, .20, '#7b735c');
      box('glow', doorX + entry.width / 2 + .18, r.z0 - .075, 1.92, .075, .065, .27, '#f4dfb6');
      const num = String(u.number || u.roomNumber || u.code?.split('-').at(-1) || u.id.split('-').at(-1));
      const [labelX, labelZ] = toW(u.frame, doorX - entry.width / 2 - .29, r.z0 - .111);
      const [normalX, normalZ] = toW(u.frame, 0, -1);
      const [originX, originZ] = toW(u.frame, 0, 0);
      labels.push({ x: labelX, z: labelZ, nx: normalX - originX, nz: normalZ - originZ, text: num });

      for (const zone of residence.rooms || []) {
        if (zone.kind === 'bathroom') continue; // 使用 bathrooms 中的同一数据绘制一次。
        if (zone.kind === 'balcony') balcony(room, zone.rect);
        if (zone.kind === 'entry') entryStorage(room, zone.rect, w);
        if (zone.kind === 'kitchenette') kitchenette(room, zone.rect);
      }
      const bedroomPalette = residence.kind === 'hotel' ? ['#bdcfc5', '#c9b9a2', '#8faaa8'] : ['#d2c3ae', '#a5b8af', '#b6b4c9'];
      (residence.beds || []).forEach((bed, index) => bedSet(room, bed, bedroomPalette[index % bedroomPalette.length], residence.rooms.find((r) => r.id === bed.room)?.rect, residence.beds));
      for (const bathroom of residence.bathrooms || []) bathroomSet(room, bathroom.rect, height);
      if (residence.kitchen?.rect) kitchenSet(room, residence.kitchen.rect, height);
      if (residence.living?.rect) livingSet(room, residence.living.rect, residence.kind, height);
      const dining = residence.rooms?.find((z) => z.kind === 'dining');
      if (dining) diningSet(room, dining.rect, entry.at);
    });
  }

  // 公共楼梯间与套内一起惰性加载。电梯玻璃井由塔楼外壳构建器负责。
  for (const core of (lv.rooms || []).filter((r) => r.type === 'stair')) {
    if (core.continuous) continue; // Permanent shared flight/landing geometry lives in the tower shell.
    B.frame(core.frame, () => {
      const r = core.rects[0];
      const edges = [
        [[r.x0, r.z0], [r.x1, r.z0]], [[r.x1, r.z0], [r.x1, r.z1]],
        [[r.x1, r.z1], [r.x0, r.z1]], [[r.x0, r.z1], [r.x0, r.z0]],
      ];
      for (const [a, b] of edges) {
        const door = core.doors?.find((d) => Math.abs(a[0] - b[0]) < .01
          ? Math.abs(d.x0 - a[0]) < .01 && Math.abs(d.x1 - a[0]) < .01
          : Math.abs(d.z0 - a[1]) < .01 && Math.abs(d.z1 - a[1]) < .01);
        const opening = door ? { at: Math.hypot((door.x0 + door.x1) / 2 - a[0], (door.z0 + door.z1) / 2 - a[1]), width: Math.hypot(door.x1 - door.x0, door.z1 - door.z0) } : null;
        wall(a, b, opening, core, '#dce2d7');
      }
      const R = makeRoomTools(B, y0);
      if (core.shaftRect) {
        if (lv.kind !== 'roof') {
        // Residential stairs occupy the surveyed opening and connect exact
        // storey elevations. The return flight arrives at the front landing.
        const s = core.shaftRect, storey = lv.height, half = storey / 2;
        const steps = Math.max(10, Math.ceil(half / .17)), run = steps * .285;
        const back = s.z0 + 1.08, front = back + run;
        const flightWidth = Math.min(1.5, (s.x1 - s.x0 - .5) / 2);
        const centers = [s.x0 + flightWidth / 2 + .10, s.x1 - flightWidth / 2 - .10];
        for (const [side, x] of centers.entries()) {
          for (let k = 0; k < steps; k++) {
            const fraction = (k + .5) / steps;
            const z = side ? back + fraction * run : front - fraction * run;
            const top = side ? half + (k + 1) * half / steps : (k + 1) * half / steps;
            R.box('concrete', x, z, top - .065, flightWidth, run / steps + .005, .13, '#c9cfbf');
            R.box('metal', x, z + (side ? 1 : -1) * run / steps * .43, top + .006, flightWidth, .025, .012, '#859785');
          }
          const railX = x + (side ? -1 : 1) * flightWidth * .44;
          R.line('metal', railX, front, side ? storey + .94 : .94,
            railX, back, half + .94, .045, '#7b8f7b');
          for (let k = 0; k <= steps; k += 2) {
            const fraction = k / steps, z = front - fraction * run;
            const h = side ? storey - fraction * half : fraction * half;
            R.line('metal', railX, z, h + .03, railX, z, h + .94, .024, '#7b8f7b');
          }
        }
        R.box('concrete', (s.x0 + s.x1) / 2, s.z0 + .54, half - .075, s.x1 - s.x0, 1.08, .15, '#d6dacb');
        // Fill the uncut entry landing; bridge only each flight's approach in
        // the opening, keeping a real void between the two flights.
        for (const [side, x] of centers.entries()) R.box('concrete', x, (front + s.z1) / 2,
          (side ? storey : 0) - .075, flightWidth, s.z1 - front, .15, '#d6dacb');
        }
      } else {
      const run = Math.min(r.z1 - r.z0 - 3, 3.3);
      const steps = 11, rise = Math.min(height - .4, (lv.height || 3.4) / 2);
      const startZ = r.z0 + 1.2, flightWidth = Math.min(1.45, (r.x1 - r.x0 - 1.1) / 2);
      for (const [side, x] of [[0, r.x0 + flightWidth / 2 + .32], [1, r.x1 - flightWidth / 2 - .32]]) {
        for (let k = 0; k < steps; k++) {
          const z = startZ + (k + .5) * run / steps;
          const h = (k + 1) / steps * rise;
          // 两跑在半层平台折返，低层俯视能读出踏步及扶手。
          const top = side ? Math.min(height - .15, rise + (steps - k) / steps * rise) : h;
          R.box('concrete', x, z, top - .06, flightWidth, run / steps + .01, .12, '#c9cfbf');
          R.box('metal', x, z - run / steps * .43, top + .004, flightWidth, .023, .008, '#859785');
        }
        const railX = x + (side ? -1 : 1) * flightWidth * .44;
        R.line('metal', railX, startZ + .1, side ? height - .1 : .95, railX, startZ + run - .1, side ? rise + .88 : rise + .88, .04, '#7b8f7b');
      }
      R.box('concrete', (r.x0 + r.x1) / 2, startZ + run + .52, rise - .075, r.x1 - r.x0 - .35, 1.02, .15, '#d6dacb');
      }
      for (const door of core.doors || []) {
        const x = (door.x0 + door.x1) / 2, z = (door.z0 + door.z1) / 2;
        const nz = door.side === 'S' ? 1 : -1;
        const half = Math.abs(door.x1 - door.x0) / 2;
        for (const side of [-1, 1]) {
          R.box('metal', x + side * (half - .055), z - nz * .46, 1.08, .07, .91, 2.12, '#869b88');
          R.box('metal', x + side * (half - .10), z - nz * .49, 1.05, .05, .48, .035, '#d4d5bf');
        }
        R.box('glow', x, z + nz * .09, 2.48, .78, .045, .22, '#55906a');
        const p = toW(core.frame, x, z + nz * .12), origin = toW(core.frame, 0, 0), normal = toW(core.frame, 0, nz);
        labels.push({ x: p[0], z: p[1], nx: normal[0] - origin[0], nz: normal[1] - origin[1], text: 'STAIR', y: 2.48, w: .65, h: .17 });
      }
    });
  }

  // 候梯厅的楼层指示与呼梯面板属于当前楼层；井道和走道灯已由外壳合批。
  for (const e of (ctx.layout?.elevators || []).filter((e) => e.building === lv.building && e.serves.includes(lv.id))) {
    const nx = e.nx, nz = e.nz, tx = nz, tz = -nx;
    const x = e.x + nx * (e.reach + .065), z = e.z + nz * (e.reach + .065);
    const angle = Math.atan2(nx, nz);
    B.get('metal').box(x, y0 + 2.63, z, .59, .23, .045, '#556b5c', angle);
    labels.push({ x: x + nx * .027, z: z + nz * .027, nx, nz, text: lv.short, y: 2.63, w: .50, h: .19 });
    const panelX = x + tx * (e.w / 2 - .18), panelZ = z + tz * (e.w / 2 - .18);
    B.get('metal').box(panelX, y0 + 1.2, panelZ, .16, .40, .04, '#bdc5b6', angle);
    for (const h of [1.10, 1.28]) B.get('glowSoft').box(panelX + nx * .025, y0 + h, panelZ + nz * .025, .057, .057, .015, '#afd0b0', angle);
  }

  B.flush(group);
  const suite = buildSuiteModels(ctx, lv);
  if (suite) group.add(suite.group);
  const residential = buildResidentialModels(ctx, lv);
  if (residential) group.add(residential.group);
  const atlas = labelAtlas(labels, y0, group);
  let disposed = false;
  return {
    group,
    update(app) { suite?.update(app); residential?.update(app); },
    dispose() {
      if (disposed) return;
      disposed = true;
      suite?.dispose();
      residential?.dispose();
      group.removeFromParent();
      group.traverse((o) => { if (o.isMesh && !o.geometry.userData.sharedSuite && !o.geometry.userData.sharedResidential) o.geometry.dispose(); });
      group.clear();
      atlas?.texture.dispose();
      atlas?.material.dispose();
    },
  };

  function wall(a, b, door, u, color) {
    const aw = toW(u.frame, ...a), bw = toW(u.frame, ...b);
    const points = [aw.map((n) => n.toFixed(3)).join(','), bw.map((n) => n.toFixed(3)).join(',')].sort();
    const key = `${points.join('|')}:${door ? `${door.at}:${door.width}` : 'solid'}`;
    if (wallKeys.has(key)) return;
    wallKeys.add(key);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < .01) return;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const angle = Math.atan2(-dz, dx);
    const piece = (start, end, low, high, key = 'matte', col = color, thickness = .14) => {
      if (end - start <= .01) return;
      B.get(key).box(a[0] + dx * (start + end) / 2, y0 + (low + high) / 2, a[1] + dz * (start + end) / 2, end - start, high - low, thickness, col, angle);
    };
    if (!door) {
      piece(0, len, .03, height);
      piece(0, len, .03, .13, 'wood', '#dcd0b9', .165);
      return;
    }
    const d0 = Math.max(0, door.at - door.width / 2), d1 = Math.min(len, door.at + door.width / 2);
    piece(0, d0, .03, height);
    piece(d1, len, .03, height);
    piece(d0, d1, 2.22, height);
    piece(0, d0, .03, .13, 'wood', '#dcd0b9', .165);
    piece(d1, len, .03, .13, 'wood', '#dcd0b9', .165);
    piece(d0 - .03, d0 + .025, .03, 2.24, 'wood', '#e0d3bd', .18);
    piece(d1 - .025, d1 + .03, .03, 2.24, 'wood', '#e0d3bd', .18);
    piece(d0 - .03, d1 + .03, 2.2, 2.26, 'wood', '#e0d3bd', .18);
  }
}

function makeRoomTools(B, y0) {
  const P = (key, a, b, y, w, d, h, color, rot = 0) => B.get(key).box(a, y, b, w, h, d, color, rot);
  const F = { ang: 0, nx: 0, nz: -1, at: (x, z) => [x, z] };
  return interiorDetail(B, F, P, y0);
}

function bedSet(R, bed, color, room, beds = []) {
  const { box } = R;
  const { x, z, w, d } = bed;
  // 实际床架、悬出床垫、折叠被沿、独立枕头；床两边仍可通行。
  box('wood', x, z, .19, w, d, .32, WOOD);
  box('matte', x, z, .43, w - .07, d - .07, .20, '#f1eee4');
  box('matte', x, z + d * .09, .55, w - .05, d * .68, .09, color);
  box('matte', x, z + d * .37, .60, w - .03, .30, .045, '#e1d8c9');
  box('wood', x, z - d / 2 - .06, .70, w + .12, .08, 1.30, '#e9dcc8');
  box('matte', x, z - d / 2 - .008, .89, w - .03, .065, .65, color);
  const count = w >= 1.4 ? 2 : 1;
  for (let k = 0; k < count; k++) box('matte', x + (k - (count - 1) / 2) * .67, z - d * .31, .585, count === 1 ? .65 : .59, .41, .14, '#faf7ee');
  // Small wall lights are mounted to the headboard and don't consume bedside circulation.
  for (const side of [-1, 1]) {
    box('metal', x + side * w * .39, z - d / 2 + .02, 1.13, .025, .09, .15, '#837552');
    box('glow', x + side * w * .39, z - d / 2 + .065, 1.13, .08, .035, .07, '#f1d5a4');
    if (!room) continue;
    const edge = x + side * w / 2;
    const wallGap = side < 0 ? edge - room.x0 : room.x1 - edge;
    const neighborGap = Math.min(Infinity, ...beds.filter((other) => other !== bed && Math.abs(other.z - z) < (other.d + d) / 2)
      .map((other) => side * (other.x - x) - (other.w + w) / 2).filter((gap) => gap > 0));
    // 360mm柜体以外仍留至少600mm侧向通路；双床中间不挤入两张床头柜。
    if (Math.min(wallGap, neighborGap) < 1.06) continue;
    const a = edge + side * .26, b = z - d / 2 + .34;
    box('wood', a, b, .27, .36, .43, .46, WOOD);
    box('stone', a, b, .52, .38, .45, .055, '#f7f3e8');
    box('metal', a, b + .222, .38, .15, .013, .025, '#9d967d');
    R.cylinder('metal', a, b, .55, .10, .025, '#8e876e', 8);
    R.cylinder('metal', a, b, .575, .016, .22, '#8e876e', 6);
    R.cylinder('matte', a, b, .77, .145, .20, '#e7dcc5', 8);
    R.cylinder('glow', a, b, .763, .125, .012, '#f2d3a2', 8);
  }
}

function bathroomSet(R, r, height) {
  const { box, cylinder, line } = R;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const [cx, cz] = roomCenter(r);
  box('stone', cx, cz, .045, w - .15, d - .15, .035, '#eeeee6');
  // 设施沿后墙排布，门口一侧为干区；玻璃淋浴入口朝房间中央。
  const shower = Math.min(1.25, w * .39, d * .44);
  const compact = d < 3.5;
  const sx = compact ? r.x1 - shower / 2 - .12 : r.x0 + shower / 2 + .12;
  const sz = r.z1 - shower / 2 - .12;
  const screenX = sx + (compact ? -1 : 1) * shower / 2;
  const tileH = Math.min(2.30, height - .18), tileY = .075 + tileH / 2;
  // 直接覆在真实湿区墙面上，1.8cm厚石材饰面不跨左侧卫生间门洞。
  box('stone', cx, r.z1 - .087, tileY, w - .16, .018, tileH, '#f0eee4');
  box('stone', r.x1 - .087, cz, tileY, .018, d - .16, tileH, '#f0eee4');
  box('stone', r.x0 + .087, r.z0 + .54, 1.13, .018, .90, 1.55, '#f5f1e7');
  if (!compact) box('stone', r.x0 + .087, sz, tileY, .018, shower - .035, tileH, '#f0eee4');
  box('stone', sx, sz, .085, shower, shower, .075, '#faf9f0');
  box('glass', screenX, sz, 1.05, .027, shower, 1.95, '#ffffff');
  box('metal', screenX, sz, 2.04, .03, shower + .025, .035, '#a9b5ad');
  line('metal', sx, r.z1 - .19, .70, sx, r.z1 - .19, 1.9, .03, '#a9b5ad');
  line('metal', sx, r.z1 - .19, 1.9, sx, r.z1 - .45, 1.96, .028, '#a9b5ad');
  cylinder('metal', sx, r.z1 - .45, 1.94, .12, .025, '#b6c0b8', 8);
  box('metal', sx, r.z1 - .17, 1.02, .23, .055, .035, '#9faea5');
  // 马桶的座圈由外椭圆和深色内腔表达，不使用一个立方体代替。
  const tx = r.x1 - .48, tz = compact ? r.z0 + .50 : r.z1 - .68;
  const back = compact ? -1 : 1;
  cylinder('satin', tx, tz, .07, .20, .27, '#f8f7ee', 10);
  box('satin', tx, tz + back * .21, .56, .43, .25, .53, '#f8f7ee');
  cylinder('satin', tx, tz - back * .12, .34, .255, .07, '#faf9f1', 12);
  cylinder('matte', tx, tz - back * .12, .413, .165, .007, '#b8c6bd', 10);
  box('metal', tx, tz + back * .20, .832, .11, .10, .013, '#b5beb7');
  // 洗手盆在靠前侧的侧墙上，避开通常居中的卫生间门。
  const vx = r.x0 + .40, vz = r.z0 + .56;
  box('wood', vx, vz, .49, .62, .80, .50, WOOD);
  box('stone', vx, vz, .78, .70, .88, .09, '#ffffff');
  cylinder('satin', vx, vz, .826, .245, .11, '#faf9ef', 12);
  cylinder('matte', vx, vz, .938, .188, .005, '#c4d2c7', 12);
  line('metal', r.x0 + .19, vz, .83, r.x0 + .19, vz, 1.07, .035, '#a1b0a5');
  line('metal', r.x0 + .19, vz, 1.07, r.x0 + .38, vz, 1.07, .035, '#a1b0a5');
  box('mirror', r.x0 + .092, vz, 1.52, .025, .67, .75, '#ffffff');
  box('glow', r.x0 + .115, vz, 1.92, .035, .70, .045, '#f1dfb9');
  // 浴巾挂杆与折叠毛巾位于洗手台下层。
  line('metal', vx + .33, vz - .31, .64, vx + .33, vz + .31, .64, .024, '#a4b1a8');
  box('matte', vx + .345, vz, .53, .025, .36, .23, '#e9e8df');
}

function kitchenSet(R, r, height) {
  const { box, cylinder, line } = R;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  const [cx] = roomCenter(r);
  const len = Math.max(1.5, w - .28), b = r.z1 - .42;
  box('wood', cx, b, .45, len, .65, .86, WOOD);
  box('stone', cx, b, .91, len + .045, .72, .065, '#ffffff');
  const drawers = Math.max(2, Math.floor(len / .60));
  for (let k = 0; k < drawers; k++) {
    const a = cx - len / 2 + (k + .5) * len / drawers;
    box('metal', a, b - .338, .73, .20, .018, .026, '#9eab9f');
    box('matte', a + len / drawers / 2 - .012, b - .333, .48, .014, .009, .72, '#aab09f');
  }
  // 台面两端分别是水槽与灶具；中部保持备餐面。
  const sinkX = cx - len * .26, hobX = cx + len * .27;
  box('metal', sinkX, b, .95, .57, .43, .025, '#a2afa5');
  box('matte', sinkX, b, .965, .43, .30, .01, '#61766a');
  line('metal', sinkX, b + .25, .95, sinkX, b + .25, 1.21, .025, '#9fab9f');
  line('metal', sinkX, b + .25, 1.21, sinkX, b + .02, 1.21, .025, '#9fab9f');
  box('matte', hobX, b, .955, .62, .49, .023, '#263a30');
  for (const da of [-.16, .16]) cylinder('metal', hobX + da, b, .971, .105, .018, '#718477', 8);
  box('metal', hobX, b + .10, 1.98, .75, .49, .14, '#a9b5ab');
  box('glow', hobX, b - .04, 1.903, .49, .23, .01, '#f2e0b4');
  box('wood', sinkX, b + .09, 1.95, Math.min(1.2, len * .43), .43, .63, '#ece4d1');
  box('matte', cx, b + .31, 1.38, len, .032, .83, '#e8e9df');
  if (w > 3.2 && d > 2.2) {
    const fx = r.x1 - .43, fz = r.z0 + .49;
    box('metal', fx, fz, 1.04, .66, .70, 2.02, '#b9c3b9');
    box('matte', fx, fz - .357, 1.4, .63, .018, .012, '#7a8d7d');
    box('metal', fx - .20, fz - .38, 1.08, .025, .045, .39, '#607868');
  }
  void height;
}

function livingSet(R, r, kind, height) {
  const { box, cylinder } = R;
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 2.6 || d < 2.5) return;
  const [cx, cz] = roomCenter(r);
  const sofaWidth = Math.min(w - 1.2, kind === 'hotel' ? 2.0 : 2.6);
  const sofaZ = r.z1 - .68;
  const tvZ = Math.max(r.z0 + .16, sofaZ - 3.2);
  box('matte', cx, (sofaZ + tvZ) / 2, .046, Math.min(w - .7, 3.7), Math.min(d - .7, 2.8), .026, '#bdc1b1');
  box('wood', cx, sofaZ, .18, sofaWidth, .86, .24, '#ece0c9');
  box('matte', cx, sofaZ, .39, sofaWidth - .14, .77, .21, '#9aaea0');
  box('matte', cx, sofaZ + .35, .66, sofaWidth, .22, .67, '#9aaea0');
  for (const side of [-1, 1]) {
    box('matte', cx + side * (sofaWidth / 2 - .10), sofaZ, .50, .20, .90, .47, '#8ea698');
    box('matte', cx + side * sofaWidth * .29, sofaZ + .11, .66, .38, .13, .36, side < 0 ? '#c8b48d' : '#d2dbcc');
  }
  const tableZ = sofaZ - 1.15;
  box('wood', cx, tableZ, .38, 1.12, .63, .055, WOOD);
  for (const side of [-1, 1]) box('metal', cx + side * .45, tableZ, .19, .045, .40, .38, '#516859');
  box('matte', cx - .18, tableZ, .42, .27, .35, .035, '#728575');
  R.cup(cx + .23, tableZ, .411, '#e9e5d7', true);
  box('wood', cx, tvZ + .12, .26, Math.min(w - .6, 2.2), .42, .45, WOOD);
  box('matte', cx, tvZ, 1.21, 1.48, .07, .87, '#233b2d');
  box('glowSoft', cx, tvZ + .042, 1.21, 1.38, .012, .77, '#748f80');
  // 边几植物与落地灯避开房间中央通路。
  const lampX = r.x0 + .42, lampZ = r.z1 - .47;
  cylinder('metal', lampX, lampZ, .04, .17, .03, '#687967', 8);
  cylinder('metal', lampX, lampZ, .07, .021, 1.50, '#7e8b74', 6);
  cylinder('matte', lampX, lampZ, 1.49, .25, .34, '#e1d7bf', 10);
  cylinder('glow', lampX, lampZ, 1.485, .21, .012, '#f6dcb1', 10);
  void height;
}

function diningSet(R, r, entryX) {
  const { box } = R;
  // 餐区若跨入户轴线，桌椅落在较宽的一侧，保留 1.8m 的连续入户通路。
  const sides = [[r.x0, Math.min(r.x1, entryX - .9)], [Math.max(r.x0, entryX + .9), r.x1]].sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const [a, b] = sides[0], x = (a + b) / 2, z = (r.z0 + r.z1) / 2;
  const w = Math.min(1.6, b - a - .35), d = Math.min(.88, r.z1 - r.z0 - 1.0);
  if (w < .8 || d < .6) return;
  box('wood', x, z, .77, w, d, .075, WOOD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box('metal', x + sx * (w / 2 - .10), z + sz * (d / 2 - .09), .39, .04, .04, .76, '#596d5b');
    const cx = x + sx * w * .26, cz = z + sz * (d / 2 + .36);
    box('wood', cx, cz, .46, .41, .39, .06, WOOD);
    box('matte', cx, cz + sz * .15, .71, .41, .08, .50, '#a5b29e');
    box('metal', cx, cz, .22, .065, .28, .44, '#5f7360');
  }
  R.tableware(x, z, .809);
}

function kitchenette(R, r) {
  const { box, cylinder, line } = R;
  const w = Math.min(r.x1 - r.x0 - .3, 2.2);
  const x = r.x0 + w / 2 + .15, z = r.z0 + .48;
  box('wood', x, z, .46, w, .62, .87, WOOD);
  box('stone', x, z, .925, w + .04, .68, .06, '#ffffff');
  box('matte', x + w * .27, z - .327, .48, w * .32, .023, .61, '#48614e');
  box('metal', x + w * .32, z - .35, .60, .025, .035, .19, '#a9b39d');
  cylinder('metal', x - .38, z, .96, .13, .23, '#899989', 10);
  line('metal', x - .27, z, 1.09, x - .17, z, 1.22, .043, '#899989');
  R.cup(x + .04, z, .962, '#f0e4cb');
  R.cup(x + .30, z, .962, '#f0e4cb');
}

function entryStorage(R, r, unitWidth) {
  const { box } = R;
  const [cx, cz] = roomCenter(r);
  const w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 2.1 || d < 1.7) return;
  const x = r.x0 + .40;
  box('wood', x, cz, 1.15, .60, Math.min(d - .4, 1.4), 2.22, '#e9decb');
  box('metal', x + .31, cz, 1.10, .025, .025, .32, '#8e947e');
  box('mirror', x + .32, cz + .29, 1.34, .025, .41, 1.2, '#ffffff');
  void cx;
  void unitWidth;
}

function balcony(R, r) {
  const { box, cylinder } = R;
  const [cx, cz] = roomCenter(r), w = r.x1 - r.x0, d = r.z1 - r.z0;
  box('concrete', cx, cz, .042, w - .12, d - .12, .024, '#e1dfd1');
  if (w < 2.2 || d < 1.2) return;
  cylinder('wood', r.x0 + .56, cz, .69, .30, .045, '#eee1c7', 12);
  cylinder('metal', r.x0 + .56, cz, .05, .035, .64, '#5f735e', 6);
  box('wood', r.x0 + 1.2, cz, .43, .40, .42, .055, '#e5d8ba');
  box('wood', r.x0 + 1.37, cz, .70, .07, .42, .50, '#e5d8ba');
  cylinder('satin', r.x1 - .42, cz, .04, .24, .39, '#b0bba4', 10);
  cylinder('foliage', r.x1 - .42, cz, .43, .31, .60, '#657f5b', 7);
}

function labelAtlas(labels, y0, group) {
  if (!labels.length || typeof document === 'undefined') return null;
  const cellW = 128, cellH = 64, cols = 4;
  const width = cellW * cols, height = 2 ** Math.ceil(Math.log2(Math.max(cellH, Math.ceil(labels.length / cols) * cellH)));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#625d4d'; g.fillRect(0, 0, width, height);
  const signs = new SignBatch();
  labels.forEach((label, i) => {
    const x = i % cols * cellW, y = Math.floor(i / cols) * cellH;
    g.fillStyle = '#f6ecce'; g.font = '600 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label.text, x + cellW / 2, y + cellH / 2, cellW - 12);
    signs.placeN(label.x, y0 + (label.y || 1.59), label.z, label.w || .28, label.h || .14, label.nx, label.nz, [x / width, 1 - (y + cellH) / height, (x + cellW) / width, 1 - y / height]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: true });
  signs.flush(group, material);
  return { texture, material };
}
