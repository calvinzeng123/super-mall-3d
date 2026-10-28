import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout } from '../src/layout/layout.js';
import { buildNav, clear, step } from '../src/layout/nav.js';
import { rectPoly, rectsOverlap, polyBounds, pointInPoly, convexOverlap } from '../src/layout/geom.js';

const layout=buildLayout(),nav=buildNav(layout),levels=layout.levels.filter(l=>l.expansion?.publicFixtures);
const at=(lv,x,z)=>({floor:lv.id,x,z,y:lv.elev,slope:null});
const supported=(lv,p)=>lv.slab.pieces.some(s=>pointInPoly(p,s.outer)&&!s.holes.some(h=>pointInPoly(p,h)))&&!lv.voids.some(v=>pointInPoly(p,v.poly));
const travel=(lv,a,b)=>{
  let s=at(lv,...a);if(!clear(nav,s))return false;
  const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.06)),dx=(b[0]-a[0])/n,dz=(b[1]-a[1])/n;
  for(let i=0;i<n;i++)s=step(nav,s,dx,dz);
  return s.floor===lv.id&&Math.hypot(s.x-b[0],s.z-b[1])<.025;
};

test('all new commercial floors have finite themed public groups with density scaled to the building',()=>{
  assert.equal(levels.length,27);
  for(const lv of levels){const n=lv.expansion.publicFixtures.length;assert.ok(n>=(lv.building==='P1C'?4:2),`${lv.id} remains empty`);assert.ok(n<=(lv.building==='P1C'?8:4),`${lv.id} overcrowded`);}
  const kinds=new Set(levels.flatMap(l=>l.expansion.publicFixtures.map(f=>f.kind)));
  for(const kind of ['gallery','reading','installation','workshop','cafe','garden'])assert.ok(kinds.has(kind),`missing ${kind}`);
  const culture=levels.filter(l=>l.building==='P1C');
  assert.notDeepEqual(culture[1].expansion.publicFixtures.map(f=>f.kind),culture[2].expansion.publicFixtures.map(f=>f.kind),'culture floors repeat one furniture program');
  assert.ok(!buildLayout({expansion:false}).levels.some(l=>l.expansion?.publicFixtures),'FPS gained expansion furnishings');
});

test('public furniture stands on physical floor, stays out of tenants and cores, and uses the same complete collision footprint',()=>{
  for(const lv of levels)for(const fixture of lv.expansion.publicFixtures){
    assert.deepEqual(fixture.poly,rectPoly(fixture.rect));
    const {x0,x1,z0,z1}=fixture.rect;
    for(const p of [...fixture.poly,[(x0+x1)/2,(z0+z1)/2]])assert.ok(supported(lv,p),`${fixture.id} floats above a void`);
    for(const u of [...lv.units,...lv.rooms])for(const poly of u.polys)assert.ok(!convexOverlap(fixture.poly,poly),`${fixture.id} intrudes into ${u.id}`);
    for(const other of lv.expansion.publicFixtures)if(other!==fixture)assert.ok(!rectsOverlap(fixture.rect,other.rect));
    assert.equal(clear(nav,at(lv,(x0+x1)/2,(z0+z1)/2)),false,`${fixture.id} is a visible but non-solid object`);
  }
});

test('furnished culture galleries retain their north-south promenade and east bridge cross-axis',()=>{
  for(const lv of levels.filter(l=>l.building==='P1C')){
    const b=polyBounds(lv.expansion.facadePoly),a=[-129,b.z0+1.8],z=[-129,b.z1-1.8];
    assert.ok(travel(lv,a,z)&&travel(lv,z,a),`${lv.id} central promenade blocked`);
    const west=[-141,-220.5],east=[b.x1-1.1,-220.5];
    assert.ok(travel(lv,west,east)&&travel(lv,east,west),`${lv.id} public cross-axis blocked`);
  }
});

// A free doorway alone is insufficient: every tenant, protected stair, public
// bathroom and lift waiting point must connect to the same furnished hall.
function reachableHall(lv){
  const b=polyBounds(lv.outline),spacing=.5,nx=Math.ceil((b.x1-b.x0)/spacing),nz=Math.ceil((b.z1-b.z0)/spacing),nodes=new Map();
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
    const p=[b.x0+x*spacing,b.z0+z*spacing];
    if(clear(nav,at(lv,...p)))nodes.set(z*(nx+1)+x,{x,z,p});
  }
  const center=[(b.x0+b.x1)/2,(b.z0+b.z1)/2],seed=[...nodes.entries()].sort((a,b)=>Math.hypot(a[1].p[0]-center[0],a[1].p[1]-center[1])-Math.hypot(b[1].p[0]-center[0],b[1].p[1]-center[1]))[0];
  assert.ok(seed,lv.id);const seen=new Set([seed[0]]),q=[seed[0]];
  for(let n=0;n<q.length;n++){
    const c=nodes.get(q[n]);
    for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(c.x+dx<0||c.x+dx>nx||c.z+dz<0||c.z+dz>nz)continue;
      const id=(c.z+dz)*(nx+1)+c.x+dx,p=nodes.get(id);if(!p||seen.has(id))continue;
      if(!clear(nav,at(lv,(c.p[0]+p.p[0])/2,(c.p[1]+p.p[1])/2)))continue;
      seen.add(id);q.push(id);
    }
  }
  return p=>[...seen].map(id=>nodes.get(id).p).filter(v=>Math.hypot(v[0]-p[0],v[1]-p[1])<1.2).some(v=>travel(lv,v,p));
}

test('all public room doors, shops and lift stops still connect to one hall after furnishing',()=>{
  for(const lv of levels){
    const reachable=reachableHall(lv),targets=[];
    for(const u of lv.units)for(const f of u.wfronts)targets.push([u.id,[(f.x0+f.x1)/2+f.nx*1.1,(f.z0+f.z1)/2+f.nz*1.1]]);
    for(const r of lv.rooms)for(const d of r.wdoors||[])targets.push([r.id,[(d.x0+d.x1)/2+d.nx,(d.z0+d.z1)/2+d.nz]]);
    for(const e of nav.links.filter(l=>l.kind==='lift'&&l.elevator?.building===lv.building))for(const stop of e.stops.filter(s=>s.floor===lv.id))targets.push([e.id,[stop.x,stop.z]]);
    for(const [name,p]of targets){assert.ok(clear(nav,at(lv,...p)),`${lv.id}/${name} approach obstructed`);assert.ok(reachable(p),`${lv.id}/${name} isolated from public hall`);}
  }
});
