// 共享材质库。室内材质在夜间按自身颜色自发光（模拟室内照明），室外材质不发光。
import * as THREE from 'three';
import { floorTexture, stepTexture, chevronTexture } from './textures.js';
import { FLOOR_SURFACES, pbrOptions, metricFloor } from './pbr.js';
import { createFacadeMaterials } from './facade-materials.js';

/** 让 emissive 乘以顶点色：夜间每个表面按自身颜色"亮起来" */
function patchVertexEmissive(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif',
    );
  };
  mat.customProgramCacheKey = () => 'vertex-emissive';
  return mat;
}

const WARM = new THREE.Color(1.0, 0.9, 0.76);

export class MaterialLib {
  constructor(surfaces = {}) {
    this.surfaces = surfaces;
    this.night = 0;
    this.nightHooks = [];
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const interior = (o, glow = 0.42) => {
      const m = patchVertexEmissive(std({ vertexColors: true, ...o }));
      this.onNight((t) => m.emissive.copy(WARM).multiplyScalar(t * glow));
      return m;
    };
    this.base = {
      matte: interior({ roughness: 0.82, metalness: 0 }),
      satin: interior({ roughness: 0.32, metalness: 0.05 }),
      metal: interior({ roughness: 0.3, metalness: 0.88 }, 0.18),
      ext: std({ vertexColors: true, roughness: 0.78, metalness: 0 }),
      extSatin: std({ vertexColors: true, roughness: 0.35, metalness: 0.1 }),
      extMetal: std({ vertexColors: true, roughness: 0.3, metalness: 0.85 }),
      foliage: std({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glowSoft: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glass: std({ color: 0xc9e2ea, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.24, depthWrite: false, envMapIntensity: 1.6 }),
      glassTint: std({ color: 0x7fa6b8, roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.62, depthWrite: false, envMapIntensity: 2.0 }),
      water: std({ color: 0x356f8f, roughness: 0.04, metalness: 0.65, transparent: true, opacity: 0.9, envMapIntensity: 2.2 }),
      mirror: std({ color: 0x8fb4c8, roughness: 0.02, metalness: 0.95, envMapIntensity: 2.4 }),
    };
    Object.assign(this.base, createFacadeMaterials(surfaces, fn => this.onNight(fn)));
    for (const [key, id, strength] of [
      ['wood', 'oak_wood_planks', 0.32], ['stone', 'marble_01', 0.22],
      ['concrete', 'concrete_pavement_02', 0.3], ['brick', 'brick_wall_09', 0.55],
    ]) {
      const asset = surfaces[id];
      this.base[key] = interior({ roughness: key === 'stone' ? 0.48 : 0.86,
        ...(asset ? pbrOptions(asset, strength) : {}) }, 0.14);
      this.base[key].name = `CC0 ${key}`;
    }
    // 灯具类：白天灰白，夜晚明亮（配合泛光）
    const glow = this.base.glow;
    this.onNight((t) => glow.color.setScalar(0.85 + t * 0.9));
    const soft = this.base.glowSoft;
    this.onNight((t) => soft.color.setScalar(0.88 - t * 0.18));
    const glass = this.base.glass;
    this.onNight((t) => { glass.opacity = 0.24 + t * 0.1; });
    this.floors = {};
    this.steps = { up: this.makeStep(), down: this.makeStep() };
    this.chevron = chevronTexture();
    this.flows = {};
  }

  onNight(fn) {
    this.nightHooks.push(fn);
    fn(this.night);
  }

  setNight(t) {
    this.night = t;
    for (const fn of this.nightHooks) fn(t);
  }

  /** 楼层地面材质（夜间按贴图自发光） */
  floor(kind, roughness = 0.5) {
    if (this.floors[kind]) return this.floors[kind];
    const def = FLOOR_SURFACES[kind];
    const asset = def && this.surfaces[def.id];
    const outdoor = ['paving', 'asphalt', 'grass', 'deck-garden', 'roof-stone', 'rubber', 'cobble'].includes(kind);
    if (asset) {
      const m = metricFloor(new THREE.MeshStandardMaterial({
        ...pbrOptions(asset, kind === 'grass' ? 0.7 : 0.32), color: def.tint || '#ffffff',
        roughness: Math.min(1, roughness + 0.2), metalness: 0,
        emissiveMap: asset.maps.color, emissive: 0x000000,
      }), asset);
      m.name = `${kind} · ${asset.id} · CC0`;
      this.onNight((t) => m.emissive.copy(WARM).multiplyScalar(outdoor ? t * 0.055 : t * 0.32));
      this.floors[kind] = m;
      return m;
    }
    const { texture, meters } = floorTexture(kind);
    texture.repeat.set(1 / meters, 1 / meters);
    const m = new THREE.MeshStandardMaterial({ map: texture, roughness, metalness: 0, emissiveMap: texture, emissive: 0x000000 });
    this.onNight((t) => m.emissive.copy(WARM).multiplyScalar(outdoor ? t * 0.06 : t * 0.36));
    this.floors[kind] = m;
    return m;
  }

  /** 招牌材质：白天轻微自发光，夜晚明亮 */
  sign(texture) {
    const m = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, roughness: 0.45, metalness: 0 });
    this.onNight((t) => { m.emissiveIntensity = 0.18 + t * 1.05; });
    return m;
  }

  /** 自发光贴图材质（LED 屏、灯箱） */
  screen(texture, day = 0.75, night = 1.5) {
    const m = new THREE.MeshBasicMaterial({ map: texture, toneMapped: true });
    this.onNight((t) => m.color.setScalar(day + (night - day) * t));
    return m;
  }

  makeStep() {
    const t = stepTexture();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.6, emissiveMap: t, emissive: 0x000000 });
    this.onNight((k) => m.emissive.setScalar(k * 0.25));
    return m;
  }

  /** 动线箭头材质（每种类型一份，贴图偏移独立滚动） */
  flow(type, color) {
    if (this.flows[type]) return this.flows[type];
    const t = this.chevron.clone();
    t.needsUpdate = true;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshBasicMaterial({ map: t, color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    this.flows[type] = m;
    return m;
  }
}
