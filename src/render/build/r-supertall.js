// 云澜汇楼盘 R1–R4 超高层的渲染（supertall；P0b 建的空壳，之后归 P-R）。
// buildHospitality 对每栋 R / H / A 先调用 buildSupertallResidentialRender(ctx, b, records)：返回该塔的记录
// （{ group, plane, groundGroup, roofGroup, materials, residentialShells, farLod } 写进 records）就不再走今天的
// buildHospitalityTower；返回 null 则照旧。P-R 在这里接上它的模板实例（facade-modules.js）、中景 / 远景替身
// （far-lod.js 的 spec）、避难层百叶带（curtain-wall.js）与夜景层。
export function buildSupertallResidentialRender(ctx, b, records) {
  void ctx; void b; void records;
  return null;
}
