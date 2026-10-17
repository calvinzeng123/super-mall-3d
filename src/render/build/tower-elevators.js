import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { canvasTexture, FONT_CN } from '../textures.js';

export function buildTowerElevators(ctx) {
  ctx.elevatorCars = new Map();
  for (const e of ctx.layout.elevators.filter(e => ctx.bById[e.building]?.kind === 'tower' || e.type === 'glass')) {
    const group = new THREE.Group();
    group.name = `玻璃轿厢 ${e.id}`;
    group.position.set(e.x, 0, e.z);
    group.rotation.y = Math.atan2(e.nx, e.nz);
    const B = new BatchSet(ctx.mats.base);
    const hw = e.w / 2 - 0.13, hd = e.d / 2 - 0.13;
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
    B.flush(group);
    const doors = [-1, 1].map(sign => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.92, 2.55, 0.045), ctx.mats.base.glass);
      mesh.position.set(sign * hw * 0.48, 1.4, hd);
      group.add(mesh);
      return { mesh, sign };
    });
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const texture = canvasTexture(c, { clamp: true });
    const signMat = new THREE.MeshBasicMaterial({ map: texture });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.32), signMat);
    screen.position.set(0, 2.37, -hd + 0.045); group.add(screen);
    let last = '';
    const car = {
      group, elevator: e, open: 1,
      set(y, open = 1, floor = '1F') {
        group.position.y = y;
        car.open = open;
        for (const { mesh, sign } of doors) mesh.position.x = sign * hw * (0.48 + 0.48 * open);
        if (last !== floor) {
          last = floor;
          const g = c.getContext('2d');
          g.fillStyle = '#122331'; g.fillRect(0, 0, 256, 96);
          g.fillStyle = '#b7eaff'; g.font = `600 42px ${FONT_CN}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(floor, 128, 50, 240); texture.needsUpdate = true;
        }
      },
    };
    const initial = e.serves.find(id => ctx.lvById[id].short === '1F') || e.serves[0];
    car.set(ctx.lvById[initial].elev, 1, ctx.lvById[initial].short);
    ctx.buildings[e.building].group.add(group);
    ctx.elevatorCars.set(e.id, car);
    if (ctx.bById[e.building]?.kind !== 'tower') ctx.dynamic.push({ update(dt,time,app) {
      const focus = ctx.lvById[app.state.focus];
      group.visible = !focus || focus.building !== e.building || !!app.state.explore || group.position.y <= focus.elev + .1;
    } });
  }
}
