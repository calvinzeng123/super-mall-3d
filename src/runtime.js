import { buildPlayableLayout } from './layout/playable.js';
import { createApp } from './render/app.js';

export async function startRuntime(mode,onProgress=()=>{},options={}) {
  if(!['tour','fps'].includes(mode))throw new Error('未知模式');
  document.body.dataset.mode=mode;
  document.getElementById('fatal').hidden=true;
  const layout=buildPlayableLayout({mode});
  const app=await createApp(layout,document.getElementById('stage'),{
    onProgress:(label,p)=>onProgress(label,p*.76),
  });
  window.__mall=app;
  if(mode==='fps'){
    const {createFPSGame}=await import('./fps/game.js');
    window.__fps=await createFPSGame(app,{onProgress:(label,p)=>onProgress(label,.76+p*.24),difficulty:options.difficulty});
  }else{
    const [{createUI},{attachExplore},{attachTour}]=await Promise.all([
      import('./render/ui.js'),import('./render/explore.js'),import('./render/tour.js'),
    ]);
    const ui=createUI(app,layout);attachExplore(app,ui);attachTour(app,ui);
    const back=document.createElement('button');back.id='modeBack';back.textContent='返回封面';
    back.className='mode-back';back.onclick=()=>location.reload();document.body.append(back);
  }
  document.getElementById('loading').hidden=true;
  onProgress('准备就绪',1);return app;
}
