// 新模式的名字和世界观：「断讯 · SIGNAL ZERO」，发生在云澜汇。原游戏是「几猫」港区，这里把界面、无线电台词、
// 枪上的刻字和道具标签里的名字换掉。只换文字，不碰逻辑；每一条都必须在抽出来的代码里找到，找不到就报错（原文件改了要跟着改这里）。
// 顺序有讲究：长的先换，免得短的把长的拆开。最后一条把剩下零散的「几猫」（集装箱公司名、道具标签）统一换成「云澜」。
export const REBRAND = [
  ['几猫队员，这里是指挥中心。港区主控已封锁泊位。切断堆场、仓库、码头的三处中继。', '特勤组，这里是指挥中心。云澜汇的通信被人劫持了。切断商场西翼、酒店二楼、地下大厅的三处上行中继。'],
  ['三处中继全部断开！撤离艇在码头南端的舷梯旁，快撤！', '三处中继全部断开！接应车在公寓地下车库，快撤！'],
  ['几猫队员已登船，港区封锁解除。干得漂亮！', '特勤组已安全撤离，云澜汇通信恢复。干得漂亮！'],
  ['中继尚未断开，撤离艇无法在火力下接应', '中继尚未断开，接应车无法在火力下接应'],
  ['前往撤离艇', '前往接应车'],
  ['"撤离艇"', '"接应车"'],
  ['港区主控上行链路', '云澜汇上行链路'],
  ['几猫兵工厂 · 港区装备', '云澜特勤 · 制式装备'],
  ['港务局装备 · 四号泊位武器库', '特勤组装备 · 西翼武器库'],
  ['几猫九式突击步枪', '九式突击步枪'],
  ['几猫港区 · 四号泊位 · 05:42', '云澜汇 · 一期西翼 · 00:00'],
  ['几猫突击小队 · 单兵行动，无人支援', '云澜特勤组 · 单兵行动，无人支援'],
  ['几猫突击小队', '云澜特勤组'],
  ['几猫港区 · 05:42', '云澜汇 · 00:00'],
  ['几猫<span class="m-subtitle">3A大作</span>', '断讯<span class="m-subtitle">SIGNAL ZERO</span>'],
  ['aria-label="几猫"', 'aria-label="断讯 SIGNAL ZERO"'],
  ['港区防御系统失控。切断三处中继，突破封锁，登船撤离。', '云澜汇的通信被劫持，机械守卫失控。切断三处中继，突破封锁，撤离。'],
  ['四号泊位 · 行动简报', '云澜汇 · 行动简报'],
  ['几猫港区已解除封锁', '云澜汇通信已恢复'],
  ['几猫3A大作', '断讯 · SIGNAL ZERO'],
  ['《几猫》', '《断讯》'],
  ['几猫04', 'YL04'],
  ['几猫港区', '云澜汇'],
  ['几猫', '云澜'],
];

/** 按打包工具的写法转义（esbuild 把非 ASCII 字符写成 \xHH / \uHHHH，大写） */
export const escapeLikeEsbuild = (s) => s.replace(/[^\x00-\x7f]/g, (c) => {
  const n = c.codePointAt(0);
  return n < 0x100 ? '\\x' + n.toString(16).toUpperCase().padStart(2, '0') : '\\u' + n.toString(16).toUpperCase().padStart(4, '0');
});

/** 把 code 里的名字都换掉；返回 { code, counts }。有一条一次都没换到就抛错。 */
export function rebrand(code) {
  const counts = [];
  for (const [from, to] of REBRAND) {
    const a = escapeLikeEsbuild(from), b = escapeLikeEsbuild(to), n = code.split(a).length - 1;
    if (!n) throw new Error(`改名：没有找到「${from}」`);
    code = code.split(a).join(b); counts.push(n);
  }
  if (code.includes(escapeLikeEsbuild('几猫'))) throw new Error('改名后还有「几猫」');
  return { code, counts };
}
