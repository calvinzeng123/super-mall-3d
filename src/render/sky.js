// HDR 天空：一张小的环境照明图（RGBE，亮度不封顶在 1）和一张看得见的天空照片。
// 开了「HDR 光影」才加载；两个文件加起来约 210 KB。
import * as THREE from 'three';
import { SKY_ASSETS } from './sky-data.js';
import { fetchBinary } from './fetch-binary.js';

/**
 * 解出 scripts/sky/build-sky.mjs 写的不压缩 RGBE 文件。
 * 返回 { width, height, data }：data 是 RGBA 半浮点，行序已经翻成贴图坐标（第 0 行是地平线以下的最底一行，最后一行是天顶）。
 */
export function decodeRadiance(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let head = '', p = 0;
  while (p < u8.length && p < 512) { head += String.fromCharCode(u8[p++]); if (/\n\n-Y \d+ \+X \d+\n$/.test(head)) break; }
  const size = /\n\n-Y (\d+) \+X (\d+)\n$/.exec(head);
  if (!size || !head.startsWith('#?RADIANCE')) throw new Error('天空环境图不是 RGBE 文件');
  const height = +size[1], width = +size[2];
  if (u8.length - p !== width * height * 4) throw new Error('天空环境图的数据长度不对（只支持不压缩的 RGBE）');
  const data = new Uint16Array(width * height * 4), half = THREE.DataUtils.toHalfFloat, one = half(1);
  for (let y = 0; y < height; y++) {
    const row = (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const i = p + (y * width + x) * 4, o = row + x * 4, e = u8[i + 3], f = e ? 2 ** (e - 136) : 0;
      data[o] = half(u8[i] * f); data[o + 1] = half(u8[i + 1] * f); data[o + 2] = half(u8[i + 2] * f); data[o + 3] = one;
    }
  }
  return { width, height, data };
}

const dataBytes = (url) => {
  const binary = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** 加载两份天空素材。返回 { radiance: 等距柱状的 HDR 贴图, photo: 上半球的天空照片 }。 */
export async function loadSky(assets = SKY_ASSETS) {
  const bytes = assets.radiance.startsWith('data:') ? dataBytes(assets.radiance) : new Uint8Array(await fetchBinary(assets.radiance, { label: '天空环境图' }));
  const { width, height, data } = decodeRadiance(bytes);
  const radiance = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  radiance.name = 'sky-radiance';
  radiance.mapping = THREE.EquirectangularReflectionMapping;
  radiance.colorSpace = THREE.LinearSRGBColorSpace;
  radiance.minFilter = radiance.magFilter = THREE.LinearFilter;
  radiance.wrapS = THREE.RepeatWrapping;
  radiance.needsUpdate = true;
  const image = new Image();
  image.src = assets.photo;
  await image.decode();
  const photo = new THREE.Texture(image);
  photo.name = 'sky-photo';
  photo.colorSpace = THREE.SRGBColorSpace;
  // 不用多级贴图：经度在 ±180° 接缝处跳变，多级贴图会在那里取到最模糊的一级，画出一条线
  photo.generateMipmaps = false;
  photo.minFilter = photo.magFilter = THREE.LinearFilter;
  photo.wrapS = THREE.RepeatWrapping; photo.wrapT = THREE.ClampToEdgeWrapping;
  photo.needsUpdate = true;
  return { radiance, photo };
}
