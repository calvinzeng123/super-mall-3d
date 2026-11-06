import test from 'node:test';
import assert from 'node:assert/strict';
import { L, onSlab } from './helpers.js';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, step, clear, landAt, floorLabel } from '../src/layout/nav.js';
import { toL, toW, pointInPoly, convexOverlap } from '../src/layout/geom.js';
import { towerStairPlan, buildTowerStairAccess, stairLoops, flightRisers } from '../src/layout/tower-stairs.js';
import { buildTowerStairGeometry } from '../src/render/build/tower-stairs.js';
import { buildTowerStairInstances } from '../src/render/build/tower-stairs.js';
import { syntheticTower, outsideDoor } from './fixtures/synthetic-tower.js';
import * as THREE from 'three';

const nav=buildNav(L),towers=L.buildings.filter(b=>b.kind==='tower'&&b.access?.protected&&!b.community);
// The FPS-truth pins (336 routes, the A-20F LOFT, A-RF 74.2) run on the compact layout C, where H / A / R1–R4
// keep today's towers (SPEC §4; the supertall packages pin their expansion towers in their own tests).
const C=buildLayout({expansion:false}),navC=buildNav(C),towersC=C.buildings.filter(b=>b.kind==='tower'&&b.access?.protected&&!b.community);
function move(s,p,audit=()=>{},N=nav) {
  const n=Math.max(1,Math.ceil(Math.hypot(p.x-s.x,p.z-s.z)/.06)),dx=(p.x-s.x)/n,dz=(p.z-s.z)/n;
  for(let i=0;i<n;i++) {
    const prev=s;s=step(N,s,dx,dz);assert.ok(clear(N,s),'left stair support');
    assert.ok(Math.abs(s.y-prev.y)<.04,'discontinuous vertical teleport');audit(s);
  }
  assert.ok(Math.hypot(s.x-p.x,s.z-p.z)<.025,`${s.floor}: blocked before ${p.x},${p.z}`);
  assert.equal(s.floor,p.floor);assert.ok(Math.abs(s.y-p.y)<1e-6);return s;
}

test('六栋塔楼336组消防双跑楼梯双向连续步行，含地下层、挑高首层、顶层和屋顶（紧凑布局）',()=>{
  assert.equal(towersC.length,6);assert.equal(towersC.reduce((n,b)=>n+b.access.routes.length,0),336);
  assert.equal(towersC.reduce((n,b)=>n+b.access.flights.length,0),672);
  for(const b of towersC)for(const r of b.access.routes)for(const path of [r.waypoints,[...r.waypoints].reverse()]) {
    let s={...path[0],slope:null},ascending=0,descending=0;
    assert.ok(clear(navC,s),`${r.id} missing approach`);
    for(const p of path.slice(1))s=move(s,p,state=>{if(state.slope){const slope=navC.slopeById.get(state.slope.id);assert.equal(slope.kind,'protected-stair');if(path===r.waypoints)ascending++;else descending++;}},navC);
    assert.ok(ascending>30||descending>30,`${r.id} never walked flights`);assert.equal(s.slope,null);
  }
});

test('梯井实际贯通楼板，半层平台有支撑，空中降落识别消防梯面',()=>{
  for(const b of towers) {
    for(const lv of L.levels.filter(l=>l.building===b.id))for(const v of lv.voids.filter(v=>v.kind==='stair')) {
      const r=v.rect,p=toW(v.frame,(r.x0+r.x1)/2,(r.z0+r.z1)/2);
      assert.ok(!onSlab(lv,p));assert.ok(lv.slab.pieces.some(piece=>piece.holes.includes(v.poly)));
    }
    for(const s of b.access.surfaces)assert.ok(nav.floors.has(s.id));
    for(const f of b.access.flights) {
      const x=(f.bottom.x+f.top.x)/2,z=(f.bottom.z+f.top.z)/2,y=(f.bottom.y+f.top.y)/2;
      assert.equal(landAt(nav,x,z,y+.01)?.slope?.id,f.id);
      assert.ok(f.rise/f.steps<=.170001);assert.ok(f.run/f.steps>=.27999);
    }
  }
});

test('真实渲染墙、平台和踏步不穿过行走身体，挑高酒店与住宅楼梯保留头部净空',()=>{
  for(const b of towers.filter(b=>['H','A','R1'].includes(b.id))) {
    const solids=[],B={get:()=>({box:(x,y,z,w,h,d)=>{assert.ok(w>0&&h>0&&d>0);solids.push({x,y,z,w,h,d});},bar:()=>{}})};
    const levels=L.levels.filter(l=>l.building===b.id),stairs=L.stairs.filter(s=>s.building===b.id);
    buildTowerStairGeometry(B,b,levels,stairs);
    for(const route of b.access.routes.filter(r=>['1F','2F','20F','30F'].some(f=>r.from===`${b.id}-${f}`))) {
      let s={...route.waypoints[0],slope:null};
      const lower=nav.floors.get(route.from).y,upper=nav.floors.get(route.to).y;
      const relevant=solids.filter(o=>o.y+o.h/2>lower+.2&&o.y-o.h/2<upper+1.75);
      for(const p of route.waypoints.slice(1))s=move(s,p,state=>{
        const [x,z]=toL(b.frame,state.x,state.z);
        // Navigation follows a smooth stair pitch; the next physical tread can
        // touch the shoe/ankle envelope, never the torso or head above 0.4m.
        for(const o of relevant)if(o.y+o.h/2>state.y+.4&&o.y-o.h/2<state.y+1.75)
          assert.ok(Math.abs(o.x-x)>=o.w/2+.24||Math.abs(o.z-z)>=o.d/2+.24,`${route.id}: rendered solid clips body at ${x},${state.y},${z}`);
      });
    }
  }
});

test('酒店西门实际接停车场，公寓东门避开车库坡口并接星湾路步道',()=>{
  const routes=[
    {bid:'H',points:[[-281,-81.1533717],[-303,-81.1533717],[-303,-75]],kinds:['H-1F','ground','ground']},
    {bid:'A',points:[[-35,-178.5],[-18,-178.5],[-13,-178.5],[-13,-173]],kinds:['A-1F','A-1F','ground','ground']},
  ];
  for(const r of routes)for(const reversed of [false,true]) {
    const path=r.points.map(([x,z],i)=>({x,z,y:0,floor:r.kinds[i]}));if(reversed)path.reverse();
    let s={...path[0],slope:null};assert.ok(clear(nav,s));for(const p of path.slice(1))s=move(s,p);
  }
  for(const bid of ['H','A']) {
    const doors=L.entrances.filter(e=>e.building===bid&&e.to==='site');assert.equal(doors.length,2);
    const e=doors.find(e=>e.secondaryDoor),x=(e.seg.x0+e.seg.x1)/2,z=(e.seg.z0+e.seg.z1)/2;
    assert.ok(!L.site.trenches.some(p=>pointInPoly([x+e.nx,z+e.nz],p)));
  }
  const A=L.levels.find(l=>l.id==='A-1F'),hall=A.walk.find(w=>w.id==='A-east-entry-hall');
  assert.ok(!A.units.some(u=>u.polys.some(p=>convexOverlap(p,hall.poly))));
  assert.ok(!A.rooms.some(r=>r.polys.some(p=>convexOverlap(p,hall.poly))));
});

test('首层大堂保持挑高与连廊标高，顶层LOFT保留原模型尺寸和完整上层净高（紧凑布局）',()=>{
  for(const id of ['H-1F','A-1F']) {
    const lv=C.levels.find(l=>l.id===id);
    assert.equal(lv.height,6.5);assert.equal(lv.kind,'lobby');assert.equal(lv.units.length,0);
    assert.ok(lv.lobbyPlan);
  }
  for(const id of ['A-20F']) {
    const lv=C.levels.find(l=>l.id===id);assert.equal(lv.height,6.5);assert.equal(lv.units.length,10);
    for(const u of lv.units) {
      assert.ok(u.residence.duplex);assert.equal(u.rects[0].x1,11);assert.equal(u.rects[0].z1,15);
      assert.ok(lv.height-.3-u.residence.duplex.height>=3.1);
    }
  }
  for(const bid of ['H','A'])assert.equal(C.levels.find(l=>l.id===`${bid}-2F`).elev,6.5);
  assert.equal(C.levels.find(l=>l.id==='A-RF').elev,74.2);
  assert.equal(C.buildings.find(b=>b.id==='A').height,74.2);
});

test('重复消防梯共享实例模板，仅显示当前相邻层且半层行走不中断',()=>{
  let storedVertices=0;
  const materials=Object.fromEntries(['concrete','extMetal'].map(k=>[k,new THREE.MeshStandardMaterial()]));
  for(const b of towers) {
    const group=new THREE.Group(),ctx={dynamic:[]},levels=L.levels.filter(l=>l.building===b.id),stairs=L.stairs.filter(s=>s.building===b.id);
    buildTowerStairInstances(ctx,b,levels,stairs,materials,group);
    storedVertices+=group.children.reduce((n,m)=>n+m.geometry.attributes.position.count,0);
    for(const lv of levels) {
      ctx.dynamic[0].update(0,0,{state:{building:b.id,explore:{building:b.id,level:lv.id}}});
      const wanted=levels.slice(Math.max(0,levels.indexOf(lv)-1),levels.indexOf(lv)+2).filter(l=>l.kind!=='roof');
      const actual=[];
      for(const mesh of group.children.filter(m=>m.material===materials.concrete))for(let i=0;i<mesh.count;i++) {
        const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);actual.push(matrix.elements[13]);
      }
      assert.equal(actual.length,wanted.length);
      for(const level of wanted)assert.ok(actual.some(y=>Math.abs(y-level.elev)<.00001));
    }
    for(const mesh of group.children){mesh.geometry.dispose();mesh.dispose();}
  }
  // 672 flights would otherwise require more than 1.1 million resident vertices.
  assert.ok(storedVertices<200000,`unshared stair geometry: ${storedVertices}`);
  for(const m of Object.values(materials))m.dispose();
});

// ---------- supertall P0a: 分隔 (breakLevels) and maxRisers loops, on the synthetic tower ----------
const walkPath=(N,pts,s0)=>{let s=s0;for(const p of pts){const n=Math.max(1,Math.ceil(Math.hypot(p[0]-s.x,p[1]-s.z)/.06));
  for(let i=0;i<n;i++)s=step(N,s,(p[0]-s.x)/(n-i),(p[1]-s.z)/(n-i));}return s;};
const ride=(N,route,reverse=false)=>{const path=reverse?[...route.waypoints].reverse():route.waypoints;let s={...path[0],slope:null};
  for(const p of path.slice(1))s=move(s,p,()=>{},N);return s;};

test('避难层分隔：下行在避难层出梯，穿过避难区从另一扇门再入梯；楼梯平台上的隔墙挡住直接换跑',()=>{
  const S=syntheticTower(),N=buildNav(S),b=S.buildings[0],st=S.stairs[0],plan=towerStairPlan(st),br=plan.breakAt('S-3F');
  assert.ok(br&&!plan.breakAt('S-2F'),'only the listed level breaks');
  assert.deepEqual(S.levels.find(l=>l.id==='S-3F').rooms.find(r=>r.id===st.id).doors.length,2,'the stair room has two doors on the refuge floor');
  assert.equal(S.stairs.length,1,'still one stair record');
  const r34=b.access.routes.find(r=>r.id==='S-ST1-3F-4F'),r23=b.access.routes.find(r=>r.id==='S-ST1-2F-3F');
  // down 4F → 3F ends outside the depart door (low-x lane); 2F → 3F arrives at the other door
  let s=ride(N,r34,true);
  assert.equal(s.floor,'S-3F');
  const [ax,az]=outsideDoor(S,'S-3F'),[bx,bz]=outsideDoor(S,'S-3F',{second:true});
  assert.ok(Math.hypot(s.x-ax,s.z-az)<.05&&Math.hypot(r23.waypoints.at(-1).x-bx,r23.waypoints.at(-1).z-bz)<.05,'the two runs use different doors');
  // the walk between the doors crosses the 避难区
  assert.match(floorLabel(N,S,s),/避难区/);
  s=walkPath(N,[[ax,az+.6],[bx,bz+.6],[bx,bz]],s);
  assert.ok(Math.hypot(s.x-bx,s.z-bz)<.05,'cannot walk across the 避难区 to the other door');
  assert.match(floorLabel(N,S,{...s,x:(ax+bx)/2,z:az+.6}),/避难区/);
  s=ride(N,r23,true);assert.equal(s.floor,'S-2F');
  // inside the stair, the partition over the door landing blocks the lane change
  const [lx,lz]=toW(st.frame,...plan.point(plan.centers[0],.95)),[rx,rz]=toW(st.frame,...plan.point(plan.centers[1],.95));
  const across=(id)=>walkPath(N,[[rx,rz]],{floor:id,x:lx,z:lz,y:N.floors.get(id).y,slope:null});
  assert.ok(Math.abs(across('S-3F').x-rx)>.5,'the 分隔 partition does not block the landing');
  assert.ok(Math.abs(across('S-2F').x-rx)<.05,'an ordinary floor keeps one open landing');
  // without breakLevels every record is today's (rule C-13: readers default to [])
  const plain=syntheticTower({breakLevels:[]});
  assert.ok(!('breakLevels' in plain.stairs[0])&&!plain.levels.some(l=>l.navWalls?.length));
  assert.deepEqual(plain.buildings[0].access.routes.find(r=>r.id==='S-ST1-3F-4F').waypoints.slice(0,2),
    syntheticTower({breakLevels:['S-9F']}).buildings[0].access.routes.find(r=>r.id==='S-ST1-3F-4F').waypoints.slice(0,2));
});

test('maxRisers：8.6 m 层高拆成两个回合（四跑各 13 级，中间一处无门平台），双向连续步行；无该字段时与今天相同',()=>{
  assert.equal(stairLoops(8.6,18),2);assert.equal(flightRisers(8.6,18),13);
  assert.equal(stairLoops(6.12,18),1);assert.equal(stairLoops(6.13,18),2);assert.equal(stairLoops(8.6,undefined),1);
  const S=syntheticTower(),N=buildNav(S),b=S.buildings[0];
  const flights=b.access.flights.filter(f=>f.id.startsWith('S-ST1-3F-4F-'));
  assert.equal(flights.length,4);
  for(const f of flights){assert.equal(f.steps,13);assert.ok(Math.abs(f.rise-2.15)<1e-9);assert.ok(f.rise/f.steps<=.170001);}
  const doorless=b.access.surfaces.filter(q=>q.doorless);
  assert.deepEqual(doorless.map(q=>q.id),['S-ST1-3F-4F-loop-1']);
  assert.equal(doorless[0].parentFloor,'S-3F');assert.ok(Math.abs(doorless[0].elev-(7.5+4.3))<1e-9);
  const route=b.access.routes.find(r=>r.id==='S-ST1-3F-4F');
  assert.equal(route.loops,2);assert.deepEqual(route.landings,['S-ST1-3F-4F-landing','S-ST1-3F-4F-loop-1','S-ST1-3F-4F-landing-2']);
  for(const reverse of [false,true]){const s=ride(N,route,reverse);assert.equal(s.floor,reverse?'S-3F':'S-4F');}
  // no flight of any storey above 18 risers; the other storeys keep two flights
  for(const f of b.access.flights)assert.ok(f.steps<=18,f.id);
  assert.equal(b.access.flights.filter(f=>f.id.startsWith('S-ST1-1F-2F-')).length,2);
  // without maxRisers the same 8.6 m storey needs 26 risers per flight and does not fit the 9.6 m stair
  const st={...S.stairs[0]};delete st.maxRisers;
  assert.throws(()=>buildTowerStairAccess(b,S.levels,[st]),/insufficient stair depth/);
});

test('C-1：紧凑布局之外新增的塔楼没有超过 18 级的梯段（北苑 P1-1F→2F 一段待北苑包加 maxRisers）',()=>{
  const compact=new Set(C.buildings.map(b=>b.id)),over=[];
  for(const b of L.buildings.filter(q=>q.kind==='tower'&&!compact.has(q.id)))for(const f of b.access?.flights||[])if(f.steps>18)over.push(f.id.replace(/-flight-\d+$/,''));
  // Today: the 6.5 m P1-1F → P1-2F run of the 北苑 stairs (20 risers per flight). P-north sets maxRisers: 18 on
  // these stairs (SPEC §1.1, two loops of 10 risers) and empties this list.
  const KNOWN=['T1-ST-A-1F-2F','T1-ST-B-1F-2F','T2-ST-A-1F-2F','T2-ST-B-1F-2F'];
  assert.deepEqual([...new Set(over)].sort(),KNOWN.filter(id=>over.includes(id)).sort(),`new flights above 18 risers: ${[...new Set(over)].filter(id=>!KNOWN.includes(id))}`);
});
