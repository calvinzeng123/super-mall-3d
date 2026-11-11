// 住宅 / 公寓 / 酒店的单层内饰。调用方按当前楼层加载、移除，禁止全楼常驻。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { toW, toL, frame, subtractInterval } from '../../layout/geom.js';
import { DOOR, partitionAxis, doorSpan, bedsideRect, doorPassages } from '../../layout/community-units.js';
import { interiorDetail } from './interior-detail.js';
import { buildSuiteModels } from './suite-models.js';
import { buildResidentialModels } from './residential-models.js';
import { windowCurtain, COMMUNITY_PALETTES } from './community.js';

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
  // 墙面和家具用带细抹灰纹理的材质（完整页面里才有；单元测试的材质表没有它，照旧用纯色的 matte）。批次的名字不变。
  const homeMatte = community && ctx.mats.base.homeMatte?.userData?.homeFinish ? ctx.mats.base.homeMatte : null;
  const raw = new BatchSet(homeMatte ? Object.create(ctx.mats.base, { matte: { value: homeMatte } }) : ctx.mats.base);
  // The wall above every door (and its head casing) is a batch of its own: hidden whenever the camera looks down
  // from above this floor's ceiling (orbit cutaway, top views), so each doorway reads as a gap in the wall.
  // 各房间的吊顶和吸顶灯也在这一批里：从上往下看时一并隐藏，不挡住户内。
  const lintels = community ? new BatchSet({ lintel: homeMatte || ctx.mats.base.matte }) : null;
  // 贴花（落地阴影、墙根渐暗、窗边天光）和贴图模型直接交给底下的批次；单元测试里这些材质和模型库都没有，什么也不画
  const B = community ? { get: (k) => k === 'lintel' ? lintels.get('lintel') : raw.get(COMMUNITY_KEYS[k] || k),
    frame: (F, fn) => raw.frame(F, () => lintels.frame(F, fn)), flush: (g) => { raw.flush(g); lintels.flush(g); }, sets: raw.sets,
    blob: (...a) => raw.blob(...a), edge: (...a) => raw.edge(...a), pool: (...a) => raw.pool(...a), prop: (...a) => raw.prop(...a) } : raw;
  /** 这一层各房间吸顶灯的位置（世界坐标）：「室内灯光」从里面挑离人最近的几盏点亮。 */
  const lamps = [];
  const height = Math.max(2.6, (lv.height || lv.h || 3.5) - .30);
  const y0 = lv.elev;
  const labels = [];
  const wallKeys = new Set();

  for (const u of lv.units) {
    const residence = u.residence;
    if (!residence) continue;
    if (residence.kind === 'community') { communityHome(B, u, y0, height, labels, wallKeys, lv.height || lv.h || 3.5, lamps); continue; }
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
  const lintel = group.children.find((m) => m.isMesh && m.name === 'lintel') || null;
  if (lamps.length) L.lamps = lamps;
  let disposed = false;
  return {
    group, lintel, lamps,
    update(app) {
      suite?.update(app); residential?.update(app);
      if (lintel) lintel.visible = !!app.state.explore || app.camera.position.y < y0 + height;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (L.lamps === lamps) delete L.lamps;
      suite?.dispose();
      residential?.dispose();
      group.removeFromParent();
      // 贴图模型（userData.sharedProp）的几何和材质是全园区共用的：只通知模型库把这一块摘掉，不放掉几何
      group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.sharedProp) o.dispose?.();
        else if (!o.geometry.userData.sharedSuite && !o.geometry.userData.sharedResidential) o.geometry.dispose();
      });
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
  const tools = interiorDetail(B, F, P, y0);
  /** 摆一个贴图模型（户内坐标，离楼面 h）。没有模型库（单元测试、只算布局的空跑）时返回 false，调用方照旧画方块。 */
  tools.prop = (id, a, b, h = 0, ry = 0, scale = 1, opts) => (B.prop ? B.prop(id, a, y0 + h, b, ry, scale, opts) : false);
  return tools;
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

const FACE_DOWN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI), _cp = new THREE.Vector3(), _cs = new THREE.Vector3();
/** 房间小到装不下一盏吸顶灯的最短边（米）。 */
const LAMP_MIN = 1.5;
/** 住宅吸顶灯的光强：按房间面积配，客厅大一些（见 indoor-lighting.js 的说明）。 */
const lampPower = (area) => Math.min(13, Math.max(6, 5 + area * .32));

function communityHome(B, u, y0, height, labels, wallKeys, storey = height + .3, lamps = null) {
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
    piece(0, d0, .02, height); piece(d1, len, .02, height); piece(d0, d1, 2.15, height, 'lintel');
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
      // 入户门：深色钢质门扇、门套与把手，按 entryDoor.leaf 贴墙停放（布局里选定）。
      if (entry.leaf) doorSet(R, { axis: 'x', line: 0, g0: d0, g1: d1, tw: .16 }, entry.leaf, FRONT_DOOR);
      box('metal', d1 + .2, -.09, 1.6, .26, .02, .18, '#7b735c');
      const [lx, lz] = toW(u.frame, d1 + .2, -.105), [nx, nz] = toW(u.frame, 0, -1), [ox, oz] = toW(u.frame, 0, 0);
      labels.push({ x: lx, z: lz, nx: nx - ox, nz: nz - oz, text: homePlate(u.code) });
    }
    for (const p of res.partitions) {
      if (p.role === 'railing') { glassRail(R, p.a, p.b); continue; }
      if (p.role === 'balcony-slider') {
        // 推拉门玻璃在外壳（剖切时随外立面切掉）；室内留门槛、两侧边框与上槛，剖切后读作门框而不是孤立的立柱。
        const [a, b] = [p.a, p.b];
        R.line('metal', a[0], a[1], .02, b[0], b[1], .02, .06, '#8d9188');
        for (const q of [a, b]) R.line('metal', q[0], q[1], 0, q[0], q[1], 2.4, .06, '#8d9188');
        R.line('metal', a[0], a[1], 2.4, b[0], b[1], 2.4, .07, '#8d9188');
        continue;
      }
      const opened = wall(p.a, p.b, p.door ? p.door : null, p.role === 'stair-wall' ? '#e4ddd0' : '#eeeae1');
      // 户内门：门套、门扇与执手；门扇按布局记录（partition.door.leaf）开向所服务的房间、贴墙停放。
      if (opened && p.role !== 'opening' && p.door.leaf) {
        const s = partitionAxis(p), [g0, g1] = doorSpan(p);
        // 户内避难间（residence.refugeRoom）的门是乙级防火门（supertall：layout 给门扇 fire: '乙级'）：钢质门、闭门器、标识。
        const fire = p.door.leaf.fire || p.door.fire;
        doorSet(R, { axis: s.axis, line: s.c, g0, g1, tw: .12 }, p.door.leaf, fire ? FIRE_DOOR : INNER_DOOR);
      }
    }
    stairTreads(R, res);
    curtainFolds(R, res, y0, storey);
    // 吊顶和吸顶灯：每个房间一块平顶、正中一盏灯。画在门楣那一批里（从上往下看时隐藏）。阳台、楼梯、挑空不做。
    for (const r of res.rooms) {
      if (r.kind === 'stair' || r.kind === 'void' || r.kind === 'balcony') continue;
      const q = r.rect, w = q.x1 - q.x0, d = q.z1 - q.z0, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
      // 平顶是一张朝下的面（两个三角形），灯是一块薄的方形面板：整层的盒体预算（≤ 1,500）不用为它们让路
      // 楼板底面在层高以下 0.31 米（社区外壳的做法）；平顶再低 2 厘米，盖住那块不发光的楼板底
      const top = y0 + height - .03;
      B.get('lintel').shape('planeUp', _cp.set(cx, top, cz), FACE_DOWN, _cs.set(w - .02, 1, d - .02), '#f6f3ec');
      if (Math.min(w, d) < LAMP_MIN) continue;
      B.get('lintel').box(cx, top - .025, cz, .46, .05, .46, '#fffaf0');
      if (lamps) { const [wx, wz] = toW(u.frame, cx, cz); lamps.push([wx, top - .1, wz, lampPower(w * d)]); }
    }
  });
  communityFurniture(B, u, y0);
}

const OUT = { S: [0, 1], N: [0, -1], W: [-1, 0], E: [1, 0] };
/**
 * The façade's drawn-back curtains (community.js windowCurtain, a flat pane 0.25 m inside the glass), seen from the
 * room as gathered fabric: three narrow folds at alternating depths (1.5 cm apart) just in front of that pane, in two
 * shades. Only on the loaded floor; the campus view keeps the single pane.
 */
function curtainFolds(R, res, y0, h) {
  const pal = COMMUNITY_PALETTES[res.community] || COMMUNITY_PALETTES.west;
  // A curtain by a doorway (a window next to the balcony slider) keeps the flat pane: the folds stay out of every passage.
  const passages = doorPassages(res, .5).map((q) => q.rect), meets = (q) => passages.some((p) => q.x0 < p.x1 && p.x0 < q.x1 && q.z0 < p.z1 && p.z0 < q.z1);
  for (const w of res.facadeWalls || []) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), t = w.thickness || .2, [ox, oz] = OUT[w.side] || OUT.S;
    if (len < .02) continue;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len, inner = 2.2 * (t / 2 + .012), alongX = Math.abs(ux) > .5;
    for (const o of w.openings || []) {
      if (o.type === 'railing') continue;
      const op = { ...o, s0: Math.max(0, o.at - o.width / 2), s1: Math.min(len, o.at + o.width / 2) };
      if (op.s1 - op.s0 <= .1) continue;
      const bottom = Math.max(0, o.bottom ?? .6), top = Math.min(h - .25, o.top ?? 2.4), c = windowCurtain(op, y0, len, bottom);
      if (!c) continue;
      const y = (bottom + top) / 2, tall = top - bottom - .1, fw = c.cw / 3;
      const span = [0, c.cw].map((d) => [w.a[0] + ux * (c.s0 + d) - ox * inner, w.a[1] + uz * (c.s0 + d) - oz * inner]);
      const foot = { x0: Math.min(span[0][0], span[1][0]) - .05, x1: Math.max(span[0][0], span[1][0]) + .05, z0: Math.min(span[0][1], span[1][1]) - .05, z1: Math.max(span[0][1], span[1][1]) + .05 };
      if (meets(foot)) continue;
      for (let k = 0; k < 3; k++) {
        const along = c.s0 + fw * (k + .5), depth = inner + .014 + (k % 2) * .015;
        const x = w.a[0] + ux * along - ox * depth, z = w.a[1] + uz * along - oz * depth;
        R.box('matte', x, z, y, alongX ? fw + .012 : .014, alongX ? .014 : fw + .012, tall, k % 2 ? pal.curtain : shade(pal.curtain, .9));
      }
    }
  }
}
const shade = (hex, f) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, '0')).join('');

// 门：户内门为暖白色漆面门扇与门套（不是木地板纹理），入户门为深色钢质门；执手为金属拉手。
const INNER_DOOR = { frameKey: 'matte', frame: '#f4f1ea', leafKey: 'matte', leaf: '#ebe5d8', handle: '#8d8576', lining: DOOR.lining, casing: .03 };
const FRONT_DOOR = { frameKey: 'metal', frame: '#4b4844', leafKey: 'metal', leaf: '#615b54', handle: '#d9d2c3', lining: DOOR.frontLining, casing: .05 };
/** 乙级防火门 finish (the 户内避难间 door): a steel leaf in fire-door red-brown, a steel frame, a closer and a sign plate. */
export const FIRE_DOOR = { frameKey: 'metal', frame: '#5d5a55', leafKey: 'metal', leaf: '#8f4b3a', handle: '#d9d2c3', lining: DOOR.lining, casing: .04, fire: true };
/**
 * One door in unit-local coordinates: jambs with their casings on both faces, the head casing, the leaf where the
 * layout parked it (leaf.rect: open 90° or folded back 180°; a pocket leaf shows its edge in the opening) and a
 * lever handle through the leaf near its free edge. About six boxes in the floor's existing batches.
 */
function doorSet(R, { axis, line, g0, g1, tw }, leaf, st) {
  const slab = (a0, a1, n0, n1, y0, y1, key, color) => {
    const r = axis === 'x' ? { x0: a0, x1: a1, z0: n0, z1: n1 } : { x0: n0, x1: n1, z0: a0, z1: a1 };
    R.box(key, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, (y0 + y1) / 2, r.x1 - r.x0, r.z1 - r.z0, y1 - y0, color);
  };
  const d = tw / 2 + .015, top = leaf.h + .03;
  slab(g0 - st.casing, g0 + st.lining, line - d, line + d, 0, top, st.frameKey, st.frame);
  slab(g1 - st.lining, g1 + st.casing, line - d, line + d, 0, top, st.frameKey, st.frame);
  slab(g0 - st.casing, g1 + st.casing, line - d, line + d, top, top + .08, 'lintel', st.frame);
  if (leaf.kind === 'pocket') {
    // Pocket door slid into the wall: its edge and a flush pull show in the opening.
    const e = leaf.side === 'lo' ? g0 + st.lining : g1 - st.lining, k = leaf.side === 'lo' ? 1 : -1;
    slab(Math.min(e, e + k * .05), Math.max(e, e + k * .05), line - leaf.t / 2, line + leaf.t / 2, .012, .012 + leaf.h, st.leafKey, st.leaf);
    slab(Math.min(e + k * .02, e + k * .04), Math.max(e + k * .02, e + k * .04), line - leaf.t / 2 - .006, line + leaf.t / 2 + .006, .95, 1.1, 'metal', st.handle);
    return;
  }
  const q = leaf.rect;
  R.box(st.leafKey, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, .012 + leaf.h / 2, q.x1 - q.x0, q.z1 - q.z0, leaf.h, st.leaf);
  // Lever handle: a rose 6 cm from the free edge and the lever toward the hinge, through the leaf (both faces).
  const [fx, fz] = leaf.free, [hx, hz] = leaf.hinge, L = Math.hypot(hx - fx, hz - fz) || 1, ux = (hx - fx) / L, uz = (hz - fz) / L;
  const across = (len, thick, at, y, h) => R.box('metal', fx + ux * at, fz + uz * at, y, Math.abs(ux) * len + Math.abs(uz) * thick, Math.abs(uz) * len + Math.abs(ux) * thick, h, st.handle);
  across(.05, leaf.t + .024, .06, 1.0, .07);
  across(.13, leaf.t + .07, .12, 1.0, .022);
  if (st.fire) {
    // Closer at the head on the hinge side, and the 「乙级防火门 · 户内避难间」 plate at eye height on the leaf.
    const at = (k) => [hx + (fx - hx) * k, hz + (fz - hz) * k];
    const [cx, cz] = at(.25), [px, pz] = at(.5);
    R.box('metal', cx, cz, leaf.h - .06, Math.abs(ux) * .3 + Math.abs(uz) * (leaf.t + .06), Math.abs(uz) * .3 + Math.abs(ux) * (leaf.t + .06), .06, '#2f2e2c');
    R.box('matte', px, pz, 1.55, Math.abs(ux) * .24 + Math.abs(uz) * (leaf.t + .012), Math.abs(uz) * .24 + Math.abs(ux) * (leaf.t + .012), .08, '#e9dccb');
  }
}

/** Door-plate text of a community home: 1201, 10W, or 14–15W for a duplex (both parts). */
export function homePlate(code) {
  const id = String(code).replace(/-[LU]$/, '').split('-').at(-1), m = /^(\d{2})(\d{2})([A-Z])$/.exec(id);
  return m ? `${m[1]}–${m[2]}${m[3]}` : id;
}

/**
 * Furniture of one community home. Beds come from the plan (with the bedside tables the layout kept); every
 * other piece is planned against its room's solid walls (doors, openings, glass and open-plan edges removed) so
 * that it stays inside the room, clear of doorways, parked door leaves and beds; the set and colours vary with
 * the home type and code. Returns a summary per room for tests.
 */
export function communityFurniture(B, u, y0) {
  const res = u.residence, R = makeRoomTools(B, y0), ext = new Set(res.exteriorSides || []);
  // Per-home seed; the floor seed plus the slot keeps neighbours on one floor in different colours.
  const seed = hashCode(u.code), slot = /^\d+$/.test(u.slot) ? +u.slot - 1 : u.slot === 'E' ? 1 : 0;
  const tone = hashCode(u.level || u.code) + slot * 2, summary = { living: [], bedrooms: [], balconies: [], solids: [] };
  const beds = res.beds || [], leaves = (res.doorLeaves || []).filter((l) => l.rect);
  for (const [i, bed] of beds.entries()) {
    const side = bed.head || 'N', F = roomFrame(u, bed.x, bed.z, side);
    const [w, d] = side === 'E' || side === 'W' ? [bed.d, bed.w] : [bed.w, bed.d];
    // Bedside tables the layout kept (bed.tables: 'L' / 'R' = the lower / higher unit-local side, lower case = slim),
    // as frame sides ±1.
    const lat = side === 'N' || side === 'S', keep = bedTables(res, bed);
    const sides = [-1, 1].map((k) => {
      const [x, z] = toL(u.frame, ...toW(F, k * (w / 2 + .27), 0)), t = keep.find((q) => q.toUpperCase() === ((lat ? x < bed.x : z < bed.z) ? 'L' : 'R'));
      return t ? { s: k, slim: t !== t.toUpperCase() } : null;
    }).filter(Boolean);
    B.frame(F, () => bedLean(R, w, d, PALETTE[(i + tone) % PALETTE.length], sides));
  }
  // Every room is planned against its solid walls (unit-local, axis-aligned): each piece clears the doorway
  // zones, openings, windows, beds and the door leaves parked in the room (PV-5).
  B.frame(u.frame, () => {
    for (const r of res.rooms) {
      const P = roomPlanner(res, ext, r, beds, leaves);
      if (r.kind === 'living') { const s = livingPlan(R, P, res, seed, tone); if (s) summary.living.push({ room: r.id, ...s }); }
      else if (r.kind === 'bedroom') summary.bedrooms.push({ room: r.id, name: r.name, ...bedroomPlan(R, P, r, seed) });
      else if (r.kind === 'balcony') { const s = balconyPlan(R, P, seed); if (s) summary.balconies.push({ room: r.id, ...s }); }
      else if (r.kind === 'dining') diningPlan(R, P, res.entryDoor?.at ?? null);
      else if (r.kind === 'family') familyPlan(R, P);
      else if (r.kind === 'bathroom' || r.kind === 'powder') {
        const bath = res.bathrooms?.find((b) => b.id === r.id);
        bathPlan(R, P, r.kind === 'powder' || bath?.powder, OPPOSITE[bath?.door?.side || doorSide(res, r)]);
      }
      else if (r.kind === 'entry') entryPlan(R, P);
      else if (r.kind === 'study') studyPlan(R, P, r.name);
      else if (r.kind === 'closet') closetPlan(R, P);
      else if (r.kind === 'storage') storagePlan(R, P);
      else if (r.kind === 'laundry') laundryPlan(R, P);
      else if (r.kind === 'kitchen') kitchenPlan(R, P, OPPOSITE[res.kitchen?.door?.side || doorSide(res, r)]);
      for (const q of P.solids) summary.solids.push({ room: r.id, ...q });
      if (B.blob) groundCues(B, u, r, P, y0 + .024);
    }
  });
  return summary;
}

/** 太阳的水平方向（世界坐标，和 env.js 的 sunDir 一致）：朝着它的窗进来的是暖的直射光，背着它的是偏冷的天光。 */
const SUN_XZ = [-.664, .748];
const DAYLIT = new Set(['living', 'dining', 'bedroom', 'study', 'family', 'kitchen']);
/**
 * 一个房间里让东西「落地」、让窗「进光」的贴花（都只是贴在地面上的半透明图，不改任何家具和墙）：
 *   家具、床脚下的一团软阴影（按布局里已经占掉的位置来，门扇那种细条不垫）；
 *   实墙墙根的一条渐暗带（门洞、落地窗、开敞的一边不画）；
 *   外墙或落地玻璃一侧地面上的天光，朝阳的一面暖而亮，背阴的一面冷而淡，入夜淡出。
 */
function groundCues(B, u, room, P, y) {
  const r = P.rect;
  for (const q of P.taken) {
    const w = q.x1 - q.x0, d = q.z1 - q.z0;
    if (Math.min(w, d) < .25) continue;
    B.blob((q.x0 + q.x1) / 2, y, (q.z0 + q.z1) / 2, w + .34, d + .34);
  }
  for (const side of SIDES) {
    const S = P.sides[side];
    for (const [a, b] of S.stretches) {
      // 顺时针走一圈（N 边向 +x、E 边向 +z、S 边向 −x、W 边向 −z），渐暗带都落在房间这一侧
      if (side === 'N') B.edge(a, S.line, b, S.line, y, .42);
      else if (side === 'E') B.edge(S.line, a, S.line, b, y, .42);
      else if (side === 'S') B.edge(b, S.line, a, S.line, y, .42);
      else B.edge(S.line, b, S.line, a, y, .42);
    }
    if (!(S.exterior || S.glass) || !DAYLIT.has(room.kind)) continue;
    // 进光的那几段：外墙上是窗洞，户内是落地玻璃（整条边去掉实墙）
    let lit = S.onOutline ? S.cuts.map((c) => [Math.max(S.span[0], c[0]), Math.min(S.span[1], c[1])]) : [[...S.span]];
    if (!S.onOutline) for (const w of S.wall) lit = subtractInterval(lit, w);
    const [ox, oz] = OUT[side], [wx, wz] = toW(u.frame, ox, oz), [w0, z0] = toW(u.frame, 0, 0);
    const sunny = (wx - w0) * SUN_XZ[0] + (wz - z0) * SUN_XZ[1] > .15;
    const reach = Math.min((S.horiz ? r.z1 - r.z0 : r.x1 - r.x0) - .2, sunny ? 3.2 : 2.3), color = sunny ? 0xffe2b0 : 0x8497a8;
    if (reach < 1) continue;
    for (const [a, b] of mergeIv(lit.filter(([p, q]) => q - p >= .5))) {
      if (side === 'N') B.edge(a, S.line, b, S.line, y, reach, 1, 'dayPool', color);
      else if (side === 'E') B.edge(S.line, a, S.line, b, y, reach, 1, 'dayPool', color);
      else if (side === 'S') B.edge(b, S.line, a, S.line, y, reach, 1, 'dayPool', color);
      else B.edge(S.line, b, S.line, a, y, reach, 1, 'dayPool', color);
    }
  }
}

/** Batches that draw nothing: communityFurniture run for its plan only (same placement as the drawn floor). */
const NOOP = new Proxy({}, { get: () => () => {} });
const DRY = { get: () => NOOP, frame: (F, fn) => fn() };
const SOLIDS = new WeakMap(), SOLIDS_BY_PLAN = new Map();
/**
 * Nav footprints are the drawn bodies less 5 cm at the ends and 15 cm at the door fronts (the back stays on the wall):
 * the walker (r 0.3 m) may brush the fronts, so the 0.5–0.55 m walkway roomPlanner leaves between a wardrobe and a
 * bed stays passable, while the body behind the fronts stays solid.
 */
export const SOLID_INSET = Object.freeze({ end: .05, front: .15 });
/**
 * Unit-local footprints of a community home's tall furniture (wardrobes, closets, stores, shoe and tea cabinets,
 * bookcase, fridge, washer stack), each less SOLID_INSET a side: what buildNav(layout, { unitSolids }) makes solid,
 * so a walker cannot step into a cabinet. Placement is the renderer's own (roomPlanner), so nav and the drawn floor
 * always agree. It reads only the plan geometry (not the per-home colour seed): homes with one plan share one result.
 */
export function communitySolids(u) {
  const r = u.residence;
  if (r?.kind !== 'community') return [];
  if (!SOLIDS.has(u)) {
    const key = JSON.stringify([r.width, r.depth, r.community, r.rooms, r.partitions, r.beds, r.doorLeaves, r.exteriorSides, r.facadeWalls,
      r.entryDoor, r.obstacles, r.bathrooms, r.kitchen, r.bedrooms, r.area]);
    const { end: e, front: f } = SOLID_INSET, inset = ({ rect: q, side }) => side === 'N' ? { x0: q.x0 + e, x1: q.x1 - e, z0: q.z0, z1: q.z1 - f }
      : side === 'S' ? { x0: q.x0 + e, x1: q.x1 - e, z0: q.z0 + f, z1: q.z1 } : side === 'W' ? { x0: q.x0, x1: q.x1 - f, z0: q.z0 + e, z1: q.z1 - e }
        : { x0: q.x0 + f, x1: q.x1, z0: q.z0 + e, z1: q.z1 - e };
    if (!SOLIDS_BY_PLAN.has(key)) SOLIDS_BY_PLAN.set(key, communityFurniture(DRY, u, 0).solids.map(inset));
    SOLIDS.set(u, SOLIDS_BY_PLAN.get(key));
  }
  return SOLIDS.get(u);
}
/** Bedside tables of a bed: the layout's choice (bed.tables), else both when both lateral gaps exceed 0.95 m. */
function bedTables(res, bed) {
  if (Array.isArray(bed.tables)) return bed.tables;
  const room = res.rooms.find((r) => r.id === bed.room)?.rect, side = bed.head || 'N';
  const gap = room ? Math.min(...(side === 'N' || side === 'S' ? [bed.x - bed.w / 2 - room.x0, room.x1 - bed.x - bed.w / 2] : [bed.z - bed.d / 2 - room.z0, room.z1 - bed.z - bed.d / 2])) : 0;
  return gap > .95 ? ['L', 'R'] : [];
}

const hashCode = (s) => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) % 9973;
};
const SOFA = ['#9eaea2', '#b9a78e', '#8e9fb3', '#c4b9a8', '#a6938a', '#7f948a', '#cbb89d', '#98a3ad', '#b28f7c'];
/** 给贴图模型染色用：把一户的色调向白色靠七成，模型自己的布纹和明暗留着。 */
const softTint = (hex) => { const n = parseInt(hex.slice(1), 16), k = (v) => Math.round(255 - (255 - v) * .3); return (k(n >> 16) << 16) | (k((n >> 8) & 255) << 8) | k(n & 255); };
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
function roomPlanner(res, ext, room, beds, leaves = []) {
  const r = room.rect, sides = {}, zones = [], taken = [];
  for (const side of SIDES) {
    const horiz = side === 'N' || side === 'S', line = { N: r.z0, S: r.z1, W: r.x0, E: r.x1 }[side];
    const [s0, s1] = horiz ? [r.x0, r.x1] : [r.z0, r.z1], edge = { N: 0, S: res.depth, W: 0, E: res.width }[side];
    const solid = [], cut = [], cutLow = [];
    let glass = false, exterior = false;
    const zone = (c, w, depth) => {
      const a = c - w / 2 - .1, b = c + w / 2 + .1;
      zones.push(horiz ? { x0: a, x1: b, z0: side === 'N' ? line : line - depth, z1: side === 'N' ? line + depth : line }
        : { z0: a, z1: b, x0: side === 'W' ? line : line - depth, x1: side === 'W' ? line + depth : line });
      cut.push([a - .05, b + .05]); cutLow.push([a - .05, b + .05]);
    };
    if (Math.abs(line - edge) < 1e-3) {
      solid.push([s0, s1]);
      if (ext.has(side)) {
        exterior = true;
        // Exterior wall: solid between the window openings of the home's facade on this side.
        for (const w of res.facadeWalls || []) {
          if (w.side !== side) continue;
          const dir = Math.sign((horiz ? w.b[0] - w.a[0] : w.b[1] - w.a[1]) || 1), a0 = horiz ? w.a[0] : w.a[1];
          for (const o of w.openings || []) {
            const c = a0 + dir * o.at, g = [c - o.width / 2 - .1, c + o.width / 2 + .1];
            cut.push(g); if ((o.bottom ?? .6) < .95) cutLow.push(g);
            if (o.type === 'railing' || (o.bottom ?? .6) < .3) glass = true;
          }
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
    const wallIv = mergeIv(solid.map((q) => [...q]));
    let iv = mergeIv(solid), low = mergeIv(solid.map((q) => [...q]));
    for (const c of cut) iv = subtractInterval(iv, c);
    for (const c of cutLow) low = subtractInterval(low, c);
    sides[side] = { side, horiz, line, exterior, glass, onOutline: Math.abs(line - edge) < 1e-3, span: [s0, s1], wall: wallIv, cuts: cut.map((c) => [...c]),
      stretches: iv.filter(([a, b]) => b - a > .4).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])),
      low: low.filter(([a, b]) => b - a > .4).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])) };
  }
  const bed = beds.find((q) => q.room === room.id) || null;
  for (const b of beds.filter((q) => q.room === room.id)) {
    const q = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 }, head = b.head || 'N';
    taken.push(q);
    // Bedside tables the layout kept flank the head end.
    for (const t of bedTables(res, b)) taken.push(bedsideRect(b, t.toUpperCase() === 'L' ? -1 : 1, t !== t.toUpperCase()));
  }
  // Door leaves parked open in this room.
  for (const l of leaves) if (overlaps(l.rect, r, .01)) taken.push(l.rect);
  // Footprints of the tall pieces (≥ 1.2 m: wardrobes, closets, stores, shoe / tea cabinets, bookcase, fridge,
  // washer stack): solid for walking (communitySolids → buildNav).
  const solids = [];
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
  const onWall = (list, len, depth, { min = len, clear = .5, off = .09, exterior = false, ends = false, low = false, solid = false } = {}) => {
    for (const side of list) {
      const S = sides[side];
      if (!S || (S.exterior && !exterior)) continue;
      for (const [a, b] of low ? S.low : S.stretches) for (let L = Math.min(len, b - a - .2); L >= min - 1e-6; L -= .2) {
        for (const s of ends ? [a + .1 + L / 2, b - .1 - L / 2, (a + b) / 2] : [(a + b) / 2, a + .1 + L / 2, b - .1 - L / 2]) {
          const q = rectAt(side, s, L, depth, off);
          if (free(q, grow(side, q, clear))) { taken.push(q); if (solid) solids.push({ rect: q, side }); return { side, s, len: L, ab: [a, b], rect: q }; }
        }
      }
    }
    return null;
  };
  /**
   * A tall cabinet backed on the door wall, flush behind a door leaf of this room that stands free (no wall within
   * 5 cm of its back): its end 4 cm off the leaf's back face, so the open leaf rests against the cabinet. The wall
   * behind is solid (only this door's own clearance cut is crossed); other doorways, windows, beds and leaves keep clear.
   */
  const behindLeaf = (len, depth, { min = len, clear = .5 } = {}) => {
    for (const l of leaves) {
      if (l.kind !== 'swing' || l.rest || l.into !== room.id) continue;
      const side = l.axis === 'x' ? (l.n > 0 ? 'N' : 'S') : (l.n > 0 ? 'W' : 'E'), S = sides[side];
      if (!S || Math.abs(S.line - l.line) > .2) continue;
      const k = l.side === 'lo' ? -1 : 1, ac = l.axis === 'x' ? l.hinge[0] : l.hinge[1];
      const end = (l.axis === 'x' ? (k < 0 ? l.rect.x0 : l.rect.x1) : (k < 0 ? l.rect.z0 : l.rect.z1)) + k * .04;
      const own = (z) => z.x0 - 1e-6 <= l.hinge[0] && l.hinge[0] <= z.x1 + 1e-6 && z.z0 - 1e-6 <= l.hinge[1] && l.hinge[1] <= z.z1 + 1e-6;
      // Longest first: up to the wall's end (or the room's, 0.085 m in), then in 0.2 m steps down to `min`.
      const span = S.wall.find(([a, b]) => a <= end + 1e-6 && end <= b + 1e-6), lim = k > 0 ? Math.min(span?.[1] ?? -Infinity, S.span[1]) : Math.max(span?.[0] ?? Infinity, S.span[0]);
      const room0 = Math.floor((Math.abs(lim - end) - .09) * 100) / 100;
      for (let L = Math.min(len, room0); L >= min - 1e-6; L -= .2) {
        const p0 = Math.min(end, end + k * L), p1 = Math.max(end, end + k * L), q = rectAt(side, (p0 + p1) / 2, L, depth);
        if (!S.wall.some(([a, b]) => a <= p0 + 1e-6 && p1 <= b + 1e-6)) continue;
        if (S.cuts.some(([a, b]) => !(a <= ac && ac <= b) && a < p1 && p0 < b)) continue;
        const front = grow(side, q, clear);
        if (!inside(q) || !inside(front) || zones.some((z) => !own(z) && overlaps(q, z)) || taken.some((t) => overlaps(front, t))) continue;
        taken.push(q); solids.push({ rect: q, side });
        return { side, s: (p0 + p1) / 2, len: L, rect: q, leaf: l.id };
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
      // 贴图模型：中心在 (u, v)；dir = 1 时正面朝墙（−v，沙发对着电视墙），dir = −1 时背靠墙、正面朝屋里（+v）
      prop: (id, u, v, y, dir, scale, opts) => { const [x, z] = m(u, v, 0, 0); return R.prop(id, x, z, y, { N: Math.PI, S: 0, W: -Math.PI / 2, E: Math.PI / 2 }[side] + (dir < 0 ? Math.PI : 0), scale, opts); },
    };
  };
  const closet = res.partitions.some((p) => p.door && p.id.split('/').includes(room.id) && p.id.split('/').some((id) => res.rooms.find((q) => q.id === id)?.kind === 'closet'));
  return { room, rect: r, bed, closet, sides, zones, taken, solids, free, inside, rectAt, onWall, behindLeaf, frameOn };
}

/**
 * Tall cabinet with door fronts: a lacquered body (matte, not the oak floor-plank texture), door seams, pulls and a
 * recessed plinth, backed on its wall (frame from frameOn). Used for wardrobes, closets, stores, shoe and tea cabinets.
 */
function wardrobe(f, len, color, depth = .6, h = 2.2, { doors = .55, pull = 1.05, niche = null } = {}) {
  f.box('matte', 0, depth / 2, h / 2 + .04, len, depth, h - .08, color);
  const n = Math.max(2, Math.round(len / doors));
  for (let k = 1; k < n; k++) f.box('metal', -len / 2 + len * k / n, depth + .004, h / 2 + .04, .012, .008, h - .2, '#8d8576');
  for (let k = 0; k < n; k++) f.box('metal', -len / 2 + len * (k + (k % 2 ? .12 : .88)) / n, depth + .015, pull, .02, .025, .32, '#b7ae98');
  f.box('matte', 0, depth / 2 - .03, .04, len - .02, depth - .06, .08, '#5f574e');
  // An open niche across the fronts (shoe cabinet: keys and post at hand height).
  if (niche) f.box('matte', 0, depth + .002, niche, len - .06, .006, .3, '#6e6458');
}
/** Bookcase: side panels, back, shelves and rows of books (two runs of spines) on every shelf. */
function bookcase(f, len, depth = .35, h = 2.1, color = '#e9e2d4') {
  f.box('matte', 0, .01, h / 2, len, .02, h, '#d8cfbf');
  for (const s of [-1, 1]) f.box('matte', s * (len / 2 - .012), depth / 2, h / 2, .024, depth, h, color);
  const rows = 5, gap = (h - .1) / rows;
  for (let k = 0; k <= rows; k++) f.box('matte', 0, depth / 2, .05 + k * gap, len - .03, depth, .025, color);
  const SPINE = ['#7d937c', '#b7846c', '#6f7f99', '#d0bfa9', '#8f6f52', '#a7b8ad'];
  for (let k = 0; k < rows; k++) {
    const y = .065 + k * gap, inner = len - .08;
    for (const [a, b, i] of [[-.5, -.04, 0], [.06, .44, 1]]) {
      const hb = gap * (.62 + ((k * 3 + i) % 3) * .08), w = (b - a) * inner;
      f.box('matte', ((a + b) / 2) * inner, depth * .55, y + hb / 2, w, depth * .7, hb, SPINE[(k * 2 + i) % SPINE.length]);
    }
  }
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
  /** 沙发用的是贴图模型（true）还是方块（false）：转角那一段跟着它，模型配脚凳，方块配方块。 */
  let softSofa = true;
  /** Sofa whose front is at vf and back at vf + dir · depth (seat, back, arms, cushions). */
  const drawSofa = (F, du, vf, len, dir) => {
    const at = (o) => vf + dir * o;
    // 有贴图模型时用布艺沙发模型，拉伸到这张沙发的占地（长 len、深 sofaD）；颜色在模型本色上带一点这一户的色调。
    // 没有模型库（单元测试、模型包没下载下来）时照旧画方块。
    const id = len >= 2.2 ? 'sofa3' : 'sofa2', [mw, md] = id === 'sofa3' ? [2.731, .925] : [1.807, .818];
    if (F.prop(id, du, at(sofaD / 2 + .015), .02, dir, [len / mw, id === 'sofa3' ? .82 : 1.08, (sofaD - .03) / md], { color: softTint(sofaColor) })) return true;
    softSofa = false;
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
      // 沙发是贴图模型时，转角这一段换成同色调的脚凳（占地还是这块 0.9 × 0.75）
      if (!softSofa || !T.prop('ottoman', du + s * (len / 2 - .45), v - .36, .02, 1, [.9 / .885, .72, .68 / .621], { color: softTint(sofaColor) })) {
        T.box('matte', du + s * (len / 2 - .45), v - .32, .22, .9, .86, .26, sofaColor);
        T.box('matte', du + s * (len / 2 - .1), v - .32, .43, .2, .86, .3, sofaColor);
      }
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
      // Picture hung on the wall above the sideboard: a dark frame and a two-tone canvas.
      const face = wallFace(P, sb.side), px = -sb.len / 4;
      f.box('matte', px, face + .015, 1.45, .56, .03, .76, '#3f3a34');
      f.box('matte', px, face + .031, 1.5, .48, .004, .56, RUG[(seed + 1) % RUG.length]);
      f.box('matte', px, face + .032, 1.235, .48, .004, .13, SOFA[(seed + 4) % SOFA.length]);
      pieces.push('sideboard', 'picture');
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

/** v (in a frameOn frame, off 0.09 from the wall line) of the room-side face of the wall on `side`. */
function wallFace(P, side) {
  const S = P.sides[side], half = S.exterior ? .1 : S.onOutline ? .08 : .06;
  return half - .09;
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
  // A door leaf standing free in the room rests against the end of a tall cabinet set behind it on the door wall
  // (a suite with a walk-in closet gets a short one; a short one in a plain bedroom still leaves room for the wardrobe).
  const back = P.behindLeaf(walkIn ? 1.6 : master ? 2.8 : 2.2, .6, { min: .75, clear: .5 }) || P.behindLeaf(.7, .45, { min: .5, clear: .5 });
  if (back) {
    const deep = P.sides[back.side].horiz ? back.rect.z1 - back.rect.z0 : back.rect.x1 - back.rect.x0;
    wardrobe(P.frameOn(R, back.side, back.s), back.len, master ? '#e8ddc8' : kid ? '#f0e6d2' : '#e3d5bd', deep, 2.2, { doors: back.len < .75 ? .7 : .55 });
    // A full-length one is the room's wardrobe; a short one is an extra tall cabinet behind the door.
    out.push(...(back.len >= 1.6 ? ['wardrobe', 'door-cabinet'] : ['door-cabinet']));
  }
  const need = !walkIn && !(back && back.len >= 1.6);
  let wr = need ? P.onWall(order, master ? 2.8 : 2.2, .6, { min: 1.0, clear: .5, solid: true }) : null;
  if (!wr && need) wr = P.onWall(order, master ? 2.8 : 2.2, .6, { min: 1.0, clear: .5, exterior: true, solid: true });
  if (!wr && need) wr = P.onWall(order, .9, .55, { min: .8, clear: .45, exterior: true, solid: true });
  if (wr) { wardrobe(P.frameOn(R, wr.side, wr.s), wr.len, master ? '#e8ddc8' : kid ? '#f0e6d2' : '#e3d5bd', wr.rect.x1 - wr.rect.x0 < .58 || wr.rect.z1 - wr.rect.z0 < .58 ? .55 : .6); out.push('wardrobe'); }
  if (master) {
    const dr = P.onWall(order, 1.3, .45, { min: .9, clear: .6 }) || P.onWall(order, 1.3, .45, { min: .9, clear: .6, exterior: true });
    if (dr) {
      const f = P.frameOn(R, dr.side, dr.s);
      f.box('wood', 0, .225, .38, dr.len, .45, .72, wood);
      // Mirror on the wall above the dresser, on a dark frame 2.5 cm proud of it all round (as the foyer mirror).
      const face = wallFace(P, dr.side), mw = Math.min(.9, dr.len - .2);
      f.box('matte', 0, face + .008, 1.35, mw + .05, .016, .95, '#6e6458');
      f.box('mirror', 0, face + .02, 1.35, mw, .012, .9, '#ffffff');
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
  if (Math.abs(pc - c) > 1.4) {
    const [px, pz] = m(pc, mid);
    // 阳台另一头的盆栽：有贴图模型就用真的盆栽，没有就画花盆加一团叶子
    if (!R.prop(seed % 2 ? 'plant_tall' : 'plant_pachira_small', px, pz, .024, (seed % 8) * .785, seed % 2 ? .95 : .8, { outdoor: true })) {
      R.cylinder('matte', px, pz, 0, .22, .4, '#b4b8a5', 8); R.cylinder('foliage', px, pz, .4, .3, .6, '#617d58', 7);
    }
  }
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

function bedLean(R, w, d, color, sides = []) {
  const { box, cylinder } = R;
  box('wood', 0, 0, .17, w, d, .28, '#e3d3b8');
  box('matte', 0, .05, .4, w - .06, d - .12, .18, '#f3efe6');
  box('matte', 0, d * .14, .5, w - .02, d * .66, .07, color);
  for (let k = 0, n = w >= 1.4 ? 2 : 1; k < n; k++) box('matte', (k - (n - 1) / 2) * w / 2.2, -d * .34, .55, Math.min(.62, w / n - .12), .38, .13, '#fbf8f0');
  box('wood', 0, -d / 2 - .05, .62, w + .1, .08, 1.15, '#cbb48f');
  // Bedside tables (the layout makes one slim, or drops it, where it would stand in a doorway or a door's swing).
  for (const { s, slim } of sides) {
    const c = s * (w / 2 + (slim ? .17 : .27));
    box('wood', c, -d / 2 + .25, .27, slim ? .3 : .42, .4, .5, '#d9c6a6');
    cylinder('glow', c, -d / 2 + .25, .52, slim ? .08 : .1, .26, '#f2d7a8', 8);
  }
}
/**
 * 卫生间：淋浴房靠墙角（玻璃隔断朝房间）、马桶与洗手台靠实墙，经 roomPlanner 摆放，所以避开所有门洞
 * （含通往储藏间的第二樘门）、停放的门扇与窗。far 是正对房门的那面墙，淋浴房与马桶优先靠它。
 */
function bathPlan(R, P, powder, far) {
  const r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, order = [far, ...bySpan(P, [far])];
  let sh = null;
  if (!powder && Math.min(w, d) > 1.2 && Math.max(w, d) > 1.6) {
    const s = Math.min(1.1, w * .45, d * .45);
    sh = s >= .7 && P.onWall(order, s, s, { min: s, clear: .1, ends: true, exterior: true });
    if (sh) {
      // The glass screen on the tray's open side, away from the corner it is tucked into.
      const f = P.frameOn(R, sh.side, sh.s), lo = Math.abs(sh.s - (sh.ab[0] + .1 + sh.len / 2)) < 1e-6, corner = lo ? sh.ab[0] : sh.ab[1];
      const along = (u) => { const q = f.rect(u, 0, u, 0); return P.sides[sh.side].horiz ? q.x0 : q.z0; };
      const su = Math.abs(along(s / 2) - corner) > Math.abs(along(-s / 2) - corner) ? s / 2 : -s / 2;
      f.box('stone', 0, s / 2, .05, s, s, .06, '#fafaf4');
      f.box('glass', su, s / 2, 1.05, .02, s, 1.95, '#ffffff');
      f.cyl('metal', 0, .15, 1.95, .1, .03, '#b8c0ba', 8);
    }
  }
  const wc = P.onWall(order, .5, .72, { min: .5, clear: .45, exterior: true });
  if (wc) {
    const f = P.frameOn(R, wc.side, wc.s);
    f.cyl('satin', 0, .45, .02, .2, .4, '#f8f7ef', 10);
    f.box('satin', 0, .1, .55, .42, .2, .5, '#f8f7ef');
  }
  const vl = Math.min(.9, Math.max(w, d) - 1.4);
  const va = vl > .4 && P.onWall(bySpan(P), vl, .52, { min: .5, clear: .55 });
  if (va) {
    const f = P.frameOn(R, va.side, va.s), face = wallFace(P, va.side);
    f.box('wood', 0, .25, .42, va.len, .5, .78, '#e3d3b8');
    f.cyl('satin', 0, .28, .8, .18, .1, '#fbfaf3', 10);
    f.box('matte', 0, face + .006, 1.5, Math.min(.8, va.len) + .05, .012, .85, '#6e6458');
    f.box('mirror', 0, face + .016, 1.5, Math.min(.8, va.len), .012, .8, '#ffffff');
  }
  return { shower: !!sh, wc: !!wc, vanity: !!va };
}
/** 家庭起居厅：沙发靠最长的实墙，前面茶几与地毯（经 roomPlanner，避开门洞与门扇）。 */
function familyPlan(R, P) {
  const r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
  if (w < 2 || d < 2) return null;
  const so = P.onWall(bySpan(P), Math.min(Math.max(w, d) - .8, 2.4), .8, { min: 1.6, clear: 1.3 });
  if (!so) return null;
  const f = P.frameOn(R, so.side, so.s), len = so.len;
  f.box('matte', 0, .4, .25, len, .8, .3, '#b4a58f');
  f.box('matte', 0, .1, .6, len, .2, .5, '#a8977f');
  const t = f.rect(-.5, 1.3, .5, 1.85);
  if (P.free(t)) { P.taken.push(t); f.box('wood', 0, 1.575, .2, 1.0, .55, .4, '#d9c6a6'); }
  // Rug under the sofa front and the table, kept inside the room.
  const q = f.rect(-Math.min(len + .4, 2.8) / 2, .5, Math.min(len + .4, 2.8) / 2, 2.2), k = .2;
  const rg = { x0: Math.max(q.x0, r.x0 + k), x1: Math.min(q.x1, r.x1 - k), z0: Math.max(q.z0, r.z0 + k), z1: Math.min(q.z1, r.z1 - k) };
  if (rg.x1 > rg.x0 + 1 && rg.z1 > rg.z0 + 1) R.box('matte', (rg.x0 + rg.x1) / 2, (rg.z0 + rg.z1) / 2, .015, rg.x1 - rg.x0, rg.z1 - rg.z0, .02, '#cfc9ba');
  return { side: so.side };
}
/** 餐厅：餐桌与四把椅子，离房间中心最近、且避开入户通道（0.9 m）与所有门洞通行区的位置。 */
function diningPlan(R, P, entryAt) {
  const { box, cylinder } = R, r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const tw = Math.min(1.6, w - 1.1), td = Math.min(.9, d - 1.2);
  if (tw < .8 || td < .6) return null;
  const xs = [];
  for (let x = r.x0 + tw / 2 + .3; x <= r.x1 - tw / 2 - .3 + 1e-6; x += .1) xs.push(x);
  xs.sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));
  for (const x of xs) {
    if (entryAt != null && entryAt > r.x0 && entryAt < r.x1 && Math.abs(x - entryAt) < tw / 2 + .45) continue;
    const q = { x0: x - tw / 2 - .05, x1: x + tw / 2 + .05, z0: cz - td / 2 - .5, z1: cz + td / 2 + .5 };
    if (!P.free(q)) continue;
    P.taken.push(q);
    box('wood', x, cz, .75, tw, td, .06, '#d8c3a0');
    box('wood', x, cz, .37, .12, .12, .72, '#b79b75');
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const chx = x + sx * tw * .25, chz = cz + sz * (td / 2 + .3);
      box('matte', chx, chz, .45, .42, .42, .06, '#a9b3a2');
      box('matte', chx, chz + sz * .19, .7, .42, .05, .45, '#9aa792');
    }
    cylinder('glow', x, cz, 1.85, .3, .1, '#f6dfb2', 10);
    return { x };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 玄关、书房、衣帽间、储藏、家务间与冰箱：全部经 roomPlanner.onWall 靠实墙摆放，自动避开门洞通行区、
// 开口、窗与停放的门扇（PV-5）；高柜都有门板缝与拉手（PV-4），书架有隔板和书。
/** The room's sides, longest solid stretch first (optionally leaving some out). */
const bySpan = (P, skip = []) => SIDES.filter((s) => !skip.includes(s)).sort((a, b) => span(P, b) - span(P, a));
const span = (P, s) => { const t = P.sides[s].stretches[0]; return t ? t[1] - t[0] : 0; };

/** 玄关：顶天鞋柜（门板、拉手、中部开放格）与穿衣镜，都靠实墙、不挡任何门洞。 */
function entryPlan(R, P) {
  const sc = P.onWall(bySpan(P), 1.4, .38, { min: .8, clear: .6, solid: true });
  if (sc) wardrobe(P.frameOn(R, sc.side, sc.s), sc.len, '#e1d4bd', .38, 2.0, { doors: .45, pull: 1.3, niche: 1.0 });
  const m = P.onWall(bySpan(P), .6, .04, { min: .5, clear: .5 });
  if (m) {
    const f = P.frameOn(R, m.side, m.s), face = wallFace(P, m.side);
    f.box('matte', 0, face + .008, 1.3, m.len, .016, 1.4, '#6e6458');
    f.box('mirror', 0, face + .02, 1.3, m.len - .06, .012, 1.32, '#ffffff');
  }
  return { cabinet: !!sc, mirror: !!m };
}
/** 书房：书桌与椅子、带隔板和书的书架；茶室：茶桌、坐垫与带门茶柜；影音室：幕布与正对的沙发。 */
function studyPlan(R, P, name = '') {
  const r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  if (/茶/.test(name)) {
    const cab = P.onWall(bySpan(P), Math.min(2.4, Math.max(w, d) - .4), .4, { min: 1.0, clear: .7, solid: true });
    if (cab) wardrobe(P.frameOn(R, cab.side, cab.s), cab.len, '#d9cdb6', .4, 1.9, { doors: .5, pull: 1.0, niche: 1.1 });
    const long = w >= d, tw = Math.min(1.6, Math.max(w, d) - 1.6), td = Math.min(.9, Math.min(w, d) - 1.6);
    const q = long ? { x0: cx - tw / 2 - .45, x1: cx + tw / 2 + .45, z0: cz - td / 2, z1: cz + td / 2 } : { z0: cz - tw / 2 - .45, z1: cz + tw / 2 + .45, x0: cx - td / 2, x1: cx + td / 2 };
    if (tw >= .8 && td >= .5 && P.free(q)) {
      P.taken.push(q);
      R.box('wood', cx, cz, .2, long ? tw : td, long ? td : tw, .4, '#b9966c');
      for (const s of [-1, 1]) R.box('matte', long ? cx + s * (tw / 2 + .3) : cx, long ? cz : cz + s * (tw / 2 + .3), .12, .5, .5, .2, '#d8ccb0');
    }
    return;
  }
  if (/影音/.test(name)) {
    const scr = P.onWall(bySpan(P), Math.min(2.6, Math.max(w, d) - .6), .06, { min: 1.6, clear: 2.4 });
    if (!scr) return;
    const f = P.frameOn(R, scr.side, scr.s), face = wallFace(P, scr.side);
    f.box('matte', 0, face + .02, 1.45, scr.len, .04, 1.4, '#20262a');
    f.box('matte', 0, face + .21, .2, Math.min(scr.len, 1.8), .4, .4, '#3e4448');
    const so = P.onWall([OPPOSITE[scr.side]], Math.min(2.4, scr.len), .9, { min: 1.4, clear: .4 });
    if (so) {
      const g = P.frameOn(R, so.side, so.s);
      g.box('matte', 0, .45, .22, so.len, .86, .3, '#5d6b74');
      g.box('matte', 0, .1, .55, so.len, .2, .5, '#56636b');
    }
    return;
  }
  const order = bySpan(P).sort((a, b) => (P.sides[b].exterior ? 1 : 0) - (P.sides[a].exterior ? 1 : 0));
  const dk = P.onWall(order, 1.5, .65, { min: 1.0, clear: .8, exterior: true });
  if (dk) {
    const f = P.frameOn(R, dk.side, dk.s);
    f.box('wood', 0, .325, .74, dk.len, .65, .05, '#d8c3a0');
    f.box('matte', 0, .3, .37, dk.len - .1, .55, .7, '#e3d3b8');
    f.box('matte', 0, 1.0, .45, .48, .48, .1, '#5c6c63');
    f.box('matte', 0, 1.22, .75, .48, .06, .55, '#5c6c63');
    P.taken.push(f.rect(-.3, .7, .3, 1.3));
  }
  const bk = P.onWall(bySpan(P), Math.min(2.2, Math.max(w, d) - .5), .35, { min: .9, clear: .7, solid: true });
  if (bk) bookcase(P.frameOn(R, bk.side, bk.s), bk.len, .35, 2.1);
}
/** 衣帽间：最多三面墙的顶天衣柜（门板与拉手），中间留 ≥ 0.8 m 通道。 */
function closetPlan(R, P) {
  let n = 0;
  for (let k = 0; k < 3; k++) {
    // The first run takes the wall behind a free-standing door leaf, when there is one (the leaf rests on its end).
    const c = (k === 0 && P.behindLeaf(5, .6, { min: .9, clear: .8 })) || P.onWall(bySpan(P), 5, .6, { min: .9, clear: .8, solid: true });
    if (!c) break;
    wardrobe(P.frameOn(R, c.side, c.s), c.len, k ? '#e1d4bd' : '#e6dac4', .6, 2.2);
    n++;
  }
  return n;
}
/** 储藏间：一组带门高柜（大储藏间再加一组）。 */
function storagePlan(R, P) {
  const r = P.rect, area = (r.x1 - r.x0) * (r.z1 - r.z0);
  for (let k = 0; k < (area > 8 ? 2 : 1); k++) {
    const c = P.onWall(bySpan(P), 3, .45, { min: .6, clear: .6, solid: true });
    if (!c) break;
    wardrobe(P.frameOn(R, c.side, c.s), c.len, '#ddd0b8', .45, 2.0, { doors: .5 });
  }
}
/** 家务间：洗衣机与烘干机叠放、带台面的洗衣池。 */
function laundryPlan(R, P) {
  const wd = P.onWall(bySpan(P), .64, .64, { min: .64, clear: .6, solid: true });
  if (wd) {
    const f = P.frameOn(R, wd.side, wd.s);
    f.box('matte', 0, .32, .43, .6, .6, .86, '#f2f2ee');
    f.box('matte', 0, .32, 1.3, .6, .6, .82, '#ecece8');
    for (const y of [.5, 1.32]) f.box('glass', 0, .625, y, .3, .01, .3, '#ffffff');
  }
  const sk = P.onWall(bySpan(P), .9, .55, { min: .7, clear: .6 });
  if (sk) {
    const f = P.frameOn(R, sk.side, sk.s);
    f.box('matte', 0, .27, .43, sk.len, .54, .86, '#e8e4da');
    f.box('stone', 0, .275, .9, sk.len + .02, .56, .06, '#f8f7f1');
    f.box('metal', 0, .3, .935, .4, .32, .02, '#a6b0a8');
  }
}
/**
 * 厨房：台面（柜体、石材台面、水槽、灶台、油烟机、吊柜）优先靠正对房门的墙，可在窗台高于台面的窗下；
 * 冰箱另靠一面实墙。都经 roomPlanner 摆放，不挡门洞（含储藏间门）与门扇。
 */
function kitchenPlan(R, P, far) {
  const r = P.rect, w = r.x1 - r.x0, d = r.z1 - r.z0;
  const k = P.onWall([far, ...bySpan(P, [far])], Math.max(w, d) - .2, .66, { min: 1.2, clear: .9, exterior: true, low: true });
  if (k) {
    const f = P.frameOn(R, k.side, k.s), len = k.len;
    f.box('wood', 0, .31, .44, len, .62, .86, '#e7dcc8');
    f.box('stone', 0, .33, .9, len + .02, .66, .05, '#fbfaf5');
    f.box('metal', -len * .25, .33, .93, .55, .4, .02, '#a6b0a8');
    f.box('matte', len * .25, .33, .93, .6, .45, .02, '#2a3530');
    // Hood and wall cabinets above the run, unless a window sits behind it.
    if (!P.sides[k.side].exterior) {
      f.box('metal', len * .25, .23, 1.95, .7, .45, .14, '#b4bcb4');
      f.box('wood', -len * .2, .21, 1.95, Math.min(1.4, len * .45), .42, .62, '#efe7d6');
    }
  }
  if (w < 2 || d < 2.2) return { counter: !!k, fridge: false };
  const fr = P.onWall(bySpan(P), .7, .7, { min: .7, clear: .7, exterior: true, solid: true });
  if (fr) {
    const f = P.frameOn(R, fr.side, fr.s);
    f.box('metal', 0, .34, 1.0, .68, .68, 2.0, '#c3cbc3');
    f.box('matte', 0, .685, 1.32, .66, .006, .012, '#7a8d7d');
    f.box('metal', -.26, .7, 1.05, .025, .04, .5, '#607868');
  }
  return { counter: !!k, fridge: !!fr };
}
