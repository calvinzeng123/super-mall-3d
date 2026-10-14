// Surrounding city shares the campus road coordinates. All footprints are in metres.
import { rect, rectPoly } from './geom.js';
const parcel = (id, x0, z0, x1, z1, extra = {}) => {
  const r = rect(x0, z0, x1, z1); return { id, rect: r, poly: rectPoly(r), ...extra };
};
export function subtractRect(a, b) {
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
  if (x1 <= x0 || z1 <= z0) return [a];
  return [rect(a.x0,a.z0,a.x1,z0),rect(a.x0,z1,a.x1,a.z1),rect(a.x0,z0,x0,z1),rect(x1,z0,a.x1,z1)]
    .filter(r => r.x1-r.x0 > .001 && r.z1-r.z0 > .001);
}
export function addUrbanDistrict(site) {
  const roads = [];
  const h = (id, z, x0, x1, w=20) => roads.push(parcel(id,x0,z-w/2,x1,z+w/2,{dir:'x',width:w,name:'云澜城市路网'}));
  const v = (id, x, z0, z1, w=20) => roads.push(parcel(id,x-w/2,z0,x+w/2,z1,{dir:'z',width:w,name:'云澜城市路网'}));
  for (const z of [-800,-520,-360,360,520,800]) h(`city-h${z}`,z,-900,900);
  h('city-avenue-west',0,-900,-298,28);h('city-avenue-east',0,298,900,28);
  for(const z of [-262,262]) {h(`city-ring-west${z}`,z,-540,-298,12);h(`city-ring-east${z}`,z,298,540,12);}
  for(const x of [-890,-540,540,890]) v(`city-v${x}`,x,-810,810);
  for(const x of [-270,0,270]) {v(`city-n${x}`,x,-800,-360);v(`city-s${x}`,x,360,800);}
  v('city-xingwan-n',0,-360,-298);v('city-xingwan-s',0,298,360);
  // Subtract earlier asphalt rectangles: intersections have one surface, no z fighting.
  const covered = site.roads.map(r=>r.rect), surfaces=[];
  for(const road of roads) {
    let pieces=[road.rect];
    for(const old of covered)pieces=pieces.flatMap(r=>subtractRect(r,old));
    surfaces.push(...pieces);covered.push(road.rect);
  }
  const blocks=[];
  function block(x0,z0,x1,z1,kind) {
    const id=`city-block-${blocks.length+1}`;
    blocks.push(parcel(id,x0+16,z0+16,x1-16,z1-16,{kind:kind || (blocks.length%6===0?'park':blocks.length%6===3?'sport':blocks.length%2?'office':'residential')}));
  }
  const xs=[-890,-540,-270,0,270,540,890];
  for(const zs of [[-800,-520,-360],[360,520,800]])for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++)block(xs[x],zs[z],xs[x+1],zs[z+1]);
  for(const [x0,x1] of [[-890,-540],[540,890]])for(const [z0,z1] of [[-360,-262],[-262,0],[0,262],[262,360]])block(x0,z0,x1,z1);
  for(const [z0,z1] of [[-262,0],[0,262]])block(310,z0,540,z1);
  // Narrow transition strips remain landscaped, leaving all existing lots and ramps clear.
  block(-540,-262,-484,-14,'park');block(-540,14,-484,262,'park');
  block(-500,14,-310,262,'sport');
  for(const [z0,z1] of [[-360,-278],[278,360]])for(const [x0,x1] of [[-500,0],[0,310],[310,540]])block(x0,z0,x1,z1,'park');
  const buildings=[],walks=[],trees=[],lamps=[];
  for(const [i,b] of blocks.entries()) {
    const r=b.rect,w=r.x1-r.x0,d=r.z1-r.z0,cx=(r.x0+r.x1)/2,cz=(r.z0+r.z1)/2;
    const strips=[rect(r.x0,r.z0,r.x1,r.z0+5),rect(r.x0,r.z1-5,r.x1,r.z1),rect(r.x0,r.z0+5,r.x0+5,r.z1-5),rect(r.x1-5,r.z0+5,r.x1,r.z1-5)];
    for(const [j,q] of strips.entries())walks.push({id:`${b.id}-walk${j}`,kind:'sidewalk',poly:rectPoly(q),rect:q,outdoor:true});
    // Two/four background buildings per developable block; parks/courts stay open.
    if(['office','residential'].includes(b.kind)) {
      const bw=Math.min(42,(w-50)/3),bd=Math.min(36,(d-30)/2.5),rows=d<110?1:2;
      for(let ix=0;ix<2;ix++)for(let iz=0;iz<rows;iz++) {
        const x=r.x0+w*(ix?.72:.28),z=rows===1?cz:r.z0+d*(iz?.73:.27),h=18+((i*13+ix*7+iz*3)%12)*4;
        buildings.push({id:`${b.id}-${ix}${iz}`,block:b.id,x,z,w:bw,d:bd,h,tint:(i+ix+iz)%6,poly:rectPoly(rect(x-bw/2,z-bd/2,x+bw/2,z+bd/2))});
      }
    }
    for(let x=r.x0+10;x<r.x1-8;x+=28)for(const z of [r.z0+8,r.z1-8])trees.push({x,z,y:0,s:1.2,kind:'round'});
    for(let z=r.z0+28;z<r.z1-20;z+=28)for(const x of [r.x0+8,r.x1-8])trees.push({x,z,y:0,s:1.2,kind:'round'});
    for(let x=r.x0+12;x<r.x1-10;x+=65)for(const z of [r.z0+2.5,r.z1-2.5])lamps.push({x,z});
    if (b.kind==='park' && w>70 && d>65)for(let x=r.x0+25;x<r.x1-20;x+=24)for(let z=r.z0+25;z<r.z1-20;z+=24) {
      if(Math.abs(x-cx)<22 || Math.abs(z-cz)<22)continue;trees.push({x,z,y:0,s:1.35,kind:(i%2?'cone':'round')});
    }
    b.name=b.kind==='park'?'城市绿地':b.kind==='sport'?'社区运动公园':b.kind==='office'?'城市办公街坊':'邻里居住街坊';
  }
  const intersections=[];
  const all=[...site.roads,...roads];
  for(const a of roads.filter(r=>r.dir==='x'))for(const b of all.filter(r=>r.dir==='z')) {
    const x=(b.rect.x0+b.rect.x1)/2,z=(a.rect.z0+a.rect.z1)/2;
    if(x>=a.rect.x0&&x<=a.rect.x1&&z>=b.rect.z0&&z<=b.rect.z1)intersections.push({x,z,wx:b.rect.x1-b.rect.x0,wz:a.width});
  }
  // Sidewalks follow every new street and cut back at junctions; marked crossings join them.
  const sidewalks=[],crossings=[];
  for(const road of roads) {
    const r=road.rect, end=road.id.startsWith('city-avenue-') ? 18 : 0;
    const strips=road.dir==='x' ? [rect(r.x0-end,r.z0-6,r.x1+end,r.z0),rect(r.x0-end,r.z1,r.x1+end,r.z1+6)]
      : [rect(r.x0-6,r.z0,r.x0,r.z1),rect(r.x1,r.z0,r.x1+6,r.z1)];
    for(const strip of strips) {
      let pieces=[strip];for(const other of all)pieces=pieces.flatMap(p=>subtractRect(p,other.rect));
      for(const q of pieces)sidewalks.push({id:`city-sidewalk-${sidewalks.length}`,rect:q,poly:rectPoly(q),kind:'sidewalk',outdoor:true});
    }
  }
  for(const {x,z,wx,wz} of intersections)for(const sign of [-1,1]) {
    const cx=x+sign*(wx/2+4),cz=z+sign*(wz/2+4);
    for(const q of [rect(cx-1.5,z-wz/2,cx+1.5,z+wz/2),rect(x-wx/2,cz-1.5,x+wx/2,cz+1.5)])
      crossings.push({id:`city-crossing-${crossings.length}`,rect:q,poly:rectPoly(q),kind:'crossing',outdoor:true});
  }
  const sportAccess=rect(-422,20,-418,35);
  sidewalks.push({id:'city-sport-access',rect:sportAccess,poly:rectPoly(sportAccess),kind:'sidewalk',outdoor:true});
  site.urban={roads,surfaces,blocks,buildings,walks,sidewalks,crossings,trees,lamps,intersections};
  site.bounds=rect(-940,-850,940,850);
  site.roads.push(...roads);site.walk.push(...walks,...sidewalks,...crossings);site.plots.push(...blocks);
}
