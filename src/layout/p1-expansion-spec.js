// Preserve the legacy P1 spec for the compact FPS while tour expands vertically.
import { KIT } from './constants.js';

export function buildExpandedP1Spec(original) {
  const copy = v => Array.isArray(v) ? v.map(copy) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])) : v;
  const spec=copy(original);
  spec.rotundas=spec.rotundas.map(r=>({...r,glass:[...r.glass.filter(s=>s!=='RF'),'4F','5F','6F','RF']}));
  const themes=[
    ['4F','4F 设计与文化',17.5,'design','terrazzo-warm','#b58a5b','设计家居 · 书店 · 运动体验',['home','books','sports','studio','cafe']],
    ['5F','5F 剧场与娱乐',23,'culture','wood-warm','#915f64','影城 · 小剧场 · 沉浸娱乐',['cinema','arcade','edu','kids','restaurant']],
    ['6F','6F 云端餐厅',28.5,'sky-dining','marble-white','#7c997c','观景餐厅 · 空中花园 · 餐吧',['restaurant','bar','cafe','tea']],
  ];
  const roof=spec.levels.find(l=>l.short==='RF');roof.elev=34;
  spec.levels=spec.levels.filter(l=>l.short!=='RF');
  for(const [short,name,elev,key,floor,accent,label,cats]of themes)spec.levels.push({short,name,kind:'retail',elev,height:5.5,theme:{key,floor,accent,label},widths:short==='5F'?[20,18,22]:[13,16,12,15],cats,rot:{C:{void:KIT.voidUp}},wings:{SE:{end:'lounge'},W:{end:'lounge'},N:{end:'lounge'},NW:{}}});
  spec.levels.push(roof);
  spec.escalators=spec.escalators.map(e=>e.to==='RF'?{...e,from:'6F',...(e.rot==='C'?{cross:Math.sign(e.cross)*26}:{}),label:'6F ↔ 天台花园'}:e);
  for(const [from,to]of [['3F','4F'],['4F','5F'],['5F','6F']]){
    const cross=from==='4F'?26:21;
    spec.escalators.push({pair:`ART-${from}`,rot:'C',from,to,axis:'x',sign:1,cross,slot:true,label:`${from} ↔ ${to}`});
    spec.escalators.push({pair:`ART2-${from}`,rot:'C',from,to,axis:'x',sign:-1,cross:-cross,slot:true,label:`${from} ↔ ${to}`});
    const template=spec.escalators.find(e=>e.square&&e.from==='2F'&&e.to==='3F');
    spec.escalators.push({...template,pair:`SQ-ART-${from}`,from,to,cross:from==='4F'?21:-21,label:`方庭 ${from} ↔ ${to}`});
  }
  return spec;
}
