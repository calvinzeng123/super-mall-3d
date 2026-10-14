import * as THREE from 'three';
import { subtractRect } from '../../layout/urban.js';
import { rectPoly } from '../../layout/geom.js';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { addTrees, streetLamp, bench, zebra } from './props.js';

export function buildUrbanDistrict(ctx) {
  const U=ctx.layout.site.urban;if(!U)return;
  const G=ctx.site.group,B=ctx.site.batch,ext=B.get('ext');
  function surface(r,key,y) {
    const m=new THREE.Mesh(flatShapeGeometry(shapeFromPoly(rectPoly(r)),y),ctx.mats.floor(key,.9));m.receiveShadow=true;G.add(m);
  }
  for(const r of U.surfaces)surface(r,'asphalt',-.12);
  // Adjacent strips can overlap at corners, so deduplicate their paving too.
  const paved=ctx.layout.site.sidewalks.map(s=>s.rect);
  for(const walk of U.sidewalks) { let pieces=[walk.rect];for(const r of paved)pieces=pieces.flatMap(p=>subtractRect(p,r));for(const p of pieces)surface(p,'paving',-.135);paved.push(walk.rect); }
  const all=ctx.layout.site.roads;
  for(const road of U.roads) {
    const r=road.rect,hor=road.dir==='x',c=hor?(r.z0+r.z1)/2:(r.x0+r.x1)/2;
    const from=hor?r.x0:r.z0,to=hor?r.x1:r.z1;
    const crossing=t=>all.some(q=>q.dir!==road.dir && (hor?t>q.rect.x0-3&&t<q.rect.x1+3&&c>=q.rect.z0&&c<=q.rect.z1:t>q.rect.z0-3&&t<q.rect.z1+3&&c>=q.rect.x0&&c<=q.rect.x1));
    for(let t=from+3;t<to-3;t+=8) {
      if(crossing(t)||crossing(t+3))continue;
      for(const off of [-.18,.18])ext.box(hor?t:c+off,-.096,hor?c+off:t,hor?3:.13,.018,hor?.13:3,'#deb554');
      if(road.width>=20)for(const off of [-road.width/4,road.width/4])ext.box(hor?t:c+off,-.095,hor?c+off:t,hor?3:.12,.018,hor?.12:3,'#e8e5db');
    }
  }
  for(const {x,z,wx,wz} of U.intersections) {
    for(const sign of [-1,1]) {zebra(B,x+sign*(wx/2+4),z,wz-2,3,'x',-.085);zebra(B,x,z+sign*(wz/2+4),wx-2,3,'z',-.085);}
  }
  for(const b of U.blocks) {
    const r=b.rect,cx=(r.x0+r.x1)/2,cz=(r.z0+r.z1)/2,w=r.x1-r.x0,d=r.z1-r.z0;
    surface(r,'paving',-.15);
    ext.box(cx,-.10,cz,w-12,.10,d-12,b.kind==='sport'?'#a4ad83':'#7f9871');
    // Walkable garden cross connects both sides of each block.
    ext.box(cx,-.025,cz,Math.min(5,w),.035,d,'#d0c8b6');
    if(w>40)ext.box(cx,-.024,cz,w,.035,5,'#d0c8b6');
    for(const z of [r.z0,r.z1])ext.box(cx,-.05,z,w,.18,.25,'#c7c5bc');
    for(const x of [r.x0,r.x1])ext.box(x,-.05,cz,.25,.18,d,'#c7c5bc');
    if(w>60&&d>65) {
      for(const x of [cx-9,cx+9])for(const z of [cz-6,cz+6])bench(B,x,.02,z);
      if(b.kind==='sport') {
        const x=cx-27,z=cz;
        ext.box(x,0,z,28,.06,16,'#5a8784');
        for(const dz of [-7.4,7.4])ext.box(x,.04,z+dz,27,.02,.13,'#efe8d6');
        for(const dx of [-13.4,0,13.4])ext.box(x+dx,.04,z,.13,.02,15,'#efe8d6');
        for(const dx of [-12,12]) {ext.box(x+dx,1.6,z,.16,3.2,.16,'#dce1de');ext.box(x+dx,3,z, .12,.85,1.4,'#e7e5dc');}
      } else if(b.kind==='park') {
        ext.box(cx-14,.18,cz-13,16,.36,12,'#bdb6a4');ext.box(cx-14,.37,cz-13,15,.10,11,'#80a461');
      }
    }
  }
  // Ground-level plinths and entrance aprons tie the context buildings to their parcels.
  for(const b of U.buildings) {
    ext.box(b.x,.16,b.z,b.w+3,.32,b.d+3,'#b5b2a7');
    ext.box(b.x,1.8,b.z+b.d/2+.2,5,3.2,.25,'#435d65');
    ext.box(b.x,3.5,b.z+b.d/2+1.6,7,.2,3.2,'#d0c4a8');
    ext.box(b.x,b.h+.4,b.z,Math.max(4,b.w*.35),.9,Math.max(3,b.d*.22),'#7e8c90');
  }
  for(const l of U.lamps)streetLamp(B,l.x,l.z,0,[0,1],7);
  addTrees(G,ctx.mats,U.trees,103);
}
