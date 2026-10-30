import * as THREE from 'three';
import { BatchSet, tpl } from '../batch.js';

const PALETTES = [
  { key: 'facadeConcrete', wall: '#d4dcd8', trim: '#b9c4c5', frame: '#384c55', glass: '#6e909f', office: true },
  { key: 'facadeTravertine', wall: '#f1ebe1', trim: '#d2c8b5', frame: '#665e51', glass: '#84969d', office: false },
  { key: 'facadeBrick', wall: '#e1c8b6', trim: '#c9bda9', frame: '#4c5a58', glass: '#78959b', office: false },
  { key: 'facadeStone', wall: '#dfd3b9', trim: '#c3b797', frame: '#5b574c', glass: '#8a9f9b', office: true },
  { key: 'facadeBoardConcrete', wall: '#ced4c6', trim: '#b7bfaf', frame: '#526353', glass: '#72918b', office: false },
  { key: 'facadePlaster', wall: '#b7c3c8', trim: '#b1bdc3', frame: '#3c4c59', glass: '#6d8a9d', office: false },
];
const Y = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
const matrix = new THREE.Matrix4();
function profile(vertical) {
  const box = tpl('box'), pos = [], nor = [];
  for (let i = 0; i < box.count; i++) {
    const n = box.nor.subarray(i * 3, i * 3 + 3);
    // Only front and reveal faces can be seen: backs sit in the backing wall,
    // and rail ends meet masonry. Keep real depth without duplicate hidden faces.
    if (n[2] > 0.5 || Math.abs(n[vertical ? 0 : 1]) > 0.5) {
      pos.push(...box.pos.subarray(i * 3, i * 3 + 3)); nor.push(...n);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), count: pos.length / 3 };
}
const VERTICAL = profile(true), HORIZONTAL = profile(false);

/** Architecture dimensions are independent of rendering/quality. */
export function contextFacadeSpec(b) {
  const palette = PALETTES[b.tint % PALETTES.length];
  const lobby = 4.2, count = Math.max(1, Math.floor((b.h - lobby) / 3.4)), rise = (b.h - lobby) / count;
  const rows = [{ bottom: 0.3, top: lobby, sill: 0.55, head: lobby - 0.35 }];
  for (let i = 0; i < count; i++) rows.push({ bottom: lobby + i * rise, top: lobby + (i + 1) * rise, sill: lobby + i * rise + 0.85, head: lobby + (i + 1) * rise - 0.35 });
  return { palette, rows, sides: [
    { x: b.x, z: b.z + b.d / 2, nx: 0, nz: 1, width: b.w },
    { x: b.x + b.w / 2, z: b.z, nx: 1, nz: 0, width: b.d },
    { x: b.x, z: b.z - b.d / 2, nx: 0, nz: -1, width: b.w },
    { x: b.x - b.w / 2, z: b.z, nx: -1, nz: 0, width: b.d },
  ].map(s => ({ ...s, bays: Math.max(3, Math.round(s.width / (palette.office ? 4.6 : 4.1))) })) };
}

/** Replace wallpaper boxes with recessed windows and dimensional facade members.
 * Windows are six-vertex panes; piers and frame rails span floors to avoid a
 * separate full mesh/material for every window. Spatial batches retain culling.
 */
export function buildContextBuildings(ctx, buildings) {
  const districts = new Map();
  const stats = { buildings: 0, windows: 0, occupiedWindows: 0, batches: 0, vertices: 0, bufferBytes: 0, exteriorOnly: true };
  for (const b of buildings) {
    const tile = `${Math.floor((b.x + 900) / 450)}:${Math.floor((b.z + 850) / 425)}`;
    if (!districts.has(tile)) districts.set(tile, new BatchSet(ctx.mats.base));
    const B = districts.get(tile), { palette: p, rows, sides } = contextFacadeSpec(b);
    // Recessed dark backing is behind every pane, never a stretched window map.
    B.get('ext').box(b.x, b.h / 2 - 0.12, b.z, b.w - 0.7, b.h - 0.24, b.d - 0.7, '#405158');
    B.get('facadeConcrete').box(b.x, b.h - 0.12, b.z, b.w - 0.12, 0.24, b.d - 0.12, '#c3c8c4');
    for (const [sideIndex, side] of sides.entries()) {
      const { nx, nz, width, bays } = side, pitch = width / bays, pier = p.office ? 0.68 : 1.0;
      const angle = Math.atan2(nx, nz);
      const box = (key, u, y, outward, w, h, d, color) => {
        position.set(side.x + nz * u + nx * outward, y, side.z - nx * u + nz * outward);
        rotation.setFromAxisAngle(Y, angle); scale.set(w, h, d);
        matrix.compose(position, rotation, scale);
        B.get(key).push(h > w ? VERTICAL : HORIZONTAL, matrix, color);
      };
      for (let col = 0; col <= bays; col++) {
        const u = -width / 2 + col * pitch, edge = col === 0 || col === bays;
        box(p.key, u + (col === 0 ? pier / 4 : col === bays ? -pier / 4 : 0), b.h / 2, -0.15, edge ? pier / 2 : pier, b.h, 0.3, p.wall);
        // Narrow jambs are inset into each real opening. Full-height runs are
        // hidden by the spandrels, so they cost two boxes per bay, not per room.
        if (col < bays) for (const d of [pier / 2 + 0.045, pitch - pier / 2 - 0.045]) box('facadeFrame', u + d, b.h / 2, -0.08, 0.09, b.h, 0.12, p.frame);
        if (col < bays && p.office) box('facadeFrame', u + pitch / 2, b.h / 2, -0.09, 0.065, b.h, 0.1, p.frame);
      }
      for (const [floor, row] of rows.entries()) {
        box(p.key, 0, (row.bottom + row.sill) / 2, -0.15, width, row.sill - row.bottom, 0.3, p.wall);
        box(p.key, 0, (row.head + row.top) / 2, -0.15, width, row.top - row.head, 0.3, p.wall);
        for (const y of [row.sill + 0.045, row.head - 0.045]) box('facadeFrame', 0, y, -0.08, width, 0.09, 0.12, p.frame);
        box('facadeStone', 0, row.sill - 0.055, -0.01, width, 0.11, 0.38, p.trim);
        for (let col = 0; col < bays; col++) {
          const u = -width / 2 + (col + 0.5) * pitch;
          const occupied = ((floor * 11 + col * 7 + sideIndex * 3 + b.tint) % 9) < 3;
          position.set(side.x + nz * u - nx * 0.145, (row.sill + row.head) / 2, side.z - nx * u - nz * 0.145);
          rotation.setFromAxisAngle(Y, angle);
          scale.set(pitch - pier - 0.09, row.head - row.sill - 0.09, 1);
          B.get(occupied ? 'facadeWindowLit' : 'facadeWindow').shape('plane', position, rotation, scale, p.glass);
          stats.windows++;
          if (occupied) stats.occupiedWindows++;
        }
      }
      // Roof coping and low plinth stay within the original footprint.
      box('facadeStone', 0, b.h - 0.08, -0.11, width, 0.16, 0.22, p.trim);
      box('facadeStone', 0, 0.16, -0.13, width, 0.32, 0.26, p.trim);
    }
    stats.buildings++;
  }
  for (const [tile, batches] of districts) {
    const group = new THREE.Group();
    group.name = `city-facades-${tile}`;
    batches.flush(group, { shadow: false });
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      stats.batches++;
      stats.vertices += mesh.geometry.attributes.position.count;
      stats.bufferBytes += Object.values(mesh.geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0);
      mesh.userData.exteriorScenery = true;
    });
    ctx.site.group.add(group);
  }
  ctx.contextFacadeStats = stats;
  return stats;
}
