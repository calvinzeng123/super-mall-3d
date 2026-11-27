import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markBootStart, armBootGuard, bootCrashes, BOOT } from '../src/render/device.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const target = () => { const h = {}; return { h, addEventListener: (n, f) => { (h[n] ||= []).push(f); }, removeEventListener: (n, f) => { h[n] = (h[n] || []).filter((x) => x !== f); }, fire(n) { for (const f of h[n] || []) f(); } }; };

test('进模式：载到一半正常关掉页面（pagehide）不算被系统关掉，下次不降档、不提示', () => {
  const st = mem(), win = target(), doc = target();
  markBootStart('jimao', st); armBootGuard('jimao', { win, doc, storage: st });
  assert.ok(st.getItem(BOOT.key), '正在进入');
  win.fire('pagehide');
  assert.equal(st.getItem(BOOT.key), null, '关页面就擦掉');
  assert.deepEqual(markBootStart('jimao', st), { crashed: false, crashes: 0 });
  assert.equal(bootCrashes(st), 0);
});

test('进模式：载到一半切到后台擦掉，切回来还没站稳再记上（不算次数）；站稳以后切前后台不再记', () => {
  const st = mem(), win = target(), doc = target();
  markBootStart('jimao', st); const g = armBootGuard('jimao', { win, doc, storage: st });
  doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); assert.equal(st.getItem(BOOT.key), null);
  doc.visibilityState = 'visible'; doc.fire('visibilitychange'); assert.ok(st.getItem(BOOT.key), '回来接着载：再记上');
  assert.equal(bootCrashes(st), 0, '不算次数');
  g.settle(); assert.equal(st.getItem(BOOT.key), null, '站稳了擦掉');
  doc.visibilityState = 'hidden'; doc.fire('visibilitychange'); doc.visibilityState = 'visible'; doc.fire('visibilitychange');
  assert.equal(st.getItem(BOOT.key), null, '站稳以后不再记');
  assert.equal((win.h.pagehide || []).length + (doc.h.visibilitychange || []).length, 0, '监听摘掉了');
});

test('进模式：载入出错（显示错误、点一下刷新）擦掉「正在进入」，刷新后不算被关掉；真被系统关掉（什么事件都没有）才算', () => {
  const st = mem();
  markBootStart('jimao', st); armBootGuard('jimao', { win: target(), doc: target(), storage: st }).fail();
  assert.deepEqual(markBootStart('jimao', st), { crashed: false, crashes: 0 }, '出错刷新：不算');
  armBootGuard('jimao', { win: target(), doc: target(), storage: st }); // 这一次进程直接没了：什么都不触发
  assert.deepEqual(markBootStart('jimao', st), { crashed: true, crashes: 1 }, '被系统关掉：算一次');
  // 存不了（隐私模式）也不出错
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } }, doc = target();
  const g = armBootGuard('jimao', { win: target(), doc, storage: bad }); doc.visibilityState = 'visible'; doc.fire('visibilitychange'); g.fail();
});

test('runtime.js 记下「正在进入」就挂上守卫，main.js 出错的分支在刷新之前擦掉', () => {
  const rt = readFileSync('src/runtime.js', 'utf8'), main = readFileSync('src/main.js', 'utf8');
  assert.match(rt, /const boot=markBootStart\(mode\);[^]*?bootGuard=armBootGuard\(mode\);[^]*?const tier=savedTier/, '在建场景之前');
  assert.match(rt, /export function bootFailed\(\)\{bootGuard\?\.fail\(\);\}/);
  assert.match(main, /catch\(error\) \{[^]*?runtime\?\.bootFailed\?\.\(\)[^]*?showError/);
});
