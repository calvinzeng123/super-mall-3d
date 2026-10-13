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
    for(const p of [...L.site.roads.map(r=>r.poly),...L.site.trenches,...(L.extensions.surfaceParking||[]).map(r=>r.poly)])assert.ok(!convexOverlap(zone.poly,p,.02),`${zone.id}:车道/停车位冲突`);
  }
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
