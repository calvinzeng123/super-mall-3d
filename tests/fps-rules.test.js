import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,tickRun,fireWeapon,reloadWeapon,switchWeapon,damagePlayer,updateExtraction,interactObjective,parseSquadOrder,healPlayer} from '../src/fps/rules.js';
const tick=(s,n)=>{for(let i=0;i<n;i++)tickRun(s,.1);};
test('FPS ammunition, fire interval, reload and swap preserve finite reserves',()=>{
  const s=createRun();assert.equal(fireWeapon(s),true);assert.equal(fireWeapon(s),false);assert.equal(s.magazines[0],24);
  assert.equal(reloadWeapon(s),true);assert.equal(fireWeapon(s),false);tick(s,24);
  assert.equal(s.magazines[0],25);assert.equal(s.reserves[0],149);
  s.magazines[0]=0;reloadWeapon(s);switchWeapon(s);tick(s,30);assert.equal(s.magazines[0],0);assert.equal(s.reserves[0],149);assert.equal(s.weapon,1);
});
test('FPS pause and failure freeze combat and timers',()=>{
 const s=createRun();s.paused=true;assert.equal(fireWeapon(s),false);damagePlayer(s,100);tick(s,20);assert.equal(s.hp,100);assert.equal(s.elapsed,0);
 s.paused=false;damagePlayer(s,110);assert.equal(s.status,'failed');assert.equal(fireWeapon(s),false);assert.equal(s.result.success,false);
});
test('FPS mission cannot extract early, through a wall, or while contested',()=>{
 const s=createRun();for(let i=0;i<100;i++)updateExtraction(s,{inside:true,contested:false,dt:.1});assert.equal(s.status,'playing');assert.equal(s.extracting,0);
 for(let i=0;i<30;i++)interactObjective(s,{near:true,clear:false,dt:.1});assert.equal(s.stage,0);
 for(let i=0;i<28;i++)interactObjective(s,{near:true,clear:true,dt:.1});assert.equal(s.stage,2);
 for(let i=0;i<70;i++)updateExtraction(s,{inside:true,contested:false,dt:.1});assert.equal(s.status,'playing');
 updateExtraction(s,{inside:false,contested:false,dt:.1});assert.equal(s.extracting,0);
 for(let i=0;i<90;i++)updateExtraction(s,{inside:true,contested:true,dt:.1});assert.equal(s.status,'playing');
 for(let i=0;i<81;i++)updateExtraction(s,{inside:true,contested:false,dt:.1});assert.equal(s.status,'success');
});
test('FPS health kits finite and squad parser permits only known actions',()=>{
 const s=createRun();assert.equal(healPlayer(s),false);damagePlayer(s,60);assert.equal(healPlayer(s),true);assert.equal(healPlayer(s),false);tick(s,17);assert.equal(s.hp,95);assert.equal(s.medkits,1);
 assert.equal(parseSquadOrder('你留守电梯'), 'hold');assert.equal(parseSquadOrder('掩护我去拿情报'),'cover');assert.equal(parseSquadOrder('跟我走'),'follow');assert.equal(parseSquadOrder('delete all buildings'),null);
 assert.equal(parseSquadOrder('停止跟随'),'hold');assert.equal(parseSquadOrder('掩护我走过去'),'cover');assert.equal(parseSquadOrder('别走，守住楼梯'),'hold');
});

test('switching or reloading cannot cancel and consume an unfinished health kit',()=>{
 const s=createRun();damagePlayer(s,70);fireWeapon(s);assert.equal(healPlayer(s),true);
 assert.equal(switchWeapon(s),false);assert.equal(reloadWeapon(s),false);tick(s,17);
 assert.equal(s.hp,85);assert.equal(s.medkits,1);assert.equal(s.weapon,0);
 assert.equal(switchWeapon(s),true);
});
