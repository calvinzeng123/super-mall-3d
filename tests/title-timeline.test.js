// 开场时间轴（src/title/timeline.js）：四个镜头 + 标题段，完整版 / 短版 / 菜单背景循环；纯函数取样
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIMELINE, sampleShot, sceneTime, LOGO_AT, MENU_AT } from '../src/title/timeline.js';

test('完整版：按秒数取到对应镜头，超出末尾停在标题段', () => {
  assert.equal(sampleShot(TIMELINE.full, 0).shot.id, 'aerial');
  assert.equal(sampleShot(TIMELINE.full, 8).shot.id, 'horde');
  assert.equal(sampleShot(TIMELINE.full, 16).shot.id, 'roof');
  assert.equal(sampleShot(TIMELINE.full, 21).shot.id, 'heli');
  assert.equal(sampleShot(TIMELINE.full, 26).shot.id, 'title');
  assert.equal(sampleShot(TIMELINE.full, 999).shot.id, 'title');
  assert.equal(sampleShot(TIMELINE.full, -3).shot.id, 'aerial', '负数按开头算');
});

test('完整版：镜头表首尾相接、没有空隙，时间点和设计稿一致', () => {
  const f = TIMELINE.full;
  assert.deepEqual(f.map((s) => s.id), ['aerial', 'horde', 'roof', 'heli', 'title']);
  assert.equal(f[0].t0, 0);
  for (let i = 1; i < f.length; i++) assert.equal(f[i].t0, f[i - 1].t1, `${f[i - 1].id} → ${f[i].id} 有缝`);
  assert.deepEqual(f.slice(0, 4).map((s) => [s.t0, s.t1]), [[0, 7], [7, 13.5], [13.5, 20], [20, 26]]);
  assert.equal(f[4].t1, Infinity);
  assert.equal(LOGO_AT.full, 27.0); assert.equal(MENU_AT.full, 28.4);
  assert.ok(MENU_AT.full > LOGO_AT.full && LOGO_AT.full > f[4].t0);
});

test('短版：楼顶末段 + 直升机 + 标题，5–7 秒，也首尾相接', () => {
  const s = TIMELINE.short;
  assert.deepEqual(s.map((x) => x.id), ['roof', 'heli', 'title']);
  assert.equal(s[0].t0, 0);
  for (let i = 1; i < s.length; i++) assert.equal(s[i].t0, s[i - 1].t1);
  const len = s[s.length - 1].t0;
  assert.ok(len >= 5 && len <= 7, `短版 ${len} 秒`);
  assert.ok(LOGO_AT.short > len && MENU_AT.short > LOGO_AT.short);
  assert.ok(Math.abs((MENU_AT.short - LOGO_AT.short) - (MENU_AT.full - LOGO_AT.full)) < 1e-9, 'Logo 到菜单的间隔两版一样');
});

test('local 是镜头内 0..1 的进度；标题段 local 恒为 0', () => {
  const a = sampleShot(TIMELINE.full, 3.5);
  assert.ok(Math.abs(a.local - 0.5) < 1e-9);
  assert.equal(sampleShot(TIMELINE.full, 13.5).shot.id, 'roof');
  assert.equal(sampleShot(TIMELINE.full, 13.5).local, 0);
  assert.equal(sampleShot(TIMELINE.full, 100).local, 0);
});

test('sceneTime：短版、循环换算到完整版的场景时间，镜头一致', () => {
  for (const t of [0, 0.5, 1.4, 3, 5.4, 6, 9]) {
    const st = sceneTime(TIMELINE.short, t), id = sampleShot(TIMELINE.short, t).shot.id;
    assert.equal(sampleShot(TIMELINE.full, st).shot.id, id, `短版 ${t}s → 场景 ${st}s`);
  }
  assert.equal(sceneTime(TIMELINE.full, 12.3), 12.3, '完整版原样');
  // 短版的楼顶取完整版楼顶的末段，直升机段的结尾和完整版对齐（白闪落在同一处）
  const s = TIMELINE.short;
  assert.ok(Math.abs(sceneTime(s, s[1].t0) - (26 - (s[1].t1 - s[1].t0))) < 1e-9);
  assert.ok(sceneTime(s, s[0].t1 - 1e-6) <= 20);
  assert.equal(TIMELINE.loop.id, 'title');
  assert.ok(sceneTime([TIMELINE.loop], 40) >= 26);
});

test('画质档：尸潮镜头 ≥ 60 只（流畅档 30）；auto 按设备定档', async () => {
  const { TITLE_TIERS, resolveTitleTier } = await import('../src/title/scene.js');
  assert.equal(TITLE_TIERS.low.horde, 30);
  for (const k of ['balanced', 'high', 'ultra']) assert.ok(TITLE_TIERS[k].horde >= 60, k);
  assert.equal(TITLE_TIERS.low.dof, false, '流畅档关景深');
  for (const k of Object.keys(TITLE_TIERS)) assert.ok(TITLE_TIERS[k].dpr <= 2 && TITLE_TIERS[k].rain > 0, k);
  assert.equal(resolveTitleTier('auto', { coarse: true, memory: 4 }), 'low');
  assert.equal(resolveTitleTier('auto', { coarse: true, memory: 8 }), 'balanced');
  assert.equal(resolveTitleTier('auto', { coarse: false }), 'high');
  assert.equal(resolveTitleTier('ultra'), 'ultra');
});
