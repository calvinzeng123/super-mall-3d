// 零点突围的封面（开始界面）和各个菜单页的文字。原游戏的菜单是一段写死的 HTML（vendor/game.js），按钮靠
// data-act 走事件委托（点击挂在菜单根节点上）：这里在它建好以后重写封面的结构和文字，按钮只要还带着同样的
// data-act、还在菜单里，就照常好用。改名（几猫 → 零点突围）仍在 scripts/jimao/rebrand.mjs，这里只管版面和话术。
//
// 封面：顶上一条「指挥中心加密频道 · 直播中」和一只从 00:00:00 往上走的钟；左边大标题、局势、今夜可能抽到的
// 五种任务和两种撤离、按钮；右边（宽屏）操作速览。背景还是游戏里的实景，加一层压暗、红色警报光、扫描线。

/** 五种任务（和 missions.js 的 MISSION_TYPES 一一对应）：编号、名字、一句话 */
export const COVER_OPS = Object.freeze([
  { type: 'relay', name: '切断中继', line: '三处上行中继，逐个拔掉' },
  { type: 'eliminate', name: '歼灭劫持者', line: '红点标出每一个敌人' },
  { type: 'rooms', name: '取回赃物', line: '公寓住户和商铺里各一箱' },
  { type: 'hotel', name: '酒店情报', line: '两间客房，两只情报箱' },
  { type: 'hold', name: '坚守控制点', line: '光圈里守满 75 秒' },
]);

export const COVER_COPY = Object.freeze({
  live: '指挥中心 · 加密频道',
  status: '云澜汇 · 商场 / 酒店 / 公寓 · 全部失联',
  tag: '紧急',
  eyebrow: '云澜汇反劫持行动',
  code: '行动代号 · 零点',
  premise: '00:00，云澜汇全面断电。一伙武装分子封锁了商场、酒店和公寓，切断了对外通信。外围部队进不来——楼里只剩你一名特勤队员。',
  opsTitle: '今夜的任务 · 每局随机一项',
  exits: '撤离：屋顶直升机 · 地库装甲车',
  deploy: '出击',
  note: '单人行动 · 18 名武装分子 · 走到电梯口可乘电梯（Z / X）',
});

/** 其他菜单页的标题（[选择器, 文字]）：暂停、阵亡、完成 */
export const SCREEN_COPY = Object.freeze([
  ['[data-s="paused"] .m-k', '行动暂停 · 指挥中心待命'],
  ['[data-s="paused"] .m-h', '待命中'],
  ['[data-s="paused"] [data-act="resume"]', '继续行动'],
  ['[data-s="paused"] [data-act="restart"]', '重新出击（换一项任务）'],
  ['[data-s="dead"] .m-k', '特勤队员倒下'],
  ['[data-s="dead"] .m-h', '通讯中断'],
  ['[data-s="dead"] [data-act="retry"]', '重新出击'],
  ['[data-s="complete"] .m-k', '零点突围 · 行动简报'],
  ['[data-s="complete"] .m-h', '云澜汇已收复'],
  ['[data-s="complete"] [data-act="redeploy"]', '再来一局'],
]);

/** 「项目介绍」里的文字（段落） */
export const ABOUT_COPY = Object.freeze([
  '<strong>零点突围</strong>是云澜汇园区里的一局单人第一人称射击：午夜零点，武装分子劫持了商场、酒店和公寓，你要在楼里完成指挥中心下达的任务，再乘直升机或装甲车杀出去。',
  '地图就是园区漫游的那一套真实楼层：一期商场六层加地库、酒店和公寓塔楼、地铁站厅。扶梯、楼梯、电梯都能走，每局随机抽一项任务（切断中继、歼灭、取回赃物、酒店情报、坚守控制点）和一种撤离方式。',
  '撤离不是走到点就结束：坐直升机要用左舷六管机枪清扫楼顶，坐装甲车要在车顶射击口压制沿路冲出来的敌人，载具被打爆就算撤离失败。',
  '项目还在持续开发，手感、难度和画面都在调。玩的时候觉得哪里不对，欢迎直接告诉我们。',
]);

/** 操作说明里补一段（原游戏的说明里没有电梯） */
export const LIFT_HELP = '<h3>电梯</h3><p class="panel-note">走到任何一部电梯门口，电脑按住 <kbd>Z</kbd> 上楼、<kbd>X</kbd> 下楼，手机按住屏幕下方的 ▲ ▼；松手就在那一层停。坐电梯时不会被打中，敌人也不会坐电梯。</p>';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 封面左栏的 HTML（按钮另外搬进来，保住原来的元素） */
export function coverHtml(copy = COVER_COPY, ops = COVER_OPS) {
  return `
    <div class="zh-top" aria-hidden="true"><span class="zh-live"><i></i>${esc(copy.live)}</span><span class="zh-clock" data-zh="clock">00:00:00</span><span class="zh-status">${esc(copy.status)}</span></div>
    <div class="m-eyebrow"><span class="m-tag">${esc(copy.tag)}</span><span>${esc(copy.eyebrow)}</span><span class="m-dim">${esc(copy.code)}</span></div>
    <h1 class="m-word">零点突围<span class="m-subtitle">ZERO HOUR</span></h1>
    <p class="m-premise">${esc(copy.premise)}</p>
    <div class="zh-ops" aria-label="${esc(copy.opsTitle)}">
      <div class="zh-ops-h"><span>${esc(copy.opsTitle)}</span><em>${esc(copy.exits)}</em></div>
      <ol>${ops.map((o, i) => `<li data-op="${o.type}"><b>0${i + 1}</b><span>${esc(o.name)}</span><small>${esc(o.line)}</small></li>`).join('')}</ol>
    </div>
    <div class="m-actions" data-zh="actions"></div>
    <p class="m-note">${esc(copy.note)}</p>`;
}

/**
 * 把原游戏建好的菜单改成新封面。root：菜单根节点所在的文档（默认 document）。返回 { tick(), dispose() }：
 * tick 每帧调一次（封面那只钟只在封面显示时走）。
 */
export function applyCover(root = typeof document !== 'undefined' ? document : null, { now = () => performance.now() } = {}) {
  if (!root) return { tick() {}, dispose() {} };
  const title = root.querySelector('[data-s="title"]');
  if (title && !title.dataset.zh) {
    title.dataset.zh = '1';
    title.classList.add('zh-cover');
    const main = title.querySelector('.m-title-main');
    const buttons = [...title.querySelectorAll('.m-actions [data-act]')];
    if (main) {
      main.innerHTML = coverHtml();
      const box = main.querySelector('[data-zh="actions"]');
      // 顺序：出击、操作说明、设置、关于
      const order = ['deploy', 'controls', 'settings', 'about'];
      for (const act of order) { const b = buttons.find((q) => q.dataset.act === act); if (b) box.appendChild(b); }
      for (const b of buttons) if (!b.isConnected || !box.contains(b)) box.appendChild(b);
      const dep = box.querySelector('[data-act="deploy"]');
      if (dep) dep.innerHTML = `<span>${esc(COVER_COPY.deploy)}</span><i aria-hidden="true">▶</i>`;
      const ab = box.querySelector('[data-act="about"]'); if (ab) ab.textContent = '关于';
      // 「操作说明」原来只在窄屏显示（宽屏右边有操作速览）；现在一直显示
      box.querySelector('[data-act="controls"]')?.classList.remove('m-only-narrow');
    }
  }
  for (const [sel, text] of SCREEN_COPY) { const el = root.querySelector(sel); if (el) el.textContent = text; }
  const about = root.querySelector('[data-pane="about"]');
  if (about && !about.dataset.zh) { about.dataset.zh = '1'; about.innerHTML = `<h3>零点突围 · ZERO HOUR</h3>${ABOUT_COPY.map((p) => `<p>${p}</p>`).join('')}`; }
  const tab = root.querySelector('.tab[data-tab="about"]'); if (tab) tab.textContent = '关于';
  const controls = root.querySelector('[data-pane="controls"]');
  if (controls && !controls.dataset.zh) { controls.dataset.zh = '1'; controls.insertAdjacentHTML('beforeend', LIFT_HELP); }

  const clock = title?.querySelector('[data-zh="clock"]'), menu = title?.closest('.menu');
  let t0 = now(), last = '';
  return {
    tick() {
      if (!clock) return;
      if (menu && menu.dataset.screen !== 'title') { t0 = now(); return; }
      const s = Math.floor((now() - t0) / 1000), txt = [s / 3600, (s / 60) % 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');
      if (txt !== last) { last = txt; clock.textContent = txt; }
    },
    dispose() {},
  };
}

/** 出击时屏幕左下那张地点卡（loc-card）：写上这一局的任务和撤离方式 */
export function locCard(root, mission, where = '云澜汇 · 一期中庭') {
  const card = root?.querySelector?.('.loc-card');
  if (!card || !mission) return;
  const b = card.querySelector('b'), s = card.querySelector('span');
  if (b) b.textContent = `00:00 · ${where}`;
  if (s) s.textContent = `任务：${mission.title} · 撤离：${mission.extraction.where}${mission.extraction.label}`;
}

export const COVER_CSS = `
/* 设置 / 操作说明 / 关于 面板：园区漫游的 .panel（浅色毛玻璃卡片）同名，盖掉了原游戏的深色底，浅字压在浅底上看不清 */
.menu .panel { background: rgba(11, 13, 15, .95) !important; border: 0 !important; border-left: 1px solid rgba(232, 228, 218, .18) !important;
  border-radius: 0 !important; box-shadow: -18px 0 40px rgba(0, 0, 0, .35) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
/* ---- 封面 ---- */
.m-title.zh-cover::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -1;
  background:
    linear-gradient(90deg, rgba(8, 9, 11, .92) 0%, rgba(8, 9, 11, .72) 38%, rgba(8, 9, 11, .18) 70%, rgba(8, 9, 11, .45) 100%),
    radial-gradient(120% 70% at 50% -10%, rgba(255, 58, 46, .26), rgba(255, 58, 46, 0) 60%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .025) 0 1px, transparent 1px 3px);
  animation: zh-alarm 2.6s ease-in-out infinite; }
@keyframes zh-alarm { 0%, 100% { opacity: 1; } 50% { opacity: .82; } }
.m-title.zh-cover { isolation: isolate; }
.zh-cover .m-title-main { max-width: 760px; }
.zh-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; margin-bottom: clamp(10px, 3vh, 26px); font: 600 12px/1.2 var(--f-mono); letter-spacing: .14em; color: rgba(232, 228, 218, .72); }
.zh-live { display: inline-flex; align-items: center; gap: 8px; color: #ff6a5a; }
.zh-live i { width: 8px; height: 8px; border-radius: 50%; background: #ff3a2e; box-shadow: 0 0 10px #ff3a2e; animation: zh-blink 1s steps(2, start) infinite; }
@keyframes zh-blink { to { visibility: hidden; } }
.zh-clock { font-variant-numeric: tabular-nums; color: var(--bone); padding: 2px 8px; border: 1px solid rgba(232, 228, 218, .28); }
.zh-status { color: var(--steel); }
.zh-cover .m-tag { background: #ff3a2e; color: #fff; }
.zh-cover .m-word { text-shadow: 0 0 1px rgba(0, 0, 0, .6), 3px 0 0 rgba(255, 58, 46, .35), -3px 0 0 rgba(255, 179, 71, .18), 0 2px 30px rgba(0, 0, 0, .45); }
.zh-cover .m-premise { max-width: 36em; }
.zh-ops { margin-top: clamp(12px, 2.4vh, 22px); }
.zh-ops-h { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font: 600 12px/1.3 var(--f-label); letter-spacing: .18em; color: var(--steel); margin-bottom: 8px; }
.zh-ops-h em { font-style: normal; color: var(--signal); letter-spacing: .12em; }
.zh-ops ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
.zh-ops li { padding: 8px 10px 9px; background: rgba(11, 13, 15, .58); border: 1px solid rgba(232, 228, 218, .16); border-top: 2px solid rgba(255, 179, 71, .7); min-width: 0; }
.zh-ops li b { display: block; font: 700 11px/1 var(--f-mono); color: var(--signal); letter-spacing: .1em; }
.zh-ops li span { display: block; margin-top: 6px; font: 700 14px/1.2 var(--f-label); color: var(--bone); letter-spacing: .06em; white-space: nowrap; }
.zh-ops li small { display: block; margin-top: 4px; font: 400 11px/1.35 var(--f-label); color: rgba(232, 228, 218, .62); letter-spacing: .02em; }
.zh-cover .m-actions .btn.primary { display: inline-flex; align-items: center; gap: 14px; }
.zh-cover .m-actions .btn.primary i { font-style: normal; font-size: 13px; letter-spacing: 0; }
.zh-cover .m-note { color: rgba(232, 228, 218, .55); }
/* 横屏手机（高度不够）：任务只留名字，一行排开；顶条只留频道和钟 */
@media (max-height: 500px) {
  .zh-top { margin-bottom: 6px; font-size: 10px; } .zh-status { display: none; }
  .zh-cover .m-premise { font-size: 13px !important; padding-top: 8px !important; max-width: 46em; }
  .zh-ops { margin-top: 8px; } .zh-ops-h { margin-bottom: 4px; font-size: 10px; }
  .zh-ops li { padding: 5px 7px 6px; } .zh-ops li small { display: none; } .zh-ops li span { font-size: 12px; margin-top: 3px; }
  .zh-cover .m-note { display: none; }
}
/* 竖屏手机：任务两列，说明缩短 */
@media (max-width: 600px) {
  .zh-ops ol { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .zh-ops li:last-child { grid-column: span 2; }
  .zh-status { display: none; }
}
`;
