// 米制平面投影：合批几何不依赖每个小方块的 0–1 UV，纹理不会被拉成长条。
export function surfaceUV(x, y, z, nx, ny, nz) {
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  if (ay >= ax && ay >= az) return [x, -z * Math.sign(ny || 1)];
  if (az >= ax) return [x * Math.sign(nz || 1), y];
  return [-z * Math.sign(nx || 1), y];
}
