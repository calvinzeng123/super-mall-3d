import { towerStairPlan } from '../../layout/tower-stairs.js';
import * as THREE from 'three';
import { BatchSet, frameMatrix } from '../batch.js';

const WALL = '#dce1d8', STEP = '#c8cec3', METAL = '#607967';
const box = (B, key, r, y, height, color) => B.get(key).box((r.x0+r.x1)/2,y+height/2,(r.z0+r.z1)/2,r.x1-r.x0,height,r.z1-r.z0,color);
const rail = (B, a, b) => {
  B.get('extMetal').bar(a,b,.045,METAL);
  const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.9));
  for(let i=0;i<=n;i++) {
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
    B.get('extMetal').bar({x,y:y-.95,z},{x,y,z},.025,METAL);
  }
};

/** Called inside the building frame, batched into its permanent clipped shell.
 * Mid-flight geometry must survive loading the next visited dwelling floor. */
export function buildTowerStairGeometry(B, building, levels, stairs, { enclosures = true, flights = true } = {}) {
  if (!building.access?.protected) return;
  if (enclosures) for (const s of stairs) {
    const p=towerStairPlan(s),r=s.rect;
    for(const lv of levels.filter(l=>!l.playableCap&&s.serves.includes(l.id))) {
      const y=lv.elev,h=lv.kind==='roof'?2.9:lv.height, dz=s.door.z0;
      box(B,'concrete',{x0:r.x0,z0:r.z0,x1:r.x0+.2,z1:r.z1},y,h,WALL);
      box(B,'concrete',{x0:r.x1-.2,z0:r.z0,x1:r.x1,z1:r.z1},y,h,WALL);
      const back=s.door.side==='S'?r.z0:r.z1-.2;
      box(B,'concrete',{x0:r.x0,z0:back,x1:r.x1,z1:back+.2},y,h,WALL);
      const front=s.door.side==='S'?dz-.2:dz;
      for(const [x0,x1] of [[r.x0,s.door.x0],[s.door.x1,r.x1]])
        box(B,'concrete',{x0,z0:front,x1,z1:front+.2},y,h,WALL);
      box(B,'concrete',{x0:s.door.x0,z0:front,x1:s.door.x1,z1:front+.2},y+2.35,h-2.35,WALL);
      // Open door leaves are parked against the entry wall, not through the
      // 1.8m clear landing or the route between the two stair flights.
      const cx=(s.door.x0+s.door.x1)/2,entryZ=dz-p.direction*.045;
      B.get('extMetal').box(s.door.x0-.35,y+1.09,entryZ,.65,2.18,.055,METAL);
      B.get('extMetal').box(s.door.x1+.35,y+1.09,entryZ,.65,2.18,.055,METAL);
      B.get('glowSoft').box(cx,y+2.55,entryZ,.85,.23,.07,'#78b98b');
      const q=p.point(cx,1.05);
      B.get('glowSoft').box(q[0],y+h-.13,q[1],1.2,.055,.3,'#f5ebd6');
      const frontEdge=p.point(0,2);
      rail(B,{x:p.centers[0]+p.width/2,y:y+1.05,z:frontEdge[1]},
        {x:p.centers[1]-p.width/2,y:y+1.05,z:frontEdge[1]});
      if(lv.kind==='roof') box(B,'concrete',r,y+h,.18,'#b2bbae');
    }
  }
  if (!flights) return;
  for(const f of building.access.flights) {
    const [x0,z0]=f.localBottom,[x1,z1]=f.localTop,dy=f.top.y-f.bottom.y;
    for(let i=0;i<f.steps;i++) {
      const t=(i+.5)/f.steps,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t,y=f.bottom.y+dy*(i+1)/f.steps;
      B.get('concrete').box(x,y-.07,z,f.width,.14,f.run/f.steps+.006,STEP);
      const edgeZ=z0+(z1-z0)*i/f.steps;
      B.get('concrete').box(x,y-dy/f.steps/2,edgeZ,f.width,dy/f.steps,.035,STEP);
      B.get('extMetal').box(x,y+.006,edgeZ,f.width,.012,.035,'#8e9e8a');
    }
    for(const sign of [-1,1]) rail(B,
      {x:x0+sign*f.width/2,y:f.bottom.y+1.05,z:z0},
      {x:x1+sign*f.width/2,y:f.top.y+1.05,z:z1});
  }
  for(const s of building.access.surfaces) {
    box(B,'concrete',s.rect,s.elev-.15,.15,STEP);
    const stair=stairs.find(q=>q.id===s.stair),dir=towerStairPlan(stair).direction;
    const z=dir<0?s.rect.z0:s.rect.z1;
    rail(B,{x:s.rect.x0,y:s.elev+1.05,z},{x:s.rect.x1,y:s.elev+1.05,z});
  }
}

/** Repeated 3.4m flights share one geometry per material. Only the current,
 * preceding and following floors need visible flights inside an enclosed shaft;
 * the protective walls and roof housings remain in the permanent facade batch. */
export function buildTowerStairInstances(ctx, building, levels, stairs, materials, exterior) {
  if (!building.access?.protected) return;
  const buckets=new Map(),records=[];
  for(const lv of levels.filter(l=>building.access.flights.some(f=>f.parentFloor===l.id))) {
    const key=lv.height.toFixed(4);
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(lv);
  }
  for(const members of buckets.values()) {
    const lv=members[0],offset=lv.elev;
    const access={protected:true,
      flights:building.access.flights.filter(f=>f.parentFloor===lv.id).map(f=>({...f,
        bottom:{...f.bottom,y:f.bottom.y-offset},top:{...f.top,y:f.top.y-offset}})),
      surfaces:building.access.surfaces.filter(s=>s.parentFloor===lv.id).map(s=>({...s,elev:s.elev-offset})),
    };
    const batch=new BatchSet(materials),template=new THREE.Group();
    buildTowerStairGeometry(batch,{...building,access},[],stairs,{enclosures:false});
    batch.flush(template);
    const meshes=[];
    for(const source of [...template.children]) {
      const mesh=new THREE.InstancedMesh(source.geometry,source.material,members.length);
      mesh.name=`${building.id}-protected-stairs-${lv.height}-${source.name}`;
      mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
      mesh.userData.towerStairs=true;mesh.count=0;mesh.visible=false;
      exterior.add(mesh);meshes.push(mesh);
    }
    template.clear();records.push({members,meshes});
  }
  let last='';
  const update=app=>{
    const state=app.state,inside=state.explore?.building===building.id;
    const current=inside?state.explore.level:state.building===building.id?state.focus:null;
    const index=levels.findIndex(l=>l.id===current);
    const active=index>=0?levels.slice(Math.max(0,index-1),index+(inside?2:1)).map(l=>l.id)
      : [levels.find(l=>l.short==='1F')?.id,levels.at(-2).id];
    const signature=active.join('|');if(signature===last)return;last=signature;
    for(const {members,meshes} of records) {
      const selected=members.filter(l=>active.includes(l.id));
      for(const mesh of meshes) {
        for(const [i,lv] of selected.entries()) {
          const matrix=frameMatrix(building.frame);matrix.elements[13]=lv.elev;
          mesh.setMatrixAt(i,matrix);
        }
        mesh.count=selected.length;mesh.visible=selected.length>0;
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.visible){mesh.boundingSphere=null;mesh.computeBoundingSphere();}
      }
    }
  };
  update({state:{}});
  ctx.dynamic.push({name:`${building.id}-protected-stairs`,update:(dt,time,app)=>update(app)});
}
