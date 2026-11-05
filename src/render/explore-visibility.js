// Resolve underground visibility before the player crosses a portal or slope.
// Geometry is already built; this activates connected interiors without loading
// every high-rise apartment floor or exposing the whole campus below ground.
export function createExploreVisibility(layout) {
  const byId = new Map(layout.levels.map(l => [l.id, l]));
  const buildings = new Map(layout.buildings.map(b => [b.id, b]));
  const district = id => buildings.get(id)?.campusGroup || (['P1', 'H', 'A', 'WPG'].includes(id) ? 'P1'
    : id === 'P2' || /^R[1-4]$/.test(id) ? 'P2' : id);
  const underground = layout.levels.filter(l => l.elev < 0);
  const neighbors = new Map();
  const connect = (a, b) => {
    if (!byId.has(a) || !byId.has(b)) return;
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a).add(b); neighbors.get(b).add(a);
  };
  for (const e of layout.entrances) connect(e.level, e.to);
  for (const c of layout.extensions?.connections || []) connect(c.from, c.to);
  for (const r of layout.ramps) connect(r.from.level, r.to.level);
  for (const e of layout.escalators) connect(e.from, e.to);
  const entrances = [
    ...layout.ramps.filter(r => ['street', 'ground', 'site'].includes(r.from.level) || ['street', 'ground', 'site'].includes(r.to.level))
      .map(r => { const top = r.from.y > r.to.y ? r.from : r.to, low = top === r.from ? r.to : r.from;
        return { x: top.x, z: top.z, level: low.level }; }),
    ...layout.entrances.filter(e => e.kiosk).map(e => ({
      x: (e.seg.x0 + e.seg.x1) / 2, z: (e.seg.z0 + e.seg.z1) / 2, level: e.level,
    })),
  ];
  return ex => {
    const interiors = new Set(), regions = new Set();
    const current = byId.get(ex.level);
    const add = id => { if (byId.has(id)) interiors.add(id); };
    add(ex.level);
    if (ex.under && ex.building) regions.add(district(ex.building));
    // At ground level retain the lower floors visible down ramps and stairwells.
    // Rendering them before entry also warms their buffers and shaders.
    if (!ex.under) {
      for (const id of [ex.building, ex.near]) if (id) regions.add(district(id));
      if (ex.position) for (const p of entrances) {
        if (Math.hypot(ex.position.x - p.x, ex.position.z - p.z) < 64) {
          const level = byId.get(p.level);
          if (level) regions.add(district(level.building));
        }
      }
    }
    for (const lv of underground) if (regions.has(district(lv.building))) add(lv.id);
    // One portal beyond each visible room, never a recursive flood through the
    // metro into other phases. Destination textures are visible from the tunnel.
    for (const id of [...interiors]) for (const other of neighbors.get(id) || []) {
      if (byId.get(other)?.elev < 0) add(other);
    }
    if (ex.metro || regions.has('M')) {
      for(const lv of layout.levels.filter(l=>l.building==='M'))add(lv.id);
    }
    if (current?.elev < 0) {
      const upper = layout.levels.filter(l => l.building === current.building && l.elev > current.elev)
        .sort((a, b) => a.elev - b.elev)[0];
      if (upper && upper.elev <= 0) add(upper.id);
    }
    if (ex.elevator) {
      add(ex.elevator.from); add(ex.elevator.to);
      const e = layout.elevators.find(e => e.id === ex.elevator.id);
      for (const id of e?.serves || []) if (byId.get(id)?.elev < 0) add(id);
    }
    return interiors;
  };
}

/**
 * 7F 空中大堂与一期天台同高相通（规格 §8.3）。返回 (b, state) → 该塔要画出的空中大堂楼层 id 或 null：
 * - 漫游：人不在这栋塔里、站在天台或任一空中大堂，且离塔心 radius 以内（explore.position 按 24 m 分区更新）；
 * - 俯瞰：选中一期且未聚焦楼层，或选中本塔且未聚焦楼层。
 * 漫游时结果是“想看的楼层”（建室内），俯瞰时是额外显示的楼层（会所组在 L.shell 里，只能走 active）。
 */
export function skyLobbyVisibility(layout, { radius = 60 } = {}) {
  const doors = layout.entrances.filter(e => e.skyLobby);
  const skyOf = new Map(doors.map(e => [e.building, e.level]));
  const linked = new Set(doors.flatMap(e => [e.level, e.to]));
  const owner = new Map(layout.levels.map(l => [l.id, l.building]));
  return (b, { explore = null, building = null, focus = null } = {}) => {
    const sky = skyOf.get(b.id);
    if (!sky) return null;
    if (explore) {
      const inside = explore.building === b.id || owner.get(explore.level) === b.id, at = explore.position;
      if (inside || !linked.has(explore.level) || !at) return null;
      return Math.hypot(at.x - b.center[0], at.z - b.center[1]) < radius ? sky : null;
    }
    if (focus) return null;
    return building === b.id || (!!b.stackedOn && building === b.stackedOn) ? sky : null;
  };
}
