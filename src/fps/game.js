import * as THREE from 'three';
import { buildNav, step, NAV, linksNear, clear } from '../layout/nav.js';
import { pointInPoly, distToPolyEdge } from '../layout/geom.js';
import { createMissionLayout } from './mission-layout.js';
import { findPath, hasLineOfSight, advanceGuide, traceMotion } from './pathfinding.js';
import { recordTrail, advanceTrail } from './follower.js';
import { createRun, WEAPONS, DIFFICULTIES, tickRun, fireWeapon, reloadWeapon, switchWeapon,
  damagePlayer, healPlayer, interactObjective, updateExtraction, parseSquadOrder, changeFireMode,
  throwGrenade, meleeAttack, awardKill, addArmor, addMedkit, addGrenade, collectIntel, pushFeed } from './rules.js';
import { createMobility, tickMobility, jump, startSlide } from './mobility.js';
import { enemyType, perceiveEnemy, enemyShotChance, damageEnemy, explosionAlert, isUnaware } from './enemy-tactics.js';
import { createCameraEffects, createWorldEffects } from './effects.js';
import { createElevatorRide, sampleElevatorRide } from '../layout/elevator-ride.js';
import { createFPSHUD } from './hud.js';
import { createViewmodel } from './viewmodel.js';
import { createCombatWorld } from './world.js';
import { createGameAudio } from './audio.js';

const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const eye=a=>new THREE.Vector3(a.x,a.y+(a.eye??1.45),a.z);
const waitFrame=()=>new Promise(r=>setTimeout(r,20));
const copy=p=>({...p,slope:p.slope?{...p.slope}:null});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export async function createFPSGame(app,{onProgress=()=>{},difficulty='standard'}={}) {
 const {camera,renderer,ctx}=app,canvas=renderer.domElement,mission=createMissionLayout(ctx.layout);
 const nav=buildNav(ctx.layout),run=createRun({difficulty}),ruleSet=DIFFICULTIES[run.difficulty]||DIFFICULTIES.standard;
 let player=copy(mission.spawn),yaw=player.yaw,pitch=0,eyeY=player.y+NAV.eye;
 let input={x:0,y:0,fire:false,ads:false,sprint:false,crouch:false,interact:false};
 let motion=createMobility(),liftRide=null,extractionChoice=0,departureTime=0,departureStart=null,burstRemaining=0,fireWasDown=false;
 let settings={sensitivity:1,sound:true,invertY:false},wasResult=false,moved=false,stepClock=0,hudClock=0,noise=null,hitTime=0,visibilityKey='';
 const cameraFx=createCameraEffects(),worldFx=createWorldEffects(app.scene);
 let meleeAnim=0,throwAnim=0,lookDelta={x:0,y:0},grenadeFlight=null,hurtSource=null,heartbeatClock=0,lastHp=run.hp,wasSprinting=false;
 const shownHints=new Set(),bonusProgress={value:0},pickupTaken=new Set();
 const intelTotal=(mission.pickups||[]).filter(p=>p.kind==='intel').length||5;
 const keys=new Set(),audio=createGameAudio(),abort=new AbortController(),eventOptions={signal:abort.signal};
 onProgress('规划酒店与公寓之间的真实行动路线',.02);await waitFrame();
 const routeStarts=[mission.spawn,...mission.objectives.slice(0,2)];
 const routes=[];
 for(let i=0;i<mission.objectives.length;i++){
   const route=findPath(nav,routeStarts[i],mission.objectives[i]);
   if(!route)throw new Error(`行动路线不可达：${mission.objectives[i].title}`);
   routes.push(route);onProgress('连通楼梯与地下撤离路线',.04+i*.035);await waitFrame();
 }
 const extractionRoutes=mission.extractions.map((target,i)=>i===0?routes[2]:findPath(nav,mission.objectives[1],target));
 if(extractionRoutes.some(r=>!r))throw new Error('直升机或车辆撤离路线不可达');
 const ally={...copy(mission.teammate),health:100,yaw:0,alert:0,cooldown:0,moving:false,route:[],routeAt:1};
 const enemies=mission.enemies.map((e,i)=>({...copy(e),health:e.health,maxHealth:e.health,yaw:i%2?Math.PI:1.7,
   alert:0,seen:0,cooldown:.8+i*.17,think:0,patrolAt:0,routeAt:1,moving:false,
   state:'patrol',reload:0,ammo:enemyType(e).clip,burst:0,repath:0,tacticalRoute:null,tacticalAt:1,lastKnown:null,
   patrolRoutes:[findPath(nav,e,e.patrol[1]),findPath(nav,e.patrol[1],e.patrol[0])]}));
 let trail=[copy(player)],trailAt=0,routeProgress=0,waypoint=routes[0][1],lastRepath=0;
 const pickups=[];
 onProgress('载入第一人称手臂、枪械与换弹动作',.18);
 const viewmodel=await createViewmodel({camera,scene:app.scene,renderer,onProgress:progress=>{
   const p=typeof progress==='object'?progress:{};onProgress(`载入${p.label||'真实枪械模型'}`,.18+.43*(p.loaded/Math.max(1,p.total)||0));
 }});
 onProgress('部署队友与巡逻小队',.67);
 const world=await createCombatWorld(app,mission,viewmodel,nav);
 const hud=createFPSHUD({onAction:act,onMove:p=>{input.x=p.x;input.y=p.y;},onLook:look,
   onSettings:s=>{settings={...settings,...s};audio.setMuted(s.sound===false||s.muted===true);
     audio.setVolumes?.({master:s.masterVolume??1,sfx:s.sfxVolume??1});}});
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
   if(k===' ')act('jump');if(k==='f')act('firemode');if(k==='t')act('extract-route');
   if(k==='c'||k==='control')act('crouch',{active:!input.crouch});
   if(k==='x')act('melee');if(k==='g')act('grenade');
   if(k==='v')act('squad',{command:'follow'});
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
 hud.notify?.('点击冲刺开关后推动摇杆；右侧新增跳跃。右上可选择车辆或直升机撤离。',4200);
 hud.toast?.('新装备：X 近战 · G 手雷 · 冲刺中按蹲伏滑铲','system');
 hud.showHint?.('move','左摇杆移动，右侧滑动转向。收集情报碎片可获得额外分数。');
 updateHUD();

 function release(){input.x=input.y=0;input.fire=input.sprint=input.interact=false;keys.clear();drag=null;burstRemaining=0;fireWasDown=false;}
 function pause(value){
   if(run.status!=='playing')return;run.paused=!!value;release();hud.setPaused(run.paused);
   if(value&&document.pointerLockElement)document.exitPointerLock?.();
 }
 function look({dx=0,dy=0,mouse=false}){
   if(run.paused||run.status!=='playing')return;
   const sensitivity=Number(settings.sensitivity)||1,scale=(mouse?.0022:.004)*sensitivity*(input.ads?.58:1);
   yaw-=dx*scale;pitch=clamp(pitch-dy*scale*(settings.invertY?-1:1),-1.35,1.35);
   // First-person arms lag behind the camera; cap so touch flicks stay readable.
   lookDelta.x=clamp(lookDelta.x+dx*scale,-.5,.5);
   lookDelta.y=clamp(lookDelta.y+dy*scale*(settings.invertY?-1:1),-.3,.3);
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
   if(action==='lift'){startLift(payload.id,payload.floor);return;}
   if(action==='firemode'){
     if(changeFireMode(run)){burstRemaining=0;hud.notify?.(`SMG 已切换${run.fireMode==='burst'?'两连发：每次按下发射两发':'全自动：按住持续射击'}`);updateHUD();}
     return;
   }
   if(action==='order'){order(payload.text||'');return;}
   // Squad orders remain available while the orders/settings sheet is open.
   if(action==='squad'&&['follow','hold','cover'].includes(payload.command)&&run.status==='playing'){
     run.command=payload.command;audio.radio();
     run.message={follow:'回声：收到，跟随你的路线。',hold:'回声：我守住这里，你继续。',cover:'回声：保持距离，掩护你前进。'}[run.command];
     hud.notify?.(run.message);updateHUD();return;
   }
   if(run.paused||run.status!=='playing'||liftRide)return;
   if(action==='fire')input.fire=payload.pressed??true;
   else if(action==='ads')input.ads=payload.active??!input.ads;
   else if(action==='sprint')input.sprint=payload.active??payload.pressed??!input.sprint;
   else if(action==='crouch'){
     const active=payload.active??!input.crouch;
     // Crouch pressed during a real sprint becomes a slide instead of a toggle.
     if(active&&!input.crouch&&motion.sprinting&&startSlide(motion,{grounded:!player.slope,sprinting:motion.sprinting,aiming:input.ads})){
       input.sprint=false;audio.slide?.();hud.notify?.('滑铲 · 压低身位快速转移');
     } else input.crouch=active;
   }
   else if(action==='melee'){
     if(meleeAttack(run)){meleeAnim=.52;input.fire=false;burstRemaining=0;viewmodel.melee?.();audio.meleeSwing();meleeStrike();}
   }
   else if(action==='grenade'){
     if(throwGrenade(run)){input.fire=false;burstRemaining=0;throwAnim=.72;viewmodel.throwGrenade?.();audio.grenadeThrow();startGrenade();}
   }
   else if(action==='reload'){if(reloadWeapon(run)){input.fire=false;burstRemaining=0;audio.reload();}}
   else if(action==='swap'){if(switchWeapon(run)){input.fire=false;burstRemaining=0;audio.reload();}}
   else if(action==='heal'){if(healPlayer(run)){input.fire=false;hud.notify?.('正在使用急救包');}}
   else if(action==='jump'){
     if(jump(motion,{grounded:!player.slope,ceiling:jumpCeiling(),blocked:!!run.healTime})){input.crouch=false;audio.jump?.();}
   }
   else if(action==='extract-route'){
     extractionChoice=(extractionChoice+1)%mission.extractions.length;
     const exit=mission.extractions[extractionChoice];run.extracting=0;run.extractionId=exit.id;
     if(run.stage>=2)replanExtraction();
     hud.notify?.(`撤离路线：${exit.title}`);audio.radio();
   }
   else if(action==='interact'){
     const target=currentTarget();
     if(target&&run.stage<2&&player.floor===target.floor&&dist(player,target)<=target.radius){input.interact=true;}
     else if(bonusAvailable()&&bonusNear()){bonusProgress.value=Math.min(mission.bonus.holdSeconds,bonusProgress.value+0);input.interact=true;}
     else if(ally.health<=0&&player.floor===ally.floor&&dist(player,ally)<2.5){ally.health=run.teammateHP=60;hud.notify?.('回声已恢复行动');}
     else {
       const lift=nearestLift();
       if(lift)hud.showLiftStops({...lift.link,stops:lift.link.stops.map(s=>({...s,label:ctx.lvById[s.floor]?.name||s.floor}))},player.floor);
       else hud.notify?.('靠近金色任务标记或电梯候梯点后互动；沿蓝色引导点前进。');
     }
   }
   updateHUD();
 }
 function bonusAvailable(){return !!mission.bonus&&!run.bonusComplete;}
 function bonusNear(){
   if(!bonusAvailable()||liftRide||motion.height>.15)return false;
   const b=mission.bonus;return player.floor===b.floor&&dist(player,b)<=b.radius;
 }
 function frontEnemy(range=2.6){
   const fx=-Math.sin(yaw),fz=-Math.cos(yaw);let best=null,bestScore=Infinity;
   for(const e of enemies){
     if(e.health<=0||e.floor!==player.floor)continue;
     const dx=e.x-player.x,dz=e.z-player.z,d=Math.hypot(dx,dz);
     if(d>range||!hasLineOfSight(nav,player,{...e,eye:1.2}))continue;
     const facing=(dx*fx+dz*fz)/Math.max(.001,d);
     if(facing<.35)continue;
     const score=d-facing*.5;if(score<bestScore){bestScore=score;best=e;}
   }
   return best;
 }
 function meleeStrike(){
   const victim=frontEnemy(2.6);
   if(!victim){worldFx.impact(eye(player).clone().addScaledVector(new THREE.Vector3(-Math.sin(yaw),-.2,-Math.cos(yaw)),1.1),'dust');hud.notify?.('挥刀落空 · 靠近目标再出手');return;}
   const stealth=isUnaware(victim);
   const damage=stealth?999:52;
   hitTime=.18;audio.meleeHit(stealth);cameraFx.shake(stealth?.8:1.1);
   worldFx.impact(new THREE.Vector3(victim.x,victim.y+1.15,victim.z),'blood');
   hurtEnemy(victim,damage,false,player,{melee:true,stealth});
   if(stealth)hud.notify?.('无声处决 · 敌人未察觉');
   updateHUD();
 }
 function startGrenade(){
   camera.getWorldDirection(direction);
   const flat=new THREE.Vector3(direction.x,0,direction.z);
   if(flat.lengthSq()<.02)flat.set(-Math.sin(yaw),0,-Math.cos(yaw));
   flat.normalize();
   // Aim at the first surface in front of the player; the floor under the
   // aim point is a cheap stand-in for a full physics bounce on mobile.
   let distance=13;
   const from=camera.position.clone();
   const probe=from.clone().addScaledVector(direction,13);
   const levelY=nav.floors.get(player.floor)?.y??player.y;
   if(probe.y<levelY+1.2)distance=Math.min(13,Math.max(4,(levelY+1.1-from.y)/Math.max(.15,direction.y)));
   const to=new THREE.Vector3(from.x+flat.x*distance,levelY+.06,from.z+flat.z*distance);
   to.x=clamp(to.x,from.x-16,from.x+16);to.z=clamp(to.z,from.z-16,from.z+16);
   grenadeFlight={time:0,flight:1.02,to,from:from.clone().add(new THREE.Vector3(.16,-.2,0))};
   world.grenadeThrow(from.clone().add(new THREE.Vector3(.16,-.2,0)),to,1.02);
 }
 function explodeGrenade(point){
   worldFx.explosion(point);cameraFx.shake(clamp(2.6-dist(player,{x:point.x,z:point.z})*.18,.5,2.2));
   audio.explosion();
   for(const e of enemies){
     if(e.health<=0||e.floor!==player.floor)continue;
     const d=dist(e,{x:point.x,z:point.z});
     if(d>7)continue;
     if(!hasLineOfSight(nav,{...player,x:point.x,z:point.z},{...e,eye:1.2})){explosionAlert(e,point);continue;}
     hitTime=.2;
     hurtEnemy(e,Math.max(18,Math.round(95*(1-d/8))),false,player,{explosion:true});
   }
   for(const e of enemies){
     if(e.health<=0||e.floor!==player.floor)continue;
     if(dist(e,{x:point.x,z:point.z})<16)explosionAlert(e,point);
   }
   hud.notify?.('手雷起爆');
 }
 function showHint(id,text){
   if(shownHints.has(id)||!text)return;
   shownHints.add(id);hud.showHint?.(id,text);
 }
 function updatePickups(){
   for(const p of mission.pickups||[]){
     if(p.taken||pickupTaken.has(p.id))continue;
     if(p.floor!==player.floor||dist(player,p)>1.6||motion.height>.6)continue;
     pickupTaken.add(p.id);p.taken=true;world.takePickup?.(p.id);
     if(p.kind==='intel'){
       collectIntel(run,intelTotal);run.reserves[0]=Math.min(225,run.reserves[0]+10);run.reserves[1]=Math.min(70,run.reserves[1]+2);
       audio.intelPickup();hud.toast?.('情报碎片已回收 · 弹药补充','intel');
       hud.notify?.(`情报碎片 ${Math.min(run.intelFound,intelTotal)}/${intelTotal} · 分数 +150`);
     } else if(p.kind==='armor'){
       addArmor(run,45);audio.armorPlate();hud.toast?.('护甲板已装备','armor');pushFeed(run,'护甲 +45','pickup');
     } else if(p.kind==='grenade'){
       addGrenade(run,1);hud.toast?.('手雷 +1','pickup');pushFeed(run,'手雷 +1','pickup');
     } else {
       addMedkit(run,1);hud.toast?.('医疗包 +1','pickup');pushFeed(run,'医疗包 +1','pickup');
     }
     worldFx.impact(new THREE.Vector3(p.x,p.y+1,p.z),'spark');
     updateHUD();
   }
 }
 function updateBonus(dt){
   if(!bonusAvailable()||liftRide)return;
   const near=bonusNear();
   if(!near){bonusProgress.value=0;return;}
   if(!input.interact)return;
   bonusProgress.value+=Math.min(.1,Math.max(0,dt));
   if(bonusProgress.value>=mission.bonus.holdSeconds){
     bonusProgress.value=0;run.bonusComplete=true;world.setBonusDone?.(true);addMedkit(run,1);addGrenade(run,1);
     audio.objective();pushFeed(run,'安防监控已切断 · 敌人视野削弱','bonus');
     hud.notify?.('监控已切断 · 敌军视野范围降低，医疗包与手雷各 +1',4200);
     showHint('bonus-done','监控已切断：敌人视野变短，趁现在推进。');
   } else hud.notify?.(`切断监控 ${Math.round(bonusProgress.value/mission.bonus.holdSeconds*100)}%`);
 }
 function damageAngle(){
   if(!hurtSource||hurtSource.until<run.elapsed)return null;
   const targetBearing=Math.atan2(hurtSource.x-player.x,-(hurtSource.z-player.z));
   const viewBearing=Math.atan2(-Math.sin(yaw),Math.cos(yaw));
   let rel=targetBearing-viewBearing;
   rel=Math.atan2(Math.sin(rel),Math.cos(rel));
   return rel;
 }
 function compassMarks(){
   const marks=[];
   const bearingTo=(x,z)=>((Math.atan2(x-player.x,-(z-player.z))*180/Math.PI)+360)%360;
   const target=currentTarget();
   marks.push({kind:'objective',bearing:bearingTo(target.x,target.z)});
   if(ally.health>0)marks.push({kind:'ally',bearing:bearingTo(ally.x,ally.z)});
   for(const exit of mission.extractions)if(exit!==target)marks.push({kind:'extraction',bearing:bearingTo(exit.x,exit.z)});
   return marks;
 }
 function currentTarget(){return run.stage<2?mission.objectives[run.stage]:mission.extractions[extractionChoice];}
 function currentRoute(){return routes[Math.min(run.stage,2)];}
 function replanExtraction(){
   const route=findPath(nav,player,currentTarget(),{maxNodes:20000});
   if(route){routes[Math.min(run.stage,2)]=route;routeProgress=0;waypoint=route[1]||route[0];}
   else if(run.stage>=2){routes[2]=extractionRoutes[extractionChoice];routeProgress=0;}
 }
 function jumpCeiling(){
   const floor=nav.floors.get(player.floor),height=floor?.level?.height;
   return floor?.level?.kind==='roof'||floor?.kind==='ground'?3:Math.max(.05,(height||3)-NAV.eye-.3);
 }
 function nearestLift(){
   if(player.slope||motion.height>.01||liftRide)return null;
   return linksNear(nav,player.floor,player.x,player.z).find(n=>n.link.kind==='lift'&&ctx.elevatorCars?.has(n.link.id));
 }
 function startLift(id,floor){
   if(run.status!=='playing'||liftRide)return false;
   const link=nav.links.find(l=>l.id===id&&l.kind==='lift'),car=ctx.elevatorCars?.get(id);
   const entry=link?.stops.find(st=>st.floor===player.floor),stop=link?.stops.find(st=>st.floor===floor);
   if(!car||!entry||!stop||floor===player.floor||dist(player,entry)>NAV.reach+.6)return false;
   const approach={...entry,y:player.y,slope:null};
   if(!traceMotion(nav,player,approach)){hud.notify?.('请走到电梯门正前方再选择楼层。');return false;}
   const to={...stop,y:nav.floors.get(floor).y,slope:null};
   const allyBoards=ally.health>0&&run.command!=='hold'&&ally.floor===player.floor&&dist(ally,entry)<6&&!!traceMotion(nav,ally,approach);
   // An ally left outside follows a real staircase route. Do not append the
   // elevator's vertical positions to the ground-only breadcrumb trail.
   const fallback=allyBoards?null:findPath(nav,approach,to);
   if(fallback)for(const p of fallback)recordTrail(trail,p,{distance:.03});
   const enterYaw=Math.atan2(car.elevator.nx,car.elevator.nz),exitYaw=Math.atan2(-car.elevator.nx,-car.elevator.nz);
   liftRide={...createElevatorRide(copy(player),to,{x:car.elevator.x,z:car.elevator.z},approach),link,car,enterYaw,exitYaw,
     allyRide:allyBoards?createElevatorRide(copy(ally),to,{x:car.elevator.x+.38,z:car.elevator.z},approach):null};
   pause(false);release();motion=createMobility();yaw=enterYaw;pitch=0;
   app.ensureTowerFloor?.(floor);syncVisibility(true);audio.radio();hud.notify?.(`进入${link.name}，前往 ${ctx.lvById[floor]?.name||floor}`);
   return true;
 }
 function stepLift(dt){
   const r=liftRide;if(!r)return;r.elapsed+=dt;
   const p=sampleElevatorRide(r,r.elapsed);
   const turnAt=(r.approach ? .65 : 0)+.9,turn=clamp((r.elapsed-turnAt)/.65,0,1),angle=Math.atan2(Math.sin(r.exitYaw-r.enterYaw),Math.cos(r.exitYaw-r.enterYaw));
   if(r.elapsed<=turnAt+.65)yaw=r.enterYaw+angle*turn*turn*(3-2*turn);
   Object.assign(player,{x:p.x,y:p.y,z:p.z,slope:null});eyeY=p.y+NAV.eye;
   if(r.allyRide){
     const a=sampleElevatorRide(r.allyRide,r.elapsed);
     Object.assign(ally,{x:a.x,y:a.y,z:a.z,moving:a.phase==='进入轿厢'||a.phase==='到达',floor:p.arrived?r.to.floor:r.from.floor});
   }
   r.phase=p.phase;r.car.set(p.y,p.door,`${Math.round(p.y)}m`);
   const pass=r.link.stops.filter(st=>nav.floors.get(st.floor).y<=p.y+.05).at(-1)?.floor;
   if(pass&&r.viewFloor!==pass){r.viewFloor=pass;app.state.explore={...app.state.explore,level:pass,under:p.y<0,
     elevator:{id:r.link.id,from:r.from.floor,to:r.to.floor}};app.refresh();}
   if(p.arrived)player.floor=r.to.floor;
   if(p.done){
     r.car.set(r.to.y,1,ctx.lvById[r.to.floor]?.short||r.to.floor);
     if(r.allyRide){trail=[copy(player)];trailAt=0;}
     liftRide=null;syncVisibility(true);replanExtraction();hud.notify?.('已到达，走出轿厢继续行动。');
   }
 }
 function syncVisibility(force=false){
   const F=nav.floors.get(player.floor),level=F?.parentFloor||F?.level?.id||null;
   const building=F?.building||null;let near=null;
   if(!building){let best=24;for(const b of ctx.layout.buildings){const d=distToPolyEdge([player.x,player.z],b.outline);if(d<best){best=d;near=b.id;}}}
   const key=`${building}/${level}/${near}/${player.y<-.5}/${Math.floor(player.x/24)}/${Math.floor(player.z/24)}`;
   if(force||key!==visibilityKey){visibilityKey=key;app.state.explore={building,level,near,metro:false,under:player.y<-.5,
     position:{x:player.x,z:player.z},...(liftRide?{elevator:{id:liftRide.link.id,from:liftRide.from.floor,to:liftRide.to.floor}}:{})};app.refresh();}
 }
 function syncCamera(dt){
   const eyeHeight=motion.sliding?.86:input.crouch?1.08:NAV.eye;
   const desired=player.y+eyeHeight+motion.height-motion.landing*.075;eyeY+=(desired-eyeY)*Math.min(1,dt*18);
   const shake=cameraFx.update(dt),shakeScale=clamp(Number(settings.shake)||1,.2,1.6),impact=motion.landing*.5;
   camera.position.set(player.x+shake.x*shakeScale+impact*(Math.random()-.5)*.02,eyeY+shake.y*shakeScale,player.z+shake.z*shakeScale);
   camera.rotation.set(pitch,yaw,(shake.roll+motion.sliding*-.045*(motion.slideProgress||0))*shakeScale,'YXZ');
   const targetFov=input.ads?(camera.aspect<1?65:47):(camera.aspect<1?86:68)+(motion.sprinting?3:0)+(motion.sliding?4:0)+shake.fov*shakeScale;
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
   const motionState=tickMobility(motion,dt,{moving:Math.hypot(x,forward)>.1,sprint:input.sprint||keys.has('shift'),
     crouch:input.crouch,aiming:input.ads,busy:run.healTime>0||run.reload>0,firing:input.fire,ceiling:jumpCeiling()});
   const speed=motionState.speed;
   if(motionState.landed)audio.land?.();
   const dx=(Math.cos(yaw)*x-Math.sin(yaw)*forward)*speed*dt,dz=(-Math.sin(yaw)*x-Math.cos(yaw)*forward)*speed*dt;
   const before=player,n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));
   for(let i=0;i<n;i++){player=step(nav,player,dx/n,dz/n,dt/n);recordTrail(trail,player);}
   moved=dist(before,player)>.002;
   player.eye=(motion.sliding?.86:input.crouch?1.08:NAV.eye)+motion.height;
   if(moved&&motion.height<.01){stepClock+=dt;if(stepClock>(motion.sprinting?.24:.4)){
     audio.step();stepClock=0;
     const radius=motion.sliding?9:motion.sprinting?19:6;
     if(!input.crouch&&!(noise&&noise.until>run.elapsed&&noise.radius>radius))noise={...copy(player),until:run.elapsed+.35,radius};
   }}
   if(trailAt>300){trail.splice(0,trailAt-1);trailAt=1;}
 }
 function takeShot(){
   if(!fireWeapon(run)){if(!run.magazines[run.weapon]&&!run.reload){audio.emptyClick?.();act('reload');}return;}
   const w=WEAPONS[run.weapon];viewmodel.fire();audio.shot(run.weapon===1);noise={...copy(player),until:run.elapsed+2.5,radius:45};
   camera.getWorldDirection(direction);const spread=w.spread*(input.ads?.2:1)*(moved?1.4:1)*(motion.height>.01?2.3:1);
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
   if(victim){run.hits++;hitTime=.16;audio.hit();
     const point=camera.position.clone().addScaledVector(direction,best);
     worldFx.impact(point,head?'blood':'spark');
     hurtEnemy(victim,w.damage*(head?1.8:1),head);}
   const kick=(run.weapon===1?.022:.009)*(input.ads?.65:1);
   pitch=clamp(pitch+kick*(.7+Math.random()*.6),-1.35,1.35);yaw+=(Math.random()-.5)*kick*.5;
   cameraFx.shake((run.weapon===1?.55:.3)*(input.ads?.5:1));
 }
 function hurtEnemy(enemy,damage,headshot=false,attacker=player,opts={}){
   if(enemy.health<=0)return;damageEnemy(enemy,damage,headshot);enemy.lastKnown=copy(attacker);
   if(!enemy.health){
     const label=enemyType(enemy).label,stealth=!!opts.stealth,melee=!!opts.melee;
     const reward=awardKill(run,{headshot,melee,stealth});
     enemy.moving=false;pickups.push({id:enemy.id,...copy(enemy),taken:false});
     world.dropSupply?.(enemy);world.hitActor?.(enemy.id);
     const tone=headshot?'headshot':'kill';
     pushFeed(run,`${headshot?'爆头 ':''}${melee?stealth?'无声处决':'近战击杀':'击倒'} ${label} +${reward.points}`,tone);
     if(enemy.elite){addArmor(run,50);pushFeed(run,'精英护甲 +50','pickup');audio.armorPlate?.();}
     if(run.streak===3||run.streak===5||run.streak===8){pushFeed(run,`连杀 ${run.streak} · 分数 ×${run.multiplier.toFixed(2)}`,'streak');audio.streak?.(run.streak);}
     hud.notify?.(`${headshot?'精准命中 · ':''}清除${label} · ${run.kills}/${enemies.length}，靠近补充弹药`);
   } else world.hitActor?.(enemy.id);
 }
 function planEnemyMove(e,target){
   if(e.repath>0||!target||target.floor!==e.floor)return;
   e.repath=1.4+(e.id.length%3)*.2;
   const profile=enemyType(e),d=dist(e,target),candidates=[];
   if(e.reload>0||e.health<e.maxHealth*.45){
     for(const c of mission.cover.filter(c=>c.floor===e.floor&&dist(c,e)<15)){
       const away=Math.atan2(c.z-target.z,c.x-target.x);
       candidates.push({...copy(e),x:c.x+Math.cos(away)*(c.w/2+1),z:c.z+Math.sin(away)*(c.d/2+1)});
     }
   }
   if(e.state==='investigate')candidates.push(copy(target));
   else if(d>profile.preferred+3||d<6||e.type==='assault'){
     const ux=(e.x-target.x)/Math.max(.1,d),uz=(e.z-target.z)/Math.max(.1,d),side=e.id.length%2?1:-1;
     candidates.push({...copy(e),x:target.x+ux*Math.min(profile.preferred,d)+uz*3*side,z:target.z+uz*Math.min(profile.preferred,d)-ux*3*side});
     if(d>profile.preferred+3)candidates.push({...copy(e),x:e.x-ux*4,z:e.z-uz*4});
   }
   for(const candidate of candidates){
     if(!clear(nav,candidate)||dist(e,candidate)<1)continue;
     const path=findPath(nav,e,candidate,{maxNodes:2400,cellSize:.8});
     if(path){e.tacticalRoute=path;e.tacticalAt=1;return;}
   }
 }
 function stepEnemies(dt){
   for(const e of enemies){
     if(e.health<=0)continue;
     const profile=enemyType(e);e.cooldown-=dt;e.think-=dt;e.repath-=dt;e.alert=Math.max(0,e.alert-dt);e.moving=false;
     if(e.reload>0){e.reload=Math.max(0,e.reload-dt);if(!e.reload)e.ammo=profile.clip;}
     if(e.think<=0){
       e.think=.28+(e.id.length%3)*.035;
       e.target=perceiveEnemy(e,{player,ally,noise,elapsed:run.elapsed,rangeScale:run.bonusComplete?.72:1,visible:(a,b)=>hasLineOfSight(nav,a,b)});
       if(e.target===player)showHint('spotted','已暴露：滑铲、蹲伏或找掩护能降低敌人命中率。');
       planEnemyMove(e,e.target||e.lastKnown);
     }
     const target=e.target&&e.target.health!==0?e.target:null;
     if(e.tacticalRoute&&!e.burst){
       const route=e.tacticalRoute;
       e.returnToPatrol=true;
       if(moveActor(e,route[e.tacticalAt],profile.speed,dt)){
         e.tacticalAt++;if(e.tacticalAt>=route.length){e.tacticalRoute=null;if(!target)e.lastKnown=null;}
       }
     }else if(!target&&!e.alert){
       if(e.returnToPatrol&&e.repath<=0){
         e.repath=2;const back=findPath(nav,e,e.patrol[e.patrolAt],{maxNodes:2400,cellSize:.8});
         if(back){e.tacticalRoute=back;e.tacticalAt=1;e.returnToPatrol=false;e.routeAt=1;}
       }
       const route=e.patrolRoutes[e.patrolAt];
       if(route?.length&&moveActor(e,route[e.routeAt],profile.speed*.57,dt)){
         e.routeAt++;if(e.routeAt>=route.length){e.patrolAt=(e.patrolAt+1)%2;e.routeAt=1;}
       }
     }
     if(target){
       e.yaw=Math.atan2(target.x-e.x,target.z-e.z);e.seen+=dt;
       if(!e.reload&&e.seen>profile.reaction&&e.cooldown<=0&&hasLineOfSight(nav,e,target)){
         if(!e.ammo){e.reload=profile.reload;e.state='reload';e.burst=0;continue;}
         if(!e.burst)e.burst=profile.burst;
         e.ammo--;e.burst--;e.cooldown=e.burst?.13:profile.interval;
         world.tracer(eye(e),eye(target),true);world.muzzle?.(e.id);
         if(Math.random()<enemyShotChance(e,target,{crouching:target===player&&input.crouch,moving:target===player&&moved,airborne:target===player&&motion.height>.01})*ruleSet.enemyAccuracy){
           if(target===ally){ally.health=Math.max(0,ally.health-profile.damage*.65);run.teammateHP=ally.health;}
           else{damagePlayer(run,profile.damage*ruleSet.enemyDamage);audio.hurt();
             hurtSource={x:e.x,z:e.z,until:run.elapsed+1.1};cameraFx.shake(.55);}
         }
       }
     }else{e.seen=0;e.burst=0;}
   }
   for(const pickup of pickups){
     if(pickup.taken||player.floor!==pickup.floor||dist(player,pickup)>2.2)continue;
     pickup.taken=true;run.reserves[0]=Math.min(225,run.reserves[0]+12);run.reserves[1]=Math.min(70,run.reserves[1]+3);
     world.takeSupply?.(pickup.id);audio.reload();hud.notify?.('补给已回收 · SMG +12 / 手枪 +3');
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
     if(ally.cooldown<=0){ally.cooldown=run.command==='cover'?.62:.85;world.tracer(eye(ally),eye(threat));world.muzzle?.(ally.id);hurtEnemy(threat,run.command==='cover'?17:12,false,ally);}
   }else ally.alert=0;
 }
 function currentGuide(){
   const route=currentRoute();if(!route)return null;
   routeProgress=advanceGuide(nav,route,player,routeProgress);
   return route[routeProgress]||route.at(-1);
 }
 function updateMission(dt){
   let target=currentTarget(),near=player.floor===target.floor&&dist(player,target)<=target.radius&&motion.height<.15;
   if(run.stage<2){
     const complete=interactObjective(run,{near:near&&input.interact,clear:hasLineOfSight(nav,player,target),duration:target.holdSeconds,dt});
     if(!near)input.interact=false;
     if(complete){input.interact=false;audio.objective();routeProgress=0;run.hp=Math.min(100,run.hp+25);run.reserves[0]+=25;
       if(run.stage>=2){routes[2]=extractionRoutes[extractionChoice];replanExtraction();}
       run.message=run.stage===1?'回声：密钥收到。去酒店二楼，注意楼梯转角。':`回声：情报到手。前往${currentTarget().title}，右上可以切换路线。`;hud.notify?.(run.message);
       if(run.stage>=2){showHint('extract-route','按住撤离区并守住倒计时；右上可在车辆与直升机之间切换。');if(bonusAvailable())showHint('bonus','可选：切断安防监控，敌人视野会变短，还能补充医疗包与手雷。');}
       pushFeed(run,run.stage===1?'目标完成：商场密钥':'目标完成：酒店情报','objective');}
   }else{
     const nearbyExit=mission.extractions.findIndex(e=>e.floor===player.floor&&dist(player,e)<=e.radius);
     if(nearbyExit>=0&&nearbyExit!==extractionChoice){
       extractionChoice=nearbyExit;target=currentTarget();near=motion.height<.15;
       run.extracting=0;run.extractionId=target.id;replanExtraction();
     }
     const contested=enemies.some(e=>e.health>0&&e.floor===target.floor&&dist(e,target)<14&&hasLineOfSight(nav,e,player));
     const complete=updateExtraction(run,{inside:near,contested,dt,duration:target.holdSeconds,id:target.id,title:target.vehicle.kind==='helicopter'?'直升机':'装甲接应车'});
     if(near&&contested)run.message='撤离区受到威胁，清除附近警戒。';
     else if(near)run.message=target.vehicle.kind==='helicopter'?'直升机接应中。守住平台，准备登机。':'接应车已到位。守住登车位置。';
     if(complete){departureTime=0;departureStart={position:camera.position.clone(),yaw,pitch};audio.objective();hud.notify?.(target.vehicle.kind==='helicopter'?'已登机 · 直升机起飞':'已登车 · 接应车辆驶离',5000);}
   }
   updateBonus(dt);
   if(!near&&!bonusNear())input.interact=false;
 }
 function updateHUD(){
   const target=currentTarget(),w=WEAPONS[run.weapon],near=target.floor===player.floor&&dist(player,target)<target.radius;
   const bearing=waypoint?`${Math.round(dist(player,waypoint))} m · ${ctx.lvById[target.floor]?.name||target.floor}`:'';
   const lift=nearestLift(),threats=enemies.filter(e=>e.health>0&&e.seesPlayer);
   hud.update({hp:run.hp,maxHp:100,ammo:run.magazines[run.weapon],reserve:run.reserves[run.weapon],weapon:w.name,weaponId:w.id,
     objective:target.title,detail:target.description,bearing,heading:(((-yaw*180/Math.PI)%360)+360)%360,
     progress:run.stage,stage:run.stage,teammate:{name:mission.teammate.name,hp:ally.health,health:ally.health,status:ally.health<=0?'倒地 · 靠近救援':{follow:'跟随',hold:'守点',cover:'掩护'}[run.command],command:run.command,distance:Math.round(dist(player,ally))},
     interactLabel:run.stage<2&&near?(run.interaction?`读取中 ${Math.ceil((1-run.interaction/target.holdSeconds)*100)}%`:'读取情报'):bonusNear()?(bonusProgress.value>0?`切断监控 ${Math.round(bonusProgress.value/mission.bonus.holdSeconds*100)}%`:'切断安防监控'):ally.health<=0&&dist(player,ally)<2.5?'救援回声':liftRide?`${liftRide.phase||'进入轿厢'} · ${ctx.lvById[liftRide.to.floor]?.short||liftRide.to.floor}`:lift?'选择电梯楼层':null,
     extracting:run.stage===2&&run.extracting>0?run.extracting/(target.holdSeconds*ruleSet.extractionScale):-1,hit:hitTime>0,damaged:run.hurtAgo<.2,
     reloading:run.reload>0,reloadProgress:run.reload?1-run.reload/run.reloadDuration:0,medkits:run.medkits,healing:run.healTime>0,
     message:run.message,elapsed:run.elapsed,kills:run.kills,ads:input.ads,crouching:input.crouch,
     stamina:motion.stamina,sprinting:motion.sprinting,sprintRequested:input.sprint,airborne:motion.height>.01,
     fireMode:run.fireMode,extractionLabel:mission.extractions[extractionChoice].vehicle.kind==='helicopter'?'直升机撤离':'车辆撤离',
     movementLabel:`${liftRide?'乘梯中':motion.height>.01?'腾空':motion.exhausted?'耐力恢复':motion.sprinting?'冲刺':input.crouch?'蹲伏':'步行'} · ${run.weapon===1?'半自动':run.fireMode==='burst'?'两连发':'全自动'}`,
     threatLabel:threats.length?`${threats.length} 名敌人交战${threats.some(e=>e.reload>0)?' · 敌方装填中':''}`:'',
     armor:run.armor,maxArmor:run.maxArmor,grenades:run.grenades,meleeReady:run.meleeCooldown<=0,
     score:run.score,streak:run.streak,multiplier:run.multiplier,bestStreak:run.bestStreak,
     feed:run.feed.slice(-5),intel:{found:run.intelFound,total:intelTotal},
     bonus:mission.bonus?{title:mission.bonus.title,done:run.bonusComplete,available:true,progress:mission.bonus.holdSeconds?bonusProgress.value/mission.bonus.holdSeconds:0}:null,
     damageFrom:damageAngle(),compassMarks:compassMarks(),sliding:motion.sliding,slideProgress:motion.slideProgress||0,
     timer:Math.floor(run.elapsed),difficulty:ruleSet.label,extractionScale:ruleSet.extractionScale});
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
     tickRun(run,dt);
     if(liftRide){stepLift(dt);syncCamera(dt);}
     else{movePlayer(dt);syncVisibility();syncCamera(dt);}
     if(!liftRide){
       if(input.fire&&!fireWasDown)burstRemaining=run.weapon===0&&run.fireMode==='burst'?2:1;
       const automatic=run.weapon===0&&run.fireMode==='auto';
       if((automatic&&input.fire)||burstRemaining>0){
         const shots=run.shots;takeShot();if(run.shots>shots)burstRemaining=Math.max(0,burstRemaining-1);
       }
       fireWasDown=input.fire;
     }
     stepEnemies(dt);if(!liftRide?.allyRide)stepAlly(dt);if(!liftRide)updateMission(dt);hitTime=Math.max(0,hitTime-dt);
     updatePickups();
     if(grenadeFlight){
       grenadeFlight.time+=dt;
       if(grenadeFlight.time>=grenadeFlight.flight){const point=grenadeFlight.to;grenadeFlight=null;explodeGrenade(point);}
     }
     meleeAnim=Math.max(0,meleeAnim-dt);throwAnim=Math.max(0,throwAnim-dt);
     lookDelta.x*=Math.exp(-dt*7);lookDelta.y*=Math.exp(-dt*7);
     worldFx.update(dt);
     heartbeatClock+=dt;
     if(run.hp<=32&&run.hp>0&&heartbeatClock>1.05){heartbeatClock=0;audio.heartbeat?.();}
     else if(run.hp>32)heartbeatClock=Math.min(heartbeatClock,.6);
     if(input.fire&&!run.magazines[run.weapon]&&!run.reload)showHint('empty','弹匣打空：按换弹或自动装填，别在开阔处停下。');
     if(run.hp<=30)showHint('lowhp','生命值较低：使用急救包（H / 急救按钮）或先脱离交战。');
     if(run.intelFound>0&&run.intelFound===intelTotal)showHint('intel-done','情报碎片已集齐，结算分数已锁定。');
     lastHp=run.hp;
     waypoint=currentGuide();
     if(run.elapsed-lastRepath>5&&!player.slope&&!liftRide){
       lastRepath=run.elapsed;
       if(waypoint&&waypoint.floor===player.floor&&dist(player,waypoint)>18)replanExtraction();
     }
   }else{ syncCamera(dt);worldFx.update(dt); }
   if(run.status==='success'&&departureStart){
     departureTime+=dt;const target=currentTarget(),view=world.departureView?.(target.id,departureTime);
     if(view){const mix=Math.min(1,departureTime/.8);camera.position.copy(departureStart.position).lerp(view.position,mix);camera.lookAt(view.lookAt);}
   }
   viewmodel.update(run.paused?0:dt,{visible:run.status!=='success',moving:moved&&!run.paused&&!liftRide,aiming:input.ads,sprinting:motion.sprinting,
     sliding:motion.sliding?1:0,slideProgress:motion.slideProgress||0,lookDelta:{...lookDelta},
     empty:run.magazines[run.weapon]===0&&run.reload<=0,
     airborne:motion.height>.01,landing:motion.landing,reloading:run.reload>0,reloadProgress:run.reload?1-run.reload/run.reloadDuration:0,
     switching:run.switchTime>0,switchProgress:run.switchTime?1-run.switchTime/run.switchDuration:1,weapon:WEAPONS[run.weapon].id,recoil:0});
   world.update(run.paused&&run.status!=='success'?0:dt,[ally,...enemies],player,run.stage,run.elapsed+departureTime,waypoint,
     {extractionId:currentTarget().id,extractionProgress:run.extracting/(currentTarget().holdSeconds*ruleSet.extractionScale),departing:run.status==='success',departureTime});projectMarker();
   hudClock+=dt;if(hudClock>.09){hudClock=0;updateHUD();}
   if(run.status!=='playing'&&!wasResult&&(run.status!=='success'||departureTime>=4.2)){wasResult=true;release();if(document.pointerLockElement)document.exitPointerLock?.();hud.showResult(run.result);marker.hidden=true;}
 }
 function reset(){
   const difficulty=run.difficulty;
   Object.assign(run,createRun({difficulty}));run.message='回声：重新集结。先前往商场终端。';player=copy(mission.spawn);yaw=player.yaw;pitch=0;eyeY=player.y+NAV.eye;
   Object.assign(ally,copy(mission.teammate),{health:100,alert:0,cooldown:0,moving:false});
   enemies.forEach((e,i)=>Object.assign(e,copy(mission.enemies[i]),{health:mission.enemies[i].health,alert:0,seen:0,seesPlayer:false,seesAlly:false,cooldown:1,think:0,patrolAt:0,routeAt:1,moving:false,
     state:'patrol',reload:0,ammo:enemyType(e).clip,burst:0,repath:0,tacticalRoute:null,tacticalAt:1,lastKnown:null,target:null,returnToPatrol:false}));
   trail=[copy(player)];trailAt=routeProgress=0;noise=null;hitTime=0;wasResult=false;release();input.ads=input.crouch=false;
   motion=createMobility();liftRide=null;departureTime=0;departureStart=null;extractionChoice=0;pickups.length=0;world.reset?.();
   for(const p of mission.pickups||[]){p.taken=false;pickupTaken.delete(p.id);}
   bonusProgress.value=0;hurtSource=null;grenadeFlight=null;meleeAnim=throwAnim=0;lookDelta={x:0,y:0};heartbeatClock=0;
   cameraFx.reset?.();worldFx.reset?.();shownHints.clear();
   routes[2]=extractionRoutes[0];lastRepath=0;
   hud.clearResult?.();hud.setPaused(false);syncVisibility(true);syncCamera(1);updateHUD();
 }
 return {mission,nav,run,enemies,ally,routes,viewmodel,world,hud,
   get player(){return {...player,yaw,pitch,airHeight:motion.height,sprinting:motion.sprinting};},get mobility(){return {...motion};},
   get guide(){return waypoint;},get liftRide(){return liftRide;},action:act,pause,reset,
   // An ordinary debug input adapter, used by browser tests to send the same
   // stick/look actions as touch. It cannot change health or complete goals.
   input(move){if(!run.paused){input.x=clamp(move.x||0,-1,1);input.y=clamp(move.y||0,-1,1);}},look,
   dispose(){abort.abort();release();ctx.dynamic.splice(ctx.dynamic.indexOf(dynamic),1);ctx.afterRender.splice(ctx.afterRender.indexOf(draw),1);hud.dispose();world.dispose();viewmodel.dispose();audio.dispose();cameraFx.dispose();worldFx.dispose();marker.remove();},
 };
}
