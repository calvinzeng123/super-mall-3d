// Short synthesized game cues: no downloaded audio or autoplay on the cover.
export function createGameAudio() {
  let context=null, muted=false;
  function unlock(){try{context ||= new (window.AudioContext||window.webkitAudioContext)();context.resume().catch(()=>{});}catch{}}
  function tone(freq,duration,volume=.06,type='sine',end=freq){
    if(muted||!context||context.state!=='running')return;
    const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;
    o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g);g.connect(context.destination);o.start();o.stop(t+duration);
  }
  return {unlock,setMuted(v){muted=!!v;},shot(pistol=false){
    if(muted||!context||context.state!=='running')return;
    const len=pistol?.2:.13,b=context.createBuffer(1,context.sampleRate*len,context.sampleRate),data=b.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*8);
    const src=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    src.buffer=b;filter.type='lowpass';filter.frequency.value=pistol?1600:2200;gain.gain.value=pistol?.25:.17;
    src.connect(filter);filter.connect(gain);gain.connect(context.destination);src.start();
    tone(pistol?110:160,.09,.1,'triangle',40);
  },hit(){tone(900,.055,.06,'triangle',430);},reload(){tone(450,.08,.035,'square',200);},radio(){tone(700,.08,.04);},
  objective(){tone(620,.25,.07,'sine',920);},hurt(){tone(110,.18,.06,'triangle',45);},step(){tone(65,.035,.018,'triangle',35);},
  jump(){tone(90,.12,.022,'triangle',150);},land(){tone(70,.085,.045,'triangle',28);},
  dispose(){context?.close();context=null;}};
}
