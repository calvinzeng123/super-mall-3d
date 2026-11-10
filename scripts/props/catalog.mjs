// 小模型清单：每条是「园区里的名字 ← Poly Haven 的哪个模型」，加上加工参数。
//   src           Poly Haven 资产 id（全部 CC0）
//   tris          减面目标（三角形数）
//   tex           贴图边长（默认 512；小东西 256）
//   nodes         只取名字匹配的节点（一个资产里摆了好几件时用）
//   dropMaterials 丢掉的材质（玻璃罩之类的半透明件）
//   height        缩放到这个高度（米）；不写就用原尺寸
//   pivot         原点：floor 贴地正中（默认）、ceiling 顶部正中（吊灯）、wall 背面正中（挂画）
//   yaw           先绕竖轴转多少度，让「正面」朝 +Z
//   alpha         强制要不要镂空（默认看原材质是不是 MASK）
//   tint          做成可染色的：贴图去色、提亮，运行时乘上颜色（食堂的彩色壳椅）
//   error         减面的误差上限（占模型尺寸的比例），默认 0.01 不够再放到 0.03
//   lod           远景简化版的目标三角形数（默认是近景版的三成，40–300 之间）
//   strict        近景版只用保守的减面（细腿、板条多的模型放宽了会散架）
//   backrest      有没有靠背。坐具（group: 'seat'）默认有：加工时会量靠背在座面的哪一侧，
//                 靠背跑到前面（椅子背对 +Z）就报错。没有靠背的凳子写 false，别的类里带靠背的写 true。
// 改完跑 scripts/props/build-props.mjs，再跑 contact-sheet.mjs 看一眼成品。
const only = (name) => [new RegExp(`^${name}$`)];

export const PROP_CATALOG = [
  // ---------- 坐具 ----------
  { id: 'armchair', src: 'modern_arm_chair_01', label: '扶手椅', group: 'seat', tris: 1100 },
  { id: 'lounge_chair', src: 'mid_century_lounge_chair', label: '休闲躺椅', group: 'seat', tris: 1100 },
  { id: 'sofa2', src: 'sofa_02', label: '双人沙发', group: 'seat', tris: 900 },
  { id: 'sofa3', src: 'sofa_03', label: '三人沙发', group: 'seat', tris: 1500, dropMaterials: [/fringe/] },
  { id: 'sofa_leather', src: 'Sofa_01', label: '皮沙发', group: 'seat', tris: 1200 },
  { id: 'ottoman', src: 'Ottoman_01', label: '脚凳', group: 'seat', tris: 500, tex: 256, backrest: false },
  { id: 'dining_chair', src: 'dining_chair_02', label: '餐椅', group: 'seat', tris: 700 },
  { id: 'cafe_chair', src: 'SchoolChair_01', label: '钢木椅', group: 'seat', tris: 600 },
  { id: 'shell_chair', src: 'SchoolChair_01', label: '可染色的壳椅', group: 'seat', tris: 600, tint: true },
  // 这把椅子在原资产里是面朝桌子摆的（背对 +Z），所以转 180°
  { id: 'outdoor_chair', src: 'outdoor_table_chair_set_01', label: '户外椅', group: 'seat', tris: 900, strict: true, yaw: 180, nodes: only('outdoor_table_chair_set_01_chair_01') },
  { id: 'bench_wood', src: 'painted_wooden_bench', label: '木长椅', group: 'seat', tris: 630, backrest: false },
  { id: 'cn_armchair', src: 'chinese_armchair', label: '中式圈椅', group: 'seat', tris: 1200 },
  { id: 'cn_stool', src: 'chinese_stool', label: '中式凳', group: 'seat', tris: 700, tex: 256, backrest: false },
  { id: 'cn_sofa', src: 'chinese_sofa', label: '中式罗汉床', group: 'seat', tris: 704 },
  { id: 'green_chair', src: 'GreenChair_01', label: '绒面椅', group: 'seat', tris: 900 },
  // 原资产背对 +Z（从正面图上看出来的；轮子的顶点太多，靠背的量法对它不准，所以不自动核对）
  { id: 'wheelchair', src: 'wheelchair_01', label: '轮椅', group: 'safety', tris: 1800, yaw: 180 },
  // ---------- 桌 ----------
  { id: 'outdoor_table', src: 'outdoor_table_chair_set_01', label: '户外小桌', group: 'table', tris: 500, strict: true, nodes: only('outdoor_table_chair_set_01_table') },
  { id: 'coffee_table', src: 'modern_coffee_table_01', label: '长茶几', group: 'table', tris: 500 },
  { id: 'coffee_table_round', src: 'coffee_table_round_01', label: '圆茶几', group: 'table', tris: 600 },
  { id: 'side_table', src: 'side_table_01', label: '边几', group: 'table', tris: 400, tex: 256 },
  { id: 'plinth', src: 'side_table_tall_01', label: '高几', group: 'table', tris: 400, tex: 256 },
  { id: 'cafe_table_round', src: 'round_wooden_table_02', label: '圆餐桌', group: 'table', tris: 600 },
  { id: 'cafe_table', src: 'wooden_table_02', label: '方餐桌', group: 'table', tris: 196 },
  { id: 'cn_tea_table', src: 'chinese_tea_table', label: '中式茶几', group: 'table', tris: 900 },
  { id: 'cn_console', src: 'chinese_console_table', label: '中式条案', group: 'table', tris: 1200 },
  { id: 'dining_table', src: 'dining_table', label: '铺桌布的长桌', group: 'table', tris: 1048 },
  // ---------- 绿植 ----------
  { id: 'plant_tall', src: 'potted_plant_01', label: '大盆栽', group: 'plant', tris: 1500 },
  { id: 'plant_bush', src: 'potted_plant_02', label: '矮盆栽', group: 'plant', tris: 1200 },
  { id: 'plant_small', src: 'potted_plant_04', label: '桌面小盆栽', group: 'plant', tris: 500, tex: 256 },
  { id: 'plant_pachira', src: 'pachira_aquatica_01', label: '发财树', group: 'plant', tris: 1400, nodes: [/_bark_d$/, /_leaves_d$/] },
  { id: 'plant_pachira_small', src: 'pachira_aquatica_01', label: '小发财树', group: 'plant', tris: 1000, nodes: [/_bark_c$/, /_leaves_c$/] },
  { id: 'plant_calathea', src: 'calathea_orbifolia_01', label: '竹芋', group: 'plant', tris: 500, nodes: [/_a$/] },
  { id: 'plant_calathea_b', src: 'calathea_orbifolia_01', label: '竹芋（小）', group: 'plant', tris: 400, nodes: [/_b$/] },
  { id: 'plant_anthurium', src: 'anthurium_botany_01', label: '花烛', group: 'plant', tris: 500, nodes: [/_01_a$/] },
  { id: 'plant_anthurium_b', src: 'anthurium_botany_01', label: '花烛（小）', group: 'plant', tris: 400, nodes: [/_01_b$/] },
  { id: 'plant_fern', src: 'fern_02', label: '蕨', group: 'plant', tris: 500, nodes: [/_b$/] },
  { id: 'plant_fern_b', src: 'fern_02', label: '蕨（小）', group: 'plant', tris: 400, nodes: [/_c$/] },
  { id: 'flower_gazania', src: 'flower_gazania', label: '勋章菊', group: 'plant', tris: 350, nodes: [/_h_LOD0$/] },
  { id: 'flower_gazania_b', src: 'flower_gazania', label: '勋章菊（小）', group: 'plant', tris: 300, nodes: [/_g_LOD0$/] },
  { id: 'planter_box', src: 'planter_box_02', label: '木花箱', group: 'plant', tris: 500 },
  { id: 'clay_pot', src: 'planter_pot_clay', label: '陶盆', group: 'plant', tris: 300, tex: 256 },
  // ---------- 店铺陈设 ----------
  { id: 'shelf_steel', src: 'steel_frame_shelves_01', label: '钢货架', group: 'shop', tris: 700, height: 2.14 },
  { id: 'shelf_display', src: 'wooden_display_shelves_01', label: '木展示架', group: 'shop', tris: 700, yaw: -90 },
  { id: 'shelf_wood', src: 'Shelf_01', label: '木书架', group: 'shop', tris: 182 },
  { id: 'coffee_cart', src: 'CoffeeCart_01', label: '咖啡车', group: 'shop', tris: 3000, tex: 1024 },
  { id: 'chalkboard', src: 'standing_chalkboard_01', label: '立式黑板', group: 'shop', tris: 500 },
  { id: 'cardboard_box', src: 'cardboard_box_01', label: '纸箱', group: 'shop', tris: 300, tex: 256 },
  { id: 'crate_wood', src: 'wooden_crate_02', label: '木箱', group: 'shop', tris: 500, tex: 256 },
  { id: 'crate_plastic', src: 'plastic_crate_02', label: '周转筐', group: 'shop', tris: 600, tex: 256, alpha: false },
  { id: 'barrel_wine', src: 'wine_barrel_01', label: '橡木桶', group: 'shop', tris: 700 },
  { id: 'cn_cabinet', src: 'chinese_cabinet', label: '中式立柜', group: 'shop', tris: 1800 },
  { id: 'shutter', src: 'rollershutter_door', label: '卷帘门', group: 'shop', tris: 552, nodes: [/^rollershutter_door$/], pivot: 'wall' },
  { id: 'ukulele', src: 'Ukulele_01', label: '尤克里里', group: 'decor', tris: 700, tex: 256 },
  // ---------- 摆件与艺术品 ----------
  { id: 'bust', src: 'marble_bust_01', label: '大理石胸像', group: 'art', tris: 2500 },
  { id: 'vase_antique', src: 'antique_ceramic_vase_01', label: '古董瓷瓶', group: 'art', tris: 700 },
  { id: 'vase_a', src: 'ceramic_vase_01', label: '瓷瓶 A', group: 'art', tris: 500, tex: 256 },
  { id: 'vase_b', src: 'ceramic_vase_02', label: '瓷瓶 B', group: 'art', tris: 500, tex: 256 },
  { id: 'vase_c', src: 'ceramic_vase_03', label: '瓷瓶 C', group: 'art', tris: 400, tex: 256 },
  { id: 'vase_d', src: 'ceramic_vase_04', label: '瓷瓶 D', group: 'art', tris: 500, tex: 256 },
  { id: 'vase_brass', src: 'brass_vase_01', label: '铜瓶', group: 'art', tris: 700, tex: 256 },
  { id: 'statue_whale', src: 'bronze_whale_statue', label: '青铜鲸', group: 'art', tris: 2000 },
  { id: 'statue_horse', src: 'horse_statue_01', label: '马雕塑', group: 'art', tris: 1800, height: 0.9 },
  { id: 'statue_gothic', src: 'gothic_statue', label: '石雕像', group: 'art', tris: 3000 },
  { id: 'statue_cat', src: 'concrete_cat_statue', label: '石猫', group: 'art', tris: 900, tex: 256 },
  { id: 'statue_shark', src: 'bronze_shark_statue', label: '青铜鲨', group: 'art', tris: 1500 },
  { id: 'statue_ray', src: 'bronze_ray_statue', label: '青铜鳐', group: 'art', tris: 1200 },
  { id: 'dartboard', src: 'dartboard', label: '飞镖盘', group: 'decor', tris: 300, tex: 256, pivot: 'wall' },
  { id: 'chest', src: 'treasure_chest', label: '宝箱', group: 'art', tris: 2000 },
  { id: 'screen', src: 'chinese_screen_panels', label: '屏风', group: 'art', tris: 784 },
  { id: 'frame_b', src: 'hanging_picture_frame_02', label: '挂画 B', group: 'art', tris: 400, pivot: 'wall', dropMaterials: [/glass/] },
  { id: 'frame_fancy', src: 'fancy_picture_frame_02', label: '雕花画框', group: 'art', tris: 1200, pivot: 'wall' },
  { id: 'mirror', src: 'ornate_mirror_01', label: '雕花镜', group: 'art', tris: 1200, pivot: 'wall' },
  { id: 'wall_clock', src: 'wall_clock', label: '挂钟', group: 'art', tris: 500, tex: 256, pivot: 'wall', dropMaterials: [/glass/] },
  { id: 'clock_tall', src: 'vintage_grandfather_clock_01', label: '落地钟', group: 'art', tris: 1200, dropMaterials: [/glass/] },
  { id: 'pillows', src: 'throw_pillows_01', label: '抱枕', group: 'decor', tris: 500, tex: 256 },
  { id: 'gnome', src: 'garden_gnome', label: '花园小矮人', group: 'decor', tris: 900, tex: 256 },
  { id: 'duck', src: 'rubber_duck_toy', label: '橡皮鸭', group: 'decor', tris: 600, tex: 256 },
  // ---------- 灯 ----------
  { id: 'pendant', src: 'modern_ceiling_lamp_01', label: '吊灯', group: 'light', tris: 700, tex: 256, pivot: 'ceiling' },
  { id: 'chandelier', src: 'Chandelier_02', label: '枝形吊灯', group: 'light', tris: 1500, pivot: 'ceiling' },
  { id: 'chandelier_cn', src: 'chinese_chandelier', label: '中式吊灯', group: 'light', tris: 1200, pivot: 'ceiling' },
  { id: 'street_lamp', src: 'street_lamp_01', label: '庭院路灯', group: 'light', tris: 1200, dropMaterials: [/glass/] },
  { id: 'desk_lamp', src: 'desk_lamp_arm_01', label: '台灯', group: 'light', tris: 600, tex: 256 },
  // ---------- 安全与设备 ----------
  { id: 'wet_floor_sign', src: 'WetFloorSign_01', label: '小心地滑', group: 'safety', tris: 228, tex: 256 },
  { id: 'hydrant', src: 'fire_hydrant', label: '消火栓', group: 'safety', tris: 900, tex: 256, nodes: [/^fire_hydrant$/, /^fire_hydrant_cap_0\d$/] },
  { id: 'cctv', src: 'security_camera_01', label: '监控摄像头', group: 'safety', tris: 600, tex: 256, pivot: 'ceiling', dropMaterials: [/glass/] },
  { id: 'trash_can', src: 'metal_trash_can', label: '铁皮垃圾桶', group: 'safety', tris: 600, tex: 256, nodes: [/^metal_trash_can$/, /^metal_trash_can_handle_(left|right)$/] },
  { id: 'trash_bag', src: 'trashbag', label: '垃圾袋', group: 'safety', tris: 400, tex: 256 },
  { id: 'utility_box', src: 'utility_box_01', label: '配电箱', group: 'safety', tris: 400, tex: 256 },
  { id: 'aircon', src: 'exterior_aircon_unit', label: '空调外机', group: 'safety', tris: 1500, error: 0.01, nodes: [/^exterior_aircon_unit$/], alpha: true },
  { id: 'manhole', src: 'water_manhole_cover', label: '井盖', group: 'safety', tris: 300, tex: 256 },
  { id: 'barrel', src: 'Barrel_01', label: '铁桶', group: 'safety', tris: 400, tex: 256 },
  { id: 'torch', src: 'vintage_flashlight', label: '手电筒', group: 'game', tris: 400, tex: 256, dropMaterials: [/glass/] },
  // ---------- 吃的 ----------
  { id: 'croissant', src: 'croissant', label: '可颂', group: 'food', tris: 300, tex: 256 },
  { id: 'cake_carrot', src: 'carrot_cake', label: '胡萝卜蛋糕', group: 'food', tris: 400, tex: 256 },
  { id: 'cake_strawberry', src: 'strawberry_chocolate_cake', label: '草莓巧克力蛋糕', group: 'food', tris: 500, tex: 256 },
  { id: 'apple', src: 'food_apple_01', label: '苹果', group: 'food', tris: 200, tex: 256 },
  { id: 'bananas', src: 'bananas', label: '香蕉', group: 'food', tris: 500, tex: 256, nodes: [/^bananas_bunch$/] },
  { id: 'burger_bun', src: 'hamburger_buns', label: '汉堡面包', group: 'food', tris: 300, tex: 256, nodes: [/_02$/] },
  { id: 'teapot', src: 'tea_set_01', label: '茶壶', group: 'food', tris: 500, tex: 256, nodes: [/teapot_01$/] },
  { id: 'tea_cup', src: 'tea_set_01', label: '茶杯', group: 'food', tris: 300, tex: 256, nodes: [/cup_small_01$/] },
  { id: 'jug', src: 'jug_01', label: '水罐', group: 'food', tris: 400, tex: 256 },
];
