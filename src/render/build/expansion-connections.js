import * as THREE from 'three';
import clipping from 'polygon-clipping';
import { BatchSet } from '../batch.js';
import { subtractInterval } from '../../layout/geom.js';
import { addCutSurfaceSlab } from './surface-shapes.js';

const cleanRing = ring => {
  const points = ring.map(p => [...p]);
  if (points.length > 1 && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 1e-7) points.pop();
  return points;
};
const pathPolygons = path => path.slab?.pieces?.length
  ? path.slab.pieces.map(p => [p.outer, ...(p.holes || [])]) : (path.polys || []).map(p => [p]);
const ringArea = ring => Math.abs(ring.reduce((sum, p, i) => {
  const next = ring[(i + 1) % ring.length]; return sum + p[0] * next[1] - next[0] * p[1];
}, 0)) / 2;

/** Clip an arbitrary boundary segment against a narrow portal band. Unlike the
 * legacy rectangular corridor helper this works for diagonal caps as well. */
export function openExpansionBoundary(edges, portals) {
  return edges.flatMap(edge => {
    const dx = edge.x1 - edge.x0, dz = edge.z1 - edge.z0;
    let intervals = [[0, 1]];
    for (const { seg, padding = .08, depth = .12 } of portals) {
      const length = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      if (length < 1e-7) continue;
      const ux = (seg.x1 - seg.x0) / length, uz = (seg.z1 - seg.z0) / length;
      const x = edge.x0 - seg.x0, z = edge.z0 - seg.z0;
      let lo = 0, hi = 1;
      for (const [origin, delta, min, max] of [
        [x * ux + z * uz, dx * ux + dz * uz, -padding, length + padding],
        [-x * uz + z * ux, -dx * uz + dz * ux, -depth, depth],
      ]) {
        if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) { lo = 1; hi = 0; break; } }
        else {
          const a = (min - origin) / delta, b = (max - origin) / delta;
          lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
        }
      }
      if (hi > lo) intervals = subtractInterval(intervals, [lo, hi]);
    }
    return intervals.filter(([a, b]) => (b - a) * Math.hypot(dx, dz) > .015)
      .map(([a, b]) => ({ x0: edge.x0 + dx * a, z0: edge.z0 + dz * a, x1: edge.x0 + dx * b, z1: edge.z0 + dz * b }));
  });
}

function endpointPortals(path) {
  return [0, path.points.length - 1].flatMap(index => {
    const p = path.points[index], q = path.points[index === 0 ? 1 : index - 1];
    if (!q) return [];
    const dx = q[0] - p[0], dz = q[2] - p[2], length = Math.hypot(dx, dz);
    if (length < 1e-6) return [];
    const nx = -dz / length, nz = dx / length, half = path.width / 2;
    return [{ seg: { x0: p[0] - nx * half, z0: p[2] - nz * half, x1: p[0] + nx * half, z1: p[2] + nz * half },
      padding: .12, depth: .16 }];
  });
}

/** Union only expansion paths at the same elevation. Junctions lose their
 * internal walls; disconnected components retain independent visibility. */
export function expansionConnectionNetworks(layout) {
  const byElevation = new Map();
  for (const path of layout.extensions?.paths || []) {
    if (!path.expansion || !['skybridge', 'underground', 'garage'].includes(path.kind)) continue;
    const below = path.kind !== 'skybridge', y = path.points[0][1], key = `${below ? 'below' : 'sky'}:${y.toFixed(4)}`;
    if (!byElevation.has(key)) byElevation.set(key, { paths: [], y, below, sky: !below });
    byElevation.get(key).paths.push(path);
  }
  const networks = [];
  for (const network of byElevation.values()) {
    const polygons = network.paths.flatMap(pathPolygons);
    if (!polygons.length) continue;
    for (const polygon of clipping.union(...polygons)) {
      const paths = network.paths.filter(path => clipping.intersection([polygon], pathPolygons(path))
        .some(([outer]) => ringArea(outer) > 1e-5));
      const pieces = [{ outer: cleanRing(polygon[0]), holes: polygon.slice(1).map(cleanRing) }];
      const edges = polygon.flatMap(ring => cleanRing(ring).map((a, i, points) => {
        const b = points[(i + 1) % points.length]; return { x0: a[0], z0: a[1], x1: b[0], z1: b[1] };
      })).filter(e => Math.hypot(e.x1 - e.x0, e.z1 - e.z0) > .015);
      const portals = paths.flatMap(endpointPortals);
      for (const entrance of layout.entrances || []) if (paths.some(path => entrance.id.startsWith(`${path.id}-`))) {
        portals.push({ seg: entrance.seg, padding: .12, depth: .18 });
      }
      const level = paths.find(path => path.level?.startsWith('P1-'))?.level || paths[0]?.level;
      networks.push({ ...network, paths, pieces, level, polygonal: true, portals,
        levels: [...new Set(paths.flatMap(path => [path.level, path.from, path.to]).filter(Boolean))],
        boundary: openExpansionBoundary(edges, portals) });
    }
  }
  return networks;
}

function beam(batch, key, edge, y, height, width, color) {
  const dx = edge.x1 - edge.x0, dz = edge.z1 - edge.z0, length = Math.hypot(dx, dz);
  if (length < .01) return;
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(dz, dx));
  batch.get(key).shape('box', new THREE.Vector3((edge.x0 + edge.x1) / 2, y + height / 2, (edge.z0 + edge.z1) / 2),
    rotation, new THREE.Vector3(length, height, width), color);
}

export function buildExpansionConnectionGeometry(batch, ceilingBatch, network) {
  const { y, below, pieces, boundary } = network, height = below ? 3.2 : 3.4;
  for (const piece of pieces) {
    addCutSurfaceSlab(batch, below ? 'concrete' : 'stone', piece.outer, piece.holes, y, below ? .18 : .3, '#e6dfd1');
    addCutSurfaceSlab(ceilingBatch, below ? 'concrete' : 'glassTint', piece.outer, piece.holes, y + height + .06, .06, '#dce6df');
  }
  for (const edge of boundary) {
    if (below) {
      beam(batch, 'concrete', edge, y, height, .18, '#d5dcd5');
      beam(batch, 'extSatin', edge, y + .4, .1, .2, '#607d72');
      beam(batch, 'glowSoft', edge, y + height - .24, .045, .19, '#eef1dc');
    } else {
      beam(batch, 'glass', edge, y + .2, height - .3, .035, '#ffffff');
      beam(batch, 'extMetal', edge, y - .19, .18, .18, '#6d786c');
      beam(batch, 'extMetal', edge, y + 1.12, .07, .1, '#8b927f');
      beam(batch, 'wood', edge, y + height - .17, .12, .18, '#b6a382');
      beam(batch, 'glowSoft', edge, y + height - .23, .035, .12, '#ffe6bd');
      const span = Math.hypot(edge.x1 - edge.x0, edge.z1 - edge.z0), divisions = Math.max(1, Math.ceil(span / 4.5));
      for (let i = 0; i <= divisions; i++) {
        const t = i / divisions;
        batch.get('extMetal').box(edge.x0 + (edge.x1 - edge.x0) * t, y + height / 2,
          edge.z0 + (edge.z1 - edge.z0) * t, .085, height, .085, '#77836e');
      }
    }
  }
}

export function expansionConnectionVisible(network, state, levels) {
  if (state?.exploded) return false;
  const focus = levels[state?.focus]?.lv;
  if (!network.below && (state?.explore?.under || focus?.elev < 0)) return false;
  if (!state?.explore && focus && network.levels.some(id => levels[id]?.lv.building === state.building
    && levels[id].lv.elev > focus.elev + .1)) return false;
  return true;
}

export function buildExpansionConnections(ctx) {
  const networks = expansionConnectionNetworks(ctx.layout);
  for (const [index, network] of networks.entries()) {
    const owner = ctx.levels[network.level];
    if (!owner) continue;
    const group = new THREE.Group(), ceiling = new THREE.Group();
    group.name = `expansion-${network.below ? 'tunnel' : 'skybridge'}-${index}`;
    ceiling.name = 'expansion-connection-camera-aware-ceiling';
    const batch = new BatchSet(ctx.mats.base), ceilingBatch = new BatchSet(ctx.mats.base);
    buildExpansionConnectionGeometry(batch, ceilingBatch, network);
    batch.flush(group); ceilingBatch.flush(ceiling); group.add(ceiling);
    owner.shell.add(group);
    Object.assign(network, { group, ceiling });
    ctx.dynamic.push({ name: group.name, update(dt, elapsed, app) {
      group.visible = expansionConnectionVisible(network, app?.state, ctx.levels);
      ceiling.visible = ctx.camera.position.y < network.y + (network.below ? 3.0 : 3.2);
    } });
  }
  ctx.hospitality.expansionConnections = networks;
  return networks;
}
