// 原创虚构品牌表（不对应任何真实品牌）。按楼层 → 铺位槽位分配。
// 字段：[中文名, 英文名, 业态, 招牌底色, 招牌字色, 字标图形]
// 字标图形：crown mono bolt drop diamond ring sun wave leaf star heart moon cup bowl flame film book game cart peak flower

export const BRANDS = {
  '1F': {
    NW: ['霁月', 'MAISON JIYUE', 'luxury', '#1f2a2e', '#e8d9b5', 'crown'],
    SW: ['洛珂', 'LOCCA', 'luxury', '#2b2238', '#f1e6d0', 'mono'],
    NE: ['拾光数码', 'GLEAM TECH', 'tech', '#0f172a', '#7dd3fc', 'bolt'],
    SE: ['雾光美妆', 'MISTGLOW', 'beauty', '#f6e7ec', '#a3355b', 'drop'],
    S1: ['珀曜珠宝', 'PERLUNE', 'jewelry', '#12312b', '#e6c98a', 'diamond'],
    S2: ['时砂腕表', 'TEMPSAND', 'jewelry', '#1b1b1f', '#d9c08c', 'ring'],
    S3: ['金屿', 'AURISLE', 'jewelry', '#6b4e1f', '#fff3d6', 'sun'],
    S5: ['黛蓝', 'INDIGO LUXE', 'luxury', '#1d2b53', '#e9e4d8', 'wave'],
    S6: ['恒刻', 'HORAE', 'jewelry', '#2a2a2a', '#c9b37e', 'ring'],
    N1: ['花笺香氛', 'PETALINE', 'beauty', '#f3ece4', '#8a4b5c', 'leaf'],
    N2: ['素颜研', 'PUREFACE', 'beauty', '#ffffff', '#2f6f6a', 'mono'],
    N3: ['珂兰', 'KOLAN BEAUTY', 'beauty', '#2c1f2b', '#f2c6d6', 'star'],
    N5: ['明眸眼镜', 'CLEARVIEW', 'accessory', '#eef3f7', '#24506e', 'ring'],
    N6: ['星环电子', 'ORBIT', 'tech', '#111827', '#a7f3d0', 'ring'],
    N7: ['绯色', 'ROUGE ATELIER', 'beauty', '#7a1426', '#ffe4e1', 'heart'],
    W1: ['驼铃皮具', 'CARAVAN', 'shoes', '#5a3b22', '#f1dcc0', 'mono'],
    W2: ['云栖咖啡', 'NIMBUS COFFEE', 'cafe', '#3b2a20', '#f6e3c8', 'cup'],
    W3: ['香榭', 'SCENTIER', 'beauty', '#e9e1d3', '#5b4636', 'leaf'],
    E1: ['履川', 'LUCHUAN', 'shoes', '#20303a', '#e7d3b0', 'mono'],
    E2: ['半糖甜点', 'HALF SUGAR', 'cafe', '#fde7ef', '#c2416c', 'heart'],
    E3: ['澜庭珠宝', 'LANTING JEWEL', 'jewelry', '#0f3b44', '#f2dca2', 'diamond'],
    'INW-a': ['星钻坊', 'STELLAGEM', 'jewelry', '#ffffff', '#1f4e79', 'star'],
    'INW-b': ['绮梦', 'REVERIE', 'luxury', '#efe6f5', '#4b2a6b', 'moon'],
    'ISW-a': ['花屿花店', 'FLORA ISLE', 'home', '#f4f7ee', '#5c7a3a', 'flower'],
    'ISW-b': ['雅瓷', 'PORCELAINE', 'home', '#e6eef3', '#1d4e6e', 'mono'],
    'INE-a': ['光年耳机', 'LIGHTYEAR AUDIO', 'tech', '#0b0f14', '#f5b301', 'bolt'],
    'INE-b': ['蔻丹美甲', 'KODAN NAILS', 'beauty', '#fbe9e7', '#b0413e', 'star'],
    'ISE-a': ['茶小满', 'CHA XIAOMAN', 'tea', '#e8f3ec', '#2f6b4f', 'leaf'],
    'ISE-b': ['银河香氛', 'GALAXIA SCENT', 'beauty', '#1a1240', '#d8cffc', 'star'],
  },
  '2F': {
    NW: ['森野', 'FORESTA', 'fashion', '#23412f', '#e3efd9', 'leaf'],
    SW: ['疾风运动', 'GALE SPORTS', 'sports', '#0b3b8c', '#ffffff', 'bolt'],
    NE: ['山脊户外', 'RIDGELINE', 'sports', '#3d4a2a', '#f2e8c9', 'peak'],
    SE: ['白昼', 'DAYLIGHT', 'fashion', '#ffffff', '#222222', 'sun'],
    N1: ['青柚', 'GRAPEFRUIT', 'fashion', '#f7f3dc', '#d1495b', 'ring'],
    N2: ['拾柒', 'SEVENTEEN', 'fashion', '#111111', '#f5f5f5', 'mono'],
    N3: ['素衣', 'PLAINWEAR', 'fashion', '#efeae2', '#4a4440', 'mono'],
    N4: ['潮汐', 'TIDE', 'fashion', '#0e4d64', '#e0f2f1', 'wave'],
    N5: ['靛青', 'INDIGO DENIM', 'fashion', '#1e3a8a', '#dbeafe', 'mono'],
    N6: ['跃动', 'LEAPFIT', 'sports', '#ff5a1f', '#ffffff', 'bolt'],
    N7: ['跑者实验室', 'RUNNER LAB', 'sports', '#101010', '#d4ff3a', 'mono'],
    S1: ['漫步者', 'WANDERER', 'fashion', '#6b4f3a', '#f4e9dc', 'peak'],
    S2: ['半岛', 'PENINSULA', 'fashion', '#e6f0f5', '#285e7a', 'wave'],
    S3: ['野鹿', 'WILD DEER', 'fashion', '#8b5e34', '#fff7ea', 'leaf'],
    S4: ['风格志', 'STYLOG', 'fashion', '#f2f2f2', '#c81d25', 'mono'],
    S5: ['步履', 'STRIDE', 'shoes', '#1f2937', '#fbbf24', 'mono'],
    S6: ['行囊', 'VOYAGE BAG', 'shoes', '#e7dcc8', '#5b4632', 'mono'],
    W1: ['柔语', 'SOFTWHISPER', 'fashion', '#f9e8ee', '#8e4162', 'moon'],
    W2: ['小确幸饰品', 'TINY JOY', 'accessory', '#fff1f2', '#be123c', 'heart'],
    W3: ['冲浪者', 'SURFSIDE', 'sports', '#0284c7', '#fefce8', 'wave'],
    E1: ['栖居家居', 'NESTLY', 'home', '#f4efe6', '#5c6b4e', 'leaf'],
    E2: ['光速手机', 'LIGHTSPEED', 'tech', '#111827', '#60a5fa', 'bolt'],
    E3: ['盲盒工坊', 'MYSTERY BOX', 'toys', '#ffe8f3', '#d6336c', 'star'],
    'INW-a': ['潮玩星球', 'TOY PLANET', 'toys', '#2b1055', '#ffd166', 'star'],
    'INW-b': ['极简', 'MINIMO', 'fashion', '#ffffff', '#111111', 'mono'],
    'ISW-a': ['帽子先生', 'MR. CAP', 'accessory', '#f1e3c8', '#7a4b2a', 'mono'],
    'ISW-b': ['袜子研究所', 'SOCK LAB', 'accessory', '#e0f2fe', '#0369a1', 'mono'],
    'INE-a': ['雨林', 'RAINFOREST', 'fashion', '#14532d', '#dcfce7', 'leaf'],
    'INE-b': ['镜界', 'MIRRORWORLD', 'accessory', '#f8fafc', '#334155', 'ring'],
    'ISE-a': ['活力果饮', 'VITAJUICE', 'tea', '#fff7ed', '#ea580c', 'sun'],
    'ISE-b': ['球鞋仓', 'SNEAKER VAULT', 'shoes', '#18181b', '#f4f4f5', 'mono'],
  },
  '3F': {
    cinema: ['云澜影城', 'YUNLAN CINEMA', 'cinema', '#1a0b12', '#f5c518', 'film'],
    kids: ['奇趣星球儿童乐园', 'FUNPLANET KIDS', 'kids', '#ffd23f', '#3b1f5c', 'star'],
    books: ['纸间书局', 'PAGES & CO', 'books', '#f3efe6', '#29445f', 'book'],
    arcade: ['极光电玩城', 'AURORA ARCADE', 'arcade', '#12062b', '#39f3ff', 'game'],
    W2: ['童趣服饰', 'LITTLE ONES', 'kids', '#e0f7fa', '#00838f', 'heart'],
    W3: ['积木乐园', 'BRICK LAND', 'kids', '#e63946', '#ffffff', 'mono'],
    N1: ['早教中心', 'BRIGHT START', 'kids', '#fff4d6', '#e07a10', 'sun'],
    N2: ['蜀香火锅', 'SHUXIANG HOTPOT', 'restaurant', '#7f1d1d', '#fde68a', 'flame'],
    N3: ['一碗面', 'ONE BOWL NOODLES', 'restaurant', '#f6efe3', '#9a3412', 'bowl'],
    N4: ['樱屋日料', 'SAKURAYA', 'restaurant', '#fdf2f4', '#9d174d', 'flower'],
    N5: ['炭烤韩味', 'SEOUL GRILL', 'restaurant', '#111111', '#f97316', 'flame'],
    S2: ['意食', 'TRATTORIA MIO', 'restaurant', '#14532d', '#fef3c7', 'leaf'],
    S3: ['粤点茶楼', 'CANTON DIM SUM', 'restaurant', '#7c2d12', '#fde68a', 'bowl'],
    S4: ['炉火牛排', 'HEARTH STEAK', 'restaurant', '#1c1917', '#e7c38a', 'flame'],
    S5: ['泰兰', 'THAI ORCHID', 'restaurant', '#4c1d95', '#f5d0fe', 'flower'],
    S6: ['绿野轻食', 'GREEN BOWL', 'restaurant', '#ecfccb', '#3f6212', 'leaf'],
    E2: ['茶语', 'TEA TALK', 'tea', '#e7f5ee', '#166534', 'cup'],
    'INW-a': ['披萨工坊', 'PIZZA LAB', 'restaurant', '#fff7ed', '#c2410c', 'sun'],
    'INW-b': ['烧鸟居酒屋', 'TORI IZAKAYA', 'restaurant', '#1f2937', '#fca5a5', 'flame'],
    'ISW-a': ['湘味小厨', 'HUNAN KITCHEN', 'restaurant', '#991b1b', '#fff1f2', 'flame'],
    'ISW-b': ['鲜虾云吞', 'WONTON HOUSE', 'restaurant', '#fef9c3', '#a16207', 'bowl'],
    'INE-a': ['甜心烘焙', 'SWEETHEART BAKERY', 'cafe', '#fdf2f8', '#be185d', 'heart'],
    'INE-b': ['冰淇淋工厂', 'SCOOP FACTORY', 'cafe', '#e0f2fe', '#0c4a6e', 'star'],
    'ISE-a': ['绘本馆', 'STORYTIME', 'kids', '#fef3c7', '#b45309', 'book'],
    'ISE-b': ['拼图王国', 'PUZZLE KINGDOM', 'toys', '#ede9fe', '#5b21b6', 'mono'],
  },
  B1M: {
    N1: ['老街面馆', 'LAOJIE NOODLES', 'food', '#8b2e16', '#fde9c8', 'bowl'],
    N3: ['麻辣香锅', 'MALA WOK', 'food', '#b91c1c', '#fff7ed', 'flame'],
    N4: ['烧腊饭', 'ROAST HOUSE', 'food', '#7c2d12', '#fef3c7', 'flame'],
    N5: ['生煎包', 'SHENG JIAN', 'food', '#f5f0e6', '#7c4a1e', 'bowl'],
    N6: ['酸菜鱼', 'PICKLED FISH CO.', 'restaurant', '#14532d', '#ecfccb', 'wave'],
    N7: ['粥底火锅', 'CONGEE POT', 'restaurant', '#fff1e6', '#9a3412', 'bowl'],
    S1: ['寿喜烧', 'SUKIYAKI HOUSE', 'food', '#3f2a1e', '#f8e1c0', 'flame'],
    S2: ['越南粉', 'PHO SAIGON', 'food', '#f0fdf4', '#15803d', 'bowl'],
    S3: ['咖喱屋', 'CURRY HUT', 'food', '#fde047', '#713f12', 'sun'],
    S4a: ['冰室', 'ICE HALL', 'cafe', '#e0f2fe', '#075985', 'star'],
    S4b: ['糖水铺', 'SWEET SOUP', 'snack', '#fdf2f8', '#9d174d', 'heart'],
    S5: ['卤味坊', 'BRAISE WORKS', 'food', '#451a03', '#fed7aa', 'mono'],
    S6: ['汉堡站', 'BURGER STOP', 'food', '#facc15', '#b91c1c', 'sun'],
    NW: ['云澜酒楼', 'YUNLAN TAVERN', 'restaurant', '#5c1a1a', '#f5d38a', 'crown'],
    W1: ['王记糖画', "WANG'S SUGAR ART", 'snack', '#a52a2a', '#ffe9b0', 'mono'],
    W2: ['李家烧饼', "LI'S FLATBREAD", 'snack', '#8b4513', '#fff1d6', 'mono'],
    W3: ['豆花铺', 'TOFU PUDDING', 'snack', '#f5f5dc', '#6b4423', 'bowl'],
    SW: ['老茶馆', 'OLD TEAHOUSE', 'tea', '#3b2f2f', '#e9d8a6', 'cup'],
    'INW-a': ['臭豆腐', 'STINKY TOFU STAND', 'snack', '#2d2a26', '#f2c14e', 'mono'],
    'INW-b': ['糯米糍', 'MOCHI LANE', 'snack', '#fdf6ec', '#b5651d', 'heart'],
    'ISW-a': ['煎饼果子', 'JIANBING', 'snack', '#c2410c', '#fff7ed', 'sun'],
    'ISW-b': ['酸梅汤', 'PLUM DRINK', 'tea', '#4a1d2f', '#fbcfe8', 'cup'],
    NE: ['海鲜大排档', 'SEAFOOD DOCK', 'restaurant', '#0c4a6e', '#e0f2fe', 'wave'],
    SE: ['东北饺子馆', 'NORTHERN DUMPLINGS', 'restaurant', '#fef3c7', '#92400e', 'bowl'],
    market: ['鲜集超市', 'FRESH COLLECTIVE', 'supermarket', '#15803d', '#ffffff', 'cart'],
  },
  RF: {
    R1: ['云端精酿', 'SKY BREW', 'bar', '#1e3a5f', '#fcd34d', 'cup'],
    R2: ['落日小酒馆', 'SUNSET BAR', 'bar', '#7c2d12', '#fed7aa', 'sun'],
    R3: ['星空西餐', 'STARLIGHT BISTRO', 'restaurant', '#0f172a', '#e0e7ff', 'star'],
    R4: ['炭火烤肉', 'EMBER GRILL', 'restaurant', '#1c1917', '#fb923c', 'flame'],
  },
};

export function brandFor(levelId, slot) {
  const t = BRANDS[levelId] && BRANDS[levelId][slot];
  if (!t) throw new Error(`品牌表缺少 ${levelId} ${slot}`);
  const [name, en, cat, bg, fg, logo] = t;
  return { name, en, cat, bg, fg, logo };
}

// ---------------------------------------------------------------------------
// v2：品牌选取器。一期沿用上面的 v1 品牌表；不够时与二、三期一样从业态词库取用，
// 词库用完再用"中文词头 + 词尾 / 英文词头 + 词尾"组合生成。全园区中英文名都去重。
// 词库条目：[中文名, 英文名, 招牌底色, 招牌字色, 字标图形]

export const POOLS = {
  fashion: [
    ['栖木', 'TIMBERNEST', '#2f3e2c', '#e8e2cf', 'leaf'], ['半山', 'MIDHILL', '#f1ece2', '#3a4a5c', 'peak'],
    ['原棉', 'RAW COTTON', '#efe9df', '#6b5844', 'mono'], ['织雾', 'MISTWEAVE', '#dfe6ea', '#2f4858', 'wave'],
    ['南屿', 'SOUTH ISLE', '#0f4c5c', '#f6efe3', 'sun'], ['朴序', 'PUSU', '#1e1e1e', '#f0eada', 'mono'],
    ['暖白', 'WARM WHITE', '#ffffff', '#8a6a4a', 'mono'], ['青禾', 'GREEN GRAIN', '#e8f0e0', '#3d6b35', 'leaf'],
    ['鹿野', 'DEERFIELD', '#7a5a3a', '#fff4e2', 'peak'], ['织梦者', 'DREAMWEAVER', '#3b2f5c', '#f3e9ff', 'moon'],
    ['城市漫游', 'URBAN DRIFT', '#111827', '#e5e7eb', 'ring'], ['风之谷', 'WIND VALLEY', '#d9e4dd', '#2f5f4a', 'wave'],
  ],
  sports: [
    ['跃野', 'WILDLEAP', '#ff5a1f', '#ffffff', 'bolt'], ['极地', 'POLARIS', '#0b3b8c', '#e0f2fe', 'peak'],
    ['速影', 'SWIFTSHADOW', '#111111', '#d4ff3a', 'bolt'], ['山野营地', 'CAMPWILD', '#3d4a2a', '#f2e8c9', 'peak'],
    ['浪人冲浪', 'RONIN SURF', '#0284c7', '#fefce8', 'wave'], ['攀岩社', 'CRAG CLUB', '#5b4636', '#f5e9d6', 'peak'],
    ['骑行家', 'CYCLIST', '#14532d', '#d9f99d', 'ring'], ['羽动', 'FEATHERPLAY', '#f8fafc', '#1d4ed8', 'star'],
    ['瑜伽森林', 'YOGA GROVE', '#e9f5ec', '#2f6b4f', 'leaf'], ['跑山', 'TRAIL RUN', '#7c2d12', '#ffedd5', 'peak'],
    ['滑板公园', 'SKATEYARD', '#1f2937', '#fbbf24', 'bolt'], ['游泳家', 'SWIMMER', '#0e7490', '#ecfeff', 'wave'],
    ['网球俱乐部', 'COURTSIDE', '#166534', '#fef9c3', 'ring'], ['健身工坊', 'FIT FORGE', '#18181b', '#f97316', 'bolt'],
  ],
  shoes: [
    ['步云', 'CLOUDSTEP', '#e0f2fe', '#0c4a6e', 'wave'], ['履迹', 'TRACEWALK', '#3f3f46', '#fafafa', 'mono'],
    ['皮匠', 'TANNERY', '#5a3b22', '#f1dcc0', 'mono'], ['行者', 'WAYFARER', '#1f2937', '#fcd34d', 'peak'],
    ['箱旅', 'TRUNK TRIP', '#e7dcc8', '#5b4632', 'mono'], ['小白鞋', 'WHITE KICKS', '#ffffff', '#111827', 'mono'],
  ],
  beauty: [
    ['花间集', 'FLORILEGE', '#f6e7ec', '#a3355b', 'flower'], ['肌研', 'SKINLAB', '#ffffff', '#2f6f6a', 'drop'],
    ['香颂', 'CHANSON SCENT', '#2c1f2b', '#f2c6d6', 'drop'], ['月光美妆', 'MOONGLOW', '#1a1240', '#d8cffc', 'moon'],
    ['晨露', 'MORNING DEW', '#e8f5f2', '#2a6f6a', 'drop'], ['胭脂铺', 'ROUGE HOUSE', '#7a1426', '#ffe4e1', 'heart'],
    ['草本记', 'HERBAL NOTE', '#eef4e6', '#4d6b2f', 'leaf'], ['蔷薇研', 'ROSE STUDIO', '#fdf2f4', '#9d174d', 'flower'],
  ],
  jewelry: [
    ['金缕', 'GOLDTHREAD', '#6b4e1f', '#fff3d6', 'diamond'], ['玉见', 'JADE MEET', '#12312b', '#e6c98a', 'ring'],
    ['星河珠宝', 'STARRIVER', '#0f172a', '#e0e7ff', 'star'], ['晶曜', 'CRYSTALUX', '#ffffff', '#1f4e79', 'diamond'],
    ['时光机械', 'TIME MECHA', '#1b1b1f', '#d9c08c', 'ring'],
  ],
  luxury: [
    ['雅颂', 'ODE MAISON', '#1f2a2e', '#e8d9b5', 'crown'], ['墨白', 'INK & IVORY', '#111111', '#f5f0e6', 'mono'],
    ['绛紫', 'VIOLA ROYAL', '#3b1f4a', '#f3e7ff', 'crown'], ['霁青', 'CELADON', '#d6e5df', '#2f4f4f', 'mono'],
  ],
  tech: [
    ['极客空间', 'GEEKSPACE', '#0f172a', '#7dd3fc', 'bolt'], ['声波', 'SOUNDWAVE', '#111827', '#a7f3d0', 'wave'],
    ['智家', 'SMARTNEST', '#f4f7fb', '#1d4ed8', 'bolt'], ['像素工坊', 'PIXEL WORKS', '#1e1b4b', '#fde047', 'star'],
    ['无人机馆', 'DRONE HALL', '#0b0f14', '#f5b301', 'bolt'], ['机器人乐园', 'ROBOT PARK', '#e0f2fe', '#0369a1', 'game'],
    ['VR 星际', 'VR GALAXY', '#12062b', '#39f3ff', 'star'], ['影像馆', 'LENS HOUSE', '#1f2937', '#f9fafb', 'ring'],
  ],
  accessory: [
    ['镜中', 'MIRRORLAND', '#f8fafc', '#334155', 'ring'], ['小物志', 'TRINKET LOG', '#fff1f2', '#be123c', 'heart'],
    ['帽舍', 'HAT HOUSE', '#f1e3c8', '#7a4b2a', 'mono'], ['表情包袋', 'MOOD BAGS', '#fef3c7', '#b45309', 'star'],
  ],
  cafe: [
    ['豆语', 'BEAN TALK', '#3b2a20', '#f6e3c8', 'cup'], ['烘焙坊', 'OVEN STORY', '#fdf2f8', '#be185d', 'heart'],
    ['手冲实验室', 'POUR LAB', '#1c1917', '#e7c38a', 'cup'], ['奶油星球', 'CREAM PLANET', '#fef3c7', '#92400e', 'star'],
    ['松饼屋', 'WAFFLE NOOK', '#f5e1c8', '#7c4a1e', 'sun'], ['可颂', 'CROISSANT CO.', '#fffbeb', '#b45309', 'moon'],
    ['抹茶研究所', 'MATCHA INSTITUTE', '#e7f5ee', '#166534', 'leaf'],
  ],
  tea: [
    ['一叶', 'ONE LEAF', '#e8f3ec', '#2f6b4f', 'leaf'], ['茶山', 'TEA HILL', '#3b2f2f', '#e9d8a6', 'peak'],
    ['果茶局', 'FRUIT TEA BUREAU', '#fff7ed', '#ea580c', 'sun'], ['柠檬工厂', 'LEMON FACTORY', '#fef9c3', '#a16207', 'sun'],
    ['乌龙巷', 'OOLONG LANE', '#4a3426', '#f5e6c8', 'cup'],
  ],
  restaurant: [
    ['川西坝子', 'CHUANXI YARD', '#7f1d1d', '#fde68a', 'flame'], ['海南鸡饭', 'HAINAN RICE', '#fef9c3', '#a16207', 'bowl'],
    ['西北面馆', 'NORTHWEST NOODLE', '#f6efe3', '#9a3412', 'bowl'], ['潮汕牛肉', 'CHAOSHAN BEEF', '#1c1917', '#fca5a5', 'flame'],
    ['江南小厨', 'JIANGNAN KITCHEN', '#ecfccb', '#3f6212', 'leaf'], ['墨西哥卷', 'TACO VERDE', '#14532d', '#fef3c7', 'sun'],
    ['法式小馆', 'PETIT BISTRO', '#1e3a8a', '#fde68a', 'crown'], ['云南菌锅', 'YUNNAN MUSHROOM', '#5b3a1e', '#fde9c8', 'leaf'],
    ['烤鸭坊', 'ROAST DUCK HOUSE', '#991b1b', '#fff1f2', 'flame'], ['寿司之家', 'SUSHI HOME', '#fdf2f4', '#9d174d', 'wave'],
    ['东南亚风味', 'SPICE ROUTE', '#4c1d95', '#f5d0fe', 'flower'], ['素食花园', 'VEGGIE GARDEN', '#ecfccb', '#3f6212', 'leaf'],
    ['砂锅粥', 'CLAYPOT CONGEE', '#fff1e6', '#9a3412', 'bowl'], ['烧烤大排档', 'GRILL STREET', '#111111', '#f97316', 'flame'],
  ],
  food: [
    ['肉夹馍', 'ROUJIAMO', '#8b4513', '#fff1d6', 'bowl'], ['螺蛳粉', 'SNAIL NOODLE', '#b91c1c', '#fff7ed', 'bowl'],
    ['小笼包', 'XIAOLONGBAO', '#f5f0e6', '#7c4a1e', 'bowl'], ['炸鸡站', 'CRISPY STATION', '#facc15', '#b91c1c', 'flame'],
    ['盖浇饭', 'RICE BOWL CO.', '#fef3c7', '#92400e', 'bowl'], ['米线铺', 'RICE NOODLE BAR', '#ecfccb', '#3f6212', 'bowl'],
    ['麻辣烫', 'MALATANG', '#7f1d1d', '#fde68a', 'flame'], ['饺子铺', 'DUMPLING BAR', '#fef9c3', '#a16207', 'bowl'],
  ],
  snack: [
    ['冰糖葫芦', 'CANDIED HAWS', '#a52a2a', '#ffe9b0', 'heart'], ['桂花糕', 'OSMANTHUS CAKE', '#f5f0dc', '#8a5a1e', 'flower'],
    ['油茶铺', 'OIL TEA SHOP', '#5a3b22', '#f1dcc0', 'cup'], ['炸串摊', 'SKEWER STAND', '#2d2a26', '#f2c14e', 'flame'],
    ['鸡蛋仔', 'EGG WAFFLE', '#fde68a', '#92400e', 'sun'], ['凉皮店', 'LIANGPI HOUSE', '#f5f5dc', '#6b4423', 'bowl'],
  ],
  kids: [
    ['小橡果', 'LITTLE ACORN', '#fef3c7', '#b45309', 'leaf'], ['彩虹岛', 'RAINBOW ISLE', '#e0f2fe', '#0369a1', 'star'],
    ['萌宝成长', 'TINY GROW', '#fde7ef', '#c2416c', 'heart'], ['童话森林', 'FAIRY FOREST', '#ecfccb', '#3f6212', 'leaf'],
    ['小小建筑师', 'LITTLE ARCHITECT', '#fff7ed', '#c2410c', 'mono'], ['宝贝衣橱', 'BABY CLOSET', '#f0f9ff', '#0c4a6e', 'heart'],
  ],
  toys: [
    ['盲盒星球', 'BLINDBOX PLANET', '#2b1055', '#ffd166', 'star'], ['手办屋', 'FIGURE HOUSE', '#111827', '#f472b6', 'star'],
    ['拼装工坊', 'BUILD WORKS', '#e63946', '#ffffff', 'mono'], ['模型研究所', 'MODEL INSTITUTE', '#1f2937', '#93c5fd', 'game'],
    ['桌游馆', 'BOARDGAME HALL', '#14532d', '#fde68a', 'game'],
  ],
  books: [
    ['页间', 'BETWEEN PAGES', '#f3efe6', '#29445f', 'book'], ['旧书仓', 'OLD BOOK VAULT', '#3b2f2f', '#e9d8a6', 'book'],
    ['绘本岛', 'PICTURE BOOK ISLE', '#fef3c7', '#b45309', 'book'], ['文具控', 'STATIONERY FAN', '#eef2ff', '#3730a3', 'mono'],
  ],
  home: [
    ['木作', 'WOODCRAFT', '#efe7da', '#5c4a32', 'leaf'], ['陶舍', 'CLAY HOUSE', '#e9e1d3', '#7c4a2e', 'mono'],
    ['织物所', 'TEXTILE ROOM', '#f4efe6', '#5c6b4e', 'wave'], ['香薰岛', 'AROMA ISLE', '#efe6f5', '#4b2a6b', 'drop'],
    ['花事', 'FLOWER MATTERS', '#f4f7ee', '#5c7a3a', 'flower'],
  ],
  bar: [
    ['月下精酿', 'MOONLIT BREW', '#1e3a5f', '#fcd34d', 'moon'], ['夜航', 'NIGHT FLIGHT', '#0f172a', '#93c5fd', 'star'],
    ['橡木桶', 'OAK BARREL', '#3b2416', '#f5d38a', 'cup'], ['清酒屋', 'SAKE ROOM', '#fdf2f4', '#9d174d', 'cup'],
    ['屋顶威士忌', 'ROOFTOP WHISKY', '#451a03', '#fed7aa', 'cup'],
  ],
  edu: [
    ['小画家', 'LITTLE PAINTER', '#fff7ed', '#c2410c', 'star'], ['编程星球', 'CODE PLANET', '#0f172a', '#7dd3fc', 'bolt'],
    ['音乐盒', 'MUSIC BOX', '#fdf2f8', '#9d174d', 'star'], ['舞蹈坊', 'DANCE STUDIO', '#4c1d95', '#f5d0fe', 'heart'],
    ['科学探索', 'SCIENCE QUEST', '#ecfeff', '#0e7490', 'bolt'], ['围棋社', 'GO CLUB', '#1c1917', '#f5f5f4', 'ring'],
    ['英语角', 'ENGLISH CORNER', '#eff6ff', '#1d4ed8', 'book'],
  ],
  studio: [
    ['陶艺工作室', 'POTTERY STUDIO', '#e9e1d3', '#7c4a2e', 'mono'], ['银饰手作', 'SILVER CRAFT', '#f1f5f9', '#334155', 'ring'],
    ['摄影棚', 'PHOTO BOX', '#111827', '#f9fafb', 'ring'], ['插画馆', 'ILLUSTRATION HALL', '#fef3c7', '#b45309', 'star'],
    ['木工坊', 'JOINERY', '#efe7da', '#5c4a32', 'leaf'], ['调香室', 'SCENT ATELIER', '#efe6f5', '#4b2a6b', 'drop'],
  ],
  auto: [['星驰新能源', 'STARDRIVE EV', '#0f172a', '#7dd3fc', 'bolt'], ['澜途汽车', 'LANTU MOTORS', '#f8fafc', '#1e3a8a', 'wave']],
  arcade: [['霓虹电玩', 'NEON ARCADE', '#12062b', '#ff3df2', 'game'], ['VR 竞技场', 'VR ARENA', '#0b1020', '#39f3ff', 'game']],
  cinema: [['星湾 IMAX 影城', 'XINGWAN IMAX', '#0b0b12', '#f5c518', 'film']],
  supermarket: [['邻里生鲜', 'NEIGHBOR FRESH', '#15803d', '#ffffff', 'cart']],
  rink: [['星湾真冰场', 'XINGWAN ICE ARENA', '#e0f2fe', '#0c4a6e', 'star']],
};


// 二期、三期补充词库（国潮、运动、教育、餐饮、街区小店）
const MORE = {
  fashion: [
    ['东方织造', 'ORIENT LOOM', '#7a1f1a', '#f3dcc0', 'mono'], ['青绣', 'JADE STITCH', '#1f4d45', '#e9f2ec', 'flower'],
    ['墨韵', 'INKWELL', '#141414', '#e8dcc4', 'wave'], ['朱雀', 'VERMILION', '#b2281e', '#ffe9c7', 'flame'],
    ['云纹', 'CLOUD PATTERN', '#2a3f6b', '#e6ecf7', 'wave'], ['汉服坊', 'HANFU ATELIER', '#6b2d5c', '#f7e1ef', 'flower'],
    ['山海志', 'MOUNTAIN & SEA', '#23412f', '#e3efd9', 'peak'], ['锦鲤', 'KOI DRIFT', '#e45c2b', '#fff3e6', 'wave'],
    ['布衣局', 'COTTON BUREAU', '#efe7d8', '#5a4632', 'mono'], ['长安', 'CHANG AN', '#8f3b2a', '#f6e3c8', 'crown'],
  ],
  sports: [
    ['逐风', 'WINDCHASER', '#0f3d5c', '#e0f2fe', 'bolt'], ['雪线', 'SNOWLINE', '#e8f1f7', '#1e3a5f', 'peak'],
    ['跃冰', 'ICE LEAP', '#dff3ff', '#0b4f7a', 'star'], ['登山家', 'SUMMITEER', '#3a4a2a', '#f1e8c8', 'peak'],
    ['跑酷工场', 'PARKOUR WORKS', '#1b1b1b', '#ffcc33', 'bolt'], ['足球公园', 'PITCH PARK', '#14532d', '#ecfccb', 'ring'],
    ['篮下', 'UNDER THE RIM', '#c2410c', '#fff7ed', 'ring'], ['水上运动', 'AQUA SPORTS', '#0369a1', '#e0f2fe', 'wave'],
  ],
  shoes: [['足迹', 'FOOTPRINT', '#2b2b2b', '#f5f5f5', 'mono'], ['跑鞋实验', 'RUN SHOE LAB', '#f97316', '#111111', 'bolt'], ['旅行箱', 'ROAD CASE', '#1f2a44', '#e2e8f0', 'mono']],
  accessory: [['手表铺', 'WATCH NOOK', '#1b1b1f', '#d9c08c', 'ring'], ['发饰屋', 'HAIR PIN HOUSE', '#fde7ef', '#be185d', 'flower'], ['伞具', 'UMBRELLA CO.', '#334155', '#f1f5f9', 'drop']],
  edu: [
    ['机器人学院', 'ROBO ACADEMY', '#0f172a', '#93c5fd', 'game'], ['小小科学家', 'TINY SCIENTIST', '#ecfeff', '#0e7490', 'bolt'],
    ['书法馆', 'CALLIGRAPHY HALL', '#f5f0e6', '#3b2f2f', 'mono'], ['美术课堂', 'ART CLASS', '#fff7ed', '#c2410c', 'star'],
    ['钢琴屋', 'PIANO HOUSE', '#111111', '#f5f5f5', 'mono'], ['STEAM 工坊', 'STEAM WORKSHOP', '#1e3a8a', '#dbeafe', 'bolt'],
  ],
  kids: [['亲子厨房', 'FAMILY KITCHEN', '#fef3c7', '#b45309', 'heart'], ['童装铺', 'MINI WARDROBE', '#e0f2fe', '#0369a1', 'heart'], ['宝宝游泳', 'BABY SWIM', '#e0f7fa', '#00838f', 'wave']],
  toys: [['遥控模型', 'RC GARAGE', '#1f2937', '#fbbf24', 'bolt'], ['毛绒乐园', 'PLUSH PARK', '#fdf2f8', '#9d174d', 'heart'], ['积木星', 'BRICK STAR', '#e63946', '#ffffff', 'star']],
  tech: [['智能穿戴', 'WEARABLE LAB', '#0b0f14', '#a7f3d0', 'bolt'], ['游戏主机', 'CONSOLE ZONE', '#12062b', '#39f3ff', 'game'], ['相机馆', 'CAMERA HALL', '#1f2937', '#f9fafb', 'ring']],
  books: [['漫画屋', 'MANGA HOUSE', '#111827', '#fde047', 'book'], ['童书馆', 'KIDS BOOKS', '#fef3c7', '#92400e', 'book']],
  restaurant: [
    ['湘江鱼', 'XIANGJIANG FISH', '#7f1d1d', '#fde68a', 'wave'], ['京味烤鸭', 'PEKING ROAST', '#991b1b', '#fff1f2', 'flame'],
    ['海鲜蒸汽', 'STEAM SEAFOOD', '#0c4a6e', '#e0f2fe', 'wave'], ['日式拉面', 'RAMEN DOJO', '#1c1917', '#fca5a5', 'bowl'],
    ['韩式烤肉', 'KOREAN BBQ', '#111111', '#f97316', 'flame'], ['泰式海鲜', 'SIAM SEAFOOD', '#4c1d95', '#f5d0fe', 'flower'],
    ['西班牙小馆', 'TAPAS TABLE', '#7c2d12', '#fed7aa', 'sun'], ['云顶景观餐厅', 'SKYLINE DINING', '#0f172a', '#e0e7ff', 'star'],
    ['新疆大盘鸡', 'XINJIANG PLATE', '#a16207', '#fef9c3', 'flame'], ['顺德私房', 'SHUNDE HOUSE', '#14532d', '#ecfccb', 'bowl'],
  ],
  cafe: [['星湾咖啡', 'XINGWAN COFFEE', '#3b2a20', '#f6e3c8', 'cup'], ['冰淇淋船', 'GELATO BOAT', '#e0f2fe', '#0c4a6e', 'star'], ['司康', 'SCONE & CO.', '#fef3c7', '#92400e', 'heart']],
  tea: [['雪顶茶', 'SNOWCAP TEA', '#f0f9ff', '#0c4a6e', 'cup'], ['桂花乌龙', 'OSMANTHUS OOLONG', '#4a3426', '#f5e6c8', 'flower']],
  bar: [['精酿车间', 'BREW WORKSHOP', '#1e293b', '#fcd34d', 'cup'], ['爵士酒廊', 'JAZZ LOUNGE', '#0f172a', '#f5d0fe', 'moon'], ['酒馆 99', 'TAVERN 99', '#451a03', '#fde68a', 'cup']],
  home: [['竹编', 'BAMBOO WEAVE', '#efe7da', '#5c4a32', 'leaf'], ['灯具社', 'LAMP CLUB', '#1f2937', '#fde047', 'sun'], ['香插', 'INCENSE NOOK', '#efe6f5', '#4b2a6b', 'drop']],
  studio: [['皮具工坊', 'LEATHER LAB', '#5a3b22', '#f1dcc0', 'mono'], ['花艺课', 'FLORAL CLASS', '#f4f7ee', '#5c7a3a', 'flower'], ['纸艺', 'PAPER CRAFT', '#fff7ed', '#c2410c', 'star']],
  convenience: [['途中便利', 'EN ROUTE MART', '#0f5132', '#f8f9fa', 'star']],
  bakery: [['麦香站', 'WHEAT STATION', '#fff4e0', '#9a4a12', 'sun']],
};
for (const [cat, list] of Object.entries(MORE)) POOLS[cat] = [...(POOLS[cat] || []), ...list];

const CN_HEAD = ['青', '岚', '屿', '栖', '禾', '暖', '拾', '朴', '素', '鹿', '麦', '橙', '柚', '溪', '汀', '木', '森', '星', '月', '晴', '雾', '初', '南', '北', '野', '棠', '槐', '桐', '松', '竹'];
const EN_HEAD = ['NORTH', 'MAPLE', 'CEDAR', 'HARBOR', 'LUMEN', 'OPAL', 'MOSS', 'AMBER', 'CORAL', 'IVORY', 'SAGE', 'DUNE', 'EMBER', 'FROST', 'GROVE', 'HAZEL', 'JADE', 'KITE', 'LINEN', 'MIST', 'NOVA', 'OAK', 'PINE', 'QUILL', 'REED', 'SOL', 'TIDE', 'VALE', 'WREN', 'BIRCH'];
const TAILS = {
  default: { cn: ['集', '社', '舍', '所', '坊'], en: ['HOUSE', 'GOODS', 'CO.', 'STUDIO', 'SUPPLY'], logo: ['mono', 'leaf', 'ring', 'star'] },
  fashion: { cn: ['衣社', '制衣', '服饰', '衣橱', '织造'], en: ['ATELIER', 'WEAR', 'LOOM', 'THREAD', 'CLOSET'], logo: ['mono', 'leaf', 'wave'] },
  sports: { cn: ['运动', '户外', '体能'], en: ['SPORT', 'OUTDOOR', 'ATHLETIC'], logo: ['bolt', 'peak'] },
  restaurant: { cn: ['小馆', '食堂', '厨房', '家宴'], en: ['KITCHEN', 'DINER', 'TABLE', 'EATERY'], logo: ['bowl', 'flame', 'leaf'] },
  food: { cn: ['食铺', '粉面', '饭堂'], en: ['NOODLE', 'RICE', 'BITES'], logo: ['bowl', 'flame'] },
  snack: { cn: ['小吃', '食铺', '糕点'], en: ['SNACKS', 'TREATS', 'STALL'], logo: ['heart', 'sun', 'bowl'] },
  cafe: { cn: ['咖啡', '甜品', '烘焙'], en: ['COFFEE', 'BAKERY', 'DESSERT'], logo: ['cup', 'heart'] },
  tea: { cn: ['茶事', '茶铺', '茶饮'], en: ['TEA', 'TEA HOUSE', 'BREW'], logo: ['cup', 'leaf'] },
  bar: { cn: ['酒馆', '精酿', '酒吧'], en: ['TAVERN', 'BREWERY', 'BAR'], logo: ['cup', 'moon'] },
  beauty: { cn: ['美妆', '香氛', '研造'], en: ['BEAUTY', 'SCENT', 'SKIN'], logo: ['drop', 'flower'] },
  kids: { cn: ['童趣', '童装', '乐园'], en: ['KIDS', 'JUNIOR', 'PLAYHOUSE'], logo: ['star', 'heart'] },
  toys: { cn: ['潮玩', '玩具'], en: ['TOYS', 'FIGURES'], logo: ['star', 'game'] },
  edu: { cn: ['学堂', '课堂', '学院'], en: ['ACADEMY', 'CLASS', 'SCHOOL'], logo: ['book', 'star'] },
  studio: { cn: ['工作室', '设计所', '手作'], en: ['STUDIO', 'WORKSHOP', 'CRAFT'], logo: ['mono', 'ring'] },
  tech: { cn: ['数码', '智能'], en: ['TECH', 'DIGITAL'], logo: ['bolt', 'star'] },
  home: { cn: ['生活馆', '家居'], en: ['HOME', 'LIVING'], logo: ['leaf', 'mono'] },
};
const PALETTE = [
  ['#1f2937', '#f9fafb'], ['#f8fafc', '#1e3a8a'], ['#7f1d1d', '#fde68a'], ['#14532d', '#ecfccb'], ['#fef3c7', '#92400e'],
  ['#0f4c5c', '#f6efe3'], ['#4c1d95', '#f5d0fe'], ['#fdf2f8', '#9d174d'], ['#e0f2fe', '#0c4a6e'], ['#3b2a20', '#f6e3c8'],
];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BrandPicker {
  constructor(seed = 11) {
    this.names = new Set();
    this.ens = new Set();
    this.next = {};
    this.rand = mulberry(seed);
  }

  ok(name, en) { return !this.names.has(name) && !this.ens.has(en); }

  mark(b) {
    this.names.add(b.name);
    this.ens.add(b.en);
    return b;
  }

  /** v1 品牌表条目（一期沿用）；已被占用时返回 null */
  v1(level, slot) {
    const t = BRANDS[level] && BRANDS[level][slot];
    if (!t) throw new Error(`品牌表缺少 ${level} ${slot}`);
    const [name, en, cat, bg, fg, logo] = t;
    return this.ok(name, en) ? this.mark({ name, en, cat, bg, fg, logo }) : null;
  }

  /** 按业态取一个未用的品牌：先词库，后组合生成 */
  take(cat) {
    const pool = POOLS[cat] || [];
    let i = this.next[cat] || 0;
    while (i < pool.length) {
      const [name, en, bg, fg, logo] = pool[i++];
      if (this.ok(name, en)) {
        this.next[cat] = i;
        return this.mark({ name, en, cat, bg, fg, logo });
      }
    }
    this.next[cat] = i;
    return this.generate(cat);
  }

  generate(cat) {
    const t = TAILS[cat] || TAILS.default;
    const pick = (arr) => arr[Math.floor(this.rand() * arr.length)];
    for (let k = 0; k < 500; k++) {
      const name = pick(CN_HEAD) + pick(t.cn);
      const en = `${pick(EN_HEAD)} ${pick(t.en)}`;
      if (!this.ok(name, en)) continue;
      const [bg, fg] = pick(PALETTE);
      return this.mark({ name, en, cat, bg, fg, logo: pick(t.logo) });
    }
    throw new Error(`品牌名组合用尽：${cat}`);
  }
}
