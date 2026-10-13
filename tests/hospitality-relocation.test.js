import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { toW, toL, convexOverlap, pointInPoly, polySamples } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';

const nav=buildNav(L);
test('酒店和公寓分别位于用户右上与左下红框内且全部400套模型保持1:1、不占商场车道',()=>{
  const H=L.buildings.find(b=>b.id==='H'),A=L.buildings.find(b=>b.id==='A');
  assert.deepEqual(H.center,[-35,-214]);assert.equal(H.frame.deg,90);assert.deepEqual(A.center,[-247,-81.1533717]);assert.equal(A.frame.deg,0);
  assert.ok(A.bounds.x0>=-286&&A.bounds.x1<=-203&&A.bounds.z0>=-151&&A.bounds.z1<=-27,'公寓必须位于用户标注红框内');
  const P1=L.buildings.find(b=>b.id==='P1');
  for(const p of polySamples(A.outline,.5,.02))assert.ok(!pointInPoly(p,P1.outline),'公寓压一期现有楼体');
  for(const b of [H,A]) {
    for(const road of L.site.roads)assert.ok(!convexOverlap(b.outline,road.poly),`${b.id}/${road.id}压原车道`);
    for(const road of L.extensions.roads)for(const poly of road.polys)assert.ok(!convexOverlap(b.outline,poly),`${b.id}/${road.id}压新落客车道`);
    const floors=L.levels.filter(l=>l.building===b.id&&l.levelNumber);assert.equal(floors.flatMap(l=>l.units).length,200);
    for(const lv of floors)for(const u of lv.units) {
      assert.equal(u.rects[0].x1,11);assert.equal(u.rects[0].z1,15);
      assert.ok([b.frame.deg,b.frame.deg+180].includes(u.frame.deg));
      for(const p of u.polys[0])assert.ok(pointInPoly(p,b.outline),`${u.id}旋转后房间越界`);
      const q0=toW(u.frame,0,0),qx=toW(u.frame,11,0),qz=toW(u.frame,0,15);
      assert.ok(Math.abs(Math.hypot(qx[0]-q0[0],qx[1]-q0[1])-11)<1e-9);
      assert.ok(Math.abs(Math.hypot(qz[0]-q0[0],qz[1]-q0[1])-15)<1e-9);
    }
  }
});

test('保留西侧公共车库后共16个街道坡口及28条坡道，酒店公寓和西库全部实际双向步行',()=>{
  const ramps=L.ramps.filter(r=>['H','A','WPG'].includes(r.building));assert.equal(ramps.length,12);
  assert.equal(L.ramps.length,28);assert.equal(L.ramps.filter(r=>r.type.startsWith('street')).length,16);
  for(const r of ramps)for(const reverse of [false,true]) {
    const a=reverse?r.to:r.from,b=reverse?r.from:r.to,len=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/len,uz=(b.z-a.z)/len;
    assert.ok(Math.abs(b.y-a.y)/len<=.150001,`${r.id}坡度`);
    let s={floor:a.level==='street'?'ground':a.level,x:a.x-ux,z:a.z-uz,y:a.y,slope:null},seen=false;
    assert.ok(clear(nav,s),`${r.id} ${reverse}坡前无站位`);
    const n=Math.ceil((len+2)/.1);
    for(let i=0;i<n;i++){const prev=s.y;s=step(nav,s,ux*(len+2)/n,uz*(len+2)/n,0);seen ||= !!s.slope;assert.ok(Math.abs(s.y-prev)<=.016,`${r.id}标高突跳`);}
    assert.ok(seen,`${r.id}未经过坡道`);assert.equal(s.floor,b.level==='street'?'ground':b.level);assert.equal(s.slope,null);
    assert.ok(Math.hypot(s.x-b.x-ux,s.z-b.z-uz)<.03&&clear(nav,s),`${r.id} ${reverse}无法离坡 ${s.x},${s.z}`);assert.equal(s.y,b.y);
  }
  for(const id of ['H','A','WPG']) {
    const upper=L.levels.find(l=>l.id===`${id}-B1`);
    for(const r of ramps.filter(r=>r.building===id&&['down','up'].includes(r.type)))assert.ok(upper.slab.pieces.some(p=>p.holes.includes(r.poly)),`${r.id}上层没有实洞`);
  }
});

test('共享地面停车包含真实车位、充电位和两端通路，避开全部坡口及建筑',()=>{
  const lots=L.extensions.surfaceParking;assert.equal(lots.length,3);assert.ok(lots.reduce((s,l)=>s+l.stalls.length,0)>=35);
  for(const lot of lots) {
    assert.ok(lot.stalls.some(s=>s.type==='ev'));assert.ok(lot.aisle);
    for(const s of lot.stalls) {
      for(const r of L.ramps.filter(r=>r.type.startsWith('street')))assert.ok(!convexOverlap(s.poly,r.poly),`${lot.id}车位占坡口`);
      for(const b of L.buildings.filter(b=>b.kind==='tower'))assert.ok(!convexOverlap(s.poly,b.outline),`${lot.id}车位占塔楼`);
    }
  }
});

test('迁移后的酒店公寓双电梯在B2至RF每层有真实候梯净空',()=>{
  for(const b of ['H','A'])for(const link of nav.links.filter(l=>l.kind==='lift'&&l.elevator?.building===b)) {
    assert.equal(link.stops.length,23);
    for(const stop of link.stops) {
      const lv=L.levels.find(l=>l.id===stop.floor);
      assert.ok(clear(nav,{floor:stop.floor,x:stop.x,z:stop.z,y:lv.elev,slope:null}),`${link.id}/${stop.floor}候梯点被旋转后的墙挡住`);
      const e=link.elevator,local=toL(e.frame,stop.x,stop.z);
      assert.ok(Math.abs(local[0]-e.lu)<1e-7);
      assert.ok(local[1]<e.lv-e.d/2);
    }
  }
});

test('公寓通过地面与2F/B1/B2短连廊进入原西翼公共走道，首层连廊不跨道路',()=>{
  const F=L.buildings.find(b=>b.id==='P1').wings.find(w=>w.id==='W').F;
  for(const [aShort,pShort] of [['1F','1F'],['2F','2F'],['B1','B1M'],['B2','B1']]) {
    const dock=L.extensions.gateways.find(g=>g.id===`P1-apartment-dock-${pShort}`),z=(dock.outerSeg.z0+dock.outerSeg.z1)/2;
    const route=[[-213,z],[-208,z],[-204,z],toW(F,94,0),toW(F,88,0)];
    if(aShort==='1F'){
      const groundLink=L.extensions.paths.find(p=>p.kind==='ground'&&p.id==='公寓与一期迎宾连廊');
      const roads=[...L.site.roads.map(r=>r.poly),...L.extensions.roads.flatMap(r=>r.polys)];
      for(const poly of [...groundLink.polys,dock.poly])
        assert.ok(!roads.some(q=>convexOverlap(poly,q)),'公寓首层连廊的整个净宽都不能横穿道路');
      for(const id of ['A-MAIN','P1-apartment-ground'])
        assert.ok(L.entrances.find(e=>e.id===id).coveredConnection,'贴合入口不能生成穿入对楼的通用长雨棚');
    }
    for(const reverse of [false,true]) {
      const pts=reverse?[...route].reverse():route;
      let s={floor:reverse?`P1-${pShort}`:`A-${aShort}`,x:pts[0][0],z:pts[0][1],y:dock.elev,slope:null};const floors=[s.floor];
      assert.ok(clear(nav,s));
      for(const [x,z] of pts.slice(1)) {
        const dx=x-s.x,dz=z-s.z,n=Math.ceil(Math.hypot(dx,dz)/.08);
        for(let i=0;i<n;i++){s=step(nav,s,dx/n,dz/n);if(floors.at(-1)!==s.floor)floors.push(s.floor);}
        assert.ok(Math.hypot(s.x-x,s.z-z)<.035,`${aShort}/${pShort} ${reverse} 被挡在${s.floor} ${s.x},${s.z} 要到${x},${z}`);
      }
      const expected=aShort==='1F'?['A-1F','ground','P1-1F']:[`A-${aShort}`,`P1-${pShort}`];
      assert.deepEqual(floors,reverse?expected.reverse():expected);
    }
  }
});


test('右上酒店四层公共连廊抵达一期北翼主走道，经过公共侧厅而非超市',()=>{
  const F=L.buildings.find(b=>b.id==='P1').wings.find(w=>w.id==='N').F;
  for(const [hShort,pShort] of [['1F','1F'],['2F','2F'],['B1','B1M'],['B2','B1']]) {
    const dock=L.extensions.gateways.find(g=>g.id===`P1-hotel-dock-${pShort}`),z=(dock.outerSeg.z0+dock.outerSeg.z1)/2;
    const route=[[-35,-180],[-35,z],[-59,z],toW(F,76,21),toW(F,76,6),toW(F,76,0)];
    if(hShort==='1F') {
      const groundLink=L.extensions.paths.find(p=>p.kind==='ground'&&p.id==='酒店与一期迎宾连廊');
      const roads=[...L.site.roads.map(r=>r.poly),...L.extensions.roads.flatMap(r=>r.polys)];
      for(const poly of [...groundLink.polys,dock.poly])assert.ok(!roads.some(q=>convexOverlap(poly,q)),'酒店首层连廊净宽不得占车道');
      for(const id of ['H-MAIN','P1-hotel-ground'])assert.ok(L.entrances.find(e=>e.id===id).coveredConnection);
    }
    const lv=L.levels.find(l=>l.id===`P1-${pShort}`);
    for(let v=0;v<23;v+=.2) {
      const p=toW(F,76,v);
      assert.ok(!lv.units.some(u=>u.polys.some(q=>pointInPoly(p,q))),`${pShort}公共侧厅被商铺占用`);
    }
    for(const reverse of [false,true]) {
      const pts=reverse?[...route].reverse():route;
      let state={floor:reverse?`P1-${pShort}`:`H-${hShort}`,x:pts[0][0],z:pts[0][1],y:dock.elev,slope:null};const floors=[state.floor];
      assert.ok(clear(nav,state));
      for(const [x,z] of pts.slice(1)) {
        const dx=x-state.x,dz=z-state.z,n=Math.ceil(Math.hypot(dx,dz)/.08);
        for(let i=0;i<n;i++){state=step(nav,state,dx/n,dz/n);if(floors.at(-1)!==state.floor)floors.push(state.floor);}
        assert.ok(Math.hypot(state.x-x,state.z-z)<.035,`${hShort}/${pShort} ${reverse} 被挡在 ${state.floor} ${state.x},${state.z} 目标 ${x},${z}`);
      }
      const expected=hShort==='1F'?['H-1F','ground','P1-1F']:[`H-${hShort}`,`P1-${pShort}`];
      assert.deepEqual(floors,reverse?expected.reverse():expected);
    }
  }
});

test('西侧公共附库只保留两个停车层，乐园上方地面连续且旧一期地下通路仍可走',()=>{
  const b=L.buildings.find(b=>b.id==='WPG');
  assert.ok(b.undergroundOnly);assert.equal(b.kind,'garage');assert.equal(b.height,0);
  assert.deepEqual(b.levels,['WPG-B2','WPG-B1','WPG-G']);
  assert.equal(L.levels.filter(l=>l.building==='WPG').flatMap(l=>l.units).length,0);
  assert.equal(L.elevators.filter(e=>e.building==='WPG').length,2);
  assert.equal(L.stairs.filter(e=>e.building==='WPG').length,2);
  const entry=L.levels.find(l=>l.id==='WPG-G');assert.equal(entry.slab.pieces.length,2);assert.equal(entry.kind,'lobby');
  for(const [x,z] of [[-344.5,-200],[-344.5,-215],[-377,-200]])assert.ok(clear(nav,{floor:'ground',x,z,y:0,slope:null}),'不能把乐园地面挖掉');
  for(const [floor,target,route] of [
    ['WPG-B1','P1-B1M',[[-310,-200],[-282,-200],[-278,-200]]],
    ['WPG-B2','P1-B1',[[-310,-200],[-301,-200],[-301,-179],[-278,-179],[-273,-179]]],
  ])for(const reverse of [false,true]) {
    const pts=reverse?[...route].reverse():route;let s={floor:reverse?target:floor,x:pts[0][0],z:pts[0][1],y:nav.floors.get(floor).y,slope:null};
    assert.ok(clear(nav,s));
    for(const [x,z] of pts.slice(1)) {
      const dx=x-s.x,dz=z-s.z,n=Math.ceil(Math.hypot(dx,dz)/.1);
      for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n);
      assert.ok(Math.hypot(s.x-x,s.z-z)<.03,`${floor}/${reverse} 在${s.x},${s.z}被挡`);
    }
    assert.equal(s.floor,reverse?floor:target);
  }
});


test('酒店北侧坡脚经公共地下接驳廊可驶入主车道，不止坡面本身可走',()=>{
  const route=[[-57,-253.5],[-51,-253.5],[-51,-241],[-35,-241],[-35,-214]];
  for(const reverse of [false,true]) {
    const pts=reverse?[...route].reverse():route;let s={floor:'H-B1',x:pts[0][0],z:pts[0][1],y:-4.5,slope:null};
    assert.ok(clear(nav,s));
    for(const [x,z] of pts.slice(1)) {
      const dx=x-s.x,dz=z-s.z,n=Math.ceil(Math.hypot(dx,dz)/.08);
      for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n);
      assert.ok(Math.hypot(s.x-x,s.z-z)<.03,`${reverse} 地库坡脚接驳在 ${s.x},${s.z} 被挡，目标 ${x},${z}`);
      assert.equal(s.floor,'H-B1');assert.ok(Math.abs(s.y+4.5)<1e-8);
    }
  }
});


test('乐园公共车库两组行人小厅均可实际走入、候梯和到达楼梯，两个地面停车场也连续可达',()=>{
  for(const i of [1,2]) {
    const entry=L.entrances.find(e=>e.id===`WPG-ENTRY${i}`),x=(entry.seg.x0+entry.seg.x1)/2;
    const lift=nav.links.find(e=>e.id===`WPG-L${i}`),stair=nav.links.find(e=>e.id===`WPG-ST${i}`);
    for(const link of [lift,stair]) {
      assert.deepEqual(link.stops.map(s=>s.floor),['WPG-B2','WPG-B1','WPG-G']);
      for(const stop of link.stops)assert.ok(clear(nav,{floor:stop.floor,x:stop.x,z:stop.z,y:nav.floors.get(stop.floor).y,slope:null}));
    }
    const stop=lift.stops.at(-1),route=[[-344.5,-179],[x,-179],[x,-185.5],[stop.x,-185.5],[stop.x,stop.z]];
    for(const reverse of [false,true]) {
      const pts=reverse?[...route].reverse():route;let s={floor:reverse?'WPG-G':'ground',x:pts[0][0],z:pts[0][1],y:0,slope:null};
      assert.ok(clear(nav,s));
      for(const [x,z] of pts.slice(1)) {
        const dx=x-s.x,dz=z-s.z,n=Math.ceil(Math.hypot(dx,dz)/.08);
        for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n);
        assert.ok(Math.hypot(s.x-x,s.z-z)<.03,`小厅${i}/${reverse} 在${s.x},${s.z}被挡，目标${x},${z}`);
      }
      assert.equal(s.floor,reverse?'ground':'WPG-G');
    }
  }
  for(const route of [[[-344.5,-200],[-344.5,-179],[-312,-179],[-312,-163]],[[-344.5,-200],[-344.5,-179],[-375,-179],[-375,-169]]])for(const reverse of [false,true]) {
    const pts=reverse?[...route].reverse():route;let s={floor:'ground',x:pts[0][0],z:pts[0][1],y:0,slope:null};
    assert.ok(clear(nav,s));
    for(const [x,z] of pts.slice(1)) {
      const dx=x-s.x,dz=z-s.z,n=Math.ceil(Math.hypot(dx,dz)/.08);for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n);
      assert.ok(Math.hypot(s.x-x,s.z-z)<.03,`停车步行/${reverse}在${s.x},${s.z}被挡，目标${x},${z}`);
    }
  }
});
