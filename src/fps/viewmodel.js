import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FPS_MODEL_ASSETS } from './model-data.js';
import { fetchBinary } from '../render/fetch-binary.js';
import { movementPose } from './mobility.js';

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const weaponId = value => value === 1 || value === 'pistol' || value?.id === 'pistol' ? 'pistol' : 'rifle';
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const NO_POSE = Object.freeze({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 });

/** Exponential damping shared by ADS/sprint/slide/look blending. Returns a
 * number so the per-frame path never allocates; dt is clamped by the caller. */
export function dampValue(current, target, dt, rate = 12) {
  const amount = 1 - Math.exp(-Math.max(0, Number(dt) || 0) * Math.max(.001, Number(rate) || 0));
  return current + (target - current) * amount;
}

/** Per-weapon recoil: the pistol kicks harder, the SMG climbs on a five-shot
 * alternating pattern, and shouldering (ADS) damps the whole impulse. */
export const RECOIL = Object.freeze({
  rifle: Object.freeze({ kick: .95, pitch: .009, yaw: .014, roll: .012,
    pattern: Object.freeze([1, -.62, .38, -.86, .5]) }),
  pistol: Object.freeze({ kick: 1.35, pitch: .022, yaw: .02, roll: .018,
    pattern: Object.freeze([1, -.7]) }),
});
export function recoilOffset(value = 'rifle', shot = 0, ads = 0) {
  const config = RECOIL[weaponId(value)];
  const index = Math.abs(Math.floor(Number(shot) || 0)) % config.pattern.length;
  const sway = config.pattern[index], damp = 1 - .45 * clamp(Number(ads) || 0, 0, 1);
  return { kick: config.kick * damp, pitch: config.pitch * damp,
    yaw: config.yaw * sway * damp, roll: config.roll * sway * damp };
}

/** Procedural knife swing 0..1: wind up, slash across the screen, recover.
 * Pure pose offsets (metres/radians) so the animation can be unit-tested. */
export const KNIFE_SWING = Object.freeze({ duration: .52, impactAt: .5 });
export function knifeSwing(progress) {
  const t = clamp(Number(progress) || 0, 0, 1);
  const lift = Math.sin(Math.PI * clamp(t / .55, 0, 1));
  const strike = Math.sin(Math.PI * clamp((t - .28) / .45, 0, 1));
  return { x: .16 * lift - .10 * strike, y: .12 * lift - .14 * strike, z: -.10 * lift - .12 * strike,
    rx: -.5 * lift + .65 * strike, ry: -.85 * lift + 1.35 * strike, rz: -.3 * lift + .4 * strike };
}

/** Procedural grenade throw 0..1: raise, toss, release. `release` is the
 * fraction after which the grenade has left the hand and must be hidden. */
export const GRENADE_THROW = Object.freeze({ duration: .72, releaseAt: .52 });
export function grenadeThrow(progress) {
  const t = clamp(Number(progress) || 0, 0, 1);
  const raise = Math.sin(Math.PI * clamp(t / .6, 0, 1));
  const toss = Math.sin(Math.PI * clamp((t - .3) / .4, 0, 1));
  return { x: -.18 * raise + .12 * toss, y: .16 * raise - .10 * toss, z: -.12 * raise - .16 * toss,
    rx: -.55 * raise + .8 * toss, ry: .35 * raise - .55 * toss, rz: -.18 * raise + .25 * toss,
    release: clamp((t - GRENADE_THROW.releaseAt) / .12, 0, 1) };
}

/** Extra weapon-only offset layered on the body slide pose: the gun is pulled
 * in and canted so it does not clip the legs mid-slide. */
export function slideViewPose(blend = 0, progress = 0) {
  const b = clamp(Number(blend) || 0, 0, 1), p = clamp(Number(progress) || 0, 0, 1);
  const hold = Math.min(1, p / .18) * (1 - .25 * clamp((p - .7) / .3, 0, 1));
  return { x: -.035 * b * hold, y: -.06 * b * hold, z: .05 * b * hold,
    rx: .1 * b * hold, ry: .16 * b * hold, rz: -.12 * b * hold };
}

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
  // Second muzzle-flash flavour: alternating shots swap shape and spin so
  // sustained fire never looks like one frozen frame.
  const flashMaterialAlt = flashMaterial.clone();
  materials.add(flashMaterialAlt);
  const flashAlt = new THREE.Sprite(flashMaterialAlt); flashAlt.scale.set(.17, .17, .17); flashAlt.visible = false; rig.add(flashAlt);
  const flashLight = new THREE.PointLight(0xffbd65, 0, 2, 2); rig.add(flashLight);

  // Procedural melee knife and frag grenade: small owned geometries/materials,
  // no external asset. Both live under the rig and are disposed with it.
  const knifeMount = new THREE.Group();
  knifeMount.name = 'YunlanProceduralKnife';
  rig.add(knifeMount);
  const steelMaterial = new THREE.MeshStandardMaterial({ color: 0xaab6c4, metalness: .85, roughness: .3 });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x20242a, metalness: .25, roughness: .8 });
  const oliveMaterial = new THREE.MeshStandardMaterial({ color: 0x3c4a2e, metalness: .15, roughness: .82 });
  materials.add(steelMaterial); materials.add(gripMaterial); materials.add(oliveMaterial);
  const knifeShape = new THREE.Shape();
  knifeShape.moveTo(0, -.016); knifeShape.lineTo(.17, -.016); knifeShape.lineTo(.205, 0);
  knifeShape.lineTo(.17, .016); knifeShape.lineTo(0, .016); knifeShape.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(knifeShape, { depth: .005, bevelEnabled: true,
    bevelThickness: .0012, bevelSize: .0012, bevelSegments: 1 });
  const handleGeometry = new THREE.BoxGeometry(.022, .026, .075);
  const guardGeometry = new THREE.BoxGeometry(.05, .012, .016);
  geometries.add(bladeGeometry); geometries.add(handleGeometry); geometries.add(guardGeometry);
  const blade = new THREE.Mesh(bladeGeometry, steelMaterial);
  blade.rotation.y = Math.PI / 2; // Side profile built on +X; point the edge down -Z.
  const knifeHandle = new THREE.Mesh(handleGeometry, gripMaterial);
  knifeHandle.position.set(0, 0, .038);
  const knifeGuard = new THREE.Mesh(guardGeometry, steelMaterial);
  knifeGuard.position.set(0, 0, .002);
  knifeMount.add(blade, knifeGuard, knifeHandle);
  const KNIFE_BASE = Object.freeze({ x: .19, y: -.27, z: -.46, rx: -.22, ry: .12, rz: .3 });
  knifeMount.position.set(KNIFE_BASE.x, KNIFE_BASE.y, KNIFE_BASE.z);
  knifeMount.rotation.set(KNIFE_BASE.rx, KNIFE_BASE.ry, KNIFE_BASE.rz);
  knifeMount.visible = false;

  const grenadeMount = new THREE.Group();
  grenadeMount.name = 'YunlanProceduralFragGrenade';
  rig.add(grenadeMount);
  const grenadeBodyGeometry = new THREE.CylinderGeometry(.031, .031, .068, 10);
  const grenadeCapGeometry = new THREE.CylinderGeometry(.015, .015, .02, 8);
  const grenadeLeverGeometry = new THREE.BoxGeometry(.008, .05, .012);
  geometries.add(grenadeBodyGeometry); geometries.add(grenadeCapGeometry); geometries.add(grenadeLeverGeometry);
  const grenadeBody = new THREE.Mesh(grenadeBodyGeometry, oliveMaterial);
  const grenadeCap = new THREE.Mesh(grenadeCapGeometry, steelMaterial);
  grenadeCap.position.y = .044;
  const grenadeLever = new THREE.Mesh(grenadeLeverGeometry, steelMaterial);
  grenadeLever.position.set(.034, .028, 0);
  grenadeMount.add(grenadeBody, grenadeCap, grenadeLever);
  const GRENADE_BASE = Object.freeze({ x: .17, y: -.23, z: -.42, rx: .25, ry: -.2, rz: .15 });
  grenadeMount.position.set(GRENADE_BASE.x, GRENADE_BASE.y, GRENADE_BASE.z);
  grenadeMount.rotation.set(GRENADE_BASE.rx, GRENADE_BASE.ry, GRENADE_BASE.rz);
  grenadeMount.visible = false;

  let elapsed = 0, recoil = 0, flashTime = 0, aimBlend = 0, sprintBlend = 0, active = 'rifle';
  let flashPendingRender = false, flashAltShot = 0, shotIndex = 0;
  let wasReloading = false, reloadClock = 0, wasSwitching = false, switchClock = 0, switchFrom = active;
  // Smooth presentation state. Scalars only: the update loop allocates nothing.
  let lookX = 0, lookY = 0, slideBlend = 0, settle = 0, knifeBlend = 0, throwBlend = 0;
  let meleeClock = 0, meleeActive = false, throwClock = 0, throwActive = false;
  const kick = { pitch: 0, yaw: 0, roll: 0 };
  const presentation = { rifle: { x: .20, y: -.37, z: -.62 }, pistol: { x: .14, y: -.30, z: -.43 } };
  const worldTemplates = new Map();

  const stats = {
    loaded: true, assets: assets.map(({ id, label, bytes, license, author }) => ({ id, label, bytes, license, author })),
    downloadBytes: assets.reduce((n, asset) => n + (asset.bytes || 0), 0),
    geometries: geometries.size, materials: materials.size, textures: textures.size,
    rifleTriangles: 21425, pistolTriangles: 13279 + 13704, reloadClips: smg.animations.map(clip => clip.name),
    realTexturedMeshes: true, activeWeapon: active, disposed: false,
    melee: false, throwing: false, slide: 0, empty: false, settling: false,
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
    aimBlend = dampValue(aimBlend, state.aiming ? 1 : 0, dt, state.aiming ? 15 : 10);
    const sprintTarget = state.sprinting && moving && !state.reloading && !state.switching ? 1 : 0;
    const previousSprint = sprintBlend;
    // Sprint enters quickly, then settles back slower so the gun visibly
    // decelerates instead of snapping to the idle pose.
    sprintBlend = dampValue(sprintBlend, sprintTarget, dt, sprintTarget > sprintBlend ? 10 : 6);
    if (previousSprint > .3 && sprintBlend <= .3) settle = Math.min(1, previousSprint);
    settle *= Math.exp(-dt * 4.5);
    const settleWobble = settle * Math.sin(elapsed * 9.5);
    stats.sprinting = sprintBlend > .5;
    stats.airborne = !!state.airborne;
    stats.settling = settle > .05;
    // One-shot utility animations: game progress wins, local clocks otherwise.
    let meleeProgress = null, throwProgress = null;
    if (typeof state.meleeProgress === 'number') { meleeActive = false; meleeProgress = clamp(state.meleeProgress, 0, 1); }
    else if (meleeActive) {
      meleeClock += dt; meleeProgress = clamp(meleeClock / KNIFE_SWING.duration, 0, 1);
      if (meleeProgress >= 1) meleeActive = false;
    }
    if (typeof state.throwProgress === 'number') { throwActive = false; throwProgress = clamp(state.throwProgress, 0, 1); }
    else if (throwActive) {
      throwClock += dt; throwProgress = clamp(throwClock / GRENADE_THROW.duration, 0, 1);
      if (throwProgress >= 1) throwActive = false;
    }
    const slideTarget = typeof state.sliding === 'number' ? clamp(state.sliding, 0, 1) : state.sliding ? 1 : 0;
    slideBlend = dampValue(slideBlend, slideTarget, dt, 16);
    const slideProgress = clamp(Number(state.slideProgress) || 0, 0, 1);
    stats.slide = slideBlend;
    stats.melee = meleeProgress !== null;
    stats.throwing = throwProgress !== null;
    recoil *= Math.exp(-dt * 15);
    kick.pitch *= Math.exp(-dt * 12);
    kick.yaw *= Math.exp(-dt * 9);
    kick.roll *= Math.exp(-dt * 10);
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
      airborne: state.airborne ? 1 : 0, landing: Number(state.landing) || 0,
      sliding: slideBlend, slideProgress });
    const slidePose = slideBlend > .001 ? slideViewPose(slideBlend, slideProgress) : NO_POSE;
    const swingPose = meleeProgress === null ? NO_POSE : knifeSwing(meleeProgress);
    const tossPose = throwProgress === null ? NO_POSE : grenadeThrow(throwProgress);
    const knifeTarget = meleeProgress === null ? 0 : 1;
    knifeBlend = dampValue(knifeBlend, knifeTarget, dt, knifeTarget ? 26 : 12);
    const throwTarget = throwProgress === null ? 0 : 1;
    throwBlend = dampValue(throwBlend, throwTarget, dt, throwTarget ? 22 : 10);
    const kickAmount = Math.max(recoil, clamp(Number(state.recoil) || 0, 0, 1.5));
    // Idle breathing + look-lag sway; ADS and slides damp both down so the
    // sight picture stays stable when the player is trying to be precise.
    const look = state.lookDelta || 0;
    lookX = dampValue(lookX, clamp(Number(look.x) || 0, -1.2, 1.2), dt, 16);
    lookY = dampValue(lookY, clamp(Number(look.y) || 0, -1.2, 1.2), dt, 16);
    const steady = (1 - .7 * aimBlend) * (1 - .5 * slideBlend);
    const swayX = clamp(-lookX * .05, -.05, .05) * steady;
    const swayY = clamp(-lookY * .04, -.04, .04) * steady;
    const breath = (1 - .7 * aimBlend) * (1 - .5 * sprintBlend) * (1 - .6 * slideBlend);
    const breathX = Math.sin(elapsed * 1.7) * .0035 * breath;
    const breathY = Math.sin(elapsed * 2.6) * .004 * breath;
    const breathRz = Math.sin(elapsed * 1.3) * .004 * breath;
    rig.position.set(
      mix(hipX, active === 'rifle' ? 0 : -.005, aimBlend) + pose.x + slidePose.x + breathX + swayX + kick.yaw * .55
        - swingPose.x * .25,
      mix(hipY, aimY, aimBlend) + pose.y + slidePose.y + breathY + swayY + settleWobble * .006 - swap * .55
        - Math.abs(swingPose.y) * .12 - tossPose.y * .3,
      mix(hipZ, aimZ, aimBlend) + pose.z + slidePose.z + kickAmount * .055 + swap * .18 - tossPose.z * .2,
    );
    rig.rotation.set(
      pose.rx + slidePose.rx + kickAmount * .08 + kick.pitch + swap * .15 + swayY * .5 + settleWobble * .02,
      pose.ry + slidePose.ry + kick.yaw + swayX * .8 + tossPose.ry * .35,
      pose.rz + slidePose.rz + kick.roll + breathRz - swap * .2 + settleWobble * .03,
    );
    // Lower the firearm while the knife or grenade is out.
    const utility = Math.max(knifeBlend, throwBlend);
    rifleMount.position.set(.03 * utility, -.28 * utility, .06 * utility);
    pistolMount.position.set(.03 * utility, -.24 * utility, .06 * utility);
    knifeMount.visible = knifeBlend > .01;
    knifeMount.position.set(KNIFE_BASE.x + swingPose.x * knifeBlend, KNIFE_BASE.y + swingPose.y * knifeBlend,
      KNIFE_BASE.z + swingPose.z * knifeBlend);
    knifeMount.rotation.set(KNIFE_BASE.rx + swingPose.rx * knifeBlend, KNIFE_BASE.ry + swingPose.ry * knifeBlend,
      KNIFE_BASE.rz + swingPose.rz * knifeBlend);
    const release = tossPose.release || 0;
    grenadeMount.visible = throwBlend > .02 && release < .95;
    grenadeMount.position.set(GRENADE_BASE.x + tossPose.x * throwBlend,
      GRENADE_BASE.y + tossPose.y * throwBlend, GRENADE_BASE.z + tossPose.z * throwBlend);
    grenadeMount.rotation.set(GRENADE_BASE.rx + tossPose.rx * throwBlend,
      GRENADE_BASE.ry + tossPose.ry * throwBlend, GRENADE_BASE.rz + tossPose.rz * throwBlend);
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
    // Empty desert pistol holds the slide back until a reload frees it.
    const empty = Boolean(state.empty) && active === 'pistol' && !state.reloading;
    stats.empty = empty;
    const slideTravel = empty ? 2.8
      : state.reloading && active === 'pistol' ? Math.sin(Math.PI * clamp((reload - .80) / .15, 0, 1)) * 2.8
        : kickAmount * 2.5;
    for (const { object, base: original } of slides) { object.position.copy(original); object.position.z -= slideTravel; }
    const flashY = active === 'rifle' ? .28 : .20, flashZ = active === 'rifle' ? -.82 : -.43;
    const flashVisible = flashTime > 0 && !state.reloading && !state.switching;
    flash.visible = flashVisible && flashAltShot === 0;
    flashAlt.visible = flashVisible && flashAltShot === 1;
    flash.position.set(0, flashY, flashZ);
    flashAlt.position.copy(flash.position);
    flash.scale.setScalar(active === 'rifle' ? .12 : .17);
    flashAlt.scale.setScalar(active === 'rifle' ? .17 : .12);
    flash.material.rotation = elapsed * 27;
    flashAlt.material.rotation = 1.1 - elapsed * 19.5;
    flashLight.position.copy(flash.position);
    flashLight.intensity = flashVisible ? .7 : 0;
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
      if (flash.visible || flashAlt.visible) flashPendingRender = false;
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
    fire() {
      if (disposed) return;
      const shot = recoilOffset(active, shotIndex++, aimBlend);
      kick.pitch = Math.min(.06, kick.pitch + shot.pitch);
      kick.yaw = clamp(kick.yaw + shot.yaw, -.05, .05);
      kick.roll = clamp(kick.roll + shot.roll, -.04, .04);
      recoil = Math.min(1.4, recoil + shot.kick);
      flashAltShot = shotIndex & 1;
      flashTime = .045; flashPendingRender = true;
    },
    /** Start the procedural knife swing. Returns false while one is playing. */
    melee() {
      if (disposed || meleeActive || knifeBlend > .35) return false;
      meleeActive = true; meleeClock = 0;
      return true;
    },
    /** Start the procedural grenade throw. Returns false while one is playing. */
    throwGrenade() {
      if (disposed || throwActive || throwBlend > .35) return false;
      throwActive = true; throwClock = 0;
      return true;
    },
    /** Drop transient presentation state (respawn / cutscene hand-off). */
    resetPose() {
      if (disposed) return;
      aimBlend = sprintBlend = slideBlend = settle = knifeBlend = throwBlend = 0;
      recoil = 0; kick.pitch = kick.yaw = kick.roll = 0; lookX = lookY = 0;
      meleeActive = throwActive = false; meleeClock = throwClock = 0;
      flashTime = 0; flashPendingRender = false;
    },
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
