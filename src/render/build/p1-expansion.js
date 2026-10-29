// 一期艺术街区：按真实外轮廓、入口与退台楼板生成表皮和公共空间。
// 外壳只写 shell/facade；室内只写本层 batch，允许楼层流式释放后重建。
import * as THREE from 'three';
import { frame, toW, toL, pointInPoly, distToPolyEdge, polyBounds, subtractInterval } from '../../layout/geom.js';
import { outlineEdges, edgeSpans, clearHeight } from './shell.js';
import { addCutSurfaceSlab } from './surface-shapes.js';
import { bench, roundTable } from './props.js';
import { BatchSet } from '../batch.js';
import { buildMallFlightGeometry } from './mall-stairs.js';

const PALETTES = {
  main: { stone: '#e9e2d4', trim: '#8f7553', dark: '#4f4a42', fin: '#a98a62', glow: '#ffe2b2', material: 'facadeTravertine' },
  culture: { stone: '#b97554', trim: '#80513e', dark: '#655449', fin: '#d69a73', glow: '#ffdfab', material: 'facadeTerracotta' },
  dining: { stone: '#e1cdb3', trim: '#8d6950', dark: '#63594b', fin: '#c7a67b', glow: '#ffdda3', material: 'facadeTravertine' },
  garden: { stone: '#a3b2a0', trim: '#596d60', dark: '#425c50', fin: '#7c9b88', glow: '#e5f0ce', material: 'facadeBoardConcrete' },
  creative: { stone: '#c6b6a0', trim: '#615c50', dark: '#4b514b', fin: '#92775c', glow: '#ffe4b8', material: 'facadeSlat' },
};
const zoneOf = lv => lv.expansion?.zone || 'main';
const paletteOf = lv => {
  const base = PALETTES[zoneOf(lv)] || PALETTES.main;
  const variant = {
    P1W1: { stone: '#bd9077', trim: '#795d50', fin: '#9e6950', material: 'facadeBrick' },
    P1W2: { stone: '#ded6c6', trim: '#8e8068', fin: '#b3a187', material: 'facadeTravertine' },
    P1W3: { stone: '#c5aa84', trim: '#6d5b44', fin: '#ad8c61', material: 'facadeSlat' },
    P1W4: { stone: '#b5c6c4', trim: '#647e7d', fin: '#829e9a', material: 'facadePlaster' },
  }[lv.building];
  return variant ? { ...base, ...variant } : base;
};
const isExpanded = lv => !!lv.expansion && lv.elev >= 0;
export const usesExpansionFacade = lv => isExpanded(lv) && lv.kind !== 'roof' &&
  (zoneOf(lv) !== 'main' || (lv.expansion.storey || parseInt(lv.short, 10)) >= 3);
const facadePolys = lv => lv.expansion?.facadePolys || [lv.expansion?.facadePoly || lv.outline];
const terracePieces = lv => {
  if (lv.expansion?.terrace?.pieces) return lv.expansion.terrace.pieces;
  const raw = lv.expansion?.terraces || [];
  const pieces = raw.flatMap(t => Array.isArray(t) ? [{ outer: t, holes: [] }] : t.outer ? [t] : (t.floorPolys || (t.poly ? [t.poly] : [])).map(outer => ({ outer, holes: [] })));
  return pieces.length ? pieces : lv.kind === 'roof' ? lv.slab.pieces : [];
};
const terracePolys = lv => terracePieces(lv).map(p => p.outer);
const onSlab = (lv, p) => lv.slab.pieces.some(s => pointInPoly(p, s.outer) && !(s.holes || []).some(h => pointInPoly(p, h))) &&
  !(lv.voids || []).some(v => pointInPoly(p, v.poly));
const supportedDisc = (lv, x, z, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, -r * .7]]
  .every(([dx, dz]) => onSlab(lv, [x + dx, z + dz]));
const segmentDistance = (p, s) => {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const t = Math.max(0, Math.min(1, ((p[0] - s.x0) * dx + (p[1] - s.z0) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p[0] - s.x0 - dx * t, p[1] - s.z0 - dz * t);
};

/** Portal intervals are cut from every low facade piece, including trims and fins. */
export function expansionFacadeEdges(lv, entrances = []) {
  return facadePolys(lv).flatMap(poly => outlineEdges(poly).map(e => ({ ...e,
    gaps: entrances.filter(en => en.level === lv.id).flatMap(en => {
      const a = toL(e.F, en.seg.x0, en.seg.z0), b = toL(e.F, en.seg.x1, en.seg.z1);
      return Math.abs(a[1]) <= .18 && Math.abs(b[1]) <= .18 ? [[Math.min(a[0], b[0]) - .04, Math.max(a[0], b[0]) + .04]] : [];
    }),
  })));
}

function facade(ctx, lv) {
  const B = ctx.levels[lv.id].facadeBatch, p = paletteOf(lv), zone = zoneOf(lv);
  const y = lv.elev, h = lv.height, head = y + Math.min(3.4, h - .65);
  for (const e of expansionFacadeEdges(lv, ctx.layout.entrances)) B.frame(e.F, () => {
    const raw = (a, b, y0, y1, depth, off, key, color) => {
      if (b - a > .005 && y1 - y0 > .005) B.get(key).box((a + b) / 2, (y0 + y1) / 2, off, b - a, y1 - y0, depth, color);
    };
    const put = (a, b, y0, y1, depth, off, key, color) => {
      if (y0 >= head || !e.gaps.length) return raw(a, b, y0, y1, depth, off, key, color);
      for (const [lo, hi] of e.gaps.reduce((s, gap) => subtractInterval(s, gap), [[a, b]])) raw(lo, hi, y0, Math.min(head, y1), depth, off, key, color);
      if (y1 > head) raw(a, b, head, y1, depth, off, key, color);
    };
    const n = Math.max(1, Math.ceil(e.len / (zone === 'culture' ? 2.8 : 3.8))), bay = e.len / n;
    // Recessed real glazing, continuous slab fascia and a narrow warm light cove.
    put(0, e.len, y + .24, y + h - .62, .055, -.035, 'glassTint', '#ffffff');
    put(0, e.len, y, y + .25, .32, .06, p.material, p.stone);
    put(0, e.len, y + h - .59, y + h - .06, .46, .14, p.material, p.stone);
    put(0, e.len, y + h - .66, y + h - .59, .58, .17, 'extMetal', p.trim);
    put(0, e.len, y + h - .68, y + h - .65, .09, .43, 'glow', p.glow);
    for (let i = 0; i < n; i++) {
      const a = i * bay, b = a + bay;
      put(a + .04, a + .13, y + .22, y + h - .58, .23, .11, 'extMetal', p.dark);
      if (bay > 2.2) put(a + bay / 2 - .025, a + bay / 2 + .025, y + .25, y + h - .65, .1, .04, 'extMetal', p.dark);
      if (zone === 'culture') {
        put(a + .18, a + .40, y + .12, y + h - .08, .72, .39, 'facadeTerracotta', i % 3 ? p.fin : p.stone);
        put(a + .22, a + .35, y + .12, y + h - .08, .075, .795, 'extMetal', p.trim);
      } else if (zone === 'garden') {
        put(a + .15, a + .32, y + .25, y + h - .15, .65, .32, 'facadeBoardConcrete', p.fin);
        if (lv.short !== '1F') put(a + .15, b - .1, y + h * .57, y + h * .57 + .09, .36, .2, 'extMetal', p.trim);
      } else if (zone === 'creative') {
        put(a + .12, a + .44, y + .2, y + h - .1, .32, .22, p.material, p.fin);
        put(a + .10, b - .08, y + h - .35, y + h - .25, .72, .27, p.material, p.fin);
      } else if (zone === 'main' && Math.floor(i / 3) % 4 === 1) {
        // Bronze and timber louvre screens, one bay group in four, as in the concept aerial.
        // They stay within 0.4 m of the glass so the LED screen and posters hang in front.
        for (let x = a + .3; x < b - .1; x += .6) put(x - .06, x + .06, y + .1, y + h - .08, .3, .22, ...((lv.expansion.storey || 0) % 2 ? ['facadeBronze', '#b08a5c'] : ['facadeTimber', '#93683f']));
        put(a, b, y + h - .32, y + h - .1, .32, .22, 'extMetal', p.trim);
      } else {
        put(a + .10, a + (i % 3 ? .25 : .48), y + .25, y + h - .12, .42, .25, p.material, p.stone);
        if (zone === 'dining' && bay > 2.5) {
          const arc = i => { const t = i * Math.PI / 8; return { x: (a + b) / 2 + Math.cos(t) * (bay - .7) / 2, y: y + h - 1.5 + Math.sin(t) * .8, z: .24 }; };
          for (let k = 0; k < 8; k++) B.get('extMetal').bar(arc(k), arc(k + 1), .075, p.trim);
        }
      }
    }
  });
}

function canopies(ctx, lv) {
  if (zoneOf(lv) === 'main' || lv.short !== '1F') return;
  const B = ctx.levels[lv.id].facadeBatch, p = paletteOf(lv);
  for (const en of ctx.layout.entrances.filter(e => e.level === lv.id && e.to === 'site' && !e.coveredConnection)) {
    const mx = (en.seg.x0 + en.seg.x1) / 2, mz = (en.seg.z0 + en.seg.z1) / 2;
    const width = en.width || Math.hypot(en.seg.x1 - en.seg.x0, en.seg.z1 - en.seg.z0);
    const F = frame(mx, mz, Math.atan2(en.seg.z1 - en.seg.z0, en.seg.x1 - en.seg.x0) * 180 / Math.PI);
    const outward = toL(F, mx + en.nx, mz + en.nz)[1] >= 0 ? 1 : -1;
    B.frame(F, () => {
      B.get('extMetal').box(0, lv.elev + 4.05, outward * 1.55, width + 2, .18, 3.45, p.trim);
      B.get('glass').box(0, lv.elev + 4.18, outward * 1.55, width + 1.75, .06, 3.15, '#ffffff');
      B.get('glow').box(0, lv.elev + 3.94, outward * 2.95, width + 1.4, .035, .10, p.glow);
      for (const u of [-width / 2 - .75, width / 2 + .75]) B.get('extMetal').bar({ x: u, y: lv.elev + 4, z: outward * 2.9 }, { x: u, y: lv.elev + 5.05, z: 0 }, .07, p.trim);
    });
  }
}

/** Railing edges exist only at a physical drop, never along an interior terrace join. */
export function expansionTerraceEdges(lv, entrances = []) {
  const found = [], seen = new Set();
  for (const poly of terracePolys(lv)) for (const e of outlineEdges(poly)) {
    const inside = toW(e.F, e.len / 2, -.18), outside = toW(e.F, e.len / 2, .18);
    if (!onSlab(lv, inside) || onSlab(lv, outside)) continue;
    const key = [e.mid[0].toFixed(2), e.mid[1].toFixed(2), e.len.toFixed(2)].join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const spans = edgeSpans(e, entrances.filter(en => en.level === lv.id), 0);
    found.push({ ...e, spans });
  }
  return found;
}

/** Only wide, supported terrace pockets receive furniture; door approaches stay clear. */
export function expansionTerraceSites(lv, entrances = []) {
  const out = [], polygons = terracePolys(lv);
  const doors = entrances.filter(e => e.level === lv.id);
  for (const poly of polygons) {
    const r = polyBounds(poly);
    for (let x = r.x0 + 2; x < r.x1 - 1.8; x += 6.5) for (let z = r.z0 + 2; z < r.z1 - 1.8; z += 6.5) {
      if (out.length >= (lv.kind === 'roof' ? 12 : 8)) break;
      const p = [x, z];
      if (!pointInPoly(p, poly) || distToPolyEdge(p, poly) < 1.7 || !supportedDisc(lv, x, z, 1.65)) continue;
      if (doors.some(d => segmentDistance(p, d.seg) < 4.2)) continue;
      if ((lv.rooms || []).some(room => (room.polys || []).some(q => pointInPoly(p, q) || distToPolyEdge(p, q) < 2))) continue;
      if (lv.kind !== 'roof' && facadePolys(lv).some(q => pointInPoly(p, q) && distToPolyEdge(p, q) > .05)) continue;
      if ((lv.features || []).some(f => f.poly && (pointInPoly(p, f.poly) || distToPolyEdge(p, f.poly) < 2.8))) continue;
      // Leave cross-axes through the terrace/roof usable rather than filling every grid point.
      if (Math.abs(x - (r.x0 + r.x1) / 2) < 2.2 || Math.abs(z - (r.z0 + r.z1) / 2) < 2.2) continue;
      if (out.some(q => Math.hypot(x - q.x, z - q.z) < 5.5)) continue;
      out.push({ x, z, kind: out.length % 3 ? 'planter' : 'table' });
    }
  }
  return out;
}

function gardenPlanter(B, x, y, z, p, tree = false) {
  B.get('facadeStone').cyl(x, y, z, .95, .58, p.stone, 12);
  B.get('ext').cyl(x, y + .57, z, .82, .035, '#584b36', 12);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    B.get('foliage').sphere(x + Math.cos(a) * .5, y + .80, z + Math.sin(a) * .5, .42, i % 2 ? '#6b8750' : '#869a5b', .34, .42, 'ico0');
  }
  if (tree) {
    B.get('facadeTimber').cyl(x, y + .58, z, .095, 1.9, '#7c6c50', 6);
    B.get('foliage').sphere(x, y + 2.55, z, 1.14, '#7b965f', .92, 1.14, 'ico0');
    B.get('foliage').sphere(x + .42, y + 3.2, z - .15, .72, '#96aa72', .64, .72, 'ico0');
  }
}

function terraces(ctx, lv) {
  const B = ctx.levels[lv.id].shellBatch, p = paletteOf(lv), y = lv.elev;
  for (const piece of terracePieces(lv)) {
    // Finish only the exposed terrace, never refill a skylight or lift shaft.
    const holes = (piece.holes || []).concat((lv.voids || []).map(v => v.poly), lv.slab.pieces.flatMap(s => s.holes || []), lv.kind === 'roof' ? [] : facadePolys(lv));
    addCutSurfaceSlab(B, 'facadeStone', piece.outer, holes, y + .012, .018, '#d6d0bf');
  }
  for (const e of expansionTerraceEdges(lv, ctx.layout.entrances)) B.frame(e.F, () => {
    for (const [a, b] of e.spans) {
      if (b - a < .1) continue;
      B.get('glass').box((a + b) / 2, y + .67, -.12, b - a, 1.04, .035, '#ffffff');
      B.get('extMetal').box((a + b) / 2, y + 1.23, -.12, b - a, .055, .075, p.trim);
      B.get('facadeStone').box((a + b) / 2, y + .11, -.16, b - a, .2, .25, p.stone);
      const n = Math.max(1, Math.ceil((b - a) / 2.7));
      for (let i = 0; i <= n; i++) B.get('extMetal').box(a + (b - a) * i / n, y + .65, -.12, .045, 1.18, .055, p.trim);
    }
  });
  for (const [i, s] of expansionTerraceSites(lv, ctx.layout.entrances).entries()) {
    if (s.kind === 'table') roundTable(B, s.x, y, s.z, 3, { top: '#e8dfce', chair: p.fin }, 'extSatin');
    else gardenPlanter(B, s.x, y, s.z, p, i % 3 === 1);
  }
}

function atriumRails(ctx, lv) {
  if (zoneOf(lv) === 'main') return; // Main atrium is already handled by buildShell.
  const B = ctx.levels[lv.id].shellBatch, p = paletteOf(lv);
  for (const v of lv.voids.filter(v => v.kind === 'atrium')) for (const e of outlineEdges(v.poly)) B.frame(e.F, () => {
    B.get('glass').box(e.len / 2, lv.elev + .61, .1, e.len, 1.05, .035, '#ffffff');
    B.get('extMetal').box(e.len / 2, lv.elev + 1.16, .1, e.len, .055, .07, p.trim);
    B.get(p.material).box(e.len / 2, lv.elev + .07, .1, e.len, .14, .22, p.stone);
  });
}

function creativeRoof(ctx, lv) {
  // The concept-fidelity tour draws full pitched roofs instead (p1-fidelity.js).
  if (zoneOf(lv) !== 'creative' || lv.kind !== 'roof' || lv.features.some(f => f.type === 'creative-roof')) return;
  const B = ctx.levels[lv.id].shellBatch, p = paletteOf(lv), r = polyBounds(lv.outline);
  const width = Math.min(8, r.x1 - r.x0 - 6), depth = Math.min(3.3, r.z1 - r.z0 - 6), y = lv.elev;
  if (width < 3 || depth < 2) return;
  let center;
  for (let z = r.z1 - depth / 2 - .8; z > r.z0 + depth / 2 + .6 && !center; z -= 2) for (let x = r.x1 - width / 2 - .9; x > r.x0 + width / 2 + .6; x -= 2) {
    const samples = [[x, z], [x - width / 2, z - depth / 2], [x + width / 2, z - depth / 2], [x + width / 2, z + depth / 2], [x - width / 2, z + depth / 2]];
    if (!samples.every(q => onSlab(lv, q)) || lv.rooms.some(room => (room.polys || []).some(q => samples.some(v => pointInPoly(v, q) || distToPolyEdge(v, q) < .4)))) continue;
    center = [x, z]; break;
  }
  if (!center) return;
  const [x, z] = center, saw = ['P1W2', 'P1W4'].includes(lv.building) || /saw|fold/.test(lv.expansion.style || ''), rise = saw ? 1.15 : 1.5;
  for (const dx of [-width / 2, width / 2]) for (const dz of [-depth / 2, depth / 2]) B.get('extMetal').box(x + dx, y + 1.6, z + dz, .12, 3.2, .12, p.trim);
  if (saw) {
    for (let i = 0; i < 3; i++) {
      const a = x - width / 2 + width * i / 3, b = a + width / 3;
      const angle = Math.atan2(rise, b - a);
      B.get('facadeTimber').shape('box', new THREE.Vector3((a + b) / 2, y + 3.2 + rise / 2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle), new THREE.Vector3(Math.hypot(b - a, rise), .12, depth + .4), p.fin);
      B.get('glass').box(b, y + 3.2 + rise / 2, z, .05, rise, depth, '#ffffff');
    }
  } else {
    for (const s of [-1, 1]) {
      const angle = -s * Math.atan2(rise, depth / 2);
      B.get('facadeTimber').shape('box', new THREE.Vector3(x, y + 3.2 + rise / 2, z + s * depth / 4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle), new THREE.Vector3(width + .4, .12, Math.hypot(depth / 2, rise)), p.fin);
    }
    B.get('extMetal').box(x, y + 3.2 + rise, z, width + .5, .12, .14, p.dark);
  }
  B.get('glow').box(x, y + 3.05, z, width - .4, .025, .08, p.glow);
}

function artLantern(ctx, lv) {
  if (zoneOf(lv) !== 'main' || lv.kind !== 'roof') return;
  const v = lv.voids.find(q => q.kind === 'skylight' && q.radius && q.rect && q.frame);
  if (!v) return;
  const B = ctx.levels[lv.id].shellBatch, p = PALETTES.main, r = v.rect;
  const x0 = r.x0, x1 = r.x1, cz = (r.z0 + r.z1) / 2, half = (r.z1 - r.z0) / 2;
  const y = lv.elev + .28, rise = Math.min(5.4, half * .55), segments = 16;
  const profile = Array.from({ length: segments + 1 }, (_, i) => { const a = i * Math.PI / segments; return [cz - Math.cos(a) * half, y + Math.sin(a) * rise]; });
  // Under the 06 dome the atrium stays open to it; only the art rings remain.
  const dome = lv.features.find(f => f.type === 'art-dome'), domed = !!dome;
  const hang = dome ? lv.elev + dome.spring + dome.rise - .5 : y + rise - .2;
  B.frame(v.frame, () => {
    if (!domed) for (let i = 0; i < segments; i++) {
      const [z0, ya] = profile[i], [z1, yb] = profile[i + 1], angle = Math.atan2(yb - ya, z1 - z0);
      B.get('glass').shape('box', new THREE.Vector3((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle), new THREE.Vector3(x1 - x0, .035, Math.hypot(z1 - z0, yb - ya)), '#ffffff');
      for (let x = x0; x <= x1 + .01; x += (x1 - x0) / 8) B.get('extMetal').bar({ x, y: ya, z: z0 }, { x, y: yb, z: z1 }, .1, p.trim);
    }
    if (!domed) for (let i = 0; i <= segments; i += 4) B.get('extMetal').box((x0 + x1) / 2, profile[i][1], profile[i][0], x1 - x0, .08, .1, p.trim);
    if (!domed) for (const x of [x0, x1]) for (let i = 0; i < segments; i++) {
      const [z0, ya] = profile[i], [z1, yb] = profile[i + 1];
      B.get('glass').box(x, y + Math.max(0, (ya + yb) / 2 - y) / 2, (z0 + z1) / 2, .03, Math.max(.02, (ya + yb) / 2 - y), z1 - z0, '#ffffff');
    }
    // Suspended bronze cloud rings remain entirely within the real atrium void.
    for (let i = 0; i < 3; i++) {
      const xx = (x0 + x1) / 2 + (i - 1) * 3, yy = y - 3 - i * .55;
      B.get('extMetal').shape('torus', new THREE.Vector3(xx, yy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(1.06, .2 * i, .22 * i)), new THREE.Vector3(6.3 - i * .5, 4.2, .55), i % 2 ? '#ae956b' : '#c6b08b');
      B.get('extMetal').bar({ x: xx, y: yy + 1.8, z: cz }, { x: xx, y: hang, z: cz }, .025, p.trim);
    }
  });
}

function sunkenCourtExterior(ctx) {
  const court = ctx.layout.expansion?.sunkenCourt;
  if (!court) return;
  const B = ctx.levels[court.level].shellBatch, r = court.bounds, y = court.elev, p = PALETTES.dining;
  const north = { level: court.level, seg: { x0: -110.9, z0: r.z0, x1: -106.1, z1: r.z0 } };
  const south = { level: court.level, seg: { x0: court.stair.top.x - court.stair.width / 2 - .15, z0: r.z1,
    x1: court.stair.top.x + court.stair.width / 2 + .15, z1: r.z1 } };
  for (const e of outlineEdges(court.poly)) B.frame(e.F, () => {
    // The north opening is a covered B1M passage; the south slot contains the
    // real rising stair. Its ground rail must open at the stair, not at B1M.
    for (const [a, b] of edgeSpans(e, [north, south], 0)) {
      B.get('facadeTravertine').box((a + b) / 2, (y - .12) / 2, -.12, b - a, -y - .12, .28, '#d5c6ae');
      B.get('glow').box((a + b) / 2, -.6, -.275, b - a, .035, .035, p.glow);
    }
    const northAt = [toL(e.F, north.seg.x0, north.seg.z0), toL(e.F, north.seg.x1, north.seg.z1)];
    if (northAt.every(q => Math.abs(q[1]) < .05)) {
      const a = Math.min(northAt[0][0], northAt[1][0]), b = Math.max(northAt[0][0], northAt[1][0]);
      B.get('facadeTravertine').box((a + b) / 2, (y + 3.2 - .12) / 2, -.12, b - a, -y - 3.2 - .12, .28, '#d5c6ae');
      B.get('glow').box((a + b) / 2, y + 3.24, -.29, b - a - .2, .04, .05, p.glow);
    }
    for (const [a, b] of edgeSpans(e, [south], 0)) {
      B.get('facadeStone').box((a + b) / 2, -.06, -.1, b - a, .22, .38, '#c4b99f');
      B.get('glass').box((a + b) / 2, .6, -.1, b - a, 1.06, .04, '#ffffff');
      B.get('extMetal').box((a + b) / 2, 1.15, -.1, b - a, .055, .075, p.trim);
      const n = Math.max(1, Math.ceil((b - a) / 2.5));
      for (let i = 0; i <= n; i++) B.get('extMetal').box(a + (b - a) * i / n, .56, -.1, .045, 1.1, .06, p.trim);
    }
  });
  const s = court.stage, sx = (s.x0 + s.x1) / 2, sz = (s.z0 + s.z1) / 2;
  B.get('facadeTimber').box(sx, y + .16, sz, s.x1 - s.x0, .32, s.z1 - s.z0, '#a68b63');
  B.get('glow').box(s.x1 + .01, y + .25, sz, .025, .035, s.z1 - s.z0 - .25, '#ffe4a8');
  for (let z = s.z0 + .25; z <= s.z1 - .25; z += .32) B.get('facadeTimber').box(s.x0 - .12, y + 1.65, z, .18, 3, .12, '#9a7957');
  B.get('extMetal').box(sx, y + 3.15, sz, s.x1 - s.x0 + .2, .13, s.z1 - s.z0 + .2, p.trim);
  for (let z = s.z0 + .5; z < s.z1; z += 1.2) B.get('glow').box(sx, y + 3.07, z, s.x1 - s.x0 - .4, .025, .055, p.glow);
  // The site opening is visible even when the underground floor's base is
  // hidden in overview. A shell preview uses the same stair/furniture geometry
  // and switches off whenever the complete B1M base is shown.
  const L = ctx.levels[court.level];
  if (L.shell && ctx.mats?.base) {
    const preview = new THREE.Group(), PB = new BatchSet(ctx.mats.base);
    preview.name = 'P1-sunken-court-outdoor-preview';
    PB.frame(court.stair.frame, () => buildMallFlightGeometry(PB, court.stair));
    sunkenCourtFurniture(PB, court);
    PB.flush(preview); L.shell.add(preview);
    const update = (_dt, _elapsed, app) => {
      const state = app?.state, focused = state?.focus && ctx.levels[state.focus]?.lv;
      preview.visible = !L.base.visible && !state?.exploded && !(focused && focused.elev < court.elev - .1);
    };
    update(); (ctx.dynamic ||= []).push({ name: preview.name, update });
    L.sunkenCourtPreview = preview;
  }
}

function sunkenCourtFurniture(B, court) {
  const r = court.seating, y = court.elev;
  for (let z = r.z0 + 1; z < r.z1 - .7; z += 2.6) {
    for (let i = 0; i < 2; i++) {
      const x = r.x1 - .5 - i * .8, h = .8 - i * .4;
      B.get('stone').box(x, y + h / 2, z, .7, h, 2.0, '#d0c1a5');
      B.get('wood').box(x, y + h + .035, z, .74, .07, 2.0, '#b49367');
    }
  }
  gardenPlanter(B, -114.6, y, -34.4, PALETTES.dining, true);
  gardenPlanter(B, -102.7, y, -33.6, PALETTES.dining, true);
}

function sunkenCourtDetail(ctx, lv) {
  const court = ctx.layout.expansion?.sunkenCourt;
  if (!court || court.level !== lv.id) return;
  sunkenCourtFurniture(ctx.levels[lv.id].batch, court);
}

/** Furniture islands are authored in layout and also reserve navigation space.
 * All solid details fit the supplied rect; the renderer never invents a second
 * placement grid, and streamed floors create no extra textures or callbacks. */
export function buildP1PublicFixture(B, lv, f) {
  const r = f.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, y = lv.elev;
  if (w < .4 || d < .4) return;
  const F = frame((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0), p = paletteOf(lv);
  const scale = Math.min(1, w / 4.6, d / 3.6), accent = f.accent || p.fin, variant = f.variant || 0;
  const books = ['#d29e6c', '#758f86', '#5b7181', '#d9c7a4', '#a47169', '#b2bca0'];
  B.frame(F, () => {
    const P = (key, x, z, h, sx, sz, sy, color, ry = 0) => B.get(key).box(x, y + h, z, sx, sy, sz, color, ry);
    const seat = (x, z, ry = 0, stool = false) => {
      P('wood', x, z, .46, .46 * scale, .45 * scale, .09, '#b39972', ry);
      P('satin', x, z, .52, .41 * scale, .40 * scale, .055, accent, ry);
      for (const dx of [-.15, .15]) for (const dz of [-.15, .15]) P('metal', x + dx * scale, z + dz * scale, .22, .035, .035, .44, '#685f4c');
      if (!stool) P('wood', x + Math.sin(ry) * .18 * scale, z + Math.cos(ry) * .18 * scale, .77, .46 * scale, .055, .43, '#b39972', ry);
    };
    const table = (x, z, tw, td) => {
      P('wood', x, z, .77, tw, td, .09, '#d1b48b');
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) P('metal', x + dx * (tw / 2 - .16), z + dz * (td / 2 - .16), .37, .055, .055, .74, '#81775f');
    };
    const cup = (x, z, h = .84) => {
      B.get('satin').cyl(x, y + h, z, .07 * scale, .13, '#f3eee2', 8);
      B.get('ext').cyl(x, y + h + .131, z, .052 * scale, .008, '#795743', 8);
      P('satin', x, z, h - .015, .22 * scale, .22 * scale, .025, '#eae0ce');
    };
    const sculpture = (x, z, base, size, index = 0) => {
      if (index % 2) {
        B.get('satin').cyl(x, y + base, z, size * .24, size * .38, '#5c817a', 10);
        B.get('satin').sphere(x, y + base + size * .63, z, size * .32, '#b7bd9e', size * .43, size * .3, 'sphereLo');
        B.get('metal').cyl(x, y + base + size * .9, z, size * .12, size * .2, '#bda273', 10);
      } else {
        B.get('metal').shape('torus', new THREE.Vector3(x, y + base + size * .55, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(.25, .35, -.35)), new THREE.Vector3(size, size * 1.1, size * .35), '#b99b64');
        B.get('satin').sphere(x, y + base + size * .48, z, size * .20, '#638f86', size * .23, size * .20, 'sphereLo');
      }
    };
    if (Math.min(w, d) < 1.8) {
      const alongX = w >= d, width = Math.max(w, d), depth = Math.min(w, d);
      const Q = (key, a, b, h, sa, sb, sy, color) => alongX ? P(key, a, b, h, sa, sb, sy, color) : P(key, b, a, h, sb, sa, sy, color);
      Q('wood', 0, -depth * .36, 1, width * .88, .06, 2, '#a68c69');
      for (const h of [.14, .72, 1.30, 1.92]) Q('wood', 0, 0, h, width * .9, depth * .82, .065, '#b59a75');
      for (const a of [-width * .44, width * .44]) Q('metal', a, 0, 1, .045, depth * .8, 1.95, '#8c8069');
      const n = Math.max(4, Math.floor(width * 4));
      for (let shelf = 0; shelf < 3; shelf++) for (let k = 0; k < n; k++) {
        const a = -width * .39 + k * width * .78 / Math.max(1, n - 1), h = .28 + (k + shelf + variant) % 3 * .06;
        Q('matte', a, 0, .18 + shelf * .58 + h / 2, width * .58 / n, depth * .52, h, books[(k + shelf + variant) % books.length]);
      }
      Q('glowSoft', 0, -depth * .25, 2.02, width * .78, .06, .04, '#ffe8bd');
      return;
    }
    // Flush rugs mark each activity without adding waist-high enclosures.
    P('matte', 0, 0, .012, w - .18, d - .18, .024, f.kind === 'gallery' ? '#d2d1bd' : f.kind === 'garden' ? '#c6cbb4' : '#ddd0b7');
    if (f.kind === 'gallery') {
      for (const side of [-1, 1]) {
        const x = side * w * .24, z = -d * .27, pw = w * .4;
        P('metal', x, z, .5, .075, .08, 1, p.trim);
        P('stone', x, z, .07, pw * .55, .48 * scale, .14, '#c4bda8');
        P('wood', x, z, 1.65, pw, .11, 1.75, '#9c8260');
        P('matte', x, z + .065, 1.65, pw - .13, .025, 1.61, '#e9dfca');
        P('satin', x - pw * .18, z + .087, 1.79, pw * .27, .02, 1.03, side > 0 ? '#8eaa9d' : '#a87964');
        P('satin', x + pw * .16, z + .09, 1.46, pw * .28, .025, .6, side > 0 ? '#b29b6e' : '#547b81');
        B.get('metal').shape('torus', new THREE.Vector3(x + pw * .05, y + 1.83, z + .105), new THREE.Quaternion(), new THREE.Vector3(pw * .48, .72, .11), '#bda67b');
        P('glowSoft', x, z + .08, 2.57, pw * .7, .12, .055, '#ffecc8');
        P('stone', x, d * .24, .38 + (side > 0 ? .15 : 0), w * .25, d * .27, side > 0 ? 1.06 : .76, '#c6c3b1');
        sculpture(x, d * .24, side > 0 ? 1.06 : .76, Math.min(w * .23, d * .33), variant + (side > 0 ? 1 : 0));
        P('matte', x, d * .38, .81 + (side > 0 ? .3 : 0), w * .13, .12, .035, '#faf4e6');
      }
    } else if (f.kind === 'reading') {
      const z = -d * .36, width = w * .86;
      for (const h of [.2, .72, 1.24, 1.78]) P('wood', 0, z, h, width, .4 * scale, .065, '#ac9069');
      for (const x of [-width / 2, 0, width / 2]) P('wood', x, z, .95, .065, .42 * scale, 1.75, '#aa8c66');
      const n = Math.max(8, Math.floor(width * 3));
      for (let shelf = 0; shelf < 3; shelf++) for (let k = 0; k < n; k++) {
        const x = -width / 2 + .15 + k * (width - .3) / n, h = .28 + (k + shelf + variant) % 4 * .045;
        P('matte', x, z + .025, .24 + shelf * .52 + h / 2, (width - .35) / n * .72, .25 * scale, h, books[(k + shelf + variant) % books.length]);
      }
      table(0, d * .17, w * .5, d * .22);
      for (const side of [-1, 1]) for (const front of [-1, 1]) seat(side * w * .17, d * .17 + front * d * .22, front < 0 ? Math.PI : 0);
      for (const x of [-w * .13, w * .13]) {
        P('matte', x, d * .17, .84, .30 * scale, .22 * scale, .04, '#eeeadb');
        B.get('metal').cyl(x, y + .82, d * .16, .035, .32, '#a99163', 6);
        B.get('glowSoft').cone(x, y + 1.1, d * .16, .16 * scale, .13, '#f2dfb3', 8);
      }
    } else if (f.kind === 'cafe') {
      P('stone', w * .35, 0, .53, w * .21, d * .75, 1.06, '#c9baa0');
      P('wood', w * .35, 0, 1.1, w * .25, d * .78, .1, '#8c7251');
      P('metal', w * .35, -d * .18, 1.36, w * .15, d * .24, .42, '#7d8880');
      P('glassTint', w * .35, d * .15, 1.31, w * .17, d * .25, .32, '#ffffff');
      for (let k = 0; k < 3; k++) cup(w * .35, d * (-.02 + .06 * k), 1.16);
      table(-w * .13, 0, w * .47, d * .29);
      for (const side of [-1, 1]) for (const front of [-1, 1]) seat(-w * .13 + side * w * .14, front * d * .29, front < 0 ? Math.PI : 0);
      for (const side of [-1, 1]) cup(-w * .13 + side * w * .12, 0);
    } else if (f.kind === 'workshop') {
      table(0, 0, w * .64, d * .42);
      for (const side of [-1, 1]) for (const front of [-1, 1]) seat(side * w * .21, front * d * .34, 0, true);
      for (const side of [-1, 1]) {
        P('matte', side * w * .18, 0, .835, w * .24, d * .30, .025, '#91a6a0');
        sculpture(side * w * .18, 0, .86, Math.min(w * .12, d * .18), variant + (side > 0 ? 1 : 0));
        for (let k = 0; k < 3; k++) P('wood', side * w * .18 + (k - 1) * .11, d * .12, .87, .04, .30 * scale, .035, '#b39262');
      }
      P('wood', 0, -d * .4, .53, w * .65, .32 * scale, 1.05, '#aa8d67');
      for (let k = 0; k < 5; k++) B.get('satin').cyl((k - 2) * w * .11, y + 1.06, -d * .4, .10 * scale, .22 + k % 2 * .08, books[k], 8);
    } else if (f.kind === 'garden') {
      P('stone', 0, -.08 * d, .28, w * .62, d * .52, .56, '#c7c1a8');
      P('ext', 0, -.08 * d, .57, w * .58, d * .48, .025, '#73664b');
      for (const [i, x] of [-w * .18, 0, w * .18].entries()) {
        B.get('wood').cyl(x, y + .58, -d * .08, .055, 1.2 + i % 2 * .3, '#8a7553', 6);
        B.get('foliage').sphere(x, y + 1.9 + i % 2 * .3, -d * .08, Math.min(w * .14, d * .20), i % 2 ? '#799268' : '#97a77d', .5, Math.min(w * .14, d * .20), 'ico0');
      }
      P('wood', 0, d * .35, .48, w * .75, .40 * scale, .09, '#b39368');
      for (const x of [-w * .28, w * .28]) P('metal', x, d * .35, .23, .08, .3 * scale, .46, '#746f5e');
    } else {
      const radius = Math.min(w * .27, d * .26);
      B.get('stone').cyl(0, y + .02, 0, radius * .92, .52, '#babba8', 16);
      for (let i = 0; i < 3; i++) B.get('metal').shape('torus', new THREE.Vector3((i - 1) * radius * .2, y + .55 + radius * .9, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(.2 + i * .5, .3 * i, .2)), new THREE.Vector3(radius * 1.6, radius * 1.9, radius * .35), i % 2 ? '#7b9d93' : '#c2a36a');
      P('matte', 0, d * .34, .6, w * .3, .24 * scale, .08, '#e9e1ca');
    }
  });
}

/** Public interiors stay scoped to a streamed level; no textures or persistent hooks. */
export function buildP1ExpansionLevel(ctx, lv) {
  if (ctx.layout.playable) return;
  sunkenCourtDetail(ctx, lv);
  if (!isExpanded(lv) || lv.kind === 'roof' || !usesExpansionFacade(lv)) return;
  const L = ctx.levels[lv.id], B = L.batch, p = paletteOf(lv), y = lv.elev, h = clearHeight(lv);
  for (const fixture of lv.expansion.publicFixtures || []) buildP1PublicFixture(B, lv, fixture);
  const walks = (lv.walk || []).filter(w => !w.outdoor && !/stair|lift|terrace/.test(w.kind || ''));
  const occupied = q => lv.units.some(u => u.polys.some(poly => pointInPoly(q, poly))) ||
    lv.rooms.some(r => (r.polys || []).some(poly => pointInPoly(q, poly) || distToPolyEdge(q, poly) < .5)) ||
    (lv.expansion.publicFixtures || []).some(f => pointInPoly(q, f.poly) || distToPolyEdge(q, f.poly) < .8);
  let lights = 0;
  // Warm linear baffles and lighting follow actual public floors, avoiding voids.
  for (const w of walks) {
    const r = polyBounds(w.poly), alongX = r.x1 - r.x0 > r.z1 - r.z0;
    for (let x = r.x0 + 2; x < r.x1 - 1; x += 5.2) for (let z = r.z0 + 2; z < r.z1 - 1; z += 5.2) {
      if (lights >= (zoneOf(lv) === 'culture' ? 14 : 36) || !pointInPoly([x, z], w.poly) || distToPolyEdge([x, z], w.poly) < 1.4 || occupied([x, z]) || !supportedDisc(lv, x, z, 1.2)) continue;
      const nx = alongX ? 1.9 : .12, nz = alongX ? .12 : 1.9;
      B.get('wood').box(x, y + h - .18, z, nx + .15, .25, nz + .15, p.fin);
      B.get('glow').box(x, y + h - .32, z, nx, .035, nz, p.glow);
      lights++;
    }
  }
  const doors = ctx.layout.entrances.filter(e => e.level === lv.id);
  const seats = [];
  for (const poly of facadePolys(lv)) for (const e of outlineEdges(poly)) {
    if (seats.length >= 4 || e.len < 7) continue;
    const [x, z] = toW(e.F, e.len / 2, -2.2), q = [x, z];
    if (!walks.some(w => pointInPoly(q, w.poly) && distToPolyEdge(q, w.poly) > 1.1) || occupied(q) || !supportedDisc(lv, x, z, 1.5)) continue;
    if (doors.some(d => segmentDistance(q, d.seg) < 5) || lv.rooms.some(r => (r.polys || []).some(p => pointInPoly(q, p) || distToPolyEdge(q, p) < 2))) continue;
    if (seats.some(s => Math.hypot(s[0] - x, s[1] - z) < 7)) continue;
    seats.push(q);
    bench(B, x, y, z, -e.F.a, 'wood');
    const [px, pz] = toW(e.F, e.len / 2 + 1.8, -2.2);
    if (!occupied([px, pz]) && walks.some(w => pointInPoly([px, pz], w.poly)) && doors.every(d => segmentDistance([px, pz], d.seg) > 4) && supportedDisc(lv, px, pz, .9)) gardenPlanter(B, px, y, pz, p, false);
  }
}

/** Lightweight resident exterior; all repetitive construction shares existing PBR materials. */
export function buildP1ExpansionExterior(ctx) {
  if (ctx.layout.playable) return;
  sunkenCourtExterior(ctx);
  for (const lv of ctx.layout.levels.filter(isExpanded)) {
    if (usesExpansionFacade(lv)) facade(ctx, lv);
    canopies(ctx, lv);
    if (lv.kind !== 'roof' || zoneOf(lv) !== 'main') terraces(ctx, lv);
    atriumRails(ctx, lv);
    creativeRoof(ctx, lv);
    artLantern(ctx, lv);
  }
}
