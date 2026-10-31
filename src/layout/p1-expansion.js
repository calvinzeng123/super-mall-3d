// Phase-one tour expansion. Physical floorplates, entrances and protected stairs
// are data shared by rendering/navigation; the FPS keeps the original spec.
import clipping from 'polygon-clipping';
import { IDENTITY, frame, rect, rectPoly, roundedRectPoly, polyBounds, polyArea, pointInPoly, lrectPoly, lseg, toW, toL, rectsOverlap, unionOutline, subtractOpenings, convexOverlap } from './geom.js';
import { lift } from './mall.js';
import { prepareMallStairs, buildMallStairAccess } from './mall-stairs.js';
import { CATEGORIES } from './constants.js';
import { addSunkenArtCourt, addWestArrival } from './p1-public-realm.js';

const ELEV = [0, 6.5, 12, 17.5, 23, 28.5, 34, 39.5];
const DEFINITIONS = [
  { id:'P1C', name:'云澜艺文馆', en:'CULTURE TERRACES', zone:'culture', bounds:[-153,-246,-105,-207], radius:12, floors:7, accent:'#b58a5b', cats:['books','studio','home','cafe','edu'], programs:['艺术书店 · 展览大厅','设计师集合 · 艺术长廊','手作工坊 · 生活美学','数字艺术 · 亲子展厅','小剧场 · 创意课堂','观景书吧 · 艺文餐厅','云端艺术沙龙'], inset:[0,0,1,2,3,4,6] },
  { id:'P1S', name:'南庭曲廊', en:'SOUTH DINING TERRACES', zone:'dining', bounds:[-183,-58,-130,-30], radius:12, floors:3, accent:'#a87856', cats:['restaurant','cafe','tea','bar'], programs:['餐饮市集 · 烘焙街','庭院餐厅 · 景观茶室','屋顶餐吧 · 日落露台'], inset:[0,0,2] },
  { id:'P1E', name:'东庭花园馆', en:'EAST GARDEN GALLERY', zone:'garden', bounds:[-60,-166,-25,-128], radius:10, floors:4, accent:'#6f8e74', cats:['home','books','cafe','studio'], programs:['花园客厅 · 地库换乘','生活方式 · 花艺空间','设计展厅 · 手作课堂','花园餐厅 · 空中庭院'], inset:[0,0,1,2] },
  { id:'P1E2', name:'东庭玻璃花房', en:'GLASS GARDEN HOUSE', zone:'garden', bounds:[-60,-112,-25,-97], radius:6, floors:3, accent:'#75978e', cats:['cafe','tea','home'], programs:['植物咖啡 · 花艺零售','茶室 · 生活美学','露台餐厅 · 花园'], inset:[0,0,.8] },
  { id:'P1W1', name:'西里红砖工坊', en:'BRICK ATELIER', zone:'creative', bounds:[-267,-152,-241,-133], radius:4, floors:3, accent:'#9c6048', cats:['studio','books','home'], programs:['手作工坊 · 设计商店','艺术课堂 · 工作室','屋顶展厅 · 小露台'], inset:[0,0,.6] },
  { id:'P1W2', name:'西里石廊书屋', en:'STONE READING HOUSE', zone:'creative', bounds:[-232,-152,-210,-133], radius:4, floors:2, accent:'#b09b76', cats:['books','cafe','studio'], programs:['书屋 · 咖啡','设计展廊 · 阅读露台'], inset:[0,0] },
  { id:'P1W3', name:'西里木构茶舍', en:'TIMBER TEA HOUSE', zone:'creative', bounds:[-263,-122,-239,-107], radius:4, floors:2, accent:'#967a54', cats:['tea','home','studio'], programs:['手作茶舍 · 器物','工艺展厅 · 茶室'], inset:[0,0] },
  { id:'P1W4', name:'西里玻璃艺廊', en:'GLASS ART GALLERY', zone:'creative', bounds:[-230,-122,-210,-107], radius:4, floors:3, accent:'#688c91', cats:['studio','cafe','home'], programs:['艺术商店 · 咖啡','小型展厅 · 创作室','屋顶会客厅'], inset:[0,0,.6] },
];
export const P1_EXPANSION_IDS = DEFINITIONS.map(d => d.id);
const strip = (a,b,width) => {
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  return lrectPoly(frame(a[0],a[1],Math.atan2(dz,dx)*180/Math.PI),rect(-.03,-width/2,len+.03,width/2));
};
const piecesOf = result => result.map(p => ({ outer:p[0].slice(0,-1), holes:p.slice(1).map(h=>h.slice(0,-1)) }));
const subtract = (pieces,polys) => !polys.length ? pieces : pieces.flatMap(p=>piecesOf(clipping.difference([p.outer,...p.holes],...polys.map(poly=>[poly]))).map(q=>({...p,...q})));
const inside = (r,poly) => rectPoly(r).every(p=>pointInPoly(p,poly));
function entrance(layout,lv,to,id,seg,nx,nz,extra={}) {
  const e={id,building:lv.building,level:lv.id,to,name:extra.name||'一期拓展步行入口',seg,nx,nz,width:Math.hypot(seg.x1-seg.x0,seg.z1-seg.z0),extension:true,...extra};
  layout.entrances.push(e); return e;
}
function walk(lv,id,r,kind='corridor') { lv.walk.push({id,kind,frame:IDENTITY,rect:r,poly:rectPoly(r)}); }
function room(stair,lv) {
  return {id:stair.id,type:'stair',label:'安全楼梯',frame:stair.frame,rects:[stair.rect],polys:[stair.poly],doors:[stair.door],wdoors:[stair.wdoor]};
}
function finalizeUnit(u) {u.polys=u.rects.map(r=>lrectPoly(u.frame,r));u.wfronts=u.fronts.map(f=>lseg(u.frame,f));u.brand.catLabel=CATEGORIES[u.brand.cat]?.label||u.brand.cat;u.code||=u.id.replace('-U','-');return u;}
function annexOutline(d,i) {
  const s=d.inset[Math.min(i,d.inset.length-1)]||0,[x0,z0,x1,z1]=d.bounds;
  // North cores stay vertically aligned; terraces step back mainly at the
  // public south side, with small side setbacks and a local seventh level.
  return roundedRectPoly(rect(x0+s*.42,z0+s*.18,x1-s*.42,z1-s),Math.max(2,d.radius-s*.45),6);
}
function buildAnnex(d,picker) {
  const [x0,z0,x1,z1]=d.bounds,cx=(x0+x1)/2,cz=(z0+z1)/2,w=x1-x0,depth=z1-z0;
  const outline=annexOutline(d,0), levels=[];
  const small=depth<22;
  const stairRects=[rect(x0+(small?4:6),z0+(small?1.8:4),x0+(small?8.8:10.8),z0+(small?8.8:12))];
  if(w>45)stairRects.push(rect(x1-11,z0+4,x1-6.2,z0+12));
  const ids=Array.from({length:d.floors+1},(_,i)=>`${d.id}-${i===d.floors?'RF':`${i+1}F`}`);
  const stairs=stairRects.map((r,i)=>({id:`${d.id}-ST${i+1}`,building:d.id,frame:IDENTITY,rect:r,door:{x0:r.x0+1.5,z0:r.z1,x1:r.x0+3,z1:r.z1,side:'S'},doorByLevel:{},serves:ids,expansion:true}));
  prepareMallStairs(stairs);
  for(const s of stairs){s.poly=rectPoly(s.rect);s.wdoor=lseg(s.frame,s.door);s.wdoorByLevel={};}
  const liftX=d.id==='P1E'?x0+7:(small?x1-5.6:x0+16.5),liftZ=d.id==='P1E'?z0+22:z0+(small?4.2:7);
  const elevators=[{...lift(`${d.id}-GL1`,d.id,'glass',IDENTITY,liftX,liftZ,2.8,3,'S',ids),expansion:true,animated:true}];
  for(let i=0;i<=d.floors;i++) {
    const roof=i===d.floors,short=roof?'RF':`${i+1}F`,poly=annexOutline(d,i),next=annexOutline(d,i+1);
    const terracePieces=roof?[{outer:poly,holes:[]}]:piecesOf(clipping.difference([poly],[next]));
    const terraces=terracePieces.map(p=>p.outer);
    const lv={id:ids[i],building:d.id,short,name:roof?'RF 屋顶花园':`${short} ${d.programs[i]}`,kind:roof?'roof':'retail',elev:ELEV[i],height:roof?4:(ELEV[i+1]-ELEV[i]),
      outline:poly,theme:{key:d.zone,floor:roof?'deck-garden':d.zone==='creative'?'wood-warm':'terrazzo-warm',accent:d.accent,label:d.programs[i]||'屋顶花园 · 观景平台'},
      units:[],rooms:[],walk:[],voids:[],features:[],slab:{pieces:[{outer:poly,holes:[]}]},
      expansion:{zone:d.zone,style:d.zone,accent:d.accent,storey:i+1,storeys:d.floors,facadePoly:roof?poly:next,facadePolys:[roof?poly:next],terraces,terrace:{floorPolys:terraces,pieces:terracePieces,enclosedPolys:roof?[]:[next]},bounds:polyBounds(poly),program:d.programs[i]||'屋顶花园',roof}};
    lv.walk.push({id:`${lv.id}-public`,kind:roof?'deck':'gallery',poly,frame:IDENTITY,lpoly:poly});
    for(const s of stairs)lv.rooms.push(room(s,lv));
    // Small pavilions use an open gallery with a fully furnished tenant at
    // either side; large galleries also carry side shops, around a public core.
    if(!roof) {
      const env=polyBounds(next),storeDepth=small?3.2:6.2,margin=Math.min(d.radius+1,w/2-6);
      const candidates=[
        rect(env.x0+margin,env.z1-storeDepth-1,cx-2.5,env.z1-1),
        rect(cx+2.5,env.z1-storeDepth-1,env.x1-margin,env.z1-1),
      ];
      if(depth>30)candidates.push(rect(env.x0+2.5,z0+15,env.x0+9,z0+23),rect(env.x1-9,z0+15,env.x1-2.5,z0+23));
      const reserved=stairRects.concat([rect(liftX-2,liftZ-2,liftX+2,liftZ+4)]);
      if(d.id==='P1C'&&i===0)reserved.push(rect(-142,-229,-134,-220));
      if(d.id==='P1E'&&i===0)reserved.push(rect(-49,-164,-34,-153),rect(-42,-149,-34,-140));
      let n=0;
      for(const r of candidates) {
        if(r.x1-r.x0<3||r.z1-r.z0<3||!inside(r,next)||reserved.some(q=>rectsOverlap(r,q)))continue;
        const f={x0:r.x0,z0:r.z0,x1:r.x1,z1:r.z0,side:'N'};
        lv.units.push(finalizeUnit({id:`${lv.id}-U${++n}`,slot:`${d.id}-${n}`,building:d.id,level:lv.id,frame:IDENTITY,rects:[r],fronts:[f],brand:picker.take(d.cats[(i+n-1)%d.cats.length]),style:'glass',expansion:true}));
      }
      if(!small&&!(d.id==='P1E'&&i===0)) {
        const r=rect(cx+4.5,z0+3,cx+10.5,z0+8.5),door={x0:cx+6,z0:r.z1,x1:cx+8,z1:r.z1,side:'S'};
        if(inside(r,next)&&!reserved.some(q=>rectsOverlap(r,q)))lv.rooms.push({id:`${lv.id}-WC`,type:'wc',label:'公共洗手间 · 无障碍卫生间',frame:IDENTITY,rects:[r],polys:[rectPoly(r)],doors:[door],wdoors:[lseg(IDENTITY,door)],publicAccess:true});
      }
      if(d.id==='P1C'&&i>0){const r=rect(-125,-231,-119,-225),hole=roundedRectPoly(r,1.8,5);lv.voids.push({id:`${lv.id}-atrium`,kind:'atrium',frame:IDENTITY,rect:r,poly:hole});lv.slab.pieces[0].holes.push(hole);}
    }
    levels.push(lv);
  }
  const b={id:d.id,code:d.id,short:d.name,name:`一期 · ${d.name}`,en:d.en,kind:'annex',campusGroup:'P1',levels:ids,outline,center:[cx,cz],radius:Math.hypot(w,depth)/2,plot:rect(-286,-256,-16,-20),wings:[],rotundas:[],expansion:{...d,storeys:d.floors,bounds:rect(...d.bounds)}};
  b.access=buildMallStairAccess(b,levels,stairs);
  return {building:b,levels,stairs,elevators,escalators:[],entrances:[],ramps:[]};
}

function subtractRect(source,cut) {
  const x0=Math.max(source.x0,cut.x0),x1=Math.min(source.x1,cut.x1),z0=Math.max(source.z0,cut.z0),z1=Math.min(source.z1,cut.z1);
  if(x0>=x1||z0>=z1)return [source];
  return [rect(source.x0,source.z0,x0,source.z1),rect(x1,source.z0,source.x1,source.z1),rect(x0,source.z0,x1,z0),rect(x0,z1,x1,source.z1)].filter(r=>r.x1-r.x0>.05&&r.z1-r.z0>.05);
}
function trimUnits(lv,cuts) {
  for(const u of lv.units) {
    const localCuts=cuts.map(p=>polyBounds(p.map(q=>toL(u.frame,...q))));
    let rs=u.rects;
    for(const c of localCuts)rs=rs.flatMap(r=>subtractRect(r,c));
    u.rects=rs;
    u.fronts=u.fronts.flatMap(f=>rs.flatMap(r=>{
      if(Math.abs(f.z1-f.z0)<.001&&[r.z0,r.z1].some(z=>Math.abs(z-f.z0)<.001)) {
        const a=Math.max(r.x0,f.x0),b=Math.min(r.x1,f.x1);return b-a>2.5?[{...f,x0:a,x1:b}]:[];
      }
      if(Math.abs(f.x1-f.x0)<.001&&[r.x0,r.x1].some(x=>Math.abs(x-f.x0)<.001)) {
        const a=Math.max(r.z0,f.z0),b=Math.min(r.z1,f.z1);return b-a>2.5?[{...f,z0:a,z1:b}]:[];
      }
      return [];
    }));
    finalizeUnit(u);
  }
  lv.units=lv.units.filter(u=>u.rects.length&&u.fronts.length);
}
function mainTerraces(layout) {
  const cuts=d=>d?[rectPoly(rect(-278,-160-d,-216,-159)),rectPoly(rect(-239,-241,-212,-240+Math.min(d,12))),rectPoly(rect(-281,-198,-280+Math.min(d,16),-182))]:[];
  const depths={'3F':0,'4F':6,'5F':12,'6F':16,RF:20};
  for(const lv of layout.levels.filter(l=>l.building==='P1'&&l.short in depths)) {
    const d=depths[lv.short],next=lv.short==='3F'?6:lv.short==='4F'?12:lv.short==='5F'?16:20;
    const floorCuts=cuts(d),envelopeCuts=cuts(next);
    lv.slab.pieces=subtract(lv.slab.pieces,floorCuts);
    const footprint=subtract([{outer:lv.outline,holes:[]}],floorCuts);
    const envelope=subtract([{outer:lv.outline,holes:[]}],envelopeCuts);
    const terraces=footprint.flatMap(p=>piecesOf(clipping.difference([p.outer],...envelope.map(x=>[x.outer]))).map(x=>x.outer));
    trimUnits(lv,envelopeCuts);
    lv.units=lv.units.filter(u=>!['SQ-S4','SQ-N4'].includes(u.slot));
    lv.walk=lv.walk.flatMap(w=>subtract([{outer:w.poly,holes:[]}],floorCuts).map((p,i)=>({...w,id:`${w.id}-setback-${i}`,poly:p.outer})));
    for(const [i,p]of terraces.entries())lv.walk.push({id:`${lv.id}-terrace-${i}`,kind:'deck',frame:IDENTITY,lpoly:p,poly:p,outdoor:true});
    walk(lv,`${lv.id}-terrace-south-access`,rect(-228,-182,-212,-160-d),'passage');
    walk(lv,`${lv.id}-terrace-north-access`,rect(-224,-240+Math.min(d,12),-216,-224),'passage');
    lv.features=lv.features.filter(f=>{const ps=f.rect?lrectPoly(f.frame,f.rect):f.lu!==undefined?[toW(f.frame,f.lu,f.lv)]:[];return !ps.some(q=>floorCuts.some(p=>pointInPoly(q,p)));});
    if(lv.short==='RF') {
      if(!lv.features.some(f=>f.type==='viewdeck'))lv.features.push({type:'viewdeck',frame:IDENTITY,rect:rect(-239,-225,-213,-214),name:'方庭退台观景台',expansion:true});
      if(!lv.features.some(f=>f.type==='farm'))lv.features.push({type:'farm',frame:IDENTITY,rect:rect(-278,-232,-260,-213),name:'方庭屋顶农园',en:'SKY FARM',expansion:true});
      if(!lv.features.some(f=>f.type==='cinema-open'))lv.features.push({type:'cinema-open',frame:IDENTITY,rect:rect(-198,-222,-174,-190),screen:'E',name:'星空露天影院',en:'ROOFTOP CINEMA',expansion:true});
    }
    lv.expansion={zone:'main',style:'art-terraces',accent:lv.theme.accent,storey:lv.short==='RF'?7:parseInt(lv.short),storeys:6,facadePoly:envelope[0].outer,facadePolys:envelope.map(p=>p.outer),terraces,terrace:{floorPolys:terraces},floorPolys:footprint.map(p=>p.outer),roof:lv.kind==='roof'};
    // Public south-east ends of the terrace bands open onto the retained
    // perimeter corridor; a real façade opening provides the same access.
    if(terraces.length) {
      entrance(layout,lv,lv.id,`${lv.id}-terrace-door`,{x0:-216,z0:-160-next+1,x1:-216,z1:-160-next+4},-1,0,{architecturalOpening:true,name:'露台步行门'});
      if(Math.min(next,12)>Math.min(d,12))entrance(layout,lv,lv.id,`${lv.id}-terrace-north-door`,{x0:-222,z0:-240+Math.min(next,12),x1:-218,z1:-240+Math.min(next,12)},0,-1,{architecturalOpening:true,name:'阅读露台入口'});
      if(Math.min(next,16)>Math.min(d,16))entrance(layout,lv,lv.id,`${lv.id}-terrace-west-door`,{x0:-280+d+.6,z0:-198,x1:-280+Math.min(next,16)-.6,z1:-198},0,1,{architecturalOpening:true,name:'西侧露台入口'});
    }
  }
}

function addBridge(layout,id,owner,target,points,startSeg,endSeg,startNormal,endNormal,width=4.8) {
  const polys=points.slice(1).map((b,i)=>strip(points[i],b,width));
  for(const [x,z]of points.slice(1,-1))polys.push(rectPoly(rect(x-width/2,z-width/2,x+width/2,z+width/2)));
  // Union joins prevents doubled slabs and leaves no diagonal corner gaps.
  const slab={pieces:piecesOf(clipping.union(...polys.map(p=>[p])))};
  const path={id,kind:'skybridge',name:'一期二层艺术环廊',building:owner.building,level:owner.id,from:owner.id,to:target.id,width,height:3.7,points:points.map(([x,z])=>[x,owner.elev,z]),polys,slab,expansion:true};
  layout.extensions.paths.push(path);
  for(const [i,p]of slab.pieces.entries())owner.walk.push({id:`${id}-walk-${i}`,kind:'skybridge',frame:IDENTITY,lpoly:p.outer,poly:p.outer,extension:true});
  entrance(layout,owner,owner.id,`${id}-start`,startSeg,...startNormal,{architecturalOpening:true,name:path.name});
  entrance(layout,target,owner.id,`${id}-target`,endSeg,...endNormal,{name:path.name});
  entrance(layout,owner,target.id,`${id}-arrival`,endSeg,-endNormal[0],-endNormal[1],{name:path.name});
  for(const [lv,seg,n,key]of [[owner,startSeg,startNormal,'owner'],[target,endSeg,endNormal,'target']]) {
    if(!P1_EXPANSION_IDS.includes(lv.building))continue;
    const b=polyBounds(lv.expansion.facadePoly),vertical=Math.abs(seg.x1-seg.x0)<.1;
    const shifted=vertical?{...seg,x0:n[0]>0?b.x1:b.x0,x1:n[0]>0?b.x1:b.x0}:{...seg,z0:n[1]>0?b.z1:b.z0,z1:n[1]>0?b.z1:b.z0};
    entrance(layout,lv,lv.id,`${id}-inner-${key}`,shifted,...n,{architecturalOpening:true,name:path.name});
  }
  layout.extensions.connections.push({id,from:owner.id,to:target.id,seg:endSeg});
  layout.expansion.routes.push({id,from:owner.id,to:target.id,points:path.points,portal:endSeg});
}
function integrateGarageKiosks(layout) {
  const ground=layout.levels.find(l=>l.id==='P1-1F');
  for(const [bid,ids]of [['P1C',['P1-SHARED-L1']],['P1E',['P1-SHARED-L4','P1-SHARED-ST4']]]) {
    const lv=layout.levels.find(l=>l.id===`${bid}-1F`);
    for(const id of ids){
      const kiosk=ground.garageKiosks.find(k=>k.id===id);if(!kiosk)continue;
      lv.slab.pieces=subtract(lv.slab.pieces,[kiosk.poly]);
      lv.integratedGarageKiosks||=[];lv.integratedGarageKiosks.push({id,owner:ground.id,poly:kiosk.poly});
      const e=layout.entrances.find(e=>e.id===`${id}-entry`);e.to=lv.id;e.name='艺文街区 · 共享地库换乘厅';
      entrance(layout,lv,ground.id,`${id}-annex-entry`,e.seg,-e.nx,-e.nz,{name:e.name,coveredConnection:true});
    }
  }
}
function groundEntrances(layout) {
  for(const d of DEFINITIONS) {
    const lv=layout.levels.find(l=>l.id===`${d.id}-1F`),[x0,z0,x1,z1]=d.bounds,cx=(x0+x1)/2,cz=(z0+z1)/2;
    for(const [side,seg,n]of [
      ['S',{x0:cx-2.2,z0:z1,x1:cx+2.2,z1},[0,1]],
      ['N',{x0:cx-2.2,z0,x1:cx+2.2,z1:z0},[0,-1]],
    ])entrance(layout,lv,'site',`${d.id}-${side}`,seg,...n,{main:side==='S',name:`${d.name}${side==='S'?'南':'北'}入口`});
    layout.site.walk.push({id:`${d.id}-arrival`,kind:'plaza',outdoor:true,poly:rectPoly(rect(cx-3,z1,cx+3,z1+3))});
  }
  // Only usable open terraces get additional doors. Bridge façade thresholds
  // are added by addBridge; ornamental narrow setbacks stay behind a railing.
  for(const lv of layout.levels.filter(l=>P1_EXPANSION_IDS.includes(l.building)&&l.kind!=='roof')) {
    const b=polyBounds(lv.expansion.facadePoly),outer=polyBounds(lv.outline),cx=(b.x0+b.x1)/2;
    if(outer.z1-b.z1>=1.8)entrance(layout,lv,lv.id,`${lv.id}-inner-S`,{x0:cx-2.4,z0:b.z1,x1:cx+2.4,z1:b.z1},0,1,{architecturalOpening:true,name:'公共露台入口'});
  }
}
function connectLoop(layout) {
  const lv=id=>layout.levels.find(l=>l.id===id),p1=lv('P1-2F');
  const h=(x,z,w=4.8)=>({x0:x-w/2,z0:z,x1:x+w/2,z1:z});
  const v=(x,z,w=4.8)=>({x0:x,z0:z-w/2,x1:x,z1:z+w/2});
  // Reuse the square's east lounge, and open the former S4 storefront as a
  // public south vestibule rather than driving a bridge through a tenant.
  p1.units=p1.units.filter(u=>u.slot!=='SQ-S4');walk(p1,'P1-art-south-hall',rect(-228,-176,-212,-160),'entrance');
  addBridge(layout,'P1-ART-C',p1,lv('P1C-2F'),[[-160,-200],[-129,-200],[-129,-207]],v(-160,-200),h(-129,-207),[1,0],[0,1]);
  addBridge(layout,'P1-ART-W2',p1,lv('P1W2-2F'),[[-221,-160],[-221,-152]],h(-221,-160),h(-221,-152),[0,1],[0,-1]);
  addBridge(layout,'P1-ART-W1',lv('P1W2-2F'),lv('P1W1-2F'),[[-232,-140.5],[-241,-140.5]],v(-232,-140.5,3),v(-241,-140.5,3),[-1,0],[1,0],3);
  addBridge(layout,'P1-ART-W4',lv('P1W2-2F'),lv('P1W4-2F'),[[-221,-133],[-220,-122]],h(-221,-133),h(-220,-122),[0,1],[0,-1],3.8);
  addBridge(layout,'P1-ART-W3',lv('P1W4-2F'),lv('P1W3-2F'),[[-230,-112.2],[-239,-112.2]],v(-230,-112.2,2.2),v(-239,-112.2,2.2),[-1,0],[1,0],2.2);
  const south=layout.entrances.find(e=>e.id==='P1-S'),east=layout.entrances.find(e=>e.id==='P1-E');
  const mid=s=>[(s.x0+s.x1)/2,(s.z0+s.z1)/2];
  addBridge(layout,'P1-ART-S',p1,lv('P1S-2F'),[mid(south.seg),[-122,-62],[-156.5,-62],[-156.5,-58]],south.seg,h(-156.5,-58),[south.nx,south.nz],[0,-1]);
  addBridge(layout,'P1-ART-E',p1,lv('P1E-2F'),[mid(east.seg),[-63,-120],[-42.5,-120],[-42.5,-128]],east.seg,h(-42.5,-128),[east.nx,east.nz],[0,1]);
  addBridge(layout,'P1-ART-E2',p1,lv('P1E2-2F'),[[-42.5,-120],[-42.5,-112]],h(-42.5,-120),h(-42.5,-112),[0,1],[0,-1]);
  const main=layout.buildings.find(b=>b.id==='P1'),n=main.wings.find(w=>w.id==='N');
  const north=toW(n.F,n.uEnd,0),northSeg=lseg(n.F,{x0:n.uEnd,z0:-2.4,x1:n.uEnd,z1:2.4,side:'E'});
  addBridge(layout,'P1-ART-C-RETURN',lv('P1C-2F'),p1,[[-105,-220.5],[-99,-220.5],[-99,-201],[north[0],-201],north],v(-105,-220.5,2.8),northSeg,[1,0],[northSeg.nx,northSeg.nz]);
  // West village rejoins the existing west-wing lounge beside the hotel's
  // already surveyed connector; the hotel itself stays at its original dock.
  const w=main.wings.find(w=>w.id==='W'),west=toW(w.F,73,23),westSeg=lseg(w.F,{x0:70.6,z0:23,x1:75.4,z1:23,side:'S'});
  const hall=rect(69.8,7,76.2,23),hallPoly=lrectPoly(w.F,hall);
  trimUnits(p1,[hallPoly]);
  p1.walk.push({id:'P1-art-west-return-hall',kind:'passage',frame:w.F,rect:hall,poly:hallPoly});
  addBridge(layout,'P1-ART-W-RETURN',lv('P1W4-2F'),p1,[[-210,-114.5],[-197,-114.5],west],v(-210,-114.5),westSeg,[1,0],[westSeg.nx,westSeg.nz],3.8);
}
function reclaimForecourt(layout) {
  const s=layout.site,fc=s.forecourt,removed=new Set(['events','north-garden','east-garden']);
  const goneIds=new Set(fc.items.filter(i=>removed.has(i.zone)).map(i=>i.id));
  fc.items=fc.items.filter(i=>!removed.has(i.zone));fc.obstacles=fc.obstacles.filter(o=>!goneIds.has(o.id));fc.zones=fc.zones.filter(z=>!removed.has(z.id));
  s.walk=s.walk.filter(w=>!removed.has(w.id));
  layout.extensions.roads=layout.extensions.roads.filter(r=>r.id!=='hotel-arrival');
  // Keep the original named promenade routes, except the north reading spur
  // now stops at the new arts building's real south doorway.
  const p=fc.paths.find(p=>p.id==='north-reading');p.points=[[-160,-200],[-129,-200],[-129,-205.8]];p.polys=p.points.slice(1).map((b,i)=>strip(p.points[i],b,p.width));
  s.walk=s.walk.filter(w=>!w.id.startsWith('north-reading-'));
  for(const [i,poly]of p.polys.entries())s.walk.push({id:`north-reading-${i}`,kind:'promenade',poly,outdoor:true});
  s.activityExclusions=[...fc.zones.map(z=>z.poly),...fc.paths.flatMap(p=>p.polys),...DEFINITIONS.map(d=>annexOutline(d,0))];
}
// Each island is a measured furniture group, not a random scatter. Its full
// rectangle is also the conservative navigation footprint; the renderer keeps
// chairs, screens and plant pots within it. Public axes and all approaches stay
// available regardless of the themed furniture chosen on a particular floor.
function addPublicFixtures(layout) {
  const grow=(r,n)=>rect(r.x0-n,r.z0-n,r.x1+n,r.z1+n);
  const byBuilding={
    P1C:[
      [-122,-227.8,4.4,4,'installation'],
      [-136.5,-232.4,4,1.6,'gallery'],
      [-139.6,-228.9,3.6,2.8],[-134.2,-228.9,3.6,2.8],
      [-139.6,-224.2,3.6,2.6],[-134.2,-224.2,3.6,2.6],
      [-123.3,-234,2.8,2.2,'gallery'],[-117.8,-234,2.8,2.2,'gallery'],
      [-145,-217,3,2],[-112.7,-217,2.6,2],
    ],
    P1S:[[-161.6,-46.1,3.4,2.8],[-149.6,-45.6,3.4,2.8],[-179,-42.5,2.2,3],[-133.4,-42.8,2,3]],
    P1E:[[-37.5,-147,2.6,3.8],[-55,-135.7,2.4,2.6],[-29.3,-155.4,2,2.8],[-30.2,-138,2,3],[-57.4,-149.7,2,3.2]],
    P1E2:[[-47.4,-108.5,2.6,2.5],[-36.8,-108.5,2.6,2.5]],
    P1W1:[[-250,-148.7,1.6,2,'installation'],[-264.6,-140.5,1.4,1.8,'gallery'],[-256.6,-147.3,1,1.8,'gallery']],
    P1W2:[[-230.3,-146.7,1,2,'gallery'],[-211.3,-142.4,.9,2,'installation']],
    P1W3:[[-247.6,-119,1,1.8,'workshop'],[-261.3,-116.8,1,2,'gallery']],
    P1W4:[[-228.4,-116.5,.9,2,'gallery'],[-211.8,-119.3,.8,1.6,'installation']],
  };
  const cultureThemes=[['reading','gallery','installation'],['gallery','reading','installation'],['workshop','gallery','reading'],['installation','gallery','workshop'],['workshop','reading','gallery'],['reading','cafe','gallery'],['gallery','cafe','reading']];
  for(const lv of layout.levels.filter(l=>P1_EXPANSION_IDS.includes(l.building)&&l.kind!=='roof')) {
    const building=layout.buildings.find(b=>b.id===lv.building),[cx]=building.center,small=building.expansion.bounds.z1-building.expansion.bounds.z0<22;
    const guards=[rect(cx-(small?1.8:2.8),building.expansion.bounds.z0,cx+(small?1.8:2.8),building.expansion.bounds.z1)];
    if(lv.building==='P1C')guards.push(rect(-153,-222.1,-105,-218.9));
    for(const u of lv.units) {
      guards.push(...u.polys.map(p=>grow(polyBounds(p),.7)));
      for(const f of u.wfronts) {
        const p=[[f.x0,f.z0],[f.x1,f.z1],[f.x0+f.nx*2,f.z0+f.nz*2],[f.x1+f.nx*2,f.z1+f.nz*2]];
        guards.push(grow(polyBounds(p),.35));
      }
    }
    for(const r of lv.rooms) {
      guards.push(...r.polys.map(p=>grow(polyBounds(p),.75)));
      for(const d of r.wdoors||[])guards.push(grow(polyBounds([[d.x0,d.z0],[d.x1,d.z1],[d.x0+d.nx*2.1,d.z0+d.nz*2.1],[d.x1+d.nx*2.1,d.z1+d.nz*2.1]]),.4));
    }
    for(const e of layout.elevators.filter(e=>e.serves.includes(lv.id))) {
      const r=rect(e.x-e.w/2-.65,e.z-e.d/2-.65,e.x+e.w/2+.65,e.z+e.d/2+.65);
      if(e.nx>0)r.x1+=2.6;if(e.nx<0)r.x0-=2.6;if(e.nz>0)r.z1+=2.6;if(e.nz<0)r.z0-=2.6;
      guards.push(r);
    }
    for(const k of lv.integratedGarageKiosks||[])guards.push(grow(polyBounds(k.poly),.85));
    for(const e of layout.entrances.filter(e=>e.level===lv.id)) {
      const s=e.seg,points=[[s.x0-e.nx*3.4,s.z0-e.nz*3.4],[s.x1-e.nx*3.4,s.z1-e.nz*3.4],[s.x0+e.nx*.8,s.z0+e.nz*.8],[s.x1+e.nx*.8,s.z1+e.nz*.8]];
      guards.push(grow(polyBounds(points),.55));
    }
    const kinds=lv.building==='P1C'?cultureThemes[parseInt(lv.short)-1]:lv.expansion.zone==='dining'?['cafe','cafe','garden']:lv.expansion.zone==='garden'?['garden','installation','reading']:['gallery','workshop','reading'];
    const cap=lv.building==='P1C'?(parseInt(lv.short)>=6?6:8):4,fixtures=[];
    for(const [index,candidate]of byBuilding[lv.building].entries()) {
      const [x,z,w,d,forced]=candidate,r=rect(x-w/2,z-d/2,x+w/2,z+d/2),poly=rectPoly(r),margin=rectPoly(grow(r,.22));
      if(!margin.every(p=>pointInPoly(p,lv.expansion.facadePoly)))continue;
      if(!margin.every(p=>lv.slab.pieces.some(s=>pointInPoly(p,s.outer)&&!s.holes.some(h=>pointInPoly(p,h)))))continue;
      if(lv.voids.some(v=>convexOverlap(poly,v.poly)||pointInPoly([x,z],v.poly)))continue;
      if(guards.some(g=>rectsOverlap(r,g))||fixtures.some(f=>rectsOverlap(grow(r,.55),f.rect)))continue;
      const kind=forced||kinds[(index+parseInt(lv.short)-1)%kinds.length];
      fixtures.push({id:`${lv.id}-public-${index+1}`,kind,rect:r,poly,accent:lv.theme.accent,variant:(index+parseInt(lv.short)*3)%7,zone:lv.expansion.zone,program:lv.expansion.program});
      if(fixtures.length===cap)break;
    }
    lv.expansion.publicFixtures=fixtures;
  }
}
export function applyP1Expansion(layout,picker) {
  layout.expansion={version:1,group:'P1',buildingIds:['P1',...P1_EXPANSION_IDS],routes:[],tourOnly:true};
  for(const lv of layout.levels.filter(l=>l.building==='P1'&&['4F','5F','6F'].includes(l.short)))for(const u of lv.units){u.brand=picker.take(u.brand.cat);finalizeUnit(u);}
  mainTerraces(layout);
  for(const d of DEFINITIONS){const p=buildAnnex(d,picker);layout.buildings.push(p.building);for(const k of ['levels','stairs','elevators','escalators','entrances','ramps'])layout[k].push(...p[k]);}
  groundEntrances(layout);integrateGarageKiosks(layout);connectLoop(layout);reclaimForecourt(layout);addSunkenArtCourt(layout);addWestArrival(layout);
  addPublicFixtures(layout);
  return layout;
}
