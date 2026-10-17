import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { L, onSlab } from './helpers.js';
import { buildNav, clear, step, landAt } from '../src/layout/nav.js';
import { toL, toW, pointInPoly } from '../src/layout/geom.js';
import { mallStairPlan } from '../src/layout/mall-stairs.js';
import { buildMallStairLevel, buildStairApproach } from '../src/render/build/mall-stairs.js';
import { SLAB_T } from '../src/render/build/shell.js';

const nav=buildNav(L),groups=['WPG','P3'].map(id=>{
  const building=L.buildings.find(b=>b.id===id),access=building.ancillaryAccess||building.access;
  return {building,access,stairs:L.stairs.filter(s=>s.building===id&&s.continuous),levels:L.levels.filter(l=>l.building===id)};
});
function move(s,p,audit=()=>{}) {
  const n=Math.max(1,Math.ceil(Math.hypot(p.x-s.x,p.z-s.z)/.05)),dx=(p.x-s.x)/n,dz=(p.z-s.z)/n;
  for(let i=0;i<n;i++) {
    const prior=s;s=step(nav,s,dx,dz);assert.ok(clear(nav,s),'stair has no support');
    assert.ok(Math.abs(s.y-prior.y)<.04,'stair teleports vertically');audit(s);
  }
  assert.ok(Math.hypot(s.x-p.x,s.z-p.z)<.025,`${s.floor}: blocked before ${p.x},${p.z}`);
  assert.equal(s.floor,p.floor);assert.ok(Math.abs(s.y-p.y)<1e-6);return s;
}

test('西侧附库和三期四座地库小厅共6座楼梯12条层间路线完整双向步行',()=>{
  assert.equal(groups.reduce((n,g)=>n+g.stairs.length,0),6);
  assert.equal(groups.reduce((n,g)=>n+g.access.routes.length,0),12);
  for(const {access}of groups)for(const route of access.routes)for(const reversed of [false,true]) {
    const points=reversed?[...route.waypoints].reverse():route.waypoints;
    let s={...points[0],slope:null},flightSteps=0;
    assert.ok(clear(nav,s),`${route.id}: inaccessible entrance`);
    for(const p of points.slice(1))s=move(s,p,state=>{
      if(state.slope){assert.equal(nav.slopeById.get(state.slope.id).kind,'protected-stair');flightSteps++;}
    });
    assert.ok(flightSteps>30);assert.equal(s.slope,null);
  }
});

test('小厅楼梯开洞落在正确楼板拼块，入口薄平台和半层平台真实支撑',()=>{
  for(const {access,stairs,levels}of groups) {
    for(const stair of stairs)for(const lv of levels.filter(l=>stair.serves.includes(l.id))) {
      const p=mallStairPlan(stair),center=toW(stair.frame,...p.point(p.span/2,(p.start+p.depth)/2));
      assert.ok(!onSlab(lv,center));
      assert.ok(lv.slab.pieces.some(piece=>pointInPoly(center,piece.outer)&&piece.holes.some(h=>pointInPoly(center,h))),`${stair.id}/${lv.id}: hole applied to wrong slab`);
      const room=lv.rooms.find(r=>r.id===stair.id);assert.ok(room.openStair&&room.navigationWalls.length>=4);
      const plate=lv.slab.pieces.find(p=>p.stair===stair.id);assert.equal(plate.thickness,.12);
      const inside=toW(stair.frame,...p.point(p.span/2,.7));assert.ok(onSlab(lv,inside));
    }
    for(const surface of access.surfaces)assert.ok(nav.floors.has(surface.id));
    for(const f of access.flights) {
      const x=(f.bottom.x+f.top.x)/2,z=(f.bottom.z+f.top.z)/2,y=(f.bottom.y+f.top.y)/2;
      assert.equal(landAt(nav,x,z,y+.01)?.slope?.id,f.id);
      assert.ok(f.rise/f.steps<=.175001);assert.ok(f.run/f.steps>=.26999);assert.ok(f.width>=1.2);
    }
  }
});

test('小厅真实梯段、围墙、平台及完整厚楼板均保留2米头部净空',()=>{
  for(const {access,stairs,levels,building}of groups) {
    const solids=[];let frame;
    const B={frame:(f,fn)=>{frame=f;fn();},get:()=>({box:(x,y,z,w,h,d)=>{assert.ok(w>0&&h>0&&d>0);solids.push({frame,x,y,z,w,h,d});},bar:()=>{}})};
    for(const lv of levels)if(stairs.some(s=>s.serves.includes(lv.id)))
      buildMallStairLevel(B,building.id==='P3'&&lv.ground?{...lv,height:3.2}:lv,stairs,access,{flights:true});
    for(const route of access.routes) {
      const lo=nav.floors.get(route.from).y,hi=nav.floors.get(route.to).y;
      const relevant=solids.filter(o=>o.y+o.h/2>lo+.4&&o.y-o.h/2<hi+2);
      const slabs=levels.filter(lv=>lv.elev>lo+.4&&lv.elev-(SLAB_T[lv.kind]||.45)-.03<hi+2);
      let s={...route.waypoints[0],slope:null};
      for(const p of route.waypoints.slice(1))s=move(s,p,state=>{
        for(const o of relevant)if(o.y+o.h/2>state.y+.4&&o.y-o.h/2<state.y+2) {
          const [x,z]=toL(o.frame,state.x,state.z);
          assert.ok(Math.abs(x-o.x)>=o.w/2+.24||Math.abs(z-o.z)>=o.d/2+.24,`${route.id}: solid clips body at ${x},${state.y},${z}`);
        }
        for(const lv of slabs)for(const plate of lv.slab.pieces) {
          const bottom=lv.elev-.03-(plate.thickness??SLAB_T[lv.kind]??.45);
          if(lv.elev<=state.y+.4||bottom>=state.y+2)continue;
          for(const [dx,dz]of [[0,0],[.24,0],[-.24,0],[0,.24],[0,-.24]]) {
            const q=[state.x+dx,state.z+dz];
            assert.ok(!pointInPoly(q,plate.outer)||plate.holes.some(h=>pointInPoly(q,h)),`${route.id}: ${lv.id} slab clips head at ${state.y}`);
          }
        }
      });
    }
  }
});

test('地面向下看始终显示实梯，下库后切回完整层且没有重复梯段',()=>{
  const materials=Object.fromEntries(['concrete','extMetal','glowSoft'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  for(const {building,access,stairs}of groups) {
    const upperId=building.id==='WPG'?'WPG-G':'P3-1F',lowerId=`${building.id}-B1`;
    const levels=Object.fromEntries([upperId,lowerId].map(id=>[id,{group:new THREE.Group(),base:new THREE.Group()}]));
    const ctx={layout:L,levels,mats:{base:materials},dynamic:[]};
    levels[lowerId].group.visible=false;levels[lowerId].base.visible=false;
    const preview=buildStairApproach(ctx,upperId,lowerId,stairs,access);
    assert.equal(preview.parent,levels[upperId].base);assert.ok(preview.children.length>0&&preview.visible);
    levels[lowerId].group.visible=true;levels[lowerId].base.visible=true;ctx.dynamic[0].update();assert.equal(preview.visible,false);
    levels[lowerId].base.visible=false;ctx.dynamic[0].update();assert.equal(preview.visible,true);
    for(const mesh of preview.children)mesh.geometry.dispose();
  }
  for(const material of Object.values(materials))material.dispose();
});

test('下行预览包含限定梯井的完整深层围墙、入口地面与井底，真实网格不封住行走净空',()=>{
  const materials=Object.fromEntries(['concrete','extMetal','glowSoft'].map(k=>[k,new THREE.MeshStandardMaterial({side:THREE.DoubleSide})]));
  const ray=new THREE.Raycaster();
  const hits=(group,x,y,z,dx,dy,dz,far)=>{
    ray.set(new THREE.Vector3(x,y,z),new THREE.Vector3(dx,dy,dz));ray.near=.001;ray.far=far;
    return ray.intersectObject(group,true);
  };
  for(const {building,access,stairs,levels:allLevels}of groups) {
    const upperId=building.id==='WPG'?'WPG-G':'P3-1F',lowerId=`${building.id}-B1`;
    const levels=Object.fromEntries([upperId,lowerId].map(id=>[id,{group:new THREE.Group(),base:new THREE.Group()}]));
    const ctx={layout:L,levels,mats:{base:materials},dynamic:[]};
    levels[lowerId].group.visible=false;
    const preview=buildStairApproach(ctx,upperId,lowerId,stairs,access);preview.updateMatrixWorld(true);
    const underground=allLevels.filter(l=>l.elev<0);
    for(const lv of underground)for(const stair of stairs.filter(s=>s.serves.includes(lv.id))) {
      const room=lv.rooms.find(r=>r.id===stair.id),p=mallStairPlan(stair);
      for(const w of room.navigationWalls) {
        const [ax,az]=toW(stair.frame,w.x0,w.z0),[bx,bz]=toW(stair.frame,w.x1,w.z1);
        const length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length,nz=(bx-ax)/length;
        assert.ok(hits(preview,(ax+bx)/2+nx*.3,lv.elev+1.8,(az+bz)/2+nz*.3,-nx,0,-nz,.45).length,
          `${stair.id}/${lv.id}: preview exposes sky through shaft wall`);
      }
      const [x,z]=toW(stair.frame,...p.point(p.span/2,.75));
      assert.ok(hits(preview,x,lv.elev+.2,z,0,-1,0,.21).length,`${stair.id}/${lv.id}: missing entry floor`);
      if(!underground.some(l=>l.elev<lv.elev&&stair.serves.includes(l.id))) {
        const [bx,bz]=toW(stair.frame,...p.point(p.span/2,(p.start+p.depth)/2));
        assert.ok(hits(preview,bx,lv.elev+.2,bz,0,-1,0,.21).length,`${stair.id}: stair well has no bottom`);
      }
    }
    for(const mesh of preview.children) {
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i++)assert.ok(stairs.some(stair=>{
        const [x,z]=toL(stair.frame,positions.getX(i),positions.getZ(i)),r=stair.rect;
        return x>=r.x0-.18&&x<=r.x1+.18&&z>=r.z0-.18&&z<=r.z1+.18;
      }),'preview includes unrelated basement geometry');
    }
    for(const route of access.routes) {
      let state={...route.waypoints[0],slope:null},sample=0;
      for(const point of route.waypoints.slice(1))state=move(state,point,s=>{
        if(sample++%10)return;
        for(const height of [.45,1.8])for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])
          assert.equal(hits(preview,s.x,s.y+height,s.z,dx,0,dz,.24).length,0,`${route.id}: preview clips walking body`);
        assert.equal(hits(preview,s.x,s.y+.4,s.z,0,1,0,1.6).length,0,`${route.id}: preview clips 2m headroom`);
      });
    }
    for(const mesh of preview.children)mesh.geometry.dispose();
  }
  for(const material of Object.values(materials))material.dispose();
});
