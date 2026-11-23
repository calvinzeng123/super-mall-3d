// 零点突围：性能微调。原游戏的设置里只有「画面质量 低 / 中 / 高 / 极高」四档，卡不卡只能整档换。
// 这里在那一行下面加几项可以单独调的：帧率上限、分辨率、阴影、抗锯齿、光影特效、路人多少、同时在场的敌人数，
// 标题旁边显示当前帧率，调一下马上能看到变化。
// 选一档画面质量 = 这几项回到那一档的默认值（帧率上限默认 60：以前「低」档封在 30 帧，打枪不跟手）；之后再单独调的会存下来
// （localStorage 的 zerohour.tuning.v1，只管这个模式，不动园区漫游存的画质）。
export const TUNING_KEY = 'zerohour.tuning.v1';
export const FPS_CAPS = Object.freeze([30, 45, 60, 120, 0]); // 0 = 不限：跟着屏幕刷新率（60 / 120 / 144 Hz）
export const ENEMY_CAPS = Object.freeze([{ v: 8, label: '少' }, { v: 11, label: '中' }, { v: 14, label: '多' }]);
/** 每一项：null = 跟着画面质量那一档走 */
// 帧率上限默认不限：电脑上鼠标转视角，封在 60 帧以下（或者刷新率高的屏上封 60）会觉得拖；手机上默认 60（见 createTuning），省电、少发热
export const TUNING_DEFAULT = Object.freeze({ maxFps: 0, resolution: null, shadows: null, aa: null, fx: null, crowd: null, enemies: null });

/** 存下来的微调 → 干净的对象（不认识的、越界的丢掉） */
export function normalizeTuning(v) {
  const t = { ...TUNING_DEFAULT }, i = v && typeof v === 'object' ? v : {};
  if (FPS_CAPS.includes(i.maxFps)) t.maxFps = i.maxFps;
  if (Number.isFinite(i.resolution)) t.resolution = Math.max(0.5, Math.min(2, Math.round(i.resolution * 20) / 20));
  for (const k of ['shadows', 'aa', 'fx']) if (typeof i[k] === 'boolean') t[k] = i[k];
  if (Number.isFinite(i.crowd)) t.crowd = Math.max(0, Math.min(1, i.crowd));
  if (ENEMY_CAPS.some((e) => e.v === i.enemies)) t.enemies = i.enemies;
  return t;
}
/** 微调 → 交给画质管理器的覆盖项（只含调过的） */
export function tuningPatch(t) {
  const p = { maxFps: t.maxFps };
  if (t.resolution != null) p.resolution = t.resolution;
  if (t.shadows != null) p.shadows = t.shadows;
  if (t.fx != null) { p.hdr = t.fx; p.bloom = t.fx; }
  if (t.crowd != null) p.crowdDensity = t.crowd;
  return p;
}

export function createTuning({ app, ui, grade, flow, mobile = false, storage = null, baseSamples = 4 }) {
  let t, saved = null; try { saved = JSON.parse(storage?.getItem(TUNING_KEY) || 'null'); } catch { /* 坏数据当没存过 */ }
  t = normalizeTuning(saved);
  const fresh = () => { const v = normalizeTuning(null); if (mobile) v.maxFps = 60; return v; };
  if (mobile && !FPS_CAPS.includes(saved?.maxFps)) t.maxFps = 60;
  const baseEnemies = flow?.maxAlive ?? 14;
  const save = () => { try { storage?.setItem(TUNING_KEY, JSON.stringify(t)); } catch { /* 无痕模式存不了 */ } };
  /** 敌人数量的比例（任务里的增援上限也按它缩，见 missions.js） */
  const enemyScale = () => (t.enemies ?? baseEnemies) / baseEnemies;
  function apply() {
    app.customizeQuality?.(tuningPatch(t), { persist: false });
    grade?.setSamples?.(t.aa === false ? 0 : baseSamples);
    if (flow) flow.maxAlive = t.enemies ?? baseEnemies;
    paint();
  }

  // ---- 界面：插在「画面质量」那一行后面 ----
  let root = null, fpsEl = null;
  const qRow = ui?.querySelector?.('[data-pane="settings"] .row');
  // 分辨率滑块的上限：这块屏幕的像素比（手机最多 1.5、电脑最多 2）——再往上画质管理器也会压回来
  const maxRes = Math.max(0.5, Math.min(mobile ? 1.5 : 2, Math.round((globalThis.devicePixelRatio || 1) * 20) / 20));
  const seg = (key, items) => `<div class="jm-seg" role="group" data-tune="${key}">${items.map((i) => `<button data-v="${i.v}" aria-pressed="false">${i.label}</button>`).join('')}</div>`;
  const toggle = (key) => `<button class="toggle" data-tune="${key}" aria-pressed="false"><i></i><span>关闭</span></button>`;
  if (qRow && typeof document !== 'undefined') {
    root = document.createElement('div'); root.className = 'jm-tune';
    root.innerHTML = `
      <div class="jm-tune-h"><b>性能微调</b><span data-f="fps"></span></div>
      <div class="row"><label>帧率上限</label>${seg('maxFps', FPS_CAPS.map((v) => ({ v, label: v > 0 ? `${v}` : '不限' })))}</div>
      <div class="row"><label for="jt-res">分辨率</label><div class="slider"><input id="jt-res" type="range" min="0.5" max="${maxRes}" step="0.05" data-tune="resolution"><output data-o="resolution"></output></div></div>
      <div class="row"><label>阴影</label>${toggle('shadows')}</div>
      <div class="row"><label>抗锯齿</label>${toggle('aa')}</div>
      <div class="row"><label>光影特效</label>${toggle('fx')}</div>
      <div class="row"><label for="jt-crowd">路人</label><div class="slider"><input id="jt-crowd" type="range" min="0" max="1" step="0.05" data-tune="crowd"><output data-o="crowd"></output></div></div>
      <div class="row"><label>同时在场的敌人</label>${seg('enemies', ENEMY_CAPS)}</div>
      <p class="panel-note">卡的时候先降分辨率，再关阴影和抗锯齿；还卡就把路人和敌人调少。选上面任意一档「画面质量」会把这几项恢复成那一档的默认值。</p>`;
    qRow.after(root);
    fpsEl = root.querySelector('[data-f="fps"]');
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const group = b.closest('[data-tune]'), key = group?.dataset.tune; if (!key) return;
      if (group.classList.contains('jm-seg')) t[key] = +b.dataset.v;
      else t[key] = !current()[key];
      save(); apply();
    });
    root.addEventListener('input', (e) => {
      const key = e.target.dataset?.tune; if (!key) return;
      t[key] = +e.target.value; save(); apply();
    });
  }
  /** 现在实际生效的值（调过的用调的，没调的读画质档位） */
  function current() {
    const q = app.quality || {};
    return { maxFps: q.maxFps ?? t.maxFps, resolution: Math.min(t.resolution ?? q.pixelRatio ?? q.resolution ?? 1, q.pixelRatio ?? Infinity), shadows: t.shadows ?? !!q.shadows, aa: t.aa ?? true, fx: t.fx ?? !!q.hdr,
      crowd: t.crowd ?? q.crowdDensity ?? 0, enemies: t.enemies ?? baseEnemies };
  }
  function paint() {
    if (!root) return;
    const c = current();
    for (const g of root.querySelectorAll('.jm-seg[data-tune]')) for (const b of g.querySelectorAll('button')) b.setAttribute('aria-pressed', String(+b.dataset.v === c[g.dataset.tune]));
    for (const b of root.querySelectorAll('.toggle[data-tune]')) { const on = !!c[b.dataset.tune]; b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? '开启' : '关闭'; }
    const res = root.querySelector('#jt-res'), crowd = root.querySelector('#jt-crowd');
    res.value = c.resolution; root.querySelector('[data-o="resolution"]').textContent = `${Math.min(c.resolution, +res.max).toFixed(2)}×`;
    crowd.value = c.crowd; root.querySelector('[data-o="crowd"]').textContent = c.crowd <= 0 ? '没有' : `${Math.round(c.crowd * 100)}%`;
  }

  let frames = 0, since = 0, fps = 0;
  return {
    get value() { return { ...t }; }, current, enemyScale,
    get fps() { return fps; },
    /** 开局时调一次：把存下来的微调叠到当前档位上 */
    apply,
    /** 玩家换了一档画面质量：微调回到默认（帧率上限 60） */
    resetToTier() { t = fresh(); save(); apply(); },
    /** 每帧调：数帧率，一秒刷一次显示 */
    tick(now = performance.now()) {
      frames++;
      if (!since) since = now;
      if (now - since >= 1000) { fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now; if (fpsEl && root.offsetParent !== null) fpsEl.textContent = `当前 ${fps} 帧/秒`; }
    },
    dispose() { root?.remove(); },
  };
}

export const TUNING_CSS = `
.jm-tune { margin: 6px 0 2px; padding: 8px 0 0; border-top: 1px solid rgba(232, 228, 218, .14); }
.jm-tune-h { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 4px; font: 600 12px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif; letter-spacing: .12em; color: #ffb347; }
.jm-tune-h span { font-weight: 400; letter-spacing: .04em; color: rgba(232, 228, 218, .7); font-variant-numeric: tabular-nums; }
/* 自己的分段按钮（不叫 .seg：原游戏每次刷新设置都会把所有 .seg 按钮按画面质量重新点亮一遍） */
.jm-seg { display: flex; }
.jm-seg button { flex: 1 1 0; min-width: 44px; min-height: 40px; font: 600 13px/1 var(--f-label); letter-spacing: .16em; color: var(--bone-dim); background: transparent; border: 1px solid rgba(232, 228, 218, .35); border-radius: 0; margin-left: -1px; padding: 1px 0 0; cursor: pointer; }
.jm-seg button:first-child { margin-left: 0; }
.jm-seg button:hover { color: var(--bone); }
.jm-seg button[aria-pressed="true"] { background: var(--bone); border-color: var(--bone); color: var(--ink); position: relative; }
`;
