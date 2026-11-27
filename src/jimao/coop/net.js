// 丧尸围城联机：连房间服务器（cloud/rooms/，Cloudflare Worker + Durable Object）的那一层。只管连、收、发、统计流量。
// 服务器地址：网址 ?mp=<ws(s):// 或 http(s):// 地址> > 本机存的（localStorage jimao-mp-server）> 本机开发（localhost / 127.0.0.1 时连 wrangler dev 的 8787）> COOP_SERVER.url。
// ?mp=1（封面「联机（三人）」入口、邀请链接都带）只是「进来就打开大厅」，不是地址：照下面的顺序往下找。
// 正式服务器已经部署（见 cloud/rooms/README.md）；连不上时大厅里显示「联机服务器还没上线（连不上）」。

export const COOP_SERVER = Object.freeze({
  // 正式服务器（Cloudflare Worker，已部署；本机开发时 dev 优先，要连正式的用 ?mp=wss://…）
  url: 'wss://yunlan-mall-rooms.45q6mmm655.workers.dev',
  dev: 'ws://127.0.0.1:8787',
  timeout: 6000, // 连多久没连上算失败（毫秒）
  ping: 5000, // 多久发一次心跳（毫秒；服务器直接回 pong，不叫醒房间）
});
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 用哪个服务器：返回 ws(s):// 开头的地址，没有就是 null（还没上线） */
export function serverUrl({ params = {}, loc = globalThis.location, storage = null } = {}) {
  const fix = (u) => { u = String(u || '').trim().replace(/\/+$/, ''); if (!u) return null; if (/^https?:\/\//i.test(u)) u = u.replace(/^http/i, 'ws'); return /^wss?:\/\/[^/\s]/i.test(u) ? u : null; };
  // ?mp= 只有是地址的时候才顶替；mp=1 之类（只是打开大厅）往下找
  const over = params.mp ? fix(params.mp) : null;
  if (over) return over;
  try { const s = storage?.getItem?.('jimao-mp-server'); if (s) return fix(s); } catch { /* 读不了就算了 */ }
  if (loc && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return COOP_SERVER.dev;
  return fix(COOP_SERVER.url);
}
/** 房间码：新建的是六位（32^6 种，不好猜；去掉了 0 / O / 1 / I）；输入时 4–6 位都认（以前的四位码）。规整用户输入的（小写、空格、全角都认） */
export const CODE_LEN = 6;
export function randomCode(rng = Math.random, n = CODE_LEN) { let s = ''; for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(rng() * CODE_CHARS.length)]; return s; }
export function normCode(s) { const c = String(s || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{4,6}$/.test(c) ? c : null; }

/**
 * 连进一个房间。want：'create' / 'join'。返回 { on(type, fn), send(obj), close(), stats, ready }。
 * 事件：welcome（进来了：座位、主机、谁在、开局信息、最近一帧完整快照）、msg（其余消息，原样）、closed（断了：{ code, why }）、fail（没连上：{ why }）
 * why：'offline'（服务器连不上）/ 'full' / 'taken'（房间码被用了）/ 'nope'（没有这个房间）/ 'slow'（猜错房间码太多次，过一分钟再试）/ 'closed'
 */
export function createRoomClient({ url, code, name = '', id = '', want = 'join', WS = globalThis.WebSocket, P = COOP_SERVER } = {}) {
  const handlers = {}, stats = { sent: 0, recv: 0, bytesOut: 0, bytesIn: 0, byType: {}, since: Date.now() };
  const emit = (t, e) => { for (const f of handlers[t] || []) { try { f(e); } catch (err) { console.error('[联机]', t, err); } } };
  let ws = null, opened = false, welcomed = false, done = false, pingT = null, failT = null, why = null;
  const fail = (w) => { if (done) return; done = true; clearInterval(failT); clearInterval(pingT); emit('fail', { why: w }); try { ws?.close(); } catch { /* */ } };
  if (!url || !WS) { setTimeout(() => fail('offline'), 0); }
  else {
    const q = `name=${encodeURIComponent(name)}&want=${want}&id=${encodeURIComponent(id)}`;
    try { ws = new WS(`${url}/room/${code}?${q}`); } catch { setTimeout(() => fail('offline'), 0); }
  }
  if (ws) {
    // 这么久还没连上才算服务器不在。按「每秒数一下」数：页面忙着加载、主线程卡住十几秒的时候只算一下，
    // 不会因为卡住期间计时到了、连上的消息还排在后面，就把其实已经连上的连接当成连不上（中途加入时刚加载完最容易这样）。连上了只是欢迎消息还没到就接着等
    let ticks = 0;
    failT = setInterval(() => { if (opened || welcomed) { clearInterval(failT); return; } if (++ticks >= P.timeout / 1000) fail('offline'); }, 1000);
    ws.onopen = () => { opened = true; pingT = setInterval(() => { try { ws.send('ping'); } catch { /* */ } }, P.ping); };
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : ''; if (!text || text === 'pong') return;
      stats.recv++; stats.bytesIn += text.length;
      let msg; try { msg = JSON.parse(text); } catch { return; }
      (stats.byType[msg.t] ||= { n: 0, bytes: 0, dir: 'in' }); stats.byType[msg.t].n++; stats.byType[msg.t].bytes += text.length;
      if (msg.t === 'full' || msg.t === 'taken' || msg.t === 'nope' || msg.t === 'slow') { why = msg.t; return; }
      if (msg.t === 'welcome') { welcomed = true; clearInterval(failT); emit('welcome', msg); return; }
      emit('msg', msg);
    };
    ws.onerror = () => { if (!opened) fail('offline'); };
    ws.onclose = (ev) => { clearInterval(pingT); clearInterval(failT); if (!welcomed) { fail(why || (opened ? 'closed' : 'offline')); return; } if (!done) { done = true; emit('closed', { code: ev.code, why: ev.reason || 'closed' }); } };
  }
  return {
    on(t, f) { (handlers[t] ||= []).push(f); return this; },
    send(obj) {
      if (!ws || ws.readyState !== 1) return false;
      const text = JSON.stringify(obj); ws.send(text);
      stats.sent++; stats.bytesOut += text.length; const k = `>${obj.t}`; (stats.byType[k] ||= { n: 0, bytes: 0, dir: 'out' }); stats.byType[k].n++; stats.byType[k].bytes += text.length;
      return true;
    },
    close() { done = true; clearInterval(pingT); clearInterval(failT); try { ws?.close(1000, 'leave'); } catch { /* */ } },
    stats, get ready() { return !!ws && ws.readyState === 1 && welcomed; },
  };
}
