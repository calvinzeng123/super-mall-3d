import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl, onSlab } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { toW, rect, lrectPoly, polysOverlap, pointInPoly } from '../src/layout/geom.js';
import { BatchSet } from '../src/render/batch.js';
import { buildMetro } from '../src/render/build/metro.js';
import { buildPark } from '../src/render/build/park.js';
import { buildShell } from '../src/render/build/shell.js';
import { buildLabels } from '../src/render/build/labels.js';

const b=L.buildings.find(b=>b.id==='M'),added=b.exits.filter(e=>e.approach),nav=buildNav(L);
test('A–H provide two exits per quadrant and retain every original A–D entrance',()=>{
  assert.deepEqual(b.exits.map(e=>e.id).sort(),['A','B','C','D','E','F','G','H']);
  const counts={};for(const e of b.exits){const k=`${Math.sign(e.kiosk.x)},${Math.sign(e.kiosk.z)}`;counts[k]=(counts[k]||0)+1;}
  assert.equal(Object.keys(counts).length,4);assert.ok(Object.values(counts).every(n=>n===2));
  const compact=buildLayout({expansion:false});
  for(const original of compact.entrances.filter(e=>e.building==='M'))assert.deepEqual(L.entrances.find(e=>e.id===original.id),original);
  assert.equal(compact.buildings.find(b=>b.id==='M').exits.length,4);
});

test('new canopy envelopes avoid roads, existing buildings, ramps and the art court',()=>{
  const obstacles=[...L.site.roads,...L.site.sidewalks,...L.ramps,...L.site.forecourt.obstacles].map(r=>({id:r.id,poly:r.poly}));
  for(const b of L.buildings.filter(b=>['mall','annex','tower'].includes(b.kind)))obstacles.push({id:b.id,poly:b.outline});
  const p3=L.buildings.find(b=>b.id==='P3');
  for(const k of p3.blocks||[])if(k.poly)obstacles.push({id:k.id,poly:k.poly});
  for(const e of added){
    const envelope=lrectPoly(e.kiosk.frame,rect(-.7,-3.8,12.4,3.8));
    for(const o of obstacles)if(o.poly)assert.ok(!polysOverlap(envelope,o.poly),`${e.id} overlaps ${o.id}`);
    for(const p of L.site.trenches)assert.ok(!polysOverlap(envelope,p),`${e.id} caps a trench`);
    assert.ok(!polysOverlap(e.approach.poly,L.expansion.sunkenCourt.poly),`${e.id} paving caps art court`);
  }
});

const walkPoints=ex=>{
  const p=b.passages.find(p=>p.id===ex.passage),[a,c]=p.route;
  const len=Math.hypot(c[0]-a[0],c[1]-a[1]),start=[a[0]-(c[0]-a[0])/len*2,a[1]-(c[1]-a[1])/len*2];
  return [[...start,-4.5],...p.route.map(q=>[...q,-4.5]),[...toW(ex.kiosk.frame,12.5,0),0],...ex.approach.points.slice(1).map(q=>[...q,0])];
};
function walk(points,floor){
  let s={floor,x:points[0][0],z:points[0][1],y:points[0][2],slope:null};assert.ok(clear(nav,s));
  for(const [x,z,y]of points.slice(1)){
    const n=Math.max(1,Math.ceil(Math.hypot(x-s.x,z-s.z)/.04)),dx=(x-s.x)/n,dz=(z-s.z)/n;
    for(let i=0;i<n;i++){const old=s;s=step(nav,s,dx,dz);assert.ok(clear(nav,s));assert.ok(Math.abs(s.y-old.y)<.04,'no vertical teleport');}
    assert.ok(Math.hypot(s.x-x,s.z-z)<.035,`blocked ${floor}: ${s.x},${s.z} -> ${x},${z}`);
    assert.ok(Math.abs(s.y-y)<.035);
  }
  return s;
}
test('all four new routes walk continuously from unpaid B1 to the sidewalk and back',()=>{
  for(const ex of added){
    const points=walkPoints(ex),end=walk(points,'M-B1');assert.equal(end.floor,'ground');
    assert.equal(walk(points.reverse(),end.floor).floor,'M-B1');
  }
});

const paint=new Proxy({}, {get:(t,k)=>k in t?t[k]:k==='measureText'?()=>({width:10}):String(k).startsWith('create')?()=>({addColorStop(){}}):()=>{},set:(t,k,v)=>(t[k]=v,true)});
globalThis.document ??= {createElement:()=>({width:0,height:0,getContext:()=>paint})};
function scene(){
  const materials=new Proxy({}, {get:(m,k)=>m[k] ||= new THREE.MeshBasicMaterial({side:THREE.DoubleSide})});
  const levels=Object.fromEntries(L.levels.map(lv=>[lv.id,{lv,batch:new BatchSet(materials),shellBatch:new BatchSet(materials),base:new THREE.Group(),shell:new THREE.Group(),group:new THREE.Group(),labels:new THREE.Group()}]));
  const site={group:new THREE.Group(),picks:new THREE.Group(),batch:new BatchSet(materials),labels:new THREE.Group()};
  const ctx={layout:L,levels,site,buildings:{M:{b}},bById:Object.fromEntries(L.buildings.map(b=>[b.id,b])),lvById:Object.fromEntries(L.levels.map(l=>[l.id,l])),renderer:{},dynamic:[],
    mats:{base:materials,screen:()=>materials.screen,steps:{up:materials.steps},floor:()=>materials.floor,onNight(){}}};
  buildShell({...ctx,layout:{...L,levels:L.levels.filter(l=>l.building==='M'||l.id==='P3-1F'),buildings:[b]}});
  buildMetro(ctx);buildPark(ctx);site.batch.flush(site.group);site.group.updateMatrixWorld(true);
  const meshes=[];
  for(const v of Object.values(levels)){v.batch.flush(v.base);v.shellBatch.flush(v.shell);v.group.add(v.base,v.shell);v.group.updateMatrixWorld(true);v.group.traverse(o=>{if(o.isMesh)meshes.push(o);});}
  site.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
  return {ctx,meshes};
}
const {ctx,meshes}=scene();
test('the complete tour labels initialize with finite positions for bent and diagonal passages',()=>{
  buildLabels(ctx);
  for(const v of Object.values(ctx.levels))for(const s of v.labels.children)assert.ok(s.position.toArray().every(Number.isFinite));
  for(const p of b.passages.filter(p=>p.extension)){
    const [x,z]=p.route[Math.floor(p.route.length/2)];
    assert.ok(ctx.levels['M-B1'].labels.children.some(s=>s.position.x===x&&s.position.z===z));
  }
});
test('actual corridor walls and signs leave the station mouths, turns and stair bottoms open',()=>{
  const ray=new THREE.Raycaster();
  for(const ex of added){
    const p=b.passages.find(p=>p.id===ex.passage),points=walkPoints(ex).slice(0,-3);
    for(let i=1;i<points.length;i++){
      const [a,c]=[points[i-1],points[i]],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);
      for(const lateral of [-1,0,1])for(const h of [.6,1.65,2.2]){
        ray.set(new THREE.Vector3(a[0]-dz/len*lateral,-4.5+h,a[1]+dx/len*lateral),new THREE.Vector3(dx/len,0,dz/len));ray.far=len;
        assert.equal(ray.intersectObjects(meshes,false).length,0,`${ex.id} corridor blocked at segment ${i}, ${lateral}, ${h}`);
      }
    }
    for(const [x,z]of p.route.slice(1,-1))assert.ok(onSlab(lvl('M-B1'),[x,z]));
  }
});

test('exit stairs have physical headroom and both partial park G and street H wells are genuinely cut',()=>{
  const ray=new THREE.Raycaster();ray.far=1.65;
  for(const ex of added)for(let u=.2;u<9.5;u+=.3)for(const v of [-1.9,-.5]){
    const [x,z]=toW(ex.kiosk.frame,u,v),y=-4.5+u/9.5*4.5;
    ray.set(new THREE.Vector3(x,y+.4,z),new THREE.Vector3(0,1,0));
    assert.equal(ray.intersectObjects(meshes,false).length,0,`${ex.id} head blocked at ${u},${v}`);
  }
  const park=ctx.site.group.getObjectByName('park-forecourt');
  for(const [x,z]of [[96.5,26],[97.5,26]]){
    ray.set(new THREE.Vector3(x,2,z),new THREE.Vector3(0,-1,0));ray.far=3;
    assert.equal(ray.intersectObject(park).length,0,'G partial opening was capped by park paving');
  }
  const H=b.exits.find(e=>e.id==='H');
  for(const u of [1,4,8])assert.equal(onSlab(lvl('P3-1F'),toW(H.kiosk.frame,u,0)),false);
  assert.ok(pointInPoly([-22,89],lvl('P3-1F').outline));
});
