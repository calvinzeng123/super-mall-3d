// 车流：四周道路靠右行驶的车辆；以及沿"北辅路 → 车库入口坡道 → B1 环线 → 出口坡道 → 北辅路"往返的车辆。
import * as THREE from 'three';
import { polyline } from '../paths.js';
import { rng } from '../textures.js';

const COLORS = ['#f2f2f0', '#c9ccd0', '#1f2328', '#6b7178', '#2f5d9e', '#a8262b', '#d8cbb0', '#2f5f4a', '#e7b416'];

export function buildTraffic(ctx) {
  const rand = rng(314);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();

  // 道路车辆（x 向道路：东行 z 较大一侧；z 向道路：北行 x 较大一侧）
  const lanes = [];
  for (const z of [80, 84, 88]) lanes.push({ axis: 'x', c: z, dir: 1 });
  for (const z of [68, 72, 76]) lanes.push({ axis: 'x', c: z, dir: -1 });
  lanes.push({ axis: 'x', c: -67, dir: 1 }, { axis: 'x', c: -73, dir: -1 });
  for (const x of [-88, -84]) lanes.push({ axis: 'z', c: x, dir: -1 });
  for (const x of [-96, -92]) lanes.push({ axis: 'z', c: x, dir: 1 });
  for (const x of [92, 96]) lanes.push({ axis: 'z', c: x, dir: -1 });
  for (const x of [84, 88]) lanes.push({ axis: 'z', c: x, dir: 1 });
  const street = [];
  for (const ln of lanes) {
    const n = ln.axis === 'x' && Math.abs(ln.c) > 60 ? 6 : 4;
    for (let i = 0; i < n; i++) street.push({ ...ln, pos: -260 + (i / n) * 520 + rand() * 30, speed: 9 + rand() * 5, color: COLORS[Math.floor(rand() * COLORS.length)] });
  }
  const streetMesh = new THREE.InstancedMesh(ctx.carGeo, ctx.carMat, street.length);
  street.forEach((car, i) => streetMesh.setColorAt(i, c.set(car.color)));
  streetMesh.instanceColor.needsUpdate = true;
  streetMesh.frustumCulled = false;
  streetMesh.castShadow = false;
  ctx.site.group.add(streetMesh);

  // 进出车库的车辆
  const sp = ctx.paths.site.vehicle;
  const loopB1 = ctx.paths.levels.B1.vehicle[0].pts;
  const full = [...sp[0].pts, ...loopB1.slice(1, -1), ...sp[1].pts];
  const garagePath = polyline(full, false);
  const garage = [];
  for (let i = 0; i < 7; i++) garage.push({ d: (i / 7) * garagePath.total, speed: 5 + rand() * 1.5, color: COLORS[Math.floor(rand() * COLORS.length)] });
  const garageMesh = new THREE.InstancedMesh(ctx.carGeo, ctx.carMat, garage.length);
  garage.forEach((car, i) => garageMesh.setColorAt(i, c.set(car.color)));
  garageMesh.instanceColor.needsUpdate = true;
  garageMesh.frustumCulled = false;
  garageMesh.castShadow = false;
  ctx.root.add(garageMesh);

  const pos = [0, 0, 0];
  const dir = [0, 0, 1];
  ctx.dynamic.push({
    update(dt, time, app) {
      if (ctx.site.group.visible) {
        street.forEach((car, i) => {
          car.pos += car.speed * car.dir * dt;
          if (car.pos > 260) car.pos -= 520;
          if (car.pos < -260) car.pos += 520;
          if (car.axis === 'x') { p.set(car.pos, -0.1, car.c); q.setFromAxisAngle(up, car.dir > 0 ? Math.PI / 2 : -Math.PI / 2); }
          else { p.set(car.c, -0.1, car.pos); q.setFromAxisAngle(up, car.dir > 0 ? 0 : Math.PI); }
          m.compose(p, q, s);
          streetMesh.setMatrixAt(i, m);
        });
        streetMesh.instanceMatrix.needsUpdate = true;
      }
      const st = app.state;
      garageMesh.visible = !st.exploded && (!st.focus || st.focus === 'B1');
      if (!garageMesh.visible) return;
      garage.forEach((car, i) => {
        car.d += car.speed * dt;
        if (car.d > garagePath.total) car.d -= garagePath.total;
        garagePath.at(car.d, pos, dir);
        p.set(pos[0], pos[1] - 0.04, pos[2]);
        // 车头沿行驶方向，坡道上随坡度俯仰
        const yaw = Math.atan2(dir[0], dir[2]);
        const pitch = -Math.asin(Math.max(-1, Math.min(1, dir[1])));
        q.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        m.compose(p, q, s);
        garageMesh.setMatrixAt(i, m);
      });
      garageMesh.instanceMatrix.needsUpdate = true;
    },
  });
}
