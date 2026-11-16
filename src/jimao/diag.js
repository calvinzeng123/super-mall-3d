// 零点突围：手机上的诊断面板。设置 → 诊断信息 · 显示（主屏幕打开的网页没法带网址参数），或网址加 ?diag=1；选择会记住。
// 用来远程排查「黑屏」「走不动」这类只在某台手机上出现的问题：截一张图就能看出是哪一类。
//   版本：构建时间 + 提交（确认跑的是不是新版本）、iOS 版本、是不是从主屏幕打开
//   画面 / 帧：视口、像素比、绘图缓冲尺寸；帧率、原始帧间隔、超过 50ms 的长帧数
//   画质 / 绘制：档位、贴图、HDR / 遮蔽 / 柔光；每帧 draw call、三角形、着色器程序
//   上屏：这一帧是不是正常画进离屏图再调色上屏（grade / SCREEN!）、屏幕中心像素、GL 错误、着色器编译错误、显存回收
//   输入：触屏 / 鼠标、移动量、最近几次触摸的原始 id（负数也照实显示）和落点、备用摇杆用了几帧
//   玩家：位置、楼层、速度（物理 / 实测）、在不在地上、游戏状态；各模块的报错
// 不显示时所有钩子都是空操作：不读像素、不查 GL 错误、renderer.info 照常每次自动清零。
export const DIAG_KEY = 'jimao.diag.v1';
const BUILD = typeof __JM_BUILD__ !== 'undefined' ? __JM_BUILD__ : 'dev';

export function diagWanted(params) {
  if (params?.diag === '1') return true;
  try { return localStorage.getItem(DIAG_KEY) === '1'; } catch { return false; }
}

export function createDiag({ app, G, renderer, grade, stick, run, params }) {
  const canvas = renderer.domElement, gl = renderer.getContext();
  let on = false, el = null, textT = 0, pixT = 0, fpsEma = 0, rawMs = 0, dtMs = 0, last = 0, longs = [], realV = 0;
  let px = '-', px2 = '-', glErr = 0, shaderErr = 0, lost = false, route = '-', misses0 = 0;
  const touches = [], errors = [];
  let prevPos = null;
  const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : String(v));

  // 着色器编译错误：数一下，再照常打到控制台
  const prevShader = renderer.debug.onShaderError;
  renderer.debug.onShaderError = (g, program, vs, fs) => {
    shaderErr++;
    if (prevShader) return prevShader(g, program, vs, fs);
    try { console.error('[零点突围] 着色器出错', g.getProgramInfoLog(program), g.getShaderInfoLog(vs), g.getShaderInfoLog(fs)); } catch { /* ignore */ }
  };
  const onLost = () => { lost = true; };
  const onTouch = (e) => {
    if (!on) return;
    for (const t of e.changedTouches || []) {
      const tg = e.target, name = tg ? `${tg.tagName || '?'}${tg.id ? `#${tg.id}` : ''}${typeof tg.className === 'string' && tg.className ? `.${tg.className.split(' ')[0]}` : ''}` : '?';
      touches.push(`${e.type[5]}${t.identifier}${t.clientX < innerWidth * 0.45 ? 'L' : 'R'}@${name}`);
    }
    while (touches.length > 6) touches.shift();
  };
  const onError = (e) => { errors.push(String(e?.message || e?.reason?.message || e?.reason || e).slice(0, 90)); while (errors.length > 3) errors.shift(); };
  canvas.addEventListener('webglcontextlost', onLost);
  for (const t of ['touchstart', 'touchend', 'touchcancel']) addEventListener(t, onTouch, { passive: true, capture: true });
  addEventListener('error', onError); addEventListener('unhandledrejection', onError);

  function show(v) {
    on = !!v;
    try { localStorage.setItem(DIAG_KEY, on ? '1' : '0'); } catch { /* 隐私模式 */ }
    if (on && !el) {
      el = document.createElement('pre'); el.className = 'jm-diag';
      document.body.appendChild(el);
    }
    if (el) el.hidden = !on;
    renderer.info.autoReset = !on;
    if (!on) renderer.info.reset();
  }

  function lines() {
    const ua = navigator.userAgent, ios = /OS (\d+[_.]\d+)/.exec(ua)?.[1]?.replace('_', '.') || '-';
    const standalone = !!(navigator.standalone || matchMedia?.('(display-mode: standalone)').matches || matchMedia?.('(display-mode: fullscreen)').matches);
    const q = app.quality || {}, vq = G.quality || {}, env = app.env || {}, info = renderer.info;
    const buf = renderer.getDrawingBufferSize?.(new G.THREE.Vector2()) || { x: 0, y: 0 };
    const inp = G.input || {}, m = inp.move || { x: 0, y: 0 }, p = G.player || {}, pos = p.pos || { x: 0, y: 0, z: 0 };
    const st = G.physics?.stateOf?.(pos), v = p.vel ? Math.hypot(p.vel.x, p.vel.z) : 0;
    const errs = Object.keys(run?.err || {}).map((k) => `${k}${run.msg?.[k] ? `:${run.msg[k]}` : ''}`);
    return [
      `版本 ${BUILD} · iOS ${ios} · 主屏幕 ${standalone ? '是' : '否'}`,
      `画面 ${innerWidth}×${innerHeight} dpr ${fmt(devicePixelRatio, 2)} 渲染 ${fmt(renderer.getPixelRatio(), 2)} 缓冲 ${buf.x}×${buf.y}`,
      `帧 ${fmt(fpsEma, 0)}fps 间隔 ${fmt(rawMs, 0)}ms 步长 ${fmt(dtMs, 0)}ms 长帧/2s ${longs.length}`,
      `画质 ${q.tier || '-'}(${q.preset || '-'}) 原游戏 ${vq.name || '-'} 贴图 ${vq.tex || '-'} hdr ${env.hdr ? 1 : 0} 遮蔽 ${env.aoEnabled ? 1 : 0} 柔光 ${env.dayBloom ? 1 : 0} 室内灯 ${q.indoorLights ?? '-'} 后处理 ${env.composer?.constructor?.name || '无'}`,
      `绘制 ${info.render.calls} 次 ${fmt(info.render.triangles / 1e6, 2)}M 三角 程序 ${info.programs?.length ?? '-'} 贴图 ${info.memory.textures} 几何 ${info.memory.geometries}`,
      `上屏 ${route} 跳过 ${grade.misses - misses0} 中心 ${px} 左上 ${px2} GL错误 ${glErr} 着色器错 ${shaderErr} 显存回收 ${lost ? '是' : '否'}`,
      `输入 ${inp.mode || '-'}${inp.touch ? '·触屏' : ''} 移动 ${fmt(m.x)},${fmt(m.y)} 冲刺 ${inp.sprint ? 1 : 0} 开火 ${inp.fire ? 1 : 0} 备用摇杆 ${stick?.held ? '按住' : '-'}/${stick?.used ?? 0}帧`,
      `触摸 ${touches.join(' ') || '-'}`,
      `玩家 ${fmt(pos.x, 1)},${fmt(pos.y, 1)},${fmt(pos.z, 1)} ${st?.floor || '?'} 速度 ${fmt(v, 2)} 实测 ${fmt(realV, 2)} 着地 ${p.onGround ? 1 : 0} 存活 ${p.alive === false ? 0 : 1} 坐车 ${p.mounted ? 1 : 0} 状态 ${G.game?.state || '-'}`,
      `出错 ${errs.join(' ') || '无'}${errors.length ? ` · 页面 ${errors.join(' | ')}` : ''}`,
    ].join('\n');
  }

  const api = {
    get on() { return on; },
    show, toggle() { show(!on); return on; },
    /** 每帧开头 */
    begin(rawDt, dt) {
      if (!on) return;
      const now = performance.now();
      if (last) { const ms = now - last; fpsEma = fpsEma ? fpsEma * 0.9 + (1000 / Math.max(1, ms)) * 0.1 : 1000 / Math.max(1, ms); if (ms > 50) longs.push(now); }
      last = now; longs = longs.filter((t) => now - t < 2000);
      rawMs = rawDt * 1000; dtMs = dt * 1000;
      const pos = G.player?.pos;
      if (pos) {
        if (prevPos && rawDt > 0) { const s = Math.hypot(pos.x - prevPos.x, pos.z - prevPos.z) / rawDt; realV = realV * 0.85 + Math.min(s, 50) * 0.15; }
        prevPos = { x: pos.x, z: pos.z };
      }
      renderer.info.reset();
    },
    /** grade.end 之后：ok 是这一帧有没有正常调色上屏 */
    end(ok) {
      if (!on) return;
      route = ok ? 'grade' : 'SCREEN!';
      const now = performance.now();
      if (now - pixT > 1000) {
        pixT = now;
        try {
          glErr = gl.getError();
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, b = new Uint8Array(4);
          gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); px = `${b[0]},${b[1]},${b[2]}`;
          gl.readPixels(w >> 2, (h * 3) >> 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); px2 = `${b[0]},${b[1]},${b[2]}`;
        } catch (e) { px = `读不了:${e?.message || e}`.slice(0, 30); }
      }
      if (now - textT > 250 && el) { textT = now; el.textContent = lines(); }
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const t of ['touchstart', 'touchend', 'touchcancel']) removeEventListener(t, onTouch, { capture: true });
      removeEventListener('error', onError); removeEventListener('unhandledrejection', onError);
      renderer.debug.onShaderError = prevShader;
      renderer.info.autoReset = true;
      el?.remove(); el = null;
    },
  };
  if (diagWanted(params)) show(true);
  misses0 = grade.misses;
  return api;
}

export const DIAG_CSS = `
.jm-diag { position: fixed; left: calc(4px + env(safe-area-inset-left)); top: calc(4px + env(safe-area-inset-top)); z-index: 60; margin: 0; pointer-events: none;
  font: 10px/1.3 ui-monospace, Menlo, monospace; color: #e8ffe8; background: rgba(0, 0, 0, .62); padding: 4px 6px; border-radius: 4px; max-width: min(72vw, 640px); white-space: pre-wrap; word-break: break-all; }
`;
