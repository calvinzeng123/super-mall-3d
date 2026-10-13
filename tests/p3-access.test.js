// 三期真实步行：不调用landAt/spawn/目录传送，整个路线只通过step走完。
import test from 'node:test';
import assert from 'node:assert/strict';
import { L, lvl, onSlab } from './helpers.js';
import { buildNav, step, clear, landAt, floorLabel } from '../src/layout/nav.js';
import { dist, toW, pointInPoly, lrectPoly, polySamples } from '../src/layout/geom.js';

const nav=buildNav(L), b=L.buildings.find(b=>b.id==='P3');
const at=p=>({floor:p.floor,x:p.x,z:p.z,y:p.y,slope:null});
const move=(s,p)=>{
  const dx=p.x-s.x,dz=p.z-s.z,n=Math.ceil(Math.hypot(dx,dz)/.075);
  for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n,0);
  assert.ok(dist([s.x,s.z],[p.x,p.z])<.08,`不能走到 ${p.floor} ${p.x.toFixed(2)},${p.z.toFixed(2)}，停在 ${s.floor} ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
  assert.equal(s.floor,p.floor,'实际楼面必须经过平台后改变');
  assert.ok(Math.abs(s.y-p.y)<1e-6);
  return s;
};

test('三期44组双跑楼梯双向连续步行，覆盖全部楼栋以及B2/B1',()=>{
  assert.equal(b.access.routes.length,44);
  assert.equal(b.access.flights.length,88);
  for(const r of b.access.routes)for(const points of [r.waypoints,[...r.waypoints].reverse()]){
    let s=at(points[0]);
    assert.ok(clear(nav,s),`${r.id} 起点无支撑`);
    for(const p of points.slice(1))s=move(s,p);
    assert.equal(s.slope,null);
  }
});

test('三期楼梯上层挖空，半层平台有实体支撑，降落可回到梯面',()=>{
  for(const r of b.access.routes){
    const block=b.blocks.find(k=>k.n===r.block),lv=lvl(r.to);
    const hole=lrectPoly(block.F,block.stairShaft);
    for(const p of polySamples(hole,.8,.16))assert.ok(!onSlab(lv,p),`${r.id} 楼梯仍被上层板封死`);
    const surface=b.access.surfaces.find(s=>s.id===r.landing);
    assert.ok(nav.floors.has(surface.id));
    assert.match(floorLabel(nav,L,{floor:surface.id,slope:null}),/楼梯中间平台/);
    for(const p of polySamples(surface.poly,.5,.42))assert.ok(clear(nav,{floor:surface.id,x:p[0],z:p[1],y:surface.elev,slope:null}));
    const f=b.access.flights.find(f=>f.id===`${r.id}-flight-1`);
    const x=(f.bottom.x+f.top.x)/2,z=(f.bottom.z+f.top.z)/2,y=(f.bottom.y+f.top.y)/2;
    const landed=landAt(nav,x,z,y+.01);
    assert.equal(landed?.slope?.id,f.id,`${r.id} 落地没有识别梯面`);
  }
});

test('三期每栋楼从楼梯连续走入2F和3F各商铺，原有门牌仍可进入',()=>{
  for(const block of b.blocks)for(const short of ['2F','3F']){
    const lv=lvl(`P3-${short}`),route=b.access.routes.find(r=>r.block===block.n&&r.to===lv.id);
    let initial=at(route.waypoints[0]);
    for(const p of route.waypoints.slice(1))initial=move(initial,p);
    const world=(u,v)=>{const[x,z]=toW(block.F,u,v);return{x,z,y:lv.elev,floor:lv.id};};
    for(const u of lv.units.filter(u=>u.block===block.n)){
      let s=initial;
      const f=u.fronts.find(f=>f.side==='S'),cx=(f.x0+f.x1)/2;
      // 转过建筑东南角再沿外廊抵达店门；屋顶酒吧通过露台抵达。
      s=move(s,world(block.h+1.25,block.w+1.2));
      s=move(s,world(cx,block.w+1.2));
      s=move(s,world(cx,f.z0+.8));
      s=move(s,world(cx,f.z0-.8));
      assert.ok(u.polys.some(p=>pointInPoly([s.x,s.z],p)),`${u.code} 从楼梯到不了店内`);
    }
  }
});

test('后街地面6m主街与2F/3F连续外廊全程可步行，各层有真实楼板',()=>{
  for(const [short,z] of [['1F',214],['2F',244.1],['3F',244.1]]){
    const lv=lvl(`P3-${short}`);
    let s={floor:lv.id,x:-233,z,y:lv.elev,slope:null};
    assert.ok(clear(nav,s));
    s=move(s,{floor:lv.id,x:-34,z,y:lv.elev});
    assert.ok(clear(nav,s));
    for(let x=-233;x<-34;x+=2)assert.ok(onSlab(lv,[x,z]),`${lv.id} 街道缺少支撑`);
  }
  const market=lvl('P3-1F').features.filter(f=>f.type==='market-stall');
  assert.equal(market.length,12);
  for(const f of market){
    assert.ok(f.z+f.d/2<=211||f.z-f.d/2>=217,'摊位侵占6m净通道');
    assert.ok(!clear(nav,{floor:'P3-1F',x:f.x,z:f.z,y:0,slope:null}),'实体摊位不能穿越');
  }
});

test('P3地面出入口和B1/B2双向车道都能实际走通而非孤立坡道',()=>{
  for(const r of L.ramps.filter(r=>r.building==='P3')){
    const run=Math.hypot(r.to.x-r.from.x,r.to.z-r.from.z),ux=(r.to.x-r.from.x)/run,uz=(r.to.z-r.from.z)/run;
    const floor=p=>p.level==='street'?nav.groundAt(p.x,p.z):p.level;
    for(const reverse of [false,true]){
      const a=reverse?r.to:r.from,c=reverse?r.from:r.to,dx=ux*(reverse?-1:1),dz=uz*(reverse?-1:1);
      let s={floor:floor(a),x:a.x-dx*.8,z:a.z-dz*.8,y:a.y,slope:null};
      assert.ok(clear(nav,s),`${r.id} 起点被阻`);
      s=move(s,{floor:floor(c),x:c.x+dx*.8,z:c.z+dz*.8,y:c.y});
      assert.equal(s.slope,null,`${r.id} 出口无法离开坡面`);
    }
  }
});
