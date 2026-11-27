// 首页封面的方案、入口和「从封面带进游戏的参数」。纯数据 + 纯函数，不碰 DOM，node 里能测。
//
// 结构（四个方案共用）：
//   · 园区导览：一个主入口；小游戏不再单列，嵌在导览里（进园区后工具栏「小游戏」、地图上的游戏标记）
//   · 枪战 FPS：单独一个框，零点突围、丧尸围城两个模式 + 「联机（三人）」入口（?mp=1，联机大厅在 FPS 模式里做）
//   · 画质：封面上就能选，进去以后还能在各自的「设置」里细调
import { QUALITY_STORAGE_KEY } from './render/quality.js';

/** 四个方案。?cover=a|b|c|d 切换；不带参数用 DEFAULT_COVER。 */
export const COVER_OPTIONS = Object.freeze([
  Object.freeze({ id: 'a', name: '影院海报', desc: '园区鸟瞰铺满整屏，大标题压在左上；底部并排两个框：左边亮色玻璃框是园区导览（带两个小游戏的快捷入口），右边是带瞄准框角、暗红调的枪战 FPS 框。第一眼看到的是园区本身，枪战又一眼能找到。' }),
  Object.freeze({ id: 'b', name: '双联分屏', desc: '一张图一分为二：左半边是白天的园区，右半边是夜里封锁的中庭，中间一道斜切。两种玩法各占半屏、互不打扰，手机竖屏变成上下两块。' }),
  Object.freeze({ id: 'c', name: '游戏大厅', desc: '像主机游戏的启动页：深色底、方块磁贴。园区导览是一块大磁贴，下面挂着园区里的小游戏；枪战 FPS 单独一组框，模式和联机各一块。底部一条状态栏放画质和提示。' }),
  Object.freeze({ id: 'd', name: '建筑画册', desc: '米白纸面、宋体标题、编号目录，园区鸟瞰像画册里的一张插图带图注；枪战 FPS 是画册末页一块黑底「附页」，跟前面的纸面完全分开。安静、有设计感，适合先给人看园区。' }),
]);
/** 默认方案：影院海报（理由见 HANDOFF：园区画面最大、两块入口在一屏内并排，手机三种朝向都不用滚动） */
export const DEFAULT_COVER = 'a';
export const coverOption = (id) => COVER_OPTIONS.find((o) => o.id === id) || null;

/** 从地址栏参数里挑方案；没给或给错都回到默认 */
export function pickCover(search = '') {
  const v = new URLSearchParams(search).get('cover');
  const id = String(v || '').trim().toLowerCase();
  return coverOption(id) ? id : DEFAULT_COVER;
}

/** 园区导览（小游戏嵌在里面） */
export const TOUR_ENTRY = Object.freeze({ id: 'tour', mode: 'tour', title: '进入园区', en: 'CAMPUS TOUR',
  sub: '一期 · 二期 · 三期 · 住宅 · 地铁 · 自由漫游、自动导览、看店铺' });
/**
 * 枪战 FPS 的入口。mode 都是 jimao（同一个运行模式），query 决定开哪个：
 *   siege=0 零点突围 / siege=1 丧尸围城 / siege=1&mp=1 丧尸围城联机（联机大厅由 FPS 模式自己做）
 */
export const FPS_ENTRIES = Object.freeze([
  Object.freeze({ id: 'zero', mode: 'jimao', query: 'siege=0', title: '零点突围 · ZERO HOUR', short: '零点突围', en: 'ZERO HOUR',
    sub: '午夜零点，云澜汇被劫持 · 五种随机任务 · 直升机或装甲车撤离', tag: '反恐 · 单人' }),
  Object.freeze({ id: 'siege', mode: 'jimao', query: 'siege=1', title: '丧尸围城', short: '丧尸围城', en: 'DEAD MALL',
    sub: '三人小队从商场一路破障到楼顶 · 守住直升机撤离', tag: '合作生存 · 小队' }),
]);
export const MP_ENTRY = Object.freeze({ id: 'mp', mode: 'jimao', query: 'siege=1&mp=1', title: '联机（三人）', en: 'CO-OP',
  sub: '建房间 / 输房间号加入 · 中途可加入 · 没人的位置由 AI 队友顶上 · 奖励翻倍' });

// ---- 封面带进游戏的参数 ----
// 零点突围、丧尸围城、联机都读地址栏（jimao/run.js 读 location.search），所以点按钮时把参数写进地址栏再进模式。
// 规则：地址栏里已经有的参数不改（外部深链 ?siege=1 优先）；封面自己加的键记在 sessionStorage，
// 「返回封面」（整页刷新）时擦掉，不会让上一局的选择粘在下一次点击上。
export const LAUNCH_ADDED_KEY = 'yunlan.cover.added';

/** 把 query 并进 search：已有的键保留原值。返回 { search, added }（added 是这次新加的键） */
export function mergeLaunchQuery(search = '', query = '') {
  const params = new URLSearchParams(search), added = [];
  for (const [k, v] of new URLSearchParams(query)) {
    if (params.has(k)) continue;
    params.set(k, v); added.push(k);
  }
  const s = params.toString();
  return { search: s ? `?${s}` : '', added };
}

/** 去掉上次封面加进去的键（刷新回到封面时调用） */
export function stripLaunchQuery(search = '', keys = []) {
  const params = new URLSearchParams(search);
  for (const k of keys) params.delete(k);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * 回到封面时要不要擦参数：只在地址和封面当时写进去的一模一样时擦（也就是「返回封面」/ 刷新）；
 * 同一个标签页里换了个深链（比如另开 ?siege=1&tower=A）就不动。record = { search, added }。返回新的 search，或 null（不用改）。
 */
export function launchCleanup(search = '', record = null) {
  if (!record || !Array.isArray(record.added) || !record.added.length || record.search !== search) return null;
  return stripLaunchQuery(search, record.added);
}

// ---- 封面上的画质 ----
// 漫游（含小游戏）存在 yunlan.quality.v1 的 preset；FPS 存在原游戏的 saltline.settings.v1 的 quality。
// 封面上选一档，两边一起改（进去后各自的「设置」还能细调，那边改了以那边为准）。
export const COVER_TIERS = Object.freeze([
  Object.freeze({ id: 'auto', label: '自动', note: '按设备自动定档（手机默认省内存）' }),
  Object.freeze({ id: 'low', label: '流畅', note: '最省内存，老手机、平板用这档' }),
  Object.freeze({ id: 'balanced', label: '均衡', note: '阴影开、贴图适中' }),
  Object.freeze({ id: 'high', label: '精细', note: '电脑推荐' }),
  Object.freeze({ id: 'ultra', label: '极致', note: '高端显卡；手机容易被系统回收' }),
]);
export const FPS_SETTINGS_KEY = 'saltline.settings.v1';
const TIER_TO_FPS = Object.freeze({ auto: 'auto', low: 'low', balanced: 'medium', high: 'high', ultra: 'ultra' });

/** 现在的档位（以漫游的为准；漫游没存过、FPS 存过就用 FPS 的） */
export function readCoverTier(storage) {
  try {
    const p = JSON.parse(storage?.getItem(QUALITY_STORAGE_KEY) || 'null')?.preset;
    if (TIER_TO_FPS[p] && p !== 'auto') return p;
    const q = JSON.parse(storage?.getItem(FPS_SETTINGS_KEY) || 'null')?.quality;
    const back = Object.entries(TIER_TO_FPS).find(([, v]) => v === q)?.[0];
    return back || 'auto';
  } catch { return 'auto'; }
}

/** 选一档：两边一起写；FPS 那份只改 quality，别的设置（灵敏度、音量…）原样留着。存不了（无痕模式）返回 false */
export function writeCoverTier(storage, tier) {
  if (!TIER_TO_FPS[tier]) return false;
  try {
    storage.setItem(QUALITY_STORAGE_KEY, JSON.stringify({ preset: tier, overrides: {} }));
    let fps = {};
    try { const v = JSON.parse(storage.getItem(FPS_SETTINGS_KEY) || 'null'); if (v && typeof v === 'object') fps = v; } catch { fps = {}; }
    storage.setItem(FPS_SETTINGS_KEY, JSON.stringify({ ...fps, quality: TIER_TO_FPS[tier] }));
    return true;
  } catch { return false; }
}
