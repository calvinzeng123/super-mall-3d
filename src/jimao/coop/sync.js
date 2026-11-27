// 丧尸围城联机的同步层（纯逻辑，不碰 three.js、不碰网络）：快照怎么压缩、增量怎么算、客户端怎么插值。
// 主机每秒发 NET.snapHz 次快照：离任何一个真人 NET.near 米内的丧尸、四个人物（主角、阿哲、林医生、小许）、关卡状态、这段时间的事件。
// 丧尸只发变了的（位置挪了 5 厘米、换了动作、血变了），每 NET.keyEvery 秒发一帧完整的（服务器留着给中途加入的人）。
// 客户端把每个东西的快照按主机时间排成一串，画面落后 NET.delay 秒插值（网络抖一下也平滑），断了最多往前推 NET.extrap 秒。

/**
 * snapHz / inputHz：主机快照、客户端操作每秒发几次；keyEvery：几秒一帧完整快照；near：离真人多远以内的丧尸才发；
 * delay：客户端画面比主机晚多少秒（插值用）；extrap：快照断了最多往前推几秒；q：位置的量化（每米几格，20 = 5 厘米）；
 * claim：一次命中最多算多少伤害（榴弹 230、斧子 200），每包最多 claimPack；claimRange：离自己多远的丧尸才认（米）。
 * rideNear / rideRange：坐直升机清扫时（楼顶、阳台、楼下的离飞机一百多米）快照发多远以内的丧尸、命中认多远（从机身中心量）。
 */
export const NET = Object.freeze({
  snapHz: 12, inputHz: 15, keyEvery: 2, near: 55, delay: 0.12, extrap: 0.25, q: 20,
  claim: 400, claimPack: 1600, claimRange: 90, hitsPerPack: 24, rideNear: 170, rideRange: 200,
});
/** 座位 → 扮演的角色：0 主角（单人时的你）、1 阿哲、2 林医生；小许不是座位，是被救出来的人 */
export const ROLES = Object.freeze(['lead', 'zhe', 'lin']);
export const CHARS = Object.freeze(['lead', 'zhe', 'lin', 'xu']);
export const KIND_CODES = Object.freeze(['walker', 'runner', 'bloater', 'screamer', 'lunger', 'spitter', 'brute']);
export const ZS_CODES = Object.freeze(['idle', 'chase', 'attack', 'scream', 'crouch', 'leap', 'pin']);
export const PART_CODES = Object.freeze(['body', 'weak']);
export const WEAPON_CODES = Object.freeze(['knife', 'pistol', 'rifle', 'smg', 'launcher', 'axe']);
/** 投掷物（手雷、燃烧瓶、诱饵弹、榴弹枪的榴弹）：联机事件里的编号 */
export const THROW_CODES = Object.freeze(['frag', 'fire', 'lure', 'shell']);
/** 一下子的动作（事件）：扔东西 / 榴弹出膛、挥刀 */
export const EV_CODES = Object.freeze(['throw', 'swing']);
/**
 * 事件的上限：nadeSpeed 扔出去 / 打出去最快多少米每秒（榴弹 44 + 人在跑）、nadeReach 离扔的人多远以内出手（米）、nadeFuse 引信最长几秒；
 * nadeRate / nadeBurst：主机那边每个座位每秒认几颗、最多攒几颗（榴弹枪 0.35 秒一发、手雷 0.8 秒一颗）；perPack：一包最多几条事件
 */
export const EVT = Object.freeze({ nadeSpeed: 60, nadeReach: 4, nadeFuse: 12, nadeRate: 3, nadeBurst: 4, perPack: 8 });

const TAU = Math.PI * 2;
export const qp = (v, q = NET.q) => Math.round(v * q);
export const dp = (n, q = NET.q) => n / q;
export const qa = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 256) & 255;
export const da = (n) => { const a = n / 256 * TAU; return a > Math.PI ? a - TAU : a; };
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const lerp = (a, b, k) => a + (b - a) * k;
const lerpA = (a, b, k) => a + wrap(b - a) * k;

/** 一个可以复现的随机数（主机发种子，所有人抽到同一局关卡）：mulberry32 */
export function seededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---- 丧尸 ----
// [池子编号, 第几回出场, 种类, x, y, z, 朝向, 动作, 血（0–255）, 标记, 扑咬幅度（0–10）]；标记：1 活着、2 钉在原地（阳台）、4 清扫目标、8 守点
export function encodeZombie(z, idx) {
  const hp = z.maxHp ? Math.max(0, Math.min(255, Math.round(z.hp / z.maxHp * 255))) : 0;
  const flags = (z.alive ? 1 : 0) | (z.fixed ? 2 : 0) | (z.sweep ? 4 : 0) | (z.post ? 8 : 0);
  return [idx, z.gen | 0, Math.max(0, KIND_CODES.indexOf(z.kind)), qp(z.pos.x), qp(z.pos.y), qp(z.pos.z), qa(z.yaw || 0), Math.max(0, ZS_CODES.indexOf(z.zs)), hp, flags, Math.round(Math.max(0, Math.min(1, z.lunge || 0)) * 10)];
}
export function decodeZombie(a) {
  return { idx: a[0], gen: a[1], kind: KIND_CODES[a[2]] || 'walker', x: dp(a[3]), y: dp(a[4]), z: dp(a[5]), yaw: da(a[6]), zs: ZS_CODES[a[7]] || 'chase', hp: a[8] / 255, alive: !!(a[9] & 1), fixed: !!(a[9] & 2), sweep: !!(a[9] & 4), post: !!(a[9] & 8), lunge: (a[10] || 0) / 10 };
}
// ---- 人物（主角、阿哲、林医生、小许）----
// [角色编号, x, y, z, 朝向, 俯仰（×100）, 速度（×10）, 标记, 血, 扶起进度（0–100）, 武器]；标记：1 倒地、2 在场、4 蹲着、8 在包扎、16 真人在操控、32 冲刺、64 在换弹
export function encodeChar(c) {
  const flags = (c.down ? 1 : 0) | (c.on ? 2 : 0) | (c.crouch ? 4 : 0) | (c.healing ? 8 : 0) | (c.human ? 16 : 0) | (c.sprint ? 32 : 0) | (c.reload ? 64 : 0);
  return [Math.max(0, CHARS.indexOf(c.role)), qp(c.x), qp(c.y), qp(c.z), qa(c.yaw || 0), Math.round((c.pitch || 0) * 100), Math.round(Math.min(25, c.speed || 0) * 10), flags, Math.max(0, Math.round(c.hp || 0)), Math.round(Math.max(0, Math.min(1, c.revive || 0)) * 100), Math.max(0, WEAPON_CODES.indexOf(c.weapon || 'rifle'))];
}
export function decodeChar(a) {
  return { role: CHARS[a[0]] || 'lead', x: dp(a[1]), y: dp(a[2]), z: dp(a[3]), yaw: da(a[4]), pitch: a[5] / 100, speed: a[6] / 10, down: !!(a[7] & 1), on: !!(a[7] & 2), crouch: !!(a[7] & 4), healing: !!(a[7] & 8), human: !!(a[7] & 16), sprint: !!(a[7] & 32), reload: !!(a[7] & 64), hp: a[8], revive: a[9] / 100, weapon: WEAPON_CODES[a[10]] || 'rifle' };
}
// ---- 客户端的操作 ----
// p：[x, y, z, 朝向, 俯仰（×100）, 速度（×10）, 标记（4 蹲着、8 在包扎 / 吃药、32 冲刺、64 在换弹）, 武器]
export function encodeInput(s) {
  return [qp(s.x), qp(s.y), qp(s.z), qa(s.yaw || 0), Math.round((s.pitch || 0) * 100), Math.round(Math.min(25, s.speed || 0) * 10), (s.crouch ? 4 : 0) | (s.healing ? 8 : 0) | (s.sprint ? 32 : 0) | (s.reload ? 64 : 0), Math.max(0, WEAPON_CODES.indexOf(s.weapon || 'rifle'))];
}
export function decodeInput(a) {
  if (!Array.isArray(a) || a.length < 8 || !a.slice(0, 7).every(Number.isFinite)) return null;
  return { x: dp(a[0]), y: dp(a[1]), z: dp(a[2]), yaw: da(a[3]), pitch: Math.max(-1.6, Math.min(1.6, a[4] / 100)), speed: a[5] / 10, crouch: !!(a[6] & 4), healing: !!(a[6] & 8), sprint: !!(a[6] & 32), reload: !!(a[6] & 64), weapon: WEAPON_CODES[a[7]] || 'rifle' };
}

// ---- 事件（一下子的动作）----
// 扔东西：[0, 角色, 种类, x, y, z（出手的地方，×20）, vx, vy, vz（×20，米每秒）, 引信（×100 秒）]；挥刀：[1, 角色]
// 客户端发给主机时「角色」那一位不算数（主机按座位填）；主机转给大家时填上是谁
export function encodeEvent(e) {
  const role = Math.max(0, CHARS.indexOf(e.role || 'lead'));
  if (e.type === 'throw') return [0, role, Math.max(0, THROW_CODES.indexOf(e.kind || 'frag')), qp(e.pos.x), qp(e.pos.y), qp(e.pos.z), qp(e.vel.x), qp(e.vel.y), qp(e.vel.z), Math.round(Math.max(0, e.fuse || 0) * 100)];
  if (e.type === 'swing') return [1, role];
  return null;
}
export function decodeEvent(a) {
  if (!Array.isArray(a) || a.length < 2 || !Number.isInteger(a[0]) || !Number.isInteger(a[1])) return null;
  const type = EV_CODES[a[0]], role = CHARS[a[1]]; if (!type || !role) return null;
  if (type === 'swing') return { type, role };
  if (a.length < 10 || !a.slice(2, 10).every(Number.isFinite)) return null;
  const kind = THROW_CODES[a[2]]; if (!kind) return null;
  return { type, role, kind, pos: { x: dp(a[3]), y: dp(a[4]), z: dp(a[5]) }, vel: { x: dp(a[6]), y: dp(a[7]), z: dp(a[8]) }, fuse: a[9] / 100 };
}
/**
 * 主机核对客户端报的一颗投掷物：出手的地方离他（from）不远、速度不离谱、引信不离谱。通过返回 true。
 * 次数另算（coop.js 里每个座位一个令牌桶：EVT.nadeRate / nadeBurst）
 */
export function validThrow(e, from, { reach = EVT.nadeReach, speed = EVT.nadeSpeed, fuse = EVT.nadeFuse } = {}) {
  if (!e || e.type !== 'throw') return false;
  const v = Math.hypot(e.vel.x, e.vel.y, e.vel.z);
  if (!(v <= speed) || !(e.fuse > 0 && e.fuse <= fuse)) return false;
  if (from && !(Math.hypot(e.pos.x - from.x, e.pos.y - from.y - 1.2, e.pos.z - from.z) <= reach)) return false;
  return true;
}

/**
 * 主机这边：算这一帧要发什么。entries：[[编号, 数组], ...]（丧尸，已经按离真人远近筛过）；
 * 返回 { z: 变了的, rm: 不发了的编号, k: 完整帧? }。完整帧把全部都放进 z、rm 为空（客户端收到完整帧：不在里面的都收起来）
 */
export function createDeltaWriter({ keyEvery = NET.keyEvery } = {}) {
  let sent = new Map(), keyT = Infinity;
  return {
    write(dt, entries, force = false) {
      keyT += dt;
      const key = force || keyT >= keyEvery, next = new Map(), z = [], rm = [];
      for (const [id, arr] of entries) {
        const sig = arr.join(',');
        next.set(id, sig);
        if (key || sent.get(id) !== sig) z.push(arr);
      }
      if (!key) for (const id of sent.keys()) if (!next.has(id)) rm.push(id);
      sent = next; if (key) keyT = 0;
      return { z, rm, k: key ? 1 : 0 };
    },
    /** 有人中途进来：下一帧发完整的 */
    keyNow() { keyT = Infinity; },
    get size() { return sent.size; },
  };
}

/**
 * 客户端这边的主机时钟：hostT 是快照里带的主机时间，localT 是自己的游戏时间。
 * 估一个偏移（收到得早的那几次最准：网络慢的时候估出来的偏小，往上慢慢靠），画面时间 = 自己的时间 + 偏移 − delay
 */
export function createNetClock({ delay = NET.delay } = {}) {
  let off = null;
  return {
    sample(hostT, localT) {
      const o = hostT - localT;
      if (off === null || Math.abs(o - off) > 2) off = o; // 第一次、或者差得太远（主机暂停过 / 掉线又连上）：直接对齐
      else if (o > off) off = o; // 来得比估的早：说明之前估慢了，马上跟上
      else off += (o - off) * 0.02; // 来得晚（网络抖）：慢慢往下靠
      return off;
    },
    renderT(localT) { return off === null ? null : localT + off - delay; },
    get offset() { return off; },
    reset() { off = null; },
  };
}

/**
 * 一个东西的插值缓冲：按主机时间放快照里的状态（{ x, y, z, yaw, ... }），取任意时刻的样子。
 * 两帧之间线性插值（朝向走近的那边）；在最后一帧之后按最后两帧的速度最多往前推 extrap 秒，再往后停住；在第一帧之前就是第一帧。
 */
export function createInterp({ max = 12, extrap = NET.extrap } = {}) {
  const buf = [];
  return {
    push(t, s) {
      if (buf.length && t <= buf[buf.length - 1].t) { if (t === buf[buf.length - 1].t) buf[buf.length - 1].s = s; else return; }
      else buf.push({ t, s });
      while (buf.length > max) buf.shift();
    },
    /** 直接跳到这个状态（刚出场、换了一回出场、传送） */
    reset(t, s) { buf.length = 0; buf.push({ t, s }); },
    sample(t, out = {}) {
      if (!buf.length) return null;
      let a = buf[0], b = null;
      if (t <= a.t) return Object.assign(out, a.s);
      for (let i = buf.length - 1; i >= 0; i--) if (buf[i].t <= t) { a = buf[i]; b = buf[i + 1] || null; break; }
      if (b) {
        const k = (t - a.t) / (b.t - a.t || 1);
        Object.assign(out, k < 0.5 ? a.s : b.s); // 离散的字段（动作、标记）取近的那一帧
        out.x = lerp(a.s.x, b.s.x, k); out.y = lerp(a.s.y, b.s.y, k); out.z = lerp(a.s.z, b.s.z, k);
        if (a.s.yaw !== undefined) out.yaw = lerpA(a.s.yaw, b.s.yaw, k);
        if (a.s.pitch !== undefined) out.pitch = lerp(a.s.pitch, b.s.pitch, k);
        return out;
      }
      // 最后一帧之后：最后两帧的速度往前推一小段（跳得太远的——传送、换层——不推）
      Object.assign(out, a.s);
      const p = buf[buf.length - 2];
      if (p && a.t > p.t) {
        const h = Math.min(t - a.t, extrap), dt = a.t - p.t, vx = (a.s.x - p.s.x) / dt, vz = (a.s.z - p.s.z) / dt;
        if (Math.hypot(vx, vz) < 12 && Math.abs(a.s.y - p.s.y) < 0.5) { out.x = a.s.x + vx * h; out.z = a.s.z + vz * h; }
      }
      return out;
    },
    get last() { return buf.length ? buf[buf.length - 1] : null; },
    get length() { return buf.length; },
    clear() { buf.length = 0; },
  };
}

/**
 * 客户端的镜像：把主机的快照收进来，记下每只丧尸、每个人物该在哪。不碰游戏对象——coop.js 每帧按它摆木偶。
 * msg.ht 是主机时间（秒）。ingest(msg, localT) 返回这一帧要处理的变化：{ spawn: [编号]（新出场 / 换了一回出场）, gone: [编号]（收起来）, kills: [[编号, 回, 谁打的, 部位]] }
 */
export function createMirror({ clock = createNetClock() } = {}) {
  const zombies = new Map(), chars = new Map();
  let hostT = 0, keyed = false;
  const M = {
    clock, zombies, chars,
    get keyed() { return keyed; }, get hostT() { return hostT; },
    ingest(msg, localT) {
      const out = { spawn: [], gone: [], kills: [], key: !!msg.k };
      if (!keyed && !msg.k) return out; // 还没收到完整帧：增量对不上，先不要
      if (msg.k) keyed = true;
      const T = msg.ht; hostT = T; clock.sample(T, localT);
      const seen = msg.k ? new Set() : null;
      for (const a of msg.z || []) {
        const d = decodeZombie(a); seen?.add(d.idx);
        let e = zombies.get(d.idx);
        if (!e || e.gen !== d.gen) { e = { idx: d.idx, gen: d.gen, buf: createInterp(), st: d }; zombies.set(d.idx, e); e.buf.reset(T, d); out.spawn.push(d.idx); }
        else { e.st = d; e.buf.push(T, d); }
      }
      const drop = (idx) => { if (zombies.delete(idx)) out.gone.push(idx); };
      for (const idx of msg.rm || []) drop(idx);
      if (seen) for (const idx of [...zombies.keys()]) if (!seen.has(idx)) drop(idx);
      for (const a of msg.c || []) {
        const d = decodeChar(a); let e = chars.get(d.role);
        if (!e) { e = { role: d.role, buf: createInterp(), st: d }; chars.set(d.role, e); e.buf.reset(T, d); }
        else { if (Math.hypot(d.x - e.st.x, d.z - e.st.z) > 6 || Math.abs(d.y - e.st.y) > 2) e.buf.reset(T, d); else e.buf.push(T, d); e.st = d; }
      }
      for (const k of msg.kill || []) out.kills.push(k);
      return out;
    },
    /** 这一帧画面上丧尸 idx 该在哪（插值好的） */
    zombieAt(idx, localT, out = {}) { const e = zombies.get(idx); if (!e) return null; const t = clock.renderT(localT); return t === null ? Object.assign(out, e.st) : e.buf.sample(t, out); },
    charAt(role, localT, out = {}) { const e = chars.get(role); if (!e) return null; const t = clock.renderT(localT); return t === null ? Object.assign(out, e.st) : e.buf.sample(t, out); },
    reset() { zombies.clear(); chars.clear(); keyed = false; clock.reset(); },
  };
  return M;
}

/**
 * 主机核对客户端报的命中：那只丧尸还在（同一回出场、活着），离报的人不太远，伤害在合理范围里，一包里总伤害有上限。
 * hits：[[编号, 回, 伤害, 部位], ...]；get(idx) 拿丧尸；from：报的人站在哪。返回通过的 [{ z, damage, part }]
 */
export function validateHits(hits, get, from, { cap = NET.claim, pack = NET.claimPack, range = NET.claimRange, max = NET.hitsPerPack } = {}) {
  const ok = []; let total = 0;
  if (!Array.isArray(hits)) return ok;
  for (const h of hits.slice(0, max)) {
    if (!Array.isArray(h) || h.length < 3) continue;
    const [idx, gen, dmg, part] = h, z = get(idx);
    if (!z || !z.active || !z.alive || (z.gen | 0) !== gen || !(dmg > 0)) continue;
    if (from && Math.hypot(z.pos.x - from.x, z.pos.y - from.y, z.pos.z - from.z) > range) continue;
    const d = Math.min(cap, dmg); if (total + d > pack) break;
    total += d; ok.push({ z, damage: d, part: PART_CODES[part] || 'body' });
  }
  return ok;
}
