import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { toW, toL, convexOverlap, pointInPoly } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';

const nav=buildNav(L);
test('酒店贴一期西侧、公寓贴一期东侧，旋转后所有400套模型保持1:1且不占商场和车道',()=>{
  const H=L.buildings.find(b=>b.id==='H'),A=L.buildings.find(b=>b.id==='A');
  assert.deepEqual(H.center,[-342,-200]);assert.deepEqual(A.center,[-35,-214]);assert.equal(A.frame.deg,90);
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

test('酒店公寓新增四个街道坡口和四个B1/B2坡道，每条实际双向步行且标高连续',()=>{
  const ramps=L.ramps.filter(r=>['H','A'].includes(r.building));assert.equal(ramps.length,8);
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
  for(const id of ['H','A']) {
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

test('旋转后的酒店公寓双电梯在B2至RF每层有真实候梯净空',()=>{
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

test('公寓通过地面与2F/B1/B2连接，穿过真实北翼侧廊而不借道店铺',()=>{
  const F=L.buildings.find(b=>b.id==='P1').wings.find(w=>w.id==='N').F;
  for(const [aShort,pShort] of [['1F','1F'],['2F','2F'],['B1','B1M'],['B2','B1']]) {
    const dock=L.extensions.gateways.find(g=>g.level===`P1-${pShort}`),z=(dock.outerSeg.z0+dock.outerSeg.z1)/2;
    const route=[[-35,-180],[-35,z],[-59,z],toW(F,76,21),toW(F,76,6),toW(F,76,0)];
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
