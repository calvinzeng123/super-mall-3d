import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { L, onSlab } from './helpers.js';
import { toW, rectPoly, polyBounds, convexOverlap, polyArea } from '../src/layout/geom.js';
import { buildNav, clear, step, NAV } from '../src/layout/nav.js';

const nav = buildNav(L);
const towers = L.buildings.filter(b => b.usage === 'residential');
const levels = id => L.levels.filter(l => l.building === id);
const floor = id => L.levels.find(l => l.id === id);
const near = (a, b, e = 1e-5) => Math.abs(a-b) < e;
const state = (lv, F, p) => {
  const [x,z] = toW(F, ...p);
  return { floor: lv.id, x, z, y: lv.elev, slope: null };
};
function walkTo(s, x, z, message, eps = .035) {
  const n = Math.max(1, Math.ceil(Math.hypot(x-s.x,z-s.z)/.1));
  const dx = (x-s.x)/n, dz = (z-s.z)/n;
  for (let i=0;i<n;i++) {
    s=step(nav,s,dx,dz);
    assert.ok(clear(nav,s), `${message}: 移动离开支撑面或进入实体`);
  }
  assert.ok(Math.hypot(s.x-x,s.z-z)<eps, `${message}: 未到达 ${x},${z}，停在 ${s.x},${s.z}`);
  return s;
}
const hash = path => createHash('sha256').update(fs.readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex');

test('348户以1:1尺寸进入四塔2–30F，户号、楼高和两种三房的差异均保留', () => {
  assert.deepEqual(towers.map(b=>b.id), ['R1','R2','R3','R4']);
  let count=0;
  for (const b of towers) {
    assert.ok(near(b.bounds.x1-b.bounds.x0,42)&&near(b.bounds.z1-b.bounds.z0,33.2));
    assert.equal(b.storeys,30); assert.equal(b.height,103.4);
    const live=levels(b.id).filter(l=>l.levelNumber);
    assert.equal(live.length,30); assert.equal(live[0].units.length,0);
    assert.equal(live[0].height,4.8);
    for (const lv of live.slice(1)) {
      assert.equal(lv.height,3.4); assert.ok(near(lv.elev,4.8+(lv.levelNumber-2)*3.4));
      assert.equal(lv.units.length,3);
      for (const [i,u] of lv.units.entries()) {
        count++;
        const id=['01','02','03'][i],width=id==='03'?17.6:15.6,r=u.rects[0];
        assert.equal(u.residence.prototype,id);
        assert.equal(u.id,`${lv.id}-U${i+1}`);
        assert.equal(u.code,`${b.id}-${String(lv.levelNumber).padStart(2,'0')}${id}`);
        assert.deepEqual(u.residence.modelTransform,{scale:1,translate:[0,0,11.5]});
        assert.ok(near(r.x1-r.x0,width)&&near(r.z1-r.z0,14.3));
        assert.ok(near(Math.abs(polyArea(u.polys[0])),width*14.3));
        assert.ok(near(u.frame.c*u.frame.c+u.frame.s*u.frame.s,1));
        const bb=polyBounds(u.polys[0]);
        assert.ok(bb.x0>=b.bounds.x0&&bb.x1<=b.bounds.x1&&bb.z0>=b.bounds.z0&&bb.z1<=b.bounds.z1);
        assert.ok(near(u.residence.balcony.z1-u.residence.balcony.z0,2.8));
        for(const other of lv.units.slice(i+1))assert.ok(!convexOverlap(u.polys[0],other.polys[0]),`${u.id}与${other.id}重叠`);
        for(const core of lv.rooms)for(const p of core.polys)assert.ok(!convexOverlap(u.polys[0],p),`${u.id}占用核心筒`);
      }
    }
    assert.equal(live.flatMap(l=>l.units).length,87);
  }
  assert.equal(count,348);
  const [a,b,c]=floor('R1-2F').units.map(u=>u.residence);
  assert.deepEqual([a.beds.length,b.beds.length,c.beds.length],[3,3,4]);
  assert.deepEqual([a.bathrooms.length,b.bathrooms.length,c.bathrooms.length],[2,2,3]);
  assert.equal(a.entryDoor.at,8.55);assert.equal(b.entryDoor.at,7.05);
  assert.notDeepEqual(a.partitions,b.partitions);
});

test('导航模板可追溯至原始plan和实测模型，合并真实碰撞且不保留虚构淋浴门', () => {
  for(const u of floor('R1-2F').units){
    const r=u.residence;
    assert.equal(hash(r.source.plan),r.source.planSHA256);
    assert.equal(hash(r.source.audit),r.source.auditSHA256);
    assert.ok(r.collisionFromModel);
    assert.deepEqual(r.source.bodyBand,[.12,1.75]);
    assert.equal(r.source.unionPolygons,r.obstacles.length);
    assert.ok(r.obstacles.length<150&&r.obstacles.length<r.source.measuredSolids/5);
    for (const bed of r.beds) assert.ok(!clear(nav,state(floor('R1-2F'),u.frame,[bed.x,bed.z])),`${r.prototype}/${bed.room}真实床铺没有阻挡移动`);
    const audit=JSON.parse(fs.readFileSync(new URL(`../${r.source.audit}`,import.meta.url)));
    const meshes=new Map(audit.mesh_inventory.map(m=>[m.name,m]));
    const showerDoors=r.partitions.filter(p=>p.role==='measured-shower');
    assert.equal(showerDoors.length,r.bathrooms.length);
    for(const p of showerDoors){
      const [front,side]=p.sourceMeshes.map(n=>meshes.get(n));
      assert.ok(front?.obstacle&&side?.obstacle);
      const expected=front.bounds[1][0]<side.bounds[0][0]
        ? side.bounds[0][0]-front.bounds[1][0] : front.bounds[0][0]-side.bounds[1][0];
      assert.ok(near(p.door.width,expected),`${r.prototype}淋浴门不是实际玻璃间隙`);
    }
  }
});

test('三套户型46条源模型路径均可实际双向走通，包含所有房间、阳台及真实淋浴区', () => {
  const lv=floor('R1-2F');let count=0;
  for(const u of lv.units){
    const targets=u.residence.navigationTargets;
    for(const room of u.residence.rooms.filter(r=>['bedroom','bathroom','kitchen','living','dining','balcony'].includes(r.kind)))
      assert.ok(targets.some(t=>t.id===room.id),`${u.residence.prototype}缺少${room.id}`);
    assert.equal(targets.filter(t=>t.id.startsWith('actual_Flush shower tray')).length,u.residence.bathrooms.length);
    for(const target of targets){
      count++;
      assert.deepEqual(target.path[0],u.residence.navigationOrigin);
      for(const reverse of [false,true]){
        const path=reverse?[...target.path].reverse():target.path;
        let s=state(lv,u.frame,path[0]);assert.ok(clear(nav,s));
        for(const p of path.slice(1)){
          const [x,z]=toW(u.frame,...p);
          s=walkTo(s,x,z,`${u.residence.prototype}/${target.id}/${reverse?'返程':'去程'}`);
        }
      }
    }
  }
  assert.equal(count,46);assert.equal(NAV.r,.3);
});

test('每栋1F独立七区大堂均从主入口实际可达，家具和隔墙参与碰撞', () => {
  for(const b of towers){
    const lv=floor(`${b.id}-1F`),plan=lv.lobbyPlan;
    assert.equal(lv.kind,'lobby');assert.equal(lv.units.length,0);
    assert.deepEqual(plan.zones.map(z=>z.id),['entry','reception','waiting','mail','management','reading','washroom']);
    const h=.25,start=[0,15.5],queue=[start],seen=new Set([start.join(',')]);
    for(let i=0;i<queue.length;i++){
      const [x,z]=queue[i],a=state(lv,b.frame,[x,z]);
      for(const [dx,dz]of[[h,0],[-h,0],[0,h],[0,-h]]){
        const nx=x+dx,nz=z+dz,key=[nx,nz].join(',');
        if(nx< -20.5||nx>20.5||nz< -16.1||nz>16.1||seen.has(key))continue;
        const goal=state(lv,b.frame,[nx,nz]);if(!clear(nav,goal))continue;
        const next=step(nav,a,goal.x-a.x,goal.z-a.z);
        if(Math.hypot(next.x-goal.x,next.z-goal.z)>.02)continue;
        seen.add(key);queue.push([nx,nz]);
      }
    }
    for(const z of plan.zones)assert.ok(queue.some(p=>Math.hypot(p[0]-z.navigationPoint[0],p[1]-z.navigationPoint[1])<.3),`${b.id}大堂${z.id}不可达`);
    for(const o of plan.obstacles){const r=o.rect;assert.ok(!clear(nav,state(lv,b.frame,[(r.x0+r.x1)/2,(r.z0+r.z1)/2])),`${b.id}/${o.id}只画家具却无碰撞`);}
  }
});

test('四塔低层和高层每户都能经公共走廊到双电梯及双消防楼梯', () => {
  let routes=0;
  for(const b of towers)for(const short of ['2F','30F']){
    const lv=floor(`${b.id}-${short}`);
    const stops=nav.links.filter(l=>[`${b.id}-ST1`,`${b.id}-ST2`,`${b.id}-L1`,`${b.id}-L2`].includes(l.id))
      .map(l=>({id:l.id,...l.stops.find(s=>s.floor===lv.id)}));
    assert.equal(stops.length,4);
    for(const u of lv.units)for(const t of stops){
      const [x,z]=toW(u.frame,u.residence.entryDoor.at,-.8);
      let s={floor:lv.id,x,z,y:lv.elev,slope:null};assert.ok(clear(nav,s));
      for(const p of [[x,b.frame.oz],[t.x,b.frame.oz],[t.x,t.z]])s=walkTo(s,...p,`${u.id}至${t.id}`);
      routes++;
    }
  }
  assert.equal(routes,96); // 12 routes per sample floor, 2 floors x 4 buildings.
});

test('各层真实双楼梯井和电梯井、完整落脚平台、采光井及无重叠楼板均保留', () => {
  for(const b of towers)for(const lv of levels(b.id)){
    for(let i=0;i<lv.slab.pieces.length;i++)for(const q of lv.slab.pieces.slice(i+1))
      assert.ok(!convexOverlap(lv.slab.pieces[i].outer,q.outer),`${lv.id}楼板面积重叠`);
    assert.equal(lv.voids.filter(v=>v.kind==='stair').length,2);
    assert.equal(lv.voids.filter(v=>v.kind==='shaft').length,2);
    for(const v of lv.voids){
      assert.ok(lv.slab.pieces.some(p=>p.holes.includes(v.poly)),`${lv.id}/${v.id}未真正开洞`);
      const r=v.rect;assert.ok(!onSlab(lv,toW(v.frame,(r.x0+r.x1)/2,(r.z0+r.z1)/2)));
    }
    for(const room of lv.rooms.filter(r=>r.shaftRect)){
      const r=room.landingRect;
      assert.ok(r.z1-r.z0>=1.79,`${lv.id}消防落脚区不足模型设计的1.8m净深`);
      assert.ok(onSlab(lv,toW(room.frame,(r.x0+r.x1)/2,(r.z0+r.z1)/2)));
      const d=room.doors[0],x=(d.x0+d.x1)/2;
      let s=state(lv,room.frame,[x,d.z0+.8]);assert.ok(clear(nav,s));
      const goal=toW(room.frame,x,d.z0-.8);
      s=walkTo(s,...goal,`${lv.id}/${room.id}进入消防平台`);
      const outside=toW(room.frame,x,d.z0+.8);walkTo(s,...outside,`${lv.id}/${room.id}离开消防平台`);
    }
    if(lv.elev>0){
      assert.equal(lv.slab.pieces.length,9);
      for(const r of lv.corePlan.lightWells){
        const poly=rectPoly(r).map(p=>toW(b.frame,...p));
        assert.ok(!lv.slab.pieces.some(p=>convexOverlap(poly,p.outer)),`${lv.id}采光井被实板填满`);
        assert.ok(!onSlab(lv,toW(b.frame,(r.x0+r.x1)/2,(r.z0+r.z1)/2)));
      }
    }
  }
});

test('住宅地库六米车道绕开电梯实体，四栋车库均可从内部双向走到地下干道', () => {
  for(const b of towers){
    const lv=floor(`${b.id}-B1`),aisle=lv.walk.find(w=>w.id===`${b.id}-garage-exit-aisle`);
    assert.ok(aisle);assert.ok(near(aisle.rect.x1-aisle.rect.x0,6));
    for(const core of lv.rooms)for(const p of core.polys)assert.ok(!convexOverlap(aisle.poly,p),`${b.id}车道占用井道`);
    const endZ=b.id==='R1'?-190:-193.5;
    const points=[[b.frame.ox,b.frame.oz],[b.frame.ox+8.5,b.frame.oz],[b.frame.ox+8.5,endZ]];
    for(const reverse of [false,true]){
      const path=reverse?[...points].reverse():points;
      let s={floor:lv.id,x:path[0][0],z:path[0][1],y:lv.elev,slope:null};assert.ok(clear(nav,s));
      for(const p of path.slice(1))s=walkTo(s,...p,`${b.id}地库${reverse?'返程':'去程'}`);
      assert.equal(s.floor,lv.id);
    }
  }
});
