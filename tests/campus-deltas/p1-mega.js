// 超级商业中心第一步（layout/p1-mega.js）：方庭、西北翼、圆厅之间补 A、B 两块楼面（1F–6F），三个中庭洞口连成一个。
// 洞口里的西北翼铺位（2F–6F）和 1F 洞口正下方的铺位让给中庭广场；A、B 贴墙一圈新铺位（MG*）。净增见 shops。
// 两座二层艺术环廊天桥落在新楼面上，换成附楼外墙上的门（记录组 P1、fidelity 已在 p1-atrium.js 里声明改动）。
// 改动的记录组：P1C（南门改成直通商场）、P1W4（二层连廊门挪到东墙）、site（室外步道、喷泉）、extensions（拆两座桥）、
// expansion（环廊路线、西门位置）。
export default { shops: 6, expansionChanged: ['P1C', 'P1W4', 'site', 'extensions', 'expansion'] };
