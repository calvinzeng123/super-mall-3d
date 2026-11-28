// 地铁双线站厅（layout/metro-interchange.js，游览布局）：
// ① 付费区栏杆外的非付费区连成一圈：北侧（一期、二期通道）沿栏杆外能走到南侧（三期通道）和东西两头（E/G 口），
//    四个角不再被便利店、站务室、洗手间、面包店堵死；
// ② 闸机：东西两头各两组 + 南北长边各 4 组，共 64 条通道，长边上的闸机走得过去。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { L, walkNav } from './helpers.js';
import { buildNav } from '../src/layout/nav.js';

const nav = buildNav(L);
const B1 = L.levels.find((l) => l.id === 'M-B1');
const reach = (from, to) => { const s = walkNav(nav, 'M-B1', from, to); return Math.hypot(s.x - to[0], s.z - to[1]) < 0.05; };

test('站厅非付费区连成一圈：北侧沿栏杆外绕过两头的角走到南侧，不进付费区', () => {
  for (const sx of [-1, 1]) {
    const legs = [[sx * 50, -22.5], [sx * 60.5, -22.5], [sx * 60.5, 22.5], [sx * 50, 22.5]];
    for (let i = 0; i < 3; i++) assert.ok(reach(legs[i], legs[i + 1]), `${sx < 0 ? '西' : '东'}头第 ${i + 1} 段走不通（角上被铺位或用房挡住）`);
  }
  // 便利店、站务室、洗手间、面包店还在，收在靠外墙的 4 m 里，门朝站厅中间
  const corners = [...B1.units, ...B1.rooms.filter((r) => ['wc', 'equip'].includes(r.type))];
  assert.equal(corners.length, 4);
  for (const q of corners) {
    const r = q.rects[0];
    assert.ok(Math.abs(r.x1 - r.x0) <= 4.01 && Math.min(Math.abs(r.x0), Math.abs(r.x1)) >= 61.99, `${q.id} 没收窄`);
  }
});

test('闸机 64 条通道：长边栏杆上 8 组，从栏杆外能穿过闸机进付费区，栏杆其余地方过不去', () => {
  const gates = B1.features.filter((f) => f.type === 'gates');
  assert.equal(L.buildings.find((b) => b.id === 'M').interchange.gateLanes, 64);
  const side = gates.filter((f) => f.axis === 'x');
  assert.equal(side.length, 8);
  for (const f of side) {
    const n = Math.round((f.x1 - f.x0) / f.pitch), lane = f.x0 + (f.x1 - f.x0) / n / 2, out = Math.sign(f.z);
    assert.ok(reach([lane, f.z + out * 3], [lane, f.z - out * 3]), `z=${f.z} x=${lane.toFixed(1)} 的闸机通道走不过去`);
  }
  // 两组闸机之间是栏杆：挡住
  assert.ok(!reach([0, -23], [0, -17]), '北侧栏杆中间不该能穿过去');
  assert.ok(!reach([-46, 23], [-46, 17]), '南侧栏杆不该能穿过去');
});

test('首页主菜单没有竞技 FPS 入口，保留园区和零点突围；小游戏收进「更多玩法」、进的是园区导览（2026-11-28）', async () => {
  const { ENTRIES } = await import('../src/title/route.js');
  const modes = ENTRIES.flatMap((e) => [e, ...(e.children || [])]).map((e) => e.mode).filter(Boolean);
  assert.ok(!modes.includes('fps'), '主菜单不该再有竞技 FPS');
  for (const m of ['tour', 'jimao']) assert.ok(modes.includes(m), `主菜单缺 ${m}`);
  assert.ok(!modes.includes('arcade'), '小游戏在园区导览里，不再单列');
});
