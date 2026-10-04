// 隔墙：按局部坐标系分组，在 frame 内由铺位与用房轮廓求线段 → 去重 → 扣除门面与门洞 → 生成墙体
//（顶部深色封口，剖切时像建筑平面图）。外轮廓上的墙段由外立面负责，这里跳过；
// 三期街区的楼栋外墙、外挂楼梯与屋顶酒吧亭由 street.js 绘制，这里只画楼栋内部分隔与地库用房。
import { unionOutline, mergeSegments, subtractOpenings, toW, distToPolyEdge } from '../../layout/geom.js';
import { themeOf } from '../theme.js';
import { clearHeight } from './shell.js';

const SKIP_ROOMS = new Set(['core', 'equip', 'mech', 'ramp']);

export function buildWalls(ctx) {
  for (const lv of ctx.layout.levels) {
    if (lv.kind === 'roof') continue;
    const B = ctx.levels[lv.id].batch;
    const street = ctx.bById[lv.building].kind === 'street' && lv.kind !== 'parking';
    const feet = street ? ctx.bById[lv.building].blocks.map((k) => k.foot) : [];
    const groups = new Map();
    const group = (F) => {
      if (!groups.has(F.id)) groups.set(F.id, { F, segs: [], openings: [] });
      return groups.get(F.id);
    };
    for (const u of lv.units) {
      if (u.style === 'pavilion') continue;
      const g = group(u.frame);
      g.segs.push(...unionOutline(u.rects));
      g.openings.push(...u.fronts);
    }
    for (const r of lv.rooms) {
      if (SKIP_ROOMS.has(r.type) || (street && r.type === 'stair')) continue;
      const g = group(r.frame);
      g.segs.push(...unionOutline(r.rects));
      g.openings.push(...r.doors);
    }
    const h = clearHeight(lv);
    const color = themeOf(lv).wall;
    const cap = lv.kind === 'parking' ? '#6b7178' : '#5d5650';
    const t = 0.2;
    for (const { F, segs, openings } of groups.values()) {
      const walls = subtractOpenings(mergeSegments(segs), openings);
      B.frame(F, () => {
        for (const w of walls) {
          const mid = toW(F, (w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
          if (distToPolyEdge(mid, lv.outline) < 0.05 || feet.some((f) => distToPolyEdge(mid, f) < 0.05)) continue;
          const horiz = Math.abs(w.z0 - w.z1) < 1e-6;
          const len = horiz ? Math.abs(w.x1 - w.x0) : Math.abs(w.z1 - w.z0);
          const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
          const sx = horiz ? len + t : t, sz = horiz ? t : len + t;
          B.get('matte').box(cx, lv.elev + h / 2, cz, sx, h, sz, color);
          B.get('matte').box(cx, lv.elev + h + 0.015, cz, sx + 0.01, 0.03, sz + 0.01, cap);
        }
      });
    }
  }
}
