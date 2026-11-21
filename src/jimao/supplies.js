// 丧尸围城的补给：血不会自己回，得靠身上带的东西——
//   医疗包：包扎 2.6 秒，回 80 点；只带得下 1 个。包扎时开枪、被扑倒会打断（东西不扣）。
//   止痛药：半秒吞下去，回 30 点；带 2 瓶。
// 一个「治疗」键（H / 手机上的十字键）：伤得重先用医疗包，轻伤先吃药，没有合适的就用剩下的那种。
// 地上的补给走到跟前自动捡（带满了就留在原地）：医疗包、止痛药、手雷、燃烧瓶、诱饵弹、弹匣。
// 放在哪儿由 siege.js 定（武器柜旁、每间放工具的屋里、清掉一道关以后的安全点）。
import * as THREE from 'three';
import { AMMO } from './ammo.js';

/** heal：回多少；time：用多久（秒）；max：带几个；color：地上那圈光的颜色。light：伤到多少以内算轻伤（先吃药） */
export const SUPPLY = Object.freeze({
  medkit: Object.freeze({ name: '医疗包', max: 1, heal: 80, time: 2.6, color: 0x5aff8a }),
  pills: Object.freeze({ name: '止痛药', max: 2, heal: 30, time: 0.5, color: 0xffe9a0 }),
  frag: Object.freeze({ name: '手雷', color: 0xb9d27a }),
  fire: Object.freeze({ name: '燃烧瓶', color: 0xff8a30 }),
  lure: Object.freeze({ name: '诱饵弹', color: 0xff4a6a }),
  ammo: Object.freeze({ name: '弹匣', give: 45, color: 0x8ecbff }),
  smg: Object.freeze({ name: '冲锋枪', color: 0xffffff }),
  launcher: Object.freeze({ name: '榴弹枪', color: 0xffc04a }),
  shell: Object.freeze({ name: '榴弹', give: 2, color: 0xffc04a }),
  light: 40, pickR: 1.3, restoreHp: 60,
});
export const SUPPLY_KINDS = Object.freeze(['medkit', 'pills', 'frag', 'fire', 'lure', 'ammo', 'smg', 'launcher', 'shell']);

/** 这一下该用哪样：hp / max 是现在和满的血量，inv = { medkit, pills }。纯函数；不用治（或没东西）返回 null */
export function healChoice(hp, max, inv, S = SUPPLY) {
  const missing = max - hp;
  if (!(missing > 0.5)) return null;
  if (inv.pills > 0 && (missing <= S.light || !(inv.medkit > 0))) return 'pills';
  return inv.medkit > 0 ? 'medkit' : null;
}

export const MEDIC_CSS = `
.jm-heal { position: absolute; left: calc(22px + var(--sal, 0px)); bottom: calc(128px + var(--sab, 0px)); z-index: 3; pointer-events: none; font: 600 12px/1.5 var(--f-label, sans-serif); letter-spacing: .12em; color: var(--bone, #e8e4da); text-shadow: 0 1px 4px rgba(0, 0, 0, .7); }
.jm-heal.off { display: none; }
.jm-heal b { color: #ff8a7a; font-weight: 700; }
.jm-heal i { font-style: normal; opacity: .65; }
.jm-heal .bar { display: block; width: 150px; height: 4px; margin-top: 5px; background: rgba(255, 255, 255, .16); border-radius: 2px; overflow: hidden; visibility: hidden; }
.jm-heal.busy .bar { visibility: visible; }
.jm-heal .bar u { display: block; height: 100%; width: 0; background: #ff8a7a; }
/* 手机上数量写在治疗键上，这一行只在包扎的时候出来（进度条），放在响动条下面——屏幕中下是字幕 */
.is-touch .jm-heal { display: none; left: 50%; bottom: auto; top: calc(118px + var(--sat, 0px)); transform: translateX(-50%); text-align: center; }
.is-touch .jm-heal.busy:not(.off) { display: block; }
.is-touch .jm-heal .bar { margin-inline: auto; }
.is-touch .jm-heal i { display: none; }
.t-heal { width: 50px; height: 50px; right: calc(248px + var(--sar)); bottom: calc(186px + var(--sab)); border-color: #ff8a7a; color: #ffc2b8; }
.t-heal.off { display: none; }
.t-heal.empty { opacity: .4; }
`;

function models() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...o });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
  const cyl = (r, h, m, x = 0, y = 0, z = 0, r2 = r) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, 12), m); c.position.set(x, y, z); return c; };
  const group = (...parts) => { const g = new THREE.Group(); g.add(...parts); return g; };
  const red = std('#2f7a46', { emissive: '#0c3a1a', emissiveIntensity: 0.6 }), // 医疗包：绿底白十字
     white = std('#f0ede6', { emissive: '#8a8780', emissiveIntensity: 0.5 }), dark = std('#22252a', { metalness: 0.5 });
  const amber = std('#c9892c', { emissive: '#6a3a08', emissiveIntensity: 0.7, roughness: 0.25 }), olive = std('#4c5a34', { emissive: '#1c240c', emissiveIntensity: 0.5 }), blue = std('#3a5878', { emissive: '#10283a', emissiveIntensity: 0.6 });
  return {
    medkit: () => group(box(0.3, 0.2, 0.12, red, 0, 0.1, 0), box(0.12, 0.035, 0.125, white, 0, 0.1, 0), box(0.035, 0.12, 0.125, white, 0, 0.1, 0), box(0.12, 0.02, 0.03, dark, 0, 0.21, 0)),
    pills: () => group(cyl(0.035, 0.085, amber, 0, 0.045, 0), cyl(0.037, 0.022, white, 0, 0.098, 0), box(0.071, 0.035, 0.005, white, 0, 0.045, 0.034)),
    frag: () => group(new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), olive).translateY(0.06), cyl(0.018, 0.04, dark, 0, 0.125, 0), box(0.012, 0.07, 0.03, dark, 0.03, 0.11, 0)),
    fire: () => group(cyl(0.04, 0.16, amber, 0, 0.08, 0), cyl(0.016, 0.07, amber, 0, 0.195, 0, 0.014), box(0.03, 0.06, 0.03, white, 0, 0.25, 0)),
    lure: () => group(cyl(0.045, 0.13, dark, 0, 0.065, 0), cyl(0.012, 0.06, dark, 0, 0.16, 0), new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), std('#ff2a1a', { emissive: '#ff2a1a', emissiveIntensity: 2 })).translateY(0.2)),
    launcher: () => group(cyl(0.034, 0.34, dark, 0, 0.13, -0.12).rotateX(Math.PI / 2), box(0.05, 0.07, 0.13, dark, 0, 0.12, 0.1), box(0.04, 0.06, 0.2, olive, 0, 0.11, 0.26), box(0.035, 0.1, 0.045, dark, 0, 0.04, 0.12)),
    shell: () => group(cyl(0.024, 0.09, std('#b8923c', { metalness: 0.8, roughness: 0.3, emissive: '#3a2a08', emissiveIntensity: 0.6 }), -0.03, 0.045, 0), cyl(0.024, 0.09, olive, 0.03, 0.045, 0), new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 6), olive).translateX(0.03).translateY(0.09)),
    smg: () => group(box(0.05, 0.07, 0.36, dark, 0, 0.12, 0), box(0.04, 0.13, 0.05, dark, 0, 0.04, 0.08), box(0.035, 0.16, 0.045, dark, 0, 0.02, -0.05), cyl(0.02, 0.16, dark, 0, 0.12, -0.26).rotateX(Math.PI / 2), box(0.03, 0.05, 0.14, dark, 0, 0.11, 0.24)),
    ammo: () => group(box(0.07, 0.2, 0.045, blue, 0, 0.1, 0), box(0.07, 0.2, 0.045, blue, 0.085, 0.1, 0.01), box(0.05, 0.02, 0.03, std('#c8a24a', { metalness: 0.8, roughness: 0.3 }), 0, 0.21, 0)),
  };
}

/**
 * 接到游戏上。actions：投掷物那边（give(n, kind)）；ammo：弹药那边（give(n, why)）；isTouch：手机上多一个治疗键。
 * 返回 { inv, give(kind, n), heal(), place(kind, pos), drops, snapshot(), restore(snap), reset(), update(dt), buildUi(), enabled, dispose() }。
 */
export function createSupplies(G, { scene, ui = null, actions = null, ammo = null, rng = Math.random, P = SUPPLY } = {}) {
  const root = new THREE.Group(); root.name = '补给'; scene?.add(root);
  const make = models(), inv = { medkit: 0, pills: 0 }, drops = [];
  const haloGeo = new THREE.RingGeometry(0.2, 0.34, 20).rotateX(-Math.PI / 2);
  const halos = {};
  const haloOf = (k) => (halos[k] ||= new THREE.MeshBasicMaterial({ color: P[k].color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  let enabled = false, busy = null, hud = null, btn = null, tellT = 0, want = false;
  const say = (t, s = 2) => G.hud?.message?.(t, s);
  const player = () => G.player;
  const maxHp = () => player()?.maxHealth ?? 100;

  function paint() {
    const any = inv.medkit + inv.pills > 0;
    if (hud) {
      hud.classList.toggle('off', !enabled);
      hud.classList.toggle('busy', !!busy);
      hud.firstChild.innerHTML = busy ? `<b>${busy.kind === 'medkit' ? '包扎中…' : '吃药…'}</b>` : `医疗包 <b>${inv.medkit}</b>　止痛药 <b>${inv.pills}</b>${any ? '　<i>H 治疗</i>' : ''}`;
      hud.querySelector('u').style.width = busy ? `${Math.min(100, busy.t / busy.time * 100)}%` : '0';
    }
    if (btn) { btn.classList.toggle('off', !enabled); btn.classList.toggle('empty', !any); btn.querySelector('span').textContent = `治疗 ${inv.medkit + inv.pills}`; }
  }

  /** 拿到一样东西（走过去捡 / 安全点发的）。返回实际拿了几个（带满了是 0） */
  function give(kind, n = 1) {
    let got = 0;
    if (kind === 'medkit' || kind === 'pills') { const before = inv[kind]; inv[kind] = Math.min(P[kind].max, before + n); got = inv[kind] - before; }
    else if (kind === 'ammo') { const w = G.weapon; got = ammo?.give && !(w && !w.stub && (w.reserve | 0) >= AMMO.cap) && ammo.give(P.ammo.give * n, '捡到弹匣') > 0 ? 1 : 0; }
    else if (kind === 'smg') got = G.weapon?.grant?.('smg') ? 1 : 0; // 第一次捡：换到手上；已经有了：当两个弹匣
    else if (kind === 'launcher') got = G.weapon?.grant?.('launcher') ? 1 : 0;
    else if (kind === 'shell') got = G.weapon?.owns?.launcher && G.weapon.launcher.addShells(P.shell.give * n) > 0 ? 1 : 0; // 没有榴弹枪的时候捡不了，留在原地
    else got = actions?.give?.(n, kind) || 0;
    paint();
    return got;
  }

  /** 按了治疗键：挑一样开始用。返回用的是哪样（null = 没用上） */
  function heal() {
    const p = player();
    if (!enabled || busy || !p?.alive) return null;
    const kind = healChoice(p.health, maxHp(), inv, P);
    if (!kind) { if (tellT <= 0) { tellT = 1.5; say(inv.medkit + inv.pills > 0 ? '不用治——血是满的' : '身上没有医疗用品', 1.6); } return null; }
    busy = { kind, t: 0, time: P[kind].time };
    G.audio?.play?.('reload', { gain: 0.5, pitch: kind === 'medkit' ? 0.7 : 1.5 });
    G.events?.emit?.('supply:heal-start', { kind });
    paint();
    return kind;
  }
  function cancel(why) { if (!busy) return; busy = null; if (why) say(why, 1.6); paint(); }
  function finish() {
    const p = player(), kind = busy.kind; busy = null;
    inv[kind] = Math.max(0, inv[kind] - 1);
    const before = p.health; p.health = Math.min(maxHp(), p.health + P[kind].heal);
    say(`${P[kind].name} · 生命 +${Math.round(p.health - before)}`, 2);
    G.events?.emit?.('supply:heal', { kind, amount: p.health - before });
    paint();
  }

  /** 在 pos 放一样补给（pos 是地面上的点） */
  function place(kind, pos) {
    if (!P[kind] || !make[kind]) return null;
    const g = new THREE.Group(); g.position.set(pos.x, pos.y, pos.z);
    const model = make[kind](); model.scale.setScalar(1.25); model.position.y = 0.22; g.add(model);
    const halo = new THREE.Mesh(haloGeo, haloOf(kind)); halo.position.y = 0.03; g.add(halo);
    root.add(g);
    const d = { kind, pos: new THREE.Vector3(pos.x, pos.y, pos.z), g, model, halo, t: rng() * 6, fullT: 0 };
    drops.push(d);
    return d;
  }
  const clearDrops = () => { for (const d of drops.splice(0)) d.g.removeFromParent(); };

  // 开枪打断包扎；被扑倒也打断
  G.events?.on?.('weapon:fire', () => { if (busy?.kind === 'medkit') cancel('包扎被打断'); });
  G.events?.on?.('zombie:pin', () => cancel('包扎被打断'));
  const onKey = (e) => { if (e.code === 'KeyH' && !e.repeat && enabled && G.game?.state === 'playing') want = true; };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey);

  const api = {
    inv, give, heal, place, cancel,
    get drops() { return drops; }, get busy() { return busy; },
    get enabled() { return enabled; }, set enabled(v) { v = !!v; if (v !== enabled) { enabled = v; if (!v) { busy = null; clearDrops(); } paint(); } },
    /** 存档点记下身上的东西（投掷物、血量一起） */
    snapshot() { return { medkit: inv.medkit, pills: inv.pills, frag: actions?.countOf?.('frag') ?? 0, fire: actions?.countOf?.('fire') ?? 0, lure: actions?.countOf?.('lure') ?? 0, hp: player()?.health ?? maxHp(), smg: !!G.weapon?.owns?.smg, shells: G.weapon?.owns?.launcher ? (G.weapon.launcher.state.ammo | 0) + (G.weapon.launcher.state.reserve | 0) : -1 }; },
    /** 从存档点重来：身上的东西照存档时的来，血量至少 restoreHp */
    restore(snap) {
      if (!snap) return;
      inv.medkit = Math.min(P.medkit.max, snap.medkit | 0); inv.pills = Math.min(P.pills.max, snap.pills | 0);
      if (actions?.give) { for (const k of ['fire', 'lure']) if (snap[k] > 0) actions.give(snap[k], k); }
      if (snap.smg) G.weapon?.grant?.('smg', { equip: false });
      if (snap.shells >= 0 && G.weapon?.grant?.('launcher', { equip: false })) { const st = G.weapon.launcher.state; st.ammo = Math.min(1, snap.shells); st.reserve = Math.max(0, snap.shells - st.ammo); }
      const p = player(); if (p) p.health = Math.min(maxHp(), Math.max(P.restoreHp, snap.hp || 0));
      paint();
    },
    reset() { inv.medkit = 0; inv.pills = 0; busy = null; want = false; clearDrops(); paint(); },
    update(dt) {
      tellT -= dt;
      if (!btn && G.input?.touch) api.buildUi(); // 手机上的按键层是第一次触屏以后才有的：那时再把治疗键补上
      if (!enabled) return;
      const p = player(), playing = G.game?.state === 'playing' && p?.alive;
      if (want) { want = false; if (playing) heal(); }
      if (busy) {
        if (!playing) busy = null;
        else if ((busy.t += dt) >= busy.time) finish();
        paint();
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.t += dt; d.fullT -= dt;
        d.model.rotation.y = d.t * 1.4; d.model.position.y = 0.22 + Math.sin(d.t * 2.2) * 0.04;
        d.halo.scale.setScalar(1 + Math.sin(d.t * 3) * 0.12);
        if (!playing || Math.abs(d.pos.y - p.pos.y) > 1.7 || Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z) > P.pickR) continue;
        if (give(d.kind, 1) > 0) {
          d.g.removeFromParent(); drops.splice(i, 1);
          if (d.kind === 'smg') say('捡到冲锋枪 · 动静小，按 4 换', 3); else if (d.kind === 'launcher') say('捡到榴弹枪 · 一发一装，按 5 换', 3); else if (d.kind === 'shell') say(`榴弹 +${P.shell.give}`, 1.8); else if (d.kind !== 'ammo') say(`捡到${P[d.kind].name}`, 1.8);
          G.audio?.play?.('reload', { gain: 0.4, pitch: 1.3 });
          G.events?.emit?.('supply:pickup', { kind: d.kind });
        } else if (d.fullT <= 0) { d.fullT = 4; if (d.kind !== 'smg' && !(d.kind === 'shell' && !G.weapon?.owns?.launcher)) say(`${P[d.kind].name}带满了`, 1.5); } // 冲锋枪捡不起来只会是模型还没加载好：不吭声，等一下就能捡
      }
    },
    buildUi() {
      if (!ui || typeof document === 'undefined') return;
      if (!hud) { hud = document.createElement('div'); hud.className = 'jm-heal off'; hud.innerHTML = '<span></span><span class="bar"><u></u></span>'; (ui.querySelector('.hud') || ui).appendChild(hud); }
      const touch = ui.querySelector('.touch');
      if (touch && !btn) {
        btn = document.createElement('button'); btn.className = 't-btn t-heal off'; btn.setAttribute('aria-label', '治疗'); btn.innerHTML = '<span>治疗</span>';
        const down = (e) => { e.preventDefault(); e.stopPropagation(); want = true; };
        btn.addEventListener('touchstart', down, { passive: false });
        touch.appendChild(btn);
      }
      paint();
    },
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey);
      clearDrops(); root.removeFromParent(); haloGeo.dispose(); for (const m of Object.values(halos)) m.dispose(); hud?.remove(); btn?.remove();
    },
  };
  return api;
}
