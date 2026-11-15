import { buildPlayableLayout } from './layout/playable.js';
import { createApp } from './render/app.js';

export async function startRuntime(mode,onProgress=()=>{}) {
  if(!['tour','fps','arcade','jimao'].includes(mode))throw new Error('未知模式');
  document.body.dataset.mode=mode;
  document.getElementById('fatal').hidden=true;
  // 零点突围用园区探索那张地图（一期新商场、酒店、公寓、地铁；二期三期是体块），和小游戏合集同一个范围；
  // 画面走园区那套，但不放人群、车流、动线和标注（createApp 的 game: 'jimao'）
  const layout=buildPlayableLayout({mode:mode==='jimao'?'arcade':mode});
  if(mode==='jimao')layout.game='jimao';
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
  onProgress('准备就绪',1);return app;
}
