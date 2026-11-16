// 零点突围：撤离载具的耐久。坐在直升机 / 接应车上时，敌人的子弹擦过机身 / 车身（半径约 3 米）就掉耐久；
// 不还手、敌人越积越多就掉得越快。耐久打光 → 坠毁 / 翻车动画（冒烟起火、打转下坠或侧翻、爆炸）→ 撤离失败。
// 这里是纯规则（伤害判定、坠毁轨迹）和屏幕上的耐久条；挂到游戏上见 missions.js。
export const VEHICLE_HP = Object.freeze({
  radius: { helicopter: 3.2, car: 3.0 },  // 子弹离载具中心这么近算打中
  center: { helicopter: [0, 1.4, -0.3], car: [0, 1.2, 0] },
  damage: { helicopter: 1.4, car: 1.3 }, // 每发打中掉多少（满 100）：直升机实测不还手一圈挨约 80 发、还手约 37 发
  smoke: 50, fire: 25,                    // 低于这个开始冒烟 / 起火
  warn: [60, 30],
  engine: { helicopter: [0, 2.7, -1.7], car: [0, 1.35, 1.9] },
  crash: { helicopter: 4.4, car: 2.8 },   // 坠毁动画秒数（之后黑场、阵亡）
});

/** 一发子弹（起点 p、方向 d，都是 {x,y,z}）离载具中心 c 最近的距离；打在身后的不算 */
export function rayMiss(p, d, c, range = 150) {
  const vx = c.x - p.x, vy = c.y - p.y, vz = c.z - p.z, t = vx * d.x + vy * d.y + vz * d.z;
  if (t <= 0 || t > range) return Infinity;
  return Math.hypot(p.x + d.x * t - c.x, p.y + d.y * t - c.y, p.z + d.z * t - c.z);
}

/**
 * 坠毁轨迹：从被击毁那一刻的位姿 start 出发，t 秒后的位姿。ground 是落地高度。
 * 直升机：尾桨被打坏，机身越转越快、边转边往前下方掉，砸到楼顶 / 地面后停住；
 * 接应车：猛打方向、减速，侧翻滑出几米后停住。返回 { x, y, z, yaw, pitch, roll, landed }
 */
export function crashPose(kind, start, t, ground) {
  if (kind === 'helicopter') {
    const drop = Math.max(0, start.y - ground - 0.6), tl = Math.sqrt((2 * drop) / 7.5), tt = Math.min(t, tl), landed = t >= tl;
    const fwd = Math.min(tt, 2.5) * 5 - Math.max(0, Math.min(tt, 2.5) - 1) ** 2;
    // 落地以后停在落地那一刻的位置和朝向，机身歪着
    return { x: start.x + Math.sin(start.yaw) * fwd, y: start.y - 0.5 * 7.5 * tt * tt, z: start.z + Math.cos(start.yaw) * fwd,
      yaw: start.yaw + 1.6 * tt + 1.6 * tt * tt, pitch: landed ? 0.12 : 0.25 * Math.sin(t * 2.6), roll: landed ? 0.35 : (start.roll || 0) + 0.45 * Math.sin(t * 3.3), landed };
  }
  const k = Math.min(1, t / 1.6), e = k * k * (3 - 2 * k), slide = 7 * (1 - (1 - k) ** 2);
  return { x: start.x + Math.sin(start.yaw + 0.5 * e) * slide, y: start.y + 0.35 * Math.sin(e * Math.PI / 2), z: start.z + Math.cos(start.yaw + 0.5 * e) * slide,
    yaw: start.yaw + 0.9 * e, pitch: 0, roll: 1.35 * e, landed: k >= 1 };
}

/** 屏幕上方的耐久条：名字、百分比、条；被打中时闪一下，低于三成发红 */
export function makeDurabilityHud() {
  if (typeof document === 'undefined') return { show() {}, set() {}, hit() {}, remove() {} };
  const el = document.createElement('div');
  el.className = 'jm-vhp';
  el.innerHTML = '<b></b><i><em></em></i><span></span>';
  el.hidden = true;
  (document.getElementById('ui') || document.body).appendChild(el);
  const name = el.querySelector('b'), bar = el.querySelector('em'), pct = el.querySelector('span');
  let flash = 0;
  return {
    show(on, label) { if (el.hidden === on) el.hidden = !on; if (on && name.textContent !== label) name.textContent = label; },
    set(hp, dt = 0) {
      const v = Math.max(0, Math.round(hp));
      bar.style.width = `${v}%`; pct.textContent = `${v}%`;
      el.classList.toggle('low', hp < 30); el.classList.toggle('mid', hp >= 30 && hp < 60);
      flash = Math.max(0, flash - dt); el.classList.toggle('hit', flash > 0);
    },
    hit() { flash = 0.12; },
    remove() { el.remove(); },
  };
}

export const VEHICLE_HP_CSS = `
.jm-vhp { position: absolute; left: 50%; top: 58px; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 10px;
  padding: 6px 12px; border-radius: 10px; background: rgba(10, 14, 12, .55); color: #e8efe2; font: 600 13px/1 system-ui, sans-serif; letter-spacing: .04em; pointer-events: none; }
.jm-vhp i { position: relative; width: 180px; height: 9px; border-radius: 5px; background: rgba(255, 255, 255, .14); overflow: hidden; }
.jm-vhp em { position: absolute; inset: 0 auto 0 0; width: 100%; background: #7fe08f; transition: width .15s; }
.jm-vhp span { min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
.jm-vhp.mid em { background: #f0c24a; }
.jm-vhp.low em { background: #ff5a3a; }
.jm-vhp.low { color: #ffb4a0; }
.jm-vhp.hit { background: rgba(160, 30, 20, .6); }
@media (max-width: 700px) { .jm-vhp { top: 64px; } .jm-vhp i { width: 110px; } }
`;
