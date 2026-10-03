// 场地：人行入口、车库坡道、道路、广场。
import { rect } from './geom.js';

export const ENTRANCES = [
  { id: 'ENT-S', name: '南门 · 主入口', level: '1F', side: 'S', seg: { x0: -8, z0: 40, x1: 8, z1: 40 }, width: 16, main: true },
  { id: 'ENT-N', name: '北门', level: '1F', side: 'N', seg: { x0: -4, z0: -40, x1: 4, z1: -40 }, width: 8, main: false },
  { id: 'ENT-W', name: '西门', level: '1F', side: 'W', seg: { x0: -60, z0: -4, x1: -60, z1: 4 }, width: 8, main: false },
  { id: 'ENT-E', name: '东门', level: '1F', side: 'E', seg: { x0: 60, z0: -4, x1: 60, z1: 4 }, width: 8, main: false },
];

// 车库：西北入口向东下行、东北出口向东上行；进出车辆在连接区均右转，互不交叉
export const RAMPS = [
  {
    id: 'RAMP-IN', type: 'street-in', name: '车库入口', width: 5, lane: rect(-60, -52, -4, -47),
    from: { x: -60, z: -49.5, y: 0, level: 'street' }, to: { x: -4, z: -49.5, y: -8.4, level: 'B1' },
  },
  {
    id: 'RAMP-OUT', type: 'street-out', name: '车库出口', width: 5, lane: rect(4, -52, 60, -47),
    from: { x: 4, z: -49.5, y: -8.4, level: 'B1' }, to: { x: 60, z: -49.5, y: 0, level: 'street' },
  },
  {
    id: 'RAMP-DN', type: 'down', name: 'B1→B2 下行坡道', width: 4.5, lane: rect(25, -39.5, 49, -35),
    from: { x: 49, z: -37.25, y: -8.4, level: 'B1' }, to: { x: 25, z: -37.25, y: -12, level: 'B2' },
  },
  {
    id: 'RAMP-UP', type: 'up', name: 'B2→B1 上行坡道', width: 4.5, lane: rect(25, -35, 49, -30.5),
    from: { x: 25, z: -32.75, y: -12, level: 'B2' }, to: { x: 49, z: -32.75, y: -8.4, level: 'B1' },
  },
];

export const SITE = {
  // 地面车道：西北坡道口、东北坡道口、北侧卸货区
  driveways: [rect(-74, -62, -58, -46), rect(58, -62, 74, -46), rect(10, -62, 24, -40)],
  // 坡道敞开段（地面开口），其余部分被北广场顶板覆盖
  trenches: [rect(-60, -52, -34, -47), rect(34, -52, 60, -47)],
  loading: rect(10, -52, 24, -40),
  roads: [
    { id: 'south', rect: rect(-260, 66, 260, 90), dir: 'x', lanes: 6, name: '云澜大道' },
    { id: 'north', rect: rect(-260, -76, 260, -64), dir: 'x', lanes: 2, name: '北辅路' },
    { id: 'west', rect: rect(-98, -260, -82, 260), dir: 'z', lanes: 4, name: '西环路' },
    { id: 'east', rect: rect(82, -260, 98, 260), dir: 'z', lanes: 4, name: '东环路' },
  ],
  sidewalk: 4,
  plaza: rect(-78, -60, 78, 62),
  southIP: { x: 20, z: 52, scale: 0.75 },
  fountain: { x: -20, z: 52, r: 6 },
  monument: { x: 46, z: 58 },
  busStop: { x: -46, z: 63.5 },
  taxi: rect(-30, 62, 30, 66),
};
