// 一键导览（一期版）：园区 → 东南主入口 → 圆厅中庭 → 乘扶梯上 2F → 3F → 西翼扶梯上天台 → 摩天轮 → 一期全景。
// 镜头位置由布局数据（套件 / 翼楼局部坐标）换算，不依赖写死的世界坐标。
import * as THREE from 'three';
import { toW } from '../layout/geom.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function steps(layout) {
  const b = layout.buildings.find((x) => x.id === 'P1');
  const lv = (s) => layout.levels.find((l) => l.building === 'P1' && l.short === s);
  const kit = b.rotundas[0].kitF;
  const wing = (id) => b.wings.find((w) => w.id === id);
  const K = (x, y, z) => { const [wx, wz] = toW(kit, x, z); return new THREE.Vector3(wx, y, wz); };
  const Wg = (id, u, y, v) => { const [wx, wz] = toW(wing(id).F, u, v); return new THREE.Vector3(wx, y, wz); };
  const esc = (pair, dir = 'up') => layout.escalators.find((e) => e.pair === `P1-${pair}` && e.dir === dir);
  const ride = (e, eye = 1.8) => {
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    return [
      { pos: new THREE.Vector3(e.bottom.x - ux * 1.4, e.bottom.y + eye, e.bottom.z - uz * 1.4), target: new THREE.Vector3(e.top.x, e.top.y + 1.2, e.top.z), dur: 2.5 },
      { pos: new THREE.Vector3(e.top.x + ux * 0.6, e.top.y + eye, e.top.z + uz * 0.6), target: new THREE.Vector3(e.top.x + ux * 12, e.top.y + 1.6, e.top.z + uz * 12), dur: 4.5 },
    ];
  };
  const SE = wing('SE');
  const ferris = lv('RF').features.find((f) => f.type === 'ferris');
  const hub = (() => { const [x, z] = toW(ferris.frame, ferris.lu, ferris.lv); return new THREE.Vector3(x, lv('RF').elev + 18.5, z); })();
  const k4 = ride(esc('K4'));
  const k6 = ride(esc('K6'));
  const p7 = ride(esc('P7'));
  return [
    { caption: '云澜汇园区 · 一期 Y 形三翼', pos: new THREE.Vector3(60, 120, 120), target: new THREE.Vector3(-100, 8, -100), dur: 5 },
    { caption: '东南主入口 · 正对路口', pos: Wg('SE', SE.uEnd + 46, 9, 0), target: Wg('SE', SE.uEnd, 7, 0), dur: 4.5 },
    { caption: '1F 主入口大堂', pos: Wg('SE', SE.uEnd - 2, 2.4, -3), target: Wg('SE', 40, 2.2, 0), dur: 4 },
    { caption: '1F 圆厅中庭 · 俯瞰 B1M 美食广场', pos: Wg('SE', 31, 4.0, 5), target: K(0, -3.5, 0), dur: 4 },
    { caption: '乘扶梯上 2F', ...k4[0] },
    { caption: '乘扶梯上 2F', ...k4[1] },
    { caption: '2F 圆厅 · 潮流服饰', pos: K(18, 8.0, 16), target: K(-6, 6.5, -4), dur: 3.5 },
    { caption: '乘扶梯上 3F', ...k6[0] },
    { caption: '乘扶梯上 3F', ...k6[1] },
    { caption: '3F 亲子 · 餐饮 · 影城', pos: Wg('W', 34, 13.8, 4), target: Wg('W', 70, 12.5, 0), dur: 4 },
    { caption: '西翼扶梯 · 上天台花园', ...p7[0] },
    { caption: '西翼扶梯 · 上天台花园', ...p7[1] },
    { caption: '天台花园 · 云澜之眼摩天轮', pos: Wg('W', 72, 21.5, 10), target: hub, dur: 4.5 },
    { caption: '东南翼天台 · 餐吧与立体字', pos: Wg('SE', 52, 22.5, -4), target: Wg('SE', 78, 19.5, 0), dur: 4 },
    { caption: '一期全景', pos: Wg('SE', SE.uEnd + 120, 85, 60), target: new THREE.Vector3(b.center[0], 10, b.center[1]), dur: 5 },
  ];
}

export function attachTour(app, ui) {
  const { camera, controls } = app;
  const TOUR = steps(app.ctx.layout);
  let run = null;
  app.startTour = () => {
    app.reset(true);
    app.state.building = 'P1';
    controls.enabled = false;
    run = { i: 0, t: 0, from: { pos: camera.position.clone(), target: controls.target.clone() } };
    app.state.touring = true;
    app.refresh();
    app.env.setShadowFocus(new THREE.Vector3(-110, 0, -110), 160);
    ui.tour(TOUR[0].caption);
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
          app.setBuilding('P1');
          return;
        }
        ui.tour(TOUR[run.i].caption);
      }
    },
  });
}
