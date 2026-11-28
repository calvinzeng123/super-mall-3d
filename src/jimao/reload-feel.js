// 换弹的「分量」：弹匣拔出、拍进去、拉机柄 / 按空仓挂机、撅把合上那几下，枪身（第一人称模型）被顶一下再弹回来，
// 镜头跟着轻轻一磕、一震（用户：喜欢换弹时那一下晃动，要更有劲）。每把枪一套手感：步枪沉、冲锋枪利索、手枪轻快、榴弹枪最重。
// 只听 weapon:reload 事件（各把枪自己发：start / magout / magin / tap / bolt / done），不碰换弹本身的时间和弹药。
// 弹簧：位置三轴 + 转角三轴，偏欠阻尼（顶出去、回弹一点就停）；另外叠一段高频、很快衰减的「咔」的抖动。
// 镜头只加很小的俯仰 / 滚转（transient，不改瞄准方向），外加一点原游戏的镜头抖动（addShake）——看得出用劲，不晕。

/**
 * 每个阶段的冲量：p 位置（米 / 秒，镜头坐标：x 右、y 上、z 后）、r 转角（弧度 / 秒：x 枪口抬、y 枪口左、z 逆时针滚），
 * buzz 高频抖动幅度（弧度）、shake 原游戏镜头抖动、cam 镜头俯仰 / 滚转的冲量（弧度 / 秒）。
 */
export const RELOAD_FEEL = Object.freeze({
  rifle: Object.freeze({
    start: { p: [0, -0.05, 0.04], r: [-0.25, 0, 0.3], buzz: 0, shake: 0.05, cam: [0.03, 0] },
    magout: { p: [0, -0.26, 0.05], r: [-0.9, 0.1, 0.55], buzz: 0.012, shake: 0.12, cam: [-0.16, 0.12] },
    magin: { p: [0, 0.42, 0.14], r: [1.45, -0.12, -0.7], buzz: 0.022, shake: 0.22, cam: [0.34, -0.18] },
    tap: { p: [0, 0.3, 0.06], r: [0.95, 0, -0.35], buzz: 0.016, shake: 0.16, cam: [0.22, -0.08] },
    bolt: { p: [0.02, 0.06, 0.4], r: [0.6, 0.18, 0.5], buzz: 0.02, shake: 0.2, cam: [0.26, 0.14] },
    done: { p: [0, 0.06, 0], r: [0.2, 0, 0], buzz: 0, shake: 0, cam: [0, 0] },
  }),
  smg: Object.freeze({
    start: { p: [0, -0.04, 0.03], r: [-0.2, 0, 0.25], buzz: 0, shake: 0.04, cam: [0.02, 0] },
    magout: { p: [0, -0.2, 0.04], r: [-0.7, 0.08, 0.45], buzz: 0.01, shake: 0.1, cam: [-0.12, 0.1] },
    magin: { p: [0, 0.36, 0.1], r: [1.25, -0.1, -0.6], buzz: 0.02, shake: 0.19, cam: [0.28, -0.14] },
    bolt: { p: [0.015, 0.05, 0.32], r: [0.5, 0.14, 0.4], buzz: 0.018, shake: 0.16, cam: [0.2, 0.1] },
    done: { p: [0, 0.05, 0], r: [0.16, 0, 0], buzz: 0, shake: 0, cam: [0, 0] },
  }),
  pistol: Object.freeze({
    start: { p: [0, -0.03, 0.02], r: [-0.15, 0, 0.2], buzz: 0, shake: 0.03, cam: [0.015, 0] },
    magout: { p: [0, -0.16, 0.03], r: [-0.55, 0.05, 0.3], buzz: 0.008, shake: 0.07, cam: [-0.08, 0.06] },
    magin: { p: [0, 0.32, 0.06], r: [1.1, -0.06, -0.4], buzz: 0.018, shake: 0.16, cam: [0.22, -0.1] },
    bolt: { p: [0, 0.08, 0.3], r: [0.7, 0.1, 0.25], buzz: 0.02, shake: 0.15, cam: [0.2, 0.08] },
    done: { p: [0, 0.04, 0], r: [0.12, 0, 0], buzz: 0, shake: 0, cam: [0, 0] },
  }),
  launcher: Object.freeze({
    start: { p: [0, -0.06, 0.05], r: [-0.3, 0, 0.3], buzz: 0, shake: 0.06, cam: [0.03, 0] },
    magout: { p: [0, -0.34, 0.06], r: [-1.2, 0.05, 0.35], buzz: 0.016, shake: 0.18, cam: [-0.22, 0.1] },  // 枪管撅开
    magin: { p: [0, 0.2, 0.18], r: [0.6, 0, -0.3], buzz: 0.014, shake: 0.12, cam: [0.14, -0.06] },      // 榴弹推进弹膛
    bolt: { p: [0, 0.5, 0.12], r: [1.7, -0.08, -0.5], buzz: 0.026, shake: 0.26, cam: [0.4, -0.14] },     // 合上枪管：最重的一下
    done: { p: [0, 0.05, 0], r: [0.15, 0, 0], buzz: 0, shake: 0, cam: [0, 0] },
  }),
});
/** 弹簧：k 刚度、c 阻尼（位置 / 转角共用）；camK / camC 镜头那一路；buzzHz 抖动频率、buzzDecay 衰减（1/秒） */
export const FEEL_SPRING = Object.freeze({ k: 210, c: 17, camK: 260, camC: 22, buzzHz: 38, buzzDecay: 16, maxP: 0.06, maxR: 0.16, maxCam: 0.025 });

/** 一阶段的冲量（找不到就是 null）。kind 缺省 = 步枪（原游戏步枪发的事件不带 kind） */
export function feelFor(kind, phase, T = RELOAD_FEEL) { return T[kind || 'rifle']?.[phase] || null; }

/** 弹簧走一步（纯函数式写法，就地改 s：{ x, v }） */
export function springStep(s, k, c, dt) { s.v += (-k * s.x - c * s.v) * dt; s.x += s.v * dt; return s; }

/**
 * G：要有 events.on；player.addShake 可选。返回 { kick(kind, phase), update(dt), apply(root), camera(cam), state, dispose() }。
 * apply 把当前偏移加在某把枪的第一人称模型上（每帧那把枪摆完自己的位置以后调）；camera 把镜头俯仰 / 滚转加上（镜头每帧都由玩家重算，所以只影响这一帧）。
 */
export function createReloadFeel(G, { T = RELOAD_FEEL, K = FEEL_SPRING } = {}) {
  const ax = () => ({ x: 0, v: 0 });
  const S = { p: [ax(), ax(), ax()], r: [ax(), ax(), ax()], cam: [ax(), ax()], buzz: 0, buzzT: 9, time: 0, hits: 0 };
  function kick(kind, phase) {
    const f = feelFor(kind, phase, T); if (!f) return false;
    for (let i = 0; i < 3; i++) { S.p[i].v += f.p[i]; S.r[i].v += f.r[i]; }
    S.cam[0].v += f.cam[0]; S.cam[1].v += f.cam[1];
    if (f.buzz) { S.buzz = Math.max(S.buzz * Math.exp(-K.buzzDecay * S.buzzT), f.buzz); S.buzzT = 0; }
    if (f.shake) G.player?.addShake?.(f.shake);
    S.hits++;
    return true;
  }
  const off = G.events?.on?.('weapon:reload', (e) => { if (e && !e.draw) kick(e.kind, e.phase); });
  const clampA = (a, m) => { if (a.x > m) { a.x = m; if (a.v > 0) a.v = 0; } else if (a.x < -m) { a.x = -m; if (a.v < 0) a.v = 0; } };
  function update(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.05); S.time += dt; S.buzzT += dt;
    // 小步长：刚度高，手机 30 帧一步算会发散
    for (let n = Math.max(1, Math.ceil(dt * 240)), h = dt / n, i = 0; i < n; i++) {
      for (const a of S.p) { springStep(a, K.k, K.c, h); clampA(a, K.maxP); }
      for (const a of S.r) { springStep(a, K.k, K.c, h); clampA(a, K.maxR); }
      for (const a of S.cam) { springStep(a, K.camK, K.camC, h); clampA(a, K.maxCam); }
    }
  }
  const buzzNow = () => S.buzz * Math.exp(-K.buzzDecay * S.buzzT) * Math.sin(S.buzzT * K.buzzHz * Math.PI * 2);
  function apply(root) {
    if (!root) return;
    const b = buzzNow();
    root.position.x += S.p[0].x; root.position.y += S.p[1].x; root.position.z += S.p[2].x;
    root.rotateX(S.r[0].x + b); root.rotateY(S.r[1].x); root.rotateZ(S.r[2].x - 0.6 * b);
  }
  function camera(cam) { if (!cam) return; const b = buzzNow(); cam.rotateX(S.cam[0].x + 0.25 * b); cam.rotateZ(S.cam[1].x); }
  return {
    kick, update, apply, camera, state: S,
    /** 现在偏了多少（测试、调试用） */
    get offset() { return { p: S.p.map((a) => a.x), r: S.r.map((a) => a.x), cam: S.cam.map((a) => a.x), buzz: buzzNow() }; },
    reset() { for (const a of [...S.p, ...S.r, ...S.cam]) { a.x = 0; a.v = 0; } S.buzz = 0; S.buzzT = 9; },
    dispose() { if (typeof off === 'function') off(); },
  };
}
