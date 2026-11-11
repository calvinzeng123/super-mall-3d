// HDR 天空素材：从 Poly Haven 下载一张纯天空的 HDRI（CC0），加工成运行时用的两份小文件。
//   assets/sky/day-radiance.hdr   256 × 128 的 RGBE，给基于图像的照明用（反射和环境光）。太阳的亮度压到 SUN_CLAMP 以内：
//                                 太阳的直射光由平行光另算，环境图里留得太亮会重复计入，还会在粗糙表面上出噪点。
//                                 饱和度压到六成：整片蓝天当环境光，背阴面会蓝得发冷。
//   assets/sky/day-sky.jpg        2048 × 512 的上半球天空（地平线以上），给看得见的天空背景用。
//   assets/sky/manifest.json      出处、作者、原始文件的校验值、太阳在图里的位置、成品的校验值。
// 加工时把整张图水平平移，让图里的太阳正好落在场景里平行光的方位角上，运行时就不用再旋转。
//
// 用法：node scripts/sky/build-sky.mjs <缓存目录>      （要 sharp：npm i --no-save sharp）
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = process.argv[2];
if (!cache) { console.error('用法：node scripts/sky/build-sky.mjs <缓存目录>'); process.exit(1); }

export const SKY_SOURCE = { id: 'kloofendal_48d_partly_cloudy_puresky', resolution: '2k' };
/** 场景里平行光（太阳）的方向，和 src/render/env.js 的 sunDir 一致。 */
export const SUN_DIR = [-0.55, 0.78, 0.62];
const SUN_CLAMP = 24;         // 环境图里单个像素的亮度上限
const RADIANCE_SATURATION = 0.6; // 环境图的饱和度：原图的天空很蓝，全拿来当环境光，背阴面会蓝得发冷；压到六成，反射里仍然看得出蓝天
const SKY_EXPOSURE = 0.62;    // 天空背景的曝光
const AGENT = 'yunlan-sky-pipeline/1.0';
const md5 = (b) => createHash('md5').update(b).digest('hex');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

async function get(url) {
  for (let i = 0; ; i++) {
    try { const res = await fetch(url, { headers: { 'User-Agent': AGENT } }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return Buffer.from(await res.arrayBuffer()); }
    catch (error) { if (i >= 3) throw new Error(`${url}: ${error.message}`); await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); }
  }
}
async function cached(file, url, sum) {
  try { await stat(file); const bytes = await readFile(file); if (!sum || md5(bytes) === sum) return bytes; } catch { /* 没有缓存就下载 */ }
  const bytes = await get(url);
  if (sum && md5(bytes) !== sum) throw new Error(`md5 不符：${url}`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return bytes;
}

const files = JSON.parse(await cached(path.join(cache, `${SKY_SOURCE.id}.files.json`), `https://api.polyhaven.com/files/${SKY_SOURCE.id}`));
const info = JSON.parse(await cached(path.join(cache, `${SKY_SOURCE.id}.info.json`), `https://api.polyhaven.com/info/${SKY_SOURCE.id}`));
const hdr = files.hdri[SKY_SOURCE.resolution].hdr;
const bytes = await cached(path.join(cache, path.basename(hdr.url)), hdr.url, hdr.md5);
const parsed = new RGBELoader().setDataType(THREE.FloatType).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const { width: W, height: H, data } = parsed;
const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

// ---------- 太阳在哪：最亮的一小片的亮度加权中心 ----------
let peak = 0, peakAt = 0;
for (let i = 0; i < W * H; i++) { const l = lum(i * 4); if (l > peak) { peak = l; peakAt = i; } }
let sx = 0, sy = 0, sw = 0;
const px = peakAt % W, py = Math.floor(peakAt / W), R = Math.round(W / 64);
for (let y = Math.max(0, py - R); y <= Math.min(H - 1, py + R); y++) for (let x = px - R; x <= px + R; x++) {
  const xx = (x + W) % W, l = lum((y * W + xx) * 4);
  if (l > peak * 0.1) { sx += x * l; sy += y * l; sw += l; }
}
const sunU = ((sx / sw + 0.5) / W + 1) % 1, sunRow = sy / sw + 0.5;
const elevation = (0.5 - sunRow / H) * 180; // 行 0 是天顶
// three 的等距柱状投影：u = atan2(z, x) / 2π + 0.5
const sceneU = Math.atan2(SUN_DIR[2], SUN_DIR[0]) / (2 * Math.PI) + 0.5;
const shift = Math.round(((sceneU - sunU + 1) % 1) * W);   // 整张图向右平移这么多列
const sceneElevation = Math.asin(SUN_DIR[1] / Math.hypot(...SUN_DIR)) * 180 / Math.PI;
console.log(`原图 ${W} × ${H}，最亮处 ${peak.toFixed(0)}，太阳 u=${sunU.toFixed(4)} 仰角 ${elevation.toFixed(1)}°；场景太阳 u=${sceneU.toFixed(4)} 仰角 ${sceneElevation.toFixed(1)}°；平移 ${shift} 列`);
const at = (x, y) => (y * W + ((x - shift) % W + W) % W) * 4; // 平移后的 (x, y) 取原图的哪个像素

// ---------- 环境照明用的小图：256 × 128，面积平均，亮度封顶 ----------
const RW = 256, RH = 128, k = W / RW;
const radiance = new Float32Array(RW * RH * 3);
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
    const i = at(xx, yy); let pr = data[i], pg = data[i + 1], pb = data[i + 2];
    const l = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
    if (l > SUN_CLAMP) { const s = SUN_CLAMP / l; pr *= s; pg *= s; pb *= s; }
    r += pr; g += pg; b += pb; n++;
  }
  const o = (y * RW + x) * 3, ar = r / n, ag = g / n, ab = b / n, grey = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
  radiance[o] = grey + (ar - grey) * RADIANCE_SATURATION; radiance[o + 1] = grey + (ag - grey) * RADIANCE_SATURATION; radiance[o + 2] = grey + (ab - grey) * RADIANCE_SATURATION;
}
// 地平线以下（纯天空素材的下半张是填充）换成偏暖的地面反光，免得室外的反射里出现「地下的天空」
const horizon = [0, 0, 0];
for (let x = 0; x < RW; x++) for (let c = 0; c < 3; c++) horizon[c] += radiance[((RH / 2 - 2) * RW + x) * 3 + c] / RW;
for (let y = RH / 2; y < RH; y++) for (let x = 0; x < RW; x++) {
  const t = Math.min(1, (y - RH / 2) / 10), o = (y * RW + x) * 3;
  const ground = [0.34, 0.31, 0.27].map((g, c) => g * 0.55 + horizon[c] * 0.12);
  for (let c = 0; c < 3; c++) radiance[o + c] = radiance[((RH / 2 - 1) * RW + x) * 3 + c] * (1 - t) + ground[c] * t;
}
/** 写成不压缩的 Radiance RGBE（.hdr）。 */
function encodeRGBE(rgb, w, h) {
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'ascii'), body = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], m = Math.max(r, g, b);
    if (m < 1e-32) continue;
    let e = Math.ceil(Math.log2(m)); let s = 256 / 2 ** e;
    if (m * s >= 256) { e++; s /= 2; }
    body[i * 4] = Math.min(255, Math.floor(r * s)); body[i * 4 + 1] = Math.min(255, Math.floor(g * s)); body[i * 4 + 2] = Math.min(255, Math.floor(b * s)); body[i * 4 + 3] = e + 128;
  }
  return Buffer.concat([head, body]);
}
const radianceBytes = encodeRGBE(radiance, RW, RH);

// ---------- 看得见的天空：上半球，2048 × 512，曝光后转 sRGB ----------
const SW = 2048, SH = 512, ks = W / SW;
const sky = Buffer.alloc(SW * SH * 3);
const srgb = (v) => { const c = Math.max(0, Math.min(1, v)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); };
// 高光压缩：0.8 以下原样，以上平滑收到 1（和渲染里的色调映射一个思路），太阳周围不出硬边
const shoulder = (v) => (v <= 0.8 ? v : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)));
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let yy = Math.floor(y * ks); yy < Math.max(Math.floor(y * ks) + 1, Math.floor((y + 1) * ks)); yy++) for (let xx = Math.floor(x * ks); xx < Math.max(Math.floor(x * ks) + 1, Math.floor((x + 1) * ks)); xx++) {
    const i = at(xx, yy); r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  const o = (y * SW + x) * 3;
  sky[o] = srgb(shoulder(r / n * SKY_EXPOSURE)); sky[o + 1] = srgb(shoulder(g / n * SKY_EXPOSURE)); sky[o + 2] = srgb(shoulder(b / n * SKY_EXPOSURE));
}
const skyBytes = await sharp(sky, { raw: { width: SW, height: SH, channels: 3 } }).jpeg({ quality: 86, chromaSubsampling: '4:2:0', mozjpeg: true }).toBuffer();

const out = path.join(root, 'assets/sky');
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'day-radiance.hdr'), radianceBytes);
await writeFile(path.join(out, 'day-sky.jpg'), skyBytes);
// 地平线一圈的平均颜色（线性），运行时用它和雾、渐变天空的地平线对色
const rim = [0, 0, 0];
for (let x = 0; x < SW; x++) for (let c = 0; c < 3; c++) rim[c] += sky[((SH - 6) * SW + x) * 3 + c] / SW / 255;
const manifest = {
  license: 'CC0-1.0',
  source: { id: SKY_SOURCE.id, name: info.name, url: `https://polyhaven.com/a/${SKY_SOURCE.id}`, authors: info.authors, license: 'CC0-1.0',
    file: { url: hdr.url, md5: hdr.md5, bytes: hdr.size, resolution: SKY_SOURCE.resolution } },
  sun: { sourceU: +sunU.toFixed(5), elevationDeg: +elevation.toFixed(2), sceneDir: SUN_DIR, sceneU: +sceneU.toFixed(5), shiftColumns: shift, peakLuminance: +peak.toFixed(1) },
  processing: { sunClamp: SUN_CLAMP, radianceSaturation: RADIANCE_SATURATION, skyExposure: SKY_EXPOSURE },
  horizonSrgb: rim.map((v) => +v.toFixed(4)),
  radiance: { file: 'day-radiance.hdr', width: RW, height: RH, bytes: radianceBytes.length, sha256: sha256(radianceBytes) },
  sky: { file: 'day-sky.jpg', width: SW, height: SH, bytes: skyBytes.length, sha256: sha256(skyBytes) },
};
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`day-radiance.hdr ${(radianceBytes.length / 1024).toFixed(0)} KB，day-sky.jpg ${(skyBytes.length / 1024).toFixed(0)} KB，地平线颜色 ${manifest.horizonSrgb}`);
