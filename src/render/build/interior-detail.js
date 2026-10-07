// 店内近景商品与设备。共用低面数轮廓和现有材质批次，不给每件商品创建 Mesh。
import * as THREE from 'three';

const SHAPES = {};
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const circleGeometry = new THREE.CircleGeometry(.5, 8).rotateX(-Math.PI / 2).toNonIndexed();
const CIRCLE = { pos: circleGeometry.attributes.position.array, nor: circleGeometry.attributes.normal.array, count: circleGeometry.attributes.position.count };
circleGeometry.dispose();

function profile(name) {
  if (SHAPES[name]) return SHAPES[name];
  const points = {
    shirt: [[-.22, .5], [-.1, .43], [.1, .43], [.22, .5], [.5, .24], [.38, .08], [.25, .18], [.24, -.5], [-.24, -.5], [-.25, .18], [-.38, .08], [-.5, .24]],
    shoe: [[-.5, -.5], [.47, -.5], [.5, -.12], [.35, .02], [.05, .12], [-.08, .5], [-.38, .46], [-.46, .14]],
    bag: [[-.5, -.5], [.5, -.5], [.42, .5], [-.42, .5]],
  }[name];
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1 }).translate(0, 0, -.5);
  SHAPES[name] = { pos: g.attributes.position.array, nor: g.attributes.normal.array, count: g.attributes.position.count };
  g.dispose();
  return SHAPES[name];
}

/** 坐标仍是店面的 a / 店内的 b，h 是相对本层地面的高度。 */
export function interiorDetail(B, F, P, y0) {
  const box = (key, a, b, h, w, d, tall, color, rot = 0) => P(key, a, b, y0 + h, w, d, tall, color, rot);
  const cylinder = (key, a, b, h, radius, tall, color, segments = 8) => {
    const [x, z] = F.at(a, b);
    B.get(key).cyl(x, y0 + h, z, radius, tall, color, segments);
  };
  const face = (key, a, b, h, w, tall, color) => {
    const [x, z] = F.at(a, b);
    position.set(x, y0 + h, z);
    rotation.setFromAxisAngle(UP, Math.atan2(F.nx, F.nz));
    scale.set(w, tall, 1);
    B.get(key).shape('plane', position, rotation, scale, color);
  };
  const disc = (key, a, b, h, radius, color) => {
    // 液面只有可见上表面；不为毫米级厚度重复生成侧面和隐藏底面。
    const [x, z] = F.at(a, b);
    position.set(x, y0 + h, z);
    rotation.identity();
    scale.set(radius * 2, 1, radius * 2);
    matrix.compose(position, rotation, scale);
    B.get(key).push(CIRCLE, matrix, color);
  };
  const line = (key, a, b, h, a1, b1, h1, thick, color) => {
    const [x, z] = F.at(a, b), [x1, z1] = F.at(a1, b1);
    B.get(key).bar({ x, y: y0 + h, z }, { x: x1, y: y0 + h1, z: z1 }, thick, color);
  };
  const solid = (name, key, a, b, h, w, d, tall, color, rot = 0) => {
    const [x, z] = F.at(a, b);
    position.set(x, y0 + h, z);
    rotation.setFromAxisAngle(UP, F.ang + rot);
    scale.set(w, tall, d);
    matrix.compose(position, rotation, scale);
    B.get(key).push(profile(name), matrix, color);
  };
  const cup = (a, b, h, color = '#f5eee0', handle = true) => {
    cylinder('satin', a, b, h, .075, .14, color, 6);
    disc('matte', a, b, h + .141, .061, '#654632');
    if (handle) {
      line('satin', a + .07, b, h + .115, a + .12, b, h + .115, .025, color);
      line('satin', a + .12, b, h + .115, a + .12, b, h + .035, .025, color);
      line('satin', a + .12, b, h + .035, a + .07, b, h + .035, .025, color);
    }
  };
  const book = (a, b, h, color, w = .12, tall = .3) => {
    box('matte', a, b, h + tall / 2, w, .26, tall, color);
    face('satin', a, b - .134, h + tall * .73, w * .68, .024, '#efe4c8');
  };
  return {
    box, cylinder, line, cup, book,
    shirt(a, b, h, color, rot = 0, size = 1) {
      solid('shirt', 'matte', a, b, h - .39 * size, .58 * size, .085, .74 * size, color, rot);
      // 衣服肩部承接细金属挂钩，轮廓与挂杆之间保留负空间。
      line('metal', a, b, h - .015, a, b, h + .09, .018, '#b9ad92');
    },
    shoe(a, b, h, color, rot = 0) {
      solid('shoe', 'matte', a, b, h + .115, .36, .145, .2, color, rot);
      box('satin', a, b, h + .022, .38, .155, .043, '#e9e4d9', rot);
    },
    bag(a, b, h, color) {
      solid('bag', 'matte', a, b, h + .2, .42, .18, .38, color);
      line('metal', a - .105, b, h + .38, a - .075, b, h + .53, .025, '#9b7847');
      line('metal', a - .075, b, h + .53, a + .075, b, h + .53, .025, '#9b7847');
      line('metal', a + .075, b, h + .53, a + .105, b, h + .38, .025, '#9b7847');
      face('metal', a, b - .097, h + .26, .055, .055, '#c5a669');
    },
    espresso(a, b, h) {
      // 冲煮头悬空在接水盘之上；机器、磨豆机、杯架都是实际器物轮廓。
      box('metal', a, b, h + .35, 1.05, .46, .26, '#c3c8c7');
      box('matte', a, b + .18, h + .22, 1.04, .15, .43, '#313936');
      box('metal', a, b - .06, h + .045, 1.07, .52, .065, '#aeb6b5');
      for (const da of [-.27, .25]) {
        cylinder('metal', a + da, b - .17, h + .17, .065, .075, '#444c4a');
        line('matte', a + da, b - .18, h + .19, a + da, b - .35, h + .19, .045, '#242b29');
        cup(a + da, b - .14, h + .08, '#f1eee5', false);
        box('glow', a + da, b - .24, h + .39, .10, .008, .035, '#cfe6d4');
      }
      line('metal', a + .47, b - .17, h + .24, a + .55, b - .24, h + .10, .025, '#bec6c5');
      cup(a - .25, b, h + .48, '#eee6d4', false);
      cup(a + .05, b, h + .48, '#eee6d4', false);
      box('matte', a - .86, b, h + .17, .24, .28, .34, '#27322e');
      cylinder('glass', a - .86, b, h + .34, .115, .27, '#b4a384');
      cylinder('matte', a - .86, b, h + .34, .092, .19, '#604a33');
      cylinder('matte', a - .86, b, h + .61, .12, .025, '#28312e');
    },
    teaStation(a, b, h) {
      for (let k = 0; k < 3; k++) {
        const x = a + (k - 1) * .42;
        cylinder('metal', x, b, h, .17, .035, '#647871');
        cylinder('glass', x, b, h + .035, .16, .48, '#ddbc79');
        cylinder('satin', x, b, h + .035, .14, .30 + k * .03, ['#af7041', '#d6a449', '#809866'][k]);
        cylinder('metal', x, b, h + .515, .17, .035, '#647871');
        line('metal', x, b - .14, h + .14, x, b - .25, h + .14, .038, '#aebbb5');
        box('matte', x, b - .24, h + .18, .025, .025, .09, '#293a33');
      }
      for (let k = 0; k < 3; k++) cup(a + .87, b + (k - 1) * .17, h, '#e5d8ba', false);
    },
    pastryCase(a, b, h) {
      box('wood', a, b, h + .055, .85, .57, .11, '#e0c6a4');
      box('glass', a, b, h + .3, .82, .54, .42, '#ffffff');
      box('metal', a, b, h + .52, .85, .57, .025, '#c4beb0');
      for (let i = 0; i < 4; i++) {
        const [x, z] = F.at(a + (i % 2 ? .2 : -.2), b + (i < 2 ? -.13 : .13));
        B.get('matte').sphere(x, y0 + h + .16, z, .12, i % 2 ? '#bd8544' : '#e4ad63', .075, .07, 'ico0');
      }
    },
    tableware(a, b, h, color = '#e6dfd0') {
      cylinder('satin', a - .23, b, h, .145, .018, color);
      cup(a + .2, b + .05, h, '#e6e0d3', false);
      box('matte', a + .02, b, h + .005, .08, .24, .008, '#eae5dc');
      line('metal', a - .035, b - .10, h + .015, a - .035, b + .10, h + .015, .015, '#aeb4af');
    },
    pendant(a, b, h, ceiling, color = '#364f45') {
      cylinder('metal', a, b, h + .12, .018, Math.max(.05, ceiling - h - .12), '#494e46', 6);
      const [x, z] = F.at(a, b);
      B.get('matte').cone(x, y0 + h, z, .28, .24, color, 8);
      cylinder('glow', a, b, h - .008, .22, .014, '#ffe4b4');
    },
    laptop(a, b, h, color = '#748d93') {
      box('metal', a, b, h + .018, .42, .3, .035, '#a4aaa6');
      box('matte', a, b - .005, h + .039, .32, .12, .005, '#46524f');
      box('metal', a, b + .125, h + .19, .42, .04, .33, '#a4aaa6');
      box('glow', a, b + .101, h + .20, .37, .008, .265, color);
      box('glowSoft', a -.08, b + .095, h + .23, .14, .006, .11, '#c0d4c5');
    },
    phone(a, b, h, color = '#7d8fa9') {
      box('matte', a, b, h + .09, .14, .05, .21, '#293332');
      box('glow', a, b - .03, h + .10, .117, .008, .172, color);
      box('satin', a, b + .05, h + .016, .11, .15, .027, '#c7cac2');
    },
  };
}
