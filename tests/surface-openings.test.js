import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildLayout } from '../src/layout/layout.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { rectPoly, pointInPoly, polyBounds, distToPolyEdge } from '../src/layout/geom.js';
import { cutSurfaceShapes, addCutSurfaceSlab } from '../src/render/build/surface-shapes.js';
import { flatShapeGeometry } from '../src/render/build/shell.js';
import { siteGroundHoles } from '../src/render/build/site.js';
import { BatchSet } from '../src/render/batch.js';

test('跨地块、重合和相交的洞口保留真实开口，裁片不会吞掉邻近地面', () => {
  const outer=rectPoly({x0:-10,z0:-10,x1:10,z1:10});
  const cuts=[
    rectPoly({x0:-4,z0:-6,x1:4,z1:2}),
    rectPoly({x0:0,z0:-2,x1:14,z1:3}),
    rectPoly({x0:-2,z0:-4,x1:2,z1:0}),
  ];
  cuts.push(cuts[0]);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes(outer,cuts),0),material);
  for(let x=-12+.17;x<12;x+=.63)for(let z=-12+.23;z<12;z+=.63) {
    const expected=pointInPoly([x,z],outer)&&!cuts.some(p=>pointInPoly([x,z],p));
    const hit=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0),0,2).intersectObject(mesh).length>0;
    assert.equal(hit,expected,`地表 ${x},${z}`);
  }
  mesh.geometry.dispose();material.dispose();
});

test('探索与FPS的地表、停车铺装和道路在坡口与首层电梯井位置真正挖空', () => {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  let count=0;
  for(const layout of [buildLayout(),buildPlayableLayout({mode:'fps'})]) {
    const openings=[...layout.site.trenches,...(layout.site.openings||[])];
    const surfaces=[
      {outer:rectPoly(layout.site.bounds),cuts:siteGroundHoles(layout)},
      ...layout.site.plazas.map(p=>({outer:p.poly,cuts:siteGroundHoles(layout)})),
      ...[...layout.site.roads,...layout.site.sidewalks].map(p=>({outer:rectPoly(p.rect),cuts:openings})),
      ...(layout.extensions?.paths||[]).filter(p=>p.kind==='ground').flatMap(p=>p.polys.map(outer=>({outer,cuts:openings}))),
      ...(layout.extensions?.surfaceParking||[]).map(p=>({outer:p.poly,cuts:openings})),
    ];
    for(const {outer,cuts} of surfaces) {
      const mesh=new THREE.Mesh(flatShapeGeometry(cutSurfaceShapes(outer,cuts),0),material);
      for(const opening of openings) {
        const r=polyBounds(opening);
        for(let x=r.x0+.37;x<r.x1;x+=1.83)for(let z=r.z0+.41;z<r.z1;z+=2.03) {
          if(!pointInPoly([x,z],opening)||distToPolyEdge([x,z],opening)<.02)continue;
          const hit=new THREE.Raycaster(new THREE.Vector3(x,.5,z),new THREE.Vector3(0,-1,0),0,1).intersectObject(mesh).length>0;
          assert.equal(hit,false,`地表仍盖住洞口 ${layout.playable?'FPS':'tour'} ${x},${z}`);count++;
        }
      }
      mesh.geometry.dispose();
    }
  }
  material.dispose();assert.ok(count>5000);
});

test('合批铺装保留洞口上下贯穿，旁边的路面及侧壁仍存在', () => {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const batch=new BatchSet({ext:material}),group=new THREE.Group();
  addCutSurfaceSlab(batch,'ext',rectPoly({x0:-6,x1:6,z0:-4,z1:4}),
    [rectPoly({x0:-1,x1:1,z0:-5,z1:5})],0,.16,'#fff');
  batch.flush(group);
  for(const x of [-4,0,4]) {
    const hits=new THREE.Raycaster(new THREE.Vector3(x,1,0),new THREE.Vector3(0,-1,0),0,2).intersectObject(group);
    assert.equal(hits.length>0,x!==0);
  }
  group.traverse(o=>o.geometry?.dispose());material.dispose();
});
