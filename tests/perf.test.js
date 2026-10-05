// 帧率监测：持续低帧率（含每帧都超过 250ms 的极慢设备）要触发降级；单次卡顿、后台节流、加载期不触发。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerfMonitor } from '../src/render/perf.js';

/** 以固定帧间隔喂 n 帧，返回是否触发降级 */
function run(mon, t0, gap, n, hidden = false) {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += gap;
    if (mon.tick(t, hidden)) return { degraded: true, t };
  }
  return { degraded: false, t };
}

test('极慢设备（每帧 350ms）在加载宽限期后会降级', () => {
  const mon = createPerfMonitor(0);
  assert.equal(run(mon, 0, 350, 60).degraded, true);
});

test('中等偏慢（15fps）会降级，流畅（60fps）不会', () => {
  assert.equal(run(createPerfMonitor(0), 0, 1000 / 15, 400).degraded, true);
  assert.equal(run(createPerfMonitor(0), 0, 1000 / 60, 1200).degraded, false);
});

test('60fps 中夹一次 1.2s 卡顿（首次编译着色器）不降级', () => {
  const mon = createPerfMonitor(0);
  let r = run(mon, 0, 1000 / 60, 500);
  assert.equal(r.degraded, false);
  assert.equal(mon.tick(r.t + 1200, false), false);
  r = run(mon, r.t + 1200, 1000 / 60, 600);
  assert.equal(r.degraded, false);
});

test('页面隐藏或后台节流（间隔 >3s）期间不计入', () => {
  const mon = createPerfMonitor(0);
  assert.equal(run(mon, 0, 400, 40, true).degraded, false);
  assert.equal(run(mon, 20000, 4000, 10).degraded, false);
});

test('加载后 6 秒宽限期内不降级', () => {
  const mon = createPerfMonitor(0);
  assert.equal(run(mon, 0, 350, 16).degraded, false);
});
