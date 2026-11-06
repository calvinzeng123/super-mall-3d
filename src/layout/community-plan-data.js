// 云澜社区住宅户型数据：重新导出两份生成文件（内容与拆分前逐字节相同）。
//   community-plan-data-west.js  云澜·西苑 W1/W2（3梯5户），scripts/plans/west.mjs 生成，西苑包维护
//   community-plan-data-north.js 云澜·北苑 T1/T2（一梯一户 大平层 + 错层复式），scripts/plans/north.mjs 生成，北苑包维护
// 由 scripts/prepare-community-plans.mjs 重新生成；不要手工修改生成文件。
import { WEST_PLANS } from './community-plan-data-west.js';
import { NORTH_PLANS } from './community-plan-data-north.js';

export const COMMUNITY_PLANS = Object.freeze({
  west: WEST_PLANS,
  north: NORTH_PLANS,
});
