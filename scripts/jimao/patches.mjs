// 抽出来的原游戏代码上打的几处小补丁：加一种「真人敌人」（type: 'soldier'，实现在 src/jimao/soldier.js）。
// 原游戏只认机械飞鸥（gull）和机械猎犬（hound）两种敌人；下面每一条都是原文照抄的一小段 → 改后的一小段，
// 每条必须恰好命中一次，否则抽取直接报错（原游戏代码一变就能发现，不会悄悄失效）。
// 只做「多认一种敌人」需要的最小改动：敌人池、射线粗筛、三波敌人和追兵的组成、声音、击杀播报。
import { escapeLikeEsbuild } from './rebrand.mjs';

export const PATCHES = [
  // ---- 声音 ----
  ['真人敌人的枪声和脚步声：用原游戏自己的步枪、脚步合成器，放到有方位的「世界」声道上',
    'hound_step: { gen: T8, n: 3, sr: Xn, peak: 0.7, bus: "world", max: 4, pri: 3, ref: 5, roll: 0.8 },',
    'hound_step: { gen: T8, n: 3, sr: Xn, peak: 0.7, bus: "world", max: 4, pri: 3, ref: 5, roll: 0.8 }, soldier_fire: { gen: KR, n: 2, sr: ki, peak: 0.9, bus: "world", max: 5, pri: 7, ref: 8, roll: 0.5 }, soldier_step: { gen: r8, n: 4, sr: Xn, peak: 0.5, bus: "world", max: 4, pri: 3, ref: 4, roll: 0.9 },'],
  ['真人敌人没有旋翼声、伺服声',
    '!te || xe || pn.has(te) || te.alive === false ||',
    '!te || xe || te.type === "soldier" || pn.has(te) || te.alive === false ||'],
  ['真人敌人开枪用步枪声',
    'ze(he === "hound" ? "hound_fire" : "gull_fire", { pos: pe, gain: 1, jitter: 0.04 })',
    'ze(he === "soldier" ? "soldier_fire" : he === "hound" ? "hound_fire" : "gull_fire", { pos: pe, gain: he === "soldier" ? 0.8 : 1, jitter: 0.04 })'],
  ['真人敌人的脚步声',
    'te.type !== "gull" && ze("hound_step", { pos: Hn(te.pos), gain: pi(0.6 + (+te.speed || 2) * 0.1, 0.6, 1), jitter: 0.06 });',
    'te.type === "soldier" ? ze("soldier_step", { pos: Hn(te.pos), gain: pi(0.35 + (+te.speed || 2) * 0.1, 0.35, 0.8), jitter: 0.08 }) : te.type !== "gull" && ze("hound_step", { pos: Hn(te.pos), gain: pi(0.6 + (+te.speed || 2) * 0.1, 0.6, 1), jitter: 0.06 });'],
  ['真人敌人倒地是一声闷响，不是机器爆裂',
    'ze(pe === "hound" ? "hound_die" : "gull_die", { pos: ge, gain: 1, jitter: 0.05 })',
    'pe === "soldier" ? ze("impact_concrete", { pos: ge, gain: 0.9, pitch: 0.55, jitter: 0.05 }) : ze(pe === "hound" ? "hound_die" : "gull_die", { pos: ge, gain: 1, jitter: 0.05 })'],
  // ---- 击杀播报 ----
  ['击杀播报里的名字',
    '{ gull: "机械飞鸥", hound: "机械猎犬" }',
    '{ gull: "机械飞鸥", hound: "机械猎犬", soldier: "武装劫持者" }'],
  ['真人敌人是「已击倒」，机器是「已摧毁」',
    '`<b>${ce}</b> 已摧毁`',
    '`<b>${ce}</b> ${k && (k.type || k.enemy && k.enemy.type) === "soldier" ? "已击倒" : "已摧毁"}`'],
  // ---- 敌人管理 ----
  ['敌人池：除了飞鸥、猎犬，也从外面登记进来的池子里取（ctx.pools.soldier）',
    'let G = T === "gull" ? d : T === "hound" ? v : null;',
    'let G = T === "gull" ? d : T === "hound" ? v : h.pools && h.pools[T] || null;'],
  ['清场时外面登记的池子也一起收回',
    'for (let T of v) T.active && T._deactivate();\n      t.length = 0',
    'for (let T of v) T.active && T._deactivate();\n      if (h.pools) for (let k in h.pools) for (let T of h.pools[k]) T.active && T._deactivate();\n      t.length = 0'],
  ['子弹打敌人的粗筛：人站着有一米八，按腰部高度算中心',
    '(N.type === "hound" ? 0.6 : 0)',
    '(N.type === "hound" ? 0.6 : N.type === "soldier" ? 1 : 0)'],
  // ---- 关卡流程：巡逻、三波、追兵里加上真人敌人（数量在 GAME_FLOW 里，由 src/jimao/run.js 设） ----
  ['开局巡逻的敌人里加上真人',
    'for (let V of ["gull", "hound"]) for (let Y = 0; Y < Yi.patrol[V]; Y++)',
    'for (let V of ["gull", "hound", "soldier"]) for (let Y = 0; Y < (Yi.patrol[V] || 0); Y++)'],
  ['每切断一个中继来的那一波里加上真人（和机器穿插着出来）',
    'for (let oe = 0; oe < V.hound; oe++) Y.splice(Math.min(Y.length, 1 + oe * 2), 0, "hound");',
    'for (let oe = 0; oe < V.hound; oe++) Y.splice(Math.min(Y.length, 1 + oe * 2), 0, "hound");\n      for (let oe = 0; oe < (V.soldier || 0); oe++) Y.splice(Math.min(Y.length, oe * 2), 0, "soldier");'],
  ['撤离时的追兵：按 GAME_FLOW.pursuitMix 抽种类（没设就是原来的六成飞鸥、四成猎犬）',
    'let Y = i.rng() < 0.6 ? "gull" : "hound";',
    'let Y = Yi.pursuitMix ? Yi.pursuitMix(i.rng()) : i.rng() < 0.6 ? "gull" : "hound";'],
  ['出生点别太远：超过 GAME_FLOW.spawnMax 米的扣分（我们的地图比原来的港区大得多，太远的敌人半分钟都走不到）',
    'let R = Math.hypot(le.pos.x - Y.x, le.pos.z - Y.z), I = i.rng() * 1.5;',
    'let R = Math.hypot(le.pos.x - Y.x, le.pos.z - Y.z), I = i.rng() * 1.5 - (Yi.spawnMax && R > Yi.spawnMax ? (R - Yi.spawnMax) / 4 : 0);'],
  // ---- 地图 ----
  ['机械猎犬走路也用我们导航网格的碰撞（physics.moveFeet）：原来只按地面高度贴地，在多层商场里会从楼梯井掉下去',
    'm.pos.x = $, m.pos.z = ue, m.pos.y += (s.physics.groundHeight($, ue, m.pos.y + 0.6) - m.pos.y) * (1 - Math.exp(-12 * T))',
    's.physics.moveFeet ? s.physics.moveFeet(m.pos, $, ue, T) : (m.pos.x = $, m.pos.z = ue, m.pos.y += (s.physics.groundHeight($, ue, m.pos.y + 0.6) - m.pos.y) * (1 - Math.exp(-12 * T)))'],
  ['机械猎犬去「最后看见玩家的地方」：高度差也算进距离，免得在楼下正好站在玩家脚底就以为到了',
    'let I = Math.hypot(m.lastKnown.x - m.pos.x, m.lastKnown.z - m.pos.z);',
    'let I = Math.hypot(m.lastKnown.x - m.pos.x, m.lastKnown.z - m.pos.z) + Math.abs(m.lastKnown.y - m.pos.y) * 3;'],
  ['机械猎犬走向目标点：高度差也算距离（目标在楼上时不会在楼下停住）',
    'let G = m.goal.x - m.pos.x, j = m.goal.z - m.pos.z, N = Math.hypot(G, j);',
    'let G = m.goal.x - m.pos.x, j = m.goal.z - m.pos.z, N = Math.hypot(G, j) + Math.abs(m.goal.y - m.pos.y) * 2;'],
  // ---- 随机任务（src/jimao/missions.js）：任务文字、交互提示、撤离点名字都从关卡数据（G.level）里取，没有就用原文 ----
  ['导出无线电台词表，每局按任务改写',
    'Yi as GAME_FLOW,',
    'Yi as GAME_FLOW, _l, _l as RADIO,'],
  ['任务目标文字由关卡提供（歼灭、取物、切断中继三类）',
    'function D() {\n      if (c.allCut) return "前往接应车";',
    'function D() {\n      if (s && s.missionText) return s.missionText(c);\n      if (c.allCut) return "前往接应车";'],
  ['交互提示用目标自己的动词（取回、切断…）',
    'o.setPrompt("切断中继 " + V.short, Fo(V.t))',
    'o.setPrompt((V.o.verb || "切断中继") + " " + V.short, Fo(V.t))'],
  ['撤离点标记名字由关卡提供（直升机 / 接应车）',
    'label: "接应车"',
    'label: s.extraction.label || "接应车"'],
  ['目标标记的种类（中继 / 物品）',
    'label: V.o.label || "中继 " + V.short, pos: V.o.pos, kind: "relay" }',
    'label: V.o.label || "中继 " + V.short, pos: V.o.pos, kind: V.o.kind || "relay" }'],
  ['没完成目标就到撤离点时的提示由关卡提供',
    'o.message("中继尚未断开，接应车无法在火力下接应", 3.5)',
    'o.message(s.extraction.blocked || "中继尚未断开，接应车无法在火力下接应", 3.5)'],
  ['每局开始（含重开）先让关卡重新抽任务',
    '      a(i.enemies, "clear"), a(i.fx, "clear"), a(i.combat, "reset")',
    '      s && s.onReset && s.onReset(), a(i.enemies, "clear"), a(i.fx, "clear"), a(i.combat, "reset")'],
  ['外部完成全部目标（歼灭任务）、刷新目标文字、载具撤离打完后结算（finish）',
    'debugCut() {',
    'completeAll() {\n      c.allCut || (c.allCut = true, c.pursuitLeft = Yi.pursuitExtra, c.pursuitT = 12, i.events.emit("objective:all", {}), o.radio && o.radio(_l.all, 4.5), o.setObjective(D()), q());\n    }, refreshObjective() {\n      _.state === "playing" && o.setObjective(D()), q();\n    }, finish() {\n      _.state === "playing" && ee();\n    }, debugCut() {'],
  ['到达撤离点：关卡要求时不松开鼠标锁定（坐在载具里还能转头看）',
    'r.exitLock(), o.setPrompt && o.setPrompt(null), o.show(false), i.events.emit("extraction:reached", {})',
    '(s && s.keepLock || r.exitLock()), o.setPrompt && o.setPrompt(null), o.show(false), i.events.emit("extraction:reached", {})'],
  ['撤离镜头放完再出结算页：等待时长从关卡数据里取',
    'u > 3.3 && l.screen !== "complete"',
    'u > (s && s.outroDelay || 3.3) && l.screen !== "complete"'],
  // ---- 载具撤离（src/jimao/missions.js）：到撤离点交给关卡登车，坐车 / 坐直升机打完一段再结算 ----
  ['到达撤离点：关卡有 onExtract 时交给它（登车、坐着打一段），之后再由 finish() 结算',
    'Z && c.allCut && n.alive ? ee() :',
    'Z && c.allCut && n.alive ? (s && s.onExtract ? s.onExtract() : ee()) :'],
  ['玩家坐在载具里（mounted）：不走不跳、不受重力，位置由载具每帧摆放，照样转头、开枪',
    'R = i.physics.moveCapsule(C.pos, C.vel, F, Pi.radius, o, l) || {};',
    'R = C.mounted ? (C.vel.set(0, 0, 0), { onGround: true }) : i.physics.moveCapsule(C.pos, C.vel, F, Pi.radius, o, l) || {};'],
  ['额外的 HUD 标记（弹药箱）：关卡给 extraMarkers()',
    'kind: "extract" }), o.setMarkers(P);',
    'kind: "extract" }), s && s.extraMarkers && P.push(...s.extraMarkers()), o.setMarkers(P);'],
  ['界面上的「中继」计数改成「目标」',
    '<span>中继</span>',
    '<span>目标</span>'],
  ['结算页：敌人都是武装人员，「摧毁机械」改成「击倒敌人」',
    '<div><dt>摧毁机械</dt><dd data-f="kills">0</dd></div>',
    '<div><dt>击倒敌人</dt><dd data-f="kills">0</dd></div>'],
  ['阵亡统计：已完成目标',
    '已切断中继',
    '已完成目标'],
];

/** 打补丁；返回 { code, applied }。有一条没命中或命中不止一次就抛错。 */
export function applyPatches(code) {
  for (const [why, from, to] of PATCHES) {
    const a = escapeLikeEsbuild(from), n = code.split(a).length - 1;
    if (n !== 1) throw new Error(`补丁「${why}」应该命中 1 处，实际 ${n} 处`);
    code = code.replace(a, () => escapeLikeEsbuild(to));
  }
  return { code, applied: PATCHES.length };
}
