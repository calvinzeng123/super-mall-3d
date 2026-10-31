import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L } from './helpers.js';
import { BatchSet } from '../src/render/batch.js';
import { buildMetro } from '../src/render/build/metro.js';

const paint = new Proxy({}, {
  get: (t,k) => k in t ? t[k] : k === 'measureText' ? () => ({width:10}) : String(k).startsWith('create') ? () => ({addColorStop(){}}) : () => {},
  set: (t,k,v) => {t[k]=v;return true;},
});
globalThis.document ??= {createElement:()=>({width:0,height:0,getContext:()=>paint})};

test('艺术通廊在地铁 A 通道的实际墙面、广告和门框均保留入口净空', () => {
  const materials = new Proxy({}, {get:(m,k)=>m[k] ||= new THREE.MeshBasicMaterial({side:THREE.DoubleSide})});
  const levels = Object.fromEntries(L.levels.map(lv=>[lv.id,{lv,batch:new BatchSet(materials),shellBatch:new BatchSet(materials),base:new THREE.Group(),shell:new THREE.Group(),group:new THREE.Group()}]));
  const ctx={layout:L,levels,bById:Object.fromEntries(L.buildings.map(b=>[b.id,b])),lvById:Object.fromEntries(L.levels.map(l=>[l.id,l])),renderer:{},dynamic:[],
    mats:{base:materials,screen:()=>materials.screen,steps:{up:materials.steps}}};
  buildMetro(ctx);
  const meshes=[];
  for(const v of Object.values(levels)){
    v.batch.flush(v.base);v.shellBatch.flush(v.shell);
    for(const g of [v.base,v.shell]){g.updateMatrixWorld(true);if(['P1-B1M','M-B1'].includes(v.lv.id))g.traverse(o=>{if(o.isMesh)meshes.push(o);});}
  }
  const e=L.entrances.find(e=>e.id===L.expansion.sunkenCourt.metroPortal),x=(e.seg.x0+e.seg.x1)/2,z=(e.seg.z0+e.seg.z1)/2;
  function cross(offset,h){
    return new THREE.Raycaster(new THREE.Vector3(x-e.nz*offset-e.nx*.8,-4.5+h,z+e.nx*offset-e.nz*.8),new THREE.Vector3(e.nx,0,e.nz),0,1.6).intersectObjects(meshes,false);
  }
  for(const offset of [-1.8,0,1.8])for(const h of [.5,1.65,2.3])assert.equal(cross(offset,h).length,0,`地铁入口被模型封住 ${offset},${h}`);
  assert.ok(cross(3.4,1.65).length>0,'入口外的站厅墙面不能随开洞删除');
  for(const v of Object.values(levels))for(const g of [v.base,v.shell])g.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();});
  for(const m of Object.values(materials))m.dispose();
});
