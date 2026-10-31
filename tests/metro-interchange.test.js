import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, lvl, onSlab } from './helpers.js';
import { toW, pointInPoly } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { sampleMetroService } from '../src/render/metro-service.js';
import { BatchSet } from '../src/render/batch.js';
import { buildMetro } from '../src/render/build/metro.js';
import { buildTourSteps } from '../src/render/tour.js';
import { buildShell } from '../src/render/build/shell.js';
import { tunnelSkin } from '../src/render/build/metro-interchange.js';

const metro=L.buildings.find(b=>b.id==='M'),nav=buildNav(L),lines=metro.interchange.lines;
const paint=new Proxy({}, {get:(t,k)=>k in t?t[k]:k==='measureText'?()=>({width:10}):String(k).startsWith('create')?()=>({addColorStop(){}}):()=>{},set:(t,k,v)=>(t[k]=v,true)});
globalThis.document ??= {createElement:()=>({width:0,height:0,getContext:()=>paint})};
function scene(){
  const materials=new Proxy({}, {get:(m,k)=>m[k] ||= new THREE.MeshBasicMaterial({side:THREE.DoubleSide})});
  const levels=Object.fromEntries(L.levels.map(lv=>[lv.id,{lv,batch:new BatchSet(materials),shellBatch:new BatchSet(materials),base:new THREE.Group(),shell:new THREE.Group(),group:new THREE.Group()}]));
  const ctx={layout:L,levels,buildings:{M:{b:metro}},bById:Object.fromEntries(L.buildings.map(b=>[b.id,b])),lvById:Object.fromEntries(L.levels.map(l=>[l.id,l])),renderer:{},dynamic:[],
    mats:{base:materials,screen:()=>materials.screen,steps:{up:materials.steps},floor:()=>materials.floor,onNight(){}}};
  buildShell({...ctx,layout:{...L,levels:L.levels.filter(l=>l.building==='M'),buildings:[metro]}});
  buildMetro(ctx);
  for(const v of Object.values(levels)){v.batch.flush(v.base);v.shellBatch.flush(v.shell);v.group.add(v.base,v.shell);v.group.updateMatrixWorld(true);}
  return ctx;
}
const ctx=scene();
const staticMeshes=[];
for(const line of Object.values(ctx.levels).filter(l=>l.lv.building==='M'))line.group.traverse(o=>{
  if(o.isMesh&&!hasTrainAncestor(o))staticMeshes.push(o);
});
function hasTrainAncestor(o){for(;o;o=o.parent)if(o.name.startsWith('M-train-'))return true;return false;}

test('two perpendicular operating lines have three separated real platforms each, with lifts and two ends of access',()=>{
  assert.deepEqual(lines.map(l=>[l.id,l.level,l.frame.deg]),[['7','M-B2',0],['12','M-B4',90]]);
  assert.equal(lvl('M-B2').elev-lvl('M-B4').elev,15);
  for(const line of lines){
    const lv=lvl(line.level);assert.equal(line.platforms.length,3);
    assert.deepEqual(line.platforms.map(p=>p.role),['alight','board','board']);
    for(const p of line.platforms){
      const v=(p.rect.z0+p.rect.z1)/2,q=toW(line.frame,-8,v);
      assert.ok(onSlab(lv,q));
      assert.ok(L.elevators.some(e=>e.serves.includes(lv.id)&&pointInPoly([e.x,e.z],lv.walk.find(w=>w.id===`M-${line.id}-${p.id}`).poly)));
      for(const s of [-1,1])assert.ok(L.escalators.some(e=>e.building==='M'&&e.from===lv.id&&Math.hypot(e.bottom.x-toW(line.frame,s*12,v)[0],e.bottom.z-toW(line.frame,s*12,v)[1])<2));
    }
    for(const side of [-1,1]){
      const track=toW(line.frame,8,side*7.6);assert.equal(onSlab(lv,track),false,'track has no pedestrian slab');
      const start=toW(line.frame,8,side*4),end=toW(line.frame,8,side*12);
      let state={x:start[0],z:start[1],y:lv.elev,floor:lv.id,slope:null};assert.ok(clear(nav,state));
      for(let i=0;i<100;i++)state=step(nav,state,(end[0]-start[0])/100,(end[1]-start[1])/100);
      assert.ok(Math.hypot(state.x-start[0],state.z-start[1])<2,'cannot walk through PSD onto tracks');
    }
  }
});

test('both lines and directions move, stop before opening, alight first, board second, and close before departure',()=>{
  for(const line of lines)for(const dir of [-1,1]){
    const offset=line.phase+(dir<0?45:0),at=t=>sampleMetroService(t-offset,line.phase,dir);
    assert.ok(Math.abs(at(10).x)>Math.abs(at(18).x));assert.equal(at(22).x,0);
    assert.equal(at(24.5).alight,1);assert.equal(at(24.5).board,0);
    assert.equal(at(30).alight,1);assert.equal(at(30).board,1);
    assert.equal(at(45).alight,0);assert.equal(at(45).board,0);
    assert.ok(Math.abs(at(60).x)>Math.abs(at(50).x));assert.equal(at(75).visible,false);
    for(let t=0;t<180;t+=.1){const q=at(t);if(q.alight>0||q.board>0){assert.equal(q.x,0);assert.equal(q.stopped,true);}assert.ok(q.board<=q.alight+1e-8);}
  }
});

test('actual train and PSD meshes share door phases and leave openings on both sides of all four services',()=>{
  assert.equal(ctx.metroServices.length,4);
  const animation=ctx.dynamic.find(d=>d.name==='metro'),app={camera:{position:{y:-40}}};
  const ray=new THREE.Raycaster();
  for(const service of ctx.metroServices){
    const {line,train,inner,outer}=service,offset=line.phase+(train.dir<0?45:0);
    for(const t of [24.5,30,45,55]){
      animation.update(0,t-offset,app);train.group.updateMatrixWorld(true);
      assert.equal(train.left.position.x,-.64*service.state.alight);assert.equal(inner.left.position.x,-.98*service.state.alight);
      assert.equal(train.board.left.position.x,-.64*service.state.board);assert.equal(outer.left.position.x,-.98*service.state.board);
      if(t!==30)continue;
      const center=toW(line.frame,-47.5-6.6,train.dir*line.track);
      for(const side of [-1,1])for(const h of [.6,1.65]){
        const origin=toW(line.frame,-54.1,train.dir*line.track+side*2.4);
        const direction=new THREE.Vector3(center[0]-origin[0],0,center[1]-origin[1]).normalize();
        ray.set(new THREE.Vector3(origin[0],service.lv.elev+h,origin[1]),direction);ray.near=0;ray.far=1.2;
        assert.equal(ray.intersectObject(train.group,true).length,0,`${line.id}/${train.dir}: open train door blocked`);
      }
    }
  }
});

test('all 36 escalators have physical slab and suspended-ceiling headroom throughout the rise',()=>{
  const ray=new THREE.Raycaster();ray.far=1.6;
  for(const e of L.escalators.filter(e=>e.building==='M')){
    const dx=e.top.x-e.bottom.x,dz=e.top.z-e.bottom.z,len=Math.hypot(dx,dz);
    for(let i=0;i<=35;i++)for(const side of [-.24,0,.24]){
      const t=i/35,x=e.bottom.x+dx*t-dz/len*side,z=e.bottom.z+dz*t+dx/len*side,y=e.bottom.y+e.rise*t;
      ray.set(new THREE.Vector3(x,y+.4,z),new THREE.Vector3(0,1,0));
      const hit=ray.intersectObjects(staticMeshes,false);
      assert.equal(hit.length,0,`${e.id} head blocked at ${x},${y},${z} by ${hit[0]?.object.name}`);
    }
  }
});

test('both twin tunnels extend 194m beyond each station end and retain cylindrical clearance and texture coordinates',()=>{
  for(const line of lines)for(const sign of [-1,1])for(const trackSide of [-1,1])for(const upper of [false,true]){
    const g=tunnelSkin(line,lvl(line.level).elev,sign,trackSide,upper);g.computeBoundingBox();
    assert.ok(Math.abs(g.boundingBox.max.x-g.boundingBox.min.x-194)<1e-6);assert.equal(g.attributes.position.count,g.attributes.uv.count);
    const p=g.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(Math.abs(Math.hypot(p.getY(i)-lvl(line.level).elev-1.5,p.getZ(i)-trackSide*line.track)-3.2)<.00001);
    g.dispose();
  }
});

test('full-tour camera route initializes with both lines and the transfer concourse',()=>{const steps=buildTourSteps(L);for(const key of ['7 号线','12 号线','十字换乘'])assert.ok(steps.some(s=>s.caption.includes(key)));for(const s of steps)assert.ok([...s.pos.toArray(),...s.target.toArray(),s.dur].every(Number.isFinite));});
