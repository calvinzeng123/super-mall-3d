// 小游戏合集的地图范围。
// 保留：一期商场和附楼、酒店、公寓、R1–R4、西苑、北苑、地铁站、共享地库。
// 裁掉：二期、三期整栋（楼层、电梯、楼梯、扶梯、坡道、入口），原地留一组低细节体块。
// 场地（道路、广场、江、周边城市）不动。只有 arcade 模式经过这里；完整导览和 FPS 地图不受影响。

export const ARCADE_CUT = Object.freeze(['P2', 'P3']);

/** 是否指向被裁掉的楼或它的楼层（'P2'、'P2-B1'、'P3-1F'…）。 */
export const isCutId = (id) => typeof id === 'string'
  && ARCADE_CUT.some((b) => id === b || id.startsWith(`${b}-`));

/**
 * 被裁楼栋的体块：每块是一个多边形柱体 { id, building, name, poly, y0, y1 }。
 * 二期用整栋外轮廓；三期是街巷，用上层各小楼的楼板轮廓，保留街巷的肌理。
 */
function massingOf(layout) {
  const out = [];
  for (const id of ARCADE_CUT) {
    const b = layout.buildings.find((x) => x.id === id);
    if (!b) continue;
    const levels = layout.levels.filter((l) => l.building === id && l.elev >= 0);
    const roof = levels.find((l) => l.kind === 'roof');
    const top = levels.reduce((y, l) => Math.max(y, l.kind === 'roof' ? l.elev : l.elev + l.height), 0);
    const upper = levels.filter((l) => l.kind !== 'roof').at(-1);
    const pieces = upper?.slab?.pieces?.map((p) => p.outer).filter((p) => p?.length >= 3) || [];
    // 一整栋（屋面层有完整外轮廓）还是一组小楼（街区）
    const polys = roof || pieces.length < 2 ? [b.outline] : pieces;
    polys.forEach((poly, i) => out.push({
      id: polys.length > 1 ? `${id}-M${i + 1}` : `${id}-M`, building: id, name: b.name,
      poly: poly.map(([x, z]) => [x, z]), y0: 0, y1: +top.toFixed(2),
    }));
  }
  return out;
}

/** 就地裁剪一份刚生成的完整园区布局（buildLayout({ expansion: true }) 的返回值），并返回它。 */
export function scopeArcade(layout) {
  const cut = new Set(ARCADE_CUT);
  const full = { buildings: layout.buildings.length, levels: layout.levels.length };
  const massing = massingOf(layout);
  const live = (id) => !isCutId(id);

  layout.buildings = layout.buildings.filter((b) => !cut.has(b.id));
  layout.levels = layout.levels.filter((l) => !cut.has(l.building));
  for (const key of ['elevators', 'stairs', 'escalators', 'ramps']) {
    layout[key] = layout[key].filter((item) => !cut.has(item.building));
  }
  const goneEntrances = new Set(layout.entrances
    .filter((e) => cut.has(e.building) || !live(e.level) || !live(e.to)).map((e) => e.id));
  layout.entrances = layout.entrances.filter((e) => !goneEntrances.has(e.id));

  const ext = layout.extensions;
  layout.extensions = {
    ...ext,
    districts: ext.districts
      .map((d) => ({ ...d, buildingIds: d.buildingIds.filter((id) => !cut.has(id)) }))
      .filter((d) => d.buildingIds.length),
    paths: ext.paths.filter((p) => live(p.level) && live(p.from) && live(p.to)),
    connections: ext.connections.filter((c) => live(c.from) && live(c.to)),
    gateways: ext.gateways.filter((g) => live(g.level)),
  };

  // 云环天桥通往二期的那一臂保留桥面，尽头是体块的墙，不再有门。
  if (layout.bridges) {
    layout.bridges.links = layout.bridges.links.map((k) => (cut.has(k.building)
      ? { ...k, building: null, name: `${k.name}（未开放）`, closed: true } : k));
  }
  if (layout.sharedGarages?.isolatedFrom) {
    layout.sharedGarages = { ...layout.sharedGarages,
      isolatedFrom: layout.sharedGarages.isolatedFrom.filter((id) => !cut.has(id)) };
  }
  // 通往已裁入口的前场小路保留铺装，去掉入口指向。
  const forecourt = layout.site.forecourt;
  if (forecourt?.paths) {
    forecourt.paths = forecourt.paths.map((p) => {
      if (!goneEntrances.has(p.entrance)) return p;
      const { entrance, ...rest } = p;
      return rest;
    });
  }

  layout.arcade = {
    version: 1, cut: [...ARCADE_CUT], massing, full,
    kept: { buildings: layout.buildings.length, levels: layout.levels.length },
  };
  return layout;
}
