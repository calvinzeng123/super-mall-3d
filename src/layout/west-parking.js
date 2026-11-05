// 西侧公共地面停车：真实车位、车行网、步行脊与原地下附库共用总图。
import { IDENTITY, rect, rectPoly, convexOverlap, pointInPoly } from './geom.js';
import { fillRows, markSpecial } from './parking.js';
import { addPlaza } from './campus.js';

// 一期西门艺术步道过西外环后，沿这条轴线一直走进停车场，接上场内步行脊。
export const WEST_GATE_AXIS = -123.5, WEST_GATE_WIDTH = 5.6;
/** Gantry post offsets (local z in the gantry frame). A post that would stand
 * inside a pedestrian walk is dropped and the beam cantilevers over the walk. */
export const gantryPosts = gate => gate.posts || [-gate.width / 2 - .75, gate.width / 2 + .75];

/** northStrip: the 云澜·西苑 community plot. Its lots, aisles and road stubs go; the
 * spines start at the A3/B3 aisle, a fence walk runs along its south edge and a
 * fire road with the G4 community lane serves the towers. */
export function buildWestParking(site, ext, { northStrip = null } = {}) {
  const bounds=rect(-484,-250,-301,-33),poly=rectPoly(bounds);
  const plan={id:'west-public-parking',name:'一期西侧大型公共停车场',rect:bounds,poly,lots:[],gates:[],islands:[],walks:[],roads:[]};
  site.westParking=plan;
  site.plots.push({id:plan.id,name:plan.name,rect:bounds,poly});
  addPlaza(site,plan.id,poly,null);
  const strips=(points,w)=>points.slice(1).map((b,i)=>{
    const a=points[i],h=w/2;
    return rectPoly(Math.abs(a[0]-b[0])>.01?rect(Math.min(a[0],b[0])-h,a[2]-h,Math.max(a[0],b[0])+h,a[2]+h):rect(a[0]-h,Math.min(a[2],b[2])-h,a[0]+h,Math.max(a[2],b[2])+h));
  });
  const road=(id,points,width=6)=>{
    const r={id:`west-${id}`,name:'西侧停车循环车道',points,width,polys:strips(points,width)};
    ext.roads.push(r);plan.roads.push(r);return r;
  };
  const walk=(id,points,width=3)=>{
    const p={id:`west-${id}`,name:'西侧停车步行通道',kind:'ground',width,points,polys:strips(points,width)};
    ext.paths.push(p);plan.walks.push(p);
    p.polys.forEach((q,i)=>addPlaza(site,`${p.id}-${i}`,q,null));return p;
  };
  const ns=northStrip,inStrip=x=>ns&&x<ns.x1;
  // Inside the community the spines start at the A3/B3 aisle (z ≥ -198); spine -349 stays public.
  for(const x of [-480,-422,-375,-349])road(`spine-${-x}`,[[x,0,inStrip(x)?-195:-246],[x,0,-37]]);
  road('east-north',[[-309,0,-246],[-309,0,-206]]);
  road('east-south',[[-309,0,-175],[-309,0,-37]]);
  for(const [i,z] of [-239,-130,-53].entries()) {
    // North access lane: only its public stub from spine -349 to the west ring road remains.
    const r=road(`access-${i+1}`,[[ns&&i===0?-349:-480,0,z],[-292,0,z]],7);
    plan.gates.push({id:`WP-G${i+1}`,name:['北口','中央口','南口'][i],x:-302,z,width:r.width});
    site.driveways.push(rectPoly(rect(-306,z-3.5,-286,z+3.5)));
  }
  // Two separate level approaches stop at the existing descending street ramps.
  for(const x of [-363,-355])road(`basement-${-x}`,[[x,0,-130],[x,0,-144]],5);
  road('north-link',[[ns?-349:-375,0,-217],[-309,0,-217]]);
  walk('pedestrian-spine',[[-427,0,ns?ns.z1+1.5:-248],[-427,0,-35]],3);
  walk('garage-promenade',[[-482,0,-179],[-303,0,-179]],4);
  // 西苑南侧步道 along the community fence carries the mall approach.
  walk('mall-approach',ns?[[-480,0,ns.z1+2],[-303,0,ns.z1+2],[-303,0,-200],[-282,0,-200]]:[[-427,0,-206],[-303,0,-206],[-303,0,-200],[-282,0,-200]],4);
  if(ns) {
    // The community's internal path continues the spine north of the fence; one fire road
    // (消防登高场地 HS-W1/HS-W2) runs 5 m south of both towers, fed from gate G4.
    walk('garden-path',[[-427,0,ns.z0+1.5],[-427,0,ns.z1-1.5]],3);
    const fire={x0:ns.x0,z0:-221.8,x1:ns.x1,z1:-211.8},fz=(fire.z0+fire.z1)/2;
    const lanes=[
      {id:'west-garden-fire-road',name:'云澜·西苑 消防车道 · 登高场地',kind:'fire',width:10,points:[[fire.x0,0,fz],[fire.x1,0,fz]],polys:[rectPoly(rect(fire.x0,fire.z0,fire.x1,fire.z1))]},
      {id:'west-garden-g4-lane',name:'云澜·西苑 北门 G4 车道',kind:'fire',width:7,points:[[-422,0,ns.z0+4],[-422,0,fire.z0]],polys:[rectPoly(rect(-425.5,ns.z0+4,-418.5,fire.z0))]},
    ];
    for(const r of lanes){ext.roads.push(r);plan.roads.push(r);}
    plan.northStrip={...ns};
  }
  walk('east-promenade',[[-303,0,-248],[-303,0,-29]],3);
  walk('hotel-promenade',[[-303,0,-29],[-204,0,-29],[-204,0,-72]],3);
  // 西门 · 停车场步行轴：5.6 m 石材步道，从西外环斑马线 (x=-298) 一直通到场内步行脊 (x=-427)。
  const gh=WEST_GATE_WIDTH/2,gateRect=rect(-427,WEST_GATE_AXIS-gh,-298,WEST_GATE_AXIS+gh),gatePoly=rectPoly(gateRect);
  const gateWalk={id:'west-gate-promenade',name:'西门 · 停车场步行轴',kind:'ground',width:WEST_GATE_WIDTH,
    points:[[-427,0,WEST_GATE_AXIS],[-298,0,WEST_GATE_AXIS]],polys:[gatePoly],westGate:true};
  ext.paths.push(gateWalk);plan.walks.push(gateWalk);addPlaza(site,`${gateWalk.id}-0`,gatePoly,null);
  // Lamps stand just inside the south edge, clear of the four painted lot crossings.
  plan.gateWalk={...gateWalk,rect:gateRect,lamps:[-318,-334,-362,-390,-406].map(x=>({x,z:WEST_GATE_AXIS+gh-.35}))};
  for(const gate of plan.gates)gate.posts=gantryPosts(gate).filter(dz=>!pointInPoly([gate.x,gate.z+dz],gatePoly));
  const centers=[-239,-217,-195,-163,-143,-117,-97,-75,-53];
  const blocks=[...site.trenches,...site.openings,...plan.walks.flatMap(p=>p.polys),...plan.roads.flatMap(p=>p.polys)];
  for(const [ci,x0,x1,label] of [[0,-476,-430,'A'],[1,-416,-380,'B'],[2,-346,-314,'C']]) {
    for(const [ri,z] of centers.entries()) {
      // C3 is occupied by the retained pair of underground access halls.
      if(ci===2&&z===-195)continue;
      // The A/B lots under the community towers and fire road give way to 云澜·西苑.
      if(ns&&ci<2&&[-239,-217].includes(z))continue;
      const id=`WP-${label}${ri+1}`,r=rect(x0-0.25,z-8.9,x1+.25,z+8.9),aisle=rect(x0-4,z-3.5,x1+4,z+3.5);
      const rows=[{id:`${id}-N`,u0:x0,u1:x1,v0:z-8.5,v1:z-3.5,face:'S'},{id:`${id}-S`,u0:x0,u1:x1,v0:z+3.5,v1:z+8.5,face:'N'}]
        .filter(row=>!(ns&&ci<2&&row.v0<-198.5));
      // Their north rows went for the fence walk; the lot surface stops short of it.
      if(ns&&ci<2&&r.z0<ns.z1+4)r.z0=ns.z1+4.1;
      const filled=fillRows(IDENTITY,rows,blocks,id);
      // A row removed by the west-gate walk hands its charging bays to the opposite row.
      const evRow=filled.stalls.some(s=>s.row===rows[0].id)?rows[0].id:rows[1].id;
      markSpecial(filled.stalls,[[-334,-179],[-312,-179]],evRow,ci===2?4:2);
      // The lot surface stops short of the walk so its raised finish never covers the stone.
      if(r.z0<gateRect.z1&&r.z1>gateRect.z0&&r.x1>gateRect.x0&&r.x0<gateRect.x1)r.z0=gateRect.z1+.1;
      // Extra accessible bays flank the continuous pedestrian spine.
      if(ci===0&&[-195,-163,-117].includes(z))for(const row of rows){const s=filled.stalls.filter(s=>s.row===row.id&&s.type==='normal').at(-1);if(s)s.type='accessible';}
      const lot={id,name:`西侧 ${label}${ri+1} 区`,rect:r,poly:rectPoly(r),aisle,aislePoly:rectPoly(aisle),rows,...filled,district:plan.id};
      ext.surfaceParking.push(lot);plan.lots.push(lot);
      site.walk.push({id:`${id}-aisle`,kind:'parking-aisle',poly:lot.aislePoly,outdoor:true});
      road(`aisle-${id}`,[[ci===2?-349:-480,0,z],[ci===2?-309:-375,0,z]]);
      // Low planted dividers, never on the pedestrian crossing axes or ramp approaches.
      for(const x of [x0+5,x1-5]) {
        const island=rect(x-2,z+9.1,x+2,z+11.1),q=rectPoly(island);
        if(!blocks.some(b=>convexOverlap(q,b))&&!site.openings.some(b=>convexOverlap(q,b)))plan.islands.push({rect:island,poly:q,x,z:z+10.1});
      }
    }
  }
  // Crossings remain paint on the drivable asphalt, not raised paving over lanes.
  for(const [wi,w] of plan.walks.entries())for(const [pi,p] of w.polys.entries())for(const r of plan.roads)for(const q of r.polys) {
    if(!convexOverlap(p,q))continue;
    const bb=a=>({x0:Math.min(...a.map(t=>t[0])),x1:Math.max(...a.map(t=>t[0])),z0:Math.min(...a.map(t=>t[1])),z1:Math.max(...a.map(t=>t[1]))}),a=bb(p),b=bb(q),rr=rect(Math.max(a.x0,b.x0),Math.max(a.z0,b.z0),Math.min(a.x1,b.x1),Math.min(a.z1,b.z1));
    if(rr.x1-rr.x0<.2||rr.z1-rr.z0<.2)continue;
    const key=`west-cross-${rr.x0}-${rr.z0}-${rr.x1}-${rr.z1}`;
    if(site.crossings.some(c=>c.id===key))continue;
    site.crossings.push({id:key,rect:rr,poly:rectPoly(rr),axis:a.x1-a.x0>a.z1-a.z0?'x':'z'});
  }
  plan.stallCount=plan.lots.reduce((n,l)=>n+l.stalls.length,0);
  plan.evCount=plan.lots.flatMap(l=>l.stalls).filter(s=>s.type==='ev').length;
  plan.accessibleCount=plan.lots.flatMap(l=>l.stalls).filter(s=>s.type==='accessible').length;
}
