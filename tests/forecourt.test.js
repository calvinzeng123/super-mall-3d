import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { pointInPoly, convexOverlap, dist, distToPolyEdge } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
const F=L.site.forecourt,nav=buildNav(L);
const at=(x,z)=>({floor:'ground',x,z,y:0,slope:null});
const move=(s,p)=>{const dx=p[0]-s.x,dz=p[1]-s.z,n=Math.ceil(Math.hypot(dx,dz)/.09);for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n,0);return s;};

test('二期乐园与市集地块不压建筑、道路、车库坡道或共享车位',()=>{
  assert.deepEqual(F.zones.map(z=>z.id),['family','market']);
  for(const zone of F.zones){
    for(let x=zone.rect.x0+.25;x<zone.rect.x1;x+=1)for(let z=zone.rect.z0+.25;z<zone.rect.z1;z+=1){
      if(!pointInPoly([x,z],zone.poly))continue;
      assert.ok(!L.buildings.filter(b=>b.kind!=='metro'&&!b.undergroundOnly).some(b=>pointInPoly([x,z],b.outline)),`${zone.id}:建筑 ${x},${z}`);
    }
    for(const p of [...L.site.roads.map(r=>r.poly),...L.extensions.roads.flatMap(r=>r.polys),...L.site.trenches,...(L.extensions.surfaceParking||[]).map(r=>r.poly)])assert.ok(!convexOverlap(zone.poly,p,.02),`${zone.id}:车道/停车位冲突`);
  }
});

test('二期与住宅之间接纳完整乐园与五间食集，轨道旋转且设备不缩小',()=>{
  assert.equal(F.items.length,28);
  const family=F.zones.find(z=>z.id==='family'),market=F.zones.find(z=>z.id==='market');
  assert.deepEqual(family.rect,{x0:16,z0:-163,x1:90,z1:-115});
  assert.deepEqual(market.rect,{x0:244,z0:-162,x1:281,z1:-119});
  const expected={carousel:[16,16],'play-castle':[15,13],swings:[7,5],sandpit:[8,7],'mini-train':[42,66]};
  for(const [type,size] of Object.entries(expected)){
    const item=F.items.find(i=>i.type===type);assert.equal(item.zone,'family');assert.deepEqual([item.w,item.d],size,type);
  }
  assert.equal(F.items.filter(i=>i.zone==='market'&&i.type==='kiosk').length,5);
  assert.equal(F.items.filter(i=>i.zone==='market'&&i.type==='cafe-table').length,4);
  assert.equal(F.items.filter(i=>i.type==='garden-island').length,8);
  const train=F.items.find(i=>i.type==='mini-train'),p2=L.buildings.find(b=>b.id==='P2');
  assert.equal(train.rotation,90);
  assert.ok(Math.abs(train.rect.x1-train.rect.x0-67.2)<1e-6,'66m轨道长轴及两侧0.6m轨枕沿x');
  assert.ok(Math.abs(train.rect.z1-train.rect.z0-43.2)<1e-6,'42m轨道短轴及两侧0.6m轨枕沿z');
  assert.ok(train.poly.every(p=>!pointInPoly(p,p2.outline)&&distToPolyEdge(p,p2.outline)>4.5),'轨枕轮廓与商场外墙净距不足');
});

test('乐园市集保持二期位置，一期旧庭院已由获批艺术街区替换',()=>{
  assert.ok(F.items.filter(i=>['family','market'].includes(i.zone)).every(i=>i.poly.every(p=>p[0]>0)));
  assert.ok(F.paths.filter(p=>p.id!=='P1-west-art-promenade').every(p=>p.points.every(([x])=>x>=-280)));
  for(const id of ['events','north-garden','east-garden'])assert.equal(F.zones.some(z=>z.id===id),false);
  for(const id of ['P1C','P1S','P1E','P1E2'])assert.ok(L.buildings.some(b=>b.id===id&&b.kind==='annex'));
  assert.equal(F.paths.some(p=>p.id==='square-west-recreation'),false);
});

test('保留的亲子设施与食集共用实际物件和碰撞足迹',()=>{
  for(const type of ['carousel','play-castle','swings','sandpit','mini-train','kiosk','pergola','cafe-table'])assert.ok(F.items.some(i=>i.type===type),type);
  for(const item of F.items){
    const zone=F.zones.find(z=>z.id===item.zone);
    assert.ok(item.poly.every(p=>pointInPoly(p,zone.poly)),`${item.id}:越界`);
    assert.ok(F.obstacles.some(o=>o.id===item.id),`${item.id}:缺碰撞`);
  }
  for(const o of F.obstacles){const c=o.poly.reduce((a,p)=>[a[0]+p[0]/o.poly.length,a[1]+p[1]/o.poly.length],[0,0]);assert.equal(clear(nav,at(...c)),false,`${o.id}:实体可穿过`);}
});

test('每条入口至活动区的步行主线连续可达并双向走通',()=>{
  for(const path of F.paths){
    const points=path.points.map(p=>[...p]);
    // 建筑入口线留在既有楼层，测试起点向室外推进0.8m。
    const [a,b]=points,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);points[0]=[a[0]+dx/len*.8,a[1]+dz/len*.8];
    for(const route of [points,[...points].reverse()]){
      let s=at(...route[0]);assert.ok(clear(nav,s),`${path.id}:起点`);
      for(const p of route.slice(1)){s=move(s,p);assert.ok(dist([s.x,s.z],p)<.12,`${path.id}:停在${s.x},${s.z}，应到${p}`);assert.equal(s.floor,'ground');}
    }
  }
});

test('商场和住宅真实入口可从楼内出门到庭院，并沿原路返回楼内',()=>{
  for(const path of F.paths.filter(p=>p.entrance)){
    const e=L.entrances.find(e=>e.id===path.entrance);assert.ok(e,path.entrance);
    const mid=[(e.seg.x0+e.seg.x1)/2,(e.seg.z0+e.seg.z1)/2];
    const inside=[mid[0]-e.nx*1.1,mid[1]-e.nz*1.1];
    let s={...at(...inside),floor:e.level};assert.ok(clear(nav,s),`${path.id}:楼内起点`);
    const outside=[mid[0]+e.nx*1.1,mid[1]+e.nz*1.1];
    s=move(s,outside);assert.equal(s.floor,'ground',`${path.id}:未从真实门走出`);
    for(const p of path.points.slice(1)){s=move(s,p);assert.ok(dist([s.x,s.z],p)<.12,`${path.id}:出门后未到${p}`);}
    for(const p of [...path.points.slice(1,-1)].reverse())s=move(s,p);
    s=move(s,outside);s=move(s,inside);
    assert.ok(dist([s.x,s.z],inside)<.12,`${path.id}:未回到门内`);assert.equal(s.floor,e.level);
  }
});

test('二期真实北门与四栋住宅逐一往返乐园和食集，跨街路线连续可走',()=>{
  const x=150/Math.SQRT2,crossing=F.paths.find(p=>p.id==='residential-recreation');
  assert.deepEqual(crossing.crossingSegments,[1,2]);
  for(const z of [-184,-170])assert.ok(L.site.crossings.some(c=>pointInPoly([x,z],c.poly)),`缺少z=${z}过街线`);
  const destinations=[[[88,-142],[78,-142]],F.paths.find(p=>p.id==='p2-market').points.slice(1)];
  for(const id of ['P2-N','R1-MAIN','R2-MAIN','R3-MAIN','R4-MAIN'])for(const target of destinations){
    const e=L.entrances.find(e=>e.id===id),mid=[(e.seg.x0+e.seg.x1)/2,(e.seg.z0+e.seg.z1)/2];
    const inside=[mid[0]-e.nx*1.1,mid[1]-e.nz*1.1],outside=[mid[0]+e.nx*1.1,mid[1]+e.nz*1.1];
    const route=[outside,...(id==='P2-N'?[[x,-142]]:[[mid[0],-193],[x,-193],[x,-190],[x,-178],[x,-162],[x,-142]]),...target];
    let s={...at(...inside),floor:e.level};assert.ok(clear(nav,s),`${id}:室内起点`);
    for(const p of route){s=move(s,p);assert.ok(dist([s.x,s.z],p)<.12,`${id}:去活动区停在${s.x},${s.z}`);assert.equal(s.floor,'ground');}
    for(const p of [...route.slice(0,-1)].reverse()){
      s=move(s,p);assert.ok(dist([s.x,s.z],p)<.12,`${id}:返程停在${s.x},${s.z}`);
    }
    s=move(s,inside);assert.equal(s.floor,e.level);assert.ok(dist([s.x,s.z],inside)<.12,`${id}:未返回门内`);
  }
});
