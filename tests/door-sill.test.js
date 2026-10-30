import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl } from './helpers.js';
import { BatchSet } from '../src/render/batch.js';
import { sill, outlineEdges } from '../src/render/build/shell.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { pointInPoly } from '../src/layout/geom.js';
import { doorGaps, storeStyle } from '../src/layout/frontage.js';

const nav=buildNav(L);
const walk=(s,dx,dz)=>{
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n);
  return s;
};

test('一期和二期二楼天桥门实际矮墙网格全宽开口，门侧仍有墙体',()=>{
  const doors=L.entrances.filter(e=>['P1-BR','P2-BR'].includes(e.id));
  assert.equal(doors.length,2);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const e of doors) {
    const lv=lvl(e.level),batch=new BatchSet({matte:material,travertine:material}),group=new THREE.Group();
    sill({layout:L,levels:{[lv.id]:{batch}},outlineEdges:()=>outlineEdges(lv.outline,L.buildings.find(b=>b.id===lv.building))},lv);
    batch.flush(group);group.updateMatrixWorld(true);
    const len=Math.hypot(e.seg.x1-e.seg.x0,e.seg.z1-e.seg.z0),tx=(e.seg.x1-e.seg.x0)/len,tz=(e.seg.z1-e.seg.z0)/len;
    const cast=(along,h,reverse=false)=>{
      const sign=reverse?-1:1,x=e.seg.x0+tx*along,z=e.seg.z0+tz*along;
      return new THREE.Raycaster(new THREE.Vector3(x-e.nx*sign,lv.elev+h,z-e.nz*sign),new THREE.Vector3(e.nx*sign,0,e.nz*sign),0,2).intersectObjects(group.children);
    };
    for(let along=.35;along<len-.3;along+=.35)for(const height of [.12,.45,.8])for(const reverse of [false,true])
      assert.equal(cast(along,height,reverse).length,0,`${e.id} rendered sill blocks doorway at ${along},${height}`);
    for(const along of [-.6,len+.6])for(const height of [.12,.45,.8])
      assert.ok(cast(along,height).length>0,`${e.id} adjacent wall missing; empty ray is not proof of an open door`);
    const cx=(e.seg.x0+e.seg.x1)/2,cz=(e.seg.z0+e.seg.z1)/2;
    const inside={floor:e.level,x:cx-e.nx*1.2,z:cz-e.nz*1.2,y:lv.elev,slope:null};
    assert.ok(clear(nav,inside));
    const outside=walk(inside,e.nx*2.4,e.nz*2.4);
    assert.equal(outside.floor,'bridge');
    const returned=walk(outside,-e.nx*2.4,-e.nz*2.4);
    assert.equal(returned.floor,e.level);
    for(const mesh of group.children)mesh.geometry.dispose();
  }
  material.dispose();
});

test('二期增加19间铺位后每个商铺仍可从真实门段双向进出',()=>{
  // Before this density pass the four retail floors contained 21/24/22/21 units.
  const minimum={'1F':26,'2F':29,'3F':28,'4F':24};
  let count=0,entered=0;
  for(const [short,min] of Object.entries(minimum)) {
    const lv=lvl(`P2-${short}`);assert.ok(lv.units.length>=min,`${lv.id} lost infill shops`);count+=lv.units.length;
    for(const u of lv.units) {
      const style=storeStyle(lv,u);if(style==='rink')continue;
      const accessible=u.wfronts.some(w=>{
        const len=Math.hypot(w.x1-w.x0,w.z1-w.z0);
        return doorGaps(style,len).some(([a,b])=>{
          const t=(a+b)/2/len,x=w.x0+(w.x1-w.x0)*t,z=w.z0+(w.z1-w.z0)*t;
          const start={floor:lv.id,x:x+w.nx*1.5,z:z+w.nz*1.5,y:lv.elev,slope:null};
          if(!clear(nav,start))return false;
          const inside=walk(start,-w.nx*3,-w.nz*3);
          if(inside.floor!==lv.id||!u.polys.some(p=>pointInPoly([inside.x,inside.z],p)))return false;
          const outside=walk(inside,w.nx*3,w.nz*3);
          return outside.floor===lv.id&&Math.hypot(outside.x-start.x,outside.z-start.z)<.02;
        });
      });
      assert.ok(accessible,`${u.code} ${u.brand.name}: cannot enter and leave`);entered++;
    }
  }
  assert.ok(count>=107);assert.equal(entered,count-1,'only the dedicated ice rink is excluded');
});
