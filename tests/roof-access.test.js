import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl, inWalk, onSlab } from './helpers.js';
import { buildNav, clear, step, landAt } from '../src/layout/nav.js';
import { pointInPoly } from '../src/layout/geom.js';
import { shapeFromPoly, flatShapeGeometry } from '../src/render/build/shell.js';
import { buildElevators } from '../src/render/build/elevators.js';
import { BatchSet } from '../src/render/batch.js';

const nav=buildNav(L),roofs=['P1-RF','P2-RF'];
function floorMeshes(lv,material) {
  return lv.slab.pieces.map(p=>new THREE.Mesh(flatShapeGeometry(shapeFromPoly(p.outer,p.holes),lv.elev),material));
}
const floorHit=(meshes,lv,x,z)=>new THREE.Raycaster(new THREE.Vector3(x,lv.elev+1,z),new THREE.Vector3(0,-1,0),0,2).intersectObjects(meshes).length>0;

test('两期新增8台天台扶梯有真实楼板开口和落地平台，可逐步上下楼',()=>{
  const additions=L.escalators.filter(e=>roofs.includes(e.to)&&/ROOF[12]-[UD]$/.test(e.id));
  assert.equal(additions.length,8);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const e of additions) {
    const upper=lvl(e.to),meshes=floorMeshes(upper,material);
    const dx=e.top.x-e.bottom.x,dz=e.top.z-e.bottom.z,run=Math.hypot(dx,dz),ux=dx/run,uz=dz/run;
    const middle=[(e.bottom.x+e.top.x)/2,(e.bottom.z+e.top.z)/2];
    assert.ok(upper.voids.some(v=>v.kind==='escalator'&&pointInPoly(middle,v.poly)),`${e.id}: no structural opening`);
    assert.equal(floorHit(meshes,upper,...middle),false,`${e.id}: rendered roof slab crosses flight`);
    for(const beyond of [.4,1.2,2])for(const side of [-.35,0,.35]) {
      const x=e.top.x+ux*beyond-uz*side,z=e.top.z+uz*beyond+ux*side;
      assert.ok(onSlab(upper,[x,z])&&inWalk(upper,[x,z]),`${e.id}: missing landing at ${beyond},${side}`);
      assert.ok(floorHit(meshes,upper,x,z),`${e.id}: landing not rendered`);
    }
    const descending=e.dir==='down',sign=descending?-1:1;
    let s=descending?{floor:e.to,x:e.top.x+ux*1.2,z:e.top.z+uz*1.2,y:e.top.y,slope:null}
      :{floor:e.from,x:e.bottom.x-ux*1.2,z:e.bottom.z-uz*1.2,y:e.bottom.y,slope:null};
    assert.ok(clear(nav,s),`${e.id}: inaccessible approach`);
    const n=Math.ceil((run+2.4)/.07),stride=(run+2.4)/n;
    let slopeSteps=0;
    for(let i=0;i<n;i++) {
      const prior=s;s=step(nav,s,ux*stride*sign,uz*stride*sign);
      assert.ok(clear(nav,s));assert.ok(Math.abs(s.y-prior.y)<.06,`${e.id}: vertical teleport`);
      if(s.slope)slopeSteps++;
    }
    assert.ok(slopeSteps>30);assert.equal(s.floor,descending?e.from:e.to);
    assert.ok(Math.abs(s.y-(descending?e.bottom.y:e.top.y))<.00001);
    for(const mesh of meshes)mesh.geometry.dispose();
  }
  material.dispose();
});

test('六台观光梯均到达屋顶，电梯井真正挖空且门外有可站立楼板',()=>{
  const lifts=L.elevators.filter(e=>e.type==='glass'&&['P1','P2'].includes(e.building));
  assert.equal(lifts.length,6);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const e of lifts) {
    const roof=lvl(`${e.building}-RF`),meshes=floorMeshes(roof,material);
    assert.equal(e.serves.at(-1),roof.id);
    assert.ok(roof.voids.some(v=>v.kind==='shaft'&&pointInPoly([e.x,e.z],v.poly)),`${e.id}: roof has no shaft void`);
    assert.equal(floorHit(meshes,roof,e.x,e.z),false,`${e.id}: rendered roof blocks shaft`);
    const landing=nav.links.find(k=>k.id===e.id).stops.find(s=>s.floor===roof.id);
    assert.ok(landing,`${e.id}: missing roof lift stop`);
    assert.ok(clear(nav,{...landing,y:roof.elev,slope:null}));
    assert.ok(onSlab(roof,[landing.x,landing.z])&&inWalk(roof,[landing.x,landing.z]));
    assert.ok(floorHit(meshes,roof,landing.x,landing.z));
    assert.equal(landAt(nav,landing.x,landing.z,roof.elev+.05)?.floor,roof.id);
    for(const mesh of meshes)mesh.geometry.dispose();
  }
  material.dispose();
});

test('观光梯每层真实井道门在2.9m以下畅通，背面玻璃仍然存在',()=>{
  const lifts=L.elevators.filter(e=>e.type==='glass'&&['P1','P2'].includes(e.building));
  const materials={metal:new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),glass:new THREE.MeshBasicMaterial({side:THREE.DoubleSide})};
  const levels=Object.fromEntries(L.levels.map(l=>[l.id,{batch:new BatchSet(materials)}]));
  buildElevators({layout:{elevators:lifts},lvById:Object.fromEntries(L.levels.map(l=>[l.id,l])),levels});
  for(const id of new Set(lifts.flatMap(e=>e.serves))) {
    const lv=lvl(id),group=new THREE.Group();levels[id].batch.flush(group);group.updateMatrixWorld(true);
    for(const e of lifts.filter(l=>l.serves.includes(id)))for(const height of [.1,.35,1,1.8,2.2,2.85]) {
      for(const side of [-.4,0,.4]) {
        const x=e.x+e.nx*(e.reach+.6)-e.nz*side,z=e.z+e.nz*(e.reach+.6)+e.nx*side;
        const front=new THREE.Raycaster(new THREE.Vector3(x,lv.elev+height,z),new THREE.Vector3(-e.nx,0,-e.nz),0,e.reach+.55);
        assert.equal(front.intersectObjects(group.children).length,0,`${e.id} ${id}: glass blocks door at ${height}`);
      }
      const back=new THREE.Raycaster(new THREE.Vector3(e.x-e.nx*(e.reach+.6),lv.elev+height,e.z-e.nz*(e.reach+.6)),new THREE.Vector3(e.nx,0,e.nz),0,1.2);
      assert.ok(back.intersectObjects(group.children).length>0,`${e.id}: missing rear shaft glass`);
    }
    for(const mesh of group.children)mesh.geometry.dispose();
  }
  for(const material of Object.values(materials))material.dispose();
});

test('六台观光梯完整井道没有横穿轿厢的中间楼板或金属底板，顶盖单独保留',()=>{
  const lifts=L.elevators.filter(e=>e.type==='glass'&&['P1','P2'].includes(e.building));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const levels=Object.fromEntries(L.levels.map(l=>[l.id,{batch:new BatchSet({metal:material,glass:material})}]));
  buildElevators({layout:{elevators:lifts},lvById:Object.fromEntries(L.levels.map(l=>[l.id,l])),levels});
  const group=new THREE.Group();
  for(const id of new Set(lifts.flatMap(e=>e.serves))) {
    levels[id].batch.flush(group);
    group.add(...floorMeshes(lvl(id),material));
  }
  group.updateMatrixWorld(true);
  for(const e of lifts) {
    const low=lvl(e.serves[0]),roof=lvl(e.serves.at(-1));
    const start=low.elev+.05,capBottom=roof.elev+roof.height+.2-.25;
    // Sample a cabin-sized 1.8m square, including the central vertical ray.
    for(const dx of [-.9,0,.9])for(const dz of [-.9,0,.9]) {
      const x=e.x+dx*e.frame.c-dz*e.frame.s,z=e.z+dx*e.frame.s+dz*e.frame.c;
      const ray=new THREE.Raycaster(new THREE.Vector3(x,start,z),new THREE.Vector3(0,1,0),0,capBottom-start-.05);
      assert.equal(ray.intersectObjects(group.children).length,0,`${e.id}: cabin path blocked at ${dx},${dz}`);
    }
    const capRay=new THREE.Raycaster(new THREE.Vector3(e.x,start,e.z),new THREE.Vector3(0,1,0),0,capBottom-start+1);
    const hit=capRay.intersectObjects(group.children)[0];
    assert.ok(hit&&Math.abs(hit.point.y-capBottom)<.001,`${e.id}: expected top cap is missing or an intermediate plate remains`);
  }
  for(const mesh of group.children)mesh.geometry.dispose();
  material.dispose();
});
