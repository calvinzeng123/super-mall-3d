# Supertall P0a: layout engine and contracts

Branch `supertall/p0a`, based on `e6948b9`. This package is SPEC §5.3 "P0a — layout engine and contracts" (SPEC §2.1 in full, plus the revision-2 items). No tower changes height or program here: the tower packages do that.

## Acceptance

| item (SPEC §5.3) | result |
|---|---|
| Full suite green with today's values | **564 / 564** pass (`node --test --test-concurrency=2 tests/*.test.js`, 310 s on the shared machine with another package's browser running). Before P0a: 527. |
| `fps-frozen` unchanged | Unchanged. The compact JSON hash is the pinned one, and `tests/fps-frozen.test.js` is untouched. |
| No shared builder writes a C-13 field | `tests/shared-builders.test.js` checks each compact elevator, stair, level, building and residence record for each key. It also greps the whole compact JSON for the keys that never occur there. |
| Expansion JSON differs from HEAD only by additive keys | `tests/expansion-additive.test.js` covers 33 record groups. With `zones`, `zone` and gate `releaseOnAlarm / role / leaf` stripped, every group hashes as at `e6948b9`. Those keys appear only on expansion-only records. |
| Penthouse spike result recorded (C-16) | **Passed**: 4 distinct duplexes per wing, 8 in all (see "Penthouse spike"). |
| Plan-data content hash unchanged across the split | west `2a04b430…`, north `7b5fd4ed…`; `COMMUNITY_PLANS` as a whole `1b6d8889…`, the same as `e6948b9`. Regenerating with the split scripts is byte-identical for both files (north ≈ 80 s, run once; west in the test). |
| Nav smoke checksum identical with and without sharing | `−29770272` shared, unshared and at `e6948b9`. 970 lift-stop walks. |
| Nav heap ≤ 30 MB at today's heights | **21.7 MB** shared, against 50.7 MB unshared (`e6948b9`: 50.7 MB). CPU ≈ 0.95 s either way. |
| New unit tests pass | 11 new test files plus the two halves of `community-plans`; 3 extended; 7 restructured (list below). |

## What was built

### Engine (src/layout)

| file | change |
|---|---|
| `refuge.js` (new) | `REFUGE`, `refugeLevel()`, `refugeLevelErrors()`, `checkRefugeStack()` |
| `zones.js` (new) | `ZONE_KINDS`, `levelZoneKind()`, `towerZones()`, `zoneOf()`, `applyTowerZones()` (called in `buildLayout` for the expansion layout only) |
| `hardstand.js` (new) | `HARDSTAND`, `hardstandRecord()`, `allHardstands()`, `hardstandFace()`, `hardstandErrors()` |
| `r-supertall.js`, `hospitality-supertall.js` (new stubs) | `supertallResidential()` and `supertallTower()` return `null`. `supertallSitePass(layout)` holds an empty `<supertall:HA>` region. |
| `north-site.js`, `west-site.js` (new, move-only) | `NORTH_SITE` / `WEST_SITE`. `community-sites.js` re-exports them. |
| `community-plan-data-north.js`, `-west.js` (new, move-only) | `NORTH_PLANS` / `WEST_PLANS`. `community-plan-data.js` re-exports `COMMUNITY_PLANS = Object.freeze({ west, north })`, same keys and order. |
| `community-contract.js` | `LEVEL_KINDS` gains `'refuge'` (exported). Refuge levels are checked with `refugeLevelErrors`. `LIFT_ROLES` = the full role list. `e.fireOnly` is checked. Passenger and private lifts may not serve a refuge floor. |
| `tower-stairs.js` | `breakLevels` / `breakDoors` (分隔), `applyStairBreaks()`, `maxRisers` loops, `RISER` / `GOING`, `stairLoops()`, `flightRisers()`. Records without the fields are unchanged. |
| `elevator-shafts.js` | Lift fields documented. Adds `LIFT_SPEED_DEFAULT`, `LIFT_ROLES`, `FIRE_LIFT_ROLES`, `isFireLift()`, `liftStops()` and `landingAt()`. The shaft also spans `fireOnly` landings. |
| `elevator-ride.js` | `travel = max(1.2, Δy / (2 × speed))`; `realSeconds`, `liftRunSeconds()`, `rideTravel()`, `LIFT_RUN` |
| `access-records.js` | `gateRecord({ releaseOnAlarm = true, role = 'entry', leaf = 'own' })`, `GATE_ROLES`, `GATE_LEAVES`, `GATE_ALARM_TEXT`, the role / leaf checks in `gateRecordErrors`, `segmentGate()`, `stairReentryGates()` |
| `nav.js` | Plan sharing (`options.share`, default on). `lv.navPlan` reuse. Lifts link `fireOnly` landings with `gates: 'open'`. `floorLabel` names refuge areas and amenity / lobby zones. |
| `community-plan.js` | `pickRefugeRoom()`, `refugeRoomErrors()`; the `validateHome` check runs only when a plan names a refuge room. Also `planKey()`, `homeStair(b, level, rise)`, `VARIANT_EXTRAS` with `program({ variantExtras })` (off by default), and `wingSpec()` with `generateDuplex(spec, { wing })`. |
| `community-units.js` | The `doorLeaves()` leaf into `residence.refugeRoom` gets `fire: '乙级'`. Adds `refugeDoorLeaves()`, `communityUnit({ refugeRoom })` and `buildDuplexUnits(spec, frame)`. |
| `hospitality.js` | The supertall dispatch, `collectSupertall()` and the `<supertall:R>` / `<supertall:HA>` region markers |
| `layout.js` | Expansion only: `applyTowerZones(layout)`, then `supertallSitePass(layout)` |

### Scripts

- `scripts/prepare-community-plans.mjs` is now a driver: `--community west|north|r` (repeatable, or comma-separated). With no flag it runs west and north, as before. `--west-only` is kept.
- The driver calls `scripts/plans/west.mjs`, `scripts/plans/north.mjs` and `scripts/plans/text.mjs` (the data-file text). These are move-only. `r` loads `scripts/plans/r-penthouse.mjs` once P-R adds it.
- `scripts/supertall/r-penthouse-spike.mjs` is the C-16 spike. It is read-only.

### Tests

- **New:**
  - `refuge`, `zones`, `hardstand`, `access-gates`, `nav-share`, `no-bypass`;
  - `expansion-additive`, `shared-builders`, `community-plan-hooks`, `supertall-dispatch`;
  - `r-supertall` (stub, P-R takes it over);
  - `community-plans-north` / `-west` (the split of `community-plans`).
- **Extended:** `tower-stairs` (分隔 walk, `maxRisers` loops, the C-1 riser check), `elevator-ride` (ride formula, `realSeconds`), `community-contract` (refuge case + 6 mutations).
- **Restructured:**
  - `riverside-integration`: counts and `site.fireAccess` from the deltas;
  - `p1-expansion-layout`: `COMPACT_IDENTICAL`;
  - `hospitality`: the tower pins run on the compact layout;
  - `residence-access`: the count comes from the deltas, and the walk is deduped;
  - `suite-nav`: the H / A pins run on the compact layout, the 728 count comes from the deltas, and `A-2F` became `A-3F`;
  - `p1-fidelity` and `hospitality-relocation`: both use `hotelShortStay()`.
- **Support:**
  - `tests/campus-deltas/{base,index}.js`;
  - `tests/fixtures/synthetic-tower.js` (P0a's own fixture; P0b's `supertall-records.js` is untouched);
  - `tests/support/{no-bypass.js, layout-groups.js, nav-measure.mjs}`;
  - `hotelShortStay()` in `tests/helpers.js`.

## API for the tower packages

### Refuge levels (`refuge.js`)

```js
refugeLevel({ id, building, short /* 'nF' */, elev, height, frame, footprint?, slab?, outline?,
  areas: [{ id, rect, net? }],                 // 避难区, tower-local rects; net defaults to the rect area
  corridors: [rect],                           // other walkable floor (landings, band, lift lobby)
  plant: [{ id, name, rect, rating: '2.00h' | '3.00h', contents }],
  vestibules: [{ rect, doors }],               // 防火隔间
  windows: [{ edge: 'N'|'S'|'E'|'W', span: [a, b], kind: 'fire-window-B' | 'louvre' }],
  fixtures: [{ kind: 'hydrant'|'hose-reel'|'extinguisher'|'fire-phone'|'pa'|'sign', x, z, label }],  // tower-local
  face /* hardstand side, tower-local */, persons, serves: [levelId], outrigger, theme? }) → level
```

- **The level record:**
  - `kind: 'refuge'`, `name: 'nF 避难层'`, `levelNumber`, `units: []`;
  - `rooms` = the plant rooms (`type: 'plant'`, no door, solid in nav);
  - `walk` = the areas (`kind: 'refuge'`) plus the corridors;
  - `slab` = one piece over `footprint`, `voids: []`, `features: []`;
  - `theme.label` = `避难层 · 设备层 · 消防电梯停靠`, plus ` · 加强层` with `outrigger`.
- **`lv.refugePlan`:**
  - `{ frame, face, persons, serves, netRequired, outrigger }`;
  - `areas: [{ id, name: '避难区', rect, poly, net }]`;
  - `plant: [{ id, name, rect, poly, rating, contents }]`;
  - `vestibules: [{ id, name: '防火隔间', rect, poly, doors }]`;
  - `windows: [{ edge, span, kind }]`;
  - `fixtures: [{ kind, x, z, lx, lz, label }]`.
  - `poly`, `x` and `z` are world; `rect`, `lx` and `lz` are tower-local.
- **What the builder adds itself:** the core (stair rooms, lift shafts, voids and slab holes, `corePlan` for community towers), as `tests/fixtures/synthetic-tower.js` and the refuge contract case do.
- `checkRefugeStack(building, levels, { ground = 0, elevators }) → [error strings]`. Pass the tower's own levels (host levels may be included) and all its lifts. `building.footprint` enables the hardstand-face check. Open-air `kind: 'roof'` levels are exempt from the "top storey above the last refuge floor" check (C-17).
  - It reports: first > 50 m, a gap > 50 m, the top enclosed storey > 50 m above the last refuge floor (or a > 50 m tower with none), net < persons / 5, no fire lift (a `fireOnly` landing counts), a passenger or private lift landing, a unit on the floor, and no 避难区 on the hardstand face.
  - 北苑 passes `ground: 0` (the street hardstand), never the P1 roof.

### Stairs (`tower-stairs.js`)

- `stair.breakLevels = [levelId]`, optional `stair.breakDoors[levelId] = { door2, partition }` (stair-frame segments). By default the partition runs at constant x between the two lanes, 2 m into the door landing, and `door2` mirrors the stair door about it. A door that straddles the partition throws unless `door2` is given.
- After creating the stair rooms on every level and before `buildTowerStairAccess`, call `applyStairBreaks(levels, stairs)`. On each break level it adds:
  - the stair room: `doors: [door1, door2]` (+ `wdoors`), `breakPartition`;
  - the level: a world nav wall `lv.navWalls[] = { x0, z0, x1, z1, stairBreak }`;
  - `lv.corePlan.stairs[i]`: `door2` and `partition`.
- Routes: route (R−1 → R) ends at the **arrive** door (the high-x lane), and route (R → R+1) starts at the **depart** door (the low-x lane). `towerStairPlan(s).breakAt(id)` returns `{ partition, doors, depart, arrive }`, and P0b's renderer reads it. The 1F split uses the same mechanism: put the 1F level in `breakLevels`.
- `stair.maxRisers = 18` (expansion-only builders): `loops = stairLoops(rise, 18)`, `flightRisers(rise, 18)`. A multi-loop storey has flights `-flight-1…4`, half landings `-landing` / `-landing-2`, and a doorless door-end landing surface `${route}-loop-k` (`doorless: true`, `parentFloor` = the lower level). Its route carries `loops` and `landings`. The depth check uses the loop's flight.
- Stair records stay one per stair (106 campus-wide).
- `tests/tower-stairs.test.js` "C-1" lists today's 北苑 P1-1F→2F flights (20 risers) as `KNOWN`. P-north sets `maxRisers: 18` on those stairs and deletes the list.

### Lifts (`elevator-shafts.js`, `elevator-ride.js`)

- **Fields**, written only by expansion-only builders (C-13):
  - `e.speed` (m/s), read as `?? 3.5`;
  - `e.role` ∈ `LIFT_ROLES` (`private-w`, `private-e`, `fire`, `fire-service`, `passenger`, `residence`, `shuttle`, `hotel`, `service-fire`); fire lifts are `FIRE_LIFT_ROLES` = `fire`, `fire-service`, `service-fire`;
  - `e.zone` (`'low' | 'high' | null`), `e.card` (`'resident' | 'room-key' | null`);
  - `e.serves` (normal doors), `e.shaftLevels` (existing), `e.fireOnly` (fire-mode-only doors, never also in `serves`).
- **Helpers:**
  - `liftStops(e, { fire })` is `serves`, plus `fireOnly` when `fire` is set;
  - `landingAt(e, id)` returns `'normal' | 'fire' | null`, so `corePlan.lifts[i].landing = landingAt(e, lv.id) != null`;
  - `isFireLift(e)`.
- `buildNav(L)` links `serves` only; `buildNav(L, { gates: 'open' })` also links `fireOnly`.
- `createElevatorRide(from, to, cabin, approach, speed = 3.5, { fire })` returns `travel = max(1.2, Δy / (2 × speed))` and `realSeconds = liftRunSeconds(Δy, speed, { accel: fire ? 0.9 : 1.0 })`.
  - `liftRunSeconds` is a jerk-limited trapezoid: `d / v + v / a + a / j` once the car reaches v, otherwise `2√(d / a) + a / j`, with j = 1.5 m/s³.
  - It reproduces SPEC's R1-LF 1F → 53F (42.8 s) and 北苑 LW 1F → 34F (38.2 s).

### Gates (`access-records.js`)

- `gateRecord({ …, releaseOnAlarm = true, role = 'entry' | 'exit' | 'reentry', leaf = 'own' | 'existing' })`:
  - `exit`: the stair or terrace is the v > 0 side (free egress through `GATE.exitSensor`), and the reader is outside;
  - `reentry`: the floor is the v > 0 side, and the reader is in the stair;
  - `leaf: 'existing'` requires `kind: 'glass-door'` and no cabinets.
- `GATE_ALARM_TEXT = '火灾时自动释放'` is the sign sub-text. The renderer (P0b) adds it, so no existing sign record changed.
- `segmentGate({ id, zone, name, floor, frame, seg, toward /* N|S|E|W: the protected side */, role, leaf = 'existing', sign, building, readerV = -0.8 })` builds a one-lane door gate in a stair or room door opening.
- `stairReentryGates(stair, levels, zoneOf, { door?, name?, sign? })` returns one `reentry` gate per level, with id `${stair.id}-${lv.short}`, in `stair.doorByLevel[id] || stair.door` (or `opts.door(lv)`). Zone: `zoneOf(lv)`.
- **Keep every lift and stair stop `GATE.reachClear` (2 m) from a gate line.** `linksNear` offers a link by distance only, so a stop within reach of the public side is a bypass. The no-bypass harness finds it.

### Zones (`zones.js`)

- `b.zones = [{ id, name, from, to, kind, levels, lifts, homes, host? }]`, bottom-up; `lv.zone` is set on own levels.
  - `kind` ∈ `ZONE_KINDS`: `basement`, `lobby`, `band`, `refuge`, `amenity`, `podium`, `roof`;
  - `lifts`: the lifts with a normal stop in the zone;
  - `homes`: the distinct `residence.home` count;
  - `host: true` marks P1 levels under 北苑 (no `lv.zone`).
- `towerZones(b, levels, { elevators, passLevels })` derives the default: bands split where the level kind or name changes, and every refuge, amenity, lobby and roof level is a zone of its own.
- `applyTowerZones(layout, { filter })` runs in the expansion layout and zones only the community towers (T1, T2, W1, W2). A tower package that defines its bands sets `b.zones` itself, and it is kept. H, A and R1–R4 stay unzoned until their packages, because `p1-expansion-layout` compares them record by record with the compact layout.

### Hardstands (`hardstand.js`)

- `hardstandRecord({ id, building, rect, face, label = '消防登高场地', name? })` returns `{ id, building, tower, name, label, face, rect, poly }`. It goes in the supertall part's `fireAccess`, and `collectSupertall()` appends it to `site.fireAccess`.
- `hardstandErrors(rec | id, building | id, layout)` checks:
  - size ≥ 20 × 10 m, on a long side, its near edge 5–10 m off that facade, covering the full long side;
  - no tree, planter, open trench, garage-ramp mouth (its first 6 m), parking stall or other building inside it or between it and the facade. Low lobby beds and canopy posts may stand in the strip.
- It reads `site.fireAccess` and `site.westGarden.hardstands`. All four of today's hardstands are clean.

### Supertall dispatch (`hospitality.js`)

- `buildHospitality(…, { expansion: true })` calls `supertallResidential(spec, { site, expansion }) ?? supertallTower(spec, …)` for each `HOSPITALITY.towers` spec before `tower(spec)`.
- **Return:** `null` keeps the compact tower. Otherwise return a part `{ building, levels, escalators, elevators, stairs, entrances, ramps, access: { zones, gates }, fireAccess }`. Every array is required, because `buildLayout` flattens the parts by key.
- `collectSupertall(parts, site)` collects `access` into `layout.accessControl` and `fireAccess` into `site.fireAccess`.
- **Regions:** P-R edits only inside `// <supertall:R>` … `// </supertall:R>`: the ground paths, the residential loop and the R garage / arrival / street-ramp section. P-HA edits only inside `// <supertall:HA>`: the H / A side doors, the hotel arrival road and surface parking, the H / A basement ramps and the dock section. `tests/supertall-dispatch.test.js` checks that the regions pair up and that the dispatch stays outside them.
- `supertallSitePass(layout)` (in `hospitality-supertall.js`, P-HA's) runs once at the end of the expansion `buildLayout`, before the lift shafts are cut. Tag the 20 `酒店短停` bays with `hotelShortStay: true` there. `hotelShortStay(L)` in `tests/helpers.js` counts the lot's stalls plus tagged west-lot bays within 60 m of `H-SIDE`.

### Homes (`community-plan.js`, `community-units.js`)

- `pickRefugeRoom(plan, face?)` returns a room id or null. It picks a bedroom or study with an exterior window, preferring a window on `face` (unit-local), then a bedroom, then the master, then the largest.
- `refugeRoomErrors(plan)` reports a missing room, the wrong kind or no exterior window. `validateHome` runs it only when `plan.refugeRoom` is set, so today's data is unchanged.
- `communityUnit({ …, refugeRoom })` tags the residence. Its door leaf into the room becomes `fire: '乙级'`, and no other leaf changes. Equivalently, store `refugeRoom` in the plan data (P-north's "apart from refugeRoom / spec").
- `planKey(plan)` equals the generator's `meta.key`, so `used` / `exclude` sets can be seeded from frozen data.
- `program(type, { variantExtras: true, variant })` adds one of 茶室 / 家庭厅 / 工人房 + 卫 / 次主卫 / 酒窖 (flats only, no extra bedroom). P-north tunes the table.
- `homeStair(block, level, rise = 3.3)`.
- `generateDuplex(spec, { wing: { w, d, exteriorEdges: { S, W, E, N: true | [[x0, x1], …] }, rise } })` is the R penthouse hook. N spans are exterior parts of the entry front, which get their own `facade-N-i` walls. With no `wing`, the output is byte-identical to `e6948b9` (hashes pinned in `community-plan-hooks.test.js`).
- `buildDuplexUnits({ building, community, home, slot, levels: [lo, up], ids, codes | code, names | name, en, plans: [lower, upper], refugeRooms?, accent?, catLabel? }, frame)` returns the `[lower, upper]` community units. They are partners, share `homeLevels`, and the upper level has no front.

### Nav (`nav.js`)

- `buildNav(L, { share = true })` shares `walls`, `obstacles` and `grid` between floors whose walls and obstacles are element-wise identical at 1 mm (gate leaves included). Such floors carry `F.sharedPlan` = the template floor id.
- `lv.navPlan = key` (optional) makes repeats of a key copy the first level's walls instead of rebuilding them. Levels with duplex units always build.
- `floorLabel`:
  - 避难区: `云澜·北苑 1 号楼 · 24F 避难层（避难区）` (community towers, by `b.name`); other towers use `b.short`, so R1 reads `住宅1 · 14F 避难层 · 避难区` today (SPEC writes `R1 · …`; P-R sets the short name it wants);
  - `lv.amenityPlan.zones` and `lv.lobbyPlan.zones` (with `labelZones: true`), each `{ name, rect }` in `plan.frame`, read `title · nF <zone name>`.

### Campus deltas (`tests/campus-deltas/`)

- `index.js` imports `base.js` and **every other `.js` file in the folder**. Each package adds its own `north.js`, `west.js`, `r.js` or `ha.js`, and never edits `index.js` or `base.js`.
- **Delta shape** (all fields optional; unknown fields throw):

```js
export default {
  levels, lifts, stairs, shops, records, homes, west, north, gates, zones, residenceAccess,   // integers, added
  hardstands: [['HS-R1', 'R1'], …],          // site.fireAccess pairs, added
  compactIdentical: { remove: ['R1', 'R2', 'R3', 'R4'] },
  expansionChanged: ['R1', 'site', 'extensions', …],   // record groups changed on purpose (layout-groups.js)
  noBypass: [{ tower: 'R1', floors?: [levelIds], starts?: [{ floor, x, z }] }],
};
```

- **Exports:** `CAMPUS` (sums), `HARDSTANDS` (sorted), `COMPACT_IDENTICAL`, `EXPANSION_BASELINE`, `NO_BYPASS`, `DELTAS`, `BASE`.
- **Record groups:** one per building id (its building, levels, lifts, stairs, entrances, ramps, escalators, zones and gates), plus `site`, `extensions`, `bridges`, `accessControl` (meta), `sharedGarages` and the other top-level keys. A package lists every group it touches.

### No-bypass harness (`tests/support/no-bypass.js`)

- `floodNav(nav, starts, { cell, floors, box, until, maxCells })` floods the real nav:
  - `step()` moves of `cell` metres (walls, closed leaves, door portals, slab edges);
  - slopes ridden end to end;
  - lift and stair links as `linksNear` offers them;
  - no gate reader is ever tapped.
- `towerFlood(L, nav, bid, { margin, extraStarts })` starts from every gate reader of the tower. It protects the tower's own levels with homes, and the floors are the tower's own and host levels, its landings, its gate floors, its entrance targets and `ground`, cut to the tower bounds ± margin.
- `tests/no-bypass.test.js` runs each `NO_BYPASS` entry closed (no protected floor reached) and open (every one reached). For a tower whose protected floors are not "own levels with homes", give `floors`: H lists 3F–25F only, since its hotel floors stay open.

## Deviations from SPEC, and why

1. **The fixtures file.** P0a does not write `tests/fixtures/supertall-records.js` (P0b's). P0a's tests use their own `tests/fixtures/synthetic-tower.js`: a complete gated tower that `buildNav` accepts, built with the real engine builders. I read P0b's work in progress, read-only: its keypad, rail, refuge-floor, stair and gate renderers read exactly the shapes above (`refugePlan`, `b.zones` incl. `host`, `breakLevels` + `towerStairPlan().breakAt`, `fireOnly`, `role` / `zone` / `card` / `speed`, gate `role` / `leaf` / `releaseOnAlarm`, `realSeconds`).
2. **Campus deltas.**
   - Discovery is by folder scan, so the package delta files are created by the packages themselves. P0a created none of `north / west / r / ha.js`.
   - The shape gains `stairs` and `shops` (constant today, but read from the deltas too), `expansionChanged` (for the diff check) and `noBypass` (so P-R and P-HA add their towers without editing a shared line in `no-bypass.test.js`).
3. **The expansion diff check** compares per-group hashes pinned at `e6948b9` in `base.js`, not a stored HEAD JSON. The JSON is too large to commit, and per-group hashes say which part changed. Packages opt groups out through `expansionChanged`.
4. **hospitality.test.js.** Only the tower pins (storeys, homes per floor, 728, the 12 tower lifts, the parking stalls) moved to the compact layout. The campus-connection tests (paths, R ramps, the underground chain) stay on the expansion layout, which is where SPEC row C-8 expects P-R to update l. 115 / l. 166. **tower-stairs.test.js**: test 1 (336 routes / 672 flights) also moved to the compact layout, not only l. 92–101, because P-R and P-HA would otherwise have to edit its counts.
5. **The residence-access dedupe key** is the nav plan identity (floors that share walls by reference) × unit frame × plan × storey height. This is stricter than "plan signature × storey height": the unit's position decides the corridor at its door. Today it gives 42 groups for 728 homes. The test asserts that every member walks on its representative's walls, and still counts all 1,400+ doors.
6. **refugeLevel** takes a superset of SPEC's arguments: `building`, `footprint`, `slab`, `outline`, `corridors`, `face`, `persons`, `serves`, `theme`. Also, `refugePlan` carries `frame` and `face`, which the window and face checks need.
7. **Additions not in SPEC:**
   - `collectSupertall()` (exported, so the collection is unit-tested before any supertall part exists);
   - `communityUnit({ refugeRoom })` and `buildDuplexUnits({ refugeRooms })`;
   - `liftStops()`, `landingAt()` and `isFireLift()` (shared by the contract, nav, shaft and refuge checks);
   - `LIFT_RUN` and `liftRunSeconds()` (the HUD's real time).
8. **The no-bypass harness follows the game, so stair links are offered by distance (`linksNear`), even through a wall.** A stop within `NAV.reach` of the public side therefore counts as a bypass. That is why the real towers keep stops `GATE.reachClear` from gate lines; the synthetic test shows a stop placed 0.4 m behind a gate being caught.
9. **The C-1 riser check** pins today's 北苑 P1-1F → 2F flights (20 risers) as `KNOWN`, instead of failing. P-north removes them with `maxRisers` (SPEC §1.1).
10. **The plan-data hashes stay per community** (west in `community-plans-west`, north in `community-plans-north`). The combined `COMMUNITY_PLANS` hash is verified once (above), not pinned in a test, so P-north and P-west never edit the same line.

## Penthouse spike (C-16)

`node scripts/supertall/r-penthouse-spike.mjs` takes about 2 s and writes nothing.

- **Wing specs** (p2.md §3.2; unit-local x along the entry front):
  - **W** 17.6 × 14.3 m: exterior S / W / E (the slot), and N over x [0, 7.4] (tower x < −12, the NW void); entry 14.2–15.4.
  - **E** 15.6 × 14.3 m: exterior S / W (the slot) / E, and N over x [8.2, 15.6] (tower x > 12, the NE void); entry 3.4.
- **Settings:** `lux`, `voidAbove` (挑空 living), `wing.rise` 3.4 m, 5BR then 4BR, exclusion sets like `--extend-north`.

| wing | result | homes (type · variant) | area | stair | refuge room |
|---|---|---|---|---|---|
| W | **4 / 4 distinct**, all 挑空, 0 `validateHome` errors | 4BR v1, 5BR v8, 4BR v14, 4BR v5 | 503.4 m² (2 × 251.7) | aligned both levels, rise 3.4 m | `bed_guest`, south window |
| E | **4 / 4 distinct**, all 挑空, 0 errors | 5BR v0, 5BR v7, 5BR v14, 4BR v5 | 446.2 m² | aligned, rise 3.4 m | `bed_guest`, south window |

**Verdict: the spike passed, so P-R builds the procedural penthouses (no C-16 fallback).** Notes for P-R:

- The generator returns `null` for ≈ 98 % of attempts on these wings (218 of 222 on W), but each wing reaches 4 distinct duplexes in under a second.
- On the **lower** level the generator fills the front band beyond the core with a storage room, so that part of the north face gets no window there. The **upper** level puts a bedroom there with a north window (`facade-N-0`). If the lower level should use that view, P-R can bias the candidate front band (a generator change behind the `wing` flag).
- `pickRefugeRoom(lower, 'S')` finds a valid 户内避难间 on the entry level in every case.

## Verification commands

- `node --test --test-concurrency=2 tests/*.test.js`
- `node --test tests/fps-frozen.test.js`
- `node --expose-gc tests/support/nav-measure.mjs share` / `noshare`
- `node scripts/supertall/r-penthouse-spike.mjs`
- `node scripts/prepare-community-plans.mjs --community west` (≈ 1 s; byte-identical output)
