// Mobile input and HUD only. Simulation, navigation and combat stay in game.js.
export const FPS_CONTROL_STORAGE_KEY = 'yunlan.fps.controls.v1';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const numeric = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const CONTROL_KEYS = ['move', 'fire', 'ads', 'reload', 'swap', 'interact', 'sprint', 'crouch', 'heal'];
const DEFAULT_POSITIONS = {
  landscape: {
    move: [.125, .73], fire: [.895, .56], ads: [.79, .57], reload: [.90, .83],
    swap: [.72, .84], interact: [.68, .59], sprint: [.125, .40], crouch: [.81, .84], heal: [.255, .84],
  },
  portrait: {
    move: [.18, .81], fire: [.85, .735], ads: [.67, .73], reload: [.85, .88],
    swap: [.50, .89], interact: [.69, .59], sprint: [.18, .645], crouch: [.68, .88], heal: [.18, .92],
  },
};

/** Validate persisted data rather than trusting a previous session's JSON. */
export function normalizeControlSettings(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const positions = { portrait: {}, landscape: {} };
  for (const orientation of Object.keys(positions)) {
    for (const key of CONTROL_KEYS) {
      const stored = value.positions?.[orientation]?.[key];
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        positions[orientation][key] = { x: clamp(stored.x, 0, 1), y: clamp(stored.y, 0, 1) };
      }
    }
  }
  return {
    scale: clamp(numeric(value.scale, 1), .8, 1.4),
    opacity: clamp(numeric(value.opacity, .78), .3, 1),
    sensitivity: clamp(numeric(value.sensitivity, 1), .35, 2.5),
    invertY: value.invertY === true,
    positions,
  };
}

/** Constrain the entire target inside the safe-area arena, not just its centre. */
export function clampControlPosition(position, width, height, size = 44) {
  const halfW = typeof size === 'object' ? size.width / 2 : size / 2;
  const halfH = typeof size === 'object' ? size.height / 2 : size / 2;
  const marginX = Math.min(.5, (halfW + 4) / Math.max(1, width));
  const marginY = Math.min(.5, (halfH + 4) / Math.max(1, height));
  return { x: clamp(numeric(position.x, .5), marginX, 1 - marginX), y: clamp(numeric(position.y, .5), marginY, 1 - marginY) };
}

const icons = {
  fire: '<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  ads: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/><circle cx="12" cy="12" r="3"/>',
  reload: '<path d="M19.7 7A8 8 0 1 0 20 16M20 3v5h-5"/>',
  swap: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
  interact: '<path d="M8 13V5a2 2 0 0 1 4 0v7m0-4a2 2 0 0 1 4 0v4m0-2a2 2 0 0 1 4 0v6c0 4-3 6-6 6-3 0-5-2-6-4l-4-5a2 2 0 0 1 3-2l1 2"/>',
  sprint: '<circle cx="15" cy="4" r="2"/><path d="m7 10 5-3 4 4 4 1m-8-5-2 7 5 3 1 5M10 14l-4 6H2"/>',
  crouch: '<circle cx="12" cy="4" r="2"/><path d="m9 8 4 3 5 1M9 8l-2 6 7 2-2 5h7M7 14l-4 5"/>',
  heal: '<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M9 5V3h6v2m-3 5v7m-3.5-3.5h7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  squad: '<circle cx="8" cy="8" r="3"/><path d="M2 20v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 5 5v1"/>',
};
const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ''}</svg>`;
const HUD_CSS = `
.fps-hud{--fps-scale:1;--fps-opacity:.78;--fps-amber:#e8b876;--fps-mint:#9bc9bc;--fps-white:#edf4f8;--fps-muted:#b4c7d3;position:fixed;inset:0;z-index:80;color:var(--fps-white);font:12px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;isolation:isolate;color-scheme:dark}
.fps-hud *{box-sizing:border-box}.fps-hud [hidden]{display:none!important}.fps-hud button,.fps-hud input{font:inherit}.fps-hud button{color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}.fps-hud button:focus-visible,.fps-hud input:focus-visible{outline:2px solid var(--fps-amber);outline-offset:3px}.fps-hud button:disabled{cursor:default}.fps-hud svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.fps-look{position:absolute;inset:0 0 0 34%;pointer-events:auto;touch-action:none;z-index:0}.fps-live{position:absolute;inset:0;pointer-events:none;transition:opacity .15s}.fps-hud[data-paused="true"]:not([data-editing="true"]) .fps-live{opacity:.22}.fps-hud[data-paused="true"] .fps-look{pointer-events:none}.fps-hud[data-paused="true"]:not([data-editing="true"]) .fps-control,.fps-hud[data-paused="true"] .fps-pause,.fps-hud[data-paused="true"] .fps-squad-toggle{pointer-events:none}
.fps-top-left{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));top:calc(12px + env(safe-area-inset-top,0px));width:min(280px,40vw);text-shadow:0 1px 3px #000,0 1px 8px #0009}.fps-mission-overline{display:flex;align-items:center;gap:8px;font-size:9px;letter-spacing:.12em;color:var(--fps-amber)}.fps-mission-step{font:600 13px/1 ui-monospace,SFMono-Regular,monospace}.fps-objective{font-size:13px;font-weight:600;margin:4px 0 1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fps-objective-detail{font-size:10px;color:#d5e0e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:14px}.fps-route{display:flex;gap:5px;width:104px;margin:7px 0 5px}.fps-route i{height:2px;background:#d1e1ed4a;flex:1}.fps-route i.complete{background:#9bc9bc}.fps-route i.current{background:#e8b876}.fps-bearing{font-size:10px;color:#e8cda4;min-height:14px}.fps-compass{position:absolute;left:50%;top:calc(13px + env(safe-area-inset-top,0px));transform:translateX(-50%);font:600 10px/1.2 ui-monospace,SFMono-Regular,monospace;display:flex;align-items:center;gap:15px;color:#d3e1e9;text-shadow:0 1px 4px #000}.fps-compass:before,.fps-compass:after{content:"";height:4px;width:30px;border-top:1px solid #d9e9f08c;border-left:1px solid #d9e9f04d;border-right:1px solid #d9e9f04d}.fps-compass b{color:#fff;font-size:12px;min-width:45px;text-align:center}.fps-pause{position:absolute;top:calc(7px + env(safe-area-inset-top,0px));right:calc(10px + env(safe-area-inset-right,0px));width:44px;height:44px;border-radius:14px;background:#10243176;border:1px solid #d1e5f03d;display:grid;place-items:center;pointer-events:auto}.fps-pause svg{width:19px;height:19px}
.fps-squad{position:absolute;left:calc(14px + env(safe-area-inset-left,0px));top:calc(105px + env(safe-area-inset-top,0px));pointer-events:none;max-width:245px}.fps-squad-toggle{display:flex;align-items:center;gap:7px;min-height:44px;padding:6px 10px;border-radius:12px;background:#0d22358c;border:1px solid #c3e1df2b;pointer-events:auto;text-align:left;max-width:235px}.fps-squad-toggle svg{width:18px;height:18px;color:var(--fps-mint);flex:none}.fps-teammate{font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.fps-teammate-health{font:10px ui-monospace,monospace;color:#b7d7d0}.fps-squad-choices{display:flex;gap:4px;margin-top:5px;pointer-events:auto;padding:4px;background:#10232fec;border:1px solid #8daebb3d;border-radius:12px}.fps-squad-choices button{min-width:51px;min-height:44px;border:0;background:#f0f8ff0b;border-radius:8px;font-size:11px}.fps-squad-choices button[aria-pressed="true"]{background:#9bc9bc30;color:#bfe9dc}
.fps-controls{position:absolute;inset:calc(5px + env(safe-area-inset-top,0px)) calc(10px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(10px + env(safe-area-inset-left,0px));pointer-events:none}.fps-control{position:absolute;left:50%;top:50%;width:max(44px,calc(var(--base-size,52px)*var(--fps-scale)));height:max(44px,calc(var(--base-size,52px)*var(--fps-scale)));transform:translate(-50%,-50%);border:1px solid #d1e5ef69;border-radius:50%;background:linear-gradient(145deg,#d6e6f020,#11273542);color:#edf4f8;pointer-events:auto;touch-action:none;opacity:var(--fps-opacity);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0;box-shadow:inset 0 1px 0 #effaff12,0 2px 8px #020e1717;text-shadow:0 1px 3px #071927;transition:background .1s,border-color .1s;z-index:2}.fps-control .fps-control-label{font-size:9px;line-height:1;white-space:nowrap}.fps-control svg{width:22px;height:22px}.fps-control.is-active,.fps-control[aria-pressed="true"]{background:#c4dce658;border-color:#e7f5ff;opacity:1}.fps-fire{--base-size:72px;border:1px solid #f0c491a8;background:radial-gradient(circle,#c6936030 0%,#d3aa7d0a 65%);color:#f6d3a8}.fps-fire svg{width:29px;height:29px}.fps-fire.is-active{background:#e8b87677;border-color:#ffdfb2}.fps-interact{--base-size:55px;border-color:#a7d9cc9e;color:#d0f0e5}.fps-interact:disabled{opacity:.24}.fps-stick{--base-size:108px;border-color:#daebf041;background:radial-gradient(circle,transparent 30%,#b0c8da12);box-shadow:inset 0 0 25px #acccda10}.fps-stick:before,.fps-stick:after{content:"";position:absolute;background:#d3e4ed30}.fps-stick:before{height:1px;width:74%;left:13%;top:50%}.fps-stick:after{width:1px;height:74%;left:50%;top:13%}.fps-stick-knob{position:absolute;left:50%;top:50%;width:40%;height:40%;margin:-20% 0 0 -20%;border-radius:50%;border:1px solid #e0eef378;background:linear-gradient(145deg,#b5d6e345,#a4bddb18);box-shadow:0 3px 8px #0c243823;z-index:1}.fps-stick .fps-control-label{position:absolute;bottom:9px;color:#dbe9ed8c;font-size:8px}
.fps-crosshair{position:absolute;left:50%;top:50%;width:24px;height:24px;transform:translate(-50%,-50%);color:#fff;filter:drop-shadow(0 1px 1px #0009);opacity:.8}.fps-crosshair:before,.fps-crosshair:after{content:"";position:absolute;background:currentColor}.fps-crosshair:before{width:2px;height:4px;top:0;left:11px;box-shadow:0 20px currentColor}.fps-crosshair:after{width:4px;height:2px;left:0;top:11px;box-shadow:20px 0 currentColor}.fps-crosshair i{position:absolute;left:11px;top:11px;width:2px;height:2px;background:currentColor}.fps-hud[data-ads="true"] .fps-crosshair{width:3px;height:3px;background:#fff;border-radius:50%}.fps-hud[data-ads="true"] .fps-crosshair:before,.fps-hud[data-ads="true"] .fps-crosshair:after,.fps-hud[data-ads="true"] .fps-crosshair i{display:none}.fps-hit-marker{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:20px;height:20px;opacity:0;border:2px solid #edc99e;clip-path:polygon(0 0,36% 0,36% 12%,12% 12%,12% 36%,0 36%,0 0,100% 0,100% 36%,88% 36%,88% 12%,64% 12%,64% 0,100% 0,100% 100%,64% 100%,64% 88%,88% 88%,88% 64%,100% 64%,100% 100%,0 100%,0 64%,12% 64%,12% 88%,36% 88%,36% 100%,0 100%)}.fps-hit-marker.on{opacity:1}.fps-damage{position:absolute;inset:0;box-shadow:inset 0 0 90px 20px #a22d324d;opacity:0;transition:opacity .3s;pointer-events:none}.fps-damage.on{opacity:1}
.fps-health{position:absolute;bottom:calc(13px + env(safe-area-inset-bottom,0px));left:calc(16px + env(safe-area-inset-left,0px));display:flex;align-items:center;gap:9px;text-shadow:0 1px 5px #000}.fps-health b{font:600 17px ui-monospace,monospace;min-width:32px}.fps-health-track{height:3px;background:#e4f2f235;width:82px;overflow:hidden}.fps-health-track i{display:block;width:100%;height:100%;background:#c0e1d5}.fps-health.low{color:#ffb5a4}.fps-health.low i{background:#ff9e87}.fps-health small{font-size:8px;letter-spacing:.1em;color:#c5d9e2}.fps-ammo{position:absolute;bottom:calc(11px + env(safe-area-inset-bottom,0px));right:calc(16px + env(safe-area-inset-right,0px));display:flex;align-items:flex-end;gap:10px;text-shadow:0 1px 5px #000}.fps-weapon{font-size:10px;text-transform:uppercase;color:#d6e3ec;max-width:120px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding-bottom:3px}.fps-ammo-numbers b{font:600 25px/1 ui-monospace,monospace}.fps-ammo-numbers span{font:12px ui-monospace,monospace;color:#bbccd7}.fps-ammo.reloading .fps-weapon{color:var(--fps-amber)}.fps-notice{position:absolute;left:50%;top:calc(55px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:7px 13px;background:#102636dd;border:1px solid #b6d0dd3b;border-radius:10px;max-width:min(390px,62vw);font-size:11px;text-align:center;opacity:0;transition:opacity .2s}.fps-notice.on{opacity:1}.fps-interact-prompt{position:absolute;left:50%;top:calc(50% + 43px);transform:translateX(-50%);max-width:42vw;font-size:11px;text-align:center;text-shadow:0 1px 5px #000;color:#cce9de}.fps-extract-progress{position:absolute;left:50%;top:calc(50% + 67px);transform:translateX(-50%);width:120px;height:3px;background:#d2efde32}.fps-extract-progress i{height:100%;display:block;background:#a4d4bf;width:0}.fps-keyboard-hint{position:absolute;left:50%;bottom:13px;transform:translateX(-50%);font-size:9px;color:#d7e7ef94;text-shadow:0 1px 4px #000;white-space:nowrap}.fps-world-marker{position:absolute;pointer-events:none;transform:translate(-50%,-50%);color:#ffe1ad;font-weight:600;font-size:11px;text-shadow:0 1px 3px #000;white-space:nowrap;padding:4px 8px;background:#112b3d80;border:1px solid #c6a3695e;border-radius:8px}.fps-world-marker:empty{display:none}.fps-map{position:absolute;display:none}
.fps-modal{position:absolute;inset:0;background:#06121ddb;display:flex;align-items:center;justify-content:center;padding:calc(18px + env(safe-area-inset-top,0px)) calc(22px + env(safe-area-inset-right,0px)) calc(18px + env(safe-area-inset-bottom,0px)) calc(22px + env(safe-area-inset-left,0px));pointer-events:auto;touch-action:pan-y;overflow:auto;z-index:20}.fps-dialog{width:min(620px,100%);max-height:100%;overflow:auto;background:#142735ed;border:1px solid #afc7d135;border-radius:22px;padding:24px;box-shadow:0 15px 80px #0006}.fps-dialog h2{margin:2px 0 6px;font-size:27px;letter-spacing:.05em}.fps-dialog p{color:#b6cbd7;font-size:12px;line-height:1.75;margin:6px 0 17px}.fps-eyebrow{font:10px ui-monospace,monospace;letter-spacing:.15em;color:#e8b876}.fps-dialog button{min-height:44px;padding:10px 15px;border:1px solid #c1d7e32b;border-radius:11px;background:#b9d2e20a;font-weight:500}.fps-dialog button:hover{background:#c9e5f41c}.fps-dialog .fps-primary{background:#e8b876;color:#162733;border-color:#e8b876;font-weight:650}.fps-dialog .fps-primary:hover{background:#f1c88f}.fps-menu-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:16px 0}.fps-menu-actions .fps-primary{grid-column:1/-1}.fps-menu-bottom{display:flex;gap:9px;margin-top:13px}.fps-menu-bottom button{flex:1;font-size:11px}.fps-order-form{border-top:1px solid #b3d0e11c;padding-top:16px;margin-top:18px}.fps-order-form label{font-size:11px;display:block;margin-bottom:8px;color:#c5e0d9}.fps-order-row{display:flex;gap:8px}.fps-order-row input{min-width:0;flex:1;min-height:44px;padding:10px 12px;background:#08182596;color:#edf4f8;border:1px solid #bdd6e236;border-radius:10px;user-select:text;-webkit-user-select:text}.fps-order-row button{flex:none}.fps-order-status{font-size:10px;color:#b5d7c9;min-height:14px;margin-top:7px}.fps-credits{display:flex;align-items:center;min-height:44px;font-size:9px;color:#aac8d8;text-underline-offset:3px}.fps-dialog .fps-credits{border:0;padding:0;background:none;text-decoration:underline}.fps-credits-content article{padding:8px 0 15px;border-bottom:1px solid #c9dfed26}.fps-credits-content h3{font-size:14px;margin:8px 0}.fps-credits-content a{display:inline-flex;align-items:center;min-height:44px;margin-right:18px;font-size:11px;color:#d9c59e;text-underline-offset:4px}.fps-credits-content p{font-size:11px;margin:5px 0;line-height:1.75}.fps-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}.fps-panel-heading h2{font-size:21px;margin:0}.fps-settings-row{display:grid;grid-template-columns:1fr auto;gap:6px 16px;margin-bottom:20px;align-items:center}.fps-settings-row label{font-size:12px}.fps-settings-row output{font:11px ui-monospace,monospace;color:#e8c48f}.fps-settings-row input[type="range"]{grid-column:1/-1;width:100%;min-height:28px;accent-color:#e8b876;cursor:pointer;touch-action:pan-y}.fps-settings-toggle{display:flex;align-items:center;gap:10px;min-height:44px;font-size:12px}.fps-settings-toggle input{width:20px;height:20px;accent-color:#e8b876}.fps-settings-actions{display:flex;gap:9px;margin-top:14px}.fps-settings-actions button{flex:1;font-size:11px}.fps-settings-caption{font-size:10px!important;margin:12px 0 0!important}.fps-editor-bar{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100% - 26px);padding:8px 10px 8px 14px;border:1px solid #d2dfeb40;background:#102839f5;border-radius:16px;display:flex;gap:10px;align-items:center;pointer-events:auto;z-index:30;box-shadow:0 7px 28px #0005}.fps-editor-bar b{font-size:11px}.fps-editor-bar span{display:block;font-size:9px;color:#c4d7e2;line-height:1.6}.fps-editor-bar button{min-height:44px;padding:6px 14px;border:1px solid #bfd8e433;border-radius:10px;background:#d7e9f014;font-size:11px;white-space:nowrap}.fps-editor-bar button[data-action="editor-save"]{background:#e8b876;color:#162733;border-color:#e8b876}.fps-hud[data-editing="true"] .fps-control{opacity:1;border-style:dashed;border-color:#dfbf8b;background:#0c293ab8;pointer-events:auto;cursor:grab}.fps-hud[data-editing="true"] .fps-control.is-selected{border:2px solid #ffda99;box-shadow:0 0 0 4px #e8b8762b}.fps-hud[data-editing="true"] .fps-top-left,.fps-hud[data-editing="true"] .fps-compass,.fps-hud[data-editing="true"] .fps-squad,.fps-hud[data-editing="true"] .fps-pause{visibility:hidden}.fps-editor-grid{position:absolute;inset:0;background-image:linear-gradient(#a0bdcd09 1px,transparent 1px),linear-gradient(90deg,#a0bdcd09 1px,transparent 1px);background-size:24px 24px;pointer-events:none}.fps-result-title{font-size:32px!important;margin:8px 0!important}.fps-result-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0}.fps-result-stat{padding:11px 0;border-top:1px solid #b4d2df29}.fps-result-stat b{display:block;font:600 23px ui-monospace,monospace;color:#f2dab6}.fps-result-stat span{font-size:10px;color:#b9cedb}.fps-result-actions{display:flex;gap:10px}.fps-result-actions button{flex:1}.fps-dialog[data-result="failure"] .fps-eyebrow{color:#ffb6a7}.fps-dialog[data-result="failure"] .fps-result-title{color:#f6d1c8}
@media(orientation:portrait){.fps-top-left{width:calc(100% - 80px);max-width:310px;top:calc(15px + env(safe-area-inset-top,0px))}.fps-objective{font-size:14px}.fps-compass{top:calc(134px + env(safe-area-inset-top,0px));font-size:10px}.fps-squad{top:calc(92px + env(safe-area-inset-top,0px))}.fps-squad-toggle{min-height:44px;padding:4px 9px}.fps-notice{top:calc(175px + env(safe-area-inset-top,0px));max-width:84vw}.fps-health-track{width:61px}.fps-health{bottom:calc(18px + env(safe-area-inset-bottom,0px))}.fps-ammo{bottom:calc(15px + env(safe-area-inset-bottom,0px))}.fps-weapon{font-size:9px;max-width:90px}.fps-keyboard-hint{display:none}.fps-dialog{padding:23px 20px;border-radius:21px}.fps-menu-actions{grid-template-columns:1fr}.fps-menu-actions .fps-primary{grid-column:auto}.fps-editor-bar{align-items:center;gap:7px;padding:8px 9px}.fps-editor-bar b{font-size:10px}.fps-editor-bar button{padding:6px 10px;min-height:44px}.fps-editor-bar span{font-size:8px}.fps-result-stats{grid-template-columns:repeat(3,1fr)}.fps-interact-prompt{max-width:70vw}}
@media(orientation:landscape) and (max-height:460px){.fps-top-left{top:calc(8px + env(safe-area-inset-top,0px));width:min(235px,32vw)}.fps-objective{font-size:11px}.fps-objective-detail{font-size:9px}.fps-mission-overline{font-size:8px}.fps-route{margin-top:4px;margin-bottom:3px}.fps-bearing{font-size:9px}.fps-squad{top:calc(86px + env(safe-area-inset-top,0px))}.fps-squad-toggle{min-height:44px;padding:4px 8px}.fps-squad-choices{position:absolute;left:100%;top:0;margin:0 0 0 5px}.fps-squad-choices button{min-width:44px;font-size:10px}.fps-stick{--base-size:98px}.fps-notice{top:calc(42px + env(safe-area-inset-top,0px))}.fps-dialog{padding:20px 23px;width:min(680px,100%)}.fps-dialog [data-panel="menu"]{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}.fps-menu-intro{grid-column:1}.fps-menu-actions{grid-column:2;grid-row:1/3;margin:0;align-self:start}.fps-menu-bottom{grid-column:2;grid-row:3;margin-top:0}.fps-order-form{grid-column:1;grid-row:2/4;margin:0;padding-top:10px}.fps-dialog h2{font-size:24px}.fps-dialog p{font-size:11px;margin-bottom:10px}.fps-order-form label{font-size:10px}.fps-order-row input{width:100px;font-size:11px}.fps-order-row button{font-size:10px;padding:8px 11px}.fps-menu-actions button{min-height:44px;font-size:11px}.fps-settings-grid{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}.fps-settings-row{margin-bottom:9px}.fps-settings-actions{margin-top:8px}.fps-settings-caption{margin-top:6px!important}.fps-settings-toggle{min-height:35px}.fps-result-layout{display:grid;grid-template-columns:1fr 1fr;gap:0 25px}.fps-result-stats{margin:0;grid-column:2;grid-row:1/3}.fps-result-actions{grid-column:1/-1;margin-top:14px}.fps-result-title{font-size:28px!important}}
@media(hover:hover) and (pointer:fine){.fps-look{pointer-events:none}}@media(pointer:coarse){.fps-keyboard-hint{display:none}}@media(prefers-reduced-motion:reduce){.fps-hud *{transition:none!important;animation:none!important}}
`;

/**
 * Input contract: onMove.x = right, onMove.y = forward (-1..1); onLook is raw CSS px.
 * onSettings owns aim sensitivity/inversion in the game; HUD never applies it twice.
 */
export function createFPSHUD({ onAction = () => {}, onMove = () => {}, onLook, onSettings = () => {}, storage } = {}) {
  let settings;
  try { storage ??= globalThis.localStorage; settings = normalizeControlSettings(JSON.parse(storage?.getItem(FPS_CONTROL_STORAGE_KEY) || '{}')); }
  catch { settings = normalizeControlSettings(); }
  const style = document.createElement('style'); style.textContent = HUD_CSS;
  const root = document.createElement('div'); root.className = 'fps-hud'; root.id = 'fpsHUD';
  root.dataset.paused = 'false'; root.dataset.editing = 'false'; root.dataset.ads = 'false';
  root.innerHTML = `
    <div class="fps-look" aria-hidden="true"></div>
    <div class="fps-live">
      <div class="fps-top-left"><div class="fps-mission-overline"><span class="fps-mission-step">01</span><span>封锁行动 / 当前目标</span></div><div class="fps-objective">搜索商场终端</div><div class="fps-objective-detail">和队友一起获取情报</div><div class="fps-route" aria-label="任务进度"><i class="current"></i><i></i><i></i></div><div class="fps-bearing"></div></div>
      <div class="fps-compass" aria-label="朝向"><b>北 000°</b></div>
      <button class="fps-pause" data-action="pause" aria-label="暂停游戏">${svg('pause')}</button>
      <div class="fps-squad"><button class="fps-squad-toggle" data-action="squad-menu" aria-label="队友指令" aria-expanded="false">${svg('squad')}<span class="fps-teammate">回声 · 跟随</span><span class="fps-teammate-health">100</span></button><div class="fps-squad-choices" hidden><button data-action="squad" data-command="follow" aria-pressed="true">跟随</button><button data-action="squad" data-command="hold" aria-pressed="false">守位</button><button data-action="squad" data-command="cover" aria-pressed="false">掩护</button><button data-action="order-panel" aria-label="输入队友指令">指令</button></div></div>
      <div class="fps-controls" aria-label="触屏游戏控制">
        <div class="fps-control fps-stick" data-control="move" role="application" aria-label="左摇杆：移动"><i class="fps-stick-knob"></i><span class="fps-control-label">移动</span></div>
        ${[['fire','开火','按住开火'],['ads','瞄准','切换瞄准'],['reload','换弹','重新装填'],['swap','切枪','切换武器'],['interact','互动','互动或拾取'],['sprint','冲刺','按住冲刺'],['crouch','蹲伏','切换蹲伏'],['heal','急救 2','使用急救包']].map(([key,label,aria]) => `<button class="fps-control fps-${key}" data-action="${key}" data-control="${key}" aria-label="${aria}"${['ads','crouch'].includes(key)?' aria-pressed="false"':''}>${svg(key)}<span class="fps-control-label">${label}</span></button>`).join('')}
      </div>
      <div class="fps-crosshair" aria-hidden="true"><i></i></div><div class="fps-hit-marker" aria-hidden="true"></div><div class="fps-damage" aria-hidden="true"></div>
      <div class="fps-health"><b>100</b><div><small>生命</small><div class="fps-health-track"><i></i></div></div></div>
      <div class="fps-ammo"><div class="fps-weapon">步枪</div><div class="fps-ammo-numbers"><b>30</b><span> / 120</span></div></div>
      <div class="fps-notice" role="status" aria-live="polite"></div><div class="fps-interact-prompt" hidden></div><div class="fps-extract-progress" hidden><i></i></div>
      <div class="fps-keyboard-hint">WASD 移动 · 鼠标瞄准 · R 换弹 · E 互动 · Q 切枪</div><div class="fps-world-marker"></div><div class="fps-map"></div>
    </div>
    <div class="fps-editor-grid" hidden></div>
    <div class="fps-editor-bar" hidden><div><b>拖动按钮，自定义布局</b><span class="fps-editor-caption">游戏已暂停 · 横竖屏分别保存</span></div><button data-action="editor-cancel">取消</button><button data-action="editor-save">保存</button></div>
    <div class="fps-modal" hidden>
      <section class="fps-dialog" role="dialog" aria-modal="true" aria-label="游戏菜单">
        <div data-panel="menu">
          <div class="fps-menu-intro"><div class="fps-eyebrow">OPERATION / PAUSED</div><h2>行动暂停</h2><p>搜索商场终端，获取酒店情报，<br>和队友前往公寓撤离点。</p></div>
          <div class="fps-menu-actions"><button class="fps-primary" data-action="resume">继续行动</button><button data-action="settings">操作设置</button><button data-action="editor">调整按键</button></div>
          <div class="fps-menu-bottom"><button data-action="restart">重新行动</button><button data-action="exit">返回封面</button></div>
          <form class="fps-order-form"><label for="fpsOrderInput">给队友下达指令</label><div class="fps-order-row"><input id="fpsOrderInput" autocomplete="off" maxlength="120" placeholder="例如：守住这里"><button type="submit">发送</button></div><div class="fps-order-status">支持跟随、守位与掩护指令</div><button class="fps-credits" type="button" data-action="credits" aria-label="素材署名与许可">素材署名 · DJMaesen / ELIZION</button></form>
        </div>
        <div data-panel="settings" hidden><div class="fps-panel-heading"><h2>操作设置</h2><button data-action="menu">返回</button></div><div class="fps-settings-grid">
          <div class="fps-settings-row"><label for="fpsControlScale">按键大小</label><output data-output="scale"></output><input id="fpsControlScale" data-setting="scale" type="range" min="0.8" max="1.4" step="0.05"></div>
          <div class="fps-settings-row"><label for="fpsControlOpacity">按键不透明度</label><output data-output="opacity"></output><input id="fpsControlOpacity" data-setting="opacity" type="range" min="0.3" max="1" step="0.05"></div>
          <div class="fps-settings-row"><label for="fpsAimSensitivity">转向灵敏度</label><output data-output="sensitivity"></output><input id="fpsAimSensitivity" data-setting="sensitivity" type="range" min="0.35" max="2.5" step="0.05"></div>
          <label class="fps-settings-toggle"><input data-setting="invertY" type="checkbox">反转上下视角</label></div>
          <div class="fps-settings-actions"><button class="fps-primary" data-action="editor">拖动调整按键</button><button data-action="reset-controls">恢复默认</button></div><p class="fps-settings-caption">布局按横屏与竖屏分别保存。左侧摇杆移动，右侧空白区域滑动转向。</p>
        </div>
        <div data-panel="credits" hidden><div class="fps-panel-heading"><h2>素材署名</h2><button data-action="menu">返回</button></div><div class="fps-credits-content">
          <article><h3>SMG-45 / 贴图手臂</h3><p>“fps animated smg” · DJMaesen<br>采用源模型手套、布料袖子与 SMG 原生换弹动画。</p><a href="https://sketchfab.com/3d-models/fps-animated-smg-ea3dad7478624495a5a46f40127b0579" target="_blank" rel="noopener">DJMaesen 原始作品</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0 许可</a><p>改动：移动端贴图缩放与 JPEG 重编码，第一人称位置、后坐力、切枪与手枪换弹呈现。保留源几何。手枪握持姿态继承 AetherRadar / Operation Steel Tide 的适配。</p></article>
          <article><h3>Desert Eagle</h3><p>“Desert Eagle” · ELIZION</p><a href="https://sketchfab.com/3d-models/desert-eagle-cabde59f5cf24effaf80536e35d04e95" target="_blank" rel="noopener">ELIZION 原始作品</a><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0 许可</a><p>改动：贴图缩放与 JPEG 重编码、统一呈现比例、基于源分件制作弹匣和套筒运动。保留源几何。</p></article>
          <article><h3>人物与环境</h3><a href="https://github.com/microsoft/Microsoft-Rocketbox" target="_blank" rel="noopener">Microsoft Rocketbox · MIT</a><p>原人物网格与贴图经图集整理、移动端压缩和程序步态适配。</p><a href="https://polyhaven.com/license" target="_blank" rel="noopener">Poly Haven 材质 · CC0</a><p>使用本地保存的 PBR 材质并调整贴图编码与映射。用户提供的酒店套房模型保留原作者权益。</p></article>
          <p>上述枪械与手臂资源保留 CC BY 4.0 许可，与本项目软件代码许可分开。</p><a class="fps-online-credits" href="./credits.html" target="_blank" rel="noopener" hidden>查看完整在线署名</a>
        </div></div>
        <div data-panel="result" hidden><div class="fps-result-layout"><div><div class="fps-eyebrow fps-result-eyebrow">OPERATION COMPLETE</div><h2 class="fps-result-title">撤离成功</h2><p class="fps-result-subtitle"></p></div><div class="fps-result-stats"></div><div class="fps-result-actions"><button class="fps-primary" data-action="restart">再来一局</button><button data-action="exit">返回封面</button></div></div></div>
      </section>
    </div>`;
  document.head.append(style); document.body.append(root);
  const $ = selector => root.querySelector(selector);
  $('.fps-online-credits').hidden = !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[?::1\]?$)/.test(location.hostname);
  const controls = Object.fromEntries(CONTROL_KEYS.map(key => [key, $(`[data-control="${key}"]`)]));
  const arena = $('.fps-controls');
  const abort = new AbortController();
  const listen = (target, event, handler, options = {}) => target.addEventListener(event, handler, { ...options, signal: abort.signal });
  const held = new Map();
  let paused = false, editing = false, disposed = false, resultVisible = false, editBackup = null;
  let lookPointer = null, lookLast = null, stickPointer = null, drag = null, fireLook = null;
  let ads = false, crouching = false, lastInteract = '', lastMessage = '', noticeTimer = 0, hitTimer = 0, damageTimer = 0;
  let previousFocus = null;
  const orientation = () => innerWidth > innerHeight ? 'landscape' : 'portrait';
  const saveSettings = () => { try { storage?.setItem(FPS_CONTROL_STORAGE_KEY, JSON.stringify(settings)); } catch { /* Private browsing may disallow persistence. */ } };
  function emitSettings() { onSettings(normalizeControlSettings(settings)); }
  function layoutControls() {
    if (disposed) return;
    const bounds = arena.getBoundingClientRect();
    const mode = orientation();
    root.dataset.orientation = mode;
    const sizes = Object.fromEntries(CONTROL_KEYS.map(key => [key, controls[key].getBoundingClientRect()]));
    const defaults = Object.fromEntries(CONTROL_KEYS.map(key => [key, { x: DEFAULT_POSITIONS[mode][key][0], y: DEFAULT_POSITIONS[mode][key][1] }]));
    // Enlarge default buttons without making adjacent targets overlap. Custom
    // placements remain exactly where the player put them, bounded to the screen.
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    const rowGap = Math.max(width * (mode === 'portrait' ? .225 : .09), sizes.reload.width + 8);
    defaults.reload.x = mode === 'portrait' ? .88 : .90;
    defaults.crouch.x = defaults.reload.x - rowGap / width;
    defaults.swap.x = defaults.reload.x - rowGap * 2 / width;
    defaults.fire.x = mode === 'portrait' ? .88 : .90;
    defaults.ads.x = defaults.fire.x - ((sizes.fire.width + sizes.ads.width) / 2 + Math.max(12, width * .023)) / width;
    if (mode === 'portrait') {
      defaults.move.y = Math.min(.78, .92 - ((sizes.move.height + sizes.heal.height) / 2 + 10) / height);
      defaults.sprint.y = Math.min(.645, defaults.move.y - ((sizes.move.height + sizes.sprint.height) / 2 + 12) / height);
      defaults.swap.y = .91;
      defaults.heal.y = .92;
    } else {
      defaults.interact.x = defaults.ads.x - ((sizes.ads.width + sizes.interact.width) / 2 + Math.max(12, width * .035)) / width;
      defaults.heal.x = Math.max(.255, defaults.move.x + ((sizes.move.width + sizes.heal.width) / 2 + 12) / width);
    }
    for (const key of CONTROL_KEYS) {
      const node = controls[key];
      const desired = settings.positions[mode][key] || defaults[key];
      const pos = clampControlPosition(desired, bounds.width, bounds.height, sizes[key]);
      node.style.left = `${pos.x * 100}%`; node.style.top = `${pos.y * 100}%`;
    }
    $('.fps-editor-caption').textContent = `游戏已暂停 · 当前${mode === 'landscape' ? '横屏' : '竖屏'}布局`;
  }
  function applySettings(persist = true) {
    root.style.setProperty('--fps-scale', settings.scale);
    root.style.setProperty('--fps-opacity', settings.opacity);
    for (const input of root.querySelectorAll('[data-setting]')) {
      const key = input.dataset.setting;
      if (input.type === 'checkbox') input.checked = settings[key]; else input.value = settings[key];
    }
    for (const output of root.querySelectorAll('[data-output]')) {
      const key = output.dataset.output;
      output.textContent = key === 'sensitivity' ? `${settings[key].toFixed(2)}×` : `${Math.round(settings[key] * 100)}%`;
    }
    layoutControls(); if (persist) saveSettings(); emitSettings();
  }
  function releaseInputs() {
    for (const [key, value] of held) { if (value != null) onAction(key, { pressed: false }); controls[key]?.classList.remove('is-active'); }
    held.clear(); stickPointer = null; lookPointer = null; lookLast = null; fireLook = null;
    $('.fps-stick-knob').style.transform = ''; onMove({ x: 0, y: 0 });
  }
  function setPanel(name) {
    for (const panel of root.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
    $('.fps-dialog').setAttribute('aria-label', name === 'result' ? '行动结果' : name === 'settings' ? '操作设置' : name === 'credits' ? '素材署名' : '游戏菜单');
    $('.fps-dialog').scrollTop = 0;
    queueMicrotask(() => { if (!disposed && !$('.fps-modal').hidden) $(`[data-panel="${name}"] button`)?.focus({ preventScroll: true }); });
  }
  function setPaused(value, notifyGame = false) {
    paused = !!value;
    if (!paused && editing) finishEditor(true);
    root.dataset.paused = String(paused);
    if (paused) {
      releaseInputs(); previousFocus ||= document.activeElement;
      if (!editing) { $('.fps-modal').hidden = false; if (!resultVisible) setPanel('menu'); }
      $('.fps-squad-choices').hidden = true; $('.fps-squad-toggle').setAttribute('aria-expanded', 'false');
    } else {
      resultVisible = false; $('.fps-modal').hidden = true; $('.fps-dialog').removeAttribute('data-result');
      previousFocus?.focus?.({ preventScroll: true }); previousFocus = null;
    }
    if (notifyGame) onAction('pause', { paused });
  }
  function beginEditor() {
    setPaused(true, true); editing = true; editBackup = normalizeControlSettings(settings);
    root.dataset.editing = 'true'; $('.fps-modal').hidden = true;
    $('.fps-editor-bar').hidden = false; $('.fps-editor-grid').hidden = false;
    controls.interact.disabled = false; layoutControls();
  }
  function finishEditor(save) {
    if (!editing) return;
    if (!save && editBackup) settings = editBackup;
    editing = false; drag = null; root.dataset.editing = 'false';
    $('.fps-editor-bar').hidden = true; $('.fps-editor-grid').hidden = true;
    for (const control of Object.values(controls)) control.classList.remove('is-selected');
    applySettings(); controls.interact.disabled = !lastInteract;
    if (paused) { $('.fps-modal').hidden = false; setPanel('settings'); }
    editBackup = null;
  }
  function notify(text, duration = 2800) {
    clearTimeout(noticeTimer); $('.fps-notice').textContent = String(text); $('.fps-notice').classList.add('on');
    if (paused) $('.fps-order-status').textContent = String(text);
    noticeTimer = setTimeout(() => $('.fps-notice')?.classList.remove('on'), duration);
  }
  function beginHold(key, pointerId) {
    if (paused || editing || held.has(key)) return;
    held.set(key, pointerId); controls[key].classList.add('is-active'); onAction(key, { pressed: true });
  }
  function endHold(key, pointerId) {
    if (!held.has(key) || (pointerId != null && held.get(key) !== pointerId)) return;
    held.delete(key); controls[key].classList.remove('is-active'); onAction(key, { pressed: false });
    if (key === 'fire') fireLook = null;
  }
  for (const key of ['fire', 'sprint']) {
    const button = controls[key];
    listen(button, 'pointerdown', event => {
      if (paused || editing || event.button > 0) return;
      event.preventDefault(); button.setPointerCapture?.(event.pointerId); beginHold(key, event.pointerId);
      if (key === 'fire' && event.pointerType !== 'mouse') fireLook = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) listen(button, type, event => endHold(key, event.pointerId));
    listen(button, 'keydown', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); beginHold(key, 'keyboard'); } });
    listen(button, 'keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); endHold(key, 'keyboard'); } });
  }
  listen(controls.fire, 'pointermove', event => {
    if (!fireLook || fireLook.pointerId !== event.pointerId || paused || editing) return;
    event.preventDefault(); onLook?.({ dx: event.clientX - fireLook.x, dy: event.clientY - fireLook.y });
    fireLook.x = event.clientX; fireLook.y = event.clientY;
  });
  function moveStick(event) {
    const rect = controls.move.getBoundingClientRect(), radius = rect.width * .34;
    let dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy); if (length > radius) { dx *= radius / length; dy *= radius / length; }
    $('.fps-stick-knob').style.transform = `translate(${dx}px,${dy}px)`;
    onMove({ x: dx / radius, y: -dy / radius });
  }
  listen(controls.move, 'pointerdown', event => {
    if (paused || editing || stickPointer !== null || event.button > 0) return;
    event.preventDefault(); stickPointer = event.pointerId; controls.move.setPointerCapture?.(event.pointerId); moveStick(event);
  });
  listen(controls.move, 'pointermove', event => { if (event.pointerId === stickPointer) { event.preventDefault(); moveStick(event); } });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) listen(controls.move, type, event => {
    if (event.pointerId !== stickPointer) return; stickPointer = null; $('.fps-stick-knob').style.transform = ''; onMove({ x: 0, y: 0 });
  });
  const look = $('.fps-look');
  if (typeof onLook !== 'function') look.style.pointerEvents = 'none';
  listen(look, 'pointerdown', event => {
    if (paused || editing || lookPointer !== null || event.pointerType === 'mouse') return;
    event.preventDefault(); lookPointer = event.pointerId; lookLast = [event.clientX, event.clientY]; look.setPointerCapture?.(event.pointerId);
  });
  listen(look, 'pointermove', event => {
    if (event.pointerId !== lookPointer || !lookLast || paused) return;
    event.preventDefault(); onLook?.({ dx: event.clientX - lookLast[0], dy: event.clientY - lookLast[1] }); lookLast = [event.clientX, event.clientY];
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) listen(look, type, event => { if (event.pointerId === lookPointer) { lookPointer = null; lookLast = null; } });
  listen(root, 'contextmenu', event => event.preventDefault());
  // Capture editing gestures before a fire/joystick handler can observe them.
  listen(root, 'pointerdown', event => {
    if (!editing) return;
    const control = event.target.closest('[data-control]'); if (!control) return;
    event.preventDefault(); event.stopImmediatePropagation();
    for (const item of Object.values(controls)) item.classList.toggle('is-selected', item === control);
    const rect = control.getBoundingClientRect();
    drag = { pointerId: event.pointerId, control, key: control.dataset.control, offsetX: event.clientX - rect.left - rect.width / 2, offsetY: event.clientY - rect.top - rect.height / 2 };
    control.setPointerCapture?.(event.pointerId);
  }, { capture: true });
  listen(root, 'pointermove', event => {
    if (!editing || !drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const rect = arena.getBoundingClientRect();
    const position = clampControlPosition({ x: (event.clientX - rect.left - drag.offsetX) / rect.width, y: (event.clientY - rect.top - drag.offsetY) / rect.height }, rect.width, rect.height, drag.control.getBoundingClientRect());
    settings.positions[orientation()][drag.key] = position;
    drag.control.style.left = `${position.x * 100}%`; drag.control.style.top = `${position.y * 100}%`;
  }, { capture: true });
  for (const type of ['pointerup','pointercancel']) listen(root, type, event => {
    if (drag?.pointerId === event.pointerId) { event.preventDefault(); event.stopImmediatePropagation(); drag = null; }
  }, { capture: true });
  listen(root, 'click', event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action;
    if (editing && !action.startsWith('editor-')) return;
    if (action === 'pause') setPaused(true, true);
    else if (action === 'resume') setPaused(false, true);
    else if (action === 'settings') { setPaused(true, true); setPanel('settings'); }
    else if (action === 'credits') setPanel('credits');
    else if (action === 'menu') setPanel('menu');
    else if (action === 'editor') beginEditor();
    else if (action === 'editor-save') finishEditor(true);
    else if (action === 'editor-cancel') finishEditor(false);
    else if (action === 'reset-controls') { settings = normalizeControlSettings(); applySettings(); notify('已恢复默认操作设置'); }
    else if (action === 'restart') { resultVisible = false; setPaused(false, false); onAction('restart', {}); }
    else if (action === 'exit') { releaseInputs(); onAction('exit', {}); }
    else if (action === 'squad-menu' && !paused) { const menu = $('.fps-squad-choices'); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); }
    else if (action === 'order-panel') { setPaused(true, true); $('#fpsOrderInput').focus(); }
    else if (action === 'squad' && !paused) {
      const command = button.dataset.command; onAction('squad', { command });
      for (const b of root.querySelectorAll('[data-command]')) b.setAttribute('aria-pressed', String(b.dataset.command === command));
      $('.fps-squad-choices').hidden = true; $('.fps-squad-toggle').setAttribute('aria-expanded', 'false');
    } else if (action === 'ads' && !paused) { ads = !ads; root.dataset.ads = String(ads); button.setAttribute('aria-pressed', String(ads)); onAction('ads', { active: ads }); }
    else if (action === 'crouch' && !paused) { crouching = !crouching; button.setAttribute('aria-pressed', String(crouching)); onAction('crouch', { active: crouching }); }
    else if (['reload','swap','interact','heal'].includes(action) && !paused) onAction(action, {});
  });
  listen(root, 'input', event => {
    const input = event.target.closest('[data-setting]'); if (!input) return;
    settings[input.dataset.setting] = input.type === 'checkbox' ? input.checked : Number(input.value);
    settings = normalizeControlSettings(settings); applySettings();
  });
  listen($('.fps-order-form'), 'submit', event => {
    event.preventDefault(); const input = $('#fpsOrderInput'); const text = input.value.trim(); if (!text) return;
    onAction('order', { text }); $('.fps-order-status').textContent = `已下达：${text}`; input.value = '';
  });
  listen($('.fps-modal'), 'keydown', event => {
    if (event.key !== 'Tab') return;
    const focusables = [...$('.fps-dialog').querySelectorAll('button,input')].filter(node => node.getClientRects().length && !node.disabled);
    if (!focusables.length) return;
    const first = focusables[0], last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  listen(window, 'resize', () => { releaseInputs(); drag = null; layoutControls(); });
  listen(window, 'blur', releaseInputs);
  listen(document, 'visibilitychange', () => { if (document.hidden) { releaseInputs(); if (!paused && !resultVisible) setPaused(true, true); } });
  function update(snapshot = {}) {
    if (disposed) return;
    const setText = (selector, value) => { const node = $(selector); const text = String(value); if (node.textContent !== text) node.textContent = text; };
    if (snapshot.hp !== undefined) {
      const hp = Math.max(0, numeric(snapshot.hp, 100)); setText('.fps-health b', Math.ceil(hp));
      const ratio = clamp(hp / Math.max(1, numeric(snapshot.maxHp, 100)), 0, 1);
      $('.fps-health-track i').style.width = `${ratio * 100}%`; $('.fps-health').classList.toggle('low', ratio <= .3);
    }
    if (snapshot.ammo !== undefined) setText('.fps-ammo-numbers b', snapshot.ammo);
    if (snapshot.reserve !== undefined) setText('.fps-ammo-numbers span', ` / ${snapshot.reserve}`);
    if (snapshot.weapon !== undefined) setText('.fps-weapon', snapshot.reloading ? '装填中…' : snapshot.weapon);
    $('.fps-ammo').classList.toggle('reloading', !!snapshot.reloading);
    if (snapshot.objective !== undefined) setText('.fps-objective', snapshot.objective);
    if (snapshot.detail !== undefined) setText('.fps-objective-detail', snapshot.detail);
    if (snapshot.bearing !== undefined || snapshot.distance !== undefined || snapshot.floorLabel !== undefined) {
      const direction = [snapshot.bearing, snapshot.distance != null ? `${Math.round(snapshot.distance)} m` : '', snapshot.floorLabel].filter(Boolean).join(' · ');
      setText('.fps-bearing', direction);
    }
    if (snapshot.heading !== undefined) {
      const degrees = ((numeric(snapshot.heading, 0) % 360) + 360) % 360;
      const direction = ['北','东北','东','东南','南','西南','西','西北'][Math.round(degrees / 45) % 8];
      setText('.fps-compass b', `${direction} ${String(Math.round(degrees) % 360).padStart(3,'0')}°`);
    }
    if (snapshot.progress !== undefined) {
      const stage = typeof snapshot.progress === 'object' ? numeric(snapshot.progress.current, 0) : numeric(snapshot.progress, 0);
      setText('.fps-mission-step', String(Math.min(3, Math.floor(stage) + 1)).padStart(2, '0'));
      [...root.querySelectorAll('.fps-route i')].forEach((node,index) => { node.classList.toggle('complete', index < stage); node.classList.toggle('current', index === Math.floor(stage)); });
    }
    if (snapshot.teammate !== undefined) {
      const mate = snapshot.teammate || {};
      setText('.fps-teammate', typeof mate === 'string' ? mate : `${mate.name || '回声'} · ${mate.status || ({ follow:'跟随',hold:'守位',cover:'掩护' }[mate.command]) || '待命'}`);
      setText('.fps-teammate-health', typeof mate === 'object' && mate.hp !== undefined ? Math.ceil(mate.hp) : '');
      if (mate.command) for (const button of root.querySelectorAll('[data-command]')) button.setAttribute('aria-pressed', String(button.dataset.command === mate.command));
    }
    if (snapshot.interactLabel !== undefined) {
      lastInteract = snapshot.interactLabel || ''; controls.interact.disabled = !editing && !lastInteract;
      $('.fps-interact-prompt').hidden = !lastInteract; setText('.fps-interact-prompt', lastInteract);
    }
    if (snapshot.extracting !== undefined) {
      const value = typeof snapshot.extracting === 'object' ? snapshot.extracting.progress : snapshot.extracting;
      $('.fps-extract-progress').hidden = value === null || value === false || value < 0;
      $('.fps-extract-progress i').style.width = `${clamp(numeric(value, 0), 0, 1) * 100}%`;
    }
    if (snapshot.ads !== undefined) { ads = !!snapshot.ads; root.dataset.ads = String(ads); controls.ads.setAttribute('aria-pressed', String(ads)); }
    if (snapshot.medkits !== undefined) { setText('.fps-heal .fps-control-label', snapshot.healing ? '急救中' : `急救 ${snapshot.medkits}`); controls.heal.disabled = !editing && (snapshot.medkits <= 0 || snapshot.healing); }
    if (snapshot.crouching !== undefined) { crouching = !!snapshot.crouching; controls.crouch.setAttribute('aria-pressed', String(crouching)); }
    if (snapshot.message && snapshot.message !== lastMessage) { lastMessage = snapshot.message; notify(snapshot.message); }
    if (snapshot.hit) { clearTimeout(hitTimer); $('.fps-hit-marker').classList.add('on'); hitTimer = setTimeout(() => $('.fps-hit-marker')?.classList.remove('on'), 140); }
    if (snapshot.damaged) { clearTimeout(damageTimer); $('.fps-damage').classList.add('on'); damageTimer = setTimeout(() => $('.fps-damage')?.classList.remove('on'), 330); }
  }
  function showResult(result = {}) {
    resultVisible = true; if (editing) finishEditor(true); setPaused(true, true); setPanel('result');
    $('.fps-dialog').dataset.result = result.success ? 'success' : 'failure';
    $('.fps-result-eyebrow').textContent = result.success ? 'EXTRACTION / COMPLETE' : 'OPERATION / ENDED';
    $('.fps-result-title').textContent = result.title || (result.success ? '撤离成功' : '行动结束');
    $('.fps-result-subtitle').textContent = result.subtitle || (result.success ? '情报已带回，云澜汇行动完成。' : '调整路线，与队友重新出发。');
    const seconds = Math.max(0, Math.round(numeric(result.time, 0)));
    const accuracy = clamp(Math.round(numeric(result.accuracy, 0)), 0, 100);
    const intel = typeof result.intel === 'boolean' ? (result.intel ? 2 : 0) : clamp(Math.floor(numeric(result.intel, result.success ? 2 : 0)), 0, 2);
    const values = [
      ['行动用时', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`],
      ['击倒目标', result.kills ?? 0], ['命中率', `${accuracy}%`],
      ['发射弹药', result.shots ?? 0], ['获取情报', `${intel}/2`],
      ['队友状态', typeof result.teammate === 'string' ? result.teammate : result.teammate === false ? '倒地' : '存活'],
    ];
    $('.fps-result-stats').replaceChildren(...values.map(([label,value]) => {
      const item = document.createElement('div'); item.className = 'fps-result-stat';
      const number = document.createElement('b'); number.textContent = String(value);
      const caption = document.createElement('span'); caption.textContent = label; item.append(number,caption); return item;
    }));
  }
  applySettings(false); controls.interact.disabled = true;
  function clearResult() {
    resultVisible = false; setPaused(false, false); ads = false; crouching = false; lastMessage = '';
    root.dataset.ads = 'false'; controls.ads.setAttribute('aria-pressed', 'false'); controls.crouch.setAttribute('aria-pressed', 'false');
    $('.fps-hit-marker').classList.remove('on'); $('.fps-damage').classList.remove('on'); $('.fps-notice').classList.remove('on');
    $('.fps-extract-progress').hidden = true; lastInteract = ''; controls.interact.disabled = true;
  }
  return {
    root, marker: $('.fps-world-marker'), map: $('.fps-map'), update, setPaused, showResult, clearResult, reset: clearResult, notify,
    get settings() { return normalizeControlSettings(settings); },
    get paused() { return paused; }, get editing() { return editing; },
    showSettings() { setPaused(true, true); setPanel('settings'); },
    editControls: beginEditor,
    dispose() {
      if (disposed) return; disposed = true; releaseInputs(); abort.abort();
      clearTimeout(noticeTimer); clearTimeout(hitTimer); clearTimeout(damageTimer); root.remove(); style.remove();
    },
  };
}
