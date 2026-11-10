// 小游戏进度：每关最好成绩（星数、分数、用时）和游玩次数，存在本机 localStorage。纯数据，不碰 DOM。
export const ARCADE_STORAGE_KEY = 'yunlan.arcade.v1';
export const MAX_STARS = 3;

export const emptyProgress = () => ({ version: 1, games: {} });

const clampStars = (n) => Math.max(0, Math.min(MAX_STARS, Math.round(Number(n) || 0)));

/** 把读回来的任意数据整理成合法进度；不认识的内容丢掉。 */
export function normalizeProgress(raw) {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object' || typeof raw.games !== 'object' || !raw.games) return out;
  for (const [gameId, levels] of Object.entries(raw.games)) {
    if (!levels || typeof levels !== 'object') continue;
    for (const [levelId, r] of Object.entries(levels)) {
      if (!r || typeof r !== 'object') continue;
      (out.games[gameId] ??= {})[levelId] = {
        stars: clampStars(r.stars),
        score: Number.isFinite(r.score) ? r.score : 0,
        seconds: Number.isFinite(r.seconds) && r.seconds > 0 ? r.seconds : null,
        plays: Number.isInteger(r.plays) && r.plays > 0 ? r.plays : 0,
      };
    }
  }
  return out;
}

/** 记一局的结果，返回新的进度对象：星数和分数取最高，用时只在同星或更高星时取更短的。 */
export function recordResult(progress, gameId, levelId, { stars = 0, score = 0, seconds = null } = {}) {
  const next = normalizeProgress(progress);
  const old = next.games[gameId]?.[levelId] || { stars: 0, score: 0, seconds: null, plays: 0 };
  const s = clampStars(stars);
  const time = Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  const best = { stars: Math.max(old.stars, s), score: Math.max(old.score, Number.isFinite(score) ? score : 0), plays: old.plays + 1 };
  best.seconds = s > old.stars ? time : s === old.stars && s > 0 && time != null ? (old.seconds == null ? time : Math.min(old.seconds, time)) : old.seconds;
  (next.games[gameId] ??= {})[levelId] = best;
  return next;
}

export const levelRecord = (progress, gameId, levelId) => progress?.games?.[gameId]?.[levelId] || null;
export const levelStars = (progress, gameId, levelId) => levelRecord(progress, gameId, levelId)?.stars || 0;
export const gameStars = (progress, game) => game.levels.reduce((n, l) => n + levelStars(progress, game.id, l.id), 0);
export const totalStars = (progress, games) => games.reduce((n, g) => n + (g.levels ? gameStars(progress, g) : 0), 0);

/** 第一关总是开放；后面的关要在前一关拿到至少一星。 */
export function isLevelUnlocked(progress, game, levelId) {
  const i = game.levels.findIndex((l) => l.id === levelId);
  if (i < 0) return false;
  return i === 0 || levelStars(progress, game.id, game.levels[i - 1].id) > 0;
}

export function loadProgress(storage) {
  try { return normalizeProgress(JSON.parse(storage?.getItem(ARCADE_STORAGE_KEY) || 'null')); }
  catch { return emptyProgress(); }
}

export function saveProgress(storage, progress) {
  try { storage?.setItem(ARCADE_STORAGE_KEY, JSON.stringify(normalizeProgress(progress))); return true; }
  catch { return false; } // 无痕模式、嵌入预览等存不了：这一局照常玩，只是不留记录
}
