# Supertall P0 merge (P0a + P0b)

Branch `claude/wonderful-thompson-olaaxb`. SPEC §5.1 merge between the P0 packages and the four tower packages
(P-north, P-west, P-R, P-HA). The tower packages start from the head this note was committed on.

| step | commit | what |
|---|---|---|
| base | `e6948b9` | doors / 7F 空中大堂 QA deliverables |
| P0a | `d5c8a1d` → merge `d063c43` | layout engine and contracts (`docs/supertall/p0a.md`) |
| P0b | `f062671` → merge `4b6e7a6` | render engine and UI (`docs/supertall/p0b.md`), **plus the P0 hand-over** (below) in the merge commit, as SPEC §2.2 asks |
| notes | this commit | this file; `docs/supertall/p0b.md` updated where the hand-over removed a P0b name |

## Conflicts

**None.** Both merges were `--no-ff` and went through without a textual conflict. P0a touched 57 files and P0b 36,
and no file is in both: the ownership matrix (SPEC §5.2) held.

**No semantic conflicts either.** The plain merge, before any hand-over edit, ran green: **596 / 596** in 228 s at
concurrency 3. That is exactly P0a's 564 + P0b's 559 − the 527 they shared, so no test was lost or duplicated.

## Hand-over (in merge commit `4b6e7a6`)

P0b was written before P0a existed, so it carried fallbacks and copies of P0a's helpers. Each was replaced by P0a's
definition, so there is one source of truth for each contract:

| P0b consumer | before (P0b alone) | after the merge |
|---|---|---|
| floor rail `towerRailZones()` (`floor-rows.js`) | `b.zones`, else P0b's `railZonesFallback()` / `railZoneKind()` | `b.zones`, else **P0a's `towerZones(b, levels, { elevators })`** / `levelZoneKind()`; P0b's fallback is gone (SPEC §2.2 "fixtures", §5.1) |
| lift keypad (`lift-keypad.js`), explore | own `FIRE_ROLES` / `isFireLift`, its own stop union and fire-only test | P0a's `isFireLift`, `liftStops(e, { fire: true })` (exported as `keypadStops`) and `landingAt(e, id) === 'fire'` |
| ride HUD (`explore.js`) | `ride.realSeconds ?? realRunSeconds(…)` (a copy of the run model) | P0a's `createElevatorRide(…, e.speed, { fire: isFireLift(e) }).realSeconds`; `realRunSeconds` removed |
| core renderers (`community.js` `liftLanding` / `landingDoors`, `residential-cores.js`) | `e.serves.includes(id)` / `e.fireOnly?.includes(id)` | P0a's `landingAt(e, id)` |
| stair renderer `stairBreak()` (`render/build/tower-stairs.js`) | P0a's `breakAt` if present, else its own mirrored default | P0a's `towerStairPlan(s).breakAt(id)` only (the same doors `applyStairBreaks()` writes into the stair room) |
| gate signs and pick cards (`access-gates.js`) | literal `火灾时自动释放` | P0a's `GATE_ALARM_TEXT` |

The two P0b tests that imported a removed copy now import P0a's function, with their assertions unchanged:
`ui-floor-rows.test.js` (`towerZones`; it also checks the rail's zone ids against it) and `lift-keypad.test.js`
(`liftRunSeconds`).

### Real P0a records in the P0b consumers

`tests/p0-merge-wiring.test.js` (new, 8 tests) drives the P0b consumers with records from the real P0a builders,
not with P0b's hand-written fixture:

- **Zones, real layout:** for all ten towers, the rail's zones equal P0a's. T1, T2, W1 and W2 read the `b.zones` that
  `applyTowerZones` publishes; H, A and R1–R4 get `towerZones()`. Ids, levels, names and home counts all match. Every
  own level's `lv.zone` names its rail zone. T1-LF's keypad groups use those zone ids.
- **P0a's synthetic gated tower** (`tests/fixtures/synthetic-tower.js`, built with `refugeLevel`,
  `applyStairBreaks`, `lift`, `gateRecord`), with `b.zones = towerZones(…)`:
  - **Rail and directory:** the 3F 避难层 is a hatched single row, there is a `避 3F` chip, and `towerFacts` counts 1 refuge floor.
  - **Keypad:** the passenger lift L1 has no refuge key. The fire lift LF (`role: 'fire'`) has the refuge key with
    the key confirm, and a `fireOnly` 1F key greyed `消防专用`. `liftLanding()` returns `'fire'` there.
  - **Ride:** LF's `speed: 4` gives `travel = Δy / 8`. The HUD time is P0a's `realSeconds` (fire acceleration 0.9).
  - **Refuge floor:** `buildRefugeFloor()` draws P0a's `refugePlan` (floor, pump room, hydrant, sign, 乙级 window
    frames) inside the plate and storey, at ≤ 3k vertices.
  - **Stair break:** `stairBreak()` returns exactly the doors and partition that `applyStairBreaks()` wrote, and the
    break level draws the second door, partition and exit sign.
  - **Gates:** `gateRecord` defaults (`entry` / `own`), `segmentGate({ role: 'exit' })` and `stairReentryGates()`
    drive the leaves (none for `existing`), the signs and the pick cards, all with `GATE_ALARM_TEXT`. All 16 real
    gates carry P0a's defaults and draw as before.
- **P0b's fixture** (`tests/fixtures/supertall-records.js`) passes P0a's validators: `refugeLevelErrors`,
  `checkRefugeStack`, `gateRecordErrors`, `LIFT_ROLES` and `ZONE_KINDS`. Its hand-written zones have the bands
  `towerZones()` derives. The two fixture files therefore cannot drift apart.

Before the hand-over edits this file had 6 of its first 7 tests green. The one failure was the rail's zone name for
H (`办理入住`, P0b's fallback, against P0a's `1F 云澜酒店 · 豪华迎宾大堂`). So the record shapes already agreed;
only the fallback switch was missing.

## Verification

| check | result |
|---|---|
| full suite | **604 / 604** (596 + 8 new), **224.6 s** at concurrency 3 on a quiet machine (SPEC ≤ 300 s); 112 test files |
| `fps-frozen` | green, and `tests/fps-frozen.test.js` is unchanged since `e6948b9`: the compact layout is byte-identical |
| expansion diff (`expansion-additive.test.js`) | green: with the additive keys stripped, all 33 record groups hash as at `e6948b9` (P0b changes no layout) |
| no-bypass harness (`no-bypass.test.js`) | green, all 4 tests: on the synthetic tower, and on T1 / T2 / W1 / W2 with gates closed and open, plus single-gate sensitivity |
| C-13 shared builders (`shared-builders.test.js`) | green |
| community resident geometry (`community-render.test.js`, 18 B/v) | **9.979 MB** (554,385 vertices) ≤ 10 MB; P0b alone measured 9.98 |
| nav (`nav-measure.mjs share`) | 21.7 MB retained, 0.95 s CPU, checksum −29770272 (as at `e6948b9`); 1,443 of 1,591 floors share a plan |
| `npm run build` | `dist/mall.html` 79,757,582 B (≤ 81 MB). It was built for the browser checks and then restored with `git checkout -- dist/`. **dist is not committed.** |

## Budgets (SPEC §2.3): one `perf/measure.cjs` run of the campus view

`VIEWS=campus NIGHT=campus`, quality `high`, swiftshader 1280 × 800, port 5403, under the campus browser lock. The
page is the merged `dist/mall.html`. Calls are main pass plus labels ("steady"). Triangles are the main pass. The
"before" column is P0b's re-measured `ea99c34` baseline.

| budget | `ea99c34` | P0b alone | **P0 merged** | rule | |
|---|---:|---:|---:|---|---|
| campus steady calls | 2,852 | 1,957 | **1,922 + 35 = 1,957** | ≤ 2,200 (ratchet) | ✓ |
| campus main triangles | 3.753 M | 2.511 M | **2.511 M** | ≤ 4.07 M | ✓ |
| campus shadow-refresh calls | 1,351 | 731 | **731** | | |
| frame with shadow refresh | 4,203 | 2,688 | **2,688** | ≤ 4,203 | ✓ |
| campus at night (steady) | 2,852 | 1,967 | **1,967** (+10: the far night layers) | | |
| scene geometry at load | 284.71 MB | 285.03 MB | **285.03 MB** | ≤ 286.8 MB | ✓ |
| JS heap at load | 526.6 MB | 550.2 / 531.2 MB | **544.5 MB** | ≤ 560 MB | ✓ |
| shader programs at load | 61 | 51 | **51** | ≤ 70 | ✓ |
| scene meshes / vertices at load | 11,296 / 14.49 M | 10,842 / 14.50 M | **10,842 / 14.50 M** | | |
| load (click → explore ready) | | | 9.1 s | | |
| page errors | | 0 | **0** | | |

The render numbers are identical to P0b's. P0a adds layout fields only (zones, gate role / leaf), and the hand-over
changes no geometry. The JS heap is within P0b's run-to-run range of 531–550 MB.

The other measured views (N1, R1, campusTall, river, viewdeck, P2 roof, 西苑 step) were not re-run here. Their P0b
figures are in `docs/supertall/p0b.md`, and P-int re-runs all views at the end.

## Shots

In `scratchpad/supertall-shots/p0/` (1280 × 800, port 5403):

- `p0-merged-campus.jpg`: the `measure.cjs` campus view. It matches `p0b-campus-after.jpg`.
- `p0-merged-campus-night.jpg`: the same view at night.
- `p0-merged-rail.jpg`: T1 with 16F focused. The rail rows come from P0a's `b.zones`: RF, 错层复式 14–24F · 12 户
  (open), 江景大平层 8–13F · 12 户, 7F 空中大堂, and the 一期 1–6F podium row. Chips: 顶 · 错层复式 · 江景大平 · 7F.
- `p0-merged-rail-R1.jpg`: R1 with 12F focused, with zones from P0a's `towerZones()` (no `b.zones`): RF,
  三户住宅 2–30F · 87 户, 1F, 地下.

## Notes for the tower packages

- **Zones:**
  - H, A and R1–R4 have no `b.zones` yet (P0a keeps them unzoned, because `p1-expansion-layout` compares them
    record by record with the compact layout). The rail derives theirs with `towerZones()`.
  - That default names a band from the level name (`三户住宅`, `十间套房`, and `五户住宅` for 西苑), while each
    floor row keeps its `theme.label` (`三种户型`, `独卫套房`, `3梯5户`).
  - Each package sets explicit `b.zones` with its own names (`低区 …` / `高区 …`). The rail, chips, keypad groups and
    directory then follow with no further edit.
- **API:**
  - Layout contracts: `docs/supertall/p0a.md`.
  - Render kits, far-LOD spec and UI: `docs/supertall/p0b.md` (updated for the names above).
  - The helpers to build on are P0a's `towerZones`, `isFireLift`, `liftStops`, `landingAt`, `createElevatorRide`,
    `towerStairPlan().breakAt`, `GATE_ALARM_TEXT`, `refugeLevel` and `checkRefugeStack`. Nothing in render or UI
    re-implements them now.
- **Seen in the shots, not caused by the merge:**
  - On desktop the building-tab grid at the top of the left panel draws over the first rows of a long floor rail
    once it is scrolled. The `ea99c34` build shows the same in the same shot (scratchpad `p0merge/shots/base-rail-T1.jpg`).
  - The pressed floor row in the zone rail shows blue text without the white pill the old rail had. P0b's
    `p0b-rail-T1.jpg` has the same.
  - Both are for P-int (`ui.js` / CSS).
