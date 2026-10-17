import { mallStairPlan } from '../../layout/mall-stairs.js';
import { buildMallFlightGeometry } from './mall-stairs.js';

const STEEL='#617568';
function rail(B,a,b,y) {
  B.get('extMetal').bar({x:a[0],y:y+1.05,z:a[1]},{x:b[0],y:y+1.05,z:b[1]},.045,STEEL);
  const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.85));
  for(let i=0;i<=n;i++) {
    const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n;
    B.get('extMetal').bar({x,y:y+.07,z},{x,y:y+1.05,z},.025,STEEL);
  }
}

/** Transparent stairwell, genuine treads and thin full-width turn platforms. */
export function buildBridgeStairGeometry(B,br,T) {
  const stair=T.stair,p=mallStairPlan(stair),height=br.y+4.1;
  B.frame(T.frame,()=>{
    for(const w of T.stairLevels[0].rooms[0].navigationWalls) {
      const dx=w.x1-w.x0,dz=w.z1-w.z0,x=(w.x0+w.x1)/2,z=(w.z0+w.z1)/2;
      B.get('glass').box(x,height/2,z,Math.abs(dx)||.04,height,Math.abs(dz)||.04,0xffffff);
      B.get('extMetal').box(x,.05,z,Math.abs(dx)||.07,.1,Math.abs(dz)||.07,STEEL);
    }
    const d=stair.door,x=(d.x0+d.x1)/2,z=(d.z0+d.z1)/2;
    for(const [bottom,top] of [[2.3,br.y],[br.y+2.3,height]]) {
      B.get('glass').box(x,(bottom+top)/2,z,.04,top-bottom,d.z1-d.z0,0xffffff);
      B.get('extMetal').box(x,bottom,z,.06,.06,d.z1-d.z0,STEEL);
    }
    for(const lv of T.stairLevels) {
      rail(B,p.point(p.centers[0]+p.width/2,p.start+.03),p.point(p.centers[1]-p.width/2,p.start+.03),lv.elev);
      B.get('glowSoft').box(x-.06,lv.elev+2.55,z,.06,.2,.8,'#70b58b');
    }
    for(const surface of br.access.surfaces.filter(s=>s.stair===stair.id)) {
      const r=surface.rect;
      B.get('concrete').box((r.x0+r.x1)/2,surface.elev-.075,(r.z0+r.z1)/2,r.x1-r.x0,.15,r.z1-r.z0,'#cdd1c5');
      const v=surface.rear?Math.min(...[[r.x0,r.z0],[r.x1,r.z1]].map(q=>p.local(...q)[1])):p.start+.03;
      rail(B,p.point(p.centers[0]+p.width/2,v),p.point(p.centers[1]-p.width/2,v),surface.elev);
    }
    for(const f of br.access.flights.filter(f=>f.stair===stair.id))buildMallFlightGeometry(B,f);
  });
}
