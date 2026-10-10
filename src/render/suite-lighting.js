// 固定的近景灯池。所有套房共用灯位方案，实际灯光随当前房间移动，避免400套常驻灯。
import * as THREE from 'three';
import { MOBILE } from './device.js';
import { toL, toW } from '../layout/geom.js';
import { suiteMatrix } from './build/suite-models.js';

export const SUITE_LIGHTS = [
  { name: 'bed-downlight', p: [3.45, 2.64, 1.3], intensity: 12, range: 4.5 },
  { name: 'living-downlight', p: [3.45, 2.62, 4.35], intensity: 13, range: 4.5 },
  { name: 'entry-downlight', p: [8.3, 2.42, 4.05], intensity: 9, range: 4.5 },
  { name: 'bath-downlight', p: [7.3, 2.44, 1.08], intensity: 13, range: 4.2 },
  { name: 'vanity-task', p: [6.75, 2.33, 2.65], aim: [6.7, 1, 3.05], intensity: 4, range: 3 },
  { name: 'window-reading', p: [.7, 2.63, 1.6], intensity: 6, range: 4.5 },
  { name: 'headboard-cove', type: 'point', p: [3.45, 2.38, .6], intensity: .7, range: 3.1 },
  { name: 'living-lamp', type: 'point', p: [5.2, 1.3, 5.2], intensity: 2, range: 2.5 },
];

export function createSuiteLighting(ctx) {
  const { scene, renderer, camera } = ctx;
  const specs = MOBILE ? SUITE_LIGHTS.filter((_, i) => i !== 5 && i !== 7) : SUITE_LIGHTS;
  const group = new THREE.Group(); group.name = 'suite-light-pool'; group.visible = false; scene.add(group);
  const pool = [...specs, { name: 'apartment-kitchen', unit: true, p: [9.3, 2.88, 4.1], intensity: 16, range: 5 },
    { name: 'duplex-bedroom', unit: true, p: [5.2, 5.92, 10.8], intensity: 20, range: 5 }].map((spec, i) => {
    const light = spec.type === 'point' ? new THREE.PointLight('#ffcf95', 0, spec.range, 2)
      : new THREE.SpotLight('#ffe2bf', 0, spec.range, 1.02, .65, 2);
    light.name = spec.name;
    light.castShadow = !MOBILE && [0, 3].includes(i);
    if (light.castShadow) {
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -.0003; light.shadow.normalBias = .018;
      light.shadow.camera.near = .08;
    }
    group.add(light);
    if (light.isSpotLight) group.add(light.target);
    return { light, spec };
  });
  let key = '', active = null, activeLevel = null;
  const tmp = new THREE.Vector3();
  function resolve(app) {
    const lv = ctx.lvById[app.state.explore?.level || app.state.focus];
    if (!lv || !['hotel', 'apartment'].includes(lv.kind)) return null;
    const selected = lv.units.find(u => u.id === app.state.selected);
    const point = app.state.explore ? camera.position : app.controls.target;
    let unit = app.state.explore ? null : selected;
    if (!unit) {
      let best = Infinity;
      for (const u of lv.units) {
        const p = toL(u.frame, point.x, point.z), r = u.rects[0];
        if (p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.z0 && p[1] <= r.z1) { unit = u; break; }
        const d = (p[0] - 5.5) ** 2 + (p[1] - 6) ** 2;
        if (d < best) { best = d; unit = u; }
      }
    }
    return unit?.residence?.suitePlan ? { lv, unit } : null;
  }
  const api = {
    get activeUnit() { return active?.id || null; },
    get lightCount() { return pool.length; },
    update(dt, elapsed, app) {
      const r = resolve(app);
      // Inactive lamps must leave the renderer light list, not just have zero
      // intensity; otherwise every campus material evaluates the whole pool.
      group.visible = !!r;
      const next = r ? `${r.lv.id}:${r.unit.id}` : '';
      if (next !== key) {
        key = next; active = r?.unit || null; activeLevel = r?.lv || null;
        if (r) {
          const xf = suiteMatrix(r.unit, r.lv.elev);
          for (const {light, spec} of pool) {
            if (spec.unit) {
              const p = toW(r.unit.frame, spec.p[0], spec.p[2]);
              light.position.set(p[0], r.lv.elev + spec.p[1], p[1]);
              if (light.isSpotLight) light.target.position.set(p[0], light.position.y - 2.6, p[1]);
            } else {
              light.position.copy(tmp.fromArray(spec.p).applyMatrix4(xf));
              if (light.isSpotLight) light.target.position.copy(tmp.fromArray(spec.aim || [spec.p[0], .1, spec.p[2]]).applyMatrix4(xf));
            }
            light.target?.updateMatrixWorld();
          }
        }
        renderer.shadowMap.needsUpdate = true;
      }
      for (const {light,spec} of pool) {
        const enabled = !!active && (spec.name !== 'duplex-bedroom' || !!active.residence.duplex);
        light.intensity = enabled ? spec.intensity : 0;
      }
      // 室内保留布料与木纹细节；离开房间后恢复园区夜景参数。
      const local = active ? toL(active.frame, camera.position.x, camera.position.z) : null;
      const inside = !!local && local[0] >= 0 && local[0] <= 11 && local[1] >= 0 && local[1] <= 15
        && camera.position.y >= activeLevel.elev && camera.position.y < activeLevel.elev + activeLevel.height;
      const night = app.env.night;
      app.env.bloom.strength = (inside ? .10 : .85) * night;
      app.env.bloom.threshold = inside ? 1.25 : .8;
      renderer.toneMappingExposure = inside ? .94 : .92 + .2 * night;
      // 环境反射保留暖白底色，近景主照明来自真实灯池。
      if (ctx.suiteAsset) {
        const night = app.env.night;
        for (const m of ctx.suiteAsset.materials || []) m.envMapIntensity = .65 + night * .35;
      }
    },
    dispose() {
      for (const {light} of pool) light.dispose();
      group.removeFromParent();
    },
  };
  ctx.dynamic.push(api);
  return api;
}
