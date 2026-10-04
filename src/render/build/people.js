// 行人：沿各层动线行走（含乘扶梯），实例化身体 + 头部；停车层少量、天台与美食广场较多。
import * as THREE from 'three';
import { polyline } from '../paths.js';
import { rng } from '../textures.js';

const CLOTHES = ['#2f3a45', '#c0392b', '#2f6fd6', '#f2f2f0', '#e0a526', '#2e9c6a', '#7b4fd6', '#d1495b', '#8a6a4a', '#1f2328', '#f08a24', '#5bb4d6'];
const SKIN = ['#f1d3b8', '#e8c1a0', '#d9a77f', '#c68e63'];
const COUNT = { parking: 12, food: 70, retail: 75, roof: 45, street: 40 };

export function buildPeople(ctx) {
  const bodyGeo = new THREE.CapsuleGeometry(0.21, 0.92, 3, 8).translate(0, 0.67, 0);
  const headGeo = new THREE.SphereGeometry(0.125, 10, 8).translate(0, 1.5, 0);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const rand = rng(99);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const walkers = [];

  for (const lv of ctx.layout.levels) {
    const paths = (ctx.paths.levels[lv.id] || {}).people || [];
    if (!paths.length) continue;
    const n = lv.kind === 'street' && lv.ground ? 120 : COUNT[lv.kind] || 20;
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    bodies.castShadow = false;
    heads.castShadow = false;
    bodies.frustumCulled = false;
    heads.frustumCulled = false;
    const list = [];
    for (let i = 0; i < n; i++) {
      // 扶梯路径上分配少量乘客
      const onEsc = rand() < 0.16;
      const pool = paths.filter((x) => !!x.escalator === onEsc);
      const path = (pool.length ? pool : paths)[Math.floor(rand() * (pool.length ? pool.length : paths.length))];
      const pl = polyline(path.pts, path.loop);
      const lateral = path.escalator ? (rand() - 0.5) * 0.25 : (rand() - 0.5) * (lv.kind === 'parking' ? 0.6 : 3.2);
      list.push({
        pl, loop: path.loop, escalator: !!path.escalator,
        d: rand() * pl.total, speed: path.escalator ? 0.5 : 0.85 + rand() * 0.55,
        dir: path.loop && rand() < 0.5 ? -1 : 1, lateral, phase: rand() * 10,
        pause: 0,
      });
      bodies.setColorAt(i, c.set(CLOTHES[Math.floor(rand() * CLOTHES.length)]));
      heads.setColorAt(i, c.set(SKIN[Math.floor(rand() * SKIN.length)]));
    }
    bodies.instanceColor.needsUpdate = true;
    heads.instanceColor.needsUpdate = true;
    ctx.levels[lv.id].people.add(bodies, heads);
    walkers.push({ lv, bodies, heads, list });
  }

  const pos = [0, 0, 0];
  const dir = [0, 0, 1];
  let acc = 0;
  ctx.dynamic.push({
    update(dt, time) {
      acc += dt;
      if (acc < 1 / 40) return;
      const step = acc;
      acc = 0;
      for (const w of walkers) {
        const grp = w.bodies.parent;
        if (!grp || !grp.visible || !grp.parent || !grp.parent.visible || !grp.parent.parent.visible) continue;
        w.list.forEach((a, i) => {
          a.d += a.speed * a.dir * step;
          if (!a.loop && (a.d > a.pl.total || a.d < 0)) a.d = a.dir > 0 ? 0 : a.pl.total;
          a.pl.at(a.d, pos, dir);
          const nx = -dir[2], nz = dir[0];
          const ln = Math.hypot(nx, nz) || 1;
          const bob = a.escalator ? 0 : Math.abs(Math.sin((time + a.phase) * 7)) * 0.035;
          p.set(pos[0] + (nx / ln) * a.lateral, pos[1] - (a.escalator ? 1.32 : 0.07) + bob, pos[2] + (nz / ln) * a.lateral);
          q.setFromAxisAngle(up, Math.atan2(dir[0] * a.dir, dir[2] * a.dir));
          m.compose(p, q, s);
          w.bodies.setMatrixAt(i, m);
          w.heads.setMatrixAt(i, m);
        });
        w.bodies.instanceMatrix.needsUpdate = true;
        w.heads.instanceMatrix.needsUpdate = true;
      }
    },
  });
}
