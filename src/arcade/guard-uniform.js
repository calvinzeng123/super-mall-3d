// 保安制服的配色和分区规则。纯数据和纯函数，不碰 three.js、DOM 和生成的素材目录，可以在 Node 里直接测。

/** 制服配色。 */
export const GUARD_UNIFORM = Object.freeze({ shirt: '#6d83a6', trousers: '#27314a', shoes: '#15171b', cap: '#1f2940', band: '#e8c44a' });
/** 走一米前进多少个步态循环（和园区行人一致：一个循环约 1.17 m）。 */
export const GUARD_CYCLES_PER_METRE = 1 / (1.1 * 1.0667);

/**
 * 按站姿下三角形重心的位置分区：鞋、长裤、上衣（含上臂的袖子）、其余（头、前臂、手）不动。
 * 身高按 1.8 m 的模型定的阈值，别的身高按比例缩放。纯函数。
 */
export function uniformRegion(x, y, height = 1.8) {
  const k = height / 1.8, ax = Math.abs(x) / k, h = y / k;
  if (h < 0.085) return 'shoes';
  if (h < 0.62) return ax < 0.205 ? 'trousers' : null;
  if (h < 1.02) return ax < 0.178 ? 'trousers' : null; // 垂在身侧的前臂和手在这个高度，但更靠外
  if (h < 1.5) return ax < 0.215 || h > 1.14 ? 'shirt' : null;
  return null;
}
