import * as THREE from 'three';
import { loadPeopleAssets } from '../render/people-asset.js';
import { createExtractionVehicle } from './extraction-vehicles.js';

const color={friendly:0x72d9e7,enemy:0xed9a70,objective:0xeec27b};
function sign(text,ink='#e9d7aa'){
 const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d');
 g.fillStyle='#18232b';g.fillRect(0,0,256,128);g.strokeStyle=ink;g.lineWidth=5;g.strokeRect(6,6,244,116);
 g.fillStyle=ink;g.textAlign='center';g.font='600 31px -apple-system, sans-serif';g.fillText(text,128,61);g.font='14px monospace';g.fillText('YUNLAN / OPS',128,91);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t});
}
function box(group,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);return m;}
export async function createCombatWorld(app,mission,viewmodel,nav){
 const root=new THREE.Group();root.name='封锁行动战术物件';app.scene.add(root);
 const owned=[],props=[],actors=[],ownedGeometries=new Set(),ownedTextures=new Set();
 const metal=new THREE.MeshStandardMaterial({color:'#52616a',metalness:.72,roughness:.5});
 const dark=new THREE.MeshStandardMaterial({color:'#243039',metalness:.35,roughness:.65});
 const brass=new THREE.MeshStandardMaterial({color:'#dbb372',metalness:.65,roughness:.35});
 const rubber=new THREE.MeshStandardMaterial({color:'#151a20',roughness:.95});
 owned.push(metal,dark,brass,rubber);
 function propAt(p){const g=new THREE.Group();g.position.set(p.x,p.y,p.z);g.userData.floor=p.floor;root.add(g);props.push(g);return g;}
 for(const c of mission.cover){
   const g=propAt(c),mat=c.style==='cargo'?app.ctx.mats.base.wood:dark;
   box(g,c.w,c.height,c.d,0,c.height/2,0,mat);
   for(const x of [-1,1])for(const z of [-1,1])box(g,.06,c.height+.03,.06,x*(c.w/2-.04),c.height/2,z*(c.d/2-.04),metal);
   for(const y of [.14,c.height-.14]){box(g,c.w+.035,.07,c.d+.035,0,y,0,metal);}
   for(const x of [-c.w*.25,c.w*.25]){box(g,.18,.14,.055,x,c.height*.56,c.d/2+.03,brass);box(g,.04,.16,.03,x,c.height*.53,c.d/2+.07,rubber);}
   const label=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(c.w*.75,1.05),.45),sign(c.style==='luggage'?'云澜酒店':'维护设备'));label.position.set(0,c.height*.8,c.d/2+.03);g.add(label);owned.push(label.material);
 }
 const objectiveProps=[...mission.objectives.slice(0,2),...mission.extractions].map((p,i)=>{
   const g=propAt(p);
   g.userData.id=p.id;
   if(p.prop==='terminal'){
     box(g,.56,1.15,.38,0,.575,0,dark);box(g,.8,.08,.6,0,.06,0,metal);
     const s=new THREE.Mesh(new THREE.PlaneGeometry(.64,.45),sign('访问终端','#95e3ec'));s.position.set(0,1.32,.23);s.rotation.x=-.18;g.add(s);owned.push(s.material);
     box(g,.76,.54,.08,0,1.32,.16,metal);
   } else if(p.prop==='case'){
     box(g,.95,.3,.6,0,.9,0,dark);box(g,1.25,.08,.85,0,.7,0,metal);
     for(const x of [-.48,.48])box(g,.06,.7,.6,x,.35,0,metal);
     for(const x of [-.3,.3])box(g,.1,.08,.05,x,.94,.32,brass);
     box(g,.3,.045,.045,0,1.1,0,metal);
     const s=new THREE.Mesh(new THREE.PlaneGeometry(.6,.18),sign('情报箱'));s.position.set(0,.9,.308);g.add(s);owned.push(s.material);
   }
   if(p.vehicle){
     const marker=new THREE.Mesh(new THREE.PlaneGeometry(1.45,.68),sign(p.vehicle.kind==='helicopter'?'直升机接应':'接应车辆','#a6e4d4'));
     marker.position.set(0,1.3,0);g.add(marker);owned.push(marker.material);
     box(g,.075,1.4,.075,-.65,.7,0,metal);box(g,.075,1.4,.075,.65,.7,0,metal);
   }
   const ring=new THREE.Mesh(new THREE.RingGeometry(p.radius*.72,p.radius*.76,48),new THREE.MeshBasicMaterial({color:i>=2?0x75d4d4:color.objective,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));
   ring.rotation.x=-Math.PI/2;ring.position.y=.045;g.add(ring);owned.push(ring.material);g.userData.ring=ring;return g;
 });
 root.traverse(o=>{if(o.geometry)ownedGeometries.add(o.geometry);});
 for(const m of owned)if(m.map)ownedTextures.add(m.map);
 const vehicles=mission.extractions.map(exit=>({exit,model:createExtractionVehicle(exit)}));
 for(const v of vehicles)root.add(v.model.root);
 const supplies=new Map();
 for(const e of mission.enemies){
   const group=new THREE.Group();group.visible=false;root.add(group);
   const crate=box(group,.48,.22,.3,0,.15,0,dark);ownedGeometries.add(crate.geometry);
   const strap=box(group,.08,.23,.32,0,.15,0,brass);ownedGeometries.add(strap.geometry);
   const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(.08,0),new THREE.MeshBasicMaterial({color:color.friendly}));beacon.position.y=.55;group.add(beacon);
   ownedGeometries.add(beacon.geometry);owned.push(beacon.material);
   supplies.set(e.id,{group,beacon,active:false,floor:e.floor});
 }
 const people=await loadPeopleAssets(2);
 for(const [i,record] of [mission.teammate,...mission.enemies].entries()){
   const ally=i===0,asset=people[0];
   const g=new THREE.Group();g.name=`${ally?'队友':'敌人'}-${record.id}`;root.add(g);
   const mat=asset.material.clone();mat.color.set(ally?'#adbfc7':'#a5a2a0');owned.push(mat);
   const body=new THREE.Mesh(asset.geometry,mat);body.frustumCulled=false;body.updateMorphTargets();g.add(body);
   // Shared real textured model; a visible armband identifies factions without
   // revealing an unseen character through the venue walls.
   const band=new THREE.Mesh(new THREE.TorusGeometry(.115,.028,6,12),new THREE.MeshStandardMaterial({color:ally?color.friendly:color.enemy,emissive:ally?color.friendly:color.enemy,emissiveIntensity:.15}));
   band.position.set(.26,1.3,0);band.rotation.x=Math.PI/2;g.add(band);owned.push(band.material);
   ownedGeometries.add(band.geometry);
   const weapon=viewmodel.createWorldWeapon?.(ally||record.type!=='scout'?'rifle':'pistol');
   if(weapon){weapon.position.set(.22,.99,.12);weapon.rotation.x=.12;g.add(weapon);}
   const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.1,0),new THREE.MeshBasicMaterial({color:ally?color.friendly:color.enemy}));marker.position.y=2.08;g.add(marker);owned.push(marker.material);
   ownedGeometries.add(marker.geometry);
   if(!ally){
     const vest=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshStandardMaterial({color:record.type==='heavy'?'#48574b':record.type==='assault'?'#4e4840':'#535d62',roughness:.9}));
     vest.position.set(0,1.13,.02);vest.scale.set(record.type==='heavy'?.36:.31,.36,.2);g.add(vest);owned.push(vest.material);ownedGeometries.add(vest.geometry);
     if(record.type==='heavy'){
       const helmet=new THREE.Mesh(new THREE.SphereGeometry(.23,12,8,0,Math.PI*2,0,Math.PI*.68),vest.material);
       helmet.position.set(0,1.67,0);g.add(helmet);ownedGeometries.add(helmet.geometry);
     }
   }
   const flash=new THREE.Mesh(new THREE.SphereGeometry(.055,5,4),new THREE.MeshBasicMaterial({color:'#ffddb0'}));
   flash.position.set(.22,1.12,.71);flash.visible=false;g.add(flash);ownedGeometries.add(flash.geometry);owned.push(flash.material);
   actors.push({id:record.id,group:g,body,asset,marker,weapon,ally,cycle:0,flash,flashLife:0});
 }
 // A small reused line pool gives legible shot feedback without particle
 // allocations, physics casings or transparent overdraw on the phone.
 const lines=Array.from({length:10},()=>{
   const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);ownedGeometries.add(geo);
   const material=new THREE.LineBasicMaterial({color:0xffd293,transparent:true,opacity:.65});const line=new THREE.Line(geo,material);line.visible=false;line.frustumCulled=false;root.add(line);owned.push(material);return {line,life:0};
 });let cursor=0;
 const guide=new THREE.Mesh(new THREE.RingGeometry(.25,.45,24),new THREE.MeshBasicMaterial({color:0x8cdee9,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));guide.rotation.x=-Math.PI/2;root.add(guide);owned.push(guide.material);
 ownedGeometries.add(guide.geometry);
 return {
  actors,root,vehicles,
  muzzle(id){const actor=actors.find(a=>a.id===id);if(actor){actor.flash.visible=true;actor.flashLife=.13;}},
  dropSupply(enemy){const s=supplies.get(enemy.id);if(s){s.active=true;s.floor=enemy.floor;s.group.position.set(enemy.x,enemy.y,enemy.z);s.group.visible=true;}},
  takeSupply(id){const s=supplies.get(id);if(s){s.active=false;s.group.visible=false;}},
  departureView(id,time){return vehicles.find(v=>v.exit.id===id)?.model.departureView(time);},
  reset(){for(const s of supplies.values()){s.active=false;s.group.visible=false;}for(const v of vehicles)v.model.reset();},
  tracer(a,b,hostile=false){const entry=lines[cursor++%lines.length];entry.line.geometry.attributes.position.setXYZ(0,a.x,a.y,a.z);entry.line.geometry.attributes.position.setXYZ(1,b.x,b.y,b.z);entry.line.geometry.attributes.position.needsUpdate=true;entry.line.material.color.set(hostile?0xf3a487:0xffe3a1);entry.line.visible=true;entry.life=.075;},
  update(dt,states,player,stage,time,waypoint,extraction={}){
   for(const e of lines){e.life-=dt;e.line.visible=e.life>0;}
   for(const g of props)g.visible=Math.abs((nav.floors.get(g.userData.floor)?.y??0)-player.y)<9;
   objectiveProps.forEach((g,i)=>{g.userData.ring.visible=stage<2?i===stage:g.userData.id===extraction.extractionId;g.userData.ring.material.opacity=.36+Math.sin(time*2.8)*.15;});
   for(const v of vehicles){
     const selected=v.exit.id===extraction.extractionId;
     v.model.root.visible=selected&&extraction.departing||Math.abs(v.exit.y-player.y)<18;
     v.model.update(dt,{ready:stage>=2,progress:selected?extraction.extractionProgress:0,departing:selected&&extraction.departing,time:extraction.departureTime||0});
   }
   for(const s of supplies.values()){s.group.visible=s.active&&s.floor===player.floor;s.beacon.rotation.y+=dt*1.5;s.beacon.position.y=.5+Math.sin(time*3)*.05;}
   guide.visible=!!waypoint&&Math.abs(waypoint.y-player.y)<3.5;
   if(waypoint)guide.position.set(waypoint.x,waypoint.y+.06,waypoint.z);
   for(let i=0;i<actors.length;i++){
     const model=actors[i],a=states[i];if(!a)continue;
     model.group.visible=a.health>0&&Math.abs(a.y-player.y)<8&&Math.hypot(a.x-player.x,a.z-player.z)<65;
     if(extraction.departing&&model.ally&&extraction.departureTime>.6)model.group.visible=false;
     model.group.position.set(a.x,a.y-.01,a.z);model.group.rotation.y=a.yaw||0;
     model.marker.visible=model.ally||a.alert>0;model.marker.scale.setScalar(model.ally?.8:.65);
     model.marker.material.color.set(a.reload>0?0xf7dc79:model.ally?color.friendly:color.enemy);
     model.flashLife=Math.max(0,model.flashLife-dt);model.flash.visible=model.flashLife>0;
     model.cycle+=dt*(a.moving?1.15:0);const phase=(model.cycle/model.asset.cycleSeconds%1)*model.asset.poses,k=Math.floor(phase);
     model.body.morphTargetInfluences.fill(0);model.body.morphTargetInfluences[k]=1-(phase-k);model.body.morphTargetInfluences[(k+1)%model.asset.poses]=phase-k;
     if(!a.moving)model.body.morphTargetInfluences.fill(0);
   }
  },
  dispose(){root.removeFromParent();for(const v of vehicles)v.model.dispose();for(const m of owned)m.dispose();for(const t of ownedTextures)t.dispose();for(const g of ownedGeometries)g.dispose();},
 };
}
