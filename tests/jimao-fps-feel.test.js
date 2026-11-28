// 第一人称：换弹的分量（reload-feel.js）、手枪 / 榴弹枪的换弹不再「对着空气」、手机按键排布（hud-layout.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RELOAD_FEEL, createReloadFeel, feelFor } from '../src/jimao/reload-feel.js';
import { reloadPose, PISTOL_RELOAD } from '../src/jimao/arsenal.js';
import { breakPose, BREAK } from '../src/jimao/launcher.js';
import { TOUCH_SLOTS, SWAP_SLOT, BUTTON_ICONS, ICONS, HUD_LAYOUT_CSS, TYPE, HUD_COLORS, MARKERS, markerRole, planMarkers, compassX, COMPASS_PX } from '../src/jimao/hud-layout.js';
import { LAYOUT_ITEMS } from '../src/jimao/layout-editor.js';

function events() { const map = new Map(); return { on(n, f) { if (!map.has(n)) map.set(n, []); map.get(n).push(f); return () => map.set(n, map.get(n).filter((g) => g !== f)); }, emit(n, e) { for (const f of map.get(n) || []) f(e); } }; }

test('换弹的分量：每把枪都有拔弹匣 / 插弹匣（榴弹枪是撅开 / 推弹）和上膛那几下；插进去那一下比拔出来重', () => {
  for (const kind of ['rifle', 'smg', 'pistol', 'launcher']) {
    for (const ph of ['magout', 'magin', 'bolt']) assert.ok(feelFor(kind, ph), `${kind} ${ph}`);
    const m = (ph) => Math.hypot(...RELOAD_FEEL[kind][ph].r);
    assert.ok(m('magin') > m('magout') || kind === 'launcher', `${kind} 插弹匣比拔出来猛`);
  }
  assert.equal(feelFor(undefined, 'magin'), RELOAD_FEEL.rifle.magin, '原游戏步枪的事件不带 kind：当步枪');
  assert.equal(feelFor('rifle', 'nope'), null);
});

test('换弹的分量：事件来了枪身顶一下、镜头一磕、抖一下镜头；半秒多就回到原位；不越界（不晕）', () => {
  const ev = events(); let shake = 0;
  const feel = createReloadFeel({ events: ev, player: { addShake: (v) => { shake += v; } } });
  ev.emit('weapon:reload', { phase: 'magin', kind: 'rifle' });
  assert.ok(shake > 0.15, '镜头抖了');
  let peak = 0, peakCam = 0;
  for (let i = 0; i < 12; i++) { feel.update(1 / 60); const o = feel.offset; peak = Math.max(peak, Math.abs(o.r[0])); peakCam = Math.max(peakCam, Math.abs(o.cam[0])); }
  assert.ok(peak > 0.02 && peak <= 0.16 + 1e-9, `枪口抬 ${peak.toFixed(3)} 弧度`);
  assert.ok(peakCam > 0.004 && peakCam <= 0.025 + 1e-9, `镜头磕 ${peakCam.toFixed(4)} 弧度`);
  for (let i = 0; i < 60; i++) feel.update(1 / 60);
  const o = feel.offset; assert.ok(Math.max(...o.p.map(Math.abs), ...o.r.map(Math.abs), ...o.cam.map(Math.abs), Math.abs(o.buzz)) < 0.004, '回到原位');
  // 掏枪拉套筒那一下（draw）不算换弹
  const before = feel.state.hits; ev.emit('weapon:reload', { phase: 'bolt', kind: 'pistol', draw: true }); assert.equal(feel.state.hits, before);
  // 加在模型上：只是偏移
  const root = new THREE.Group(); feel.kick('pistol', 'magin'); feel.update(0.05); feel.apply(root); assert.ok(root.position.length() > 0 && root.quaternion.w < 1);
  const cam = new THREE.PerspectiveCamera(); feel.camera(cam); assert.ok(cam.quaternion.w < 1);
  feel.dispose(); const n = feel.state.hits; ev.emit('weapon:reload', { phase: 'magin' }); assert.equal(feel.state.hits, n, '拆掉以后不再听');
});

test('手枪换弹：旧弹匣自己掉出去、看不见了；左手捏着新弹匣从下面上来、跟着弹匣一起往里送、一拍到底；打空的左手再去拉套筒', () => {
  const R = PISTOL_RELOAD;
  const a = reloadPose(0.2), b = reloadPose(R.out[1] + 0.01);
  assert.ok(a.magDrop > 0.3 && a.magShown && a.handOn === 0, '旧弹匣往下掉，左手还没上来');
  assert.ok(!b.magShown, '掉出画面以后不画');
  for (const k of [0.45, 0.5, 0.55]) { const p = reloadPose(k); assert.ok(p.magShown && p.handOn > 0.99 && Math.abs(p.handTravel - p.magDrop) < 1e-9, `${k}：手托着弹匣底一起走`); }
  assert.ok(reloadPose(0.45).magDrop > reloadPose(0.55).magDrop, '往里送');
  assert.ok(!reloadPose(R.magIn - 0.01).magIn && reloadPose(R.magIn).magIn && reloadPose(0.66).magDrop < 1e-9, '一拍到底');
  const e = reloadPose(0.8, true); assert.ok(e.rack > 0.99 && e.slide > 1, '打空：左手在套筒上往后拉');
  assert.ok(!reloadPose(R.release - 0.01, true).bolt && reloadPose(R.release, true).bolt && reloadPose(R.release + 0.01, true).slide === 0, '松手套筒复进');
  assert.equal(reloadPose(0.8, false).rack, 0, '没打空不拉套筒');
  for (const k of [0, 1]) { const p = reloadPose(k, true); assert.ok(p.handOn === 0 && p.magDrop === 0 && p.magShown, `${k} 归位`); }
});

test('榴弹枪换弹：撅开、弹壳退出来；左手从腰间拿一发榴弹、对着药室推进去；回到护木一甩合上', () => {
  const p = (k) => breakPose(k);
  assert.ok(p(0.25).open > 0.9 && p(0.25).eject > 0.3 && !p(0.25).roundShown, '撅开、退壳');
  assert.ok(p(0.4).roundShown && p(0.4).hand > 0.9 && p(0.4).fetch > 0 && p(0.4).fetch < 1, '手拿着弹从下面上来');
  assert.ok(p(0.5).fetch === 1 && p(0.5).insert > 0 && p(0.5).insert < 1 && !p(0.5).loaded, '推弹');
  assert.ok(p(BREAK.insert[1]).loaded && !p(BREAK.insert[1]).roundShown, '推到底');
  assert.ok(p(0.78).open > 0 && p(0.78).hand < 0.05 && !p(0.78).closed && p(BREAK.close[1]).closed && p(BREAK.close[1]).open === 0, '托着护木合上');
});

test('手机按键排布：都 ≥ 48 像素、在 844 × 390 的横屏里、两两不重叠、不压底部正中的切枪条和右上角暂停键；每个键都有线稿图标（不是表情符号）', () => {
  const W = 844, H = 390, circles = Object.entries(TOUCH_SLOTS).map(([k, q]) => ({ k, r: q.s / 2, x: q.l != null ? q.l + q.s / 2 : W - q.r - q.s / 2, y: H - q.b - q.s / 2 }));
  for (const c of circles) {
    assert.ok(c.r * 2 >= 48, `${c.k} 太小`);
    assert.ok(c.x - c.r >= 8 && c.x + c.r <= W - 8 && c.y - c.r >= 8 && c.y + c.r <= H - 8, `${c.k} 出屏了`);
    assert.ok(!(c.x + c.r > W - 52 && c.y - c.r < 52), `${c.k} 压着暂停键`);
    const sw = { x0: W / 2 - SWAP_SLOT.w / 2, x1: W / 2 + SWAP_SLOT.w / 2, y0: H - SWAP_SLOT.b - SWAP_SLOT.h };
    assert.ok(!(c.x + c.r > sw.x0 && c.x - c.r < sw.x1 && c.y + c.r > sw.y0), `${c.k} 压着切枪条`);
  }
  for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
    const a = circles[i], b = circles[j]; assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r + 6, `${a.k} 和 ${b.k} 挤在一起`);
  }
  // 右手那一簇都在屏幕右半边（左半边是摇杆）；左手开火键在左边
  for (const c of circles) if (c.k !== 'fire2') assert.ok(c.x - c.r > W * 0.5, `${c.k} 跑到摇杆那边了`);
  assert.ok(circles.find((c) => c.k === 'fire2').x < W * 0.2);
  for (const [, name] of BUTTON_ICONS) assert.ok(ICONS[name] && /<(path|circle|rect)/.test(ICONS[name]), name);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(HUD_LAYOUT_CSS + Object.values(ICONS).join('')), '没有表情符号');
  assert.ok(LAYOUT_ITEMS.some((x) => x.key === 'fire2' && x.sel === '.t-fire2'), '左手开火键也能在「键位布局」里调');
  assert.match(HUD_LAYOUT_CSS, /@media \(orientation: landscape\)/, '竖屏不动原来的排布');
});

test('目标标记：只有当前目标（最近的目标类）上指南针、写名字和距离；弹药箱 15 米内才露图标、不写字；最多 3 枚；准星附近的淡掉', () => {
  const W = 844, H = 390, view = { w: W, h: H };
  assert.equal(markerRole('supply'), 'pickup'); assert.equal(markerRole('hunt'), 'enemy'); assert.equal(markerRole('enemy'), 'enemy');
  for (const k of ['relay', 'extract', 'bomb', 'item']) assert.equal(markerRole(k), 'objective');
  // 截图里那一屏：一个目标在准星上，三个弹药箱（18 / 42 / 43 米），一个贴在屏幕边上的弹药箱
  const marks = [
    { role: 'objective', d: 21, x: 424, y: 190 },
    { role: 'pickup', d: 18, x: 180, y: 360 },
    { role: 'pickup', d: 43, x: 560, y: 180 },
    { role: 'pickup', d: 42, x: 620, y: 60 },
    { role: 'pickup', d: 9, x: 12, y: 200, off: true },
  ];
  const r = planMarkers(marks, view);
  assert.deepEqual(r.map((q) => q.compass), [true, false, false, false, false], '指南针上只有当前目标');
  assert.equal(r[0].world, 'label'); assert.ok(r[0].aim, '在准星上：淡掉');
  assert.deepEqual(r.slice(1).map((q) => q.world), ['hide', 'hide', 'hide', 'hide'], '远的弹药箱、屏幕外的弹药箱都不画');
  // 近的弹药箱只画图标
  const near = planMarkers([{ role: 'objective', d: 60, x: 700, y: 120 }, { role: 'pickup', d: 12, x: 300, y: 250 }], view);
  assert.deepEqual(near.map((q) => q.world), ['label', 'icon']);
  // 名额：最多 3 枚（不算淡掉的）；目标优先，其次敌人，再其次补给
  const many = [{ role: 'pickup', d: 3.5, x: 100, y: 100 }, { role: 'pickup', d: 5, x: 200, y: 100 }, { role: 'enemy', d: 20, x: 300, y: 300 }, { role: 'enemy', d: 25, x: 700, y: 300 }, { role: 'objective', d: 80, x: 600, y: 80 }];
  const m = planMarkers(many, view), shown = m.filter((q) => q.world !== 'hide' && !q.aim);
  assert.ok(shown.length <= MARKERS.max, `${shown.length} 枚`);
  assert.equal(m[4].world, 'label'); assert.equal(m[2].world, 'icon'); assert.equal(m[3].world, 'icon'); assert.equal(m[0].world, 'hide');
  // 贴边的当前目标照样画（带箭头）；走到跟前（near）不画
  const off = planMarkers([{ role: 'objective', d: 50, x: 830, y: 195, off: true }], view); assert.equal(off[0].world, 'label'); assert.ok(!off[0].aim);
  assert.equal(planMarkers([{ role: 'objective', d: 2, x: 500, y: 100, near: true }], view)[0].world, 'hide');
  // 没有目标类（歼灭）：最近的敌人当当前目标
  const hunt = planMarkers([{ role: 'enemy', d: 70, x: 100, y: 100 }, { role: 'enemy', d: 30, x: 700, y: 100 }], view);
  assert.deepEqual(hunt.map((q) => q.compass), [false, true]);
  // 准星区以外不淡
  for (const q of planMarkers([{ role: 'objective', d: 30, x: W / 2 + MARKERS.aim * H + 2, y: H / 2 }], view)) assert.ok(!q.aim);
});

test('指南针上的队友小圆点：方位和原游戏的刻度带一致，出了刻度带不画', () => {
  assert.equal(compassX(0, -10, 0, 280), 0, '正前方在正中');
  assert.equal(compassX(10, -10, 0, 420), 45 * COMPASS_PX, '右前 45 度');
  assert.equal(compassX(10, -10, 0, 280), null, '窄的刻度带（手机）放不下 45 度');
  assert.equal(compassX(-10, -10, 0, 420), -45 * COMPASS_PX);
  assert.equal(compassX(0, 10, 0, 280), null, '身后');
  assert.equal(compassX(10, 0, -Math.PI / 2, 280), 0, '转向东（原游戏 yaw 向右为负）');
});

test('HUD 排版：字号只用 TYPE 那几档、颜色只用 HUD_COLORS；指南针 / 标记 / 字幕 / 弹药不折行；摇杆圈只在按着时出现', () => {
  const css = HUD_LAYOUT_CSS, body = css.replace(/#ui \{ --jm-t-[^}]*\}/, '');
  for (const [k, v] of Object.entries(TYPE)) assert.ok(css.includes(`--jm-t-${k}: ${v}px`), k);
  assert.ok(Object.values(TYPE).every((v, i, a) => i === 0 || v > a[i - 1]), '字号从小到大');
  assert.doesNotMatch(body, /font-size:\s*\d/, '字号都走 var(--jm-t-*)');
  assert.doesNotMatch(body, /font:\s*\d+\s+\d+px/, 'font 简写里的字号也走 var(--jm-t-*)');
  for (const k of Object.keys(HUD_COLORS)) assert.ok(css.includes(`--jm-c-${k}:`), k);
  for (const sel of ['.h-cm {', '.h-wm b {', '.h-wm span {', '.comms {', '.comms-t {', '.h-msg {', '.h-cue {']) {
    const at = css.indexOf(`\n${sel}`), rule = css.slice(at, css.indexOf('}', at));
    assert.ok(at >= 0 && /white-space: nowrap/.test(rule), `${sel} 不折行`);
  }
  assert.match(css, /\.comms-t \{[^}]*text-overflow: ellipsis/, '字幕太长截断');
  assert.match(css, /\.comms\.jm-fade \{ opacity: 0/, '字幕会淡掉');
  assert.match(css, /#ui\.jm-radio \.h-msg \{ translate: 0 -\d+px/, '提示条不和字幕叠');
  assert.match(css, /\.h-cm\.jm-hide \{ display: none/, '指南针上不画别的标记');
  assert.match(css, /#ui:not\(\.jm-stick-fixed\):not\(\.jm-editing\) \.jm-stick-home \{ display: none/, '跟随拇指的摇杆不按时不画圈');
  assert.match(css, /\.is-touch \.h-pips \{ display: none/, '手机上弹药块不画子弹格');
  assert.match(css, /\.h-cue\.urgent \{[^}]*animation: none/, '弹药耗尽是一枚不闪的小签');
});
