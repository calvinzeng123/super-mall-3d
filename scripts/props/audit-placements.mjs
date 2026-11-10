// 核对场景里每一件贴图模型摆得对不对。在真实页面里跑：逐层把楼层细节建出来，取出每件模型的世界矩阵，
// 对照布局数据（楼板、洞口、墙、店门、扶梯口、电梯门、出入口）和其他模型逐条检查。
//
// 用法：先起开发服务（python3 serve.py 5174），再
//   node scripts/props/audit-placements.mjs [http://127.0.0.1:5174/index.html] [只查这些楼层，逗号分隔；场地写 site]
// 需要本机有 Playwright 和 Chromium。有问题时退出码为 1，逐条列出楼层、模型、位置和原因。
//
// 规则：
//   support   落地的模型要在楼板上，不能悬在中庭、扶梯洞口上
//   wall      墙不能从模型中间穿过（挂墙的画、卷帘门除外）
//   overlap   落地的模型之间不能互相穿插（椅子塞进桌下 0.3 m 以内算正常；花坛里的植物互相挨着算正常）
//   facing    椅子、沙发 1.4 m 内有桌子时要朝着桌子
//   height    高度要说得通：贴地、放在别的模型上、吊在天花、或挂在墙上
//   access    店门、扶梯口、电梯门、出入口前要留出通道
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const [url = 'http://127.0.0.1:5174/index.html', only = ''] = process.argv.slice(2);

/** 在页面里执行：收集 levelId 这一层的模型并检查。返回 { count, findings, byId }。 */
async function auditLevel(levelId) {
  const app = window.__mall, props = app.ctx.props, layout = app.ctx.layout;
  const THREE = await import('three');
  const geom = await import('/src/layout/geom.js');
  // 留空区域（店门、扶梯口、电梯门、出入口）和摆放时用的是同一份规则；坐具、桌子的名单和成组陈设的检查共用
  const zonesOf = (await import('/src/layout/access-zones.js')).accessZones;
  const { SEATS, TABLES, penetration } = await import('/scripts/props/set-rules.mjs');
  const nav = app.explore.navigation;
  const site = levelId === 'site';
  const lv = site ? null : layout.levels.find((l) => l.id === levelId);
  const group = site ? app.ctx.site.group : app.ctx.levels[levelId]?.group;
  if (!group) return { count: 0, findings: [], byId: {} };
  const F = site ? nav.floors.get('ground') : nav.floors.get(levelId);
  const elev = site ? 0 : lv.elev, height = site ? 99 : lv.height || 5;

  const PLANT = /^(plant_|flower_)/;

  // ---------- 收集 ----------
  group.updateMatrixWorld(true);
  const items = [], M = new THREE.Matrix4(), W = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isInstancedMesh || !o.userData.prop || o.userData.lod !== 'near') return;
    const id = o.userData.prop, t = props.template(id), rec = props.info(id);
    if (!t) return;
    const inv = t.near.matrix.clone().invert();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M); W.multiplyMatrices(o.matrixWorld, M).multiply(inv);
      const e = W.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      const at = (lx, lz) => [e[0] * lx + e[8] * lz + e[12], e[2] * lx + e[10] * lz + e[14]];
      const corners = [at(rec.min[0], rec.min[2]), at(rec.max[0], rec.min[2]), at(rec.max[0], rec.max[2]), at(rec.min[0], rec.max[2])];
      const c = at((rec.min[0] + rec.max[0]) / 2, (rec.min[2] + rec.max[2]) / 2);
      items.push({ id, x: c[0], z: c[1], y0: e[13] + rec.min[1] * sy, y1: e[13] + rec.max[1] * sy, corners,
        front: [e[8] / sz, e[10] / sz], w: (rec.max[0] - rec.min[0]) * sx, d: (rec.max[2] - rec.min[2]) * sz,
        mount: rec.mount || 'floor' });
    }
  });

  // ---------- 小工具 ----------
  const inPoly = geom.pointInPoly;
  const segSeg = (a, b, c, d) => {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  const shrink = (corners, by) => {
    const cx = corners.reduce((s, p) => s + p[0], 0) / 4, cz = corners.reduce((s, p) => s + p[1], 0) / 4;
    return corners.map(([x, z]) => { const dx = x - cx, dz = z - cz, len = Math.hypot(dx, dz) || 1, k = Math.max(0, len - by * 1.4) / len; return [cx + dx * k, cz + dz * k]; });
  };
  const distToSeg = (p, s) => {
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0, t = Math.max(0, Math.min(1, ((p[0] - s.x0) * dx + (p[1] - s.z0) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p[0] - s.x0 - dx * t, p[1] - s.z0 - dz * t);
  };
  const findings = [];
  const flag = (rule, it, why) => findings.push({ rule, level: levelId, id: it.id, x: +it.x.toFixed(2), z: +it.z.toFixed(2), y: +it.y0.toFixed(2), why });
  const onFloor = (it) => it.mount === 'floor' && Math.abs(it.y0 - elev) <= 0.1;

  // ---------- 出入口：店门、扶梯口、电梯门、楼栋入口 ----------
  const keepClear = site ? [] : zonesOf(layout, lv); // [{ what, poly } | { what, circle } | { what, seg, reach }]
  if (site) for (const e of layout.entrances || []) if (e.to === 'site') keepClear.push({ what: `出入口 ${e.id}`, seg: e.seg, reach: 1.2 });

  // ---------- 逐件检查 ----------
  const pieces = F?.pieces || [], walls = F?.walls || [];
  for (const it of items) {
    const dy = it.y0 - elev;
    // height
    if (it.mount === 'ceiling') { if (!site && (it.y1 - elev < 2.3 || it.y1 - elev > height + .05)) flag('height', it, `吊装件的顶在楼面以上 ${(it.y1 - elev).toFixed(2)} m，本层层高 ${height} m`); }
    else if (it.mount === 'wall') { if (dy < -0.05 || dy > 3.4) flag('height', it, `挂墙件的底在楼面以上 ${dy.toFixed(2)} m`); }
    else if (dy < -0.12 && !site) flag('height', it, `底面比楼面低 ${(-dy).toFixed(2)} m`);
    else if (dy > 0.1 && !site) {
      // 不贴地：要么放在别的模型顶上，要么放在程序化的台面上（后者这里判断不了，另列出来目视）
      const host = items.find((o) => o !== it && o.mount === 'floor' && Math.abs(o.y1 - it.y0) < 0.09 && inPoly([it.x, it.z], o.corners));
      if (!host) { if (dy > 2.2) flag('height', it, `离楼面 ${dy.toFixed(2)} m，下面没有承托它的模型`); else it.unsupported = true; }
      else it.host = host.id;
    }
    if (!onFloor(it)) continue;
    // support
    if (!site) {
      const piece = pieces.find((p) => inPoly([it.x, it.z], p.outer));
      if (!piece) flag('support', it, '不在本层楼板范围内');
      else if (piece.holes.some((h) => inPoly([it.x, it.z], h.poly))) flag('support', it, '在洞口上方（中庭、扶梯口或竖井）');
      else {
        const off = it.corners.filter((c) => !pieces.some((p) => inPoly(c, p.outer) && !p.holes.some((h) => inPoly(c, h.poly)))).length;
        if (off >= 2 && Math.max(it.w, it.d) > 0.5) flag('support', it, `有 ${off} 个角伸出了楼板或伸到洞口上`);
      }
    } else {
      const b = layout.buildings.find((q) => q.kind !== 'metro' && !q.undergroundOnly && q.outline && inPoly([it.x, it.z], q.outline));
      if (b) flag('support', it, `场地上的模型落在 ${b.id} 的楼体范围里`);
      const river = layout.site?.river?.channel;
      if (river && inPoly([it.x, it.z], river)) flag('support', it, '在江面上');
    }
    // wall：墙穿过缩小 6 cm 后的底面
    if (Math.min(it.w, it.d) > 0.12) {
      const inner = shrink(it.corners, 0.06);
      const hit = walls.find((s) => Math.hypot(s.x1 - s.x0, s.z1 - s.z0) > 0.3 && distToSeg([it.x, it.z], s) < Math.max(it.w, it.d)
        && [0, 1, 2, 3].some((i) => segSeg([s.x0, s.z0], [s.x1, s.z1], inner[i], inner[(i + 1) % 4])));
      if (hit) flag('wall', it, `一段墙（${hit.x0.toFixed(1)},${hit.z0.toFixed(1)} → ${hit.x1.toFixed(1)},${hit.z1.toFixed(1)}）从它中间穿过`);
    }
    // access
    if (Math.max(it.w, it.d) > 0.3) for (const k of keepClear) {
      let blocked = false;
      if (k.poly) blocked = inPoly([it.x, it.z], k.poly) || it.corners.filter((c) => inPoly(c, k.poly)).length >= 2;
      else if (k.circle) blocked = Math.hypot(it.x - k.circle[0], it.z - k.circle[1]) < k.circle[2];
      else if (k.seg) blocked = distToSeg([it.x, it.z], k.seg) < k.reach;
      if (blocked) { flag('access', it, `挡在${k.what}`); break; }
    }
    // facing
    if (SEATS.has(it.id)) {
      const reach = /sofa|armchair|lounge/.test(it.id) ? 2.3 : 1.4;
      let table = null, best = reach;
      for (const o of items) { if (!TABLES.has(o.id) || !onFloor(o)) continue; const d = Math.hypot(o.x - it.x, o.z - it.z); if (d < best) { best = d; table = o; } }
      if (table) {
        const dot = (it.front[0] * (table.x - it.x) + it.front[1] * (table.z - it.z)) / (best || 1);
        if (dot < 0.2) flag('facing', it, `${best.toFixed(2)} m 外有一张 ${table.id}，但它${dot < -0.3 ? '背对' : '侧对'}桌子（夹角余弦 ${dot.toFixed(2)}）`);
      }
    }
  }
  // overlap
  const floor = items.filter(onFloor);
  for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
    const a = floor[i], b = floor[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) > (Math.hypot(a.w, a.d) + Math.hypot(b.w, b.d)) / 2) continue;
    if (PLANT.test(a.id) && PLANT.test(b.id)) continue;
    const depth = penetration(a.corners, b.corners);
    if (!depth) continue;
    const seatTable = (SEATS.has(a.id) && TABLES.has(b.id)) || (SEATS.has(b.id) && TABLES.has(a.id));
    const plantIn = (PLANT.test(a.id) && /planter|pot/.test(b.id)) || (PLANT.test(b.id) && /planter|pot/.test(a.id));
    if (plantIn) continue;
    if (depth > (seatTable ? 0.32 : 0.1)) flag('overlap', a, `和 ${b.id}（${b.x.toFixed(2)},${b.z.toFixed(2)}）互相穿插 ${depth.toFixed(2)} m`);
  }
  const byId = {};
  for (const it of items) byId[it.id] = (byId[it.id] || 0) + 1;
  const eyeball = {};
  for (const it of items) if (it.unsupported) eyeball[it.id] = (eyeball[it.id] || 0) + 1;
  return { count: items.length, findings, byId, eyeball };
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('页面报错：', String(e.stack || e).slice(0, 400)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.click('[data-mode=tour]');
  await page.waitForFunction(() => window.__mall && document.getElementById('loading').hidden && !document.getElementById('ylLauncher'), null, { timeout: 300000 });
  await page.evaluate(() => { window.__mall.setQuality('low'); window.__mall.ctx.peopleQuality?.setDensity(0); });
  // 进一次漫游，让导航模型建出来
  await page.evaluate(() => window.__mall.explore.teleport({ level: 'P1-1F' }));
  await page.waitForFunction(() => window.__mall.explore.navigation, null, { timeout: 120000 });
  const plan = await page.evaluate(() => {
    const app = window.__mall, s = app.floorStreaming;
    const streamed = [...new Set([...(s.resident || []), ...(s.deferred || [])])];
    const eager = Object.keys(app.ctx.levels).filter((id) => !streamed.includes(id));
    return { streamed, eager };
  });
  const wanted = only ? only.split(',') : null;
  const totals = { count: 0, byRule: {}, byId: {}, eyeball: {} }, all = [];
  const run = async (id) => {
    const r = await page.evaluate(auditLevel, id);
    totals.count += r.count;
    for (const [k, v] of Object.entries(r.byId)) totals.byId[k] = (totals.byId[k] || 0) + v;
    for (const [k, v] of Object.entries(r.eyeball || {})) totals.eyeball[k] = (totals.eyeball[k] || 0) + v;
    for (const f of r.findings) { totals.byRule[f.rule] = (totals.byRule[f.rule] || 0) + 1; all.push(f); }
    if (r.count) console.log(`${id.padEnd(10)} ${String(r.count).padStart(5)} 件  ${r.findings.length ? r.findings.length + ' 处问题' : '没有问题'}`);
  };
  // 常驻的楼层和场地
  await page.evaluate(() => window.__mall.ctx.props.idle());
  if (!wanted || wanted.includes('site')) await run('site');
  for (const id of plan.eager) if (!wanted || wanted.includes(id)) await run(id);
  // 按需加载的楼层：逐层传送过去，等细节和模型都建好
  for (const id of plan.streamed) {
    if (wanted && !wanted.includes(id)) continue;
    await page.evaluate((level) => window.__mall.explore.teleport({ level }), id);
    try { await page.waitForFunction((level) => window.__mall.floorStreaming.resident.includes(level), id, { timeout: 90000 }); }
    catch { console.log(`${id}: 这一层的细节没有建出来，跳过`); continue; }
    await page.evaluate(() => window.__mall.ctx.props.idle());
    await run(id);
  }
  console.log(`\n共 ${totals.count} 件模型，${Object.keys(totals.byId).length} 种。`);
  // 摆放时被保险拦下、没有摆出来的件数（挡了通道 / 脚下没有楼板 / 墙从中间穿过）
  const held = await page.evaluate(() => { const s = window.__mall.ctx.props.stats; return { keptClear: s.keptClear || 0, unfit: s.unfit || 0, walled: s.walled || 0 }; });
  console.log(`摆放时拦下没摆的：挡通道 ${held.keptClear}，脚下没有楼板 ${held.unfit}，被墙穿过 ${held.walled}。`);
  console.log('各种模型的件数：' + Object.entries(totals.byId).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('，'));
  if (Object.keys(totals.eyeball).length) console.log('放在程序化台面上、需要目视的：' + Object.entries(totals.eyeball).map(([k, v]) => `${k} ${v}`).join('，'));
  if (all.length) {
    failed = true;
    console.log(`\n问题 ${all.length} 处：` + Object.entries(totals.byRule).map(([k, v]) => `${k} ${v}`).join('，'));
    const groups = new Map();
    for (const f of all) { const key = `${f.rule}|${f.id}|${f.why.replace(/[-\d.]+/g, '#')}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f); }
    for (const list of [...groups.values()].sort((a, b) => b.length - a.length)) {
      const f = list[0];
      console.log(`  [${f.rule}] ${f.id} × ${list.length}：${f.why}   例：${list.slice(0, 3).map((q) => `${q.level} (${q.x}, ${q.z})`).join('；')}`);
    }
  } else console.log('没有发现问题。');
} finally { await browser.close(); }
process.exit(failed ? 1 : 0);
