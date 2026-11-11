// HDR 天空素材的地址（scripts/sky/build-sky.mjs 生成，出处见 assets/sky/manifest.json）。
// 开发时直接取仓库里的文件；两个构建脚本会把这个模块换掉：单文件版内嵌成 data: 地址，发布版换成带校验名的文件。
export const SKY_ASSETS = { radiance: './assets/sky/day-radiance.hdr', photo: './assets/sky/day-sky.jpg' };
