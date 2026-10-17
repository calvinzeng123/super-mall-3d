// The glass bridge towers use the same measured switchback plan as the mall.
// Their landing floors belong to the bridge, while the lower endpoint resolves
// to either the outdoor ground or the adjacent phase-three street floor.
import { rect, toW, lrectPoly, subtractInterval } from './geom.js';
import { prepareMallStairs, mallStairPlan, buildMallStairAccess } from './mall-stairs.js';

function deckRectangles(r, holes) {
  const xs=[...new Set([r.x0,r.x1,...holes.flatMap(h=>[h.x0,h.x1])])].sort((a,b)=>a-b);
  return xs.slice(0,-1).flatMap((a,i)=>{
    const b=xs[i+1];let spans=[[r.z0,r.z1]];
    for(const h of holes)if(h.x0<b-1e-6&&h.x1>a+1e-6)spans=subtractInterval(spans,[h.z0,h.z1]);
    return spans.filter(([c,d])=>d-c>1e-6).map(([c,d])=>rect(a,c,b,d));
  });
}

export function buildBridgeStairAccess(br) {
  const access={protected:true,surfaces:[],flights:[],routes:[],navigationWalls:[],navigationCuts:[],navigationObstacles:[]};
  for(const T of br.towers) {
    const stair=br.verticals.find(v=>v.tower===T.id&&v.type==='stair');
    stair.building=T.id;stair.serves=['street','bridge'];stair.doorByLevel={};
    prepareMallStairs([stair]);
    const p=mallStairPlan(stair);
    const levels=[['street','G',0,br.y],['bridge','2F',br.y,4.1]].map(([id,short,elev,height])=>({
      id,short,elev,height,kind:'bridge',rooms:[{id:stair.id,frame:T.frame,rects:[stair.rect],doors:[stair.door]}],
      voids:[],slab:{pieces:[{outer:T.poly,holes:[]}]},
    }));
    const a=buildMallStairAccess({id:T.id},levels,[stair]);
    for(const s of a.surfaces)s.parentFloor='bridge';
    for(const f of a.flights)f.parentFloor='bridge';
    // A person enters the existing wide glass-tower frontage before turning
    // towards the inner stair door; the outer glazing is never a shortcut.
    const waypoint=(x,z,y,floor)=>{const [wx,wz]=toW(T.frame,x,z);return {x:wx,z:wz,y,floor};};
    for(const route of a.routes) {
      route.waypoints.unshift(waypoint(T.rect.x0-.65,0,0,'street'),waypoint(T.rect.x0+1,0,0,'street'));
      route.waypoints.push(waypoint(T.rect.x0+1,0,br.y,'bridge'),waypoint(T.rect.x0-.65,0,br.y,'bridge'));
    }
    access.surfaces.push(...a.surfaces);access.flights.push(...a.flights);access.routes.push(...a.routes);
    for(const lv of levels)access.navigationWalls.push({floor:lv.id,frame:T.frame,segments:lv.rooms[0].navigationWalls});
    access.navigationCuts.push({floor:'street',frame:T.frame,rect:p.shaftRect});
    const lift=br.verticals.find(v=>v.tower===T.id&&v.type==='lift');
    const shaft=rect(lift.lu-lift.w/2,lift.lv-lift.d/2,lift.lu+lift.w/2,lift.lv+lift.d/2);
    const deck=br.walk.find(w=>w.id===T.id);
    deck.holes=[lrectPoly(T.frame,p.cutRect),lrectPoly(T.frame,shaft)];
    br.walk.push({id:`${T.id}-stair-entry`,kind:'tower',poly:lrectPoly(T.frame,p.landingRect)});
    T.deckPieces=[...deckRectangles(T.rect,[p.cutRect,shaft]).map(r=>({rect:r,thickness:br.thick})),{rect:p.landingRect,thickness:.12}];
    T.stair=stair;T.stairLevels=levels;
    // The exterior elevator shaft stays separate from the stair landing.
    for(const floor of ['street','bridge'])access.navigationObstacles.push({floor,frame:T.frame,rect:shaft});
  }
  return access;
}
