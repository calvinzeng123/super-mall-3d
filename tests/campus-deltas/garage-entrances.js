// 车库出入口靠右行驶（layout/p1-access.js 的 keepRightEntrances，只在游览布局里做）：
// 住宅 R1、酒店 H、西侧公共车库 WPG 北口三组并排坡道的入口 / 出口对调（位置不动，只换 id、type、from/to、名字）。
// 一期北口入口掉头、一期东口对调、公寓出口硬地改接星湾路落在 P1、site 两个记录组里，
// 那两组已经由 p1-atrium.js / p1-mega.js 声明过改动。
export default { expansionChanged: ['H', 'R1', 'WPG'] };
