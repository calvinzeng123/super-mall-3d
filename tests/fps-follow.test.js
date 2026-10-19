import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, step, clear } from '../src/layout/nav.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
import { findPath } from '../src/fps/pathfinding.js';
import { recordTrail, advanceTrail } from '../src/fps/follower.js';

const nav = buildNav(buildPlayableLayout({ mode: 'fps' }));
const stops = [FPS_MISSION.spawn, ...FPS_MISSION.objectives];
const routes = stops.slice(1).map((stop, i) => findPath(nav, stops[i], stop));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = p => ({ ...p, slope: p.slope ? { ...p.slope } : null });

for (const fps of [20, 30, 60]) test(`teammate physically follows the complete extraction route at ${fps} fps`, () => {
  const dt = 1 / fps;
  let player = copy(stops[0]), ally = copy(FPS_MISSION.teammate), trail = [copy(player)], index = 0;
  let maxDistance = 0, maxTrail = 0, followedStair = false, followedEscalator = false;
  const updateFollower = () => {
    const out = advanceTrail(nav, ally, trail, index, { dt });
    assert.ok(clear(nav, out.state), `ally left walkable geometry on ${out.state.floor}`);
    assert.ok(distance(ally, out.state) <= 7.4 * dt + .001, 'ally teleported or exceeded walking speed');
    ally = out.state; index = out.index;
    followedStair ||= !!ally.slope?.id.includes('ST');
    followedEscalator ||= nav.slopeById.get(ally.slope?.id)?.kind === 'escalator';
    maxDistance = Math.max(maxDistance, distance(player, ally)); maxTrail = Math.max(maxTrail, trail.length);
    if (index > 300) { trail.splice(0, index - 1); index = 1; }
  };
  for (let leg = 0; leg < routes.length; leg++) {
    const route = routes[leg];
    for (const target of route.slice(1)) {
      let frames = 0;
      while (distance(player, target) > .025 || player.floor !== target.floor || player.slope) {
        assert.ok(++frames < fps * 45, `player cannot reach ${target.floor}`);
        const d = distance(player, target), amount = Math.min(d, 6.2 * dt);
        const dx = (target.x - player.x) / d * amount, dz = (target.z - player.z) / d * amount;
        const n = Math.max(1, Math.ceil(amount / .15));
        for (let i = 0; i < n; i++) { player = step(nav, player, dx / n, dz / n, dt / n); recordTrail(trail, player); }
        updateFollower();
      }
    }
    // Reading a terminal/intel and the final extraction all leave time for the
    // squad to close its intentional following gap, using movement only.
    for (let i = 0; i < fps * 8; i++) updateFollower();
    assert.equal(ally.floor, player.floor, `ally was left on another level at mission leg ${leg}`);
    assert.ok(distance(ally, player) < 4.1, `ally fell behind at mission leg ${leg}: ${distance(ally, player)}`);
  }
  assert.ok(followedStair, 'route must exercise stair and landing states');
  assert.ok(followedEscalator, 'route must exercise the formerly stuck escalator');
  assert.ok(maxDistance < 15, `squad separation grew to ${maxDistance}m`);
  assert.ok(maxTrail < 450, `consumed trail was not released: ${maxTrail}`);
});
