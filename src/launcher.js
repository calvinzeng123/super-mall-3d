// A 2D entry screen. Importing this module must never initialize a WebGL scene.
const launcherCSS = `
.yl-launcher{--yl-amber:#e8b876;--yl-ink:#edf4f8;position:fixed;inset:0;z-index:1000;isolation:isolate;overflow:auto;color:var(--yl-ink);background:#0a121b;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;overscroll-behavior:none}
.yl-launcher *{box-sizing:border-box}.yl-launcher[hidden]{display:none!important}.yl-launcher button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}.yl-launcher button:focus-visible{outline:3px solid var(--yl-amber);outline-offset:5px}
.yl-cover-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:57% 60%;filter:saturate(.3) brightness(.64);z-index:-3}.yl-cover-shade{position:absolute;inset:0;z-index:-2;background:linear-gradient(90deg,rgba(6,17,29,.93),rgba(11,25,39,.54) 60%,rgba(10,19,29,.38)),linear-gradient(0deg,#0a121b 0%,transparent 65%)}
.yl-cover-content{min-height:100%;padding:calc(34px + env(safe-area-inset-top,0px)) calc(48px + env(safe-area-inset-right,0px)) calc(28px + env(safe-area-inset-bottom,0px)) calc(48px + env(safe-area-inset-left,0px));display:flex;flex-direction:column;max-width:1480px;margin:auto}.yl-cover-top{display:flex;align-items:center;justify-content:space-between;gap:16px}.yl-wordmark{font-size:14px;font-weight:700;letter-spacing:.26em}.yl-edition{font:10px/1.4 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em;color:#b9cbd6}.yl-cover-main{margin:auto 0;padding:38px 0 24px;max-width:780px}.yl-kicker{margin:0 0 13px;display:flex;gap:10px;align-items:center;color:var(--yl-amber);font-size:11px;letter-spacing:.22em}.yl-kicker:before{content:"";width:24px;height:1px;background:currentColor}.yl-cover-main h1{font-weight:800;font-size:clamp(52px,9.2vw,124px);letter-spacing:.035em;line-height:1.05;margin:0 0 12px;text-shadow:0 4px 40px #001c2e}.yl-cover-subtitle{font-size:clamp(17px,2.3vw,28px);font-weight:500;letter-spacing:.33em;color:#d3e0e8;margin:0 0 22px}.yl-cover-copy{font-size:13px;color:#aec2d0;line-height:1.8;margin:0;max-width:29em}
.yl-cover-route{display:flex;align-items:center;gap:10px;margin:24px 0 0;color:#c4d0d7;font-size:11px}.yl-cover-route i{width:38px;height:1px;background:#527181;position:relative}.yl-cover-route i:after{content:"";position:absolute;right:0;top:-2px;width:5px;height:5px;border-top:1px solid #527181;border-right:1px solid #527181;transform:rotate(45deg)}.yl-cover-route span:first-child{color:var(--yl-amber)}
.yl-mode-list{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:min(730px,100%);margin-bottom:22px}.yl-mode{border:1px solid #8da9ba4a;background:#132634b8;border-radius:15px;padding:21px 23px;text-align:left;display:grid;grid-template-columns:1fr 24px;gap:5px 12px;min-height:108px;position:relative;transition:background .15s,border-color .15s}.yl-mode:hover{background:#213c4edb;border-color:#9ab2c3}.yl-mode-primary{background:#dcb27fe6;color:#101c26!important;border-color:#f6d7a8}.yl-mode-primary:hover{background:#ebc798;border-color:#ffe8c7}.yl-mode b{font-size:21px;font-weight:700;letter-spacing:.05em}.yl-mode span{font-size:11px;line-height:1.6;color:#bacbd6}.yl-mode-primary span{color:#354656}.yl-mode svg{grid-column:2;grid-row:1/3;align-self:center;width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.5}.yl-mode:disabled{cursor:wait;opacity:.55}.yl-cover-footer{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;color:#8fa6b5;font-size:10px;line-height:1.6;max-width:730px}.yl-cover-footer p{margin:0}.yl-cover-status{color:#e8b876;min-height:18px}.yl-cover-load{height:2px;background:#b0cfdf24;overflow:hidden;margin-top:8px;width:100%;max-width:730px}.yl-cover-load i{display:block;height:100%;width:0;background:#e8b876;transition:width .2s}.yl-launcher[data-loading="true"] .yl-cover-load i.indeterminate{width:35%;animation:yl-loading 1.1s ease-in-out infinite}.yl-cover-error{color:#ffbaad;max-width:730px;font-size:12px;line-height:1.6;margin:12px 0 0}.yl-cover-error:empty{display:none}.yl-launcher[data-loading="true"] .yl-cover-main{opacity:.75}
@keyframes yl-loading{from{transform:translateX(-100%)}to{transform:translateX(380%)}}
@media(max-width:600px) and (orientation:portrait){.yl-cover-content{padding:calc(25px + env(safe-area-inset-top,0px)) calc(23px + env(safe-area-inset-right,0px)) calc(23px + env(safe-area-inset-bottom,0px)) calc(23px + env(safe-area-inset-left,0px))}.yl-cover-image{object-position:58% 50%}.yl-cover-shade{background:linear-gradient(0deg,#0a121b 0%,#0a1b2bd4 32%,#0b19275e 65%,#091522b0)}.yl-cover-main{padding:50px 0 28px}.yl-cover-main h1{font-size:76px}.yl-cover-subtitle{font-size:23px}.yl-mode-list{grid-template-columns:1fr;gap:11px;margin-bottom:18px}.yl-mode{padding:17px 19px;min-height:87px}.yl-mode b{font-size:19px}.yl-cover-route{margin-top:24px}.yl-cover-footer{align-items:flex-start}.yl-cover-footer p:last-child{text-align:right}.yl-edition{font-size:8px;max-width:90px;text-align:right}}
@media(max-height:550px) and (orientation:landscape){.yl-cover-content{padding:calc(18px + env(safe-area-inset-top,0px)) calc(34px + env(safe-area-inset-right,0px)) calc(13px + env(safe-area-inset-bottom,0px)) calc(34px + env(safe-area-inset-left,0px))}.yl-cover-main{padding:18px 0 16px;margin:auto 0;max-width:55%}.yl-cover-main h1{font-size:58px;margin-bottom:7px}.yl-cover-subtitle{font-size:17px;margin-bottom:12px}.yl-cover-copy{font-size:11px}.yl-cover-route{margin-top:13px}.yl-mode-list{position:absolute;width:34%;right:calc(34px + env(safe-area-inset-right,0px));top:50%;transform:translateY(-45%);grid-template-columns:1fr;gap:10px;margin:0}.yl-mode{padding:14px 16px;min-height:83px}.yl-mode b{font-size:18px}.yl-mode span{font-size:10px}.yl-cover-footer{font-size:9px;max-width:100%}.yl-cover-load{max-width:100%}.yl-cover-main .yl-kicker{font-size:9px;margin-bottom:8px}.yl-cover-route{font-size:10px}}
@media(prefers-reduced-motion:reduce){.yl-launcher *{animation:none!important;transition:none!important}}
`;

/** @param {{onSelect:(mode:'tour'|'fps')=>unknown,backgroundUrl?:string}} options */
export function mountLauncher({ onSelect, backgroundUrl = './docs/images/hotel-apartment-sides-overview.jpg' } = {}) {
  const style = document.createElement('style');
  style.textContent = launcherCSS;
  const root = document.createElement('main');
  root.className = 'yl-launcher';
  root.id = 'ylLauncher';
  root.setAttribute('aria-label', '云澜汇游戏入口');
  root.innerHTML = `
    <img class="yl-cover-image" alt="云澜汇一期商场与酒店公寓" decoding="async" fetchpriority="high">
    <div class="yl-cover-shade"></div>
    <div class="yl-cover-content">
      <header class="yl-cover-top"><span class="yl-wordmark">云澜汇</span><span class="yl-edition">YUNLAN / MOBILE EDITION</span></header>
      <section class="yl-cover-main">
        <p class="yl-kicker">熟悉的城市，另一种进入方式</p>
        <h1>云澜汇</h1><p class="yl-cover-subtitle">封锁行动</p>
        <p class="yl-cover-copy">穿过商场，深入酒店。<br>和你的队友一起，把情报带回撤离点。</p>
        <div class="yl-cover-route" aria-label="行动范围：一期、酒店、公寓"><span>一期商场</span><i></i><span>酒店</span><i></i><span>公寓</span></div>
      </section>
      <nav class="yl-mode-list" aria-label="选择游戏模式">
        <button class="yl-mode yl-mode-primary" data-mode="fps"><b>竞技 FPS</b><span>单人 + AI 队友 · 搜索与撤离</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
        <button class="yl-mode" data-mode="tour"><b>普通导览</b><span>自由漫游 · 探索一期、酒店与公寓</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
      </nav>
      <footer class="yl-cover-footer"><p class="yl-cover-status" role="status" aria-live="polite">选择模式，进入云澜汇</p><p>触屏操作 · 横屏视野更开阔<br>按钮位置与大小可在游戏内调整</p></footer>
      <div class="yl-cover-load" hidden><i></i></div><p class="yl-cover-error" role="alert"></p>
    </div>`;
  root.querySelector('img').src = backgroundUrl;
  document.head.append(style);
  document.body.append(root);
  let busy = false;
  let disposed = false;
  const abort = new AbortController();
  const buttons = [...root.querySelectorAll('[data-mode]')];
  function setLoading(message = '正在进入…', progress) {
    if (disposed) return;
    busy = true;
    root.dataset.loading = 'true';
    root.setAttribute('aria-busy', 'true');
    root.querySelector('.yl-cover-status').textContent = message;
    root.querySelector('.yl-cover-error').textContent = '';
    root.querySelector('.yl-cover-load').hidden = false;
    const bar = root.querySelector('.yl-cover-load i');
    bar.classList.toggle('indeterminate', !Number.isFinite(progress));
    bar.style.width = Number.isFinite(progress) ? `${Math.max(0, Math.min(1, progress)) * 100}%` : '';
    buttons.forEach(b => { b.disabled = true; });
  }
  function showError(message) {
    if (disposed) return;
    busy = false;
    root.dataset.loading = 'false';
    root.setAttribute('aria-busy', 'false');
    root.querySelector('.yl-cover-status').textContent = '未能进入，请重试';
    root.querySelector('.yl-cover-error').textContent = String(message || '加载失败');
    root.querySelector('.yl-cover-load').hidden = true;
    buttons.forEach(b => { b.disabled = false; });
  }
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-mode]');
    if (!button || busy) return;
    setLoading(button.dataset.mode === 'fps' ? '正在准备封锁行动…' : '正在进入园区…');
    try { await onSelect?.(button.dataset.mode); }
    catch (error) { showError(error?.message || error); }
  }, { signal: abort.signal });
  return {
    root, setLoading, showError,
    dispose() { if (disposed) return; disposed = true; abort.abort(); root.remove(); style.remove(); },
  };
}
