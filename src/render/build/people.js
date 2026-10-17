// Textured Rocketbox humanoids with eight native-rig walking poses, instanced
// per level/model. Atlas and morph geometry are shared across the whole mall.
import * as THREE from 'three';
import { polyline } from '../paths.js';
import { rng } from '../textures.js';
import { loadPeopleAssets } from '../people-asset.js';
import { createPeopleSupport } from '../people-support.js';

const COUNT = { parking: 12, food: 70, retail: 75, roof: 45, street: 40, concourse: 80, platform: 56 };

export async function buildPeople(ctx) {
  const assets = await loadPeopleAssets(ctx.renderer.capabilities.getMaxAnisotropy());
  const rand = rng(99), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(), position = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const walkers = [], pos = [0, 0, 0], dir = [0, 0, 1];
  let density = ctx.quality?.crowdDensity ?? 1;
  const stats = { models: assets.length, textured: true, morphPoses: 8, capacity: 0, visible: 0, density };

  for (const lv of ctx.layout.levels) {
    const paths = (ctx.paths.levels[lv.id] || {}).people || [];
    if (!paths.length) continue;
    const count = lv.kind === 'street' && lv.ground ? 120 : COUNT[lv.kind] || 20;
    const variants = assets.map(asset => {
      const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, count);
      mesh.name = `textured-people-${lv.id}-${asset.id}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Allocate morph texture at full capacity before distance/density culling
      // reduces draw count; later quality increases must not overflow it.
      mesh.setMorphAt(0, asset.source);
      ctx.levels[lv.id].people.add(mesh);
      return { mesh, asset, visible: 0 };
    });
    const list = [];
    for (let i = 0; i < count; i++) {
      const onEsc = rand() < .16;
      const pool = paths.filter(path => !!path.escalator === onEsc);
      const available = pool.length ? pool : paths;
      const path = available[Math.floor(rand() * available.length)];
      const pl = polyline(path.pts, path.loop);
      list.push({ pl, loop: path.loop, escalator: !!path.escalator,
        d: rand() * pl.total, speed: path.escalator ? .5 : .85 + rand() * .55,
        dir: path.loop && rand() < .5 ? -1 : 1,
        lateral: path.escalator ? (rand() - .5) * .25 : (rand() - .5) * (lv.kind === 'parking' ? .6 : 2.4),
        phase: rand(), size: .94 + rand() * .1, variant: i % assets.length,
        // A deterministic rank keeps the same population while changing quality.
        rank: (i + .5) / count,
      });
    }
    const extraPieces = (ctx.layout.extensions?.paths || []).filter(path => path.level === lv.id)
      .flatMap(path => path.slab?.pieces || []);
    const support = createPeopleSupport(lv, extraPieces);
    walkers.push({ lv, variants, list, support, group: ctx.levels[lv.id].people });
    stats.capacity += count;
  }

  const place = (walker, step, time) => {
    const maxDistance = density <= .3 ? 95 : density < .8 ? 155 : 230;
    for (const variant of walker.variants) variant.visible = 0;
    for (const actor of walker.list) {
      actor.d += actor.speed * actor.dir * step;
      if (!actor.loop && (actor.d > actor.pl.total || actor.d < 0)) {
        actor.d = Math.max(0, Math.min(actor.pl.total, actor.d));
        actor.dir *= -1;
      }
      if (actor.rank > density) continue;
      actor.pl.at(actor.d, pos, dir);
      const nx = -dir[2], nz = dir[0], length = Math.hypot(nx, nz) || 1;
      position.set(pos[0] + nx / length * actor.lateral,
        pos[1] - (actor.escalator ? 1.32 : .015), pos[2] + nz / length * actor.lateral);
      const offset = ctx.levels[walker.lv.id].offset || 0;
      const distanceSq = (position.x - ctx.camera.position.x) ** 2 +
        (position.y + offset - ctx.camera.position.y) ** 2 + (position.z - ctx.camera.position.z) ** 2;
      if (distanceSq > maxDistance ** 2) continue;
      // Test the actual laterally shifted position. The path clock above keeps
      // running while an actor crosses an opening, so it reappears on solid floor.
      if (!walker.support(position.x, position.z, actor.escalator)) continue;
      const variant = walker.variants[actor.variant], { mesh, asset } = variant;
      rotation.setFromAxisAngle(up, Math.atan2(dir[0] * actor.dir, dir[2] * actor.dir));
      scale.setScalar(actor.size);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(variant.visible, matrix);
      const weights = asset.source.morphTargetInfluences;
      weights.fill(0);
      // Standing pose on escalators. Distant pedestrians update at the same
      // bounded cadence, with no bone matrices or CPU vertex skinning.
      const phase = actor.escalator ? 0 : ((time * actor.speed / 1.1 / asset.cycleSeconds + actor.phase) % 1) * asset.poses;
      const frame = Math.floor(phase), blend = phase - frame;
      weights[frame] = 1 - blend;
      weights[(frame + 1) % asset.poses] += blend;
      mesh.setMorphAt(variant.visible++, asset.source);
    }
    for (const { mesh, visible } of walker.variants) {
      mesh.count = visible;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.morphTexture.needsUpdate = true;
      stats.visible += visible;
    }
  };
  const visibleInTree = group => {
    for (let node = group; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  let accumulated = 0, lastTime = 0;
  const refresh = (step, time) => {
    stats.visible = 0;
    for (const walker of walkers) {
      if (!visibleInTree(walker.group)) {
        for (const variant of walker.variants) variant.mesh.count = 0;
        continue;
      }
      place(walker, step, time);
    }
  };
  ctx.peopleQuality = {
    stats,
    setDensity(value) {
      density = Math.max(0, Math.min(1, Number(value) || 0));
      stats.density = density;
      refresh(0, lastTime);
    },
  };
  // Never leave newly instantiated people stacked at the origin.
  refresh(0, 0);
  ctx.dynamic.push({ update(dt, time) {
    accumulated += dt;
    if (accumulated < (density <= .3 ? 1 / 20 : 1 / 30)) return;
    const step = accumulated;
    accumulated = 0; lastTime = time;
    refresh(step, time);
  } });
}
