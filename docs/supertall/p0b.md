# supertall P0b — render engine and UI

Package notes for the supertall extension (SPEC §2.2, §2.3, §3, §5.3 "P0b"). Branch `supertall/p0b`, based on
`e6948b9` (src = `ea99c34`). P0b changes no layout: `buildLayout({ expansion: false })` and the expansion layout are
untouched (fps-frozen green). Every new layout field (zones, lift speed / role / zone / card / fireOnly, stair
breakLevels, gate role / leaf, refugePlan) is read with a fallback and tested on synthetic records
(`tests/fixtures/supertall-records.js`), so P0b did not wait for P0a.

## What landed

| item | where | state |
|---|---|---|
| M0: R per-storey shells → one `InstancedMesh` per material per tower | `residential-shell.js` via `facade-modules.js` | R1 near 134 → 22 meshes |
| M1: far LOD (600 m, 5 % hysteresis) on all ten tall towers, today's builders | `far-lod.js`; `community.js` + `community-west/north.js`; `hospitality.js` | all ten, silhouettes ≤ 0.5 m (`far-lod.test.js`) |
| far night layer (1 mesh per tower, night only) | `far-lod.js` `farNight` | +10 calls at night, 0 by day |
| R / H / A 1F lobby and roof garden ride the near branch; R / H / A cars only for their own tower | `hospitality.js`, `app.js` | |
| façade kits | `facade-modules.js`, `curtain-wall.js`, `refuge-floor.js` | tested (`facade-modules`, `curtain-wall`, `core-render`) |
| community render split | `community-north.js`, `community-west.js` (exteriors + stand-ins), `community.js` (dispatcher, lobby, basement, `landingDoors`, `liftShaft`) | identical near output |
| stairs: second door + partition at `breakLevels`; multi-loop mid landings | `tower-stairs.js` (`stairBreak`); the doorless landings are layout surfaces, drawn by the existing surface pass | |
| lifts: closed-shaft cars instanced per tower, sized from `e.car` | `tower-elevators.js` | W1 21 → 10 meshes when in use |
| cores: `liftShaft()` / `residential-cores.js` read door widths and landing kinds (blank wall, `消防专用`) | `community.js`, `residential-cores.js` | |
| C-14: `buildElevators()` draws nothing for closed tower shafts; sills move to `landingDoors` | `elevators.js`, `community.js` | |
| gates: `role` / `leaf` rendering, door signs, pick cards | `access-gates.js` | |
| `app.js` hooks (a)–(e) | `app.js` | see below |
| explore keypad, zones, refuge key confirm, greyed fireOnly, HUD real time, Space skips | `explore.js`, `lift-keypad.js` (new, pure) | `lift-keypad.test.js` |
| zone rail, chips, search, `[` / `]`, directory groups, `towerSub` from data | `floor-rows.js`, `ui.js` | `ui-floor-rows.test.js` |
| fire-door finish on `fire: '乙级'` leaves | `residence-interiors.js` `FIRE_DOOR` | |
| render dispatch stubs and region markers | `r-supertall.js`, `hospitality-supertall.js` (render, stubs), `hospitality.js` `<supertall:R>` / `<supertall:HA>` | |
| roof-garden skip flag, hardstand-driven landscape clearing | `hospitality.js` (`b.roofGarden === false`; `site.fireAccess` polys) | |
| `measure.cjs` views | `perf/measure.cjs` (campus, N1, R1, campusTall, river, viewdeck, P2roof, west; `VIEWS=`, `NIGHT=`) | |
| overview shadow radius 380 → 410 | `app.js` `OVERVIEW_SHADOW` | |

## API for the tower packages

### Far stand-in and night layer — `src/render/build/far-lod.js`

```js
farSwap(b, top, near, far, { radius = 600, hysteresis = .05, extra = [], night = null, onNight = null })  // THREE.LOD
buildFarLod(ctx, b, group, materials, spec, { extra = [], draw = null })  // → { lod, far, night }
farStandIn(B, b, spec)   // day stand-in into B's facadePlaster / facadeWindow batches (building frame)
farNight(b, night, material)  // InstancedMesh of a unit quad, per-instance colours
storeyNightWindows(b, storeys, faces, opts) · pickLitWindows(b, candidates, opts) · crownEdgeLines(rect, y) · cornerAviation(rect, y)
mergeBands(bands)        // consecutive storeys' bands of one kind / span become one strip
```

A tower package declares its stand-in as a spec (building frame):

```js
spec = {
  top,                                     // main roof (m): the swap distance is measured to the mass centre
  y0: 0,                                   // base of the mass (北苑: the 7F sky lobby at 34 m)
  footprint,                               // default b.footprint
  mass: [{ rect, y0, y1, color }],         // optional: several boxes (R's wings, H/A's set-back tower on its podium)
  faces: [{ edge: 'N'|'S'|'W'|'E', rect?, t0?, t1?, off?, bands: [{ y0, y1, kind, color?, t0?, t1? }] }],
      // kind 'glass' → facadeWindow; 'spandrel' | 'louvre' | 'stone' | 'balcony' | 'band' → facadePlaster
      // refuge bands: kind 'louvre' over the refuge storey; a curtain wall: one merged 'glass' band + 'spandrel' per storey
  crown: [{ rect, y0, y1, color }],        // crown fins / lantern / machine rooms / helideck as boxes
  roof: { y, color },
  extras: [(B) => {}],
  night: { windows: [{ edge, t0, t1, y0, y1, rect? }], crownEdges: [{ edge, rect?, y0, y1 }], aviation: [{ x, y, z }] },
}
```

Budgets (`FAR_BUDGET`): ≤ 2 meshes and ≤ 2,000 triangles by day (西苑 ≤ 1,500), night layer ≤ 600 triangles
(= 300 instances). The silhouette rule (`far-lod.test.js`): the plan bounds above 5 m, the top and the lowest
above-ground point within 0.5 m of the near exterior (+ its roof garden). Packages keep that test green with
their own towers.

The night layer is one `InstancedMesh` per tower (unit quad shared by all towers, so no vertex bytes), visible only
while the tower is far **and** the scene is at night (`ctx.mats.onNight`). Refuge storeys get no lit windows; crown
edges are lit; obstruction lights are red. Per community / tower the spec comes from:
`westFar` / `northFar` (community-west / -north.js) and `hospitalityFarSpec` (hospitality.js, R / H / A). A
supertall builder replaces those with its own spec.

### Instanced floor modules — `src/render/build/facade-modules.js`

```js
const mods = moduleSet(ctx, b, materials, { local = false, name })
mods.build(key, (B) => { /* one storey's direct geometry at elevation 0 */ })
mods.instance(key, levels, { elev = (lv) => lv.elev })   // one InstancedMesh per output material
mods.primitive(key, geometry, material, levels, (lv) => [Matrix4…], { color, colors })   // primitives (fins, louvres)
mods.hide(levelId) / mods.show(levelId) / mods.handle(levelId) → { visible }
mods.meshes
plainInstanceMaterial(material, color) · blackInstance(mesh)
```

Black-instance rule: batch materials are vertex-coloured and draw black on geometry without a `color`
attribute. Module geometry comes from `BatchSet.flush` (it writes `color`) and uses the batch materials; primitive
geometry goes through `primitive()`, which uses a `vertexColors = false` clone (the tower's clipping plane kept) and
`setColorAt`. `facade-modules.test.js` checks every `InstancedMesh` in all ten tower exteriors.

### Curtain wall and façade kit — `src/render/build/curtain-wall.js`

```js
curtainWall(B, edgesOrRect, { levels, module = 1.5, finEvery = 2, fin = .35, spandrel = .9, chamfer = 0, mullion = .06, skip(lv, e), span(e), colors, keys })
splitFacade(levels, y = 100) → { punched, curtain }       // mixed towers
transitionBand(B, edgesOrRect, y, { height, depth, color })
louvreBand(B, edge, y0, y1, { blades = 8, fireWindows: [[t0, t1]], span })   // refuge band + 乙级 fire windows
rescueMarks(B, edge, levels, spans)                         // red triangles on the 1.0 × 1.0 m panels
crownFins(B, edgesOrRect, y0, heights | (t, e) => h, { spacing, depth })
aviationLights(B, points)                                  // red glowSoft boxes
belt(B, edge, y0, y1, diagonals)                           // outrigger / belt truss behind a refuge band
```

Mullions and vision glass merge vertically over each contiguous run of `levels` (one box per mullion for the whole
run); only the spandrel is per storey (≤ 430 vertices per added storey). **Mixed façade (DECISIONS round 2,
北苑)**: keep today's punched-window builder for `splitFacade(levels, 100).punched` (8F–23F with the open 观江阳台,
untouched) and call `curtainWall(B, rect, { levels: curtain })` for the floors above, with `transitionBand` at the
first curtain storey. The far spec mirrors it: per-storey window strips below, one merged glass band above.

### Refuge floor interior — `src/render/build/refuge-floor.js`

`buildRefugeFloor(ctx, L)` → `{ group, vertices, dispose, update }` from `lv.refugePlan` (P0a shape: `areas` /
`plant` / `vestibules` / `windows` / `fixtures`, polys world, rects local in `plan.frame`): the 避难区 floor with a
yellow edge line, 2.00 h / 3.00 h plant rooms with their tanks / pumps / fans, the 防火隔间, hydrant cabinets, hose
reels, extinguishers, the fire phone, PA, signs, louvre backs and 乙级 fire-window frames; ≤ 3k vertices
(`REFUGE_FLOOR_MAX_VERTICES`). `app.js` builds it lazily through the floor LRU (`ensureTowerFloor`, hook (a)).

### Cores, stairs, lifts, gates

- `liftShaft(B, col, F, L, y, h, pal, landing)` and `liftLanding(L, lv)`: the door width is `L.doorWidth ??
  e.doorWidth ?? 1.1`; `corePlan.lifts[i].landing === false` draws a blank wall; a level in `e.fireOnly` draws the
  door plus a red `消防专用` plate. `residential-cores.js` follows the same rules for 北苑's host levels. Since the P0
  merge both read the landing kind through P0a's `landingAt(e, levelId)`.
- `landingDoors()`: two leaves and a steel sill per stop (fire-only stops included), one InstancedMesh per tower.
- `stairBreak(s, plan, levelId)` (`tower-stairs.js`): P0a's `towerStairPlan(s).breakAt(levelId)` (since the P0
  merge it has no fallback of its own: `s.breakLevels` + `s.breakDoors[id] = { door2, partition }`, else the mirrored
  default, exactly the doors `applyStairBreaks()` gives the stair room); the stair shell then draws both doors, their
  leaves, exit signs and the partition with its lit plates.
- `tower-elevators.js`: closed tower shafts (`closedTowerShaft(ctx, e)`: tower, not glass, not exterior) draw their
  cars as one InstancedMesh per material per cabin size per tower plus one for the door leaves; the car API
  (`group`, `set(y, open, floor)`, `open`, `elevator`) is unchanged. **Cabin size contract**: `e.car = { w, d }`
  (北苑 K4: `{ w: 1.1, d: 2.1 }`, centred in the 1.9 m shaft); absent = the shaft less 0.13 m a side.
- `access-gates.js`: `leaf: 'existing'` draws only the reader on the card side and a plate, plus a door sign
  (`仅供疏散 · 外侧刷卡` / `住户楼层 · 刷卡进入`, sub-text `火灾时自动释放`) in one sign mesh per floor; no glass
  leaves (the stair renderer draws the existing door). `gateSignText(g)`, `gatePickInfo(layout, g)` read `role`.

### Render dispatch

`buildHospitality()` asks `buildSupertallResidentialRender(ctx, b, records)` (`render/build/r-supertall.js`, P-R)
and then `buildSupertallTowerRender(ctx, b, records)` (`render/build/hospitality-supertall.js`, P-HA) before
today's `buildHospitalityTower`; both stubs return null. A package returns its tower record
(`{ group, plane, groundGroup, roofGroup, materials, residentialShells, farLod }`, set into `records`). The only
lines of render `hospitality.js` a tower package edits are inside `// <supertall:R>` / `// <supertall:HA>`.
`b.roofGarden = false` skips today's roof garden; `landscape()` keeps every `site.fireAccess` hardstand clear.

### UI

- `floor-rows.js`: `towerRailZones(layout, bid)` (reads `b.zones` — P0a's `towerZones()` shape, `levels` or
  `from` / `to` — else, since the P0 merge, P0a's `towerZones(b, levels)` (P0b's `railZonesFallback` /
  `railZoneKind` were removed then); host zones are skipped, the podium row stays),
  `floorRows(layout, bid, { focus, expanded, all })`, `zoneChips`, `railSearch` (`37` / `37F`, `3702` /
  `R1-3702`, `避难`), `towerSub(layout, b)` (`b.sub` or name + top floor), `towerFacts` (电梯 by bank,
  避难层 n, 最高 m). Single-level zones (lobby, amenity, refuge, roof) are floor buttons; refuge rows are hatched
  `避难层 · 设备层` buttons. The community towers publish P0a's `b.zones` (`applyTowerZones`); the other towers
  get `towerZones()` on the fly until their package sets `b.zones` (see `docs/supertall/p0-merge.md`).
- `lift-keypad.js`: `keypadModel(layout, e, { here, options, fireMode })`, `keypadHtml`, `keyForBuffer`,
  `keypadStops` (P0a's `liftStops(e, { fire: true })`), `rideHud`. Fire lifts are P0a's `isFireLift()`. Explore shows the keypad for the nearest lift with ≥ 10 stops (6 columns, 5 on
  phones, ≥ 44 px keys), the other links under it; digits buffer 1 s, Enter goes, Backspace deletes, ↑ / ↓ move,
  E / Esc close; refuge keys only on fire lifts with the `使用消防员钥匙？` confirm (`app.explore.setFireMode(true)`
  unlocks them and fire-only keys); `fireOnly` keys are greyed `消防专用`.
- Ride: `createElevatorRide(from, to, cabin, approach, e.speed ?? 3.5, { fire })` (P0a's signature; today's code
  ignores the extra arguments, and Δy / (2 × 3.5) = today's Δy / 7). The HUD reads `上行 · 20F · 实际约 12 秒`
  (P0a's `ride.realSeconds`; the keypad's own `realRunSeconds` copy was removed at the P0 merge); Space skips to the
  arrival (`app.explore.skipRide()`).
- `app.js` hooks: (a) `ensureTowerFloor` builds homes, refuge floors (`buildRefugeFloor`) and lobby / amenity
  floors through `ctx.towerFloorBuilders`; (b) closed shafts build no pass floors on a ride (explore), only the
  destination; (c) pick boxes and level sub-groups have static matrices, level groups re-derive theirs only when
  the exploded view moves them (`syncLevelMatrices`); (d) core / refuge pick texts from `b.coreCard` /
  `lv.pickText`; (e) overview shadow radius 410.

## Measured budgets (one `perf/measure.cjs` run each, `high`, swiftshader 1280 × 800, port 5511)

Baseline re-measured at `ea99c34` (`dist/mall.html` of that commit; its `src/` equals the SPEC's `9bdb886` base plus
the door / 7F sky-lobby fixes) before the ratchet (C-31), then the final P0b build. Calls are main pass + labels
("steady"); triangles are the main pass.

| measure | `ea99c34` (before) | P0b (after) | rule | |
|---|---:|---:|---|---|
| **campus steady calls** | 2,817 + 35 = **2,852** | 1,922 + 35 = **1,957** | ≤ 2,200 ratchet (M0 + M1 ≤ 2,000, so the ratchet stays 2,200) | ✓ |
| campus main triangles | 3.753 M | **2.511 M** | ≤ 4.07 M | ✓ |
| campus shadow refresh calls | 1,351 | 731 | | |
| campus frame with shadow refresh | 4,203 | 2,688 | ≤ 4,203 | ✓ |
| campus at night (steady) | 2,852 | 1,967 (+10: one night layer per far tower) | | |
| N1 (北苑 close) | 1,331 / 2.419 M | 1,317 / 2.418 M | each view ≤ 2,916 / ≤ 4.07 M | ✓ |
| R1 (R at 560–620 m) | 2,851 / 3.747 M | 2,073 / 3.205 M | | ✓ |
| campusTall | 2,914 / 3.825 M | 2,019 / 2.584 M | | ✓ |
| river | 2,519 / 3.550 M | 2,034 / 3.721 M | | ✓ |
| P1-RF viewdeck | 1,877 / 2.818 M | 1,247 / 2.816 M | | ✓ |
| P2 roof | 404 / 1.593 M | 264 / 2.094 M | | ✓ |
| 西苑 step | 279 / 1.028 M | 279 / 1.028 M | | ✓ |
| **scene geometry at load** | 284.71 MB | **285.03 MB** | ≤ 286.8 MB | ✓ |
| **JS heap at load** | 526.6 MB | **550.2 MB** (531.2 MB in the run before, same code bar the car rule) | ≤ 560 MB | ✓ |
| **shader programs** at load / after all views | 61 / 118 | **51** / 122 | ≤ 70 (at load, as perf.md) | ✓ |
| scene meshes / vertices at load | 11,296 / 14.49 M | 10,842 / 14.50 M | | |
| community resident geometry (Node, 18 B/v) | 9.94 MB | 9.98 MB | ≤ 10 MB | ✓ |
| `dist/mall.html` | 79,704,309 B | 79,751,298 B | ≤ 81 MB | ✓ |
| full suite (concurrency 2, a browser running) | 527 tests | **559 / 559**, 6 min 16 s | ≤ 300 s at concurrency 3 on a quiet machine | |

Far LOD (Node, `far-lod.test.js`): all ten towers ≤ 2 meshes by day (R 964, W 616, H / A 250, T ≈ 265 triangles);
silhouettes within 0.04 m in plan above 5 m and 0.00 m at the top; night layers 134–408 triangles.

**No LOD pop in the R1 view**: R1 at 594 m rendered near (coming from 560 m) and far (coming back from 606 m,
inside the 5 % hysteresis band) at the same camera: the R1 crop differs by 4.5 / 255 mean absolute per channel and
1.5 levels in mean colour (RESULT.md's 西苑 criterion: within ≈ 10 levels). Shot: `p0b-R1-view.jpg`.

Shots (1280 × 800, port 5511): `scratchpad/supertall-shots/p0b/` — `p0b-campus-before.jpg` / `-after.jpg`
(parity, the measure.cjs campus view), `p0b-R1-view.jpg` (with the near / far R1 inset), `p0b-keypad-T1-LF.jpg`
(T1-LF at 12F: zones, current floor, stairs listed under the pad), `p0b-rail-T1.jpg` (16F focused, 错层复式 open),
`p0b-rail-phone.jpg` (390 × 844), plus `p0b-keypad-T1-LF-buffer.jpg`, `p0b-ride-hud.jpg` (`上行 · 20F · 实际约 12 秒`)
and `p0b-campus-night.jpg`.

## Deviations from SPEC

1. **Night layer material.** SPEC: a vertex-coloured mesh in `facadeWindowLit`. Built: one `InstancedMesh` of a
   shared unit quad in a plain (no vertex colours) clone of the tower's clipped `glowSoft`, tinted per instance.
   `facadeWindowLit`'s emissive is one colour per material, so the red obstruction lights could not be drawn, and
   the instanced quad adds no vertex bytes (the community resident geometry had 0.06 MB of its 10 MB left). It is
   one instancing shader variant campus-wide, compiled the first time a night view is drawn (programs at load: 51).
2. **北苑 day stand-in.** Today's per-storey generator (`farFacade`, 3.2k vertices per tower) would have pushed the
   community resident geometry to 10.14 MB; 北苑 uses a compact spec instead (≈ 0.8k vertices: mass from 7F, glazing
   columns at the measured window share, a spandrel per storey, cornice, penthouse, lift overruns, the 7F canopy).
   西苑 keeps `farFacade` unchanged.
3. **R stand-in follows the plate**, not one box: the roof's `upperPlate` rectangles as masses, each wing with its
   own windows, balcony strip and storey lines (964 triangles), for campus parity. H / A are one box (their plate).
4. **C-14 saves 0 MB in the browser.** `app.js` already runs `buildElevators` on the legacy (non-tower) layout, so
   tower shafts never had per-stop panes in the app; SPEC's ≈ 5.5 MB was a Node-side count (it is real there:
   140k vertices for 西苑 / 北苑). `buildElevators` now skips closed tower shafts in any layout (tested), scoped to
   towers: mall, garage and metro lifts keep theirs, and today's R / H / A lifts are exterior glass lifts (kept until
   P-R / P-HA retire them). Landing sills moved into `landingDoors` (one instance per stop).
5. **Instanced shells draw every instance** once any is in view (no per-storey culling): the river and P2-roof views
   gain triangles (3.55 → 3.72 M, 1.59 → 2.09 M) while their calls drop; both stay under 4.07 M.
6. **Rail on phones**: the existing horizontal strip, where the zone headers act as the chips (the desktop chip row
   is hidden there); no separate `选择楼层` bottom sheet. On desktop the multi-level zones collapse except the focused
   one (北苑 T1 now shows RF · 14–24F · 8–13F · 7F · podium until a zone is opened; `all: true` lists every floor).
7. **Fire mode** has no in-game alarm switch yet: `app.explore.setFireMode(true)` unlocks refuge and fire-only keys;
   in normal mode refuge keys ask `使用消防员钥匙？`.
8. **New files beyond the matrix** (all P0b's): `src/render/lift-keypad.js` (pure keypad model, testable),
   `tests/render-context.js` (shared Node render ctx), `tests/north-community-render.test.js` (the 北苑 cases moved
   out of `community-render.test.js`; `north-render.test.js` has its own `context()`), `tests/west-render.test.js`,
   `tests/core-render.test.js`; `perf/measure.cjs` was never committed before and now is.
9. **Cars** are instanced per tower and per cabin size (W1 has two sizes); the floor screen stays a small mesh per
   car, shown only in the car being ridden.
10. **Gate door signs** (exit / re-entry, leaf `existing`) are one sign mesh per floor that has such gates (+1 call
    when that floor shows); none exist today.
11. **JS heap** varies between runs of the same build (531 / 550 MB); both under 560 MB.
12. **Rail switch at the merge**: the rail already read `b.zones` (P0a's `towerZones()` shape, with `levels` or
    `from` / `to`) and fell back to `railZonesFallback()`. At the P0 merge the fallback became P0a's `towerZones()`
    itself, as SPEC §2.2 asks (`docs/supertall/p0-merge.md`).
