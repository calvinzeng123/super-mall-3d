// 开场时间轴：四个镜头 + 标题段（Logo 落下、菜单浮出，背景继续实时循环）。
// 镜头的内容都按「场景时间」写在 scene.js 里（完整版的秒数）；短版、菜单背景只是换一张表，用 sceneTime() 换算过去，
// 所以短版里的楼顶、直升机和完整版是同一段画面，白闪也落在同一处。全是纯函数，测试和截图、导出视频都靠它取样。

/** 一个镜头：id、在这一版里的起止秒数 [t0, t1)、at = t0 那一刻对应的场景时间（完整版的秒数） */
const shot = (id, t0, t1, at = t0) => Object.freeze({ id, t0, t1, at });

/** 标题段从第几秒起（场景时间）；之后 Logo、菜单按各版自己的秒数出现 */
export const TITLE_START = 26;

export const TIMELINE = Object.freeze({
  // 完整版约 26 秒：高空俯冲 → 商场门口尸潮 → 楼顶重机枪 → 直升机升起、探照灯扫进镜头、白闪
  full: Object.freeze([
    shot('aerial', 0, 7),
    shot('horde', 7, 13.5),
    shot('roof', 13.5, 20),
    shot('heli', 20, TITLE_START),
    shot('title', TITLE_START, Infinity),
  ]),
  // 短版（第二次打开）：楼顶最后一点 + 直升机升起（取完整版直升机镜头的后 4.5 秒，白闪对齐） + 标题
  short: Object.freeze([
    shot('roof', 0, 1.3, 18.7),
    shot('heli', 1.3, 5.8, TITLE_START - 4.5),
    shot('title', 5.8, Infinity, TITLE_START),
  ]),
  // 菜单背景：楼顶 + 直升机悬停 + 雨，一直循环（场景时间从标题段开始往后走）
  loop: shot('title', TITLE_START, Infinity),
});

/** Logo 落下、菜单浮出的时刻（各版自己的秒数）；两版从 Logo 到菜单隔得一样长 */
export const LOGO_AT = Object.freeze({ full: 27.0, short: 6.8 });
export const MENU_AT = Object.freeze({ full: 28.4, short: 8.2 });

/** 第 t 秒落在哪个镜头、镜头里走了多少（0..1；最后一段没有尽头，恒为 0）。t 小于 0 按开头算，超过末尾停在最后一段 */
export function sampleShot(list, t) {
  const x = Math.max(list[0].t0, t);
  let s = list[list.length - 1];
  for (const it of list) if (x < it.t1) { s = it; break; }
  const len = s.t1 - s.t0;
  return { shot: s, local: Number.isFinite(len) && len > 0 ? Math.min(1, Math.max(0, (x - s.t0) / len)) : 0 };
}

/** 这一版第 t 秒对应的场景时间（完整版的秒数） */
export function sceneTime(list, t) {
  const { shot: s } = sampleShot(list, t);
  return s.at + (Math.max(list[0].t0, t) - s.t0);
}
