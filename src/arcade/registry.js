// 小游戏目录。加一个游戏 = 在这里加一条，再加一个 games/<id>.js 模块（导出 createGame）。
// status: 'playable' 可以玩；'soon' 只在列表里露个面。
export const GAMES = Object.freeze([
  {
    id: 'drone', title: '无人机送外卖', tagline: '从商场屋顶起飞，把餐送上各栋楼顶', status: 'playable',
    controls: { keys: 'W S A D 飞行 · ← → 转向 · ↑ ↓ 升降', touch: '左摇杆飞行 · 右摇杆转向和升降' },
    levels: [
      { id: 'lunch', title: '午高峰', brief: '4 单 · 近处的楼顶' },
      { id: 'dinner', title: '晚高峰', brief: '5 单 · 全园区 · 高空有风' },
      { id: 'night', title: '夜班', brief: '6 单 · 夜里 · 风更大' },
    ],
    load: () => import('./games/drone.js'),
  },
  {
    id: 'heist', title: '夜间潜入', tagline: '闭店后的商场：躲开保安，带走艺文馆的展品', status: 'playable',
    controls: { keys: 'W S A D 走 · Shift 跑（有声音）· E 互动', touch: '左摇杆走 · 拖动画面转视角' },
    levels: [
      { id: 'gallery', title: '艺文馆之夜', brief: '拿门禁卡 → 取展品 → 赶末班地铁' },
    ],
    load: () => import('./games/heist.js'),
  },
  { id: 'glide', title: '高空滑翔', tagline: '从塔楼顶跳下，穿过圆环，落到靶心', status: 'soon' },
  { id: 'hide', title: '躲猫猫', tagline: '变成商场里的一件东西，别被找到', status: 'soon' },
  { id: 'cart', title: '购物车竞速', tagline: '从 6 楼一路冲到地库', status: 'soon' },
  { id: 'workday', title: '上班的一天', tagline: '坐地铁到站，打卡，干活，赶末班车', status: 'soon' },
]);

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
export const playableGames = () => GAMES.filter((g) => g.status === 'playable');
