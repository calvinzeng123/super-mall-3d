// 车流：园区道路靠右行驶的车辆；以及各期"地面车道 → 入口坡道 → 车库环线 → 出口坡道 → 地面车道"往返的车辆。
import * as THREE from 'three';
import { polyline } from '../paths.js';
import { rng } from '../textures.js';

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

export function buildTraffic(ctx) {
  const rand = rng(314);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  const street = [];
  for (const ln of LANES) {
    const len = ln.a1 - ln.a0;
    for (let i = 0; i < ln.n; i++) street.push({ ...ln, pos: ln.a0 + (i / ln.n) * len + rand() * (len / ln.n) * 0.6, speed: 9 + rand() * 5, color: COLORS[Math.floor(rand() * COLORS.length)] });
  }
  const streetMesh = new THREE.InstancedMesh(ctx.carGeo, ctx.carMat, street.length);
  street.forEach((car, i) => streetMesh.setColorAt(i, c.set(car.color)));
  streetMesh.instanceColor.needsUpdate = true;
  streetMesh.frustumCulled = false;
  streetMesh.castShadow = false;
  ctx.site.group.add(streetMesh);

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
