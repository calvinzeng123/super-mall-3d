// A 2D entry screen. Importing this module must never initialize a WebGL scene,
// and opening the homepage must not request any 3D/model asset: only the local
// cover image is loaded until the player confirms a mode (and difficulty).
export const LAUNCHER_VERSION = 'v5.0';
export const LAUNCHER_EDITION = 'YUNLAN / MOBILE EDITION';
export const LAUNCHER_TIPS = [
  '收集 5 枚情报碎片可以额外加分并补充弹药。',
  '冲刺中按蹲伏可以滑铲穿过开阔区域。',
  '护甲会吸收大部分伤害，地图上散落着护甲板。',
  '切断酒店安防监控可以让敌人的视野变短。',
  '车库接应车与屋顶直升机两条撤离路线，行动中随时可以切换。',
  '悄悄接近未察觉的敌人，近战可以无声解决。',
];
export const LAUNCHER_OBJECTIVES = [
  { step: '01', title: '接入商场终端', text: '清理西翼通道，在终端提取酒店访问密钥。' },
  { step: '02', title: '取回酒店情报', text: '沿酒店消防通道上至 2F，夺回走廊里的数据箱。' },
  { step: '03', title: '守住撤离点', text: '地下接应车或酒店屋顶直升机，坚持到倒计时结束。' },
];
export const LAUNCHER_STATS = [
  { value: '18', label: '场景楼层', hint: '17 层可通行' },
  { value: '9', label: '威胁目标', hint: '含重装与狙击手' },
  { value: '2', label: '撤离方式', hint: '接应车 / 直升机' },
  { value: '5', label: '情报碎片', hint: '分布在行动路线' },
  { value: '3', label: '任务目标', hint: '可选目标另计' },
];
export const LAUNCHER_DIFFICULTIES = [
  { id: 'standard', label: '标准', short: '标准 · 常规补给', detail: '敌人伤害与命中率常规，撤离倒计时较短，初始补给充足。适合第一次进入云澜汇。' },
  { id: 'veteran', label: '老兵', short: '老兵 · 伤害 +35%', detail: '敌人伤害提高 35%、命中率更高，撤离需要坚持更久，初始医疗包与手雷更少。' },
];
const launcherCSS = `
.yl-launcher{--yl-amber:#e8b876;--yl-ink:#edf4f8;--yl-muted:#aec2d0;--yl-line:#8da9ba52;--yl-panel:#11212ecc;position:fixed;inset:0;z-index:1000;isolation:isolate;overflow:auto;color:var(--yl-ink);background:#0a121b;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;overscroll-behavior:none;-webkit-text-size-adjust:100%}
.yl-launcher *{box-sizing:border-box}.yl-launcher[hidden]{display:none!important}.yl-launcher button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}
.yl-launcher button:focus-visible,.yl-launcher a:focus-visible{outline:3px solid var(--yl-amber);outline-offset:4px}
.yl-launcher a{color:#e9d2ab;text-underline-offset:3px}
.yl-launcher [hidden]{display:none!important}
.yl-cover-image{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;object-position:57% 60%;filter:saturate(.3) brightness(.62);z-index:-3}
.yl-cover-shade{position:fixed;inset:0;z-index:-2;background:linear-gradient(90deg,rgba(6,17,29,.94),rgba(11,25,39,.58) 62%,rgba(10,19,29,.42)),linear-gradient(0deg,#0a121b 0%,rgba(10,18,27,.25) 55%,rgba(9,18,27,.65) 100%)}
.yl-shell{position:relative;min-height:100%;max-width:1480px;margin:0 auto;padding:calc(26px + env(safe-area-inset-top,0px)) calc(38px + env(safe-area-inset-right,0px)) calc(22px + env(safe-area-inset-bottom,0px)) calc(38px + env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:10px}
.yl-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap}
.yl-brand{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.yl-wordmark{font-size:14px;font-weight:700;letter-spacing:.26em}
.yl-edition{font:10px/1.4 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em;color:#b9cbd6}
.yl-top-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.yl-version{font:10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;color:#e8b876;padding:5px 8px;border:1px solid #8da9ba4a;border-radius:999px}
.yl-quick{min-height:36px;padding:6px 12px;border:1px solid #8da9ba4a;border-radius:999px;background:#0e1e2ab8;color:#cfe0ea;font-size:11px;transition:background .15s,border-color .15s}
.yl-quick:hover{background:#1a3244d9;border-color:#a8bccb}
.yl-home-screen{flex:1;display:flex;flex-direction:column;min-height:0}
.yl-home{flex:1;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(310px,.75fr);gap:clamp(22px,3.6vw,58px);align-items:center;margin:auto 0;padding:22px 0 16px}
.yl-hero{max-width:760px;min-width:0}
.yl-kicker{margin:0 0 13px;display:flex;gap:10px;align-items:center;color:var(--yl-amber);font-size:11px;letter-spacing:.22em}
.yl-kicker:before{content:"";width:26px;height:1px;background:currentColor}
.yl-hero h1{font-weight:800;font-size:clamp(52px,8.6vw,118px);letter-spacing:.035em;line-height:1.04;margin:0 0 10px;text-shadow:0 4px 40px #001c2e}
.yl-subtitle{font-size:clamp(17px,2.2vw,27px);font-weight:500;letter-spacing:.34em;color:#d3e0e8;margin:0 0 18px}
.yl-copy{font-size:13px;color:var(--yl-muted);line-height:1.85;margin:0;max-width:30em}
.yl-route{display:flex;align-items:center;gap:9px;margin:22px 0 0;color:#c4d0d7;font-size:11px;flex-wrap:wrap;row-gap:6px}
.yl-route i{width:30px;height:1px;background:#527181;position:relative;flex:none}
.yl-route i:after{content:"";position:absolute;right:0;top:-2px;width:5px;height:5px;border-top:1px solid #527181;border-right:1px solid #527181;transform:rotate(45deg)}
.yl-route span:first-child{color:var(--yl-amber)}
.yl-modes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:26px 0 0;width:min(730px,100%)}
.yl-mode{position:relative;border:1px solid #8da9ba4a;background:#132634c4;border-radius:15px;padding:20px 22px;text-align:left;display:grid;grid-template-columns:1fr 24px;gap:4px 12px;min-height:112px;transition:background .15s,border-color .15s,transform .15s}
.yl-mode:hover{background:#213c4ee6;border-color:#9ab2c3;transform:translateY(-1px)}
.yl-mode b{font-size:21px;font-weight:700;letter-spacing:.05em}
.yl-mode span{font-size:11px;line-height:1.6;color:#bacbd6}
.yl-mode em{grid-column:1;font-style:normal;font-size:9px;letter-spacing:.06em;color:#9fb4c2;margin-top:5px}
.yl-mode svg{grid-column:2;grid-row:1/4;align-self:center;width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.5}
.yl-mode-primary{background:#dcb27fe6;color:#101c26;border-color:#f6d7a8}
.yl-mode-primary:hover{background:#ebc798;border-color:#ffe8c7}
.yl-mode-primary span{color:#354656}
.yl-mode-primary em{color:#5c4a35}
.yl-mode-badge{position:absolute;top:-9px;left:16px;padding:3px 8px;border-radius:999px;background:#0d1a24;border:1px solid #e8b87699;color:#f0d3a6;font-size:9px;letter-spacing:.14em}
.yl-mode:disabled{cursor:wait;opacity:.55;transform:none}
.yl-brief{border:1px solid var(--yl-line);background:var(--yl-panel);border-radius:18px;padding:22px 22px 18px;box-shadow:0 18px 60px #0005;backdrop-filter:blur(3px)}
.yl-eyebrow{font:10px ui-monospace,SFMono-Regular,monospace;letter-spacing:.16em;color:#e8b876}
.yl-brief h2{margin:7px 0 4px;font-size:24px;letter-spacing:.06em}
.yl-brief-copy{font-size:11px;line-height:1.7;color:#a9c0ce;margin:0 0 13px}
.yl-objectives{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.yl-objectives li{display:grid;grid-template-columns:26px 1fr;gap:10px;align-items:start}
.yl-objectives .yl-step{font:600 11px/1.5 ui-monospace,monospace;color:#e8b876;padding-top:1px}
.yl-objectives b{display:block;font-size:12px;letter-spacing:.04em}
.yl-objectives span{display:block;font-size:10px;line-height:1.6;color:#a6bdcb;margin-top:1px}
.yl-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:17px 0 0;padding-top:14px;border-top:1px solid #b4d2df26}
.yl-stats div{min-width:0}
.yl-stats b{display:block;font:700 19px/1.1 ui-monospace,SFMono-Regular,monospace;color:#f2dab6}
.yl-stats span{display:block;font-size:9px;color:#b9cedb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yl-stats em{display:block;font-style:normal;font-size:8px;color:#7f9aab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.yl-brief-note{margin:15px 0 0;font-size:10px;line-height:1.65;color:#8fa9b9;border-left:2px solid #e8b8765c;padding-left:9px}
.yl-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;color:#8fa6b5;font-size:10px;line-height:1.6}
.yl-footer-quick{display:flex;gap:8px;flex-wrap:wrap}
.yl-footer p{margin:0}
.yl-footer-meta{text-align:right}
.yl-status{color:#e8b876;min-height:18px}
/* ---- briefing screen ---- */
.yl-briefing-screen{flex:1;display:flex;flex-direction:column;margin:auto 0;padding:12px 0 10px;min-height:0}
.yl-briefing-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.yl-back{min-height:40px;padding:7px 13px;border:1px solid #8da9ba4a;border-radius:10px;background:#0e1e2ab8;font-size:11px}
.yl-back:hover{background:#1a3244d9}
.yl-briefing-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(300px,.9fr);gap:clamp(20px,3.4vw,48px);align-items:start}
.yl-briefing-main h2{font-size:clamp(26px,3.6vw,40px);letter-spacing:.06em;margin:6px 0 10px}
.yl-briefing-main>p{font-size:12px;line-height:1.85;color:#b3c8d5;max-width:36em;margin:0 0 16px}
.yl-briefing-main .yl-objectives{gap:12px}
.yl-briefing-main .yl-objectives b{font-size:13px}
.yl-briefing-main .yl-objectives span{font-size:11px}
.yl-briefing-note{margin:18px 0 0;font-size:10px;color:#8fa9b9;line-height:1.7;border-top:1px solid #b4d2df26;padding-top:12px}
.yl-briefing-side{border:1px solid var(--yl-line);background:var(--yl-panel);border-radius:18px;padding:20px;box-shadow:0 18px 60px #0005}
.yl-difficulty-label{font-size:10px;letter-spacing:.16em;color:#b9cedb;margin:0 0 8px}
.yl-difficulty{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:0 0 8px}
.yl-difficulty button{min-height:64px;padding:10px 12px;text-align:left;border:1px solid #8da9ba45;border-radius:12px;background:#0d22316b;transition:background .15s,border-color .15s}
.yl-difficulty button b{display:block;font-size:16px;letter-spacing:.08em}
.yl-difficulty button span{display:block;font-size:9px;line-height:1.5;color:#9fb7c5;margin-top:3px}
.yl-difficulty button[aria-checked="true"]{background:#e8b8761f;border-color:#e8b876cc;box-shadow:inset 0 0 0 1px #e8b87655}
.yl-difficulty button[aria-checked="true"] b{color:#f6d9ad}
.yl-difficulty-detail{min-height:44px;font-size:10px;line-height:1.7;color:#a9c1cf;margin:0 0 14px}
.yl-briefing-side .yl-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:0;padding-top:12px}
.yl-briefing-side .yl-stats b{font-size:17px}
.yl-deploy{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:54px;margin-top:16px;padding:10px 18px;border:1px solid #f6d7a8;border-radius:13px;background:#dcb27f;color:#101c26;font-weight:700;font-size:16px;letter-spacing:.1em;transition:background .15s}
.yl-deploy:hover{background:#ebc798}
.yl-deploy small{font-weight:500;font-size:9px;letter-spacing:.04em;color:#4a3a27}
.yl-briefing-side .yl-back{width:100%;margin-top:9px}
/* ---- loading ---- */
.yl-loading{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:calc(20px + env(safe-area-inset-top,0px)) calc(20px + env(safe-area-inset-right,0px)) calc(20px + env(safe-area-inset-bottom,0px)) calc(20px + env(safe-area-inset-left,0px));background:rgba(6,14,22,.78);backdrop-filter:blur(4px)}
.yl-loading-card{width:min(520px,100%);border:1px solid #afc7d135;border-radius:18px;background:#0f2130f2;padding:24px;box-shadow:0 24px 90px #0007}
.yl-loading-card h2{margin:7px 0 4px;font-size:21px;letter-spacing:.08em}
.yl-stage{font-size:12px;color:#b9cfdb;margin:0 0 14px;min-height:18px}
.yl-progress{height:4px;border-radius:999px;background:#b0cfdf24;overflow:hidden;margin:0 0 14px}
.yl-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#e8b876,#f6d7a8);transition:width .25s}
.yl-progress.indeterminate i{width:36%;animation:yl-loading 1.1s ease-in-out infinite}
.yl-loading[data-state="error"] .yl-progress{display:none}
.yl-tip{display:flex;gap:9px;font-size:11px;line-height:1.65;color:#a9c0ce;margin:0;min-height:36px}
.yl-tip-label{flex:none;color:#e8b876;font:10px/1.7 ui-monospace,monospace;letter-spacing:.1em}
.yl-tip-text{transition:opacity .2s}
.yl-load-error{color:#ffbaad;font-size:11px;line-height:1.65;margin:10px 0 0}
.yl-load-actions{display:flex;gap:9px;margin-top:15px;flex-wrap:wrap}
.yl-load-actions button{flex:1 1 140px;min-height:44px;border:1px solid #c1d7e32b;border-radius:11px;background:#b9d2e20a;font-size:12px}
.yl-load-actions .yl-primary{background:#e8b876;color:#162733;border-color:#e8b876;font-weight:650}
.yl-loading[data-state="loading"] .yl-load-actions{display:none}
.yl-loading[data-state="error"] .yl-load-actions{display:flex}
.yl-loading[data-state="loading"] .yl-load-error{display:none}
@keyframes yl-loading{from{transform:translateX(-100%)}to{transform:translateX(380%)}}
/* ---- modals ---- */
.yl-modal-layer{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:calc(16px + env(safe-area-inset-top,0px)) calc(18px + env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) calc(18px + env(safe-area-inset-left,0px));background:#06121dd9}
.yl-modal{width:min(620px,100%);max-height:100%;overflow:auto;background:#142735f5;border:1px solid #afc7d135;border-radius:20px;padding:22px;box-shadow:0 20px 90px #0007}
.yl-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #c9dfed26}
.yl-modal-head h2{margin:0;font-size:20px;letter-spacing:.06em}
.yl-modal-close{width:40px;height:40px;border-radius:10px;border:1px solid #c1d7e32b;background:#b9d2e20a;font-size:18px;line-height:1}
.yl-modal h3{font-size:13px;margin:14px 0 5px;color:#f0e2c4}
.yl-modal p{font-size:11px;line-height:1.8;color:#b9cedb;margin:5px 0}
.yl-modal ul{margin:6px 0;padding-left:17px;font-size:11px;line-height:1.85;color:#b9cedb}
.yl-modal kbd{font:10px ui-monospace,monospace;padding:1px 5px;border:1px solid #9fb4c24d;border-radius:5px;background:#0a1620;color:#e5f1f7}
.yl-modal-actions{display:flex;gap:9px;margin-top:16px}
.yl-modal-actions button{flex:1;min-height:44px;border:1px solid #c1d7e32b;border-radius:11px;background:#b9d2e20a;font-size:12px}
.yl-credits-list{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-direction:column;gap:10px}
.yl-credits-list li{padding:9px 0;border-bottom:1px solid #c9dfed1f}
.yl-credits-list li:last-child{border-bottom:0}
.yl-credits-list b{display:block;font-size:12px}
.yl-credits-list span{display:block;font-size:10px;line-height:1.65;color:#a9c0ce}
.yl-credits-list a{display:inline-flex;align-items:center;min-height:28px;font-size:10px;margin-right:14px}
@media(pointer:coarse){.yl-keyboard-only{display:none}}
@media(hover:hover) and (pointer:fine){.yl-touch-only{display:none}}
@media(max-width:980px){
 .yl-shell{padding:calc(20px + env(safe-area-inset-top,0px)) calc(22px + env(safe-area-inset-right,0px)) calc(18px + env(safe-area-inset-bottom,0px)) calc(22px + env(safe-area-inset-left,0px))}
 .yl-home{grid-template-columns:1fr;align-items:start;gap:20px;padding:16px 0 10px}
 .yl-brief{order:2}
 .yl-briefing-grid{grid-template-columns:1fr;gap:18px}
 .yl-briefing-side{order:-1}
}
@media(max-width:620px) and (orientation:portrait){
 .yl-shell{padding:calc(18px + env(safe-area-inset-top,0px)) calc(18px + env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) calc(18px + env(safe-area-inset-left,0px))}
 .yl-cover-image{object-position:58% 50%}
 .yl-cover-shade{background:linear-gradient(0deg,#0a121b 0%,rgba(10,27,43,.86) 34%,rgba(11,25,39,.42) 66%,rgba(9,21,34,.7) 100%)}
 .yl-hero h1{font-size:64px}
 .yl-subtitle{font-size:21px}
 .yl-copy{font-size:12px}
 .yl-modes{grid-template-columns:1fr;gap:10px;margin-top:20px}
 .yl-mode{min-height:92px;padding:16px 18px}
 .yl-mode b{font-size:19px}
 .yl-stats{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:11px}
 .yl-footer{align-items:flex-start}
 .yl-footer-meta{text-align:left}
 .yl-briefing-side .yl-stats{grid-template-columns:repeat(3,minmax(0,1fr))}
 .yl-top-right{width:100%;justify-content:flex-start}
}
@media(max-height:560px) and (orientation:landscape){
 .yl-shell{padding:calc(12px + env(safe-area-inset-top,0px)) calc(26px + env(safe-area-inset-right,0px)) calc(10px + env(safe-area-inset-bottom,0px)) calc(26px + env(safe-area-inset-left,0px));gap:6px}
 .yl-top{flex-wrap:nowrap}
 .yl-home{grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:22px;padding:8px 0}
 .yl-kicker{margin-bottom:5px;font-size:9px}
 .yl-hero h1{font-size:44px;margin-bottom:2px}
 .yl-subtitle{font-size:13px;margin-bottom:6px}
 .yl-copy{font-size:9px;line-height:1.55}
 .yl-route{margin-top:6px;font-size:9px;row-gap:4px}
 .yl-modes{margin-top:8px;gap:7px}
 .yl-mode{min-height:58px;padding:8px 12px;gap:2px 8px;border-radius:12px}
 .yl-mode b{font-size:15px}
 .yl-mode span{font-size:9px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .yl-mode em{font-size:8px;margin-top:2px}
 .yl-mode svg{width:17px;height:17px}
 .yl-brief{padding:15px 16px 13px}
 .yl-brief h2{font-size:19px;margin-top:4px}
 .yl-brief-copy{font-size:10px;margin-bottom:9px}
 .yl-objectives{gap:7px}
 .yl-objectives b{font-size:11px}
 .yl-objectives span{font-size:9px}
 .yl-stats{margin-top:11px;padding-top:10px;gap:6px}
 .yl-stats b{font-size:16px}
 .yl-stats em{display:none}
 .yl-brief-note{margin-top:9px;padding-left:7px;font-size:9px}
 .yl-footer{font-size:9px}
 .yl-quick{min-height:32px;padding:4px 10px;font-size:10px}
 .yl-version{font-size:9px}
 .yl-briefing-main h2{font-size:26px}
 .yl-briefing-main>p{font-size:11px;margin-bottom:10px}
 .yl-briefing-side{padding:15px}
 .yl-difficulty button{min-height:56px;padding:8px 10px}
 .yl-difficulty-detail{min-height:38px;margin-bottom:10px;font-size:9px}
 .yl-deploy{min-height:46px;font-size:14px;margin-top:11px}
 .yl-loading-card{padding:18px 20px}
}
@media(prefers-reduced-motion:reduce){.yl-launcher *{animation:none!important;transition:none!important}.yl-mode:hover{transform:none}.yl-progress.indeterminate i{width:36%;transform:none}}
`;

const HELP_MODAL_HTML = `
  <p>行动开始前不会有任何 3D 场景加载；进入行动后可按 <kbd>Esc</kbd> 打开暂停菜单调整设置。</p>
  <h3 class="yl-touch-only">触屏操作</h3>
  <ul class="yl-touch-only">
    <li>左侧摇杆移动，右侧空白区域滑动转向；按住开火按钮可直接拖动瞄准。</li>
    <li>开火 / 瞄准 / 换弹 / 切枪 / 互动 / 冲刺 / 蹲伏 / 跳跃 / 急救 / 近战 / 手雷都可以在“调整按键”里拖动位置。</li>
    <li>横屏与竖屏的布局分开保存，暂停菜单的“设置 → 操作”可恢复默认。</li>
  </ul>
  <h3 class="yl-keyboard-only">键盘鼠标</h3>
  <ul class="yl-keyboard-only">
    <li><kbd>WASD</kbd> 移动 · <kbd>Shift</kbd> 冲刺 · <kbd>空格</kbd> 跳跃 · <kbd>C</kbd> 蹲伏 / 冲刺中滑铲</li>
    <li><kbd>R</kbd> 换弹 · <kbd>Q</kbd> 切枪 · <kbd>E</kbd> 互动 · <kbd>F</kbd> 切换射击模式</li>
    <li><kbd>X</kbd> 近战 · <kbd>G</kbd> 手雷 · <kbd>H</kbd> 急救 · <kbd>T</kbd> 切换撤离路线 · <kbd>Esc</kbd> 暂停</li>
  </ul>
  <h3>行动要点</h3>
  <p>护甲吸收大部分伤害；低血量会出现红色暗角与心跳提示。受击方向以屏幕边缘弧线提示，连杀提升得分倍率。收集情报碎片、切断监控与完成撤离都会影响结算评级。</p>
  <div class="yl-modal-actions"><button type="button" data-action="close-modal">知道了</button></div>`;

const CREDITS_MODAL_HTML = `
  <p>本项目使用本地保存并重新压缩的第三方素材，以下署名保留原作者权益；游戏内“素材署名”页包含逐项改动说明。</p>
  <ul class="yl-credits-list">
    <li><b>SMG-45 / 第一人称手臂</b><span>DJMaesen · “fps animated smg” · CC BY 4.0。改动：移动端贴图缩放与 JPEG 重编码、第一人称位置与后坐力适配。</span><a href="https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579" target="_blank" rel="noopener">原始作品</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></li>
    <li><b>Desert Eagle</b><span>ELIZION · CC BY 4.0。改动：贴图缩放、统一呈现比例、基于源分件制作弹匣与套筒运动。</span><a href="https://sketchfab.com/3d-models/desert-eagle-cabde59f5cf24effaf80536e35d04e95" target="_blank" rel="noopener">原始作品</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></li>
    <li><b>人物与环境</b><span>Microsoft Rocketbox · MIT（人物网格经图集整理与移动端压缩）。Poly Haven · CC0（本地 PBR 材质，调整贴图编码与映射）。</span><a href="https://github.com/microsoft/Microsoft-Rocketbox" target="_blank" rel="noopener">Rocketbox</a><a href="https://polyhaven.com/license" target="_blank" rel="noopener">Poly Haven 许可</a></li>
  </ul>
  <p>枪械与手臂资源保留 CC BY 4.0 许可，与本项目软件代码许可分开。用户提供的酒店套房模型由用户授权使用。</p>
  <a class="yl-online-credits" href="./credits.html" target="_blank" rel="noopener" hidden>查看完整在线署名</a>
  <div class="yl-modal-actions"><button type="button" data-action="close-modal">返回</button></div>`;

/**
 * @param {{onSelect?:(mode:'tour'|'fps', options?:{difficulty?:'standard'|'veteran'})=>unknown,backgroundUrl?:string}} options
 */
export function mountLauncher({ onSelect, backgroundUrl = './docs/images/hotel-apartment-sides-overview.jpg' } = {}) {
  const style = document.createElement('style');
  style.textContent = launcherCSS;
  const root = document.createElement('main');
  root.className = 'yl-launcher';
  root.id = 'ylLauncher';
  root.dataset.screen = 'home';
  root.dataset.selectedDifficulty = 'standard';
  root.setAttribute('aria-label', '云澜汇游戏入口');
  root.innerHTML = `
    <img class="yl-cover-image" alt="云澜汇一期商场与酒店公寓" decoding="async" fetchpriority="high">
    <div class="yl-cover-shade"></div>
    <div class="yl-shell">
      <header class="yl-top">
        <div class="yl-brand"><span class="yl-wordmark">云澜汇</span><span class="yl-edition">${LAUNCHER_EDITION}</span></div>
        <div class="yl-top-right"><span class="yl-version">${LAUNCHER_VERSION} · 封锁行动</span><button type="button" class="yl-quick" data-action="help">操作说明</button><button type="button" class="yl-quick" data-action="credits">素材署名</button></div>
      </header>
      <div class="yl-home-screen">
        <main class="yl-home">
          <section class="yl-hero" aria-labelledby="ylTitle">
            <p class="yl-kicker">熟悉的城市，另一种进入方式</p>
            <h1 id="ylTitle">云澜汇</h1>
            <p class="yl-subtitle">封锁行动</p>
            <p class="yl-copy">穿过商场，深入酒店，和 AI 队友回声一起取回情报。<br>在断电的楼宇里搜索、交战，然后选择一条撤离路线。</p>
            <div class="yl-route" aria-label="行动路线：一期商场、酒店、公寓、撤离点"><span>一期商场</span><i></i><span>酒店 2F</span><i></i><span>公寓 B1</span><i></i><span>撤离点</span></div>
            <nav class="yl-modes" aria-label="选择游戏模式">
              <button type="button" class="yl-mode yl-mode-primary" data-mode="fps"><span class="yl-mode-badge">行动推荐</span><b>竞技 FPS</b><span>封锁行动 · 单人 + AI 队友 · 搜索与撤离</span><em>标准 / 老兵 · 地下接应车 / 屋顶直升机</em><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
              <button type="button" class="yl-mode" data-mode="tour"><b>完整园区探索</b><span>一期 · 二期 · 三期 · 住宅 · 地铁</span><em>自由漫游 · 楼层导览</em><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg></button>
            </nav>
          </section>
          <aside class="yl-brief" aria-label="行动简报">
            <div class="yl-eyebrow">行动简报 / OPERATION BRIEF</div>
            <h2>断电撤离</h2>
            <p class="yl-brief-copy">停电后的云澜汇一片漆黑。终端密钥在商场，情报在酒店二楼，撤离点只剩两个选择。</p>
            <ol class="yl-objectives">${LAUNCHER_OBJECTIVES.map(item => `<li><span class="yl-step">${item.step}</span><div><b>${item.title}</b><span>${item.text}</span></div></li>`).join('')}</ol>
            <div class="yl-stats" aria-label="行动数据">${LAUNCHER_STATS.map(item => `<div><b>${item.value}</b><span>${item.label}</span><em>${item.hint}</em></div>`).join('')}</div>
            <p class="yl-brief-note">选择“竞技 FPS”进入行动简报，先确认难度再出发。</p>
          </aside>
        </main>
        <footer class="yl-footer">
          <div><p class="yl-status" role="status" aria-live="polite">选择模式，进入云澜汇</p><p>触屏 / 键鼠操作 · 横屏视野更开阔</p></div>
          <div class="yl-footer-quick"><button type="button" class="yl-quick" data-action="help">操作说明</button><button type="button" class="yl-quick" data-action="credits">素材署名</button></div>
          <p class="yl-footer-meta">${LAUNCHER_VERSION} · 18 场景楼层 / 17 可走层<br>YUNLAN MALL · MOBILE EDITION</p>
        </footer>
      </div>
      <div class="yl-briefing-screen" hidden>
        <div class="yl-briefing-top"><button type="button" class="yl-back" data-action="back-home">← 返回封面</button><span class="yl-eyebrow">OPERATION BRIEFING / 02</span></div>
        <div class="yl-briefing-grid">
          <section class="yl-briefing-main" aria-labelledby="ylBriefingTitle">
            <div class="yl-eyebrow">封锁行动 · 断电撤离</div>
            <h2 id="ylBriefingTitle">行动简报</h2>
            <p>取得商场终端密钥和酒店二楼情报，然后选择地下接应车或屋顶直升机撤离。情报可以额外加分，护甲板与手雷会让你走得更远。</p>
            <ol class="yl-objectives">${LAUNCHER_OBJECTIVES.map(item => `<li><span class="yl-step">${item.step}</span><div><b>${item.title}</b><span>${item.text}</span></div></li>`).join('')}</ol>
            <p class="yl-briefing-note">出发前不会加载任何 3D 场景或模型资源；加载进度与提示会显示在这里。行动中可按 Esc 暂停并调整设置。</p>
          </section>
          <aside class="yl-briefing-side" aria-label="确认难度">
            <p class="yl-difficulty-label" id="ylDifficultyLabel">选择行动难度</p>
            <div class="yl-difficulty" role="radiogroup" aria-labelledby="ylDifficultyLabel">${LAUNCHER_DIFFICULTIES.map(item => `<button type="button" role="radio" data-difficulty="${item.id}" aria-checked="${item.id === 'standard'}"><b>${item.label}</b><span>${item.short}</span></button>`).join('')}</div>
            <p class="yl-difficulty-detail">${LAUNCHER_DIFFICULTIES[0].detail}</p>
            <div class="yl-stats" aria-label="行动数据">${LAUNCHER_STATS.slice(0, 3).map(item => `<div><b>${item.value}</b><span>${item.label}</span><em>${item.hint}</em></div>`).join('')}</div>
            <button type="button" class="yl-deploy" data-action="deploy">出发 <small>标准 · 常规补给</small></button>
            <button type="button" class="yl-back" data-action="back-home">返回封面</button>
          </aside>
        </div>
      </div>
    </div>
    <div class="yl-loading" hidden data-state="loading">
      <section class="yl-loading-card" role="status" aria-live="polite" aria-label="正在进入云澜汇">
        <div class="yl-eyebrow">LOADING / 云澜汇</div>
        <h2>正在进入行动</h2>
        <p class="yl-stage">正在准备…</p>
        <div class="yl-progress" role="progressbar" aria-label="加载进度" aria-valuemin="0" aria-valuemax="100"><i></i></div>
        <p class="yl-tip"><span class="yl-tip-label">提示</span><span class="yl-tip-text"></span></p>
        <p class="yl-load-error" role="alert"></p>
        <div class="yl-load-actions"><button type="button" class="yl-primary" data-action="retry">重试</button><button type="button" data-action="dismiss-error">返回封面</button></div>
      </section>
    </div>
    <div class="yl-modal-layer" hidden>
      <section class="yl-modal" role="dialog" aria-modal="true" aria-labelledby="ylModalTitle">
        <div class="yl-modal-head"><h2 id="ylModalTitle">操作说明</h2><button type="button" class="yl-modal-close" data-action="close-modal" aria-label="关闭">×</button></div>
        <div class="yl-modal-body"></div>
      </section>
    </div>`;
  const cover = root.querySelector('.yl-cover-image');
  if (cover) cover.src = backgroundUrl;
  document.head.append(style);
  document.body.append(root);

  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const abort = new AbortController();
  const on = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: abort.signal });
  let disposed = false;
  let busy = false;
  let difficulty = 'standard';
  let modalKind = '';
  let lastFocus = null;
  let tipTimer = 0;
  let tipIndex = 0;

  const status = message => { const node = $('.yl-status'); if (node && node.textContent !== String(message)) node.textContent = String(message); };
  const stage = message => { const node = $('.yl-stage'); if (node && node.textContent !== String(message)) node.textContent = String(message); };
  const setScreen = next => {
    root.dataset.screen = next;
    const home = $('.yl-home-screen'), briefing = $('.yl-briefing-screen');
    if (home) home.hidden = next !== 'home';
    if (briefing) briefing.hidden = next !== 'briefing';
  };
  function setDifficulty(id) {
    difficulty = LAUNCHER_DIFFICULTIES.some(item => item.id === id) ? id : 'standard';
    root.dataset.selectedDifficulty = difficulty;
    for (const button of $$('[data-difficulty]')) button.setAttribute('aria-checked', String(button.dataset.difficulty === difficulty));
    const item = LAUNCHER_DIFFICULTIES.find(entry => entry.id === difficulty);
    const detail = $('.yl-difficulty-detail');
    if (detail && item) detail.textContent = item.detail;
    const sub = $('[data-action="deploy"] small');
    if (sub && item) sub.textContent = item.short;
  }
  function setProgress(progress) {
    const bar = $('.yl-progress'), fill = $('.yl-progress i');
    if (!bar || !fill) return;
    const value = Number(progress);
    const finite = Number.isFinite(value);
    bar.classList.toggle('indeterminate', !finite);
    if (finite) {
      const ratio = Math.max(0, Math.min(1, value));
      fill.style.width = `${ratio * 100}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    } else {
      fill.style.width = '';
      bar.removeAttribute('aria-valuenow');
    }
  }
  function showTip(index) {
    const node = $('.yl-tip-text');
    if (node) node.textContent = LAUNCHER_TIPS[index] || LAUNCHER_TIPS[0];
  }
  function startTips() {
    if (tipTimer) return;
    showTip(tipIndex);
    tipTimer = setInterval(() => { tipIndex = (tipIndex + 1) % LAUNCHER_TIPS.length; showTip(tipIndex); }, 2800);
  }
  function stopTips() { if (tipTimer) clearInterval(tipTimer); tipTimer = 0; }
  function toggleBusyControls(disabled) {
    for (const node of $$('[data-mode],[data-difficulty],[data-action="deploy"],[data-action="back-home"]')) node.disabled = !!disabled;
  }
  function setLoading(message = '正在进入…', progress) {
    if (disposed) return;
    busy = true;
    root.dataset.loading = 'loading';
    root.setAttribute('aria-busy', 'true');
    toggleBusyControls(true);
    const loading = $('.yl-loading');
    if (loading) { loading.hidden = false; loading.dataset.state = 'loading'; }
    const card = $('.yl-loading-card');
    if (card) card.setAttribute('aria-label', String(message));
    status(message);
    stage(message);
    setProgress(progress);
    startTips();
  }
  function showError(message) {
    if (disposed) return;
    busy = false;
    stopTips();
    root.dataset.loading = 'error';
    root.setAttribute('aria-busy', 'false');
    toggleBusyControls(false);
    const loading = $('.yl-loading');
    if (loading) { loading.hidden = false; loading.dataset.state = 'error'; }
    status('未能进入，请重试');
    stage('未能进入，请重试');
    const error = $('.yl-load-error');
    if (error) error.textContent = String(message || '加载失败');
    const retry = $('[data-action="retry"]');
    if (retry) retry.focus?.({ preventScroll: true });
  }
  function dismissError() {
    if (busy) return;
    const loading = $('.yl-loading');
    if (loading) loading.hidden = true;
    root.dataset.loading = '';
    root.setAttribute('aria-busy', 'false');
    toggleBusyControls(false);
    stage('正在准备…');
    const error = $('.yl-load-error');
    if (error) error.textContent = '';
  }
  function openBriefing() {
    if (busy) return;
    setScreen('briefing');
    status('确认行动难度后出发');
    setDifficulty(difficulty);
    queueMicrotask(() => { if (!disposed) $('[data-difficulty][aria-checked="true"]')?.focus?.({ preventScroll: true }); });
  }
  function closeBriefing() {
    if (busy) return;
    setScreen('home');
    status('选择模式，进入云澜汇');
    queueMicrotask(() => { if (!disposed) $('[data-mode="fps"]')?.focus?.({ preventScroll: true }); });
  }
  async function selectMode(mode) {
    if (busy || disposed) return;
    if (mode === 'fps') { openBriefing(); return; }
    busy = true;
    status('正在进入园区…');
    setLoading('正在进入园区…', .02);
    try { await onSelect?.('tour', {}); }
    catch (error) { showError(error?.message || error); }
  }
  async function deploy() {
    if (busy || disposed) return;
    const options = { difficulty };
    busy = true;
    status('正在部署封锁行动…');
    setLoading(`正在部署封锁行动 · ${difficulty === 'veteran' ? '老兵' : '标准'}难度`, .02);
    try { await onSelect?.('fps', options); }
    catch (error) { showError(error?.message || error); }
  }
  function openModal(kind) {
    const layer = $('.yl-modal-layer'), title = $('#ylModalTitle'), body = $('.yl-modal-body');
    if (!layer || !body) return;
    lastFocus = document.activeElement;
    modalKind = kind;
    if (title) title.textContent = kind === 'credits' ? '素材署名' : '操作说明';
    body.innerHTML = kind === 'credits' ? CREDITS_MODAL_HTML : HELP_MODAL_HTML;
    layer.hidden = false;
    root.dataset.modal = kind;
    if (kind === 'credits') {
      const online = /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[?::1\]?$)/.test(location.hostname);
      const link = body.querySelector('.yl-online-credits');
      if (link) link.hidden = !online;
    }
    queueMicrotask(() => { if (!disposed) $('.yl-modal-close')?.focus?.({ preventScroll: true }); });
  }
  function closeModal() {
    const layer = $('.yl-modal-layer'), body = $('.yl-modal-body');
    if (!layer || layer.hidden) return;
    layer.hidden = true;
    root.dataset.modal = '';
    modalKind = '';
    if (body) body.replaceChildren();
    lastFocus?.focus?.({ preventScroll: true });
    lastFocus = null;
  }

  on(root, 'click', async event => {
    if (disposed) return;
    const trigger = event.target.closest('[data-mode],[data-difficulty],[data-action]');
    if (!trigger || trigger.disabled) return;
    if (trigger.dataset.mode) { await selectMode(trigger.dataset.mode); return; }
    if (trigger.dataset.difficulty) { setDifficulty(trigger.dataset.difficulty); return; }
    const action = trigger.dataset.action;
    if (action === 'help') openModal('help');
    else if (action === 'credits') openModal('credits');
    else if (action === 'close-modal') closeModal();
    else if (action === 'deploy') await deploy();
    else if (action === 'back-home') closeBriefing();
    else if (action === 'retry') location.reload();
    else if (action === 'dismiss-error') dismissError();
  });

  on(root, 'keydown', event => {
    if (event.key === 'Escape') {
      if (modalKind) { event.preventDefault(); closeModal(); return; }
      if (!busy && $('.yl-loading')?.dataset.state === 'error') { dismissError(); return; }
      if (!busy && $('.yl-briefing-screen') && !$('.yl-briefing-screen').hidden) { event.preventDefault(); closeBriefing(); return; }
      return;
    }
    // Arrow keys move inside the difficulty radiogroup like a native radio.
    const difficultyButton = event.target.closest?.('[data-difficulty]');
    if (difficultyButton && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const index = LAUNCHER_DIFFICULTIES.findIndex(item => item.id === difficulty);
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const next = LAUNCHER_DIFFICULTIES[(index + step + LAUNCHER_DIFFICULTIES.length) % LAUNCHER_DIFFICULTIES.length];
      setDifficulty(next.id);
      $(`[data-difficulty="${next.id}"]`)?.focus?.({ preventScroll: true });
      return;
    }
    if (event.key !== 'Tab') return;
    const layer = $('.yl-modal-layer');
    if (!layer || layer.hidden) return;
    const focusables = [...layer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(node => !node.disabled && !node.hidden && node.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  setDifficulty('standard');

  return {
    root,
    setLoading,
    showError,
    /** Read-only state useful for main.js diagnostics / QA. */
    get screen() { return root.dataset.screen; },
    get difficulty() { return difficulty; },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTips();
      abort.abort();
      root.remove();
      style.remove();
    },
  };
}
