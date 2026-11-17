import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { streetLanes } from '../src/render/build/traffic.js';
import { pointInPoly } from '../src/layout/geom.js';

const street = (r) => (r.from.level === 'street' ? r.from : r.to), low = (r) => (r.from.level === 'street' ? r.to : r.from);
const pairs = [...new Set(L.ramps.filter((r) => r.type.startsWith('street')).map((r) => r.id.replace(/-(IN|OUT)$/, '')))]
  .map((key) => ({ key, inR: L.ramps.find((r) => r.id === `${key}-IN`), outR: L.ramps.find((r) => r.id === `${key}-OUT`) }));

test('车库出入口成对出现，共 10 组', () => {
  assert.equal(pairs.length, 10);
  for (const p of pairs) assert.ok(p.inR?.type === 'street-in' && p.outR?.type === 'street-out', p.key);
});

test('并排的进出坡道靠右行驶：顺着进库方向看，入口在右、出口在左，进出的车在路口不交叉', () => {
  let checked = 0;
  for (const { key, inR, outR } of pairs) {
    const a = street(inR), b = street(outR);
    if (Math.hypot(a.x - b.x, a.z - b.z) > 12) continue; // 一前一后排在路边的（公寓、一期北口）不算并排
    const l = low(inR), dx = l.x - a.x, dz = l.z - a.z, n = Math.hypot(dx, dz);
    // 进库方向 (dx, dz) 的右手边是 (−dz, dx)（x 向东、z 向南）；出口的地面端应该在入口的左手边
    const side = ((b.x - a.x) * -dz + (b.z - a.z) * dx) / n;
    assert.ok(side < -3, `${key}：出口在入口的${side > 0 ? '右' : '左'}手边 ${Math.abs(side).toFixed(1)} 米`);
    checked++;
  }
  assert.equal(checked, 8);
});

test('沿路排开的坡道顺着贴地块那条车道的行驶方向：入口坡道口迎着来车，出口顺着车流上路，入口在出口上游', () => {
  const lanes = streetLanes(L);
  // 北外环贴着一期地块的是南侧车道（z −259），往东开
  const ringSouth = lanes.find((ln) => ln.axis === 'x' && ln.c === -259);
  assert.equal(ringSouth.dir, 1);
  for (const key of ['A', 'P1-N']) {
    const { inR, outR } = pairs.find((p) => p.key === key);
    assert.ok(low(inR).x > street(inR).x, `${key} 入口要往东下坡（坡道口朝西，东行的车右转一把就进）`);
    assert.ok(street(outR).x > low(outR).x, `${key} 出口要往东上坡，出来顺着东行车流`);
    assert.ok(street(inR).x < street(outR).x, `${key} 入口要在出口的上游（西边）`);
  }
});

test('公寓出口接星湾路（路口的驶离一侧），不再拐上北外环的路口停车线；每条坡道的地面端都有硬地接到路边', () => {
  const out = L.ramps.find((r) => r.id === 'A-OUT'), s = street(out);
  const apron = L.site.driveways.find((d) => pointInPoly([s.x + 0.5, s.z], d));
  assert.ok(apron, '公寓出口没有接入道');
  assert.ok(apron.some((p) => Math.abs(p[0] + 10) < 0.01), '公寓出口的硬地要接到星湾路西侧路边（x −10）');
  for (const r of L.ramps.filter((r) => r.type.startsWith('street'))) {
    const a = street(r), b = low(r), n = Math.hypot(b.x - a.x, b.z - a.z);
    const p = [a.x - (b.x - a.x) / n * 0.4, a.z - (b.z - a.z) / n * 0.4];
    assert.ok(L.site.driveways.some((d) => pointInPoly(p, d)), `${r.id} 地面端没有硬地`);
  }
});
