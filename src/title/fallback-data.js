// 兜底素材：开场场景建不起来（没有 WebGL、资源 404）时的静态主视觉，毛笔 Logo 画不出来（字体读失败）时的静态 Logo 图。
// 只在出错时才读，不算进度条阶段的下载。地址相对网站根目录；打包时 build.mjs（内嵌成 data:）和 build-netlify.mjs（带哈希的独立文件）各自替换这个模块。
export const TITLE_FALLBACK = { scene: './assets/title/fallback.jpg', logo: './assets/title/logo.png' };
