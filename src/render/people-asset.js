import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PEOPLE_ASSETS } from './people-data.js';
import { MOBILE } from './device.js';
import { fetchBinary } from './fetch-binary.js';

let pending;
/** Two locally bundled, MIT-licensed humanoids; geometry/texture/morph poses are
 * shared by every level. No per-walker skeleton or animation mixer is allocated. */
export function loadPeopleAssets(anisotropy = 4) {
  if (!pending) pending = Promise.all(PEOPLE_ASSETS.map(async record => {
    const loader = new GLTFLoader();
    let gltf;
    if (record.url.startsWith('data:')) {
      const binary = atob(record.url.slice(record.url.indexOf(',') + 1));
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      gltf = await loader.parseAsync(bytes.buffer, '');
    } else gltf = await loader.parseAsync(await fetchBinary(record.url, { label: '人物模型' }), THREE.LoaderUtils.extractUrlBase(record.url));
    const parts = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const geometry = object.geometry;
      // The prepared asset has identity transforms. Apply any future source
      // transform consistently to its relative morph position/normal targets.
      if (!object.matrixWorld.equals(new THREE.Matrix4())) throw new Error('People asset must be baked to identity transforms');
      if (geometry.morphAttributes.position?.length !== record.poses) throw new Error('People walking poses are missing');
      const material = object.material;
      material.transparent = false;
      material.alphaTest = .45;
      material.depthWrite = true;
      material.side = THREE.DoubleSide;
      material.roughness = .86;
      material.metalness = 0;
      material.envMapIntensity = .2;
      if (material.map) {
        const image = material.map.image;
        if (MOBILE && Math.max(image.width, image.height) > 512) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 512;
          canvas.getContext('2d').drawImage(image, 0, 0, 512, 512);
          material.map.image = canvas;
          material.map.needsUpdate = true;
          image.close?.();
        }
        material.map.anisotropy = Math.min(4, anisotropy);
      }
      outfits(material, geometry);
      parts.push({ geometry, material, source: object });
    });
    if (parts.length !== 1) throw new Error('People asset must have one atlas material');
    return { ...record, ...parts[0] };
  })).catch(error => { pending = null; throw error; });
  return pending;
}

/**
 * 衣服换色：只有两个人物模型，满场都是同一件条纹衫、同一件粉上衣。每个人一个实例颜色（InstancedMesh.setColorAt），
 * 着色器里只给衣服上色：腰以上、脖子以下按实例颜色换上衣，腰以下换成深一些的裤子；暖色（皮肤、卡其）和很暗（头发、鞋）的像素保持原样。
 * 没有实例颜色的网格（手机里没设、或别处复用）照原样画。
 */
function outfits(material, geometry) {
  // 身高按第 0 帧走路姿势量：基础顶点 + 第 0 帧的位移（姿势是相对位移存的，单看基础顶点或把所有姿势叠在一起量都不对）
  const pos = geometry.attributes.position, d0 = geometry.morphAttributes.position[0];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) + (geometry.morphTargetsRelative ? d0.getY(i) : d0.getY(i) - pos.getY(i)); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const h = hi - lo;
  const uniforms = { uWaist: { value: lo + h * .53 }, uNeck: { value: lo + h * .81 } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyY;')
      .replace('#include <morphtarget_vertex>', '#include <morphtarget_vertex>\nvBodyY = transformed.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBodyY;\nuniform float uWaist, uNeck;')
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_COLOR
{
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(.299, .587, .114));
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = mx > 0. ? (mx - mn) / mx : 0.;
  float warm = step(c.b, c.g) * step(c.g, c.r) * smoothstep(.24, .34, sat);
  float dark = 1. - smoothstep(.03, .09, lum);
  float body = step(vBodyY, uNeck);
  vec3 ic = vColor.rgb; // 有的程序变体里 vColor 是 vec4（USE_COLOR_ALPHA），统一取 rgb
  vec3 tint = vBodyY > uWaist ? ic : vec3(.05, .055, .07) + ic.gbr * .22;
  vec3 recolor = tint * (.35 + .7 * lum);
  diffuseColor.rgb = mix(c, recolor, body * (1. - max(warm, dark)));
}
#endif`);
  };
  material.userData.outfitBand = [uniforms.uWaist.value, uniforms.uNeck.value, lo, hi];
  material.customProgramCacheKey = () => 'people-outfits';
}
