import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobility, tickMobility, jump, movementPose, MOBILITY } from '../src/fps/mobility.js';
import { buildPlayableLayout } from '../src/layout/playable.js';
import { buildNav, step } from '../src/layout/nav.js';

test('a jump has ascent, gravity, landing and cannot be double jumped',()=>{
  const m=createMobility();assert.ok(jump(m));assert.equal(jump(m),false);
  let peak=0,landings=0;
  for(let i=0;i<60;i++){const result=tickMobility(m,1/60);peak=Math.max(peak,m.height);landings+=Number(result.landed);}
  assert.ok(peak>.7&&peak<.9);assert.equal(m.height,0);assert.equal(m.velocity,0);assert.equal(landings,1);assert.ok(jump(m));
});
test('jump obeys low headroom, pause-sized timesteps and blocked starts',()=>{
  const m=createMobility();assert.equal(jump(m,{blocked:true}),false);assert.equal(jump(m,{ceiling:.15}),false);
  assert.ok(jump(m,{ceiling:.3}));
  for(let i=0;i<40;i++){tickMobility(m,1/60,{ceiling:.3});assert.ok(m.height<=.3);}
  assert.equal(m.height,0);
});
test('sprint visibly accelerates, exhausts and recovers without rapid oscillation',()=>{
  const m=createMobility();let result=tickMobility(m,.1,{moving:true,sprint:true});
  assert.equal(result.speed,MOBILITY.sprint);assert.equal(m.sprinting,true);
  for(let i=0;i<50;i++)result=tickMobility(m,.1,{moving:true,sprint:true});
  assert.ok(m.exhausted);assert.equal(result.speed,MOBILITY.walk);
  for(let i=0;i<20;i++)tickMobility(m,.1,{moving:false,sprint:true});
  assert.equal(m.exhausted,false);assert.ok(m.stamina>28);
  assert.equal(tickMobility(m,.1,{moving:true,sprint:true,aiming:true}).speed,MOBILITY.aim);
  assert.equal(tickMobility(m,.1,{moving:true,sprint:true,firing:true}).speed,MOBILITY.walk);
});
test('sprint adds a canted held weapon and larger arm stride, then settles at rest',()=>{
  const idle=movementPose(1,{moving:0}),walk=movementPose(1,{moving:1}),run=movementPose(1,{moving:1,sprint:1});
  assert.ok(Object.values(idle).every(v=>Math.abs(v)<1e-9));
  assert.ok(Math.abs(run.rz)>.45);assert.ok(Math.abs(run.rz)>Math.abs(walk.rz)*20);
  assert.ok(run.z>.06);assert.ok(Math.abs(run.x-movementPose(1.1,{moving:1,sprint:1}).x)>.015);
});
test('airborne movement still cannot cross a tactical cover wall',()=>{
  const layout=buildPlayableLayout({mode:'fps'}),nav=buildNav(layout),cover=layout.mission.cover[0],m=createMobility();
  let player={floor:cover.floor,x:cover.x-2.5,z:cover.z,y:cover.y,slope:null};assert.ok(jump(m));
  for(let i=0;i<60;i++){tickMobility(m,1/60);player=step(nav,player,.14,0,1/60);}
  assert.ok(player.x<cover.x-cover.w/2);assert.equal(player.floor,cover.floor);
});
