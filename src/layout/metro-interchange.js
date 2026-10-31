// Full-tour interchange: L7 (E/W) above L12 (N/S), with a separate paid transfer floor.
import { frame, IDENTITY, rect, rectPoly, lrectPoly, lpoly, lseg, toW, pointInPoly } from './geom.js';
import { carve } from './metro.js';
import { ESC } from './constants.js';
import { lift } from './mall.js';
import { prepareMallStairs, buildMallStairAccess } from './mall-stairs.js';

export const INTERCHANGE = {
  concourse: rect(-68,-26,68,26), platform: rect(-60,-6,60,6),
  sides: [rect(-60,-19,-60+120,-9.2),rect(-60,9.2,60,19)],
  station: rect(-66,-20.8,66,20.8), track: 7.6, tunnelEnd: 260,
};
const level = (short,name,kind,elev,accent) => ({id:`M-${short}`,building:'M',short,name,kind,elev,height:7.5,
  theme:{key:`metro-${short}`,floor:'metro-terrazzo',accent,label:name},outline:[],units:[],rooms:[],walk:[],voids:[],features:[],slab:{pieces:[]}});
const walk = (id,kind,poly) => ({id,kind,poly,frame:IDENTITY,lpoly:poly});

export function applyMetroInterchange(layout) {
  const b=layout.buildings.find(b=>b.id==='M');if(!b)return;
  const old=layout.levels.find(l=>l.id==='M-B1');
  const B1=level('B1','B1 双线站厅','concourse',-4.5,'#b43d42');B1.height=4;
  const B2=level('B2','B2 · 7号线 东西向','platform',-12,'#b43d42');
  const B3=level('B3','B3 十字换乘厅','concourse',-19.5,'#267d90');
  const B4=level('B4','B4 · 12号线 南北向','platform',-27,'#187b9f');
  B1.theme.label='双线站厅 · 售票 / 24 条闸机通道';
  B2.theme.label='7号线站台 · 东西向 · 中央下车 / 两侧上车';
  B3.theme.label='十字换乘厅 · 7 ↔ 12 号线';
  B4.theme.label='12号线站台 · 南北向 · 中央下车 / 两侧上车';
  const levels=[B4,B3,B2,B1], byId=Object.fromEntries(levels.map(l=>[l.id,l]));
  const platforms=[{id:'central',role:'alight',rect:INTERCHANGE.platform},...INTERCHANGE.sides.map((r,i)=>({id:i?'south':'north',role:'board',rect:r}))];
  const lines=[{id:'7',level:B2.id,frame:IDENTITY,color:'#b43d42',name:'7 号线',directions:['往云澜里','往星湾'],phase:0},
    {id:'12',level:B4.id,frame:frame(0,0,90,'M-L12'),color:'#187b9f',name:'12 号线',directions:['往北环新城','往南站'],phase:17}]
    .map(l=>({...l,box:INTERCHANGE.station,platform:INTERCHANGE.platform,platforms,track:7.6,train:{cars:6,len:19,w:3},tunnelEnd:260,span:260,dualDoors:true}));
  for(const line of lines){
    const lv=byId[line.level];lv.metroLine=line.id;lv.theme.floor='metro-platform';lv.outline=lrectPoly(line.frame,line.box);
    lv.slab.pieces=platforms.map(p=>({outer:lrectPoly(line.frame,p.rect),holes:[]}));
    lv.walk=platforms.map(p=>walk(`M-${line.id}-${p.id}`,'platform',lrectPoly(line.frame,p.rect)));
    for(const z of [-9.2,-6,6,9.2]){
      const a=toW(line.frame,-60,z),c=toW(line.frame,60,z);
      (lv.navWalls ||= []).push({x0:a[0],z0:a[1],x1:c[0],z1:c[1]});
    }
    lv.features.push(...[-1,1].map(s=>({type:'rail',z:s*line.track,dir:s,name:line.directions[s<0?0:1],frame:line.frame})));
  }
  B1.outline=rectPoly(INTERCHANGE.concourse);B1.slab.pieces=[{outer:B1.outline,holes:[]}];
  // Preserve the four passage endpoints, exits, and the art court's side portal.
  for(const p of b.passages){
    const sg=Math.sign(p.F.s*p.F.c),mouth=26*Math.SQRT2;
    p.lpoly=[[mouth+p.hw*sg,-p.hw],[p.uEnd,-p.hw],[p.uEnd,p.hw],[mouth-p.hw*sg,p.hw]];
    p.poly=lpoly(p.F,p.lpoly);p.u0=mouth-p.hw;
    B1.walk.push(walk(p.id,'passage',p.poly));B1.slab.pieces.push({outer:p.poly,holes:[]});
  }
  for(const w of old.walk.filter(w=>w.kind==='exit')){B1.walk.push(w);B1.slab.pieces.push({outer:w.poly,holes:[]});}
  B1.units=old.units;
  for(const u of B1.units){const dz=u.slot==='W'?-15:15;u.rects=u.rects.map(r=>({...r,z0:r.z0+dz,z1:r.z1+dz}));u.fronts=u.fronts.map(f=>({...f,z0:f.z0+dz,z1:f.z1+dz}));u.polys=u.rects.map(r=>lrectPoly(u.frame,r));u.wfronts=u.fronts.map(f=>lseg(u.frame,f));}
  B1.rooms=old.rooms.filter(r=>['wc','equip'].includes(r.type)).map(r=>{
    const dz=r.type==='wc'?-15:15,rects=r.rects.map(q=>({...q,z0:q.z0+dz,z1:q.z1+dz})),doors=r.doors.map(q=>({...q,z0:q.z0+dz,z1:q.z1+dz}));
    return {...r,rects,doors,polys:rects.map(rectPoly),wdoors:doors.map(q=>lseg(IDENTITY,q))};
  });
  for(const x of [-59,59])for(const [z0,z1]of [[-18,-10],[10,18]])B1.features.push({type:'gates',x,z0,z1,pitch:1.3,name:'进出站闸机'});
  for(const z of [-20,20])B1.features.push({type:'fence',x0:-59,x1:59,z});
  B1.navWalls=[];
  for(const x of [-59,59])for(const [a,c]of [[-20,-18],[-10,10],[18,20]])B1.navWalls.push({x0:x,z0:a,x1:x,z1:c,metroFence:true});
  B1.features.push({type:'tvm',x:-48,z:-24.5,n:6,face:'S'},{type:'tvm',x:48,z:24.5,n:6,face:'N'});
  // Cross-shaped intermediate concourse is wholly within the paid area.
  const cross=[[-66,-21],[-21,-21],[-21,-66],[21,-66],[21,-21],[66,-21],[66,21],[21,21],[21,66],[-21,66],[-21,21],[-66,21]];
  B3.outline=cross;B3.slab.pieces=[{outer:cross,holes:[]}];B3.walk=[walk('M-transfer-cross','concourse',cross)];
  B3.navObstacles=[-9,9].flatMap(x=>[-9,9].map(z=>({id:`M-transfer-column-${x}-${z}`,poly:rectPoly(rect(x-.55,z-.55,x+.55,z+.55))})));
  const escalators=[],stairs=[],elevators=[];
  const pair=(id,lo,hi,F,u,sign,v)=>{
    const run=(hi.elev-lo.elev)*Math.sqrt(3),top=u+sign*run,r=rect(Math.min(u,top),v-ESC.slotHalf,Math.max(u,top),v+ESC.slotHalf);
    hi.voids.push({id:`${id}-slot`,kind:'escalator',frame:F,rect:r,poly:lrectPoly(F,r)});
    for(const [i,k]of [-1,1].entries()){
      const a=toW(F,u,v+k*ESC.lane/2),c=toW(F,top,v+k*ESC.lane/2);
      escalators.push({id:`${id}-${i?'D':'U'}`,building:'M',pair:id,from:lo.id,to:hi.id,dir:i?'down':'up',
        bottom:{x:a[0],y:lo.elev,z:a[1]},top:{x:c[0],y:hi.elev,z:c[1]},width:ESC.width,rise:hi.elev-lo.elev,run,slot:true,
        label:`${lo.name} ↔ ${hi.name}`,frame:F,axis:'x',slotRect:r,square:false});
    }
  };
  const stair=(id,F,u,v,serves)=>{
    const s={id,building:'M',kind:'metro',frame:F,rect:rect(u-4,v-2,u+4,v+2),door:{x0:u+(u<0?4:-4),z0:v-1.2,x1:u+(u<0?4:-4),z1:v+1.2,side:u<0?'E':'W'},doorByLevel:{},serves};
    stairs.push(s);
  };
  for(const v of [0,-14.5,14.5])for(const s of [-1,1]){
    pair(`M-7-H-${v}-${s}`,B2,B1,IDENTITY,s*12,s,v);
    pair(`M-7-T-${v}-${s}`,B3,B2,IDENTITY,s*26,s,v);
    pair(`M-12-H-${v}-${s}`,B4,B3,lines[1].frame,s*12,s,v);
    stair(`M-7-ST-${v}-${s}`,IDENTITY,s*50,v,[B3.id,B2.id,B1.id]);
    stair(`M-12-ST-${v}-${s}`,lines[1].frame,s*50,v,[B4.id,B3.id]);
  }
  elevators.push(lift('M-L1','M','passenger',IDENTITY,0,-1.5,3,2.6,'N',levels.map(l=>l.id)),lift('M-L2','M','passenger',IDENTITY,0,1.5,3,2.6,'S',levels.map(l=>l.id)));
  for(const s of [-1,1]){
    elevators.push(lift(`M-7-SIDE-L${s}`,'M','passenger',IDENTITY,6,s*14.5,3,2.6,s<0?'N':'S',[B3.id,B2.id,B1.id]));
    elevators.push(lift(`M-12-SIDE-L${s}`,'M','passenger',lines[1].frame,6,s*14.5,3,2.6,s<0?'N':'S',[B4.id,B3.id]));
  }
  prepareMallStairs(stairs);
  for(const s of stairs){s.poly=lrectPoly(s.frame,s.rect);s.wdoor=lseg(s.frame,s.door);s.wdoorByLevel={};
    for(const id of s.serves){const lv=byId[id];lv.rooms.push({id:s.id,type:'stair',label:'楼梯',frame:s.frame,rects:[s.rect],doors:[s.door],polys:[s.poly],wdoors:[s.wdoor]});}
  }
  // Remove solid equipment and shafts from walk meshes, keeping the whole cross continuous.
  B1.walk.unshift(...carve(INTERCHANGE.concourse,B1.rooms.flatMap(r=>r.rects).concat(B1.units.flatMap(u=>u.rects))).map((r,i)=>walk(`M-hall-${i}`,'concourse',rectPoly(r))));
  for(const lv of levels)for(const v of lv.voids)for(const piece of lv.slab.pieces)if(v.poly.every(p=>pointInPoly(p,piece.outer)))piece.holes.push(v.poly);
  b.box=INTERCHANGE.concourse;b.outline=B1.outline;b.radius=85;b.levels=levels.map(l=>l.id);b.line='7 / 12 号线';
  b.interchange={lines,transferLevel:B3.id,scheme:'spanish',boarding:'side',alighting:'central',gateLanes:24};
  b.access=buildMallStairAccess(b,levels,stairs);
  layout.levels.splice(layout.levels.findIndex(l=>l.building==='M'),2,...levels);
  for(const [key,values]of [['escalators',escalators],['stairs',stairs],['elevators',elevators]])layout[key]=layout[key].filter(x=>x.building!=='M').concat(values);
}
