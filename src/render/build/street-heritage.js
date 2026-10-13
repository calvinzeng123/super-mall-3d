// 云澜旧巷：结构化骑楼、瓦顶和有营业内容的集市。所有小件复用既有批次与材质。
import * as THREE from 'three';
import { bench, planter } from './props.js';
import { makeCanvas, canvasTexture, scaled, releaseAfterUpload, FONT_CN, FONT_EN } from '../textures.js';

const WOOD = '#584331', DARK = '#29343b', TILE = '#596262';
const q = new THREE.Quaternion();
const p = new THREE.Vector3(), s = new THREE.Vector3();
const AXIS_X = new THREE.Vector3(1, 0, 0);

function lantern(B, x, y, z, color = '#b33e2b') {
  B.get('extMetal').box(x, y + .58, z, .035, .42, .035, DARK);
  B.get('ext').sphere(x, y, z, .25, color, .35, .25, 'sphereLo');
  for (const yy of [-.32, .32]) B.get('extMetal').cyl(x, y + yy, z, .18, .045, '#ad8950', 8);
  B.get('glow').sphere(x, y, z, .18, '#ffcb7f', .26, .18, 'sphereLo');
  B.get('ext').box(x, y - .54, z, .035, .35, .035, '#e1b96b');
}

/** 每层真实窗棂、木撑、花箱、雨落管、檐下灯；门洞中央保持空。 */
export function buildHeritageDetail(B, S, atlas, lv, k) {
  const y = lv.elev, { h, w } = k;
  const front = -w - .28;
  // 构架柱、挑檐木梁、斜撑与石柱础形成有厚度的骑楼立面。
  for (const x of [-h + .28, h - .28]) {
    B.get('stone').box(x, y + .22, front, .7, .44, .72, '#b2aaa0');
    B.get('wood').box(x, y + 2.25, front, .3, 4.1, .32, WOOD);
    B.get('wood').bar({x, y:y+3.32, z:front}, {x, y:y+4.15, z:front-1.15}, .09, WOOD);
    B.get('wood').box(x, y + 4.22, front - .55, .22, .25, 1.65, WOOD);
    lantern(B, x, y + 3.05, front - .9, k.n % 2 ? '#8c4434' : '#b34330');
  }
  B.get('wood').box(0, y + 4.3, front - .25, k.L + .65, .22, .26, WOOD);
  const units = lv.units.filter(u => u.block === k.n);
  for (const u of units) {
    const r = u.rects[0], cx = (r.x0 + r.x1) / 2;
    // 店侧两扇木窗/橱窗罩框，主体门口由street.js统一生成。
    for (const side of [-1, 1]) {
      const x = cx + side * Math.min(2.6, (r.x1-r.x0)*.32);
      const z = lv.short === '1F' ? front : w + .22;
      B.get('wood').box(x, y + 2.35, z, 1.18, .08, .13, WOOD);
      B.get('wood').box(x, y + 1.05, z, 1.18, .12, .22, WOOD);
      for (const dx of [-.56, -.28, 0, .28, .56]) B.get('wood').box(x+dx,y+1.7,z,.045,1.28,.09,WOOD);
      for (const dy of [1.35,1.7,2.05]) B.get('wood').box(x,y+dy,z,1.14,.045,.09,WOOD);
      if (lv.short !== '1F') {
        B.get('wood').box(x,y+.94,z+.14,1.34,.28,.48,'#755a3c');
        for (const dx of [-.43,0,.43]) B.get('foliage').sphere(x+dx,y+1.17,z+.15,.23,'#647e49',.18,.18,'sphereLo');
      }
    }
    if (lv.short === '1F') {
      // 真实门旁货架，留出店铺中央2m通行口。
      const x = r.x0 + 1.15, z = -w + .65;
      for (const dx of [-.72,.72]) B.get('wood').box(x+dx,y+.92,z,.07,1.75,.52,WOOD);
      for (const yy of [.16,.65,1.18,1.72]) B.get('wood').box(x,y+yy,z,1.5,.075,.6,WOOD);
      for (let row=0;row<3;row++) for(let col=0;col<5;col++) {
        const xx=x-.58+col*.28, yy=y+.2+row*.5;
        if(k.n%3===0) B.get('ext').box(xx,yy+.16,z,.16,.32,.28,['#a85b40','#7f9970','#d3bd93'][row]);
        else B.get('ext').cyl(xx,yy,z,.1,.29,['#bb845a','#758d91','#b6af8a'][row],8);
      }
      B.get('wood').box(r.x1-1.3,y+.55,-w-1.15,.8,1.1,.08,WOOD,-.1);
      B.get('ext').box(r.x1-1.3,y+.65,-w-1.21,.68,.6,.035,'#243b35',-.1);
      for(const yy of [.52,.67,.82]) B.get('ext').box(r.x1-1.3,y+yy,-w-1.24,.45,.016,.015,'#eee1b9',-.1);
    }
  }
}

/** 双坡青瓦屋顶：斜面、稠密瓦垄、脊饰、博风板、椽头和挑檐。 */
export function heritageRoof(B,k) {
  const h=k.h+.65, w=k.w+.9, eave=k.top+.08, rise=2.05;
  for(const sign of [-1,1]) {
    q.setFromAxisAngle(AXIS_X,sign*Math.atan2(rise,w));
    B.get('stone').shape('box',p.set(0,eave+rise/2,sign*w/2),q,s.set(h*2,.17,Math.hypot(w,rise)),TILE);
    // 每条瓦垄跨过整个斜屋面，低面数圆截面共享批次。
    for(let x=-h+.1;x<h;x+=.42) B.get('extMetal').bar({x,y:eave+rise+.1,z:0},{x,y:eave+.12,z:sign*w},.055,'#707776');
    for(let z=.65;z<w;z+=.8) B.get('stone').box(0,eave+rise*(1-z/w)+.1,sign*z,h*2,.03,.045,'#3e4b4f');
    B.get('wood').box(0,eave-.05,sign*w,h*2+.1,.25,.22,WOOD);
    for(let x=-h+.22;x<h;x+=.62) B.get('wood').box(x,eave-.2,sign*(w-.25),.12,.18,.75,WOOD);
  }
  B.get('stone').box(0,eave+rise+.13,0,h*2+.2,.22,.36,'#424e52');
  for(const x of [-h,h]) {
    B.get('stone').bar({x,y:eave+.1,z:-w},{x,y:eave+rise+.15,z:0},.12,'#d8d3c6');
    B.get('stone').bar({x,y:eave+rise+.15,z:0},{x,y:eave+.1,z:w},.12,'#d8d3c6');
    B.get('stone').sphere(x,eave+rise+.36,0,.21,'#8b8171',.25,.18,'sphereLo');
  }
}

function stall(B,f) {
  const {x,z,w,d,variant}=f;
  const colors=['#947358','#7c8f70','#a36145','#536f7a'];
  for(const xx of [x-w/2+.15,x+w/2-.15]) for(const zz of [z-d/2+.1,z+d/2-.1]) {
    B.get('wood').box(xx,1.25,zz,.12,2.5,.12,WOOD);
    B.get('stone').box(xx,.08,zz,.32,.16,.32,'#9b9486');
  }
  B.get('ext').box(x,2.55,z,w+.35,.16,d+.45,colors[variant]);
  B.get('wood').box(x,2.3,z-d/2-.25,w+.25,.26,.12,WOOD);
  B.get('wood').box(x,.96,z,w-.35,.13,d-.3,'#a77b4f');
  B.get('wood').box(x,.49,z+.7,w-.4,.85,.07,colors[variant]);
  for(let c=0;c<5;c++) {
    const xx=x-w*.36+c*w*.18;
    B.get('wood').box(xx,1.09,z,.73,.12,1.12,'#d4b17d');
    for(let j=0;j<3;j++) {
      const zz=z-.36+j*.36;
      if(variant===0) B.get('ext').sphere(xx,1.24,zz,.14,['#c18a4b','#a65030','#647d45'][j],.12,.17,'sphereLo');
      else if(variant===1) B.get('ext').cyl(xx,1.14,zz,.13,.28,['#c2b298','#9e7357','#d0c4ab'][j],8);
      else if(variant===2) B.get('ext').box(xx,1.29,zz,.28,.31,.24,['#c5b487','#967757','#c8985c'][j]);
      else B.get('ext').box(xx,1.18,zz,.5,.06,.29,['#c77452','#6b8984','#d6c086'][j]);
    }
  }
  for(const xx of [x-w*.37,x+w*.37]) lantern(B,xx,2.02,z-d/2-.1);
}

export function buildStreetMarket(ctx,b,lvs) {
  const L=ctx.levels[lvs['1F'].id], B=L.batch;
  const market=lvs['1F'].features.find(f=>f.type==='heritage-market');
  if(!market)return;
  // 集市全长步道，两侧摊位的中央6m街道始终贯通。
  B.get('stone').box(-133,.012,214,210,.025,6,'#b2a390');
  for(let x=-238;x<-28;x+=4) for(const z of [210.7,217.3]) B.get('stone').box(x,.026,z,3.8,.03,.14,'#71695e');
  for(const f of lvs['1F'].features.filter(f=>f.type==='market-stall'))stall(B,f);
  for(let i=0;i<7;i++) {
    const x=-215+i*26;
    B.get('extMetal').cyl(x,0,210.5,.075,5.8,DARK,8);
    for(const dx of [-7.5,7.5])B.get('extMetal').bar({x,y:5.6,z:210.5},{x:x+dx,y:5.1,z:210.5},.018,DARK);
    for(const dx of [-6,-3,3,6])lantern(B,x+dx,4.5+Math.abs(dx)*.025,210.5);
  }
  for(const z of [205,221]) for(let x=-205;x<-38;x+=52) {
    bench(B,x,0,z,0);
    planter(B,x+2.4,z-.55,x+3.6,z+.55,0,iSeed(x,z));
  }
  for(let x=-233;x<-34;x+=6.5) {
    B.get('stone').box(x,.17,245.65,.6,.34,.65,'#a49d90');
    B.get('wood').box(x,4.7,245.65,.22,9.4,.22,WOOD);
  }
  marketGateway(B,L.base);
  // 后街连廊的最外侧连续栏杆，门面和楼梯口都保留通行净空。
  for(const lv of [lvs['2F'],lvs['3F']]) {
    const B=ctx.levels[lv.id].batch;
    // 饰底收进结构板，外包檐板与结构外侧错开，避免白色侧面共面闪烁。
    B.get('wood').box(-133.75,lv.elev-.32,244.25,201.34,.34,3.34,'#99816a');
    B.get('wood').box(-133.75,lv.elev-.23,246.07,201.64,.46,.12,'#70573f');
    for(const x of [-234.57,-32.93])B.get('wood').box(x,lv.elev-.23,244.25,.12,.46,3.62,'#70573f');
    B.get('extMetal').box(-133.75,lv.elev+1.08,245.93,201.5,.07,.08,DARK);
    for(let x=-234.3;x<-33;x+=1.5) B.get('wood').box(x,lv.elev+.52,245.93,.06,1.04,.06,WOOD);
    for(const x of [-234.43,-33.07]) B.get('extMetal').box(x,lv.elev+.53,244.25,.06,1.06,3.5,DARK);
  }
}

const iSeed = (x,z) => Math.abs(Math.round(x*31+z));

function marketGateway(B, group) {
  const x=-133,z=222;
  for(const dx of [-10,10]) {
    B.get('stone').box(x+dx,.22,z,.95,.44,.95,'#aaa293');
    B.get('wood').box(x+dx,2.9,z,.38,5.5,.42,WOOD);
    B.get('wood').bar({x:x+dx,y:4.2,z},{x:x+dx-Math.sign(dx)*1.8,y:5.5,z},.13,WOOD);
  }
  B.get('wood').box(x,5.6,z,22,.3,.65,WOOD);
  B.get('stone').box(x,5.87,z,23,.23,1.15,TILE);
  B.get('wood').box(x,5.12,z-.02,11.9,1.04,.23,'#9e7c4b');
  B.get('ext').box(x,5.12,z-.15,11.55,.77,.05,'#29473e');
  const c=makeCanvas(1536,128),g=c.getContext('2d');
  g.fillStyle='#29473e';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f1dfad';g.textAlign='center';g.textBaseline='middle';
  g.font=`600 61px ${FONT_CN}`;g.fillText('云 澜 旧 巷',768,44);
  g.font=`400 23px ${FONT_EN}`;g.fillText('YUNLAN HERITAGE LANE · HANDCRAFT MARKET',768,102);
  const texture=releaseAfterUpload(canvasTexture(scaled(c),{clamp:true}));
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(11.48,.95),new THREE.MeshBasicMaterial({map:texture}));
  sign.position.set(x,5.12,z-.184);sign.rotation.y=Math.PI;group.add(sign);
}
