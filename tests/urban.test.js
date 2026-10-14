import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { convexOverlap, rectPoly, pointInPoly } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
const U=L.site.urban;
test('城市路网与既有大道、外环相接，所有新增道路属于同一连通网络',()=>{
  const roads=L.site.roads, seen=new Set([roads[0].id]);
  const touching=(a,b)=>a.x0<=b.x1+.01&&a.x1>=b.x0-.01&&a.z0<=b.z1+.01&&a.z1>=b.z0-.01;
  for(let n=0;n<roads.length;n++)for(const a of roads)if(seen.has(a.id))for(const b of roads)if(touching(a.rect,b.rect))seen.add(b.id);
  for(const r of U.roads)assert.ok(seen.has(r.id),`断路 ${r.id}`);
  assert.ok(U.roads.length>=24);assert.ok(U.blocks.length>=30);assert.ok(U.buildings.length>=60);
});
test('新增道路铺面无重复、地块和楼体避让原商场与停车设施',()=>{
  const protectedPolys=[...L.buildings.filter(b=>!b.undergroundOnly).map(b=>b.outline),L.site.westParking.poly,...L.site.trenches,...L.site.openings];
  for(const r of U.roads)for(const p of protectedPolys)assert.ok(!convexOverlap(r.poly,p,.01),`${r.id} 穿过原设施`);
  for(const [i,r] of U.surfaces.entries())for(const q of U.surfaces.slice(i+1))assert.ok(!convexOverlap(rectPoly(r),rectPoly(q),.001),'交叉口重复铺面');
  for(const b of U.blocks) {
    for(const r of L.site.roads)assert.ok(!convexOverlap(b.poly,r.poly,.01),`${b.id} 压路 ${r.id}`);
    for(const p of protectedPolys)assert.ok(!convexOverlap(b.poly,p,.01),`${b.id} 覆盖原设施`);
  }
  for(const b of U.buildings){const block=U.blocks.find(p=>p.id===b.block);assert.ok(b.poly.every(p=>pointInPoly(p,block.poly)));}
});
test('新增四向道路和外围环路实际可走，城市楼体不能穿过',()=>{
  const nav=buildNav(L);
  const routes=[[[-280,8],[-880,8],[-880,-790],[5,-790],[5,-280]],[[280,8],[880,8],[880,790],[5,790],[5,280]], [[-530,-790],[-530,790]],[[530,-790],[530,790]]];
  for(const route of routes)for(const reverse of [false,true]) {
    const points=reverse?[...route].reverse():route;let s={floor:'ground',x:points[0][0],z:points[0][1],y:0,slope:null};assert.ok(clear(nav,s));
    for(const p of points.slice(1)) {const dx=p[0]-s.x,dz=p[1]-s.z,n=Math.ceil(Math.hypot(dx,dz)/.3);for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n,0);assert.ok(Math.hypot(s.x-p[0],s.z-p[1])<.05,`停在 ${s.x},${s.z} 目标 ${p}`);}
  }
  for(const b of U.buildings)assert.ok(!clear(nav,{floor:'ground',x:b.x,z:b.z,y:0}));
});
