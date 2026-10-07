// User-supplied suite GLB, surveyed in source metres (Y up). The renderer and
// navigation share this transform; room areas are measured from walls, not the
// source concrete-floor apron. All returned plans are in unit-local X/Z.
import { rect, polyBounds } from './geom.js';

export const SUITE_TRANSFORM = { rotationY: Math.PI / 2, offset: [1.45, 0, 10.35] };
export const suitePoint = (x, z) => [+(z + 1.45).toFixed(5), +(10.35 - x).toFixed(5)];
export const suiteRect = (x0, z0, x1, z1) => {
  const a = suitePoint(x0, z0), b = suitePoint(x1, z1);
  return rect(a[0], a[1], b[0], b[1]);
};
const partition = (id, a, b, door = null, role = 'partition') => ({ id, a: suitePoint(...a), b: suitePoint(...b), role, ...(door ? { door } : {}) });
const room = (id, kind, r) => ({ id, kind, rect: r });
const obstacle = (id, bounds) => ({ id, rect: suiteRect(...bounds) });
// Prepared GLB node 14 (Bed): include the actual outer upholstery/bedframe,
// not nominal mattress dimensions. The renderer reuses this centre at 1:1.
const BED_RECT = suiteRect(2.334639310836792, .09939519315958023, 4.563210964202881, 2.2842886447906494);
const BED_SURROUNDS = [
  ['headboard-wall', [1.9, 0, 5, .17]],
  ['nightstand-window', [1.93, .05, 2.41, .462]],
  ['nightstand-entry', [4.49, .05, 4.97, .462]],
];

export function createSuitePlan() {
  const outline = [[0, 0], [8.85, 0], [8.85, 3.45], [10.35, 3.45], [10.35, 4.65], [7.95, 4.65], [7.95, 5.75], [0, 5.75]];
  const footprint = outline.map(p => suitePoint(...p));
  const partitions = outline.map((p, i) => {
    const next = outline[(i + 1) % outline.length];
    // Source entrance clear opening z3.595..4.505. The new east-side connector
    // x9.20..10.20 is cut through both source wall layers by the GLB importer.
    const door = i === 3 ? { at: .6, width: .91 } : i === 4 ? { at: .65, width: 1 } : null;
    return partition(`suite-shell-${i}`, p, next, door, 'shell');
  });
  partitions.push(
    partition('bath-bedroom-wall', [5.8, 0], [5.8, 3.35], { at: 2.5, width: .7 }),
    partition('bath-entry-wall', [5.75, 3.4], [8.85, 3.4]),
    partition('wetroom-glass', [5.85, 2.05], [7.6, 2.05], { at: 1.075, width: .71 }, 'glass'),
    partition('shower-glass', [7.6, 2.05], [8.85, 2.05], null, 'glass'),
    partition('wc-glass', [7.65, 2.1], [7.65, 3.35], { at: .45, width: .7 }, 'glass'),
    { id: 'extension-west-wall', a: [.14, .13], b: [.14, 15], role: 'extension' },
    { id: 'extension-east-wall', a: [10.84, .13], b: [10.84, 15], role: 'extension' },
    { id: 'extension-front-west', a: [.14, .13], b: [4.81, .13], role: 'extension' },
    { id: 'extension-front-east', a: [6.1, .13], b: [10.84, .13], role: 'extension' },
    { id: 'service-void-closure', a: [.14, 10.52], b: [1.37, 10.52], role: 'extension' },
  );
  const bed = { ...BED_RECT };
  const bath = suiteRect(5.75, 0, 8.85, 3.45), living = suiteRect(0, 3.45, 5.75, 5.75);
  const rooms = [
    room('entry', 'entry', suiteRect(5.75, 3.45, 10.35, 4.65)),
    room('living', 'living', living),
    room('bedroom', 'bedroom', suiteRect(0, 0, 5.75, 3.12)),
    room('bath', 'bathroom', bath),
    room('side-wing', 'circulation', rect(7.5, .15, 10.8, 10.5)),
    room('terrace', 'terrace', rect(1.3, 10.5, 10.8, 14.8)),
  ];
  const obstacles = [
    { id: 'bed', rect: bed },
    ...BED_SURROUNDS.map(([id, bounds]) => obstacle(id, bounds)),
    obstacle('sofa', [2.3, 4.8, 4.6, 5.72]),
    obstacle('bathtub', [5.98, 0, 7.55, 1.44]),
    obstacle('tv-island', [2.35, 3.12, 4.55, 3.45]),
    obstacle('entry-bench', [8.06, 4.32, 8.94, 4.65]),
    obstacle('vanity', [5.85, 2.8, 7.52, 3.35]),
    obstacle('wardrobe-bar', [5.75, 4.634, 7.95, 5.75]),
    obstacle('window-seat', [.337, .02, 1.089, 2.4]),
    obstacle('round-table', [.75, 4.35, 1.75, 5.35]),
    obstacle('entry-console', [9, 3.45, 9.9, 3.697]),
  ];
  return {
    model: 'user-suite', transform: SUITE_TRANSFORM, footprint, bounds: polyBounds(footprint),
    entryDoor: { at: 5.5, width: .91 },
    sideDoor: { a: [6.1, .15], b: [6.1, 1.15], center: [6.1, .65], width: 1 },
    rooms, partitions, obstacles,
    beds: [{ x: (bed.x0 + bed.x1) / 2, z: (bed.z0 + bed.z1) / 2, w: bed.x1 - bed.x0, d: bed.z1 - bed.z0, room: 'bedroom' }],
    bathrooms: [{ id: 'bath', rect: bath }], living: { rect: living },
  };
}

/** Within the existing A1F 6.5m volume: no additional building storey/unit. */
export function createSuiteMezzanine(unitId) {
  const r = rect(1.3, 6.4, 10.8, 14.8);
  const bed = { x: 3.4, z: 11.8, w: BED_RECT.x1 - BED_RECT.x0, d: BED_RECT.z1 - BED_RECT.z0, room: 'upper-bedroom' };
  const dx = bed.x - (BED_RECT.x0 + BED_RECT.x1) / 2, dz = bed.z - (BED_RECT.z0 + BED_RECT.z1) / 2;
  const surrounds = BED_SURROUNDS.map(([id, bounds]) => {
    const r = suiteRect(...bounds);
    return { id: `upper-${id}`, rect: rect(r.x0 + dx, r.z0 + dz, r.x1 + dx, r.z1 + dz) };
  });
  const desk = rect(7.2, 13.45, 9.5, 14.05);
  return {
    kind: 'mezzanine', height: 3.05,
    surface: { id: `${unitId}-MEZZ`, rect: r, holes: [], railings: [
      { a: [r.x0, r.z0], b: [r.x1, r.z0], door: { at: 9.55 - r.x0, width: 1.5 } },
      { a: [r.x1, r.z0], b: [r.x1, r.z1] },
      { a: [r.x1, r.z1], b: [r.x0, r.z1] },
      { a: [r.x0, r.z1], b: [r.x0, r.z0] },
    ] },
    stair: { id: `${unitId}-STAIR`, bottom: [9.55, 1], top: [9.55, 6.4], width: 1.5, rise: 3.05, steps: 18 },
    rooms: [room('upper-bedroom', 'bedroom', rect(1.3, 8.3, 6.4, 14.8)), room('study', 'study', rect(6.4, 10.7, 10.8, 14.8))],
    beds: [bed], desk: { rect: desk },
    obstacles: [
      { id: 'upper-bed', rect: rect(bed.x - bed.w / 2, bed.z - bed.d / 2, bed.x + bed.w / 2, bed.z + bed.d / 2) }, { id: 'upper-desk', rect: desk },
      ...surrounds,
      { id: 'upper-wardrobe', rect: rect(1.31, 7.145, 2.03, 9.295) },
      { id: 'upper-bookcase', rect: rect(6.04, 9.2, 6.44, 11) },
      { id: 'upper-chair', rect: rect(8.05, 12.635, 8.65, 13.24) },
    ],
  };
}

/** Added furniture uses the same surveyed footprints as suite-interiors.js. */
export function suiteAdditionObstacles(kind, duplex = false) {
  const definitions = kind === 'hotel' ? [
    ['pantry', 10.02, 2.23, 10.8, 4.37], ['wardrobe', 10.08, 5.35, 10.78, 7.75], ['luggage', 10.03, 8.18, 10.77, 9.62],
  ] : duplex ? [
    ['kitchen', 10.02, 7.12, 10.8, 10.28], ['laundry', 7.31, 8.33, 8.03, 9.07],
  ] : [
    ['kitchen', 10.02, 2.48, 10.8, 6.04], ['laundry', 10.03, 7.78, 10.78, 8.52], ['wardrobe', 10.08, 8.855, 10.78, 10.305],
  ];
  definitions.push(['terrace-sofa', 2.4, 12.84, 4.8, 13.93], ['terrace-table', 5.22, 12.84, 6.34, 13.96],
    ['terrace-planter-west', 1.49, 13.78, 2.03, 14.32], ['terrace-planter-east', 9.93, 13.74, 10.41, 14.22]);
  return definitions.map(([id, ...bounds]) => ({ id, rect: rect(...bounds) }));
}
