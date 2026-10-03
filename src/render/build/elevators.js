// 中庭观光电梯：分层玻璃井道 + 轿厢在 B1M–3F 之间往返停靠（爆炸视图中跟随楼层偏移）。
import * as THREE from 'three';
import { COLORS } from '../theme.js';

export function buildElevators(ctx) {
  const { layout } = ctx;
  const byId = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  for (const e of layout.elevators.filter((x) => x.type === 'glass')) {
    const half = e.w / 2;
    // 井道：每个停靠层一段
    for (const id of e.serves) {
      const lv = byId[id];
      const B = ctx.levels[id].batch;
      const yA = lv.elev, yB = lv.elev + lv.height + (id === '3F' ? 0.2 : 0);
      const h = yB - yA;
      for (const [dx, dz] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
        B.get('metal').box(e.x + dx, yA + h / 2, e.z + dz, 0.14, h, 0.14, COLORS.white);
      }
      for (const [sx, sz, ox, oz] of [[e.w, 0.03, 0, -half], [e.w, 0.03, 0, half], [0.03, e.d, -half, 0], [0.03, e.d, half, 0]]) {
        B.get('glass').box(e.x + ox, yA + h / 2, e.z + oz, sx, h - 0.1, sz, 0xffffff);
      }
      B.get('metal').box(e.x, yA - 0.2, e.z, e.w + 0.2, 0.4, e.d + 0.2, COLORS.white);
      if (id === '3F') B.get('metal').box(e.x, yB, e.z, e.w + 0.3, 0.5, e.d + 0.3, COLORS.white);
    }
    // 轿厢
    const car = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.4, metalness: 0.4 }));
    cb.position.y = 0.075;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.2), new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.4, metalness: 0.5 }));
    roof.position.y = 2.65;
    const light = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 1.6), ctx.mats.base.glow);
    light.position.y = 2.51;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.35, 2.15), ctx.mats.base.glass);
    glass.position.y = 1.32;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 2.1), new THREE.MeshStandardMaterial({ color: 0xb8bfc6, metalness: 0.9, roughness: 0.3 }));
    rail.position.y = 1.0;
    car.add(cb, roof, light, glass, rail);
    car.position.set(e.x, 0, e.z);
    car.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    ctx.root.add(car);

    // 停靠序列：上行到顶再下行
    const stops = e.serves.map((id) => byId[id].elev);
    const seq = [...stops, ...stops.slice(1, -1).reverse()];
    const speed = 1.6;
    const dwell = 3.2;
    const legs = [];
    let t = 0;
    for (let i = 0; i < seq.length; i++) {
      const a = seq[i], b = seq[(i + 1) % seq.length];
      legs.push({ t0: t, t1: t + dwell, y0: a, y1: a });
      t += dwell;
      const dur = Math.abs(b - a) / speed + 1.2;
      legs.push({ t0: t, t1: t + dur, y0: a, y1: b });
      t += dur;
    }
    const period = t;
    const phase = e.x < 0 ? 0 : period * 0.45;
    ctx.dynamic.push({
      update(dt, time, app) {
        const tt = (time + phase) % period;
        const leg = legs.find((l) => tt >= l.t0 && tt < l.t1) || legs[0];
        const k = (tt - leg.t0) / (leg.t1 - leg.t0);
        const s = k * k * (3 - 2 * k);
        const y = leg.y0 + (leg.y1 - leg.y0) * s;
        const st = app.state;
        const offset = levelOffsetAt(ctx, y);
        car.position.y = y + offset;
        // 所在楼层隐藏时轿厢也隐藏
        const lvId = nearestLevel(ctx, y);
        car.visible = ctx.levels[lvId].group.visible && !(st.focus && byId[st.focus].elev + 0.1 < y);
      },
    });
  }
}

/** 某高度处楼层组的插值偏移（爆炸视图） */
export function levelOffsetAt(ctx, y) {
  const lv = ctx.layout.levels;
  if (y <= lv[0].elev) return ctx.levels[lv[0].id].offset;
  for (let i = 0; i < lv.length - 1; i++) {
    const a = lv[i], b = lv[i + 1];
    if (y >= a.elev && y <= b.elev) {
      const k = (y - a.elev) / (b.elev - a.elev);
      return ctx.levels[a.id].offset * (1 - k) + ctx.levels[b.id].offset * k;
    }
  }
  return ctx.levels[lv[lv.length - 1].id].offset;
}

export function nearestLevel(ctx, y) {
  let best = ctx.layout.levels[0].id;
  for (const l of ctx.layout.levels) if (y >= l.elev - 0.01) best = l.id;
  return best;
}
