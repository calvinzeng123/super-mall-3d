// 一期首层空地利用。与既有门厅、广场、车道共用世界坐标；设施不占用入口轴线。
import { rect, rectPoly, frame, lrectPoly, toW, polyBounds } from './geom.js';
const circle = (x, z, r, n = 24) => Array.from({ length: n }, (_, i) => [x + r * Math.cos(i * Math.PI * 2 / n), z + r * Math.sin(i * Math.PI * 2 / n)]);
const area = (id, name, bounds, color) => ({ id, name, rect: rect(...bounds), poly: rectPoly(rect(...bounds)), color });
const strip = (a, b, width) => {
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  return lrectPoly(frame(a[0],a[1],Math.atan2(dz,dx)*180/Math.PI),rect(0,-width/2,len,width/2));
};

export function addForecourt(site) {
  const zones = [
    area('family', '云宝亲子乐园', [16,-163,90,-115], '#d5b993'),
    area('market', '云澜花园食集', [244,-162,281,-119], '#c7b99c'),
    area('events', '城市客厅 · 小剧场', [-184,-57,-104,-27], '#d4c9b5'),
    area('north-garden', '方庭阅读花园', [-154,-246,-105,-210], '#a8b49b'),
    area('east-garden', '星湾街角庭院', [-59,-131,-24,-99], '#c7c4ad'),
  ];
  // 西北口袋顺星湾A圆厅退让，不用活动区矩形覆盖商场曲面。
  zones[0].poly=[[16,-163],[90,-163],[90,-135],[81,-128],[77,-120],[77,-115],[16,-115]];
  zones[0].signPoint=[87,-159];
  const northX=150/Math.SQRT2;
  const paths = [
    { id:'square-events', width:3, entrance:'P1-SQ-S', points:[[-220,-160],[-220,-154],[-208,-154],[-208,-25],[-184,-23]] },
    { id:'west-arrival', width:3, entrance:'P1-hotel-ground', points:[[-207,-81.1533717],[-208,-81.1533717],[-208,-25],[-184,-23]] },
    { id:'south-promenade', width:6, points:[[-280,-23],[-61,-23]] },
    { id:'rotunda-garden', width:6, entrance:'P1-S', points:[[-114.75,-73.34],[-122,-48],[-122,-23]] },
    { id:'north-reading', width:6, entrance:'P1-SQ-E', points:[[-160,-200],[-130,-200],[-130,-221]] },
    { id:'east-court', width:6, entrance:'P1-E', points:[[-73.34,-114.75],[-61,-120],[-24,-120]] },
    { id:'p2-family', width:4, entrance:'P2-N', points:[[northX,-135.901674039],[northX,-142],[88,-142],[78,-142]] },
    // Stay north of both real garage trenches before returning to the market
    // promenade; the former straight path crossed the open sloping lanes.
    { id:'p2-market', width:4, points:[[northX,-142],[northX,-162],[175,-162],[175,-142],[240,-142],[240,-120],[260.2,-120],[260.2,-158]] },
    { id:'residential-recreation', width:6, crossingSegments:[1,2], points:[[northX,-193],[northX,-190],[northX,-178],[northX,-162],[northX,-142]] },
    ...[49,115,181,247].map((x,i)=>({id:`residential-${i+1}-recreation`,width:5,entrance:`R${i+1}-MAIN`,pavedBy:'hospitality',points:[[x,-201.4],[x,-193],[northX,-193]]})),
  ];
  // 两条真实斑马线跨住宅环路和星湾北街，保留中间及两侧车行路面。
  for(const [id,z0,z1] of [['residential-play-crossing',-190,-178],['p2-play-crossing',-178,-162]]){
    const r=rect(northX-3,z0,northX+3,z1),poly=rectPoly(r);
    site.crossings.push({id,rect:r,poly,axis:'z'});
    site.walk.push({id,kind:'crossing',poly,outdoor:true});
  }
  for (const p of paths) p.polys=p.points.slice(1).map((b,i)=>strip(p.points[i],b,p.width));
  const items=[];
  const add=(zone,type,x,z,w,d,extra={})=>{
    const item={id:`${zone}-${type}-${items.length+1}`,zone,type,x,z,w,d,...extra};
    item.frame=frame(x,z,item.rotation||0);
    item.poly=lrectPoly(item.frame,rect(-w/2,-d/2,w/2,d/2));item.rect=polyBounds(item.poly);items.push(item);return item;
  };
  // 乐园沿星湾北街整体转90°，原42×66m轨道成为66×42m，设备不缩放。
  add('family','carousel',68,-140,16,16,{radius:8,name:'云朵旋转木马'});
  add('family','play-castle',34,-140,15,13,{rotation:90,name:'云宝探险城堡'});
  add('family','swings',50,-126,7,5,{rotation:90,name:'林间秋千'});
  add('family','sandpit',49,-154,8,7,{rotation:90,name:'沙趣工坊'});
  const train=add('family','mini-train',51,-140,42,66,{rotation:90,rx:21,rz:33,name:'环园小火车'});
  train.poly=Array.from({length:64},(_,i)=>{const a=i*Math.PI/32;return toW(train.frame,Math.cos(a)*(train.rx+.6),Math.sin(a)*(train.rz+.6));});
  train.rect=polyBounds(train.poly);
  for(const [x,z] of [[78,-130],[77,-156],[22.2,-153]])add('family','bench',x,z,2.8,.7,{rotation:90});
  const kiosks=[[-155,'云朵冰淇淋'],[-148,'花园咖啡'],[-141,'手作烘焙'],[-134,'柠檬小站'],[-127,'云澜花铺']];
  for(const [z,name] of kiosks)add('market','kiosk',249.7,z,5.6,3.6,{name});
  for(const z of [-155,-146,-137,-128])add('market','cafe-table',272.5,z,4,4,{umbrella:true});
  add('events','stage',-171,-49,17,7,{name:'草坪小剧场'});
  for(const x of [-179,-171,-163])for(const z of [-38,-34])add('events','bench',x,z,2.8,.7);
  add('events','pergola',-145,-44,15,10,{name:'花园会客厅'});
  for(const [x,z] of [[-149,-44],[-141,-44]])add('events','cafe-table',x,z,3.6,3.6);
  add('events','mascot',-110,-50,4,4,{name:'云宝欢迎你'});
  add('north-garden','pergola',-131,-233,28,9,{name:'阅读长廊'});
  for(const x of [-140,-131,-122])add('north-garden','reading-table',x,-232,4,3);
  for(const x of [-148,-112])add('north-garden','flower-bed',x,-217,7,6);
  add('east-garden','pergola',-42,-107,26,10,{name:'共享花园'});
  for(const x of [-50,-42,-33])add('east-garden','cafe-table',x,-107,3.4,3.4);
  add('east-garden','bikes',-33,-127,14,2.2,{name:'共享单车'});
  for(const [zone,x,z,w,d] of [
    ['market',245.2,-141,1.6,27],['market',255,-129,1.6,12],
    ['events',-174,-29,18,1.4],['events',-143,-29,18,1.4],
    ['north-garden',-131,-243,39,2],['north-garden',-152,-232,2,18],
    ['east-garden',-57,-105,1.6,8],
  ])add(zone,'flower-bed',x,z,w,d);
  // 连贯树岛与低花岛留出游具间的环形游线；碰撞与曲线种植池同源。
  const island=(zone,x,z,w,d,trees=[],rotation=0)=>{
    const item=add(zone,'garden-island',x,z,w,d,{trees,rotation});
    item.poly=Array.from({length:32},(_,i)=>{const a=i*Math.PI*2/32,k=.88+.09*Math.sin(a*3+.5);return toW(item.frame,Math.cos(a)*w*.5*k,Math.sin(a)*d*.5*k);});
    return item;
  };
  island('family',50,-139.5,13,10,[[0,0,1.2],[-3,.6,.8],[3,-.6,.9]],90);
  island('family',66.5,-152.7,6.3,17,[[0,-3,1.0],[.2,3,.9]],90);
  island('family',35,-153.5,7,12,[[0,0,1.15]],90);
  island('family',39,-125.5,7,6,[[0,0,.9]],90);
  const canopy=add('market','pergola',272.5,-142,15,34,{name:'食集林荫长廊',shade:true});
  canopy.posts=Array.from({length:5},(_,i)=>canopy.rect.z0+.3+i*(canopy.d-.6)/4).flatMap(z=>[canopy.rect.x0+.3,canopy.rect.x1-.3].map(x=>[x,z]));
  for(const z of [-158,-149,-140])island('market',255,z,2.8,6,[[0,0,.72]]);
  island('market',272.5,-159.5,12,4);
  island('events',-156,-36,4,10,[[0,0,.85]]);
  island('events',-132,-33.5,8,5,[[0,0,.8]]);
  island('north-garden',-144,-224,12,3,[[0,0,.8]]);
  island('north-garden',-117,-224,10,3,[[0,0,.75]]);
  island('east-garden',-52,-127,10,4,[[0,0,.75]]);
  island('east-garden',-28,-115,4,6,[[0,0,.7]]);
  // Every substantial solid has the same footprint in rendering and navigation.
  const obstacles=[];
  const block=(item,poly)=>obstacles.push({id:item.id,poly});
  for(const item of items){
    if(item.type==='garden-island')block(item,item.poly);
    else if(item.type==='carousel')block(item,circle(item.x,item.z,item.radius));
    else if(['play-castle','sandpit','kiosk','stage','bench','flower-bed','mascot','bikes'].includes(item.type))block(item,item.poly);
    else if(['cafe-table','reading-table'].includes(item.type))block(item,circle(item.x,item.z,1.45,12));
    else if(item.type==='pergola')for(const [x,z] of item.posts||[item.rect.x0+.3,item.rect.x1-.3].flatMap(x=>[item.rect.z0+.3,item.rect.z1-.3].map(z=>[x,z])))block(item,rectPoly(rect(x-.18,z-.18,x+.18,z+.18)));
    else if(item.type==='swings')for(const x of [-item.w/2+.2,item.w/2-.2])block(item,lrectPoly(item.frame,rect(x-.18,-item.d/2,x+.18,item.d/2)));
    else if(item.type==='mini-train')block(item,lrectPoly(item.frame,rect(-5,item.rz-1.1,5,item.rz+1.1)));
  }
  site.forecourt={zones,paths,items,obstacles};
  site.activityExclusions=[...zones.map(z=>z.poly),...paths.flatMap(p=>p.polys)];
  for(const zone of zones)site.walk.push({id:zone.id,kind:'plaza',poly:zone.poly,outdoor:true});
  for(const path of paths)for(const [i,poly] of path.polys.entries())site.walk.push({id:`${path.id}-${i}`,kind:'promenade',poly,outdoor:true});
  return site.forecourt;
}
