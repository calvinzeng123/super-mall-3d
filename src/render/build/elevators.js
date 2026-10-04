// 观光电梯（中庭观光梯、三期楼栋外挂客梯）：分层玻璃井道 + 轿厢在各停靠层之间往返（爆炸视图中跟随楼层偏移）。
// 外挂客梯在地库一段由 rooms.js 的电梯井绘制，这里只画地上井道。
import * as THREE from 'three';
import { COLORS } from '../theme.js';

export function buildElevators(ctx) {
  const { layout } = ctx;
  const byId = ctx.lvById;
  for (const e of layout.elevators.filter((x) => x.type === 'glass' || x.exterior)) {
    const half = e.w / 2;
    const topId = e.serves[e.serves.length - 1];
    const frameCol = e.exterior ? '#2b3036' : COLORS.white;
    // 井道：每个停靠层一段（套件局部坐标）
    for (const id of e.serves) {
      const lv = byId[id];
      if (lv.kind === 'parking') continue;
      const B = ctx.levels[id].batch;
      const yA = lv.elev, yB = lv.elev + lv.height + (id === topId ? 0.2 : 0);
      const h = yB - yA;
      B.frame(e.frame, () => {
        for (const [dx, dz] of [[-half, -half], [half, -half], [half, half], [-half, half]]) {
          B.get('metal').box(e.lu + dx, yA + h / 2, e.lv + dz, 0.14, h, 0.14, frameCol);
        }
        for (const [sx, sz, ox, oz] of [[e.w, 0.03, 0, -half], [e.w, 0.03, 0, half], [0.03, e.d, -half, 0], [0.03, e.d, half, 0]]) {
          B.get('glass').box(e.lu + ox, yA + h / 2, e.lv + oz, sx, h - 0.1, sz, 0xffffff);
        }
        B.get('metal').box(e.lu, yA - 0.2, e.lv, e.w + 0.2, 0.4, e.d + 0.2, frameCol);
        if (id === topId) B.get('metal').box(e.lu, yB, e.lv, e.w + 0.3, 0.5, e.d + 0.3, frameCol);
      });
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
    car.rotation.y = -e.frame.a;
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
    const phase = e.id.endsWith('GW') ? 0 : period * 0.45;
    ctx.dynamic.push({
      update(dt, time, app) {
        const tt = (time + phase) % period;
        const leg = legs.find((l) => tt >= l.t0 && tt < l.t1) || legs[0];
        const k = (tt - leg.t0) / (leg.t1 - leg.t0);
        const s = k * k * (3 - 2 * k);
        const y = leg.y0 + (leg.y1 - leg.y0) * s;
        const st = app.state;
        car.position.y = y + levelOffsetAt(ctx, e.building, y);
        // 所在楼层隐藏（或只显示外观）时轿厢也隐藏
        const L = ctx.levels[nearestLevel(ctx, e.building, y)];
        const focus = st.focus && byId[st.focus];
        car.visible = L.group.visible && L.base.visible && !(focus && focus.building === e.building && focus.elev + 0.1 < y);
      },
    });
  }
}

/** 某高度处楼层组的插值偏移（爆炸视图） */
export function levelOffsetAt(ctx, bid, y) {
  const Ls = ctx.buildings[bid].levels;
  if (y <= Ls[0].lv.elev) return Ls[0].offset;
  for (let i = 0; i < Ls.length - 1; i++) {
    const a = Ls[i], b = Ls[i + 1];
    if (y >= a.lv.elev && y <= b.lv.elev) {
      const k = (y - a.lv.elev) / (b.lv.elev - a.lv.elev);
      return a.offset * (1 - k) + b.offset * k;
    }
  }
  return Ls[Ls.length - 1].offset;
}

export function nearestLevel(ctx, bid, y) {
  const Ls = ctx.buildings[bid].levels;
  let best = Ls[0].lv.id;
  for (const L of Ls) if (y >= L.lv.elev - 0.01) best = L.lv.id;
  return best;
}
