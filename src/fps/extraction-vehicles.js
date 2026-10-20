import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored lightweight rescue vehicles; static body parts are merged by
// material. Licensed weapon/arm assets remain independent and unmodified.
export function createExtractionVehicle(exit) {
  const root = new THREE.Group(), body = new THREE.Group(), staticParts = new THREE.Group();
  root.name = `接应-${exit.vehicle.kind}`; root.add(body); body.add(staticParts);
  const v = exit.vehicle, helicopter = v.kind === 'helicopter';
  root.position.set(v.x, exit.y, v.z); body.rotation.y = v.yaw || 0;
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#354b4c', metalness: .7, roughness: .42 }),
    new THREE.MeshStandardMaterial({ color: '#131b20', metalness: .35, roughness: .67 }),
    new THREE.MeshStandardMaterial({ color: '#456a79', metalness: .65, roughness: .14 }),
    new THREE.MeshStandardMaterial({ color: '#b7c1ba', metalness: .78, roughness: .35 }),
    new THREE.MeshStandardMaterial({ color: '#131616', roughness: .92 }),
    new THREE.MeshBasicMaterial({ color: '#e8f9dc' }),
    new THREE.MeshBasicMaterial({ color: '#67d9be' }),
    new THREE.MeshBasicMaterial({ color: '#dc795c' }),
  ];
  const [paint,dark,glass,steel,rubber,lamp,green,red] = materials;
  const geometries = new Set(), wheels = [], doors = [], rotor = new THREE.Group(), tailRotor = new THREE.Group(), signals = [];
  const mesh = (geometry, material, x, y, z, parent = staticParts) => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, material); object.position.set(x,y,z); parent.add(object); return object;
  };
  const box = (w,h,d,x,y,z,material=paint,parent=staticParts) => mesh(new THREE.BoxGeometry(w,h,d),material,x,y,z,parent);
  const sphere = (sx,sy,sz,x,y,z,material=paint,parent=staticParts) => {
    const object=mesh(new THREE.SphereGeometry(1,16,10),material,x,y,z,parent);object.scale.set(sx,sy,sz);return object;
  };
  const bar = (a,b,radius,material=steel,parent=staticParts) => {
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
    const object=mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),8),material,...from.clone().add(to).multiplyScalar(.5).toArray(),parent);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return object;
  };
  if (helicopter) {
    sphere(1.05,.82,2.35,0,1.53,0);
    sphere(.94,.68,1.3,0,1.62,1.35,glass);
    // Window frame, pilot panes, side sliding door, cargo hatch and fasteners.
    for(const x of [-.54,.54])bar([x,1.15,2.13],[x,2.03,1.83],.035,dark);
    bar([0,1.0,2.35],[0,2.25,1.83],.035,dark);
    for(const side of [-1,1]){
      box(.045,.58,1.08,side*.96,1.79,-.1,glass);
      for(const z of [-.68,.48])box(.055,1.1,.05,side*1.01,1.52,z,steel);
      for(const y of [1.06,2.08])box(.055,.05,1.2,side*1.01,y,-.1,steel);
      box(.06,.06,.3,side*1.07,1.34,.3,steel);
      bar([side*.8,.35,-1.5],[side*.8,.35,1.55],.075,dark);
      bar([side*.8,.35,1.55],[side*.8,.55,1.88],.075,dark);
      for(const z of [-.95,.95])bar([side*.8,.35,z],[side*.65,1.05,z],.065,steel);
    }
    const tail=mesh(new THREE.CylinderGeometry(.18,.45,4.4,12),paint,0,1.55,-3.55);
    tail.rotation.x=-Math.PI/2;
    box(1.8,.06,.7,0,1.6,-4.8,steel);
    const fin=box(.09,1.9,.8,0,2.15,-5.4,paint);fin.rotation.x=.12;
    sphere(.65,.3,1.05,0,2.32,-.55,dark);
    bar([0,2.3,-.15],[0,3.15,-.15],.09);
    rotor.position.set(0,3.12,-.15);body.add(rotor);
    for(const a of [0,Math.PI/2]){const blade=box(10.6,.055,.23,0,0,0,dark,rotor);blade.rotation.y=a;}
    sphere(.23,.1,.23,0,0,0,steel,rotor);
    tailRotor.position.set(.17,2.1,-5.4);body.add(tailRotor);
    box(.05,1.65,.13,0,0,0,dark,tailRotor);box(.05,.13,1.65,0,0,0,dark,tailRotor);
    signals.push(sphere(.09,.09,.09,-1.04,1.7,.5,red),sphere(.09,.09,.09,1.04,1.7,.5,green));
    const light=sphere(.13,.08,.13,0,.86,1.8,lamp);
    light.userData.landingLight=true;
  } else {
    box(2.12,.58,5.3,0,.87,0,paint);
    const hood=box(2.03,.33,1.4,0,1.3,1.83,paint);hood.rotation.x=-.09;
    box(1.93,1.05,2.9,0,1.48,-.25,paint);
    const windshield=box(1.8,.63,.04,0,1.72,1.16,glass);windshield.rotation.x=-.21;
    box(1.75,.6,.04,0,1.7,-1.73,glass);
    box(2.08,.08,3.2,0,2.07,-.28,dark);
    for(const side of [-1,1]){
      for(const z of [.45,-.75])box(.04,.57,.96,side*.98,1.72,z,glass);
      for(const z of [1.03,-.1,-1.32])box(.06,.9,.07,side*1.01,1.6,z,steel);
      for(const z of [.55,-.78])box(.045,.045,.26,side*1.08,1.32,z,steel);
      box(.25,.16,.34,side*1.17,1.65,1.01,dark);
      bar([side*1.15,.57,-1.7],[side*1.15,.57,1.35],.08,dark);
      for(const z of [-1.74,1.72]){
        const wheel=new THREE.Group();wheel.position.set(side*1.04,.54,z);body.add(wheel);wheels.push(wheel);
        const tire=mesh(new THREE.TorusGeometry(.41,.12,8,18),rubber,0,0,0,wheel);tire.rotation.y=Math.PI/2;
        const hub=mesh(new THREE.CylinderGeometry(.28,.28,.12,12),steel,0,0,0,wheel);hub.rotation.z=Math.PI/2;
        for(let k=0;k<5;k++){const spoke=box(.13,.045,.46,0,0,0,dark,wheel);spoke.rotation.x=k*Math.PI/5;}
      }
    }
    box(2.24,.22,.28,0,.67,2.63,dark);box(2.2,.22,.25,0,.66,-2.65,dark);
    for(const side of [-1,1]){
      box(.59,.18,.04,side*.66,1.03,2.68,lamp);
      box(.22,.37,.05,side*.85,1.18,-2.68,red);
      signals.push(box(.35,.09,.18,side*.35,2.18,-.1,side===1?green:red));
    }
    for(let y=.9;y<1.26;y+=.08)box(.65,.035,.05,0,y,2.69,steel);
    box(.7,.16,.04,0,.73,2.8,dark);
    const hatch=new THREE.Group();hatch.position.set(1.02,1.3,.95);body.add(hatch);doors.push(hatch);
    box(.065,.85,1.05,0,0,-.5,paint,hatch);box(.07,.48,.9,0,.67,-.5,glass,hatch);
    for(const z of [-1.6,1.0])bar([-.84,2.18,z],[.84,2.18,z],.035,steel);
  }
  // One draw per opaque body material, with only moving wheels/rotors separate.
  staticParts.updateMatrixWorld(true);
  for(const material of materials){
    const members=staticParts.children.filter(m=>m.material===material),parts=[];
    for(const m of members){const geo=m.geometry.clone();geo.applyMatrix4(m.matrix);parts.push(geo);}
    if(parts.length){
      const combined=mergeGeometries(parts,false);geometries.add(combined);
      const merged=new THREE.Mesh(combined,material);body.add(merged);
      parts.forEach(g=>g.dispose());members.forEach(m=>m.removeFromParent());
    }
  }
  staticParts.removeFromParent();
  let elapsed=0;
  const progressAt = time => Math.max(0,Math.min(1,(time-.75)/3.3));
  const offsetAt = time => {
    const t=progressAt(time),smooth=t*t*(3-2*t);
    // Ground getaway stays in the reserved bay until the closing cinematic;
    // aircraft climb above the roof before any lateral motion.
    return helicopter?{x:smooth*6,y:smooth*11,z:0}:{x:0,y:0,z:smooth*5};
  };
  return {root,kind:v.kind,
    update(dt,{ready=false,progress=0,departing=false,time=0}={}){
      elapsed+=dt;
      rotor.rotation.y+=dt*(ready?39:9);tailRotor.rotation.x+=dt*(ready?53:13);
      const offset=departing?offsetAt(time):{x:0,y:0,z:0};
      root.position.set(v.x+offset.x,exit.y+offset.y,v.z+offset.z);
      body.rotation.z=helicopter&&departing?Math.sin(progressAt(time)*Math.PI)*-.045:0;
      wheels.forEach(w=>w.rotation.x=departing?-time*4:0);
      doors.forEach(d=>d.rotation.y=departing?-Math.max(0,1-time/.7)*.75:progress>0?-.75:0);
      green.color.setHex(Math.sin(elapsed*7)>0?0x77e7c1:0x2b6d57);
    },
    departureView(time){
      const offset=offsetAt(time),base=new THREE.Vector3(v.x+offset.x,exit.y+offset.y,v.z+offset.z);
      // Seat at the open side cabin, looking through the forward cockpit.
      const seat=new THREE.Vector3(helicopter?.4:.43,helicopter?1.68:1.72,helicopter?1.1:.65).applyAxisAngle(new THREE.Vector3(0,1,0),v.yaw||0).add(base);
      const look=new THREE.Vector3(0,helicopter?1.65:1.6,16).applyAxisAngle(new THREE.Vector3(0,1,0),v.yaw||0).add(base);
      return {position:seat,lookAt:look};
    },
    reset(){elapsed=0;root.position.set(v.x,exit.y,v.z);doors.forEach(d=>d.rotation.y=0);body.rotation.z=0;},
    dispose(){root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();},
  };
}
