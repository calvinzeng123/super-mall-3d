// 一期首层空地利用。与既有门厅、广场、车道共用世界坐标；设施不占用入口轴线。
import { rect, rectPoly, frame, lrectPoly } from './geom.js';
const circle = (x, z, r, n = 24) => Array.from({ length: n }, (_, i) => [x + r * Math.cos(i * Math.PI * 2 / n), z + r * Math.sin(i * Math.PI * 2 / n)]);
const area = (id, name, bounds, color) => ({ id, name, rect: rect(...bounds), poly: rectPoly(rect(...bounds)), color });
const strip = (a, b, width) => {
  const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  return lrectPoly(frame(a[0],a[1],Math.atan2(dz,dx)*180/Math.PI),rect(0,-width/2,len,width/2));
};

export function addForecourt(site) {
  const zones = [
    area('family', '云宝亲子乐园', [-280,-154,-233,-82], '#d5b993'),
    area('market', '云澜花园食集', [-280,-60,-200,-27], '#c7b99c'),
    area('events', '城市客厅 · 小剧场', [-184,-57,-104,-27], '#d4c9b5'),
    area('north-garden', '方庭阅读花园', [-154,-246,-105,-210], '#a8b49b'),
    area('east-garden', '公寓共享庭院', [-59,-131,-24,-99], '#c7c4ad'),
  ];
  const paths = [
    { id:'square-family', width:10, points:[[-220,-160],[-220,-74],[-220,-23]] },
    { id:'west-arrival', width:8, points:[[-198.73,-81.15],[-219,-75.5],[-279,-64]] },
    { id:'south-promenade', width:6, points:[[-280,-23],[-61,-23]] },
    { id:'rotunda-garden', width:6, points:[[-114.75,-73.34],[-122,-48],[-122,-23]] },
    { id:'north-reading', width:6, points:[[-160,-200],[-130,-200],[-130,-221]] },
    { id:'east-court', width:6, points:[[-73.34,-114.75],[-61,-120],[-24,-120]] },
    { id:'playground-north', width:4, points:[[-220,-156],[-231,-156],[-231,-134],[-240,-134]] },
    { id:'playground-south', width:4, points:[[-220,-77],[-230,-77],[-230,-98],[-240,-98]] },
  ];
  for (const p of paths) p.polys=p.points.slice(1).map((b,i)=>strip(p.points[i],b,p.width));
  const items=[];
  const add=(zone,type,x,z,w,d,extra={})=>{
    const item={id:`${zone}-${type}-${items.length+1}`,zone,type,x,z,w,d,...extra};
    item.rect=rect(x-w/2,z-d/2,x+w/2,z+d/2);item.poly=rectPoly(item.rect);items.push(item);return item;
  };
  add('family','carousel',-257,-135,16,16,{radius:8,name:'云朵旋转木马'});
  add('family','play-castle',-257,-101,15,13,{name:'云宝探险城堡'});
  add('family','swings',-243,-117,7,5,{name:'林间秋千'});
  add('family','sandpit',-271,-116,8,7,{name:'沙趣工坊'});
  add('family','mini-train',-257,-118,42,66,{rx:21,rz:33,name:'环园小火车'});
  for(const [x,z] of [[-239,-147],[-273,-144],[-270,-89.2]])add('family','bench',x,z,2.8,.7);
  const kiosks=[[-271,'云朵冰淇淋'],[-259,'花园咖啡'],[-247,'手作烘焙'],[-235,'柠檬小站'],[-207,'云澜花铺']];
  for(const [x,name] of kiosks)add('market','kiosk',x,-54,5.6,3.6,{name});
  for(const x of [-269,-255,-241,-205])add('market','cafe-table',x,-40,4,4,{umbrella:true});
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
    ['market',-262,-29,27,1.6],['market',-234,-29,12,1.6],
    ['events',-174,-29,18,1.4],['events',-143,-29,18,1.4],
    ['north-garden',-131,-243,39,2],['north-garden',-152,-232,2,18],
    ['east-garden',-57,-105,1.6,8],
  ])add(zone,'flower-bed',x,z,w,d);
  // 连贯树岛与低花岛留出游具间的环形游线；碰撞与曲线种植池同源。
  const island=(zone,x,z,w,d,trees=[])=>{
    const item=add(zone,'garden-island',x,z,w,d,{trees});
    item.poly=Array.from({length:32},(_,i)=>{const a=i*Math.PI*2/32,k=.88+.09*Math.sin(a*3+.5);return[x+Math.cos(a)*w*.5*k,z+Math.sin(a)*d*.5*k];});
    return item;
  };
  island('family',-256.5,-117,13,10,[[0,0,1.2],[-3,.6,.8],[3,-.6,.9]]);
  island('family',-269.7,-133.5,6.3,17,[[0,-3,1.0],[.2,3,.9]]);
  island('family',-270.5,-102,7,12,[[0,0,1.15]]);
  island('family',-242.5,-106,7,6,[[0,0,.9]]);
  const canopy=add('market','pergola',-254.5,-40,45,8,{name:'食集林荫长廊',shade:true});
  canopy.posts=Array.from({length:7},(_,i)=>canopy.rect.x0+.3+i*(canopy.w-.6)/6).flatMap(x=>[canopy.rect.z0+.3,canopy.rect.z1-.3].map(z=>[x,z]));
  for(const x of [-265,-253,-241])island('market',x,-47,6,2.8,[[0,0,.72]]);
  island('market',-208,-31.4,12,4);
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
    else if(item.type==='swings')for(const x of [item.rect.x0+.2,item.rect.x1-.2])block(item,rectPoly(rect(x-.18,item.rect.z0,x+.18,item.rect.z1)));
    else if(item.type==='mini-train')block(item,rectPoly(rect(item.x-5,item.z+item.rz-1.1,item.x+5,item.z+item.rz+1.1)));
  }
  site.forecourt={zones,paths,items,obstacles};
  site.activityExclusions=[...zones.map(z=>z.poly),...paths.flatMap(p=>p.polys)];
  for(const zone of zones)site.walk.push({id:zone.id,kind:'plaza',poly:zone.poly,outdoor:true});
  for(const path of paths)for(const [i,poly] of path.polys.entries())site.walk.push({id:`${path.id}-${i}`,kind:'promenade',poly,outdoor:true});
  return site.forecourt;
}
