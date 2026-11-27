// 丧尸围城联机服务器：Cloudflare Worker + Durable Object（每个房间码一个 DO 实例，WebSocket 休眠接口）。
// 入口：GET /room/<房间码>?name=<昵称>&want=create|join&id=<本机随机 id>  （升级成 WebSocket）
//       GET /health  → ok
// 房间逻辑在 room-core.js（node 测试也用它）。部署见 README.md。
// 猜房间码：同一个 IP 一分钟里加入不存在的房间（nope）超过 JOIN_LIMIT.max 次，这一分钟里再加入直接回 slow（尽力而为：记在这个 Worker 实例的内存里）。
import { createRoomCore, ROOM } from './room-core.js';

export const JOIN_LIMIT = Object.freeze({ max: 20, windowMs: 60_000, keep: 5000 });

/** 按 IP 记「加入了不存在的房间」几次：fail(ip) 记一次，blocked(ip) 这一分钟里还能不能再试 */
export function createJoinLimiter({ P = JOIN_LIMIT, now = () => Date.now() } = {}) {
  const map = new Map(); // ip → { n, t0 }
  const rec = (ip) => { const t = now(); let r = map.get(ip); if (!r || t - r.t0 >= P.windowMs) { r = { n: 0, t0: t }; map.set(ip, r); } return r; };
  return {
    blocked(ip) { if (!ip) return false; const r = map.get(ip); return !!r && now() - r.t0 < P.windowMs && r.n >= P.max; },
    fail(ip) {
      if (!ip) return;
      if (map.size > P.keep) { const t = now(); for (const [k, r] of map) if (t - r.t0 >= P.windowMs) map.delete(k); if (map.size > P.keep) map.clear(); }
      rec(ip).n++;
    },
    get size() { return map.size; },
  };
}
const limiter = createJoinLimiter();
/** 不进房间、直接回一句（slow）就关：客户端按它显示「试得太多了」 */
function reply(t, code, why) {
  const pair = new WebSocketPair(), [client, server] = Object.values(pair);
  server.accept(); server.send(JSON.stringify({ t })); server.close(code, why);
  return new Response(null, { status: 101, webSocket: client });
}

/** 允许哪些页面连进来：正式站、它的预览分支、本机开发（任何端口） */
export function originAllowed(origin, extra = '') {
  if (!origin) return false;
  let u; try { u = new URL(origin); } catch { return false; }
  const h = u.hostname;
  if (u.protocol === 'https:' && (h === 'yunlan-mall.pages.dev' || h.endsWith('.yunlan-mall.pages.dev'))) return true;
  if ((u.protocol === 'http:' || u.protocol === 'https:') && (h === 'localhost' || h === '127.0.0.1' || h === '[::1]')) return true;
  return String(extra || '').split(',').map((s) => s.trim()).filter(Boolean).includes(u.origin);
}

export default {
  async fetch(request, env, _ctx, L = limiter) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,6})$/);
    if (!m) return new Response('not found', { status: 404 });
    const code = m[1].toUpperCase();
    if (!ROOM.code.test(code)) return new Response('bad room code', { status: 400 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!originAllowed(request.headers.get('Origin'), env.EXTRA_ORIGINS)) return new Response('origin not allowed', { status: 403 });
    const ip = request.headers.get('CF-Connecting-IP') || '', joining = url.searchParams.get('want') !== 'create';
    if (joining && L.blocked(ip)) return reply('slow', 4029, 'slow');
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(request);
    if (res?.headers?.get?.('X-Room-Join') === 'nope') L.fail(ip); // 房间里没人：猜错了一次
    return res;
  },
};

/** 一个房间。连接上存着（serializeAttachment）座位、名字、主机标记、开局信息：DO 休眠醒来按它们重新摆好 */
export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.core = null;
    // 心跳不叫醒 DO：客户端发 "ping"，运行时直接回 "pong"
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch { /* 本地老版本没有这个接口 */ }
  }
  conn(ws) {
    return { ws, send: (t) => ws.send(t), close: (code, why) => { try { ws.close(code, why); } catch { /* 已经关了 */ } }, save: (meta) => ws.serializeAttachment(meta) };
  }
  ensure(code) {
    if (this.core) return this.core;
    const core = this.core = createRoomCore({ code, persist: (k, v) => { this.ctx.storage.put(k, v).catch?.(() => {}); } });
    this.conns = new Map();
    // 醒来：每条还开着的连接按存的东西放回座位
    for (const ws of this.ctx.getWebSockets()) {
      let saved = null; try { saved = ws.deserializeAttachment(); } catch { saved = null; }
      const c = this.conn(ws);
      if (core.restore(c, saved)) this.conns.set(ws, c); else c.close(4000, 'stale');
    }
    if (this.conns.size) core.settle();
    return core;
  }
  async fetch(request) {
    const url = new URL(request.url), code = (url.pathname.split('/').pop() || '').toUpperCase();
    const core = this.ensure(code);
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const c = this.conn(server); this.conns.set(server, c);
    const want = ['create', 'join'].includes(url.searchParams.get('want')) ? url.searchParams.get('want') : 'any';
    const before = core.count, seat = core.join(c, { name: url.searchParams.get('name') || '', id: url.searchParams.get('id') || '', want });
    if (seat < 0) this.conns.delete(server);
    // 告诉外面的 Worker 这次是不是加入了一个没人的房间（它按 IP 记次数，防猜房间码）
    const headers = seat < 0 && want === 'join' && before === 0 ? { 'X-Room-Join': 'nope' } : undefined;
    return new Response(null, { status: 101, webSocket: client, headers });
  }
  async webSocketMessage(ws, data) {
    const core = this.ensure(''), c = this.conns.get(ws);
    if (!c) { try { ws.close(4000, 'stale'); } catch { /* */ } return; }
    core.message(c, typeof data === 'string' ? data : null);
  }
  async webSocketClose(ws, code, reason) {
    const core = this.ensure(''), c = this.conns.get(ws);
    if (c) { core.leave(c); this.conns.delete(ws); }
    try { ws.close(code === 1005 ? 1000 : code, reason); } catch { /* 已经关了 */ }
    if (!core.count) await this.ctx.storage.deleteAll().catch(() => {});
  }
  async webSocketError(ws) {
    const core = this.ensure(''), c = this.conns.get(ws);
    if (c) { core.leave(c); this.conns.delete(ws); }
  }
}
