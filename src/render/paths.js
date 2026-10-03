// 动线路径：人流（顾客）、车流（车库进出与环线）、货流（卸货区 → 货梯）。
// 每条路径为三维折线 [[x,y,z],...]，loop=true 表示闭合环线。动线箭头与行人、车辆动画共用。

const flat = (pts, y) => pts.map(([x, z]) => [x, y, z]);

export function levelPaths(layout) {
  const out = {};
  const byId = Object.fromEntries(layout.levels.map((l) => [l.id, l]));
  const P = (id) => (out[id] = out[id] || { people: [], vehicle: [], goods: [] });

  for (const id of ['1F', '2F', '3F']) {
    const y = byId[id].elev + 0.07;
    P(id).people.push({ loop: true, pts: flat([[-41, -21], [41, -21], [41, 21], [-41, 21]], y), name: '环廊主动线' });
    if (id === '1F') {
      P(id).people.push({ loop: true, pts: flat([[-19, -13], [19, -13], [19, 13], [-19, 13]], y), name: '中庭回游线' });
      for (const [a, b] of [[[0, 39], [0, 14]], [[0, -39], [0, -14]], [[-59, 0], [-20, 0]], [[59, 0], [20, 0]]]) {
        P(id).people.push({ loop: false, pts: flat([a, b], y), name: '入口 → 中庭' });
      }
      P(id).goods.push({ loop: false, pts: flat([[17, -46], [17.75, -38], [17.75, -30]], y), name: '卸货区 → 货梯' });
    } else {
      P(id).people.push({ loop: true, pts: flat([[-20, -11.6], [20, -11.6], [20, 11.6], [-20, 11.6]], y), name: '中庭回游线' });
      P(id).people.push({ loop: false, pts: flat([[-52, 0], [-21, 0]], y), name: '休息区 → 中庭' });
      P(id).people.push({ loop: false, pts: flat([[52, 0], [21, 0]], y), name: '休息区 → 中庭' });
    }
  }
  {
    const y = byId.B1M.elev + 0.07;
    P('B1M').people.push({ loop: true, pts: flat([[-20, -15.5], [20, -15.5], [20, 15.5], [-20, 15.5]], y), name: '美食广场回游线' });
    P('B1M').people.push({ loop: false, pts: flat([[-16.15, -21.5], [-16.15, -17], [-8, -16]], y), name: '停车场扶梯 → 美食广场' });
    P('B1M').people.push({ loop: false, pts: flat([[-57, 0], [-24, 0]], y), name: '云澜老街' });
    P('B1M').people.push({ loop: true, pts: flat([[-41, -21], [22, -21], [22, 21], [-41, 21]], y), name: '环廊' });
  }
  {
    const y = byId.B1.elev + 0.05;
    P('B1').vehicle.push({
      loop: false, name: '入场 → 推荐环线 → 出场',
      pts: [[-4, y, -49.5], [-1.5, y, -46], [-1.5, y, -5.25], [52, y, -5.25], [52, y, 21], [-52, y, 21], [-52, y, -21], [1.5, y, -21], [1.5, y, -46], [4, y, -49.5]],
    });
    for (const [x, z0, z1] of [[-30.5, -13, -24.5], [30.5, 13, 24.5], [-13, -16, -24.5]]) P('B1').people.push({ loop: false, pts: flat([[x, z0], [x, z1]], y + 0.02), name: '车位 → 电梯厅' });
  }
  {
    const y = byId.B2.elev + 0.05;
    P('B2').vehicle.push({
      loop: false, name: 'B2 环线',
      pts: [[25, y, -37.25], [21.5, y, -37.25], [21.5, y, -21], [-52, y, -21], [-52, y, 21], [52, y, 21], [52, y, -21], [24, y, -21], [24, y, -32.75], [25, y, -32.75]],
    });
    for (const [x, z0, z1] of [[-30.5, -13, -24.5], [30.5, 13, 24.5]]) P('B2').people.push({ loop: false, pts: flat([[x, z0], [x, z1]], y + 0.02), name: '车位 → 电梯厅' });
  }
  {
    const y = byId.RF.elev + 0.08;
    P('RF').people.push({ loop: true, pts: flat([[-19.5, -12.5], [19.5, -12.5], [19.5, 12.5], [-19.5, 12.5]], y), name: '天窗环廊' });
    P('RF').people.push({ loop: false, pts: flat([[-36, 0], [-44, 0], [-48, -6], [-48, -24]], y), name: '扶梯亭 → 草坪' });
    P('RF').people.push({ loop: false, pts: flat([[19.5, 0], [34, 0], [40, 6]], y), name: '前往摩天轮' });
    P('RF').people.push({ loop: false, pts: flat([[-19.5, 12.5], [-30, 23], [-52, 23]], y), name: '前往餐吧' });
  }
  // 扶梯：上行沿斜面向上，下行向下
  for (const e of layout.escalators) {
    const ux = Math.sign(e.top.x - e.bottom.x), uz = Math.sign(e.top.z - e.bottom.z);
    const a = [e.bottom.x - ux * 2.0, e.bottom.y + 1.35, e.bottom.z - uz * 2.0];
    const b = [e.bottom.x, e.bottom.y + 1.35, e.bottom.z];
    const c = [e.top.x, e.top.y + 1.35, e.top.z];
    const d = [e.top.x + ux * 2.0, e.top.y + 1.35, e.top.z + uz * 2.0];
    P(e.from).people.push({ loop: false, escalator: true, pts: e.dir === 'up' ? [a, b, c, d] : [d, c, b, a], name: e.dir === 'up' ? '扶梯上行' : '扶梯下行' });
  }
  return out;
}

/** 场地动线：车库进出（含坡道）、人行至四个入口、货车至卸货区 */
export function sitePaths(layout) {
  const y = -0.08;
  const rin = layout.ramps.find((r) => r.type === 'street-in');
  const rout = layout.ramps.find((r) => r.type === 'street-out');
  return {
    vehicle: [
      { loop: false, name: '北辅路 → 车库入口', pts: [[-140, y, -67], [-74, y, -67], [-66, y, -60], [-62, y, -49.5], [rin.from.x, rin.from.y + 0.05, rin.from.z], [rin.to.x, rin.to.y + 0.05, rin.to.z]] },
      { loop: false, name: '车库出口 → 北辅路', pts: [[rout.from.x, rout.from.y + 0.05, rout.from.z], [rout.to.x, rout.to.y + 0.05, rout.to.z], [62, y, -49.5], [66, y, -60], [74, y, -67], [140, y, -67]] },
    ],
    people: [
      { loop: false, name: '南广场 → 主入口', pts: [[0, y, 64], [0, y, 41]] },
      { loop: false, name: '西环路 → 西门', pts: [[-80, y, 0], [-61, y, 0]] },
      { loop: false, name: '东环路 → 东门', pts: [[80, y, 0], [61, y, 0]] },
      { loop: false, name: '北辅路 → 北门', pts: [[0, y, -62], [0, y, -41]] },
      { loop: false, name: '公交站 → 南门', pts: [[-46, y, 63], [-20, y, 58], [-6, y, 44]] },
    ],
    goods: [{ loop: false, name: '货车 → 卸货区', pts: [[60, y, -70], [24, y, -68], [17, y, -60], [17, y, -50]] }],
  };
}

/** 折线长度与按距离取点 */
export function polyline(pts, loop) {
  const segs = [];
  let total = 0;
  const n = loop ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return {
    total,
    segs,
    at(d, out = [0, 0, 0], dir = [0, 0, 1]) {
      let s = loop ? ((d % total) + total) % total : Math.max(0, Math.min(total, d));
      let seg = segs[segs.length - 1];
      for (const g of segs) { if (s <= g.start + g.len) { seg = g; break; } }
      const t = seg.len ? (s - seg.start) / seg.len : 0;
      out[0] = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
      out[1] = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
      out[2] = seg.a[2] + (seg.b[2] - seg.a[2]) * t;
      const l = seg.len || 1;
      dir[0] = (seg.b[0] - seg.a[0]) / l; dir[1] = (seg.b[1] - seg.a[1]) / l; dir[2] = (seg.b[2] - seg.a[2]) / l;
      return out;
    },
  };
}
