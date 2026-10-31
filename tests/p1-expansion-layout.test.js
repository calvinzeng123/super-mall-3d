import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { polyArea, polyBounds, pointInPoly, lrectPoly, toW, rect, rectPoly, segProbes } from '../src/layout/geom.js';

const L=buildLayout(), old=buildLayout({expansion:false}), nav=buildNav(L);
const annexes=L.buildings.filter(b=>b.kind==='annex');
const area=lv=>lv.slab.pieces.reduce((s,p)=>s+Math.abs(polyArea(p.outer))-p.holes.reduce((n,h)=>n+Math.abs(polyArea(h)),0),0);
const onSlab=(lv,p)=>lv.slab.pieces.some(s=>pointInPoly(p,s.outer)&&!s.holes.some(h=>pointInPoly(p,h)))&&!lv.voids.some(v=>pointInPoly(p,v.poly));
function move(s,p) {
  const n=Math.max(1,Math.ceil(Math.hypot(p.x-s.x,p.z-s.z)/.04)),dx=(p.x-s.x)/n,dz=(p.z-s.z)/n;
  for(let i=0;i<n;i++){const prev=s;s=step(nav,s,dx,dz);assert.ok(clear(nav,s),`${s.floor}: unsupported`);assert.ok(Math.abs(s.y-prev.y)<.04,'vertical teleport');}
  assert.ok(Math.hypot(s.x-p.x,s.z-p.z)<.035,`${s.floor}: blocked at ${s.x},${s.z}, target ${p.x},${p.z}`);
  if(p.floor)assert.equal(s.floor,p.floor);return s;
}

test('tour adds six-storey main mall and eight stepped annexes while compact FPS and unrelated phases retain their original data',()=>{
  assert.equal(annexes.length,8);
  assert.deepEqual(L.levels.filter(l=>l.building==='P1'&&l.elev>=0).map(l=>l.short),['1F','2F','3F','4F','5F','6F','RF']);
  assert.equal(L.levels.find(l=>l.id==='P1-RF').elev,34);
  assert.equal(L.levels.find(l=>l.id==='P1C-7F').elev,34);
  assert.equal(L.levels.find(l=>l.id==='P1C-RF').elev,39.5);
  assert.equal(old.expansion,undefined);assert.equal(old.levels.find(l=>l.id==='P1-RF').elev,17.5);
  for(const bid of ['P2','P3','H','A','R1','R2','R3','R4','WPG']) {
    assert.deepEqual(L.buildings.find(b=>b.id===bid),old.buildings.find(b=>b.id===bid),`${bid} building changed`);
    assert.deepEqual(L.levels.filter(l=>l.building===bid),old.levels.filter(l=>l.building===bid),`${bid} levels changed`);
  }
  assert.deepEqual(L.ramps.filter(r=>!r.expansion),old.ramps,'shared garage ramp topology changed');
  assert.deepEqual(L.ramps.filter(r=>r.expansion).map(r=>r.id),['P1-N-IN','P1-N-OUT','P1-E-IN','P1-E-OUT'],'tour-only phase-one gates');
  assert.deepEqual(L.site.forecourt.items.filter(i=>['family','market'].includes(i.zone)),old.site.forecourt.items.filter(i=>['family','market'].includes(i.zone)));
});

test('upper main floors have genuine decreasing slabs and every annex has usable tenants, cores and a reachable roof',()=>{
  const fs=['3F','4F','5F','6F'].map(short=>L.levels.find(l=>l.id===`P1-${short}`));
  for(let i=1;i<fs.length;i++)assert.ok(area(fs[i])<area(fs[i-1])-100,'retreat is only cosmetic');
  for(const b of annexes) {
    for(const p of b.outline){assert.ok(p[0]>=-286&&p[0]<=-16);assert.ok(p[1]>=-256&&p[1]<=-20);}
    const levels=L.levels.filter(l=>l.building===b.id);
    for(const lv of levels) {
      if(lv.kind!=='roof')assert.ok(lv.units.length>=1,`${lv.id} has no playable tenants`);
      assert.ok(L.elevators.some(e=>e.building===b.id&&e.serves.includes(lv.id)),`${lv.id} lacks lift`);
      assert.ok(b.access.routes.some(r=>r.from===lv.id||r.to===lv.id),`${lv.id} lacks stair`);
      for(const u of lv.units)for(const poly of u.polys)for(const q of poly){
        const c=polyBounds(poly),p=[q[0]+((c.x0+c.x1)/2-q[0])*.001,q[1]+((c.z0+c.z1)/2-q[1])*.001];
        assert.ok(onSlab(lv,p),`${u.id} overhangs the real floor`);
      }
      for(const u of lv.units)for(const f of u.wfronts)for(const p of segProbes(f,.5))assert.ok(onSlab(lv,p),`${u.id} has no door approach`);
    }
  }
});

test('every new protected stair is continuously walkable both ways with cut shafts and retained thin entry platforms',()=>{
  for(const b of annexes)for(const r of b.access.routes)for(const rev of [false,true]) {
    const points=rev?[...r.waypoints].reverse():r.waypoints;let s={...points[0],slope:null};assert.ok(clear(nav,s),r.id);
    for(const p of points.slice(1))s=move(s,p);
  }
  for(const lv of L.levels.filter(l=>l.expansion))for(const s of L.stairs.filter(s=>s.building===lv.building&&s.serves.includes(lv.id))) {
    const landing=lv.slab.pieces.find(p=>p.stair===s.id);assert.equal(landing?.thickness,.12,`${s.id}/${lv.id} lost thin platform`);
  }
});

test('public terrace doors lead onto supported open decks on all new upper main levels',()=>{
  for(const short of ['4F','5F','6F'])assert.ok(L.levels.find(l=>l.id===`P1-${short}`).expansion.terraces.length>0);
  for(const e of L.entrances.filter(e=>e.architecturalOpening&&e.id.includes('terrace-')&&e.id.endsWith('door'))) {
    const lv=L.levels.find(l=>l.id===e.level),x=(e.seg.x0+e.seg.x1)/2,z=(e.seg.z0+e.seg.z1)/2;
    const a={floor:lv.id,x:x-e.nx*1.5,z:z-e.nz*1.5,y:lv.elev,slope:null},b={floor:lv.id,x:x+e.nx*1.5,z:z+e.nz*1.5,y:lv.elev,slope:null};
    assert.ok(clear(nav,a),e.id);assert.ok(clear(nav,b),e.id);move(a,b);move(b,a);
  }
});

test('two-floor art loop has real joined slabs and all ten bridges cross their destination door in both directions',()=>{
  assert.equal(L.expansion.routes.length,10);
  for(const r of L.expansion.routes) {
    const path=L.extensions.paths.find(p=>p.id===r.id),a=L.entrances.find(e=>e.id===`${r.id}-start`),e=L.entrances.find(e=>e.id===`${r.id}-target`);
    const first={x:path.points[0][0]-a.nx*.7,z:path.points[0][2]-a.nz*.7,y:6.5,floor:r.from};
    const last={x:(e.seg.x0+e.seg.x1)/2-e.nx*.8,z:(e.seg.z0+e.seg.z1)/2-e.nz*.8,y:6.5,floor:r.to};
    const points=[first,...path.points.map(([x,y,z])=>({x,y,z})),last];
    for(const reverse of [false,true]){const route=reverse?[...points].reverse():points;let s={...route[0],slope:null};assert.ok(clear(nav,s),`${r.id} threshold blocked`);for(const p of route.slice(1))s=move(s,p);}
  }
  const adjacency=new Map();for(const r of L.expansion.routes){if(!adjacency.has(r.from))adjacency.set(r.from,[]);adjacency.get(r.from).push(r.to);}
  assert.ok(adjacency.get('P1-2F').includes('P1C-2F'));assert.ok(adjacency.get('P1C-2F').includes('P1-2F'));
  assert.ok(adjacency.get('P1-2F').includes('P1W2-2F'));assert.ok(adjacency.get('P1W4-2F').includes('P1-2F'));
});

test('new cultural and garden halls absorb the existing shared-garage kiosks without sealing or covering them',()=>{
  for(const [bid,ids]of [['P1C',['P1-SHARED-L1']],['P1E',['P1-SHARED-L4','P1-SHARED-ST4']]]) {
    const lv=L.levels.find(l=>l.id===`${bid}-1F`);
    for(const id of ids){const e=L.entrances.find(e=>e.id===`${id}-entry`);assert.equal(e.to,lv.id);const x=(e.seg.x0+e.seg.x1)/2,z=(e.seg.z0+e.seg.z1)/2;
      let s={x:x-e.nx*.6,z:z-e.nz*.6,y:0,floor:'P1-1F',slope:null};assert.ok(clear(nav,s));s=move(s,{x:x+e.nx*.8,z:z+e.nz*.8,y:0,floor:lv.id});
      const kiosk=lv.integratedGarageKiosks.find(k=>k.id===id),bb=polyBounds(kiosk.poly);assert.ok(!onSlab(lv,[(bb.x0+bb.x1)/2,(bb.z0+bb.z1)/2]),'duplicate slab covers garage kiosk');
    }
  }
});

test('sunken art courtyard opens the ground, connects B1M by passage and real steps, and preserves B1/B2 parking plates',()=>{
  const c=L.expansion.sunkenCourt,lv=L.levels.find(l=>l.id===c.level);
  assert.equal(c.elev,-4.5);assert.ok(onSlab(lv,[-108.5,-51]));
  assert.ok(L.site.openings.some(p=>pointInPoly([-108.5,-36],p)));
  const r=L.buildings.find(b=>b.id==='P1').access.routes.find(r=>r.id==='P1-SUNKEN-ACCESS');
  for(const reverse of [false,true]){const pts=reverse?[...r.waypoints].reverse():r.waypoints;let s={...pts[0],slope:null};for(const p of pts.slice(1))s=move(s,p);}
  for(const id of ['P1-B1','P1-B2'])assert.deepEqual(L.levels.find(l=>l.id===id).slab,old.levels.find(l=>l.id===id).slab);
});
