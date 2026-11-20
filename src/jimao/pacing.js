// 丧尸围城的节奏：尸潮不是匀速往外冒，而是「平静 → 升温 → 尸潮 → 喘息」一轮一轮来。
//   平静 calm    只有零星游荡的，给人搜房间、摸路的时间；
//   升温 build   游荡的变多，特殊感染者开始出现；
//   尸潮 peak    先有三秒预警（远处一阵嚎叫、屏幕提示），然后一大群认定了人的扑过来；
//   喘息 relax   不再补新的，把剩下的清掉、包扎、换弹。
// 「紧张度」记的是人最近被折腾得多狠（挨咬、被围）：升温阶段紧张度已经很高，就跳过这一轮尸潮直接进喘息——
// 不在人快不行的时候再压一波；反过来一直很轻松，升温会缩短。响动条攒满（siege.js）会立刻催来一波，不等计时。
// 这里只管节奏和数量，全是纯逻辑；真正放丧尸、播提示在 siege.js。

/**
 * 各阶段的时长范围（秒）、尸潮规模（基数 + 每完成一步加多少，封顶）、游荡数量的倍数、同时在场的特殊感染者上限、
 * 紧张度（挨一下咬加多少、每只贴身的每秒加多少、每秒掉多少、多高算「够了」）。
 */
export const PACING = Object.freeze({
  calm: Object.freeze([16, 26]), build: Object.freeze([20, 32]), warn: 3, peak: Object.freeze([14, 20]), relax: Object.freeze([13, 19]),
  horde: Object.freeze({ base: 7, perStage: 1.2, max: 16 }),
  ambient: Object.freeze({ calm: 0.6, build: 1.25, peak: 0.5, relax: 0 }),
  specials: Object.freeze({ calm: 0, build: 2, peak: 2, relax: 1 }),
  specialEvery: Object.freeze([9, 16]),
  stress: Object.freeze({ hit: 0.16, crowd: 0.035, decay: 0.045, high: 0.72, low: 0.2 }),
});

const lerp = (a, b, t) => a + (b - a) * t;
const pick = ([a, b], r) => lerp(a, b, r);

/**
 * 建一个节奏器。rng：0–1 的随机数。
 * update(dt, { stage, near, noiseFull, hold }) 每帧调：stage = 完成了几步（越往后尸潮越大），near = 贴身（6 米内）的丧尸数，
 *   noiseFull = 响动条满了，hold = 正在楼顶死守（那一段的波次由 siege.js 自己按表放，这里只出特殊感染者）。
 * 返回这一帧要办的事：{ warn（刚进预警）, horde（这一帧放多少只尸潮，0 = 不放）, special（这一帧该放一只特殊感染者） }。
 * hit(amount)：人挨了一下。phase / stress / ambient（游荡数量的倍数）/ specialCap（特殊感染者上限）随时可读。
 */
export function createPacing(rng = Math.random, P = PACING) {
  const S = { phase: 'calm', t: 0, left: pick(P.calm, rng()), stress: 0, warned: false, specialT: pick(P.specialEvery, rng()), rounds: 0, skipped: 0 };
  const enter = (phase) => { S.phase = phase; S.t = 0; S.warned = false; S.left = pick(P[phase], rng()); };
  const size = (stage) => Math.round(Math.min(P.horde.max, P.horde.base + P.horde.perStage * Math.max(0, stage)) * (0.9 + rng() * 0.2));
  return {
    state: S,
    get phase() { return S.phase; }, get stress() { return S.stress; },
    get ambient() { return P.ambient[S.phase]; }, get specialCap() { return P.specials[S.phase]; },
    /** 进预警了没（屏幕上的提示用）：尸潮还有几秒到；不在预警里是 0 */
    get warning() { return S.phase === 'build' && S.warned ? Math.max(0, S.left) : 0; },
    hit(amount = 10) { S.stress = Math.min(1, S.stress + P.stress.hit * Math.max(0.3, amount / 14)); },
    reset() { Object.assign(S, { phase: 'calm', t: 0, left: pick(P.calm, rng()), stress: 0, warned: false, specialT: pick(P.specialEvery, rng()), rounds: 0, skipped: 0 }); },
    update(dt, { stage = 0, near = 0, noiseFull = false, hold = false } = {}) {
      const out = { warn: false, horde: 0, special: false };
      S.t += dt;
      S.stress = Math.max(0, Math.min(1, S.stress + (near * P.stress.crowd - P.stress.decay) * dt));
      // 特殊感染者：有名额的阶段隔一阵来一只（楼顶死守时也来）
      if (P.specials[S.phase] > 0 || hold) { S.specialT -= dt; if (S.specialT <= 0) { S.specialT = pick(P.specialEvery, rng()); out.special = true; } }
      if (hold) return out; // 死守的波次不归这里管
      S.left -= dt * (S.phase === 'build' && !S.warned && S.stress < P.stress.low ? 1.35 : 1); // 一直很轻松：升温快一点（预警那三秒按实际时间走）
      if (S.phase === 'calm') { if (S.left <= 0) enter('build'); }
      else if (S.phase === 'build') {
        // 响动条满了：不等计时，直接进预警
        if (noiseFull && !S.warned) { S.left = Math.min(S.left, P.warn); }
        if (!S.warned && S.left <= P.warn) {
          if (S.stress > P.stress.high && !noiseFull) { S.skipped++; enter('relax'); return out; } // 人已经够呛了：这一轮不来
          S.warned = true; out.warn = true;
        }
        if (S.left <= 0) { enter('peak'); S.rounds++; out.horde = size(stage); }
      } else if (S.phase === 'peak') { if (S.left <= 0) enter('relax'); }
      else if (S.phase === 'relax') { if (S.left <= 0 || noiseFull) enter(noiseFull ? 'build' : 'calm'); }
      // 平静时吵得太凶：直接升温
      if (S.phase === 'calm' && noiseFull) enter('build');
      return out;
    },
  };
}
