// Textured Rocketbox humanoids with eight native-rig walking poses, instanced
// per level/model. Atlas and morph geometry are shared across the whole mall.
import * as THREE from 'three';
import { polyline } from '../paths.js';
import { rng } from '../textures.js';
import { loadPeopleAssets } from '../people-asset.js';
import { createPeopleSupport } from '../people-support.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 远处的人（一期游览布局里离相机 > FAR_LOD 米）：不画 3600–4200 个三角形的贴图人，换成几十个三角形的简化人形
//（两条腿、上身、头，按上衣颜色染色）。这么远时一个人只有几个像素高，看不出区别，人群就能更密而不增加显卡负担
export const FAR_LOD = 60;
function farFigure() {
  const parts = [
    new THREE.CylinderGeometry(0.075, 0.06, 0.82, 5, 1).translate(-0.09, 0.41, 0),
    new THREE.CylinderGeometry(0.075, 0.06, 0.82, 5, 1).translate(0.09, 0.41, 0),
    new THREE.CylinderGeometry(0.2, 0.15, 0.64, 6, 1).translate(0, 1.14, 0),
    new THREE.IcosahedronGeometry(0.11, 0).translate(0, 1.6, 0),
  ].map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries(parts, false);
}

// 上衣颜色（sRGB）：白、米、黑、藏青、浅蓝、酒红、砖红、芥黄、橄榄、墨绿、灰、粉
const OUTFITS = ['#f4f2ec', '#d9c7a4', '#2a2b2e', '#2b3d6b', '#6f9fd8', '#8f1f33', '#c8452f', '#e0a42a', '#6b7a35', '#1f6b55', '#7d8085', '#e98aa8']
  .map((c) => new THREE.Color(c));
let FAR_GEO = null, FAR_MAT = null;
const COUNT = { parking: 12, food: 70, retail: 75, roof: 45, street: 40, concourse: 80, platform: 56 };

export async function buildPeople(ctx) {
  const assets = await loadPeopleAssets(ctx.renderer.capabilities.getMaxAnisotropy());
  const rand = rng(99), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(), position = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const walkers = [], pos = [0, 0, 0], dir = [0, 0, 1];
  let density = ctx.quality?.crowdDensity ?? 1;
  const stats = { models: assets.length, textured: true, morphPoses: 8, capacity: 0, visible: 0, density };

  for (const lv of ctx.layout.levels) {
    const paths = (ctx.paths.levels[lv.id] || {}).people || [];
    if (!paths.length) continue;
    // 一期样板中庭的几层人多一些（预想图里中庭人很多）；手机按画质的人群密度再打折
    const busy = lv.building === 'P1' && lv.kind === 'retail' && ctx.layout.fidelity?.atrium;
    // 超级商业中心（一期并进 A、B 两块楼面）每层 1000 人（效果图里各层走道都挤满人；60 m 外换成简化人形，见 FAR_LOD；手机画质按 crowdDensity 打到两三成）
    const count = lv.kind === 'street' && lv.ground ? 120 : busy ? (ctx.layout.fidelity?.mega ? 1000 : 120) : COUNT[lv.kind] || 20;
    // 中庭边的两圈（回游线、栏杆边）：一期每层四成的人走这里，中庭四周才像效果图那样热闹
    const atrium = paths.filter(path => !path.escalator && /^中庭/.test(path.name || ''));
    const variants = assets.map(asset => {
      const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, count);
      mesh.name = `textured-people-${lv.id}-${asset.id}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Allocate morph texture at full capacity before distance/density culling
      // reduces draw count; later quality increases must not overflow it.
      mesh.setMorphAt(0, asset.source);
      mesh.setColorAt(0, OUTFITS[0]); // 先把实例颜色缓冲按满容量建好（着色器只给衣服换色）
      ctx.levels[lv.id].people.add(mesh);
      return { mesh, asset, visible: 0 };
    });
    const list = [];
    for (let i = 0; i < count; i++) {
      const onEsc = rand() < .16, toAtrium = !onEsc && atrium.length && rand() < .4;
      const pool = toAtrium ? atrium : paths.filter(path => !!path.escalator === onEsc);
      const available = pool.length ? pool : paths;
      const path = available[Math.floor(rand() * available.length)];
      const pl = polyline(path.pts, path.loop), rail = path.name === '中庭栏杆边';
      list.push({ pl, loop: path.loop, escalator: !!path.escalator,
        // 栏杆边的人走得慢（逛着看），也不往两边散开，免得贴到栏板上
        d: rand() * pl.total, speed: path.escalator ? .5 : rail ? .3 + rand() * .3 : .85 + rand() * .55,
        dir: path.loop && rand() < .5 ? -1 : 1,
        lateral: path.escalator ? (rand() - .5) * .25 : rail ? (rand() - .5) * .5 : (rand() - .5) * (lv.kind === 'parking' ? .6 : 2.4),
        // 体型：每人自己的身高、胖瘦（模型只有一男一女）；约 8% 是小孩（0.58–0.72 倍）
        phase: rand(), size: rand() < .08 ? .58 + rand() * .14 : .92 + rand() * .14, girth: .88 + rand() * .26, variant: i % assets.length,
        // A deterministic rank keeps the same population while changing quality.
        rank: (i + .5) / count,
        outfit: OUTFITS[Math.floor(rand() * OUTFITS.length)],
      });
    }
    // 远处用的简化人（只在一期游览布局，人多的超级商业中心）
    let far = null;
    if (ctx.layout.fidelity?.mega && lv.building === 'P1') {
      const mesh = new THREE.InstancedMesh(FAR_GEO ||= farFigure(), FAR_MAT ||= new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
      mesh.name = `far-people-${lv.id}`;
      mesh.castShadow = false; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, OUTFITS[0]);
      mesh.count = 0;
      ctx.levels[lv.id].people.add(mesh);
      far = { mesh, visible: 0 };
    }
    const extraPieces = (ctx.layout.extensions?.paths || []).filter(path => path.level === lv.id)
      .flatMap(path => path.slab?.pieces || []);
    const support = createPeopleSupport(lv, extraPieces);
    walkers.push({ lv, variants, list, support, group: ctx.levels[lv.id].people, far });
    stats.capacity += count;
  }

  const place = (walker, step, time) => {
    // 一期超级商业中心整层约 300 m 宽，俯视全楼时 230 m 外的人全被裁掉，远处走道显得空；满密度（桌面高画质）放到 330 m
    const maxDistance = density <= .3 ? 95 : density < .8 ? 155 : ctx.layout.fidelity?.mega ? 330 : 230;
    for (const variant of walker.variants) variant.visible = 0;
    if (walker.far) walker.far.visible = 0;
    for (const actor of walker.list) {
      actor.d += actor.speed * actor.dir * step;
      if (!actor.loop && (actor.d > actor.pl.total || actor.d < 0)) {
        actor.d = Math.max(0, Math.min(actor.pl.total, actor.d));
        actor.dir *= -1;
      }
      if (actor.rank > density) continue;
      actor.pl.at(actor.d, pos, dir);
      const nx = -dir[2], nz = dir[0], length = Math.hypot(nx, nz) || 1;
      position.set(pos[0] + nx / length * actor.lateral,
        pos[1] - (actor.escalator ? 1.32 : .015), pos[2] + nz / length * actor.lateral);
      const offset = ctx.levels[walker.lv.id].offset || 0;
      const distanceSq = (position.x - ctx.camera.position.x) ** 2 +
        (position.y + offset - ctx.camera.position.y) ** 2 + (position.z - ctx.camera.position.z) ** 2;
      if (distanceSq > maxDistance ** 2) continue;
      // 230 m 外（只有一期超级商业中心满密度时才画到这么远）只画一半人：远处走道看着有人，三角形少一半
      if (distanceSq > 230 ** 2 && actor.rank > density / 2) continue;
      // Test the actual laterally shifted position. The path clock above keeps
      // running while an actor crosses an opening, so it reappears on solid floor.
      if (!walker.support(position.x, position.z, actor.escalator)) continue;
      const variant = walker.variants[actor.variant], { mesh, asset } = variant;
      rotation.setFromAxisAngle(up, Math.atan2(dir[0] * actor.dir, dir[2] * actor.dir));
      scale.set(actor.size * actor.girth, actor.size, actor.size * (.5 + actor.girth / 2));
      matrix.compose(position, rotation, scale);
      if (walker.far && distanceSq > FAR_LOD ** 2) {
        walker.far.mesh.setMatrixAt(walker.far.visible, matrix);
        walker.far.mesh.setColorAt(walker.far.visible++, actor.outfit);
        continue;
      }
      mesh.setMatrixAt(variant.visible, matrix);
      mesh.setColorAt(variant.visible, actor.outfit);
      const weights = asset.source.morphTargetInfluences;
      weights.fill(0);
      // Standing pose on escalators. Distant pedestrians update at the same
      // bounded cadence, with no bone matrices or CPU vertex skinning.
      const phase = actor.escalator ? 0 : ((time * actor.speed / 1.1 / asset.cycleSeconds + actor.phase) % 1) * asset.poses;
      const frame = Math.floor(phase), blend = phase - frame;
      weights[frame] = 1 - blend;
      weights[(frame + 1) % asset.poses] += blend;
      mesh.setMorphAt(variant.visible++, asset.source);
    }
    if (walker.far) {
      const { mesh, visible } = walker.far;
      mesh.count = visible;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      stats.far = (stats.far || 0) + visible;
    }
    for (const { mesh, visible } of walker.variants) {
      mesh.count = visible;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.morphTexture.needsUpdate = true;
      stats.visible += visible;
    }
  };
  const visibleInTree = group => {
    for (let node = group; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  let accumulated = 0, lastTime = 0;
  const refresh = (step, time) => {
    stats.visible = 0; stats.far = 0;
    for (const walker of walkers) {
      if (!visibleInTree(walker.group)) {
        for (const variant of walker.variants) variant.mesh.count = 0;
        if (walker.far) walker.far.mesh.count = 0;
        continue;
      }
      place(walker, step, time);
    }
  };
  ctx.peopleQuality = {
    stats,
    setDensity(value) {
      density = Math.max(0, Math.min(1, Number(value) || 0));
      stats.density = density;
      refresh(0, lastTime);
    },
  };
  // Never leave newly instantiated people stacked at the origin.
  refresh(0, 0);
  ctx.dynamic.push({ update(dt, time) {
    accumulated += dt;
    if (accumulated < (density <= .3 ? 1 / 20 : 1 / 30)) return;
    const step = accumulated;
    accumulated = 0; lastTime = time;
    refresh(step, time);
  } });
}
