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

/**
 * 「HDR 光影」下的面层做法：数值是粗糙度（越小越反光）。只换这几种本来就该亮的面——抛光石材、清漆木地板、
 * 不锈钢、烤漆——墙面、地毯、混凝土不动。关掉 HDR 就回到原来的数值。
 */
export const HDR_FINISH = Object.freeze({
  base: Object.freeze({ satin: 0.2, metal: 0.16, extSatin: 0.24, extMetal: 0.18, stone: 0.3, wood: 0.6 }),
  floor: Object.freeze({ 'marble-white': 0.26, 'terrazzo-cool': 0.3, 'terrazzo-warm': 0.3, 'wood-warm': 0.46, 'metro-terrazzo': 0.5, 'metro-platform': 0.56,
    'concrete-blue': 0.62, 'concrete-green': 0.62 }),
});
/** 室外材质反射天空的强度倍数（乘在 env.js 的 HDR_GRADE.sky 上）：玻璃幕墙和水面要亮一些才看得出云。 */
const SKY_GAIN = Object.freeze({ water: 1.3, mirror: 1.3, facadeWindow: 1.2, facadeWindowLit: 1.2 });

/**
 * 贴地的假阴影用的两张渐变图：blob 是中间深、四周淡出的一团（家具脚下），edge 是一边深、向另一边淡出的一条（墙根）。
 * 只有黑色和透明度；画不出来（没有 DOM）时返回 null。
 */
function shadowTextures() {
  if (typeof document === 'undefined') return null;
  const make = (draw) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); if (!g?.createRadialGradient) return null;
    draw(g);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const blob = make((g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(0,0,0,.58)'); r.addColorStop(.5, 'rgba(0,0,0,.44)'); r.addColorStop(.8, 'rgba(0,0,0,.15)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  const edge = make((g) => {
    const l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, 'rgba(0,0,0,.52)'); l.addColorStop(.35, 'rgba(0,0,0,.26)'); l.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = l; g.fillRect(0, 0, 64, 64);
  });
  // 灯下的光斑：中间亮、向外淡出的一团（加色混合，颜色由顶点色给）
  const pool = make((g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.62)'); r.addColorStop(.7, 'rgba(255,255,255,.2)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  // 窗边的天光：贴着窗的一边最亮，向屋里淡出；两头也收一下，不留硬边
  const spill = make((g) => {
    const l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, 'rgba(255,255,255,1)'); l.addColorStop(.3, 'rgba(255,255,255,.6)'); l.addColorStop(.7, 'rgba(255,255,255,.16)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(0, 0, 64, 64);
    const ends = g.createLinearGradient(0, 0, 64, 0);
    ends.addColorStop(0, 'rgba(0,0,0,0)'); ends.addColorStop(.14, 'rgba(0,0,0,1)'); ends.addColorStop(.86, 'rgba(0,0,0,1)'); ends.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = ends; g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'source-over';
  });
  return blob && edge && pool && spill ? { blob, edge, pool, spill } : null;
}

export class MaterialLib {
  /** depthCues：要不要准备贴地假阴影的材质（完整园区和小游戏要；FPS 不要，画面保持原样）。 */
  constructor(surfaces = {}, { depthCues = false } = {}) {
    this.surfaces = surfaces;
    this.night = 0;
    this.nightHooks = [];
    // HDR 光影：finishes 记下哪些材质有「亮面」做法；outdoorMats 是室外材质，开着时反射真实天空
    this.hdr = false; this.sky = null; this.skyIntensity = 1;
    this.finishes = []; this.outdoorMats = new Set();
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
      // Opaque (park lake, fountains, the 'water' batch key): drawn in the opaque pass, so the curtain-wall glassTint
      // (transparent, no depth write) seen in front of it is no longer painted over by a later transparent sheet.
      water: std({ color: 0x356f8f, roughness: 0.04, metalness: 0.65, envMapIntensity: 2.2 }),
      mirror: std({ color: 0x8fb4c8, roughness: 0.02, metalness: 0.95, envMapIntensity: 2.4 }),
    };
    const shadows = depthCues ? shadowTextures() : null;
    if (shadows) for (const [key, map] of [['aoBlob', shadows.blob], ['aoEdge', shadows.edge]]) {
      // 贴花：只有透明度起作用；略微抬离地面并加深度偏移，不和地面打架；不写深度
      const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.name = key; m.userData.decal = true;
      this.base[key] = m;
    }
    // 住宅里的墙面和家具：细抹灰纹理（有法线起伏，不再是一片纯色），夜里的亮度和原来的纯色墙面一样
    if (surfaces.fine_plaster) {
      const m = interior({ roughness: 1, metalness: 0, ...pbrOptions(surfaces.fine_plaster, 0.3) }, 0.42);
      m.name = 'home wall · fine_plaster'; m.userData.homeFinish = true;
      this.base.homeMatte = m;
    }
    if (shadows) {
      // 光斑贴花：灯下、窗边地面上的一团光。加色混合；白天淡，入夜（室内靠灯照明时）明显一些
      const m = new THREE.MeshBasicMaterial({ map: shadows.pool, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.name = 'lightPool'; m.userData.decal = true;
      this.base.lightPool = m;
      this.onNight((t) => { m.opacity = (this.hdr ? 0.32 : 0.2) + t * 0.1; }); // 白天也明显一些：效果图里店门口、走道上一片片暖光
    }
    if (shadows) {
      // 天花上的一团光（灯周围、灯槽洗亮的一条）：和 lightPool 同一张贴图，正反两面都画（从下往上看）。商场白天也开着灯，白天淡、夜里亮
      const m = new THREE.MeshBasicMaterial({ map: shadows.pool, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.name = 'ceilPool'; m.userData.decal = true;
      this.base.ceilPool = m;
      this.onNight((t) => { m.opacity = (this.hdr ? 0.24 : 0.18) + t * (this.hdr ? 0.26 : 0.24); });
    }
    if (shadows) {
      // 窗边的天光：只在白天有，入夜淡出
      const m = new THREE.MeshBasicMaterial({ map: shadows.spill, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      m.name = 'dayPool'; m.userData.decal = true;
      this.base.dayPool = m;
      this.onNight((t) => { m.opacity = (this.hdr ? 0.36 : 0.28) * Math.max(0, 1 - t * 1.4); });
    }
    Object.assign(this.base, createFacadeMaterials(surfaces, fn => this.onNight(fn)));
    for (const [key, id, strength, roughness = 0.86, metalness = 0] of [
      ['wood', 'oak_wood_planks', 0.32], ['stone', 'marble_01', 0.22, 0.48],
      ['concrete', 'concrete_pavement_02', 0.3], ['brick', 'brick_wall_09', 0.55],
      // 室内墙面：抹灰、木格栅、洞石墙板、拉丝铜饰面（程序化面层，粗糙度由贴图决定）
      ['plaster', 'fine_plaster', 0.35, 1], ['slat', 'timber_slat', 0.7, 1],
      ['travertine', 'travertine_panel', 0.5, 0.9], ['bronze', 'bronze_brushed', 0.3, 1, 0.7],
      ['carpet', 'woven_carpet', 0.38, 1],
    ]) {
      const asset = surfaces[id];
      this.base[key] = interior({ roughness, metalness,
        ...(asset ? pbrOptions(asset, strength) : {}) }, 0.14);
      this.base[key].name = `CC0 ${key}`;
    }
    for (const [key, roughness] of Object.entries(HDR_FINISH.base)) this.finish(this.base[key], roughness);
    for (const key of ['ext', 'extSatin', 'extMetal', 'foliage', 'glassTint', 'water', 'mirror']) this.outdoor(this.base[key], SKY_GAIN[key]);
    // 外立面材质（地铁站厅的两种墙面虽然也在那张表里，但在地下，不反射天空）
    for (const [key, material] of Object.entries(this.base)) if (/^(facade|roofTile)/.test(key)) this.outdoor(material, SKY_GAIN[key]);
    // 灯具类：白天灰白，夜晚明亮（配合泛光）。HDR 光影下白天也是亮着的（亮度超过 1，高光柔光会让它溢出一点光）
    const glow = this.base.glow;
    this.onNight((t) => glow.color.setScalar(this.hdr ? 1.55 + t * 0.35 : 0.85 + t * 0.9));
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

  /**
   * 登记一种材质在 HDR 光影下的粗糙度（亮面做法）。base 是它平时的粗糙度。
   * 各栋楼会克隆共享材质（带上自己的剖切面），克隆出来的也自动登记；谁要是自己改过粗糙度，就不再动它。
   */
  finish(material, roughness, base = material?.roughness) {
    if (!material) return material;
    this.finishes.push({ material, base, hdr: roughness });
    if (material.roughness === base || material.roughness === roughness) material.roughness = this.hdr ? roughness : base;
    const lib = this, clone = material.clone;
    material.clone = function () { return lib.finish(clone.call(this), roughness, base); };
    return material;
  }

  /**
   * 登记一种室外材质：HDR 光影下它反射真实天空，而不是室内环境图。gain 是反射强度的倍数。
   * 克隆出来的材质也自动登记：反射强度要跟着昼夜变，漏掉一个，夜里那栋楼就会被白天的天空照得发白。
   */
  outdoor(material, gain = 1) {
    if (!material?.isMeshStandardMaterial) return material;
    material.userData.skyGain = gain;
    this.outdoorMats.add(material);
    if (material.envMap !== this.sky) { material.envMap = this.sky; material.needsUpdate = true; }
    if (this.sky) material.envMapIntensity = this.skyIntensity * gain;
    const lib = this, clone = material.clone;
    material.clone = function () { return lib.outdoor(clone.call(this), gain); };
    return material;
  }

  /** 开关 HDR 光影：亮面做法、室外材质的天空反射（sky 是天空环境图；没有就用场景的室内环境图）。 */
  setHdr(on, sky = null) {
    this.hdr = !!on;
    for (const f of this.finishes) if (f.material.roughness === f.base || f.material.roughness === f.hdr) f.material.roughness = on ? f.hdr : f.base;
    if (this.sky !== sky) {
      this.sky = sky;
      for (const m of this.outdoorMats) { m.envMap = sky; m.needsUpdate = true; }
    }
    this.setSkyIntensity(this.skyIntensity);
    this.setNight(this.night);
  }

  setSkyIntensity(value) {
    this.skyIntensity = value;
    if (this.sky) for (const m of this.outdoorMats) m.envMapIntensity = value * (m.userData.skyGain ?? 1);
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
    const outdoor = def?.outdoor || ['paving', 'asphalt', 'grass', 'deck-garden', 'roof-stone', 'rubber', 'cobble'].includes(kind);
    if (asset) {
      const colorAsset = this.surfaces[def.pattern] || asset;
      const m = metricFloor(new THREE.MeshStandardMaterial({
        ...pbrOptions(asset, def.normal ?? (kind === 'grass' ? 0.7 : 0.32)), color: def.tint || '#ffffff',
        map: colorAsset.maps.color,
        roughness: def.roughness ?? Math.min(1, roughness + 0.2), metalness: 0,
        emissiveMap: colorAsset.maps.color, emissive: 0x000000,
      }), asset, colorAsset);
      m.name = `${kind} · ${asset.id} · CC0`;
      m.userData = { surface: asset.id, pattern: colorAsset.id, finish: kind, outdoor: !!outdoor };
      this.onNight((t) => m.emissive.copy(WARM).multiplyScalar(t * (def.glow ?? (outdoor ? .055 : .32))));
      this.floors[kind] = m;
      if (HDR_FINISH.floor[kind] != null) this.finish(m, HDR_FINISH.floor[kind]);
      if (outdoor) this.outdoor(m);
      return m;
    }
    const { texture, meters } = floorTexture(kind);
    texture.repeat.set(1 / meters, 1 / meters);
    const m = new THREE.MeshStandardMaterial({ map: texture, roughness, metalness: 0, emissiveMap: texture, emissive: 0x000000 });
    this.onNight((t) => m.emissive.copy(WARM).multiplyScalar(outdoor ? t * 0.06 : t * 0.36));
    this.floors[kind] = m;
    if (HDR_FINISH.floor[kind] != null) this.finish(m, HDR_FINISH.floor[kind]);
    if (outdoor) this.outdoor(m);
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
