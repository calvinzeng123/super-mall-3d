// 丧尸围城联机的房间逻辑（和 Cloudflare 无关的那一半）：Durable Object（worker.js）和 node 测试都用这一份。
// 一个房间最多 3 人：座位 0 / 1 / 2 = 主角 / 阿哲 / 林医生（角色跟座位走，谁是主机另记）。
// 主机跑整局模拟，别人只发自己的操作；这里只做转发、记座位、记最近一帧完整快照（中途加入的人先拿它），
// 主机走了把下一个人提成主机（没人了房间就散）。消息都是 JSON 文本：
//   客户端 → 服务器：{ t: 'start', ... }（主机开局）、{ t: 's', k?, ... }（主机的快照，k = 完整帧）、
//                     主机发的其余 t（规则消息：over / votes / boardAll ……）：带 to: 'all' / 座位号 的照发；
//                     不是主机的人只能发 ROOM.peer 里那几种（操作、投票、请登机、回血），只发给主机。服务器补上 f（谁发的）。
//                     谁都能发的：name（改昵称）、meta（大厅里的「准备」和自己量的延迟，服务器洗过记在名单上广播）、ping。
//   一下子的动作（扔手雷、挥刀）和开枪都在操作 i 里（ev / sh），只到主机；主机核对后随快照 s 转给大家——客户端发不了快照，冒充不了别人扔的手雷。
//   服务器 → 客户端：welcome / peer / host / full / taken / nope / err / pong / need——这些谁也不能冒充（客户端发来的直接丢掉）。
// conn：{ send(text), close(code, reason), save(meta)（存到连接上，休眠醒来还在） }。

export const ROOM = Object.freeze({
  max: 3,
  code: /^[0-9]{4}$/, // 房间码：4 位数字（手机上弹数字键盘好输；一万个，猜码靠 worker.js 的限流挡）
  name: 16, // 昵称最多几个字
  // 限流：每条连接一个令牌桶（每秒补 rate 个、最多攒 burst 个），超了这条丢掉；丢得太多（drop 条）断开
  rate: 45, burst: 90, drop: 400,
  // 单条消息多大：主机的完整快照最大 host 字节，别人的操作 peer 字节
  size: Object.freeze({ host: 64 * 1024, peer: 8 * 1024 }),
  // 不是主机的人能发哪几种（都只发给主机）：i 操作（位置、开枪、命中、做目标、回血）、vote 投票重来、boardReq 请登机、heal 回血
  peer: Object.freeze(['i', 'vote', 'boardReq', 'heal']),
  // 只有服务器能发的：谁发来的都丢掉（不然别人能冒充「换主机」「有人进来了」）
  server: Object.freeze(['welcome', 'peer', 'host', 'full', 'taken', 'nope', 'slow', 'err', 'pong', 'need']),
  // 大厅名单上的延迟（毫秒，客户端自己量了报上来）最多记多少；只有延迟变了的时候，同一个人隔多久才广播一次（准备 / 取消准备马上广播）
  pingMax: 9999, metaEvery: 3000,
});

const ROLES = ['主角', '阿哲', '林医生'];
export const roleName = (seat) => ROLES[seat] || `座位${seat}`;
/** 昵称规整：去掉控制字符和 < > & 引号，最多 n 个字；空的叫「玩家」（客户端显示别人的名字前也过一遍） */
export const clean = (s, n = ROOM.name) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>&"'`]/g, '').trim().slice(0, n) || '玩家';
const cleanId = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);

/**
 * 建一个房间。now：毫秒时钟（测试里换成假的）；persist(key, value)：要存的东西（开局信息），worker 里写进 DO 存储。
 * 返回 { join, leave, message, restore, players(), state }。
 */
export function createRoomCore({ code = '', now = () => Date.now(), persist = () => {}, P = ROOM } = {}) {
  const seats = new Array(P.max).fill(null); // 每个座位上的连接
  const S = { code, host: -1, started: false, start: null, key: null, keyAt: 0, created: now() };
  const meta = new WeakMap(); // conn → { seat, name, id, host, bucket, last, drops }

  const players = () => seats.map((c, seat) => { if (!c) return null; const m = meta.get(c); return { seat, name: m.name, id: m.id, host: seat === S.host, role: roleName(seat), ready: !!m.ready, ping: m.ping ?? null }; }).filter(Boolean);
  const send = (c, msg) => { try { c.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* 断了的连接：等 close 事件收拾 */ } };
  const all = (msg, except = null) => { const text = JSON.stringify(msg); for (const c of seats) if (c && c !== except) send(c, text); };
  const save = (c) => { const m = meta.get(c); try { c.save?.({ code: S.code, seat: m.seat, name: m.name, id: m.id, host: m.seat === S.host, started: S.started, start: S.start }); } catch { /* 存不了不影响 */ } };
  const saveAll = () => { for (const c of seats) if (c) save(c); };

  /** 来了一个人。want：'create'（建房，房间里要没人）/ 'join'（加入，房间里要有人）/ 'any'。返回座位号，进不来返回 -1 */
  function join(c, { name = '', id = '', want = 'any' } = {}) {
    const n = seats.filter(Boolean).length;
    if (want === 'create' && n > 0) { send(c, { t: 'taken' }); c.close?.(4001, 'taken'); return -1; }
    if (want === 'join' && n === 0) { send(c, { t: 'nope' }); c.close?.(4004, 'nope'); return -1; }
    const seat = seats.indexOf(null);
    if (seat < 0) { send(c, { t: 'full' }); c.close?.(4003, 'full'); return -1; }
    seats[seat] = c;
    meta.set(c, { seat, name: clean(name), id: cleanId(id), tokens: P.burst, last: now(), drops: 0 });
    if (S.host < 0) S.host = seat; // 第一个进来的是主机
    save(c);
    // 中途加入：开局信息和最近一帧完整快照一起给（主机收到 peer join 以后还会马上再发一帧完整的）
    send(c, { t: 'welcome', seat, host: S.host, code: S.code, players: players(), started: S.started, start: S.start, snap: S.started ? S.key : null, keyAge: S.key ? now() - S.keyAt : null });
    all({ t: 'peer', ev: 'join', seat, name: meta.get(c).name, players: players(), host: S.host }, c);
    return seat;
  }

  /** 有人走了（关页面、断线）。主机走了：还有人就把座位号最小的提成主机，没人了房间清空 */
  function leave(c) {
    const m = meta.get(c); if (!m || seats[m.seat] !== c) return;
    seats[m.seat] = null; meta.delete(c);
    const left = seats.filter(Boolean);
    if (!left.length) { Object.assign(S, { host: -1, started: false, start: null, key: null, keyAt: 0 }); persist('start', null); return; }
    let migrated = false;
    if (m.seat === S.host) { S.host = seats.findIndex(Boolean); migrated = true; S.key = null; }
    all({ t: 'peer', ev: 'leave', seat: m.seat, name: m.name, players: players(), host: S.host });
    if (migrated) { all({ t: 'host', seat: S.host, reason: 'migrate' }); saveAll(); }
  }

  /** 令牌桶：这一条放不放行 */
  function allow(m) {
    const t = now(); m.tokens = Math.min(P.burst, m.tokens + (t - m.last) / 1000 * P.rate); m.last = t;
    if (m.tokens < 1) { m.drops++; return false; }
    m.tokens -= 1; return true;
  }

  function message(c, text) {
    const m = meta.get(c); if (!m) return;
    const isHost = m.seat === S.host, cap = isHost ? P.size.host : P.size.peer;
    if (typeof text !== 'string') { send(c, { t: 'err', why: 'binary' }); return; }
    if (text.length > cap) { m.drops++; send(c, { t: 'err', why: 'size' }); if (m.drops > P.drop) c.close?.(1009, 'too big'); return; }
    if (text === 'ping') { send(c, 'pong'); return; }
    if (!allow(m)) { if (m.drops > P.drop) c.close?.(1008, 'rate'); return; }
    let msg; try { msg = JSON.parse(text); } catch { send(c, { t: 'err', why: 'json' }); return; }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return;
    if (P.server.includes(msg.t)) return; // 冒充服务器的
    // 不是主机：只认那几种操作，只发给主机（不许广播、不许点名发给别人）
    if (!isHost && msg.t !== 'ping' && msg.t !== 'name' && msg.t !== 'meta' && !P.peer.includes(msg.t)) return;
    switch (msg.t) {
      case 'ping': send(c, { t: 'pong', c: msg.c ?? 0, s: now() }); return;
      case 'name': { m.name = clean(msg.name); save(c); all({ t: 'peer', ev: 'name', seat: m.seat, name: m.name, players: players(), host: S.host }); return; }
      case 'meta': { // 大厅：准备 / 取消准备（马上广播）、自己量的延迟（变了才记，同一个人隔 metaEvery 毫秒才广播一次）
        const ready = typeof msg.ready === 'boolean' ? msg.ready : m.ready, pingIn = Number(msg.ping);
        const ping = Number.isFinite(pingIn) && pingIn >= 0 ? Math.min(P.pingMax, Math.round(pingIn)) : m.ping;
        const readyChanged = !!ready !== !!m.ready, pingChanged = ping !== m.ping;
        m.ready = !!ready; m.ping = ping ?? null;
        if (readyChanged || (pingChanged && (m.metaAt == null || now() - m.metaAt >= P.metaEvery))) { m.metaAt = now(); all({ t: 'peer', ev: 'meta', seat: m.seat, name: m.name, players: players(), host: S.host }); }
        return;
      }
      case 'start': { // 只有主机能开局：开局信息记下来（种子、哪栋楼……原样转给后来的人）
        if (!isHost) return;
        S.started = true; S.start = msg; S.key = null; persist('start', msg); saveAll();
        for (const o of seats) if (o) meta.get(o).ready = false; // 开打了：大厅里的「准备」清掉（下一局再点）
        all({ t: 'start', ...msg, f: m.seat }, c); return;
      }
      case 'end': { if (!isHost) return; S.started = false; S.start = null; S.key = null; persist('start', null); saveAll(); all({ t: 'end', f: m.seat }, c); return; }
      case 's': { // 主机的快照：照发给别人；完整帧（k）留一份给中途加入的人
        if (!isHost) return;
        if (msg.k) { S.key = text; S.keyAt = now(); }
        for (const o of seats) if (o && o !== c) send(o, text);
        return;
      }
      default: { // 其他消息：主机的照 to 发（'all' 除自己以外的所有人、座位号只发那个人）；别人的只发给主机
        msg.f = m.seat;
        if (!isHost) { delete msg.to; const h = seats[S.host]; if (h) send(h, JSON.stringify(msg)); return; }
        const out = JSON.stringify(msg);
        if (msg.to === 'all') { for (const o of seats) if (o && o !== c) send(o, out); }
        else if (Number.isInteger(msg.to)) { const o = seats[msg.to]; if (o && o !== c) send(o, out); }
      }
    }
  }

  /** 休眠醒来：连接还在，内存没了——按连接上存的座位、名字、主机标记、开局信息重新摆好；最近一帧完整快照没了，叫主机补一帧 */
  function restore(c, saved) {
    if (!saved || !Number.isInteger(saved.seat) || saved.seat < 0 || saved.seat >= P.max || seats[saved.seat]) return false;
    seats[saved.seat] = c; meta.set(c, { seat: saved.seat, name: clean(saved.name), id: cleanId(saved.id), tokens: P.burst, last: now(), drops: 0 });
    if (saved.host) S.host = saved.seat;
    if (!S.code && saved.code) S.code = saved.code;
    if (saved.started) { S.started = true; S.start = saved.start || S.start; }
    return true;
  }
  /** 醒来以后：没有主机标记（不该出现）就挑座位最小的；有主机就请它补一帧完整快照 */
  function settle() {
    if (S.host < 0 || !seats[S.host]) { S.host = seats.findIndex(Boolean); if (S.host >= 0) { all({ t: 'host', seat: S.host, reason: 'restore' }); saveAll(); } }
    if (S.host >= 0 && S.started && !S.key) send(seats[S.host], { t: 'need' });
  }

  return { join, leave, message, restore, settle, players, state: S, get count() { return seats.filter(Boolean).length; } };
}
