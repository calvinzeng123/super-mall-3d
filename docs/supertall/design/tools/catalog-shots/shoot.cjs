#!/usr/bin/env node
// Home catalog shooter: one browser session, a JSON list of shots -> 1280x800 JPEGs + a JSONL log.
// node shoot.cjs --spec shots.json --out <dir> [--port 5302] [--repo /home/user/super-mall-3d]
//                [--url <page url>] [--no-serve] [--log <file>] [--jpeg 0.88] [--preset balanced]
//                [--only name1,name2] [--skip-existing]
// See README.md for the spec format.
const fs = require('fs'), path = require('path'), net = require('net'), http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('/opt/node-tools/node_modules/playwright');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const SPEC = opt('spec'), OUT = path.resolve(opt('out', '.'));
const PORT = +opt('port', 5302), REPO = path.resolve(opt('repo', '/home/user/super-mall-3d'));
const URL = opt('url', `http://127.0.0.1:${PORT}/dist/mall.html`);
const LOG = path.resolve(opt('log', path.join(OUT, 'shots.log.jsonl')));
const JPEG = +opt('jpeg', 0.88), PRESET = opt('preset', 'balanced');
const ONLY = opt('only') ? new Set(opt('only').split(',')) : null;
const SKIP = flag('skip-existing'), SERVE = !flag('no-serve');
const SHOT_TIMEOUT = +opt('shot-timeout', 420) * 1000;
if (!SPEC) { console.error('usage: node shoot.cjs --spec shots.json --out DIR [--port 5302]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const HERE = __dirname;
const helperSrc = ['vr-helpers.js', 'plan-core.js', 'cat-helpers.js'].map((f) => fs.readFileSync(path.join(HERE, f), 'utf8'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const memAvail = () => { try { return Math.round(+/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))[1] / 1024); } catch { return 99999; } };

let spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
if (!Array.isArray(spec)) spec = spec.shots;
if (ONLY) spec = spec.filter((s) => ONLY.has(s.name));

// ---------------- http server ----------------
let server = null;
const portOpen = () => new Promise((res) => { const s = net.connect(PORT, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
const urlOk = () => new Promise((res) => { http.get(URL, (r) => { r.resume(); res(r.statusCode === 200); }).on('error', () => res(false)); });
async function ensureServer() {
  if (await portOpen()) { log('port', PORT, 'already serving'); return; }
  if (!SERVE) throw new Error(`nothing listens on ${PORT} (and --no-serve)`);
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', REPO], { stdio: ['ignore', 'ignore', 'ignore'] });
  log('http.server pid', server.pid, 'port', PORT, 'dir', REPO);
  for (let i = 0; i < 50 && !(await portOpen()); i++) await sleep(200);
}

// ---------------- browser ----------------
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'];
let b = null, p = null, crashed = false, errs = [];
async function open() {
  if (b) await b.close().catch(() => {});
  b = null; p = null;
  while (memAvail() < 3000) { log('waiting for memory, avail', memAvail(), 'MB'); await sleep(5000); }
  b = await chromium.launch({ args: ARGS });
  p = await b.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  crashed = false;
  p.on('crash', () => { crashed = true; errs.push('CRASH'); log('CRASH'); });
  p.on('pageerror', (e) => { errs.push('PAGEERR ' + e.message.slice(0, 300)); log('PAGEERR', e.message.slice(0, 200)); });
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 300)); });
  p.setDefaultTimeout(900000);
  const t0 = Date.now();
  await p.goto(URL);
  await p.click('[data-mode=tour]');
  await p.waitForFunction(() => window.__mall && window.__mall.explore, null, { timeout: 900000, polling: 1000 });
  for (const src of helperSrc) await p.evaluate(src);
  await p.evaluate(({ q, preset }) => {
    const a = window.__mall; window.__catJpegQ = q;
    a.setQuality(preset); a.setLabels(false); a.setNight(false); window.__vr.pause();
    return true;
  }, { q: JPEG, preset: PRESET });
  log('page loaded', ((Date.now() - t0) / 1000).toFixed(1), 's');
}
const alive = async () => { if (!b || !p || crashed || !b.isConnected()) return false; try { return await p.evaluate(() => !!window.__cat); } catch { return false; } };
const ev = (fn, arg) => p.evaluate(fn, arg ?? null);
const waitRes = (id) => p.waitForFunction((id) => window.__mall.residenceCache.includes(id), id, { timeout: 300000, polling: 500 }).then(() => true, () => false);
const withTimeout = (pr, ms, what) => Promise.race([pr, sleep(ms).then(() => { throw new Error('timeout ' + what); })]);

// ---------------- shots ----------------
async function runShot(s) {
  const kind = s.kind || 'top';
  if (kind === 'top') {
    const f = await ev((s) => window.__cat.focusFor(s), s);
    const res = await waitRes(f.level);
    const r = await ev((s) => window.__cat.topShot(s), s);
    return { ...r, resLoaded: res };
  }
  if (kind === 'interior' || kind === 'master' || kind === 'explore') {
    // explore = raw first-person view: { level, stand:[x,z], look:[x,z], pitch? } (unit/home optional)
    const s2 = kind === 'explore' ? { ...s, pitch: s.pitch ?? 0 }
      : { ...s, room: s.room || (kind === 'master' ? 'master' : 'living'), pitch: s.pitch ?? (kind === 'master' ? -0.22 : -0.08) };
    const e = await ev((s) => window.__cat.enterFor(s), s2);
    if (e.err) throw new Error(e.err + ' ' + JSON.stringify(e.room));
    const res = await waitRes(e.level);
    await ev(() => { window.__vr.tick(0.3); return true; });
    const r = await ev((s) => window.__cat.interiorShot(s), s2);
    return { ...r, resLoaded: res };
  }
  if (kind === 'orbit') { // raw: { pos, target, focus?: levelId, steps? }
    await ev((s) => { const a = window.__mall; if (a.explore.active) a.exitExplore(); a.setNight(!!s.night); a.setLabels(false);
      if (s.focus) a.setFocus(s.focus); else a.reset(true); a.cancelFlight(); return true; }, s);
    if (s.focus) await waitRes(s.focus);
    const url = await ev((s) => { window.__vr.tick(0.3); return window.__mall.debugShot({ w: s.w || 1280, h: s.h || 800, steps: s.steps ?? 2, pos: s.pos, target: s.target }); }, s);
    return { url };
  }
  throw new Error('unknown kind ' + kind);
}

(async () => {
  await ensureServer();
  if (!(await urlOk())) throw new Error('page not reachable: ' + URL);
  await open();
  const summary = [];
  for (const s of spec) {
    const file = path.join(OUT, `${s.name}.jpg`);
    if (SKIP && fs.existsSync(file)) { log('skip', s.name); continue; }
    let rec = null;
    for (let k = 0; k < 2; k++) {
      const t0 = Date.now();
      errs = [];
      try {
        if (!(await alive())) { log('reopening page'); await open(); }
        await ev(() => { if (window.gc) window.gc(); return true; }).catch(() => {});
        const r = await withTimeout(runShot(s), SHOT_TIMEOUT, s.name);
        const st = await ev((u) => window.__cat.stats(u), r.url);
        if (st.blank && k === 0) throw new Error(`blank image mean=${st.mean} std=${st.std}`);
        fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
        delete r.url;
        rec = { name: s.name, file, ok: true, attempt: k + 1, secs: (Date.now() - t0) / 1000, spec: s, stats: st, ...r, errors: errs.slice(0, 10) };
        break;
      } catch (e) {
        log('ERR', s.name, 'attempt', k + 1, String(e.message || e).slice(0, 300));
        rec = { name: s.name, file: null, ok: false, attempt: k + 1, secs: (Date.now() - t0) / 1000, spec: s, err: String(e.message || e).slice(0, 500), errors: errs.slice(0, 10) };
        try { await open(); } catch (e2) { log('reopen failed', e2.message); }
      }
    }
    fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
    summary.push(rec);
    const h = rec.hud ? ` hud="${rec.hud.where}" at=${rec.unitAt?.unit || '-'}/${rec.roomAt?.name || '-'} clear=${rec.clear}` : '';
    log(rec.ok ? 'ok ' : 'FAIL', s.name, rec.secs.toFixed(1) + 's', rec.stats ? `mean=${rec.stats.mean} std=${rec.stats.std}` : '', h);
  }
  if (b) await b.close().catch(() => {});
  if (server) server.kill();
  const bad = summary.filter((r) => !r.ok).length;
  log('done', summary.length, 'shots,', bad, 'failed; log', LOG);
  process.exit(bad ? 1 : 0);
})().catch(async (e) => {
  log('FATAL', e.stack);
  if (b) await b.close().catch(() => {});
  if (server) server.kill();
  process.exit(3);
});
process.on('SIGTERM', () => { if (server) server.kill(); if (b) b.close().catch(() => {}); process.exit(143); });
