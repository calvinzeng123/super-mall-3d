// 队友名单和外观表（squad.js 用；开场动画也直接拿来给楼顶三人穿衣服）。
// 单独一个文件、只依赖 rig-skin.js：开场不能把 nav.js / 整个布局牵进首页的首次下载。
import { SURF } from './skins/rig-skin.js';

/**
 * follow：站在你身后 [near, far] 米之间，超过 run 米跑着追，超过 warp 米（或不在同一层超过 warpSeconds 秒）直接跟到身后；
 *         救出来的人（小许）你 lost 秒看不见他（隔着玻璃、墙）也直接跟到身后；
 * see：多远以内的丧尸会打；bite：丧尸在 reach 米内每只每秒咬掉 dps；
 * down：倒地后你站在 reach 米内 revive 秒扶起来（回到 hp），林医生去扶要 medic 秒；
 * horde：有队友在场时尸潮的规模乘多少（人多了，来的也多）。
 */
export const SQUAD = Object.freeze({
  follow: Object.freeze({ near: 2.2, far: 4.6, run: 8, warp: 24, warpSeconds: 2.2, walk: 3.4, sprint: 7.2, lost: 2.5 }),
  see: 24, bite: Object.freeze({ reach: 1.55, dps: 6.5, pull: 5.5 }),
  // 巨尸够得着队友：一巴掌拍飞出去（掉 damage 点血、躺 stun 秒），every 秒内不再挨第二下
  fling: Object.freeze({ damage: 28, speed: 11, stun: 1.2, every: 3.5 }),
  down: Object.freeze({ revive: 3, reach: 2.1, hp: 50, medic: 4.5 }),
  // 救出来的人（小许）不按队友那套「贴着的每只每秒咬 dps」算（以前五六只一起贴上，五秒就没了）：
  //   同时最多 cap 只真咬得到他（先贴上的先咬，其余的围着等），每只贴上 windup 秒咬第一口、之后每 every 秒一口、一口 hit 点（siege 再按你手里有没有枪打折）；
  //   身边 flee 米内有丧尸就往你身后（尸群的另一边、扶梯口那边优先）躲，跑 run 米 / 秒（比行尸快、比奔尸慢）；
  //   倒了你站到 reach 米内 revive 秒就扶起来（比队友快），但你身边 busy 米内有醒着的丧尸时扶不了（先腾出手）；两个队友优先打离他 guard 米内的
  guest: Object.freeze({ cap: 2, hit: 8, every: 1.4, windup: 0.5, flee: 3, run: 4.2, revive: 1.4, reach: 2.6, busy: 1.6, guard: 2.4 }),
  horde: 1.25,
  members: Object.freeze([
    Object.freeze({ id: 'zhe', name: '阿哲', role: '夜班保安', hp: 130, side: -1, back: 2.6, trait: 'spotter',
      gun: Object.freeze({ name: '冲锋枪', interval: 0.11, burst: [4, 7], rest: [0.55, 1.1], damage: 9, hit: 0.78, falloff: 0.012, head: 0.08, range: 22 }),
      // 阿哲：藏青保安制服 + 荧光黄的贴身网布背心（V 领、拉链、包边；银灰反光条手电一照就亮，背后印「保安」）、黄色安全帽带帽灯、
      // 黑皮手套和工装靴；寸头、胡茬。打了两个钟头：裤腿和靴子一层灰；右手套抹过血、右袖口溅上一道、左大腿蹭了一道、背心前面淌下来一道
      look: Object.freeze({ face: 'zhe', skin: 0xa8765a, lip: 0x8a5446, hair: 0x17130f, iris: 0x24170f, shirt: 0x222a3b, pants: 0x1d2129, vest: 0xa9b434, strap: 0x9aa0a8, pouch: 0x262c3c, helmet: 0xc9a22c, mask: 0x23262b, glove: 0x1d1b1a, boot: 0x1b1a19, pad: 0x262b3a,
        tape: 0xb4b8bb, bind: 0x8d962c, nameTape: 0x232a3a, patch: 0x3a4660, cuffButton: true, gloveCuff: 0x121212, shirtSurf: SURF.CLOTH, vestSurf: SURF.HIVIS, pads: false, heavy: false, who: 0, grime: 0.85,
        blood: Object.freeze([Object.freeze({ c: [-0.1, 1.35, 0.29], r: 0.045, k: 0.95, e: 2.2, a: 0.5 }), Object.freeze({ c: [-0.19, 1.3, 0.17], r: 0.035, k: 0.8, e: 2.5, a: 0.2 }), Object.freeze({ c: [0.11, 0.95, 0.12], r: 0.03, k: 0.6, e: 2.5, a: -0.1 }),
          Object.freeze({ c: [-0.06, 1.24, 0.13], r: 0.035, k: 0.75, e: 3.2, a: 0.08 }), Object.freeze({ c: [0.15, 1.15, 0.1], r: 0.03, k: 0.6, e: 3, a: 0.05 }), Object.freeze({ c: [0.09, 0.05, 0.15], r: 0.035, k: 0.7, e: 1.4, a: 0 })]) }) }),
    Object.freeze({ id: 'lin', name: '林医生', role: '急诊科医生', hp: 90, side: 1, back: 4, trait: 'medic',
      gun: Object.freeze({ name: '手枪', interval: 0.5, burst: [1, 3], rest: [0.35, 0.7], damage: 24, hit: 0.9, falloff: 0.008, head: 0.3, range: 26 }),
      heal: Object.freeze({ below: 45, amount: 35, cooldown: 55, reach: 2.2, time: 1.4, range: 16 }),
      // 林医生：墨绿刷手服（短袖露小臂）、灰白的贴身急救背心（绿十字、红色止血带包、急救包，挂着工作证）、蓝色丁腈手套、
      // 白护士鞋（早就不白了）；头发往后挽成低髻，外科口罩拉在下巴底下，脖子上挂着听诊器。
      // 两只手套上全是别人的血（一抹一抹的），背心前襟往下淌了一道，右膝跪在血里
      look: Object.freeze({ face: 'lin', skin: 0xc99a7c, lip: 0xa0605a, hair: 0x1f1714, iris: 0x2b1d14, shirt: 0x2c6764, pants: 0x295a58, vest: 0xb4b6ae, bind: 0x46524e, strap: 0x5e7d72, pouch: 0xa9aca4, helmet: 0xf1f1ec, mask: 0x9ad6d0, glove: 0x6283a8, gloveCuff: 0x58789c, boot: 0xa4a49d, pad: 0x8fc9c4,
        sole: 0x8a8a86, nameTape: 0x3a5a56, shirtSurf: SURF.SCRUBS, pantsSurf: SURF.SCRUBS, gloveSurf: SURF.RUBBER, sleeve: 'short', pads: false, heavy: false, who: 1, grime: 1,
        blood: Object.freeze([Object.freeze({ c: [-0.1, 1.35, 0.29], r: 0.055, k: 1, e: 1.8, a: 0.4 }), Object.freeze({ c: [-0.07, 1.38, 0.44], r: 0.055, k: 1, e: 1.6, a: -0.3 }), Object.freeze({ c: [0.035, 1.2, 0.135], r: 0.04, k: 0.85, e: 3.4, a: 0.06 }),
          Object.freeze({ c: [-0.02, 0.5, 0.09], r: 0.045, k: 0.65, e: 1.3, a: 0 }), Object.freeze({ c: [0.17, 1.45, 0.07], r: 0.022, k: 0.8, e: 2.2, a: -0.2 }), Object.freeze({ c: [-0.08, 0.06, 0.14], r: 0.03, k: 0.8, e: 1.6, a: 0 })]) }) }),
    // 小许：三层奶茶店的店员，被锁在店里，救出来以后跟着你走一段（护送）。不开枪（射程 0 就不找目标），丧尸会优先扑他。guest：救出来之前不出现、不算队友
    Object.freeze({ id: 'xu', name: '小许', role: '奶茶店店员', hp: 80, side: 1, back: 1.8, trait: 'guest', guest: true,
      gun: Object.freeze({ name: '', interval: 1, burst: [0, 0], rest: [1, 1], damage: 0, hit: 0, falloff: 0, head: 0, range: 0 }),
      look: Object.freeze({ face: 'zhe', skin: 0xc59a7a, lip: 0x9a6052, hair: 0x241a12, iris: 0x2a1c12, shirt: 0xd9d4c8, pants: 0x2e3036, vest: 0x8a4a2c, strap: 0x6b3a22, pouch: 0x7a4428, helmet: 0x241a12, mask: 0x2a2a2e, glove: 0xc59a7a, boot: 0x3a3632, pad: 0x2e3036,
        tape: 0xd9d4c8, bind: 0x6b3a22, nameTape: 0x8a4a2c, patch: 0x8a4a2c, sleeve: 'short', pads: false, heavy: false, who: 2, grime: 0.7,
        blood: Object.freeze([]) }) }), // 血迹的格子（12 个）已经被两个队友占满了：小许身上不加
  ]),
  // 主角（单人时的你）：只在联机时作为别人眼里的人形出现——你扮演阿哲 / 林医生时主角是别人（或者主机走了以后由电脑接手）。不在 members 里（单人永远用不到）
  lead: Object.freeze({ id: 'lead', name: '主角', role: '特勤队员', hp: 100, side: 1, back: 1.7, trait: 'lead', lead: true,
    gun: Object.freeze({ name: '步枪', interval: 0.13, burst: [3, 5], rest: [0.45, 0.9], damage: 15, hit: 0.84, falloff: 0.01, head: 0.15, range: 26 }),
    // 黑灰作训服 + 橄榄色板甲背心、深色头盔、战术手套；和两名队友一眼分得开
    look: Object.freeze({ face: 'zhe', skin: 0xb88a6c, lip: 0x8f5a4b, hair: 0x15110e, iris: 0x22160e, shirt: 0x2a2d2b, pants: 0x2b2e2a, vest: 0x4a5137, strap: 0x3a3f2c, pouch: 0x3f4530, helmet: 0x30342e, mask: 0x202224, glove: 0x1c1c1b, boot: 0x1a1918, pad: 0x2f342a,
      tape: 0x8a8e7a, bind: 0x3a402c, nameTape: 0x353b2a, patch: 0x56604a, pads: true, heavy: false, who: 3, grime: 0.6, blood: Object.freeze([]) }) }),
});
