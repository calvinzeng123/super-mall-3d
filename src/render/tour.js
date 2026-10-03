// 一键导览：沿顾客动线游览 —— 南广场 → 南门 → 1F 中庭 → 乘扶梯上 2F → 3F → 天台 → 摩天轮。
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const TOUR = [
  { caption: '南广场 · 云澜汇外观', pos: V(0, 10, 112), target: V(0, 10, 40), dur: 4.5 },
  { caption: '南门 · 主入口', pos: V(0, 3.2, 54), target: V(0, 3.4, 30), dur: 4 },
  { caption: '1F 南门大堂 · 服务台', pos: V(5.5, 2.4, 38), target: V(0, 2.0, 27), dur: 3.5 },
  { caption: '1F 中庭 · 俯瞰 B1M 美食广场', pos: V(7, 3.6, 15), target: V(0, -3, 0), dur: 4 },
  { caption: '乘扶梯上 2F', pos: V(9.73, 1.8, -2.4), target: V(9.73, 6.5, 12), dur: 2.5 },
  { caption: '乘扶梯上 2F', pos: V(9.73, 7.3, 11.6), target: V(9.73, 7.2, 22), dur: 4.5 },
  { caption: '2F 中庭 · 潮流服饰', pos: V(15, 7.4, 14), target: V(-4, 6.5, -2), dur: 3.5 },
  { caption: '乘扶梯上 3F', pos: V(8.4, 7.3, 14.23), target: V(-6, 12, 14.23), dur: 2.5 },
  { caption: '乘扶梯上 3F', pos: V(-6.2, 12.8, 14.23), target: V(-16, 12.7, 14.23), dur: 4.5 },
  { caption: '3F 亲子 · 餐饮 · 影城', pos: V(-12, 13.2, 13), target: V(10, 11.5, -8), dur: 3.5 },
  { caption: '乘扶梯上天台花园', pos: V(-20.5, 12.8, -0.93), target: V(-34, 18, -0.93), dur: 2.5 },
  { caption: '乘扶梯上天台花园', pos: V(-34.8, 18.3, -0.93), target: V(-46, 18.1, -0.93), dur: 4.5 },
  { caption: '天台花园 · 云澜之眼摩天轮', pos: V(-36, 21.5, 12), target: V(42, 30, -4), dur: 4.5 },
  { caption: '天台 · IP「云宝」与餐吧', pos: V(30, 22, 30), target: V(46, 20, 16), dur: 4 },
  { caption: '天台全景', pos: V(95, 62, 78), target: V(10, 22, 0), dur: 5 },
];

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function attachTour(app, ui) {
  const { camera, controls } = app;
  let run = null;
  app.startTour = () => {
    app.reset(true);
    controls.enabled = false;
    run = { i: 0, t: 0, from: { pos: camera.position.clone(), target: controls.target.clone() } };
    app.state.touring = true;
    app.refresh();
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
          app.reset();
          return;
        }
        ui.tour(TOUR[run.i].caption);
      }
    },
  });
}
