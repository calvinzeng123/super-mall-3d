import * as THREE from 'three';
import { buildNav, step, NAV, linksNear } from '../layout/nav.js';
import { pointInPoly, distToPolyEdge } from '../layout/geom.js';
import { createMissionLayout } from './mission-layout.js';
import { findPath, hasLineOfSight, advanceGuide } from './pathfinding.js';
import { recordTrail, advanceTrail } from './follower.js';
import { createRun, WEAPONS, tickRun, fireWeapon, reloadWeapon, switchWeapon,
  damagePlayer, healPlayer, interactObjective, updateExtraction, parseSquadOrder } from './rules.js';
import { createFPSHUD } from './hud.js';
import { createViewmodel } from './viewmodel.js';
import { createCombatWorld } from './world.js';
import { createGameAudio } from './audio.js';

const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const eye=a=>new THREE.Vector3(a.x,a.y+(a.eye??1.45),a.z);
const waitFrame=()=>new Promise(r=>setTimeout(r,20));
const copy=p=>({...p,slope:p.slope?{...p.slope}:null});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export async function createFPSGame(app,{onProgress=()=>{}}={}) {
 const {camera,renderer,ctx}=app,canvas=renderer.domElement,mission=createMissionLayout();
 const nav=buildNav(ctx.layout),run=createRun();
 let player=copy(mission.spawn),yaw=player.yaw,pitch=0,eyeY=player.y+NAV.eye;
 let input={x:0,y:0,fire:false,ads:false,sprint:false,crouch:false,interact:false};
 let settings={sensitivity:1,sound:true,invertY:false},wasResult=false,moved=false,stepClock=0,hudClock=0,noise=null,hitTime=0,visibilityKey='';
 const keys=new Set(),audio=createGameAudio(),abort=new AbortController(),eventOptions={signal:abort.signal};
 onProgress('规划酒店与公寓之间的真实行动路线',.02);await waitFrame();
 const routeStarts=[mission.spawn,...mission.objectives.slice(0,2)];
 const routes=[];
 for(let i=0;i<mission.objectives.length;i++){
   const route=findPath(nav,routeStarts[i],mission.objectives[i]);
   if(!route)throw new Error(`行动路线不可达：${mission.objectives[i].title}`);
   routes.push(route);onProgress('连通楼梯与地下撤离路线',.04+i*.035);await waitFrame();
 }
 const ally={...copy(mission.teammate),health:100,yaw:0,alert:0,cooldown:0,moving:false,route:[],routeAt:1};
 const enemies=mission.enemies.map((e,i)=>({...copy(e),health:e.health,maxHealth:e.health,yaw:i%2?Math.PI:1.7,
   alert:0,seen:0,cooldown:.8+i*.17,think:0,patrolAt:0,routeAt:1,moving:false,
   patrolRoutes:[findPath(nav,e,e.patrol[1]),findPath(nav,e.patrol[1],e.patrol[0])]}));
 let trail=[copy(player)],trailAt=0,routeProgress=0,waypoint=routes[0][1],lastRepath=0;
 onProgress('载入第一人称手臂、枪械与换弹动作',.18);
 const viewmodel=await createViewmodel({camera,scene:app.scene,renderer,onProgress:progress=>{
   const p=typeof progress==='object'?progress:{};onProgress(`载入${p.label||'真实枪械模型'}`,.18+.43*(p.loaded/Math.max(1,p.total)||0));
 }});
 onProgress('部署队友与巡逻小队',.67);
 const world=await createCombatWorld(app,mission,viewmodel,nav);
 const hud=createFPSHUD({onAction:act,onMove:p=>{input.x=p.x;input.y=p.y;},onLook:look,
   onSettings:s=>{settings={...settings,...s};audio.setMuted(s.sound===false||s.muted===true);}});
 settings={...settings,...hud.settings};
 app.cancelFlight();app.controls.enabled=false;app.state.labels=false;app.state.flows=false;
 app.state.explore={building:'P1',level:player.floor,near:null,metro:false,under:false};
 camera.rotation.order='YXZ';document.body.classList.add('fps-playing');
 const marker=hud.marker||document.createElement('div');
 if(!hud.marker){marker.className='fps-world-marker';marker.style.cssText='position:fixed;left:50%;top:40%;z-index:15;pointer-events:none;color:#ffdfa3;font:600 12px -apple-system;';document.body.append(marker);}
 const ray=new THREE.Ray(),direction=new THREE.Vector3(),hitVector=new THREE.Vector3();
 let drag=null;
 const typing=e=>/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||'');
 window.addEventListener('keydown',e=>{
   if(typing(e))return;const k=e.key.toLowerCase();
   if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
   if(k==='escape'){if(run.status==='playing')pause(!run.paused);return;}
   if(run.paused)return;keys.add(k);audio.unlock();if(e.repeat)return;
   if(k==='r')act('reload');if(k==='q'||k==='1'||k==='2')act('swap');if(k==='e')act('interact');if(k==='h')act('heal');
   if(k==='c')act('crouch',{active:!input.crouch});if(k==='v')act('squad',{command:'follow'});
   if(k==='b')act('squad',{command:'hold'});if(k==='n')act('squad',{command:'cover'});
 },eventOptions);
 window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()),eventOptions);
 canvas.addEventListener('contextmenu',e=>e.preventDefault(),eventOptions);
 canvas.addEventListener('pointerdown',e=>{
   if(e.pointerType!=='mouse'||run.paused)return;audio.unlock();
   if(e.button===2){input.ads=!input.ads;return;}
   input.fire=true;drag={x:e.clientX,y:e.clientY,id:e.pointerId};
   if(document.pointerLockElement!==canvas){try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}}
 },eventOptions);
 window.addEventListener('pointermove',e=>{
   if(e.pointerType!=='mouse'||run.paused)return;
   if(document.pointerLockElement===canvas)look({dx:e.movementX,dy:e.movementY,mouse:true});
   else if(drag?.id===e.pointerId){look({dx:e.clientX-drag.x,dy:e.clientY-drag.y,mouse:true});drag={x:e.clientX,y:e.clientY,id:e.pointerId};}
 },eventOptions);
 window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'){input.fire=false;drag=null;}},eventOptions);
 window.addEventListener('blur',()=>{if(run.status==='playing')pause(true);},eventOptions);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&run.status==='playing')pause(true);},eventOptions);
 document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement){input.fire=false;keys.clear();}},eventOptions);
 const dynamic={name:'fps-session',update};ctx.dynamic.push(dynamic);const draw=()=>viewmodel.render();ctx.afterRender.push(draw);
 syncVisibility(true);syncCamera(1);onProgress('行动准备完成',1);
 hud.notify?.('左侧移动，右侧看向；点击瞄准，按住开火。回声跟随你行动。');
 updateHUD();

 function release(){input.x=input.y=0;input.fire=input.sprint=input.interact=false;keys.clear();drag=null;}
 function pause(value){
   if(run.status!=='playing')return;run.paused=!!value;release();hud.setPaused(run.paused);
   if(value&&document.pointerLockElement)document.exitPointerLock?.();
 }
 function look({dx=0,dy=0,mouse=false}){
   if(run.paused||run.status!=='playing')return;
   const sensitivity=Number(settings.sensitivity)||1,scale=(mouse?.0022:.004)*sensitivity*(input.ads?.58:1);
   yaw-=dx*scale;pitch=clamp(pitch-dy*scale*(settings.invertY?-1:1),-1.35,1.35);
 }
 async function order(text){
   const local=parseSquadOrder(text);if(local){act('squad',{command:local});return;}
   hud.notify?.('正在解析队友指令…');
   try{
     const response=await fetch('/.netlify/functions/squad-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:String(text).slice(0,160)}),signal:AbortSignal.timeout(7000)});
     const result=await response.json();
     if(!response.ok||!['follow','hold','cover'].includes(result.command))throw new Error('unavailable');
     act('squad',{command:result.command});
   }catch{hud.notify?.('当前使用本地队友：可以说“跟我走”“守住这里”或“掩护我”。');}
 }
 function act(action,payload={}){
   audio.unlock();
   if(action==='exit'){location.href=location.pathname;return;}
   if(action==='restart'){reset();return;}
   if(action==='pause'){pause(payload.paused??!run.paused);return;}
   if(action==='order'){order(payload.text||'');return;}
   // Squad orders remain available while the orders/settings sheet is open.
   if(action==='squad'&&['follow','hold','cover'].includes(payload.command)&&run.status==='playing'){
     run.command=payload.command;audio.radio();
     run.message={follow:'回声：收到，跟随你的路线。',hold:'回声：我守住这里，你继续。',cover:'回声：保持距离，掩护你前进。'}[run.command];
     hud.notify?.(run.message);updateHUD();return;
   }
   if(run.paused||run.status!=='playing')return;
   if(action==='fire')input.fire=payload.pressed??true;
   else if(action==='ads')input.ads=payload.active??!input.ads;
   else if(action==='sprint')input.sprint=payload.pressed??!input.sprint;
   else if(action==='crouch')input.crouch=payload.active??!input.crouch;
   else if(action==='reload'){if(reloadWeapon(run)){input.fire=false;audio.reload();}}
   else if(action==='swap'){if(switchWeapon(run)){input.fire=false;audio.reload();}}
   else if(action==='heal'){if(healPlayer(run)){input.fire=false;hud.notify?.('正在使用急救包');}}
   else if(action==='interact'){
     const target=mission.objectives[run.stage];
     if(target&&run.stage<2&&player.floor===target.floor&&dist(player,target)<=target.radius){input.interact=true;}
     else if(ally.health<=0&&player.floor===ally.floor&&dist(player,ally)<2.5){ally.health=run.teammateHP=60;hud.notify?.('回声已恢复行动');}
     else hud.notify?.('靠近金色任务标记后交互；沿蓝色引导点前进。');
   }
   updateHUD();
 }
 function syncVisibility(force=false){
   const F=nav.floors.get(player.floor),level=F?.parentFloor||F?.level?.id||null;
   const building=F?.building||null;let near=null;
   if(!building){let best=24;for(const b of ctx.layout.buildings){const d=distToPolyEdge([player.x,player.z],b.outline);if(d<best){best=d;near=b.id;}}}
   const key=`${building}/${level}/${near}/${player.y<-.5}`;
   if(force||key!==visibilityKey){visibilityKey=key;app.state.explore={building,level,near,metro:false,under:player.y<-.5};app.refresh();}
 }
 function syncCamera(dt){
   const desired=player.y+(input.crouch?1.08:NAV.eye);eyeY+=(desired-eyeY)*Math.min(1,dt*18);
   camera.position.set(player.x,eyeY,player.z);camera.rotation.set(pitch,yaw,0,'YXZ');
   const targetFov=input.ads?(camera.aspect<1?65:47):(camera.aspect<1?86:68);
   if(Math.abs(camera.fov-targetFov)>.03){camera.fov+=(targetFov-camera.fov)*Math.min(1,dt*15);camera.updateProjectionMatrix();}
   camera.updateMatrixWorld();
 }
 function moveActor(a,target,speed,dt){
   const d=dist(a,target);a.moving=false;if(d<.1)return true;
   const amount=Math.min(d,speed*dt),dx=(target.x-a.x)/d*amount,dz=(target.z-a.z)/d*amount;
   let s=a;const n=Math.max(1,Math.ceil(amount/.15));for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n,dt/n);
   a.moving=dist(a,s)>.005;a.yaw=Math.atan2(dx,dz);Object.assign(a,{x:s.x,z:s.z,y:s.y,floor:s.floor,slope:s.slope});
   return dist(a,target)<.18&&a.floor===target.floor;
 }
 function movePlayer(dt){
   let x=input.x+(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
   let forward=input.y+(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0);
   const len=Math.max(1,Math.hypot(x,forward));x/=len;forward/=len;
   const sprint=(input.sprint||keys.has('shift'))&&!input.ads&&!input.crouch;
   const speed=run.healTime?1.5:input.crouch?2:input.ads?2.5:sprint?6.2:3.8;
   const dx=(Math.cos(yaw)*x-Math.sin(yaw)*forward)*speed*dt,dz=(-Math.sin(yaw)*x-Math.cos(yaw)*forward)*speed*dt;
   const before=player,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));
   for(let i=0;i<n;i++){player=step(nav,player,dx/n,dz/n,dt/n);recordTrail(trail,player);}
   moved=dist(before,player)>.002;
   if(moved){stepClock+=dt;if(stepClock>.38){audio.step();stepClock=0;}}
   if(trailAt>300){trail.splice(0,trailAt-1);trailAt=1;}
 }
 function takeShot(){
   if(!fireWeapon(run)){if(!run.magazines[run.weapon]&&!run.reload)act('reload');return;}
   const w=WEAPONS[run.weapon];viewmodel.fire();audio.shot(run.weapon===1);noise={...copy(player),until:run.elapsed+2.5};
   camera.getWorldDirection(direction);const spread=w.spread*(input.ads?.2:1)*(moved?1.4:1);
   direction.x+=(Math.random()-.5)*spread;direction.y+=(Math.random()-.5)*spread;direction.z+=(Math.random()-.5)*spread;direction.normalize();
   ray.set(camera.position,direction);let victim=null,best=w.range,head=false;
   for(const enemy of enemies){
     if(enemy.health<=0||!hasLineOfSight(nav,{...player,eye:camera.position.y-player.y},enemy))continue;
     const torso=new THREE.Box3(new THREE.Vector3(enemy.x-.37,enemy.y+.3,enemy.z-.37),new THREE.Vector3(enemy.x+.37,enemy.y+1.55,enemy.z+.37));
     const skull=new THREE.Sphere(new THREE.Vector3(enemy.x,enemy.y+1.65,enemy.z),.23);
     let p=ray.intersectSphere(skull,hitVector),isHead=!!p;
     if(!p)p=ray.intersectBox(torso,hitVector);
     // A small ADS assist is bounded by visibility and the same target body.
     if(!p&&input.ads){const to=eye(enemy).sub(camera.position),along=to.dot(direction),off=to.clone().addScaledVector(direction,-along).length();if(along>0&&off<Math.min(.62,along*.018)){p=hitVector.copy(camera.position).addScaledVector(direction,along);isHead=false;}}
     if(p){const d=p.distanceTo(camera.position);if(d<best){best=d;victim=enemy;head=isHead;}}
   }
   const end=camera.position.clone().addScaledVector(direction,best);
   world.tracer(camera.position.clone().add(new THREE.Vector3(.04,-.12,0)),end);
   if(victim){run.hits++;hitTime=.16;audio.hit();hurtEnemy(victim,w.damage*(head?1.8:1));}
   pitch=clamp(pitch+(run.weapon===1?.022:.009)*(input.ads?.65:1),-1.35,1.35);
 }
 function hurtEnemy(enemy,damage){
   if(enemy.health<=0)return;enemy.health=Math.max(0,enemy.health-damage);enemy.alert=6;
   if(!enemy.health){run.kills++;enemy.moving=false;hud.notify?.(`清除警戒 · ${run.kills}/${enemies.length}`);}
 }
 function stepEnemies(dt){
   for(const e of enemies){
     if(e.health<=0)continue;e.cooldown-=dt;e.think-=dt;e.moving=false;
     if(e.think<=0){
       e.think=.24;const d=dist(e,player),visible=d<38&&hasLineOfSight(nav,e,player);
       // A noise raises alert but cannot cause a through-wall shot.
       if(visible||(noise&&noise.until>run.elapsed&&noise.floor===e.floor&&dist(noise,e)<32))e.alert=5;
       else e.alert=Math.max(0,e.alert-.24);
       e.seesPlayer=visible;e.seesAlly=ally.health>0&&dist(e,ally)<30&&hasLineOfSight(nav,e,ally);
     }
     const target=e.seesAlly&&(!e.seesPlayer||dist(e,ally)<dist(e,player)*.8)?ally:e.seesPlayer?player:null;
     if(target){
       e.yaw=Math.atan2(target.x-e.x,target.z-e.z);e.seen+=dt;
       if(e.seen>.9&&e.cooldown<=0&&hasLineOfSight(nav,e,target)){
         e.cooldown=1.05+Math.random()*.5;world.tracer(eye(e),eye(target),true);
         if(Math.random()<(dist(e,target)<14?.68:.44)){
           if(target===ally){ally.health=Math.max(0,ally.health-5);run.teammateHP=ally.health;}
           else{damagePlayer(run,input.crouch?5:7);audio.hurt();}
         }
       }
     }else{
       e.seen=0;const route=e.patrolRoutes[e.patrolAt];
       if(route?.length){if(moveActor(e,route[e.routeAt],e.alert?2.6:1.6,dt)){e.routeAt++;if(e.routeAt>=route.length){e.patrolAt=(e.patrolAt+1)%2;e.routeAt=1;}}}
     }
   }
 }
 function stepAlly(dt){
   ally.moving=false;if(ally.health<=0)return;ally.cooldown-=dt;
   if(run.command!=='hold'){
     const follow=advanceTrail(nav,ally,trail,trailAt,{dt,gap:run.command==='cover'?5.5:2.6});
     Object.assign(ally,follow.state,{moving:follow.moving,yaw:follow.yaw});trailAt=follow.index;
   }
   const threat=enemies.filter(e=>e.health>0&&dist(e,ally)<42&&hasLineOfSight(nav,ally,e)).sort((a,b)=>dist(a,ally)-dist(b,ally))[0];
   if(threat){ally.alert=1;ally.yaw=Math.atan2(threat.x-ally.x,threat.z-ally.z);
     if(ally.cooldown<=0){ally.cooldown=run.command==='cover'?.62:.85;world.tracer(eye(ally),eye(threat));hurtEnemy(threat,run.command==='cover'?17:12);}
   }else ally.alert=0;
 }
 function currentGuide(){
   const route=routes[Math.min(run.stage,2)];if(!route)return null;
   routeProgress=advanceGuide(nav,route,player,routeProgress);
   return route[routeProgress]||route.at(-1);
 }
 function updateMission(dt){
   const target=mission.objectives[Math.min(run.stage,2)],near=player.floor===target.floor&&dist(player,target)<=target.radius;
   if(run.stage<2){
     const complete=interactObjective(run,{near:near&&input.interact,clear:hasLineOfSight(nav,player,target),duration:target.holdSeconds,dt});
     if(!near)input.interact=false;
     if(complete){input.interact=false;audio.objective();routeProgress=0;run.hp=Math.min(100,run.hp+25);run.reserves[0]+=25;
       run.message=run.stage===1?'回声：密钥收到。去酒店二楼，注意楼梯转角。':'回声：情报到手。下到 B1，穿连廊去公寓撤离。';hud.notify?.(run.message);}
   }else{
     const contested=enemies.some(e=>e.health>0&&e.floor===target.floor&&dist(e,target)<14&&hasLineOfSight(nav,e,player));
     updateExtraction(run,{inside:near,contested,dt,duration:target.holdSeconds});
     if(near&&contested)run.message='撤离区受到威胁，清除附近警戒。';
   }
 }
 function updateHUD(){
   const target=mission.objectives[Math.min(run.stage,2)],w=WEAPONS[run.weapon],near=target.floor===player.floor&&dist(player,target)<target.radius;
   const bearing=waypoint?`${Math.round(dist(player,waypoint))} m · ${ctx.lvById[target.floor]?.name||target.floor}`:'';
   hud.update({hp:run.hp,maxHp:100,ammo:run.magazines[run.weapon],reserve:run.reserves[run.weapon],weapon:w.name,weaponId:w.id,
     objective:target.title,detail:target.description,bearing,heading:(((-yaw*180/Math.PI)%360)+360)%360,
     progress:run.stage,stage:run.stage,teammate:{name:mission.teammate.name,hp:ally.health,health:ally.health,status:ally.health<=0?'倒地 · 靠近救援':{follow:'跟随',hold:'守点',cover:'掩护'}[run.command],command:run.command,distance:Math.round(dist(player,ally))},
     interactLabel:run.stage<2&&near?(run.interaction?`读取中 ${Math.ceil((1-run.interaction/target.holdSeconds)*100)}%`:'读取情报'):ally.health<=0&&dist(player,ally)<2.5?'救援回声':null,
     extracting:run.stage===2&&run.extracting>0?run.extracting/target.holdSeconds:-1,hit:hitTime>0,damaged:run.hurtAgo<.2,
     reloading:run.reload>0,reloadProgress:run.reload?1-run.reload/run.reloadDuration:0,medkits:run.medkits,healing:run.healTime>0,
     message:run.message,elapsed:run.elapsed,kills:run.kills,ads:input.ads,crouching:input.crouch});
 }
 function projectMarker(){
   if(!waypoint||run.paused||run.status!=='playing'){marker.hidden=true;return;}
   const point=new THREE.Vector3(waypoint.x,waypoint.y+1.2,waypoint.z),toward=point.clone().sub(camera.position);camera.getWorldDirection(direction);
   const inFront=toward.dot(direction)>0;point.project(camera);
   marker.hidden=false;marker.style.left=`${clamp(point.x*.5+.5,.12,.88)*100}%`;marker.style.top=`${clamp(-point.y*.5+.5,.22,.63)*100}%`;
   if(!inFront){marker.style.left='50%';marker.style.top='64%';}
   marker.textContent=`${inFront?'◇':'↶'} ${inFront?'前进':'转身'} ${Math.round(dist(player,waypoint))}m`;
 }
 function update(dt,time){
   dt=Math.min(dt,.06);
   if(!run.paused&&run.status==='playing'){
     tickRun(run,dt);movePlayer(dt);syncVisibility();syncCamera(dt);
     if(input.fire)takeShot();stepEnemies(dt);stepAlly(dt);updateMission(dt);hitTime=Math.max(0,hitTime-dt);
     waypoint=currentGuide();
   }else syncCamera(dt);
   viewmodel.update(run.paused?0:dt,{moving:moved&&!run.paused,aiming:input.ads,reloading:run.reload>0,reloadProgress:run.reload?1-run.reload/run.reloadDuration:0,
     switching:run.switchTime>0,switchProgress:run.switchTime?1-run.switchTime/run.switchDuration:1,weapon:WEAPONS[run.weapon].id,recoil:0});
   world.update(run.paused?0:dt,[ally,...enemies],player,run.stage,run.elapsed,waypoint);projectMarker();
   hudClock+=dt;if(hudClock>.09){hudClock=0;updateHUD();}
   if(run.status!=='playing'&&!wasResult){wasResult=true;release();if(document.pointerLockElement)document.exitPointerLock?.();hud.showResult(run.result);marker.hidden=true;}
 }
 function reset(){
   Object.assign(run,createRun());run.message='回声：重新集结。先前往商场终端。';player=copy(mission.spawn);yaw=player.yaw;pitch=0;eyeY=player.y+NAV.eye;
   Object.assign(ally,copy(mission.teammate),{health:100,alert:0,cooldown:0,moving:false});
   enemies.forEach((e,i)=>Object.assign(e,copy(mission.enemies[i]),{health:mission.enemies[i].health,alert:0,seen:0,seesPlayer:false,seesAlly:false,cooldown:1,think:0,patrolAt:0,routeAt:1,moving:false}));
   trail=[copy(player)];trailAt=routeProgress=0;noise=null;hitTime=0;wasResult=false;release();input.ads=input.crouch=false;
   hud.clearResult?.();hud.setPaused(false);syncVisibility(true);syncCamera(1);updateHUD();
 }
 return {mission,nav,run,enemies,ally,routes,viewmodel,world,hud,
   get player(){return {...player,yaw,pitch};},get guide(){return waypoint;},action:act,pause,reset,
   // An ordinary debug input adapter, used by browser tests to send the same
   // stick/look actions as touch. It cannot change health or complete goals.
   input(move){if(!run.paused){input.x=clamp(move.x||0,-1,1);input.y=clamp(move.y||0,-1,1);}},look,
   dispose(){abort.abort();release();ctx.dynamic.splice(ctx.dynamic.indexOf(dynamic),1);ctx.afterRender.splice(ctx.afterRender.indexOf(draw),1);hud.dispose();world.dispose();viewmodel.dispose();audio.dispose();marker.remove();},
 };
}
