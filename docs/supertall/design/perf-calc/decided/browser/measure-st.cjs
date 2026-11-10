// node measure.cjs <label> <url> <outDir> [quality]
// HANDOFF §8: renderer.info.autoReset = false, reset before one debugShot frame, read the totals.
// GPU memory: WebGL2 buffer/texture allocations are tracked with prototype hooks (the app frees
// the CPU arrays and canvases after upload, so the scene alone can't report texture sizes).
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const fs = require('fs');
const [label, URL, OUT, quality = 'high'] = process.argv.slice(2);
const VIEWS = process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [
  ['campus', [110, 430, 480], [0, 0, 0]],
  ['N1', [-150, 115, -380], [-236, 55, -232]],
  ['R1', [260, 260, -760], [-60, 0, -300]],
];

function glHooks() {
  const P = WebGL2RenderingContext.prototype;
  const M = window.__glmem = { buf: new Map(), tex: new Map(), rt: new Set(), rb: new Map() };
  const per = new WeakMap();
  const S = gl => { let s = per.get(gl); if (!s) per.set(gl, s = { b: {}, unit: 0x84C0, t: {}, rb: null }); return s; };
  const wrap = (name, fn) => { const o = P[name]; if (!o) return; P[name] = function (...a) { fn.call(this, a); return o.apply(this, a); }; };
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x8051: 4, 0x8C41: 4, 0x8229: 1, 0x822B: 2, 0x881A: 8, 0x8814: 16, 0x822D: 2, 0x822F: 4,
    0x8815: 16, 0x881B: 8, 0x8C3A: 4, 0x81A6: 4, 0x88F0: 4, 0x8CAC: 4, 0x81A5: 2, 0x1908: 4, 0x1907: 4, 0x1909: 1, 0x190A: 2, 0x1906: 1 };
  const bpp = f => BPP[f] || 4;
  const CUBE = 0x8513;
  const texOf = (gl, target) => { const s = S(gl); const t = target >= 0x8515 && target <= 0x851A ? CUBE : target; return s.t[s.unit]?.[t]; };
  const rec = tex => { let r = M.tex.get(tex); if (!r) M.tex.set(tex, r = { storage: 0, levels: new Map(), mip: false }); return r; };
  wrap('bindBuffer', function ([t, b]) { S(this).b[t] = b; });
  wrap('bufferData', function ([t, d]) { const b = S(this).b[t]; if (b) M.buf.set(b, typeof d === 'number' ? d : (d?.byteLength || 0)); });
  wrap('deleteBuffer', function ([b]) { M.buf.delete(b); });
  wrap('activeTexture', function ([u]) { S(this).unit = u; });
  wrap('bindTexture', function ([t, x]) { const s = S(this); (s.t[s.unit] ||= {})[t] = x; });
  wrap('texStorage2D', function ([t, levels, f, w, h]) {
    const tex = texOf(this, t); if (!tex) return; let n = 0;
    for (let l = 0; l < levels; l++) n += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(f);
    rec(tex).storage = n * (t === CUBE ? 6 : 1);
  });
  wrap('texStorage3D', function ([t, levels, f, w, h, d]) {
    const tex = texOf(this, t); if (!tex) return; let n = 0;
    for (let l = 0; l < levels; l++) n += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(f);
    rec(tex).storage = n * d;
  });
  wrap('texImage2D', function (a) {
    const [t, level, f] = a, tex = texOf(this, t); if (!tex) return;
    let w, h;
    if (a.length >= 8) { w = a[3]; h = a[4]; } else { const s = a[5]; w = s?.videoWidth || s?.naturalWidth || s?.width || 0; h = s?.videoHeight || s?.naturalHeight || s?.height || 0; }
    rec(tex).levels.set(`${t}/${level}`, w * h * bpp(f));
  });
  wrap('texImage3D', function (a) {
    const [t, level, f, w, h, d] = a, tex = texOf(this, t); if (!tex) return;
    rec(tex).levels.set(`${t}/${level}`, w * h * d * bpp(f));
  });
  wrap('compressedTexImage2D', function (a) { const tex = texOf(this, a[0]); if (tex) rec(tex).levels.set(`${a[0]}/${a[1]}`, a[6]?.byteLength || 0); });
  wrap('generateMipmap', function ([t]) { const tex = texOf(this, t); if (tex) rec(tex).mip = true; });
  wrap('deleteTexture', function ([x]) { M.tex.delete(x); M.rt.delete(x); });
  wrap('framebufferTexture2D', function ([, , , tex]) { if (tex) M.rt.add(tex); });
  wrap('bindRenderbuffer', function ([, rb]) { S(this).rb = rb; });
  wrap('renderbufferStorage', function ([, f, w, h]) { const rb = S(this).rb; if (rb) M.rb.set(rb, w * h * bpp(f)); });
  wrap('renderbufferStorageMultisample', function ([, n, f, w, h]) { const rb = S(this).rb; if (rb) M.rb.set(rb, w * h * bpp(f) * Math.max(1, n)); });
  wrap('deleteRenderbuffer', function ([rb]) { M.rb.delete(rb); });
  window.__glmemStats = () => {
    let buf = 0, tex = 0, rt = 0, rb = 0, ntex = 0;
    for (const n of M.buf.values()) buf += n;
    for (const [x, r] of M.tex) {
      let lv = 0; for (const n of r.levels.values()) lv += n;
      const n = r.storage || (r.mip ? lv * 4 / 3 : lv);
      if (M.rt.has(x)) rt += n; else { tex += n; ntex++; }
    }
    for (const n of M.rb.values()) rb += n;
    return { gpuBufferBytes: buf, gpuTextureBytes: tex, gpuTextures: ntex, renderTargetBytes: rt + rb };
  };
}

function setup(quality) {
  const app = window.__mall, r = app.renderer;
  app.setQuality(quality);
  r.info.autoReset = false;
  const phase = window.__phase = { list: [] };
  const sm = r.shadowMap, smRender = sm.render;
  sm.render = function (...a) {
    const c = r.info.render.calls, t = r.info.render.triangles;
    smRender.apply(this, a);
    phase.list.push({ kind: 'shadow', calls: r.info.render.calls - c, triangles: r.info.render.triangles - t });
  };
  const render = r.render;
  r.render = function (scene, camera) {
    const c = r.info.render.calls, t = r.info.render.triangles, sh = phase.list.length;
    render.call(this, scene, camera);
    let calls = r.info.render.calls - c, triangles = r.info.render.triangles - t;
    for (const p of phase.list.slice(sh)) { calls -= p.calls; triangles -= p.triangles; }
    phase.list.push({ kind: camera.layers.mask === 2 ? 'labels' : camera.isOrthographicCamera ? 'post' : 'main', calls, triangles });
  };
  return { quality: app.quality.tier, shadows: app.quality.shadows, shadowSize: app.quality.shadowSize, bloom: app.quality.bloom, crowd: app.quality.crowdDensity };
}

function measureView([pos, target]) {
  const app = window.__mall, r = app.renderer;
  app.debugShot({ pos, target, steps: 3 }); // warm: programs, uploads, lazy LOD
  window.__phase.list = [];
  r.info.reset();
  const url = app.debugShot({ pos, target, steps: 1 });
  const sum = k => window.__phase.list.filter(p => p.kind === k).reduce((n, p) => ({ calls: n.calls + p.calls, triangles: n.triangles + p.triangles }), { calls: 0, triangles: 0 });
  return { url, total: { calls: r.info.render.calls, triangles: r.info.render.triangles }, main: sum('main'), shadow: sum('shadow'), labels: sum('labels'), post: sum('post') };
}

function perBuilding() {
  const app = window.__mall, cam = app.camera, THREE_F = cam.projectionMatrix.constructor;
  cam.updateMatrixWorld();
  const pm = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
  const fr = new (Object.getPrototypeOf(app.camera).constructor === undefined ? Object : Object)();
  const out = {};
  const visibleChain = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const box = (o) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); return o.geometry.boundingSphere; };
  const planes = [];
  const e = pm.elements;
  const P = (a, b, c, d) => { const l = Math.hypot(a, b, c); planes.push([a / l, b / l, c / l, d / l]); };
  P(e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]); P(e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]);
  P(e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]); P(e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]);
  P(e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]); P(e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]);
  const inFrustum = (o) => { if (!o.frustumCulled) return true; const s = box(o); if (!s) return true; const c = s.center.clone().applyMatrix4(o.matrixWorld); const r = s.radius * o.matrixWorld.getMaxScaleOnAxis(); return planes.every(([a, b, cc, d]) => a * c.x + b * c.y + cc * c.z + d >= -r); };
  const add = (id, o) => {
    const r = (out[id] ||= { meshes: 0, calls: 0, tris: 0, inst: 0 });
    const m = [].concat(o.material)[0];
    const tri = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    r.meshes++; r.calls += (m.transparent && m.side === 2 && !m.forceSinglePass) ? 2 : 1; r.tris += tri; if (o.isInstancedMesh) r.inst++;
  };
  for (const g of app.ctx.root.children) {
    g.traverse((o) => { if (!(o.isMesh) || !o.layers.test(cam.layers)) return; if (o.isInstancedMesh && !o.count) return; if (!visibleChain(o) || !inFrustum(o)) return; add(g.name || 'unnamed', o); });
  }
  for (const k in out) out[k].tris = Math.round(out[k].tris);
  return out;
}

function sceneMemory() {
  const app = window.__mall, seen = new Set(), arrays = new Set();
  let geometryBytes = 0, vertices = 0, instanceBytes = 0, meshes = 0;
  const bytes = a => { if (!a) return 0; const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (!arr || arrays.has(arr)) return 0; arrays.add(arr); return arr.byteLength; };
  app.scene.traverse(o => {
    if (o.isMesh || o.isLine || o.isPoints) meshes++;
    if (o.isInstancedMesh) instanceBytes += (o.instanceMatrix?.array?.byteLength || 0) + (o.instanceColor?.array?.byteLength || 0);
    const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g);
    vertices += g.attributes.position?.count || 0;
    geometryBytes += g.userData.bufferBytes ?? (Object.values(g.attributes).reduce((n, a) => n + bytes(a), 0) + bytes(g.index));
  });
  const textures = new Set();
  app.scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) if (v?.isTexture) textures.add(v); });
  return { geometries: seen.size, meshes, vertices, geometryBytes, instanceBytes, sceneTextures: textures.size,
    persistent: app.floorStreaming.persistentGeometry, info: { ...app.renderer.info.memory, programs: app.renderer.info.programs?.length },
    ...window.__glmemStats(), jsHeap: performance.memory?.usedJSHeapSize };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  p.on('pageerror', e => { errors.push(e.message); console.log('PAGEERR', e.message); });
  p.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE', m.text().slice(0, 300)); } });
  p.setDefaultTimeout(1800000);
  await p.addInitScript(glHooks);
  const t0 = Date.now();
  await p.goto(URL);
  const tHtml = Date.now();
  await p.click('[data-mode=tour]');
  const tClick = Date.now();
  await p.waitForFunction(() => window.__mall && window.__mall.explore, null, { timeout: 1800000, polling: 200 });
  const tReady = Date.now();
  const load = { htmlSeconds: (tHtml - t0) / 1000, buildSeconds: (tReady - tClick) / 1000, totalSeconds: (tReady - t0) / 1000 };
  console.log(label, 'load', JSON.stringify(load));
  if (process.env.LOAD_ONLY) { await b.close(); return; }
  await p.waitForTimeout(3000);
  const q = await p.evaluate(setup, quality);
  const memLoad = await p.evaluate(sceneMemory);
  const views = {};
  for (const v of VIEWS) {
    const t = Date.now();
    const res = await p.evaluate(measureView, v.slice(1));
    res.perBuilding = await p.evaluate(perBuilding);
    fs.writeFileSync(`${OUT}/${label}-${v[0]}.jpg`, Buffer.from(res.url.split(',')[1], 'base64'));
    delete res.url;
    res.seconds = (Date.now() - t) / 1000;
    views[v[0]] = res;
    console.log(label, v[0], JSON.stringify(res));
  }
  const memAfter = await p.evaluate(sceneMemory);
  const out = { label, url: URL, quality: q, load, memLoad, views, memAfter, errors };
  fs.writeFileSync(`${OUT}/${label}.json`, JSON.stringify(out, null, 1));
  console.log(label, 'mem', JSON.stringify(memAfter));
  console.log('errors', errors.length);
  await b.close();
})();
