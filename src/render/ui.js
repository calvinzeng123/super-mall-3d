// 界面：分期切换（园区 / 一期 / 二期 / 三期）、所选期的楼层牌、工具条、全园区店铺目录与搜索、悬停提示。
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
  const built = new Set(layout.buildings.map((b) => b.id));
  const bById = Object.fromEntries(layout.buildings.map((b) => [b.id, b]));
  const lvById = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  const phaseTabs = $('phaseTabs');
  const floorList = $('floorList');
  phaseTabs.innerHTML = PHASES.map((p) => {
    const ok = !p.id || built.has(p.id);
    return `<button class="phase" data-building="${p.id || ''}" aria-pressed="false"${ok ? '' : ' disabled'}><b>${p.label}</b><span>${ok ? p.sub : '规划中'}</span></button>`;
  }).join('');
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
      `<button class="floor all" data-level="" aria-pressed="true"><span class="fl-num">全楼</span><span class="fl-name">${esc(bById[bid].short)}外观</span></button>` +
      levels.map((lv) => `<button class="floor" data-level="${lv.id}" aria-pressed="false" style="--fc:${lv.theme.accent}"><span class="fl-num">${lv.short}</span><span class="fl-name">${esc(lv.theme.label.split(' · ')[0])}</span></button>`).join('');
  }
  floorList.addEventListener('click', (e) => {
    const b = e.target.closest('.floor');
    if (!b) return;
    app.setFocus(b.dataset.level || null);
  });

  const toolbar = $('toolbar');
  const directory = $('directory');
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
    else if (act === 'reset') app.reset();
    else if (act === 'directory') {
      directory.classList.toggle('collapsed');
      b.setAttribute('aria-pressed', String(!directory.classList.contains('collapsed')));
    }
  });
  if (window.matchMedia('(min-width: 761px)').matches) directory.classList.remove('collapsed');

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
      const out = [['扶梯', esc2], ['电梯', lifts], ['洗手间', wc]];
      if (lv.units.length) out.unshift(['店铺', lv.units.length]);
      if (lv.parking) out.push(['车位', lv.parking.stalls.length]);
      const ents = layout.entrances.filter((e) => e.level === lv.id).length;
      if (ents) out.push(['入口', ents]);
      return out;
    }
    const levels = bid ? layout.levels.filter((l) => l.building === bid) : layout.levels;
    const ids = new Set(levels.map((l) => l.id));
    const units = levels.reduce((n, l) => n + l.units.length, 0);
    const out = [['店铺', units], ['扶梯', layout.escalators.filter((e) => ids.has(e.from)).length], ['电梯', layout.elevators.filter((e) => ids.has(e.serves[0])).length],
      ['人行入口', layout.entrances.filter((e) => ids.has(e.level) && e.to === 'site').length], ['车位', stallsOf(levels)]];
    if (!bid) out.unshift(['已建', `${layout.buildings.filter((x) => x.kind !== 'metro').length} 期 + 地铁`]);
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
    $('dirTheme').textContent = lv ? lv.theme.label : b ? `${layout.levels.filter((l) => l.building === b.id).length} 个楼层 · 点击楼层或店铺查看` : '三期规划 · 点击分期、建筑或店铺查看';
    $('dirFacts').innerHTML = facts(s.building, lv).map(([k, v]) => `<span class="fact">${k} <b>${v}</b></span>`).join('');
    const pool = q
      ? layout.levels.flatMap((l) => l.units).filter((u) => `${u.brand.name} ${u.brand.en} ${u.brand.catLabel} ${u.code}`.toLowerCase().includes(q))
      : lv ? lv.units : [];
    let html = '';
    if (!lv && !q) {
      if (!b) {
        html = PHASES.filter((p) => p.id).map((p) => {
          const ok = built.has(p.id);
          const n = layout.levels.filter((l) => l.building === p.id).reduce((k, l) => k + l.units.length, 0);
          return `<li><button class="shop" data-building="${p.id}"${ok ? '' : ' disabled'}><span class="shop-code">${p.label}</span><span class="shop-name"><b>${esc(ok ? bById[p.id].name : p.sub)}</b><span>${esc(ok ? bById[p.id].en : '规划建设中')}</span></span><span class="shop-cat" style="--cc:var(--accent)">${ok ? n + ' 家' : '规划中'}</span></button></li>`;
        }).join('');
      } else {
        html = layout.levels.filter((l) => l.building === b.id).reverse()
          .map((l) => `<li><button class="shop" data-level="${l.id}"><span class="shop-code">${l.short}</span><span class="shop-name"><b>${esc(l.name)}</b><span>${esc(l.theme.label)}</span></span><span class="shop-cat" style="--cc:${l.theme.accent}">${l.units.length ? l.units.length + ' 家' : l.parking ? l.parking.stalls.length + ' 位' : ''}</span></button></li>`)
          .join('');
      }
    } else if (!pool.length) {
      html = `<li class="empty">${q ? '没有找到匹配的店铺，换个关键词试试。' : '这一层没有店铺，主要是停车位和设备用房。'}</li>`;
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
  const narrow = window.matchMedia('(max-width: 760px)');
  const collapseOnPhone = () => {
    if (!narrow.matches) return;
    directory.classList.add('collapsed');
    toolbar.querySelector('[data-act="directory"]')?.setAttribute('aria-pressed', 'false');
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.shop');
    if (!b || b.disabled) return;
    if (b.dataset.building) app.setBuilding(b.dataset.building);
    else if (b.dataset.level) app.setFocus(b.dataset.level);
    else if (b.dataset.unit) app.focusUnit(unitsById.get(b.dataset.unit));
    collapseOnPhone();
  });
  search.addEventListener('input', renderDirectory);

  // ---------- 状态同步 ----------
  function sync(s) {
    for (const t of phaseTabs.querySelectorAll('.phase')) t.setAttribute('aria-pressed', String((t.dataset.building || null) === s.building));
    renderFloors(s.building);
    for (const f of floorList.querySelectorAll('.floor')) f.setAttribute('aria-pressed', String((f.dataset.level || null) === s.focus && !s.exploded));
    const press = (act, on) => toolbar.querySelector(`[data-act="${act}"]`)?.setAttribute('aria-pressed', String(!!on));
    press('explode', s.exploded);
    press('flows', s.flows);
    press('labels', s.labels);
    press('night', s.night);
    press('tour', s.touring);
    $('legend').hidden = !s.flows;
    const lv = s.focus ? lvById[s.focus] : null;
    const b = s.building ? bById[s.building] : null;
    $('floorInfo').textContent = s.exploded ? `${b.name} · 爆炸视图` : lv ? `${b.short} · ${lv.name} · ${lv.theme.label}` : b ? `${b.name} · ${b.en}` : '园区总览 · 一期云澜汇 · 二期星湾 · 三期云澜里 · 地铁云澜汇站';
    renderDirectory();
  }
  app.on(sync);
  sync(app.state);

  // ---------- 悬停提示与点击 ----------
  const tip = $('tooltip');
  const canvas = app.renderer.domElement;
  let downAt = null;
  canvas.addEventListener('pointermove', (e) => {
    if (!app.pick) return;
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
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || !app.pick) return;
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
