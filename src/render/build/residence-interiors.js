// 住宅 / 公寓 / 酒店的单层内饰。调用方按当前楼层加载、移除，禁止全楼常驻。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { toW, frame, subtractInterval } from '../../layout/geom.js';
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
  // 云澜社区住宅楼层只用六个材质批次（≤ 8 个网格）。
  const community = lv.units.some((u) => u.residence?.kind === 'community');
  const raw = new BatchSet(ctx.mats.base);
  const B = community ? { get: (k) => raw.get(COMMUNITY_KEYS[k] || k), frame: (F, fn) => raw.frame(F, fn), flush: (g) => raw.flush(g), sets: raw.sets } : raw;
  const height = Math.max(2.6, (lv.height || lv.h || 3.5) - .30);
  const y0 = lv.elev;
  const labels = [];
  const wallKeys = new Set();

  for (const u of lv.units) {
    const residence = u.residence;
    if (!residence) continue;
    if (residence.kind === 'community') { communityHome(B, u, y0, height, labels, wallKeys); continue; }
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

// ---------------------------------------------------------------------------
// 云澜社区住宅（西苑 / 北苑）：按生成户型逐房铺地、隔墙与门、成套家具；复式下层画套内楼梯，
// 上层沿楼梯洞口与挑空设玻璃栏杆。外墙（exteriorSides）由社区外壳画窗，这里不重复。
const COMMUNITY_KEYS = { satin: 'matte', mirror: 'glass', glowSoft: 'glow', foliage: 'matte', concrete: 'stone', extMetal: 'metal', extSatin: 'matte', ext: 'matte', glassTint: 'glass' };
const ROT = { N: 0, E: 90, S: 180, W: 270 };
const WET = new Set(['bathroom', 'powder', 'laundry', 'balcony']);
const FLOOR = { wood: '#dccaa8', stone: '#e8e5dc', kitchen: '#e3ddd0', balcony: '#d9d6cc' };
const PALETTE = ['#c9b79c', '#a7b8ad', '#b9b3c7', '#c7a99a', '#9fb3be'];

/** Side of rect r that the partition segment p lies on, or null. */
function sideOf(p, r, tol = 1e-3) {
  const [a, b] = [p.a, p.b];
  if (Math.abs(a[1] - b[1]) < tol) return Math.abs(a[1] - r.z0) < tol ? 'N' : Math.abs(a[1] - r.z1) < tol ? 'S' : null;
  if (Math.abs(a[0] - b[0]) < tol) return Math.abs(a[0] - r.x0) < tol ? 'W' : Math.abs(a[0] - r.x1) < tol ? 'E' : null;
  return null;
}
const within = (p, r, tol = 1e-3) => [p.a, p.b].every(([x, z]) => x >= r.x0 - tol && x <= r.x1 + tol && z >= r.z0 - tol && z <= r.z1 + tol);
/** The side through which a room is entered: its door, else the edge it shares with an open neighbour. */
function doorSide(res, room) {
  for (const p of res.partitions) if (p.door && p.id.split('/').includes(room.id) && within(p, room.rect)) { const s = sideOf(p, room.rect); if (s) return s; }
  const r = room.rect;
  for (const o of res.rooms) {
    if (o === room || !['dining', 'living', 'family', 'hall', 'entry'].includes(o.kind)) continue;
    const q = o.rect, ox = Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0), oz = Math.min(r.z1, q.z1) - Math.max(r.z0, q.z0);
    if (ox > .5 && Math.abs(q.z1 - r.z0) < 1e-3) return 'N';
    if (ox > .5 && Math.abs(q.z0 - r.z1) < 1e-3) return 'S';
    if (oz > .5 && Math.abs(q.x1 - r.x0) < 1e-3) return 'W';
    if (oz > .5 && Math.abs(q.x0 - r.x1) < 1e-3) return 'E';
  }
  return 'N';
}
/** World frame centred on a unit-local point, turned so that canonical −z (front) faces `side`. */
const roomFrame = (u, cx, cz, side) => frame(...toW(u.frame, cx, cz), u.frame.deg + ROT[side]);
const centred = (r, side) => {
  const w = r.x1 - r.x0, d = r.z1 - r.z0, [cw, cd] = side === 'E' || side === 'W' ? [d, w] : [w, d];
  return { x0: -cw / 2, z0: -cd / 2, x1: cw / 2, z1: cd / 2 };
};

function communityHome(B, u, y0, height, labels, wallKeys) {
  const res = u.residence, W = res.width, D = res.depth, ext = new Set(res.exteriorSides || []);
  const R = makeRoomTools(B, y0), { box, cylinder } = R;
  const wall = (a, b, door, color = '#eeeae1', t = .12) => {
    const aw = toW(u.frame, ...a), bw = toW(u.frame, ...b);
    const key = `${[aw, bw].map((p) => p.map((n) => n.toFixed(2)).join(',')).sort().join('|')}:${door ? door.at : 'solid'}`;
    if (wallKeys.has(key)) return;
    wallKeys.add(key);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < .02) return;
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len, angle = Math.atan2(-dz, dx);
    const piece = (s0, s1, h0, h1, key = 'matte', col = color, th = t) => {
      if (s1 - s0 <= .01 || h1 - h0 <= .01) return;
      B.get(key).box(a[0] + dx * (s0 + s1) / 2, y0 + (h0 + h1) / 2, a[1] + dz * (s0 + s1) / 2, s1 - s0, h1 - h0, th, col, angle);
    };
    if (!door) return piece(0, len, .02, height);
    const d0 = Math.max(0, door.at - door.width / 2), d1 = Math.min(len, door.at + door.width / 2);
    piece(0, d0, .02, height); piece(d1, len, .02, height); piece(d0, d1, 2.15, height);
    return [d0, d1, dx, dz, angle];
  };
  B.frame(u.frame, () => {
    // 地面：每房一块，湿区石材，楼梯与挑空不铺。
    for (const r of res.rooms) {
      if (r.kind === 'stair' || r.kind === 'void') continue;
      const q = r.rect, key = WET.has(r.kind) || r.kind === 'kitchen' ? 'stone' : 'wood';
      box(key, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, .012, q.x1 - q.x0 - .02, q.z1 - q.z0 - .02, .024,
        r.kind === 'kitchen' ? FLOOR.kitchen : r.kind === 'balcony' ? FLOOR.balcony : key === 'stone' ? FLOOR.stone : FLOOR.wood);
    }
    // 户门墙（复式上层无户门，整面实墙）与非外墙的两侧分户墙。
    const entry = res.entryDoor;
    const door = wall([0, 0], [W, 0], entry ? { at: entry.at, width: entry.width } : null, '#e6e0d2', .16);
    if (!ext.has('W')) wall([0, 0], [0, D], null, '#ebe6db', .16);
    if (!ext.has('E')) wall([W, 0], [W, D], null, '#ebe6db', .16);
    if (!ext.has('S')) wall([0, D], [W, D], null, '#ebe6db', .16);
    if (entry && door) {
      const [d0, d1] = door;
      box('wood', d0 + .05, .48, 1.07, .05, .92, 2.1, '#cdb48f');
      box('metal', d1 + .2, -.09, 1.6, .26, .02, .18, '#7b735c');
      const [lx, lz] = toW(u.frame, d1 + .2, -.105), [nx, nz] = toW(u.frame, 0, -1), [ox, oz] = toW(u.frame, 0, 0);
      labels.push({ x: lx, z: lz, nx: nx - ox, nz: nz - oz, text: homePlate(u.code) });
    }
    for (const p of res.partitions) {
      if (p.role === 'railing') { glassRail(R, p.a, p.b); continue; }
      if (p.role === 'balcony-slider') {
        // 推拉门玻璃在外壳；室内只留门槛与边框。
        const [a, b] = [p.a, p.b];
        R.line('metal', a[0], a[1], .02, b[0], b[1], .02, .06, '#8d9188');
        for (const q of [a, b]) R.line('metal', q[0], q[1], 0, q[0], q[1], 2.4, .06, '#8d9188');
        continue;
      }
      const opened = wall(p.a, p.b, p.door ? p.door : null, p.role === 'stair-wall' ? '#e4ddd0' : '#eeeae1');
      if (opened && p.role !== 'opening') {
        const [d0, d1, dx, dz, angle] = opened, w = d1 - d0 - .06;
        // 门扇开向房内、贴墙停放。
        box('wood', p.a[0] + dx * (d0 + .03) + dz * w / 2, p.a[1] + dz * (d0 + .03) - dx * w / 2, 1.05, .04, w, 2.08, '#d8c4a3', angle);
      }
    }
    stairTreads(R, res);
  });
  communityFurniture(B, u, y0);
}

/** Door-plate text of a community home: 1201, 10W, or 14–15W for a duplex (both parts). */
export function homePlate(code) {
  const id = String(code).replace(/-[LU]$/, '').split('-').at(-1), m = /^(\d{2})(\d{2})([A-Z])$/.exec(id);
  return m ? `${m[1]}–${m[2]}${m[3]}` : id;
}

/**
 * Furniture of one community home. Living rooms, bedrooms and balconies are planned against the
 * room's solid walls (doors, openings, glass and open-plan edges removed) so that every piece stays
 * inside its room, clear of door swings and beds; the set and colours vary with the home type and code.
 * Returns a summary per room for tests.
 */
export function communityFurniture(B, u, y0) {
  const res = u.residence, R = makeRoomTools(B, y0), ext = new Set(res.exteriorSides || []);
  // Per-home seed; the floor seed plus the slot keeps neighbours on one floor in different colours.
  const seed = hashCode(u.code), slot = /^\d+$/.test(u.slot) ? +u.slot - 1 : u.slot === 'E' ? 1 : 0;
  const tone = hashCode(u.level || u.code) + slot * 2, summary = { living: [], bedrooms: [], balconies: [] };
  const beds = res.beds || [];
  for (const [i, bed] of beds.entries()) {
    const side = bed.head || 'N', F = roomFrame(u, bed.x, bed.z, side);
    const [w, d] = side === 'E' || side === 'W' ? [bed.d, bed.w] : [bed.w, bed.d];
    const room = res.rooms.find((r) => r.id === bed.room)?.rect;
    const gap = room ? Math.min(...(side === 'N' || side === 'S' ? [bed.x - bed.w / 2 - room.x0, room.x1 - bed.x - bed.w / 2] : [bed.z - bed.d / 2 - room.z0, room.z1 - bed.z - bed.d / 2])) : 0;
    B.frame(F, () => bedLean(R, w, d, PALETTE[(i + tone) % PALETTE.length], gap > .95));
  }
  for (const r of res.rooms) {
    const q = r.rect, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
    const place = (side, fn) => B.frame(roomFrame(u, cx, cz, side), () => fn(centred(q, side)));
    if (r.kind === 'bathroom' || r.kind === 'powder') {
      const bath = res.bathrooms?.find((b) => b.id === r.id);
      place(bath?.door?.side || doorSide(res, r), (c) => bathLean(R, c, r.kind === 'powder' || bath?.powder));
    } else if (r.kind === 'kitchen') place(res.kitchen?.door?.side || doorSide(res, r), (c) => kitchenLean(R, c));
    else if (r.kind === 'family') place(q.x1 - q.x0 >= q.z1 - q.z0 ? 'W' : 'N', (c) => familyLean(R, c));
    else if (r.kind === 'dining') place('N', (c) => diningLean(R, c, res.entryDoor ? res.entryDoor.at - cx : null));
    else if (r.kind === 'study') place(doorSide(res, r), (c) => studyLean(R, c, r.name));
    else if (r.kind === 'closet') place(doorSide(res, r), (c) => closetLean(R, c));
    else if (r.kind === 'laundry') place(doorSide(res, r), (c) => laundryLean(R, c));
    else if (r.kind === 'storage') place(doorSide(res, r), (c) => storageLean(R, c));
    else if (r.kind === 'entry') place('N', (c) => entryLean(R, c));
  }
  // 客厅、卧室与阳台按实墙规划（户内局部坐标，轴对齐）。
  B.frame(u.frame, () => {
    for (const r of res.rooms) {
      const P = roomPlanner(res, ext, r, beds);
      if (r.kind === 'living') { const s = livingPlan(R, P, res, seed, tone); if (s) summary.living.push({ room: r.id, ...s }); }
      else if (r.kind === 'bedroom') summary.bedrooms.push({ room: r.id, name: r.name, ...bedroomPlan(R, P, r, seed) });
      else if (r.kind === 'balcony') { const s = balconyPlan(R, P, seed); if (s) summary.balconies.push({ room: r.id, ...s }); }
    }
  });
  return summary;
}

const hashCode = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) % 9973;
};
const SOFA = ['#9eaea2', '#b9a78e', '#8e9fb3', '#c4b9a8', '#a6938a', '#7f948a', '#cbb89d', '#98a3ad', '#b28f7c'];
const RUG = ['#c6c6b6', '#d9cfbe', '#b7c1bf', '#cfc0b1', '#bdb4a6', '#d5d1c5', '#a9b2ae'];
const CABINET = ['#d9c6a6', '#b8946c', '#e2d8c6', '#8f6f52', '#cdb48f'];
const SIDES = ['N', 'S', 'W', 'E'];
const OPPOSITE = { N: 'S', S: 'N', W: 'E', E: 'W' };
const overlaps = (a, b, pad = -1e-4) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.z0 < b.z1 + pad && b.z0 < a.z1 + pad;
const mergeIv = (iv) => iv.sort((a, b) => a[0] - b[0]).reduce((out, [a, b]) => { const l = out.at(-1); if (l && a <= l[1] + 1e-3) l[1] = Math.max(l[1], b); else out.push([a, b]); return out; }, []);

/**
 * One room's walls as solid stretches along each side, the door swing zones inside it, and a
 * placer for wall-backed or free-standing pieces that keeps them inside the room and clear of
 * doors, beds and each other (all unit-local, axis-aligned).
 */
function roomPlanner(res, ext, room, beds) {
  const r = room.rect, sides = {}, zones = [], taken = [];
  for (const side of SIDES) {
    const horiz = side === 'N' || side === 'S', line = { N: r.z0, S: r.z1, W: r.x0, E: r.x1 }[side];
    const [s0, s1] = horiz ? [r.x0, r.x1] : [r.z0, r.z1], edge = { N: 0, S: res.depth, W: 0, E: res.width }[side];
    const solid = [], cut = [];
    let glass = false, exterior = false;
    const zone = (c, w, depth) => {
      const a = c - w / 2 - .1, b = c + w / 2 + .1;
      zones.push(horiz ? { x0: a, x1: b, z0: side === 'N' ? line : line - depth, z1: side === 'N' ? line + depth : line }
        : { z0: a, z1: b, x0: side === 'W' ? line : line - depth, x1: side === 'W' ? line + depth : line });
      cut.push([a - .05, b + .05]);
    };
    if (Math.abs(line - edge) < 1e-3) {
      solid.push([s0, s1]);
      if (ext.has(side)) {
        exterior = true;
        // Exterior wall: solid between the window openings of the home's facade on this side.
        for (const w of res.facadeWalls || []) {
          if (w.side !== side) continue;
          const dir = Math.sign((horiz ? w.b[0] - w.a[0] : w.b[1] - w.a[1]) || 1), a0 = horiz ? w.a[0] : w.a[1];
          for (const o of w.openings || []) { const c = a0 + dir * o.at; cut.push([c - o.width / 2 - .1, c + o.width / 2 + .1]); if (o.type === 'railing' || (o.bottom ?? .6) < .3) glass = true; }
        }
      } else if (side === 'N' && res.entryDoor) zone(res.entryDoor.at, res.entryDoor.width, 1.0);
    }
    for (const p of res.partitions) {
      const [a, b] = [p.a, p.b];
      if (horiz ? Math.abs(a[1] - line) > 1e-3 || Math.abs(b[1] - line) > 1e-3 : Math.abs(a[0] - line) > 1e-3 || Math.abs(b[0] - line) > 1e-3) continue;
      const pa = horiz ? a[0] : a[1], pb = horiz ? b[0] : b[1], t0 = Math.max(s0, Math.min(pa, pb)), t1 = Math.min(s1, Math.max(pa, pb));
      if (t1 - t0 < .05) continue;
      if (p.role === 'balcony-slider' || p.role === 'railing') {
        glass = true;
        if (p.door) zone(pa + Math.sign(pb - pa) * p.door.at, p.door.width, .8);
        continue;
      }
      solid.push([t0, t1]);
      if (p.door) zone(pa + Math.sign(pb - pa) * p.door.at, p.door.width, p.role === 'opening' ? 1.1 : 1.0);
    }
    let iv = mergeIv(solid);
    for (const c of cut) iv = subtractInterval(iv, c);
    sides[side] = { side, horiz, line, exterior, glass, span: [s0, s1], stretches: iv.filter(([a, b]) => b - a > .4).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])) };
  }
  const bed = beds.find((q) => q.room === room.id) || null;
  for (const b of beds.filter((q) => q.room === room.id)) {
    const q = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, head = b.head || 'N';
    taken.push(q);
    // Bedside tables (drawn when both lateral gaps exceed 0.95 m) flank the head end.
    const lat = head === 'N' || head === 'S', gap = lat ? Math.min(q.x0 - r.x0, r.x1 - q.x1) : Math.min(q.z0 - r.z0, r.z1 - q.z1);
    if (gap > .95) for (const s of [-1, 1]) {
      const hz = { N: q.z0 + .25, S: q.z1 - .25, W: q.x0 + .25, E: q.x1 - .25 }[head], c = lat ? (s < 0 ? q.x0 - .27 : q.x1 + .27) : (s < 0 ? q.z0 - .27 : q.z1 + .27);
      taken.push(lat ? { x0: c - .21, x1: c + .21, z0: hz - .2, z1: hz + .2 } : { z0: c - .21, z1: c + .21, x0: hz - .2, x1: hz + .2 });
    }
  }
  const inside = (q) => q.x0 >= r.x0 + .085 && q.x1 <= r.x1 - .085 && q.z0 >= r.z0 + .085 && q.z1 <= r.z1 - .085;
  const free = (q, clear = q) => inside(q) && inside(clear) && !zones.some((z) => overlaps(q, z)) && !taken.some((t) => overlaps(clear, t));
  /** Local rect of a piece backed on `side` at along-position s: len along the wall, depth inward from off. */
  const rectAt = (side, s, len, depth, off = .09) => {
    const S = sides[side];
    if (S.horiz) { const z0 = side === 'N' ? S.line + off : S.line - off - depth; return { x0: s - len / 2, x1: s + len / 2, z0, z1: z0 + depth }; }
    const x0 = side === 'W' ? S.line + off : S.line - off - depth;
    return { z0: s - len / 2, z1: s + len / 2, x0, x1: x0 + depth };
  };
  const grow = (side, q, d) => ({ N: { ...q, z1: q.z1 + d }, S: { ...q, z0: q.z0 - d }, W: { ...q, x1: q.x1 + d }, E: { ...q, x0: q.x0 - d } })[side];
  /** First fit along the given walls: longest stretch first, centred then at either end, shrinking to `min`. */
  const onWall = (list, len, depth, { min = len, clear = .5, off = .09, exterior = false } = {}) => {
    for (const side of list) {
      const S = sides[side];
      if (!S || (S.exterior && !exterior)) continue;
      for (const [a, b] of S.stretches) for (let L = Math.min(len, b - a - .2); L >= min - 1e-6; L -= .2) {
        for (const s of [(a + b) / 2, a + .1 + L / 2, b - .1 - L / 2]) {
          const q = rectAt(side, s, L, depth, off);
          if (free(q, grow(side, q, clear))) { taken.push(q); return { side, s, len: L, ab: [a, b], rect: q }; }
        }
      }
    }
    return null;
  };
  /** Drawing frame on a wall: u along the wall from s, v inward from the wall face (a proper rotation). */
  const frameOn = (R, side, s, off = .09) => {
    const S = sides[side], m = (u, v, lu, lv) => side === 'N' ? [s + u, S.line + off + v, lu, lv] : side === 'S' ? [s - u, S.line - off - v, lu, lv]
      : side === 'W' ? [S.line + off + v, s - u, lv, lu] : [S.line - off - v, s + u, lv, lu];
    return {
      box: (key, u, v, y, lu, lv, h, color) => { const [x, z, w, d] = m(u, v, lu, lv); R.box(key, x, z, y, w, d, h, color); },
      cyl: (key, u, v, y, rad, h, color, seg = 8) => { const [x, z] = m(u, v, 0, 0); R.cylinder(key, x, z, y, rad, h, color, seg); },
      rect: (u0, v0, u1, v1) => { const [xa, za] = m(u0, v0, 0, 0), [xb, zb] = m(u1, v1, 0, 0); return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) }; },
    };
  };
  const closet = res.partitions.some((p) => p.door && p.id.split('/').includes(room.id) && p.id.split('/').some((id) => res.rooms.find((q) => q.id === id)?.kind === 'closet'));
  return { room, rect: r, bed, closet, sides, zones, taken, free, inside, rectAt, onWall, frameOn };
}

/** Wardrobe with door seams and pulls, backed on its wall (frame from frameOn). */
function wardrobe(f, len, color, depth = .6, h = 2.2) {
  f.box('wood', 0, depth / 2, h / 2, len, depth, h, color);
  const n = Math.max(2, Math.round(len / .55));
  for (let k = 1; k < n; k++) f.box('metal', -len / 2 + len * k / n, depth + .004, h / 2, .012, .008, h - .12, '#8d8576');
  for (let k = 0; k < n; k++) f.box('metal', -len / 2 + len * (k + (k % 2 ? .12 : .88)) / n, depth + .015, 1.05, .02, .025, .32, '#b7ae98');
  f.box('wood', 0, depth / 2, .04, len - .02, depth - .04, .08, '#6e5d4c');
}

/** 客厅：电视墙选最长的户内实墙（不在外墙或玻璃侧），沙发正对电视；按户型配 L 形沙发、单椅、边柜与江景角。 */
function livingPlan(R, P, res, seed, tone) {
  const r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (Math.min(w, d) < 2.4) return null;
  const beds = res.bedrooms || (res.beds || []).length, big = beds >= 4 || res.area >= 150, mid = beds === 3;
  const viewSides = SIDES.filter((s) => P.sides[s].exterior || P.sides[s].glass);
  const across = (s) => P.sides[s].horiz ? d : w;
  const score = (s) => {
    const S = P.sides[s], L = S.stretches[0] ? S.stretches[0][1] - S.stretches[0][0] : 0;
    return L + (viewSides.some((v) => OPPOSITE[v] !== s && v !== s) ? 1.2 : 0) + (viewSides.includes(OPPOSITE[s]) ? -.6 : 0);
  };
  const tvSides = SIDES.filter((s) => !P.sides[s].exterior && !P.sides[s].glass && P.sides[s].stretches.some(([a, b]) => b - a >= 1.8) && across(s) >= 3.3)
    .sort((a, b) => score(b) - score(a));
  if (!tvSides.length) return null;
  const sofaColor = SOFA[tone % SOFA.length], rug = RUG[(tone + 3 * (seed % 2)) % RUG.length], cab = CABINET[(seed >> 3) % CABINET.length];
  const sofaD = .92, kind = big ? (res.community === 'north' && seed % 2 ? 'pair' : 'L') : mid ? 'three' : 'love', sofaLen = big ? 2.7 : mid ? 2.3 : 1.8;
  // TV console on a solid interior stretch and a sofa facing it (against the opposite wall when it fits
  // there, else floating with a walkway of ≥ 0.6 m behind), searched together.
  let tv = null, sofa = null;
  search: for (const side of tvSides) for (const [ea, eb] of P.sides[side].stretches) for (let cl = Math.min(big ? 2.4 : 2.0, eb - ea - .2); cl >= 1.2 - 1e-6; cl -= .2) {
    for (const s of [(ea + eb) / 2, ea + .1 + cl / 2, eb - .1 - cl / 2]) {
      const q = P.rectAt(side, s, cl, .46);
      if (!P.free(q, { N: { ...q, z1: q.z1 + .4 }, S: { ...q, z0: q.z0 - .4 }, W: { ...q, x1: q.x1 + .4 }, E: { ...q, x0: q.x0 - .4 } }[side])) continue;
      const T = P.frameOn(R, side, s), A = across(side) - .18;
      P.taken.push(q);
      for (const len of [sofaLen, sofaLen - .3, sofaLen - .6, 1.6]) for (const v of [A - sofaD, 3.3, 3.0, 2.8, 2.6, 2.4, 2.2, ...(len < 2.1 ? [2.0, 1.8] : [])]) {
        const wall = Math.abs(v - (A - sofaD)) < 1e-6, far = P.sides[OPPOSITE[side]];
        if (v + sofaD > A + 1e-6 || (v + sofaD > A - .6 && !wall) || (wall && (far.exterior || far.glass))) continue;
        for (let k = 0; k <= (len < 1.7 ? 40 : 24); k++) {
          const du = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .1, sq = T.rect(du - len / 2, v, du + len / 2, v + sofaD);
          if (P.free(sq)) { tv = { side, s, cl, ea, eb, T, q }; sofa = { len, v, du, q: sq }; break search; }
        }
      }
      P.taken.pop();
      tv ||= { side, s, cl, ea, eb, T, q, fallback: true };
    }
  }
  if (!tv) return null;
  if (!sofa) P.taken.push(tv.q);
  const { T, cl, side: tvSide } = tv;
  // TV wall: console, a floor-to-ceiling back panel kept on the solid stretch, and the screen.
  const p0 = Math.max(-cl / 2 - .25, tv.ea + .1 - tv.s), p1 = Math.min(cl / 2 + .25, tv.eb - .1 - tv.s);
  T.box('wood', (p0 + p1) / 2, .015, 1.25, p1 - p0, .03, 2.5, big ? '#8f6f52' : '#d8cdb9');
  T.box('wood', 0, .25, .24, cl, .42, .44, cab);
  T.box('metal', 0, .465, .24, cl - .04, .01, .02, '#8d8576');
  const tvW = Math.min(cl - .1, big ? 1.9 : mid ? 1.65 : 1.4);
  T.box('matte', 0, .055, 1.3, tvW, .05, tvW * .57, '#161d1b');
  const pieces = ['tv-wall'];
  /** Sofa whose front is at vf and back at vf + dir · depth (seat, back, arms, cushions). */
  const drawSofa = (F, du, vf, len, dir) => {
    const at = (o) => vf + dir * o;
    F.box('matte', du, at(.46), .22, len, .86, .26, sofaColor);
    F.box('matte', du, at(sofaD - .12), .6, len, .2, .52, sofaColor);
    for (const s of [-1, 1]) F.box('matte', du + s * (len / 2 - .1), at(.46), .43, .2, .86, .3, sofaColor);
    for (let k = 0, n = len > 2 ? 3 : 2; k < n; k++) F.box('matte', du - len / 2 + .2 + (len - .4) * (k + .5) / n, at(sofaD - .3), .52, (len - .4) / n - .04, .16, .36, '#f1ece0');
  };
  if (!sofa) {
    // No square-on spot: a loveseat against another solid wall, with a side table in front.
    const w = P.onWall(SIDES.filter((q) => q !== tvSide), 1.8, sofaD, { min: 1.4, clear: .5 });
    if (w) {
      const f = P.frameOn(R, w.side, w.s);
      drawSofa(f, 0, sofaD, w.len, -1);
      const q = f.rect(-.3, sofaD + .15, .3, sofaD + .65);
      if (P.free(q)) { f.cyl('wood', 0, sofaD + .4, .02, .05, .36, '#8d7a64', 6); f.cyl('wood', 0, sofaD + .4, .38, .25, .04, cab, 12); }
      pieces.push('loveseat');
    }
  }
  if (sofa) {
    P.taken.push(sofa.q);
    const { len, v, du } = sofa, back = v + sofaD;
    drawSofa(T, du, v, len, 1);
    pieces.push(kind === 'love' ? 'loveseat' : 'sofa');
    // L-shaped return toward the TV on the side with more room.
    if (kind === 'L') for (const s of [(seed & 1) ? 1 : -1, (seed & 1) ? -1 : 1]) {
      const q = T.rect(du + s * (len / 2 - .9), v - .75, du + s * len / 2, v);
      if (!P.free(q)) continue;
      P.taken.push(q);
      T.box('matte', du + s * (len / 2 - .45), v - .32, .22, .9, .86, .26, sofaColor);
      T.box('matte', du + s * (len / 2 - .1), v - .32, .43, .2, .86, .3, sofaColor);
      pieces.push('chaise'); break;
    }
    // Rug and coffee table between sofa and TV.
    // Rug under the sofa front and the table, trimmed to the room.
    const rq = T.rect(du - Math.min(len / 2 + .3, 1.8), .75, du + Math.min(len / 2 + .3, 1.8), back - .3), k = .2;
    const rg = { x0: Math.max(rq.x0, r.x0 + k), x1: Math.min(rq.x1, r.x1 - k), z0: Math.max(rq.z0, r.z0 + k), z1: Math.min(rq.z1, r.z1 - k) };
    if ((rg.x1 - rg.x0) * (rg.z1 - rg.z0) > 2) R.box('matte', (rg.x0 + rg.x1) / 2, (rg.z0 + rg.z1) / 2, .03, rg.x1 - rg.x0, rg.z1 - rg.z0, .012, rug);
    const tv = v - .5;
    if (kind === 'love' || (seed >> 4) % 3 === 0) {
      for (const [ou, rad] of [[-.25, .36], [.32, .24]]) { T.cyl('wood', du + ou, tv - rad + .2, .02, .05, .36, '#8d7a64', 6); T.cyl('wood', du + ou, tv - rad + .2, .38, rad, .04, cab, 12); }
      pieces.push('round-tables');
    } else {
      const tw = Math.min(1.3, len - .6);
      T.box('wood', du, tv - .3, .4, tw, .6, .05, cab);
      T.box('wood', du, tv - .3, .14, tw - .08, .52, .03, cab);
      for (const su of [-1, 1]) for (const sv of [-1, 1]) T.box('metal', du + su * (tw / 2 - .05), tv - .3 + sv * .25, .2, .035, .035, .38, '#5c5a55');
      pieces.push('coffee-table');
    }
    // Armchair at the free end of the coffee table (3 and 4 bedrooms; a facing pair in 'pair' homes), turned toward the table.
    let chairs = 0;
    if (kind !== 'love') for (const s of [(seed & 2) ? 1 : -1, (seed & 2) ? -1 : 1]) {
      const cu = du + s * (len / 2 + .55), q = T.rect(cu - .42, tv - .75, cu + .42, tv + .1);
      if (!P.free(q)) continue;
      P.taken.push(q);
      const c2 = SOFA[(seed + 3) % SOFA.length];
      T.box('matte', cu, tv - .32, .22, .8, .8, .24, c2);
      T.box('matte', cu + s * .32, tv - .32, .55, .16, .8, .5, c2);
      for (const sv of [-1, 1]) T.box('matte', cu, tv - .32 + sv * .34, .42, .8, .12, .22, c2);
      pieces.push('armchair');
      if (++chairs >= (kind === 'pair' ? 2 : 1)) break;
    } else {
      const s = (seed & 2) ? 1 : -1, cu = du + s * (len / 2 + .45), q = T.rect(cu - .25, tv - .5, cu + .25, tv);
      if (P.free(q)) { T.cyl('matte', cu, tv - .25, .02, .24, .4, SOFA[(seed + 5) % SOFA.length], 10); pieces.push('pouf'); }
    }
  }
  // Sideboard with a lamp on a remaining interior wall (3 and 4 bedrooms).
  if (kind !== 'love') {
    const sb = P.onWall(SIDES.filter((s) => s !== tvSide), 1.6, .45, { min: 1.1, clear: .6 });
    if (sb) {
      const f = P.frameOn(R, sb.side, sb.s);
      f.box('wood', 0, .225, .4, sb.len, .45, .76, cab);
      f.box('metal', 0, .455, .4, sb.len - .1, .01, .02, '#8d8576');
      f.cyl('satin', sb.len / 2 - .3, .22, .78, .09, .34, '#e9e1cf', 8);
      f.cyl('glow', sb.len / 2 - .3, .22, 1.12, .17, .2, '#f2d7a8', 8);
      f.box('matte', -sb.len / 4, .22, 1.2, .5, .03, .7, RUG[(seed + 1) % RUG.length]);
      pieces.push('sideboard');
    }
  }
  // River / garden corner by the glass: lounge chairs, a reading lamp, or a piano in the duplex hall.
  const glassSide = SIDES.find((s) => P.sides[s].exterior && P.sides[s].glass && s !== tvSide) || (big ? SIDES.find((s) => P.sides[s].glass && s !== tvSide && s !== OPPOSITE[tvSide]) : null);
  if (glassSide && (res.community === 'north' || big)) {
    const S = P.sides[glassSide], want = res.level === 'lower' || (seed >> 5) % 4 === 0, spots = [];
    for (let t = S.span[0] + 1.2; t <= S.span[1] - 1.2 + 1e-6; t += .3) spots.push(t);
    spots.sort((p, q) => Math.min(p - S.span[0], S.span[1] - p) - Math.min(q - S.span[0], S.span[1] - q));
    for (const [s, piano] of [...spots.map((t) => [t, want]), ...(want ? spots.map((t) => [t, false]) : [])]) {
      const f = P.frameOn(R, glassSide, s, piano ? .6 : .5), q = piano ? f.rect(-.8, -.45, .8, 1.6) : f.rect(-1.1, 0, 1.1, .9);
      if (!P.free(q)) continue;
      P.taken.push(q);
      if (piano) {
        f.box('matte', 0, .75, .66, 1.5, 1.5, .34, '#141515');
        f.box('matte', 0, .1, .9, 1.5, .2, .3, '#141515');
        f.box('satin', 0, .18, .77, 1.3, .12, .03, '#f4f1e8');
        for (const [ou, ov] of [[-.6, .2], [.6, .2], [0, 1.35]]) f.box('matte', ou, ov, .25, .08, .08, .5, '#141515');
        f.box('matte', 0, -.25, .25, .8, .38, .45, '#2a2420');
        pieces.push('piano');
      } else {
        for (const su of [-1, 1]) {
          const c2 = SOFA[(seed + 6) % SOFA.length];
          f.box('matte', su * .62, .42, .2, .72, .74, .2, c2);
          f.box('matte', su * .62, .77, .55, .72, .14, .55, c2);
          for (const sv of [.1, .74]) f.box('wood', su * .62, sv, .12, .74, .05, .24, '#8d7a64');
        }
        f.cyl('wood', 0, .42, .02, .04, .5, '#8d7a64', 6);
        f.cyl('wood', 0, .42, .52, .25, .03, cab, 12);
        pieces.push('lounge-chairs');
      }
      break;
    }
  }
  return { kind, tvSide, sofa: sofaColor, pieces };
}

/** 卧室：衣柜靠不带门的实墙；儿童房 / 次卧配书桌，老人房配单椅阅读角，主卧配梳妆台与床尾凳。 */
function bedroomPlan(R, P, room, seed) {
  const r = P.rect, area = (r.x1 - r.x0) * (r.z1 - r.z0), name = room.name || '', out = [];
  const master = /主卧/.test(name), elder = /老人|长辈/.test(name), kid = /儿童/.test(name);
  const bed = P.bed, head = bed?.head || null;
  const order = SIDES.filter((s) => s !== head).sort((a, b) => (b === OPPOSITE[head]) - (a === OPPOSITE[head]));
  const wood = CABINET[(seed + room.id.length) % CABINET.length];
  // A suite with its own walk-in closet needs no wardrobe; every other bedroom gets one where it fits.
  const walkIn = P.closet;
  let wr = walkIn ? null : P.onWall(order, master ? 2.8 : 2.2, .6, { min: 1.0, clear: .5 });
  if (!wr && !walkIn) wr = P.onWall(order, master ? 2.8 : 2.2, .6, { min: 1.0, clear: .5, exterior: true });
  if (!wr && !walkIn) wr = P.onWall(order, .9, .55, { min: .8, clear: .45, exterior: true });
  if (wr) { wardrobe(P.frameOn(R, wr.side, wr.s), wr.len, master ? '#e8ddc8' : kid ? '#f0e6d2' : '#e3d5bd', wr.rect.x1 - wr.rect.x0 < .58 || wr.rect.z1 - wr.rect.z0 < .58 ? .55 : .6); out.push('wardrobe'); }
  if (master) {
    const dr = P.onWall(order, 1.3, .45, { min: .9, clear: .6 }) || P.onWall(order, 1.3, .45, { min: .9, clear: .6, exterior: true });
    if (dr) {
      const f = P.frameOn(R, dr.side, dr.s);
      f.box('wood', 0, .225, .38, dr.len, .45, .72, wood);
      f.box('mirror', 0, .02, 1.35, Math.min(.9, dr.len - .2), .02, .9, '#ffffff');
      f.box('matte', 0, .7, .23, .45, .38, .46, SOFA[(seed + 2) % SOFA.length]);
      out.push('dresser');
    }
    if (bed && area > 16) {
      // Bench at the bed foot when the walkway stays ≥ 0.6 m.
      const b = bed, foot = OPPOSITE[head];
      {
        const q = foot === 'S' ? { x0: b.x - b.w / 2 + .15, x1: b.x + b.w / 2 - .15, z0: b.z + b.d / 2 + .05, z1: b.z + b.d / 2 + .5 }
          : foot === 'N' ? { x0: b.x - b.w / 2 + .15, x1: b.x + b.w / 2 - .15, z1: b.z - b.d / 2 - .05, z0: b.z - b.d / 2 - .5 }
          : foot === 'E' ? { z0: b.z - b.d / 2 + .15, z1: b.z + b.d / 2 - .15, x0: b.x + b.w / 2 + .05, x1: b.x + b.w / 2 + .5 }
          : { z0: b.z - b.d / 2 + .15, z1: b.z + b.d / 2 - .15, x1: b.x - b.w / 2 - .05, x0: b.x - b.w / 2 - .5 };
        const walk = { N: { ...q, z0: q.z0 - .6 }, S: { ...q, z1: q.z1 + .6 }, W: { ...q, x0: q.x0 - .6 }, E: { ...q, x1: q.x1 + .6 } }[foot];
        if (P.inside(walk) && P.free(q, walk)) {
          P.taken.push(q);
          R.box('matte', (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, .23, q.x1 - q.x0, q.z1 - q.z0, .42, SOFA[(seed + 4) % SOFA.length]);
          out.push('bench');
        }
      }
    }
  } else if (elder) {
    const ch = P.onWall(order, 1.3, .8, { min: 1.2, clear: .3 });
    if (ch) {
      const f = P.frameOn(R, ch.side, ch.s), c2 = SOFA[(seed + 1) % SOFA.length];
      f.box('matte', -.25, .42, .22, .78, .78, .24, c2);
      f.box('matte', -.25, .1, .6, .78, .16, .56, c2);
      f.cyl('wood', .4, .3, .02, .2, .55, wood, 10);
      f.cyl('glow', .4, .3, .58, .12, .16, '#f2d7a8', 8);
      out.push('reading-chair');
    }
  } else {
    const dk = P.onWall(order, 1.2, .55, { min: 1.0, clear: .6 }) || P.onWall(order, 1.2, .55, { min: 1.0, clear: .6, exterior: true });
    if (dk) {
      const f = P.frameOn(R, dk.side, dk.s);
      f.box('wood', 0, .275, .74, dk.len, .55, .04, wood);
      for (const su of [-1, 1]) f.box('wood', su * (dk.len / 2 - .03), .275, .36, .04, .5, .72, wood);
      f.box('wood', 0, .1, 1.45, dk.len, .2, .03, wood);
      f.box('matte', -.2, .1, 1.53, .3, .16, .13, kid ? '#d98c6c' : '#7f8c86');
      f.box('matte', .1, .74, .45, .44, .44, .06, kid ? '#86a7c9' : '#5c6c63');
      f.box('matte', .1, .95, .72, .44, .05, .5, kid ? '#86a7c9' : '#5c6c63');
      f.cyl('metal', .1, .74, .03, .035, .39, '#5c5a55', 6);
      f.cyl('metal', .1, .74, 0, .24, .03, '#5c5a55', 8);
      out.push('desk');
    }
  }
  return { pieces: out, wardrobe: out.includes('wardrobe') || walkIn };
}

/** 阳台：带立柱与底盘的小圆桌和两把四脚椅，放在推拉门洞以外最长的一段，全部在阳台内。 */
function balconyPlan(R, P, seed) {
  const r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, long = w >= d ? 'x' : 'z', L = Math.max(w, d), D = Math.min(w, d);
  if (L < 2 || D < 1.2) return null;
  const [a0, a1] = long === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
  // Free spans along the long axis: outside the slider door zones.
  let free = [[a0 + .25, a1 - .25]];
  for (const z of P.zones) free = subtractInterval(free, long === 'x' ? [z.x0, z.x1] : [z.z0, z.z1]);
  const span = free.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0] || [a0 + .25, a1 - .25];
  const need = 1.75, end = span[0] - a0 < a1 - span[1] ? 'lo' : 'hi';
  let c = span[1] - span[0] >= need ? (span[0] + span[1]) / 2 : end === 'lo' ? a0 + .25 + need / 2 : a1 - .25 - need / 2;
  c = Math.min(a1 - .25 - need / 2, Math.max(a0 + .25 + need / 2, c));
  const m = (t, v) => long === 'x' ? [t, v] : [v, t], mid = long === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
  const top = ['#e5d6b8', '#d4c1a1', '#c9ccc4'][seed % 3], seat = ['#d8c4a3', '#a7b8ad', '#b9a78e'][(seed >> 1) % 3];
  const [tx, tz] = m(c, mid);
  R.cylinder('metal', tx, tz, 0, .2, .03, '#5c5a55', 10);
  R.cylinder('metal', tx, tz, .03, .035, .63, '#5c5a55', 6);
  R.cylinder('wood', tx, tz, .66, .3, .04, top, 12);
  for (const s of [-1, 1]) {
    const [cx, cz] = m(c + s * .64, mid), [sx, sz] = long === 'x' ? [.42, .42] : [.42, .42];
    R.box('wood', cx, cz, .45, sx, sz, .05, seat);
    for (const [ou, ov] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) { const [lx, lz] = m(c + s * .64 + ou, mid + ov); R.box('metal', lx, lz, .21, .03, .03, .42, '#5c5a55'); }
    const [bx, bz] = m(c + s * .83, mid);
    R.box('wood', bx, bz, .7, long === 'x' ? .04 : .42, long === 'x' ? .42 : .04, .46, seat);
  }
  // Planter at the other end of the balcony when it fits.
  const pc = c > (a0 + a1) / 2 ? a0 + .45 : a1 - .45;
  if (Math.abs(pc - c) > 1.4) { const [px, pz] = m(pc, mid); R.cylinder('matte', px, pz, 0, .22, .4, '#b4b8a5', 8); R.cylinder('foliage', px, pz, .4, .3, .6, '#617d58', 7); }
  return { table: m(c, mid), span };
}

function glassRail(R, a, b) {
  R.line('glass', a[0], a[1], .55, b[0], b[1], .55, .02, '#ffffff');
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
  R.box('glass', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, .58, Math.abs(dx) * len + Math.abs(dz) * .02, Math.abs(dz) * len + Math.abs(dx) * .02, .95, '#ffffff');
  R.line('metal', a[0], a[1], 1.08, b[0], b[1], 1.08, .05, '#8b8a7f');
  for (let t = 0; t <= len + 1e-6; t += Math.max(.6, len / Math.max(1, Math.round(len / 1.2)))) R.line('metal', a[0] + dx * t, a[1] + dz * t, 0, a[0] + dx * t, a[1] + dz * t, 1.08, .04, '#8b8a7f');
}

/** 套内双跑楼梯（复式下层）：两跑踏步、半层平台与扶手，标高取自 homeStair。 */
function stairTreads(R, res) {
  const s = res.homeStair;
  if (!s || s.role !== 'lower') return;
  for (const f of s.flights) {
    const [x0, z0] = f.bottom, [x1, z1] = f.top, n = f.steps, len = Math.hypot(x1 - x0, z1 - z0), run = len / n;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, h = f.y0 + (f.y1 - f.y0) * (i + 1) / n;
      R.box('wood', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, h - .03, Math.abs(x1 - x0) > .01 ? run + .01 : f.width, Math.abs(z1 - z0) > .01 ? run + .01 : f.width, .06, '#cdb48f');
    }
    const ox = Math.abs(z1 - z0) > .01 ? f.width / 2 - .04 : 0, oz = Math.abs(x1 - x0) > .01 ? f.width / 2 - .04 : 0;
    R.line('metal', x0 + ox, z0 + oz, f.y0 + .95, x1 + ox, z1 + oz, f.y1 + .95, .045, '#7f7a6c');
  }
  const l = s.landing;
  R.box('wood', (l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, s.landingY - .04, l.x1 - l.x0, l.z1 - l.z0, .08, '#cdb48f');
}

function bedLean(R, w, d, color, tables) {
  const { box, cylinder } = R;
  box('wood', 0, 0, .17, w, d, .28, '#e3d3b8');
  box('matte', 0, .05, .4, w - .06, d - .12, .18, '#f3efe6');
  box('matte', 0, d * .14, .5, w - .02, d * .66, .07, color);
  for (let k = 0, n = w >= 1.4 ? 2 : 1; k < n; k++) box('matte', (k - (n - 1) / 2) * w / 2.2, -d * .34, .55, Math.min(.62, w / n - .12), .38, .13, '#fbf8f0');
  box('wood', 0, -d / 2 - .05, .62, w + .1, .08, 1.15, '#cbb48f');
  if (!tables) return;
  for (const s of [-1, 1]) {
    box('wood', s * (w / 2 + .27), -d / 2 + .25, .27, .42, .4, .5, '#d9c6a6');
    cylinder('glow', s * (w / 2 + .27), -d / 2 + .25, .52, .1, .26, '#f2d7a8', 8);
  }
}
function bathLean(R, r, powder) {
  const { box, cylinder } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (!powder && d > 1.6 && w > 1.2) {
    const s = Math.min(1.1, w * .45, d * .45);
    box('stone', r.x1 - s / 2 - .06, r.z1 - s / 2 - .06, .05, s, s, .06, '#fafaf4');
    box('glass', r.x1 - s - .06, r.z1 - s / 2 - .06, 1.05, .02, s, 1.95, '#ffffff');
    cylinder('metal', r.x1 - s / 2 - .06, r.z1 - .2, 1.95, .1, .03, '#b8c0ba', 8);
  }
  // WC in the far corner, vanity and mirror on the side wall, clear of the door.
  const tx = r.x0 + .42, tz = r.z1 - .45;
  cylinder('satin', tx, tz, .02, .2, .4, '#f8f7ef', 10);
  box('satin', tx, tz + .22, .55, .42, .2, .5, '#f8f7ef');
  const vl = Math.min(.9, d - 1.4), vz = Math.max(r.z0 + .25 + vl / 2, (r.z0 + tz) / 2 - .1);
  if (vl > .4) {
    box('wood', r.x0 + .27, vz, .42, .5, vl, .78, '#e3d3b8');
    cylinder('satin', r.x0 + .3, vz, .8, .18, .1, '#fbfaf3', 10);
    box('mirror', r.x0 + .02, vz, 1.5, .02, Math.min(.8, vl), .8, '#ffffff');
  }
}
function kitchenLean(R, r) {
  const { box, cylinder } = R, w = r.x1 - r.x0, len = Math.max(1.2, w - .2), z = r.z1 - .33;
  box('wood', 0, z, .44, len, .62, .86, '#e7dcc8');
  box('stone', 0, z, .9, len + .04, .66, .05, '#fbfaf5');
  box('metal', -len * .25, z, .93, .55, .4, .02, '#a6b0a8');
  box('matte', len * .25, z, .93, .6, .45, .02, '#2a3530');
  box('metal', len * .25, z + .1, 1.95, .7, .45, .14, '#b4bcb4');
  box('wood', -len * .2, z + .08, 1.95, Math.min(1.4, len * .45), .42, .62, '#efe7d6');
  if (r.z1 - r.z0 > 2.2 && w > 2) { box('metal', r.x0 + .42, r.z0 + .5, 1.0, .68, .68, 2.0, '#c3cbc3'); }
}
function familyLean(R, r) {
  const { box } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 2 || d < 2) return;
  const sw = Math.min(w - .8, 2.4), sz = r.z1 - .5;
  box('matte', 0, sz, .25, sw, .8, .3, '#b4a58f');
  box('matte', 0, sz + .3, .6, sw, .2, .5, '#a8977f');
  box('wood', 0, sz - 1.1, .2, 1.0, .55, .4, '#d9c6a6');
  box('matte', 0, sz - .9, .015, Math.min(w - .5, 2.8), Math.min(d - .6, 2.2), .02, '#cfc9ba');
}
function diningLean(R, r, entryX) {
  const { box, cylinder } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  let x = 0;
  // 桌子避开入户通道。
  if (entryX != null && Math.abs(entryX) < .9) x = entryX > 0 ? Math.max(r.x0 + .9, entryX - 1.75) : Math.min(r.x1 - .9, entryX + 1.75);
  const tw = Math.min(1.6, w - 1.1), td = Math.min(.9, d - 1.2);
  if (tw < .8 || td < .6) return;
  box('wood', x, 0, .75, tw, td, .06, '#d8c3a0');
  box('wood', x, 0, .37, .12, .12, .72, '#b79b75');
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const cx = x + sx * tw * .25, cz = sz * (td / 2 + .3);
    box('matte', cx, cz, .45, .42, .42, .06, '#a9b3a2');
    box('matte', cx, cz + sz * .19, .7, .42, .05, .45, '#9aa792');
  }
  cylinder('glow', x, 0, 1.85, .3, .1, '#f6dfb2', 10);
}
function studyLean(R, r, name = '') {
  const { box } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (/茶/.test(name)) {
    box('wood', 0, 0, .2, Math.min(1.6, w - 1.2), Math.min(.9, d - 1.2), .4, '#b9966c');
    for (const s of [-1, 1]) box('matte', s * (Math.min(1.6, w - 1.2) / 2 + .35), 0, .12, .5, .5, .2, '#d8ccb0');
    box('wood', 0, r.z1 - .2, 1.0, Math.min(w - .4, 2.4), .32, 1.9, '#cdb48f');
    return;
  }
  if (/影音/.test(name)) {
    box('matte', 0, r.z1 - .55, .3, Math.min(w - .6, 2.6), .9, .4, '#5d6b74');
    box('matte', 0, r.z0 + .1, 1.4, Math.min(w - .6, 2.6), .04, 1.4, '#20262a');
    return;
  }
  box('wood', 0, r.z1 - .4, .74, Math.min(1.6, w - .6), .65, .05, '#d8c3a0');
  box('wood', 0, r.z1 - .4, .37, Math.min(1.5, w - .7), .55, .7, '#e3d3b8');
  box('matte', 0, r.z1 - 1.0, .45, .48, .48, .1, '#5c6c63');
  box('wood', r.x0 + .2, 0, 1.05, .35, Math.min(d - .5, 2.2), 2.1, '#cdb48f');
}
function closetLean(R, r) {
  const { box } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  box('wood', 0, r.z1 - .32, 1.1, w - .1, .6, 2.2, '#e6dac4');
  if (w > 1.6 && d > 1.8) for (const s of [-1, 1]) box('wood', s * (w / 2 - .32), 0, 1.1, .6, Math.max(.4, d - 1.4), 2.2, '#e1d4bd');
}
function laundryLean(R, r) {
  const { box, cylinder } = R, w = r.x1 - r.x0;
  box('matte', -Math.min(.5, w / 4), r.z1 - .35, .43, .6, .6, .86, '#f2f2ee');
  cylinder('glass', -Math.min(.5, w / 4), r.z1 - .66, .45, .2, .02, '#ffffff', 10);
  box('matte', -Math.min(.5, w / 4), r.z1 - .35, 1.3, .6, .6, .82, '#ecece8');
  if (w > 1.5) box('stone', Math.min(.5, w / 4), r.z1 - .3, .9, Math.min(.8, w / 2 - .3), .55, .06, '#f8f7f1');
}
function storageLean(R, r) {
  const { box } = R, w = r.x1 - r.x0;
  box('wood', 0, r.z1 - .25, 1.0, Math.max(.4, w - .3), .45, 2.0, '#ddd0b8');
}
function entryLean(R, r) {
  const { box } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 1.6 || d < 1.2) return;
  box('wood', r.x0 + .22, 0, 1.0, .38, Math.min(d - .4, 1.4), 2.0, '#e1d4bd');
  box('mirror', r.x1 - .03, 0, 1.4, .02, .6, 1.1, '#ffffff');
}
