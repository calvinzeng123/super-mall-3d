// 超高层分派与分区标记（supertall P0a, SPEC §2.1 "supertall dispatch", §5.2）：游览布局先问 supertallResidential() /
// supertallTower()（今天的桩都返回 null，紧凑塔楼照旧），它们的门禁与登高场地被收集进 accessControl / site.fireAccess；
// hospitality.js 里只有 <supertall:R> / <supertall:HA> 标记的区域分别归 P-R / P-HA 改；supertallSitePass 是 P-HA 的钩子。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { L } from './helpers.js';
import { HOSPITALITY, collectSupertall } from '../src/layout/hospitality.js';
import { supertallResidential } from '../src/layout/r-supertall.js';
import { supertallTower, supertallSitePass } from '../src/layout/hospitality-supertall.js';
import { hardstandRecord } from '../src/layout/hardstand.js';
import { rect } from '../src/layout/geom.js';

const src = (f) => readFileSync(new URL(`../src/layout/${f}`, import.meta.url), 'utf8');
/** The marked regions of a source file: [{ tag, open, close }] (line numbers), checking they pair up and never nest. */
function regions(text) {
  const out = [], lines = text.split('\n');
  let cur = null;
  lines.forEach((line, i) => {
    const m = /^\s*\/\/ <(\/?)supertall:(\w+)>/.exec(line);
    if (!m) return;
    if (!m[1]) { assert.equal(cur, null, `line ${i + 1}: nested region`); cur = { tag: m[2], open: i + 1 }; }
    else { assert.ok(cur && cur.tag === m[2], `line ${i + 1}: unmatched close ${m[2]}`); out.push({ ...cur, close: i + 1 }); cur = null; }
  });
  assert.equal(cur, null, 'unclosed region');
  return out;
}

test('今天的超高层构建器桩对每栋酒店 / 公寓 / 住宅都返回 null，布局照旧用紧凑塔楼', () => {
  assert.deepEqual(HOSPITALITY.towers.map((t) => t.id), ['H', 'A', 'R1', 'R2', 'R3', 'R4']);
  for (const t of HOSPITALITY.towers) {
    assert.equal(supertallResidential(t, { site: L.site, expansion: true }), null, t.id);
    assert.equal(supertallTower(t, { site: L.site, expansion: true }), null, t.id);
  }
  const before = JSON.stringify(L.site.westParking);
  assert.equal(supertallSitePass(L), undefined);
  assert.equal(JSON.stringify(L.site.westParking), before, 'the stub site pass changes nothing');
});

test('分派收集：超高层部件的门禁 / 住户区进 accessControl，登高场地追加进 site.fireAccess', () => {
  const site = { fireAccess: [{ id: 'HS1', tower: 'T1' }] };
  const hs = hardstandRecord({ id: 'HS-R1', building: 'R1', rect: rect(28, -195.4, 70, -185.4), face: 'S' });
  const parts = [{ access: { zones: [{ id: 'z1' }], gates: [{ id: 'g1' }, { id: 'g2' }] }, fireAccess: [hs] }, { access: { zones: [{ id: 'z2' }] } }, {}];
  assert.deepEqual(collectSupertall(parts, site), { zones: [{ id: 'z1' }, { id: 'z2' }], gates: [{ id: 'g1' }, { id: 'g2' }] });
  assert.deepEqual(site.fireAccess.map((f) => f.id), ['HS1', 'HS-R1']);
  const empty = {};
  assert.deepEqual(collectSupertall([], empty), { zones: [], gates: [] }); assert.equal(empty.fireAccess, undefined);
});

test('hospitality.js 的 P-R / P-HA 可改区域成对、不嵌套，并覆盖 SPEC 指定的段落；分派本身在区域之外', () => {
  const text = src('hospitality.js'), rs = regions(text);
  const tags = rs.map((r) => r.tag);
  assert.ok(tags.filter((t) => t === 'R').length >= 3 && tags.filter((t) => t === 'HA').length >= 4, tags.join(','));
  assert.ok(rs.every((r) => ['R', 'HA'].includes(r.tag)));
  const lines = text.split('\n'), inRegion = (needle) => {
    const i = lines.findIndex((l) => l.includes(needle)) + 1;
    assert.ok(i > 0, needle);
    return rs.find((r) => i > r.open && i < r.close)?.tag ?? null;
  };
  // the R garage / arrival section and the hotel surface parking are the packages' own
  assert.equal(inRegion("by.R1.ramps.push"), 'R');
  assert.equal(inRegion("road('residential-loop'"), 'R');
  assert.equal(inRegion("id:'hotel-shared-parking'"), 'HA');
  assert.equal(inRegion("addTowerGarageRamps(by[bid],site,extensions)"), 'HA');
  // the dispatch and the collection stay P0a's
  assert.equal(inRegion('supertallResidential(t, { site, expansion })'), null);
  assert.equal(inRegion('collectSupertall(supertall, site)'), null);
  // the site pass stub carries the P-HA region; layout.js calls it only for the expansion layout
  assert.deepEqual(regions(src('hospitality-supertall.js')).map((r) => r.tag), ['HA']);
  assert.match(src('layout.js'), /if \(expansion\) \{[^}]*applyTowerZones\(layout\);\s*supertallSitePass\(layout\);/);
});
