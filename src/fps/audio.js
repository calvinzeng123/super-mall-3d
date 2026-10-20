// Short synthesized game cues: no downloaded audio or autoplay on the cover.
// Every cue is guarded by muted/context/volume state so callers never need
// feature detection; master*sfx is applied inside the synthesis helpers.
const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export function createGameAudio() {
  let context=null, muted=false, volumes={master:.8,sfx:.9};
  const level=()=>volumes.master*volumes.sfx;
  const ready=()=>!muted&&!!context&&context.state==='running'&&level()>0;
  function unlock(){try{context ||= new (window.AudioContext||window.webkitAudioContext)();context.resume().catch(()=>{});}catch{}}
  function tone(freq,duration,volume=.06,type='sine',end=freq,delay=0){
    if(!ready())return;
    const t=context.currentTime+delay,o=context.createOscillator(),g=context.createGain();
    o.type=type;o.frequency.setValueAtTime(Math.max(20,freq),t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(volume*level(),t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+duration);
  }
  function noise(duration,volume,cutoff,type='lowpass',delay=0){
    if(!ready())return;
    const t=context.currentTime+delay,rate=context.sampleRate,n=Math.max(1,Math.floor(rate*duration));
    const buffer=context.createBuffer(1,n,rate),data=buffer.getChannelData(0);
    for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/n*8);
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;filter.type=type;filter.frequency.setValueAtTime(cutoff,t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60,cutoff*.35),t+duration);
    gain.gain.setValueAtTime(volume*level(),t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(context.destination);source.start(t);source.stop(t+duration);
  }
  // master/sfx are 0..1; partial updates keep the other value.
  function setVolumes(next={}){if(Number.isFinite(Number(next.master)))volumes.master=clamp01(next.master);if(Number.isFinite(Number(next.sfx)))volumes.sfx=clamp01(next.sfx);}
  return {unlock,setMuted(v){muted=!!v;},setVolumes,
    shot(pistol=false){noise(pistol?.2:.13,pistol?.25:.17,pistol?1600:2200);tone(pistol?110:160,.09,.1,'triangle',40);},
    hit(){tone(900,.055,.06,'triangle',430);},reload(){tone(450,.08,.035,'square',200);tone(300,.06,.03,'square',170,.09);},
    radio(){tone(700,.08,.04);},objective(){tone(620,.25,.07,'sine',920);tone(930,.2,.05,'sine',1240,.12);},
    hurt(){tone(110,.18,.06,'triangle',45);},step(){tone(65,.035,.018,'triangle',35);},
    jump(){tone(90,.12,.022,'triangle',150);},land(){tone(70,.085,.045,'triangle',28);noise(.08,.05,900);},
    meleeSwing(){noise(.16,.09,2600,'bandpass');tone(320,.12,.02,'sawtooth',90);},
    meleeHit(stealth=false){if(stealth){tone(70,.13,.09,'triangle',38);noise(.1,.05,320);}else{tone(140,.14,.1,'triangle',55);noise(.12,.08,700);tone(1600,.05,.03,'square',400);}},
    grenadeThrow(){noise(.14,.06,1800,'bandpass');tone(1350,.05,.03,'square',920);tone(520,.09,.025,'triangle',240,.06);},
    explosion(){noise(.5,.3,700);noise(.35,.18,180);tone(62,.5,.22,'triangle',22);tone(95,.26,.12,'sawtooth',32);},
    armorPlate(){tone(1180,.09,.05,'square',720);tone(1620,.06,.035,'triangle',980,.02);noise(.06,.04,4000,'highpass');},
    intelPickup(){tone(740,.08,.05,'sine',780);tone(990,.1,.05,'sine',1020,.07);tone(1320,.14,.045,'sine',1380,.14);},
    streak(level=1){const n=Math.max(1,Math.min(9,Math.floor(Number(level)||1)));tone(500+n*90,.08,.05,'sine',620+n*110);tone(750+n*120,.12,.04,'triangle',980+n*130,.06);},
    emptyClick(){tone(2100,.018,.05,'square',900);noise(.02,.03,5000,'highpass');},
    heartbeat(){tone(58,.11,.14,'sine',38);tone(62,.09,.1,'sine',40,.18);},
    victory(){[523,659,784,1047].forEach((f,i)=>tone(f,i? .2:.34,.07,'triangle',f*1.01,i*.13));tone(196,.7,.05,'sine',262,0);noise(.25,.05,1200,'highpass');},
    defeat(){[392,311,262,196].forEach((f,i)=>tone(f,.22,.07,'triangle',f*.97,i*.17));tone(98,.8,.06,'sine',65,.2);},
    dispose(){context?.close();context=null;}};
}
