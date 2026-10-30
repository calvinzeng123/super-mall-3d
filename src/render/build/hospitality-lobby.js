// 两栋首层大堂的固定陈设；家具批次与碰撞都读取同一个 lobbyPlan。
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { frame, toW } from '../../layout/geom.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

const Y = new THREE.Vector3(0, 1, 0);
const C = { stone: '#eee6d4', bronze: '#ad8a52', dark: '#243c38', wood: '#96704c', ivory: '#eee5d2', ink: '#233338' };
const mid = r => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
const ring = (B, x, y, z, radius, thickness, key, color, segments = 32) => {
  for (let i = 0; i < segments; i++) {
    const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
    B.get(key).bar({ x: x + Math.cos(a) * radius, y, z: z + Math.sin(a) * radius },
      { x: x + Math.cos(b) * radius, y, z: z + Math.sin(b) * radius }, thickness, color);
  }
};
function openingWall(B, wall, y) {
  const [x0, z0] = wall.a, [x1, z1] = wall.b, dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  const glass = wall.material === 'glass', height = glass ? 4.7 : 3.5, angle = -Math.atan2(dz, dx);
  const box = (a, b, base, h, key, depth, color) => {
    if (b - a < .015) return;
    const t = (a + b) / 2 / len;
    B.get(key).box(x0 + dx * t, y + base + h / 2, z0 + dz * t, b - a, h, depth, color, angle);
  };
  const spans = wall.door ? [[0, wall.door.at - wall.door.width / 2], [wall.door.at + wall.door.width / 2, len]] : [[0, len]];
  for (const [a, b] of spans) {
    box(a, b, 0, height, glass ? 'glass' : 'travertine', glass ? .06 : .16, glass ? '#ffffff' : C.stone);
    box(a, b, .02, .075, 'metal', .085, C.bronze);
    if (glass) for (let t = a; t < b - .01; t += 2.4) box(t, Math.min(b, t + .045), .05, height, 'metal', .075, C.bronze);
  }
  box(0, len, height, .09, 'metal', .18, C.bronze);
  if (wall.door) {
    const a = wall.door.at - wall.door.width / 2, b = wall.door.at + wall.door.width / 2;
    box(a, b, 2.65, height - 2.65, glass ? 'glass' : 'travertine', glass ? .06 : .16, C.stone);
    for (const t of [a - .025, b]) box(t, t + .025, 0, 2.7, 'metal', .18, C.bronze);
    box(a, b, 2.65, .06, 'metal', .18, C.bronze);
  }
}
function mug(B, x, y, z, color = C.ivory) {
  B.get('satin').cyl(x, y, z, .055, .105, color, 12);
  B.get('matte').cyl(x, y + .105, z, .043, .004, '#5c3826', 12);
  B.get('metal').bar({ x: x + .04, y: y + .025, z }, { x: x + .1, y: y + .08, z }, .012, color);
}
function vase(B, x, y, z, radius = .13) {
  B.get('satin').sphere(x, y + .15, z, radius, '#e5dbc2', .17, radius, 'sphereLo');
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, xx = x + Math.cos(a) * radius * 1.5, zz = z + Math.sin(a) * radius * 1.5;
    B.get('foliage').bar({ x, y: y + .27, z }, { x: xx, y: y + .55 + i * .025, z: zz }, .011, '#43604a');
    B.get('satin').sphere(xx, y + .57 + i * .025, zz, radius * .5, i % 2 ? '#d7a891' : '#ece0bf', .055, radius * .5, 'sphereLo');
  }
}
function display(B, x, y, z, w = .55) {
  B.get('metal').box(x, y + .055, z, .3, .025, .2, C.ink);
  B.get('metal').box(x, y + .18, z, .045, .24, .045, C.ink);
  B.get('metal').box(x, y + .39, z, w, .35, .055, C.ink);
  B.get('glowSoft').box(x, y + .39, z + .031, w - .045, .3, .009, '#8fa6a2');
  for (const yy of [.31, .36, .42]) B.get('matte').box(x - .05, y + yy, z + .04, w * .53, .012, .006, '#d2ded5');
}
function chair(B, w, d, y, color = '#8a6951', arm = false) {
  const leg = arm ? .1 : .055, seat = arm ? .45 : .47, height = arm ? .91 : .94;
  for (const x of [-w * .34, w * .34]) for (const z of [-d * .33, d * .33]) B.get('bronze').box(x, y + .2, z, leg, .4, leg, C.bronze);
  B.get('satin').box(0, y + seat, 0, w * .9, .16, d * .9, color);
  B.get('satin').sphere(0, y + seat + .045, 0, w * .45, color, .09, d * .44, 'sphereLo');
  B.get('satin').box(0, y + (height + seat) / 2, -d * .36, w * .9, height - seat, .16, color);
  if (arm) for (const x of [-w * .42, w * .42]) B.get('satin').box(x, y + .64, .02, .15, .3, d * .86, color);
}
function furniture(B, o, y, hotel) {
  const r = o.rect, w = r.x1 - r.x0, d = r.z1 - r.z0, h = o.height;
  if (o.type === 'chair' || o.type === 'armchair') { chair(B, w, d, y, hotel ? '#81745e' : '#c1aa87', o.type === 'armchair'); return; }
  if (o.type === 'sofa') {
    const color = o.color || '#547268';
    for (const x of [-w * .4, w * .4]) for (const z of [-d * .32, d * .32]) B.get('metal').cyl(x, y, z, .04, .2, C.bronze, 8);
    B.get('satin').box(0, y + .36, 0, w, .34, d, color);
    for (let x = -w / 2 + .6; x < w / 2 - .3; x += 1.05) {
      B.get('satin').sphere(x, y + .56, .05, .48, color, .12, d * .42, 'sphereLo');
      B.get('satin').box(x, y + .75, -d * .32, .99, .5, .2, color, -.03);
    }
    for (const x of [-w / 2 + .13, w / 2 - .13]) B.get('satin').box(x, y + .58, 0, .25, .45, d, color);
    for (const x of [-w * .31, w * .29]) B.get('satin').box(x, y + .77, -.05, .4, .4, .16, x < 0 ? '#c8a978' : '#ddd5bd', .15);
    return;
  }
  if (['reception', 'concierge'].includes(o.type)) {
    B.get('wood').box(0, y + h / 2, 0, w, h, d, hotel ? '#7b674b' : '#b39a76');
    for (let x = -w / 2 + .06; x < w / 2; x += .14) B.get('wood').cyl(x, y + .12, d / 2 + .014, .045, h - .22, hotel ? '#8c7858' : '#c1a784', 8);
    B.get('stone').box(0, y + h + .025, 0, w + .12, .1, d + .12, C.stone);
    B.get('glowSoft').box(0, y + .12, d / 2 + .065, w - .12, .035, .025, '#eed9ad');
    for (let x = -w / 2 + 1; x < w / 2 - .3; x += 3.8) {
      display(B, x, y + h + .08, -.38);
      B.get('metal').box(x + .65, y + h + .12, .25, .16, .12, .25, '#202b2c');
      B.get('satin').box(x - .6, y + h + .1, .21, .38, .015, .29, '#ece7d5');
      B.get('metal').cyl(x - .65, y + h + .12, .25, .045, .12, C.bronze, 8);
    }
    vase(B, w / 2 - .5, y + h + .08, 0, .17);
    return;
  }
  if (o.type === 'backdrop' || o.type === 'art-wall') {
    B.get('stone').box(0, y + h / 2, 0, w, h, d, '#d8cbb4');
    for (let x = -w / 2 + .08; x < w / 2; x += .22) B.get('wood').box(x, y + h / 2, d / 2 + .04, .055, h, .08, hotel ? '#705c42' : '#b79c78');
    if (o.type === 'art-wall') {
      B.get('bronze').box(0, y + 2.2, d / 2 + .12, w * .76, 2.3, .1, C.bronze);
      B.get('matte').box(0, y + 2.2, d / 2 + .19, w * .73, 2.16, .06, '#cbbda3');
      for (let i = 0; i < 9; i++) B.get('matte').sphere(-w * .3 + i * w * .07, y + 1.7 + Math.sin(i) * .4, d / 2 + .24, .4, i % 2 ? '#597469' : '#ad7956', .45, .03, 'sphereLo');
    }
    return;
  }
  if (['dining-table', 'worktable', 'coffee-table', 'round-table', 'piano-seat'].includes(o.type)) {
    if (o.type === 'round-table') {
      B.get('metal').cyl(0, y, 0, .42, .07, C.bronze, 16);
      B.get('metal').cyl(0, y + .06, 0, .11, h - .06, C.bronze, 12);
      B.get('stone').cyl(0, y + h - .04, 0, w / 2, .075, C.stone, 32);
    } else {
      for (const x of [-w * .4, w * .4]) for (const z of [-d * .32, d * .32]) B.get('metal').box(x, y + h / 2, z, .055, h, .055, C.bronze);
      B.get(o.type === 'worktable' ? 'wood' : o.type === 'piano-seat' ? 'satin' : 'stone').box(0, y + h - .04, 0, w, .08, d, o.type === 'piano-seat' ? '#202c2b' : C.stone);
    }
    if (o.type === 'dining-table') for (const x of [-w * .27, w * .27]) for (const z of [-d * .3, d * .3]) {
      B.get('satin').cyl(x, y + h + .006, z, .2, .014, '#f1ecdd', 16);
      B.get('satin').cyl(x, y + h + .022, z, .155, .01, '#d9ded3', 16);
      for (const side of [-1, 1]) B.get('metal').box(x + side * .24, y + h + .014, z, .018, .012, .23, '#bdc2ba');
      B.get('glass').cyl(x + .26, y + h, z - .2, .045, .13, '#ffffff', 12);
    }
    if (o.type === 'worktable') {
      for (let x = -w / 2 + .8; x < w / 2 - .3; x += 1.7) {
        B.get('metal').box(x, y + h + .025, 0, .55, .035, .4, '#a7b1ae');
        B.get('metal').box(x, y + h + .19, -.17, .55, .34, .025, '#344345', -.03);
        mug(B, x + .38, y + h, .16);
      }
    } else if (!['piano-seat'].includes(o.type)) { vase(B, 0, y + h, 0, .1); if (o.type !== 'dining-table') mug(B, -.48, y + h, .15); }
    return;
  }
  if (['buffet', 'kitchen', 'cafe-bar'].includes(o.type)) {
    B.get('wood').box(0, y + h / 2, 0, w, h, d, '#826247');
    B.get('stone').box(0, y + h + .025, 0, w + .08, .1, d + .08, C.stone);
    for (let x = -w / 2 + .6; x < w / 2; x += 1.2) {
      B.get('metal').box(x, y + h * .55, d / 2 + .025, .03, h * .8, .035, C.bronze);
      B.get('metal').box(x - .15, y + h * .72, d / 2 + .04, .16, .025, .03, C.bronze);
    }
    B.get('metal').box(-w * .3, y + h + .32, -.12, 1.2, .6, .7, '#334342');
    for (const x of [-w * .3 - .3, -w * .3 + .3]) {
      B.get('metal').cyl(x, y + h + .62, -.2, .15, .25, '#b4b5a4', 12); mug(B, x, y + h, .35);
    }
    for (let x = -w * .1; x < w * .45; x += 1.25) {
      B.get('satin').cyl(x, y + h + .07, 0, .3, .07, '#e1dbca', 16);
      if (o.type === 'kitchen') {
        for (const dx of [-.18, .18]) B.get('metal').cyl(x + dx, y + h + .12, 0, .16, .04, '#253235', 12);
      } else for (let i = 0; i < 5; i++) B.get('satin').sphere(x + Math.cos(i * 2.3) * .16, y + h + .2, Math.sin(i * 2.3) * .16, .075, i % 2 ? '#d7a451' : '#a87644', .075, .075, 'sphereLo');
    }
    return;
  }
  if (o.type === 'treadmill') {
    B.get('metal').box(0, y + .18, 0, w, .28, d, '#283437');
    B.get('matte').box(0, y + .34, .15, w - .22, .045, d - .45, '#152426');
    for (let z = -.8; z < .9; z += .13) B.get('extSatin').box(0, y + .365, z, w - .3, .006, .015, '#455354');
    for (const x of [-w * .42, w * .42]) {
      B.get('metal').bar({ x, y: y + .2, z: -.65 }, { x, y: y + 1.4, z: -.9 }, .065, '#9ca6a1');
      B.get('metal').bar({ x, y: y + 1.2, z: -.8 }, { x, y: y + 1.2, z: .35 }, .055, '#303d3d');
    }
    B.get('metal').box(0, y + 1.4, -.9, w, .2, .35, '#273638');
    B.get('glowSoft').box(0, y + 1.51, -.88, .48, .013, .23, '#72c3bb');
    return;
  }
  if (o.type === 'weights' || o.type === 'weight-bench') {
    if (o.type === 'weight-bench') {
      B.get('metal').box(0, y + .28, 0, .4, .5, d, '#586360');
      B.get('satin').box(0, y + .57, 0, w, .17, d - .1, '#233b39');
    } else {
      for (const x of [-w * .43, w * .43]) B.get('metal').box(x, y + .53, 0, .07, 1.06, d, '#73817d');
      for (const yy of [.45, .93]) {
        B.get('metal').box(0, y + yy, 0, w, .08, d * .8, '#9da6a0');
        for (let x = -w * .38; x <= w * .38; x += .42) {
          B.get('metal').box(x, y + yy + .16, 0, .25, .06, .06, '#9da6a0');
          for (const xx of [x - .13, x + .13]) B.get('matte').sphere(xx, y + yy + .16, 0, .12, '#1c2b2b', .12, .12, 'sphereLo');
        }
      }
    }
    return;
  }
  if (o.type === 'indoor-tree') {
    B.get('stone').cyl(0, y, 0, w * .46, .55, '#d8c6a4', 24);
    B.get('matte').cyl(0, y + .55, 0, w * .41, .025, '#443b2c', 24);
    B.get('wood').cyl(0, y + .5, 0, .08, h * .63, '#786448', 8);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.399, xx = Math.cos(a) * w * .32, zz = Math.sin(a) * d * .32, yy = y + h * (.58 + (i % 4) * .105);
      B.get('wood').bar({ x: 0, y: yy - .65, z: 0 }, { x: xx, y: yy, z: zz }, .019, '#786448');
      for(let j=0;j<6;j++) {
        const f=.4+j*.12,side=j%2?1:-1;
        const lx=xx*f+Math.cos(a+Math.PI/2)*side*.13,lz=zz*f+Math.sin(a+Math.PI/2)*side*.13;
        const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.15*side,a+.5*side,.2));
        B.get('satin').shape('sphereLo',new THREE.Vector3(lx,yy-.22+j*.055,lz),q,new THREE.Vector3(.13,.035,.3),j%2?'#65784b':'#83935f');
      }
    }
    return;
  }
  if (o.type === 'piano') {
    B.get('satin').sphere(0, y + 1, .3, w / 2, '#182826', .16, d * .37, 'sphere');
    B.get('satin').box(0, y + .86, -.55, w * .78, .35, .8, '#182826');
    for (const x of [-w * .32, w * .32]) B.get('metal').cyl(x, y, -.45, .07, .9, C.bronze, 8);
    B.get('metal').cyl(0, y, .8, .07, .9, C.bronze, 8);
    for (let i = 0; i < 36; i++) {
      const x = -w * .34 + i * w * .68 / 36;
      B.get('satin').box(x, y + 1.05, -.78, w * .68 / 36 - .008, .035, .37, '#f1ead9');
      if (i % 7 !== 2 && i % 7 !== 6) B.get('satin').box(x + .02, y + 1.08, -.67, .035, .045, .19, '#141e1e');
    }
    B.get('metal').box(0, y + 1.25, -.3, .6, .32, .045, C.bronze);
    return;
  }
  if (o.type === 'mirror') {
    B.get('metal').box(0, y + h / 2, 0, w, h, .08, C.bronze);
    B.get('mirror').box(0, y + h / 2, .05, w - .1, h - .1, .02, '#ffffff'); return;
  }
  if (o.type === 'luggage-cart') {
    for (const x of [-w * .38, w * .38]) for (const z of [-d * .37, d * .37]) B.get('matte').sphere(x, y + .12, z, .12, '#243233', .12, .055, 'sphereLo');
    B.get('satin').box(0, y + .28, 0, w, .1, d, '#624f3b');
    for (const x of [-w * .4, w * .4]) for (const z of [-d * .4, d * .4]) B.get('metal').cyl(x, y + .25, z, .03, h - .25, C.bronze, 8);
    for (const z of [-d * .4, d * .4]) B.get('metal').bar({ x: -w * .4, y: y + h, z }, { x: w * .4, y: y + h, z }, .04, C.bronze);
    for (const [x, z, hh] of [[-.22, -.2, .8], [.22, .35, .65]]) {
      B.get('satin').box(x, y + .32 + hh / 2, z, .5, hh, .43, x < 0 ? '#394e4b' : '#aa8060');
      B.get('metal').box(x, y + .35 + hh, z, .2, .04, .045, C.bronze);
      for (const xx of [x - .18, x + .18]) B.get('metal').box(xx, y + .32 + hh / 2, z + .22, .025, hh - .1, .02, C.bronze);
    } return;
  }
  if (o.type === 'wc') {
    B.get('satin').box(0, y + .51, -d * .36, w * .8, .8, .25, '#eeeadd');
    B.get('satin').sphere(0, y + .38, .1, w * .43, '#f2eee1', .25, d * .38, 'sphereLo');
    B.get('matte').sphere(0, y + .61, .13, w * .27, '#abb5ac', .025, d * .24, 'sphereLo');
    B.get('metal').box(0, y + .93, -d * .34, .1, .015, .08, C.bronze); return;
  }
  if (o.type === 'vanity') {
    B.get('wood').box(0, y + .43, 0, w, .7, d, '#8b7055');
    B.get('stone').box(0, y + .87, 0, w + .06, .12, d + .06, C.stone);
    for (const z of [-d * .27, d * .27]) {
      B.get('satin').sphere(0, y + .96, z, w * .38, '#f4f0e4', .12, .37, 'sphereLo');
      B.get('metal').cyl(-w * .35, y + .94, z, .025, .25, C.bronze, 8);
      B.get('metal').box(-w * .23, y + 1.18, z, .25, .035, .04, C.bronze);
    } return;
  }
  if (['bookcase', 'towel-rack', 'luggage-rack', 'lockers', 'washers'].includes(o.type)) {
    B.get('wood').box(0, y + h / 2, -d * .46, w, h, .08, '#927759');
    for (const x of [-w / 2 + .04, w / 2 - .04]) B.get('wood').box(x, y + h / 2, 0, .08, h, d, '#927759');
    if (o.type === 'washers') {
      const n = Math.floor(w / .8);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + .5) * w / n;
        B.get('extSatin').box(x, y + .58, 0, w / n - .035, 1.16, d, '#e3e3d8');
        B.get('metal').shape('torus', new THREE.Vector3(x, y + .59, d / 2 + .035), new THREE.Quaternion(), new THREE.Vector3(.58, .58, .32), '#738b85');
        B.get('glassTint').sphere(x, y + .59, d / 2 + .015, .23, '#ffffff', .23, .03, 'sphereLo');
        B.get('glowSoft').box(x + .13, y + 1.05, d / 2 + .025, .18, .075, .018, '#99c5b5');
      }
    } else if (o.type === 'lockers') {
      const nx = Math.max(1, Math.floor(w / .6)), nz = Math.max(1, Math.floor(d / .7));
      // Long narrow service racks present their doors to the free central aisle.
      const side = d > w;
      for (let i = 0; i < (side ? nz : nx); i++) for (let j = 0; j < 4; j++) {
        const xx = side ? 0 : -w / 2 + (i + .5) * w / nx, zz = side ? -d / 2 + (i + .5) * d / nz : 0;
        B.get('satin').box(xx, y + (j + .5) * h / 4, zz, side ? w : w / nx - .025, h / 4 - .025, side ? d / nz - .025 : d, '#b3b6a4');
        B.get('metal').box(side ? -w / 2 - .015 : xx + .15, y + (j + .5) * h / 4, side ? zz : d / 2 + .015, side ? .02 : .025, .13, side ? .035 : .02, C.bronze);
      }
    } else for (let yy = .18; yy < h; yy += .62) {
      B.get('wood').box(0, y + yy, 0, w, .055, d, '#aa8b63');
      if (o.type === 'bookcase') for (let x = -w / 2 + .18; x < w / 2 - .1; x += .16) B.get('matte').box(x, y + yy + .23, .04, .11, .4 + Math.sin(x) * .06, d * .65, ['#826447', '#66847c', '#c2b590', '#8f9b9b'][Math.floor((x + w) * 10) % 4]);
      else if (o.type === 'towel-rack') for (let x = -w / 2 + .25; x < w / 2; x += .44) for (const dz of [-d * .2, d * .2]) B.get('satin').box(x, y + yy + .09, dz, .37, .12, Math.min(.4, d * .4), '#e8e6d7');
      else for (let z = -d / 2 + .5; z < d / 2; z += 1.25) B.get('satin').box(0, y + yy + .23, z, w * .75, .4, .72, '#8d7359');
    }
  }
}
function label(ctx, group, F, text, subtitle, x, y, z, width, angle = 0) {
  const canvas = makeCanvas(768, 192), g = canvas.getContext('2d');
  g.fillStyle = '#263e38'; g.fillRect(0, 0, 768, 192);
  g.strokeStyle = '#b89c68'; g.lineWidth = 3; g.strokeRect(9, 9, 750, 174);
  g.fillStyle = '#f1e7cf'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 46px ${FONT_CN}`; g.fillText(text, 384, 72, 728);
  g.fillStyle = '#bfac84'; g.font = `500 23px ${FONT_EN}`; g.fillText(subtitle, 384, 137, 720);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), ctx.mats.sign(canvasTexture(canvas, { clamp: true })));
  const [wx, wz] = toW(F, x, z); mesh.position.set(wx, y, wz); mesh.rotation.y = -F.a + angle;
  mesh.name = `hospitality-label-${text}`; group.add(mesh);
}

export function buildHospitalityLobby(ctx, building, lv) {
  const group = new THREE.Group(); group.name = `${building.id}-luxury-public-lobby`;
  if (!lv?.lobbyPlan || lv.lobbyPlan.kind !== 'hospitality') return group;
  const plan = lv.lobbyPlan, hotel = building.usage === 'hotel', y = lv.elev;
  const B = new BatchSet(ctx.mats.base), ceilingBatch = new BatchSet(ctx.mats.base), ceilings = new THREE.Group();
  ceilings.name = `${building.id}-luxury-lobby-ceilings`; ceilings.visible = false;
  group.userData = { furniture: plan.obstacles.map(o => ({ id: o.id, type: o.type, rect: o.rect })), zones: plan.zones.map(z => z.id), walkable: true };
  B.frame(building.frame, () => {
    for (const zone of plan.zones) {
      const r = zone.rect, [x, z] = mid(r), w = r.x1 - r.x0, d = r.z1 - r.z0;
      B.get(['fitness', 'lounge', 'business'].includes(zone.id) ? 'wood' : 'stone').box(x, y + .018, z, w, .03, d, zone.id === 'fitness' ? '#8c8170' : '#d9c8a8');
      for (const xx of [r.x0 + .12, r.x1 - .12]) B.get('metal').box(xx, y + .038, z, .022, .012, d - .24, C.bronze);
      for (const zz of [r.z0 + .12, r.z1 - .12]) B.get('metal').box(x, y + .038, zz, w - .24, .012, .022, C.bronze);
    }
    for (const p of plan.partitions) openingWall(B, p, y);
    for (const detail of plan.floorDetails) {
      const [x, z] = mid(detail.rect);
      B.get('satin').box(x, y + .045, z, detail.rect.x1 - detail.rect.x0, .016, detail.rect.z1 - detail.rect.z0, '#849889');
      for (const xx of [x - .5, x + .5]) B.get('satin').cyl(xx, y + .05, detail.rect.z0 + .15, .07, .1, '#c8b69a', 12);
    }
    // The arrival axis is a flush marble carpet, never another solid platform.
    B.get('stone').box(0, y + .018, 0, 73.6, .028, 4.65, '#e8e0cd');
    for (const z of [-2.1, 2.1]) B.get('stone').box(0, y + .038, z, 73.6, .012, .16, '#515d53');
    for (const x of [-22, 0, 23]) ring(B, x, y + .047, 0, 1.67, .025, 'metal', C.bronze);
    for (const [x, z] of [[-10.9, -3.4], [11.4, -3.4], [-10.3, 3.4], [11.4, 3.4]]) {
      B.get('stone').box(x, y + 3, z, .28, 6, .28, C.stone);
      for (const dx of [-.155, .155]) B.get('metal').box(x + dx, y + 3, z, .025, 6, .31, C.bronze);
    }
    for (const zone of plan.zones.filter(z=>z.id!=='washroom')) {
      const [x]=mid(zone.rect),z=zone.rect.z1<0?zone.rect.z1-.08:zone.rect.z0+.08;
      const width=Math.min(5.4,zone.rect.x1-zone.rect.x0-.6);
      for(const dx of [-width*.34,width*.34])B.get('metal').cyl(x+dx,y+3.2+width/8,z,.012,6-(3.2+width/8),C.bronze,6);
    }
  });
  for (const o of plan.obstacles) {
    const [x, z] = mid(o.rect), [wx, wz] = toW(building.frame, x, z);
    // Rendering rotations are bounded by the obstacle rectangles (square
    // chairs and mirrors excepted); long fixtures retain their surveyed axes.
    const rotation = ['chair', 'armchair'].includes(o.type) ? o.rotation || 0 : 0;
    B.frame(frame(wx, wz, building.frame.deg - rotation * 180 / Math.PI), () => furniture(B, o, y, hotel));
  }
  ceilingBatch.frame(building.frame, () => {
    for (const zone of plan.zones) {
      const r = zone.rect, [x, z] = mid(r), w = r.x1 - r.x0, d = r.z1 - r.z0;
      ceilingBatch.get('matte').box(x, y + 6.1, z, w - .2, .16, d - .2, '#e1dbc9');
      for (const zz of [r.z0 + .5, r.z1 - .5]) ceilingBatch.get('glowSoft').box(x, y + 6, zz, w - 1, .035, .075, '#f5dcaa');
      for (const xx of [r.x0 + .5, r.x1 - .5]) ceilingBatch.get('glowSoft').box(xx, y + 6, z, .075, .035, d - 1, '#f5dcaa');
      for (let xx = r.x0 + 2; xx < r.x1 - 1; xx += 4) for (const zz of [r.z0 + 2, r.z1 - 2]) {
        ceilingBatch.get('metal').cyl(xx, y + 5.97, zz, .19, .04, C.bronze, 12);
        ceilingBatch.get('glowSoft').cyl(xx, y + 5.94, zz, .14, .035, '#fff1ce', 12);
      }
      if (['restaurant', 'lounge', 'business'].includes(zone.id)) for (const xx of [x - w * .25, x + w * .25]) {
        ceilingBatch.get('metal').cyl(xx, y + 3.9, z, .018, 2.05, C.bronze, 8);
        ring(ceilingBatch, xx, y + 4, z, 1.2, .025, 'metal', C.bronze);
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6;
          ceilingBatch.get('glowSoft').sphere(xx + Math.cos(a), y + 3.94, z + Math.sin(a), .11, '#ffe3ae', .16, .11, 'sphereLo');
        }
      }
    }
    const { x, z, radius, height } = plan.chandelier;
    for (const [r, yy] of [[radius, height + .45], [radius * .7, height], [radius * .38, height - .5]]) {
      ring(ceilingBatch, x, y + yy, z, r, .045, 'metal', C.bronze, 48);
      for (let i = 0; i < 36; i++) {
        const a = i * Math.PI / 18, xx = x + Math.cos(a) * r, zz = z + Math.sin(a) * r;
        ceilingBatch.get('glowSoft').cyl(xx, y + yy - .35 - i % 3 * .07, zz, .035, .38 + i % 3 * .07, '#f6e8c7', 6);
      }
    }
    for (const dx of [-1.8, 1.8]) for (const dz of [-1.8, 1.8]) ceilingBatch.get('metal').bar({ x: x + dx, y: y + 6.1, z: z + dz }, { x: x + dx * .6, y: y + height + .45, z: z + dz * .6 }, .013, C.bronze);
  });
  B.flush(group); ceilingBatch.flush(ceilings); group.add(ceilings);
  label(ctx, group, building.frame, hotel ? '云澜酒店 · 礼遇之境' : '云澜公寓 · 归家礼序', hotel ? 'YUNLAN HOTEL · WELCOME' : 'YUNLAN RESIDENCES · WELCOME', 23, y + 3.45, -16.68, 8.8);
  for (const zone of plan.zones) {
    const [x] = mid(zone.rect), north = zone.rect.z1 < 0;
    label(ctx, group, building.frame, zone.name, zone.id === 'fitness' ? 'FITNESS & WELLNESS' : zone.id === 'restaurant' ? 'ALL DAY DINING' : zone.id === 'washroom' ? 'RESTROOMS' : zone.id === 'business' ? 'LOUNGE & WORKSPACE' : 'YUNLAN · GUEST SERVICES',
      x, y + (zone.id === 'washroom' ? 2.95 : 3.2), north ? zone.rect.z1 - .08 : zone.rect.z0 + .08,
      Math.min(5.4, zone.rect.x1 - zone.rect.x0 - .6), north ? 0 : Math.PI);
  }
  label(ctx, group, building.frame, '玻璃电梯  ←  客房楼层  ·  安全楼梯', 'GUEST LIFTS · ROOMS · EXIT', -24, y + 3.2, 0, 6, Math.PI / 2);
  ctx.levels[lv.id].base.add(group);
  ctx.dynamic.push({ name: `${building.id}-public-lobby-ceiling`, update(dt, elapsed, app) {
    const active = app.state.explore?.level;
    ceilings.visible = active === lv.id && ctx.camera.position.y >= y && ctx.camera.position.y < y + 5.85;
  } });
  return group;
}
