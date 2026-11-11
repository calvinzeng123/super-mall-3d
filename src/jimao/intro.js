// 「零点突围 · ZERO HOUR」的入场动画：载入完成后、标题菜单出现之前放一次，约 3.6 秒，点一下或按任意键跳过。
// 画面：黑场里的信号杂波和扫描线 → 「信号中断」的提示闪烁 → 「断」「讯」两个字带着色差和横向撕裂出现 →
// ZERO HOUR 逐字点亮、一道扫描光划过 → 时间地点 → 整块画面像信号恢复一样被切开，露出标题菜单和商场。
// 声音用网页音频现场合成（静电噪声、低频冲击、一声提示音），不带任何文件。系统设了「减少动态效果」时只做一个淡出。
export const INTRO_MS = 3600;

const CSS = `
.sz-intro { position: fixed; inset: 0; z-index: 70; background: #050607; color: #e8e4da; overflow: hidden; cursor: pointer;
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; display: grid; place-items: center; }
.sz-intro::before { content: ''; position: absolute; inset: -50%; opacity: .16; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,.18) 0 1px, transparent 1px 3px); animation: sz-scan .5s steps(6) infinite; }
.sz-intro::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.75) 100%); }
.sz-noise { position: absolute; inset: 0; width: 100%; height: 100%; opacity: .22; mix-blend-mode: screen; animation: sz-noise 1.1s ease-out forwards; }
.sz-core { position: relative; text-align: center; z-index: 1; }
.sz-lost { font: 600 12px/1 ui-monospace, 'PingFang SC', monospace; letter-spacing: .5em; margin-right: -.5em; color: #ff5a40; opacity: 0;
  animation: sz-blink .9s steps(2) .15s 1 forwards, sz-out .25s ease-in 1.05s forwards; }
.sz-word { position: relative; font-weight: 900; font-size: clamp(56px, 13vw, 168px); line-height: 1; letter-spacing: .12em; margin-right: -.12em; opacity: 0;
  animation: sz-in .05s linear .95s forwards; }
.sz-word span { display: inline-block; position: relative; animation: sz-glitch .7s steps(1) .95s 1 both; }
.sz-word span:nth-child(2) { animation-delay: 1.06s; } .sz-word span:nth-child(3) { animation-delay: 1.17s; } .sz-word span:nth-child(4) { animation-delay: 1.28s; }
.sz-word span::before, .sz-word span::after { content: attr(data-c); position: absolute; inset: 0; opacity: .85; mix-blend-mode: screen; }
.sz-word span::before { color: #ff3b2f; animation: sz-split-r 1.1s ease-out .95s both; }
.sz-word span::after { color: #2fd3ff; animation: sz-split-b 1.1s ease-out .95s both; }
.sz-en { margin-top: 14px; font: 700 clamp(13px, 2.6vw, 20px)/1 ui-monospace, 'Courier New', monospace; letter-spacing: .9em; margin-right: -.9em; color: #ffb347; }
.sz-en i { font-style: normal; opacity: 0; animation: sz-in .08s linear forwards; }
.sz-sweep { position: absolute; left: -10%; right: -10%; height: 2px; top: 50%; background: linear-gradient(90deg, transparent, #ffb347, #fff, #ffb347, transparent);
  box-shadow: 0 0 18px #ffb347; opacity: 0; animation: sz-sweep .7s cubic-bezier(.6, 0, .2, 1) 1.75s forwards; }
.sz-meta { margin-top: 26px; font: 500 12px/1.6 ui-monospace, 'PingFang SC', monospace; letter-spacing: .32em; margin-right: -.32em; color: rgba(232,228,218,.62); opacity: 0;
  animation: sz-in .4s ease-out 2.2s forwards; }
.sz-meta b { color: #e8e4da; font-weight: 600; }
.sz-clock { position: absolute; width: 1px; height: 1px; opacity: 0; animation: sz-clock 3.6s linear forwards; }
@keyframes sz-clock { to { opacity: .01; } }
.sz-skip { position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: max(14px, env(safe-area-inset-bottom)); font-size: 11px; letter-spacing: .2em; color: rgba(232,228,218,.38); z-index: 1; }
.sz-intro.out { animation: sz-cut .55s cubic-bezier(.7, 0, .3, 1) forwards; }
@keyframes sz-scan { to { transform: translateY(3px); } }
@keyframes sz-noise { 0% { opacity: .5; } 60% { opacity: .3; } 100% { opacity: .1; } }
@keyframes sz-blink { 0%, 100% { opacity: 1; } 50% { opacity: .15; } }
@keyframes sz-out { to { opacity: 0; transform: translateY(-6px); } }
@keyframes sz-in { to { opacity: 1; } }
@keyframes sz-glitch {
  0% { transform: translate(-14px, 0) skewX(-18deg); clip-path: inset(0 0 62% 0); } 12% { transform: translate(10px, 0); clip-path: inset(40% 0 20% 0); }
  24% { transform: translate(-6px, 0) skewX(10deg); clip-path: inset(10% 0 55% 0); } 36% { transform: translate(4px, 0); clip-path: inset(70% 0 0 0); }
  48% { transform: translate(-2px, 0); clip-path: inset(0 0 0 0); } 60%, 100% { transform: none; clip-path: inset(0 0 0 0); } }
@keyframes sz-split-r { 0% { transform: translate(-12px, 2px); } 60% { transform: translate(-3px, 0); } 100% { transform: translate(-1px, 0); opacity: .35; } }
@keyframes sz-split-b { 0% { transform: translate(12px, -2px); } 60% { transform: translate(3px, 0); } 100% { transform: translate(1px, 0); opacity: .35; } }
@keyframes sz-sweep { 0% { opacity: 1; transform: translateY(-46vh) scaleX(.2); } 70% { opacity: 1; } 100% { opacity: 0; transform: translateY(46vh) scaleX(1); } }
@keyframes sz-cut { 0% { clip-path: inset(0 0 0 0); filter: none; } 30% { clip-path: inset(0 0 0 0); filter: brightness(2.2); }
  100% { clip-path: inset(50% 0 50% 0); filter: brightness(3); } }
@media (prefers-reduced-motion: reduce) {
  .sz-intro::before, .sz-noise, .sz-sweep { display: none; }
  .sz-lost, .sz-word, .sz-word span, .sz-word span::before, .sz-word span::after, .sz-en i, .sz-meta { animation: none !important; opacity: 1; }
  .sz-intro.out { animation: sz-fade .5s ease forwards; }
  @keyframes sz-fade { to { opacity: 0; } }
  .sz-clock { animation-duration: 1.2s !important; }
}`;

/** 静电噪声画在一张小画布上（一帧，CSS 让它闪） */
function noiseCanvas() {
  const c = document.createElement('canvas'); c.width = 240; c.height = 135; c.className = 'sz-noise';
  const g = c.getContext('2d'); if (!g) return c;
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  // 几条横向撕裂
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 7; k++) { const y = Math.random() * c.height, h = 1 + Math.random() * 4; g.drawImage(c, 0, y, c.width, h, (Math.random() - 0.5) * 60, y, c.width, h); }
  c.style.imageRendering = 'pixelated';
  return c;
}

/** 合成的音效：静电、低频冲击、提示音。被浏览器拦住（没有用户手势）就安静地跳过 */
function playSound(volume = 0.5) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return () => {};
    const ac = new AC(), out = ac.createGain(); out.gain.value = volume; out.connect(ac.destination);
    const t0 = ac.currentTime + 0.05;
    // 静电：带通噪声，0–1.0 s，断断续续
    const len = ac.sampleRate * 1.2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.sin(i / ac.sampleRate * 70) > -0.2 ? 1 : 0.15);
    const n = ac.createBufferSource(); n.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.7;
    const ng = ac.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(0.35, t0 + 0.05); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
    n.connect(bp).connect(ng).connect(out); n.start(t0); n.stop(t0 + 1.2);
    // 提示音：两声短促的高音（信号中断）
    for (const [at, f] of [[0.18, 1320], [0.42, 1320]]) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.08, t0 + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.12);
      o.connect(g).connect(out); o.start(t0 + at); o.stop(t0 + at + 0.15);
    }
    // 标题出现时的低频冲击（150 → 38 Hz）和一层带混响感的噪声尾巴
    const hit = t0 + 0.95, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(150, hit); o.frequency.exponentialRampToValueAtTime(38, hit + 0.9);
    g.gain.setValueAtTime(0.0001, hit); g.gain.exponentialRampToValueAtTime(0.9, hit + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, hit + 1.6);
    o.connect(g).connect(out); o.start(hit); o.stop(hit + 1.7);
    const tail = ac.createBufferSource(); tail.buffer = buf; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const tg = ac.createGain(); tg.gain.setValueAtTime(0.0001, hit); tg.gain.exponentialRampToValueAtTime(0.25, hit + 0.03); tg.gain.exponentialRampToValueAtTime(0.0001, hit + 1.1);
    tail.connect(lp).connect(tg).connect(out); tail.start(hit); tail.stop(hit + 1.2);
    return () => { out.gain.setTargetAtTime(0, ac.currentTime, 0.05); setTimeout(() => ac.close().catch(() => {}), 400); };
  } catch { return () => {}; }
}

/** 放入场动画；动画结束（或被跳过）时 resolve。 */
export function playIntro({ place = '云澜汇 · 一期西翼', time = '00:00', volume = 0.5 } = {}) {
  return new Promise((resolve) => {
    const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
    const root = document.createElement('div'); root.className = 'sz-intro'; root.setAttribute('role', 'img'); root.setAttribute('aria-label', '零点突围 ZERO HOUR');
    const en = 'ZERO HOUR'.split('').map((c, i) => `<i style="animation-delay:${(1.45 + i * 0.045).toFixed(3)}s">${c === ' ' ? '&nbsp;' : c}</i>`).join('');
    root.innerHTML = `<div class="sz-sweep"></div><div class="sz-core"><div class="sz-lost">信号中断 · 00:00</div>
      <div class="sz-word">${"零点突围".split("").map((c) => `<span data-c="${c}">${c}</span>`).join("")}</div><div class="sz-en">${en}</div>
      <div class="sz-meta"><b>${place}</b> · ${time} · 单兵行动</div></div><div class="sz-skip">点击跳过</div><i class="sz-clock"></i>`;
    root.prepend(noiseCanvas());
    document.body.append(root);
    const stopSound = playSound(volume);
    let done = false;
    const finish = () => {
      if (done) return; done = true; clearTimeout(timer);
      removeEventListener('keydown', skip, true);
      root.classList.add('out');
      setTimeout(() => { root.remove(); style.remove(); resolve(); }, 560);
    };
    const skip = () => { stopSound(); finish(); };
    // 结束时间跟着动画走（而不是另开定时器）：动画被暂停、页面切到后台时不会提前收场
    root.querySelector('.sz-clock').addEventListener('animationend', finish);
    const timer = setTimeout(finish, 60000); // 万一动画事件没来（比如浏览器关了动画），兜底
    root.addEventListener('pointerdown', skip);
    addEventListener('keydown', skip, true);
  });
}
