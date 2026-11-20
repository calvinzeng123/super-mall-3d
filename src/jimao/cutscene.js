// 零点突围的过场镜头（都是现场用游戏画面拍的，没有预录视频）：
//   开局：夜里从空中推向商场（黑场淡入、上下遮幅、地点卡）→ 一个短黑场切进室内 → 人从蹲姿站起来、抬头、把枪端起来 → 交还操作。
//   撤离：坐上直升机 / 接应车打完最后一段以后，镜头切到机外（车外）：载具从镜头旁边掠过、远去，压暗，再进结算页。
// 这里只算「这一刻镜头在哪、看哪、枪放多低、压多暗」，全是纯函数；谁来调：开局是 run.js 每帧问 intro.view()，撤离是 missions.js 的 outro 阶段。
// 任意键 / 点一下跳过开局过场（重新出击、从登机点重来时原游戏本来就只有 1.3 秒，不放过场）。
import * as THREE from 'three';

export const CUT = Object.freeze({
  intro: 6.9,        // 开局过场总长（秒）；原游戏 3.5 秒只是黑场淡入
  aerial: 3.6,       // 空中镜头到这一秒为止
  dip: 0.28,         // 切镜头时前后各压黑这么久
  rise: 2.3,         // 室内：起身 + 抬头 + 举枪
  crouch: 0.72,      // 起身前眼睛离站立高度低多少米
  far: 215, near: 168, high: 96, low: 70, // 空中镜头离屋顶中心的水平距离、离屋面的高度（起 → 止）
  outro: Object.freeze({ helicopter: 4.4, car: 4.3 }), // 机外 / 车外镜头时长
  heliLead: 4.4,     // 直升机「离开」那 6 秒里，最后这么多秒改用机外镜头
  heliAhead: 2.1,    // 机外镜头架在直升机这么多秒以后会经过的地方
  heliSide: 17, heliBelow: 7,
  carStop: 0.6,      // 车停稳多久以后切车外镜头
  carAccel: 6.5, carAhead: 23, carSide: 5.2, carEye: 1.25,
  fadeOut: 1.0,      // 结尾压暗秒数
});

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const UP = new THREE.Vector3(0, 1, 0);
const lookQuat = (eye, target) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, UP));

/**
 * 开局过场第 u 秒的镜头。start = 开局点 { pos(脚底), yaw }，eye = 站立眼高，center = 屋顶中心 { x, z }，roofY = 屋面标高。
 * 返回 { shot: 'aerial' | 'rise', position, quaternion, dip（切镜头的压黑 0–1）, lowered（枪放低 0–1）, weapon（画不画枪）}；
 * 过场结束（u ≥ aerial + rise）返回 null，镜头交还给玩家。
 */
export function introView(u, { start, eye = 1.62, center, roofY = 30 }, C = CUT) {
  if (!(u >= 0) || u >= C.aerial + C.rise) return null;
  const dip = Math.max(0, 1 - Math.abs(u - C.aerial) / C.dip);
  if (u < C.aerial) {
    // 从开局点那一侧的远处往商场推：人就在镜头正下方那一带
    let dx = start.pos.x - center.x, dz = start.pos.z - center.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const k = u / C.aerial, e = 1 - (1 - k) * (1 - k) * 0.6 - 0.4 * (1 - k); // 先快后慢
    const dist = C.far + (C.near - C.far) * e, h = C.high + (C.low - C.high) * e, drift = (k - 0.5) * 16;
    const position = new THREE.Vector3(center.x + dx * dist - dz * drift, roofY + h, center.z + dz * dist + dx * drift);
    const target = new THREE.Vector3(center.x + dx * 18, roofY - 6, center.z + dz * 18);
    return { shot: 'aerial', position, quaternion: lookQuat(position, target), dip, lowered: 1, weapon: false };
  }
  // 室内：蹲着、低头看左下方 → 站直、平视前方；枪在后半段端起来
  const t = u - C.aerial, k = smooth(t / C.rise), up = smooth(t / (C.rise * 0.8));
  const bob = Math.sin(Math.min(1, t / C.rise) * Math.PI) * 0.035;
  const position = new THREE.Vector3(start.pos.x, start.pos.y + eye - C.crouch * (1 - up) + bob, start.pos.z);
  const euler = new THREE.Euler(-0.4 * (1 - k), start.yaw + 0.26 * (1 - smooth(t / (C.rise * 0.9))), -0.03 * Math.sin(k * Math.PI), 'YXZ');
  return { shot: 'rise', position, quaternion: new THREE.Quaternion().setFromEuler(euler), dip, lowered: 1 - smooth((t - C.rise * 0.42) / (C.rise * 0.5)), weapon: true };
}

/** 车外镜头里接应车的位姿：从停下的地方（pose0）沿车头方向匀加速开走。返回 { pose, speed } */
export function carOutroPose(pose0, t, C = CUT) {
  const d = 0.5 * C.carAccel * t * t;
  return { pose: { ...pose0, x: pose0.x + pose0.dir.x * d, z: pose0.z + pose0.dir.z * d, pitch: -0.012 * smooth(t / 0.5) * (1 - smooth((t - 1.2) / 1.5)) }, speed: C.carAccel * t };
}

/**
 * 车外 / 机外镜头的机位（整段不动，只转头跟着载具）。
 * 直升机：架在它 heliAhead 秒后要经过的地方，往旁边让开、压低一点（poseAt(dt) 给出 dt 秒后的位姿）；
 * 接应车：架在前方路边，蹲着的高度。away = 商场中心 { x, z }：机位放在背着商场的那一边，载具后面的背景就是商场。
 */
export function outroCamera(kind, pose0, { poseAt = null, away = null } = {}, C = CUT) {
  const heli = kind === 'helicopter', a = heli ? poseAt(C.heliAhead) : pose0;
  let fx, fz;
  if (heli) { const b = poseAt(C.heliAhead + 0.2); fx = b.x - a.x; fz = b.z - a.z; const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L; } else ({ x: fx, z: fz } = pose0.dir);
  const side = away && (-fz * (a.x - away.x) + fx * (a.z - away.z)) < 0 ? -1 : 1;
  if (heli) return new THREE.Vector3(a.x - fz * C.heliSide * side, a.y - C.heliBelow, a.z + fx * C.heliSide * side);
  return new THREE.Vector3(a.x + fx * C.carAhead - fz * C.carSide * side, a.y + C.carEye, a.z + fz * C.carAhead + fx * C.carSide * side);
}

/** 结尾压暗：最后 fadeOut 秒从 0 到 0.9 */
export const outroFade = (kind, t, C = CUT) => 0.9 * smooth((t - (C.outro[kind] - C.fadeOut)) / C.fadeOut);

export const CUTSCENE_CSS = `
.jm-bars { position: fixed; inset: 0; z-index: 6; pointer-events: none; }
.jm-bars::before, .jm-bars::after { content: ''; position: absolute; left: 0; right: 0; height: 11vh; background: #000; transition: transform .45s cubic-bezier(.3, 0, .2, 1); }
.jm-bars::before { top: 0; transform: translateY(-101%); } .jm-bars::after { bottom: 0; transform: translateY(101%); }
.jm-bars.on::before, .jm-bars.on::after { transform: none; }
.jm-bars .cap { position: absolute; left: max(22px, env(safe-area-inset-left)); bottom: calc(11vh + 14px); font: 600 12px/1.5 ui-monospace, 'PingFang SC', 'Microsoft YaHei', monospace;
  letter-spacing: .28em; color: rgba(236, 232, 222, .92); text-shadow: 0 1px 6px #000; opacity: 0; transition: opacity .5s ease .25s; white-space: pre-line; }
.jm-bars .cap b { display: block; font-size: 19px; letter-spacing: .34em; color: #ffb347; font-weight: 800; margin-bottom: 3px; }
.jm-bars.on .cap { opacity: 1; }
.jm-bars .skip { position: absolute; right: max(18px, env(safe-area-inset-right)); bottom: calc(11vh + 12px); font-size: 11px; letter-spacing: .2em; color: rgba(236, 232, 222, .45); opacity: 0; transition: opacity .4s; }
.jm-bars.on.can-skip .skip { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .jm-bars::before, .jm-bars::after { transition: none; } }`;

/**
 * 遮幅 + 字幕 + 开局过场的计时和跳过。
 * G.introFull（原游戏的补丁记的）：这一次开局是完整开场（true）还是重新出击的短开场（false）；G.cutSkip = true 让原游戏立刻结束开场。
 * intro.view(dt) 每帧调一次：还在放就返回 introView 的结果（多一个 fade = 这一帧画面该压多暗），否则 null。
 */
export function createCutscenes(G, { ui, start, eye = 1.62, center, roofY = 30, post = null, doc = typeof document === 'undefined' ? null : document }) {
  let bars = null, cap = null, u = 0, was = '', skipped = false, shot = '';
  if (doc && ui) {
    bars = doc.createElement('div'); bars.className = 'jm-bars';
    cap = doc.createElement('div'); cap.className = 'cap';
    const skip = doc.createElement('div'); skip.className = 'skip'; skip.textContent = '点击跳过';
    bars.append(cap, skip); ui.append(bars);
  }
  const letterbox = (on, text = null, canSkip = false) => {
    if (!bars) return;
    bars.classList.toggle('on', !!on); bars.classList.toggle('can-skip', !!on && canSkip);
    if (on && text != null) cap.innerHTML = text;
  };
  const skip = () => { if (G.game?.state === 'intro' && G.introFull && u > 0.6 && !skipped) { skipped = true; G.cutSkip = true; } };
  const onKey = (e) => { if (!e.repeat) skip(); };
  if (typeof addEventListener === 'function') { addEventListener('keydown', onKey); addEventListener('pointerdown', skip); }
  const intro = {
    get playing() { return G.game?.state === 'intro' && !!G.introFull && !skipped && u < CUT.aerial + CUT.rise; },
    get time() { return u; },
    view(dt) {
      const st = G.game?.state;
      if (st !== was) { if (st === 'intro') { u = 0; skipped = false; } if (was === 'intro') letterbox(false); was = st; }
      if (st !== 'intro' || !G.introFull || skipped) {
        if (shot) { shot = ''; letterbox(false); G.arms?.setLowered?.(0); G.weapon?.setVisible?.(true); }
        return null;
      }
      u += dt;
      const v = introView(u, { start: G.level?.playerStart || start, eye, center, roofY });
      letterbox(u < CUT.aerial + CUT.rise - 0.5, '', u > 0.6); // 字幕清空（上一局撤离的「撤离成功」别留到这一局）
      if (!v) { if (shot) { shot = ''; G.arms?.setLowered?.(0); G.weapon?.setVisible?.(true); } return null; }
      if (v.shot !== shot) { shot = v.shot; G.weapon?.setVisible?.(v.weapon); }
      G.arms?.setLowered?.(v.lowered);
      return { ...v, fade: Math.max(post?.fade ?? 0, v.dip) };
    },
  };
  return { intro, letterbox, skip,
    dispose() { bars?.remove(); if (typeof removeEventListener === 'function') { removeEventListener('keydown', onKey); removeEventListener('pointerdown', skip); } } };
}
