// 云澜酒店 H 与云澜服务公寓 A 超高层的渲染（supertall；P0b 建的空壳，之后归 P-HA）。
// buildHospitality 对每栋 R / H / A（R 的 builder 返回 null 之后）调用 buildSupertallTowerRender(ctx, b, records)：
// 返回该塔的记录就不再走今天的 buildHospitalityTower；返回 null 则照旧。P-HA 在这里接上幕墙（curtain-wall.js）、
// 避难层与设备层、停机坪、远景替身与夜景层（far-lod.js）。
export function buildSupertallTowerRender(ctx, b, records) {
  void ctx; void b; void records;
  return null;
}
