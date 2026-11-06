// 户型生成器的超高层挂钩（supertall P0a, SPEC §2.1 "refuge rooms" / "R penthouse hooks"，C-15 / C-16）：
// 不传新参数时生成结果与今天逐字节相同（哈希在 e6948b9 上钉住）；户内避难间的选取与校验、乙级门扇；planKey()；
// variantExtras（默认关闭）；复式楼梯 rise 参数；二期 R 翼的 wing 挂钩与 buildDuplexUnits()。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { frame } from '../src/layout/geom.js';
import { generateDuplex, generateHome, program, validateHome, pickRefugeRoom, refugeRoomErrors, planKey, wingSpec, homeStair,
  DUPLEX_STAIR, VARIANT_EXTRAS } from '../src/layout/community-plan.js';
import { communityUnit, buildDuplexUnits, doorLeaves, refugeDoorLeaves } from '../src/layout/community-units.js';
import { COMMUNITY_PLANS } from '../src/layout/community-plan-data.js';
import { R_WINGS, spikeWing } from '../scripts/supertall/r-penthouse-spike.mjs';

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const BASE = { w: 16, d: 14, exposed: { left: true, right: true }, lux: true, entryAt: 4.8, view: 'left' };

test('不传 wing / variantExtras / rise：生成结果与 e6948b9 逐字节相同', () => {
  // sha256 prefixes computed with the generator at e6948b9 (before the hooks)
  assert.equal(sha(generateDuplex({ ...BASE, id: 'T1-14W', type: '4BR', voidAbove: true, variant: 6 })), 'fc797414c0879ad7');
  assert.equal(sha(generateDuplex({ ...BASE, entryAt: 11.2, view: 'right', id: 'T1-15E', type: '5BR', voidAbove: false, variant: 12 })), 'f046a83bfecb6bcc');
  assert.equal(sha(generateDuplex({ ...BASE, d: 12, id: 'T2-20W', type: '4BR', voidAbove: true, variant: 3 })), '74234e98afe7498f');
  assert.equal(sha(generateHome({ ...BASE, id: 'T1-8W', type: '3BR', variant: 8, exclude: [] })), '4b1f2ef367d84dfa');
  const spec = { ...BASE, id: 'T1-14W', type: '4BR', voidAbove: true, variant: 6 };
  assert.deepEqual(generateDuplex(spec, { wing: null }), generateDuplex(spec));
  assert.deepEqual(program('4BR', { lux: true, variant: 2 }), program('4BR', { lux: true, variant: 2, variantExtras: false }));
  assert.deepEqual(homeStair({ x0: 0, z0: 0, x1: 2.5, z1: 4 }, 'lower'), homeStair({ x0: 0, z0: 0, x1: 2.5, z1: 4 }, 'lower', 3.3));
  assert.equal(DUPLEX_STAIR.rise, 3.3);
});

test('户内避难间：选外墙有窗的卧室（优先登高面、主卧），校验存在 / 卧室或书房 / 有外窗；门扇为乙级', () => {
  const plan = COMMUNITY_PLANS.west.W1.units[0].plan;
  const id = pickRefugeRoom(plan, 'S');
  const room = plan.rooms.find((r) => r.id === id);
  assert.equal(room.kind, 'bedroom');
  assert.ok(plan.facadeWalls.some((f) => f.side === 'S' && f.openings.some((o) => o.room === id && o.type === 'window')), 'window on the hardstand face');
  assert.deepEqual(refugeRoomErrors({ ...plan, refugeRoom: id }), []);
  assert.deepEqual(validateHome({ ...plan, refugeRoom: id }, { type: plan.type.toUpperCase(), lux: false, level: 'flat' }), []);
  assert.ok(refugeRoomErrors({ ...plan, refugeRoom: 'nope' })[0].includes('missing'));
  const kitchen = plan.rooms.find((r) => r.kind === 'kitchen').id;
  assert.ok(refugeRoomErrors({ ...plan, refugeRoom: kitchen })[0].includes('not a bedroom or study'));
  const inner = plan.rooms.find((r) => r.kind === 'bedroom' && !plan.facadeWalls.some((f) => f.openings.some((o) => o.room === r.id && o.type === 'window')));
  if (inner) assert.ok(refugeRoomErrors({ ...plan, refugeRoom: inner.id })[0].includes('no exterior window'));
  assert.ok(validateHome({ ...plan, refugeRoom: kitchen }, { type: plan.type.toUpperCase(), lux: false, level: 'flat' }).some((e) => e.includes('refugeRoom')));
  // today's frozen plans name no refuge room, so validateHome is unchanged for them
  assert.ok(Object.values(COMMUNITY_PLANS.west).every((T) => T.units.every((u) => u.plan.refugeRoom === undefined)));
  // the leaf of its door (the one swinging into it) becomes 乙级; no other leaf changes
  const lv = { id: 'W1-2F', building: 'W1' }, F = frame(0, 0, 0);
  const plainUnit = communityUnit({ lv, building: 'W1', id: 'a', code: 'W1-0201', slot: 'SW', frame: F, plan, name: 'a', en: 'a' });
  const tagged = communityUnit({ lv, building: 'W1', id: 'b', code: 'W1-0201', slot: 'SW', frame: F, plan, name: 'a', en: 'a', refugeRoom: id });
  assert.equal(tagged.residence.refugeRoom, id); assert.equal(plainUnit.residence.refugeRoom, undefined);
  const fire = tagged.residence.doorLeaves.filter((l) => l.fire);
  assert.ok(fire.length >= 1 && fire.every((l) => l.fire === '乙级' && l.into === id), JSON.stringify(fire.map((l) => [l.id, l.into])));
  assert.equal(plainUnit.residence.doorLeaves.filter((l) => l.fire).length, 0);
  assert.deepEqual(tagged.residence.doorLeaves.map(({ fire: _, ...l }) => l), plainUnit.residence.doorLeaves, 'only the fire rating differs');
  assert.deepEqual(refugeDoorLeaves(plainUnit.residence), []);
  // the cached leaves of the untagged plan are not touched by the tagged one
  assert.equal(communityUnit({ lv, building: 'W1', id: 'c', code: 'W1-0201', slot: 'SW', frame: F, plan, name: 'a', en: 'a' }).residence.doorLeaves.filter((l) => l.fire).length, 0);
  assert.equal(doorLeaves(structuredClone(tagged.residence)).filter((l) => l.fire).length, fire.length);
});

test('planKey() 与生成器的 meta.key 相同；variantExtras 只在打开时加一间不增卧室的房间', () => {
  for (const v of [2, 8, 11]) {
    const g = generateHome({ ...BASE, id: `k${v}`, type: '4BR', variant: v, exclude: [] });
    assert.equal(planKey(g.residence), g.meta.key, `variant ${v}`);
  }
  assert.equal(VARIANT_EXTRAS.length, 5);
  for (let v = 0; v < 5; v++) {
    const off = program('4BR', { lux: true, variant: v }), on = program('4BR', { lux: true, variant: v, variantExtras: true });
    assert.ok(on.rooms.length > off.rooms.length, `variant ${v}: no extra room`);
    assert.equal(on.rooms.filter((r) => r.kind === 'bedroom').length, off.rooms.filter((r) => r.kind === 'bedroom').length, 'extras add no bedroom');
  }
  assert.deepEqual(program('4BR', { lux: true, level: 'upper', variant: 1, variantExtras: true }), program('4BR', { lux: true, level: 'upper', variant: 1 }), 'flats only');
  assert.equal(homeStair({ x0: 0, z0: 0, x1: 2.5, z1: 4 }, 'lower', 3.4).flights[1].y1, 3.4);
});

test('二期 R 顶层复式挂钩：wing 规格、入户面部分外墙、3.4 m 复式楼梯，buildDuplexUnits() 生成上下两层', () => {
  const W = R_WINGS.W, s = wingSpec({ id: 'x', type: '4BR' }, { w: W.w, d: W.d, exteriorEdges: W.exteriorEdges, rise: W.rise });
  assert.deepEqual([s.w, s.d, s.exposed, s.front, s.rise], [17.6, 14.3, { left: true, right: true }, [[0, 7.4]], 3.4]);
  assert.throws(() => wingSpec({}, { w: 10, d: 10, exteriorEdges: { S: false } }), /rear/);
  const [first] = spikeWing('W', { count: 1 }).homes;
  assert.ok(first.ok && first.voidAbove && first.rise === 3.4 && first.stairSame && !first.errs.length, JSON.stringify(first));
  const spec = { id: 'R1-PH-W', w: W.w, d: W.d, lux: true, type: first.type, entryAt: first.entryAt, voidAbove: true, variant: first.variant, view: 'left' };
  const g = generateDuplex(spec, { wing: { w: W.w, d: W.d, exteriorEdges: W.exteriorEdges, rise: W.rise } });
  assert.ok(g.lower.residence.exteriorSides.includes('N') && g.lower.residence.facadeWalls.some((f) => f.id === 'facade-N-0'));
  assert.equal(g.lower.residence.homeStair.rise, 3.4);
  const levels = [{ id: 'R1-52F', building: 'R1' }, { id: 'R1-53F', building: 'R1' }], F = frame(-19.4 + 115, -200, 0);
  const refuge = pickRefugeRoom(g.lower.residence, 'S');
  const [lower, upper] = buildDuplexUnits({ building: 'R1', community: 'r', home: 'R1-5201', slot: '01', levels, ids: ['R1-52F-01', 'R1-53F-01'],
    codes: ['R1-5201', 'R1-5201-U'], names: ['顶层复式 · 下层', '顶层复式 · 上层'], en: ['PH LOWER', 'PH UPPER'],
    plans: [g.lower.residence, g.upper.residence], refugeRooms: [refuge, null] }, F);
  assert.deepEqual([lower.level, upper.level], ['R1-52F', 'R1-53F']);
  assert.deepEqual([lower.residence.partner, upper.residence.partner], ['R1-53F-01', 'R1-52F-01']);
  assert.deepEqual(lower.residence.homeLevels, ['R1-52F', 'R1-53F']); assert.equal(lower.residence.home, 'R1-5201');
  assert.equal(lower.fronts.length, 1); assert.deepEqual(upper.fronts, []);
  assert.equal(lower.residence.community, 'r');
  assert.equal(lower.residence.refugeRoom, refuge); assert.equal(upper.residence.refugeRoom, undefined);
  assert.ok(lower.residence.doorLeaves.some((l) => l.fire === '乙级'));
  assert.ok(lower.residence.obstacles.some((o) => o.id === 'home-stair-under-B'), 'duplex companions applied');
  assert.throws(() => buildDuplexUnits({ levels: [levels[0]], ids: ['a'], plans: [] }, F), /two levels/);
});
