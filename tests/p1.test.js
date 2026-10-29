// 一期 云澜汇专项规则（规格第 4 节、第 10 节 1、2、5、6、8、9、10、12、13 条）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, levelsOf, inWalk, inSite, inBridge, onSlab, midOf, directionCount, segProbes } from './helpers.js';
import { convexOverlap, pointInPoly } from '../src/layout/geom.js';

const P = (s) => lvl(`P1-${s}`);

test('一期扩建：十个楼层标高正确，六层商业各有主题并保留原材质系统', () => {
  const ls = levelsOf('P1');
  assert.deepEqual(ls.map((l) => l.short), ['B2', 'B1', 'B1M', '1F', '2F', '3F', '4F', '5F', '6F', 'RF']);
  assert.deepEqual(Object.fromEntries(ls.map((l) => [l.short, l.elev])), { B2: -12, B1: -8.4, B1M: -4.5, '1F': 0, '2F': 6.5, '3F': 12, '4F': 17.5, '5F': 23, '6F': 28.5, RF: 34 });
  assert.equal(new Set(ls.map((l) => l.theme.key)).size, 10, '每层场景主题应不同');
  assert.equal(new Set(ls.map((l) => l.theme.floor)).size, 7, '每层地面材质应不同');
});

test('一期铺位数量：1F/2F ≥25，3F/B1M ≥20', () => {
  for (const [s, n] of [['1F', 25], ['2F', 25], ['3F', 20], ['B1M', 20]]) {
    assert.ok(P(s).units.length >= n, `${s} 只有 ${P(s).units.length} 个铺位`);
  }
});

test('一期卫生间：B1M 与 1F–6F 每层 ≥2 组，B1/B2/RF ≥1 组，门口通走道', () => {
  const wc = (s) => P(s).rooms.filter((m) => m.type === 'wc');
  for (const s of ['B1M', '1F', '2F', '3F', '4F', '5F', '6F']) assert.ok(wc(s).length >= 2, `${s} 卫生间不足 2 组`);
  for (const s of ['B1', 'B2', 'RF']) assert.ok(wc(s).length >= 1, `${s} 没有卫生间`);
  for (const lv of levelsOf('P1')) {
    for (const m of lv.rooms.filter((r) => r.type === 'wc')) {
      assert.ok(m.wdoors.some((d) => segProbes(d, 0.5).some((p) => inWalk(lv, p))), `${lv.id} ${m.id} 的门不通走道`);
    }
  }
});

test('一期 Y 形部分（圆厅与三翼）垂直交通：观光梯 2 部；扶梯 16 对 32 部，八段都有上下行', () => {
  assert.equal(L.elevators.filter((e) => e.building === 'P1' && e.type === 'glass' && !e.square).length, 2);
  const E = L.escalators.filter((e) => e.building === 'P1' && !e.square && e.wing !== 'NW');
  assert.equal(E.length, 32);
  assert.equal(new Set(E.map((e) => e.pair)).size, 16);
  for (const [a, b] of [['B1', 'B1M'], ['B1M', '1F'], ['1F', '2F'], ['2F', '3F'], ['3F', '4F'], ['4F', '5F'], ['5F', '6F'], ['6F', 'RF']]) {
    const es = E.filter((e) => e.from === `P1-${a}` && e.to === `P1-${b}`);
    assert.ok(es.some((e) => e.dir === 'up') && es.some((e) => e.dir === 'down'), `${a}→${b} 缺少上行或下行扶梯`);
  }
});

test('一期入口：≥4 个、朝向 ≥3 个方向、1 个主入口；内侧是走道，外侧在楼外广场或天桥', () => {
  const ents = L.entrances.filter((e) => e.building === 'P1' && e.level === 'P1-1F' && !e.architecturalOpening);
  assert.ok(ents.length >= 4, `只有 ${ents.length} 个人行入口`);
  assert.equal(ents.filter((e) => e.main).length, 1, '应有 1 个主入口');
  assert.ok(directionCount(ents) >= 3, '入口朝向少于 3 个方向');
  for (const e of L.entrances.filter((x) => x.building === 'P1')) {
    const lv = lvl(e.level);
    const [mx, mz] = midOf(e.seg);
    assert.ok(inWalk(lv, [mx - e.nx, mz - e.nz]), `${e.name} 内侧不是走道`);
    const out = [mx + e.nx, mz + e.nz];
    if (e.architecturalOpening) {
      assert.equal(e.to, e.level, '接驳内门必须保持同层');
      assert.ok(inWalk(lv, out), `${e.name} 没有接到外伸大厅`);
      for (let d=-1.2;d<=1.2;d+=.2) {
        const p=[mx+e.nx*d,mz+e.nz*d];
        const pieces=[...lv.slab.pieces,...L.extensions.paths.filter(p=>p.level===lv.id).flatMap(p=>p.slab?.pieces||[])];
        assert.ok(pieces.some(s=>pointInPoly(p,s.outer)&&!s.holes.some(h=>pointInPoly(p,h))), `${e.name} 内门断板`);
      }
      continue;
    }
    if (e.sharedGarage && lv.elev < 0)
      assert.ok(!onSlab(lv, out), `${e.name} 外侧仍在同一张共享地库楼板内`);
    else assert.ok(!lv.slab.pieces.some((s) => pointInPoly(out, s.outer)), `${e.name} 外侧仍在楼内`);
    if (e.to === 'site') assert.ok(inSite(out), `${e.name} 外侧不在场地步行区`);
    else if (e.to === 'bridge') { if (L.bridges) assert.ok(inBridge(out), `${e.name} 外侧不在天桥桥面上`); }
    else assert.ok(inWalk(lvl(e.to), out), `${e.name} 外侧不在 ${e.to} 走道上`);
  }
});

test('一期共享车库：六组分离街道进出口坡度 ≤15%，两端接车道；B1↔B2 双向', () => {
  const R = L.ramps.filter((r) => ['P1', 'H', 'A', 'WPG'].includes(r.building));
  const inR = R.filter((r) => r.type === 'street-in');
  const outR = R.filter((r) => r.type === 'street-out');
  assert.equal(inR.length, 6);
  assert.equal(outR.length, 6);
  assert.equal(new Set(inR.map(r => r.quadrant)).size, 6);
  const street = [...inR, ...outR];
  for (let i = 0; i < street.length; i++) for (const b of street.slice(i + 1))
    assert.ok(!convexOverlap(street[i].poly, b.poly), `${street[i].id}/${b.id} 坡道重叠`);
  assert.ok(R.some((r) => r.type === 'down' && r.from.level === 'P1-B1' && r.to.level === 'P1-B2'));
  assert.ok(R.some((r) => r.type === 'up' && r.from.level === 'P1-B2' && r.to.level === 'P1-B1'));
  for (const r of R) {
    const h = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    assert.ok(Math.abs(r.to.y - r.from.y) / h <= 0.15 + 1e-9, `${r.id} 坡度过大`);
    for (const end of [r.from, r.to]) {
      const sign = end === r.from ? -1 : 1;
      const outside = [end.x + sign * (r.to.x - r.from.x) / h * .2,
        end.z + sign * (r.to.z - r.from.z) / h * .2];
      if (end.level === 'street') assert.ok(L.site.driveways.some((d) => pointInPoly(outside, d)), `${r.id} 地面端没有接到车道`);
      else assert.ok(inWalk(lvl(end.level), outside), `${r.id} 在 ${end.level} 的端点没有接到车道`);
    }
  }
});

test('一期车位：B1、B2 各 ≥150，B1 有充电位和无障碍位', () => {
  for (const s of ['B1', 'B2']) assert.ok(P(s).parking.stalls.length >= 150, `${s} 只有 ${P(s).parking.stalls.length} 个车位`);
  const types = new Set(P('B1').parking.stalls.map((s) => s.type));
  assert.ok(types.has('ev') && types.has('accessible'));
});

test('一期天台：餐吧 ≥3、摩天轮 1、IP、天空之镜、观景台、立体字', () => {
  const rf = P('RF');
  const bars = rf.units.filter((u) => ['bar', 'restaurant'].includes(u.brand.cat));
  assert.ok(bars.length >= 3, `天台餐吧只有 ${bars.length} 家`);
  const types = rf.features.map((f) => f.type);
  assert.equal(types.filter((t) => t === 'ferris').length, 1);
  for (const t of ['ip', 'mirror', 'skywalk', 'letters']) assert.ok(types.includes(t), `天台缺少 ${t}`);
});
