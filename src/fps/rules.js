// Deterministic game rules. Rendering, touch input and optional language models
// may request actions, but never bypass ammunition, damage or mission gates.
export const WEAPONS = Object.freeze([
  Object.freeze({ id:'rifle', name:'SMG-45', magazine:25, reserve:150, damage:27, interval:.12, reload:2.35, range:85, spread:.016 }),
  Object.freeze({ id:'pistol', name:'Desert Eagle', magazine:7, reserve:42, damage:58, interval:.35, reload:1.8, range:70, spread:.012 }),
]);
export function createRun() {
  return { status:'playing', paused:false, hp:100, elapsed:0, weapon:0,
    magazines:WEAPONS.map(w=>w.magazine), reserves:WEAPONS.map(w=>w.reserve),
    cooldown:0, reload:0, reloadDuration:0, switchTime:0, switchDuration:.6,
    shots:0, hits:0, kills:0, stage:0, interaction:0, extracting:0,
    medkits:2, healTime:0, hurtAgo:99, command:'follow', teammateHP:100,
    message:'回声已就位。先到商场终端确认目标。', result:null };
}
export function tickRun(s, dt) {
  if(s.paused||s.status!=='playing')return;
  dt=Math.max(0,Math.min(.1,dt));s.elapsed+=dt;s.hurtAgo+=dt;
  s.cooldown=Math.max(0,s.cooldown-dt);s.switchTime=Math.max(0,s.switchTime-dt);
  if(s.reload>0){s.reload=Math.max(0,s.reload-dt);if(!s.reload){
    const i=s.weapon,w=WEAPONS[i],n=Math.min(w.magazine-s.magazines[i],s.reserves[i]);
    s.magazines[i]+=n;s.reserves[i]-=n;
  }}
  if(s.healTime>0){s.healTime=Math.max(0,s.healTime-dt);if(!s.healTime)s.hp=Math.min(100,s.hp+55);}
}
export function fireWeapon(s) {
  const w=WEAPONS[s.weapon];
  if(s.status!=='playing'||s.paused||s.cooldown>0||s.reload>0||s.switchTime>0||s.healTime>0||!s.magazines[s.weapon])return false;
  s.magazines[s.weapon]--;s.shots++;s.cooldown=w.interval;return true;
}
export function reloadWeapon(s) {
  const w=WEAPONS[s.weapon];
  if(s.status!=='playing'||s.paused||s.reload||s.switchTime||s.healTime||s.magazines[s.weapon]>=w.magazine||!s.reserves[s.weapon])return false;
  s.reload=s.reloadDuration=w.reload;return true;
}
export function switchWeapon(s) {
  if(s.status!=='playing'||s.paused||s.switchTime||s.healTime)return false;
  s.reload=0;s.reloadDuration=0;s.healTime=0;s.weapon=(s.weapon+1)%WEAPONS.length;s.switchTime=s.switchDuration;return true;
}
export function healPlayer(s) {
  if(s.status!=='playing'||s.paused||s.hp>=100||!s.medkits||s.healTime||s.reload||s.switchTime)return false;
  s.medkits--;s.healTime=1.6;return true;
}
export function damagePlayer(s,amount) {
  if(s.status!=='playing'||s.paused)return false;
  s.hp=Math.max(0,s.hp-Math.max(0,amount));s.hurtAgo=0;
  if(!s.hp)finishRun(s,false);
  return true;
}
export function interactObjective(s,{near,clear,duration=1.4,dt}) {
  if(s.status!=='playing'||s.paused)return false;
  if(!near||!clear){s.interaction=0;return false;}
  s.interaction+=Math.min(.1,Math.max(0,dt));
  if(s.interaction<duration)return false;
  s.interaction=0;s.stage++;return true;
}
export function updateExtraction(s,{inside,contested,dt,duration=8}) {
  if(s.status!=='playing'||s.paused||s.stage<2)return false;
  if(!inside){s.extracting=0;return false;}
  if(contested){s.extracting=Math.max(0,s.extracting-dt*.5);return false;}
  s.extracting+=Math.max(0,Math.min(.1,dt));
  if(s.extracting>=duration){finishRun(s,true);return true;}return false;
}
export function finishRun(s,success) {
  if(s.status!=='playing')return s.result;
  s.status=success?'success':'failed';s.paused=true;
  return s.result={success,title:success?'行动完成':'行动中止',subtitle:success?'情报已带出，撤离成功。':'调整战术，再次进入封锁区。',
    kills:s.kills,shots:s.shots,accuracy:s.shots?Math.round(s.hits/s.shots*100):0,time:Math.round(s.elapsed),intel:Math.min(2,s.stage),teammate:s.teammateHP>0};
}
export function parseSquadOrder(text) {
  const t=String(text).trim().slice(0,160);
  if(/停止跟随|别走|不要走|别跟|不要跟|别动|守|停|等|hold|stop|wait/i.test(t))return 'hold';
  if(/掩护|支援|进攻|压制|cover|attack|support/i.test(t))return 'cover';
  if(/跟|集合|回来|走|follow|come|regroup/i.test(t))return 'follow';
  return null;
}
