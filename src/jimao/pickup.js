// 拿东西点一下就行：明明只是「捡起来」「按个开关」「刷个卡」的目标，以前也要按住交互键等 2.4 秒的进度圈，不合常理。
// 现在分两种：
//   点一下（tap）：手摇柄、撬棍、手枪、值班表、门禁卡、油桶、工具（保险丝、灭火器、门禁卡、撬棍）、按开卷帘、开武器柜、合闸、点信号弹、刷卡开门、
//                  零点突围的证物箱 / 货款箱 / 情报箱——按下那一下就完成（vendor 补丁：o.tap 用 pressed 代替 down），提示写「按 E」、不画进度圈；
//   按住（hold）：真要花时间的——摇卷帘、撬卷帘 / 扶梯口 / 后门、给发电机加油启动、清杂物、换保险丝、灭火、切中继、拆炸弹。
// 点一下拿到手的小件有个短动作：东西从桌上飞到镜头前缩没（PICKUP.fly 秒），枪往下一沉再抬起来，一声轻响，准星下面一行「拿到 · 撬棍」。
import * as THREE from 'three';

/**
 * stages：丧尸围城里点一下就行的步骤（siege.js 的 stage.kind）；gates：关卡里点一下就行的（GATES 的键：刷卡开门）；
 * missions：零点突围里点一下就行的目标（objective.kind）；fly：拿到手的小件会飞到镜头前的那几种（柜子、开关、油桶不飞：柜门开着 / 拉杆扳下 / 抬在手上）；
 * fly 秒内飞完，dip：枪往下沉多少（0–1）、多久，toast：「拿到 · …」显示几秒
 */
export const PICKUP = Object.freeze({
  stages: Object.freeze(['crank', 'crowbar', 'pistol', 'note', 'card', 'fuel', 'tool', 'open', 'locker', 'switch', 'flare']),
  gates: Object.freeze(['lock']),
  missions: Object.freeze(['item']),
  flyKinds: Object.freeze(['crank', 'crowbar', 'pistol', 'note', 'tool', 'item']),
  fly: 0.3, dip: Object.freeze({ k: 0.42, t: 0.38 }), toast: 1.3,
});

/** 丧尸围城的一步是不是点一下就行（纯函数）。st：siege.js 的 stage（{ kind, type? }） */
export function tapStage(st, P = PICKUP) {
  if (!st) return false;
  if (st.kind === 'gate') return P.gates.includes(st.type);
  return P.stages.includes(st.kind);
}
/** 零点突围的目标是不是点一下就行（纯函数）：已经标过的（丧尸围城自己标的）照旧 */
export function tapObjective(o, P = PICKUP) { return typeof o?.tap === 'boolean' ? o.tap : P.missions.includes(o?.kind); }
/** 提示上的字：点一下「按 E」、按住「按住 E」（和 vendor 补丁里写的一样，测试用） */
export function promptVerb(tap, key = 'E') { return `${tap ? '按' : '按住'} ${key}`; }
/** 「撬棍 · 三层 云澜影城」→「撬棍」 */
export const shortName = (label) => String(label || '').split(' · ')[0].trim();

export const PICKUP_CSS = `
.h-prompt.tap .fg { display: none; }
.h-prompt.tap .bg { stroke: var(--signal, #f5b301); }
.jm-pick { position: absolute; left: 50%; top: 57%; transform: translate(-50%, 4px); font: 600 13px/1 var(--f-mono, monospace); letter-spacing: .12em; color: var(--signal, #f5b301);
  text-shadow: 0 1px 4px rgba(0, 0, 0, .85); opacity: 0; pointer-events: none; transition: opacity .12s, transform .18s; white-space: nowrap; z-index: 6; }
.jm-pick.on { opacity: 1; transform: translate(-50%, 0); }
`;

/**
 * 拿到手的反馈。G.events 的 objective:done 里按 id 找到目标；只对点一下的目标做。
 * opts：{ scene, camera, ui }。返回 { update(dt), active（正在飞的个数）, dispose() }
 */
export function createPickupFx(G, { scene, camera, ui } = {}, P = PICKUP) {
  const flying = [], el = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (el) { el.className = 'jm-pick'; (ui || document.body).appendChild(el); }
  let toastT = 0, dipT = -1;
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const objectiveOf = (id) => (G.game?.run?.relays || []).find((r) => r.id === id)?.o || G.missions?.state?.mission?.objectives?.find((o) => o.id === id) || null;
  /** 东西的那一部分（cutHide 的那一组）原样复制一份放到世界里飞（共用几何和材质，不新建贴图） */
  function launch(o) {
    const root = o.object; if (!root || !scene) return;
    let part = null; root.traverse((c) => { if (!part && c !== root && (c.userData.cutHide || c.userData.pickup)) part = c; });
    if (!part) return;
    root.updateMatrixWorld(true);
    const ghost = part.clone(true); ghost.traverse((c) => { c.visible = !c.userData.beacon; });
    part.matrixWorld.decompose(tmp, q, s); ghost.position.copy(tmp); ghost.quaternion.copy(q); ghost.scale.copy(s); ghost.matrixAutoUpdate = true;
    scene.add(ghost); flying.push({ g: ghost, t: 0, from: tmp.clone(), s0: s.clone() });
  }
  function onDone(e) {
    const o = objectiveOf(e?.id); if (!o || !tapObjective(o)) return;
    const kind = o.stageKind || o.kind;
    if (P.flyKinds.includes(kind)) launch(o);
    if (kind !== 'fuel') dipT = 0; // 抬油桶：枪本来就放低了
    G.audio?.play?.('reload', { gain: 0.42, pitch: 1.35 });
    const name = shortName(o.label);
    if (el && name) { el.textContent = `拿到 · ${name}`; el.classList.add('on'); toastT = P.toast; }
  }
  G.events?.on?.('objective:done', onDone);
  const ahead = new THREE.Vector3();
  return {
    get active() { return flying.length; },
    update(dt) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]; f.t += dt; const k = Math.min(1, f.t / P.fly), e = k * k * (3 - 2 * k);
        if (camera) { camera.getWorldPosition(ahead); camera.getWorldDirection(tmp); ahead.addScaledVector(tmp, 0.45).y -= 0.22; } else ahead.copy(f.from);
        f.g.position.lerpVectors(f.from, ahead, e); f.g.scale.copy(f.s0).multiplyScalar(Math.max(0.05, 1 - 0.85 * e));
        if (k >= 1) { f.g.removeFromParent(); flying.splice(i, 1); }
      }
      if (dipT >= 0) { dipT += dt; const k = dipT / P.dip.t; G.arms?.setLowered?.(k >= 1 ? 0 : Math.sin(Math.PI * k) * P.dip.k); if (k >= 1) dipT = -1; }
      if (toastT > 0 && (toastT -= dt) <= 0) el?.classList.remove('on');
    },
    dispose() { G.events?.off?.('objective:done', onDone); for (const f of flying.splice(0)) f.g.removeFromParent(); el?.remove(); },
  };
}
