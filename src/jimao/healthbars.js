// 丧尸围城的血条：
//   普通丧尸——被打中以后头顶亮 2.6 秒血条（没打过的不显示，免得一屏幕都是条）；
//   特殊感染者——26 米内、看得见、已经发现人的，一直显示（琥珀色，条更长），旁边不写字：名字由阿哲喊；
//   巨尸——屏幕上方另有一条大的（名字 + 血量），它在场就一直在；
//   队友——名牌下面一条小的绿条（左下角的队友栏照旧）。
// 条是跟着镜头转的小片（Sprite），被墙挡住就看不见——不靠血条透视找丧尸。只在丧尸围城里开。
import * as THREE from 'three';

/** show：打中后亮几秒；special：特殊感染者多远以内常亮；pool：同时最多几条；w / h：1 米宽对应多少血、条高（米） */
export const BARS = Object.freeze({ show: 2.6, special: 26, pool: 14, min: 0.42, max: 1.25, h: 0.05, rise: 0.16, boss: 60 });

/** 血条多宽（米）：血越厚越长，开方压一压——行尸 60 血约 0.5 米，巨尸 1300 血封顶 1.25 米。纯函数 */
export const barWidth = (maxHp, B = BARS) => Math.max(B.min, Math.min(B.max, 0.065 * Math.sqrt(Math.max(1, maxHp))));

/**
 * 该给谁画血条。zombies：[{ pos, alive, active, hp, maxHp, special, zs, hitAt }]；eye：镜头位置；now：现在的时间。
 * 返回按距离排好、最多 pool 个。纯函数（看不看得见由渲染时的深度测试管）。
 */
export function pickBars(zombies, eye, now, B = BARS) {
  const out = [];
  for (const z of zombies) {
    if (!z.alive || !z.active || !(z.maxHp > 0)) continue;
    const d = Math.hypot(z.pos.x - eye.x, z.pos.y - eye.y, z.pos.z - eye.z);
    const hit = z.hitAt != null && now - z.hitAt < B.show, sp = !!z.special && z.zs !== 'idle' && d < B.special;
    if (hit || sp) out.push({ z, d });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, B.pool);
}

export const BARS_CSS = `
.jm-boss { position: absolute; left: 50%; top: calc(84px + var(--sat, 0px)); transform: translateX(-50%); z-index: 3; pointer-events: none; width: min(46vw, 420px); display: grid; gap: 5px; font: 700 13px/1 var(--f-label, sans-serif); letter-spacing: .3em; color: #ffb38a; text-align: center; text-shadow: 0 1px 4px rgba(0, 0, 0, .8); }
.jm-boss.off { display: none; }
.jm-boss i { display: block; height: 7px; background: rgba(0, 0, 0, .55); border: 1px solid rgba(255, 140, 90, .5); }
.jm-boss i b { display: block; height: 100%; background: linear-gradient(90deg, #c8321e, #ff7a3c); }
.is-touch .jm-boss { top: calc(80px + var(--sat, 0px)); width: min(40vw, 300px); }
`;

/**
 * 接到游戏上。camera：镜头；zombies：丧尸池（alive()）；squad：队友（mates）；ui：界面根节点（放巨尸那条）。
 * 返回 { enabled（读写）, update(dt), buildUi(), bars, dispose() }。
 */
export function createHealthBars(G, { scene, camera, zombies, squad = null, ui = null, B = BARS } = {}) {
  const group = new THREE.Group(); group.name = 'health-bars'; scene?.add(group);
  const mat = (color, opacity = 1) => new THREE.SpriteMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false });
  const M = { back: mat(0x0a0b0c, 0.72), red: mat(0xe2452e), amber: mat(0xf3a833), green: mat(0x86e3a4) };
  const make = () => {
    const back = new THREE.Sprite(M.back), fill = new THREE.Sprite(M.red);
    back.center.set(0, 0.5); fill.center.set(0, 0.5); back.renderOrder = 6; fill.renderOrder = 7; back.visible = fill.visible = false;
    group.add(back, fill);
    return { back, fill };
  };
  const bars = Array.from({ length: B.pool }, make), mateBars = (squad?.mates || []).map(make);
  const right = new THREE.Vector3(), eye = new THREE.Vector3(), at = new THREE.Vector3();
  let enabled = false, now = 0, boss = null;
  G.events?.on?.('enemy:hit', (e) => { if (e?.enemy) e.enemy.hitAt = now; });

  /** 把一条摆到 head 上方：宽 w、剩 frac */
  function place(bar, head, w, frac, fillMat) {
    at.copy(head).addScaledVector(right, -w / 2);
    bar.back.position.copy(at); bar.back.scale.set(w, B.h, 1); bar.back.visible = true;
    bar.fill.material = fillMat; bar.fill.position.copy(at); bar.fill.scale.set(Math.max(0.001, w * Math.max(0, Math.min(1, frac))), B.h * 0.72, 1); bar.fill.visible = frac > 0;
  }
  const hide = (bar) => { bar.back.visible = bar.fill.visible = false; };

  const api = {
    bars, mateBars,
    get enabled() { return enabled; }, set enabled(v) { enabled = !!v; if (!enabled) { bars.forEach(hide); mateBars.forEach(hide); boss?.classList.add('off'); } },
    get now() { return now; },
    update(dt) {
      now += dt;
      if (!enabled) return;
      camera.getWorldPosition(eye); right.set(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      const zs = zombies?.alive?.() || [], list = G.game?.state === 'playing' ? pickBars(zs, eye, now, B) : [];
      bars.forEach((bar, i) => {
        const it = list[i]; if (!it) { hide(bar); return; }
        const z = it.z, s = z.scale || 1;
        place(bar, at.set(z.pos.x, z.pos.y + 1.86 * s + B.rise, z.pos.z).clone(), barWidth(z.maxHp, B), z.hp / z.maxHp, z.special ? M.amber : M.red);
      });
      // 队友：名牌下面
      (squad?.mates || []).forEach((m, i) => {
        const bar = mateBars[i]; if (!bar) return;
        if (!squad.enabled || !m.root.visible || m.pos.distanceTo(eye) > 30) { hide(bar); return; }
        place(bar, at.set(m.pos.x, m.pos.y + (m.down ? 0.75 : 1.9), m.pos.z).clone(), 0.5, m.down ? m.reviveT : m.hp / m.maxHp, m.down ? M.amber : M.green);
      });
      // 巨尸：屏幕上方的大血条
      if (boss) {
        const b = zs.filter((z) => z.kind === 'brute' && z.zs !== 'idle').sort((p, q) => p.pos.distanceTo(eye) - q.pos.distanceTo(eye))[0];
        const on = !!b && b.pos.distanceTo(eye) < B.boss && G.game?.state === 'playing';
        boss.classList.toggle('off', !on);
        if (on) boss.querySelector('b').style.width = `${Math.max(0, Math.min(100, b.hp / b.maxHp * 100))}%`;
      }
    },
    buildUi() {
      if (!ui || typeof document === 'undefined' || boss) return;
      boss = document.createElement('div'); boss.className = 'jm-boss off'; boss.innerHTML = '<span>巨尸</span><i><b></b></i>';
      (ui.querySelector('.hud') || ui).appendChild(boss);
    },
    dispose() { group.removeFromParent(); for (const m of Object.values(M)) m.dispose(); boss?.remove(); },
  };
  return api;
}
