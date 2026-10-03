// 隔墙：由铺位与用房轮廓求线段 → 全层去重 → 扣除门面与门洞 → 生成墙体（顶部深色封口，剖切时像建筑平面图）。
import { unionOutline, mergeSegments, subtractOpenings } from '../../layout/geom.js';
import { THEME } from '../theme.js';
import { clearHeight } from './shell.js';

const SKIP_ROOMS = new Set(['core', 'freight', 'equip', 'mech', 'ramp']);
const onPerimeter = (s) => (Math.abs(s.x0 - s.x1) < 1e-6 && Math.abs(Math.abs(s.x0) - 60) < 0.01) || (Math.abs(s.z0 - s.z1) < 1e-6 && Math.abs(Math.abs(s.z0) - 40) < 0.01);

export function buildWalls(ctx) {
  for (const lv of ctx.layout.levels) {
    if (lv.kind === 'roof') continue;
    const B = ctx.levels[lv.id].batch;
    const segs = [];
    const openings = [];
    for (const u of lv.units) {
      segs.push(...unionOutline(u.rects));
      openings.push(...u.fronts);
    }
    for (const r of lv.rooms) {
      if (SKIP_ROOMS.has(r.type)) continue;
      segs.push(...unionOutline(r.rects));
      openings.push(...r.doors);
    }
    const walls = subtractOpenings(mergeSegments(segs), openings);
    const h = clearHeight(lv);
    const color = THEME[lv.id].wall;
    const cap = lv.kind === 'parking' ? '#6b7178' : '#5d5650';
    const t = 0.2;
    for (const w of walls) {
      if (onPerimeter(w)) continue;
      const horiz = Math.abs(w.z0 - w.z1) < 1e-6;
      const len = horiz ? Math.abs(w.x1 - w.x0) : Math.abs(w.z1 - w.z0);
      const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      const sx = horiz ? len + t : t, sz = horiz ? t : len + t;
      B.get('matte').box(cx, lv.elev + h / 2, cz, sx, h, sz, color);
      B.get('matte').box(cx, lv.elev + h + 0.015, cz, sx + 0.01, 0.03, sz + 0.01, cap);
    }
  }
}
