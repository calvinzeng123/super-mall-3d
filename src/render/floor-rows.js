// 楼层牌与目录的楼层行（纯字符串，Node 可测）：楼栋自上而下列出各层；立在一期裙房屋面上的北苑塔楼
// 在最下面加一行不可点的「1–6F 一期商场 · 住户电梯直达 7F」，说明 7F 下面是商场、住户电梯不停商场楼层。
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Podium the tower stands on (北苑 on 一期): { num, name, title } or null. */
export function podiumOf(layout, bid) {
  const b = layout.buildings.find((q) => q.id === bid);
  if (!b?.stackedOn) return null;
  const host = layout.buildings.find((q) => q.id === b.stackedOn);
  const own = layout.levels.filter((l) => l.building === bid).sort((x, y) => x.elev - y.elev);
  // Host storeys above ground and below the tower's first floor (一期 1F–6F under 北苑 7F).
  const under = layout.levels.filter((l) => l.building === b.stackedOn && l.elev >= 0 && own.length && l.elev < own[0].elev - .01 && /^\d+F$/.test(l.short))
    .sort((x, y) => x.elev - y.elev);
  if (!under.length || !own.length) return null;
  const first = own[0].short, span = `${parseInt(under[0].short, 10)}–${under.at(-1).short}`;
  const hostName = host?.short === '一期' ? '一期商场' : host?.short || b.stackedOn;
  return { num: span, name: `${hostName} · 住户电梯直达 ${first}`,
    title: `${hostName} ${span}：住户电梯从 1F 直达 ${first}（与商场天台同层），不停商场楼层` };
}

/** Floor rail HTML of a building: 全楼 button, its levels top-down, then the podium row of a stacked tower. */
export function floorRows(layout, bid) {
  const b = layout.buildings.find((q) => q.id === bid);
  if (!b) return '';
  const levels = layout.levels.filter((l) => l.building === bid).reverse();
  const podium = podiumOf(layout, bid);
  return `<button class="floor all" data-level="" aria-pressed="true"><span class="fl-num">${b.undergroundOnly ? '全部' : '全楼'}</span><span class="fl-name">${esc(b.short)}${b.undergroundOnly ? '总览' : '外观'}</span></button>`
    + levels.map((lv) => `<button class="floor" data-level="${lv.id}" aria-pressed="false" style="--fc:${lv.theme.accent}"><span class="fl-num">${lv.short}</span><span class="fl-name">${esc(lv.theme.label.split(' · ')[0])}</span></button>`).join('')
    + (podium ? `<div class="floor-podium" title="${esc(podium.title)}"><span class="fl-num">${esc(podium.num)}</span><span class="fl-name">${esc(podium.name)}</span></div>` : '');
}

/** Directory row for the podium of a stacked tower (a disabled button: the list's click handler skips it). */
export function podiumDirectoryRow(layout, bid) {
  const p = podiumOf(layout, bid);
  return p ? `<li><button class="shop podium" disabled title="${esc(p.title)}"><span class="shop-code">${esc(p.num)}</span><span class="shop-name"><b>${esc(p.name)}</b><span>住户电梯不停商场楼层 · 刷卡乘梯</span></span><span class="shop-cat"></span></button></li>` : '';
}
