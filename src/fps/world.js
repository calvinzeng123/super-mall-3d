import * as THREE from 'three';
import { loadPeopleAssets } from '../render/people-asset.js';
import { createExtractionVehicle } from './extraction-vehicles.js';

const color = { friendly: 0x72d9e7, enemy: 0xed9a70, objective: 0xeec27b, intel: 0x8fe3ea, armor: 0x9dc0d8, med: 0xe6d2c4, grenade: 0xb8c9a8 };
const PICKUP_LABELS = { intel: '情报碎片', armor: '护甲板', grenade: '手雷补给', medkit: '医疗补给' };
const PICKUP_COLORS = { intel: color.intel, armor: color.armor, grenade: color.grenade, medkit: color.med };
const PICKUP_SIGNS = {};
function sign(text, ink = '#e9d7aa') {
  const key = `${text}/${ink}`;
  if (PICKUP_SIGNS[key]) return PICKUP_SIGNS[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#18232b'; g.fillRect(0, 0, 256, 128); g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(6, 6, 244, 116);
  g.fillStyle = ink; g.textAlign = 'center'; g.font = '600 31px -apple-system, sans-serif'; g.fillText(text, 128, 61); g.font = '14px monospace'; g.fillText('YUNLAN / OPS', 128, 91);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  PICKUP_SIGNS[key] = new THREE.MeshBasicMaterial({ map: t });
  return PICKUP_SIGNS[key];
}
function box(group, w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); group.add(m); return m; }
export async function createCombatWorld(app, mission, viewmodel, nav) {
  const root = new THREE.Group(); root.name = '封锁行动战术物件'; app.scene.add(root);
  const owned = [], props = [], actors = [], ownedGeometries = new Set(), ownedTextures = new Set(), glowMaterials = [];
  const metal = new THREE.MeshStandardMaterial({ color: '#52616a', metalness: .72, roughness: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#243039', metalness: .35, roughness: .65 });
  const brass = new THREE.MeshStandardMaterial({ color: '#dbb372', metalness: .65, roughness: .35 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#151a20', roughness: .95 });
  const intel = new THREE.MeshStandardMaterial({ color: '#6fd6de', emissive: '#2a7b82', emissiveIntensity: .9, metalness: .3, roughness: .34 });
  const plate = new THREE.MeshStandardMaterial({ color: '#9fb7c6', metalness: .6, roughness: .38 });
  const olive = new THREE.MeshStandardMaterial({ color: '#6d7c5e', metalness: .25, roughness: .7 });
  const medWhite = new THREE.MeshStandardMaterial({ color: '#e8e4da', metalness: .1, roughness: .62 });
  const medRed = new THREE.MeshBasicMaterial({ color: '#d66a5a' });
  owned.push(metal, dark, brass, rubber, intel, plate, olive, medWhite, medRed);
  function propAt(p) { const g = new THREE.Group(); g.position.set(p.x, p.y, p.z); g.userData.floor = p.floor; root.add(g); props.push(g); return g; }
  function ring(group, radius, tint, opacity = .55) {
    const m = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const r = new THREE.Mesh(new THREE.RingGeometry(radius * .72, radius * .76, 40), m);
    r.rotation.x = -Math.PI / 2; r.position.y = .045; group.add(r); owned.push(m); glowMaterials.push(m); return r;
  }
  for (const c of mission.cover) {
    const g = propAt(c), mat = c.style === 'cargo' ? app.ctx.mats.base.wood : dark;
    box(g, c.w, c.height, c.d, 0, c.height / 2, 0, mat);
    for (const x of [-1, 1]) for (const z of [-1, 1]) box(g, .06, c.height + .03, .06, x * (c.w / 2 - .04), c.height / 2, z * (c.d / 2 - .04), metal);
    for (const y of [.14, c.height - .14]) { box(g, c.w + .035, .07, c.d + .035, 0, y, 0, metal); }
    for (const x of [-c.w * .25, c.w * .25]) { box(g, .18, .14, .055, x, c.height * .56, c.d / 2 + .03, brass); box(g, .04, .16, .03, x, c.height * .53, c.d / 2 + .07, rubber); }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(c.w * .75, 1.05), .45), sign(c.style === 'luggage' ? '云澜酒店' : '维护设备'));
    label.position.set(0, c.height * .8, c.d / 2 + .03); g.add(label); owned.push(label.material);
  }
  const objectiveProps = [...mission.objectives.slice(0, 2), ...mission.extractions].map((p, i) => {
    const g = propAt(p);
    g.userData.id = p.id;
    if (p.prop === 'terminal') {
      box(g, .56, 1.15, .38, 0, .575, 0, dark); box(g, .8, .08, .6, 0, .06, 0, metal);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(.64, .45), sign('访问终端', '#95e3ec')); s.position.set(0, 1.32, .23); s.rotation.x = -.18; g.add(s); owned.push(s.material);
      box(g, .76, .54, .08, 0, 1.32, .16, metal);
    } else if (p.prop === 'case') {
      box(g, .95, .3, .6, 0, .9, 0, dark); box(g, 1.25, .08, .85, 0, .7, 0, metal);
      for (const x of [-.48, .48]) box(g, .06, .7, .6, x, .35, 0, metal);
      for (const x of [-.3, .3]) box(g, .1, .08, .05, x, .94, .32, brass);
      box(g, .3, .045, .045, 0, 1.1, 0, metal);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(.6, .18), sign('情报箱')); s.position.set(0, .9, .308); g.add(s); owned.push(s.material);
    }
    if (p.vehicle) {
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.45, .68), sign(p.vehicle.kind === 'helicopter' ? '直升机接应' : '接应车辆', '#a6e4d4'));
      marker.position.set(0, 1.3, 0); g.add(marker); owned.push(marker.material);
      box(g, .075, 1.4, .075, -.65, .7, 0, metal); box(g, .075, 1.4, .075, .65, .7, 0, metal);
    }
    const glow = ring(g, p.radius, i >= 2 ? 0x75d4d4 : color.objective);
    g.userData.ring = glow; return g;
  });
  // Optional objective: a wall-mounted security console. Cutting the feed is
  // optional but makes every hostile on the map look slightly shorter.
  let bonusProp = null;
  if (mission.bonus) {
    const p = mission.bonus, g = propAt(p);
    g.userData.id = p.id;
    box(g, .72, 1.5, .5, 0, .75, 0, dark);
    box(g, .86, .08, .62, 0, .05, 0, metal);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.52, .34), sign('安防监控', '#9ee6d8'));
    screen.position.set(0, 1.14, .258); g.add(screen);
    box(g, .03, .72, .03, .3, 1.85, -.1, metal);
    box(g, .16, .05, .05, .3, 2.2, -.1, brass);
    const glow = ring(g, p.radius, 0x9ee6d8, .4); g.userData.ring = glow;
    bonusProp = { group: g, ring: glow, done: false, title: p.title };
  }
  // Intel chips and supply caches. Intel is the exploration reward; supply
  // pickups keep the run moving after a bad firefight.
  const pickupProps = [];
  for (const p of mission.pickups || []) {
    const g = propAt(p);
    g.userData.id = p.id;
    const tint = PICKUP_COLORS[p.kind] || color.friendly;
    let core;
    if (p.kind === 'intel') {
      core = box(g, .26, .05, .18, 0, .78, 0, intel);
      box(g, .18, .012, .11, 0, .812, 0, brass);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(.56, .16), sign(PICKUP_LABELS.intel, '#9ee6d8'));
      label.position.set(0, 1.15, 0); g.add(label);
      g.userData.spin = core;
    } else if (p.kind === 'armor') {
      core = box(g, .42, .09, .3, 0, .34, 0, plate);
      for (const x of [-.13, .13]) box(g, .1, .06, .2, x, .42, 0, dark);
      box(g, .34, .05, .05, 0, .47, .11, brass);
    } else if (p.kind === 'grenade') {
      core = box(g, .36, .18, .26, 0, .28, 0, olive);
      for (const x of [-.09, 0, .09]) { const s = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), dark); s.position.set(x, .4, 0); g.add(s); }
      box(g, .38, .03, .28, 0, .38, 0, brass);
    } else {
      core = box(g, .38, .16, .28, 0, .27, 0, medWhite);
      box(g, .14, .02, .05, 0, .36, 0, medRed);
      box(g, .05, .02, .14, 0, .36, 0, medRed);
    }
    const glow = ring(g, 1.15, tint, .34);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.09, 0), new THREE.MeshBasicMaterial({ color: tint }));
    beacon.position.y = 1.05; g.add(beacon); owned.push(beacon.material); ownedGeometries.add(beacon.geometry); glowMaterials.push(beacon.material);
    pickupProps.push({ id: p.id, kind: p.kind, group: g, glow, beacon, active: true, floor: p.floor });
  }
  root.traverse(o => { if (o.geometry) ownedGeometries.add(o.geometry); });
  for (const m of owned) if (m.map) ownedTextures.add(m.map);
  const vehicles = mission.extractions.map(exit => ({ exit, model: createExtractionVehicle(exit) }));
  for (const v of vehicles) root.add(v.model.root);
  const supplies = new Map();
  for (const e of mission.enemies) {
    const group = new THREE.Group(); group.visible = false; root.add(group);
    const crate = box(group, .48, .22, .3, 0, .15, 0, dark); ownedGeometries.add(crate.geometry);
    const strap = box(group, .08, .23, .32, 0, .15, 0, brass); ownedGeometries.add(strap.geometry);
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.08, 0), new THREE.MeshBasicMaterial({ color: color.friendly })); beacon.position.y = .55; group.add(beacon);
    ownedGeometries.add(beacon.geometry); owned.push(beacon.material);
    supplies.set(e.id, { group, beacon, active: false, floor: e.floor });
  }
  const people = await loadPeopleAssets(2);
  for (const [i, record] of [mission.teammate, ...mission.enemies].entries()) {
    const ally = i === 0, asset = people[0];
    const g = new THREE.Group(); g.name = `${ally ? '队友' : '敌人'}-${record.id}`; g.rotation.order = 'YXZ'; root.add(g);
    const mat = asset.material.clone(); mat.color.set(ally ? '#adbfc7' : '#a5a2a0'); mat.transparent = true; owned.push(mat);
    const baseColor = mat.color.clone();
    const body = new THREE.Mesh(asset.geometry, mat); body.frustumCulled = false; body.updateMorphTargets(); g.add(body);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.115, .028, 6, 12), new THREE.MeshStandardMaterial({ color: ally ? color.friendly : color.enemy, emissive: ally ? color.friendly : color.enemy, emissiveIntensity: .15 }));
    band.position.set(.26, 1.3, 0); band.rotation.x = Math.PI / 2; g.add(band); owned.push(band.material);
    ownedGeometries.add(band.geometry);
    const weapon = viewmodel.createWorldWeapon?.(ally || record.type !== 'scout' ? 'rifle' : 'pistol');
    if (weapon) { weapon.position.set(.22, .99, .12); weapon.rotation.x = .12; g.add(weapon); }
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(.1, 0), new THREE.MeshBasicMaterial({ color: ally ? color.friendly : color.enemy })); marker.position.y = 2.08; g.add(marker); owned.push(marker.material);
    ownedGeometries.add(marker.geometry);
    if (!ally) {
      const vest = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: record.type === 'heavy' ? '#48574b' : record.type === 'marksman' ? '#4a505e' : record.type === 'assault' ? '#4e4840' : '#535d62', roughness: .9 }));
      vest.position.set(0, 1.13, .02); vest.scale.set(record.type === 'heavy' ? .36 : .31, .36, .2); g.add(vest); owned.push(vest.material); ownedGeometries.add(vest.geometry);
      if (record.type === 'heavy') {
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * .68), vest.material);
        helmet.position.set(0, 1.67, 0); g.add(helmet); ownedGeometries.add(helmet.geometry);
      }
    }
    const flash = new THREE.Mesh(new THREE.SphereGeometry(.055, 5, 4), new THREE.MeshBasicMaterial({ color: '#ffddb0' }));
    flash.position.set(.22, 1.12, .71); flash.visible = false; g.add(flash); ownedGeometries.add(flash.geometry); owned.push(flash.material);
    actors.push({ id: record.id, group: g, body, asset, marker, weapon, ally, cycle: 0, flash, flashLife: 0, mat, baseColor, dead: 0, deadDone: false, hit: 0 });
  }
  const lines = Array.from({ length: 10 }, () => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]); ownedGeometries.add(geo);
    const material = new THREE.LineBasicMaterial({ color: 0xffd293, transparent: true, opacity: .65 }); const line = new THREE.Line(geo, material); line.visible = false; line.frustumCulled = false; root.add(line); owned.push(material); return { line, life: 0 };
  }); let cursor = 0;
  const guide = new THREE.Mesh(new THREE.RingGeometry(.25, .45, 24), new THREE.MeshBasicMaterial({ color: 0x8cdee9, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })); guide.rotation.x = -Math.PI / 2; root.add(guide); owned.push(guide.material);
  ownedGeometries.add(guide.geometry);
  // Thrown grenade mesh: one shared visual, driven by game-side flight math.
  const grenade = new THREE.Group(); grenade.visible = false;
  const grenadeBody = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), olive); ownedGeometries.add(grenadeBody.geometry); grenade.add(grenadeBody);
  const grenadeCap = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .05, 8), metal); grenadeCap.position.y = .075; ownedGeometries.add(grenadeCap.geometry); grenade.add(grenadeCap);
  root.add(grenade);
  const grenadeState = { active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), time: 0, flight: 1.15 };
  const tmpColor = new THREE.Color();
  return {
    actors, root, vehicles, pickupProps, bonusProp,
    muzzle(id) { const actor = actors.find(a => a.id === id); if (actor) { actor.flash.visible = true; actor.flashLife = .13; } },
    hitActor(id) { const actor = actors.find(a => a.id === id); if (actor) actor.hit = .16; },
    dropSupply(enemy) { const s = supplies.get(enemy.id); if (s) { s.active = true; s.floor = enemy.floor; s.group.position.set(enemy.x, enemy.y, enemy.z); s.group.visible = true; } },
    takeSupply(id) { const s = supplies.get(id); if (s) { s.active = false; s.group.visible = false; } },
    takePickup(id) { const p = pickupProps.find(item => item.id === id); if (p) { p.active = false; p.group.visible = false; } },
    setBonusDone(done) { if (bonusProp) { bonusProp.done = !!done; bonusProp.ring.material.color.set(done ? 0x77e7c1 : 0x9ee6d8); bonusProp.ring.material.opacity = done ? .18 : .4; } },
    grenadeThrow(from, to, flight = 1.15) {
      grenadeState.active = true; grenadeState.time = 0;
      grenadeState.from.copy(from); grenadeState.to.copy(to);
      grenadeState.flight = Math.max(.35, flight || 1.15);
      grenade.position.copy(from); grenade.visible = true;
    },
    grenadeHide() { grenadeState.active = false; grenade.visible = false; },
    departureView(id, time) { return vehicles.find(v => v.exit.id === id)?.model.departureView(time); },
    reset() {
      for (const s of supplies.values()) { s.active = false; s.group.visible = false; }
      for (const p of pickupProps) { p.active = true; p.group.visible = true; }
      if (bonusProp) { bonusProp.done = false; bonusProp.ring.material.color.set(0x9ee6d8); bonusProp.ring.material.opacity = .4; }
      for (const v of vehicles) v.model.reset();
      grenadeState.active = false; grenade.visible = false;
      for (const actor of actors) {
        actor.dead = 0; actor.deadDone = false; actor.hit = 0;
        actor.group.visible = true; actor.group.rotation.x = 0; actor.mat.opacity = 1; actor.mat.color.copy(actor.baseColor);
      }
    },
    tracer(a, b, hostile = false) {
      const entry = lines[cursor++ % lines.length];
      entry.line.geometry.attributes.position.setXYZ(0, a.x, a.y, a.z);
      entry.line.geometry.attributes.position.setXYZ(1, b.x, b.y, b.z);
      entry.line.geometry.attributes.position.needsUpdate = true;
      entry.line.material.color.set(hostile ? 0xf3a487 : 0xffe3a1); entry.line.visible = true; entry.life = .075;
    },
    update(dt, states, player, stage, time, waypoint, extraction = {}) {
      for (const e of lines) { e.life -= dt; e.line.visible = e.life > 0; }
      for (const g of props) g.visible = Math.abs((nav.floors.get(g.userData.floor)?.y ?? 0) - player.y) < 9;
      objectiveProps.forEach((g, i) => {
        g.userData.ring.visible = stage < 2 ? i === stage : g.userData.id === extraction.extractionId;
        g.userData.ring.material.opacity = .36 + Math.sin(time * 2.8) * .15;
      });
      if (bonusProp) {
        const near = Math.abs((nav.floors.get(mission.bonus?.floor)?.y ?? 0) - player.y) < 9;
        bonusProp.group.visible = near;
        bonusProp.ring.visible = near && !bonusProp.done;
        bonusProp.ring.material.opacity = .26 + Math.sin(time * 2.4) * .1;
      }
      for (const p of pickupProps) {
        p.group.visible = p.active && Math.abs((nav.floors.get(p.floor)?.y ?? 0) - player.y) < 9;
        if (!p.active) continue;
        p.beacon.rotation.y += dt * 1.8; p.beacon.position.y = 1.05 + Math.sin(time * 2.6) * .06;
        p.glow.material.opacity = .24 + Math.sin(time * 2.2) * .1;
        if (p.group.userData.spin) { p.group.userData.spin.rotation.y += dt * 1.5; p.group.userData.spin.position.y = .78 + Math.sin(time * 2.2) * .04; }
      }
      for (const v of vehicles) {
        const selected = v.exit.id === extraction.extractionId;
        v.model.root.visible = selected && extraction.departing || Math.abs(v.exit.y - player.y) < 18;
        v.model.update(dt, { ready: stage >= 2, progress: selected ? extraction.extractionProgress : 0, departing: selected && extraction.departing, time: extraction.departureTime || 0 });
      }
      for (const s of supplies.values()) { s.group.visible = s.active && s.floor === player.floor; s.beacon.rotation.y += dt * 1.5; s.beacon.position.y = .5 + Math.sin(time * 3) * .05; }
      guide.visible = !!waypoint && Math.abs(waypoint.y - player.y) < 3.5;
      if (waypoint) guide.position.set(waypoint.x, waypoint.y + .06, waypoint.z);
      if (grenadeState.active) {
        grenadeState.time += dt;
        const t = Math.min(1, grenadeState.time / grenadeState.flight), smooth = t * t * (3 - 2 * t);
        grenade.position.lerpVectors(grenadeState.from, grenadeState.to, smooth);
        grenade.position.y += Math.sin(Math.PI * t) * 1.9;
        grenade.rotation.x += dt * 9; grenade.rotation.z += dt * 6;
        if (t >= 1) { grenade.visible = false; grenadeState.active = false; }
      }
      for (let i = 0; i < actors.length; i++) {
        const model = actors[i], a = states[i]; if (!a) continue;
        if (a.health <= 0) {
          if (!model.dead) model.dead = .0001;
          model.dead += dt;
          // Enemy and downed-teammate bodies fall forward, then fade. The
          // corpse never blocks navigation (AI states already exclude it).
          model.group.visible = !model.deadDone;
          if (!model.deadDone) {
            const fall = Math.min(1, model.dead / .7);
            model.group.rotation.x = fall * fall * (Math.PI * .47);
            model.group.position.set(a.x, Math.max(a.y - .8, model.group.position.y - dt * .2), a.z);
            model.mat.opacity = 1 - Math.max(0, Math.min(1, (model.dead - .85) / .55));
            if (model.dead > 1.45) { model.deadDone = true; model.group.visible = false; }
          }
          continue;
        }
        if (model.dead) { model.dead = 0; model.deadDone = false; model.group.rotation.x = 0; model.mat.opacity = 1; }
        model.group.visible = Math.abs(a.y - player.y) < 8 && Math.hypot(a.x - player.x, a.z - player.z) < 65;
        if (extraction.departing && model.ally && extraction.departureTime > .6) model.group.visible = false;
        model.group.position.set(a.x, a.y - .01, a.z); model.group.rotation.y = a.yaw || 0;
        model.marker.visible = model.ally || a.alert > 0; model.marker.scale.setScalar(model.ally ? .8 : .65);
        model.marker.material.color.set(a.reload > 0 ? 0xf7dc79 : model.ally ? color.friendly : color.enemy);
        model.flashLife = Math.max(0, model.flashLife - dt); model.flash.visible = model.flashLife > 0;
        model.hit = Math.max(0, model.hit - dt);
        if (model.hit > 0) model.mat.color.copy(model.baseColor).lerp(tmpColor.set(0xffd6c4), model.hit / .16 * .65);
        else model.mat.color.copy(model.baseColor);
        model.cycle += dt * (a.moving ? 1.15 : 0); const phase = (model.cycle / model.asset.cycleSeconds % 1) * model.asset.poses, k = Math.floor(phase);
        model.body.morphTargetInfluences.fill(0); model.body.morphTargetInfluences[k] = 1 - (phase - k); model.body.morphTargetInfluences[(k + 1) % model.asset.poses] = phase - k;
        if (!a.moving) model.body.morphTargetInfluences.fill(0);
      }
    },
    dispose() {
      root.removeFromParent(); for (const v of vehicles) v.model.dispose();
      for (const m of owned) m.dispose(); for (const t of ownedTextures) t.dispose(); for (const g of ownedGeometries) g.dispose();
    },
  };
}
