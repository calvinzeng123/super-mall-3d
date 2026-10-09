// Drives the Playwright CLI; no separate test runner or browser dependency.
// Usage: node scripts/residential/qa-viewer.mjs --url http://127.0.0.1:8769/... --html /path/viewer.html --model /path/model.glb --output /path/viewer-qa.json
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const options = {};
for (let i=2;i<process.argv.length;i+=2) options[process.argv[i].replace(/^--/,'')] = process.argv[i+1];
for (const key of ['url','html','model','output']) if (!options[key]) throw new Error(`Missing --${key}`);
const wrapper = path.join(os.homedir(),'.codex/skills/playwright/scripts/playwright_cli.sh');
const session = options.session || 'residential-variants';
const evidence = path.resolve(options.evidence || path.join('output/playwright', path.basename(path.dirname(options.output))));
await fs.mkdir(evidence,{recursive:true});
const cli = async (...args) => {
  const {stdout,stderr} = await exec(wrapper,['--session',session,...args], {maxBuffer:20*1024*1024,timeout:180000});
  if (/### Error/.test(stdout)) throw new Error(stdout+stderr);
  return stdout;
};
await cli('open','about:blank');
const results = [];
for (const [kind,width,height] of [['desktop',1440,900],['mobile',390,844]]) {
  await cli('resize',String(width),String(height));
  await cli('run-code', 'async (page) => { await page.context().setOffline(false); }');
  await cli('goto',options.url);
  await cli('snapshot');
  const code = `async (page) => {
    const html=await page.evaluate(async()=>await(await fetch(location.href,{cache:'no-store'})).text());
    await page.goto('about:blank');
    await page.context().setOffline(true);
    const errors=[],requests=[],consoleErrors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
    page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url())});
    await page.setContent(html,{waitUntil:'load',timeout:120000});
    await page.waitForFunction(()=>window.__residentialViewer?.state.ready,{},{timeout:120000});
    const views=await page.locator('[data-view]').evaluateAll(buttons=>buttons.map(button=>button.dataset.view));
    const records=[],screenshots=[];
    for(const id of views){
      const button=page.locator('[data-view="'+id+'"]');
      await button.scrollIntoViewIfNeeded();await button.click();
      await page.waitForFunction(id=>window.__residentialViewer.state.view===id,id);
      await page.waitForTimeout(220);
      const record=await page.evaluate(()=>{
        const v=window.__residentialViewer,b=document.querySelector('[data-view="'+v.state.view+'"]'),r=b.getBoundingClientRect();
        return {view:v.state.view,roof:v.state.roof,position:v.camera.position.toArray(),pressed:b.getAttribute('aria-pressed'),activeButtonVisible:r.left>=0&&r.right<=innerWidth+1,overflow:document.documentElement.scrollWidth>innerWidth,webglError:v.renderer.getContext().getError()};
      });
      records.push(record);
      if(${JSON.stringify(kind)}==='desktop'||['overview','living','balcony'].includes(id)){
        const file=${JSON.stringify(evidence)}+'/'+${JSON.stringify(kind)}+'-'+id+'.png';
        await page.screenshot({path:file,timeout:30000});screenshots.push(file);
      }
    }
    await page.locator('[data-view="living"]').click();
    await page.locator('#roof-button').click();
    const hidden=await page.evaluate(()=>!window.__residentialViewer.state.roof);
    await page.locator('#roof-button').click();
    const shown=await page.evaluate(()=>window.__residentialViewer.state.roof);
    await page.locator('#night-button').click();
    const night=await page.evaluate(()=>({enabled:window.__residentialViewer.state.night,exposure:window.__residentialViewer.renderer.toneMappingExposure}));
    const nightFile=${JSON.stringify(evidence)}+'/'+${JSON.stringify(kind)}+'-night.png';
    await page.screenshot({path:nightFile,timeout:30000});screenshots.push(nightFile);
    await page.locator('#night-button').click();
    await page.locator('#walk-button').click();
    const before=await page.evaluate(()=>({position:window.__residentialViewer.camera.position.toArray(),quaternion:window.__residentialViewer.camera.quaternion.toArray()}));
    if(${JSON.stringify(kind)}==='desktop'){
      await page.keyboard.down('w');await page.keyboard.down('e');await page.waitForTimeout(450);await page.keyboard.up('w');await page.keyboard.up('e');
    }else{
      const pad=page.locator('[data-key="KeyW"]');const box=await pad.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(450);await page.mouse.up();
      await page.mouse.move(170,350);await page.mouse.down();await page.mouse.move(220,370,{steps:5});await page.mouse.up();
    }
    const after=await page.evaluate(()=>({position:window.__residentialViewer.camera.position.toArray(),quaternion:window.__residentialViewer.camera.quaternion.toArray(),padVisible:!document.getElementById('walk-pad').hidden}));
    await page.keyboard.press('Escape');
    const final=await page.evaluate(()=>{
      const v=window.__residentialViewer,images=[];v.model.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])for(const t of Object.values(m))if(t?.isTexture&&t.image)images.push(Math.max(t.image.width||0,t.image.height||0));});
      return {state:{...v.state},stats:v.stats,build:v.build,webglError:v.renderer.getContext().getError(),overflow:document.documentElement.scrollWidth>innerWidth,maxTextureDimension:Math.max(...images),title:document.title};
    });
    const distance=Math.hypot(...after.position.map((value,i)=>value-before.position[i]));
    return {kind:${JSON.stringify(kind)},viewport:{width:${width},height:${height}},offlineFreshLoad:true,views:records,roof:{hidden,shown},night,movement:{before,after,distance},final,errors,consoleErrors,requests,screenshots};
  }`;
  const raw = await cli('run-code',code);
  const resultText = raw.split('### Result\n')[1]?.split('\n### Ran Playwright code')[0]?.trim();
  if (!resultText) throw new Error(`Playwright CLI did not return a result: ${raw.slice(0,1000)}`);
  results.push(JSON.parse(resultText));
}
await cli('close');
const [model,html] = await Promise.all([fs.readFile(options.model),fs.readFile(options.html)]);
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const modelSHA256=hash(model);
const evidenceFiles=await Promise.all([...new Set(results.flatMap(result=>result.screenshots))].map(async file=>{const bytes=await fs.readFile(file);return {path:file,bytes:bytes.length,sha256:hash(bytes)};}));
const checks={
  freshOfflineInitialization:results.every(r=>r.offlineFreshLoad),
  expectedModel:results.every(r=>r.final.build.modelSHA256===modelSHA256),
  allRoomViews:results.every(r=>r.views.every(v=>v.pressed==='true'&&v.activeButtonVisible&&!v.overflow&&v.webglError===0)),
  roofToggle:results.every(r=>r.roof.hidden&&r.roof.shown),
  dayNight:results.every(r=>r.night.enabled&&!r.final.state.night),
  movement:results.every(r=>r.movement.distance>.05&&!r.final.state.walking),
  mobileDragLook:results.filter(r=>r.kind==='mobile').every(r=>JSON.stringify(r.movement.before.quaternion)!==JSON.stringify(r.movement.after.quaternion)),
  noExternalRequests:results.every(r=>r.requests.length===0),
  noRuntimeErrors:results.every(r=>r.errors.length===0&&r.consoleErrors.length===0),
  webGL:results.every(r=>r.final.webglError===0),
  responsiveLayout:results.every(r=>!r.final.overflow),
  mobileTextureCap:results.filter(r=>r.kind==='mobile').every(r=>r.final.maxTextureDimension<=512),
};
const report={schemaVersion:3,checkedAt:new Date().toISOString(),status:Object.values(checks).every(Boolean)?'passed':'failed',modelFile:path.basename(options.model),modelBytes:model.length,modelSHA256,viewerFile:path.basename(options.html),viewerBytes:html.length,viewerSHA256:hash(html),method:'Playwright CLI Chromium: read the exact generated HTML response, navigate to about:blank, disable browser networking, freshly initialize embedded HTML and exercise visible controls.',scopeNotes:['Desktop Chromium 1440x900; mobile Chromium 390x844 viewport simulation.','Not a physical-device test.','Free roam intentionally permits passing through walls; viewer navigation is not a collision or construction-code audit.'],checks,results,evidence:evidenceFiles};
await fs.writeFile(options.output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:options.output,status:report.status,checks},null,2));
if(report.status!=='passed')process.exitCode=1;
