var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// room-core.js
var ROOM = Object.freeze({
  max: 3,
  code: /^[A-Z2-9]{4,6}$/,
  // 房间码：4–6 位，去掉了容易看错的 0 / O / 1 / I
  name: 16,
  // 昵称最多几个字
  // 限流：每条连接一个令牌桶（每秒补 rate 个、最多攒 burst 个），超了这条丢掉；丢得太多（drop 条）断开
  rate: 45,
  burst: 90,
  drop: 400,
  // 单条消息多大：主机的完整快照最大 host 字节，别人的操作 peer 字节
  size: Object.freeze({ host: 64 * 1024, peer: 8 * 1024 }),
  // 不是主机的人能发哪几种（都只发给主机）：i 操作（位置、开枪、命中、做目标、回血）、vote 投票重来、boardReq 请登机、heal 回血
  peer: Object.freeze(["i", "vote", "boardReq", "heal"]),
  // 只有服务器能发的：谁发来的都丢掉（不然别人能冒充「换主机」「有人进来了」）
  server: Object.freeze(["welcome", "peer", "host", "full", "taken", "nope", "slow", "err", "pong", "need"])
});
var ROLES = ["\u4E3B\u89D2", "\u963F\u54F2", "\u6797\u533B\u751F"];
var roleName = /* @__PURE__ */ __name((seat) => ROLES[seat] || `\u5EA7\u4F4D${seat}`, "roleName");
var clean = /* @__PURE__ */ __name((s, n = ROOM.name) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069<>&"'`]/g, "").trim().slice(0, n) || "\u73A9\u5BB6", "clean");
var cleanId = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24), "cleanId");
function createRoomCore({ code = "", now = /* @__PURE__ */ __name(() => Date.now(), "now"), persist = /* @__PURE__ */ __name(() => {
}, "persist"), P = ROOM } = {}) {
  const seats = new Array(P.max).fill(null);
  const S = { code, host: -1, started: false, start: null, key: null, keyAt: 0, created: now() };
  const meta = /* @__PURE__ */ new WeakMap();
  const players = /* @__PURE__ */ __name(() => seats.map((c, seat) => c ? { seat, name: meta.get(c).name, id: meta.get(c).id, host: seat === S.host, role: roleName(seat) } : null).filter(Boolean), "players");
  const send = /* @__PURE__ */ __name((c, msg) => {
    try {
      c.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {
    }
  }, "send");
  const all = /* @__PURE__ */ __name((msg, except = null) => {
    const text = JSON.stringify(msg);
    for (const c of seats) if (c && c !== except) send(c, text);
  }, "all");
  const save = /* @__PURE__ */ __name((c) => {
    const m = meta.get(c);
    try {
      c.save?.({ code: S.code, seat: m.seat, name: m.name, id: m.id, host: m.seat === S.host, started: S.started, start: S.start });
    } catch {
    }
  }, "save");
  const saveAll = /* @__PURE__ */ __name(() => {
    for (const c of seats) if (c) save(c);
  }, "saveAll");
  function join(c, { name = "", id = "", want = "any" } = {}) {
    const n = seats.filter(Boolean).length;
    if (want === "create" && n > 0) {
      send(c, { t: "taken" });
      c.close?.(4001, "taken");
      return -1;
    }
    if (want === "join" && n === 0) {
      send(c, { t: "nope" });
      c.close?.(4004, "nope");
      return -1;
    }
    const seat = seats.indexOf(null);
    if (seat < 0) {
      send(c, { t: "full" });
      c.close?.(4003, "full");
      return -1;
    }
    seats[seat] = c;
    meta.set(c, { seat, name: clean(name), id: cleanId(id), tokens: P.burst, last: now(), drops: 0 });
    if (S.host < 0) S.host = seat;
    save(c);
    send(c, { t: "welcome", seat, host: S.host, code: S.code, players: players(), started: S.started, start: S.start, snap: S.started ? S.key : null, keyAge: S.key ? now() - S.keyAt : null });
    all({ t: "peer", ev: "join", seat, name: meta.get(c).name, players: players(), host: S.host }, c);
    return seat;
  }
  __name(join, "join");
  function leave(c) {
    const m = meta.get(c);
    if (!m || seats[m.seat] !== c) return;
    seats[m.seat] = null;
    meta.delete(c);
    const left = seats.filter(Boolean);
    if (!left.length) {
      Object.assign(S, { host: -1, started: false, start: null, key: null, keyAt: 0 });
      persist("start", null);
      return;
    }
    let migrated = false;
    if (m.seat === S.host) {
      S.host = seats.findIndex(Boolean);
      migrated = true;
      S.key = null;
    }
    all({ t: "peer", ev: "leave", seat: m.seat, name: m.name, players: players(), host: S.host });
    if (migrated) {
      all({ t: "host", seat: S.host, reason: "migrate" });
      saveAll();
    }
  }
  __name(leave, "leave");
  function allow(m) {
    const t = now();
    m.tokens = Math.min(P.burst, m.tokens + (t - m.last) / 1e3 * P.rate);
    m.last = t;
    if (m.tokens < 1) {
      m.drops++;
      return false;
    }
    m.tokens -= 1;
    return true;
  }
  __name(allow, "allow");
  function message(c, text) {
    const m = meta.get(c);
    if (!m) return;
    const isHost = m.seat === S.host, cap = isHost ? P.size.host : P.size.peer;
    if (typeof text !== "string") {
      send(c, { t: "err", why: "binary" });
      return;
    }
    if (text.length > cap) {
      m.drops++;
      send(c, { t: "err", why: "size" });
      if (m.drops > P.drop) c.close?.(1009, "too big");
      return;
    }
    if (text === "ping") {
      send(c, "pong");
      return;
    }
    if (!allow(m)) {
      if (m.drops > P.drop) c.close?.(1008, "rate");
      return;
    }
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      send(c, { t: "err", why: "json" });
      return;
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || typeof msg.t !== "string") return;
    if (P.server.includes(msg.t)) return;
    if (!isHost && msg.t !== "ping" && msg.t !== "name" && !P.peer.includes(msg.t)) return;
    switch (msg.t) {
      case "ping":
        send(c, { t: "pong", c: msg.c ?? 0, s: now() });
        return;
      case "name": {
        m.name = clean(msg.name);
        save(c);
        all({ t: "peer", ev: "name", seat: m.seat, name: m.name, players: players(), host: S.host });
        return;
      }
      case "start": {
        if (!isHost) return;
        S.started = true;
        S.start = msg;
        S.key = null;
        persist("start", msg);
        saveAll();
        all({ t: "start", ...msg, f: m.seat }, c);
        return;
      }
      case "end": {
        if (!isHost) return;
        S.started = false;
        S.start = null;
        S.key = null;
        persist("start", null);
        saveAll();
        all({ t: "end", f: m.seat }, c);
        return;
      }
      case "s": {
        if (!isHost) return;
        if (msg.k) {
          S.key = text;
          S.keyAt = now();
        }
        for (const o of seats) if (o && o !== c) send(o, text);
        return;
      }
      default: {
        msg.f = m.seat;
        if (!isHost) {
          delete msg.to;
          const h = seats[S.host];
          if (h) send(h, JSON.stringify(msg));
          return;
        }
        const out = JSON.stringify(msg);
        if (msg.to === "all") {
          for (const o of seats) if (o && o !== c) send(o, out);
        } else if (Number.isInteger(msg.to)) {
          const o = seats[msg.to];
          if (o && o !== c) send(o, out);
        }
      }
    }
  }
  __name(message, "message");
  function restore(c, saved) {
    if (!saved || !Number.isInteger(saved.seat) || saved.seat < 0 || saved.seat >= P.max || seats[saved.seat]) return false;
    seats[saved.seat] = c;
    meta.set(c, { seat: saved.seat, name: clean(saved.name), id: cleanId(saved.id), tokens: P.burst, last: now(), drops: 0 });
    if (saved.host) S.host = saved.seat;
    if (!S.code && saved.code) S.code = saved.code;
    if (saved.started) {
      S.started = true;
      S.start = saved.start || S.start;
    }
    return true;
  }
  __name(restore, "restore");
  function settle() {
    if (S.host < 0 || !seats[S.host]) {
      S.host = seats.findIndex(Boolean);
      if (S.host >= 0) {
        all({ t: "host", seat: S.host, reason: "restore" });
        saveAll();
      }
    }
    if (S.host >= 0 && S.started && !S.key) send(seats[S.host], { t: "need" });
  }
  __name(settle, "settle");
  return { join, leave, message, restore, settle, players, state: S, get count() {
    return seats.filter(Boolean).length;
  } };
}
__name(createRoomCore, "createRoomCore");

// worker.js
var JOIN_LIMIT = Object.freeze({ max: 20, windowMs: 6e4, keep: 5e3 });
function createJoinLimiter({ P = JOIN_LIMIT, now = /* @__PURE__ */ __name(() => Date.now(), "now") } = {}) {
  const map = /* @__PURE__ */ new Map();
  const rec = /* @__PURE__ */ __name((ip) => {
    const t = now();
    let r = map.get(ip);
    if (!r || t - r.t0 >= P.windowMs) {
      r = { n: 0, t0: t };
      map.set(ip, r);
    }
    return r;
  }, "rec");
  return {
    blocked(ip) {
      if (!ip) return false;
      const r = map.get(ip);
      return !!r && now() - r.t0 < P.windowMs && r.n >= P.max;
    },
    fail(ip) {
      if (!ip) return;
      if (map.size > P.keep) {
        const t = now();
        for (const [k, r] of map) if (t - r.t0 >= P.windowMs) map.delete(k);
        if (map.size > P.keep) map.clear();
      }
      rec(ip).n++;
    },
    get size() {
      return map.size;
    }
  };
}
__name(createJoinLimiter, "createJoinLimiter");
var limiter = createJoinLimiter();
function reply(t, code, why) {
  const pair = new WebSocketPair(), [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({ t }));
  server.close(code, why);
  return new Response(null, { status: 101, webSocket: client });
}
__name(reply, "reply");
function originAllowed(origin, extra = "") {
  if (!origin) return false;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const h = u.hostname;
  if (u.protocol === "https:" && (h === "yunlan-mall.pages.dev" || h.endsWith(".yunlan-mall.pages.dev"))) return true;
  if ((u.protocol === "http:" || u.protocol === "https:") && (h === "localhost" || h === "127.0.0.1" || h === "[::1]")) return true;
  return String(extra || "").split(",").map((s) => s.trim()).filter(Boolean).includes(u.origin);
}
__name(originAllowed, "originAllowed");
var worker_default = {
  async fetch(request, env, _ctx, L = limiter) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8" } });
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,6})$/);
    if (!m) return new Response("not found", { status: 404 });
    const code = m[1].toUpperCase();
    if (!ROOM.code.test(code)) return new Response("bad room code", { status: 400 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!originAllowed(request.headers.get("Origin"), env.EXTRA_ORIGINS)) return new Response("origin not allowed", { status: 403 });
    const ip = request.headers.get("CF-Connecting-IP") || "", joining = url.searchParams.get("want") !== "create";
    if (joining && L.blocked(ip)) return reply("slow", 4029, "slow");
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await stub.fetch(request);
    if (res?.headers?.get?.("X-Room-Join") === "nope") L.fail(ip);
    return res;
  }
};
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.core = null;
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    } catch {
    }
  }
  conn(ws) {
    return { ws, send: /* @__PURE__ */ __name((t) => ws.send(t), "send"), close: /* @__PURE__ */ __name((code, why) => {
      try {
        ws.close(code, why);
      } catch {
      }
    }, "close"), save: /* @__PURE__ */ __name((meta) => ws.serializeAttachment(meta), "save") };
  }
  ensure(code) {
    if (this.core) return this.core;
    const core = this.core = createRoomCore({ code, persist: /* @__PURE__ */ __name((k, v) => {
      this.ctx.storage.put(k, v).catch?.(() => {
      });
    }, "persist") });
    this.conns = /* @__PURE__ */ new Map();
    for (const ws of this.ctx.getWebSockets()) {
      let saved = null;
      try {
        saved = ws.deserializeAttachment();
      } catch {
        saved = null;
      }
      const c = this.conn(ws);
      if (core.restore(c, saved)) this.conns.set(ws, c);
      else c.close(4e3, "stale");
    }
    if (this.conns.size) core.settle();
    return core;
  }
  async fetch(request) {
    const url = new URL(request.url), code = (url.pathname.split("/").pop() || "").toUpperCase();
    const core = this.ensure(code);
    const pair = new WebSocketPair(), [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const c = this.conn(server);
    this.conns.set(server, c);
    const want = ["create", "join"].includes(url.searchParams.get("want")) ? url.searchParams.get("want") : "any";
    const before = core.count, seat = core.join(c, { name: url.searchParams.get("name") || "", id: url.searchParams.get("id") || "", want });
    if (seat < 0) this.conns.delete(server);
    const headers = seat < 0 && want === "join" && before === 0 ? { "X-Room-Join": "nope" } : void 0;
    return new Response(null, { status: 101, webSocket: client, headers });
  }
  async webSocketMessage(ws, data) {
    const core = this.ensure(""), c = this.conns.get(ws);
    if (!c) {
      try {
        ws.close(4e3, "stale");
      } catch {
      }
      return;
    }
    core.message(c, typeof data === "string" ? data : null);
  }
  async webSocketClose(ws, code, reason) {
    const core = this.ensure(""), c = this.conns.get(ws);
    if (c) {
      core.leave(c);
      this.conns.delete(ws);
    }
    try {
      ws.close(code === 1005 ? 1e3 : code, reason);
    } catch {
    }
    if (!core.count) await this.ctx.storage.deleteAll().catch(() => {
    });
  }
  async webSocketError(ws) {
    const core = this.ensure(""), c = this.conns.get(ws);
    if (c) {
      core.leave(c);
      this.conns.delete(ws);
    }
  }
};

// ../../../../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-clrbhr/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-clrbhr/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  JOIN_LIMIT,
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  createJoinLimiter,
  middleware_loader_entry_default as default,
  originAllowed
};
//# sourceMappingURL=worker.js.map
