// 云澜汇楼盘 R1–R4 超高层（expansion layout only）. Stub created by P0a; the 二期 R package (P-R) owns this file.
//
// Contract (SPEC §2.1 "supertall dispatch"): buildHospitality({ expansion: true }) calls
// supertallResidential(spec, ctx) for every HOSPITALITY.towers entry before the compact builder tower(spec):
//   - return null for a spec this module does not build (the compact tower(spec) is used, as today);
//   - otherwise return a part { building, levels, stairs, elevators, escalators, ramps, entrances,
//     access: { zones, gates }, fireAccess: [hardstandRecord(…)] }. access is appended to
//     layout.accessControl, fireAccess to site.fireAccess.
// ctx: { site, expansion }. The compact FPS layout never calls this (fps-frozen).
// Shared builders the compact layout calls (lift() in mall.js, towerStairPlan / buildTowerStairAccess,
// gateRecord) never get the supertall fields written by them: set speed / role / zone / card / fireOnly /
// breakLevels / maxRisers / refugeRoom / lv.zone here, on records only this module creates (rule C-13).
export function supertallResidential(spec, ctx = {}) {
  return null;
}
