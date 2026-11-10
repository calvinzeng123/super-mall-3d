// 保安的外形：用园区行人的贴图模型（Microsoft Rocketbox，MIT），在贴图上把上衣、长裤、鞋重新涂成制服，
// 加一顶帽子和一束手电光。走路用模型自带的八个姿势循环，站着时回到自然站姿。
// 行人那份几何上传显卡后就把内存里的顶点放掉了，这里单独再解析一份（要读顶点来分区上色）。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PEOPLE_ASSETS } from '../render/people-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { MOBILE } from '../render/device.js';
import { GUARD_UNIFORM, GUARD_CYCLES_PER_METRE, uniformRegion } from './guard-uniform.js';

export { GUARD_UNIFORM, GUARD_CYCLES_PER_METRE, uniformRegion };

async function parsePerson(record) {
  const bytes = record.url.startsWith('data:')
    ? Uint8Array.from(atob(record.url.slice(record.url.indexOf(',') + 1)), (c) => c.charCodeAt(0)).buffer
    : await fetchBinary(record.url, { label: '保安模型' });
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh || mesh.geometry.morphAttributes.position?.length !== record.poses) throw new Error('保安模型缺少走路姿势');
  return mesh;
}

/** 在贴图上把制服涂出来：每个三角形按所在分区，用半透明的制服色盖在原贴图上（留一点原来的褶皱明暗）。 */
function paintUniform(mesh, height) {
  const image = mesh.material.map.image, size = MOBILE ? 512 : Math.min(1024, image.width);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.drawImage(image, 0, 0, size, size);
  const P = mesh.geometry.attributes.position, T = mesh.geometry.attributes.uv, I = mesh.geometry.index;
  const count = I ? I.count : P.count, at = (i) => (I ? I.getX(i) : i);
  g.globalAlpha = 0.9; g.lineJoin = 'round'; g.lineWidth = 2.5;
  for (let i = 0; i < count; i += 3) {
    const a = at(i), b = at(i + 1), c = at(i + 2);
    const region = uniformRegion((P.getX(a) + P.getX(b) + P.getX(c)) / 3, (P.getY(a) + P.getY(b) + P.getY(c)) / 3, height);
    if (!region) continue;
    g.fillStyle = g.strokeStyle = GUARD_UNIFORM[region];
    g.beginPath();
    g.moveTo(T.getX(a) * size, T.getY(a) * size); g.lineTo(T.getX(b) * size, T.getY(b) * size); g.lineTo(T.getX(c) * size, T.getY(c) * size);
    g.closePath(); g.fill(); g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

/**
 * 载入一次，之后 create() 出任意多名保安。
 * 返回 { create(), dispose() }；create() 返回 { group, cone, animate(metresMoved, dt), dispose() }：
 *   group 的原点在脚下，面朝局部 +Z；cone 是手电光（材质可改颜色）。
 */
export async function loadGuardKit() {
  const record = PEOPLE_ASSETS.find((a) => a.id === 'm') || PEOPLE_ASSETS[0];
  const source = await parsePerson(record);
  const height = new THREE.Box3().setFromBufferAttribute(source.geometry.attributes.position).max.y;
  const map = paintUniform(source, height);
  source.material.map?.dispose(); source.material.dispose();
  const material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.86, metalness: 0,
    emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.22, envMapIntensity: 0.2 });
  const capMat = new THREE.MeshStandardMaterial({ color: GUARD_UNIFORM.cap, roughness: 0.7, emissive: GUARD_UNIFORM.cap, emissiveIntensity: 0.25 });
  const bandMat = new THREE.MeshBasicMaterial({ color: GUARD_UNIFORM.band });
  const crown = new THREE.CylinderGeometry(0.098, 0.106, 0.075, 14), brim = new THREE.BoxGeometry(0.17, 0.014, 0.1), band = new THREE.CylinderGeometry(0.108, 0.108, 0.018, 14);
  const beamGeo = new THREE.CylinderGeometry(0.03, 0.75, 4.6, 14, 1, true).translate(0, -2.3, 0);
  const shared = [source.geometry, map, material, capMat, bandMat, crown, brim, band, beamGeo];

  return {
    poses: record.poses,
    create() {
      const group = new THREE.Group();
      const body = new THREE.Mesh(source.geometry, material);
      body.frustumCulled = false; // 姿势会把四肢带出站姿的包围盒
      const top = height - 0.005;
      const cap = new THREE.Group();
      const c = new THREE.Mesh(crown, capMat); c.position.set(0, top + 0.02, 0.012);
      const b = new THREE.Mesh(brim, capMat); b.position.set(0, top - 0.012, 0.125);
      const s = new THREE.Mesh(band, bandMat); s.position.set(0, top - 0.008, 0.012);
      cap.add(c, b, s);
      // 手电光：从胸前斜向前下方的一束淡光（只是一个加色的锥面，不是真的灯）
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c4, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0.16, 1.12, 0.2); beam.rotation.x = -1.33; beam.renderOrder = 3;
      group.add(body, cap, beam);
      const weights = body.morphTargetInfluences;
      let phase = 0, still = 1;
      return {
        group, beamMat,
        /** 这一帧走了 metres 米：推进步态；站住不动约 0.3 秒后回到站姿。 */
        animate(metres, dt) {
          if (metres > 1e-4) { phase = (phase + metres * GUARD_CYCLES_PER_METRE) % 1; still = 0; } else still = Math.min(1, still + dt / 0.3);
          const f = phase * record.poses, frame = Math.floor(f) % record.poses, blend = f - Math.floor(f), k = 1 - still;
          weights.fill(0);
          weights[frame] = (1 - blend) * k;
          weights[(frame + 1) % record.poses] += blend * k;
        },
        dispose() { beamMat.dispose(); },
      };
    },
    dispose() { for (const item of shared) item.dispose(); },
  };
}
