// 一键导览（园区版，规格第 9 节）：园区全景 → 一期东南主入口 → 圆厅中庭 → 乘扶梯上 2F → 2F 天桥入口 → 经云环天桥
// → 二期西翼 2F → 星湾真冰场圆厅 → 天空跑道 → 地铁站厅 → 乘扶梯下站台 → 站台列车 → 俯瞰三期街区 → 街巷与中心广场
// → 一期方庭中庭 → 一期天台摩天轮 → 园区全景。
// 镜头位置全部由布局数据（套件 / 翼楼 / 连廊局部坐标）换算；每一步可指定要展开室内的那一期与阴影范围。
import * as THREE from 'three';
import { toW } from '../layout/geom.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function steps(layout) {
  const B = (id) => layout.buildings.find((x) => x.id === id);
  const lv = (id) => layout.levels.find((l) => l.id === id);
  const p1 = B('P1'), p2 = B('P2'), p3 = B('P3');
  const wing = (b, id) => b.wings.find((w) => w.id === id);
  const W = (b, id, u, y, v) => { const [x, z] = toW(wing(b, id).F, u, v); return V(x, y, z); };
  const K = (b, rot, x, y, z) => { const [wx, wz] = toW(b.rotundas.find((r) => r.id === rot).kitF, x, z); return V(wx, y, wz); };
  const esc = (pair, dir = 'up') => layout.escalators.find((e) => e.pair === pair && e.dir === dir);
  const ride = (e, eye = 1.8) => {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    return [
      { pos: V(e.bottom.x - ux * 1.4, e.bottom.y + eye, e.bottom.z - uz * 1.4), target: V(e.top.x, e.top.y + 1.2, e.top.z), dur: 2.5 },
      { pos: V(e.top.x + ux * 0.6, e.top.y + eye, e.top.z + uz * 0.6), target: V(e.top.x + ux * 12, e.top.y + 1.6, e.top.z + uz * 12), dur: 4.5 },
    ];
  };
  const br = layout.bridges;
  const link = (id) => br.links.find((k) => k.id === id);
  const L = (id, u, y, v = 0) => { const [x, z] = toW(link(id).frame, u, v); return V(x, y, z); };
  const ring = (deg, y, r = br.R) => V(Math.cos((deg * Math.PI) / 180) * r, y, Math.sin((deg * Math.PI) / 180) * r);
  const eye = br.y + 1.7;
  const SE = wing(p1, 'SE'), P2W = wing(p2, 'W');
  const rf1 = lv('P1-RF'), rf2 = lv('P2-RF');
  const ferris = rf1.features.find((f) => f.type === 'ferris');
  const hub = (() => { const [x, z] = toW(ferris.frame, ferris.lu, ferris.lv); return V(x, rf1.elev + 18.5, z); })();
  const court = rf2.features.find((f) => f.type === 'court');
  const C = (u, y, v) => { const [x, z] = toW(court.frame, u, v); return V(x, y, z); };
  const plaza = lv('P3-1F').features.find((f) => f.type === 'plaza');
  const k4 = ride(esc('P1-K4'));
  const sq = p1.square;
  const SQ = (u, y, v) => { const [x, z] = toW(sq.F, u, v); return V(x, y, z); };
  const mb = esc('M-MB', 'down');
  return [
    { caption: '云澜汇园区 · 三期商业 + 云环天桥 + 中央公园', pos: V(150, 300, 330), target: V(0, 0, 0), dur: 5, shadow: 380 },
    { caption: '一期东南主入口 · 正对路口', building: 'P1', pos: W(p1, 'SE', SE.uEnd + 46, 9, 0), target: W(p1, 'SE', SE.uEnd, 7, 0), dur: 4.5, shadow: 120 },
    { caption: '1F 主入口大堂', pos: W(p1, 'SE', SE.uEnd - 2, 2.4, -3), target: W(p1, 'SE', 40, 2.2, 0), dur: 4 },
    { caption: '1F 圆厅中庭 · 俯瞰 B1M 美食广场', pos: W(p1, 'SE', 31, 4.0, 5), target: K(p1, 'C', 0, -3.5, 0), dur: 4 },
    { caption: '乘扶梯上 2F', ...k4[0] },
    { caption: '乘扶梯上 2F', ...k4[1] },
    { caption: '2F 天桥入口 · 前往云环', pos: W(p1, 'SE', SE.uEnd - 16, 8.3, 2), target: W(p1, 'SE', SE.uEnd + 12, 7.6, 0), dur: 4.5 },
    { caption: '一期连廊 → 云环天桥', pos: L('L-P1', link('L-P1').u1 - 3, eye, 1.7), target: L('L-P1', 36, eye - 0.4, 0.6), dur: 4.5, shadow: 140 },
    { caption: '云环天桥 · 俯瞰路口车流', pos: ring(250, eye + 0.6), target: ring(292, eye - 1.5), dur: 4.5 },
    { caption: '云环天桥 · 四个地块一桥相连', pos: ring(282, eye + 0.6), target: L('L-P2', 50, eye - 0.5), dur: 4 },
    { caption: '二期连廊 → 星湾西门', building: 'P2', pos: L('L-P2', 42, eye, -1.7), target: L('L-P2', link('L-P2').u1 + 6, eye - 0.3, -0.4), dur: 4.5, shadow: 140 },
    { caption: '二期西翼 2F 运动潮流街', pos: W(p2, 'W', P2W.uEnd - 8, 8.6, 2), target: W(p2, 'W', 36, 8.0, 0), dur: 4.5, shadow: 140 },
    { caption: '中翼 2F → 冰场圆厅', pos: W(p2, 'M', 40, 9.6, 3), target: K(p2, 'B', 0, 4, 0), dur: 5 },
    { caption: '星湾真冰场 · 圆厅俯瞰', pos: K(p2, 'B', 19, 10.4, 13), target: K(p2, 'B', 0, 0.2, 0), dur: 4.5 },
    { caption: '二期天台 · 天空跑道与篮球场', pos: C(52, rf2.elev + 22, -42), target: C(52, rf2.elev, 0), dur: 5, shadow: 160 },
    { caption: '地铁云澜汇站 · 站厅与闸机', building: 'M', pos: V(47, -2.2, -8.5), target: V(5, -3.6, 0.5), dur: 5.5, shadow: 120 },
    { caption: '乘扶梯下站台', pos: V(mb.top.x + 3.4, mb.top.y + 2.3, mb.top.z - 0.4), target: V(mb.bottom.x, mb.bottom.y + 1.2, mb.bottom.z), dur: 3.5 },
    { caption: '乘扶梯下站台', pos: V(mb.bottom.x - 1.5, mb.bottom.y + 1.75, mb.bottom.z), target: V(-20, mb.bottom.y + 1.4, 3), dur: 4 },
    { caption: '岛式站台 · 列车进站，屏蔽门开启', pos: V(-24, -10.3, 3.6), target: V(6, -10.9, 6.5), dur: 10, train: 16 },
    { caption: '俯瞰三期 云澜里 · 开放街区', building: 'P3', pos: V(-40, 80, 20), target: V(-130, 4, 110), dur: 5.5, shadow: 170 },
    { caption: '三期街巷 · 店铺、外摆与串灯', pos: V(-58, 2.4, 44.5), target: V(-140, 3, 43), dur: 5, shadow: 90 },
    { caption: '中心广场 · 街区舞台与旱喷', pos: V(plaza.x - 10, 7, plaza.z - 8), target: V(plaza.x + 3, 2, plaza.z - 1), dur: 4.5 },
    { caption: '一期方庭 · 原四方格商场的通高中庭', building: 'P1', pos: SQ(-21, 6.5 + 1.75, 14), target: SQ(6, 10.5, -3), dur: 5.5, shadow: 120 },
    { caption: '一期天台 · 云澜之眼摩天轮', building: 'P1', pos: W(p1, 'W', 72, 21.5, 10), target: hub, dur: 5.5, shadow: 140 },
    { caption: '园区全景', pos: V(110, 430, 480), target: V(0, 0, 0), dur: 5, shadow: 380 },
  ];
}

export function attachTour(app, ui) {
  const { camera, controls } = app;
  const TOUR = steps(app.ctx.layout);
  let run = null;
  const enter = (seg) => {
    if (seg.building && app.state.building !== seg.building) {
      app.state.building = seg.building;
      app.refresh();
    }
    if (seg.shadow) app.env.setShadowFocus(seg.target.clone(), seg.shadow);
    if (seg.train !== undefined && app.ctx.metroSync) app.ctx.metroSync(seg.train);
    ui.tour(seg.caption);
  };
  app.startTour = () => {
    if (app.explore && app.explore.active) app.exitExplore();
    app.reset(true);
    controls.enabled = false;
    run = { i: 0, t: 0, from: { pos: camera.position.clone(), target: controls.target.clone() } };
    app.state.touring = true;
    app.refresh();
    enter(TOUR[0]);
    app.emit();
  };
  app.stopTour = () => {
    if (!run) return;
    run = null;
    controls.enabled = true;
    app.state.touring = false;
    app.refresh();
    ui.tour(null);
    app.emit();
  };
  controls.addEventListener('start', () => { if (run) app.stopTour(); });
  app.ctx.dynamic.push({
    update(dt) {
      if (!run) return;
      const seg = TOUR[run.i];
      run.t += dt;
      const k = ease(Math.min(1, run.t / seg.dur));
      camera.position.lerpVectors(run.from.pos, seg.pos, k);
      controls.target.lerpVectors(run.from.target, seg.target, k);
      camera.lookAt(controls.target);
      if (run.t >= seg.dur + 0.6) {
        run.from = { pos: seg.pos.clone(), target: seg.target.clone() };
        run.i += 1;
        run.t = 0;
        if (run.i >= TOUR.length) {
          app.stopTour();
          app.reset();
          return;
        }
        enter(TOUR[run.i]);
      }
    },
  });
  app.tourSteps = TOUR;
}
