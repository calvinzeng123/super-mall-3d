/** Prepare the supplied suite for campus use without changing the source file.
 * Usage: node scripts/prepare-suite-asset.mjs [path/to/original.glb]
 * All positions below use the user's source coordinates, in metres (+Y up).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'assets/models');
const originalPath = path.join(outDir, 'user-suite-original.glb');
const processedPath = path.join(outDir, 'user-suite-processed.glb');
const inputPath = process.argv[2] || originalPath;
await fs.mkdir(outDir, { recursive: true });
const original = await fs.readFile(inputPath);
if (path.resolve(inputPath) !== originalPath) {
  try {
    const stored = await fs.readFile(originalPath);
    if (!stored.equals(original)) throw new Error('Refusing to replace a different stored original asset');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    await fs.writeFile(originalPath, original);
  }
}
if (original.readUInt32LE(0) !== 0x46546c67) throw new Error('Expected GLB');
const jsonLength = original.readUInt32LE(12);
const gltf = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
const originalBin = original.subarray(28 + jsonLength);
const originalViews = gltf.bufferViews;
const originalAccessors = gltf.accessors;
const channels = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
const readAccessor = (index) => {
  const a = originalAccessors[index], v = originalViews[a.bufferView];
  const [read, bytes] = types[a.componentType];
  const width = channels[a.type], stride = v.byteStride || bytes * width;
  const start = (v.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, k) => originalBin[read](start + i * stride + k * bytes)));
};
const newViews = [], newAccessors = [], chunks = [];
let byteLength = 0;
function addView(buffer, target) {
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const view = { buffer: 0, byteOffset: byteLength, byteLength: buffer.length };
  if (target) view.target = target;
  chunks.push(buffer); byteLength += buffer.length;
  return newViews.push(view) - 1;
}
function addAccessor(rows, type, componentType = 5126, bounds = false) {
  const width = channels[type], size = componentType === 5123 ? 2 : 4;
  const buffer = Buffer.alloc(rows.length * width * size);
  rows.forEach((row, i) => row.forEach((n, k) => componentType === 5126 ? buffer.writeFloatLE(n, (i * width + k) * size) : componentType === 5123 ? buffer.writeUInt16LE(n, (i * width + k) * size) : buffer.writeUInt32LE(n, (i * width + k) * size)));
  const a = { bufferView: addView(buffer, type === 'SCALAR' ? 34963 : 34962), componentType, count: rows.length, type };
  if (bounds) {
    a.min = Array.from({ length: width }, (_, k) => rows.reduce((v, r) => Math.min(v, Math.fround(r[k])), Infinity));
    a.max = Array.from({ length: width }, (_, k) => rows.reduce((v, r) => Math.max(v, Math.fround(r[k])), -Infinity));
  }
  return newAccessors.push(a) - 1;
}

// Keep encoded source images byte-for-byte, including useful normal maps.
const encodedImageHashes = new Map();
for (const image of gltf.images) {
  const v = originalViews[image.bufferView];
  const bytes = originalBin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  encodedImageHashes.set(image.name, sha(bytes));
  image.bufferView = addView(bytes);
}
const norm = (v) => { const m = Math.hypot(...v) || 1; return v.map(x => x / m); };
const linearColor = hex => [1, 3, 5].map(i => { const s = Number.parseInt(hex.slice(i, i + 2), 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
// The source viewer used black exterior faces as a cutaway backdrop. They must
// become actual plaster facades in a building. Clone only Shell materials;
// source television / metal / furniture black remains byte-for-byte defined.
const exteriorPlaster = JSON.parse(JSON.stringify(gltf.materials.find(m => m.name === 'wall')));
exteriorPlaster.name = 'suiteExteriorPlaster';
exteriorPlaster.pbrMetallicRoughness.baseColorFactor = [...linearColor('#e2d8c8'), 1];
exteriorPlaster.pbrMetallicRoughness.roughnessFactor = .86;
exteriorPlaster.doubleSided = true;
const exteriorMaterialIndex = gltf.materials.push(exteriorPlaster) - 1;
const sectionCut = JSON.parse(JSON.stringify(gltf.materials.find(m => m.name === 'poche')));
sectionCut.name = 'suiteSectionCut';
sectionCut.pbrMetallicRoughness.baseColorFactor = [...linearColor('#796750'), 1];
sectionCut.pbrMetallicRoughness.roughnessFactor = .95;
const sectionMaterialIndex = gltf.materials.push(sectionCut) - 1;
const lerp = (a, b, t) => ({ p: a.p.map((x, i) => x + (b.p[i] - x) * t), n: norm(a.n.map((x, i) => x + (b.n[i] - x) * t)), uv: a.uv.map((x, i) => x + (b.uv[i] - x) * t) });
const planes = (b) => [[0, b[0], 1], [0, b[3], -1], [1, b[1], 1], [1, b[4], -1], [2, b[2], 1], [2, b[5], -1]];
function split(poly, [axis, value, sign]) {
  const inside = [], outside = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = (a.p[axis] - value) * sign, db = (b.p[axis] - value) * sign;
    (da >= -1e-8 ? inside : outside).push(a);
    if ((da > 1e-8 && db < -1e-8) || (da < -1e-8 && db > 1e-8)) {
      const v = lerp(a, b, da / (da - db)); inside.push(v); outside.push(v);
    }
  }
  return [inside, outside];
}
function triangulate(poly) {
  const result = [];
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[0].p, b = poly[i].p, c = poly[i + 1].p;
    const u = b.map((v, k) => v - a[k]), v = c.map((n, k) => n - a[k]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(...cross) > 1e-9) result.push([poly[0], poly[i], poly[i + 1]]);
  }
  return result;
}
function subtractBox(triangle, box) {
  let remainder = triangle; const output = [];
  for (const plane of planes(box)) {
    if (remainder.length < 3) break;
    const [inside, outside] = split(remainder, plane);
    output.push(...triangulate(outside)); remainder = inside;
  }
  return output;
}
const inBox = (p, b, eps = .001) => p.every((x, i) => x >= b[i] - eps && x <= b[i + 3] + eps);
const insideTriangle = (tri, box) => tri.every(v => inBox(v.p, box));
function rotate(tri, pivot, angle, offset = [0, 0, 0]) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return tri.map(v => {
    const x = v.p[0] - pivot[0], z = v.p[2] - pivot[2];
    return { p: [pivot[0] + c * x + s * z + offset[0], v.p[1] + offset[1], pivot[2] - s * x + c * z + offset[2]], n: [c * v.n[0] + s * v.n[2], v.n[1], -s * v.n[0] + c * v.n[2]], uv: v.uv };
  });
}

// A restrained source-space contact AO. Based on the reference HTML's
// 24-direction hemisphere/AABB method. Unlike dynamic shadows, it is reusable
// by every instance. Doors are absent from these occluders, including side door.
const occluders = [
  [-.15, 0, -.15, 8.85, 2.7, 0],
  [-.15, 0, 0, 0, .13, 5.9], [-.15, 2.36, 0, .36, 2.7, 5.9],
  [-.15, .13, 0, .28, 2.36, .32], [-.15, .13, 5.73, 0, 2.36, 5.9],
  [0, 0, 5.75, 7.95, 2.7, 5.9], [8.85, 0, 0, 9, 2.5, 3.45],
  [7.95, 0, 4.65, 9.2, 2.5, 4.77], [10.2, 0, 4.65, 10.5, 2.5, 4.77],
  [8.85, 0, 3.33, 10.5, 2.5, 3.45], [10.35, 0, 3.45, 10.5, 2.5, 3.595], [10.35, 0, 4.505, 10.5, 2.5, 4.65],
  [2.35, .08, 3.12, 2.7, 2.7, 3.45], [4.2, .08, 3.12, 4.55, 2.7, 3.45], [2.7, 1.96, 3.12, 4.2, 2.7, 3.45],
  [5.75, 0, 2.85, 5.85, 2.5, 3.35], [5.75, 0, 2, 5.85, 2.5, 2.15],
  [5.75, 0, 3.35, 8.85, 2.5, 3.45], [7.6, 0, 2, 8.85, 2.5, 2.1], [7.6, 0, 2.9, 7.7, 2.5, 3.35],
  [2.44, .08, .16, 4.46, .57, 2.24], [2.3, 0, 5.39, 4.6, .9, 5.72], [2.4, .07, 4.8, 4.5, .45, 5.6],
  [5.75, 0, 4.65, 6.35, 2.5, 5.75], [6.35, 0, 5.3, 7.95, 2.5, 5.75],
  [5.85, .42, 2.95, 7.52, .89, 3.35], [.38, .08, .04, 1.05, .48, 2.35],
  [8.06, 0, 4.34, 8.94, .46, 4.65], [9, .81, 3.45, 9.9, .87, 3.69],
];
const hemisphere = Array.from({ length: 24 }, (_, k) => { const u = (k + .5) / 24, phi = k * 2.399963, s = Math.sqrt(u); return [Math.cos(phi) * s, Math.sin(phi) * s, Math.sqrt(1 - u)]; });
function ao(position, normal) {
  const maxD = .75, origin = position.map((x, i) => x + normal[i] * .012);
  const candidates = occluders.filter(b => origin.every((v, i) => v >= b[i] - maxD && v <= b[i + 3] + maxD) && !origin.every((v, i) => v > b[i] + .003 && v < b[i + 3] - .003));
  if (!candidates.length) return 1;
  let tangent = norm(Math.abs(normal[1]) < .9 ? [normal[2], 0, -normal[0]] : [1, 0, 0]);
  const bitangent = [normal[1] * tangent[2] - normal[2] * tangent[1], normal[2] * tangent[0] - normal[0] * tangent[2], normal[0] * tangent[1] - normal[1] * tangent[0]];
  let obscured = 0;
  for (const d of hemisphere) {
    const direction = normal.map((x, i) => tangent[i] * d[0] + bitangent[i] * d[1] + x * d[2]);
    let best = maxD;
    for (const box of candidates) {
      let near = -Infinity, far = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const inv = 1 / (Math.abs(direction[axis]) < 1e-10 ? 1e-10 : direction[axis]);
        const a = (box[axis] - origin[axis]) * inv, b = (box[axis + 3] - origin[axis]) * inv;
        near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      }
      if (far >= Math.max(near, 0) && near > 0 && near < best) best = near;
    }
    if (best < maxD) obscured += 1 - best / maxD;
  }
  return Math.max(.62, 1 - obscured / hemisphere.length * .72);
}

const entryCut = [10.30, -.01, 3.595, 10.51, 2.22, 4.505];
const sideCut = [9.20, -.01, 4.64, 10.20, 2.20, 4.80];
const windowCut = [-.20, .13, .32, .05, 2.36, 5.73];
const rawPrimitives = [], changes = { removedBackdrop: 0, entranceDoorLeafRemoved: 0, entranceDoorHandleRemoved: 0, mirroredTrianglesMoved: 0, wetDoorTrianglesOpened: 0, wcDoorTrianglesOpened: 0, westWindowOpening: windowCut, plasterShellPrimitives: 0 };
for (let nodeIndex = 0; nodeIndex < gltf.nodes.length; nodeIndex++) {
  const node = gltf.nodes[nodeIndex];
  if (node.mesh == null) continue;
  const mesh = gltf.meshes[node.mesh];
  if (node.name.includes('[OUT ')) {
    changes.removedBackdrop++;
    gltf.nodes[60].children = gltf.nodes[60].children.filter(i => i !== nodeIndex);
    mesh.primitives = []; delete node.mesh; continue;
  }
  const translation = node.translation || [0, 0, 0], scale = node.scale || [1, 1, 1];
  if (node.rotation || node.matrix) throw new Error(`Unexpected transform in supplied model: ${node.name}`);
  const next = [];
  for (let primitiveIndex = 0; primitiveIndex < mesh.primitives.length; primitiveIndex++) {
    const primitive = mesh.primitives[primitiveIndex];
    let materialName = gltf.materials[primitive.material].name;
    if (node.name.startsWith('Shell ') && materialName === 'black') {
      primitive.material = exteriorMaterialIndex; materialName = exteriorPlaster.name;
      changes.plasterShellPrimitives++;
    } else if (node.name.startsWith('Shell ') && materialName === 'poche') {
      primitive.material = sectionMaterialIndex; materialName = sectionCut.name;
    }
    if (nodeIndex === 45 && primitiveIndex > 0) {
      if (primitiveIndex === 1) changes.entranceDoorLeafRemoved++;
      else changes.entranceDoorHandleRemoved++;
      continue; // open entrance, preserving the original oak frame
    }
    const positions = readAccessor(primitive.attributes.POSITION), normals = readAccessor(primitive.attributes.NORMAL), uvs = readAccessor(primitive.attributes.TEXCOORD_0);
    const vertices = positions.map((p, i) => ({ p: p.map((x, k) => x * scale[k] + translation[k]), n: norm(normals[i].map((x, k) => x / scale[k])), uv: uvs[i] }));
    const indices = readAccessor(primitive.indices).flat();
    let triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      let tri = indices.slice(i, i + 3).map(j => vertices[j]);
      if (nodeIndex === 30 && primitiveIndex === 8 && insideTriangle(tri, [6.57, -.01, 2.04, 7.28, 2.49, 2.06])) {
        tri = rotate(tri, [7.275, 0, 2.05], -Math.PI / 2); changes.wetDoorTrianglesOpened++;
      }
      if (nodeIndex === 30 && primitiveIndex === 10) {
        tri = rotate(tri, [7.65, 0, 2.87], -Math.PI / 2); changes.wcDoorTrianglesOpened++;
      }
      if (nodeIndex === 30 && primitiveIndex === 9) {
        if (insideTriangle(tri, [6.63, .85, 1.98, 6.69, 1.4, 2.12])) tri = rotate(tri, [7.275, 0, 2.05], -Math.PI / 2);
        else if (insideTriangle(tri, [7.61, .85, 2.28, 7.64, 1.3, 2.32])) tri = rotate(tri, [7.65, 0, 2.87], -Math.PI / 2);
      }
      if (nodeIndex === 42 && insideTriangle(tri, [9.28, .23, 4.62, 9.92, 2.07, 4.65])) {
        tri = rotate(tri, [9.6, 0, 4.64], Math.PI, [-1.2, 0, -1.17]); changes.mirroredTrianglesMoved++;
      }
      let pieces = [tri];
      if (nodeIndex === 3 || nodeIndex === 40) pieces = pieces.flatMap(t => subtractBox(t, entryCut));
      if (nodeIndex === 4 || nodeIndex === 39) pieces = pieces.flatMap(t => subtractBox(t, sideCut));
      if (nodeIndex === 1) pieces = pieces.flatMap(t => subtractBox(t, windowCut));
      triangles.push(...pieces);
    }
    rawPrimitives.push({ triangles, nodeIndex, primitiveIndex, name: node.name, materialName, material: primitive.material });
    const rows = [], map = new Map(), indexRows = [];
    for (const tri of triangles) for (const v of tri) {
      const key = [...v.p, ...v.n, ...v.uv].map(n => Math.round(n * 1e7)).join(',');
      let at = map.get(key);
      if (at == null) { at = rows.length; map.set(key, at); rows.push(v); }
      indexRows.push([at]);
    }
    if (!rows.length) continue;
    const colors = rows.map(v => { const value = /glass|smart|fluted|strip|lampDisc|globe|mirror|night/i.test(materialName) ? 1 : ao(v.p, v.n); return [value, value, value]; });
    next.push({ ...primitive, attributes: {
      POSITION: addAccessor(rows.map(v => v.p), 'VEC3', 5126, true), NORMAL: addAccessor(rows.map(v => v.n), 'VEC3'),
      TEXCOORD_0: addAccessor(rows.map(v => v.uv), 'VEC2'), COLOR_0: addAccessor(colors, 'VEC3'),
    }, indices: addAccessor(indexRows, 'SCALAR', rows.length <= 65535 ? 5123 : 5125), extras: { sourceNode: nodeIndex, sourcePrimitive: primitiveIndex, sourceName: node.name, sharedSuite: true } });
  }
  mesh.primitives = next;
  delete node.translation; delete node.scale;
  node.extras = { ...node.extras, sourceNode: nodeIndex, sharedSuite: true };
}
// Cameras remain available in the original. The processed model has one scene
// with the furniture only; this prevents importing unrelated preview cameras.
gltf.nodes[60].children = gltf.nodes[60].children.filter(i => i !== 59);
// An unreferenced empty glTF mesh is still invalid; prune the backdrop mesh and
// remap surviving nodes. Source node / primitive IDs remain explicit in extras.
const meshRemap = new Map(), meshes = [];
gltf.meshes.forEach((mesh, index) => { if (mesh.primitives.length) { meshRemap.set(index, meshes.length); meshes.push(mesh); } });
for (const node of gltf.nodes) if (node.mesh != null) node.mesh = meshRemap.get(node.mesh);
gltf.meshes = meshes;

// The standalone processed GLB carries real lights as well as emissive lamps.
// The campus loader exports geometry only; its fixed light pool avoids 400
// duplicated room light rigs. glTF spot direction is local -Z.
const lightSpecs = [
  { name: 'Suite bed downlight', type: 'spot', position: [3.45, 2.64, 1.3], intensity: 12, range: 4.5, color: '#ffe2bf', target: [3.45, 0, 1.3] },
  { name: 'Suite living downlight', type: 'spot', position: [3.45, 2.62, 4.35], intensity: 13, range: 4.5, color: '#ffe2bf', target: [3.45, 0, 4.35] },
  { name: 'Suite entry downlight', type: 'spot', position: [8.3, 2.42, 4.05], intensity: 9, range: 4.5, color: '#ffe2bf', target: [8.3, 0, 4.05] },
  { name: 'Suite bath downlight', type: 'spot', position: [7.3, 2.44, 1.08], intensity: 13, range: 4.2, color: '#ffe2bf', target: [7.3, 0, 1.08] },
  { name: 'Suite vanity wash', type: 'spot', position: [6.75, 2.33, 2.65], intensity: 4, range: 3, color: '#ffe2bf', target: [6.7, 1, 3.05] },
  { name: 'Suite daybed downlight', type: 'spot', position: [.7, 2.63, 1.6], intensity: 6, range: 4.5, color: '#ffe2bf', target: [.7, 0, 1.6] },
  { name: 'Suite headboard bounce', type: 'point', position: [3.45, 2.38, .6], intensity: .7, range: 3.1, color: '#ffcf95' },
  { name: 'Suite floor lamp bounce', type: 'point', position: [5.2, 1.3, 5.2], intensity: 2, range: 2.5, color: '#ffcf95' },
];
const windowMaterial = gltf.materials.find(material => material.name === 'winGlass');
windowMaterial.pbrMetallicRoughness.baseColorFactor = [...linearColor('#b9d4d5'), .16];
windowMaterial.pbrMetallicRoughness.metallicFactor = .02;
windowMaterial.pbrMetallicRoughness.roughnessFactor = .12;
windowMaterial.alphaMode = 'BLEND'; windowMaterial.doubleSided = true;
changes.windowGlassMadeTransparent = true;
gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed || []), 'KHR_lights_punctual'])];
gltf.extensions = { ...gltf.extensions, KHR_lights_punctual: { lights: lightSpecs.map(light => ({ name: light.name, type: light.type, color: linearColor(light.color), intensity: light.intensity, range: light.range, ...(light.type === 'spot' ? { spot: { innerConeAngle: .357, outerConeAngle: 1.02 } } : {}) })) } };
for (const [index, light] of lightSpecs.entries()) {
  const node = { name: light.name, translation: light.position, extensions: { KHR_lights_punctual: { light: index } } };
  if (light.target) {
    const direction = norm(light.target.map((v, k) => v - light.position[k]));
    node.rotation = norm([direction[1], -direction[0], 0, 1 - direction[2]]);
  }
  gltf.nodes[60].children.push(gltf.nodes.length); gltf.nodes.push(node);
}
gltf.accessors = newAccessors; gltf.bufferViews = newViews;
gltf.buffers = [{ byteLength }];
gltf.asset.generator = 'Yunlan suite preparation (source geometry, physical door openings, shared contact AO)';
gltf.extras = { ...gltf.extras, sourceSHA256: sha(original), coordinateSystem: 'metres; +Y up; source suite coordinates', preparation: 'Entry and side doors cut; bathroom doors opened; mirror relocated; contact AO vertex colors' };

// True segment / triangle intersection checks at human eye height. These tests
// read the processed triangles rather than the separate navigation rectangles.
const sub = (a, b) => a.map((x, i) => x - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function intersect(a, b, tri) {
  const direction = sub(b, a), e1 = sub(tri[1].p, tri[0].p), e2 = sub(tri[2].p, tri[0].p);
  const h = cross(direction, e2), determinant = dot(e1, h);
  if (Math.abs(determinant) < 1e-9) return false;
  const inv = 1 / determinant, s = sub(a, tri[0].p), u = inv * dot(s, h);
  if (u < -1e-7 || u > 1 + 1e-7) return false;
  const q = cross(s, e1), v = inv * dot(direction, q);
  if (v < -1e-7 || u + v > 1 + 1e-7) return false;
  const t = inv * dot(e2, q);
  return t >= -1e-7 && t <= 1 + 1e-7;
}
const rays = [
  { name: 'entrance', from: [10.8, 1.4, 4.05], to: [9.95, 1.4, 4.05], expectedOpen: true },
  { name: 'side-door', from: [9.7, 1.4, 5.05], to: [9.7, 1.4, 4.25], expectedOpen: true },
  { name: 'bathroom', from: [5.55, 1.4, 2.5], to: [6.05, 1.4, 2.5], expectedOpen: true },
  { name: 'wet-room', from: [6.925, 1.4, 2.35], to: [6.925, 1.4, 1.8], expectedOpen: true },
  { name: 'wc', from: [7.4, 1.4, 2.55], to: [8, 1.4, 2.55], expectedOpen: true },
  { name: 'entrance-adjacent-wall', from: [10.8, 1.4, 3.5], to: [10.1, 1.4, 3.5], expectedOpen: false },
  { name: 'side-adjacent-wall', from: [9, 1.4, 5.05], to: [9, 1.4, 4.25], expectedOpen: false },
];
for (const ray of rays) {
  ray.hits = rawPrimitives.filter(p => p.triangles.some(t => intersect(ray.from, ray.to, t))).map(p => `${p.name}:${p.primitiveIndex}`);
  ray.passed = (ray.hits.length === 0) === ray.expectedOpen;
  if (!ray.passed) throw new Error(`Processed geometry ray ${ray.name} failed: ${ray.hits.join(', ')}`);
}
const windowChecks = [];
for (const y of [1.2, 1.6]) for (const z of [1, 2.4, 3.7, 4.85]) {
  const from = [-.4, y, z], to = [.4, y, z];
  const hits = rawPrimitives.filter(p => gltf.materials[p.material].alphaMode !== 'BLEND' && p.triangles.some(t => intersect(from, to, t))).map(p => p.name);
  if (hits.length) throw new Error(`Window view is blocked by opaque geometry: ${hits.join(', ')}`);
  windowChecks.push({ from, to, opaqueHits: hits, passed: true });
}
const sourceImageHashes = gltf.images.map(image => {
  const view = newViews[image.bufferView];
  return { name: image.name, mimeType: image.mimeType, bytes: view.byteLength, sha256: encodedImageHashes.get(image.name) };
});
const jsonBuffer = Buffer.from(JSON.stringify(gltf));
const jsonPad = Buffer.alloc((4 - jsonBuffer.length % 4) % 4, 0x20);
const binBuffer = Buffer.concat(chunks), binPad = Buffer.alloc((4 - binBuffer.length % 4) % 4);
const header = Buffer.alloc(12), jHeader = Buffer.alloc(8), bHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuffer.length + jsonPad.length + 8 + binBuffer.length + binPad.length, 8);
jHeader.writeUInt32LE(jsonBuffer.length + jsonPad.length, 0); jHeader.writeUInt32LE(0x4e4f534a, 4);
bHeader.writeUInt32LE(binBuffer.length + binPad.length, 0); bHeader.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, jHeader, jsonBuffer, jsonPad, bHeader, binBuffer, binPad]);
await fs.writeFile(processedPath, result);
const manifest = {
  title: 'User-provided hotel suite — integrated asset', prepared: '2026-10-07',
  original: { file: path.basename(originalPath), suppliedName: '酒店套房_改造后.glb', bytes: original.length, sha256: sha(original), provenance: 'Provided by the project owner in this task; not a CC0 asset' },
  processed: { file: path.basename(processedPath), bytes: result.length, sha256: sha(result), primitives: rawPrimitives.length, triangles: rawPrimitives.reduce((n, p) => n + p.triangles.length, 0), sourceCoordinateBounds: [[-.15, -.2, -.15], [10.5, 2.72, 5.9]], vertexAO: { directions: 24, maxDistance: .75, minimum: .62 } },
  roomTransform: { rotationY: Math.PI / 2, localX: 'sourceZ + 1.45', localZ: '10.35 - sourceX', scale: 1 },
  changes, geometryChecks: rays, windowChecks, images: sourceImageHashes, lights: lightSpecs,
  runtime: 'Shared geometries/materials/textures; source remains unmodified. Real lights are created by suite-lighting runtime.',
};
await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output: processedPath, ...manifest.processed, changes, rayChecks: rays.map(r => ({ name: r.name, passed: r.passed })) }, null, 2));
function sha(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
