// 枪那一层的专用打光。
// 枪是世界画完以后单独画的一层（run.js 的 drawView）。原来它只吃世界里的太阳、半球光和环境反射：
// 停电以后这三样都压得很低，枪身上只剩一点糊糊的环境反射——贴图再细也看不出来，金属的高光没有来处。
// 这里给枪加一组只照枪那一层的灯（挂在镜头上，跟着镜头走，不照世界）：
//   主光 key：左前上方，暖白——把枪身朝上、朝左的面打亮，贴图的磨损、法线的起伏靠它显出来；
//   轮廓光 rim：右后方，冷色——在枪管、机匣的边上勾一道亮边，暗场里枪才从背景里分出来；
//   补光 fill：正下方很弱的一点，防止朝下的面死黑。
// 亮度跟着场景走：白天弱（世界本来就亮），停电时反而要靠它（当成手电打在近处反弹回来的光）。
// 灯只开 layer 这一层：three 按相机的层过滤灯，所以画世界的时候它们不参与，不会多出一盏照亮商场的灯。
import * as THREE from 'three';

/** dir：灯在镜头坐标里的方向（从枪看向灯）；day / dark：白天、停电时的强度；color：颜色 */
export const VIEW_LIGHT = Object.freeze({
  key: Object.freeze({ dir: Object.freeze([-0.55, 0.8, 0.5]), color: 0xfff0dc, day: 0.5, dark: 1.15 }),
  rim: Object.freeze({ dir: Object.freeze([0.85, 0.3, -0.55]), color: 0xa9c8ff, day: 0.3, dark: 0.7 }),
  fill: Object.freeze({ dir: Object.freeze([0.1, -1, 0.3]), color: 0xffe2c0, day: 0.08, dark: 0.16 }),
});

/** 第 dark（0 = 白天，1 = 停电）档下某盏灯的强度。纯函数 */
export const viewLightLevel = (spec, dark) => spec.day + (spec.dark - spec.day) * Math.max(0, Math.min(1, dark));

/**
 * camera：镜头（灯挂在它下面）；layer：枪那一层。
 * 返回 { lights, update(dark)（每帧调：dark = 停电的程度 0–1）, scale（读写：整体倍数，画质 / 调试用）, dispose() }。
 */
export function createViewLight({ camera, layer = 0, V = VIEW_LIGHT } = {}) {
  const lights = {};
  for (const [name, spec] of Object.entries(V)) {
    const l = new THREE.DirectionalLight(spec.color, spec.day); l.name = `view-${name}`; l.castShadow = false;
    l.position.set(...spec.dir).normalize(); l.target.position.set(0, 0, 0);
    if (layer) { l.layers.set(layer); l.target.layers.set(layer); }
    camera.add(l); camera.add(l.target);
    lights[name] = l;
  }
  let scale = 1;
  return {
    lights,
    get scale() { return scale; }, set scale(v) { scale = Math.max(0, +v || 0); },
    update(dark = 0) { for (const [name, spec] of Object.entries(V)) lights[name].intensity = viewLightLevel(spec, dark) * scale; },
    dispose() { for (const l of Object.values(lights)) { l.removeFromParent(); l.target.removeFromParent(); l.dispose(); } },
  };
}
