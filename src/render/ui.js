// 界面：楼层牌、工具条、店铺目录与搜索、悬停提示。
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createUI(app, layout) {
  const levels = [...layout.levels].reverse();
  const floorBar = $('floorBar');
  floorBar.innerHTML =
    `<button class="floor all" data-level="" aria-pressed="true"><span class="fl-num">全楼</span><span class="fl-name">整体外观</span></button>` +
    levels
      .map((lv) => `<button class="floor" data-level="${lv.id}" aria-pressed="false" style="--fc:${lv.theme.accent}"><span class="fl-num">${lv.short}</span><span class="fl-name">${esc(lv.theme.label.split(' · ')[0])}</span></button>`)
      .join('');
  floorBar.addEventListener('click', (e) => {
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
  const facts = (lv) => {
    if (!lv) {
      const units = layout.levels.reduce((n, l) => n + l.units.length, 0);
      const stalls = layout.levels.reduce((n, l) => n + (l.parking ? l.parking.stalls.length : 0), 0);
      return [['店铺', units], ['扶梯', layout.escalators.length], ['电梯', layout.elevators.length], ['人行入口', layout.entrances.length], ['车位', stalls]];
    }
    const esc2 = layout.escalators.filter((e) => e.from === lv.id || e.to === lv.id).length;
    const lifts = layout.elevators.filter((e) => e.serves.includes(lv.id)).length;
    const wc = lv.rooms.filter((r) => r.type === 'wc').length;
    const out = [['扶梯', esc2], ['电梯', lifts], ['洗手间', wc]];
    if (lv.units.length) out.unshift(['店铺', lv.units.length]);
    if (lv.parking) out.push(['车位', lv.parking.stalls.length]);
    if (lv.id === '1F') out.push(['人行入口', layout.entrances.length]);
    return out;
  };
  function renderDirectory() {
    const s = app.state;
    const lv = s.focus ? layout.levels.find((l) => l.id === s.focus) : null;
    const q = search.value.trim().toLowerCase();
    $('dirBadge').textContent = lv ? lv.short : '全';
    $('dirBadge').style.setProperty('--fc', lv ? lv.theme.accent : 'var(--accent)');
    $('dirTitle').textContent = lv ? lv.name : '全楼导览';
    $('dirTheme').textContent = lv ? lv.theme.label : '7 个楼层 · 点击楼层或店铺查看';
    $('dirFacts').innerHTML = facts(lv).map(([k, v]) => `<span class="fact">${k} <b>${v}</b></span>`).join('');
    const pool = q
      ? layout.levels.flatMap((l) => l.units).filter((u) => `${u.brand.name} ${u.brand.en} ${u.brand.catLabel} ${u.code}`.toLowerCase().includes(q))
      : lv
        ? lv.units
        : [];
    const groups = new Map();
    for (const u of pool) {
      const key = q ? layout.levels.find((l) => l.id === u.level).name : u.brand.catLabel;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(u);
    }
    let html = '';
    if (!lv && !q) {
      html = levels
        .map((l) => `<li><button class="shop" data-level="${l.id}"><span class="shop-code">${l.short}</span><span class="shop-name"><b>${esc(l.name)}</b><span>${esc(l.theme.label)}</span></span><span class="shop-cat" style="--cc:${l.theme.accent}">${l.units.length ? l.units.length + ' 家' : l.parking ? l.parking.stalls.length + ' 位' : ''}</span></button></li>`)
        .join('');
    } else if (!pool.length) {
      html = `<li class="empty">${q ? '没有找到匹配的店铺，换个关键词试试。' : '这一层没有店铺，主要是停车位和设备用房。'}</li>`;
    } else {
      for (const [k, us] of groups) {
        html += `<li class="dir-group">${esc(k)}</li>`;
        html += us
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((u) => `<li><button class="shop${s.selected === u.id ? ' active' : ''}" data-unit="${u.id}"><span class="shop-code">${u.code}</span><span class="shop-name"><b>${esc(u.brand.name)}</b><span>${esc(u.brand.en)}</span></span><span class="shop-cat" style="--cc:${catColor(u.brand.cat)}">${esc(u.brand.catLabel)}</span></button></li>`)
          .join('');
      }
    }
    list.innerHTML = html;
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.shop');
    if (!b) return;
    if (b.dataset.level) app.setFocus(b.dataset.level);
    else if (b.dataset.unit) app.focusUnit(unitsById.get(b.dataset.unit));
  });
  search.addEventListener('input', renderDirectory);

  // ---------- 状态同步 ----------
  function sync(s) {
    for (const b of floorBar.querySelectorAll('.floor')) b.setAttribute('aria-pressed', String((b.dataset.level || null) === s.focus && !s.exploded) );
    const press = (act, on) => toolbar.querySelector(`[data-act="${act}"]`)?.setAttribute('aria-pressed', String(!!on));
    press('explode', s.exploded);
    press('flows', s.flows);
    press('labels', s.labels);
    press('night', s.night);
    press('tour', s.touring);
    $('legend').hidden = !s.flows;
    const lv = s.focus ? layout.levels.find((l) => l.id === s.focus) : null;
    $('floorInfo').textContent = s.exploded ? '爆炸视图 · 7 个楼层分层展开' : lv ? `${lv.name} · ${lv.theme.label}` : '全楼 · 地上 3 层 + 夹层 + 地下 2 层 + 天台';
    renderDirectory();
  }
  app.on(sync);
  sync(app.state);

  // ---------- 悬停提示 ----------
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
    const x = Math.min(e.clientX - r.left, r.width - 260);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    canvas.style.cursor = hit.unit ? 'pointer' : '';
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || !app.pick) return;
    const hit = app.pick(e.clientX, e.clientY);
    if (hit && hit.unit) app.focusUnit(hit.unit);
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
