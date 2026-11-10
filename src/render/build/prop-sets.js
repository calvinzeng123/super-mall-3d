// 用贴图小模型拼成的几组陈设：商场口袋休息区里的艺术品和小场景、家居店的四种样板间。
// 都只在接了贴图模型库时调用；摆件没有碰撞，位置都贴着口袋的一端或店铺进深的中段。
const FACE = Math.PI / 2; // 口袋里的摆件面朝局部 +u（朝向口袋中间）
// 展墙（panel(-.5)）朝外的那一面在 dx = −0.51；挂墙的模型原点在背面正中，背面贴着墙面、留 5 mm 不打架
const HANG = -.505;

/**
 * 口袋休息区一端的一组陈设。(x, z) 是这一组的中心（局部坐标），y 是楼面标高，index 选第几组，
 * end 是摆在口袋的哪一端（−1 是 −u 一端，1 是 +u 一端）。
 * 每组占地不超过 2.5 m × 3.6 m（离中心 1.25 m × 1.8 m 以内）；带台座的雕塑、屏风与圈椅、落地钟与绒面椅、货架与木桶、展墙上的画和镜子……
 */
export function pocketSet(B, index, x, y, z, end = -1) {
  // 这组陈设是按「摆在 −u 一端、面朝 +u」写的；摆在 +u 一端（end = 1）时整组绕竖轴转 180°，仍然面朝口袋中间
  const flip = end > 0 ? -1 : 1, turn = end > 0 ? Math.PI : 0;
  const put = (id, dx, dz, h = 0, ry = FACE, scale = 1) => B.prop(id, x + dx * flip, y + h, z + dz * flip, ry + turn, scale);
  const plinth = (dx, dz, size, h, sizeZ = size) => {
    B.get('stone').box(x + dx * flip, y + h / 2, z + dz * flip, size, h, sizeZ, '#ece6da');
    B.blob?.(x + dx * flip, y, z + dz * flip, size * 1.5 + .3, sizeZ * 1.5 + .3);
  };
  const panel = (dx) => {
    B.get('matte').box(x + (dx - .07) * flip, y + 1.2, z, .12, 2.4, 2.7, '#e7dfd0');
    B.get('metal').box(x + (dx - .07) * flip, y + .04, z, .2, .08, 2.8, '#6f6a5f');
    B.blob?.(x + (dx - .07) * flip, y, z, .9, 3.3);
    // 展墙的背面朝着走道或中庭，不能是一块白板：做成展览的题头墙（深色底、一行标题、两行说明、一块色标）
    const back = (depth, h, dz, sy, sz, color, key = 'matte') => B.get(key).box(x + (dx - .13 - depth) * flip, y + h, z + dz * flip, .012, sy, sz, color);
    back(.004, 1.3, 0, 1.9, 2.3, '#34524b');
    back(.012, 1.86, .3, .13, 1.3, '#efe6d2');
    for (const h of [1.62, 1.5]) back(.012, h, .45, .045, 1.0, '#b9c4b8');
    back(.012, .82, -.75, .36, .36, '#c9a45c', 'satin');
  };
  const sets = [
    () => { plinth(0, 0, .5, .9); put('bust', 0, 0, .9, FACE, 1.2); },
    () => { plinth(0, 0, 1.2, .3, 1.6); put('statue_whale', 0, 0, .3, FACE + .4); },
    () => { plinth(-.1, -.6, .5, .8); put('vase_antique', -.1, -.6, .8, 0, 1.1); put('plinth', 0, .55); put('vase_brass', 0, .55, .76, 0, .8); },
    () => { plinth(0, 0, .8, .55); put('statue_horse', 0, 0, .55, FACE - .3); },
    () => { plinth(0, -.7, .9, .5); put('statue_ray', 0, -.7, .5); plinth(0, .7, .6, .9); put('statue_shark', 0, .7, .9, FACE + .5); },
    () => { plinth(0, 0, 1.7, .15, 1.8); put('statue_gothic', 0, 0, .15); },
    () => { put('screen', -.35, 0); put('cn_armchair', .45, -.5, 0, FACE + .3); put('cn_stool', .5, .65); put('vase_c', .5, .65, .63, 0, .9); },
    () => { put('clock_tall', -.3, -.8); put('green_chair', .1, .1, 0, FACE - .35); put('side_table', .15, .95); put('jug', .15, .95, .551, 1.1); },
    () => { put('shelf_steel', -.35, 0); put('crate_wood', .45, -.75, 0, FACE + .4); put('barrel_wine', .5, .7, 0, 0); put('cardboard_box', .4, -.75, .46, .5); },
    () => { put('shelf_wood', -.45, -.35); put('lounge_chair', .4, .5, 0, FACE - .5); put('shelf_display', -.5, 1.05, 0, FACE, .7); },
    () => { for (const [i, [dx, dz]] of [[0, -.65], [.5, 0], [-.1, .65]].entries()) put('duck', dx, dz, 0, FACE + i, 1.5 + i * .3); put('gnome', -.5, 0, 0, FACE, 1.2); },
    () => { plinth(0, -.55, .5, .9); put('statue_cat', 0, -.55, .9, FACE, 1.4); put('planter_box', 0, .65, 0, 0); put('plant_fern_b', -.25, .65, .28, 1, .6); put('plant_calathea_b', .3, .65, .28, 2, .9); },
    () => { plinth(0, 0, 1.1, .3, .7); put('chest', 0, 0, .3); put('barrel', -.2, 1.05, 0, 0); put('torch', .3, .95, 0, 2, 1.2); },
    () => { put('cn_sofa', -.3, 0, 0, FACE, .8); put('cn_tea_table', .75, 0, 0, 0, .8); put('teapot', .75, .05, .4, 1, 1.3); put('tea_cup', .95, -.2, .4, 0, 1.2); },
    () => { panel(-.5); put('frame_b', HANG, -.6, 1.5); put('frame_fancy', HANG, .55, 1.45); },
    () => { panel(-.5); put('mirror', HANG, -.6, 1.55, FACE, 1.3); put('wall_clock', HANG, .6, 1.75, FACE, 1.3); put('cn_console', .0, 0, 0, FACE, .8); put('vase_a', 0, -.4, .483); put('vase_d', 0, .35, .483, 1); },
    () => { panel(-.5); put('dartboard', HANG, 0, 1.6, FACE, 1.2); put('cafe_table_round', .45, -.3, 0, 0, .9); put('cafe_chair', .5, .8, 0, FACE + 2.6); put('ukulele', -.3, 1.0, 0, FACE, 1.3); },
    () => { put('bench_wood', -.3, 0); put('clay_pot', .3, -.95, 0, 0, 1.6); put('plant_anthurium_b', .3, -.95, .3, 1, .7); put('vase_b', .35, .95, 0, 0, 1.6); },
  ];
  sets[((index % sets.length) + sets.length) % sets.length]();
  return sets.length;
}

/**
 * 家居店的样板间。prop(id, a, b, h, face, scale) 是店铺局部坐标里的摆放函数（face：Math.PI 朝门口，0 朝店内）。
 * variant 选四种风格之一：现代、中式、古典、餐厅；slot 是店里四个位置之一（0–3），(a, b) 是这个位置的中心，H 是净高。
 * 每组占地不超过 2.4 m × 2.6 m（离中心 1.2 m × 1.3 m 以内），店里按 2.4 m 的列距、2.6 m 的排距摆，互不相碰。
 * 摆在桌面、条案上的东西，高度取的是那件家具台面的实际高度（scripts/props/audit-sets.mjs 量模型核对）。
 */
export function homeShowroom(prop, variant, slot, a, b, H) {
  const P = Math.PI;
  const styles = [
    [ // 现代
      () => { prop('sofa2', a, b + .15); prop('coffee_table', a, b - .95, 0, P / 2, .8); prop('pillows', a - .3, b + .12, .40, P, .7); },
      () => { prop('cafe_table', a, b, 0, 0, [1.15, .94, 1.1]); for (const da of [-.36, .36]) { prop('dining_chair', a + da, b - .68, 0, 0); prop('dining_chair', a + da, b + .68, 0, P); } prop('vase_antique', a, b, .75, 0, .8); },
      () => { prop('lounge_chair', a - .3, b + .1, 0, P - .3); prop('side_table', a + .75, b + .2); prop('desk_lamp', a + .75, b + .2, .551, P, .6); },
      () => { prop('armchair', a - .62, b, 0, P - .25); prop('armchair', a + .62, b, 0, P + .25); prop('plant_pachira_small', a, b + .85, 0, 3, .8); },
    ],
    [ // 中式
      () => { prop('cn_sofa', a, b + .2, 0, P, .85); prop('cn_tea_table', a, b - .85, 0, 0, .85); prop('teapot', a, b - .85, .425, 1, 1.3); prop('tea_cup', a + .25, b - .7, .425, 0, 1.2); },
      () => { prop('cn_armchair', a - .6, b + .15, 0, P - .2); prop('cn_armchair', a + .6, b + .15, 0, P + .2); prop('cn_stool', a, b - .85, 0, 0, .75); prop('chandelier_cn', a, b - .2, H - .08, 0, 1.1); },
      () => { prop('cn_console', a, b + .3, 0, P); prop('vase_a', a - .5, b + .3, .604); prop('vase_brass', a + .1, b + .3, .604, 0, .7); prop('vase_d', a + .55, b + .3, .604, 1); },
      () => { prop('screen', a, b + .35, 0, P); prop('cn_cabinet', a + .0, b - .55, 0, P, .62); },
    ],
    [ // 古典
      () => { prop('sofa_leather', a, b + .45); prop('coffee_table_round', a, b - .7, 0, 0, .78); prop('chandelier', a, b - .1, H - .08, 0, 1.2); },
      () => { prop('green_chair', a - .55, b - .1, 0, P - .3); prop('green_chair', a + .55, b - .1, 0, P + .3); prop('plinth', a, b + .8); prop('vase_c', a, b + .8, .76); },
      () => { prop('clock_tall', a - .55, b + .3); prop('ottoman', a + .35, b, 0, P, .9); },
      () => { prop('sofa3', a, b + .1, 0, P, .78); prop('pillows', a + .3, b + .08, .4, P, .7); },
    ],
    [ // 餐厅
      () => { prop('dining_table', a, b, 0, 0, .8); for (const da of [-.5, .5]) { prop('dining_chair', a + da, b - .85, 0, 0); prop('dining_chair', a + da, b + .85, 0, P); } prop('jug', a - .3, b, .653); prop('cake_strawberry', a + .25, b, .653, 0, 1.2); },
      () => { prop('cafe_table_round', a, b); prop('cafe_chair', a - .75, b, 0, P / 2); prop('cafe_chair', a + .75, b, 0, -P / 2); prop('bananas', a - .1, b, .75, 1, 1.2); prop('apple', a + .2, b + .1, .75, 0, 1.2); prop('pendant', a, b, H - .08, 0, 1.1); },
      () => { prop('shelf_display', a - .3, b + .3); prop('plant_bush', a + .7, b + .2, 0, 2, .9); },
      () => { prop('outdoor_table', a, b); prop('outdoor_chair', a - .7, b, 0, P / 2); prop('outdoor_chair', a + .7, b, 0, -P / 2); prop('plant_small', a, b, .73, 0, 1.4); },
    ],
  ];
  styles[variant % styles.length][slot % 4]();
  return styles.length;
}
