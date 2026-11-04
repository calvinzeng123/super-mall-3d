// 车流：园区道路靠右行驶的车辆；以及各期"地面车道 → 入口坡道 → 车库环线 → 出口坡道 → 地面车道"往返的车辆；
// 云澜大道上进出星湾广场站港湾、停靠上下客的公交车（每向两辆，一个实例化网格）。
import * as THREE from 'three';
import { polyline } from '../paths.js';
import { rng } from '../textures.js';
import { BUS, busTrack, busTimetable, busDistance, trackPose } from '../../layout/bus-stops.js';

const COLORS = ['#f2f2f0', '#c9ccd0', '#1f2328', '#6b7178', '#2f5d9e', '#a8262b', '#d8cbb0', '#2f5f4a', '#e7b416'];

/** 车道：axis 为行驶轴，c 为横向位置，dir 为行驶方向，[a0,a1] 为循环区间 */
const LANES = [
  ...[4, 8, 12].map((c) => ({ axis: 'x', c, dir: 1, a0: -300, a1: 300, n: 7 })),
  ...[-4, -8, -12].map((c) => ({ axis: 'x', c, dir: -1, a0: -300, a1: 300, n: 7 })),
  ...[-2.5, -7.5].map((c) => ({ axis: 'z', c, dir: 1, a0: -300, a1: 300, n: 5 })),
  ...[2.5, 7.5].map((c) => ({ axis: 'z', c, dir: -1, a0: -300, a1: 300, n: 5 })),
  { axis: 'x', c: -259, dir: 1, a0: -300, a1: 300, n: 4 }, { axis: 'x', c: -265, dir: -1, a0: -300, a1: 300, n: 4 },
  { axis: 'x', c: 259, dir: -1, a0: -300, a1: 300, n: 3 }, { axis: 'x', c: 265, dir: 1, a0: -300, a1: 300, n: 3 },
  { axis: 'x', c: -167, dir: 1, a0: 12, a1: 286, n: 3 }, { axis: 'x', c: -173, dir: -1, a0: 12, a1: 286, n: 3 },
  { axis: 'z', c: -295, dir: 1, a0: -268, a1: 268, n: 3 }, { axis: 'z', c: -289, dir: -1, a0: -268, a1: 268, n: 3 },
  { axis: 'z', c: 289, dir: 1, a0: -268, a1: 268, n: 3 }, { axis: 'z', c: 295, dir: -1, a0: -268, a1: 268, n: 3 },
];

/** Street lanes of a layout. With 云澜江 the 星湾路 lanes run on over 星湾桥 and wrap at 滨江北路 (z -500). */
export function streetLanes(layout) {
  return layout?.site?.river ? LANES.map(ln => ln.axis === 'z' && Math.abs(ln.c) < 10 ? { ...ln, a0: -500, n: 7 } : ln) : LANES;
}

/** 12 m low-floor city bus as one vertex-coloured geometry (~1.2k vertices).
 * Front faces local +z; both doors are on local -x, the right-hand side.
 * White parts take the livery from the instance colour. */
export function busGeometry() {
  const parts = [];
  const add = (geo, color, x, y, z) => {
    geo.translate(x, y, z);
    const c = new THREE.Color(color), n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const L = BUS.length, W = BUS.width, H = BUS.height, glass = '#1b2731', dark = '#2a2f33';
  add(new THREE.BoxGeometry(W, 1.05, L - .1), '#ffffff', 0, .875, 0); // lower body
  add(new THREE.BoxGeometry(W - .04, 1.33, L - .34), glass, 0, 2.065, -.05); // side glazing
  add(new THREE.BoxGeometry(W, .3, L - .1), '#ffffff', 0, 2.88, 0); // roof band
  for (const z of [-4.3, -1.9, 1.6, 3.4]) for (const k of [-1, 1]) add(new THREE.BoxGeometry(.03, 1.33, .16), '#ffffff', k * (W / 2 - .005), 2.065, z);
  add(new THREE.BoxGeometry(1.7, .17, 3.4), '#e4e8e6', 0, H - .085, -1.4); // roof air-conditioning pod
  add(new THREE.BoxGeometry(W + .01, .14, L - 1.2), dark, 0, .42, 0); // skirt
  add(new THREE.BoxGeometry(W - .16, 1.5, .06), glass, 0, 1.98, L / 2 - .03); // windscreen
  add(new THREE.BoxGeometry(1.75, .24, .05), '#ffd27a', 0, 2.88, L / 2 + .01); // destination display
  add(new THREE.BoxGeometry(W - .4, .8, .05), glass, 0, 2.25, -L / 2 + .02); // rear window
  for (const z of [L / 2 - .02, -L / 2 + .02]) add(new THREE.BoxGeometry(W + .02, .28, .1), dark, 0, .5, z); // bumpers
  for (const k of [-1, 1]) {
    add(new THREE.BoxGeometry(.34, .14, .04), '#fff4d8', k * .86, .86, L / 2 + .01);
    add(new THREE.BoxGeometry(.24, .26, .04), '#c0392b', k * .95, 1.05, -L / 2 - .01);
  }
  for (const z of [4.85, -.25]) add(new THREE.BoxGeometry(.05, 2.25, 1.24), '#14212a', -W / 2 - .005, 1.5, z); // doors (right side)
  for (const [x, z] of [[-1.13, BUS.frontAxle], [1.13, BUS.frontAxle], [-1.13, BUS.rearAxle], [1.13, BUS.rearAxle]]) {
    const wheel = new THREE.CylinderGeometry(.5, .5, .3, 10);
    wheel.rotateZ(Math.PI / 2);
    add(wheel, '#15181b', x, .5, z);
  }
  const g = new THREE.BufferGeometry();
  const count = parts.reduce((n, p) => n + p.attributes.position.count, 0);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const p of parts) {
    p.computeVertexNormals();
    pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Scheduled buses for every bay stop: cruise, brake into the berth, dwell, pull away. */
function busService(ctx) {
  const buses = [];
  for (const stop of (ctx.layout.site.busStops || []).filter(s => s.kind === 'bay')) {
    const track = busTrack(stop);
    for (const bus of stop.service.buses) buses.push({ ...bus, track, table: busTimetable(track, bus) });
  }
  if (!buses.length) return null;
  const mesh = new THREE.InstancedMesh(busGeometry(), ctx.carMat, buses.length);
  const c = new THREE.Color();
  buses.forEach((b, i) => mesh.setColorAt(i, c.set(b.livery)));
  mesh.instanceColor.needsUpdate = true;
  mesh.name = 'bus-service';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  ctx.site.group.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1), none = new THREE.Vector3(0, 0, 0), pose = {};
  // Start with all four buses at their berths, then run the timetable.
  let clock = 34;
  const update = (dt) => {
    clock += dt;
    buses.forEach((b, i) => {
      const d = busDistance(b.table, clock);
      if (d === null) { m.compose(p.set(0, -50, 0), q.identity(), none); mesh.setMatrixAt(i, m); return; }
      trackPose(b.track, d, pose);
      q.setFromAxisAngle(up, Math.atan2(pose.hx, pose.hz));
      m.compose(p.set(pose.x, -0.11, pose.z), q, one);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, buses, update };
}

export function buildTraffic(ctx) {
  const rand = rng(314);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  const street = [];
  for (const ln of streetLanes(ctx.layout)) {
    const len = ln.a1 - ln.a0;
    for (let i = 0; i < ln.n; i++) street.push({ ...ln, pos: ln.a0 + (i / ln.n) * len + rand() * (len / ln.n) * 0.6, speed: 9 + rand() * 5, color: COLORS[Math.floor(rand() * COLORS.length)] });
  }
  const streetMesh = new THREE.InstancedMesh(ctx.carGeo, ctx.carMat, street.length);
  street.forEach((car, i) => streetMesh.setColorAt(i, c.set(car.color)));
  streetMesh.instanceColor.needsUpdate = true;
  streetMesh.frustumCulled = false;
  streetMesh.castShadow = false;
  ctx.site.group.add(streetMesh);
  const busLine = busService(ctx);
  if (busLine) ctx.busService = busLine;

  // 进出车库的车辆（每期一组）
  const garages = [];
  for (const b of ctx.layout.buildings) {
    const g = ctx.paths.site.garage && ctx.paths.site.garage[b.id];
    const inLv = g && ctx.layout.ramps.find((r) => r.building === b.id && r.type === 'street-in')?.to.level;
    const loop = inLv && ctx.paths.levels[inLv] && ctx.paths.levels[inLv].vehicle[0];
    if (!loop) continue;
    const pl = polyline([...g.in.pts, ...loop.pts.slice(1, -1), ...g.out.pts], false);
    const cars = [];
    for (let i = 0; i < 7; i++) cars.push({ d: (i / 7) * pl.total, speed: 5 + rand() * 1.5, color: COLORS[Math.floor(rand() * COLORS.length)] });
    const mesh = new THREE.InstancedMesh(ctx.carGeo, ctx.carMat, cars.length);
    cars.forEach((car, i) => mesh.setColorAt(i, c.set(car.color)));
    mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    ctx.root.add(mesh);
    garages.push({ mesh, pl, cars, L: ctx.levels[inLv] });
  }

  const pos = [0, 0, 0];
  const dir = [0, 0, 1];
  ctx.dynamic.push({
    update(dt, time, app) {
      if (ctx.site.group.visible) {
        street.forEach((car, i) => {
          car.pos += car.speed * car.dir * dt;
          if (car.pos > car.a1) car.pos -= car.a1 - car.a0;
          if (car.pos < car.a0) car.pos += car.a1 - car.a0;
          if (car.axis === 'x') { p.set(car.pos, -0.1, car.c); q.setFromAxisAngle(up, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
          else { p.set(car.c, -0.1, car.pos); q.setFromAxisAngle(up, car.dir > 0 ? 0 : Math.PI); }
          m.compose(p, q, s);
          streetMesh.setMatrixAt(i, m);
        });
        streetMesh.instanceMatrix.needsUpdate = true;
        if (busLine) busLine.update(dt);
      }
      for (const g of garages) {
        g.mesh.visible = !app.state.exploded && g.L.group.visible && g.L.base.visible;
        if (!g.mesh.visible) continue;
        g.cars.forEach((car, i) => {
          car.d += car.speed * dt;
          if (car.d > g.pl.total) car.d -= g.pl.total;
          g.pl.at(car.d, pos, dir);
          p.set(pos[0], pos[1] - 0.04, pos[2]);
          const yaw = Math.atan2(dir[0], dir[2]);
          const pitch = -Math.asin(Math.max(-1, Math.min(1, dir[1])));
          q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
          m.compose(p, q, s);
          g.mesh.setMatrixAt(i, m);
        });
        g.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  });
}
