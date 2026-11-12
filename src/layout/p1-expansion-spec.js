// Preserve the legacy P1 spec for the compact FPS while tour expands vertically.
import { KIT } from './constants.js';
import { grandSquareEscalators, grandSquareSetup, grandSquareLevel } from './square-atrium.js';
import { frame, toW, toL } from './geom.js';

/** 中庭洞口：[楼层, 进深的一半, 圆角半径] */
// 云澜大中庭第二轮：两端也逐层退（每层 3 米），两部观光梯挪到 x=±30（6F 洞口两端以外，门朝外对着翼楼口）。
export const ATRIUM_STEPS = [['3F', 20, 11.5, 7], ['4F', 23, 14, 8], ['5F', 26, 16, 9], ['6F', 28, 17, 10], ['RF', 22, 17, 9]]; // 天台天窗两端收到 ±22：沿四翼中轴还能走进光穹里（u=24）
/** 圆厅观光梯的新位置（套件坐标） */
// 偏开翼楼中轴 5 米：天台上沿东南翼、西北翼中轴走进光穹的路不被井道挡住，也离光穹的柱子 ≥2.9 米
export const ROTUNDA_GLASS = [{ id: 'GW', ...kitOf(34, -13), door: 'S' }, { id: 'GE', x: 30, z: -5, door: 'E' }];
/** 西北翼局部 (u, v) → 圆厅套件坐标（圆厅 kitDeg 45：套件 −x 就是西北翼方向） */
function kitOf(u, v) { const nw = frame(-106, -106, 225), kit = frame(-106, -106, 45); const [x, z] = toL(kit, ...toW(nw, u, v)); return { x: +x.toFixed(3), z: +z.toFixed(3) }; }

export function buildExpandedP1Spec(original) {
  const copy = v => Array.isArray(v) ? v.map(copy) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])) : v;
  const spec=copy(original);
  spec.rotundas=spec.rotundas.map(r=>({...r,glass:[...r.glass.filter(s=>s!=='RF'),'4F','5F','6F','RF'],...(r.id==='C'?{glassAt:ROTUNDA_GLASS}:{})}));
  const themes=[
    ['4F','4F 设计与文化',17.5,'design','terrazzo-warm','#b58a5b','设计家居 · 书店 · 运动体验',['home','books','sports','studio','cafe']],
    ['5F','5F 剧场与娱乐',23,'culture','wood-warm','#915f64','影城 · 小剧场 · 沉浸娱乐',['cinema','arcade','edu','kids','restaurant']],
    ['6F','6F 云端餐厅',28.5,'sky-dining','marble-white','#7c997c','观景餐厅 · 空中花园 · 餐吧',['restaurant','bar','cafe','tea']],
  ];
  const roof=spec.levels.find(l=>l.short==='RF');roof.elev=34;
  spec.levels=spec.levels.filter(l=>l.short!=='RF');
  for(const [short,name,elev,key,floor,accent,label,cats]of themes)spec.levels.push({short,name,kind:'retail',elev,height:5.5,theme:{key,floor,accent,label},widths:short==='5F'?[20,18,22]:[13,16,12,15],cats,rot:{C:{void:KIT.voidUp}},wings:{SE:{end:'lounge'},W:{end:'lounge'},N:{end:'lounge'},NW:{}}});
  spec.levels.push(roof);
  // 样板中庭：2F 以上的中庭洞口逐层加深（长边方向），从下往上看是一圈圈退台；天台天窗开到和 6F 一样大，
  // 从中庭里能看到上面的云澜光穹。洞口长边固定 ±17（两部观光梯的门正好在洞口两端），
  // 进深受扶梯限制：2F 的 1F↔2F 扶梯落在 ±10，3F 的 2F↔3F 扶梯在 ±15.15，4F–RF 的扶梯开洞在 ±21 以外。
  for (const [short, hx, half, r] of ATRIUM_STEPS) {
    const lv = spec.levels.find(l => l.short === short);
    lv.rot = { ...lv.rot, C: { ...lv.rot.C, void: { rect: { x0: -hx, z0: -half, x1: hx, z1: half }, r } } };
  }
  spec.escalators=spec.escalators.map(e=>e.to==='RF'?{...e,from:'6F',...(e.rot==='C'?{cross:Math.sign(e.cross)*26}:{}),label:'6F ↔ 天台花园'}:e);
  for(const [from,to]of [['3F','4F'],['4F','5F'],['5F','6F']]){
    const cross=from==='4F'?26:21;
    spec.escalators.push({pair:`ART-${from}`,rot:'C',from,to,axis:'x',sign:1,cross,slot:true,label:`${from} ↔ ${to}`});
    spec.escalators.push({pair:`ART2-${from}`,rot:'C',from,to,axis:'x',sign:-1,cross:-cross,slot:true,label:`${from} ↔ ${to}`});
    const template=spec.escalators.find(e=>e.square&&e.from==='2F'&&e.to==='3F');
    // The north pairs (3F→4F, 5F→6F) start east of the 8 m north-terrace passage mouth x[−224,−216],
    // so the passage opens straight onto the 方庭 corridor instead of hiding behind the escalator.
    spec.escalators.push({...template,pair:`SQ-ART-${from}`,from,to,cross:from==='4F'?21:-21,...(from==='4F'?{}:{bottom:4.8}),label:`方庭 ${from} ↔ ${to}`});
  }
  // 云澜大中庭第一轮：方庭改成超大退台中庭（square-atrium.js）；要在上面加完方庭 3F–6F 扶梯之后
  spec.escalators = grandSquareEscalators(spec.escalators);
  // 超级商业中心（p1-mega.js）：西北翼变成大中庭，原来的 K7/K8 去掉，A 里加一组交叉扶梯（1F→6F，两道 v=44/48 交替）
  const nwF = frame(-106, -106, 225, 'P1-NW-MEGA');
  spec.escalators = spec.escalators.filter((e) => !['K7', 'K8'].includes(e.pair));
  [['1F', '2F'], ['2F', '3F'], ['3F', '4F'], ['4F', '5F'], ['5F', '6F']].forEach(([from, to], i) => {
    const sign = i % 2 ? 1 : -1;
    spec.escalators.push({ pair: `MEGA-X${i + 1}`, frame: nwF, from, to, axis: 'x', sign, cross: i % 2 ? 48 : 44, slot: true, label: `中庭 ${from} ↔ ${to}`, ...(sign < 0 ? { top: 60 } : { bottom: 60 }) });
  });
  spec.square = { ...spec.square, setup: grandSquareSetup, level: grandSquareLevel };
  // 观光梯挪到洞口外面以后，2F–6F 也要在楼板上开井道
  for (const lv of spec.levels.filter((l) => ['2F', '3F', '4F', '5F', '6F'].includes(l.short))) lv.rot = { ...lv.rot, C: { ...lv.rot.C, shafts: true } };
  return spec;
}
