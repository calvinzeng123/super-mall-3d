import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { makeSignAtlas, FONT_CN, FONT_EN } from '../textures.js';
import { rect, rectPoly, lrectPoly, pointInPoly, polysOverlap } from '../../layout/geom.js';
import { addCutSurfaceSlab } from './surface-shapes.js';
import { sampleMetroService } from '../metro-service.js';

const labels={transfer:['十字换乘厅','7 ↔ 12 · TRANSFER'],exit:['出站 · A–H 口','EXIT VIA B1 · A–H'],alight:['下车专用 · 换乘 / 出站','ALIGHT ONLY · TRANSFER / EXIT'],board:['上车专用 · 请先下后上','BOARDING ONLY'],
  '7':['7 号线 · 东西向','LINE 7 · EAST / WEST'],'12':['12 号线 · 南北向','LINE 12 · NORTH / SOUTH'],
  '7-to':['↑ 7 号线 · B2','TO LINE 7'],'12-to':['↓ 12 号线 · B4','TO LINE 12'],lift:['无障碍电梯','ACCESSIBLE LIFT'],
  '7--1':['7 号线 · 往云澜里','LINE 7 · YUNLAN LANE'],'7-1':['7 号线 · 往星湾','LINE 7 · XINGWAN'],
  '12--1':['12 号线 · 往北环新城','LINE 12 · NORTH RING'],'12-1':['12 号线 · 往南站','LINE 12 · SOUTH STATION']};
function signage(){
  const atlas=makeSignAtlas(Object.entries(labels).map(([id,[cn,en]])=>({id,draw:(g,x,y,w,h)=>{
    g.fillStyle='#163239';g.fillRect(x,y,w,h);g.fillStyle=id.startsWith('12')?'#5fc7df':id.startsWith('7')?'#fa9b9c':'#f1f4ed';
    g.textAlign='center';g.textBaseline='middle';g.font=`600 34px ${FONT_CN}`;g.fillText(cn,x+w/2,y+h*.37,w-20);
    g.font=`500 17px ${FONT_EN}`;g.fillStyle='#e3e8df';g.fillText(en,x+w/2,y+h*.77,w-20);
  }})));
  return {atlas,material:new THREE.MeshBasicMaterial({map:atlas.texture,toneMapped:false,side:THREE.DoubleSide})};
}
function panel(B,S,atlas,key,x,y,z,w=6,nz=1){
  B.get('metal').box(x,y,z,w+.12,w/4+.1,.09,'#263d40');
  S.placeN(x,y,z+nz*.051,w,w/4,0,nz,atlas.cell(key));
}
function arrow(B,x,y,z,angle,color){
  const c=Math.cos(angle),s=Math.sin(angle),p=(u,v)=>({x:x+u*c-v*s,y,z:z+u*s+v*c});
  B.get('extSatin').bar(p(-.65,0),p(.6,0),.045,color);
  B.get('extSatin').bar(p(.6,0),p(.12,-.38),.045,color);B.get('extSatin').bar(p(.6,0),p(.12,.38),.045,color);
}
export function tunnelSkin(line,elev,sign,trackSide,upper=false){
  const x0=sign*66,x1=sign*line.tunnelEnd,r=3.2,cy=elev+1.5,cz=trackSide*line.track;
  const pos=[],uv=[],n=20,start=upper?0:Math.PI;
  for(let i=0;i<n;i++){
    const a=start+i/n*Math.PI,b=start+(i+1)/n*Math.PI;
    const vertices=[[x0,a],[x1,a],[x1,b],[x0,a],[x1,b],[x0,b]];
    for(const [x,t]of vertices){pos.push(x,cy+Math.sin(t)*r,cz+Math.cos(t)*r);uv.push(x,t*r);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  return g;
}
function tunnels(ctx,line,lv,B,G){
  const tops=[];
  const source=ctx.mats.base.metroTunnel||ctx.mats.base.concrete;
  const mat=source.clone();mat.side=THREE.DoubleSide;mat.vertexColors=false;mat.color.set('#b7b8b2');
  for(const s of [-1,1]){
    for(const e of [-1,1])for(const upper of [false,true]){
      const mesh=new THREE.Mesh(tunnelSkin(line,lv.elev,e,s,upper),mat);mesh.name=`M-${line.id}-tunnel-${s}-${e}-${upper?'crown':'invert'}`;mesh.receiveShadow=true;G.add(mesh);if(upper)tops.push(mesh);
    }
    const y=lv.elev,z=s*line.track;
    B.get('metroTunnel').box(0,y-1.35,z,line.tunnelEnd*2,.3,3.1,'#a3aaa6');
    for(const gauge of [-.7175,.7175])B.get('metal').box(0,y-1.17,z+gauge,line.tunnelEnd*2,.18,.08,'#939ea4');
    for(let x=-line.tunnelEnd;x<=line.tunnelEnd;x+=1.3)B.get('metroTunnel').box(x,y-1.24,z,.22,.12,2.35,'#c3c4ba');
    B.get('metal').box(0,y+3.7,z,line.tunnelEnd*2,.08,.11,'#555e62');
    for(let x=-line.tunnelEnd;x<=line.tunnelEnd;x+=12){
      if(Math.abs(x)<66)continue;
      B.get('metal').bar({x,y:y+3.8,z:z-1.5},{x,y:y+3.8,z:z+1.5},.035,'#637274');
      B.get('glowSoft').box(x,y+2.3,z+s*2.95,.6,.12,.04,'#e7efda');
      B.get('metal').box(x,y+.2,z+s*2.9,1.8,.08,.22,'#515a60');
    }
  }
  return tops;
}
export function buildInterchangeCeiling(ctx,b,lv,L){
  const group=new THREE.Group(),B=new BatchSet(ctx.mats.base),y=lv.elev+4.6;
  const levels=ctx.layout?.levels||Object.values(ctx.lvById);
  const holes=levels.filter(l=>l.building==='M'&&l.elev>=lv.elev-.01&&l.elev<=lv.elev+8)
    .flatMap(l=>[...l.voids.map(v=>v.poly),...l.rooms.filter(r=>r.openStair).flatMap(r=>r.polys)]);
  addCutSurfaceSlab(B,'satin',lv.outline,holes,y+.05,.08,'#cbd4d6');
  const bounds=new THREE.Box2();for(const p of lv.outline)bounds.expandByPoint(new THREE.Vector2(...p));
  for(let x=Math.ceil(bounds.min.x/6)*6+1;x<bounds.max.x-2;x+=6)for(let z=Math.ceil(bounds.min.y/6)*6+1;z<bounds.max.y-2;z+=6){
    const poly=rectPoly(rect(x-1.8,z-.09,x+1.8,z+.09));
    if(!poly.every(p=>pointInPoly(p,lv.outline))||holes.some(h=>polysOverlap(poly,h)))continue;
    B.get('glowSoft').box(x,y-.015,z,3.6,.035,.16,'#edf4ec');
  }
  B.flush(group);group.name=`${lv.id}-cutaway-ceiling`;group.visible=false;L.group.add(group);return {group,y,L};
}
function platform(ctx,line,lv,L,signs){
  const B=L.batch,S=new SignBatch(),P=line.platform;
  const y=lv.elev;
  for(const p of line.platforms){
    const r=p.rect,cz=(r.z0+r.z1)/2;
    // The actual floor body (including its shafts) is built from layout slabs.
    for(const z of [r.z0+.5,r.z1-.5])B.get('extSatin').box(0,y+.01,z,114,.018,.28,'#dfbb58');
    for(const x of [-56,56])panel(B,S,signs.atlas,p.role==='board'?'board':'alight',x,y+3.05,cz,5.2);
    for(const x of [-8,8])panel(B,S,signs.atlas,p.role==='board'?`${line.id}-${Math.sign(cz)}`:line.id,x,y+3.1,cz,5.2);
    for(let x=-54;x<=54;x+=9){if(Math.abs(x)<5)continue;arrow(B,x,y+.035,cz+(p.role==='alight'?3.9:2.8),x<0?Math.PI:0,p.role==='alight'?'#41887f':line.color);}
  }
  // Ceramic outer walls sit behind the boarding platforms, not across either track.
  for(const s of [-1,1]){
    B.get('metroTile').box(0,y+2.3,s*20.8,132,4.6,.28,'#e5ece8');
    B.get('extSatin').box(0,y+2.6,s*20.64,132,.23,.025,line.color);
    for(const x of [-42,-18,18,42])panel(B,S,signs.atlas,line.id,x,y+2.2,s*20.63,5,-s);
  }
  for(const e of [-1,1])for(const p of line.platforms){const r=p.rect;B.get('metroTile').box(e*60,y+2.3,(r.z0+r.z1)/2,.28,4.6,r.z1-r.z0,'#dde5e1');}
  S.flush(L.base,signs.material);
}
function transfer(ctx,b,signs){
  const L=ctx.levels[b.interchange.transferLevel],lv=L.lv,B=L.batch,S=new SignBatch(),y=lv.elev;
  for(let i=0;i<lv.outline.length;i++){
    const a=lv.outline[i],c=lv.outline[(i+1)%lv.outline.length];
    B.get('metroTile').bar({x:a[0],y:y+2.3,z:a[1]},{x:c[0],y:y+2.3,z:c[1]},.22,'#d7e3df');
    // Full-height wall in world coordinates; no wall crosses the middle of the cross.
    B.get('metroTile').box((a[0]+c[0])/2,y+2.3,(a[1]+c[1])/2,Math.hypot(c[0]-a[0],c[1]-a[1]),4.6,.24,'#e5e9e1',-Math.atan2(c[1]-a[1],c[0]-a[0]));
  }
  for(const x of [-9,9])for(const z of [-9,9]){
    B.get('metroTile').cyl(x,y,z,.52,4.6,'#e2e8df',16);B.get('extSatin').cyl(x,y+1.9,z,.525,.45,x<0?'#b43d42':'#187b9f',16);
  }
  for(const x of [-18,18]){panel(B,S,signs.atlas,'7-to',x,y+3.05,0,6);panel(B,S,signs.atlas,'12-to',x,y+3.05,0,6,-1);}
  panel(B,S,signs.atlas,'transfer',0,y+3.1,-10,6.5);panel(B,S,signs.atlas,'transfer',0,y+3.1,10,6.5,-1);
  for(let n=7;n<46;n+=6){for(const s of [-1,1]){arrow(B,s*n,y+.03,5.3,s>0?0:Math.PI,'#b43d42');arrow(B,5.3,y+.03,s*n,s>0?Math.PI/2:-Math.PI/2,'#187b9f');}}
  S.flush(L.base,signs.material);
  return buildInterchangeCeiling(ctx,b,lv,L);
}
export function buildMetroInterchangePlatforms(ctx,factories){
  const b=ctx.bById.M,signs=signage(),ceilings=[transfer(ctx,b,signs)],services=[];
  for(const line of b.interchange.lines){
    const L=ctx.levels[line.level],lv=L.lv,G=new THREE.Group();G.name=`M-line-${line.id}`;G.rotation.y=-line.frame.a;L.base.add(G);
    const local={...L,base:G,batch:new BatchSet(ctx.mats.base)};
    platform(ctx,line,lv,local,signs);const crowns=tunnels(ctx,line,lv,local.batch,G);
    for(const s of [-1,1]){
      const tr=factories.train(ctx,line,lv,local,s);
      const inner=factories.screenDoors(ctx,{...line,psdZ:s*6},lv,local,s),outer=factories.screenDoors(ctx,{...line,psdZ:s*9.2},lv,local,-s);
      services.push({line,lv,L,train:tr,inner,outer});
    }
    local.batch.flush(G);ceilings.push(buildInterchangeCeiling(ctx,b,lv,L));
    ctx.dynamic.push({name:`metro-tunnel-${line.id}`,update(_dt,_t,a){for(const crown of crowns)crown.visible=a.camera.position.y<lv.elev+4.5;}});
  }
  let last=0,offset=0;ctx.metroSync=t=>{offset=t-last;};
  ctx.metroServices=services;
  ctx.dynamic.push({name:'metro',update(_dt,time,app){last=time;
    for(const c of ceilings)c.group.visible=!!(c.L.base.visible&&c.L.group.visible)&&app.camera.position.y<c.y-.05;
    for(const service of services){
      const {line,train:tr,inner,outer,L}=service;
      if(!L.base.visible||!L.group.visible)continue;
      const q=sampleMetroService(time+offset,line.phase,tr.dir);tr.group.visible=q.visible;tr.group.position.x=q.x;
      for(const [doors,factor,travel]of [[tr,q.alight,.64],[tr.board,q.board,.64],[inner,q.alight,.98],[outer,q.board,.98]]){doors.left.position.x=-travel*factor;doors.right.position.x=travel*factor;}
      service.state=q;
    }
  }});
  return ceilings;
}
