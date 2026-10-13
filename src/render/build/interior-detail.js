// 店内近景商品与设备。共用低面数轮廓和现有材质批次，不给每件商品创建 Mesh。
import * as THREE from 'three';

const SHAPES = {};
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const scale = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const faceRotation = new THREE.Quaternion();
const circleGeometry = new THREE.CircleGeometry(.5, 8).rotateX(-Math.PI / 2).toNonIndexed();
const CIRCLE = { pos: circleGeometry.attributes.position.array, nor: circleGeometry.attributes.normal.array, count: circleGeometry.attributes.position.count };
circleGeometry.dispose();
const CYLINDERS = {};
function cylinderShape(segments, openTop = false) {
  const id = `${segments}:${openTop}`;
  if (CYLINDERS[id]) return CYLINDERS[id];
  // 圆器皿底部贴在台面 / 柜板上，不复制不可见的底盖；筒灯上下端都由邻接构件遮住。
  const g = new THREE.CylinderGeometry(1, 1, 1, segments, 1, false).translate(0, .5, 0).toNonIndexed();
  const pos = [], nor = [];
  for (let i = 0; i < g.attributes.position.count; i += 3) {
    const ny = g.attributes.normal.getY(i);
    if (ny < -.99 || (openTop && ny > .99)) continue;
    for (let j = i; j < i + 3; j++) {
      pos.push(g.attributes.position.getX(j), g.attributes.position.getY(j), g.attributes.position.getZ(j));
      nor.push(g.attributes.normal.getX(j), g.attributes.normal.getY(j), g.attributes.normal.getZ(j));
    }
  }
  g.dispose();
  return CYLINDERS[id] = { pos, nor, count: pos.length / 3 };
}
const octaGeometry = new THREE.OctahedronGeometry(.5, 0);
const OCTA = { pos: octaGeometry.attributes.position.array, nor: octaGeometry.attributes.normal.array, count: octaGeometry.attributes.position.count };
octaGeometry.dispose();
const leafPositions = [0, 0, -.5, -.5, 0, 0, 0, 0, .5, 0, 0, -.5, 0, 0, .5, .5, 0, 0];
const leafBack = [];
for (let i = 0; i < leafPositions.length; i += 9) leafBack.push(...leafPositions.slice(i + 6, i + 9), ...leafPositions.slice(i + 3, i + 6), ...leafPositions.slice(i, i + 3));
const LEAF = { pos: [...leafPositions, ...leafBack], nor: [...Array.from({ length: 6 }, () => [0, 1, 0]).flat(), ...Array.from({ length: 6 }, () => [0, -1, 0]).flat()], count: 12 };
// 贴合柜体的金属腰线只保留四个外立面，顶底面被原柜体包住。
const bandGeometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const BAND = { pos: [], nor: [], count: 24 };
for (let i = 0; i < bandGeometry.attributes.position.count; i++) {
  if (Math.abs(bandGeometry.attributes.normal.getY(i)) > .5) continue;
  BAND.pos.push(bandGeometry.attributes.position.getX(i), bandGeometry.attributes.position.getY(i), bandGeometry.attributes.position.getZ(i));
  BAND.nor.push(bandGeometry.attributes.normal.getX(i), bandGeometry.attributes.normal.getY(i), bandGeometry.attributes.normal.getZ(i));
}
bandGeometry.dispose();

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
  const cylinder = (key, a, b, h, radius, tall, color, segments = 6, openTop = false) => {
    const [x, z] = F.at(a, b);
    position.set(x, y0 + h, z); rotation.identity(); scale.set(radius, tall, radius);
    matrix.compose(position, rotation, scale);
    B.get(key).push(cylinderShape(segments, openTop), matrix, color);
  };
  const face = (key, a, b, h, w, tall, color, rot = 0) => {
    const [x, z] = F.at(a, b);
    position.set(x, y0 + h, z);
    rotation.setFromAxisAngle(UP, Math.atan2(F.nx, F.nz) + rot);
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
  const flat = (key, a, b, h, w, depth, color) => {
    const [x, z] = F.at(a, b);
    position.set(x, y0 + h, z); rotation.setFromAxisAngle(UP, F.ang); scale.set(w, 1, depth);
    B.get(key).shape('planeUp', position, rotation, scale, color);
  };
  const line = (key, a, b, h, a1, b1, h1, thick, color) => {
    const [x, z] = F.at(a, b), [x1, z1] = F.at(a1, b1);
    B.get(key).bar({ x, y: y0 + h, z }, { x: x1, y: y0 + h1, z: z1 }, thick, color);
  };
  const faceLine = (key, a, b, h, a1, h1, thick, color) => {
    // 贴在绒面展托上的细金链，只需朝观众的实际可见面；背面全部被托板遮住。
    const [x, z] = F.at((a + a1) / 2, b), yaw = Math.atan2(F.nx, F.nz);
    const handedness = F.ux * Math.cos(yaw) - F.uz * Math.sin(yaw);
    position.set(x, y0 + (h + h1) / 2, z);
    rotation.setFromAxisAngle(UP, yaw).multiply(faceRotation.setFromAxisAngle(FORWARD, Math.atan2(h1 - h, (a1 - a) * handedness)));
    scale.set(Math.hypot(a1 - a, h1 - h), thick, 1);
    B.get(key).shape('plane', position, rotation, scale, color);
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
  const card = (a, b, h, color = '#eee9da', width = .20) => {
    box('metal', a, b, h + .012, width + .03, .12, .024, '#b39a6b');
    // 卡纸保留正反两面，省去 1.2cm 薄边的四个不可分辨侧面。
    face('matte', a, b + .018, h + .105, width, .18, color);
    face('matte', a, b + .032, h + .105, width, .18, color, Math.PI);
    for (let i = 0; i < 3; i++) face('satin', a, b + .017, h + .15 - i * .042, width * (i ? .67 : .83), .009, '#5e635d');
  };
  return {
    box, cylinder, line, cup, book, card, face, flat, disc,
    band(a, b, h, w, d, tall, color = '#b69c70') {
      const [x, z] = F.at(a, b);
      position.set(x, y0 + h, z); rotation.setFromAxisAngle(UP, F.ang); scale.set(w, tall, d);
      matrix.compose(position, rotation, scale);
      B.get('metal').push(BAND, matrix, color);
    },
    spotlight(a, b, h) {
      cylinder('matte', a, b, h, .085, .23, '#414c46', 6, true);
      // 下向发光面为一个平面，保留 8 边圆轮廓，取消六个隐藏面。
      const [x, z] = F.at(a, b);
      position.set(x, y0 + h - .001, z);
      rotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      scale.set(.126, 1, .126); matrix.compose(position, rotation, scale);
      B.get('glow').push(CIRCLE, matrix, '#ffdfac');
    },
    bottle(a, b, h, color = '#c09b74', tall = .23, pump = false) {
      cylinder('satin', a, b, h, .058, tall * .72, color);
      cylinder('metal', a, b, h + tall * .72, .031, tall * .2, '#ae956a', 6);
      cylinder('matte', a, b, h + tall * .92, .035, tall * .08, '#2f3834', 6);
      face('matte', a, b - .059, h + tall * .43, .063, tall * .32, '#f3eee0');
      if (pump) line('metal', a, b, h + tall, a, b - .09, h + tall, .025, '#b6b3a1');
    },
    bouquet(a, b, h, color = '#d5c7af', size = 1) {
      cylinder('satin', a, b, h, .10 * size, .22 * size, color);
      for (let i = 0; i < 5; i++) {
        const t = i * 2.4, da = Math.cos(t) * .11 * size, db = Math.sin(t) * .10 * size;
        const hh = (.42 + (i % 3) * .07) * size;
        line('foliage', a, b, h + .1 * size, a + da, b + db, h + hh, .016 * size, '#56765b');
        const [x, z] = F.at(a + da, b + db);
        position.set(x, y0 + h + hh - .08 * size, z);
        rotation.setFromEuler(new THREE.Euler(-.35, F.ang + t, .2));
        scale.set(.15 * size, 1, .26 * size); matrix.compose(position, rotation, scale);
        B.get('foliage').push(LEAF, matrix, '#648773');
        B.get('matte').sphere(x, y0 + h + hh, z, .065 * size, i % 2 ? '#e7baa6' : '#e7dfc7', .06 * size, .065 * size, 'ico0');
      }
    },
    jewelry(a, b, h, variant = 0) {
      box('matte', a, b, h + .023, .33, .30, .046, '#eee6d6');
      if (variant % 3 === 0) {
        // 开放的项链链条绕过绒面颈托，保留可读的负空间。
        box('matte', a, b + .04, h + .14, .22, .12, .22, '#435b54');
        for (let i = 0; i < 8; i++) {
          const t0 = Math.PI + i * Math.PI / 8, t1 = Math.PI + (i + 1) * Math.PI / 8;
          faceLine('metal', a + Math.cos(t0) * .115, b - .032, h + .23 + Math.sin(t0) * .14,
            a + Math.cos(t1) * .115, h + .23 + Math.sin(t1) * .14, .012, '#d8b967');
        }
        const [x, z] = F.at(a, b - .026);
        B.get('satin').sphere(x, y0 + h + .083, z, .027, '#b0c8c2', .034, .022, 'ico0');
      } else if (variant % 3 === 1) {
        box('matte', a, b, h + .07, .10, .25, .07, '#c59d75');
        cylinder('metal', a, b, h + .108, .064, .014, '#c0aa71', 12);
        disc('matte', a, b, h + .123, .052, '#263e39');
        line('metal', a, b, h + .126, a + .027, b - .02, h + .126, .008, '#eee6ca');
      } else {
        for (const da of [-.08, .08]) {
          cylinder('matte', a + da, b, h + .046, .047, .025, '#516056');
          const [x, z] = F.at(a + da, b);
          B.get('satin').sphere(x, y0 + h + .095, z, .029, da < 0 ? '#d6b15d' : '#cadce0', .025, .032, 'ico0');
        }
      }
    },
    menu(a, b, h, color = '#365c4d') {
      card(a, b, h, color, .25);
      box('matte', a, b - .075, h + .006, .29, .22, .012, '#e9dfcc');
      for (let i = 0; i < 3; i++) flat('satin', a, b - .085 + i * .04, h + .014, .21, .008, '#947c59');
    },
    toy(a, b, h, color = '#d8aa72') {
      const ball = (da, db, dh, rx, ry, rz, c = color, tiny = false) => {
        const [x, z] = F.at(a + da, b + db);
        if (tiny) {
          position.set(x, y0 + h + dh, z); rotation.identity(); scale.set(rx * 2, ry * 2, rz * 2);
          matrix.compose(position, rotation, scale); B.get('matte').push(OCTA, matrix, c);
        } else B.get('matte').sphere(x, y0 + h + dh, z, rx, c, ry, rz, 'ico0');
      };
      ball(0, 0, .12, .12, .14, .09); ball(0, 0, .30, .13, .12, .10);
      for (const s of [-1, 1]) {
        ball(s * .09, 0, .40, .052, .052, .035, color, true); ball(s * .075, -.04, .035, .07, .04, .08, color, true);
        face('matte', a + s * .047, b - .102, h + .32, .024, .026, '#263f38');
      }
      box('matte', a, b - .095, h + .22, .11, .025, .038, '#e7dcca');
    },
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
