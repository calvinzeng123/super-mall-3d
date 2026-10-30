import { attachViewportUI } from './viewport-ui.js';
import { attachQualityUI } from './quality-ui.js';
import { attachGlassLens } from './liquid-glass.js';
// 界面：分期切换（园区 / 一期 / 二期 / 三期 / 地铁）、所选期的楼层牌、工具条、全园区店铺目录与搜索、悬停提示。
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PHASES = [
  { id: null, label: '园区', sub: '总览' },
  { id: 'P1', label: '一期', sub: '云澜汇' },
  { id: 'P2', label: '二期', sub: '星湾' },
  { id: 'P3', label: '三期', sub: '云澜里' },
  { id: 'M', label: '地铁', sub: '云澜汇站' },
];

export function createUI(app, layout) {
  const annexes = layout.buildings.filter(b => b.kind === 'annex');
  const phases = [...PHASES.filter(p=>!layout.playable||!p.id||layout.buildings.some(b=>b.id===p.id)).flatMap(p => [p,
    ...annexes.filter(b => b.campusGroup === p.id).map(b => ({ id: b.id, label: b.short, sub: '一期 · 艺术街区' }))]), ...layout.buildings.filter(b => b.kind === 'tower').map(b => ({ id: b.id, label: b.short, sub: b.usage === 'hotel' ? '20层酒店' : b.usage === 'apartment' ? '20层公寓' : '30层住宅' })),
    ...layout.buildings.filter(b => b.undergroundOnly).map(b => ({ id: b.id, label: b.short, sub: '地下公共停车' }))];
  const built = new Set(layout.buildings.map((b) => b.id));
  const bById = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));
  const lvById = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  const phaseTabs = $('phaseTabs');
  const floorList = $('floorList');
  phaseTabs.innerHTML = phases.map((p) => {
    const ok = !p.id || built.has(p.id);
    return `<button class="phase" data-building="${p.id || ''}" aria-pressed="false"${ok ? '' : ' disabled'}><b>${esc(p.label)}</b><span>${ok ? esc(p.sub) : '规划中'}</span></button>`;
  }).join('');
  const phaseGlass = attachGlassLens(phaseTabs, '.phase');
  const floorGlass = attachGlassLens(floorList, '.floor');
  phaseTabs.addEventListener('click', (e) => {
    const b = e.target.closest('.phase');
    if (!b || b.disabled) return;
    app.setBuilding(b.dataset.building || null);
  });
  let floorsFor = undefined;
  function renderFloors(bid) {
    if (floorsFor === bid) return;
    floorsFor = bid;
    if (!bid) {
      floorList.innerHTML = '';
      floorList.hidden = true;
      return;
    }
    floorList.hidden = false;
    const levels = layout.levels.filter((l) => l.building === bid).reverse();
    floorList.innerHTML =
      `<button class="floor all" data-level="" aria-pressed="true"><span class="fl-num">${bById[bid].undergroundOnly ? '全部' : '全楼'}</span><span class="fl-name">${esc(bById[bid].short)}${bById[bid].undergroundOnly ? '总览' : '外观'}</span></button>` +
      levels.map((lv) => `<button class="floor" data-level="${lv.id}" aria-pressed="false" style="--fc:${lv.theme.accent}"><span class="fl-num">${lv.short}</span><span class="fl-name">${esc(lv.theme.label.split(' · ')[0])}</span></button>`).join('');
  }
  floorList.addEventListener('click', (e) => {
    const b = e.target.closest('.floor');
    if (!b) return;
    app.setFocus(b.dataset.level || null);
    viewport.closePanel();
  });

  const toolbar = $('toolbar');
  const directory = $('directory');
  const viewport = attachViewportUI(app);
  attachQualityUI(app, viewport);
  toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('.tool');
    if (!b) return;
    const act = b.dataset.act;
    const s = app.state;
    if (act === 'explode') app.setExploded(!s.exploded);
    else if (act === 'flows') app.setFlows(!s.flows);
    else if (act === 'labels') app.setLabels(!s.labels);
    else if (act === 'night') app.setNight(!s.night);
    else if (act === 'tour') { if (s.touring) app.stopTour(); else app.startTour(); }
    else if (act === 'explore') app.enterExplore();
    else if (act === 'reset') app.reset();
    else if (act === 'city') { app.viewCity(); viewport.closePanel(); }
    else if (act === 'directory') {
      directory.classList.toggle('collapsed');
      b.setAttribute('aria-pressed', String(!directory.classList.contains('collapsed')));
    }
  });
  if (!viewport.compact.matches) directory.classList.remove('collapsed');

  // ---------- 目录 ----------
  const list = $('dirList');
  const search = $('search');
  const unitsById = new Map(layout.levels.flatMap((l) => l.units.map((u) => [u.id, u])));
  const catColor = (cat) => (layout.categories[cat] || {}).color || '#64748b';
  const stallsOf = (levels) => levels.reduce((n, l) => n + (l.parking ? l.parking.stalls.length : 0), 0);
  const facts = (bid, lv) => {
    if (lv) {
      const esc2 = layout.escalators.filter((e) => e.from === lv.id || e.to === lv.id).length;
      const lifts = layout.elevators.filter((e) => e.serves.includes(lv.id)).length;
      const wc = lv.rooms.filter((r) => r.type === 'wc').length;
      const tower = bById[lv.building]?.kind === 'tower';
      const baths = lv.units.reduce((n, u) => n + (u.residence?.bathrooms.length || 0), 0);
      const out = tower ? [['电梯', lifts], [baths ? '独立卫浴' : '公共卫生间', baths || wc]]
        : [['扶梯', esc2], ['电梯', lifts], ['洗手间', wc]];
      if (lv.units.length) out.unshift([bById[lv.building]?.kind === 'tower' ? '房间 / 户' : '店铺', lv.units.length]);
      if (lv.parking) out.push(['车位', lv.parking.stalls.length]);
      const ents = layout.entrances.filter((e) => e.level === lv.id).length;
      if (ents) out.push(['入口', ents]);
      return out;
    }
    const levels = bid ? layout.levels.filter((l) => l.building === bid) : layout.levels;
    const ids = new Set(levels.map((l) => l.id));
    const units = levels.reduce((n, l) => n + l.units.length, 0);
    const out = [[bid && bById[bid]?.kind === 'tower' ? '房间 / 户' : bid ? '店铺' : '店铺 / 房间', units], ['扶梯', layout.escalators.filter((e) => ids.has(e.from)).length], ['电梯', layout.elevators.filter((e) => ids.has(e.serves[0])).length],
      ['人行入口', layout.entrances.filter((e) => ids.has(e.level) && e.to === 'site').length], ['车位', stallsOf(levels)]];
    if (!bid) out.unshift(['园区', layout.playable ? '一期商场 · 酒店 · 公寓' : '商场 · 酒店 · 公寓 · 住宅 · 地铁']);
    return out;
  };
  function renderDirectory() {
    const s = app.state;
    const lv = s.focus ? lvById[s.focus] : null;
    const b = s.building ? bById[s.building] : null;
    const q = search.value.trim().toLowerCase();
    $('dirBadge').textContent = lv ? lv.short : b ? b.short.replace('期', '') : '园';
    $('dirBadge').style.setProperty('--fc', lv ? lv.theme.accent : 'var(--accent)');
    $('dirTitle').textContent = lv ? `${b.short} · ${lv.name}` : b ? b.name : '园区导览';
    $('dirTheme').textContent = s.explore ? '点建筑、楼层或房间可快速到达；电梯支持实际乘坐'
      : lv ? lv.theme.label : b ? `${layout.levels.filter((l) => l.building === b.id).length} 个楼层 · 点击楼层查看` : '云澜汇综合园区 · 点击建筑进入';
    $('dirUp').hidden = !(s.explore && (s.focus || s.building));
    $('dirFacts').innerHTML = facts(s.building, lv).map(([k, v]) => `<span class="fact">${k} <b>${v}</b></span>`).join('');
    const pool = q
      ? layout.levels.flatMap((l) => l.units).filter((u) => `${u.brand.name} ${u.brand.en} ${u.brand.catLabel} ${u.code}`.toLowerCase().includes(q))
      : lv ? lv.units : [];
    let html = '';
    if (!lv && !q) {
      if (!b) {
        html = phases.filter((p) => p.id).map((p) => {
          const ok = built.has(p.id);
          const parkingOnly = bById[p.id]?.undergroundOnly;
          const n = layout.levels.filter((l) => l.building === p.id).reduce((k, l) => k + (parkingOnly ? l.parking?.stalls.length || 0 : l.units.length), 0);
          return `<li><button class="shop" data-building="${p.id}"${ok ? '' : ' disabled'}><span class="shop-code">${p.label}</span><span class="shop-name"><b>${esc(ok ? bById[p.id].name : p.sub)}</b><span>${esc(ok ? bById[p.id].en : '规划建设中')}</span></span><span class="shop-cat" style="--cc:var(--accent)">${ok ? n + (parkingOnly ? ' 车位' : bById[p.id].kind === 'tower' ? ' 户/间' : ' 家') : '规划中'}</span></button></li>`;
        }).join('');
      } else {
        html = layout.levels.filter((l) => l.building === b.id).reverse()
          .map((l) => `<li><button class="shop" data-level="${l.id}"><span class="shop-code">${l.short}</span><span class="shop-name"><b>${esc(l.name)}</b><span>${esc(l.theme.label)}</span></span><span class="shop-cat" style="--cc:${l.theme.accent}">${l.units.length ? l.units.length + (b.kind === 'tower' ? ' 户/间' : ' 家') : l.parking ? l.parking.stalls.length + ' 位' : ''}</span></button></li>`)
          .join('');
        const linked = annexes.filter(a => a.campusGroup === b.id);
        if (linked.length) html += '<li class="dir-group">一期 · 艺术街区</li>' + linked.map(a =>
          `<li><button class="shop" data-building="${a.id}"><span class="shop-code">${esc(a.short)}</span><span class="shop-name"><b>${esc(a.name)}</b><span>连廊接入主商场 · 可进入各层</span></span><span class="shop-cat">${layout.levels.filter(l => l.building === a.id && l.kind !== 'roof').length} 层</span></button></li>`).join('');
      }
    } else if (!pool.length) {
      html = `<li class="empty">${q ? '没有找到匹配的名称或房号。' : '这一层主要是公共设施和停车空间。'}</li>`;
    } else {
      const groups = new Map();
      for (const u of pool) {
        const key = q ? `${bById[u.building].short} · ${lvById[u.level].name}` : u.brand.catLabel;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(u);
      }
      for (const [k, us] of groups) {
        html += `<li class="dir-group">${esc(k)}</li>`;
        html += us
          .sort((a, c) => a.code.localeCompare(c.code))
          .map((u) => `<li><button class="shop${s.selected === u.id ? ' active' : ''}" data-unit="${u.id}"><span class="shop-code">${u.code}</span><span class="shop-name"><b>${esc(u.brand.name)}</b><span>${esc(u.brand.en)}</span></span><span class="shop-cat" style="--cc:${catColor(u.brand.cat)}">${esc(u.brand.catLabel)}</span></button></li>`)
          .join('');
      }
    }
    list.innerHTML = html;
  }
  // 手机上目录面板盖住画面中部：从目录里选了分期 / 楼层 / 店铺后自动收起，否则触摸落在面板上，3D 视角转不动
  const collapseOnPhone = () => viewport.closePanel();
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.shop');
    if (!b || b.disabled) return;
    if (app.state.explore) { exploreGo(b.dataset); return; }
    if (b.dataset.building) app.setBuilding(b.dataset.building);
    else if (b.dataset.level) app.setFocus(b.dataset.level);
    else if (b.dataset.unit) app.focusUnit(unitsById.get(b.dataset.unit));
    collapseOnPhone();
  });
  search.addEventListener('input', renderDirectory);

  // 漫游时点了就传送（分期 → 主入口内侧，楼层 → 该层出生点，店铺 → 店门外 2m 面朝店），
  // 目录跟着切到那一期 / 那一层（只改目录，不动俯瞰相机；退出漫游时恢复原来的选择），然后收起
  function exploreGo(d) {
    const s = app.state;
    const unit = d.unit ? unitsById.get(d.unit) : null;
    if (d.building) Object.assign(s, { building: d.building, focus: null });
    else if (d.level) Object.assign(s, { building: lvById[d.level].building, focus: d.level });
    else if (unit) Object.assign(s, { building: unit.building, focus: unit.level, selected: unit.id });
    app.explore.teleport(unit ? { unit } : { building: s.building, level: s.focus });
    document.body.classList.remove('ex-places');
    app.emit();
  }
  $('dirUp').addEventListener('click', () => {
    const s = app.state;
    if (s.focus) s.focus = null;
    else s.building = null;
    app.emit();
  });

  // ---------- 状态同步 ----------
  function sync(s) {
    viewport.sync(s);
    for (const t of phaseTabs.querySelectorAll('.phase')) t.setAttribute('aria-pressed', String((t.dataset.building || null) === s.building));
    renderFloors(s.building);
    for (const f of floorList.querySelectorAll('.floor')) f.setAttribute('aria-pressed', String((f.dataset.level || null) === s.focus && !s.exploded));
    phaseGlass.sync();
    floorGlass.sync();
    const activeFloor = floorList.querySelector('[aria-pressed="true"]');
    if (activeFloor && s.focus) activeFloor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const press = (act, on) => toolbar.querySelector(`[data-act="${act}"]`)?.setAttribute('aria-pressed', String(!!on));
    press('directory', !directory.classList.contains('collapsed'));
    press('explode', s.exploded);
    const explode = toolbar.querySelector('[data-act="explode"]');
    if (explode) { explode.disabled = bById[s.building]?.kind === 'tower'; explode.title = explode.disabled ? '选择楼层查看室内' : '爆炸视图'; }
    press('flows', s.flows);
    press('labels', s.labels);
    press('night', s.night);
    press('tour', s.touring);
    $('legend').hidden = !s.flows;
    const lv = s.focus ? lvById[s.focus] : null;
    const b = s.building ? bById[s.building] : null;
    $('floorInfo').textContent = s.exploded ? `${b.name} · 爆炸视图` : lv ? `${b.short} · ${lv.name} · ${lv.theme.label}` : b ? `${b.name} · ${b.en}` : '云澜汇 · 商业 / 酒店 / 公寓 / 住宅综合园区';
    renderDirectory();
  }
  app.on(sync);
  sync(app.state);

  // ---------- 悬停提示与点击 ----------
  const tip = $('tooltip');
  const canvas = app.renderer.domElement;
  let downAt = null;
  canvas.addEventListener('pointermove', (e) => {
    if (document.body.classList.contains('ui-hidden') || !app.pick || app.state.explore) { tip.hidden = true; return; }
    const hit = app.pick(e.clientX, e.clientY);
    if (!hit) { tip.hidden = true; canvas.style.cursor = ''; return; }
    tip.innerHTML = hit.html;
    tip.hidden = false;
    const r = canvas.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - r.left, r.width - 260)}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    canvas.style.cursor = hit.unit || hit.building ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (app.state.explore || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || !app.pick) return;
    const hit = app.pick(e.clientX, e.clientY);
    if (hit && hit.unit) app.focusUnit(hit.unit);
    else if (hit && hit.building) app.setBuilding(hit.building);
  });
  $('tourStop').addEventListener('click', () => app.stopTour && app.stopTour());

  return {
    /** 导览字幕：传 null 隐藏 */
    tour(caption) {
      $('tourBar').hidden = !caption;
      if (caption) $('tourStep').textContent = caption;
      $('hint').hidden = !!caption;
    },
  };
}
