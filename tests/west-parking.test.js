import test from 'node:test';
import assert from 'node:assert/strict';
import { L } from './helpers.js';
import { convexOverlap, rectPoly, lrectPoly, pointInPoly } from '../src/layout/geom.js';
import { buildNav, clear, step } from '../src/layout/nav.js';

const P=L.site.westParking,nav=buildNav(L);
function follow(points,floor='ground') {
  let s={floor,x:points[0][0],z:points[0][1],y:0,slope:null};assert.ok(clear(nav,s),`起点不可站立 ${JSON.stringify(s)}`);
  for(const p of points.slice(1)) {
    const dx=p[0]-s.x,dz=p[1]-s.z,n=Math.ceil(Math.hypot(dx,dz)/.15);
    for(let i=0;i<n;i++)s=step(nav,s,dx/n,dz/n,0);
    assert.ok(Math.hypot(s.x-p[0],s.z-p[1])<.04,`停在${s.x},${s.z}，目标${p}`);
  }
  return s;
}
test('西侧停车是真实732位三列车场，充电/无障碍位与原酒店46位并存',()=>{
  assert.equal(P.stallCount,732);assert.equal(P.lots.length,26);assert.equal(P.evCount,68);assert.equal(P.accessibleCount,10);
  assert.equal(L.extensions.surfaceParking.reduce((n,l)=>n+l.stalls.length,0),778);
  assert.equal(P.gates.length,3);
  const solids=[...L.site.openings,...L.site.trenches,...L.buildings.filter(b=>!b.undergroundOnly).map(b=>b.outline)];
  for(const lot of P.lots)for(const stall of lot.stalls) {
    assert.ok(stall.poly.every(p=>pointInPoly(p,P.poly)));
    for(const p of [...solids,...P.walks.flatMap(w=>w.polys),...P.roads.flatMap(r=>r.polys)])assert.ok(!convexOverlap(stall.poly,p,.025),`${lot.id}车位压占动线/建筑`);
  }
});
test('全部停车组两端连接循环车道，三地面进出口与WPG坡口可双向到达',()=>{
  for(const lot of P.lots){const z=(lot.aisle.z0+lot.aisle.z1)/2,west=lot.id.startsWith('WP-C')?-349:-480,east=lot.id.startsWith('WP-C')?-309:-375;
    for(const pts of [[[west,z],[east,z]],[[east,z],[west,z]]])follow(pts);
  }
  for(const z of P.gates.map(g=>g.z))for(const pts of [[[-480,z],[-285,z]],[[-285,z],[-480,z]]])follow(pts);
  for(const x of [-363,-355])for(const pts of [[[-375,-130],[x,-130],[x,-143]],[[x,-143],[x,-130],[-375,-130]]])follow(pts);
  const halls=L.buildings.find(b=>b.id==='WPG');
  for(const p of P.roads.flatMap(r=>r.polys))for(const r of halls.accessKiosks)assert.ok(!convexOverlap(p,lrectPoly(halls.frame,r)),'车道不能穿附库小厅');
});
test('停车步行脊接一期西门、附库小厅及酒店门外，种植岛不挡车位和通道',()=>{
  for(const path of P.walks)for(const reverse of [false,true]){const points=path.points.map(p=>[p[0],p[2]]);if(reverse)points.reverse();follow(points);}
  for(const reverse of [false,true]){const pts=[[-303,-200],[-278,-200]];if(reverse)pts.reverse();assert.equal(follow(pts,reverse?'P1-1F':'ground').floor,reverse?'ground':'P1-1F');}
  for(const island of P.islands)for(const p of [...P.roads.flatMap(r=>r.polys),...P.walks.flatMap(w=>w.polys),...P.lots.flatMap(l=>l.stalls.map(s=>s.poly)),...L.site.openings,...L.site.trenches])assert.ok(!convexOverlap(island.poly,p,.02),'种植岛占用动线');
  for(const x of [-332.5,-310.5])for(const reverse of [false,true]) {
    const pts=[[-427,-179],[x,-179],[x,-185.5]];if(reverse)pts.reverse();
    const out=follow(pts,reverse?'WPG-G':'ground');assert.equal(out.floor,reverse?'ground':'WPG-G');
  }
});
