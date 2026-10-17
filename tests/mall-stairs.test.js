import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, onSlab, inWalk, stairDoor, midOf } from './helpers.js';
import { buildNav, step, clear, landAt } from '../src/layout/nav.js';
import { toL, toW, pointInPoly, polySamples } from '../src/layout/geom.js';
import { mallStairPlan } from '../src/layout/mall-stairs.js';
import { buildMallStairLevel, buildMallStairs } from '../src/render/build/mall-stairs.js';
import { BatchSet } from '../src/render/batch.js';
import { SLAB_T } from '../src/render/build/shell.js';

const malls=L.buildings.filter(b=>b.kind==='mall'),nav=buildNav(L);
function move(s,p,audit=()=>{}) {
  const n=Math.max(1,Math.ceil(Math.hypot(p.x-s.x,p.z-s.z)/.05)),dx=(p.x-s.x)/n,dz=(p.z-s.z)/n;
  for(let i=0;i<n;i++) {
    const prev=s;s=step(nav,s,dx,dz);
    assert.ok(clear(nav,s),'unsupported stair movement');
    assert.ok(Math.abs(s.y-prev.y)<.04,'stair movement teleported vertically');audit(s);
  }
  assert.ok(Math.hypot(s.x-p.x,s.z-p.z)<.025,`${s.floor}: blocked before ${p.x},${p.z}`);
  assert.equal(s.floor,p.floor);assert.ok(Math.abs(s.y-p.y)<1e-6);return s;
}

test('一期二期29座消防梯172条层间线路双向连续可走，含地下、挑高层和屋顶',()=>{
  assert.equal(L.stairs.filter(s=>malls.some(b=>b.id===s.building)).length,29);
  assert.equal(malls.reduce((n,b)=>n+b.access.routes.length,0),172);
  for(const b of malls)for(const route of b.access.routes)for(const reversed of [false,true]) {
    const path=reversed?[...route.waypoints].reverse():route.waypoints;
    let s={...path[0],slope:null},flightSteps=0;
    assert.ok(clear(nav,s),`${route.id} has no accessible doorway`);
    for(const p of path.slice(1))s=move(s,p,s=>{
      if(s.slope){assert.equal(nav.slopeById.get(s.slope.id).kind,'protected-stair');flightSteps++;}
    });
    assert.ok(flightSteps>30);assert.equal(s.slope,null);
  }
});

test('楼梯切开实体楼板，薄入口平台与半层平台有实际支撑，所有门继续朝公共走道',()=>{
  for(const b of malls) {
    for(const lv of L.levels.filter(l=>l.building===b.id))for(const stair of L.stairs.filter(s=>s.building===b.id&&s.serves.includes(lv.id))) {
      const p=mallStairPlan(stair),v=lv.voids.find(v=>v.stair===stair.id),room=lv.rooms.find(r=>r.id===stair.id);
      const center=toW(stair.frame,...p.point(p.span/2,(p.start+p.depth)/2));
      assert.ok(!onSlab(lv,center));assert.ok(lv.slab.pieces.some(piece=>piece.holes.some(h=>pointInPoly(center,h))));
      assert.ok(v&&room.openStair&&room.navigationWalls.length>=4);
      const landing=lv.slab.pieces.find(piece=>piece.stair===stair.id);
      assert.equal(landing.thickness,.12);
      for(const q of polySamples(landing.outer,.4,.08))assert.ok(onSlab(lv,q));
      const d=stairDoor(stair,lv.id),m=midOf(d);assert.ok(inWalk(lv,[m[0]+d.nx*.55,m[1]+d.nz*.55]),`${stair.id}/${lv.id} door left public corridor`);
    }
    for(const surface of b.access.surfaces)assert.ok(nav.floors.has(surface.id));
    for(const f of b.access.flights) {
      assert.ok(f.rise/f.steps<=.175001);assert.ok(f.run/f.steps>=.26999);assert.ok(f.width>=1.2);
      const x=(f.bottom.x+f.top.x)/2,z=(f.bottom.z+f.top.z)/2,y=(f.bottom.y+f.top.y)/2;
      assert.equal(landAt(nav,x,z,y+.01)?.slope?.id,f.id);
    }
  }
});

test('完整梯段、平台、墙和真实厚楼板均避开身体与2米头部净空',()=>{
  for(const b of malls) {
    const solids=[],levels=L.levels.filter(l=>l.building===b.id),stairs=L.stairs.filter(s=>s.building===b.id);
    let frame;
    const B={frame:(f,fn)=>{frame=f;fn();},get:()=>({box:(x,y,z,w,h,d)=>{
      assert.ok(w>0&&h>0&&d>0);solids.push({frame,x,y,z,w,h,d});
    },bar:()=>{}})};
    for(const lv of levels)buildMallStairLevel(B,lv,stairs,b.access,{flights:true});
    for(const route of b.access.routes) {
      const lower=nav.floors.get(route.from).y,upper=nav.floors.get(route.to).y;
      const relevant=solids.filter(o=>o.y+o.h/2>lower+.4&&o.y-o.h/2<upper+2);
      const slabs=levels.filter(lv=>lv.elev>lower+.4&&lv.elev-(SLAB_T[lv.kind]||.45)-.03<upper+2);
      let s={...route.waypoints[0],slope:null};
      for(const p of route.waypoints.slice(1))s=move(s,p,state=>{
        for(const o of relevant)if(o.y+o.h/2>state.y+.4&&o.y-o.h/2<state.y+2) {
          const [x,z]=toL(o.frame,state.x,state.z);
          assert.ok(Math.abs(o.x-x)>=o.w/2+.24||Math.abs(o.z-z)>=o.d/2+.24,
            `${route.id}: solid clips body at ${x},${state.y},${z}; solid ${JSON.stringify({...o,frame:o.frame.id})}`);
        }
        for(const lv of slabs)for(const piece of lv.slab.pieces) {
          const bottom=lv.elev-.03-(piece.thickness??SLAB_T[lv.kind]??.45);
          if(lv.elev<=state.y+.4||bottom>=state.y+2)continue;
          for(const [dx,dz] of [[0,0],[.24,0],[-.24,0],[0,.24],[0,-.24]]) {
            const q=[state.x+dx,state.z+dz];
            assert.ok(!pointInPoly(q,piece.outer)||piece.holes.some(h=>pointInPoly(q,h)),`${route.id}: ${lv.id} slab clips head at ${state.y}`);
          }
        }
      });
    }
  }
});

test('数百梯段共享有限模板，完整楼层批次正确摆放且不复制大几何',()=>{
  const materials=Object.fromEntries(['concrete','extMetal','glowSoft'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  const levels=Object.fromEntries(L.levels.filter(l=>malls.some(b=>b.id===l.building)).map(l=>[l.id,{batch:new BatchSet(materials),base:new THREE.Group(),signs:{frame:(f,fn)=>fn(),place:()=>{}}}]));
  const ctx={layout:L,levels,mats:{base:materials},atlas:Object.fromEntries(Object.keys(levels).map(id=>[id,{cell:()=>null}]))};
  buildMallStairs(ctx);
  assert.ok(ctx.mallStairStats.templates<=12);assert.ok(ctx.mallStairStats.storedVertices<90000);
  for(const b of malls)for(const lv of L.levels.filter(l=>l.building===b.id)) {
    const meshes=levels[lv.id].base.children,flights=b.access.flights.filter(f=>f.parentFloor===lv.id);
    assert.equal(meshes.filter(m=>m.material===materials.concrete).reduce((n,m)=>n+m.count,0),flights.length);
    for(const mesh of meshes)assert.ok(mesh.isInstancedMesh&&mesh.geometry.attributes.position.count<12000);
    for(const mesh of meshes.filter(m=>m.material===materials.concrete))for(let i=0;i<mesh.count;i++) {
      const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
      const origin=new THREE.Vector3().applyMatrix4(matrix);
      const f=flights.find(f=>origin.distanceTo(new THREE.Vector3(f.bottom.x,f.bottom.y,f.bottom.z))<.00005);
      assert.ok(f,'instance missing its navigable flight');
      const top=new THREE.Vector3(0,f.rise,f.run).applyMatrix4(matrix);
      assert.ok(top.distanceTo(new THREE.Vector3(f.top.x,f.top.y,f.top.z))<.00005,'rotated rendered flight differs from navigation');
    }
  }
  const geometries=new Set(Object.values(levels).flatMap(l=>l.base.children.map(m=>m.geometry)));
  for(const g of geometries)g.dispose();for(const m of Object.values(materials))m.dispose();
});
