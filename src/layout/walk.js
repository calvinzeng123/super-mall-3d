// 步行连通图（多边形版）：同层走道相接、铺位门面临走道、扶梯 / 电梯 / 楼梯跨层、
// 入口连接楼内走道与场地、天桥或另一栋的楼层（如各期地下层 ↔ 地铁站厅）、首层为室外地面的楼层直接与场地相接、
// 天桥落地塔连接桥面与地面。
import { pointInPoly, polysConnect, segProbes } from './geom.js';

const mid = (s) => [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];

export function buildWalkGraph(L) {
  const adj = new Map();
  const node = (n) => {
    if (!adj.has(n)) adj.set(n, new Set());
    return n;
  };
  const link = (a, b) => {
    node(a);
    node(b);
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  const byId = Object.fromEntries(L.levels.map((l) => [l.id, l]));
  const walksAt = (levelId, p) => {
    const lv = byId[levelId];
    return lv ? lv.walk.filter((w) => pointInPoly(p, w.poly)).map((w) => `walk:${levelId}:${w.id}`) : [];
  };
  const siteAt = (p) => L.site.walk.filter((w) => pointInPoly(p, w.poly)).map((w) => `site:${w.id}`);
  const bridgeAt = (p) => (L.bridges ? L.bridges.walk.filter((w) => pointInPoly(p, w.poly)).map((w) => `bridge:${w.id}`) : []);
  const group = (prefix, regions) => {
    const ids = regions.map((w) => node(`${prefix}${w.id}`));
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) if (polysConnect(regions[i].poly, regions[j].poly, 1)) link(ids[i], ids[j]);
    }
  };

  for (const lv of L.levels) {
    group(`walk:${lv.id}:`, lv.walk);
    for (const u of lv.units) {
      const id = node(`unit:${u.id}`);
      for (const f of u.wfronts) for (const p of segProbes(f)) for (const w of walksAt(lv.id, p)) link(id, w);
    }
    if (lv.ground) {
      for (const w of lv.walk) for (const s of L.site.walk) if (polysConnect(w.poly, s.poly, 1)) link(`walk:${lv.id}:${w.id}`, `site:${s.id}`);
    }
  }
  group('site:', L.site.walk);
  if (L.bridges) group('bridge:', L.bridges.walk);

  const chain = (list) => {
    for (let i = 1; i < list.length; i++) link(list[0], list[i]);
  };
  for (const e of L.escalators) {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run;
    const uz = (e.top.z - e.bottom.z) / run;
    chain([...walksAt(e.from, [e.bottom.x - ux * 1.2, e.bottom.z - uz * 1.2]), ...walksAt(e.to, [e.top.x + ux * 1.2, e.top.z + uz * 1.2])]);
  }
  for (const e of L.elevators) {
    const p = [e.x + e.nx * (e.reach + 0.6), e.z + e.nz * (e.reach + 0.6)];
    chain(e.serves.flatMap((id) => walksAt(id, p)));
  }
  for (const s of L.stairs) {
    chain(s.serves.flatMap((id) => segProbes((s.wdoorByLevel && s.wdoorByLevel[id]) || s.wdoor).flatMap((p) => walksAt(id, p))));
  }
  for (const e of L.entrances) {
    const [mx, mz] = mid(e.seg);
    const id = node(`ent:${e.id}`);
    for (const w of walksAt(e.level, [mx - e.nx, mz - e.nz])) link(id, w);
    const out = [mx + e.nx, mz + e.nz];
    const outer = e.to === 'bridge' ? bridgeAt(out) : e.to === 'site' ? siteAt(out) : walksAt(e.to, out);
    for (const w of outer) link(id, w);
  }
  if (L.bridges) for (const v of L.bridges.verticals) chain([...bridgeAt(v.deck), ...siteAt(v.ground)]);
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
        if (!comp.has(nb)) {
          comp.set(nb, n);
          stack.push(nb);
        }
      }
    }
    n++;
  }
  return comp;
}
