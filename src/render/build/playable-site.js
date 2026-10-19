// A bounded, textured outdoor surface for the P1 / hotel / apartment release.
// No peripheral city, unopened phases, crowds or distant context allocations.
import * as THREE from 'three';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { rectPoly, pointInPoly } from '../../layout/geom.js';
import { streetLamp, bench, planter } from './props.js';

export function buildPlayableSite(ctx, holes) {
  const { layout, mats } = ctx, r = layout.site.bounds;
  const G = ctx.site.group, B = ctx.site.batch;
  const ground = new THREE.Mesh(flatShapeGeometry(shapeFromPoly(rectPoly(r), holes), -.16), mats.floor('paving', .85));
  ground.name = '一期酒店公寓地块'; ground.receiveShadow = true; G.add(ground);
  const safe = (x,z) => !holes.some(p => pointInPoly([x,z],p));
  // Ground roads are already represented by the shared hospitality paths.
  // A short peripheral access lane finishes the cropped map boundary.
  for (const x of [r.x0+4,r.x1-4]) {
    if (![r.z0+4,(r.z0+r.z1)/2,r.z1-4].every(z=>safe(x,z))) continue;
    const geo = new THREE.PlaneGeometry(7, r.z1-r.z0-2).rotateX(-Math.PI/2);
    const m = new THREE.Mesh(geo, mats.floor('asphalt', .9)); m.position.set(x,-.1,(r.z0+r.z1)/2); G.add(m);
    for (let z=r.z0+10;z<r.z1-6;z+=12) B.get('ext').box(x,-.065,z,.14,.015,4,'#ded8b7');
  }
  for (const en of layout.entrances.filter(e=>e.to==='site')) {
    const x=(en.seg.x0+en.seg.x1)/2, z=(en.seg.z0+en.seg.z1)/2;
    for(const side of [-1,1]) {
      const px=x+en.nx*7-en.nz*side*6,pz=z+en.nz*7+en.nx*side*6;
      if(!safe(px,pz)) continue;
      streetLamp(B,px,pz,0);
      if(safe(px+1.6,pz)) bench(B,px+1.6,0,pz);
    }
  }
  for(let x=r.x0+10;x<r.x1-4;x+=28) for(const z of [r.z0+4,r.z1-4]) {
    if(safe(x,z)&&safe(x+3,z)&&safe(x,z+2)) planter(B,x,z,x+3,z+1.5);
  }
}
