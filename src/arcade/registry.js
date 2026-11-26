// 小游戏目录。加一个游戏 = 在这里加一条，再加一个 games/<id>.js 模块（导出 createGame）。
// status: 'playable' 可以玩；'soon' 只在列表里露个面。
// spot: 在园区导览的地图上，这个游戏的标记插在哪栋楼的屋顶上方（building 楼号，lift 比屋面高几米）。
export const GAMES = Object.freeze([
  {
    id: 'drone', title: '无人机送外卖', tagline: '从商场屋顶起飞，把餐送上各栋楼顶', status: 'playable',
    controls: { keys: 'W S A D 飞行 · ← → 转向 · ↑ ↓ 升降', touch: '左摇杆飞行 · 右摇杆转向和升降' },
    levels: [
      { id: 'lunch', title: '午高峰', brief: '4 单 · 近处的楼顶' },
      { id: 'dinner', title: '晚高峰', brief: '5 单 · 全园区 · 高空有风' },
      { id: 'night', title: '夜班', brief: '6 单 · 夜里 · 风更大' },
    ],
    spot: { building: 'P1', lift: 9, note: '商场天台起飞' },
    load: () => import('./games/drone.js'),
  },
  {
    id: 'heist', title: '夜间潜入', tagline: '闭店后的商场：躲开保安，带走艺文馆的展品', status: 'playable',
    controls: { keys: 'W S A D 走 · Shift 跑（有声音）· E 互动', touch: '左摇杆走 · 拖动画面转视角' },
    levels: [
      { id: 'gallery', title: '艺文馆之夜', brief: '拿门禁卡 → 取展品 → 赶末班地铁' },
    ],
    spot: { building: 'P1C', lift: 7, note: '云澜艺文馆' },
    load: () => import('./games/heist.js'),
  },
  { id: 'glide', title: '高空滑翔', tagline: '从塔楼顶跳下，穿过圆环，落到靶心', status: 'soon' },
  { id: 'hide', title: '躲猫猫', tagline: '变成商场里的一件东西，别被找到', status: 'soon' },
  { id: 'cart', title: '购物车竞速', tagline: '从 6 楼一路冲到地库', status: 'soon' },
  { id: 'workday', title: '上班的一天', tagline: '坐地铁到站，打卡，干活，赶末班车', status: 'soon' },
]);

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
export const playableGames = () => GAMES.filter((g) => g.status === 'playable');

/**
 * 游戏在地图上的标记位置 { x, y, z }：那栋楼屋面层轮廓的中心，再抬高 lift 米。
 * 找不到楼（比如裁掉的地图）返回 null，标记就不插。
 */
export function gameSpot(layout, game) {
  const sp = game?.spot, b = sp && layout?.buildings?.find((x) => x.id === sp.building);
  if (!b) return null;
  const levels = (layout.levels || []).filter((l) => l.building === b.id);
  const roof = levels.find((l) => l.kind === 'roof') || levels.reduce((a, l) => (!a || l.elev > a.elev ? l : a), null);
  const poly = roof?.outline?.length >= 3 ? roof.outline : b.outline;
  if (!poly?.length) return null;
  const [x, z] = poly.reduce((s, [px, pz]) => [s[0] + px / poly.length, s[1] + pz / poly.length], [0, 0]);
  return { x: +x.toFixed(2), y: +((roof?.elev || 0) + (sp.lift ?? 8)).toFixed(2), z: +z.toFixed(2) };
}
