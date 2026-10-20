// Deterministic game rules. Rendering, touch input and optional language models
// may request actions, but never bypass ammunition, damage or mission gates.
export const WEAPONS = Object.freeze([
  Object.freeze({ id:'rifle', name:'SMG-45', magazine:25, reserve:150, damage:27, interval:.12, reload:2.35, range:85, spread:.016 }),
  Object.freeze({ id:'pistol', name:'Desert Eagle', magazine:7, reserve:42, damage:58, interval:.35, reload:1.8, range:70, spread:.012 }),
]);

/** Difficulty presets scale hostile damage/accuracy and the extraction hold, and
 * decide the starting supplies. Keep ids stable: the launcher greeting screen
 * and the pause/result screens read them directly. */
export const DIFFICULTIES = Object.freeze({
  standard: Object.freeze({ id:'standard', label:'标准', enemyDamage:1, enemyAccuracy:1, extractionScale:1, medkits:2, grenades:2 }),
  veteran: Object.freeze({ id:'veteran', label:'老兵', enemyDamage:1.35, enemyAccuracy:1.18, extractionScale:1.2, medkits:1, grenades:1 }),
});

const FEED_LIMIT = 5, MAX_GRENADES = 4, MAX_MEDKITS = 4;
const ARMOR_ABSORB = .65, MELEE_COOLDOWN = .72, GRENADE_COOLDOWN = .9;
const KILL_POINTS = 100, HEADSHOT_POINTS = 50, MELEE_POINTS = 50, STEALTH_POINTS = 75;
const STREAK_STEP = .15, STREAK_CAP = .75;

export function createRun(options = {}) {
  const difficulty = DIFFICULTIES[options.difficulty] ? options.difficulty : 'standard';
  const preset = DIFFICULTIES[difficulty];
  return { status:'playing', paused:false, hp:100, elapsed:0, weapon:0,
    magazines:WEAPONS.map(w=>w.magazine), reserves:WEAPONS.map(w=>w.reserve),
    cooldown:0, reload:0, reloadDuration:0, switchTime:0, switchDuration:.6,
    shots:0, hits:0, kills:0, stage:0, interaction:0, extracting:0,
    extractionId:'extract-car', extractionTitle:'装甲接应车', fireMode:'auto',
    medkits:preset.medkits, healTime:0, hurtAgo:99, command:'follow', teammateHP:100,
    message:'回声已就位。先到商场终端确认目标。', result:null,
    difficulty, armor:0, maxArmor:100, grenades:preset.grenades, maxGrenades:MAX_GRENADES,
    maxMedkits:MAX_MEDKITS, meleeCooldown:0, grenadeCooldown:0,
    score:0, streak:0, bestStreak:0, multiplier:1, headshots:0,
    damageTaken:0, medkitsUsed:0, intelFound:0, intelTotal:5, bonusComplete:false,
    feed:[], feedSeq:0 };
}
// Sub-microsecond float residue must not keep an action locked for one extra
// frame after its cooldown budget is spent.
const cool=(v,dt)=>{const n=(v||0)-dt;return n>1e-6?n:0;};
export function tickRun(s, dt) {
  if(s.paused||s.status!=='playing')return;
  dt=Math.max(0,Math.min(.1,dt));s.elapsed+=dt;s.hurtAgo+=dt;
  s.cooldown=cool(s.cooldown,dt);s.switchTime=cool(s.switchTime,dt);
  s.meleeCooldown=cool(s.meleeCooldown,dt);s.grenadeCooldown=cool(s.grenadeCooldown,dt);
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
export function changeFireMode(s) {
  if(s.status!=='playing')return false;
  s.fireMode=s.fireMode==='auto'?'burst':'auto';return true;
}
export function healPlayer(s) {
  if(s.status!=='playing'||s.paused||s.hp>=100||!s.medkits||s.healTime||s.reload||s.switchTime)return false;
  s.medkits--;s.medkitsUsed=(s.medkitsUsed||0)+1;s.healTime=1.6;return true;
}

/** Armor eats 65% of every incoming hit until it is depleted; the rest reaches
 * health. Runs without armor therefore behave exactly like the old rules. */
export function damagePlayer(s,amount) {
  if(s.status!=='playing'||s.paused)return false;
  const incoming=Math.max(0,Number(amount)||0),armor=Math.max(0,s.armor||0);
  const absorbed=Math.min(armor,incoming*ARMOR_ABSORB);
  s.armor=armor-absorbed;
  const loss=incoming-absorbed;
  s.damageTaken=(s.damageTaken||0)+loss;
  s.hp=Math.max(0,s.hp-loss);s.hurtAgo=0;
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
export function updateExtraction(s,{inside,contested,dt,duration=8,id=s.extractionId,title=s.extractionTitle}) {
  if(s.status!=='playing'||s.paused||s.stage<2)return false;
  if(!inside){s.extracting=0;return false;}
  if(s.extractionId!==id){s.extracting=0;s.extractionId=id;}
  s.extractionTitle=title;
  if(contested){s.extracting=Math.max(0,s.extracting-dt*.5);return false;}
  s.extracting+=Math.max(0,Math.min(.1,dt));
  if(s.extracting>=duration){finishRun(s,true);return true;}return false;
}

/** Throw one frag grenade. The arc, flight and blast remain the game's job. */
export function throwGrenade(s) {
  if(s.status!=='playing'||s.paused||s.grenadeCooldown>0||!s.grenades)return false;
  s.grenades--;s.grenadeCooldown=GRENADE_COOLDOWN;return true;
}

/** Start a knife swing. Busy states (reload/switch/heal) lock the blade out. */
export function meleeAttack(s) {
  if(s.status!=='playing'||s.paused||s.meleeCooldown>0||s.reload>0||s.switchTime>0||s.healTime>0)return false;
  s.meleeCooldown=MELEE_COOLDOWN;return true;
}

/** Register a kill and award score. The streak multiplier uses the streak value
 * after this kill, rounded so HUD/result math stays deterministic. */
export function awardKill(s,{headshot=false,melee=false,stealth=false}={}) {
  const base=KILL_POINTS+(headshot?HEADSHOT_POINTS:0)+(melee?MELEE_POINTS:0)+(stealth?STEALTH_POINTS:0);
  s.kills=(s.kills||0)+1;
  s.streak=(s.streak||0)+1;
  s.bestStreak=Math.max(s.bestStreak||0,s.streak);
  if(headshot)s.headshots=(s.headshots||0)+1;
  const multiplier=Math.round((1+Math.min(STREAK_CAP,STREAK_STEP*s.streak))*100)/100;
  s.multiplier=multiplier;
  const points=Math.round(base*multiplier);
  s.score=(s.score||0)+points;
  return {points,multiplier};
}

/** Add armor plates up to the cap; returns the amount actually equipped. */
export function addArmor(s,n) {
  const before=Math.max(0,s.armor||0),max=s.maxArmor??100;
  s.armor=Math.min(max,before+Math.max(0,Number(n)||0));
  return s.armor-before;
}
/** Add medkits up to the carry cap; returns the amount actually gained. */
export function addMedkit(s,n) {
  const before=Math.max(0,s.medkits||0),max=s.maxMedkits??Infinity;
  s.medkits=Math.min(max,before+Math.max(0,Number(n)||0));
  return s.medkits-before;
}
/** Add grenades up to the carry cap; returns the amount actually gained. */
export function addGrenade(s,n) {
  const before=Math.max(0,s.grenades||0),max=s.maxGrenades??Infinity;
  s.grenades=Math.min(max,before+Math.max(0,Number(n)||0));
  return s.grenades-before;
}

/** Collect one intel chip: clamps at intelTotal, awards 150 score and feeds the
 * HUD. Returns false once the cache is full or the run is over. */
export function collectIntel(s,total=s.intelTotal) {
  if(s.status!=='playing'||s.paused)return false;
  const cap=Math.max(0,Number(total??s.intelTotal??5)||0);
  if((s.intelFound||0)>=cap)return false;
  s.intelFound=(s.intelFound||0)+1;
  s.score=(s.score||0)+150;
  pushFeed(s,`情报碎片 ${s.intelFound}/${cap}`,'intel');
  return true;
}

/** Append one kill-feed line, keeping the newest five entries in chronological
 * order (oldest first). `at` is the run clock so the HUD can age entries out. */
export function pushFeed(s,text,tone='system') {
  const entry={id:++s.feedSeq,text:String(text),tone,at:s.elapsed||0};
  s.feed.push(entry);
  if(s.feed.length>FEED_LIMIT)s.feed.splice(0,s.feed.length-FEED_LIMIT);
  return entry;
}

/** Deterministic mission grade. A failed run is always D; successful runs earn
 * points for speed, score, accuracy, intel and the optional objective. */
export function gradeFor(s,success) {
  if(!success)return 'D';
  const elapsed=s?.elapsed||0,score=s?.score||0;
  const accuracy=s?.shots?Math.max(0,Math.min(1,(s.hits||0)/s.shots)):0;
  const total=Math.max(1,s?.intelTotal||5),found=Math.max(0,s?.intelFound||0);
  let points=0;
  if(elapsed<=360)points+=2;else if(elapsed<=600)points+=1;
  if(score>=1600)points+=3;else if(score>=1000)points+=2;else if(score>=500)points+=1;
  if(accuracy>=.5)points+=2;else if(accuracy>=.32)points+=1;
  if(found>=total)points+=2;else if(found>=Math.ceil(total*.6))points+=1;
  if(s?.bonusComplete)points+=2;
  return points>=9?'S':points>=7?'A':points>=4?'B':'C';
}

export function finishRun(s,success) {
  if(s.status!=='playing')return s.result;
  s.status=success?'success':'failed';s.paused=true;
  return s.result={success,title:success?'行动完成':'行动中止',subtitle:success?`情报已带出，${s.extractionTitle}撤离成功。`:'调整战术，再次进入封锁区。',
    kills:s.kills,shots:s.shots,accuracy:s.shots?Math.round(s.hits/s.shots*100):0,time:Math.round(s.elapsed),intel:Math.min(2,s.stage),teammate:s.teammateHP>0,
    difficulty:s.difficulty||'standard',difficultyLabel:(DIFFICULTIES[s.difficulty]||DIFFICULTIES.standard).label,
    score:s.score||0,grade:gradeFor(s,success),headshots:s.headshots||0,bestStreak:s.bestStreak||0,
    intelFound:s.intelFound||0,intelTotal:s.intelTotal||5,bonusComplete:!!s.bonusComplete,
    damageTaken:Math.round(s.damageTaken||0),medkitsUsed:s.medkitsUsed||0};
}
export function parseSquadOrder(text) {
  const t=String(text).trim().slice(0,160);
  if(/停止跟随|别走|不要走|别跟|不要跟|别动|守|停|等|hold|stop|wait/i.test(t))return 'hold';
  if(/掩护|支援|进攻|压制|cover|attack|support/i.test(t))return 'cover';
  if(/跟|集合|回来|走|follow|come|regroup/i.test(t))return 'follow';
  return null;
}
