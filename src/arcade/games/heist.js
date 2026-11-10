// 夜间潜入：闭店后的商场，躲开保安，拿门禁卡、取展品、赶末班地铁。
// 走路、电梯、楼梯都用漫游模式本身；这里只加保安、目标和警觉条。规则在 heist-rules.js。
import * as THREE from 'three';
import { spawn, clear, step, floorLabel } from '../../layout/nav.js';
import { NORMAL } from '../../layout/geom.js';
import { traceMotion } from '../../fps/pathfinding.js';
import { BatchSet } from '../../render/batch.js';
import { loadGuardKit } from '../guard-model.js';
import { HEIST, HEIST_LEVELS, patrolNodes, patrolEdges, patrolStarts, patrolLoop, newGuard, stepGuard, updateAlert, sightLine, openVoids, heistStars, heistScore } from './heist-rules.js';

const CSS = `
.hs-goal{position:absolute;left:calc(12px + env(safe-area-inset-left,0px));top:calc(10px + env(safe-area-inset-top,0px));max-width:min(380px,64vw);background:#0c1a25d9;border:1px solid #8da9ba55;border-radius:13px;padding:9px 13px}
.hs-goal b{display:block;color:#e8b876;font-size:12.5px;letter-spacing:.04em}.hs-goal span{display:block;font-size:15px;font-weight:600}.hs-goal em{display:block;font-style:normal;color:#a9bac6;font-size:12.5px}
.hs-alert{position:absolute;left:50%;top:calc(58px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;gap:10px;align-items:center;background:#0c1a25d9;border:1px solid #8da9ba55;border-radius:13px;padding:7px 14px;white-space:nowrap}
.hs-alert span{width:150px;height:10px;border-radius:6px;background:#22394a;overflow:hidden;display:inline-block}.hs-alert i{display:block;height:100%;width:0;background:#e8b876}
.hs-alert[data-seen="1"]{border-color:#ff8f7a}.hs-alert[data-seen="1"] i{background:#ff6b55}
.hs-arrow{position:absolute;left:50%;top:calc(104px + env(safe-area-inset-top,0px));transform:translateX(-50%);display:flex;align-items:center;gap:8px;text-shadow:0 1px 3px #000;font-variant-numeric:tabular-nums}
.hs-arrow i{width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:20px solid #e8b876;filter:drop-shadow(0 1px 2px #000)}
.hs-hold{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);width:150px;height:8px;border-radius:5px;background:#0c1a25cc;overflow:hidden}.hs-hold i{display:block;height:100%;width:0;background:#e8b876}
/* 闭店后的昏暗：整幅画面蒙一层半透明的深蓝，四周更暗，中间留一圈手电筒似的亮区。
   外壳是独立的层叠上下文，混合模式混不到画布上，所以只用透明度。 */
.hs-dark{position:absolute;inset:0;background:radial-gradient(ellipse 60% 56% at 50% 54%,#08133000 0%,#08133059 58%,#040a1cb8 100%),linear-gradient(#0b1c4233,#0b1c4233)}
body[data-arcade="playing"] #exFly,body[data-arcade="playing"] #exPlaces,body[data-arcade="playing"] #exCard{display:none!important}
`;

const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** 一名保安：贴图人物（没加载成功就用占位的圆柱）加上贴在地面上的视野扇形。 */
function guardModel(kit) {
  const g = new THREE.Group();
  let figure = null;
  if (kit) { figure = kit.create(); g.add(figure.group); }
  else {
    const navy = new THREE.MeshStandardMaterial({ color: 0x1d2a3d, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.32, 12), navy); body.position.y = 0.66;
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.26, 12), new THREE.MeshBasicMaterial({ color: 0xe8d44a })); vest.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd9b08c, roughness: 0.9 })); head.position.y = 1.52;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 12), navy); cap.position.y = 1.67;
    g.add(body, vest, head, cap);
  }
  // 视野：贴在地面上的一块扇形，朝保安正前方（局部 +Z）
  const fov = HEIST.fov * Math.PI / 180;
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.CircleGeometry(HEIST.range, 28, -Math.PI / 2 - fov / 2, fov), coneMat);
  cone.rotation.x = -Math.PI / 2; cone.position.y = 0.12; cone.renderOrder = 4;
  g.add(cone);
  return { group: g, coneMat, figure, px: null, pz: null };
}

/** 闭店的样子：这些楼层每家店的门面外拉下卷帘门（贴图模型，按门面宽度拉伸）。没有模型库就不摆。 */
function closeShops(app, layout, floors, world) {
  if (!app.ctx.props?.has('shutter')) return;
  for (const id of floors) {
    const lv = layout.levels.find((l) => l.id === id), L = app.ctx.levels[id];
    if (!lv || !L) continue;
    const B = new BatchSet(app.ctx.mats.base), group = new THREE.Group();
    group.name = `heist-shutters-${id}`;
    for (const u of lv.units || []) {
      if (u.residence || !u.fronts?.length) continue;
      B.frame(u.frame, () => {
        for (const f of u.fronts) {
          const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
          if (len < 1.2) continue;
          const [nx, nz] = NORMAL[f.side] || [0, 1];
          B.prop('shutter', (f.x0 + f.x1) / 2 + nx * .16, lv.elev, (f.z0 + f.z1) / 2 + nz * .16, Math.atan2(nx, nz), [(len - .3) / 1.08, 3.05 / 2.4, .6]);
        }
      });
    }
    B.flush(group);
    // 挂在楼层自己的分组下：这一层不显示时卷帘门也跟着不显示
    L.base.add(group);
    world.userData.attached.push(group);
  }
}

function goalMarker() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(HEIST.objectiveRadius * 0.78, HEIST.objectiveRadius, 36), mat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 1.6;
  g.add(ring, beam); g.renderOrder = 5;
  return g;
}

export async function createGame({ app, layout, level, hud, rng, toast, finish }) {
  const cfg = HEIST_LEVELS[level.id] || HEIST_LEVELS.gallery;
  const { scene, state } = app;
  const saved = { night: state.night, labels: state.labels };
  if (state.touring) app.stopTour?.();
  if (app.explore.active) app.exitExplore();
  if (state.building || state.focus) { app.setBuilding(null); app.cancelFlight(); }
  app.setNight(true);
  app.setLabels(false);
  app.ctx.peopleQuality?.setDensity(0); // 闭店了，没有顾客
  app.enterExplore(); // 默认出生点：一期东南主入口外的广场
  app.explore.setRules({ fly: false, teleport: false });
  const nav = app.explore.navigation;
  const start = { ...app.explore.state };

  // 目标：各层的出生点（最大走道里靠中心、站得住的位置）
  const objectives = cfg.objectives.map((o) => {
    const st = spawn(nav, layout, { level: o.level });
    if (!st) throw new Error(`找不到目标位置：${o.level}`);
    return { ...o, floor: st.floor, x: st.x, z: st.z, y: st.y };
  });

  // 视线：同层、没有墙、中间都是能站人的地面或中庭上空
  const sight = new Map();
  const los = (a, b) => {
    if (a.floor !== b.floor) return false;
    let f = sight.get(a.floor);
    if (!f) {
      const F = nav.floors.get(a.floor), floor = a.floor;
      f = { walls: F?.walls || [], voids: openVoids(layout.levels.find((l) => l.id === floor)), standable: (x, z) => clear(nav, { floor, x, z, slope: null }) };
      sight.set(floor, f);
    }
    return sightLine(a, b, f.walls, f.standable, f.voids);
  };

  // 保安：每层先连出「直线走得通、也看得见」的巡逻图，再给每人一条往返线
  const guards = [];
  for (const [floor, count] of cfg.guards) {
    const lv = layout.levels.find((l) => l.id === floor), F = nav.floors.get(floor);
    if (!lv || !F) continue;
    const nodes = patrolNodes(lv, (x, z) => clear(nav, { floor, x, z, slope: null }));
    const adj = patrolEdges(nodes, (a, b) => los({ floor, ...a }, { floor, ...b }) && !!traceMotion(nav, { floor, x: a.x, z: a.z }, { floor, x: b.x, z: b.z }, { stepSize: 0.6 }));
    for (const s of patrolStarts(nodes, adj, rng, count)) {
      const route = patrolLoop(nodes, adj, s, 4);
      if (route.length < 2) continue;
      // 这一层有目标时，保安从巡逻线上离目标最远的那个点出发，别一开场就站在目标上
      const goal = objectives.find((o) => o.floor === floor);
      let first = 0;
      if (goal) route.forEach((p, i) => { if (Math.hypot(p.x - goal.x, p.z - goal.z) > Math.hypot(route[first].x - goal.x, route[first].z - goal.z)) first = i; });
      guards.push(newGuard(`${floor}-G${guards.length + 1}`, floor, F.y, route, first));
    }
  }
  const walk = (g, dx, dz) => {
    const s = step(nav, { floor: g.floor, x: g.x, z: g.z, y: g.y, slope: null }, dx, dz, 0);
    return s.floor === g.floor && !s.slope ? s : g; // 保安不出本层
  };

  const world = new THREE.Group(); world.name = 'arcade-heist';
  world.userData.attached = [];
  let kit = null;
  try { kit = await loadGuardKit(); } catch (error) { console.warn('保安的贴图模型没有加载成功，用占位模型。', error); }
  const models = guards.map((g) => { const m = guardModel(kit); world.add(m.group); return m; });
  const marker = goalMarker(); world.add(marker);
  scene.add(world);
  closeShops(app, layout, [...new Set([...cfg.guards.map(([floor]) => floor), ...cfg.objectives.map((o) => o.level)])], world);

  // 目标处的道具：门禁卡放在边几上，展品是玻璃罩里的大理石胸像（贴图模型；没有模型库就只有光圈）
  const items = objectives.map(() => null);
  const props = app.ctx.props;
  const stage = async (o, i) => {
    const g = new THREE.Group(); g.position.set(o.x, o.y, o.z);
    if (o.id === 'card') {
      const table = await props.spawn('side_table'); if (!table) return;
      const card = new THREE.Mesh(new THREE.BoxGeometry(.09, .006, .057), new THREE.MeshBasicMaterial({ color: 0x7fe3d0 }));
      card.position.set(0, .458, 0); card.rotation.y = .5;
      const torch = await props.spawn('torch');
      if (torch) { torch.position.set(.12, .455, -.12); torch.rotation.y = 2.2; torch.scale.setScalar(.8); g.add(torch); }
      g.add(table, card); items[i] = card;
    } else if (o.id === 'exhibit') {
      const bust = await props.spawn('bust'); if (!bust) return;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.0, .5), new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: .6, emissive: 0x57503f }));
      plinth.position.y = .5;
      bust.position.y = 1.0; bust.scale.setScalar(1.15);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(.52, .78, .52), new THREE.MeshStandardMaterial({ color: 0xcfe6ee, transparent: true, opacity: .16, roughness: .05, depthWrite: false }));
      glass.position.y = 1.39;
      g.add(plinth, bust, glass); items[i] = bust;
    } else return;
    if (!ended) world.add(g);
  };
  if (props) objectives.forEach((o, i) => { stage(o, i).catch(() => {}); });

  const style = document.createElement('style'); style.textContent = CSS;
  const ui = document.createElement('div');
  ui.innerHTML = `<div class="hs-dark"></div><div class="hs-goal"><b></b><span></span><em></em></div>
    <div class="hs-alert" data-seen="0">警觉<span><i></i></span><em style="font-style:normal"></em></div>
    <div class="hs-arrow"><i></i><span></span></div><div class="hs-hold" hidden><i></i></div>`;
  hud.append(style, ui);
  const $ = (sel) => ui.querySelector(sel);
  const dom = { no: $('.hs-goal b'), title: $('.hs-goal span'), where: $('.hs-goal em'), alert: $('.hs-alert'), fill: $('.hs-alert i'), clock: $('.hs-alert em'),
    arrow: $('.hs-arrow i'), dist: $('.hs-arrow span'), hold: $('.hs-hold'), holdFill: $('.hs-hold i') };

  let index = 0, hold = 0, alert = 0, maxAlert = 0, t = 0, seenBy = 0, hudClock = 0, ended = false, warned = 0;
  let last = { x: start.x, z: start.z }, speed = 0;

  function end(escaped, title) {
    if (ended) return;
    ended = true;
    finish({
      success: escaped, stars: heistStars({ escaped, maxAlert, seconds: t }), score: heistScore({ escaped, maxAlert, seconds: t }), seconds: t,
      title, lines: [`完成目标 ${index} / ${objectives.length}`, `用时 ${mmss(t)}`, `最高警觉 ${Math.round(maxAlert * 100)}%`],
    });
  }

  function drawHud(p) {
    const o = objectives[Math.min(index, objectives.length - 1)];
    dom.no.textContent = `目标 ${Math.min(index + 1, objectives.length)} / ${objectives.length}`;
    dom.title.textContent = o.title;
    dom.where.textContent = `${o.where} · 你在${floorLabel(nav, layout, p)}`;
    dom.fill.style.width = `${Math.round(alert * 100)}%`;
    dom.alert.dataset.seen = seenBy ? '1' : '0';
    dom.clock.textContent = mmss(t);
    const same = p.floor === o.floor, dx = o.x - p.x, dz = o.z - p.z;
    const rel = wrapPi(Math.atan2(-dx, -dz) - p.yaw); // 漫游的朝向：面朝 (−sin yaw, −cos yaw)
    dom.arrow.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(0)}deg)`;
    const dy = o.y - p.y;
    dom.dist.textContent = same || Math.abs(dy) < 1 ? `${Math.round(Math.hypot(dx, dz))} m` : `${Math.round(Math.hypot(dx, dz))} m · ${dy > 0 ? '在楼上' : '在楼下'}`;
    dom.hold.hidden = hold <= 0; dom.holdFill.style.width = `${Math.min(100, hold / HEIST.hold * 100)}%`;
  }

  function update(dt) {
    if (ended) return;
    const p = app.explore.state;
    if (!p) { end(false, '中途退出了'); return; }
    t += dt;
    const moved = Math.hypot(p.x - last.x, p.z - last.z);
    speed += ((dt > 0 ? moved / dt : 0) - speed) * Math.min(1, dt * 8);
    last = { x: p.x, z: p.z };
    // 楼梯、扶梯、电梯里算躲着：保安只管自己那一层
    const player = { floor: p.floor, x: p.x, z: p.z, y: p.y, speed, hidden: !!p.slope || !!p.riding };
    for (const g of guards) stepGuard(g, dt, t, walk);
    const r = updateAlert(alert, guards, player, dt, t, los);
    alert = r.alert; seenBy = r.seenBy; maxAlert = Math.max(maxAlert, alert);
    if (r.heardBy && t - warned > 4) { warned = t; toast('跑步声引来了保安', 1.6); }
    if (alert >= 1) { drawHud(p); end(false, '被保安发现了'); return; }

    const o = objectives[index];
    if (!player.hidden && p.floor === o.floor && Math.hypot(p.x - o.x, p.z - o.z) <= HEIST.objectiveRadius) {
      hold += dt;
      if (hold >= HEIST.hold) {
        hold = 0; index++;
        if (items[index - 1]) items[index - 1].visible = false; // 卡、展品拿走了
        toast(o.done, 2.4);
        if (index >= objectives.length) { drawHud(p); end(true, '全身而退'); return; }
      }
    } else hold = Math.max(0, hold - dt * 2);

    // 画面：只画上下一两层以内的保安，别的楼层的不显示
    guards.forEach((g, i) => {
      const m = models[i];
      m.group.visible = Math.abs(g.y - p.y) < 9;
      if (m.figure) { m.figure.animate(m.px == null ? 0 : Math.hypot(g.x - m.px, g.z - m.pz), dt); m.px = g.x; m.pz = g.z; }
      m.group.position.set(g.x, g.y, g.z);
      m.group.rotation.y = g.yaw;
      m.coneMat.color.setHex(g.mode === 'look' ? 0xff6b55 : g.mode === 'investigate' ? 0xffa64d : 0xffd27a);
      m.coneMat.opacity = g.mode === 'look' ? 0.34 : 0.2;
    });
    const cur = objectives[index];
    marker.position.set(cur.x, cur.y, cur.z);
    marker.visible = Math.abs(cur.y - p.y) < 9;
    marker.rotation.y += dt * 0.8;
    if ((hudClock -= dt) <= 0) { hudClock = 0.1; drawHud(p); }
  }

  update(0);
  toast('闭店了。地上的黄色扇形是保安的视野，别站进去；跑步有声音。', 4.5);

  return {
    update,
    dispose() {
      scene.remove(world);
      // 共用的贴图小模型只摘掉、不销毁；卷帘门是实例化网格，dispose() 只放掉实例缓冲
      for (const group of world.userData.attached) { group.removeFromParent(); group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
      world.traverse((o) => { if (o.userData.sharedProp) return; o.geometry?.dispose(); for (const m of [].concat(o.material || [])) m.dispose(); });
      kit?.dispose();
      app.explore.setRules({});
      if (app.explore.active) app.exitExplore();
      app.setNight(saved.night); app.setLabels(saved.labels);
      app.ctx.peopleQuality?.setDensity(app.quality.crowdDensity);
    },
    /** 调试 / 自动化：传送到某一层的出生点。 */
    warp(levelId) {
      app.explore.setRules({ fly: false, teleport: true });
      app.explore.teleport({ level: levelId });
      app.explore.setRules({ fly: false, teleport: false });
      const p = app.explore.state; last = { x: p.x, z: p.z }; speed = 0;
    },
    /** 调试 / 自动化：站到本层某处并面朝某点。站不住返回 false。 */
    standAt(floor, x, z, tx, tz) {
      const F = nav.floors.get(floor);
      const st = F && { floor, x, z, y: F.y, slope: null, yaw: Math.atan2(-(tx - x), -(tz - z)) };
      if (!st || !clear(nav, st)) return false;
      app.exitExplore(); app.enterExplore({ state: st });
      app.explore.setRules({ fly: false, teleport: false });
      last = { x, z }; speed = 0;
      return true;
    },
    get debug() {
      const p = app.explore.state;
      return { player: p && { floor: p.floor, x: p.x, z: p.z }, index, alert, maxAlert, seenBy, seconds: t,
        objectives: objectives.map((o) => `${o.id}@${o.floor}`), guards: guards.map((g) => ({ id: g.id, floor: g.floor, x: g.x, z: g.z, yaw: g.yaw, mode: g.mode })) };
    },
  };
}
