import clipping from 'polygon-clipping';
import { frame, IDENTITY, rect, rectPoly, lrectPoly, lseg, toW, pointInPoly, polysOverlap, subtractOpenings } from './geom.js';
import { EXIT } from './metro.js';

// Four new approaches fill the gaps between the retained diagonal A–D exits.
// Route endpoints are the station wall and stair bottom, never the stair top.
const ACCESS = [
  { id:'E', name:'一期大道侧', en:'YUNLAN MALL · AVENUE', color:'#b08d4f', bottom:[-76,-24,180],
    route:[[-68,0],[-72,0],[-72,-24],[-76,-24]], approach:[[-85.5,-24],[-90,-24],[-90,-17]] },
  { id:'F', name:'二期星湾路侧', en:'XINGWAN · NORTH STREET', color:'#c2402f', bottom:[22,-82,270],
    route:[[12,-26],[12,-72],[22,-72],[22,-82]], approach:[[22,-91.5],[22,-97],[13,-97]] },
  { id:'G', name:'公园大道侧', en:'CENTRAL PARK · AVENUE', color:'#4a9a50', bottom:[96,26,0],
    route:[[68,0],[84,0],[84,26],[96,26]], approach:[[105.5,26],[111,26],[111,17]] },
  { id:'H', name:'三期街区侧', en:'YUNLAN LANE · SOUTH STREET', color:'#9a5b34', bottom:[-22,85,90],
    route:[[-12,26],[-12,73],[-22,73],[-22,85]], approach:[[-22,94.5],[-22,100],[-13,100]] },
];

// Butt-ended strips plus squares at bends keep corners continuous without
// extending a corridor ceiling across the rising exit stairs.
function routePolygon(points, hw) {
  const strips=points.slice(1).map(([x,z],i)=>{
    const [a,b]=points[i];
    return rectPoly(a===x?rect(x-hw,Math.min(b,z),x+hw,Math.max(b,z)):rect(Math.min(a,x),z-hw,Math.max(a,x),z+hw));
  });
  const bends=points.slice(1,-1).map(([x,z])=>rectPoly(rect(x-hw,z-hw,x+hw,z+hw)));
  return clipping.union(...[...strips,...bends].map(p=>[p]))[0][0].slice(0,-1);
}

export function addMetroAccess(layout, b, lv) {
  for(const spec of ACCESS) {
    const id=`P${spec.id}`,hw=3.4,F=frame(...spec.bottom,`M-X${spec.id}`);
    const [kx,kz]=toW(F,(EXIT.roof.x0+EXIT.roof.x1)/2,0);
    const kiosk={x:kx,z:kz,deg:F.deg,frame:F,poly:lrectPoly(F,EXIT.roof),open:lrectPoly(F,EXIT.open),run:EXIT.run,rise:-lv.elev,hw:EXIT.hw};
    const end=lseg(F,{x0:0,z0:-EXIT.hw,x1:0,z1:EXIT.hw,side:'E'});
    const [a,c]=spec.route,MF=frame(...a,Math.atan2(c[1]-a[1],c[0]-a[0])*180/Math.PI);
    const mouth=lseg(MF,{x0:0,z0:-hw,x1:0,z1:hw,side:'W'});
    const poly=routePolygon(spec.route,hw);
    const edges=poly.map(([x0,z0],i)=>{
      const [x1,z1]=poly[(i+1)%poly.length];return {x0,z0,x1,z1};
    });
    const walls=subtractOpenings(edges,[mouth,end]).map(w=>{
      const dx=w.x1-w.x0,dz=w.z1-w.z0,len=Math.hypot(dx,dz);
      const inward=pointInPoly([(w.x0+w.x1)/2-dz/len*.1,(w.z0+w.z1)/2+dx/len*.1],poly)?1:-1;
      return {...w,inward};
    });
    const passage={id,extension:true,name:`${spec.id} 口 · ${spec.name}`,to:null,route:spec.route,poly,hw,mouth,end,walls,
      info:{color:spec.color,cn:spec.name,en:spec.en,end:spec.name}};
    b.passages.push(passage);
    lv.walk.push({id,kind:'passage',poly,frame:IDENTITY,lpoly:poly});
    lv.slab.pieces.push({outer:poly,holes:[]});
    lv.navWalls.push(...walls);
    const approach={points:spec.approach,poly:routePolygon(spec.approach,2.8),width:5.6};
    const entrance={id:`M-${spec.id}`,building:'M',name:passage.name,level:lv.id,seg:{x0:end.x0,z0:end.z0,x1:end.x1,z1:end.z1},nx:end.nx,nz:end.nz,
      width:EXIT.hw*2,main:false,to:'site',square:false,exit:spec.id,passage:id,kiosk};
    layout.entrances.push(entrance);
    b.exits.push({id:spec.id,name:passage.name,passage:id,entrance:entrance.id,kiosk,approach});
    layout.site.openings.push(kiosk.open);
    layout.site.activityExclusions.push(lrectPoly(F,rect(-1,-5.3,14.5,5.3)),approach.poly);
    layout.site.walk.push({id:`M-${spec.id}-approach`,kind:'promenade',poly:approach.poly,outdoor:true});
    for(const ground of layout.levels.filter(l=>l.ground))for(const piece of ground.slab.pieces)
      if(polysOverlap(piece.outer,kiosk.open))piece.holes.push(kiosk.open);
  }
  // The existing east/west promenade used to run through the new E shaft.
  // Lead it around the canopy on the avenue sidewalk and keep both endpoints.
  const S=layout.site,promenade=S.forecourt.paths.find(p=>p.id==='south-promenade');
  const previous=promenade.polys;
  promenade.points=[[-280,-23],[-94,-23],[-94,-17],[-70,-17],[-70,-23],[-61,-23]];
  promenade.polys=promenade.points.slice(1).map((p,i)=>routePolygon([promenade.points[i],p],promenade.width/2));
  S.activityExclusions=S.activityExclusions.filter(p=>!previous.includes(p)).concat(promenade.polys);
  S.walk=S.walk.filter(w=>!w.id.startsWith(`${promenade.id}-`));
  promenade.polys.forEach((poly,i)=>S.walk.push({id:`${promenade.id}-${i}`,kind:'promenade',poly,outdoor:true}));
  // Existing designed tree belts predate these new shafts. Clear the pits and
  // their collision records together where the new entrances need open space.
  const landscape=layout.fidelity?.landscape;
  if(landscape){
    const clearance=[...b.exits.filter(e=>e.approach).flatMap(e=>[e.approach.poly,lrectPoly(e.kiosk.frame,rect(-1,-5.3,14.5,5.3))]),...promenade.polys.slice(1,-1)];
    const removed=new Set();
    landscape.trees=landscape.trees.filter(t=>{
      if(!clearance.some(p=>polysOverlap(p,rectPoly(rect(t.x-1.3,t.z-1.3,t.x+1.3,t.z+1.3)))))return true;
      removed.add(`belt-tree-${t.x.toFixed(1)}-${t.z.toFixed(1)}`);return false;
    });
    S.forecourt.obstacles=S.forecourt.obstacles.filter(o=>!removed.has(o.id));
  }
}
