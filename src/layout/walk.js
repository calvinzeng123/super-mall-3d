// 步行连通图：同层走廊相接、铺位门面临走廊、扶梯/电梯/楼梯跨层、入口接 1F。
import { rectsConnect, pointInRect, frontProbes, doorProbe, NORMAL, mid } from './geom.js';
import { stairDoor } from './vertical.js';

export function buildWalkGraph(L) {
  const adj = new Map();
  const node = (n) => {
    if (!adj.has(n)) adj.set(n, new Set());
    return n;
  };
  const link = (a, b) => {
    node(a); node(b);
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  const levelById = Object.fromEntries(L.levels.map((l) => [l.id, l]));
  const walksAt = (levelId, p) => {
    const lv = levelById[levelId];
    return lv ? lv.walk.filter((w) => pointInRect(p, w.rect)).map((w) => `walk:${levelId}:${w.id}`) : [];
  };

  for (const lv of L.levels) {
    const ids = lv.walk.map((w) => node(`walk:${lv.id}:${w.id}`));
    for (let i = 0; i < lv.walk.length; i++) {
      for (let j = i + 1; j < lv.walk.length; j++) {
        if (rectsConnect(lv.walk[i].rect, lv.walk[j].rect, 1)) link(ids[i], ids[j]);
      }
    }
    for (const u of lv.units) {
      const id = node(`unit:${u.id}`);
      for (const f of u.fronts) for (const p of frontProbes(f)) for (const w of walksAt(lv.id, p)) link(id, w);
    }
  }

  const chain = (list) => {
    for (let i = 1; i < list.length; i++) link(list[0], list[i]);
  };
  for (const e of L.escalators) {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run;
    const uz = (e.top.z - e.bottom.z) / run;
    const lo = walksAt(e.from, [e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2]);
    const hi = walksAt(e.to, [e.top.x + ux * 1.2, e.top.z + uz * 1.2]);
    chain([...lo, ...hi]);
  }
  for (const e of L.elevators) chain(e.serves.flatMap((id) => walksAt(id, doorProbe(e))));
  for (const s of L.stairs) chain(s.serves.flatMap((id) => frontProbes(stairDoor(s, id)).flatMap((p) => walksAt(id, p))));
  for (const e of L.entrances) {
    const [nx, nz] = NORMAL[e.side];
    const [mx, mz] = mid(e.seg);
    const id = node(`ent:${e.id}`);
    for (const w of walksAt(e.level, [mx - nx, mz - nz])) link(id, w);
  }
  return { adj };
}

/** 连通分量：节点 → 分量编号 */
export function components({ adj }) {
  const comp = new Map();
  let n = 0;
  for (const start of adj.keys()) {
    if (comp.has(start)) continue;
    const stack = [start];
    comp.set(start, n);
    while (stack.length) {
      const cur = stack.pop();
      for (const nb of adj.get(cur)) {
        if (!comp.has(nb)) { comp.set(nb, n); stack.push(nb); }
      }
    }
    n++;
  }
  return comp;
}
