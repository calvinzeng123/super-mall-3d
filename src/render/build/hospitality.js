// 酒店、公寓和住宅的常驻外壳。全栋按材质合批，剖切用同一水平裁切面；
// 客房和户内陈设由 residence.js 按当前楼层另行加载。
import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { carGeometry } from './parking.js';
import { toW, toL, subtractInterval, pointInPoly, polyBounds, unionOutline, mergeSegments, subtractOpenings, rectPoly } from '../../layout/geom.js';
import { shapeFromPoly } from './shell.js';
import { addCutSurfaceSlab } from './surface-shapes.js';
import { makeCanvas, canvasTexture, FONT_CN, FONT_EN } from '../textures.js';
import { addTrees, bollard, bench, planter } from './props.js';
import { buildResidentialLevelShells, residentialCommon, residentialCrown, buildResidentialLobby, buildResidentialRoofGarden } from './residential-shell.js';
import { buildTowerStairGeometry, buildTowerStairInstances } from './tower-stairs.js';
import { buildMallStairLevel, buildStairApproach } from './mall-stairs.js';
import { buildHospitalityLobby } from './hospitality-lobby.js';
import { garageCeilingPanels } from '../../layout/garage-ceiling.js';
import { buildExpansionConnections } from './expansion-connections.js';
export { setResidentialDetailLevel } from './residential-shell.js';

const PALETTES = {
  hotel: { key: 'stone', wall: '#f3ebdc', dark: '#bfb29b', metal: '#8e7653', glazing: '#526b76', fabric: '#eadfc9' },
  apartment: { key: 'stone', wall: '#dfddd3', dark: '#a78770', metal: '#454d50', glazing: '#638087', fabric: '#d9d9c6' },
  residential: { key: 'concrete', wall: '#efefeb', dark: '#babdbb', metal: '#657275', glazing: '#647d88', fabric: '#e5dfd1' },
};
const FULL_HEIGHT = 1e5;

function rectEdges(r) {
  return [
    { side: 'N', len: r.x1-r.x0, n: [0,-1], along: 'x', p: t => [r.x0+t,r.z0] },
    { side: 'S', len: r.x1-r.x0, n: [0,1], along: 'x', p: t => [r.x0+t,r.z1] },
    { side: 'W', len: r.z1-r.z0, n: [-1,0], along: 'z', p: t => [r.x0,r.z0+t] },
    { side: 'E', len: r.z1-r.z0, n: [1,0], along: 'z', p: t => [r.x1,r.z0+t] },
  ];
}
function sideBox(B, e, key, a, b, ya, yb, off, depth, color) {
  if (b-a<0.008 || yb-ya<0.008) return;
  const [x,z]=e.p((a+b)/2), horizontal=e.along==='x';
  const appliedMetal=key==='extMetal'&&depth<=0.12&&(yb-ya<=0.11||b-a<=0.12);
  if(key==='glass'||key==='glassTint'||(key==='ext'||key==='glowSoft')&&depth<0.07||appliedMetal) {
    const ry={N:Math.PI,S:0,E:Math.PI/2,W:-Math.PI/2}[e.side];
    B.get(key).shape('plane',new THREE.Vector3(x+e.n[0]*off,(ya+yb)/2,z+e.n[1]*off),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),ry),new THREE.Vector3(b-a,yb-ya,1),color);
    return;
  }
  B.get(key).box(x+e.n[0]*off,(ya+yb)/2,z+e.n[1]*off,horizontal?b-a:depth,yb-ya,horizontal?depth:b-a,color);
}
function edgeInterval(e, F, worldA, worldB, tolerance=0.3) {
  const a=toL(F,...worldA),b=toL(F,...worldB),o=e.p(0);
  const across=e.along==='x'?1:0,along=1-across;
  if(Math.abs(a[across]-o[across])>tolerance || Math.abs(b[across]-o[across])>tolerance)return null;
  return [Math.max(0,Math.min(a[along],b[along])-o[along]),Math.min(e.len,Math.max(a[along],b[along])-o[along])];
}

/** 只克隆材质实例，共用全部PBR图片；夜景参数同步到克隆实例。 */
function clippedMaterials(ctx, plane) {
  const materials={};
  for(const [key,base] of Object.entries(ctx.mats.base)) {
    const m=base.clone();
    m.onBeforeCompile=base.onBeforeCompile;
    m.customProgramCacheKey=base.customProgramCacheKey;
    m.clippingPlanes=[plane];m.clipShadows=true;
    if(['glass','glassTint','ext','glowSoft','extMetal'].includes(key))m.side=THREE.DoubleSide;
    ctx.mats.onNight(()=>{
      m.color.copy(base.color);
      if(m.emissive)m.emissive.copy(base.emissive);
      m.emissiveIntensity=base.emissiveIntensity;
      m.opacity=base.opacity;
    });
    materials[key]=m;
  }
  return materials;
}

export function setHospitalityCut(ctx, buildingId, elevation=FULL_HEIGHT) {
  const record=ctx.hospitality?.buildings.get(buildingId);
  if(record)record.plane.constant=Number.isFinite(elevation)?elevation:FULL_HEIGHT;
}

export function buildHospitality(ctx) {
  const towers=ctx.layout.buildings.filter(b=>b.kind==='tower');
  const records=new Map();
  ctx.hospitality={buildings:records};
  if(!towers.length)return ctx.hospitality;
  ctx.renderer.localClippingEnabled=true;
  for(const b of towers) {
    const F=b.frame,r=b.footprint,pal=PALETTES[b.usage]||PALETTES.residential;
    const levels=ctx.layout.levels.filter(l=>l.building===b.id).sort((a,z)=>a.elev-z.elev);
    const group=new THREE.Group();group.name=`${b.id}-batched-exterior`;
    const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),FULL_HEIGHT);
    const materials=clippedMaterials(ctx,plane),B=new BatchSet(materials);
    const edges=rectEdges(r);
    B.frame(F,()=>{
      for(const lv of levels) {
        slab(ctx,B,b,lv,pal);
        if(lv.kind==='roof')continue;
        if(b.usage==='residential') {
          if(lv.elev<=0)for(const e of edges)facadeFloor(ctx,B,b,lv,e,pal);
          residentialCommon(ctx,B,b,lv);
        } else {
          for(const e of edges) facadeFloor(ctx,B,b,lv,e,pal);
          corridorLights(B,b,lv);
        }
      }
      if(b.usage==='residential')residentialCrown(B,b,levels.at(-1));
      else crown(B,b,levels.at(-1),pal);
      liftEnclosures(ctx,B,b,levels,pal);
      buildTowerStairGeometry(B,b,levels,ctx.layout.stairs.filter(s=>s.building===b.id),{flights:false});
      for(const en of ctx.layout.entrances.filter(en=>en.building===b.id&&en.secondaryDoor)) {
        const d=en.secondaryDoor,e=edges.find(e=>e.side===d.side);
        const a=e.along==='x'?Math.min(d.x0,d.x1)-r.x0:Math.min(d.z0,d.z1)-r.z0;
        sideBox(B,e,'extMetal',a-.3,a+en.width+.3,2.94,3.08,.55,1.1,pal.metal);
        sideBox(B,e,'glowSoft',a+.1,a+en.width-.1,2.91,2.94,.65,.07,'#ffe7bf');
      }
    });
    B.flush(group);
    buildTowerStairInstances(ctx,b,levels,ctx.layout.stairs.filter(s=>s.building===b.id),materials,group);
    const residentialShells=b.usage==='residential'?buildResidentialLevelShells(ctx,b,levels,materials,group):null;
    ctx.buildings[b.id].group.add(group);
    ctx.buildings[b.id].exterior=group;
    ctx.buildings[b.id].exteriorClip=plane;
    const ground=levels.find(l=>l.short==='1F');
    const groundGroup=b.usage==='residential'?buildResidentialLobby(ctx,b,ground,plane)
      :ground?.lobbyPlan?.kind==='hospitality'?buildHospitalityLobby(ctx,b,ground,plane):buildLobby(ctx,b,ground,pal);
    const roofGroup=b.usage==='residential'?buildResidentialRoofGarden(ctx,b,levels.find(l=>l.kind==='roof')):buildRoofGarden(ctx,b,levels.find(l=>l.kind==='roof'),pal);
    const sign=buildingSign(ctx,b,pal,plane);
    if(sign)group.add(sign);
    records.set(b.id,{group,plane,groundGroup,roofGroup,materials,residentialShells,detailLevel:null});
  }
  buildPublicGarageShells(ctx);
  landscape(ctx,towers);
  connections(ctx);
  sharedSurfaceParking(ctx);
  attachedDockLobbies(ctx);
  return ctx.hospitality;
}

function slab(ctx,B,b,lv,pal) {
  const shaftHoles=lv.playableCap?[]:ctx.layout.elevators.filter(e=>e.building===b.id).map(e=>[
    toW(e.frame,e.lu-e.w/2,e.lv-e.d/2),toW(e.frame,e.lu+e.w/2,e.lv-e.d/2),
    toW(e.frame,e.lu+e.w/2,e.lv+e.d/2),toW(e.frame,e.lu-e.w/2,e.lv+e.d/2),
  ]);
  // 玻璃井位于楼板内，逐层挖掉真实井道；不让升降中的轿厢穿过实心板。
  for(const piece of lv.slab.pieces) {
    const holes=[...(piece.holes||[]),...shaftHoles.filter(h=>h.every(p=>pointInPoly(p,piece.outer))&&!piece.holes?.some(existing=>pointInPoly([(h[0][0]+h[2][0])/2,(h[0][1]+h[2][1])/2],existing)))];
    const local=p=>p.map(q=>toL(b.frame,...q));
    const g=new THREE.ExtrudeGeometry(shapeFromPoly(local(piece.outer),holes.map(local)),{depth:0.28,bevelEnabled:false,curveSegments:1});
    g.rotateX(-Math.PI/2);g.translate(0,-0.28,0);
    const geo=g.index?g.toNonIndexed():g;
    const t={pos:geo.attributes.position.array,nor:geo.attributes.normal.array,uv:geo.attributes.uv?.array,count:geo.attributes.position.count};
    const plateTop=lv.elev-(b.usage==='residential'&&lv.elev>=0?.04:0);
    B.get(lv.elev<0?'concrete':'stone').push(t,new THREE.Matrix4().makeTranslation(0,plateTop,0),lv.elev<0?'#c9cecb':'#ece9e0');
    if(lv.lobbyPlan) {
      // The lobby finish repeats the punched plate, so neither lift nor stair
      // opening is accidentally bridged by a decorative rectangular floor.
      const finish=new THREE.Matrix4().makeScale(1,.04/.28,1);
      finish.setPosition(0,lv.elev,0);B.get('stone').push(t,finish,'#e5e0d3');
    }
    geo.dispose();if(geo!==g)g.dispose();
  }
  if(lv.elev>=0&&b.usage!=='residential')for(const e of rectEdges(b.footprint))sideBox(B,e,'extSatin',0,e.len,lv.elev-0.2,lv.elev+0.045,0.04,0.34,pal.dark);
}

function facadeFloor(ctx,B,b,lv,e,pal) {
  const y=lv.elev,h=lv.height;
  const entrances=ctx.layout.entrances.filter(en=>en.level===lv.id).map(en=>edgeInterval(e,b.frame,[en.seg.x0,en.seg.z0],[en.seg.x1,en.seg.z1])).filter(Boolean);
  for(const p of ctx.layout.extensions?.paths||[]) {
    if(p.level!==lv.id||!p.points?.length)continue;
    const start=toL(b.frame,p.points[0][0],p.points[0][2]),o=e.p(0),across=e.along==='x'?1:0;
    if(Math.abs(start[across]-o[across])>0.3)continue;
    const t=start[1-across]-o[1-across];
    if(t>=0&&t<=e.len)entrances.push([Math.max(0,t-p.width/2),Math.min(e.len,t+p.width/2)]);
  }
  if(lv.elev<0) {
    for(const [a,z] of entrances.reduce((ivs,g)=>subtractInterval(ivs,g),[[0,e.len]]))sideBox(B,e,'concrete',a,z,y,y+h-0.24,-0.12,0.28,'#c6cfcb');
    for(const [a,z] of entrances)sideBox(B,e,'concrete',a,z,y+3.1,y+h-0.24,-0.12,0.28,'#c6cfcb');
    return;
  }
  if(lv.lobbyPlan) {
    // The whole first storey is a separate glazed community lobby, with its
    // actual four-metre arrival portal cut out of the curtain wall.
    const spans=entrances.reduce((ivs,gap)=>subtractInterval(ivs,gap),[[0,e.len]]);
    for(const [a,z] of spans) {
      sideBox(B,e,'stone',a,z,y,y+.16,-.07,.2,'#c9c8bc');
      sideBox(B,e,'glassTint',a,z,y+.16,y+h-.4,-.055,.035,'#ffffff');
      for(let t=a+.1;t<z;t+=3.2)sideBox(B,e,'extMetal',t-.035,t+.035,y+.1,y+h-.25,-.012,.1,pal.metal);
    }
    sideBox(B,e,'stone',0,e.len,y+h-.4,y+h-.04,-.09,.24,pal.wall);
    for(const [a,z] of entrances) {
      sideBox(B,e,'glass',a,z,y+3.5,y+h-.4,-.055,.035,'#ffffff');
      for(const t of [a-.04,z+.04])sideBox(B,e,'extMetal',t-.04,t+.04,y,y+3.55,-.005,.14,pal.metal);
      sideBox(B,e,'extMetal',a,z,y+3.47,y+3.55,-.005,.14,pal.metal);
    }
    return;
  }
  const windows=[];
  for(const u of lv.units) {
    const r=u.rects?.[0]; if(!r)continue;
    // 居室坐标系的后墙是采光面，窗位与真实户型对齐。
    const rearA=toW(u.frame,r.x0,r.z1),rearB=toW(u.frame,r.x1,r.z1);
    const span=edgeInterval(e,b.frame,rearA,rearB,3);
    const rear=toL(b.frame,...rearA),edge=e.p(0),inset=-(rear[0]-edge[0])*e.n[0]-(rear[1]-edge[1])*e.n[1];
    if(span&&span[1]-span[0]>1.2)windows.push({span,u,inset});
  }
  // 无户型贴边的端墙按结构跨留狭长窗；首层入口两侧作为公共大堂幕墙。
  if(!windows.length) {
    const n=Math.max(1,Math.floor(e.len/7.5));
    for(let i=0;i<n;i++) {
      const m=e.len*(i+0.5)/n,w=Math.min(lv.levelNumber===1?4.2:2.0,e.len/n-1.2);
      if(entrances.some(([a,z])=>m+w/2>a&&m-w/2<z))continue;
      windows.push({span:[m-w/2,m+w/2],u:null});
    }
  }
  const cuts=[...windows.map(w=>w.span),...entrances];
  const wall=cuts.reduce((ivs,gap)=>subtractInterval(ivs,gap),[[0,e.len]]);
  for(const [a,z] of wall)sideBox(B,e,pal.key,a,z,y,y+h-0.2,-0.1,0.24,pal.wall);
  for(const {span:[a,z],u,inset=0} of windows) {
    const balcony=b.usage!=='hotel'&&lv.levelNumber>1&&Boolean(u?.residence?.balcony);
    const balconyDepth=balcony?u.residence.balcony.z1-u.residence.balcony.z0:0;
    windowBay(B,e,a,z,y,h,pal,{balcony,balconyDepth,inset,index:lv.levelNumber,usage:b.usage,seed:(u?.slot||u?.id||e.side).length});
  }
  for(const [a,z] of entrances) {
    // 门洞只有门楣和两侧边框，玻璃井、门槛及灯带均不得封住门。
    sideBox(B,e,'glass',a,z,y+2.8,y+h-0.2,-0.02,0.045,'#ffffff');
    sideBox(B,e,'extMetal',a,z,y+2.7,y+2.8,0.04,0.28,pal.metal);
    for(const t of [a-0.045,z+0.045])sideBox(B,e,'extMetal',t-0.035,t+0.035,y,y+2.8,0.03,0.22,pal.metal);
  }
}

function windowBay(B,e,a,z,y,h,pal,{balcony,balconyDepth=1.5,inset=0,index,usage,seed}) {
  const edge=0.3,lo=a+edge,hi=z-edge;
  if(hi-lo<0.5)return;
  const sill=balcony?0.12:usage==='hotel'?0.62:0.7;
  const head=h-0.38,glassOffset=-inset-(balcony?balconyDepth:0.095);
  for(const [p,q] of [[a,lo],[hi,z]])sideBox(B,e,pal.key,p,q,y,y+h-0.2,-inset/2-0.1,inset+0.24,pal.wall);
  if(!balcony)sideBox(B,e,pal.key,lo,hi,y,y+sill,-inset-0.1,0.24,pal.wall);
  sideBox(B,e,pal.key,lo,hi,y+head,y+h-0.2,-inset/2-0.1,inset+0.24,pal.wall);
  const n=Math.max(1,Math.ceil((hi-lo)/3.6));
  const doorCenter=(lo+hi)/2,doorWidth=1.4;
  for(let j=0;j<n;j++) {
    const p=lo+(hi-lo)*j/n,q=lo+(hi-lo)*(j+1)/n;
    const spans=balcony?subtractInterval([[p+0.035,q-0.035]],[doorCenter-doorWidth/2,doorCenter+doorWidth/2]):[[p+0.035,q-0.035]];
    for(const [a,z] of spans)sideBox(B,e,'glassTint',a,z,y+sill,y+head,glassOffset,0.035,'#ffffff');
    if(!balcony||Math.abs(p-doorCenter)>doorWidth/2+0.03)sideBox(B,e,'extMetal',p-0.025,p+0.025,y+sill,y+head,glassOffset+0.045,0.09,pal.metal);
    // 窗帘只占玻璃边缘，留出内部视野，不用整块贴片代替房间。
    if(!balcony) {
      const width=Math.min(0.48,(q-p)*0.22),lit=(index+j+seed)%4===0;
      sideBox(B,e,lit?'glowSoft':'ext',p+0.07,p+0.07+width,y+sill+0.05,y+head-0.05,-inset-0.21,0.045,pal.fabric);
    }
  }
  sideBox(B,e,'extMetal',hi-0.025,hi+0.025,y+sill,y+head,glassOffset+0.045,0.09,pal.metal);
  for(const yy of [y+sill,y+head])sideBox(B,e,'extMetal',lo,hi,yy-0.035,yy+0.035,glassOffset+0.04,0.1,pal.metal);
  if(usage==='hotel') {
    sideBox(B,e,'extMetal',a+0.08,a+0.19,y+0.2,y+h-0.15,0.14,0.4,pal.metal);
    sideBox(B,e,'stone',lo-0.08,hi+0.08,y+sill-0.09,y+sill,-inset+0.02,0.43,'#e4d9c5');
  }
  if(balcony) {
    for(const t of [doorCenter-doorWidth/2-0.025,doorCenter+doorWidth/2+0.025])sideBox(B,e,'extMetal',t-0.025,t+0.025,y,y+2.4,glassOffset,0.1,pal.metal);
    sideBox(B,e,'extMetal',doorCenter-doorWidth/2,doorCenter+doorWidth/2,y+2.34,y+2.41,glassOffset,0.1,pal.metal);
    sideBox(B,e,'glassTint',doorCenter-doorWidth/2,doorCenter+doorWidth/2,y+2.41,y+head,glassOffset,0.035,'#ffffff');
    sideBox(B,e,'concrete',lo,hi,y+0.015,y+0.075,-inset-balconyDepth/2,balconyDepth,'#d4d7d4');
    sideBox(B,e,'glass',lo+0.06,hi-0.06,y+0.2,y+1.05,-inset+0.1,0.035,'#ffffff');
    sideBox(B,e,'extMetal',lo,hi,y+1.05,y+1.1,-inset+0.1,0.075,pal.metal);
    for(const t of [lo,hi])sideBox(B,e,'extMetal',t-0.028,t+0.028,y+0.1,y+1.1,-inset+0.1,0.075,pal.metal);
  }
}

function crown(B,b,lv,pal) {
  const r=b.footprint,y=lv.kind==='roof'?lv.elev:lv.elev+lv.height,w=r.x1-r.x0,d=r.z1-r.z0,cx=(r.x0+r.x1)/2,cz=(r.z0+r.z1)/2;
  const height=b.usage==='hotel'?2.8:b.usage==='apartment'?1.8:1.2;
  for(const e of rectEdges(r)) {
    sideBox(B,e,pal.key,0,e.len,y,y+height,-0.12,0.28,pal.dark);
    sideBox(B,e,'extMetal',-0.15,e.len+0.15,y+height,y+height+0.1,0.01,0.62,pal.metal);
    if(b.usage!=='residential')sideBox(B,e,'glowSoft',0.2,e.len-0.2,y+height-0.17,y+height-0.12,0.07,0.12,'#ead8af');
  }
  if(lv.playableRoof)return;
  // 住宅机房在东北角，避开中部双电梯井；酒店机房在中央服务区。
  const mx=b.usage==='residential'?r.x1-6:cx,mz=b.usage==='residential'?r.z0+4:cz;
  B.get('extSatin').box(mx,y+1.2,mz,w*0.28,2.4,d*0.26,'#a5adae');
  for(const x of [mx-w*0.1,mx+w*0.1]) {
    B.get('extMetal').cyl(x,y+2.42,mz,1.15,0.13,'#343f43',12);
    B.get('extMetal').cyl(x,y+2.56,mz,0.23,0.12,'#b6bdbe',8);
  }
  for(let yy=y+0.4;yy<y+2.3;yy+=0.3)B.get('extMetal').box(mx,yy,mz-d*0.13-0.025,w*0.24,0.07,0.05,'#6f7a7c');
}

function buildRoofGarden(ctx,b,lv,pal) {
  const group=new THREE.Group();group.name=`${b.id}-roof-garden`;
  if(!lv||lv.playableCap||lv.playableRoof)return group;
  const B=new BatchSet(ctx.mats.base),r=b.footprint,y=lv.elev;
  B.frame(b.frame,()=>{
    for(const x of [r.x0+4,r.x1-4]) {
      planter(B,x-1.6,r.z1-3.5,x+1.6,r.z1-2.2,y,4+x,true,'stone');
      bench(B,x,y,r.z1-1.5,Math.PI,'wood'); // Clear the east fire stair enclosure.
    }
    const cx=(r.x0+r.x1)/2,cz=r.z1-6.5,w=b.usage==='residential'?5:9;
    B.get('wood').box(cx,y+0.025,cz,w+1,0.05,4.3,'#e8d6b7');
    for(const x of [cx-w/2,cx+w/2])for(const z of [cz-1.9,cz+1.9])B.get('extMetal').box(x,y+1.5,z,0.1,3,0.1,pal.metal);
    for(let x=cx-w/2;x<=cx+w/2;x+=0.6)B.get('wood').box(x,y+3.05,cz,0.12,0.18,4.4,'#eedfc8');
    for(const z of [cz-1.9,cz+1.9])B.get('extMetal').box(cx,y+2.96,z,w+0.2,0.12,0.1,pal.metal);
    B.get('stone').cyl(cx,y+0.15,cz,0.75,0.35,'#d9d5ca',12);
    for(const x of [cx-w*0.3,cx+w*0.3])bench(B,x,y,cz,Math.PI/2);
  });
  B.flush(group);ctx.levels[lv.id].base.add(group);return group;
}

function liftEnclosures(ctx,B,b,levels,pal) {
  for(const e of ctx.layout.elevators.filter(e=>e.building===b.id&&e.exterior)) {
    const served=levels.filter(l=>e.serves.includes(l.id));
    if(!served.length)continue;
    const world=toW(e.frame,e.lu,e.lv),[x,z]=toL(b.frame,...world);
    const halfW=e.w/2,halfD=e.d/2,bottom=served[0].elev,top=served.at(-1).elev+served.at(-1).height+0.3;
    const shaftEdges=rectEdges({x0:x-halfW,x1:x+halfW,z0:z-halfD,z1:z+halfD});
    // door是电梯自身局部朝向，不等同于建筑外侧方向。实际井道在建筑内部。
    for(const edge of shaftEdges)if(edge.side!==e.door)sideBox(B,edge,'glass',0,edge.len,bottom,top,0,0.045,'#ffffff');
    for(const dx of [-halfW,halfW])for(const dz of [-halfD,halfD])B.get('extMetal').box(x+dx,(bottom+top)/2,z+dz,0.085,top-bottom,0.085,pal.metal);
    const front=shaftEdges.find(s=>s.side===e.door),doorW=Math.min(1.9,front.len-0.3),m=front.len/2;
    for(const lv of served) {
      for(const edge of shaftEdges)sideBox(B,edge,'extMetal',0,edge.len,lv.elev-0.1,lv.elev-0.03,0,0.075,pal.metal);
      for(const [a,q] of [[0,m-doorW/2],[m+doorW/2,front.len]])sideBox(B,front,'glass',a,q,lv.elev,lv.elev+2.7,0,0.035,'#ffffff');
      for(const t of [m-doorW/2-0.035,m+doorW/2+0.035])sideBox(B,front,'extMetal',t-0.028,t+0.028,lv.elev,lv.elev+2.75,0.025,0.09,pal.metal);
      sideBox(B,front,'extMetal',m-doorW/2-0.06,m+doorW/2+0.06,lv.elev+2.7,lv.elev+2.8,0.025,0.12,pal.metal);
      sideBox(B,front,'glass',0,front.len,lv.elev+2.8,Math.min(top,lv.elev+lv.height-0.12),0,0.035,'#ffffff');
      sideBox(B,front,'glowSoft',m-0.12,m+0.12,lv.elev+2.76,lv.elev+2.82,0.1,0.045,'#b8e4cd');
    }
  }
}

function corridorLights(B,b,lv) {
  const y=lv.elev+lv.height-0.34;
  for(let x=b.footprint.x0+3;x<b.footprint.x1-1;x+=5) {
    B.get('extMetal').box(x,y,0,1.4,0.07,0.23,'#5d6567');
    B.get('glowSoft').box(x,y-0.047,0,1.25,0.022,0.15,'#f8edce');
  }
  const side=lv.walk.find(w=>w.id==='A-east-entry-hall');
  if(side) {
    const r=side.rect,x=(r.x0+r.x1)/2;
    B.get('stone').box(x,lv.elev+.015,(r.z0+r.z1)/2,r.x1-r.x0,.03,r.z1-r.z0,'#e9dfcf');
    for(let z=r.z0+1.2;z<r.z1;z+=3.5)B.get('glowSoft').box(x,y,z,.7,.04,.25,'#f8edce');
  }
}

function buildLobby(ctx,b,lv,pal) {
  const group=new THREE.Group();group.name=`${b.id}-ground-lobby`;
  const B=new BatchSet(ctx.mats.base),F=b.frame;
  const walk=lv.walk.find(w=>w.kind==='lobby'&&w.rect);
  // 大堂严格使用布局给出的公共区域；没有专用lobby时不向客房内放家具。
  if(walk) {
    const r=walk.rect,cx=(r.x0+r.x1)/2,cz=(r.z0+r.z1)/2,w=r.x1-r.x0,d=r.z1-r.z0;
    B.frame(walk.frame||F,()=>{
      const counterW=Math.min(4.6,w*0.38),counterZ=r.z0+0.8;
      B.get('wood').box(cx,lv.elev+0.53,counterZ,counterW,1.06,0.7,'#e5d4b6');
      B.get('stone').box(cx,lv.elev+1.09,counterZ,counterW+0.1,0.08,0.84,'#eeeade');
      B.get('glow').box(cx,lv.elev+0.1,counterZ+0.36,counterW-0.12,0.055,0.035,'#ffe3ab');
      for(const side of [-1,1]) {
        const x=cx+side*Math.min(w*0.34,4.5),z=cz+Math.min(d*0.2,1.4);
        B.get('satin').box(x,lv.elev+0.38,z,1.7,0.42,0.8,b.usage==='hotel'?'#536864':'#ba9e81');
        B.get('satin').box(x,lv.elev+0.76,z+0.32,1.7,0.65,0.17,b.usage==='hotel'?'#40544e':'#9c8068');
        B.get('stone').cyl(x,lv.elev+0.04,z-0.8,0.38,0.4,'#e4d6c0',12);
      }
      for(const x of [cx-w*0.27,cx,cx+w*0.27]) {
        B.get('extMetal').cyl(x,lv.elev+lv.height-1.0,cz,0.018,0.6,pal.metal,6);
        B.get('glow').sphere(x,lv.elev+lv.height-1.1,cz,0.22,'#ffebc5',0.1,0.22,'sphereLo');
      }
    });
  }
  B.flush(group);
  ctx.levels[lv.id].base.add(group);
  return group;
}

function buildingSign(ctx,b,pal,plane) {
  const c=makeCanvas(1024,256),g=c.getContext('2d');
  g.fillStyle=b.usage==='hotel'?'#273532':'#3d494b';g.fillRect(0,0,1024,256);
  g.textAlign='center';g.textBaseline='middle';g.fillStyle='#eee3c9';
  g.font=`600 90px ${FONT_CN}`;g.fillText(b.name||b.id,512,98,950);
  g.font=`500 34px ${FONT_EN}`;g.fillText(b.usage==='hotel'?'YUNLAN HOTEL':b.usage==='apartment'?'YUNLAN RESIDENCES':`${b.id} · GARDEN RESIDENCES`,512,195,940);
  const mat=ctx.mats.sign(canvasTexture(c,{clamp:true}));mat.clippingPlanes=[plane];
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(b.usage==='residential'?5:8,b.usage==='residential'?1.25:2),mat);
  const entrance=ctx.layout.entrances.find(e=>e.building===b.id&&e.main),r=b.footprint;
  const p=entrance?[(entrance.seg.x0+entrance.seg.x1)/2+entrance.nx*0.23,(entrance.seg.z0+entrance.seg.z1)/2+entrance.nz*0.23]:toW(b.frame,r.x1+0.23,(r.z0+r.z1)/2);
  mesh.position.set(p[0],b.usage==='residential'?3.35:4.0,p[1]);mesh.rotation.y=entrance?Math.atan2(entrance.nx,entrance.nz):-b.frame.a+Math.PI/2;mesh.name=`${b.id}-entry-name`;
  return mesh;
}

function landscape(ctx,towers) {
  const group=new THREE.Group();group.name='hospitality-landscape';
  const B=new BatchSet(ctx.mats.base),trees=[];
  // 道路和地块由布局提供，景观只落在楼边已有plot内，避开全部建筑轮廓。
  const occupied=p=>ctx.layout.buildings.some(b=>!b.undergroundOnly&&pointInPoly(p,b.outline))||ctx.layout.site.trenches.some(q=>pointInPoly(p,q))||(ctx.layout.extensions.roads||[]).some(r=>r.polys.some(q=>pointInPoly(p,q)))||(ctx.layout.extensions.surfaceParking||[]).some(r=>pointInPoly(p,r.poly));
  for(const b of towers) {
    const r=b.footprint,F=b.frame;
    B.frame(F,()=>{
      const edge=rectEdges(r).find(e=>e.side===(b.usage==='residential'?'S':'E')),middle=edge.len/2,half=b.usage==='residential'?3.1:3.4,canopyY=b.usage==='residential'?3:3.65;
      sideBox(B,edge,'extMetal',middle-half,middle+half,canopyY,canopyY+0.15,1.6,3.5,PALETTES[b.usage].metal);
      sideBox(B,edge,'wood',middle-half+0.12,middle+half-0.12,canopyY-0.065,canopyY-0.01,1.6,3.25,'#eadbc2');
      for(const t of [middle-half+0.2,middle+half-0.2]) {
        const [x,z]=edge.p(t);
        // The north-wing tower's narrow frontage uses a cantilevered canopy.
        if(b.attachment!=='north-wing')B.get('extMetal').box(x+edge.n[0]*2.9,canopyY/2,z+edge.n[1]*2.9,0.12,canopyY,0.12,PALETTES[b.usage].metal);
        B.get('glowSoft').cyl(x+edge.n[0]*1.6,canopyY-0.095,z+edge.n[1]*1.6,0.14,0.025,'#f4e4bc',8);
      }
      for(const side of [-1,1]) {
        const z=(side<0?r.z0:r.z1)+side*4.5;
        for(let x=r.x0+4;x<r.x1-2;x+=12) {
          const p=toW(F,x,z);
          if(occupied(p))continue;
          if(b.plot&&(p[0]<b.plot.x0+1||p[0]>b.plot.x1-1||p[1]<b.plot.z0+1||p[1]>b.plot.z1-1))continue;
          planter(B,x-1.25,z-0.75,x+1.25,z+0.75,0,b.storeys+x,false,'stone');
          trees.push({x:p[0],y:0.65,z:p[1],s:b.usage==='residential'?1.05:1.3,kind:'round'});
          if(x+6<r.x1-2) {
            const seat=toW(F,x+5.3,z);
            if(!occupied(seat))bench(B,x+5.3,0,z,side<0?Math.PI:0);
          }
          bollard(B,x+2,z-side*1.2);
        }
      }
    });
  }
  districtGarden(ctx,B,group,trees);
  B.flush(group);addTrees(group,ctx.mats,trees,842);
  ctx.site.group.add(group);ctx.hospitality.landscape=group;
}

function districtGarden(ctx,B,group,trees) {
  const lawn=(x,z,w,d)=>{
    const g=new THREE.PlaneGeometry(w,d).rotateX(-Math.PI/2);g.translate(x,0.015,z);
    const mat=ctx.mats.floor?ctx.mats.floor('grass',0.95):ctx.mats.base.foliage;
    const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;group.add(mesh);
    for(const zz of [z-d/2,z+d/2])B.get('stone').box(x,0.06,zz,w+0.2,0.12,0.16,'#d9d4c7');
    for(const xx of [x-w/2,x+w/2])B.get('stone').box(xx,0.06,z,0.16,0.12,d,'#d9d4c7');
  };
  // The former remote hotel/apartment island has been vacated. Planting now
  // follows the attached tower forecourts, outside traffic and garage openings.
  for(const [x,z] of [[-282,-121],[-252,-112]]) {
    planter(B,x-1.25,z-.7,x+1.25,z+.7,0,x+z,true,'stone');
    trees.push({x,y:.65,z,s:1.2,kind:'round'});
  }
  for(const [x,z] of [[-254,-105]])bench(B,x,0,z,Math.PI);
  // 四栋住宅之间的口袋花园：不占南侧主入口轴线、消防路或地库坡道。
  for(const x of [82,148,214]) {
    lawn(x,-219,17,15);
    for(const z of [-224,-215])trees.push({x:x-5,y:0,z,s:1.0,kind:'round'});
    bench(B,x+5,0,-221,Math.PI/2);bench(B,x+5,0,-216,Math.PI/2);
    planter(B,x-2,-225,x+4,-223.8,0,x,true,'stone');
    bollard(B,x+7,-225);bollard(B,x+7,-212);
  }
}

function segmentBox(B,key,a,b,width,thickness,offset,color) {
  const p=new THREE.Vector3(...a),q=new THREE.Vector3(...b),delta=q.clone().sub(p),len=delta.length();
  if(len<0.05)return;
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),delta.normalize());
  const center=p.add(q).multiplyScalar(0.5);center.y+=offset;
  B.get(key).shape('box',center,rotation,new THREE.Vector3(len,thickness,width),color);
}

/** 新增连接按布局折线生成可见的铺地/桥面/隧道，绝不只留一条导航线。 */
/** 把重叠的轴对齐通道面分割成互不重叠的格子，再取并集边界。 */
export function corridorUnion(rects) {
  const xs=[...new Set(rects.flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);
  const zs=[...new Set(rects.flatMap(r=>[r.z0,r.z1]))].sort((a,b)=>a-b);
  const cells=[];
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++) {
    const x=(xs[i-1]+xs[i])/2,z=(zs[j-1]+zs[j])/2;
    if(rects.some(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1))cells.push({x0:xs[i-1],x1:xs[i],z0:zs[j-1],z1:zs[j]});
  }
  return {cells,edges:mergeSegments(unionOutline(cells))};
}

// Ground promenades stop at the road edge; crossings are road paint, not slabs.
function subtractTraffic(rects, roads) {
  for(const b of roads)rects=rects.flatMap(a=>{
    const x0=Math.max(a.x0,b.x0),x1=Math.min(a.x1,b.x1),z0=Math.max(a.z0,b.z0),z1=Math.min(a.z1,b.z1);
    if(x1<=x0||z1<=z0)return[a];
    return [{x0:a.x0,x1:x0,z0:a.z0,z1:a.z1},{x0:x1,x1:a.x1,z0:a.z0,z1:a.z1},
      {x0,x1,z0:a.z0,z1:z0},{x0,x1,z0:z1,z1:a.z1}].filter(r=>r.x1-r.x0>.001&&r.z1-r.z0>.001);
  });
  return rects;
}

function connections(ctx) {
  const ext=ctx.layout.extensions;if(!ext)return;
  const openings=[...(ctx.layout.site.trenches||[]),...(ctx.layout.site.openings||[])];
  const group=new THREE.Group();group.name='hospitality-connections';
  const B=new BatchSet(ctx.mats.base),underground=[];
  const trafficPolys=[...(ext.roads||[]).flatMap(r=>r.polys||[]),...(ctx.layout.site.roads||[]).flatMap(r=>r.poly?[r.poly]:[])];
  const groundPaths=(ext.paths||[]).filter(p=>p.kind==='ground').flatMap(p=>p.polys.map(polyBounds));
  const networks=new Map();
  for(const path of ext.paths||[]) {
    // New art-district bridges include diagonal and kinked polygons. Their
    // exact unions are rendered separately; legacy hotel/tunnel paths retain
    // the existing rectangle construction and visibility contract.
    if(path.expansion&&['skybridge','underground','garage'].includes(path.kind))continue;
    const below=path.kind==='underground'||path.kind==='garage',sky=path.kind==='skybridge';
    const y=path.points[0][1],key=`${below?'below':sky?'sky':'ground'}:${y}`;
    if(!networks.has(key))networks.set(key,{paths:[],below,sky,y});
    networks.get(key).paths.push(path);
  }
  for(const network of networks.values()) {
    const {paths,below,sky,y}=network;
    const own=below?new THREE.Group():group,PB=below?new BatchSet(ctx.mats.base):B;
    const ceiling=below?new THREE.Group():null,CB=below?new BatchSet(ctx.mats.base):null;
    if(below){own.name=`tower-tunnels-${y}`;own.visible=false;ceiling.name='camera-aware-tunnel-ceiling';underground.push({paths,group:own,ceiling,elevation:y});}
    const sourceRects=paths.flatMap(p=>p.polys.map(polyBounds));
    const {cells,edges}=corridorUnion(below||sky?sourceRects:subtractTraffic(sourceRects,trafficPolys.map(polyBounds)));
    // 门口端盖打开；转角、交叉及支路接入处由并集外边界自然消除内墙。
    const portals=[];
    for(const path of paths)for(const end of [0,path.points.length-1]) {
      const p=path.points[end],q=path.points[end===0?1:end-1],half=path.width/2;
      portals.push(Math.abs(q[0]-p[0])>0.01?{x0:p[0],x1:p[0],z0:p[2]-half,z1:p[2]+half}:{x0:p[0]-half,x1:p[0]+half,z0:p[2],z1:p[2]});
    }
    const boundary=subtractOpenings(edges,portals);
    network.boundary=boundary;
    for(const r of cells) {
      if (!below && !sky) addCutSurfaceSlab(PB,'stone',rectPoly(r),openings,y,.16,'#e5dfd2');
      else PB.get(below?'concrete':'stone').box((r.x0+r.x1)/2,y-(sky?0.15:0.08),(r.z0+r.z1)/2,r.x1-r.x0,sky?0.3:0.16,r.z1-r.z0,'#e5dfd2');
      if(below)CB.get('concrete').box((r.x0+r.x1)/2,y+3.2,(r.z0+r.z1)/2,r.x1-r.x0,0.18,r.z1-r.z0,'#c3c9c7');
      if(sky)PB.get('glassTint').box((r.x0+r.x1)/2,y+3.4,(r.z0+r.z1)/2,r.x1-r.x0,0.045,r.z1-r.z0,'#ffffff');
    }
    for(const e of boundary) {
      const a=[e.x0,y,e.z0],b=[e.x1,y,e.z1];
      if(below) {
        segmentBox(PB,'concrete',a,b,0.2,3.12,1.56,'#d9dbd5');
        segmentBox(PB,'extSatin',a,b,0.22,0.12,0.42,'#406c79');
        segmentBox(PB,'glowSoft',a,b,0.23,0.045,2.93,'#ecf4ef');
      } else if(sky) {
        segmentBox(PB,'glass',a,b,0.035,3.02,1.72,'#ffffff');
        segmentBox(PB,'glowSoft',a,b,0.11,0.035,3.16,'#f4e6c8');
        segmentBox(PB,'extMetal',a,b,0.1,0.07,1.2,'#707d81');
        segmentBox(PB,'extMetal',a,b,0.2,0.18,-0.07,'#555f63');
        const span=Math.hypot(b[0]-a[0],b[2]-a[2]),n=Math.max(1,Math.ceil(span/7));
        for(let i=0;i<n;i++){const p=a.map((v,k)=>v+(b[k]-v)*i/n),q=a.map((v,k)=>v+(b[k]-v)*(i+1)/n);p[1]+=i%2?.28:3.08;q[1]+=i%2?3.08:.28;segmentBox(PB,'extMetal',p,q,.075,.11,0,'#849185');}
      } else if(!trafficPolys.some(p=>pointInPoly([(e.x0+e.x1)/2,(e.z0+e.z1)/2],p))) {
        const r={x0:Math.min(e.x0,e.x1)-(e.x0===e.x1?.07:0),x1:Math.max(e.x0,e.x1)+(e.x0===e.x1?.07:0),
          z0:Math.min(e.z0,e.z1)-(e.z0===e.z1?.07:0),z1:Math.max(e.z0,e.z1)+(e.z0===e.z1?.07:0)};
        addCutSurfaceSlab(PB,'concrete',rectPoly(r),openings,y+.065,.1,'#c4c3ba');
      }
    }
    if(sky)for(const path of paths)for(let i=1;i<path.points.length;i++) {
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[2]-a[2],len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
      const count=Math.max(1,Math.ceil(len/7));
      for(let k=0;k<=count;k++) {
        const t=k/count,x=a[0]+dx*t,z=a[2]+dz*t;
        for(const side of [-1,1]) {
          const px=x+nx*side*path.width/2,pz=z+nz*side*path.width/2;
          // 转角处原段的“外侧”可能落到另一段中心，立柱只准落在并集外缘。
          const onBoundary=boundary.some(e=>{
            const dx=e.x1-e.x0,dz=e.z1-e.z0,l2=dx*dx+dz*dz;
            const t=Math.max(0,Math.min(1,((px-e.x0)*dx+(pz-e.z0)*dz)/l2));
            return Math.hypot(px-e.x0-dx*t,pz-e.z0-dz*t)<0.12;
          });
          if(onBoundary)PB.get('extMetal').box(px,y+1.7,pz,0.1,3.4,0.1,'#747f83');
        }
        segmentBox(PB,'extMetal',[x-nx*path.width/2,y,z-nz*path.width/2],[x+nx*path.width/2,y,z+nz*path.width/2],0.12,0.15,3.4,'#747f83');
        segmentBox(PB,'wood',[x-nx*(path.width/2-.18),y,z-nz*(path.width/2-.18)],[x+nx*(path.width/2-.18),y,z+nz*(path.width/2-.18)],0.16,0.09,3.24,'#e1ccb0');
        if(k>0&&k<count)segmentBox(PB,'extMetal',[x-nx*path.width/2,y,z-nz*path.width/2],[x+nx*path.width/2,y,z+nz*path.width/2],0.12,0.035,.025,'#b1a997');
        if(k>0&&k<count&&k%2===0)for(const side of [-1,1]) {
          const px=x+nx*side*(path.width/2+0.9),pz=z+nz*side*(path.width/2+0.9);
          if(ctx.layout.buildings.some(b=>pointInPoly([px,pz],b.outline))||trafficPolys.some(p=>pointInPoly([px,pz],p))||groundPaths.some(r=>px>r.x0-0.6&&px<r.x1+0.6&&pz>r.z0-0.6&&pz<r.z1+0.6))continue;
          PB.get('concrete').cyl(px,0,pz,0.42,y-0.32,'#c7c6be',10);
          segmentBox(PB,'extMetal',[x,y,z],[px,y,pz],0.3,0.3,-0.3,'#747f83');
          break;
        }
      }
    }
    if(below){PB.flush(own);CB.flush(ceiling);own.add(ceiling);ctx.root.add(own);}
  }
  for(const road of ext.roads||[]) {
    if(ctx.layout.site.roads?.some(r=>r.id===road.id))continue;
    const {cells}=corridorUnion(road.polys.map(polyBounds));
    for(const r of cells)addCutSurfaceSlab(B,'ext',rectPoly(r),openings,.015,.08,'#50585b');
    for(let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i],len=Math.hypot(b[0]-a[0],b[2]-a[2]);
      for(let t=1;t<len-1;t+=5) {
        const aa=a.map((v,k)=>v+(b[k]-v)*t/len),bb=a.map((v,k)=>v+(b[k]-v)*Math.min(t+2.5,len)/len);
        if(openings.some(p=>pointInPoly([aa[0],aa[2]],p)||pointInPoly([bb[0],bb[2]],p)))continue;
        segmentBox(B,'ext',aa,bb,0.12,0.018,road.id.startsWith('west-')?.065:.025,'#ddd9b8');
      }
    }
  }
  B.flush(group);ctx.root.add(group);
  ctx.hospitality.connections=group;ctx.hospitality.underground=underground;
  ctx.hospitality.connectionNetworks=[...networks.values()];
  ctx.hospitality.connectionNetworks.push(...buildExpansionConnections(ctx));
  ctx.dynamic.push({name:'hospitality-ceilings',update(){for(const x of underground)x.ceiling.visible=ctx.camera.position.y<x.elevation+3.0;}});
}


/** Shared surface lots use the same surveyed stall records as navigation and
 * counts. Geometry is instanced; charging pedestals sit behind each stall. */
function sharedSurfaceParking(ctx) {
  const lots=ctx.layout.extensions?.surfaceParking||[];if(!lots.length)return;
  const openings=[...(ctx.layout.site.trenches||[]),...(ctx.layout.site.openings||[])];
  const group=new THREE.Group();group.name='P1-hotel-apartment-shared-parking';
  const B=new BatchSet(ctx.mats.base),cars=[];
  for(const lot of lots) {
    const r=lot.rect,a=lot.aisle;
    addCutSurfaceSlab(B,'ext',rectPoly(r),openings,.0375,.045,'#696d6b');
    addCutSurfaceSlab(B,'ext',rectPoly(a),openings,.043,.05,'#626865');
    for(const [i,s] of lot.stalls.entries()) {
      const side=s.face==='E'||s.face==='W',color=s.type==='ev'?'#718d7e':s.type==='accessible'?'#608ca0':'#b7b6a9';
      B.get('ext').box(s.x,.045,s.z,s.w-.08,.012,s.d-.08,color);
      for(const dx of [-s.w/2,s.w/2])B.get('ext').box(s.x+dx,.058,s.z,.075,.015,s.d,'#efefe1');
      for(const dz of [-s.d/2,s.d/2])B.get('ext').box(s.x,.058,s.z+dz,s.w,.015,.075,'#efefe1');
      const back={N:[0,1],S:[0,-1],E:[-1,0],W:[1,0]}[s.face],bx=s.x+back[0]*2.08,bz=s.z+back[1]*2.08;
      B.get('extSatin').box(bx,.13,bz,side?.16:1.6,.2,side?1.6:.16,'#d2c698');
      if(s.type==='ev') {
        const px=s.x+back[0]*2.68,pz=s.z+back[1]*2.68;
        B.get('extMetal').box(px,.7,pz,side?.22:.42,1.4,side?.42:.22,'#3b554d');
        B.get('glowSoft').box(px-back[0]*.12,1.02,pz-back[1]*.12,side?.035:.24,.25,side?.24:.035,'#a9e0c8');
      }
      if(i%4!==0)cars.push({s,rotation:{N:Math.PI,S:0,E:Math.PI/2,W:-Math.PI/2}[s.face],color:['#e0dfd8','#4e6976','#8f5145','#adb6b7','#3a4346'][i%5]});
    }
    // The large west district uses its surveyed planted-island light poles.
    // Repeating the small-lot corner fixture would place poles inside its bays.
    if(lot.district!=='west-public-parking')for(const x of [r.x0+.5,r.x1-.5])for(const z of [r.z0+.5,r.z1-.5]) {
      B.get('extMetal').cyl(x,0,z,.045,3.3,'#4f5d57',8);
      B.get('glowSoft').box(x,3.3,z,.55,.06,.3,'#ffeaca');
    }
    const c=makeCanvas(768,160),g=c.getContext('2d');g.fillStyle='#2f4944';g.fillRect(0,0,768,160);g.fillStyle='#f3ecdc';g.textAlign='center';g.font=`600 44px ${FONT_CN}`;g.fillText(lot.name,384,65,720);g.font=`28px ${FONT_EN}`;g.fillText(`P · ${lot.stalls.length} SPACES · EV`,384,124);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.5,.95),ctx.mats.sign(canvasTexture(c,{clamp:true})));sign.position.set(r.x1-2.5,2.7,r.z1+.12);group.add(sign);
  }
  for(const ramp of ctx.layout.ramps.filter(r=>['H','A'].includes(r.building)&&r.type.startsWith('street'))) {
    const high=ramp.from.level==='street'?ramp.from:ramp.to,low=ramp.from.level==='street'?ramp.to:ramp.from;
    const len=Math.hypot(high.x-low.x,high.z-low.z),dx=(high.x-low.x)/len,dz=(high.z-low.z)/len,px=dz,pz=-dx;
    const horizontal=Math.abs(dx)>.5;
    for(const side of [-1,1]) {
      const x=high.x+px*side*(ramp.width/2+.35)+dx*1.5,z=high.z+pz*side*(ramp.width/2+.35)+dz*1.5;
      B.get('extMetal').box(x,.7,z,horizontal?.48:.34,1.4,horizontal?.34:.48,'#445c58');
      B.get('extMetal').box(x,2.8,z,.12,2.8,.12,'#64756e');
      B.get('glowSoft').box(x+dx*.25,1.05,z+dz*.25,horizontal?.025:.17,.15,horizontal?.17:.025,'#b3e6d0');
    }
    B.get('extMetal').box(high.x+dx*1.5,4.18,high.z+dz*1.5,horizontal?.25:ramp.width+.85,.14,horizontal?ramp.width+.85:.25,'#596b64');
    B.get('glowSoft').box(high.x+dx*1.5,4.08,high.z+dz*1.5,horizontal?.2:ramp.width,.04,horizontal?ramp.width:.2,'#f0e6c8');
    const c=makeCanvas(512,144),g=c.getContext('2d');g.fillStyle='#284e44';g.fillRect(0,0,512,144);g.fillStyle='#f4ecd6';g.textAlign='center';g.font=`600 45px ${FONT_CN}`;g.fillText(ramp.type==='street-in'?'住客车库入口':'住客车库出口',256,56);g.font=`31px ${FONT_EN}`;g.fillText('B1  /  B2 · 2.6 m',256,113);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.4,1.15),ctx.mats.sign(canvasTexture(c,{clamp:true})));sign.position.set(high.x+dx*1.67,3.54,high.z+dz*1.67);sign.rotation.y=Math.atan2(dx,dz);group.add(sign);
  }
  B.flush(group);
  const geo=ctx.carGeo||carGeometry(),mat=ctx.carMat||new THREE.MeshStandardMaterial({vertexColors:true,roughness:.35,metalness:.45});
  const inst=new THREE.InstancedMesh(geo,mat,cars.length),o=new THREE.Object3D();
  cars.forEach((c,i)=>{o.position.set(c.s.x,.08,c.s.z);o.rotation.y=c.rotation;o.updateMatrix();inst.setMatrixAt(i,o.matrix);inst.setColorAt(i,new THREE.Color(c.color));});
  inst.castShadow=true;inst.receiveShadow=true;group.add(inst);ctx.site.group.add(group);
  ctx.hospitality.surfaceParking=group;
}


/** A small trapezoid joins the surveyed mall side entrance to an attached tower.
 * Its slab is generated by buildShell from the exact layout polygon. */
function attachedDockLobbies(ctx) {
  for(const dock of ctx.layout.extensions?.gateways||[]) {
    const group=new THREE.Group();group.name=dock.id;
    const B=new BatchSet(ctx.mats.base),y=dock.elev,p=dock.poly,below=y<0;
    const sides=[[p[1],p[2]],[p[3],p[0]]];
    const x=dock.outerSeg.x0;
    const outerMin=Math.min(p[2][1],p[3][1]),outerMax=Math.max(p[2][1],p[3][1]);
    for(const [lo,hi] of [[outerMin,dock.outerSeg.z0],[dock.outerSeg.z1,outerMax]])if(hi-lo>.01)sides.push([[x,lo],[x,hi]]);
    for(const [a,b] of sides) {
      const aa=[a[0],y,a[1]],bb=[b[0],y,b[1]];
      segmentBox(B,below?'concrete':'glass',aa,bb,below?.22:.035,3.1,1.6,below?'#d3d7d1':'#ffffff');
      segmentBox(B,'extMetal',aa,bb,.15,.12,3.18,'#6b766e');
      segmentBox(B,'glowSoft',aa,bb,.1,.035,3.08,'#f1e6c8');
      if(!below)segmentBox(B,'extMetal',aa,bb,.12,.07,1.13,'#8f998c');
    }
    for(const a of p)B.get('extMetal').box(a[0],y+1.65,a[1],.12,3.3,.12,'#778378');
    const e=dock.outerSeg;
    segmentBox(B,'wood',[e.x0,y,e.z0],[e.x1,y,e.z1],.35,.18,3.25,'#d3b993');
    B.flush(group);
    const roof=new THREE.ShapeGeometry(shapeFromPoly(dock.poly,[]));roof.rotateX(-Math.PI/2);roof.translate(0,y+3.35,0);
    const ceiling=new THREE.Mesh(roof,ctx.mats.base[below?'concrete':'glassTint']);ceiling.name='dock-camera-aware-ceiling';group.add(ceiling);
    // This is an exterior docking structure: it remains present when the
    // neighbouring tower is selected and P1's interior base is hidden.
    ctx.levels[dock.level].shell.add(group);
    ctx.dynamic.push({name:`${dock.id}-ceiling`,update(){ceiling.visible=ctx.camera.position.y<y+3.2;}});
  }
}

/** The former hotel garage remains below the west parking district. Generic
 * buildShell/buildParking own its floors and bays; only the missing retaining
 * shell and opaque park-support roof are added here. */
function buildPublicGarageShells(ctx) {
  for(const b of ctx.layout.buildings.filter(b=>b.undergroundOnly)) {
    const roofPanels=garageCeilingPanels(b,ctx.layout.site,ctx.layout.levels.filter(l=>l.building===b.id));
    if(b.access?.protected)buildStairApproach(ctx,`${b.id}-G`,`${b.id}-B1`,
      ctx.layout.stairs.filter(s=>s.building===b.id),b.access);
    for(const lv of ctx.layout.levels.filter(l=>l.building===b.id)) {
      if(b.access?.protected)buildMallStairLevel(ctx.levels[lv.id].batch,lv,
        ctx.layout.stairs.filter(s=>s.building===b.id),b.access,{flights:true});
      const group=new THREE.Group();group.name=`${lv.id}-retaining-shell`;
      const B=new BatchSet(ctx.mats.base);
      B.frame(b.frame,()=>{
        if(lv.short==='G') {
          for(const r of b.accessKiosks) {
            const kb={...b,footprint:r};
            for(const e of rectEdges(r))facadeFloor(ctx,B,kb,{...lv,lobbyPlan:true},e,PALETTES.hotel);
            B.get('stone').box((r.x0+r.x1)/2,3.58,(r.z0+r.z1)/2,r.x1-r.x0+.2,.22,r.z1-r.z0+.2,'#c8d0c4');
            B.get('glowSoft').box((r.x0+r.x1)/2,3.4,r.z1+.08,r.x1-r.x0-.5,.08,.12,'#e7ecd1');
          }
        } else for(const e of rectEdges(b.footprint))facadeFloor(ctx,B,b,lv,e,PALETTES.hotel);
        for(const room of lv.rooms.filter(r=>r.garageLift)) {
          for(const r of room.rects.slice(1))B.get('concrete').box((r.x0+r.x1)/2,lv.elev+(lv.height-.24)/2,(r.z0+r.z1)/2,r.x1-r.x0,lv.height-.24,r.z1-r.z0,'#c7cfcb');
          const lift=ctx.layout.elevators.find(e=>e.id===room.garageLift),z=lift.lv+lift.d/2+.03;
          if(!lift.rideable&&!lift.animated) {
            B.get('extMetal').box(lift.lu,lv.elev+1.15,z,1.65,2.3,.05,'#667873');
            B.get('extSatin').box(lift.lu,lv.elev+1.1,z+.04,1.4,2.2,.03,'#c6d1ca');
            B.get('extMetal').box(lift.lu,lv.elev+1.1,z+.06,.025,2.2,.02,'#586e65');
          } else {
            for(const dx of [-.86,.86])B.get('extMetal').box(lift.lu+dx,lv.elev+1.3,z,.07,2.6,.1,'#667873');
            B.get('extMetal').box(lift.lu,lv.elev+2.62,z,1.8,.07,.1,'#667873');
          }
          B.get('glowSoft').box(lift.lu,lv.elev+2.6,z+.05,.55,.18,.04,'#c9e6b9');
        }
        if(lv.short==='B1')for(let x=b.footprint.x0+8;x<b.footprint.x1-5;x+=14)for(let z=b.footprint.z0+8;z<b.footprint.z1-5;z+=16) {
          if(!roofPanels.some(r=>x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1))continue;
          B.get('extMetal').box(x,-.65,z,3.2,.09,.2,'#68736f');
          B.get('glowSoft').box(x,-.71,z,3.0,.025,.16,'#e6eedc');
        }
      });
      B.flush(group);ctx.levels[lv.id].shell.add(group);
      if(lv.short==='B1') {
        const ceiling=new THREE.Group(),RB=new BatchSet(ctx.mats.base);
        const panels=roofPanels;
        RB.frame(b.frame,()=>{for(const r of panels)RB.get('concrete').box((r.x0+r.x1)/2,-.23,(r.z0+r.z1)/2,r.x1-r.x0,.18,r.z1-r.z0,'#c7cfcb');});
        RB.flush(ceiling);ceiling.name='WPG-park-support-ceiling';ceiling.userData.panels=panels;group.add(ceiling);
        ctx.dynamic.push({name:'WPG-camera-aware-ceiling',update(){ceiling.visible=ctx.camera.position.y< -1;}});
      }
    }
  }
}
