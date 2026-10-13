import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { pointInPoly, convexOverlap, dist } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
const F=L.site.forecourt,nav=buildNav(L);
const at=(x,z)=>({floor:'ground',x,z,y:0,slope:null});
const move=(s,p)=>{const dx=p[0]-s.x,dz=p[1]-s.z,n=Math.ceil(Math.hypot(dx,dz)/.09);for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n,0);return s;};

test('一期五个活动地块不压建筑、道路、车库坡道或共享车位',()=>{
  assert.equal(F.zones.length,5);
  for(const zone of F.zones){
    for(let x=zone.rect.x0+.25;x<zone.rect.x1;x+=1)for(let z=zone.rect.z0+.25;z<zone.rect.z1;z+=1){
      assert.ok(!L.buildings.filter(b=>b.kind!=='metro').some(b=>pointInPoly([x,z],b.outline)),`${zone.id}:建筑 ${x},${z}`);
    }
    for(const p of [...L.site.roads.map(r=>r.poly),...L.extensions.roads.flatMap(r=>r.polys),...L.site.trenches,...(L.extensions.surfaceParking||[]).map(r=>r.poly)])assert.ok(!convexOverlap(zone.poly,p,.02),`${zone.id}:车道/停车位冲突`);
  }
});

test('公寓原址接纳完整乐园与五间食集，游具保持原尺寸且首层功能不丢失',()=>{
  assert.equal(F.items.length,61);
  const family=F.zones.find(z=>z.id==='family'),market=F.zones.find(z=>z.id==='market');
  assert.deepEqual(family.rect,{x0:-60,z0:-254,x1:-16,z1:-182});
  assert.deepEqual(market.rect,{x0:-59,z0:-175,x1:-16,z1:-135});
  const expected={carousel:[16,16],'play-castle':[15,13],swings:[7,5],sandpit:[8,7],'mini-train':[42,66]};
  for(const [type,size] of Object.entries(expected)){
    const item=F.items.find(i=>i.type===type);assert.equal(item.zone,'family');assert.deepEqual([item.w,item.d],size,type);
  }
  assert.equal(F.items.filter(i=>i.zone==='market'&&i.type==='kiosk').length,5);
  assert.equal(F.items.filter(i=>i.zone==='market'&&i.type==='cafe-table').length,4);
  assert.equal(F.items.filter(i=>i.type==='garden-island').length,14);
  assert.equal(F.zones.find(z=>z.id==='east-garden').name,'星湾街角庭院');
});

test('亲子设施、食集、阅读庭院共用实际物件和碰撞足迹',()=>{
  for(const type of ['carousel','play-castle','swings','sandpit','mini-train','kiosk','stage','pergola','cafe-table','reading-table','bikes'])assert.ok(F.items.some(i=>i.type===type),type);
  for(const item of F.items){
    const zone=F.zones.find(z=>z.id===item.zone);
    assert.ok(item.poly.every(p=>pointInPoly(p,zone.poly)),`${item.id}:越界`);
    assert.ok(F.obstacles.some(o=>o.id===item.id),`${item.id}:缺碰撞`);
  }
  for(const o of F.obstacles){const c=o.poly.reduce((a,p)=>[a[0]+p[0]/o.poly.length,a[1]+p[1]/o.poly.length],[0,0]);assert.equal(clear(nav,at(...c)),false,`${o.id}:实体可穿过`);}
});

test('一期每条入口至活动区的步行主线连续可达并双向走通',()=>{
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

test('一期真实入口可从楼内出门到庭院，并沿原路返回楼内',()=>{
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

test('东门、食集及迁移乐园构成连续步行网络',()=>{
  const route=[[-73.34,-114.75],[-61,-120],[-61,-132],[-38,-132],[-38,-178],[-13,-178],[-13,-198],[-21,-198],[-13,-198],[-13,-234],[-21,-234]];
  route[0]=[-72.55,-115.08];
  for(const points of [route,[...route].reverse()]){
    let s=at(...points[0]);assert.ok(clear(nav,s));
    for(const p of points.slice(1)){s=move(s,p);assert.ok(dist([s.x,s.z],p)<.12,`食集乐园路线停在${s.x},${s.z}`);assert.equal(s.floor,'ground');}
  }
});
