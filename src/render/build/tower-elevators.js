// 可乘坐的电梯轿厢。商场 / 观光 / 外挂玻璃梯每台一个组（看得见轿厢在井道里走）；塔楼封闭井道里的轿厢
// （北苑、西苑以及之后的超高层核心筒，SPEC §2.2）按塔楼、按轿厢尺寸实例化：每种材质一个 InstancedMesh、门扇一个，
// 只有该塔被选中、进入或正在乘坐时可见（app.js towerVisibility 设 car.group.visible，这里每帧同步到实例矩阵）。
// 轿厢尺寸取自记录：e.car = { w, d }（北苑 K4 的 1.1 × 2.1 m 担架梯，居中放在 1.9 m 井道里），缺省按井道内净尺寸。
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { canvasTexture, FONT_CN } from '../textures.js';

/** Closed tower shafts draw their cars instanced (tower lifts that are neither glass nor exterior). */
export const closedTowerShaft = (ctx, e) => ctx.bById?.[e.building]?.kind === 'tower' && e.type !== 'glass' && !e.exterior;

/** Cabin half-sizes in the car frame (x across the door, z front-back): from e.car when given, else the shaft less 0.13 m. */
export function cabinSize(e) {
  const sideways = e.door === 'W' || e.door === 'E';
  const sw = sideways ? e.d : e.w, sd = sideways ? e.w : e.d;
  return { hw: (e.car?.w ?? sw - .26) / 2, hd: (e.car?.d ?? sd - .26) / 2 };
}

function cabin(B, hw, hd) {
  B.get('stone').box(0, 0.07, 0, hw * 2, 0.14, hd * 2, '#eee7db');
  B.get('metal').box(0, 2.7, 0, hw * 2, 0.12, hd * 2, '#8f989e');
  B.get('glow').box(0, 2.625, 0, hw * 1.5, 0.018, hd * 1.5, '#fff0d3');
  B.get('glass').box(0, 1.4, -hd, hw * 2, 2.6, 0.035, '#ffffff');
  for (const x of [-hw, hw]) {
    B.get('glass').box(x, 1.4, 0, 0.035, 2.6, hd * 2, '#ffffff');
    B.get('metal').box(x, 1.05, 0, 0.06, 0.06, hd * 1.7, '#b9aaa0');
    for (const z of [-hd, hd]) B.get('metal').box(x, 1.4, z, 0.055, 2.65, 0.055, '#b3bcc3');
  }
  B.get('metal').box(0, 1.05, -hd + 0.06, hw * 1.7, 0.06, 0.06, '#b9aaa0');
  B.get('metal').box(hw - 0.05, 1.25, hd * 0.55, 0.07, 0.65, 0.28, '#303d49');
}

/** The floor display in the car: a canvas screen drawn on change. */
function screenOf(group, hd) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const texture = canvasTexture(c, { clamp: true });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.32), new THREE.MeshBasicMaterial({ map: texture }));
  screen.position.set(0, 2.37, -hd + 0.045); group.add(screen);
  let last = '';
  return { screen, show(floor) {
    if (last === floor) return;
    last = floor;
    const g = c.getContext('2d');
    g.fillStyle = '#122331'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#b7eaff'; g.font = `600 42px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(floor, 128, 50, 240); texture.needsUpdate = true;
  } };
}

export function buildTowerElevators(ctx) {
  ctx.elevatorCars = new Map();
  const sets = new Map();
  for (const e of ctx.layout.elevators.filter(e => e.rideable || ctx.bById[e.building]?.kind === 'tower' || e.type === 'glass')) {
    const initial = e.serves.find(id => ctx.lvById[id].short === '1F') || e.serves[0];
    if (closedTowerShaft(ctx, e)) {
      const { hw, hd } = cabinSize(e), key = `${e.building}|${hw.toFixed(3)}|${hd.toFixed(3)}`;
      (sets.get(key) || sets.set(key, { building: e.building, hw, hd, lifts: [] }).get(key)).lifts.push(e);
      continue;
    }
    const group = new THREE.Group();
    group.name = `玻璃轿厢 ${e.id}`;
    group.position.set(e.x, 0, e.z);
    group.rotation.y = Math.atan2(e.nx, e.nz);
    const { hw, hd } = cabinSize(e), B = new BatchSet(ctx.mats.base);
    cabin(B, hw, hd);
    B.flush(group);
    const doors = [-1, 1].map(sign => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.92, 2.55, 0.045), ctx.mats.base.glass);
      mesh.position.set(sign * hw * 0.48, 1.4, hd);
      group.add(mesh);
      return { mesh, sign };
    });
    const screen = screenOf(group, hd);
    const car = {
      group, elevator: e, open: 1,
      set(y, open = 1, floor = '1F') {
        group.position.y = y;
        car.open = open;
        for (const { mesh, sign } of doors) mesh.position.x = sign * hw * (0.48 + 0.48 * open);
        screen.show(floor);
      },
    };
    car.set(ctx.lvById[initial].elev, 1, ctx.lvById[initial].short);
    ctx.buildings[e.building].group.add(group);
    ctx.elevatorCars.set(e.id, car);
    if (ctx.bById[e.building]?.kind !== 'tower') ctx.dynamic.push({ update(dt,time,app) {
      const focus = ctx.lvById[app.state.focus];
      group.visible = !focus || focus.building !== e.building || !!app.state.explore || group.position.y <= focus.elev + .1;
    } });
  }
  for (const s of sets.values()) instancedCars(ctx, s);
}

/**
 * The cars of one tower (one cabin size): one InstancedMesh per cabin material plus one for the door leaves (2 per
 * car). Each car keeps the car API (group = a transform holder, set(y, open, floor), open, elevator); its instances
 * follow group.position / visible every frame, a hidden car's instances collapse to zero scale. The floor screen
 * is a small mesh per car, shown only in the car being ridden.
 */
function instancedCars(ctx, { building, hw, hd, lifts }) {
  const root = ctx.buildings[building].group, B = new BatchSet(ctx.mats.base), template = new THREE.Group();
  cabin(B, hw, hd);
  B.flush(template);
  const n = lifts.length, ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const bodies = template.children.map((m) => {
    const im = new THREE.InstancedMesh(m.geometry, m.material, n);
    im.name = `${building}-cars-${m.name}`; im.castShadow = false; im.receiveShadow = true; im.renderOrder = m.renderOrder;
    im.frustumCulled = false; im.userData.towerCars = true; im.matrixAutoUpdate = false;
    root.add(im); return im;
  });
  const leaves = new THREE.InstancedMesh(new THREE.BoxGeometry(hw * 0.92, 2.55, 0.045), ctx.mats.base.glass, n * 2);
  leaves.name = `${building}-car-doors`; leaves.castShadow = false; leaves.frustumCulled = false; leaves.userData.towerCars = true; leaves.matrixAutoUpdate = false;
  root.add(leaves);
  const all = [...bodies, leaves], m = new THREE.Matrix4(), d = new THREE.Matrix4();
  const cars = lifts.map((e, i) => {
    const group = new THREE.Group();
    group.name = `轿厢 ${e.id}`; group.position.set(e.x, 0, e.z); group.rotation.y = Math.atan2(e.nx, e.nz);
    root.add(group);
    const screen = screenOf(group, hd);
    screen.screen.visible = false;
    const car = { group, elevator: e, open: 1, index: i, set(y, open = 1, floor = '1F') { group.position.y = y; car.open = open; screen.show(floor); car.dirty = true; } };
    car.screen = screen.screen;
    const initial = e.serves.find(id => ctx.lvById[id].short === '1F') || e.serves[0];
    car.set(ctx.lvById[initial].elev, 1, ctx.lvById[initial].short);
    ctx.elevatorCars.set(e.id, car);
    return car;
  });
  const place = (car) => {
    const shown = car.group.visible !== false;
    car.group.updateMatrix();
    for (const im of bodies) im.setMatrixAt(car.index, shown ? car.group.matrix : ZERO);
    for (const [k, sign] of [[0, -1], [1, 1]]) {
      d.makeTranslation(sign * hw * (0.48 + 0.48 * car.open), 1.4, hd);
      leaves.setMatrixAt(2 * car.index + k, shown ? m.multiplyMatrices(car.group.matrix, d) : ZERO);
    }
    car.placed = shown; car.dirty = false; car.at = car.group.position.y;
  };
  const sync = (app) => {
    let changed = false, any = false;
    const riding = app?.explore?.active ? app.explore.state?.riding : null;
    for (const car of cars) {
      const shown = car.group.visible !== false;
      any ||= shown;
      if (car.dirty || car.placed !== shown || car.at !== car.group.position.y) { place(car); changed = true; }
      car.screen.visible = shown && riding === car.elevator.id;
    }
    if (changed) for (const im of all) im.instanceMatrix.needsUpdate = true;
    for (const im of all) im.visible = any;
  };
  for (const car of cars) place(car);
  sync(null);
  ctx.dynamic.push({ name: `${building}-cars-${hw.toFixed(2)}x${hd.toFixed(2)}`, update: (dt, time, app) => sync(app) });
}
