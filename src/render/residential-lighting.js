// A fixed pool follows the active dwelling. A floor overview distributes the
// same pool across all three homes rather than allocating lights per storey.
import * as THREE from 'three';
import { MOBILE } from './device.js';
import { toL } from '../layout/geom.js';
import { residentialMatrix } from './build/residential-models.js';

const LEGACY_03 = [
  ['living west', 7.4, 2.3, 19], ['living east', 10.6, 2.7, 19], ['dining', 10.6, 7.4, 24],
  ['primary', 1.7, 2, 15], ['primary entry', 2.6, 4.7, 7], ['guest', 16.1, 1.2, 15],
  ['northwest bedroom', 2.3, 9, 18], ['northeast bedroom', 16, 9, 18], ['kitchen', 6.1, 9.7, 19],
  ['foyer', 8.65, 10.2, 10], ['west gallery', 4.8, 6.2, 10], ['east gallery', 15.6, 6.2, 10],
  ['primary bath', 4.6, 4.05, 12], ['guest bath', 16.5, 4.05, 12], ['common bath', 11.25, 10.4, 12],
  ['laundry', 13.1, 10.5, 8], ['balcony', 9, -1.25, 10],
];
const sourcePoint = ([x, y, z]) => new THREE.Vector3(x, z, -y);

export function createResidentialLighting(ctx) {
  const group = new THREE.Group(); group.name = 'residential-light-pool'; group.visible = false; ctx.scene.add(group);
  const pool = Array.from({ length: MOBILE ? 8 : 12 }, (_, index) => {
    const light = new THREE.SpotLight('#ffe4c2', 0, 6.5, 1.08, .68, 2);
    light.name = `residential-pool-${index + 1}`;
    light.castShadow = !MOBILE && index < 2;
    if (light.castShadow) {
      light.shadow.mapSize.set(512, 512); light.shadow.bias = -.0003;
      light.shadow.normalBias = .018; light.shadow.camera.near = .08;
    }
    group.add(light, light.target);
    return { light, power: 0, assignment: null };
  });
  const definitions = new Map();
  for (const [unit, template] of ctx.residentialAssets.templates) {
    const config = template.record.lighting;
    const powerScale = config?.powerScale ?? 1;
    const lights = (config?.roomLamps || LEGACY_03).map(([name, x, y, power]) => ({
      name, position: sourcePoint([x, y, 2.70]), target: sourcePoint([x, y, .1]), power: power * powerScale,
    }));
    for (const [name, point, target, power] of config?.taskLamps || []) lights.push({
      name, position: sourcePoint(point), target: sourcePoint(target), power: power * powerScale,
    });
    definitions.set(unit, lights);
  }
  let active = null, activeLevel = null, mode = 'off', key = '', clock = Infinity, ownedEnvironment = false;
  const world = new THREE.Vector3();
  function resolve(app) {
    const level = ctx.lvById[app.state.explore?.level || app.state.focus];
    if (!level || !level.units.some(unit => unit.residence?.prototype)) return null;
    const point = app.state.explore ? ctx.camera.position : app.controls.target;
    let unit = level.units.find(unit => unit.id === app.state.selected);
    if (app.state.explore) unit = level.units.find(candidate => {
      const [x, z] = toL(candidate.frame, point.x, point.z), rect = candidate.rects[0];
      return x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
    });
    return { level, unit: unit?.residence?.prototype ? unit : null, point,
      inside: !!app.state.explore && !!unit };
  }
  function candidates(unit, level, point) {
    const transform = residentialMatrix(unit, level.elev);
    return definitions.get(unit.residence.prototype).map(spec => {
      const position = spec.position.clone().applyMatrix4(transform);
      return { ...spec, position, target: spec.target.clone().applyMatrix4(transform), unit: unit.id,
        distance: world.copy(position).sub(point).lengthSq() };
    });
  }
  const api = {
    get activeUnit() { return active?.id || null; },
    get activeLevel() { return activeLevel?.id || null; },
    get mode() { return mode; },
    get lightCount() { return pool.length; },
    get assignments() { return pool.map(({ assignment }) => assignment); },
    update(dt, elapsed, app) {
      const resolved = resolve(app);
      // A zero-intensity visible light still occupies a Three.js shader light
      // slot. Hide the entire inactive pool, including its shadow casters.
      group.visible = !!resolved;
      active = resolved?.unit || null; activeLevel = resolved?.level || null;
      mode = resolved ? resolved.inside ? 'dwelling' : 'floor' : 'off';
      const nextKey = resolved ? `${resolved.level.id}:${mode}:${active?.id || ''}` : '';
      clock += dt;
      if (nextKey !== key || clock >= .22) {
        clock = 0;
        let selected = [];
        if (resolved?.inside) selected = candidates(active, resolved.level, resolved.point).sort((a, b) => a.distance - b.distance).slice(0, pool.length);
        else if (resolved) {
          // Round robin prevents the nearest home consuming the whole overview pool.
          const lists = resolved.level.units.filter(unit => unit.residence?.prototype).map(unit => {
            const origin = new THREE.Vector3(8, 0, -5).applyMatrix4(residentialMatrix(unit, resolved.level.elev));
            return candidates(unit, resolved.level, origin).sort((a, b) => {
              const rank = spec => /living|dining|primary$|bedroom/i.test(spec.name) ? 0 : 1;
              return rank(a) - rank(b) || a.distance - b.distance;
            });
          });
          for (let i = 0; selected.length < pool.length && i < 20; i++) for (const list of lists) {
            if (selected.length < pool.length && list[i]) selected.push(list[i]);
          }
        }
        let moved = false;
        pool.forEach((record, index) => {
          const spec = selected[index], assignment = spec ? `${spec.unit}:${spec.name}` : null;
          if (record.assignment !== assignment) moved = true;
          record.assignment = assignment; record.power = spec?.power || 0;
          if (spec) {
            record.light.position.copy(spec.position); record.light.target.position.copy(spec.target);
            record.light.target.updateMatrixWorld();
          }
        });
        if (moved || key !== nextKey) ctx.renderer.shadowMap.needsUpdate = true;
        key = nextKey;
      }
      const night = app.env.night;
      for (const record of pool) record.light.intensity = record.power * (resolved ? .68 + .32 * night : 0);
      // Registered after suiteLighting: only take ownership on residential floors.
      // On exit restore the campus environment; suiteLighting keeps its H/A exposure.
      if (resolved) {
        ownedEnvironment = true;
        ctx.scene.environmentIntensity = .88 - .53 * night;
        app.env.hemi.intensity = .9 - .62 * night;
        app.env.bloom.strength = .10 * night; app.env.bloom.threshold = 1.25;
        ctx.renderer.toneMappingExposure = .96 + .09 * night;
      } else if (ownedEnvironment) {
        ownedEnvironment = false;
        ctx.scene.environmentIntensity = .45 - .37 * night;
        app.env.hemi.intensity = .62 - .5 * night;
      }
    },
    dispose() { for (const { light } of pool) light.dispose(); group.removeFromParent(); },
  };
  ctx.dynamic.push(api);
  return api;
}
