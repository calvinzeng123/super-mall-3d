// 丧尸围城的 HUD 打磨：目标那一行步数多时不排一长串小方块；手机上不提示捕获鼠标；枪的真模型在丧尸围城里晚点加载
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI_CSS } from '../src/jimao/vendor/ui-css.js';

const game = readFileSync('src/jimao/vendor/game.js', 'utf8');

test('目标那一行：步数多（商场段二十几步）时是「第 3/23 步」+ 一根短进度条，不排一长串小方块；「目标」两个字不换行', () => {
  const body = game.slice(game.indexOf('setRelays(k, ce) {'), game.indexOf('setMarkers(k) {'));
  assert.match(body, /let long = ce > 8;/, '超过 8 步换成文字 + 进度条');
  assert.match(body, /if \(long\) rbar = document\.createElement\("em"\)[^]*?else for \(let ve = 0; ve < ce; ve\+\+\)/, '步数多不再一格一格排小方块');
  assert.match(body, /\\u7B2C \$\{k \+ 1\}\/\$\{ce\} \\u6B65/, '「第 k+1/总 步」');
  assert.match(UI_CSS, /\.h-relays span, \.h-relays b \{ white-space: nowrap; flex: none; \}/, '「目标」不被挤成竖排');
  assert.match(UI_CSS, /\.h-relays \.h-rbar \{[^}]*flex: 0 1 84px/, '进度条短');
});

test('手机 / 平板（触屏为主）：还没碰屏幕时也不提示「点击游戏画面以捕获鼠标」，暂停页也不说「继续游戏后将重新捕获鼠标」', () => {
  assert.match(game, /function coarseTouch\(\) \{[^]*?matchMedia\("\(pointer: coarse\)"\)\.matches/);
  assert.match(game, /describeMode\(\) \{\s*\/\/[^\n]*\n\s*if \(f\.mode === "lock" && !f\.locked && coarseTouch\(\)\) return "";/);
  assert.match(game, /_\.state === "playing" && V && \(r\.mode === "drag"/, '没有提示就不弹');
  assert.match(game, /r\.touch \|\| coarseTouch\(\) \? "" : "\\u7EE7\\u7EED/);
});

test('丧尸围城开局只有刀：手枪 / 步枪 / 冲锋枪的真模型不跟着进场一起加载，开局玩稳了或走到拿撬棍那一步再加载；零点突围照旧马上加载', async () => {
  const run = readFileSync('src/jimao/run.js', 'utf8');
  const { GUN_DEFER } = await import('../src/jimao/run.js').catch(() => ({ GUN_DEFER: null }));
  if (GUN_DEFER) { assert.ok(GUN_DEFER.settle >= 10 && GUN_DEFER.settle <= 40); assert.ok(GUN_DEFER.stage >= 1 && GUN_DEFER.stage <= 7, '手枪（第 8 步）之前就加载好'); }
  const load = run.indexOf('const loadGuns = () => {'), sched = run.indexOf('if (!siege?.enabled || params.guns === \'now\') loadGuns();');
  assert.ok(load > 0 && sched > load, '先定义、siege 建好以后再决定什么时候加载');
  for (const label of ['手枪模型', '步枪模型', '冲锋枪模型']) { const at = run.indexOf(`label: '${label}'`); assert.ok(at > load && at < sched, `${label}在 loadGuns 里`); }
  assert.match(run, /if \(!siege\.enabled \|\| director\.state\.restore \|\| played >= GUN_DEFER\.settle \|\| \(siege\.state\?\.stage \?\? 0\) >= GUN_DEFER\.stage\) loadGuns\(\);/);
  assert.match(run, /if \(gunTimer\) clearInterval\(gunTimer\);/, '关掉时停表');
  // 一把一把解：三把都排进同一条队（next），不再一起解、也不再定时 1.5 秒后叠上冲锋枪
  assert.equal((run.slice(load, sched).match(/if \(rec\) next\(\(\) => fetchBinary\(/g) || []).length, 3); assert.ok(!/1500\); \}/.test(run.slice(load, sched)));
});
