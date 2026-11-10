// 送餐无人机和停机坪的外形。全部是程序化几何加画布贴图（机壳涂装、碳纤维、桨盘残影、保温箱、停机坪标识），
// 不依赖外部素材。机头朝 −Z（和飞行规则里的朝向一致）。
import * as THREE from 'three';

function canvasTexture(width, height, draw, { repeat = null, srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  if (repeat) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(repeat[0], repeat[1]); }
  return texture;
}

/** 机壳顶面：白色外壳、青色腰线、编号和品牌字，从上往下投影（u 沿机身左右，v 沿机身前后，机头在 v=0）。 */
function shellTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, 0);
    base.addColorStop(0, '#dfe5ea'); base.addColorStop(.5, '#fbfcfd'); base.addColorStop(1, '#dfe5ea');
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f8fa6'; g.fillRect(0, h * .36, w, h * .085);
    g.fillStyle = '#f2a23a'; g.fillRect(0, h * .445, w, h * .018);
    g.fillStyle = '#1c2b36'; g.fillRect(w * .34, 0, w * .32, h * .12); // 机头的深色整流罩
    g.strokeStyle = '#9aa7b1'; g.lineWidth = 2;
    for (const y of [.2, .62, .8]) { g.beginPath(); g.moveTo(w * .12, h * y); g.lineTo(w * .88, h * y); g.stroke(); }
    g.beginPath(); g.moveTo(w * .5, h * .62); g.lineTo(w * .5, h * .98); g.stroke();
    g.fillStyle = '#12303d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 58px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillText('云澜速递', w / 2, h * .285);
    g.font = '600 26px system-ui,sans-serif'; g.fillStyle = '#ffffff'; g.fillText('YUNLAN EXPRESS · D-07', w / 2, h * .403);
    g.fillStyle = '#51606b'; g.font = '600 22px system-ui,sans-serif'; g.fillText('MAX 5 kg', w / 2, h * .71);
    // 散热格栅
    g.fillStyle = '#2b3740';
    for (let i = 0; i < 7; i++) g.fillRect(w * .36 + i * w * .04, h * .86, w * .022, h * .07);
  });
}

/** 碳纤维编织：斜向明暗相间的小方格，可平铺。 */
function carbonTexture() {
  return canvasTexture(64, 64, (g, w) => {
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const grad = (i + j) % 2 ? g.createLinearGradient(i * s, j * s, i * s + s, j * s) : g.createLinearGradient(i * s, j * s, i * s, j * s + s);
      grad.addColorStop(0, '#14181c'); grad.addColorStop(.5, '#39424a'); grad.addColorStop(1, '#14181c');
      g.fillStyle = grad; g.fillRect(i * s, j * s, s, s);
    }
  }, { repeat: [3, 3] });
}

/** 旋转中的桨盘：一圈淡淡的残影，中心和边缘透明。 */
function rotorTexture() {
  return canvasTexture(128, 128, (g, w) => {
    const c = w / 2, grad = g.createRadialGradient(c, c, w * .06, c, c, c);
    grad.addColorStop(0, 'rgba(210,225,235,0)'); grad.addColorStop(.25, 'rgba(215,228,238,.42)');
    grad.addColorStop(.8, 'rgba(225,235,243,.3)'); grad.addColorStop(.97, 'rgba(240,246,250,.55)'); grad.addColorStop(1, 'rgba(240,246,250,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,50,58,.5)'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c - w * .44, c); g.lineTo(c + w * .44, c); g.stroke();
  });
}

/** 保温箱：橙色箱体、深色箱盖、白色品牌字和餐碗图标。四个侧面和顶面用同一张图。 */
function parcelTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f29a2e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a2f35'; g.fillRect(0, 0, w, h * .16);
    g.fillStyle = '#c97716'; g.fillRect(0, h * .9, w, h * .1);
    g.fillStyle = '#fff7e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 52px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillText('云澜外卖', w / 2, h * .72);
    // 冒热气的碗
    g.lineWidth = 9; g.strokeStyle = '#fff7e6'; g.lineCap = 'round';
    g.beginPath(); g.arc(w / 2, h * .42, 42, 0, Math.PI); g.closePath(); g.fillStyle = '#fff7e6'; g.fill();
    for (const dx of [-22, 0, 22]) { g.beginPath(); g.moveTo(w / 2 + dx, h * .36); g.quadraticCurveTo(w / 2 + dx + 10, h * .31, w / 2 + dx, h * .26); g.stroke(); }
  });
}

/** 停机坪甲板：深色防滑面、白圈和大字（取餐点写「取」，投递点写「送」）。 */
function padTexture(hub) {
  return canvasTexture(256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#2b3239'; g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,255,255,.035)';
    for (let i = 0; i < 900; i++) g.fillRect((i * 97) % w, (i * 57) % w, 2, 2);
    g.strokeStyle = hub ? '#ffb648' : '#4fd8ff'; g.lineWidth = 14;
    g.beginPath(); g.arc(c, c, w * .4, 0, Math.PI * 2); g.stroke();
    g.setLineDash([18, 12]); g.lineWidth = 5; g.strokeStyle = '#e9eef2';
    g.beginPath(); g.arc(c, c, w * .31, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#f4f7f9'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 120px "PingFang SC","Microsoft YaHei",sans-serif'; g.fillText(hub ? '取' : '送', c, c + 6);
  });
}

/**
 * 送餐无人机。返回 { group, tilt, rotors, parcel, dispose }：
 * tilt 随飞行前倾侧倾，rotors 是四个要转的桨盘，parcel 是挂在机腹下的保温箱（没载货时隐藏）。
 */
export function droneModel() {
  const group = new THREE.Group(), tilt = new THREE.Group();
  const textures = [shellTexture(), carbonTexture(), rotorTexture(), parcelTexture()];
  const [shellMap, carbonMap, rotorMap, parcelMap] = textures;
  const shellMat = new THREE.MeshStandardMaterial({ map: shellMap, roughness: 0.35, metalness: 0.1 });
  const carbonMat = new THREE.MeshStandardMaterial({ map: carbonMap, roughness: 0.45, metalness: 0.35 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8e9aa3, roughness: 0.3, metalness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b2228, roughness: 0.55, metalness: 0.2 });

  // 机身：上半是带涂装的外壳（贴图从正上方投影），下半是碳纤维底板
  const top = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const uv = top.attributes.uv, pos = top.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * .5 + .5, pos.getZ(i) * .5 + .5);
  const shell = new THREE.Mesh(top, shellMat); shell.scale.set(0.47, 0.21, 0.64);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), carbonMat); belly.scale.set(0.47, 0.11, 0.64);
  tilt.add(shell, belly);

  // 四条机臂、电机、桨
  const armGeo = new THREE.CylinderGeometry(0.032, 0.05, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const motorGeo = new THREE.CylinderGeometry(0.085, 0.1, 0.13, 16), capGeo = new THREE.CylinderGeometry(0.04, 0.085, 0.04, 16);
  const discGeo = new THREE.CircleGeometry(0.52, 28).rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({ map: rotorMap, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const rotors = [];
  for (const [x, z] of [[-0.92, -0.92], [0.92, -0.92], [-0.92, 0.92], [0.92, 0.92]]) {
    const from = new THREE.Vector3(Math.sign(x) * 0.3, 0.02, Math.sign(z) * 0.4), to = new THREE.Vector3(x, 0.06, z);
    const arm = new THREE.Mesh(armGeo, carbonMat);
    arm.position.copy(from); arm.lookAt(to); arm.scale.z = from.distanceTo(to);
    const motor = new THREE.Mesh(motorGeo, metalMat); motor.position.set(x, 0.09, z);
    const cap = new THREE.Mesh(capGeo, darkMat); cap.position.set(x, 0.175, z);
    const disc = new THREE.Mesh(discGeo, discMat); disc.position.set(x, 0.2, z); disc.renderOrder = 3;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: z < 0 ? 0x7dffb0 : 0xff5a4a }));
    led.position.set(x, 0.0, z);
    tilt.add(arm, motor, cap, disc, led); rotors.push(disc);
  }

  // 起落架：两根滑橇和四根斜撑
  const skidGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.05, 8).rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(skidGeo, darkMat); skid.position.set(sx * 0.36, -0.56, 0);
    tilt.add(skid);
    for (const sz of [-1, 1]) {
      const a = new THREE.Vector3(sx * 0.24, -0.06, sz * 0.26), b = new THREE.Vector3(sx * 0.36, -0.56, sz * 0.36);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, a.distanceTo(b), 6), darkMat);
      strut.position.copy(a).add(b).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      tilt.add(strut);
    }
  }

  // 机头下的云台相机、机背的示廓灯和天线
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), darkMat); gimbal.position.set(0, -0.11, -0.5);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 14), new THREE.MeshBasicMaterial({ color: 0x69c9ff })); lens.position.set(0, -0.115, -0.577); lens.rotation.y = Math.PI;
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); strobe.position.set(0, 0.215, 0.1);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 5), darkMat); antenna.position.set(0.12, 0.3, 0.36);
  tilt.add(gimbal, lens, strobe, antenna);

  // 挂在机腹下的保温箱
  const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.44), new THREE.MeshStandardMaterial({ map: parcelMap, roughness: 0.8 }));
  parcel.position.y = -0.3; parcel.visible = false;
  tilt.add(parcel);

  group.add(tilt);
  group.scale.setScalar(1.15);
  group.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
  return { group, tilt, rotors, parcel, strobe, dispose() { for (const t of textures) t.dispose(); } };
}

/** 停机坪的甲板：一块薄圆盘，顶面贴标识。原点在甲板顶面中心。radius 是甲板半径。 */
export function padDeck(radius, hub = false) {
  const map = padTexture(hub);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.03, 0.1, 40),
    [new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.8 }), new THREE.MeshStandardMaterial({ map, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x20262c })]);
  deck.position.y = -0.05; deck.receiveShadow = true;
  deck.rotation.y = Math.PI / 2; // 贴图的「上」朝 −Z：从南边飞来时字是正的
  deck.userData.dispose = () => map.dispose();
  return deck;
}
