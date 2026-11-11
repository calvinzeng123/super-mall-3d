// 把「几猫」游戏（vendor/jimao/source.html，用户自己的作品）里的代码原样抽成一个封装好的 ES 模块：src/jimao/vendor/game.js。
//
// 那个文件是 esbuild 压缩打包的单文件：three.js r180 和游戏代码在同一个作用域里，变量名都被混淆了。
// 这里不改写任何逻辑：先把它排版开，再按依赖关系把需要的顶层声明原样切出来；凡是引用到 three.js 内部的名字，
// 一律改成从本项目的 three 包里按公开名字取（混淆名 → 公开名的对照表就在打包文件开头）。
// 它的关卡（港口）、背景、地面和渲染管线不抽：新模式用我们自己的地图和渲染器，由 src/jimao/ 里的适配层接上。
//
// 用法：node scripts/jimao/build-vendor.mjs          （要 acorn 和 eslint-scope：npm i --no-save acorn eslint-scope）
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { rebrand } from './rebrand.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'vendor/jimao/source.html');
const html = await readFile(source, 'utf8');
const open = html.indexOf('<script>'), close = html.lastIndexOf('</script>');
if (open < 0 || close < open) throw new Error('source.html 里没有找到脚本');
const pretty = (await transform(html.slice(open + '<script>'.length, close), { minify: false, legalComments: 'none' })).code;
// 游戏代码从关卡范围那一行开始，前面都是 three.js
const gameStart = pretty.split('\n').findIndex((line) => line.includes('quayX: 30')) + 1;
if (!gameStart) throw new Error('没有找到游戏代码的起点');

/** 要抽的入口：混淆名 → 导出名。各模块都是「工厂函数」，吃一个共享的上下文对象，返回这个模块的接口。 */
export const ENTRIES = {
  Gg: 'createMats', d3: 'createPhysics', Yg: 'createProps', Cf: 'createFx', c_: 'createAudio', v_: 'createInput', x_: 'createPlayer',
  zv: 'createCombat', dm: 'createWeapon', Em: 'createEnemies', hM: 'createHud', mM: 'createGame',
  dr: 'stubs', Dy: 'createEvents', il: 'createRng', zy: 'resolveQuality', oi: 'LEVEL_BOUNDS', Mn: 'SUN', en: 'SKY', Pi: 'PLAYER',
  // 道具库的登记：原文件里是三条顶层语句（J3(_i); eb(_i); sb(_i);），抽取工具不会自动带上，下面手工补在模块末尾
  _i: 'registerProp', J3: 'registerPropsA', eb: 'registerPropsB', sb: 'registerPropsC',
};
const FOOTER = '\n// 原文件里的三条顶层语句：把 36 种道具登记进道具库（抽取工具不带顶层调用，这里照原样补上）\nJ3(_i);\neb(_i);\nsb(_i);\n';

// 界面样式：原文件 <style> 里的整套 HUD、菜单、触屏按键样式。页面级的规则（html、body、#app、#view、开机画面）去掉，
// 变量挂到 #ui 上，#ui 改成盖在我们画布上的固定层。
{
  const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  const drop = /^(html, body|body|#app|#app \*, #app \*::before, #app \*::after|#view|#boot|#boot\.done|\.boot-mark|\.boot-sub|\.boot-bar|\.boot-bar i|#fatal) \{[^}]*\}\n?/gm;
  let ui = css.replace(drop, '').replace(/^:root \{/m, '#ui {')
    .replace(/^#ui \{ position: absolute;/m, '#ui { position: fixed; z-index: 30;') + '\n#ui *, #ui *::before, #ui *::after { box-sizing: border-box; }\n';
  if (/#app|#view|#boot/.test(ui.replace(/,\s*#boot/g, ''))) console.warn('界面样式里还有页面级的选择器，请检查');
  await writeFile(path.join(root, 'src/jimao/vendor/ui-css.js'), '// 由 scripts/jimao/build-vendor.mjs 从 vendor/jimao/source.html 生成，不要手改。\nexport const UI_CSS = ' + JSON.stringify(ui) + ';\n');
}

const work = await mkdtemp(path.join(tmpdir(), 'jimao-'));
try {
  const prettyFile = path.join(work, 'pretty.js'), out = path.join(root, 'src/jimao/vendor/game.js'), report = path.join(root, 'vendor/jimao/extract-report.json');
  await writeFile(prettyFile, pretty);
  execFileSync(process.execPath, [path.join(root, 'scripts/jimao/extract-closure.cjs'), '--src', prettyFile, '--game-start', String(gameStart),
    '--entries', Object.keys(ENTRIES).join(','), '--export', Object.entries(ENTRIES).map(([k, v]) => `${k}:${v}`).join(','),
    '--out', out, '--report', report, '--target-three', path.join(root, 'node_modules/three'), '--label', '几猫：除关卡和渲染以外的全部模块'], { stdio: 'inherit' });
  // 改名（见 rebrand.mjs）：界面、台词、刻字里的「几猫」换成新模式「断讯」的世界观
  const renamed = rebrand((await readFile(out, 'utf8')) + FOOTER);
  await writeFile(out, renamed.code);
  console.log(`改名：${renamed.counts.length} 条，共替换 ${renamed.counts.reduce((a, b) => a + b, 0)} 处`);
  const r = JSON.parse(await readFile(report, 'utf8'));
  // 报告里只留能复核的数字：不留本机的临时路径，也不留逐条的清单（五百多条，模块文件头上已经有摘要）
  const builtins = new Set(Object.getOwnPropertyNames(globalThis).concat(['window', 'document', 'navigator', 'location', 'localStorage', 'performance', 'screen', 'matchMedia',
    'requestAnimationFrame', 'cancelAnimationFrame', 'AudioContext', 'OfflineAudioContext', 'webkitAudioContext', 'getComputedStyle', 'devicePixelRatio', 'innerWidth', 'innerHeight',
    'addEventListener', 'removeEventListener', 'HTMLElement', 'Image', 'URLSearchParams', 'ResizeObserver', 'KeyboardEvent', 'PointerEvent', 'CustomEvent', 'Event']));
  const unknown = Object.keys(r.e_freeIdentifiers).filter((name) => !builtins.has(name));
  const summary = { label: r.label, source: { htmlSha256: createHash('sha256').update(html).digest('hex'), prettySha256_16: r.source.sha256_16, lines: r.source.lines, gameStartLine: gameStart },
    entries: ENTRIES, copied: r.a_copied, threeAliases: r.b_threeAliases.names, addonImports: r.b2_addonImports.map((a) => a.exportName), nonPublicThreeInternals: r.c_nonPublicThreeInternals,
    sideEffectStatements: { total: r.d_sideEffectStatements.length, notCarried: r.d_sideEffectStatements.filter((x) => !x.carried).map((x) => `${x.line}: ${x.head.slice(0, 80)}`) },
    globalsUsed: Object.keys(r.e_freeIdentifiers), unknownGlobals: unknown, implicitGlobalWrites: r.e2_implicitGlobalWrites, targetThree: { revision: r.targetThree.revision, missing: r.targetThree.missing, addonMissing: r.targetThree.addonMissing },
    emitted: { lines: r.emitted.lines + FOOTER.split('\n').length - 1, selfCheck: r.emitted.selfCheck } };
  await writeFile(report, JSON.stringify(summary, null, 1) + '\n');
  console.log(`几猫：抽出 ${r.a_copied.units} 个顶层声明（${r.a_copied.distinctSourceLines} 行），引用 three 的公开名字 ${r.b_threeAliases.count} 个，three 里缺的 ${r.targetThree.missing.length} 个，不认识的全局名：${unknown.join(', ') || '无'}`);
  if (unknown.length || r.targetThree.missing.length || r.c_nonPublicThreeInternals.length) process.exitCode = 1;
} finally { await rm(work, { recursive: true, force: true }); }
