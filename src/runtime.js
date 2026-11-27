import { buildPlayableLayout, markSiegeRoofs } from './layout/playable.js';
import { createApp } from './render/app.js';
import { configureMemory, markBootStart, markBootDone, BOOT } from './render/device.js';
import { QUALITY_STORAGE_KEY } from './render/quality.js';

/** 这个模式上次存的画质档位：漫游 / 小游戏读我们自己的设置，零点突围读原游戏的设置（低 / 中 / 高 / 极致）。没存过是 'auto' */
export function savedTier(mode,storage=globalThis.localStorage){
  try{
    if(mode==='jimao'){
      const q=JSON.parse(storage?.getItem('saltline.settings.v1')||'{}').quality;
      return {low:'low',medium:'balanced',high:'high',ultra:'ultra'}[q]||'auto';
    }
    const p=JSON.parse(storage?.getItem(QUALITY_STORAGE_KEY)||'null')?.preset;
    return ['low','balanced','high','ultra'].includes(p)?p:'auto';
  }catch{return 'auto';}
}

export async function startRuntime(mode,onProgress=()=>{}) {
  if(!['tour','fps','arcade','jimao'].includes(mode))throw new Error('未知模式');
  document.body.dataset.mode=mode;
  document.getElementById('fatal').hidden=true;
  // 零点突围用园区探索那张地图（一期新商场、酒店、公寓、地铁；二期三期是体块），和小游戏合集同一个范围；
  // 画面走园区那套，但不放人群、车流、动线和标注（createApp 的 game: 'jimao'）
  // 内存档位跟着这个模式存下来的画质走（贴图多大、装饰几何做不做）：要在建场景、加载贴图之前定下来
  // 上次进来时整页被系统关掉了（iOS 内存超限）：这次内存档位降一档，进去以后说一声（见 device.js 的 markBootStart）
  const boot=markBootStart(mode);
  const tier=savedTier(mode);
  window.__memory={profile:configureMemory(tier),tier,boot};
  const layout=buildPlayableLayout({mode:mode==='jimao'?'arcade':mode});
  if(mode==='jimao')markSiegeRoofs(layout); // layout.game='jimao'，撤离那两栋楼的屋面不放机房（见 markSiegeRoofs）
  const app=await createApp(layout,document.getElementById('stage'),{
    onProgress:(label,p)=>onProgress(label,p*.76),game:layout.game,
  });
  window.__mall=app;
  if(mode==='jimao'){
    const {createJimaoGame}=await import('./jimao/run.js');
    window.__jimao=await createJimaoGame(app,{onProgress:(label,p)=>onProgress(label,.76+p*.24)});
  }else if(mode==='fps'){
    const {createFPSGame}=await import('./fps/game.js');
    window.__fps=await createFPSGame(app,{onProgress:(label,p)=>onProgress(label,.76+p*.24)});
  }else{
    const [{createUI},{attachExplore},{attachTour}]=await Promise.all([
      import('./render/ui.js'),import('./render/explore.js'),import('./render/tour.js'),
    ]);
    const ui=createUI(app,layout);attachExplore(app,ui);
    // 小游戏版没有二期、三期，不挂全园导览；挂小游戏外壳
    if(mode==='arcade'){const {attachArcade}=await import('./arcade/shell.js');window.__arcade=attachArcade(app,ui);}
    else attachTour(app,ui);
    const back=document.createElement('button');back.id='modeBack';back.textContent='返回封面';
    back.className='mode-back';back.onclick=()=>location.reload();document.body.append(back);
  }
  document.getElementById('loading').hidden=true;
  settleBoot(mode,boot,window.__memory.profile);
  onProgress('准备就绪',1);return app;
}

/**
 * 进去以后「站稳了」才擦掉「正在进入」：零点突围要真开局玩上 BOOT.settle 秒（开局一刷丧尸、队友，内存还要涨一截），别的模式载完 BOOT.settle 秒；
 * 正常离开、切到后台也擦掉（后台被系统收掉不算没进成）。上次没进成的话，屏幕下方说一声这次用的是哪一档、怎么调回去。
 */
export function settleBoot(mode,boot,profile,{win=globalThis.window,doc=globalThis.document}={}){
  if(!win)return;
  const done=()=>{markBootDone();clearInterval(timer);};
  let played=0;const timer=setInterval(()=>{
    const playing=mode!=='jimao'||win.__G?.game?.state==='playing';
    if(playing&&(played+=2)>=BOOT.settle)done();
  },2000);
  win.addEventListener?.('pagehide',done);
  doc?.addEventListener?.('visibilitychange',()=>{if(doc.visibilityState==='hidden')done();});
  if(boot?.crashed&&doc?.body){
    const el=doc.createElement('div');el.className='boot-notice';
    el.style.cssText='position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:80;max-width:min(92vw,560px);padding:9px 14px;border-radius:12px;background:rgba(18,24,30,.92);color:#eef2f4;font:13px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none';
    el.textContent=`上次进来时页面被系统关掉了（多半是内存不够）。这次贴图先用「${profile==='compact'?'省内存':profile==='standard'?'标准':'高清贴图'}」一档进入；进去以后可以在设置里调画质，换贴图档要重新载入。`;
    doc.body.append(el);setTimeout(()=>el.remove(),9000);
  }
}
