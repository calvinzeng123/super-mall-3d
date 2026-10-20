import test from 'node:test';
import assert from 'node:assert/strict';
import { inVisionCone, perceiveEnemy, damageEnemy, enemyShotChance, ENEMY_TYPES } from '../src/fps/enemy-tactics.js';
import { createExtractionVehicle } from '../src/fps/extraction-vehicles.js';
import { FPS_MISSION } from '../src/fps/mission-layout.js';
const enemy=type=>({type,floor:'P1-1F',x:0,z:0,y:0,yaw:0,alert:0,health:ENEMY_TYPES[type].health,ammo:10,reload:0});

test('enemy vision has a forward cone, range and strict floor boundary',()=>{
  const e=enemy('scout');
  assert.ok(inVisionCone(e,{floor:e.floor,x:0,z:14}));
  assert.equal(inVisionCone(e,{floor:e.floor,x:0,z:-14}),false);
  assert.equal(inVisionCone(e,{floor:'H-2F',x:0,z:14}),false);
  assert.equal(inVisionCone(e,{floor:e.floor,x:0,z:50}),false);
});
test('a gunshot behind a wall triggers investigation but never authorizes a shot',()=>{
  const e=enemy('assault'),p={floor:e.floor,x:0,z:20,y:0},noise={...p,until:4,radius:45};
  const target=perceiveEnemy(e,{player:p,ally:null,noise,elapsed:1,visible:()=>false});
  assert.equal(target,null);assert.equal(e.seesPlayer,false);assert.equal(e.state,'investigate');assert.equal(e.lastKnown.z,20);
  assert.ok(e.alert>0);
});
test('armored enemies absorb torso damage while precision hits bypass plate armor',()=>{
  const body=enemy('heavy'),head=enemy('heavy');
  damageEnemy(body,50);damageEnemy(head,50,true);
  assert.ok(body.health>head.health);assert.equal(head.health,95);
  assert.ok(ENEMY_TYPES.assault.speed>ENEMY_TYPES.heavy.speed);
  assert.ok(ENEMY_TYPES.heavy.reload>ENEMY_TYPES.scout.reload);
});
test('moving, crouching and distance reduce enemy hit chance',()=>{
  const e=enemy('assault'),near={...e,z:8},far={...e,z:32};
  assert.ok(enemyShotChance(e,near)>enemyShotChance(e,far));
  assert.ok(enemyShotChance(e,near,{moving:true,crouching:true})<enemyShotChance(e,near));
});
test('both rescue vehicles are visible models and helicopter departure gains real altitude',()=>{
  for(const exit of FPS_MISSION.extractions){
    const model=createExtractionVehicle(exit);let vertices=0;model.root.traverse(o=>{if(o.isMesh)vertices+=o.geometry.attributes.position.count;});
    assert.ok(vertices>2400,'merged body must retain cockpit, running gear and rescue vehicle details');
    const start=model.departureView(0),end=model.departureView(4);
    model.update(.1,{ready:true,departing:true,time:4});
    if(exit.vehicle.kind==='helicopter'){assert.ok(end.position.y-start.position.y>10);assert.ok(model.root.position.y>exit.y+10);}
    else assert.ok(end.position.z-start.position.z>4);
    model.reset();assert.equal(model.root.position.y,exit.y);model.dispose();
  }
});
