import * as THREE from 'three';
import { BatchSet } from '../batch.js';
import { mallStairPlan } from '../../layout/mall-stairs.js';
import { NORMAL } from '../../layout/geom.js';

const WALL='#e0e4dc',STEP='#cdd1c5',METAL='#617568';
const box=(B,key,r,y,h,color)=>B.get(key).box((r.x0+r.x1)/2,y+h/2,(r.z0+r.z1)/2,r.x1-r.x0,h,r.z1-r.z0,color);
function rail(B,a,b) {
  B.get('extMetal').bar(a,b,.045,METAL);
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.85));
  for(let i=0;i<=n;i++) {
    const t=i/n,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
    B.get('extMetal').bar({x,y:y-.98,z},{x,y,z},.025,METAL);
  }
}

/** A single flight template, also callable by geometry/body-clearance tests. */
export function buildMallFlightGeometry(B,f) {
  const [x0,z0]=f.localBottom,[x1,z1]=f.localTop,dx=x1-x0,dz=z1-z0;
  const alongX=Math.abs(dx)>Math.abs(dz),ux=dx/f.run,uz=dz/f.run,nx=-uz,nz=ux;
  for(let i=0;i<f.steps;i++) {
    const t=(i+.5)/f.steps,x=x0+dx*t,z=z0+dz*t,y=f.bottom.y+f.rise*(i+1)/f.steps;
    B.get('concrete').box(x,y-.065,z,alongX?f.run/f.steps+.008:f.width,.13,alongX?f.width:f.run/f.steps+.008,STEP);
    const ex=x0+dx*i/f.steps,ez=z0+dz*i/f.steps;
    B.get('concrete').box(ex,y-f.rise/f.steps/2,ez,alongX?.035:f.width,f.rise/f.steps,alongX?f.width:.035,STEP);
    B.get('extMetal').box(ex,y+.008,ez,alongX?.035:f.width,.016,alongX?f.width:.035,'#8e9d88');
  }
  for(const sign of [-1,1])rail(B,{x:x0+nx*sign*f.width/2,y:f.bottom.y+1.05,z:z0+nz*sign*f.width/2},
    {x:x1+nx*sign*f.width/2,y:f.top.y+1.05,z:z1+nz*sign*f.width/2});
}

/** Enclosures and landings remain batched with their parent floor. No door
 * panel is drawn across the walkable opening. Thin platforms are real slabs. */
export function buildMallStairLevel(B,level,stairs,access,{flights=false}={}) {
  for(const stair of stairs.filter(s=>s.serves.includes(level.id)))B.frame(stair.frame,()=>{
    const room=level.rooms.find(r=>r.id===stair.id),p=mallStairPlan(stair),y=level.elev;
    const h=level.kind==='roof'?3.2:level.height,d=room.doors[0];
    for(const w of room.navigationWalls) {
      const dx=w.x1-w.x0,dz=w.z1-w.z0,x=(w.x0+w.x1)/2,z=(w.z0+w.z1)/2;
      B.get('concrete').box(x,y+h/2,z,Math.abs(dx)||.15,h,Math.abs(dz)||.15,WALL);
      B.get('extMetal').box(x,y+.08,z,Math.abs(dx)||.16,.16,Math.abs(dz)||.16,'#9aa897');
    }
    const mx=(d.x0+d.x1)/2,mz=(d.z0+d.z1)/2,alongX=['N','S'].includes(d.side),[nx,nz]=NORMAL[d.side];
    B.get('concrete').box(mx,y+(h+2.3)/2,mz,alongX?d.x1-d.x0:.15,h-2.3,alongX?.15:d.z1-d.z0,WALL);
    B.get('glowSoft').box(mx+nx*.09,y+2.55,mz+nz*.09,alongX?.8:.06,.22,alongX?.06:.8,'#70b58b');
    const center=p.point(p.span/2,.75);
    B.get('glowSoft').box(center[0],y+h-.1,center[1],p.axis==='x'?.35:1.1,.06,p.axis==='x'?1.1:.35,'#f4edd8');
    const a=p.point(p.centers[0]+p.width/2,p.start+.03),b=p.point(p.centers[1]-p.width/2,p.start+.03);
    rail(B,{x:a[0],y:y+1.05,z:a[1]},{x:b[0],y:y+1.05,z:b[1]});
    if(level.kind==='roof')box(B,'concrete',stair.rect,y+h,.18,'#acb6a8');
  });
  for(const surface of access.surfaces.filter(s=>s.parentFloor===level.id))B.frame(surface.frame,()=>{
    box(B,'concrete',surface.rect,surface.elev-.15,.15,STEP);
    const stair=stairs.find(s=>s.id===surface.stair),p=mallStairPlan(stair);
    const v=surface.rear?Math.min(...[[surface.rect.x0,surface.rect.z0],[surface.rect.x1,surface.rect.z1]].map(q=>p.local(...q)[1])):p.start+.03;
    const a=p.point(p.centers[0]+p.width/2,v),b=p.point(p.centers[1]-p.width/2,v);
    rail(B,{x:a[0],y:surface.elev+1.05,z:a[1]},{x:b[0],y:surface.elev+1.05,z:b[1]});
  });
  if(flights)for(const f of access.flights.filter(f=>f.parentFloor===level.id))B.frame(f.frame,()=>buildMallFlightGeometry(B,f));
}

/** Shared flight buffers are reused across every rotated wing and storey.
 * Instances live with the originating floor, so half-landings stay visible. */
export function buildMallStairs(ctx) {
  const templates=new Map();
  for(const building of ctx.layout.buildings.filter(b=>b.kind==='mall'&&b.access?.protected)) {
    const stairs=ctx.layout.stairs.filter(s=>s.building===building.id),access=building.access;
    for(const level of ctx.layout.levels.filter(l=>l.building===building.id)) {
      const L=ctx.levels[level.id];buildMallStairLevel(L.batch,level,stairs,access);
      for(const stair of stairs.filter(s=>s.serves.includes(level.id))) {
        const d=stair.doorByLevel[level.id]||stair.door,[nx,nz]=NORMAL[d.side];
        L.signs.frame(stair.frame,()=>L.signs.place((d.x0+d.x1)/2+nx*.13,level.elev+2.55,(d.z0+d.z1)/2+nz*.13,.8,.22,d.side,ctx.atlas[level.id].cell('wf-exit')));
      }
      const groups=new Map();
      for(const f of access.flights.filter(f=>f.parentFloor===level.id)) {
        const key=[f.steps,f.rise,f.run,f.width].join('/');
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);
        if(!templates.has(key)) {
          const B=new BatchSet(ctx.mats.base),group=new THREE.Group();
          buildMallFlightGeometry(B,{...f,localBottom:[0,0],localTop:[0,f.run],bottom:{y:0},top:{y:f.rise}});
          B.flush(group);templates.set(key,[...group.children]);group.clear();
        }
      }
      for(const [key,flights] of groups)for(const template of templates.get(key)) {
        const mesh=new THREE.InstancedMesh(template.geometry,template.material,flights.length);
        mesh.name=`${level.id}-continuous-stair-${template.name}`;mesh.castShadow=true;mesh.receiveShadow=true;
        for(const [i,f] of flights.entries()) {
          const m=new THREE.Matrix4().makeRotationY(Math.atan2(f.top.x-f.bottom.x,f.top.z-f.bottom.z));
          m.setPosition(f.bottom.x,f.bottom.y,f.bottom.z);mesh.setMatrixAt(i,m);
        }
        mesh.computeBoundingSphere();L.base.add(mesh);
      }
    }
  }
  ctx.mallStairStats={templates:templates.size,storedVertices:[...templates.values()].flat().reduce((n,m)=>n+m.geometry.attributes.position.count,0)};
}
