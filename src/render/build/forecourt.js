// 一期口袋乐园与外摆：尺寸来自site.forecourt，固定小件复用场地材质批次。
import * as THREE from 'three';
import { BatchSet, SignBatch } from '../batch.js';
import { planter, umbrella, tableSet, bollard, ipMascot, addTrees } from './props.js';
import { frame, pointInPoly } from '../../layout/geom.js';
import { shapeFromPoly, flatShapeGeometry } from './shell.js';
import { makeSignAtlas, FONT_CN, FONT_EN, rng } from '../textures.js';

const C={teal:'#438c89',mint:'#97b8a1',ochre:'#d9b468',cream:'#f1e8d2',red:'#b9664d',wood:'#a77e53',dark:'#3a4d4c'};

function disc(B,x,z,r,color,y=.035) {B.get('ext').cyl(x,y-.035,z,r,.04,color,48);}
function ringDots(B,x,z,r,n,y,color,radius=.085){for(let i=0;i<n;i++){const a=i/n*Math.PI*2;B.get('glow').sphere(x+Math.cos(a)*r,y,z+Math.sin(a)*r,radius,color,radius,radius,'sphereLo');}}
function edgeRail(B,x0,z0,x1,z1,y=0,h=.9){
  B.get('extMetal').bar({x:x0,y:y+h,z:z0},{x:x1,y:y+h,z:z1},.035,C.dark);
  const n=Math.ceil(Math.hypot(x1-x0,z1-z0)/.7);
  for(let i=0;i<=n;i++){const t=i/n;B.get('extMetal').cyl(x0+(x1-x0)*t,y,z0+(z1-z0)*t,.025,h,C.dark,6);}
}

function horse(B,x,z,a,col) {
  const F=frame(x,z,a*180/Math.PI);
  B.frame(F,()=>{
    B.get('ext').sphere(0,1.4,0,.48,col,.28,.19,'sphereLo');
    B.get('ext').bar({x:.29,y:1.5,z:0},{x:.48,y:1.93,z:0},.14,col);
    B.get('ext').sphere(.55,1.98,0,.2,col,.13,.12,'sphereLo');
    B.get('ext').cone(.49,2.02,-.05,.055,.18,col,6);
    B.get('ext').cone(.49,2.02,.05,.055,.18,col,6);
    for(const zz of [-.16,.16])for(const xx of [-.3,.26]){
      B.get('ext').bar({x:xx,y:1.28,z:zz},{x:xx-.1,y:.83,z:zz},.06,col);
      B.get('extMetal').box(xx-.1,.8,zz,.15,.09,.11,C.dark);
    }
    B.get('wood').bar({x:-.42,y:1.47,z:0},{x:-.64,y:1.13,z:0},.07,C.wood);
    B.get('ext').box(0,1.68,0,.34,.055,.38,C.red);
    B.get('extMetal').cyl(.07,.46,0,.025,4.05,'#b7944d',8);
    for(const zz of [-.121,.121]) B.get('ext').sphere(.56,2.005,zz,.025,C.dark,.025,.02,'sphereLo');
  });
}

function carousel(ctx,f) {
  const {x,z}=f,r=(f.radius||8)-1.45,B=ctx.site.batch;
  // 常规模块按真实米制建设，预留外围1.5m观看环道。
  disc(B,x,z,r+1.45,'#d7ccb4');disc(B,x,z,r+.45,'#90aaa0',.047);
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;B.get('stone').box(x+Math.cos(a)*(r+.8),.052,z+Math.sin(a)*(r+.8),.38,.055,.7,'#ece3ca',-a);}
  B.get('extSatin').cyl(x,.07,z,r,.18,C.ochre,48);
  B.get('extMetal').cyl(x,.22,z,.2,5.25,C.ochre,12);
  B.get('ext').cone(x,5.2,z,r+.12,2.0,C.teal,48);
  B.get('ext').cyl(x,5.02,z,r+.18,.34,C.cream,48);
  B.get('extMetal').cyl(x,7.14,z,.075,.65,C.ochre,8);
  B.get('ext').sphere(x,7.87,z,.2,C.ochre,.24,.2,'sphereLo');
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2;
    B.get('wood').bar({x,y:7.19,z},{x:x+Math.cos(a)*(r+.1),y:5.22,z:z+Math.sin(a)*(r+.1)},.045,C.cream);
    B.get('ext').sphere(x+Math.cos(a)*(r+.19),5.0,z+Math.sin(a)*(r+.19),.18,C.ochre,.22,.18,'sphereLo');
  }
  ringDots(B,x,z,r+.22,48,5.22,'#ffe2a6');
  const G=new THREE.Group(),D=new BatchSet(ctx.mats.base);G.position.set(x,0,z);G.name='forecourt-carousel';
  D.get('wood').cyl(0,.25,0,r-.2,.2,C.wood,48);
  D.get('ext').cyl(0,.451,0,r-.25,.025,C.cream,48);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;horse(D,Math.cos(a)*(r-1.3),Math.sin(a)*(r-1.3),a+Math.PI/2,[C.cream,'#cfb99a','#8fabab'][i%3]);}
  D.flush(G);ctx.site.group.add(G);
  ctx.dynamic.push({update(dt){if(ctx.site.group.visible)G.rotation.y+=dt*.075;}});
  // 静止入口台阶与轻围栏均在旋转圆盘之外。
  for(let i=0;i<3;i++)B.get('stone').box(x,.065*(i+1),z+r+.48-i*.22,1.75,.13*(i+1),.35,C.cream);
  for(const sign of [-1,1])for(let i=0;i<5;i++){
    const a=Math.PI/2+sign*(.38+i*.54),a2=a+sign*.52;
    edgeRail(B,x+Math.cos(a)*(r+.58),z+Math.sin(a)*(r+.58),x+Math.cos(a2)*(r+.58),z+Math.sin(a2)*(r+.58));
  }
}

function slide(B,x,z,angle=0) {
  const F=frame(x,z,angle);B.frame(F,()=>{
    // 两座木构爬塔和高低平台，不使用一个盒子代替游具。
    for(const [cx,cy] of [[-2.2,1.8],[2,1.35]]) {
      for(const dx of [-.7,.7])for(const dz of [-.7,.7])B.get('wood').box(cx+dx,1.5,dz,.15,3,.15,C.wood);
      B.get('wood').box(cx,cy,0,1.7,.12,1.7,C.wood);
      B.get('ext').cone(cx,3.15,0,1.38,.9,cx<0?C.teal:C.ochre,4);
      for(let xx=-.65;xx<=.66;xx+=.26)B.get('wood').box(cx+xx,cy+.45,.76,.075,.8,.075,C.cream);
      B.get('wood').box(cx,cy+.88,.76,1.6,.09,.12,C.cream);
    }
    // 连桥悬索和独立踏板。
    for(let i=0;i<9;i++)B.get('wood').box(-1.25+i*.3,1.7-i*.045,0,.26,.08,1.05,C.wood);
    for(const zz of [-.58,.58]){
      B.get('extMetal').bar({x:-1.4,y:2.6,z:zz},{x:1.25,y:2.1,z:zz},.022,C.dark);
      for(let i=0;i<9;i++)B.get('extMetal').box(-1.25+i*.3,2.05-i*.045,zz,.022,.72,.022,C.dark);
    }
    // 开放滑道：底槽、两侧圆扶边及缓冲落脚段。
    const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.atan2(1.6,3.4));
    B.get('extSatin').shape('box',new THREE.Vector3(-2.2,.95,2.5),q,new THREE.Vector3(.95,.08,3.78),C.red);
    for(const xx of [-2.76,-1.64])B.get('extSatin').bar({x:xx,y:2.02,z:.8},{x:xx,y:.32,z:4.2},.08,C.red);
    B.get('extSatin').box(-2.2,.16,4.45,1.05,.08,.7,C.red);
    // 楼梯/攀爬网两条不同的上塔路径。
    for(let i=0;i<7;i++)B.get('wood').box(2,.1+i*.2,-3.1+i*.32,1.05,.13,.35,C.wood);
    for(const xx of [-3,-1.4])B.get('extMetal').bar({x:xx,y:.1,z:-3.3},{x:xx,y:1.8,z:-.8},.045,C.dark);
    for(let i=0;i<=5;i++)B.get('extMetal').bar({x:-3+i*.32,y:.1,z:-3.3},{x:-3+i*.32,y:1.8,z:-.8},.018,C.cream);
    for(let i=0;i<=8;i++)B.get('extMetal').bar({x:-3,y:.1+i*.2125,z:-3.3+i*.3125},{x:-1.4,y:.1+i*.2125,z:-3.3+i*.3125},.018,C.cream);
  });
}

function swing(B,x,z,w=7,d=5) {
  const hw=w/2-.2,hd=d/2;
  for(const xx of [-hw,hw]){
    B.get('wood').bar({x:xx+x,y:0,z:z-hd},{x:xx+x,y:2.9,z},.105,C.wood);
    B.get('wood').bar({x:xx+x,y:0,z:z+hd},{x:xx+x,y:2.9,z},.105,C.wood);
  }
  B.get('wood').bar({x:x-hw-.12,y:2.95,z},{x:x+hw+.12,y:2.95,z},.13,C.teal);
  for(const dx of [-1.4,1.4]){
    for(const off of [-.28,.28])B.get('extMetal').bar({x:x+dx+off,y:2.92,z},{x:x+dx+off,y:.55,z:z+.15},.018,C.dark);
    B.get('ext').box(x+dx,.54,z+.15,.68,.09,.35,C.red);
  }
}

function springRider(B,x,z,color) {
  for(let i=0;i<6;i++)B.get('extMetal').box(x,.11+i*.08,z,.28,.025,.28,C.dark,i%2*.7);
  B.get('ext').sphere(x,.82,z,.5,color,.27,.2,'sphereLo');
  B.get('ext').sphere(x+.32,1.03,z,.22,color,.22,.17,'sphereLo');
  B.get('extMetal').box(x+.33,1.07,z,.08,.06,.68,C.dark);
  B.get('ext').box(x-.05,1.02,z,.38,.07,.34,C.cream);
}

function playGarden(ctx,f) {
  const B=ctx.site.batch,{x,z,w,d}=f;
  B.get('ext').box(x,.035,z,w,.05,d,'#8bab9b');
  disc(B,x-1,z+.5,5.2,'#d7b577',.072);
  slide(B,x-1,z+.5);
  for(let i=0;i<3;i++)springRider(B,x+3.5,z-3.5+i*2,[C.teal,C.red,C.ochre][i]);
  for(let i=0;i<7;i++)B.get('ext').box(x-w/2+.8,.081,z-2+i*.8,.6,.025,.65,i%2?C.cream:C.ochre);
  for(const dx of [-w/2+.65,w/2-.65])for(const dz of [-d/2+.6,d/2-.6])bollard(B,x+dx,z+dz,0);
}

function pavilion(B,f){
  const r=f.rect,y=3.15;
  const posts=f.posts||[r.x0+.3,r.x1-.3].flatMap(x=>[r.z0+.3,r.z1-.3].map(z=>[x,z]));
  for(const [x,z] of posts){
    B.get('stone').box(x,.08,z,.36,.16,.36,'#b2a692');
    B.get('wood').box(x,y/2,z,.24,y,.24,C.wood);
  }
  for(const z of new Set(posts.map(p=>p[1])))B.get('wood').box(f.x,y,z,f.w,.22,.23,C.wood);
  if(f.shade){
    // 连续遮阴食集：布面与上方木格栅保持高度差，雨棚跨距随柱网分段。
    for(let x=r.x0+.55;x<r.x1-.55;x+=3.4)for(let z=r.z0+.35;z<r.z1-.35;z+=5.5){
      const w=Math.min(3.08,r.x1-.35-x),d=Math.min(5.25,r.z1-.35-z);
      B.get('ext').box(x+w/2,y-.08,z+d/2,w,.045,d,Math.round((x-r.x0)/3.4)%2?C.cream:'#d8e0cf');
      for(const zz of [z+.1,z+d-.1])B.get('extMetal').box(x+w/2,y-.04,zz,w,.025,.025,C.dark);
    }
  }
  for(let x=r.x0+.3;x<r.x1-.1;x+=.65)B.get('wood').box(x,y+.16,f.z,.13,.17,f.d,C.cream);
  for(const z of [r.z0+.36,r.z1-.36]){
    B.get('glow').box(f.x,y-.135,z,f.w-.9,.025,.045,'#ffe2b1');
    for(let x=r.x0+1;x<r.x1-1;x+=2)B.get('foliage').sphere(x,y+.36,z,.43,'#688258',.16,.27,'ico0');
  }
}

function cafeTable(B,f,reading=false){
  tableSet(B,f.x,0,f.z,0,{top:reading?C.wood:C.cream,chair:reading?C.mint:C.teal},'ext');
  if(f.umbrella)umbrella(B,f.x,0,f.z,C.cream,1.8);
  if(reading){
    for(let i=0;i<4;i++)B.get('ext').box(f.x-.3+i*.15,.8,f.z+.1,.13,.045,.22,[C.red,C.teal,C.ochre,C.cream][i],.08*i);
    B.get('ext').box(f.x+.25,.88,f.z-.05,.32,.13,.25,C.cream);
  }else{
    for(const dx of [-.28,.28]){
      B.get('ext').cyl(f.x+dx,.775,f.z,.07,.12,C.cream,10);
      B.get('wood').cyl(f.x+dx,.897,f.z,.059,.006,'#6d4832',10);
    }
    B.get('ext').cyl(f.x,.775,f.z+.17,.095,.17,C.red,8);
    B.get('foliage').sphere(f.x,.98,f.z+.17,.12,'#617849',.13,.12,'ico0');
  }
}

function kiosk(B,f,S,atlas){
  const {x,z,w,d}=f,r=f.rect;
  B.get('wood').box(x,.08,z,w,.16,d,C.wood);
  B.get('wood').box(x,1.3,r.z0+.08,w,2.4,.16,C.cream);
  for(const xx of [r.x0+.1,r.x1-.1])B.get('wood').box(xx,1.3,z,.18,2.4,d,C.cream);
  B.get('ext').box(x,2.65,z,w+.35,.2,d+.25,C.teal);
  B.get('wood').box(x,1.0,r.z1-.46,w-.18,.12,.9,C.wood);
  B.get('ext').box(x,.51,r.z1-.21,w-.22,.9,.14,C.teal);
  for(let xx=r.x0+.35;xx<r.x1-.3;xx+=.33)B.get('wood').box(xx,.5,r.z1-.11,.06,.83,.07,C.wood);
  B.get('glass').box(x-.6,1.48,r.z1-.5,1.65,.76,.045,'#ffffff');
  B.get('extMetal').box(x-.6,1.08,r.z1-.52,1.76,.1,.74,C.cream);
  for(let i=0;i<5;i++)B.get('ext').sphere(x-1.2+i*.28,1.27,r.z1-.55,.11,['#bf8055','#d9bc75','#96725d'][i%3],.08,.1,'sphereLo');
  for(const yy of [.6,1.25,1.9]){
    B.get('wood').box(x,yy,r.z0+.35,w-.3,.07,.5,C.wood);
    for(let i=0;i<7;i++)B.get('ext').cyl(r.x0+.5+i*.67,yy+.05,r.z0+.36,.1,.22,[C.red,C.ochre,C.teal][i%3],8);
  }
  B.get('ext').box(x+1.25,1.25,r.z1-.6,.62,.42,.4,C.dark);
  B.get('glassTint').box(x+1.25,1.45,r.z1-.38,.48,.27,.025,'#ffffff');
  B.get('wood').box(x,2.35,r.z1+.055,w-.15,.54,.12,C.dark);
  S.place(x,2.35,r.z1+.125,w-.35,.5,'S',atlas.cell(f.id));
  B.get('glow').box(x,2.01,r.z1+.1,w-.65,.026,.08,'#ffdfab');
}

function sandpit(B,f){
  const r=f.rect;
  B.get('ext').box(f.x,.02,f.z,f.w,.055,f.d,'#d5bd87');
  for(const z of [r.z0+.18,r.z1-.18])B.get('wood').box(f.x,.18,z,f.w,.36,.35,C.wood);
  for(const x of [r.x0+.18,r.x1-.18])B.get('wood').box(x,.18,f.z,.35,.36,f.d,C.wood);
  for(let i=0;i<4;i++)B.get('ext').sphere(f.x-1.8+i*1.1,.1,f.z-.4+(i%2),.7,'#dfcb9c',.23,.62,'sphereLo');
  for(const dx of [-2,2]){B.get('ext').cyl(f.x+dx,.02,f.z+1.1,.25,.4,dx<0?C.red:C.teal,10);B.get('extMetal').bar({x:f.x+dx-.1,y:.4,z:f.z+1.1},{x:f.x+dx+.1,y:.7,z:f.z+1.1},.015,C.dark);}
  // 小型沙坑挖掘器：转座、双臂与铲斗。
  B.get('extMetal').cyl(f.x+.6,.03,f.z-1.4,.36,.25,C.dark,12);
  B.get('ext').box(f.x+.6,.68,f.z-1.4,.46,.12,.44,C.teal);
  B.get('extMetal').bar({x:f.x+.6,y:.28,z:f.z-1.4},{x:f.x+1.2,y:1.4,z:f.z-1.4},.09,C.ochre);
  B.get('extMetal').bar({x:f.x+1.2,y:1.4,z:f.z-1.4},{x:f.x+2.0,y:.5,z:f.z-1.4},.07,C.ochre);
  B.get('ext').box(f.x+2,.35,f.z-1.4,.45,.28,.45,C.ochre);
}

function miniTrain(B,f){
  const {x,z,rx,rz}=f,n=128;
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2,cx=x+Math.cos(a)*rx,cz=z+Math.sin(a)*rz;
    const tangent=Math.atan2(-rz*Math.cos(a),-rx*Math.sin(a));
    B.get('wood').box(cx,.006,cz,.14,.06,1.1,C.wood,tangent);
    for(const off of [-.36,.36])B.get('extMetal').bar({x:x+Math.cos(a)*(rx+off),y:.057,z:z+Math.sin(a)*(rz+off)},{x:x+Math.cos(b)*(rx+off),y:.057,z:z+Math.sin(b)*(rz+off)},.025,C.dark);
  }
  // 固定停靠在布局登记的10×2.2m站台区，避免移动物体与静态导航不同步。
  const zz=z+rz;
  for(let i=0;i<3;i++){
    const xx=x-3.2+i*3.2,col=i===0?C.teal:i===1?C.red:C.ochre;
    B.get('extMetal').box(xx,.34,zz,2.8,.2,1.3,C.dark);
    B.get('ext').box(xx,.68,zz,2.6,.52,1.25,col);
    for(const dx of [-.85,.85])for(const dz of [-.67,.67])B.get('extMetal').sphere(xx+dx,.24,zz+dz,.23,C.dark,.23,.055,'sphereLo');
    if(i===0){
      B.get('ext').cyl(xx-.7,.95,zz,.23,.7,C.ochre,10);
      B.get('ext').box(xx+.6,1.34,zz,1.18,1.2,1.35,col);
      B.get('glassTint').box(xx+.6,1.57,zz+.69,.7,.46,.025,'#ffffff');
      B.get('ext').box(xx+.6,2.01,zz,1.6,.12,1.65,C.cream);
      B.get('glow').sphere(xx-1.32,.9,zz,.12,'#ffe5aa',.12,.12,'sphereLo');
    }else{
      for(const dx of [-.6,.6])B.get('wood').box(xx+dx,.92,zz,.4,.14,1.1,C.wood);
      for(const dx of [-1.15,1.15])for(const dz of [-.58,.58])B.get('extMetal').box(xx+dx,1.29,zz+dz,.035,.9,.035,C.dark);
      B.get('ext').box(xx,1.83,zz,2.7,.12,1.55,C.cream);
    }
    if(i<2)B.get('extMetal').box(xx+1.6,.4,zz,.4,.08,.1,C.dark);
  }
}

function stage(B,f,S,atlas){
  const {x,z,w,d}=f,r=f.rect;
  B.get('stone').box(x,.32,z,w,.64,d,'#928b7d');
  B.get('wood').box(x,.66,z,w-.1,.06,d-.1,C.wood);
  for(let xx=r.x0+.3;xx<r.x1;xx+=.4)B.get('wood').box(xx,.697,z,.012,.012,d-.2,'#715a45');
  // 两侧音箱和后景木饰面，不占台前观众通道。
  for(const dx of [-w/2+1,w/2-1]){B.get('ext').box(x+dx,1.2,r.z0+.65,.75,1.15,.65,C.dark);for(const yy of [1.0,1.4])B.get('extMetal').sphere(x+dx,yy,r.z0+.99,.2,'#172a27',.2,.025,'sphereLo');}
  B.get('wood').box(x,2.05,r.z0+.1,w-.3,2.8,.2,C.dark);
  for(let xx=r.x0+.3;xx<r.x1;xx+=.35)B.get('wood').box(xx,2.05,r.z0+.24,.06,2.8,.08,C.wood);
  B.get('ext').box(x,2.4,r.z0+.3,7,1.25,.1,C.teal);S.place(x,2.4,r.z0+.365,6.8,1.1,'S',atlas.cell(f.id));
  for(const xx of [x-4,x+4]){B.get('extMetal').cyl(xx,.68,z,.035,1.2,C.dark,8);B.get('extMetal').bar({x:xx,y:1.88,z},{x:xx+.22,y:1.88,z:z+.14},.04,C.dark);}
}

function bikes(B,f){
  const {x,z,w}=f;
  B.get('extMetal').box(x,.045,z,w,.08,.14,C.dark);
  for(let i=0;i<10;i++){
    const xx=x-w/2+.7+i*(w-1.4)/9;
    for(const dz of [-.58,.58]){
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
      B.get('extMetal').shape('torus',new THREE.Vector3(xx,.38,z+dz),q,new THREE.Vector3(.68,.68,.68),C.dark);
      for(let j=0;j<8;j++){const a=j*Math.PI/4;B.get('extMetal').bar({x:xx,y:.38,z:z+dz},{x:xx,y:.38+Math.sin(a)*.31,z:z+dz+Math.cos(a)*.31},.006,'#bac6c2');}
    }
    for(const [a,b] of [[[.0,.4],[-.1,.95]],[[-.1,.95],[.58,.4]],[[.58,.4],[.37,1.06]],[[.37,1.06],[-.1,.95]],[[0,.4],[-.58,.4]],[[-.58,.4],[-.1,.95]]])B.get('extMetal').bar({x:xx,y:a[1],z:z+a[0]},{x:xx,y:b[1],z:z+b[0]},.025,i%2?C.ochre:C.teal);
    B.get('ext').box(xx,.97,z-.12,.22,.05,.3,C.dark);B.get('extMetal').box(xx,1.09,z+.38,.44,.035,.045,C.dark);
    B.get('extMetal').box(xx,.42,z-.74,.09,.84,.1,'#afb7b1');
  }
}

function wideBench(B,f){
  const {x,z,w,d}=f;
  for(let i=0;i<5;i++)B.get('wood').box(x,.46,z-d*.3+i*d*.15,w-.14,.07,d*.13,C.wood);
  for(let i=0;i<3;i++)B.get('wood').box(x,.64+i*.14,z-d*.41,w-.14,.1,.055,C.wood);
  for(const dx of [-w*.38,w*.38]){B.get('extMetal').box(x+dx,.23,z,.055,.46,d*.74,C.dark);B.get('extMetal').box(x+dx,.61,z-d*.39,.04,.34,.045,C.dark);B.get('extMetal').box(x+dx,.77,z,.07,.045,d*.8,C.dark);}
}

function pushGeometry(B,key,geometry,color){
  const g=geometry.index?geometry.toNonIndexed():geometry;
  B.get(key).push({pos:g.attributes.position.array,nor:g.attributes.normal.array,uv:g.attributes.uv?.array,count:g.attributes.position.count},new THREE.Matrix4(),color);
  if(g!==geometry)g.dispose();geometry.dispose();
}

function gardenIsland(B,f,trees){
  const base=new THREE.ExtrudeGeometry(shapeFromPoly(f.poly),{depth:.22,bevelEnabled:false,curveSegments:4});
  base.rotateX(-Math.PI/2);base.translate(0,.025,0);
  pushGeometry(B,'forecourtStone',base,'#b7aa92');
  const inner=f.poly.map(([x,z])=>[f.x+(x-f.x)*.93,f.z+(z-f.z)*.93]);
  pushGeometry(B,'forecourtGrass',flatShapeGeometry(shapeFromPoly(inner),.257),'#779564');
  // 石材压顶接缝、低灌木与花簇顺着弧形池边连成一体。
  for(let i=0;i<f.poly.length;i+=2){
    const a=f.poly[i],b=inner[i];
    B.get('ext').bar({x:a[0],y:.251,z:a[1]},{x:b[0],y:.251,z:b[1]},.016,'#8d8a7c');
  }
  const seed=Math.round(Math.abs(f.x*31+f.z*17)),rand=rng(seed);
  const count=Math.ceil(f.w*f.d*.25),colors=['#677f4b','#809b60','#9cb078','#537347'];
  let made=0;
  for(let i=0;i<count*8&&made<count;i++){
    const x=f.x+(rand()-.5)*f.w*.85,z=f.z+(rand()-.5)*f.d*.85;
    if(!pointInPoly([x,z],inner))continue;
    const r=.22+rand()*.32;
    B.get('foliage').sphere(x,.34+r*.5,z,r,colors[made%4],r*.68,r,'ico0');
    if(made%3===0)for(let k=0;k<3;k++){
      const a=k*Math.PI*2/3;
      B.get('foliage').sphere(x+Math.cos(a)*r*.5,.44+r*.7,z+Math.sin(a)*r*.5,.075,['#e5bf64','#dddce9','#d58897'][Math.floor(made/3)%3],.065,.075,'ico0');
    }
    made++;
  }
  for(const [dx,dz,s] of f.trees||[])trees.push({x:f.x+dx,y:.25,z:f.z+dz,s,kind:'round'});
}

function zoneEdging(B,r){
  // 地面嵌石带与步行面平齐，入口轴线无需跨越台阶或围挡。
  const sides=[[[r.x0,r.z0],[r.x1,r.z0]],[[r.x1,r.z0],[r.x1,r.z1]],[[r.x1,r.z1],[r.x0,r.z1]],[[r.x0,r.z1],[r.x0,r.z0]]];
  for(const [a,b] of sides){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),n=Math.ceil(len/1.8);
    for(let i=0;i<n;i++){
      const t=(i+.5)/n;
      B.get('forecourtStone').box(a[0]+dx*t,-.012,a[1]+dz*t,len/n-.04,.022,.3,'#c4bda9',-Math.atan2(dz,dx));
    }
  }
}

function makeLabels(plan){
  const entries=[...plan.zones,...plan.items.filter(f=>f.name)].map(f=>({id:f.id,draw(g,x,y,w,h){
    g.fillStyle=C.dark;g.fillRect(x,y,w,h);g.fillStyle=C.cream;g.textAlign='center';g.textBaseline='middle';
    g.font=`600 ${f.name.length>10?30:38}px ${FONT_CN}`;g.fillText(f.name,x+w/2,y+h*.44,w-24);
    g.font=`500 16px ${FONT_EN}`;g.fillStyle='#c5b57c';g.fillText('YUNLAN COMMONS · GARDEN & PLAY',x+w/2,y+h*.82,w-24);
  }}));
  return makeSignAtlas(entries);
}

export function buildForecourt(ctx){
  const plan=ctx.layout.site.forecourt;if(!plan)return;
  const B=ctx.site.batch,S=new SignBatch(),atlas=makeLabels(plan);
  B.materials.forecourtPaving=ctx.mats.floor('paving',.85);
  B.materials.forecourtStone=ctx.mats.floor('stone',.85);
  B.materials.forecourtGrass=ctx.mats.floor('grass',.9);
  const trees=[];
  for(const zone of plan.zones){
    const r=zone.rect;B.get('forecourtPaving').box((r.x0+r.x1)/2,-.065,(r.z0+r.z1)/2,r.x1-r.x0,.08,r.z1-r.z0,zone.color);
    zoneEdging(B,r);
    // 导览柱紧靠地块边角，保留主要轴线。
    const x=r.x1-1.5,z=r.z1-1.1;B.get('wood').box(x,1.0,z,.11,2.0,.11,C.wood);B.get('ext').box(x,1.84,z,3.8,.86,.1,C.dark);
    S.place(x,1.84,z+.06,3.65,.8,'S',atlas.cell(zone.id));
  }
  let layer=0;
  for(const path of plan.paths)for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
    B.get('forecourtStone').box((a[0]+b[0])/2,-.012+(layer++)*.003,(a[1]+b[1])/2,len,.05,path.width,'#ded7c9',-Math.atan2(dz,dx));
  }
  for(const f of plan.items){
    if(f.type==='carousel')carousel(ctx,f);
    else if(f.type==='play-castle')playGarden(ctx,f);
    else if(f.type==='swings')swing(B,f.x,f.z,f.w,f.d);
    else if(f.type==='sandpit')sandpit(B,f);
    else if(f.type==='mini-train')miniTrain(B,f);
    else if(f.type==='pergola')pavilion(B,f);
    else if(f.type==='cafe-table')cafeTable(B,f);
    else if(f.type==='reading-table')cafeTable(B,f,true);
    else if(f.type==='kiosk')kiosk(B,f,S,atlas);
    else if(f.type==='stage')stage(B,f,S,atlas);
    else if(f.type==='flower-bed')planter(B,f.rect.x0,f.rect.z0,f.rect.x1,f.rect.z1,0,71);
    else if(f.type==='bench')wideBench(B,f);
    else if(f.type==='mascot')ipMascot(B,f.x,0,f.z,.63,0);
    else if(f.type==='bikes')bikes(B,f);
    else if(f.type==='garden-island')gardenIsland(B,f,trees);
  }
  addTrees(ctx.site.group,ctx.mats,trees,124);
  S.flush(ctx.site.group,new THREE.MeshBasicMaterial({map:atlas.texture}));
}
