import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { addTrees, streetLamp } from './props.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';

/** District-scale wayfinding, planted row dividers and open gate gantries.
 * Stalls and cars are drawn by the existing sharedSurfaceParking renderer. */
export function buildWestParkingDetails(ctx) {
  const plan=ctx.layout.site.westParking;if(!plan)return;
  const group=new THREE.Group();group.name='west-public-parking-details';
  const B=new BatchSet(ctx.mats.base),trees=[];
  const sign=(x,y,z,title,subtitle,w=7,h=1.6,ry=0)=>{
    const c=makeCanvas(1024,256),g=c.getContext('2d');
    g.fillStyle='#254b46';g.fillRect(0,0,1024,256);g.fillStyle='#ecdebc';g.fillRect(0,0,18,256);
    g.textAlign='center';g.fillStyle='#fff9e9';g.font=`600 64px ${FONT_CN}`;g.fillText(title,512,100,980);
    g.fillStyle='#c1d7c9';g.font=`36px ${FONT_EN}`;g.fillText(subtitle,512,195,970);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),ctx.mats.sign(canvasTexture(c,{clamp:true})));
    mesh.position.set(x,y,z);mesh.rotation.y=ry;group.add(mesh);
  };
  for(const island of plan.islands) {
    const r=island.rect,x=island.x,z=island.z;
    B.get('stone').box(x,.13,z,r.x1-r.x0,.26,r.z1-r.z0,'#c9c9b6');
    B.get('ext').box(x,.29,z,r.x1-r.x0-.18,.12,r.z1-r.z0-.18,'#65775d');
    trees.push({x,y:.35,z,s:.66,kind:'round'});
    for(const dx of [-1.3,1.3])B.get('ext').sphere(x+dx,.5,z,.35,'#7f935d',.25,.4);
    if(trees.length%3===0)streetLamp(B,x+1.8,z,.3,[0,-1],5.5);
  }
  for(const gate of plan.gates) {
    // Columns and kiosks stay outside the seven-metre carriageway. No closed boom blocks exploration.
    for(const dz of [-gate.width/2-.75,gate.width/2+.75]) {
      B.get('extMetal').box(gate.x,2.5,gate.z+dz,.25,5,.25,'#49645a');
      B.get('glowSoft').box(gate.x+.14,1.2,gate.z+dz,.04,.8,.13,'#9bddb8');
    }
    B.get('extMetal').box(gate.x,5,gate.z,.3,.2,gate.width+1.8,'#49645a');
    sign(gate.x+.17,4.1,gate.z,`西侧停车 · ${gate.name}`,'IN  ←     P     →  OUT',7.8,1.3,Math.PI/2);
    for(const dz of [-2,2]) {
      B.get('ext').box(gate.x-4,.05,gate.z+dz,2,.02,.12,'#e5dfb9');
      for(const k of [-1,1])B.get('ext').box(gate.x-4+(dz<0?-1:1)*.8,.05,gate.z+dz+k*.24,.7,.02,.11,'#e5dfb9',k*(dz<0?-.65:.65));
    }
  }
  sign(-438,4.8,-248,'云澜汇 · 西侧公共停车',`${plan.stallCount} SPACES  ·  EV ${plan.evCount}  ·  B1 / B2`,15,2.7);
  for(const x of [-444,-432])B.get('extMetal').box(x,2.3,-248,.2,4.6,.2,'#49645a');
  for(const z of [-205,-179,-35])sign(-426.9,2.7,z,'步行通道 → 一期 / 酒店','MALL · HOTEL · UNDERGROUND PARKING',5,.9,Math.PI/2);
  B.flush(group);addTrees(group,ctx.mats,trees,913);ctx.site.group.add(group);
}
