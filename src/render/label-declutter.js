// 园区视角标注去重：被塔楼挡住的标注先隐藏，屏幕上互相重叠的只留一个（近处、各期名称优先），
// 远处的小标注不再盖在近景上。只在相机或视口变化时重算。
import * as THREE from 'three';

/** Priority of a label style: titles and metro marks beat entrances, parking and facilities. */
export const LABEL_PRIORITY = { title: 2.5, metro: 1.6, entrance: 1, parking: 1, fun: 1.2, facility: 1, exit: 1, wc: 1, food: 1 };

/** Screen-space rect (NDC) of a sprite with sizeAttenuation off and centre (0.5, 0); null when behind the camera. */
export function labelRect(sprite, camera, v = new THREE.Vector3()) {
  v.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse);
  if (v.z > -.5) return null;
  const P = camera.projectionMatrix.elements, w = sprite.scale.x * P[0], h = sprite.scale.y * P[5];
  v.copy(sprite.position).project(camera);
  return { x0: v.x - w * sprite.center.x, x1: v.x + w * (1 - sprite.center.x), y0: v.y - h * sprite.center.y, y1: v.y + h * (1 - sprite.center.y) };
}

/**
 * Hides site labels hidden behind an occluder box (community towers), off screen or far beyond the
 * view, then resolves overlaps greedily: the nearer label wins, titles count as if 2.5× nearer.
 * Returns the number of labels kept.
 */
export function declutterLabels(sprites, camera, occluders = [], { reach = Infinity } = {}) {
  camera.updateMatrixWorld();
  const v = new THREE.Vector3(), ray = new THREE.Ray(), hit = new THREE.Vector3(), items = [];
  for (const s of sprites) {
    const dist = s.position.distanceTo(camera.position), prio = s.userData.prio ?? 1;
    const r = labelRect(s, camera, v);
    let show = !!r && r.x1 > -1 && r.x0 < 1 && r.y1 > -1 && r.y0 < 1 && dist < reach * prio;
    if (show) {
      ray.origin.copy(camera.position); ray.direction.copy(s.position).sub(camera.position).normalize();
      show = !occluders.some((b) => b.userData?.id !== s.userData.building && !b.containsPoint(s.position) && ray.intersectBox(b, hit) && hit.distanceTo(camera.position) < dist - 1);
    }
    if (show) items.push({ s, score: dist / prio, ...r }); else s.visible = false;
  }
  items.sort((a, b) => a.score - b.score);
  const kept = [];
  for (const it of items) {
    const clash = kept.some((k) => it.x0 < k.x1 && k.x0 < it.x1 && it.y0 < k.y1 && k.y0 < it.y1);
    it.s.visible = !clash;
    if (!clash) kept.push(it);
  }
  return kept.length;
}

/** Bounding boxes of the community towers (and other tower blocks) that hide labels behind them. */
export function towerOccluders(layout) {
  const out = [];
  for (const b of layout.buildings) {
    if (b.kind !== 'tower' || !b.outline) continue;
    const levels = layout.levels.filter((l) => l.building === b.id && l.elev >= 0);
    if (!levels.length) continue;
    const xs = b.outline.map((p) => p[0]), zs = b.outline.map((p) => p[1]);
    const y0 = Math.min(...levels.map((l) => l.elev)), y1 = Math.max(...levels.map((l) => l.elev + (l.height || 3)));
    const box = new THREE.Box3(new THREE.Vector3(Math.min(...xs), y0, Math.min(...zs)), new THREE.Vector3(Math.max(...xs), y1, Math.max(...zs)));
    box.userData = { id: b.id };
    out.push(box);
  }
  return out;
}
