// Bounded local combat logic. Perception only produces memories and intentions;
// game.js validates every path and every shot against the venue collision map.
export const ENEMY_TYPES = Object.freeze({
  scout: Object.freeze({ label: '侦察兵', health: 72, armor: 1, speed: 2.6,
    range: 32, hearing: 1.2, fov: 125, reaction: .9, damage: 6, interval: 1.45, burst: 2, clip: 10, reload: 2.8, accuracy: .5, preferred: 11 }),
  assault: Object.freeze({ label: '突击兵', health: 98, armor: 1, speed: 3.1,
    range: 37, hearing: 1, fov: 115, reaction: .7, damage: 7, interval: 1.65, burst: 3, clip: 18, reload: 2.9, accuracy: .54, preferred: 16 }),
  heavy: Object.freeze({ label: '装甲守卫', health: 145, armor: .74, speed: 1.7,
    range: 40, hearing: .85, fov: 100, reaction: 1.1, damage: 9, interval: 1.9, burst: 2, clip: 14, reload: 3.6, accuracy: .52, preferred: 21 }),
});
export const enemyType = enemy => ENEMY_TYPES[enemy.type] || ENEMY_TYPES.scout;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copyPoint = p => ({ floor: p.floor, x: p.x, y: p.y, z: p.z, slope: null });

export function inVisionCone(enemy, target) {
  if (enemy.floor !== target.floor) return false;
  const d = distance(enemy, target), profile = enemyType(enemy);
  if (d > profile.range) return false;
  if (d < 5.5 || enemy.alert > 0) return true;
  const facing = Math.sin(enemy.yaw || 0) * (target.x - enemy.x) + Math.cos(enemy.yaw || 0) * (target.z - enemy.z);
  return facing / Math.max(.001, d) >= Math.cos(profile.fov * Math.PI / 360);
}

export function perceiveEnemy(enemy, { player, ally, noise, elapsed, visible }) {
  const seesPlayer = inVisionCone(enemy, player) && visible(enemy, player);
  const seesAlly = ally?.health > 0 && inVisionCone(enemy, ally) && visible(enemy, ally);
  const heard = noise && noise.until > elapsed && noise.floor === enemy.floor
    && distance(enemy, noise) <= (noise.radius || 20) * enemyType(enemy).hearing;
  const target = seesAlly && (!seesPlayer || distance(enemy, ally) < distance(enemy, player) * .8) ? ally : seesPlayer ? player : null;
  if (target || heard) {
    enemy.alert = 12;
    enemy.lastKnown = copyPoint(target || noise);
  }
  enemy.seesPlayer = seesPlayer;
  enemy.seesAlly = seesAlly;
  enemy.state = enemy.reload > 0 ? 'reload' : target ? 'engage' : enemy.alert > 0 && enemy.lastKnown ? 'investigate' : 'patrol';
  return target;
}

export function enemyShotChance(enemy, target, { crouching = false, moving = false, airborne = false } = {}) {
  const profile = enemyType(enemy);
  const range = Math.max(.4, 1 - distance(enemy, target) / (profile.range * 1.65));
  return profile.accuracy * range * (crouching ? .68 : 1) * (moving ? .8 : 1) * (airborne ? .72 : 1);
}

export function damageEnemy(enemy, amount, headshot = false) {
  const armor = headshot ? 1 : enemyType(enemy).armor;
  enemy.health = Math.max(0, enemy.health - Math.max(0, amount) * armor);
  enemy.alert = 12;
  return enemy.health <= 0;
}
