// 室内灯光：一小池真实的聚光灯，跟着人走。
// 商场走道的筒灯、社区住宅各个房间的吸顶灯，位置在搭建时记在楼层上（ctx.levels[id].lamps）；漫游走到那一层时，
// 从里面挑离相机最近的几盏点亮：地面和墙面有真实的明暗，亮面地板上能看到灯的高光。
// 灯不投影（每盏投影都要把场景多画一遍）。盏数由画质设置的「室内灯光」决定，0 是不开；不开时这个模块什么也不占。
import * as THREE from 'three';

/**
 * power 是光强：灯正下方的地面多出来的亮度大约是 power ÷ (π × 灯高²)。
 * 商场层高 4.6 米左右配 30，住宅 2.6 米配 9，落在地面上都是 0.4 上下。
 * reach 以外的灯不参与；fade 是换灯时淡入淡出的时间（秒）。
 */
export const INDOOR_LIGHT = Object.freeze({ reach: 18, power: 30, homePower: 9, color: '#ffe6c4', angle: 1.12, penumbra: 0.85, distance: 12, fade: 0.35 });

/**
 * 从灯位里挑离相机最近的 count 盏，并给每盏一个 0…1 的权重：排在最后、马上要被换下去的那盏权重趋近 0，
 * 所以人走动时灯是渐渐亮起、渐渐熄掉的，不会跳。lamps：[[x, y, z, power?], …]；返回 [{ index, weight }]。纯函数。
 */
export function pickLamps(lamps, point, count, reach = INDOOR_LIGHT.reach) {
  const near = [];
  for (let i = 0; i < lamps.length; i++) {
    const [x, y, z] = lamps[i], d = Math.hypot(x - point.x, (y - point.y) * 0.5, z - point.z);
    if (d < reach) near.push({ index: i, d });
  }
  near.sort((a, b) => a.d - b.d);
  // 第 count + 1 盏的距离就是这一池灯的「边」；不足那么多盏时用 reach
  const edge = near.length > count ? near[count].d : reach;
  return near.slice(0, count).map(({ index, d }) => {
    const t = Math.min(1, Math.max(0, (edge - d) / (edge * 0.4)));
    return { index, weight: t * t * (3 - 2 * t) };
  });
}

export function createIndoorLighting(ctx) {
  const group = new THREE.Group(); group.name = 'indoor-light-pool'; group.visible = false; ctx.scene.add(group);
  const pool = [];
  function resize(count) {
    while (pool.length > count) { const { light } = pool.pop(); group.remove(light, light.target); light.dispose(); }
    while (pool.length < count) {
      const light = new THREE.SpotLight(INDOOR_LIGHT.color, 0, INDOOR_LIGHT.distance, INDOOR_LIGHT.angle, INDOOR_LIGHT.penumbra, 2);
      light.name = `indoor-pool-${pool.length + 1}`; light.castShadow = false;
      group.add(light, light.target);
      pool.push({ light, lamp: -1, level: 0, target: 0, power: 0 });
    }
  }
  let clock = Infinity, levelId = null;
  const point = new THREE.Vector3();
  const api = {
    name: 'indoor-light-pool',
    get active() { return group.visible; },
    get lightCount() { return group.visible ? pool.length : 0; },
    get assignments() { return pool.map((p) => (p.lamp >= 0 ? { lamp: p.lamp, level: +p.level.toFixed(2) } : null)); },
    update(dt, elapsed, app) {
      const count = ctx.quality?.indoorLights || 0, id = app.state.explore?.level, L = id ? ctx.levels[id] : null, lamps = L?.lamps;
      const on = count > 0 && !!lamps?.length;
      // 不亮的灯也占着着色器里的灯位，所以用不上时整池隐藏
      if (group.visible !== on) { group.visible = on; clock = Infinity; }
      if (app.env) app.env.lampTarget = on ? 1 : 0;
      if (!on) { levelId = null; return; }
      if (pool.length !== count) resize(count);
      clock += dt;
      if (clock >= 0.2 || levelId !== id) {
        clock = 0;
        if (levelId !== id) { for (const p of pool) { p.lamp = -1; p.level = 0; p.target = 0; } levelId = id; }
        const offset = L.offset || 0;
        point.copy(ctx.camera.position); point.y -= offset;
        const chosen = pickLamps(lamps, point, count);
        const wanted = new Map(chosen.map((c) => [c.index, c.weight]));
        // 已经亮着的灯留在原位；空出来的灯头拿去点新的灯
        for (const p of pool) { if (wanted.has(p.lamp)) { p.target = wanted.get(p.lamp); wanted.delete(p.lamp); } else p.target = 0; }
        for (const [index, weight] of wanted) {
          const free = pool.find((p) => p.target === 0 && p.level < 0.02);
          if (!free) break; // 还没熄完，下一轮再说
          const [x, y, z, power] = lamps[index];
          free.lamp = index; free.level = 0; free.target = weight; free.power = power ?? INDOOR_LIGHT.power;
          free.light.position.set(x, y + offset, z); free.light.target.position.set(x, y + offset - 3, z);
          free.light.target.updateMatrixWorld();
        }
      }
      const step = dt / INDOOR_LIGHT.fade;
      for (const p of pool) {
        p.level += Math.max(-step, Math.min(step, p.target - p.level));
        p.light.intensity = p.power * p.level;
      }
    },
    dispose() { resize(0); group.removeFromParent(); },
  };
  ctx.dynamic.push(api);
  return api;
}
