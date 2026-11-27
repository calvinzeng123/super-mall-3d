// 丧尸围城三人联机的玩法规则（接在 coop.js 的同步层上）。只在房间里有两个以上真人时生效——单人、一个人进了房间，和以前一模一样。
//   扮演：座位 0 主角、1 阿哲、2 林医生，各带各的本事：阿哲血 130、拿到步枪那一步多一把冲锋枪；林医生血 90、扶人快（medicMul）；没人坐的座位还是电脑队友。
//   倒地 / 扶起：谁的血打空了都倒在原地等人扶——主机上的你也一样（以前是直接阵亡、整局结束）。真人站到跟前 3 秒扶起来（真人林医生快一些），电脑林医生也会跑过来扶。
//   三个角色（真人、电脑顶替的都算）同时倒下：整个房间这一局结束，一起看阵亡页；重来要房间里的人都点了才开（投票），也可以回大厅。
//   资源翻倍：弹匣、医疗用品（带得下的也翻倍）、投掷物、榴弹、得分（G.rewardMul，ammo.js / supplies.js / score.js 读）。
//   守屋顶：多 extra 波、每波 ×size、最后那阵 ×surge，第 7 波再来一只巨尸（siege.js 的 holdSchedule；池子还是 64 只，满了照旧收尸体、收看不见的）。
//   直升机：右舷再装一挺机枪（missions.js 的 ensureGun2），飞机绕楼时隔一阵原地调个头，左右两挺轮流朝着楼扫（siege.js 的 flip）；
//     主角坐左舷、阿哲坐右舷、林医生在机舱里拿步枪走动（出不了舱门、穿不过两个机枪手，见 missions.js 的 CABIN）。谁先走到登机门都算：大家一起登机（倒着的扶起来带上）。
// 同步（主机说了算）：倒地、扶起进度跟着快照走（coop.self、人物的 down / revive）；全倒、投票、登机用自定义消息；
//   两挺机枪的朝向和开火、机舱里的人站在哪、飞机飞到第几秒、什么时候返航 / 炸楼：主机的快照字段 crew，客户端的操作字段 crew。
import * as THREE from 'three';
import { ROLES } from './sync.js';
import { SQUAD } from '../squad.js';

/**
 * hold：守屋顶加多少（见 siege.js 的 holdSchedule）；reward：资源乘几（coop.js 的 COOP.reward 为准，这里只写说明）；
 * revive：扶人——站到 reach 米内（高差 1.5 米内）secs 秒（真人林医生 ÷ medicMul），电脑林医生 medic 秒；走开了进度每秒退 decay；扶起来回到 hp 血；say 秒提示一次；
 * over：三个都倒下 delay 秒以后结束（看得到最后一个倒下）；board：客户端走到登机门，隔 every 秒再请一次；
 * seats：谁坐哪（left 左舷机枪、right 右舷机枪、cabin 机舱里拿步枪）；loadout：阿哲拿到步枪那一步多给的枪
 */
export const COOP_RULES = Object.freeze({
  hold: Object.freeze({ extra: 2, size: 1.4, surge: 1.5, brutes: Object.freeze([7]) }),
  revive: Object.freeze({ reach: SQUAD.down.reach, secs: SQUAD.down.revive, medic: SQUAD.down.medic, hp: SQUAD.down.hp, decay: 0.5, say: 3 }),
  medicMul: 1.6,
  over: Object.freeze({ delay: 1.2 }),
  board: Object.freeze({ every: 1 }),
  seats: Object.freeze({ lead: 'left', zhe: 'right', lin: 'cabin' }),
  loadout: Object.freeze({ zhe: 'smg' }),
  // 机舱里的人形（别人眼里）：脚底离机身原点多高（舱底）；两个机枪手站在哪（机身局部，和座位一样）
  cabinFloor: 0.78, gunner: Object.freeze({ left: Object.freeze([0.6, -0.22]), right: Object.freeze([-0.6, -0.22]) }),
});

export const RULES_CSS = `
.jm-coop-vote { margin: 8px 0 0; font-size: 13px; color: #ffcf99; letter-spacing: .06em; }
.jm-coop-lobby { margin-top: 8px; }
.jm-coop-down { position: absolute; left: 50%; top: calc(50% + 56px); transform: translateX(-50%); padding: 6px 14px 8px; background: rgba(40, 8, 6, .72); border-top: 2px solid #ff6a5a; color: #ffd6cf; font: 600 13px/1.4 'PingFang SC', 'Microsoft YaHei', sans-serif; letter-spacing: .08em; text-align: center; pointer-events: none; white-space: nowrap; z-index: 5; }
.jm-coop-down[hidden] { display: none; }
.jm-coop-down i { display: block; height: 4px; margin-top: 5px; background: rgba(255, 255, 255, .15); }
.jm-coop-down i b { display: block; height: 100%; width: 0; background: #7dff9a; }
`;

/** 三个角色是不是都倒下了：list = [{ on（在场）, down }]。在场的至少两个、全都倒着才算（纯函数） */
export function allDown(list) {
  const on = list.filter((c) => c && c.on);
  return on.length >= 2 && on.every((c) => c.down);
}
/**
 * 扶人进度往前走一帧（纯函数）：helpers = [{ dist, dy, human, medic }]（跟前站着的人）。真人在跟前：每秒 1 / secs（真人林医生 × medicMul）；
 * 只有电脑林医生：每秒 1 / medic；谁都不在：每秒退 decay。返回新的进度（0–1）
 */
export function reviveStep(t, dt, helpers, R = COOP_RULES.revive, medicMul = COOP_RULES.medicMul) {
  const near = helpers.filter((h) => h.dist < R.reach && Math.abs(h.dy) < 1.5);
  const human = near.filter((h) => h.human);
  if (human.length) return Math.min(1, t + dt * (human.some((h) => h.medic) ? medicMul : 1) / R.secs);
  if (near.some((h) => h.medic)) return Math.min(1, t + dt / R.medic);
  return Math.max(0, t - dt * R.decay);
}
/** 这个角色坐飞机时坐哪（单人永远是左舷） */
export const seatOf = (role, multi = true) => (multi ? COOP_RULES.seats[role] || 'left' : 'left');

/**
 * 接到游戏上（run.js 在 createCoop 之后调）。返回 { pre(dt), post(dt), active, state, dispose() }。
 * pre 每帧在 coop.pre 之后、玩家更新之前；post 每帧在 coop.post 之前
 */
export function createCoopRules(G, { coop, squad = null, siege = null, director = null, ui = null } = {}) {
  const R = COOP_RULES;
  const S = { over: false, overT: 0, why: '', votes: new Set(), hostAct: null, pass: false, boardSent: false, boardT: 0, downSay: 0, downPos: new THREE.Vector3(),
    crewIn: new Map(), hostRide: null, smgGiven: false, wasActive: false, lastRound: -1, prevState: null };
  const self = coop.self;
  const local = () => squad?.net?.local || 'lead';
  const active = () => !!coop.inRoom && coop.mode !== 'off' && coop.humans > 1;
  const host = () => coop.mode === 'host';
  const players = () => coop.players();
  const say = (t, s = 2.5) => G.hud?.message?.(t, s);
  const tmp = new THREE.Vector3();

  // ---- 资源翻倍：ammo.js / supplies.js / score.js 读 G.rewardMul ----
  Object.defineProperty(G, 'rewardMul', { configurable: true, get: () => (active() ? coop.rewardMul : 1) });

  // ---- 主机上的你倒地（不再直接阵亡）：最后一口血留 1，倒在原地等人扶 ----
  const baseDamage = G.player?.damage?.bind(G.player);
  if (G.player && baseDamage) G.player.damage = (n, ...rest) => {
    const p = G.player;
    if (!active() || !host() || director?.riding || !(n > 0) || !p.alive || (p.invulnerable && !self.down)) return baseDamage(n, ...rest);
    if (self.down) return undefined; // 倒着的不再挨打
    if (p.health - n > 0.5) return baseDamage(n, ...rest);
    baseDamage(Math.max(0, p.health - 1), ...rest); // 挨打的那一下照样有（红屏、声音），血留 1
    goDown();
    return undefined;
  };
  function goDown() {
    const p = G.player;
    self.down = true; self.revive = 0; S.downPos.copy(p.pos); S.downSay = 0;
    p.invulnerable = true; p.vel?.set?.(0, 0, 0);
    if (squad) squad.net.selfDown = true;
    G.arms?.setLowered?.(1); G.roofGun?.dismount?.('你倒下了'); siege?.supplies?.cancel?.('');
    G.events?.emit?.('coop:selfdown', { role: local() });
    G.hud?.radio?.('你倒下了！队友过来站到你跟前就能把你扶起来。', 3.5);
  }
  function getUp(quiet = false) {
    const p = G.player;
    self.down = false; self.revive = 0;
    if (squad) squad.net.selfDown = false;
    if (p) { p.invulnerable = false; p.health = Math.min(p.maxHealth || 100, Math.max(p.health, R.revive.hp)); }
    G.arms?.setLowered?.(0);
    if (!quiet) say('你被扶起来了', 2);
    G.events?.emit?.('coop:selfup', { role: local() });
  }
  /** 主机：倒着的你，谁在跟前（真人：远程玩家；电脑：林医生） */
  function selfHelpers() {
    const p = G.player.pos, out = [];
    for (const m of squad?.everyone || []) {
      if (m.down || m.member?.guest || !squad.isOn(m)) continue;
      const human = !!m.remote, medic = m.member?.trait === 'medic';
      if (!human && !medic) continue;
      out.push({ dist: Math.hypot(m.pos.x - p.x, m.pos.z - p.z), dy: m.pos.y - p.y, human, medic });
    }
    return out;
  }
  // 倒着的时候：开不了枪、走不了（客户端倒着也一样：位置 coop.js 锁着，这里把开火、开镜挡掉）
  function freeze() {
    const inp = G.input; if (!inp) return;
    inp.fire = false; inp.ads = false; if (inp.move) { inp.move.x = 0; inp.move.y = 0; }
  }

  // ---- 三个都倒下：这一局结束（主机判，发给大家）----
  const states = () => ROLES.map((role) => {
    if (role === local()) return { role, on: true, down: host() ? self.down || G.player?.alive === false : coop.down };
    const m = squad?.byId(role);
    return { role, on: !!m && squad.isOn(m), down: !!m?.down };
  });
  function roomOver(why) {
    if (S.over) return;
    coop.send('over', { why }, 'all');
    localOver(why);
  }
  function localOver(why) {
    S.over = true; S.why = why; S.votes.clear(); S.hostAct = null;
    const p = G.player; if (!p) return;
    director?.deadTitle?.('三人全部倒下', '突围失败');
    self.down = false; self.revive = 0; if (squad) squad.net.selfDown = false;
    if (p.alive !== false) { p.invulnerable = false; (baseDamage || p.damage?.bind(p))?.(99999, null); }
    paintVote();
    G.events?.emit?.('coop:over', { why });
  }

  // ---- 阵亡页：重来要大家都同意（投票），也能回大厅 ----
  let voteEl = null, lobbyBtn = null;
  function deadSec() { return typeof document !== 'undefined' ? document.querySelector('[data-s="dead"]') : null; }
  function paintVote() {
    const sec = deadSec(); if (!sec) return;
    if (!voteEl) {
      voteEl = document.createElement('p'); voteEl.className = 'm-line jm-coop-vote';
      lobbyBtn = document.createElement('button'); lobbyBtn.className = 'btn jm-coop-lobby'; lobbyBtn.type = 'button'; lobbyBtn.textContent = '回大厅';
      lobbyBtn.addEventListener('click', (e) => { e.stopPropagation(); coop.open(); });
      const acts = sec.querySelector('.m-actions') || sec; acts.after?.(voteEl); acts.appendChild(lobbyBtn);
    }
    const on = S.over && !!coop.inRoom, need = Math.max(1, coop.humans);
    voteEl.hidden = !on; lobbyBtn.hidden = !on;
    if (on) voteEl.textContent = S.votes.has(coop.seat) ? `已同意重来，等大家（${S.votes.size}/${need}）` : `重来要房间里的人都点（${S.votes.size}/${need} 已同意）`;
  }
  // 阵亡页的「重试 / 回到……重来 / 换一局重来」：在房间里结束的那一局，点了先算一票（捕获阶段拦下，原来的处理不走）
  const onClick = (e) => {
    if (!S.over || !coop.inRoom || S.pass) return;
    const b = e.target?.closest?.('[data-s="dead"] [data-act="retry"], [data-s="dead"] [data-act="redeploy"]'); if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    vote(coop.seat, b.dataset.act === 'redeploy' && b.dataset.zh === 'fresh' ? 'fresh' : b.dataset.act);
  };
  if (typeof document !== 'undefined') document.addEventListener('click', onClick, true);
  function vote(seat, act) {
    if (host()) { S.votes.add(seat); if (seat === coop.seat) S.hostAct = act; tally(); }
    else { S.votes.add(seat); coop.send('vote', { act }); paintVote(); }
  }
  function tally() {
    const need = Math.max(1, coop.humans);
    coop.send('votes', { n: [...S.votes] }, 'all'); paintVote();
    if (S.votes.size >= need && S.votes.has(coop.seat)) restart();
  }
  /** 大家都同意了：主机照自己点的那个按钮重来（开局消息发给大家，客户端跟着重开） */
  function restart() {
    const sec = deadSec(), act = S.hostAct || 'retry';
    const b = sec?.querySelector(act === 'fresh' ? '[data-zh="fresh"]' : `[data-act="${act === 'fresh' ? 'redeploy' : act}"]`) || sec?.querySelector('[data-act="retry"]');
    S.over = false; S.votes.clear(); paintVote();
    S.pass = true; try { if (b) b.click(); else G.game?.start?.({ skipIntro: true }); } finally { S.pass = false; }
  }
  coop.on('over', (msg) => { if (!host()) localOver(msg.why || ''); });
  coop.on('vote', (msg) => { if (host() && S.over && Number.isInteger(msg.f)) { S.votes.add(msg.f); tally(); } });
  coop.on('votes', (msg) => { if (!host() && Array.isArray(msg.n)) { S.votes = new Set(msg.n); paintVote(); } });
  // 新的一局（主机重开、读档）：结束、投票都清掉
  G.events?.on?.('coop:start', () => { S.over = false; S.votes.clear(); S.boardSent = false; paintVote(); if (self.down) getUp(true); });
  G.events?.on?.('coop:peer', () => { if (host() && S.over) tally(); paintVote(); });

  // ---- 登机：谁走到登机门都算，主机让大家一起上（倒着的扶起来带上）----
  coop.boardHook = () => {
    if ((S.boardT -= 1) > 0) return; S.boardT = 30;
    coop.send('boardReq', {}); say('叫大家登机……', 1.5);
  };
  coop.on('boardReq', () => { if (host() && director?.phase === 'none' && G.level?.extraction) director.board?.(); });
  coop.on('boardAll', (msg) => { // （不叫 board：coop.js 自己会发一个本地的 board 事件）
    if (host() || director?.phase !== 'none') return;
    if (siege) siege.twin = !!msg.twin;
    setCrew(!!msg.twin);
    director.board?.();
  });
  function reviveAll() {
    if (self.down) getUp(true);
    for (const m of squad?.everyone || []) if (m.down && !m.member?.guest) m.getUp?.(R.revive.hp, true);
  }
  /** 坐哪、装不装右舷那挺：飞起来以后不改 */
  function setCrew(multi) {
    const c = director?.crew; if (!c || director.riding) return;
    c.seat = seatOf(local(), multi); c.twin = multi; c.follow = coop.mode === 'client';
    if (multi) director.ensureGun2?.();
  }

  // ---- 坐飞机时同步：两挺机枪、机舱里的人、飞到第几秒、返航 / 炸楼 ----
  const gunOf = (side) => (side === 'right' ? director?.doorGun2 : director?.doorGun);
  const pack = (a) => [Math.round(a.yaw * 100), Math.round(a.pitch * 100), a.firing ? 1 : 0];
  const unpack = (v) => (Array.isArray(v) ? { yaw: v[0] / 100, pitch: v[1] / 100, firing: !!v[2] } : null);
  /** 这台机器上的你这一帧在飞机上干什么：[座位编号, 枪 yaw, 枪 pitch, 开火, 机舱 x, 机舱 z, 朝向]（×100） */
  function myCrew() {
    const c = director?.crew; if (!c || !director.riding) return undefined;
    const g = c.seat === 'cabin' ? null : gunOf(c.seat), a = g?.aim || { yaw: 0, pitch: 0, firing: false };
    return [['left', 'right', 'cabin'].indexOf(c.seat), Math.round(a.yaw * 100), Math.round(a.pitch * 100), a.firing ? 1 : 0, Math.round(c.cab.x * 100), Math.round(c.cab.z * 100), Math.round(((G.player?.yaw || 0) + Math.PI) * 100)];
  }
  coop.extendInput('crew', { write: myCrew, read: (seat, v) => { if (Array.isArray(v)) S.crewIn.set(seat, { v, t: G.time?.t || 0 }); } });
  coop.extend('crew', {
    write() {
      if (!director?.riding || !active()) return undefined;
      const out = { t: +(director.rideT || 0).toFixed(3), tw: !!director.crew?.twin, vhp: Math.round(director.state?.vhp ?? 100), fl: siege?.flightOut?.() || null, c: {} };
      // 每个座位上的真人：主机自己的照自己，别人的照他报的
      for (const p of players()) {
        if (!p.human) continue;
        const v = p.me ? myCrew() : S.crewIn.get(p.seat)?.v;
        if (v) out.c[p.role] = v;
      }
      return out;
    },
    read(v) {
      if (!v || coop.mode !== 'client') return;
      S.hostRide = { t: v.t, at: G.time?.t || 0 };
      const c = director?.crew; if (!c) return;
      S.crewOut = v.c || {};
      if (director.state && Number.isFinite(v.vhp)) director.state.vhp = Math.min(director.state.vhp ?? 100, v.vhp);
      if (v.fl) siege?.flightApply?.(v.fl);
    },
  });
  /** 别人那挺枪朝哪、机舱里的人站哪（主机：照收到的；客户端：照快照） */
  function crewOf(role) {
    if (host()) { const p = players().find((q) => q.role === role); return p && !p.me ? S.crewIn.get(p.seat)?.v || null : null; }
    return S.crewOut?.[role] || null;
  }
  function rideTick(dt) {
    const c = director?.crew; if (!c) return;
    // 客户端：飞机照主机的时刻飞（rideT 每帧往前推；快照来了就对一下）
    if (coop.mode === 'client' && S.hostRide) c.hostT = S.hostRide.t + ((G.time?.t || 0) - S.hostRide.at); else c.hostT = null;
    const multi = !!c.twin;
    c.guns.left = null; c.guns.right = null;
    const vv = director.vehicles?.heli; if (!vv || director.rideKind !== 'helicopter') return;
    for (const role of ROLES) {
      if (role === local()) continue;
      const p = players().find((q) => q.role === role), v = p?.human ? crewOf(role) : null, m = squad?.byId(role);
      if (!v) { if (m && director.riding) m.root.visible = false; continue; }
      const seat = ['left', 'right', 'cabin'][v[0]] || seatOf(role, multi);
      if (seat === 'left' || seat === 'right') c.guns[seat] = unpack(v.slice(1, 4));
      // 别人眼里的他：机枪手站在自己那挺枪后面、朝舱门外；机舱里那个照他报的位置和朝向
      if (!m) continue;
      const [lx, lz] = seat === 'cabin' ? [v[4] / 100, v[5] / 100] : R.gunner[seat];
      vv.toWorld([lx, R.cabinFloor, lz], tmp); m.pos.copy(tmp);
      const hy = director.state?.pose?.yaw || 0;
      m.yaw = seat === 'cabin' ? v[6] / 100 : hy + (seat === 'left' ? Math.PI / 2 : -Math.PI / 2);
      m.pitch = seat === 'cabin' ? 0 : -(v[2] || 0) / 100; m.speed = 0; m.down = false; m.fallK = 0; m.lowReady = 0;
      m.root.visible = true;
      try { m.pose?.(dt); } catch { /* 摆不了就算了 */ }
    }
  }

  // ---- 角色的本事 ----
  function loadoutTick() {
    if (!active() || S.smgGiven || R.loadout[local()] !== 'smg' || !siege?.plan) return;
    if (!(siege.state.stage > siege.plan.armsStage)) return;
    if (G.weapon?.owns?.smg) { S.smgGiven = true; return; }
    if (G.weapon?.grant?.('smg', { equip: false })) { S.smgGiven = true; say(`阿哲的冲锋枪也带上了 · ${G.input?.touch ? '点换枪键切换' : '按 4 换'}`, 3); }
  }

  // ---- 倒地提示条（主机上的你）----
  let downEl = null;
  function paintDown() {
    if (!ui || typeof document === 'undefined') return;
    const on = host() && self.down && G.game?.state === 'playing';
    if (!downEl && !on) return;
    if (!downEl) { downEl = document.createElement('div'); downEl.className = 'jm-coop-down'; downEl.innerHTML = '<span></span><i><b></b></i>'; (ui.querySelector('.hud') || ui).appendChild(downEl); }
    downEl.hidden = !on; if (!on) return;
    downEl.firstChild.textContent = self.revive > 0.02 ? '正在被扶起来…' : '你倒下了 · 等队友过来扶';
    downEl.querySelector('b').style.width = `${Math.round(self.revive * 100)}%`;
  }

  const api = {
    get active() { return active(); }, state: S,
    /** 阵亡页上点了重来（act：retry / redeploy / fresh）：和点按钮一样算一票（测试、脚本用） */
    vote(act = 'retry') { if (S.over && coop.inRoom) vote(coop.seat, act); },
    pre(dt) {
      const on = active();
      // 房间里不止一个真人：守屋顶加量、两挺机枪、真人林医生扶人快
      if (siege) { siege.holdBoost = on ? R.hold : null; siege.twin = on; }
      if (squad) squad.net.medicMul = on ? R.medicMul : 1;
      if (!director?.riding) setCrew(on);
      if (on !== S.wasActive) { S.wasActive = on; if (!on && self.down) getUp(true); } // 只剩你一个了：倒着的直接起来（单人时没人扶）
      if (coop.round !== S.lastRound) { S.lastRound = coop.round; S.smgGiven = false; }
      // 重新开打（阵亡页上重来、新的一局）：结束、投票、倒地都清掉
      const st = G.game?.state;
      if (st !== S.prevState) { if (st === 'playing' && S.prevState && S.prevState !== 'paused') { S.over = false; S.votes.clear(); S.boardSent = false; S.hostRide = null; S.crewIn.clear(); paintVote(); if (self.down) getUp(true); } S.prevState = st; }
      if (!on) { if (ui) ui.classList.toggle('jm-cabin', false); paintDown(); return; }
      const playing = G.game?.state === 'playing';
      if (host() && playing) {
        if (self.down) {
          freeze();
          self.revive = reviveStep(self.revive, dt, selfHelpers());
          if (self.revive >= 1) getUp();
          else if ((S.downSay -= dt) <= 0) { S.downSay = R.revive.say; say(self.revive > 0.02 ? '正在扶你起来……' : '你倒下了——等队友过来，站到你跟前三秒把你扶起来', R.revive.say); }
        }
        // 三个都倒下了：过一会儿整个房间结束
        if (!director?.riding && !S.over && allDown(states())) { if ((S.overT += dt) >= R.over.delay) roomOver('down'); } else S.overT = 0;
        // 有人走到登机门了（主机自己、或者客户端请的）：倒着的扶起来，叫大家一起上
        if (director?.phase === 'board' && !S.boardSent) { S.boardSent = true; reviveAll(); coop.send('boardAll', { twin: !!director.crew?.twin }, 'all'); }
        if (director?.phase === 'none') S.boardSent = false;
      }
      if (coop.mode === 'client' && coop.down && playing) freeze();
      loadoutTick();
      if (director?.riding) rideTick(dt);
      if (ui) ui.classList.toggle('jm-cabin', !!director?.riding && director.crew?.seat === 'cabin');
      paintDown();
    },
    post() {
      // 倒着的你（主机）：原地不动（玩家更新挪过的挪回来）
      if (host() && self.down && G.player) { G.player.pos.copy(S.downPos); G.player.vel?.set?.(0, 0, 0); }
    },
    dispose() {
      if (typeof document !== 'undefined') document.removeEventListener('click', onClick, true);
      if (G.player && baseDamage) G.player.damage = baseDamage;
      delete G.rewardMul; voteEl?.remove(); lobbyBtn?.remove(); downEl?.remove(); coop.boardHook = null;
    },
  };
  return api;
}
