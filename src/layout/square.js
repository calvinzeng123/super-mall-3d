// 方庭：v1 的原四方格商场（120×80m）放回一期西北空地，楼层与一期共用（v3 规格第 3 节）。
// 局部 frame F_SQ 原点在方庭中心、不旋转，局部坐标即 v1 坐标（x∈[−60,60]、z∈[−40,40]）；
// 东南角沿 x+z=67.47 切成 46m 宽的斜面，与一期西北翼（225°）末端重合。
import { frame } from './geom.js';

export const F_SQ = frame(-220, -200, 0, 'P1-SQ');
const C = [-106, -106];
const LEG = 46 / Math.SQRT2;
const CORNER = [-160, -160];

/** 斜面两端（世界坐标）：南面端点、东面端点 */
export const CHAMFER = [[CORNER[0] - LEG, CORNER[1]], [CORNER[0], CORNER[1] - LEG]];
/** 西北翼末端到圆厅圆心的距离 */
export const NW_END = Math.hypot(CORNER[0] - LEG / 2 - C[0], CORNER[1] - LEG / 2 - C[1]);
/** 外轮廓拼接折线：西北翼右后角（−v 侧，南面端点）→ 方庭西南角 → 西北角 → 东北角 → 左后角（东面端点） */
export const SQUARE_CHAIN = [CHAMFER[0], [-280, -160], [-280, -240], [-160, -240], CHAMFER[1]];
/** 方庭外轮廓（世界坐标，含斜面） */
export const SQUARE_OUTLINE = [[-280, -240], [-160, -240], CHAMFER[1], CHAMFER[0], [-280, -160]];
