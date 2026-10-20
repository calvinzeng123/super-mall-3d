import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FPS_MODEL_ASSETS } from './model-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { movementPose } from './mobility.js';

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const weaponId = value => value === 1 || value === 'pistol' || value?.id === 'pistol' ? 'pistol' : 'rifle';
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Licensed textured arms + firearms. Call render() AFTER the world render.
 * This own-light overlay uses the same renderer, an isolated depth buffer and
 * a fixed presentation FOV; weapon visibility never depends on nearby walls.
 * No downloads happen until this factory is called.
 */
export async function createViewmodel({ camera, renderer, onProgress, assets = FPS_MODEL_ASSETS } = {}) {
  if (!camera || !renderer) throw new Error('createViewmodel requires camera and renderer');
  if (!['rifle', 'pistolHands', 'pistol'].every(id => assets.some(asset => asset.id === id)))
    throw new Error('Missing licensed FPS model manifest entry');
  const roots = [], geometries = new Set(), materials = new Set(), textures = new Set();
  let disposed = false;
  const overlay = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(58, camera.aspect || 1, .01, 12);
  const rig = new THREE.Group();
  rig.name = 'YunlanLicensedFirstPersonRig';
  overlay.add(rig);
  overlay.add(new THREE.HemisphereLight(0xdce9ff, 0x303847, 2.35));
  const key = new THREE.DirectionalLight(0xffeedb, 3.6);
  key.position.set(-1, 3, 2); overlay.add(key);
  const edge = new THREE.DirectionalLight(0x9ecbff, 1.8);
  edge.position.set(2, 1, -3); overlay.add(edge);
  let loaded = 0;
  const parsed = {};
  try {
    // Sequential model parsing avoids three large decode peaks on iPhones.
    for (const record of assets) {
      onProgress?.({ stage: 'model', id: record.id, label: record.label, loaded, total: assets.length });
      const data = await fetchBinary(record.url, { label: record.label });
      const gltf = await new GLTFLoader().parseAsync(data, THREE.LoaderUtils.extractUrlBase(record.url));
      parsed[record.id] = gltf;
      roots.push(gltf.scene);
      gltf.scene.traverse(object => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
        object.castShadow = false;
        object.receiveShadow = false;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(material);
          material.envMapIntensity = .5;
          for (const value of Object.values(material)) if (value?.isTexture) {
            textures.add(value);
            value.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
          }
        }
      });
      loaded += 1;
      onProgress?.({ stage: 'model', id: record.id, label: record.label, loaded, total: assets.length });
    }
  } catch (error) {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
    throw error;
  }
  const smg = parsed.rifle, hands = parsed.pistolHands, handgun = parsed.pistol;
  if (!smg || !hands || !handgun) throw new Error('Missing licensed FPS model');

  // Both hand assets use exactly the same source textures. Reuse the loaded
  // hand materials, then release the pistol copy's duplicate GPU/bitmap data.
  const armMaterials = new Map();
  smg.scene.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      if (/Hands/.test(material.name)) armMaterials.set(material.name.replace(/\.\d+$/, ''), material);
  });
  const redundantMaterials = new Set(), redundantTextures = new Set();
  hands.scene.traverse(object => {
    if (!object.isMesh) return;
    const replace = material => {
      const shared = armMaterials.get(material.name.replace(/\.\d+$/, ''));
      if (!shared) return material;
      redundantMaterials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) redundantTextures.add(value);
      return shared;
    };
    object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
  });
  for (const material of redundantMaterials) { material.dispose(); materials.delete(material); }
  for (const texture of redundantTextures) { texture.dispose(); texture.image?.close?.(); textures.delete(texture); }

  const rifleMount = new THREE.Group(), pistolMount = new THREE.Group();
  rifleMount.name = 'SMG45Presentation'; pistolMount.name = 'DesertEaglePresentation';
  rig.add(rifleMount, pistolMount);
  rifleMount.add(smg.scene);
  smg.scene.rotation.y = Math.PI; // Source muzzle is +Z, view camera looks -Z.
  const mixer = new THREE.AnimationMixer(smg.scene);
  const reloadClip = smg.animations.find(clip => /reload/i.test(clip.name)) || smg.animations[0];
  const action = reloadClip ? mixer.clipAction(reloadClip) : null;
  if (action) { action.play(); action.paused = true; action.time = reloadClip.duration; mixer.update(0); }
  const idleTime = reloadClip?.duration || 0;
  pistolMount.add(hands.scene);
  const pistolGun = new THREE.Group();
  pistolGun.name = 'PistolAuthoredGripFit';
  pistolGun.add(handgun.scene);
  handgun.scene.scale.setScalar(.017);
  handgun.scene.rotation.y = Math.PI;
  // Original author units: grip centre (0, 16.54, -10.85). The measured
  // licensed glove primary frame is (0,.0962,-.1321), in metres.
  handgun.scene.position.set(0, .0962 - 16.5439 * .017, -.1321 - 10.8453 * .017);
  pistolMount.add(pistolGun);
  const leftArm = hands.scene.getObjectByName('LeftArm');
  const leftBase = leftArm?.position.clone();
  const magazines = [], slides = [];
  handgun.scene.traverse(object => {
    if (/^(Magazine_low|MagazineBase_low|BaseInside_low)$/.test(object.name)) magazines.push({ object, base: object.position.clone() });
    if (/^(Slide_low|Safety_low|BoltMain_low|BoltAdd_low|RearSight_low|SlidePart_low|BoltButton_low|BoltBack_low)$/.test(object.name)) slides.push({ object, base: object.position.clone() });
    if (/^(BulletCase_low|Bullet_low)$/.test(object.name)) object.visible = false;
  });

  // A tiny additive flash is generated locally; the actual weapon/hand
  // geometry, albedo, normal and roughness maps are the licensed GLBs above.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, '#fffef0'); gradient.addColorStop(.25, '#ffe6a1');
  gradient.addColorStop(.52, '#ff8e2844'); gradient.addColorStop(1, '#ff7d0000');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const flashTexture = new THREE.CanvasTexture(canvas); textures.add(flashTexture);
  const flashMaterial = new THREE.SpriteMaterial({ map: flashTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  materials.add(flashMaterial);
  const flash = new THREE.Sprite(flashMaterial); flash.scale.set(.12, .12, .12); flash.visible = false; rig.add(flash);
  const flashLight = new THREE.PointLight(0xffbd65, 0, 2, 2); rig.add(flashLight);
  let elapsed = 0, recoil = 0, flashTime = 0, aimBlend = 0, sprintBlend = 0, active = 'rifle';
  let flashPendingRender = false;
  let wasReloading = false, reloadClock = 0, wasSwitching = false, switchClock = 0, switchFrom = active;
  const presentation = { rifle: { x: .20, y: -.37, z: -.62 }, pistol: { x: .14, y: -.30, z: -.43 } };
  const worldTemplates = new Map();

  const stats = {
    loaded: true, assets: assets.map(({ id, label, bytes, license, author }) => ({ id, label, bytes, license, author })),
    downloadBytes: assets.reduce((n, asset) => n + (asset.bytes || 0), 0),
    geometries: geometries.size, materials: materials.size, textures: textures.size,
    rifleTriangles: 21425, pistolTriangles: 13279 + 13704, reloadClips: smg.animations.map(clip => clip.name),
    realTexturedMeshes: true, activeWeapon: active, disposed: false,
  };

  function update(dt, state = {}) {
    if (disposed) return;
    overlay.visible = state.visible !== false;
    dt = clamp(Number(dt) || 0, 0, .1); elapsed += dt;
    const next = weaponId(state.weapon);
    if (state.switching && !wasSwitching) { switchClock = 0; switchFrom = active; }
    if (state.switching) switchClock += dt;
    wasSwitching = Boolean(state.switching);
    const switchProgress = state.switching
      ? clamp(Number.isFinite(state.switchProgress) ? state.switchProgress : switchClock / .65, 0, 1) : 1;
    // Gameplay selects the new weapon immediately. Keep presenting the old
    // one until it is holstered below the viewport, then draw the new one.
    active = state.switching && switchProgress < .5 ? switchFrom : next;
    const swap = state.switching ? Math.sin(Math.PI * switchProgress) : 0;
    rifleMount.visible = active === 'rifle'; pistolMount.visible = active === 'pistol';
    stats.activeWeapon = active;
    const moving = typeof state.moving === 'number' ? clamp(state.moving, 0, 1) : state.moving ? 1 : 0;
    aimBlend = mix(aimBlend, state.aiming ? 1 : 0, 1 - Math.exp(-dt * 14));
    sprintBlend = mix(sprintBlend, state.sprinting && moving && !state.reloading && !state.switching ? 1 : 0, 1 - Math.exp(-dt * 10));
    stats.sprinting = sprintBlend > .5;
    stats.airborne = !!state.airborne;
    recoil *= Math.exp(-dt * 15);
    if (state.reloading || state.switching) { flashTime = 0; flashPendingRender = false; }
    else if (!flashPendingRender) flashTime = Math.max(0, flashTime - dt);
    if (state.reloading && !wasReloading) reloadClock = 0;
    if (state.reloading) reloadClock += dt;
    wasReloading = Boolean(state.reloading);
    const reload = state.reloading ? clamp(Number.isFinite(state.reloadProgress) ? state.reloadProgress : reloadClock / 2.5, 0, 1) : 0;
    const base = presentation[active];
    const portrait = clamp((1 - (camera.aspect || 1)) / .52, 0, 1);
    const modelScale = mix(1, .65, portrait);
    rig.scale.setScalar(modelScale);
    const hipX = mix(base.x, active === 'rifle' ? .09 : .065, portrait);
    const hipY = mix(base.y, -.29, portrait);
    const hipZ = mix(base.z, -.46, portrait);
    const aimY = (active === 'rifle' ? -.335 : -.26) * modelScale;
    const aimZ = mix(active === 'rifle' ? -.82 : -.56, -.64, portrait);
    const pose = movementPose(elapsed, { sprint: sprintBlend, moving, aiming: aimBlend,
      airborne: state.airborne ? 1 : 0, landing: Number(state.landing) || 0 });
    const kick = Math.max(recoil, Number(state.recoil) || 0);
    rig.position.set(
      mix(hipX, active === 'rifle' ? 0 : -.005, aimBlend) + pose.x,
      mix(hipY, aimY, aimBlend) + pose.y - swap * .55,
      mix(hipZ, aimZ, aimBlend) + pose.z + kick * .055 + swap * .18,
    );
    rig.rotation.set(pose.rx + kick * .08 + swap * .15, pose.ry, pose.rz - swap * .2);
    if (action) {
      action.time = state.reloading && active === 'rifle' ? reload * idleTime : idleTime;
      mixer.update(0);
    }
    const pistolReload = state.reloading && active === 'pistol' ? Math.sin(reload * Math.PI) : 0;
    pistolMount.rotation.z = -.32 * pistolReload;
    pistolMount.rotation.x = .13 * pistolReload;
    if (leftArm) {
      leftArm.position.copy(leftBase);
      leftArm.position.y -= .27 * pistolReload;
      leftArm.position.z += .08 * pistolReload;
      leftArm.rotation.z = -.12 * pistolReload;
    }
    const magazineTravel = state.reloading && active === 'pistol'
      ? ease((reload - .12) / .18) * (1 - ease((reload - .65) / .18)) : 0;
    for (const { object, base: original } of magazines) {
      object.position.copy(original); object.position.y -= magazineTravel * 15;
      object.visible = !(magazineTravel > .98 && reload > .40 && reload < .57);
    }
    const slideTravel = state.reloading && active === 'pistol' ? Math.sin(Math.PI * clamp((reload - .80) / .15, 0, 1)) * 2.8 : kick * 2.5;
    for (const { object, base: original } of slides) { object.position.copy(original); object.position.z -= slideTravel; }
    flash.position.set(active === 'rifle' ? 0 : 0, active === 'rifle' ? .28 : .20, active === 'rifle' ? -.82 : -.43);
    flash.visible = flashTime > 0 && !state.reloading && !state.switching;
    flash.material.rotation = elapsed * 27;
    flashLight.position.copy(flash.position); flashLight.intensity = flash.visible ? .7 : 0;
    overlay.updateMatrixWorld(true);
  }

  function render() {
    if (disposed || !overlay.visible) return;
    const aspect = camera.aspect || 1;
    if (viewCamera.aspect !== aspect) { viewCamera.aspect = aspect; viewCamera.updateProjectionMatrix(); }
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.clearDepth();
      renderer.render(overlay, viewCamera);
      // Even a frame slower than the 45 ms flash lifetime must display the
      // shot once; updates alone cannot consume an unrendered flash.
      if (flash.visible) flashPendingRender = false;
    } finally { renderer.autoClear = autoClear; }
  }

  /** Shared geometry/material clone, barrel +Z, primary grip at origin.
   * Parent owns only the returned Object3D; do not dispose its shared assets.
   * All such instances must be removed before the viewmodel is disposed.
   */
  function createWorldWeapon(value = 'rifle') {
    if (disposed) throw new Error('FPS viewmodel was disposed');
    const id = weaponId(value);
    if (!worldTemplates.has(id)) {
      // Sample the rifle's authored ready pose so a reload in progress never
      // leaves world actors holding an extracted magazine.
      const savedTime = action?.time;
      if (action) { action.time = idleTime; mixer.update(0); }
      overlay.updateMatrixWorld(true);
      const source = id === 'rifle' ? smg.scene : handgun.scene;
      const inverse = source.matrixWorld.clone().invert();
      const template = new THREE.Group(); template.name = `${id}-shared-world-weapon`;
      source.traverse(object => {
        if (!object.isMesh || object.isSkinnedMesh || /Arm/.test(object.name) || /Bullet|ChamberedRound/.test(object.name)) return;
        const mesh = new THREE.Mesh(object.geometry, object.material);
        mesh.name = object.name;
        mesh.matrix.copy(inverse).multiply(object.matrixWorld); mesh.matrixAutoUpdate = false;
        template.add(mesh);
      });
      const frame = new THREE.Group();
      if (id === 'rifle') {
        const extent = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());
        const scale = .65 / extent.z;
        template.scale.setScalar(scale); template.position.set(0, -.14 * scale, -.20 * scale);
      } else { template.scale.setScalar(.0116); template.position.set(0, -16.5439 * .0116, 10.8453 * .0116); }
      frame.add(template); worldTemplates.set(id, frame);
      if (action) { action.time = savedTime; mixer.update(0); }
    }
    return worldTemplates.get(id).clone(true);
  }

  update(0, { weapon: 'rifle' });
  return {
    update, render, stats, createWorldWeapon,
    fire() { if (!disposed) { recoil = 1; flashTime = .045; flashPendingRender = true; } },
    dispose() {
      if (disposed) return; disposed = true; stats.disposed = true;
      mixer.stopAllAction(); mixer.uncacheRoot(smg.scene);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) { texture.dispose(); texture.image?.close?.(); }
      worldTemplates.clear(); overlay.clear(); roots.length = 0;
    },
  };
}
