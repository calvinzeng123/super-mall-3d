// 贴图小模型库：Poly Haven 的 CC0 模型（scripts/props 加工过），整个园区共用。
// 每个模型一个网格、一种材质、一张贴图，另有一份面数约三成的远景几何。
// 摆放用实例化，并按 12 m 的格子分块：离相机近的块画精细版，远一点画简化版，再远就不画。
// 模型按需解析：第一次有人摆它时才解包、解码贴图，没用到的不占内存。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PROP_ASSETS, PROP_PACK } from './prop-data.js';
import { fetchBinary } from '../fetch-binary.js';
import { MOBILE } from '../device.js';

const WARM = new THREE.Color(1.0, 0.9, 0.76);
/** 室内的模型夜里按自己的贴图发一点光（和室内其他材质一样，模拟店里的灯）。 */
const INDOOR_GLOW = 0.34;
/** 分块的格子边长（m）。 */
export const PROP_CELL = 12;
/**
 * 三档画质下的细节范围：near 是块离相机多近以内画精细版（m），
 * reach 乘上模型的最大边长得到最远画到多远，floor / ceiling 是这个距离的下限和上限。
 */
export const PROP_DETAIL = Object.freeze({
  low: Object.freeze({ near: 5, reach: 30, floor: 22, ceiling: 140 }),
  balanced: Object.freeze({ near: 7, reach: 42, floor: 30, ceiling: 200 }),
  high: Object.freeze({ near: 9, reach: 56, floor: 38, ceiling: 260 }),
});

/** 一种模型最远画到多远（m）：小东西近一点就收起来，大件看得远。 */
export function propRange(size, detail = PROP_DETAIL.high) {
  return Math.max(detail.floor, Math.min(detail.ceiling, Math.max(size[0], size[1], size[2]) * detail.reach));
}

const bytesOfDataUrl = (url) => {
  const binary = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** 手机上贴图边长减半（显存降到四分之一），上传显卡后把内存里的那份放掉。 */
function prepareTexture(texture, anisotropy) {
  const image = texture.image;
  if (MOBILE && image && Math.max(image.width, image.height) > 128) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, image.width >> 1); canvas.height = Math.max(64, image.height >> 1);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.image = canvas;
    image.close?.();
  }
  texture.anisotropy = Math.min(4, anisotropy);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.onUpdate = function () {
    const source = this.image;
    if (source?.close) source.close(); else if (source?.getContext) { source.width = 1; source.height = 1; }
    this.onUpdate = null;
  };
  texture.needsUpdate = true;
  return texture;
}

/** 把摆放记录按「模型 | 室内外 | 格子」分组；格子取实例位置（矩阵的平移分量）。纯函数，测试里直接用。 */
export function chunkPlacements(placements, cell = PROP_CELL) {
  const lots = new Map();
  for (const p of placements) {
    const key = `${p.id}|${p.outdoor ? 1 : 0}|${Math.floor(p.m[12] / cell)}|${Math.floor(p.m[14] / cell)}`;
    if (!lots.has(key)) lots.set(key, []);
    lots.get(key).push(p);
  }
  return lots;
}

/**
 * mats：MaterialLib（用它的 onNight 让室内模型夜里亮起来）；onChange：有模型补进场景时通知（重画阴影）。
 * assets / pack 默认用构建生成的目录，测试里可以换成别的。
 */
export function createPropLibrary({ mats = null, anisotropy = 4, onChange = () => {}, tier = MOBILE ? 'low' : 'high', assets = PROP_ASSETS, pack = PROP_PACK, packBytes = null } = {}) {
  const records = new Map(assets.map((a) => [a.id, a]));
  const templates = new Map(), pending = new Map(), failed = new Set();
  const shared = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const chunks = new Set();
  const stats = { catalog: records.size, parsed: 0, instances: 0, chunks: 0, failed: 0, shownNear: 0, shownFar: 0, trianglesShown: 0 };
  let loader = null, packData = packBytes, jobs = 0, detail = PROP_DETAIL[tier] || PROP_DETAIL.high;
  const idleWaiters = [];

  async function packed(offset, length) {
    if (!packData) packData = pack.url.startsWith('data:') ? bytesOfDataUrl(pack.url) : new Uint8Array(await fetchBinary(pack.url, { label: '家具与绿植模型' }));
    return packData.slice(offset, offset + length).buffer;
  }
  const bytesOf = (url) => (url.startsWith('data:') ? bytesOfDataUrl(url).buffer : fetchBinary(url, { label: '家具与绿植模型' }));

  async function mesh(bytes, id) {
    if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, '');
    gltf.scene.updateMatrixWorld(true);
    let found = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !found) found = o; });
    if (!found) throw new Error(`模型里没有网格：${id}`);
    found.geometry.computeBoundingBox(); found.geometry.computeBoundingSphere();
    return found;
  }

  async function parse(record) {
    const [near, far] = await Promise.all([
      (pack ? packed(record.offset, record.length) : bytesOf(record.url)).then((b) => mesh(b, record.id)),
      (pack ? packed(record.lodOffset, record.lodLength) : bytesOf(record.lodUrl)).then((b) => mesh(b, record.id)),
    ]);
    const source = near.material;
    const map = source.map ? prepareTexture(source.map, anisotropy) : null;
    const options = {
      map, roughness: source.roughness, metalness: source.metalness, alphaTest: record.alpha ? 0.5 : 0,
      side: record.alpha ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 0.7,
    };
    const outdoor = new THREE.MeshStandardMaterial(options);
    outdoor.name = `prop ${record.id} · outdoor · CC0`;
    const indoor = new THREE.MeshStandardMaterial({ ...options, emissiveMap: map, emissive: 0x000000 });
    indoor.name = `prop ${record.id} · indoor · CC0`;
    if (mats?.onNight) mats.onNight((t) => indoor.emissive.copy(WARM).multiplyScalar(t * INDOOR_GLOW));
    source.dispose(); far.material.dispose();
    for (const g of [near.geometry, far.geometry]) shared.geometries.add(g);
    shared.materials.add(outdoor); shared.materials.add(indoor);
    if (map) shared.textures.add(map);
    stats.parsed++;
    const tris = (g) => (g.index?.count ?? g.attributes.position.count) / 3;
    return {
      record, indoor, outdoor,
      near: { geometry: near.geometry, matrix: near.matrixWorld.clone(), triangles: tris(near.geometry) },
      far: { geometry: far.geometry, matrix: far.matrixWorld.clone(), triangles: tris(far.geometry) },
    };
  }

  const settle = () => { if (!jobs) for (const done of idleWaiters.splice(0)) done(); };
  function request(id) {
    if (templates.has(id)) return Promise.resolve(templates.get(id));
    if (!pending.has(id)) {
      jobs++;
      pending.set(id, parse(records.get(id)).then((template) => { templates.set(id, template); return template; },
        (error) => { failed.add(id); stats.failed++; console.error(`贴图模型加载失败：${id}`, error); return null; })
        .finally(() => { pending.delete(id); jobs--; settle(); }));
    }
    return pending.get(id);
  }

  const m4 = new THREE.Matrix4(), color = new THREE.Color(), point = new THREE.Vector3();
  function instanced(group, template, level, list, outdoor) {
    const object = new THREE.InstancedMesh(level.geometry, outdoor ? template.outdoor : template.indoor, list.length);
    object.name = `prop-${template.record.id}`;
    const tinted = list.some((p) => p.color != null);
    list.forEach((p, i) => {
      object.setMatrixAt(i, m4.fromArray(p.m).multiply(level.matrix));
      if (tinted) object.setColorAt(i, color.set(p.color ?? 0xffffff));
    });
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
    object.receiveShadow = true;
    object.matrixAutoUpdate = false;
    object.visible = false; // 由 update() 按距离打开
    object.userData.prop = template.record.id;
    object.computeBoundingSphere();
    group.add(object);
    object.updateMatrixWorld(true);
    return object;
  }
  function build(group, template, list, outdoor) {
    const near = instanced(group, template, template.near, list, outdoor);
    const far = instanced(group, template, template.far, list, outdoor);
    near.userData.lod = 'near'; far.userData.lod = 'far';
    near.castShadow = template.record.size[1] > 0.35;
    const chunk = { near, far, center: near.boundingSphere.center.clone(), radius: near.boundingSphere.radius, size: template.record.size,
      count: list.length, nearTriangles: template.near.triangles * list.length, farTriangles: template.far.triangles * list.length };
    chunks.add(chunk);
    // 楼层细节换出时会对实例化网格调用 dispose()，这里跟着把块摘掉
    near.addEventListener('dispose', () => { chunks.delete(chunk); stats.instances -= chunk.count; stats.chunks--; });
    stats.instances += list.length; stats.chunks++;
  }

  return {
    stats,
    has: (id) => records.has(id) && !failed.has(id),
    info: (id) => records.get(id) || null,
    /** 已解析的模板（几何、还原量化的矩阵）；没解析过返回 null。核对摆放位置的工具用。 */
    template: (id) => templates.get(id) || null,
    ids: () => [...records.keys()],
    request,
    /** 把一批摆放记录 [{ id, m, outdoor, color }] 变成实例化网格挂到 group 下；没解析好的模型解析完再补上。 */
    instantiate(group, placements) {
      for (const list of chunkPlacements(placements.filter((p) => records.has(p.id))).values()) {
        const { id, outdoor } = list[0], ready = templates.get(id);
        if (ready) { build(group, ready, list, outdoor); continue; }
        jobs++;
        request(id).then((template) => {
          // 楼层细节可能已经被换出（group 脱离了场景），这时就不补了
          if (template && (group.parent || group.userData.keepProps)) { build(group, template, list, outdoor); onChange(); }
        }).finally(() => { jobs--; settle(); });
      }
    },
    /**
     * 单独摆一件（不走实例化，小游戏里的道具用）：返回一个 Group，原点在模型的落脚点、正面朝 +Z。
     * 里面的网格带 userData.sharedProp：几何和材质是全园区共用的，用完只把 Group 摘掉，别 dispose。
     */
    async spawn(id, { outdoor = false } = {}) {
      const template = records.has(id) ? await request(id) : null;
      if (!template) return null;
      const object = new THREE.Mesh(template.near.geometry, outdoor ? template.outdoor : template.indoor);
      object.matrixAutoUpdate = false; object.matrix.copy(template.near.matrix);
      object.castShadow = object.receiveShadow = true;
      object.userData.sharedProp = true;
      const group = new THREE.Group();
      group.name = `prop-${id}`; group.add(object);
      return group;
    },
    /** 每帧调用：按相机距离决定每一块画精细版、简化版还是不画。所在楼层没显示的块直接跳过。 */
    update(camera) {
      let near = 0, far = 0, triangles = 0;
      for (const chunk of chunks) {
        let shown = true;
        for (let node = chunk.near.parent; node; node = node.parent) if (!node.visible) { shown = false; break; }
        if (!shown) continue;
        const d = point.copy(chunk.center).applyMatrix4(chunk.near.matrixWorld).distanceTo(camera.position) - chunk.radius;
        const show = d < propRange(chunk.size, detail), close = d < detail.near;
        chunk.near.visible = show && close; chunk.far.visible = show && !close;
        if (show) { if (close) { near += chunk.count; triangles += chunk.nearTriangles; } else { far += chunk.count; triangles += chunk.farTriangles; } }
      }
      stats.shownNear = near; stats.shownFar = far; stats.trianglesShown = triangles;
    },
    /** 画质档位变了（流畅 / 均衡 / 精细）：换一套细节范围。 */
    setTier(next) { detail = PROP_DETAIL[next] || detail; stats.tier = next; },
    /** 打包发布时先把整包下载好；下载不到就抛错，调用方退回程序化几何。 */
    async warm() { if (pack && !packData) await packed(0, 0); },
    /** 所有在路上的模型都解析完、补进场景后才返回（开场用，免得家具一件件冒出来）。 */
    idle: () => (jobs ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve()),
    /** 共享的几何、材质、贴图：楼层细节换出时不能跟着销毁。 */
    resources: () => shared,
  };
}
