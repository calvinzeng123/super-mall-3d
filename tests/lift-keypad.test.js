// 电梯按键面板（supertall P0b · SPEC §3.2，合成记录 tests/fixtures/supertall-records.js）：客梯面板没有避难层按钮，
// 消防梯的避难层按钮带钥匙确认，fireOnly 停靠层灰显、消防模式才能按；梯组表头、刷卡说明、数字缓冲选层；
// 乘梯 HUD 写真实运行时间，游戏里的行程按 Δy / (2 × 速度) 压缩；真实布局里北苑 T1-LF（> 9 站）用按键面板。
import test from 'node:test';
import assert from 'node:assert/strict';
import { stLayout } from './fixtures/supertall-records.js';
import { keypadModel, keypadHtml, keyForBuffer, rideHud, bankName, KEYPAD_MIN_STOPS } from '../src/render/lift-keypad.js';
// The HUD's real run time is P0a's ride.realSeconds = liftRunSeconds() (the P0 merge removed the keypad's copy).
import { liftRunSeconds } from '../src/layout/elevator-ride.js';
const realRunSeconds = (dy, v, accel = 1.0) => liftRunSeconds(dy, v, { accel });
import { L } from './helpers.js';

const SL = stLayout(), lift = (id) => SL.elevators.find((e) => e.id === id);
const model = (id, opts = {}) => { const e = lift(id); return keypadModel(SL, e, { here: 'ST-1F', options: e.serves.map((floor) => ({ floor })), ...opts }); };

test('客梯面板：没有它经过的避难层的按钮，只列停靠层；表头写梯组、范围与不停楼层，卡片写刷卡乘梯', () => {
  for (const id of ['ST-L1', 'ST-L2', 'ST-H1']) {
    const m = model(id);
    assert.ok(m.keys.every((k) => k.kind === 'normal'), `${id} 有非普通按键`);
    assert.ok(!m.keys.some((k) => ['ST-10F', 'ST-20F'].includes(k.level)), `${id} 面板有避难层按钮`);
    assert.deepEqual(m.keys.map((k) => k.level).sort(), [...lift(id).serves].sort());
    assert.equal(m.card, '刷卡乘梯 · 仅可到达本户楼层');
  }
  assert.equal(model('ST-H1').title, '高区 · H1 · 1–22F · 不停 2–20F');
  assert.equal(model('ST-L1').title, '低区 · L1 L2 · 1–19F · 不停 10F');
  assert.equal(bankName(lift('ST-F')), '消防电梯');
});

test('消防梯面板：避难层按钮写「避难层 · 消防/检修专用」、带钥匙图标，平时要确认，消防模式直接可按', () => {
  const m = model('ST-F'), refuge = m.keys.filter((k) => k.kind === 'refuge');
  assert.deepEqual(refuge.map((k) => k.level), ['ST-20F', 'ST-10F']);
  for (const k of refuge) { assert.equal(k.sub, '避难层 · 消防/检修专用'); assert.ok(k.confirm && k.key && !k.disabled); }
  const html = keypadHtml(m);
  assert.match(html, /kp-key refuge[^>]*data-level="ST-10F"[^>]*><i class="kp-icon">/);
  assert.match(keypadHtml(m, { confirm: { level: 'ST-10F', label: '10F' } }), /使用消防员钥匙？/);
  assert.ok(model('ST-F', { fireMode: true }).keys.filter((k) => k.kind === 'refuge').every((k) => !k.confirm));
});

test('fireOnly 停靠层灰显「消防专用」、不能按；消防模式且导航有这一站时才可按', () => {
  const e = lift('ST-S');
  const normal = keypadModel(SL, e, { here: 'ST-2F', options: e.serves.map((floor) => ({ floor })) });
  const k = normal.keys.find((q) => q.level === 'ST-1F');
  assert.ok(k && k.kind === 'fireOnly' && k.disabled && k.sub === '消防专用');
  assert.match(keypadHtml(normal), /kp-key fireOnly[^>]*data-level="ST-1F"[^>]*disabled/);
  const fire = keypadModel(SL, e, { here: 'ST-2F', fireMode: true, options: [...e.serves, ...e.fireOnly].map((floor) => ({ floor })) });
  assert.ok(!fire.keys.find((q) => q.level === 'ST-1F').disabled);
  const fireNoLink = keypadModel(SL, e, { here: 'ST-2F', fireMode: true, options: e.serves.map((floor) => ({ floor })) });
  assert.ok(fireNoLink.keys.find((q) => q.level === 'ST-1F').disabled, '导航没有这一站时仍不可按');
});

test('按键按楼层分区分组（自上而下）、当前层高亮且不可按；数字缓冲 37 / B1 / R 选层', () => {
  const m = model('ST-F');
  assert.deepEqual(m.groups.map((g) => g.id), ['ST-roof', 'ST-high', 'ST-R2', 'ST-mid', 'ST-R1', 'ST-low', 'ST-lobby', 'ST-basement']);
  const here = m.keys.find((k) => k.current);
  assert.ok(here && here.level === 'ST-1F' && here.disabled);
  assert.equal(keyForBuffer(m, '12').level, 'ST-12F');
  assert.equal(keyForBuffer(m, 'b1').level, 'ST-B1');
  assert.equal(keyForBuffer(m, 'R').level, 'ST-RF');
  assert.equal(keyForBuffer(m, '99'), null);
  // ≥ 44 px keys, 6 columns on desktop and 5 on phones (the injected stylesheet).
  assert.ok(KEYPAD_MIN_STOPS === 10);
});

test('乘梯 HUD：真实运行时间（加减速 + 匀速），游戏里压缩到约一半；「上行 · 32F · 实际约 37 秒」', () => {
  // 北苑 LW 1F → 34F at 4 m/s ≈ 38 s real (SPEC §1.1), R1-LF 1F → 53F at 5 m/s ≈ 42.8 s.
  assert.ok(Math.abs(realRunSeconds(137.4 - 0, 4) - 38.2) < 2.5, realRunSeconds(137.4, 4).toFixed(1));
  assert.ok(Math.abs(realRunSeconds(183.3, 5, .9) - 42.8) < 2.5, realRunSeconds(183.3, 5, .9).toFixed(1));
  assert.equal(rideHud('上行', '32F', 36.6), '上行 · 32F · 实际约 37 秒');
  // In game the ride is Δy / (2 × speed): about half the real run at the decided speeds.
  for (const [dy, v] of [[137.4, 4], [183.3, 5], [142.5, 4]]) { const game = dy / (2 * v), real = realRunSeconds(dy, v); assert.ok(game / real > .4 && game / real < .55, `${dy} m ${game.toFixed(1)} / ${real.toFixed(1)} s`); }
});

test('真实布局：北苑 T1-LF 有 > 9 个停靠层，用按键面板（分区分组：7F 空中大堂、江景大平层、错层复式、屋顶）', () => {
  const e = L.elevators.find((q) => q.id === 'T1-LF');
  assert.ok(e.serves.length >= KEYPAD_MIN_STOPS);
  const m = keypadModel(L, e, { here: 'P1-1F', options: e.serves.map((floor) => ({ floor })) });
  assert.equal(m.keys.length, e.serves.length);
  assert.ok(m.groups.length >= 4, m.groups.map((g) => g.name).join(' / '));
  assert.ok(m.groups.some((g) => /错层复式/.test(g.name)) && m.groups.some((g) => /江景大平层/.test(g.name)));
  assert.ok(m.title.startsWith('消防电梯 · LF'), m.title);
  // Today's lifts carry no speed / role extras beyond the 北苑 roles: the readers default (e.speed ?? 3.5).
  assert.ok(L.elevators.every((q) => q.speed === undefined));
});
