import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Replaced by build-viewer.mjs. No external model, font, texture or CDN request.
const MODEL_URL = __RESIDENTIAL_MODEL__;
const PLAN = __RESIDENTIAL_PLAN__;
const BUILD = __RESIDENTIAL_BUILD__;
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const blender = ([x, y, z = 0]) => new THREE.Vector3(x, z, -y);
const names = Object.fromEntries(BUILD.views.map(view => [view.id, view.label]));
const config = PLAN.viewer || {};
const lighting = config.lighting || {};
const legacy = BUILD.unit === '03';
const envelope = PLAN.envelope?.outer_rect || [0, 0, 17.6, 11.5];
const balconyRect = PLAN.balcony?.rect || envelope;
const footprint = [Math.min(envelope[0], balconyRect[0]), Math.min(envelope[1], balconyRect[1]), Math.max(envelope[2], balconyRect[2]), Math.max(envelope[3], balconyRect[3])];
const center = [(footprint[0] + footprint[2]) / 2, (footprint[1] + footprint[3]) / 2];
const planWidth = legacy ? 21 : footprint[2] - footprint[0] + 2.4;
const planHeight = legacy ? 17 : footprint[3] - footprint[1] + 2.4;
const walkBounds = config.walkBounds || { min: [footprint[0] - 5, footprint[1] - 5, .18], max: [footprint[2] + 5, footprint[3] + 5, 25] };

// Authored positions and bounds use Blender's east/north/up axes. The 03
// presets remain compatible; other plans expose only their declared views.
const presets = {
  overview: { position: [26.5, -23, 24], target: [8.8, 4.1, .7], fov: 35, roof: false },
  plan: { position: [8.8, 4.35, 35], target: [8.8, 4.35, 0], roof: false },
  living: { position: [10.8, 1.8, 1.65], target: [5.5, 3.8, 1.12], fov: 70, roof: true },
  dining: { position: [8.4, 5.8, 1.62], target: [10.6, 8, 1.1], fov: 70, roof: true },
  master: { position: [13.5, 7.6, 1.65], target: [15.6, 10.3, 1.05], fov: 68, roof: true },
  bedroom2: { position: [1.55, 7.95, 1.58], target: [3.3, 10, .85], fov: 68, roof: true },
  bedroom3: { position: [16.3, 7.9, 1.6], target: [14.8, 10, .85], fov: 68, roof: true },
  guest: { position: [15.55, 2.1, 1.6], target: [13.25, .85, .9], fov: 70, roof: true },
  bath: { position: [3.98, 2.94, 1.6], target: [4.65, 4.76, 1.05], fov: 76, roof: true },
  commonBath: { position: [10.3, 9.67, 1.62], target: [11.9, 10.6, 1], fov: 76, roof: true },
  kitchen: { position: [7.7, 7.7, 1.65], target: [7.1, 10.3, 1.15], fov: 68, roof: true },
  balcony: { position: [6.4, -2.25, 1.65], target: [9.7, .9, 1.25], fov: 72, roof: true },
};
if (!legacy) {
  const extent = Math.max(footprint[2] - footprint[0], footprint[3] - footprint[1]);
  presets.overview = { position: [center[0] + extent, center[1] - extent * 1.6, extent * 1.4], target: [...center, .6], fov: 35, roof: false };
  presets.plan = { position: [...center, 35], target: [...center, 0], roof: false };
}
const authoredViews = PLAN?.viewer?.views || PLAN?.viewerViews || PLAN?.views || {};
for (const [key, value] of Array.isArray(authoredViews) ? authoredViews.map(value => [value.id, value]) : Object.entries(authoredViews)) {
  const id = key === 'primary' ? 'master' : key;
  if (value?.position?.length === 3 && value?.target?.length === 3) presets[id] = { ...presets[id], ...value };
}
for (const id of Object.keys(presets)) if (!(id in names)) delete presets[id];
const walkStart = config.walkStart || ('living' in presets ? 'living' : Object.keys(presets).find(id => !['overview','plan'].includes(id)));
function roomCenter(room) {
  const rects = room.floor_rects || [];
  const rect = rects.reduce((largest, rect) => !largest || (rect[2]-rect[0])*(rect[3]-rect[1]) > (largest[2]-largest[0])*(largest[3]-largest[1]) ? rect : largest, null);
  return rect ? [(rect[0]+rect[2])/2, (rect[1]+rect[3])/2] : null;
}

async function main() {
  const canvas = $('viewer');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting.dayExposure ?? .93;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const perspective = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .035, 250);
  const orthographic = new THREE.OrthographicCamera(-12, 12, 12, -12, .05, 200);
  let camera = perspective;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = .075;
  controls.minDistance = .25; controls.maxDistance = 85;
  controls.maxPolarAngle = Math.PI / 2 - .015;
  controls.target.copy(blender(presets.overview.target));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, .035);
  scene.environment = environment.texture;
  roomEnvironment.dispose(); pmrem.dispose();
  const hemisphere = new THREE.HemisphereLight('#fff2db', '#829183', 1.5);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight('#fff0d2', 2.5);
  sun.position.copy(blender(lighting.sunPosition || (legacy ? [12,-12,20] : [center[0]+5,center[1]-16,20]))); sun.target.position.copy(blender(legacy ? [8.8,4.1,0] : [center[0],center[1],0]));
  sun.castShadow = !mobile;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: .5, far: 70 });
  sun.shadow.bias = -.0002; sun.shadow.normalBias = .018;
  scene.add(sun, sun.target);

  $('load-status').textContent = '正在展开模型与内嵌贴图…';
  const binary = atob(MODEL_URL.slice(MODEL_URL.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const model = gltf.scene;
  model.name = BUILD.identity;
  scene.add(model); model.updateMatrixWorld(true);
  const roofObjects = [], authoredLights = [], meshes = [], resizedImages = new WeakMap();
  let importedLightCount = 0;
  const roofPattern = /roof|ceiling|屋顶|天花|顶盖|顶板/i;
  model.traverse(object => {
    if (roofPattern.test(object.name) || object.userData.viewerRole === 'roof') roofObjects.push(object);
    if (object.isLight) {
      importedLightCount++;
      // Blender exports its sun in photometric units. Use this viewer's
      // calibrated daylight instead of stacking a second very bright sun.
      if (object.isDirectionalLight) object.visible = false;
      else authoredLights.push({ light: object, intensity: object.intensity, position: new THREE.Vector3() });
    }
    if (!object.isMesh) return;
    meshes.push(object);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.castShadow = materials.some(material => !material.transparent);
    object.receiveShadow = true;
    for (const material of materials) {
      if (material.transparent) material.depthWrite = false;
      material.envMapIntensity = .65;
      for (const texture of Object.values(material)) if (texture?.isTexture) {
        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), mobile ? 4 : 8);
        const image = texture.image;
        if (mobile && image && Math.max(image.width || 0, image.height || 0) > 512) {
          let reduced = resizedImages.get(image);
          if (!reduced) {
            reduced = document.createElement('canvas');
            const ratio = 512 / Math.max(image.width, image.height);
            reduced.width = Math.max(1, Math.round(image.width * ratio)); reduced.height = Math.max(1, Math.round(image.height * ratio));
            reduced.getContext('2d').drawImage(image, 0, 0, reduced.width, reduced.height);
            resizedImages.set(image, reduced);
          }
          texture.image = reduced; texture.needsUpdate = true;
        }
      }
    }
  });
  // glTF does not encode Blender AREA lamps. A local warm rig preserves room
  // lighting in this standalone viewer, with no image or decoder dependency.
  if (!authoredLights.length) {
    const legacyRoomLamps = [
      ['living west',7.4,2.3,19],['living east',10.6,2.7,19],['dining',10.6,7.4,24],
      ['primary',1.7,2,15],['primary entry',2.6,4.7,7],['guest',16.1,1.2,15],
      ['northwest bedroom',2.3,9,18],['northeast bedroom',16,9,18],['kitchen',6.1,9.7,19],
      ['foyer',8.65,10.2,10],['west gallery',4.8,6.2,10],['east gallery',15.6,6.2,10],
      ['primary bath',4.6,4.05,12],['guest bath',16.5,4.05,12],['common bath',11.25,10.4,12],
      ['laundry',13.1,10.5,8],['balcony',9,-1.25,10],
    ];
    const roomLamps = lighting.roomLamps || (legacy ? legacyRoomLamps : (PLAN.rooms || []).map(room => {
      const position = roomCenter(room);
      return position ? [room.id, ...position, /bath|laundry|gallery|foyer/.test(room.id) ? 12 : 19] : null;
    }).filter(Boolean));
    for (const [name,x,y,rawPower] of roomLamps) {
      const power = rawPower * (lighting.powerScale ?? 1);
      const light = new THREE.SpotLight('#ffe4c2',power,6.5,1.06,.65,2);
      light.name = `Viewer warm ${name}`; light.position.copy(blender([x,y,2.70]));
      light.target.position.copy(blender([x,y,0]));
      scene.add(light,light.target);
      authoredLights.push({light,intensity:power,position:new THREE.Vector3()});
    }
    const legacyTaskLamps = [
      ['bedside',[.56,3.65,2.40],[1.45,3.65,.8],2.5],
      ['media wash',[6.55,2.9,2.6],[5.6,2.9,1.2],4],
      ['kitchen worktop',[5.25,9.65,1.58],[5.45,9.65,.9],1.5],
    ];
    for (const [name,p,t,rawPower] of lighting.taskLamps || (legacy ? legacyTaskLamps : [])) {
      const power = rawPower * (lighting.powerScale ?? 1);
      const light = new THREE.SpotLight('#ffdcaf',power,3.5,.9,.75,2);
      light.name = `Viewer task ${name}`; light.position.copy(blender(p)); light.target.position.copy(blender(t));
      scene.add(light,light.target); authoredLights.push({light,intensity:power,position:new THREE.Vector3()});
    }
  }
  const importedBounds = new THREE.Box3().setFromObject(model);
  const state = { ready: false, view: 'overview', roof: false, night: false, walking: false, error: null };
  let yaw = 0, pitch = 0, drag = null, lightClock = 0;
  const keys = new Set(), forward = new THREE.Vector3(), right = new THREE.Vector3(), direction = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const maxLights = mobile ? 10 : 18;

  function viewFov(id) {
    const base = presets[id]?.fov || 68;
    // Preserve the full apartment width on portrait screens.
    return id === 'overview' ? Math.max(base, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(22)) / perspective.aspect))) : base;
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    perspective.aspect = innerWidth / innerHeight; perspective.fov = viewFov(state.view); perspective.updateProjectionMatrix();
    const aspect = innerWidth / innerHeight, viewHeight = Math.max(planHeight, planWidth / aspect);
    orthographic.left = -viewHeight * aspect / 2; orthographic.right = viewHeight * aspect / 2;
    orthographic.top = viewHeight / 2; orthographic.bottom = -viewHeight / 2;
    orthographic.updateProjectionMatrix();
  }
  function roof(visible) {
    state.roof = !!visible;
    for (const object of roofObjects) object.visible = state.roof;
    $('roof-button').setAttribute('aria-pressed', String(state.roof));
    $('roof-button').textContent = state.roof ? '隐藏屋顶' : '显示屋顶';
  }
  function updateLights() {
    // Keep imported lighting in the room, while limiting shader light count for
    // mobile. This is a room viewer, never a clone of all campus lighting.
    const point = state.walking ? camera.position : controls.target;
    const ranked = authoredLights.map(record => {
      record.light.getWorldPosition(record.position);
      return { ...record, distance: record.position.distanceToSquared(point) };
    }).sort((a, b) => a.distance - b.distance);
    for (const [i, record] of ranked.entries()) {
      record.light.visible = i < maxLights;
      record.light.intensity = record.intensity * (state.night ? 1 : .48);
    }
  }
  function night(on) {
    state.night = !!on;
    scene.background = new THREE.Color(state.night ? '#23332e' : '#dfe7df');
    scene.environmentIntensity = state.night ? (lighting.nightEnvironment ?? .3) : (lighting.dayEnvironment ?? 1);
    hemisphere.intensity = state.night ? (lighting.nightHemisphere ?? .3) : (lighting.dayHemisphere ?? 1.5);
    sun.intensity = state.night ? (lighting.nightSun ?? .14) : (lighting.daySun ?? 2.5);
    sun.color.set(state.night ? '#c2d3eb' : '#fff0d2');
    renderer.toneMappingExposure = state.night ? (lighting.nightExposure ?? 1.05) : (lighting.dayExposure ?? .93);
    $('night-button').setAttribute('aria-pressed', String(state.night));
    $('night-button').textContent = state.night ? '切换日景' : '切换夜景';
    updateLights();
  }
  function label() {
    $('view-label').textContent = `${names[state.view] || BUILD.identity} · ${state.walking ? '自由漫游' : state.view === 'plan' ? '平面查看' : '轨道查看'}`;
    $('controls-hint').textContent = state.walking
      ? mobile ? '按住方向键移动 · 拖动画面看向' : 'WASD 移动 · 拖动看向 · Q / E 升降 · Esc 退出'
      : state.view === 'plan' ? mobile ? '双指缩放 · 拖动平移' : '拖动平移 · 滚轮缩放'
        : mobile ? '单指旋转 · 双指缩放或平移' : '拖动旋转 · 滚轮缩放 · 右键平移';
    document.body.classList.toggle('walking', state.walking);
    $('walk-button').setAttribute('aria-pressed', String(state.walking));
    $('walk-button').textContent = state.walking ? '退出漫游' : '自由漫游';
    $('walk-pad').hidden = !state.walking || !mobile;
  }
  function walk(on) {
    const next = !!on;
    if (next && (camera === orthographic || state.view === 'overview' || camera.position.y > 5)) view(walkStart);
    state.walking = next; controls.enabled = !next; keys.clear(); drag = null;
    if (next) {
      euler.setFromQuaternion(camera.quaternion, 'YXZ'); yaw = euler.y; pitch = euler.x;
      canvas.focus({ preventScroll: true });
    } else {
      camera.getWorldDirection(direction); controls.target.copy(camera.position).addScaledVector(direction, 2.5);
      controls.update();
    }
    label();
  }
  function view(id) {
    const preset = presets[id]; if (!preset) return;
    if (state.walking) walk(false);
    state.view = id;
    camera = id === 'plan' ? orthographic : perspective;
    camera.up.set(0, id === 'plan' ? 0 : 1, id === 'plan' ? -1 : 0);
    if (camera.isPerspectiveCamera) { camera.fov = viewFov(id); camera.updateProjectionMatrix(); }
    else { camera.zoom = 1; camera.updateProjectionMatrix(); }
    camera.position.copy(blender(preset.position));
    controls.object = camera; controls.target.copy(blender(preset.target)); camera.lookAt(controls.target);
    controls.enableRotate = id !== 'plan';
    controls.mouseButtons.LEFT = id === 'plan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = id === 'plan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.maxPolarAngle = id === 'overview' ? Math.PI / 2 - .015 : Math.PI - .03;
    controls.update(); roof(preset.roof ?? !['overview', 'plan'].includes(id));
    for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === id));
    document.querySelector(`[data-view="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('compass').hidden = id !== 'plan';
    label(); updateLights();
  }

  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => view(button.dataset.view));
  $('roof-button').addEventListener('click', () => roof(!state.roof));
  $('night-button').addEventListener('click', () => night(!state.night));
  $('walk-button').addEventListener('click', () => walk(!state.walking));
  $('fullscreen-button').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* browser may restrict fullscreen for local pages */ }
  });
  if (!document.documentElement.requestFullscreen) $('fullscreen-button').hidden = true;
  document.addEventListener('fullscreenchange', () => { $('fullscreen-button').textContent = document.fullscreenElement ? '退出全屏' : '全屏'; });
  addEventListener('resize', resize);
  addEventListener('keydown', event => {
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable || event.metaKey || event.altKey || event.ctrlKey) return;
    if (event.code === 'KeyF' && !event.repeat) { event.preventDefault(); walk(!state.walking); return; }
    if (event.code === 'Escape' && state.walking) { event.preventDefault(); walk(false); return; }
    if (state.walking && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { keys.add(event.code); event.preventDefault(); }
  });
  addEventListener('keyup', event => keys.delete(event.code));
  addEventListener('blur', () => { keys.clear(); drag = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
  canvas.addEventListener('pointerdown', event => {
    if (!state.walking) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!state.walking || drag?.id !== event.pointerId) return;
    yaw -= (event.clientX - drag.x) * .003; pitch -= (event.clientY - drag.y) * .003;
    pitch = clamp(pitch, -1.45, 1.45); drag.x = event.clientX; drag.y = event.clientY;
    camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0, 'YXZ'));
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { drag = null; });
  for (const button of document.querySelectorAll('[data-key]')) {
    button.addEventListener('pointerdown', event => { if (!state.walking) return; event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.key); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => keys.delete(button.dataset.key));
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  const clock = new THREE.Clock();
  function animate() {
    const dt = Math.min(clock.getDelta(), .05);
    if (state.walking) {
      camera.getWorldDirection(forward); forward.y = 0; forward.normalize(); right.crossVectors(forward, camera.up).normalize();
      const speed = dt * ((keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 5.2 : 2.05);
      direction.set(0, 0, 0);
      if (keys.has('KeyW')) direction.add(forward); if (keys.has('KeyS')) direction.sub(forward);
      if (keys.has('KeyD')) direction.add(right); if (keys.has('KeyA')) direction.sub(right);
      if (keys.has('KeyE')) direction.y += 1; if (keys.has('KeyQ')) direction.y -= 1;
      if (direction.lengthSq()) camera.position.addScaledVector(direction.normalize(), speed);
      camera.position.y = clamp(camera.position.y, walkBounds.min[2], walkBounds.max[2]);
      if (!legacy || config.walkBounds) {
        camera.position.x = clamp(camera.position.x, walkBounds.min[0], walkBounds.max[0]);
        camera.position.z = clamp(camera.position.z, -walkBounds.max[1], -walkBounds.min[1]);
      }
    } else controls.update();
    lightClock += dt;
    if (lightClock > .4) { lightClock = 0; updateLights(); }
    renderer.render(scene, camera);
  }
  resize(); night(false); view('overview');
  const textureSet = new Set();
  for (const mesh of meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) for (const value of Object.values(material)) if (value?.isTexture) textureSet.add(value);
  window.__residentialViewer = {
    state, scene, model, renderer, controls, build: BUILD, plan: PLAN,
    get camera() { return camera; },
    stats: { meshes: meshes.length, textures: textureSet.size, authoredLights: importedLightCount, activeLightingRig: authoredLights.length, roofObjects: roofObjects.length, mobile, viewIds: Object.keys(names), walkBounds, bounds: { min: importedBounds.min.toArray(), max: importedBounds.max.toArray() } },
    setView: view, setNight: night, setRoofVisible: roof, setWalk: walk,
  };
  state.ready = true; $('loading').hidden = true;
  renderer.setAnimationLoop(animate);
}

$('retry').addEventListener('click', () => location.reload());
main().catch(error => {
  console.error(error);
  $('load-status').textContent = `模型没有载入成功：${error.message || error}。请使用支持 WebGL 2 的浏览器打开此文件。`;
  $('retry').hidden = false;
  window.__residentialViewer = { state: { ready: false, error: String(error) } };
});
