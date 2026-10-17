// The permanent residential shell uses the same metre-scale plans as the GLBs.
// Only a selected floor's lightweight dwelling/stair shell is hidden on detail load;
// floor plates, lift shafts, shared circulation and fire lobbies remain visible.
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { toW, unionOutline, mergeSegments, subtractInterval } from '../../layout/geom.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { planter, bench } from './props.js';

const C = { wall: '#ede9df', trim: '#77766b', stone: '#e9e3d6', timber: '#b89770', green: '#4c6356' };
const edges = r => [
  [[r.x0,r.z0],[r.x1,r.z0]], [[r.x1,r.z0],[r.x1,r.z1]],
  [[r.x1,r.z1],[r.x0,r.z1]], [[r.x0,r.z1],[r.x0,r.z0]],
];

function segment(B,key,a,b,y0,y1,thickness,color) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  if(length<.002||y1-y0<.002)return;
  B.get(key).box((a[0]+b[0])/2,(y0+y1)/2,(a[1]+b[1])/2,length,y1-y0,thickness,color,-Math.atan2(dz,dx));
}
function wallPart(B,w,key,a,b,y0,y1,color,depth=w.thickness||.18) {
  const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],length=Math.hypot(dx,dz);
  const p=t=>[w.a[0]+dx*t/length,w.a[1]+dz*t/length];
  segment(B,key,p(a),p(b),y0,y1,depth,color);
}
function openingWall(B,w,y,height,glass=true) {
  const length=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
  const openings=w.openings||(w.door?[{...w.door,type:'door',bottom:0,top:2.5}]:[]);
  const spans=openings.map(o=>[Math.max(0,o.at-o.width/2),Math.min(length,o.at+o.width/2)]);
  for(const [a,b] of spans.reduce((ivs,s)=>subtractInterval(ivs,s),[[0,length]]))wallPart(B,w,'extSatin',a,b,y,y+height,C.wall);
  for(let i=0;i<openings.length;i++) {
    const o=openings[i],[a,b]=spans[i];
    wallPart(B,w,'extSatin',a,b,y,y+(o.bottom||0),C.wall);
    wallPart(B,w,'extSatin',a,b,y+o.top,y+height,C.wall);
    for(const t of [a+.022,b-.022])wallPart(B,w,'extMetal',t-.022,t+.022,y+(o.bottom||0),y+o.top,C.trim,.075);
    for(const h of [o.bottom||0,o.top])wallPart(B,w,'extMetal',a,b,y+h,y+h+.035,C.trim,.075);
    if(o.type==='window'&&glass) {
      wallPart(B,w,'glassTint',a+.04,b-.04,y+o.bottom+.035,y+o.top-.035,'#ffffff',.026);
      const divisions=Math.max(1,Math.ceil((b-a)/1.65));
      for(let k=1;k<divisions;k++)wallPart(B,w,'extMetal',a+(b-a)*k/divisions-.018,a+(b-a)*k/divisions+.018,y+o.bottom,y+o.top,C.trim,.075);
    } else if(o.style==='sliding') {
      // Preserve the actual three-metre passage between parked sliding leaves.
      const parked=(o.clear_intervals||[]).reduce((ivs,s)=>subtractInterval(ivs,s),[[a,b]]);
      for(const [p,q] of parked)wallPart(B,w,'glassTint',p+.03,q-.03,y+.05,y+o.top-.04,'#ffffff',.028);
    }
  }
}
function railing(B,a,b,y,glassKey='glass') {
  segment(B,glassKey,a,b,y+.14,y+1.08,.028,'#ffffff');
  segment(B,'extMetal',a,b,y+1.1,y+1.15,.055,C.trim);
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(length/2.5));
  for(let i=0;i<=n;i++)B.get('extMetal').box(a[0]+(b[0]-a[0])*i/n,y+.59,a[1]+(b[1]-a[1])*i/n,.045,1.12,.045,C.trim);
}
function rectFinish(B,r,y,key='stone',color=C.stone) {
  B.get(key).box((r.x0+r.x1)/2,y-.02,(r.z0+r.z1)/2,r.x1-r.x0,.04,r.z1-r.z0,color);
}
function stairShell(B,core,height) {
  for(const s of core.stairs.filter(s=>!s.continuous))for(const [a,z] of edges(s.rect)) {
    const south=Math.abs(a[1]-s.rect.z1)<.01&&Math.abs(z[1]-s.rect.z1)<.01;
    const openings=south?[{at:Math.abs((s.door.x0+s.door.x1)/2-a[0]),width:s.door.x1-s.door.x0,type:'door',bottom:0,top:2.5}]:[];
    openingWall(B,{a,b:z,thickness:.2,openings},0,height-.04,false);
  }
}

/** World-positioned geometry is shared between the identical upper storeys. */
export function buildResidentialLevelShells(ctx,b,levels,materials,exterior) {
  const result=new Map(),typical=levels.find(l=>l.units.some(u=>u.residence.prototype));
  if(!typical)return result;
  const template=new THREE.Group(),B=new BatchSet(materials);
  for(const u of typical.units)B.frame(u.frame,()=>{
    for(const w of u.residence.facadeWalls.filter(w=>w.type==='exterior'))openingWall(B,w,0,typical.height-.04);
    const r=u.residence.balcony;
    for(const [a,z] of [edges(r)[1],edges(r)[2],edges(r)[3]])railing(B,a,z,0,'glassTint');
    // Three batches per distant storey; the original textured finish comes from
    // the detail GLB when selected. Geometry is shared across all 29 storeys.
    rectFinish(B,{x0:0,z0:0,x1:u.residence.width,z1:r.z0},0,'extSatin','#d9c9ad');
    rectFinish(B,r,-.02,'extSatin','#c8c9bf');
    // Thin edge detail follows the actual dwelling wing, never the enclosing box.
    for(const [a,z] of edges({x0:0,z0:0,x1:u.residence.width,z1:r.z1}))segment(B,'extSatin',a,z,-.23,-.06,.13,'#b7b4a7');
  });
  B.frame(b.frame,()=>stairShell(B,typical.corePlan,typical.height));
  B.flush(template);
  for(const lv of levels.filter(l=>l.units.some(u=>u.residence.prototype))) {
    const group=template.clone();group.name=`${lv.id}-residential-lod`;group.position.y=lv.elev;
    group.userData={level:lv.id,kind:'residential-lod',prototypeSlots:lv.units.map(u=>u.residence.prototype)};
    exterior.add(group);result.set(lv.id,group);
  }
  for(const lv of levels.filter(l=>!l.units.length&&l.kind!=='roof')) {
    const group=new THREE.Group(),SB=new BatchSet(materials);
    SB.frame(b.frame,()=>stairShell(SB,lv.corePlan,lv.height));SB.flush(group);
    group.position.y=lv.elev;group.name=`${lv.id}-residential-core-lod`;
    group.userData={level:lv.id,kind:'residential-core-lod'};exterior.add(group);result.set(lv.id,group);
  }
  return result;
}

export function setResidentialDetailLevel(ctx,buildingId,levelId=null) {
  const record=ctx.hospitality?.buildings.get(buildingId);
  if(!record?.residentialShells)return;
  for(const [id,group] of record.residentialShells)group.visible=id!==levelId;
  record.detailLevel=levelId;
}

/** The open-gallery edges follow the real plate union, preserving light wells. */
export function residentialCommon(ctx,B,b,lv) {
  if(!lv.corePlan)return;
  const {corridor,liftLobby,stairVestibules}=lv.corePlan,y=lv.elev,h=lv.height;
  for(const r of [corridor,liftLobby,...stairVestibules])rectFinish(B,r,y);
  if(lv.elev>0) {
    for(const r of stairVestibules)for(const x of [r.x0,r.x1])segment(B,'extSatin',[x,r.z0],[x,r.z1],y,y+h-.12,.16,C.wall);
    // Exposed ends of the main gallery and the short open edges beside the 03 wing.
    for(const x of [corridor.x0,corridor.x1])railing(B,[x,corridor.z0],[x,corridor.z1],y);
    for(const [a,z] of [[-15,-8.8],[8.8,15]])railing(B,[a,-1.6],[z,-1.6],y);
    // Upper landing balcony behind the transparent lift core ends at the light well.
    railing(B,[-3.8,6.8],[3.8,6.8],y);
  }
  for(let x=-17.5;x<19;x+=5) {
    B.get('extMetal').box(x,y+h-.3,0,1.6,.08,.27,C.trim);
    B.get('glowSoft').box(x,y+h-.347,0,1.46,.024,.19,'#f4e3be');
  }
  for(const r of stairVestibules) {
    const cx=(r.x0+r.x1)/2;
    B.get('extMetal').box(cx,y+2.74,r.z1+.015,1.75,.28,.07,C.green);
    B.get('glowSoft').box(cx,y+2.74,r.z1+.057,1.53,.13,.022,'#d9edd5');
    // Wall-mounted fire equipment remains clear of the central passage.
    B.get('extSatin').box(r.x0+.28,y+.87,(r.z0+r.z1)/2,.23,1.22,.62,'#9e554b');
    B.get('glassTint').box(r.x0+.41,y+.98,(r.z0+r.z1)/2,.025,.8,.48,'#ffffff');
  }
}

export function residentialCrown(B,b,lv) {
  const y=lv.elev;
  for(const e of mergeSegments(unionOutline(lv.corePlan.upperPlate))) {
    segment(B,'extSatin',[e.x0,e.z0],[e.x1,e.z1],y,y+.78,.2,'#babaae');
    segment(B,'extMetal',[e.x0,e.z0],[e.x1,e.z1],y+.78,y+.86,.29,C.trim);
  }
  // Two compact machine enclosures sit above the glass shafts. Corner posts
  // follow the shaft boundaries; the north doors and entire waiting area stay
  // open below the 3.5 m transfer beams, including at the rooftop stop.
  for(const lift of lv.corePlan.lifts) {
    const r=lift.rect,w=r.x1-r.x0,d=r.z1-r.z0,x=lift.x,z=lift.z;
    for(const xx of [r.x0,r.x1])for(const zz of [r.z0,r.z1])B.get('extMetal').box(xx,y+1.775,zz,.1,3.55,.1,C.trim);
    for(const zz of [r.z0,r.z1])B.get('extMetal').box(x,y+3.52,zz,w+.14,.14,.13,C.trim);
    for(const xx of [r.x0,r.x1])B.get('extMetal').box(xx,y+3.52,z,.13,.14,d+.14,C.trim);
    B.get('extSatin').box(x,y+4.25,z,w+.12,1.4,d+.12,'#a3aaa1');
    B.get('extMetal').box(x,y+4.99,z,w+.24,.08,d+.24,C.trim);
    for(let yy=y+3.76;yy<y+4.83;yy+=.19)B.get('extMetal').box(x,yy,r.z0-.085,w-.36,.055,.035,C.trim);
  }
}

function label(ctx,group,F,text,x,y,z,width=2.8,angle=0,sub='',plane=null) {
  const c=makeCanvas(768,192),g=c.getContext('2d');
  g.fillStyle='#344c43';g.fillRect(0,0,768,192);g.fillStyle='#f4e9d3';g.textAlign='center';g.textBaseline='middle';
  g.font=`500 61px ${FONT_CN}`;g.fillText(text,384,sub?74:98,720);
  if(sub){g.font=`400 25px ${FONT_EN}`;g.fillText(sub,384,145,720);}
  const mat=ctx.mats.sign(canvasTexture(c,{clamp:true}));if(plane)mat.clippingPlanes=[plane];
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),mat),p=toW(F,x,z);
  m.position.set(p[0],y,p[1]);m.rotation.y=angle-F.a;m.name=`residential-sign-${text}`;group.add(m);
}

function lobbyFurniture(B,o,y) {
  const r=o.rect,x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2,w=r.x1-r.x0,d=r.z1-r.z0,h=o.height;
  if(o.type==='sofa') {
    B.get('wood').box(x,y+.16,z,w,.16,d,'#8b7255');
    B.get('satin').box(x,y+.39,z,w,.34,d,'#b7bca9');
    const longX=w>d;
    B.get('satin').box(longX?x:r.x0+.12,y+.68,longX?r.z0+.12:z,longX?w:.24,.45,longX?.24:d,'#96a28d');
    const n=Math.max(2,Math.round(Math.max(w,d)/.9));
    for(let i=0;i<n;i++) {
      const px=longX?r.x0+(i+.5)*w/n:x,pz=longX?z:r.z0+(i+.5)*d/n;
      B.get('satin').box(px,y+.58,pz,longX?w/n-.035:w-.05,.08,longX?d-.06:d/n-.035,'#c6c8b6');
    }
  } else if(o.type==='table'||o.type==='desk') {
    B.get('stone').box(x,y+h-.035,z,w,.07,d,'#e8dfc9');
    const reception=o.id==='reception-desk';
    if(reception) {
      B.get('wood').box(x,y+.5,z,w-.12,.95,d-.1,C.timber);
      for(let xx=r.x0+.12;xx<r.x1;xx+=.12)B.get('wood').box(xx,y+.52,r.z1-.015,.025,.78,.035,'#876b4b');
      B.get('glowSoft').box(x,y+.11,r.z1+.008,w-.14,.04,.028,'#fbe6bb');
      B.get('extMetal').box(r.x1-.6,y+h+.2,z,.42,.32,.04,'#3b4440');
    } else {
      for(const xx of [r.x0+.2,r.x1-.2])for(const zz of [r.z0+.18,r.z1-.18])B.get('wood').box(xx,y+(h-.07)/2,zz,.07,h-.07,.07,C.timber);
      B.get('wood').box(x,y+h+.025,z,.32,.035,.22,'#51665e');
      B.get('stone').cyl(x+.38,y+h,z,.08,.12,'#d3c5aa',10);
    }
  } else if(o.type==='chair') {
    const inset=.07;
    B.get('satin').box(x,y+.46,z,w-.025,.1,d-.025,'#a6b39e');
    for(const xx of [r.x0+inset,r.x1-inset])for(const zz of [r.z0+inset,r.z1-inset])B.get('wood').box(xx,y+.22,zz,.038,.44,.038,C.timber);
    const rear=o.facing==='N'||o.id.includes('-south')?r.z1-.045:r.z0+.045;
    B.get('satin').box(x,y+.73,rear,w-.025,.32,.07,'#899b83');
    for(const xx of [r.x0+inset,r.x1-inset])B.get('wood').box(xx,y+.59,rear,.036,.33,.036,C.timber);
  } else if(['mailbox','locker','cabinet','bookcase'].includes(o.type)) {
    B.get('wood').box(x,y+h/2,z,w,h,d,C.timber);
    const frontX=d>w,n=Math.max(2,Math.floor(Math.max(w,d)/(o.type==='mailbox'?.5:.75))),rows=o.type==='mailbox'?6:o.type==='locker'?4:4;
    for(let i=0;i<n;i++)for(let j=0;j<rows;j++) {
      const a=(i+.5)/n,bh=h/rows-.04,along=frontX?r.z0+a*d:r.x0+a*w,yy=y+(j+.5)*h/rows;
      if(o.type==='bookcase') {
        B.get('extSatin').box(frontX?r.x0-.005:along,yy,frontX?along:r.z1+.005,frontX?.035:w/n-.035,bh,frontX?d/n-.035:.035,'#5f5546');
        for(let k=0;k<4;k++)B.get('satin').box(frontX?r.x0-.025:along+(k-1.5)*.14,yy-.025,frontX?along+(k-1.5)*.14:r.z1+.04,frontX?.055:.095,bh*(.58+k*.07),frontX?.095:.055,['#ddd3b3','#7d937c','#b7846c','#d0bfa9'][k]);
      } else {
        B.get('extSatin').box(frontX?r.x0-.015:along,yy,frontX?along:r.z1+.015,frontX?.035:w/n-.035,bh,frontX?d/n-.035:.035,o.type==='locker'?'#b7bdad':'#d7d2c3');
        B.get('extMetal').box(frontX?r.x0-.04:along,yy,frontX?along:r.z1+.04,frontX?.025:.12,.025,frontX?.12:.025,C.trim);
      }
    }
  } else if(o.type==='vanity') {
    B.get('wood').box(x,y+.35,z,w-.05,.65,d-.05,C.timber);
    B.get('stone').box(x,y+.81,z,w,.08,d,'#e8e6df');
    for(const zz of [r.z0+d*.28,r.z0+d*.72]) {
      B.get('extSatin').sphere(x,y+.86,zz,Math.min(w*.38,.38),'#faf8ec',.07,Math.min(d*.17,.38),'sphereLo');
      B.get('extMetal').cyl(r.x0+.18,y+.85,zz,.025,.24,C.trim,8);
    }
    B.get('glassTint').box(r.x0+.025,y+1.6,z,.035,1,d-.12,'#ffffff');
  } else if(o.type==='wc') {
    B.get('extSatin').box(x,y+.43,r.z0+.14,w*.7,.66,.25,'#f5f4e8');
    B.get('extSatin').sphere(x,y+.26,z,Math.min(w*.38,.38),'#f5f4e8',.22,Math.min(d*.38,.48),'sphereLo');
    B.get('extMetal').box(x,y+.775,r.z0+.13,.1,.01,.06,C.trim);
  }
}

export function buildResidentialLobby(ctx,b,lv,plane) {
  const group=new THREE.Group();group.name=`${b.id}-community-lobby`;
  const ceilings=new THREE.Group();ceilings.name=`${lv.id}-lobby-ceilings`;ceilings.visible=false;
  const plan=lv.lobbyPlan,B=new BatchSet(ctx.mats.base),CB=new BatchSet(ctx.mats.base),y=lv.elev;
  group.userData={furniture:plan.obstacles.map(o=>({id:o.id,rect:o.rect,height:o.height})),zones:plan.zones.map(z=>z.id)};
  B.frame(b.frame,()=>{
    for(const z of plan.zones) {
      rectFinish(B,z.rect,y+.004,['reading','waiting'].includes(z.id)?'wood':'stone',['reading','waiting'].includes(z.id)?'#d4c4a6':'#e4ded0');
    }
    for(const w of plan.partitions)openingWall(B,w,y,3.7,false);
    for(const o of plan.obstacles)lobbyFurniture(B,o,y);
    // Tall fins and ceiling coves follow edges; all furniture stays inside shared obstacle footprints.
    for(const x of [-20.85,20.85])for(let z=-14;z<15;z+=2.2)B.get('wood').box(x,y+2.1,z,.1,4.2,.1,C.timber);
    // Entry mat is flush and preserves the full four-metre portal.
    B.get('satin').box(0,y+.008,14.25,5,.016,2.7,'#485d52');
    for(let x=-2.3;x<2.4;x+=.18)B.get('extMetal').box(x,y+.018,14.25,.018,.007,2.45,'#909789');
  });
  CB.frame(b.frame,()=>{
    for(const zone of plan.zones) {
      const r=zone.rect,x=(r.x0+r.x1)/2,z=(r.z0+r.z1)/2;
      CB.get('extSatin').box(x,y+4.39,z,r.x1-r.x0-.35,.12,r.z1-r.z0-.35,'#d4d2c5');
      for(const xx of [r.x0+.6,r.x1-.6])CB.get('glowSoft').box(xx,y+4.315,z,.045,.025,r.z1-r.z0-1.15,'#fae6c0');
      CB.get('extMetal').cyl(x,y+3.37,z,.013,1.0,C.trim,6);
      CB.get('glowSoft').sphere(x,y+3.38,z,.55,'#f4e4be',.13,.55,'sphereLo');
    }
  });
  B.flush(group);
  CB.flush(ceilings);group.add(ceilings);
  for(const z of plan.zones.filter(z=>z.id!=='entry')) {
    const r=z.rect;label(ctx,group,b.frame,z.name,(r.x0+r.x1)/2,y+3.15,r.z1+.04,Math.min(3.7,r.x1-r.x0-.4),0,'YUNLAN COMMUNITY',plane);
  }
  label(ctx,group,b.frame,'云澜汇 · 归家礼序',10.1,y+2.8,7.18,4.1,0,'WELCOME HOME',plane);
  label(ctx,group,b.frame,'01 · 02 · 03 住宅层  |  双电梯  |  消防楼梯',0,y+3.52,9,7,0,'RESIDENCES · LIFTS · STAIRS',plane);
  ctx.levels[lv.id].base.add(group);
  // One permanent updater for the four permanent lobbies. Floor-cache creation
  // and eviction never register listeners or retain new copies of these groups.
  if(!ctx.hospitality.lobbyCeilings) {
    const records=new Map();ctx.hospitality.lobbyCeilings=records;
    ctx.dynamic.push({name:'residential-lobby-ceilings',update(dt,elapsed,app){
      for(const [level,record] of records)record.ceilings.visible=app.state.explore?.level===level
        &&ctx.camera.position.y>=record.elevation&&ctx.camera.position.y<record.elevation+4.3;
    }});
  }
  const records=ctx.hospitality.lobbyCeilings;
  records.set(lv.id,{ceilings,elevation:y});
  group.addEventListener('removed',()=>records.delete(lv.id));
  return group;
}

export function buildResidentialRoofGarden(ctx,b,lv) {
  const group=new THREE.Group();group.name=`${b.id}-roof-garden`;
  const B=new BatchSet(ctx.mats.base),y=lv.elev;
  B.frame(b.frame,()=>{
    for(const x of [-11.6,11.6]) {
      B.get('wood').box(x,y+.02,9,8,.04,6,'#d4c6ac');
      for(const xx of [x-3.5,x+3.5])for(const z of [6.5,11.5])B.get('extMetal').box(xx,y+1.45,z,.1,2.9,.1,C.trim);
      for(let xx=x-3.5;xx<x+3.6;xx+=.55)B.get('wood').box(xx,y+2.95,9,.1,.15,5.8,'#d6c6a8');
      bench(B,x-1.5,y,8,0);bench(B,x+1.5,y,10,Math.PI);
      planter(B,x-3.4,13.4,x+3.4,14.6,y,18,true,'stone');
    }
  });
  B.flush(group);ctx.levels[lv.id].base.add(group);return group;
}
