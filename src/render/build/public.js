// 公共区域（数据驱动）：美食层圆厅用餐区与吊灯；云澜老街石板路、牌坊与灯笼串；1F 圆厅服务台、花池与长椅；
// 口袋与端部休息区；2F 快闪店；圆厅"云朵"悬挂艺术装置。
import * as THREE from 'three';
import { pointInPoly, toW, frame } from '../../layout/geom.js';
import { rng, makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { tableSet, roundTable, bench, planter } from './props.js';

export function buildPublic(ctx) {
  for (const b of ctx.layout.buildings) {
    if (b.kind !== 'mall') continue;
    const levels = ctx.buildings[b.id].levels.map((L) => L.lv);
    for (const lv of levels) {
      if (lv.kind === 'food') {
        foodCourt(ctx, b, lv);
        oldStreet(ctx, b, lv);
      }
      if (lv.kind === 'retail' || lv.kind === 'food') lounges(ctx, b, lv);
      iceRinks(ctx, lv);
      if (lv.short === '1F') atrium1F(ctx, b, lv);
      if (lv.short === '2F') popups(ctx, b, lv);
    }
    atriumArt(ctx, b, levels);
  }
}

/** 定向矩形（世界坐标）：起点 p、方向 u、沿方向 [a,b]、半宽 hw */
function strip(px, pz, ux, uz, a, b, hw) {
  const nx = -uz, nz = ux;
  return [
    [px + ux * a - nx * hw, pz + uz * a - nz * hw], [px + ux * b - nx * hw, pz + uz * b - nz * hw],
    [px + ux * b + nx * hw, pz + uz * b + nz * hw], [px + ux * a + nx * hw, pz + uz * a + nz * hw],
  ];
}

/** 扶梯（含前后缓冲区）与观光梯门口的禁放区（世界多边形） */
function keepOut(ctx, lv) {
  const zones = [];
  for (const e of ctx.layout.escalators) {
    if (e.from !== lv.id && e.to !== lv.id) continue;
    const run = Math.hypot(e.top.x - e.bottom.x, e.top.z - e.bottom.z);
    const ux = (e.top.x - e.bottom.x) / run, uz = (e.top.z - e.bottom.z) / run;
    zones.push(strip(e.bottom.x, e.bottom.z, ux, uz, -4.2, run + 4.2, 1.7));
  }
  for (const g of ctx.layout.elevators.filter((x) => x.type === 'glass' && x.serves.includes(lv.id))) {
    zones.push(strip(g.x, g.z, 1, 0, -4, 4, 2.8));
  }
  return zones;
}

function foodCourt(ctx, b, lv) {
  const B = ctx.levels[lv.id].batch;
  const y0 = lv.elev;
  const avoid = keepOut(ctx, lv);
  const rand = rng(77 + lv.id.length);
  const chairs = ['#f08a24', '#19a39a', '#f2c230', '#e65f5c', '#4a90d9'];
  for (const r of b.rotundas) {
    const pieces = lv.walk.filter((w) => w.kind === 'foodcourt' && w.rot === r.id);
    if (!pieces.length) continue;
    const F = r.kitF;
    const free = (x, z, rad) => {
      const [wx, wz] = toW(F, x, z);
      if (Math.hypot(x, z) > r.R - 2.5) return false;
      if (Math.abs(x) < 1.8 || Math.abs(z) < 1.8) return false;
      for (const k of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) {
        const [px, pz] = toW(F, x + k[0], z + k[1]);
        if (avoid.some((p) => pointInPoly([px, pz], p))) return false;
      }
      return pieces.some((p) => pointInPoly([wx, wz], p.poly));
    };
    B.frame(F, () => {
      for (let x = -r.R + 3; x <= r.R - 3; x += 3.1) {
        for (let z = -r.R + 3; z <= r.R - 3; z += 3.0) {
          if (!free(x, z, 1.4)) continue;
          const c = chairs[Math.floor(rand() * chairs.length)];
          if (rand() < 0.35) roundTable(B, x, y0, z, 4, { chair: c, top: '#f4efe6' });
          else tableSet(B, x, y0, z, rand() < 0.5 ? 0 : Math.PI / 2, { chair: c, top: '#e8dcc8' });
        }
      }
      // 吊灯与十字引导色带
      for (let x = -r.R + 4; x <= r.R - 4; x += 6) {
        for (let z = -r.R + 4; z <= r.R - 4; z += 6) {
          if (Math.hypot(x, z) > r.R - 4 || (Math.abs(x) < 7 && Math.abs(z) < 10)) continue;
          B.get('metal').box(x, y0 + 3.75, z, 0.02, 0.5, 0.02, '#2b2f33');
          B.get('glow').sphere(x, y0 + 3.4, z, 0.32, '#ffd9a0');
        }
      }
      B.get('satin').box(0, y0 + 0.012, 0, 3.2, 0.01, (r.R - 1) * 2, '#c9a77a');
      B.get('satin').box(0, y0 + 0.012, 0, (r.R - 1) * 2, 0.01, 3.2, '#c9a77a');
    });
  }
}

/** 云澜老街：所在翼楼商业街铺石板、街口牌坊（面向圆厅）、沿街灯笼串 */
function oldStreet(ctx, b, lv) {
  const L = ctx.levels[lv.id];
  const B = L.batch;
  const y0 = lv.elev;
  const wings = new Set(lv.units.filter((u) => u.style === 'oldstreet').map((u) => u.wing));
  for (const wid of wings) {
    const w = b.wings.find((x) => x.id === wid);
    const F = w.F;
    const stone = ctx.mats.floor('stone', 0.8);
    for (const p of lv.walk.filter((x) => x.rect && x.frame === F && (x.kind === 'street' || x.kind === 'pocket' || x.kind === 'lounge'))) {
      const r = p.rect;
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (r.x0 + uv.getX(i) * (r.x1 - r.x0)) / 4, (r.z0 + (1 - uv.getY(i)) * (r.z1 - r.z0)) / 4);
      const m = new THREE.Mesh(g, stone);
      const [x, z] = toW(F, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      m.position.set(x, y0 + 0.006 + (p.kind === 'street' ? 0.002 : 0), z);
      m.rotation.y = -F.a;
      m.receiveShadow = true;
      L.base.add(m);
    }
    // 牌坊：立在翼楼与圆厅交界处，面向圆厅
    const gu = w.u0 - 0.6;
    const red = '#a3241f', tile = '#3a3f45';
    B.frame(F, () => {
      for (const v of [-5.4, -1.8, 1.8, 5.4]) {
        B.get('satin').cyl(gu, y0, v, 0.28, 3.9, red, 12);
        B.get('satin').cyl(gu, y0, v, 0.42, 0.35, '#6b6258', 12);
      }
      B.get('satin').box(gu, y0 + 3.55, 0, 0.5, 0.35, 11.6, red);
      B.get('satin').box(gu, y0 + 3.95, 0, 0.6, 0.45, 4.2, red);
      B.get('matte').box(gu, y0 + 4.32, 0, 1.6, 0.18, 12.6, tile);
      B.get('matte').box(gu, y0 + 4.42, 0, 1.0, 0.1, 13.0, tile);
      // 灯笼串：商业街两侧
      for (const v of [-4.2, 4.2]) {
        const len = w.bandEnd - w.u0;
        const n = Math.floor(len / 1.6);
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const sag = Math.sin(t * Math.PI * Math.max(1, Math.round(len / 7))) * 0.25;
          B.get('glow').sphere(w.u0 + len * t, y0 + 3.35 - Math.abs(sag), v, 0.22, i % 5 === 2 ? '#f2b134' : '#d6332a', 0.27, 0.22, 'sphereLo');
        }
      }
    });
    const c = makeCanvas(512, 160);
    const g = c.getContext('2d');
    g.fillStyle = '#5a1410';
    g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#d4a72c';
    g.lineWidth = 10;
    g.strokeRect(8, 8, 496, 144);
    g.fillStyle = '#f2cf6b';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 92px ${FONT_CN}`;
    g.fillText('云澜老街', 256, 74);
    g.font = `600 26px ${FONT_EN}`;
    g.fillText('YUNLAN OLD STREET', 256, 132);
    const mat = ctx.mats.screen(canvasTexture(c, { clamp: true }), 0.9, 1.25);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), mat);
    const [px, pz] = toW(F, gu - 0.32, 0);
    plaque.position.set(px, y0 + 3.95, pz);
    plaque.rotation.y = -F.a - Math.PI / 2;
    L.base.add(plaque);
  }
}

/** 1F 圆厅：服务台（朝主入口方向）、洞口四角花池与长椅 */
function atrium1F(ctx, b, lv) {
  const L = ctx.levels[lv.id];
  const B = L.batch;
  const atlas = ctx.atlas[lv.id];
  const y0 = lv.elev;
  for (const r of b.rotundas) {
    if (!lv.walk.some((w) => w.rot === r.id)) continue;
    const F = r.kitF;
    B.frame(F, () => L.signs.frame(F, () => {
      const x = r.R - 12, z = -9.5;
      B.get('satin').box(x, y0 + 0.55, z, 1.1, 1.1, 5.2, '#f4f1ea');
      B.get('metal').box(x, y0 + 1.13, z, 1.3, 0.06, 5.4, '#b08d4f');
      B.get('glow').box(x + 0.57, y0 + 0.2, z, 0.02, 0.06, 5.0, '#ffe6b0');
      L.signs.place(x - 0.2, y0 + 3.3, z, 3.2, 0.8, 'E', atlas.cell('wf-info'));
      B.get('satin').box(x - 0.23, y0 + 3.3, z, 0.05, 0.9, 3.3, '#0f6f86');
      B.get('metal').box(x - 0.23, y0 + 4.05, z, 0.06, 0.7, 0.06, '#4a5056');
      for (const [px, pz] of [[-9, -12.5], [9, -12.5], [-9, 12.5], [9, 12.5]]) planter(B, px - 1.4, pz - 1.0, px + 1.4, pz + 1.0, y0, px * 3 + pz, true, 'matte');
      for (const [px, pz, ry] of [[-14.5, -13, 0], [14.5, -13, 0], [-14.5, 13, Math.PI], [14.5, 13, Math.PI]]) bench(B, px, y0, pz, ry, 'matte');
    }));
  }
}

/** 2F 圆厅快闪店 */
function popups(ctx, b, lv) {
  const B = ctx.levels[lv.id].batch;
  const y0 = lv.elev;
  for (const r of b.rotundas) {
    if (!lv.voids.some((v) => v.kind === 'atrium' && v.frame === r.kitF)) continue;
    B.frame(r.kitF, () => {
      for (const k of [{ x: 15, z: -14.2, color: '#2f86b0' }, { x: -15, z: 14.2, color: '#e0567a' }]) {
        B.get('satin').box(k.x, y0 + 0.5, k.z, 3.2, 1.0, 1.6, '#f7f7f5');
        B.get('satin').box(k.x, y0 + 1.03, k.z, 3.3, 0.06, 1.7, k.color);
        for (let i = 0; i < 5; i++) B.get('matte').box(k.x - 1.2 + i * 0.6, y0 + 1.2, k.z, 0.4, 0.3, 0.4, ['#f2c230', '#1f2937', '#e65f5c', '#19a39a', '#ffffff'][i]);
        for (const dx of [-1.55, 1.55]) B.get('metal').box(k.x + dx, y0 + 1.6, k.z, 0.06, 3.2, 0.06, '#4a5056');
        B.get('glow').box(k.x, y0 + 3.1, k.z, 3.2, 0.5, 0.08, k.color);
      }
    });
  }
}

/** 口袋（翼楼与圆厅之间）与端部休息区：沙发、茶几、绿植 */
function lounges(ctx, b, lv) {
  const B = ctx.levels[lv.id].batch;
  const y0 = lv.elev;
  for (const w of lv.walk) {
    if (!w.rect || !(w.kind === 'pocket' || w.kind === 'lounge')) continue;
    const r = w.rect;
    const cu = (r.x0 + r.x1) / 2, cv = (r.z0 + r.z1) / 2;
    const du = r.x1 - r.x0, dv = r.z1 - r.z0;
    if (du < 4 || dv < 4) continue;
    B.frame(w.frame, () => {
      if (w.kind === 'lounge') {
        B.get('satin').box(cu, y0 + 0.008, cv, du - 1.5, 0.016, Math.min(dv - 2, 8), '#d9cbb5');
        for (const dz of [-2.4, 2.4]) {
          B.get('matte').box(cu - 0.6, y0 + 0.25, cv + dz, 0.9, 0.5, 3.2, '#55707f');
          B.get('matte').box(cu - 0.98, y0 + 0.62, cv + dz, 0.18, 0.5, 3.2, '#55707f');
        }
        B.get('satin').cyl(cu + 0.8, y0, cv, 0.5, 0.45, '#e9e2d6', 16);
        for (const dz of [-dv / 2 + 1.2, dv / 2 - 1.2]) {
          B.get('matte').cyl(cu, y0, cv + dz, 0.45, 0.7, '#6b4426', 12);
          B.get('foliage').sphere(cu, y0 + 1.4, cv + dz, 0.7, '#4f8a3a');
        }
      } else {
        B.get('matte').box(cu, y0 + 0.25, cv, Math.min(du - 2, 3.2), 0.5, 0.9, '#7a6a5a');
        B.get('matte').cyl(cu + du / 2 - 1.2, y0, cv, 0.45, 0.7, '#6b4426', 12);
        B.get('foliage').sphere(cu + du / 2 - 1.2, y0 + 1.4, cv, 0.75, '#4f8a3a');
      }
    });
  }
}

/** 圆厅"云朵"悬挂艺术装置：挂在最高商业层，悬在中庭洞口上空 */
function atriumArt(ctx, b, levels) {
  const tops = levels.filter((l) => l.kind === 'retail');
  const top = tops[tops.length - 1];
  const roof = levels.find((l) => l.kind === 'roof');
  if (!top || !roof) return;
  const B = ctx.levels[top.id].batch;
  for (const r of b.rotundas) {
    const v = top.voids.find((x) => x.kind === 'atrium' && x.frame === r.kitF);
    if (!v) continue;
    const rand = rng(2026 + r.id.charCodeAt(0));
    const hx = (v.rect.x1 - v.rect.x0) / 2 - 9, hz = (v.rect.z1 - v.rect.z0) / 2 - 4.8;
    B.frame(r.kitF, () => {
      for (let i = 0; i < 70; i++) {
        const a = rand() * Math.PI * 2;
        const k = Math.sqrt(rand());
        const x = Math.cos(a) * k * hx;
        const z = Math.sin(a) * k * hz;
        const y = top.elev + 0.8 + rand() * 3.6 - k * 1.2;
        const rad = 0.35 + rand() * 0.55;
        B.get('glowSoft').sphere(x, y, z, rad, rand() < 0.15 ? '#bfe9f5' : '#f6f8fb');
        B.get('metal').box(x, (y + rad + roof.elev - 0.1) / 2, z, 0.012, roof.elev - 0.1 - y - rad, 0.012, '#9aa0a6');
      }
    });
  }
}

/** 真冰场：冰面与场线、白色挡板 + 玻璃护栏、挡板招牌、滑冰的人（动画） */
function iceRinks(ctx, lv) {
  const L = ctx.levels[lv.id];
  const B = L.batch;
  for (const u of lv.units.filter((x) => x.style === 'rink')) {
    const r = u.rects[0], F = u.frame, y0 = lv.elev;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const iw = r.x1 - r.x0 - 1.2, id = r.z1 - r.z0 - 1.2;
    const cell = ctx.atlas[lv.id].cell(u.id);
    B.frame(F, () => L.signs.frame(F, () => {
      B.get('satin').box(cx, y0 + 0.04, cz, iw, 0.08, id, '#eef7fc');
      B.get('matte').box(cx, y0 + 0.085, cz, 0.3, 0.01, id - 0.6, '#d33a3a');
      for (const k of [-1, 1]) B.get('matte').box(cx + k * iw * 0.16, y0 + 0.085, cz, 0.3, 0.01, id - 0.6, '#2f6fd6');
      for (const k of [-1, 1]) B.get('matte').box(cx + k * (iw / 2 - 3.3), y0 + 0.085, cz, 0.06, 0.01, id - 2.2, '#d33a3a');
      const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      B.get('matte').shape('torus', new THREE.Vector3(cx, y0 + 0.09, cz), flat, new THREE.Vector3(9, 9, 0.25), '#2f6fd6');
      for (const k of [-1, 1]) for (const j of [-1, 1]) B.get('matte').shape('torus', new THREE.Vector3(cx + k * (iw / 2 - 7), y0 + 0.09, cz + j * 3.6), flat, new THREE.Vector3(6, 6, 0.25), '#d33a3a');
      const board = (x, z, sx, sz) => {
        B.get('satin').box(x, y0 + 0.55, z, sx, 1.1, sz, '#f7f7f5');
        B.get('satin').box(x, y0 + 0.2, z, sx + 0.01, 0.12, sz + 0.01, '#f2c230');
        B.get('glass').box(x, y0 + 1.65, z, sx, 1.1, Math.max(0.03, sz * 0.3), 0xffffff);
        B.get('metal').box(x, y0 + 1.13, z, sx, 0.06, sz + 0.06, '#c3c9cf');
      };
      for (const z of [r.z0 + 0.6, r.z1 - 0.6]) {
        board(cx - iw / 4 - 1, z, iw / 2 - 2, 0.15);
        board(cx + iw / 4 + 1, z, iw / 2 - 2, 0.15);
      }
      for (const x of [r.x0 + 0.6, r.x1 - 0.6]) board(x, cz, 0.15, id);
      L.signs.place(cx - iw / 4 - 1, y0 + 0.62, r.z0 + 0.5, 4.4, 1.1, 'N', cell);
      L.signs.place(cx + iw / 4 + 1, y0 + 0.62, r.z1 - 0.5, 4.4, 1.1, 'S', cell);
      // 冰场灯：悬在 2F 洞口下沿的灯带
      for (const z of [r.z0 + 1, r.z1 - 1]) B.get('glow').box(cx, y0 + 6.0, z, iw, 0.08, 0.3, '#eaf6ff');
    }));
    skaters(ctx, L, F, cx, cz, iw, id, y0);
  }
}

function skaters(ctx, L, F, cx, cz, iw, id, y0) {
  const n = 18;
  const body = new THREE.CapsuleGeometry(0.2, 0.9, 3, 8).translate(0, 0.72, 0);
  const mesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), n);
  const rand = rng(909);
  const cols = ['#c0392b', '#2f6fd6', '#f2f2f0', '#1f2328', '#e0a526', '#2e9c6a', '#7b4fd6', '#d1495b'];
  const c = new THREE.Color();
  const sk = [];
  for (let i = 0; i < n; i++) {
    sk.push({ a: rand() * Math.PI * 2, rx: iw / 2 - 1.6 - rand() * (iw / 2 - 5), rz: id / 2 - 1.4 - rand() * (id / 2 - 3.5), w: 0.18 + rand() * 0.22 });
    mesh.setColorAt(i, c.set(cols[i % cols.length]));
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  const holder = new THREE.Group();
  const [hx, hz] = toW(F, 0, 0);
  holder.position.set(hx, 0, hz);
  holder.rotation.y = -F.a;
  holder.add(mesh);
  L.people.add(holder);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  ctx.dynamic.push({
    update(dt) {
      if (!L.people.visible || !L.group.visible) return;
      sk.forEach((k, i) => {
        k.a += k.w * dt;
        p.set(cx + Math.cos(k.a) * k.rx, y0 + 0.08, cz + Math.sin(k.a) * k.rz);
        q.setFromAxisAngle(up, -k.a);
        m.compose(p, q, s1);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  });
}
