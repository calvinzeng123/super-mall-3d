// 首页启动路由：开场播哪一版、深链（邀请链接直进联机 / 其它参数只预选菜单项）、从游戏返回时擦参数、各入口带进游戏的参数、
// 联机服务器探测。纯数据 + 纯函数（探测注入 fetch），不碰 DOM，node 里能测。
import { COOP_SERVER } from '../jimao/coop/net.js';
import { GAMES } from '../arcade/registry.js';
import { gameStars, MAX_STARS } from '../arcade/progress.js';

/** 本机记的：看过一次完整开场（之后只播短版） */
export const INTRO_SEEN_KEY = 'weicheng.intro.seen';
/** 设置里「开场」：full 总是完整版 / short 短版 / none 不播；没设（auto）= 首访完整版、之后短版 */
export const INTRO_PREF_KEY = 'weicheng.intro.pref';
/** 从游戏「返回」主菜单时写进 sessionStorage：回来不播开场 */
export const RETURNING_KEY = 'weicheng.returning';
export const INTRO_PREFS = Object.freeze(['auto', 'full', 'short', 'none']);

const fz = (o) => Object.freeze(o);
/**
 * 主菜单入口（顺序即优先级）。mode / query 交给 runtime.startRuntime：jimao 读地址栏的 siege / mp / room，
 * autostart=1 跳过游戏自己的「断讯」片头和标题菜单，直接开局。没有 mode 的（更多玩法、设置）只在菜单里展开。
 */
export const ENTRIES = fz([
  fz({ id: 'siege', label: '丧尸围城（单人）', en: 'CAMPAIGN', mode: 'jimao', query: 'siege=1&autostart=1',
    desc: '商场失守。从三楼一路杀到公寓楼顶，守住机枪阵地，等直升机落下。' }),
  fz({ id: 'coop', label: '联机 · 三人', en: 'CO-OP', mode: 'jimao', query: 'siege=1&mp=1&autostart=1',
    desc: '建房间，或输房间号加入；中途能进，空位由 AI 队友顶上。' }),
  fz({ id: 'zero', label: '零点突围', en: 'ZERO HOUR', mode: 'jimao', query: 'siege=0&autostart=1',
    desc: '午夜零点，商场被武装分子劫持。五种随机任务，直升机或装甲车撤离。' }),
  fz({ id: 'tour', label: '园区漫游', en: 'FREE ROAM', mode: 'tour', query: '',
    desc: '停电之前的云澜：商场、住宅、地铁，随便走走看看。' }),
  fz({ id: 'more', label: '更多玩法', en: 'MORE', desc: '园区里的小游戏：无人机送外卖、夜间潜入。',
    children: fz([
      fz({ id: 'drone', label: '无人机送外卖', mode: 'tour', query: 'play=drone', desc: '从商场屋顶起飞，把餐送上各栋楼顶。' }),
      fz({ id: 'heist', label: '夜间潜入', mode: 'tour', query: 'play=heist', desc: '闭店后的商场：躲开保安，带走艺文馆的展品。' }),
    ]) }),
  fz({ id: 'settings', label: '设置', en: 'SETTINGS', desc: '画质、开场动画、重看开场。' }),
]);

/** 按 id 找入口（一级或二级），没有返回 null */
export function findEntry(id) {
  for (const e of ENTRIES) {
    if (e.id === id) return e;
    for (const c of e.children || []) if (c.id === id) return c;
  }
  return null;
}

const read = (s, k) => { try { return s?.getItem?.(k) ?? null; } catch { return null; } };

/**
 * 这次开场播哪一版：减少动态效果 → none；从游戏返回（sessionStorage 的 RETURNING_KEY）→ none；
 * ?intro=full|short|none（调试）；设置里指定的；看过一次 → short；否则 full。
 * 返回标记只在 session 里找；session 不给（null）时才退到 storage 里找。
 */
export function introVersion({ search = '', storage = null, session = null, reducedMotion = false } = {}) {
  if (reducedMotion) return 'none';
  if (read(session ?? storage, RETURNING_KEY)) return 'none';
  const q = new URLSearchParams(search).get('intro');
  if (q === 'full' || q === 'short' || q === 'none') return q;
  const pref = read(storage, INTRO_PREF_KEY);
  if (pref === 'full' || pref === 'short' || pref === 'none') return pref;
  return read(storage, INTRO_SEEN_KEY) ? 'short' : 'full';
}

/** 记下「看过完整开场」（存不了就算了） */
export function markIntroSeen(storage) { try { storage?.setItem?.(INTRO_SEEN_KEY, '1'); } catch { /* 无痕模式 */ } }

/** 设置里的开场偏好（auto = 没设） */
export function readIntroPref(storage) { const v = read(storage, INTRO_PREF_KEY); return INTRO_PREFS.includes(v) ? v : 'auto'; }
export function writeIntroPref(storage, v) {
  try { if (v === 'auto') storage?.removeItem?.(INTRO_PREF_KEY); else if (INTRO_PREFS.includes(v)) storage?.setItem?.(INTRO_PREF_KEY, v); else return false; return true; } catch { return false; }
}

/**
 * 邀请链接里的房间码：和联机大厅的 autoJoin 一样宽（全角、小写、空格都认，只留字母数字），4–6 位才算；不对返回 null。
 * 不用 net.js 的 normCode（它按新建房间的字表去掉了 0 O 1 I，老链接里手抄的码会被拒）。
 */
export function roomCode(s) { const c = String(s || '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-Z0-9]{4,6}$/.test(c) ? c : null; }

/**
 * 深链：只有带有效房间码的邀请链接（?room=CODE）不播开场、直接进联机大厅；
 * ?mp=1 / ?siege= / ?play= 只在菜单里预选对应那一项；guns、t、shot、nointro、cover 之类调试 / 旧参数什么都不触发。
 */
export function deepLink(search = '') {
  const p = new URLSearchParams(search);
  const code = p.has('room') ? roomCode(p.get('room')) : null;
  if (code) return { direct: { mode: 'jimao', query: `siege=1&mp=1&room=${code}&autostart=1` }, preselect: null };
  let preselect = null;
  if (p.get('mp') === '1') preselect = 'coop';
  else if (p.get('siege') === '1') preselect = 'siege';
  else if (p.get('siege') === '0') preselect = 'zero';
  else if (findEntry('more').children.some((c) => c.id === p.get('play'))) preselect = 'more';
  return { direct: null, preselect };
}

/** 进游戏时带进地址栏、回菜单时要擦掉的键 */
export const LAUNCH_KEYS = Object.freeze(['room', 'mp', 'siege', 'play', 'autostart']);

/** 从游戏返回主菜单：去掉启动参数，别的（quality、调试参数）原样留 */
export function returnCleanup(search = '') {
  const p = new URLSearchParams(search);
  for (const k of LAUNCH_KEYS) p.delete(k);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * 从游戏回主菜单（漫游的「返回主菜单」、小游戏外壳、FPS 结算页）：sessionStorage 记返回标记（回来不播开场），
 * 擦掉启动参数后整页换地址。擦完地址没变（只剩 hash 一样）时 location.replace 只会跳锚点、不重载，改成 reload。
 */
export function returnToTitle(win = globalThis.window) {
  try { win.sessionStorage?.setItem(RETURNING_KEY, '1'); } catch { /* 无痕模式：回来照常播短版 */ }
  const l = win.location, s = returnCleanup(l.search);
  if (s === l.search) l.reload(); else l.replace(`${l.pathname}${s}${l.hash}`);
}

/** 选了某个入口后的地址栏参数：先擦掉上一局的启动参数，再并上入口的（入口的值优先） */
export function entrySearch(search = '', entry = null) {
  const p = new URLSearchParams(returnCleanup(search));
  for (const [k, v] of new URLSearchParams(entry?.query || '')) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** 「更多玩法」里每个小游戏的星数：{ drone: '2/9', … }（本机进度，arcade/progress.js） */
export function arcadeStars(progress) {
  const out = {};
  for (const c of findEntry('more').children) {
    const g = GAMES.find((x) => x.id === c.id);
    if (g) out[c.id] = `${progress ? gameStars(progress, g) : 0}/${g.levels.length * MAX_STARS}`;
  }
  return out;
}

/** 联机服务器的健康检查地址：wss:// → https://，ws:// → http://，加 /health */
export function healthUrl(url = COOP_SERVER.url) {
  const u = String(url || '').trim().replace(/\/+$/, '');
  if (!u) return null;
  return `${u.replace(/^ws(s?):\/\//i, 'http$1://')}/health`;
}

/**
 * 探测联机服务器在不在线：GET /health 有响应算在线；连不上（fetch 抛错）、超时（默认 4 秒）算离线。不会 reject。
 * 用 no-cors：页面（pages.dev）和服务器（workers.dev）跨域，已部署的 /health 不回 CORS 头，cors 模式下浏览器会拦掉响应、
 * 永远显示离线；no-cors 拿到的是不透明响应（type opaque、status 0），读不到内容，但能拿到就说明服务器在线。
 */
export async function probeServer(url = COOP_SERVER.url, timeoutMs = 4000, fetchImpl = globalThis.fetch) {
  const target = healthUrl(url);
  if (!target || typeof fetchImpl !== 'function') return false;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = 0;
  const timeout = new Promise((r) => { timer = setTimeout(() => { ctl?.abort(); r(false); }, timeoutMs); });
  try {
    const req = Promise.resolve().then(() => fetchImpl(target, { signal: ctl?.signal, cache: 'no-store', mode: 'no-cors' })).then((res) => !!res && (res.ok || res.type === 'opaque'), () => false);
    return await Promise.race([req, timeout]);
  } finally { clearTimeout(timer); }
}
