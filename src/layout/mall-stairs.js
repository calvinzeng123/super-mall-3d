// Compact protected stairs share one measured plan with navigation and rendering.
// Tall mall storeys use four flights in two stacked switchbacks; ordinary
// basement storeys use two. Every turn has a separate physical landing.
import { rect, toW, lrectPoly, NORMAL, unionOutline, subtractOpenings } from './geom.js';

const WALL = .15, START = 1.35, WIDTH = 1.2, TREAD = .27, RISER = .175;

export function mallStairPlan(stair) {
  const r = stair.rect, axis = r.x1-r.x0 >= r.z1-r.z0 ? 'x' : 'z';
  const depth = axis==='x' ? r.x1-r.x0 : r.z1-r.z0;
  const span = axis==='x' ? r.z1-r.z0 : r.x1-r.x0;
  const doors = [stair.originalDoor || stair.door, ...Object.values(stair.originalDoorByLevel || stair.doorByLevel || {})];
  const endDoor = doors.find(d => axis==='x' ? ['E','W'].includes(d.side) : ['N','S'].includes(d.side));
  const door = endDoor || doors[0], mid = axis==='x' ? (door.x0+door.x1)/2-r.x0 : (door.z0+door.z1)/2-r.z0;
  const forward = endDoor ? ['W','N'].includes(endDoor.side) : mid<=depth/2;
  const point = (u,v) => axis==='x' ? [r.x0+(forward?v:depth-v),r.z0+u] : [r.x0+u,r.z0+(forward?v:depth-v)];
  const local = (x,z) => axis==='x' ? [z-r.z0,forward?x-r.x0:r.x1-x] : [x-r.x0,forward?z-r.z0:r.z1-z];
  const rectangle = (u0,v0,u1,v1) => {const a=point(u0,v0),b=point(u1,v1);return rect(...a,...b);};
  return { axis, forward, depth, span, point, local, rectangle, width:WIDTH, start:START,
    centers:[WALL+WIDTH/2,span-WALL-WIDTH/2],
    cutRect:rectangle(WALL,WALL,span-WALL,depth-WALL),
    shaftRect:rectangle(WALL,START+.03,span-WALL,depth-WALL),
    landingRect:rectangle(WALL,WALL,span-WALL,START+.03) };
}

/** Keep every doorway on its original public frontage, aligned with the real
 * entry landing. This also preserves basement side-door access. */
export function prepareMallStairs(stairs) {
  for(const stair of stairs) {
    stair.originalDoor={...stair.door};stair.originalDoorByLevel={...stair.doorByLevel};
    const p=mallStairPlan(stair);
    const align=d=>{
      const sideDoor=p.axis==='x'?['N','S'].includes(d.side):['E','W'].includes(d.side);
      let a,b;
      if(sideDoor) {
        const u=p.local((d.x0+d.x1)/2,(d.z0+d.z1)/2)[0];
        a=p.point(u,.15);b=p.point(u,1.35);
      } else {
        const center=p.local((d.x0+d.x1)/2,(d.z0+d.z1)/2)[0];
        const u=Math.max(.95,Math.min(p.span-.95,center));
        a=p.point(u-.7,0);b=p.point(u+.7,0);
      }
      return {...rect(...a,...b),side:d.side};
    };
    stair.door=align(stair.door);
    stair.doorByLevel=Object.fromEntries(Object.entries(stair.doorByLevel||{}).map(([id,d])=>[id,align(d)]));
    stair.continuous=true;
  }
}

export function buildMallStairAccess(building,levels,stairs) {
  const access={protected:true,surfaces:[],flights:[],routes:[]};
  for(const stair of stairs) {
    const p=mallStairPlan(stair),served=levels.filter(l=>stair.serves.includes(l.id));
    const world=(u,v,y,floor)=>{const [x,z]=toW(stair.frame,...p.point(u,v));return {x,z,y,floor};};
    const entry=(lv,outside=false)=>{
      const d=stair.doorByLevel[lv.id]||stair.door,[nx,nz]=NORMAL[d.side];
      const offset=outside?.65:-.65;
      const local=[(d.x0+d.x1)/2+nx*offset,(d.z0+d.z1)/2+nz*offset];
      const [x,z]=toW(stair.frame,...local);return {x,z,y:lv.elev,floor:lv.id};
    };
    for(const lv of served) {
      const room=lv.rooms.find(r=>r.id===stair.id),d=stair.doorByLevel[lv.id]||stair.door;
      room.openStair=true;room.continuous=true;room.landingRect=p.landingRect;
      room.navigationWalls=subtractOpenings(unionOutline([stair.rect]),[d]);
      const poly=lrectPoly(stair.frame,p.shaftRect),cut=lrectPoly(stair.frame,p.cutRect);
      // Thin independent entry platforms prevent thick retail slabs from
      // intruding into the headroom of a stacked intermediate landing.
      lv.voids.push({id:`${stair.id}-${lv.short}-shaft`,kind:'stair',stair:stair.id,frame:stair.frame,rect:p.shaftRect,poly});
      lv.slab.pieces[0].holes.push(cut);
      lv.slab.pieces.push({outer:lrectPoly(stair.frame,p.landingRect),holes:[],thickness:.12,stair:stair.id});
    }
    for(let i=0;i<served.length-1;i++) {
      const lo=served[i],hi=served[i+1],rise=hi.elev-lo.elev;
      let count=2,steps=Math.ceil((rise/count-1e-7)/RISER);
      if(START+steps*TREAD+1.2>p.depth-WALL){count=4;steps=Math.ceil((rise/count-1e-7)/RISER);}
      // Align every rear landing in a shaft, including transitions between
      // two-flight basement levels and four-flight tall levels. A short rear
      // platform above a longer returning flight would otherwise clip heads.
      const run=Math.floor((p.depth-WALL-START-1.2+1e-7)/TREAD)*TREAD,end=START+run,delta=rise/count;
      if(end+1.2>p.depth-WALL||count===4&&rise/2-.18<2)throw new Error(`${stair.id}: unsafe compact stair dimensions`);
      const id=`${stair.id}-${lo.short}-${hi.short}`,common={stair:stair.id,building:building.id,parentFloor:lo.id,frame:stair.frame};
      const ids=[lo.id,...Array.from({length:count-1},(_,j)=>`${id}-landing-${j+1}`),hi.id];
      for(let j=1;j<count;j++) {
        const rear=j%2===1,r=rear?p.rectangle(WALL,end-.03,p.span-WALL,p.depth-WALL):p.landingRect;
        access.surfaces.push({...common,id:ids[j],elev:lo.elev+delta*j,rect:r,poly:lrectPoly(stair.frame,r),rear});
      }
      for(let j=0;j<count;j++) {
        const outgoing=j%2===0,u=p.centers[j%2],a=outgoing?START:end,b=outgoing?end:START;
        access.flights.push({...common,id:`${id}-flight-${j+1}`,from:ids[j],to:ids[j+1],
          bottom:world(u,a,lo.elev+delta*j,ids[j]),top:world(u,b,lo.elev+delta*(j+1),ids[j+1]),
          localBottom:p.point(u,a),localTop:p.point(u,b),width:WIDTH,steps,rise:delta,run});
      }
      const waypoints=[entry(lo,true),entry(lo),world(p.centers[0],.75,lo.elev,lo.id)];
      for(let j=0;j<count;j++) {
        const rear=j%2===0,v=rear?end+.6:.75,y=lo.elev+delta*(j+1),floor=ids[j+1];
        waypoints.push(world(p.centers[j%2],v,y,floor));
        if(j<count-1)waypoints.push(world(p.centers[(j+1)%2],v,y,floor));
      }
      waypoints.push(entry(hi),entry(hi,true));
      access.routes.push({id,stair:stair.id,from:lo.id,to:hi.id,landings:ids.slice(1,-1),waypoints});
    }
  }
  return access;
}
