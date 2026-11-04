// 住宅 / 公寓 / 酒店的单层内饰。调用方按当前楼层加载、移除，禁止全楼常驻。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { toW, frame } from '../../layout/geom.js';
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
      labels.push({ x: lx, z: lz, nx: nx - ox, nz: nz - oz, text: u.code.split('-').at(-1) });
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
  // 家具：每类房间在自身坐标系内布置（正面朝门）。
  const beds = res.beds || [];
  for (const [i, bed] of beds.entries()) {
    const side = bed.head || 'N', F = roomFrame(u, bed.x, bed.z, side);
    const [w, d] = side === 'E' || side === 'W' ? [bed.d, bed.w] : [bed.w, bed.d];
    const room = res.rooms.find((r) => r.id === bed.room)?.rect;
    const gap = room ? Math.min(...(side === 'N' || side === 'S' ? [bed.x - bed.w / 2 - room.x0, room.x1 - bed.x - bed.w / 2] : [bed.z - bed.d / 2 - room.z0, room.z1 - bed.z - bed.d / 2])) : 0;
    B.frame(F, () => bedLean(R, w, d, PALETTE[(i + u.slot.length) % PALETTE.length], gap > .95));
  }
  for (const r of res.rooms) {
    const q = r.rect, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
    const place = (side, fn) => B.frame(roomFrame(u, cx, cz, side), () => fn(centred(q, side)));
    if (r.kind === 'bathroom' || r.kind === 'powder') {
      const bath = res.bathrooms?.find((b) => b.id === r.id);
      place(bath?.door?.side || doorSide(res, r), (c) => bathLean(R, c, r.kind === 'powder' || bath?.powder));
    } else if (r.kind === 'kitchen') place(res.kitchen?.door?.side || doorSide(res, r), (c) => kitchenLean(R, c));
    else if (r.kind === 'living') place(q.x1 - q.x0 >= 2.6 ? 'W' : 'N', (c) => livingLean(R, c));
    else if (r.kind === 'family') place(q.x1 - q.x0 >= q.z1 - q.z0 ? 'W' : 'N', (c) => familyLean(R, c));
    else if (r.kind === 'dining') place('N', (c) => diningLean(R, c, res.entryDoor ? res.entryDoor.at - cx : null));
    else if (r.kind === 'study') place(doorSide(res, r), (c) => studyLean(R, c, r.name));
    else if (r.kind === 'closet') place(doorSide(res, r), (c) => closetLean(R, c));
    else if (r.kind === 'laundry') place(doorSide(res, r), (c) => laundryLean(R, c));
    else if (r.kind === 'storage') place(doorSide(res, r), (c) => storageLean(R, c));
    else if (r.kind === 'entry') place('N', (c) => entryLean(R, c));
    else if (r.kind === 'balcony') place(doorSide(res, r), (c) => balconyLean(R, c));
  }
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
function livingLean(R, r) {
  const { box } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 2.2 || d < 2.5) return;
  const sw = Math.min(w - 1.0, 2.8), sz = r.z1 - .5;
  box('matte', 0, (sz + Math.max(r.z0 + .3, sz - 3.2)) / 2, .015, Math.min(w - .6, 3.4), Math.min(d - .8, 2.6), .02, '#c6c6b6');
  box('matte', 0, sz, .25, sw, .85, .3, '#9eaea2');
  box('matte', 0, sz + .32, .62, sw, .2, .55, '#93a598');
  for (const s of [-1, 1]) box('matte', s * (sw / 2 - .1), sz, .45, .2, .85, .32, '#8b9f92');
  box('wood', 0, sz - 1.2, .2, 1.2, .6, .4, '#d9c6a6');
  const tz = r.z0 + .25;   // TV console against the wall facing the sofa
  box('wood', 0, tz, .25, Math.min(w - .6, 2.2), .4, .5, '#d9c6a6');
  box('matte', 0, tz + .02, 1.15, 1.5, .06, .85, '#1f2b26');
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
function balconyLean(R, r) {
  const { box, cylinder } = R, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 2 || d < 1.2) return;
  cylinder('wood', r.x0 + .55, 0, .68, .3, .04, '#e5d6b8', 10);
  for (const s of [-1, 1]) box('wood', r.x0 + .55 + s * .55, 0, .43, .42, .42, .06, '#d8c4a3');
  cylinder('matte', r.x1 - .45, 0, .02, .22, .4, '#b4b8a5', 8);
  cylinder('foliage', r.x1 - .45, 0, .42, .3, .6, '#617d58', 7);
}
