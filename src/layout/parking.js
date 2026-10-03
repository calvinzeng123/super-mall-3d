// B1/B2 停车层：车道、车位、设备房、坡道。
import { rect, rectsOverlap } from './geom.js';

export const STALL_W = 2.5;
export const STALL_D = 5;

/** B1 楼板外轮廓：建筑范围 + 北侧坡道连接区 */
export const B1_OUTER = [[-60, -40], [-6, -40], [-6, -52], [6, -52], [6, -40], [60, -40], [60, 40], [-60, 40]];
/** B1 楼板上通往 B2 的坡道开口 */
export const B1_RAMP_HOLE = rect(25, -39.5, 49, -30.5);

// 车位排：face = 车位开口朝向（车头进入方向的反向），沿 x 或沿 z 排布
const ROWS = [
  { id: 'R1', x0: -55, x1: 55, z0: -29, z1: -24, face: 'S' },
  { id: 'R2', x0: -49, x1: 49, z0: -18, z1: -13, face: 'N' },
  { id: 'R3', x0: -49, x1: 49, z0: -13, z1: -8, face: 'S' },
  { id: 'R4', x0: -49, x1: 49, z0: -2.5, z1: 2.5, face: 'N' },
  { id: 'R5', x0: -49, x1: 49, z0: 2.5, z1: 7.5, face: 'S' },
  { id: 'R6', x0: -49, x1: 49, z0: 13, z1: 18, face: 'N' },
  { id: 'R7', x0: -55, x1: 55, z0: 24, z1: 29, face: 'N' },
  { id: 'RW', x0: -60, x1: -55, z0: -24, z1: 24, face: 'E' },
  { id: 'RE', x0: 55, x1: 60, z0: -40, z1: 24, face: 'W' },
];

function equipment(levelId) {
  const isB1 = levelId === 'B1';
  const list = [
    ['EQ-1', rect(-60, -40, -36, -29), '配电房'],
    ['EQ-2', rect(-60, -29, -55, -24), '风机房'],
    ['EQ-5', rect(-60, 24, -55, 29), '储藏间'],
    ['EQ-6', rect(-60, 29, 28, 40), '水泵房 · 消防水池'],
    ['EQ-7', rect(36, 29, 60, 40), '空调机房'],
    ['EQ-8', rect(55, 24, 60, 29), '储藏间'],
  ];
  if (isB1) {
    list.push(['EQ-3', rect(-6, -40, -3, -24), '管井'], ['EQ-4', rect(3, -40, 25, -29), '变配电室']);
  } else {
    list.push(['EQ-3', rect(-20, -40, -3, -29), '设备房'], ['EQ-4', rect(3, -40, 19, -29), '变配电室'], ['RAMP', rect(25, -40, 49, -29), '坡道']);
  }
  return list.map(([id, r, label]) => ({ id, type: id === 'RAMP' ? 'ramp' : 'equip', rects: [r], doors: [], label }));
}

function aisles(levelId) {
  const isB1 = levelId === 'B1';
  const a = [
    ['A1', rect(-55, -24, 55, -18)], ['A2', rect(-55, -8, 55, -2.5)], ['A3', rect(-55, 7.5, 55, 13)], ['A4', rect(-55, 18, 55, 24)],
    ['AW', rect(-55, -24, -49, 24)], ['AE', rect(49, -40, 55, 24)],
    ['C', isB1 ? rect(-3, -40, 3, 24) : rect(-3, -24, 3, 24)],
  ];
  if (isB1) a.push(['CN', rect(-6, -52, 6, -40)]);
  else a.push(['D', rect(19, -40, 25, -24)]);
  return a.map(([id, r]) => ({ id, kind: 'aisle', rect: r }));
}

/** 沿一排生成车位：每 3 个车位一跨，跨间留 0.5m 柱位 */
function fillRow(row, blocks) {
  const alongX = row.face === 'N' || row.face === 'S';
  const a0 = alongX ? row.x0 : row.z0;
  const a1 = alongX ? row.x1 : row.z1;
  const stalls = [];
  const columns = [];
  const cross = alongX ? (row.z0 + row.z1) / 2 : (row.x0 + row.x1) / 2;
  const back = { N: row.z1, S: row.z0, E: row.x0, W: row.x1 }[row.face];
  for (let i = 0; ; i++) {
    const start = a0 + 0.25 + i * STALL_W + Math.floor(i / 3) * 0.5;
    if (start + STALL_W > a1 - 0.1) break;
    const c = start + STALL_W / 2;
    const s = alongX
      ? { x: +c.toFixed(3), z: cross, w: STALL_W, d: STALL_D, face: row.face, row: row.id }
      : { x: cross, z: +c.toFixed(3), w: STALL_D, d: STALL_W, face: row.face, row: row.id };
    const r = rect(s.x - s.w / 2, s.z - s.d / 2, s.x + s.w / 2, s.z + s.d / 2);
    if (blocks.some((b) => rectsOverlap(r, b, 0.02))) continue;
    stalls.push(s);
    if (i % 3 === 2) {
      const ca = start + STALL_W + 0.25;
      if (ca < a1 - 0.3) columns.push(alongX ? { x: ca, z: back } : { x: back, z: ca });
    }
  }
  return { stalls, columns };
}

function zoneOf(x, z) {
  return (z < 0 ? (x < 0 ? 'A' : 'B') : x < 0 ? 'C' : 'D');
}

/** 填充停车层（需在核心筒用房加入之后调用） */
export function fillParking(lv) {
  const isB1 = lv.id === 'B1';
  lv.rooms.push(...equipment(lv.id));
  const ais = aisles(lv.id);
  lv.walk.push(...ais);
  if (isB1) lv.walk.push({ id: 'escLobby', kind: 'eschall', rect: rect(-20, -40, -6, -24) });
  const blocks = [
    ...lv.rooms.flatMap((m) => m.rects),
    ...lv.walk.map((w) => w.rect),
    ...(isB1 ? [B1_RAMP_HOLE] : []),
  ];
  const stalls = [];
  const columns = [];
  for (const row of ROWS) {
    const res = fillRow(row, blocks);
    stalls.push(...res.stalls);
    columns.push(...res.columns);
  }
  for (const s of stalls) {
    s.zone = zoneOf(s.x, s.z);
    s.type = 'normal';
    if (s.row === 'R7' && s.x > 36) s.type = 'ev';
    if ((s.row === 'R1' && s.x > -42 && s.x < -36) || (s.row === 'R7' && s.x > 21 && s.x < 28)) s.type = 'accessible';
  }
  lv.parking = { stalls, columns, aisles: ais.map((a) => a.rect), rows: ROWS };
}
