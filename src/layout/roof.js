// RF 天台花园：走道、餐吧、摩天轮、IP 雕塑与各类打卡点。
import { rect } from './geom.js';
import { brandFor } from './brands.js';
import { VOID_UP } from './constants.js';

const ROOF_UNITS = {
  R1: rect(-58, 30, -46, 38),
  R2: rect(-38, 30, -26, 38),
  R3: rect(-20, 30, -8, 38),
  R4: rect(8, 30, 20, 38),
};

export const PAVILION = rect(-37, -5, -19, 5);
export const FERRIS = { x: 42, z: -4, radius: 15, clearance: 2.2, gondolas: 24 };

function trees() {
  const t = [];
  for (let z = -36; z <= 22; z += 6.5) t.push([-58, z]);
  for (let x = -16; x <= 8; x += 6) t.push([x, -39]);
  for (const [x, z] of [[-50, -26.5], [-44, -26.5], [-24, 8], [-24, -8], [24, 20], [30, 20], [54, 20], [54, -14], [24, -16], [34, -16], [-14, 23], [2, 23], [-44, 23], [-34, 22], [56, -22], [44, -20]]) t.push([x, z]);
  return t;
}

/** 填充天台（需在核心筒用房加入之后调用） */
export function fillRoof(lv) {
  const W = (id, kind, r) => lv.walk.push({ id, kind, rect: r });
  W('D1', 'deck', rect(-58, -24, -19, 24));
  W('D2', 'deck', rect(-19, -24, 40, -12));
  W('D3', 'deck', rect(-19, 12, 58, 24));
  W('D4', 'deck', rect(21, -12, 58, 12));
  W('SKn', 'deck', rect(-21, -14, 21, -10));
  W('SKs', 'deck', rect(-21, 10, 21, 14));
  W('SKw', 'deck', rect(-21, -14, -17, 14));
  W('SKe', 'deck', rect(17, -14, 21, 14));
  W('NP', 'deck', rect(-20, -40, 12, -24));
  W('NE', 'deck', rect(20, -40, 40, -24));
  W('T1', 'terrace', rect(-58, 24, -46, 30));
  W('T2', 'terrace', rect(-38, 24, -26, 30));
  W('T3', 'terrace', rect(-20, 24, -8, 30));
  W('T4', 'terrace', rect(8, 24, 20, 30));
  W('SW1', 'deck', rect(-46, 24, -38, 38));
  W('SW2', 'deck', rect(-26, 24, -20, 38));
  W('SW3', 'deck', rect(-8, 24, 8, 40));
  W('SW4', 'deck', rect(36, 24, 58, 38));
  W('SKY', 'skywalk', rect(-4, 40, 4, 46));

  for (const [slot, r] of Object.entries(ROOF_UNITS)) {
    lv.units.push({
      id: `RF-${slot}`, slot, level: 'RF', brand: brandFor('RF', slot), rects: [r],
      fronts: [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0, side: 'N' }],
      terrace: rect(r.x0, 24, r.x1, r.z0),
    });
  }

  lv.rooms.push({ id: 'MECH', type: 'mech', rects: [rect(40, -38, 58, -26)], doors: [], label: '设备区' });

  lv.features.push(
    { type: 'skylight', rect: VOID_UP.rect, radius: VOID_UP.radius, name: '中庭天窗' },
    { type: 'pavilion', rect: PAVILION, name: '扶梯玻璃亭' },
    { type: 'ferris', ...FERRIS, name: '云澜之眼摩天轮', en: 'SKY EYE' },
    { type: 'ferris-platform', rect: rect(38, -7, 46, -1), name: '摩天轮登乘台' },
    { type: 'ip', x: 48, z: 17, scale: 1, name: 'IP「云宝」', en: 'YUNBAO' },
    { type: 'mirror', rect: rect(-16, -37, 8, -28), name: '天空之镜' },
    { type: 'skywalk', rect: rect(-4, 38, 4, 46), name: '玻璃悬挑观景台' },
    { type: 'letters', x: 47, z: 35.5, text: '云澜汇', face: 'S', name: '云澜汇立体字' },
    { type: 'arch', x: -41, z: 0, axis: 'z', name: '花艺拱门' },
    { type: 'playground', rect: rect(-56, 8, -42, 20), name: '天台儿童乐园' },
    { type: 'lawn', rect: rect(-56, -22, -40, -8), name: '阳光草坪' },
    { type: 'lawn', rect: rect(-14, 15.5, 8, 22), name: '星空草坪' },
    { type: 'pergola', rect: rect(-18, -21, 10, -16), name: '花架长廊' },
    ...trees().map(([x, z]) => ({ type: 'tree', x, z })),
  );
}
