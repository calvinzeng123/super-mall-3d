// 动线箭头：人流（青）、车流（橙）、货流（紫）——扁平带状网格 + 滚动的 V 形箭头贴图。
import * as THREE from 'three';
import { levelPaths, sitePaths } from '../paths.js';

export const FLOW_COLORS = { people: '#19b5a5', vehicle: '#f08a24', goods: '#8b5cf6' };
const WIDTH = { people: 1.1, vehicle: 1.7, goods: 1.3 };
const SPACING = 2.4;

function ribbon(paths, width) {
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (const p of paths) {
    const pts = p.loop ? [...p.pts, p.pts[0]] : p.pts;
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0], dz = next[2] - prev[2];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      const nx = -dz * width / 2, nz = dx * width / 2;
      const [x, y, z] = pts[i];
      pos.push(x - nx, y, z - nz, x + nx, y, z + nz);
      uv.push(dist / SPACING, 0, dist / SPACING, 1);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    base += pts.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function buildFlows(ctx) {
  const add = (group, groups) => {
    for (const type of ['people', 'vehicle', 'goods']) {
      const list = groups[type];
      if (!list || !list.length) continue;
      const mat = ctx.mats.flow(type, FLOW_COLORS[type]);
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(ribbon(list, WIDTH[type]), mat);
      mesh.renderOrder = 6;
      mesh.name = `flow-${type}`;
      group.add(mesh);
    }
  };
  const lp = levelPaths(ctx.layout);
  for (const [id, groups] of Object.entries(lp)) add(ctx.levels[id].flows, groups);
  ctx.site.flows = new THREE.Group();
  ctx.site.group.add(ctx.site.flows);
  add(ctx.site.flows, sitePaths(ctx.layout));
  ctx.paths = { levels: lp, site: sitePaths(ctx.layout) };
  const mats = ['people', 'vehicle', 'goods'].map((t) => ctx.mats.flows[t]).filter(Boolean);
  ctx.dynamic.push({
    update(dt, time, app) {
      if (!app.state.flows) return;
      for (const m of mats) m.map.offset.x -= dt * 0.9;
    },
  });
}
