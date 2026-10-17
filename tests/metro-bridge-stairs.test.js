import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, onSlab, inWalk, stairDoor, midOf } from './helpers.js';
import { buildNav, step, clear, landAt } from '../src/layout/nav.js';
import { toL, toW, pointInPoly } from '../src/layout/geom.js';
import { mallStairPlan } from '../src/layout/mall-stairs.js';
import { buildMallStairLevel } from '../src/render/build/mall-stairs.js';
import { platformCeiling } from '../src/render/build/metro.js';
import { tower } from '../src/render/build/bridges.js';
import { SLAB_T } from '../src/render/build/shell.js';

const nav=buildNav(L),metro=L.buildings.find(b=>b.id==='M'),br=L.bridges;
const routes=[...metro.access.routes,...br.access.routes];
const pathOf=route=>route.waypoints.map(p=>({...p,floor:p.floor==='street'?nav.groundAt(p.x,p.z):p.floor}));
function move(state,p,audit=()=>{}) {
  const n=Math.max(1,Math.ceil(Math.hypot(p.x-state.x,p.z-state.z)/.05)),dx=(p.x-state.x)/n,dz=(p.z-state.z)/n;
  for(let i=0;i<n;i++) {
    const previous=state;state=step(nav,state,dx,dz);
    assert.ok(clear(nav,state),'unsupported movement');assert.ok(Math.abs(state.y-previous.y)<.04,'vertical teleport');audit(state);
  }
  assert.ok(Math.hypot(p.x-state.x,p.z-state.z)<.025,`${state.floor} blocked before ${JSON.stringify(p)}`);
  assert.equal(state.floor,p.floor);assert.ok(Math.abs(state.y-p.y)<1e-6);return state;
}

test('地铁与桥塔4座连续楼梯16梯段12平台，真实门口开始逐步双向走通',()=>{
  assert.equal(routes.length,4);assert.equal(metro.access.flights.length+br.access.flights.length,16);
  assert.equal(metro.access.surfaces.length+br.access.surfaces.length,12);
  for(const route of routes)for(const reverse of [false,true]) {
    const path=pathOf(route);if(reverse)path.reverse();let s={...path[0],slope:null},slopes=0;
    assert.ok(clear(nav,s),`${route.id}: blocked entrance`);
    for(const p of path.slice(1))s=move(s,p,q=>{if(q.slope){assert.equal(nav.slopeById.get(q.slope.id).kind,'protected-stair');slopes++;}});
    assert.ok(slopes>80);assert.equal(s.slope,null);
  }
  for(const f of [...metro.access.flights,...br.access.flights]) {
    assert.ok(f.width>=1.2&&f.rise/f.steps<=.175001&&f.run/f.steps>=.26999);
    assert.equal(landAt(nav,(f.bottom.x+f.top.x)/2,(f.bottom.z+f.top.z)/2,(f.bottom.y+f.top.y)/2+.01)?.slope?.id,f.id);
  }
});

test('地铁楼板、桥板真实切洞且地面不能横穿梯底；入口仍接现有走道',()=>{
  for(const stair of L.stairs.filter(s=>s.building==='M')) {
    const p=mallStairPlan(stair),center=toW(stair.frame,...p.point(p.span/2,p.depth/2));
    for(const lv of L.levels.filter(l=>l.building==='M')) {
      assert.ok(!onSlab(lv,center));assert.equal(lv.slab.pieces.find(piece=>piece.stair===stair.id).thickness,.12);
      const d=stairDoor(stair,lv.id),m=midOf(d);assert.ok(inWalk(lv,[m[0]+d.nx*.55,m[1]+d.nz*.55]));
    }
  }
  for(const T of br.towers) {
    const p=mallStairPlan(T.stair),local=p.point(p.span/2,p.depth/2),[x,z]=toW(T.frame,...local);
    assert.ok(!clear(nav,{x,z,y:0,floor:nav.groundAt(x,z),slope:null}),'walking under lowest flight');
    assert.ok(!clear(nav,{x,z,y:br.y,floor:'bridge',slope:null}),'bridge supported across stair shaft');
    assert.ok(!T.deckPieces.some(piece=>local[0]>piece.rect.x0&&local[0]<piece.rect.x1&&local[1]>piece.rect.z0&&local[1]<piece.rect.z1));
    assert.equal(T.deckPieces.filter(piece=>piece.thickness===.12).length,1);
    for(const s of br.access.surfaces.filter(s=>s.stair===T.stair.id)) {
      assert.equal(nav.floors.get(s.id).kind,'bridge');assert.equal(nav.floors.get(s.id).parentFloor,'bridge');
    }
  }
});

function recordBoxes() {
  const boxes=[];let frame;
  return {boxes,B:{frame:(f,fn)=>{const prev=frame;frame=f;try{fn();}finally{frame=prev;}},get:key=>({
    box:(x,y,z,w,h,d)=>{assert.ok(w>0&&h>0&&d>0);boxes.push({frame,key,x,y,z,w,h,d});},bar:()=>{},shape:()=>{},
  })}};
}
function bodyClear(boxes,state,label) {
  for(const o of boxes)if(o.y+o.h/2>state.y+.4&&o.y-o.h/2<state.y+2) {
    const [x,z]=toL(o.frame,state.x,state.z);
    assert.ok(Math.abs(o.x-x)>=o.w/2+.24||Math.abs(o.z-z)>=o.d/2+.24,
      `${label}: body hits ${o.key} at ${x},${state.y},${z}; box ${JSON.stringify({...o,frame:o.frame.id})}`);
  }
}

test('地铁实梯、墙、B1厚板及悬吊顶灯具均保留2米头部净空',()=>{
  const {B,boxes}=recordBoxes(),levels=L.levels.filter(l=>l.building==='M'),stairs=L.stairs.filter(s=>s.building==='M');
  for(const lv of levels)buildMallStairLevel(B,lv,stairs,metro.access,{flights:true});
  const mats=Object.fromEntries(['glowSoft','satin','glow'].map(k=>[k,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})]));
  const ceiling=platformCeiling({mats:{base:mats},lvById:Object.fromEntries(levels.map(l=>[l.id,l]))},metro,levels[0],{group:new THREE.Group()});
  const ray=new THREE.Raycaster();ray.far=1.6;ceiling.group.updateMatrixWorld(true);
  for(const route of metro.access.routes) {
    const path=pathOf(route);let state={...path[0],slope:null};
    for(const p of path.slice(1))state=move(state,p,s=>{
      bodyClear(boxes,s,route.id);
      for(const lv of levels)for(const piece of lv.slab.pieces) {
        const bottom=lv.elev-.03-(piece.thickness??SLAB_T[lv.kind]??.45);
        if(lv.elev<=s.y+.4||bottom>=s.y+2)continue;
        for(const [dx,dz]of [[0,0],[.24,0],[-.24,0],[0,.24],[0,-.24]]) {
          const q=[s.x+dx,s.z+dz];assert.ok(!pointInPoly(q,piece.outer)||piece.holes.some(h=>pointInPoly(q,h)),`${route.id}: slab clips head`);
        }
      }
      for(const [dx,dz]of [[0,0],[.24,0],[-.24,0],[0,.24],[0,-.24]]) {
        ray.set(new THREE.Vector3(s.x+dx,s.y+.4,s.z+dz),new THREE.Vector3(0,1,0));
        assert.equal(ray.intersectObjects(ceiling.group.children).length,0,`${route.id}: suspended ceiling/light clips head at ${s.y}`);
      }
    });
  }
  for(const mesh of ceiling.group.children)mesh.geometry.dispose();for(const m of Object.values(mats))m.dispose();
});

test('桥塔实际玻璃入口、1米厚桥板、钢梁及实梯全路线留出身体净空',()=>{
  const materials={glass:new THREE.MeshBasicMaterial(),glow:new THREE.MeshBasicMaterial()};
  for(const T of br.towers) {
    const {B,boxes}=recordBoxes(),group=new THREE.Group();
    tower({mats:{base:materials},dynamic:[]},B,group,br,T,{up:[],down:[]});
    const path=pathOf(br.access.routes.find(r=>r.stair===T.stair.id));let state={...path[0],slope:null};
    for(const p of path.slice(1))state=move(state,p,s=>bodyClear(boxes,s,T.id));
    group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&!Object.values(materials).includes(o.material))o.material.dispose();});
  }
  for(const m of Object.values(materials))m.dispose();
});
