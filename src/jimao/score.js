// 零点突围：得分和连杀奖励。
// 击倒一个敌人弹出「+100 击倒」，爆头、难打的兵种、短时间内连着击倒再加分；完成目标、撤离成功另有加分。结算页多一行「行动得分」。
// 连杀（中间没有阵亡）到 3、5、7 个各给一次奖励，之后每 4 个再轮一遍：
//   3 连杀  无人机侦察：25 秒内小地图上显示附近所有敌人；
//   5 连杀  弹药补给：备弹 +60、手雷 +1；
//   7 连杀  战地急救：生命回满。
export const SCORE = Object.freeze({ kill: 100, headshot: 50, multi: 50, multiWindow: 3, objective: 250, extract: 500, role: Object.freeze({ heavy: 50, marksman: 25, rusher: 0, regular: 0, boss: 500 }) });
export const STREAKS = Object.freeze([
  Object.freeze({ at: 3, id: 'uav', name: '无人机侦察', line: '25 秒内小地图显示附近所有敌人', seconds: 25 }),
  Object.freeze({ at: 5, id: 'supply', name: '弹药补给', line: '备弹 +60 · 手雷 +1', ammo: 60 }),
  Object.freeze({ at: 7, id: 'medic', name: '战地急救', line: '生命回满' }),
]);
export const STREAK_CYCLE = 4;

/** 连杀到 n 个时给哪个奖励（没有返回 null）：3、5、7，之后 11、15、19… 轮着给 */
export function streakReward(n) {
  const hit = STREAKS.find((s) => s.at === n);
  if (hit) return hit;
  const last = STREAKS.at(-1).at;
  if (n > last && (n - last) % STREAK_CYCLE === 0) return STREAKS[((n - last) / STREAK_CYCLE - 1) % STREAKS.length];
  return null;
}
/** 这次击倒得几分：[{ text, points }]。multi 是这几秒里已经连着击倒的个数（含这一个） */
export function killPoints({ part = 'body', role = 'regular', multi = 1 } = {}) {
  const out = [{ text: role === 'boss' ? '击毙头目' : '击倒', points: SCORE.kill + (SCORE.role[role] || 0) }];
  if (part === 'weak') out.push({ text: '爆头', points: SCORE.headshot });
  if (multi >= 2) out.push({ text: `${multi} 连击`, points: SCORE.multi * (multi - 1) });
  return out;
}

export function createScore(G, { ui = null, onSupply = null } = {}) {
  const state = { total: 0, kills: 0, headshots: 0, streak: 0, best: 0, uav: 0, multi: 0, multiT: 0 };
  let root = null, stack = null, banner = null, totalEl = null, rows = [], bannerT = 0;
  if (ui && typeof document !== 'undefined') {
    root = document.createElement('div'); root.className = 'jm-score';
    root.innerHTML = '<div class="jm-score-total"></div><div class="jm-score-stack"></div><div class="jm-score-banner"></div>';
    totalEl = root.firstChild; stack = root.children[1]; banner = root.children[2];
    (ui.querySelector('.hud') || ui).appendChild(root);
    // 阵亡页、完成页各加一行「行动得分」
    for (const dl of ui.querySelectorAll('.m-stats')) {
      const row = document.createElement('div'); row.innerHTML = '<dt>行动得分</dt><dd data-f="jm-score">0</dd>';
      dl.appendChild(row); rows.push(row.querySelector('dd'));
    }
  }
  const paint = () => { if (totalEl) totalEl.textContent = `得分 ${state.total}`; for (const dd of rows) dd.textContent = `${state.total}${state.best >= 3 ? ` · 最高 ${state.best} 连杀` : ''}`; };
  function pop(text, points) {
    state.total += points;
    if (stack) {
      const el = document.createElement('div'); el.className = 'jm-score-pop'; el.textContent = `+${points} ${text}`;
      stack.prepend(el); while (stack.children.length > 4) stack.lastChild.remove();
      setTimeout(() => el.remove(), 1600);
    }
    paint();
  }
  function reward(r) {
    if (r.id === 'uav') state.uav = r.seconds;
    else if (r.id === 'supply') { try { G.weapon?.addAmmo?.(r.ammo); G.actions?.give?.(1); onSupply?.(r); } catch { /* 补给失败不影响计分 */ } }
    else if (r.id === 'medic' && G.player) G.player.health = G.player.maxHealth ?? 100;
    if (banner) { banner.innerHTML = `<b>${state.streak} 连杀 · ${r.name}</b><span>${r.line}</span>`; banner.classList.add('on'); bannerT = 3.2; }
    G.audio?.play?.('objective', { gain: 0.8 });
    G.events?.emit?.('streak:reward', { id: r.id, streak: state.streak });
  }
  const onKill = (e) => {
    if (G.game?.state !== 'playing') return;
    state.kills++; state.streak++; state.best = Math.max(state.best, state.streak);
    state.multi = state.multiT > 0 ? state.multi + 1 : 1; state.multiT = SCORE.multiWindow;
    if (e?.part === 'weak') state.headshots++;
    for (const p of killPoints({ part: e?.part, role: e?.enemy?.role, multi: state.multi })) pop(p.text, p.points);
    const r = streakReward(state.streak); if (r) reward(r);
  };
  G.events?.on?.('enemy:killed', onKill);
  G.events?.on?.('objective:done', () => { if (G.game?.state === 'playing') pop('目标完成', SCORE.objective); });
  G.events?.on?.('player:dead', () => { state.streak = 0; state.uav = 0; });
  G.events?.on?.('game:state', (e) => { if (e?.state === 'done' || e?.state === 'complete') { pop('撤离成功', SCORE.extract); } });

  return {
    state, pop,
    /** 无人机侦察还剩几秒（小地图用） */
    get uav() { return state.uav; },
    update(dt) {
      if (state.uav > 0) state.uav = Math.max(0, state.uav - dt);
      if (state.multiT > 0) state.multiT -= dt;
      if (bannerT > 0 && (bannerT -= dt) <= 0) banner?.classList.remove('on');
      if (root) { const on = G.game?.state === 'playing'; if (root.classList.contains('off') === on) root.classList.toggle('off', !on); }
    },
    reset() { Object.assign(state, { total: 0, kills: 0, headshots: 0, streak: 0, best: 0, uav: 0, multi: 0, multiT: 0 }); if (stack) stack.textContent = ''; banner?.classList.remove('on'); paint(); },
    dispose() { root?.remove(); for (const dd of rows) dd.parentElement?.remove(); },
  };
}

export const SCORE_CSS = `
.jm-score.off { display: none; }
.jm-score-total { position: absolute; right: calc(var(--gr, 18px) + 4px); top: calc(16px + var(--sat, 0px)); font: 600 13px/1 var(--f-mono, monospace); letter-spacing: .1em; color: var(--bone, #e8e4da); text-shadow: 0 1px 4px rgba(0, 0, 0, .8); }
.is-touch .jm-score-total { right: calc(var(--gr, 18px) + 62px); }
.jm-score-stack { position: absolute; left: calc(50% + 46px); top: calc(50% - 10px); display: flex; flex-direction: column; gap: 3px; pointer-events: none; }
.jm-score-pop { font: 700 13px/1.2 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #ffd27a; text-shadow: 0 1px 4px rgba(0, 0, 0, .85); white-space: nowrap; animation: jm-pop 1.6s ease-out forwards; }
@keyframes jm-pop { 0% { opacity: 0; transform: translateX(-8px); } 12% { opacity: 1; transform: none; } 70% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
.jm-score-banner { position: absolute; left: 50%; top: calc(86px + var(--sat, 0px)); transform: translateX(-50%); padding: 7px 16px 8px; background: rgba(10, 13, 15, .72); border-top: 2px solid #ffb347; text-align: center; opacity: 0; transition: opacity .25s; pointer-events: none; white-space: nowrap; }
.jm-score-banner.on { opacity: 1; }
.jm-score-banner b { display: block; font: 700 15px/1.2 'PingFang SC', 'Microsoft YaHei', sans-serif; letter-spacing: .1em; color: #ffb347; }
.jm-score-banner span { font: 400 12px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif; color: rgba(232, 228, 218, .85); }
`;
