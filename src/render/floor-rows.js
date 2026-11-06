// 楼层牌与目录的楼层行（纯字符串，Node 可测）。
// 非塔楼（商场、街区、车库）：自上而下列出各层，与以前一样。
// 塔楼（supertall P0b · SPEC §3.1）：按分区（b.zones，没有时用 railZonesFallback 从楼层类型推出）自上而下列出：
//   单层分区（大堂、空中大堂、避难层、屋顶）是一个楼层按钮；多层分区是一行可展开的分区头（范围 · 户数），
//   展开后列出本区楼层。聚焦楼层所在的分区展开，其余收起；避难层是灰色斜纹的「避难层 · 设备层」按钮，可选。
//   立在一期裙房屋面上的北苑塔楼在最下面保留不可点的「1–6F 一期商场 · 住户电梯直达 7F」。
//   分区上方是分区小标签条（地下 · 低 · 中 · 高 · 顶 · 避），手机上就是这一排加所选分区的楼层；另有「楼层 / 房号」搜索。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Podium the tower stands on (北苑 on 一期): { num, name, title } or null. */
export function podiumOf(layout, bid) {
  const b = layout.buildings.find((q) => q.id === bid);
  if (!b?.stackedOn) return null;
  const host = layout.buildings.find((q) => q.id === b.stackedOn);
  const own = layout.levels.filter((l) => l.building === bid).sort((x, y) => x.elev - y.elev);
  // Host storeys above ground and below the tower's first floor (一期 1F–6F under 北苑 7F).
  const under = layout.levels.filter((l) => l.building === b.stackedOn && l.elev >= 0 && own.length && l.elev < own[0].elev - .01 && /^\d+F$/.test(l.short))
    .sort((x, y) => x.elev - y.elev);
  if (!under.length || !own.length) return null;
  const first = own[0].short, span = `${parseInt(under[0].short, 10)}–${under.at(-1).short}`;
  const hostName = host?.short === '一期' ? '一期商场' : host?.short || b.stackedOn;
  return { num: span, name: `${hostName} · 住户电梯直达 ${first}`,
    title: `${hostName} ${span}：住户电梯从 1F 直达 ${first}（与商场天台同层），不停商场楼层` };
}

const num = (lv) => lv.levelNumber ?? (/^(\d+)F$/.exec(lv.short || '') ? +/^(\d+)F$/.exec(lv.short)[1] : null);
const label = (lv) => (lv.theme?.label || lv.name || lv.short).split(' · ')[0];
const SINGLE = new Set(['lobby', 'refuge', 'amenity', 'roof']);
/** Zone kind of a level, from its record (the rail's fallback when the tower publishes no b.zones). */
export function railZoneKind(lv) {
  if (lv.kind === 'refuge') return 'refuge';
  if (lv.kind === 'roof') return 'roof';
  if (lv.elev < 0 || lv.kind === 'parking' || lv.kind === 'garage-lobby') return 'basement';
  if (lv.kind === 'lobby' || num(lv) === 1) return 'lobby';
  if (lv.kind === 'club' || lv.kind === 'amenity' || lv.amenityPlan || lv.skyLobby) return 'amenity';
  return 'band';
}
const rangeOf = (list) => {
  const a = num(list[0]), z = num(list.at(-1));
  return a == null || z == null ? list.map((l) => l.short).join(' / ') : a === z ? `${a}F` : `${a}–${z}F`;
};
/**
 * Zones of tower b derived from its own levels (same shape as P0a's towerZones(): bottom-up
 * { id, name, from, to, kind, levels, homes }). Bands split where the level kind or the band name changes;
 * lobby, amenity, refuge and roof levels are zones of their own; basements group together.
 */
export function railZonesFallback(b, levels) {
  const own = levels.filter((l) => l.building === b.id).sort((x, y) => x.elev - y.elev), runs = [];
  for (const lv of own) {
    const kind = railZoneKind(lv), key = `${kind}|${kind === 'band' ? `${lv.kind}|${label(lv)}` : ''}`, r = runs.at(-1);
    if (r && r.key === key && !SINGLE.has(kind)) r.levels.push(lv); else runs.push({ key, kind, levels: [lv] });
  }
  return runs.map((r) => {
    const ids = r.levels.map((l) => l.id), homes = new Set(r.levels.flatMap((l) => (l.units || []).filter((u) => u.residence).map((u) => u.residence.home ?? u.code ?? u.id)));
    const name = r.kind === 'basement' ? `${[...r.levels].reverse().map((l) => l.short).join(' / ')} 地下`
      : SINGLE.has(r.kind) ? label(r.levels[0]) : `${label(r.levels[0])} ${rangeOf(r.levels)}`;
    return { id: `${b.id}-${r.kind}-${r.levels[0].short}`, name, from: ids[0], to: ids.at(-1), kind: r.kind, levels: ids, homes: homes.size };
  });
}

/**
 * The rail zones of a tower, top-down, with level records: [{ id, name, kind, levels: [lv…] (top-down), range, homes, single }].
 * Reads b.zones (P0a towerZones / a tower package) or the fallback; host zones (P1 levels under 北苑) are left out:
 * the podium row stands for them. A zone given only by from / to collects the own levels between them.
 */
export function towerRailZones(layout, bid) {
  const b = layout.buildings.find((q) => q.id === bid);
  if (!b || b.kind !== 'tower') return null;
  const byId = new Map(layout.levels.map((l) => [l.id, l])), own = layout.levels.filter((l) => l.building === bid).sort((x, y) => x.elev - y.elev);
  const zones = (b.zones?.length ? b.zones : railZonesFallback(b, layout.levels)).filter((z) => !z.host);
  const out = zones.map((z) => {
    let lvs = (z.levels || []).map((id) => byId.get(id)).filter((l) => l && l.building === bid);
    if (!lvs.length && z.from && z.to) {
      const lo = byId.get(z.from)?.elev ?? -Infinity, hi = byId.get(z.to)?.elev ?? Infinity;
      lvs = own.filter((l) => l.elev >= lo - 1e-6 && l.elev <= hi + 1e-6);
    }
    lvs = [...lvs].sort((x, y) => y.elev - x.elev);
    const kind = z.kind || railZoneKind(lvs[0] || {});
    return { id: z.id, name: z.name, kind, levels: lvs, range: lvs.length ? rangeOf([...lvs].reverse()) : '', homes: z.homes || 0, single: lvs.length === 1 };
  }).filter((z) => z.levels.length);
  // Levels no zone claims (a package's zones may skip one) get their own single zone, so every level stays reachable.
  const claimed = new Set(out.flatMap((z) => z.levels.map((l) => l.id)));
  for (const lv of own) if (!claimed.has(lv.id)) out.push({ id: `${bid}-${lv.short}`, name: label(lv), kind: railZoneKind(lv), levels: [lv], range: lv.short, homes: 0, single: true });
  return out.sort((p, q) => q.levels[0].elev - p.levels[0].elev);
}

/** Zone-chip text: 地下 · 低 · 中 · 高 · 顶 · 避 and the like, from the zone name and kind. */
export function zoneChip(z) {
  if (z.kind === 'basement') return '地下';
  if (z.kind === 'refuge') return `避 ${z.range}`;
  if (z.kind === 'roof') return '顶';
  if (z.kind === 'lobby') return z.range;
  const m = /^(低区|中区|高区|云端|顶层)/.exec(z.name);
  return m ? m[1].replace('区', '') : z.name.split(/\s/)[0].slice(0, 4);
}

const floorButton = (lv, extra = '') => {
  const refuge = lv.kind === 'refuge';
  return `<button class="floor${refuge ? ' refuge' : ''}${extra}" data-level="${lv.id}" aria-pressed="false" style="--fc:${lv.theme?.accent || '#888'}"${refuge ? ' title="避难层 · 设备层 · 仅消防电梯停靠"' : ''}><span class="fl-num">${esc(lv.short)}</span><span class="fl-name">${esc(refuge ? '避难层 · 设备层' : label(lv))}</span></button>`;
};

/**
 * Floor rail HTML of a building: 全楼 button, then (towers) the zone rows top-down or (others) every level
 * top-down, then the podium row of a stacked tower.
 * opts.focus: the focused level (its zone opens); opts.expanded: zone ids the visitor opened; opts.all: open every zone.
 */
export function floorRows(layout, bid, { focus = null, expanded = null, all = false } = {}) {
  const b = layout.buildings.find((q) => q.id === bid);
  if (!b) return '';
  const head = `<button class="floor all" data-level="" aria-pressed="true"><span class="fl-num">${b.undergroundOnly ? '全部' : '全楼'}</span><span class="fl-name">${esc(b.short)}${b.undergroundOnly ? '总览' : '外观'}</span></button>`;
  const podium = podiumOf(layout, bid);
  const tail = podium ? `<div class="floor-podium" title="${esc(podium.title)}"><span class="fl-num">${esc(podium.num)}</span><span class="fl-name">${esc(podium.name)}</span></div>` : '';
  const zones = towerRailZones(layout, bid);
  if (!zones) {
    const levels = layout.levels.filter((l) => l.building === bid).reverse();
    return head + levels.map((lv) => `<button class="floor" data-level="${lv.id}" aria-pressed="false" style="--fc:${lv.theme.accent}"><span class="fl-num">${lv.short}</span><span class="fl-name">${esc(lv.theme.label.split(' · ')[0])}</span></button>`).join('') + tail;
  }
  const open = (z) => all || z.levels.some((l) => l.id === focus) || !!expanded?.has?.(z.id);
  let rows = '';
  for (const z of zones) {
    if (z.single) { rows += floorButton(z.levels[0], ' zone-single'); continue; }
    const o = open(z), homes = z.homes ? ` · ${z.homes} 户` : '';
    rows += `<button class="floor-zone${z.kind === 'basement' ? ' basement' : ''}" data-zone="${esc(z.id)}" aria-expanded="${o}"><span class="fl-num">${esc(z.range)}</span><span class="fl-name">${esc(z.name.replace(` ${z.range}`, ''))}${homes}</span></button>`;
    if (o) rows += z.levels.map((lv) => floorButton(lv, ' in-zone')).join('');
  }
  return head + rows + tail;
}

/** The zone-chip strip of a tower (null for other buildings): one chip per zone, top-down. */
export function zoneChips(layout, bid, { focus = null } = {}) {
  const zones = towerRailZones(layout, bid);
  if (!zones) return '';
  return `<div class="zone-chips" role="tablist">${zones.map((z) => `<button class="zone-chip${z.kind === 'refuge' ? ' refuge' : ''}" data-zone="${esc(z.id)}" aria-pressed="${z.levels.some((l) => l.id === focus)}" title="${esc(z.name)}">${esc(zoneChip(z))}</button>`).join('')}</div>`;
}

/** The zone holding level id, or null. */
export const zoneOfLevel = (layout, bid, id) => towerRailZones(layout, bid)?.find((z) => z.levels.some((l) => l.id === id)) || null;

/**
 * The 楼层 / 房号 search of a tower rail: '37' / '37F' → { level }; '3702' / 'R1-3702' → { level, unit };
 * '避难' → { levels: refuge levels }; otherwise null.
 */
export function railSearch(layout, bid, query) {
  const q = String(query || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!q) return null;
  const own = layout.levels.filter((l) => l.building === bid);
  if (/避难/.test(q)) return { levels: own.filter((l) => l.kind === 'refuge').map((l) => l.id) };
  const floor = /^(B?\d+)F?$/.exec(q);
  if (floor) {
    const short = `${floor[1]}F`.replace(/^B(\d+)F$/, 'B$1'), lv = own.find((l) => l.short === short || l.short === floor[1]);
    if (lv && floor[1].length <= 2) return { level: lv.id };
  }
  const code = q.replace(new RegExp(`^${bid}-?`), '');
  for (const lv of own) for (const u of lv.units || []) {
    const c = String(u.code || '').toUpperCase(), tailCode = c.replace(new RegExp(`^${bid}-?`), '');
    if (c === q || tailCode === code || tailCode.replace(/^0+/, '') === code.replace(/^0+/, '')) return { level: lv.id, unit: u.id };
  }
  if (floor) { const lv = own.find((l) => num(l) === +floor[1]); if (lv) return { level: lv.id }; }
  return null;
}

/** Tower subtitle on the building tabs, from the data: b.sub when a package sets it, else name + top floor / use. */
export function towerSub(layout, b) {
  if (b.sub) return b.sub;
  const top = Math.max(...layout.levels.filter((l) => l.building === b.id).map((l) => num(l)).filter(Number.isFinite));
  if (b.community) return `${b.name.replace(/\s*\d+\s*号楼$/, '')} · ${top}层`;
  const use = { hotel: '酒店', apartment: '公寓', residential: '住宅' }[b.usage] || '塔楼';
  return `${top}层${use}`;
}

/** Directory row for the podium of a stacked tower (a disabled button: the list's click handler skips it). */
export function podiumDirectoryRow(layout, bid) {
  const p = podiumOf(layout, bid);
  return p ? `<li><button class="shop podium" disabled title="${esc(p.title)}"><span class="shop-code">${esc(p.num)}</span><span class="shop-name"><b>${esc(p.name)}</b><span>住户电梯不停商场楼层 · 刷卡乘梯</span></span><span class="shop-cat"></span></button></li>` : '';
}

/** Directory facts of a tower: 电梯 by bank, 避难层 n, 最高 xxx m (SPEC §3.1). [[label, value]…] */
export function towerFacts(layout, bid) {
  const b = layout.buildings.find((q) => q.id === bid), own = layout.levels.filter((l) => l.building === bid);
  const lifts = layout.elevators.filter((e) => e.building === bid || e.residentialCore === bid);
  const banks = new Map();
  for (const e of lifts) { const k = e.zone ? `${e.zone === 'high' ? '高区' : e.zone === 'low' ? '低区' : e.zone}` : (e.label || '客梯').replace(/\s*[A-Z0-9]+$/, '').replace(/^.*?(住户电梯|消防电梯|客梯|穿梭梯|服务梯).*$/, '$1'); banks.set(k, (banks.get(k) || 0) + 1); }
  const top = Math.max(...own.map((l) => l.elev + (l.kind === 'roof' ? 0 : l.height)), b?.height || 0);
  const out = [['电梯', [...banks].map(([k, n]) => `${k} ${n}`).join(' · ') || lifts.length]];
  const refuge = own.filter((l) => l.kind === 'refuge').length;
  if (refuge) out.push(['避难层', refuge]);
  out.push(['最高', `${Math.round(top * 10) / 10} m`]);
  return out;
}
