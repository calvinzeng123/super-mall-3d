# 云澜汇 · 超高层延伸 — engine, performance and UX scaling study

Study label `supertall/perf`, **revision 2**, 2026-11-05.

**What changed since revision 1 (14:54).**
- `DECISIONS.md` (16:04) fixed the scope:
  - 北苑 T1/T2 use north.md's **~150 m variant**;
  - 西苑 W1/W2 use west.md's **S47** (RF 145.5 m, crown ≈ 156.5 m);
  - R1–R4 go to **200 / 190 / 180 / 169 m crowns** (p2.md);
  - H and A follow **hotel-apt.md**: H RF 186.2 m with a mast at ≈ 200 m; A RF 174.6 m with a crown at ≈ 185 m.
- **hotel-apt.md now exists.** Revision 1 had to assume H/A as 56 instanced storeys. The hotel design instead uses a plan-independent curtain wall: 8 meshes and ≈ 27k vertices per tower.
- Everything was **re-prototyped at the decided heights** and **measured in the browser with M0 + M1 applied**. Revision 1 only estimated those. The 200 m-everywhere numbers from revision 1 are kept as a reference column.
- Two corrections to revision 1:
  - The overview's shadow radius is **380**, not 340 (`app.js:637`, `:883`). With it, **no shadow-frustum change is needed for height** (§4.6).
  - The default overview needs **no re-frame** at the decided heights (§7.6).

**Base.** `/home/user/super-mall-3d` at **`9bdb886`**, which only rebuilt `dist/`. Its `src/` is identical to `e7cfb42` and `f7a3655`. Both parallel workflows have already landed there:
- doors as layout records and nav obstacles;
- the 北苑 7F 空中大堂: 16 gates, 14 zones, `towerVisibility`, the floor-rail podium row and the tour steps.

This study builds on both and undoes neither.

**What was touched.** Nothing in the main checkout was edited or committed. The prototype ran in a detached worktree, `scratchpad/wt-perf2`, which has since been removed. Its source diff is `perf-calc/decided/prototype-decided.diff`.

**Companion designs**, all in this folder:
- `codes.md` (rules);
- `north.md` (北苑);
- `west.md` (西苑);
- `p2.md` (R1–R4);
- `hotel-apt.md` (H, A);
- `DECISIONS.md` (the user's choices; it overrides every default).

All paths below are relative to `/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/res/supertall/`.

---

## 0. Decisions on one page

1. **Land "M0 + M1" first. It is now measured, not estimated.** It changes no layout.
   - **M0:** R1–R4's per-storey shell clones become one `InstancedMesh` per material.
   - **M1:** a far LOD of 2 meshes beyond 600 m on all ten tall towers. R/H/A glass cars draw only for their own tower.
   - **Result at the decided heights:** campus main pass **2,817 → 1,921 calls**, triangles **3.75 → 2.51 M**, shadow refresh **1,351 → 730 calls**. Against `dc4951d`, the campus is −860 calls and −1.16 M triangles before any tower gets its new façade.
2. **Naive growth to the decided heights is not viable:**

   | measure | today | decided heights, no redesign | cap |
   |---|---:|---:|---:|
   | levels | 338 | 525 (measured) | |
   | campus main-pass calls | 2,817 | ≈ 3,187 (from the measured +5 calls per R storey) | 2,881 main (2,916 steady) |
   | campus main triangles | 3.752 M | ≈ 4.42 M | 4.07 M |
   | scene geometry | 284.7 MB | ≈ 307 MB | 286.8 MB |
   | community resident geometry | 9.94 MB | 14.44 MB (measured) | 10 MB |
   | nav heap | 50.7 MB | 80.8 MB (measured) | |

3. **One rendering rule, applied per tower as its design already proposes:**
   - 西苑: instanced storey modules (west.md §6.2);
   - 北苑: a plan-independent curtain wall merged up the tower (north.md §7.2);
   - R: shared instanced family templates (p2.md §7.2);
   - H/A: a merged curtain wall (hotel-apt.md §8).

   All ten towers get the `farSwap` far LOD at 600 m. **R also needs the mid tier**: the river view measured 4.44 M triangles with R, H and A still naive. The projection is ≈ 3.9 M without the mid tier (5 % under the cap) and ≈ 3.0 M with it. No texture façades: GPU textures are already 651 MB.
4. **Budgets: raise nothing.** Keep +50 calls, +0.40 M triangles, +15 MB geometry (all against `dc4951d`) and the community 10 MB. The projected final state sits well inside all four.
   - **Add** a ratchet (campus steady ≤ 2,200 once M0 + M1 land), an every-view cap, a ten-tower geometry cap of 14 MB, a JS-heap cap of 560 MB, a nav cap and a shader-program cap.
5. **Nav: share identical floor plans** (prototyped). At the decided heights the nav heap falls **80.8 → 23.5 MB**, against 50.7 MB today. Lazy nav per tower is unnecessary and stays a fallback.
6. **Per-frame costs that grow with levels:**
   - `updateMatrixWorld`: 1.28 → 1.92 ms per frame (Node model, desktop CPU). Fix: static objects get `matrixAutoUpdate = false`, which brings it to 0.43 ms;
   - one synchronous interior build per floor passed on a 50-floor ride. Fix: skip pass-floor builds in closed shafts.
7. **fps-frozen:** every H/A/R height change sits behind `expansion`. The H/A/R records are also in the compact layout: a naive `storeys` change moves its level count, measured in revision 1 at 198 → 362. M0 and M1 are render-only.
8. **Tests:** ≈ +15–20 s wall (236 → ≈ 250–256 s at concurrency 3). No change to the suite structure.
9. **UX: zones are data.**
   - Each tower publishes `b.zones` (product bands and lift banks, with refuge floors as separators). The floor rail, directory, lift keypad and search all read them.
   - The lift panel becomes a band-grouped keypad: the longest lift, R1-LF, has 55 stops.
   - Ride time follows the shared formula `Δy / (2 × speed)` with **Space** to skip, as agreed in north.md / west.md / hotel-apt.md.
   - Six tour steps need re-framing (§7.5). The default overview does not.
10. **Shadows:** height adds no frustum miss. W1/W2 (x ≈ −458) and R4 (river step) are outside **today**. Optional fix of that existing miss: overview r 380 → 410; campus steps refocused on (−60, 0, −90) at r 400.

| key number | today (measured) | decided, naive | decided + M0 + M1 + 西苑 instanced (**measured**) | **final design** (projection) |
|---|---:|---:|---:|---:|
| levels / unit records | 338 / 1,730 | 525 / 2,696 (hack, 3 homes per R floor) | 525 / 2,696 | ≈ 523 / ≈ 2,236 |
| campus main calls / steady (+ labels) | 2,817 / 2,852 | ≈ 3,187 / ≈ 3,220 | **1,921 / 1,954** | ≈ 1,930 / ≈ 1,965 |
| campus main triangles | 3.752 M | ≈ 4.42 M | **2.515 M** | ≈ 2.52 M |
| campus shadow-refresh calls | 1,351 | ≈ 1,650 | **730** | ≈ 730 |
| river view (all towers near): calls / triangles | — | — | **2,018 / 4.443 M ✗** | ≈ 1,920 / ≈ 3.9 M (≈ 3.0 M with the R mid tier) |
| N1 / R1 views, main calls | 1,312 / 2,833 | — | 1,361 / 2,050 | ≈ 1,330 / ≈ 2,050 |
| scene geometry at load | 284.7 MB | ≈ 307 MB | 300.8 MB ✗ | **≈ 264 MB** (260–268) |
| community resident (test ≤ 10 MB) | 9.94 MB | 14.44 MB | 8.69 MB (北苑 still naive) | ≈ 5.2 MB |
| ten towers, unique exterior (Node) | 28.8 MB | 46.1 MB | 40.6 MB | ≈ 10.8 MB |
| JS heap at load (Chromium) | 518 MB | — | 578 MB | ≈ 540 MB |
| scene meshes / shader programs | 11,284 / 61 | — | 14,430 / 67 | ≈ 14k / ≈ 67 |
| `buildNav` CPU / retained | 0.65–1.08 s / 50.7 MB | 0.95–1.14 s / 80.8 MB | 23.5 MB shared | ≈ 1.0 s / ≈ 22 MB |
| `buildLayout` CPU | 2.6–3.6 s | 2.7–3.6 s | | ≈ same |
| `dist/mall.html` | 79,694,194 B | | 79,699,124 B (+4.9 KB) | ≈ 80.2 MB (new plan data) |
| full test suite | 236 s | | | ≈ 250–256 s |

---

## 1. Method and caveats

- **Machine.** 4 CPUs, shared. During this revision another agent ran a swiftshader screenshot job (≈ 3 CPUs, load average 4.5–8).
  - Wall-clock times are noisy (±40 %), so layout and nav are also given as **CPU time** (`process.cpuUsage`), in fresh processes, interleaved, 3 rounds (`perf-calc/decided/cpu.txt`).
  - Draw calls, triangles, vertex counts and geometry bytes are deterministic. The JS heap is close to deterministic.
  - **Load time in this revision is not comparable**: 33.1 s, with two browsers running.
- **Node geometry** uses the `tests/community-render.test.js` method: unique `position` vertices × 18 B.
  - Community towers: `west-calc/geo.mjs`.
  - R, H, A: `p2-calc/r-render.mjs`.
  - Both ran on the baseline, the naive decided stack and the prototype.
- **Browser.** One run of `perf/measure.cjs` (HANDOFF §8 method; the copy `perf-calc/decided/browser/measure-st.cjs` adds a `VIEWS` override and a per-building split). It ran on port 5506 at `high`, swiftshader, 1280 × 800. The server and browser were closed afterwards.
  - **Views:**
    - campus V(110, 430, 480) → (0, 0, 0);
    - N1 (−150, 115, −380) → (−236, 55, −232);
    - R1 (260, 260, −760) → (−60, 0, −300);
    - **campusTall** (149, 641, 648) → (0, 60, 0), new: frames every crown;
    - **river** (−60, 40, −600) → (−40, 90, −220), new: R1–R3, A, H and 北苑 all inside 600 m.
  - **Baseline:** `scratchpad/merge/perf-after/after.json` (`f7a3655`, same `src/`, same method). It has no campusTall or river view.
- **The per-building split** is a sphere-frustum estimate that sums to more than the measured pass. It is used only for large per-tower deltas (§3.3).
- **"Final design" figures** are the measured prototype minus measured naive parts plus the designs' own estimates (±25 %). The derivation is in §3.4.

---

## 2. Baselines (measured at `9bdb886` = `e7cfb42` source)

### 2.1 Layout and nav

| | value | notes |
|---|---:|---|
| `buildLayout({expansion:true})` | **2.6–3.6 s CPU**, 2.3–2.5 s wall (this run); revision 1: 1.65–2.7 s wall | profile: `geom.convexOverlap` 0.68 s (garages / P1), GC 0.63 s, `community-units` doors 0.58 s |
| `buildLayout({expansion:false})` (compact FPS) | 0.84 s wall | |
| layout retained heap | **41.1 MB** | levels JSON 51.3 MB. R levels are 9.6 MB each in JSON: the shared GLB collision serialises per floor, though in the heap it is one object. |
| levels / buildings | **338** / 23 | P1 10, P2 7, P3 5, M 4, H 23, A 23, R1–R4 32 each, WPG 3, W1/W2 31 each, T1/T2 19 each, annexes 35 |
| elevators / stairs | 76 / 106 | |
| gates / zones | 16 / 14 | |
| `buildNav` | **0.65–0.97 s CPU** (this run), 0.84–1.08 s (revision 1) | GC 26 %, `indexWalls` 18 %, wall building 30 %, `pointInPoly` 6 % |
| nav retained heap | **50.7 MB** | |
| nav floors | 1,591 | 338 levels + 1,245 mezzanines (stair half-landings, duplex upper surfaces) + ground + 7 bridge |
| nav walls / obstacles / grid cells | 619,403 / 43,165 / 16,672 | **530k of the 619k walls are R**: GLB-measured collision of 3 homes per floor, ≈ 4,400 walls per storey |
| lift stops (longest) | 1,991 (R1-L1, 32) | |
| unique nav floor plans | **373 of 1,591**; 49k of 619k walls | `perf-calc/navshare.mjs` |

`buildNav` runs **lazily on the first explore entry** (`explore.js:59`), not at page load. Its cost is the hitch on pressing 进入漫游.

### 2.2 What scales with the level count

| subsystem | how it scales | today | decided (525 levels, measured) | verdict |
|---|---|---:|---:|---|
| `buildLayout` | per tower floor: units, doors (cached per plan), voids | 2.6–3.6 s CPU | 2.7–3.2 s CPU | OK. The cost is the mall and garages. |
| layout heap | levels × units | 41.1 MB | **58.2 MB** (levels JSON 83.1 MB) | OK. p2.md's 2 homes per R floor takes ≈ −4 MB. |
| `buildNav` | linear in walls; R dominates | 0.65–0.97 s CPU | 0.95–1.14 s CPU | OK; sharing (§6.1) cuts heap and GC |
| nav heap | walls + grid | 50.7 MB | **80.8 MB → 23.5 MB with sharing** | fix (§6.1) |
| nav floors / walls | | 1,591 / 619k | 2,172 / 1,036k (R 868k) | design ≈ 750k walls (2 homes per R floor) |
| stair builders (`tower-stairs.js`): merged enclosures, lazy instanced flights per storey-height bucket | enclosures linear in vertices, flights constant | — | — | OK. Refuge floors add 2 buckets (4.5 and 5.4 m). |
| elevator builders (`tower-elevators.js`): 7 meshes per car; landing doors one `InstancedMesh` per tower | cars per lift | 76 lifts | **108 lifts** (+6 W, +2 T, +8 R, +11 H, +5 A) | OK if cars are hidden outside their tower (M1, measured) |
| explore floor change (`updateVisibility`, `applyExploreVisibility`) | O(levels) | 338 | 525 | OK (< 1 ms) |
| nav floor switching (`step`, portals, slopes) | per floor, constant | 68 µs per step | 68 µs | OK |
| `linksNear`, every frame | O(all stops) | 13.5 µs | 14.7 µs (2,779 stops) | OK; index by floor for phones (§6.5) |
| lift ride: `passFloor` → `app.refresh()` → `ensureTowerFloor` | **one synchronous interior build per floor passed** | ≤ 31 floors | ≤ 54 floors (R1-LF) | **risk on phones** (§6.4) |
| lift prompt (`options()`) | one button per stop | 31 | **54** at an R1 landing | keypad (§7.3) |
| floor rail (`floorRows`) | one row per level | 32 rows (R1) | 55 (R1), 52 (H), 50 (W), 47 (A), 30 (T1) | zone grouping (§7.1) |
| directory: level list, unit search | rows per level; search O(units) | 1,730 units | ≈ 2,236 units | search OK (< 2 ms); list grouped |
| scene graph: 8 `Group`s per level plus pick boxes; `updateMatrixWorld` every frame | linear in objects | 11,284 meshes | **14,430** (prototype) | fix (§6.3) |
| shader programs | per material × define set | 61 | **67** (instancing variants) | compile hitch; cap (§5) |

### 2.3 Page load and bundle

- **`dist/mall.html` = 79,694,194 B.** The prototype is 79,699,124 B (+4.9 KB of code).
  - Levels are generated at run time, so storeys cost no bundle bytes. Only new home plans do:
    - north.md's 150 m variant: ≈ +0.3–0.4 MB of `community-plan-data.js`;
    - 西苑 families B–C: ≈ +0.1–0.2 MB;
    - R, H and A reuse their GLB and suite plans (R penthouses ≈ +0.05 MB).
  - Projected ≈ **80.2 MB**.
- **Load** (`goto` → `__mall.explore` ready):
  - baseline (`f7a3655`, loaded machine): 19.6 s;
  - revision 1's 200 m stretch: 26.4 s;
  - this prototype: 33.1 s, with a second swiftshader browser on the machine (load average 7.5);
  - RESULT.md's quiet-machine figure: 13.8 s median.

  **Needs a quiet-machine A/B before M2** (open question Q7). The layout part is +0.3 s CPU at most.
- **JS heap at load:** 518 MB today, **578 MB** in the prototype. The CPU-side geometry arrays live until upload: the naive H/A/R/北苑 near geometry is still in, and the layout adds +17 MB. After the five views it is 411 MB (340 MB after three views today). The iOS tab-kill threshold is ≈ 1–1.5 GB.

### 2.4 Test suite

- **Latest full run:** `scratchpad/merge/suite1.log`, 519 tests, concurrency 3: **235.6 s wall**, 10 min 45 s CPU. The test bodies sum to 460 s (`perf-calc/testfiles.mjs`).
- **Fixed cost per file:** each of the 53 files that build a layout pays layout + nav at import, ≈ 2.5–4 s CPU.
- **Critical path:** `mall-stairs.test.js`, 126 s. It covers the malls only and does not scale with towers.
- **Tower-dependent bodies, ≈ 60 s:**
  - `residence-access` 14.9 s: all 728 H/A/R units walked;
  - `residential-integration` 7.2 s;
  - `residential-access` 5.5 s;
  - `community-doors` 4.8 s;
  - `hospitality` 3.7 s;
  - `tower-stairs` 3.7 s;
  - `west-garden` 3.6 s;
  - `community-render` 2.5 s;
  - `riverside-integration` 2.4 s;
  - `north-render` 2.1 s;
  - `hospitality-lobby` and `hospitality-relocation`, ≈ 4 s together.

### 2.5 Exterior cost per tower type, per storey (Node, the test method, 18 B per vertex)

| tower | levels today | exterior today | **per added storey (today's builder)** | triangles per storey | meshes (≈ browser calls) | how it is built |
|---|---:|---:|---:|---:|---|---|
| 西苑 W1/W2 | 31 | 125.4k v (2.81 / 2.90 MB with lobby and B1/B2) | **4,083 v = 73.5 kB** | 1,337 | 8 (10) near; far LOD 2 meshes / 616 triangles beyond 600 m | per-material batches; per-plan windows grow per storey |
| 北苑 T1/T2 | 19 | 81.6k / 81.3k v (1.72 / 1.63 MB) | **4,165 v = 75 kB** | 1,388 | 8 (10); no far LOD | same; every floor's plan is unique |
| R1–R4 | 32 | 163.7k unique v (2.95 MB); lobby 0.62 + roof 0.08 MB | **3,888 v = 70 kB** unique | **6,648 drawn** | 129 visible + lobby 19 + roof 5 + 2 glass cars ≈ **206 calls in the campus view** | `template.clone()` per storey: **+4 meshes = +5 calls per storey** (measured slope 4.96) |
| H 云澜酒店 | 23 | 211.1k v (3.80 MB) + ground 236.5k (4.26 MB) | **8,604 v = 155 kB** | 2,868 | 18 | merged per material |
| A 服务公寓 | 23 | 184.0k v (3.31 MB) + ground 238.6k (4.30 MB) | **7,164 v = 129 kB** | 2,388 | 18 | merged per material |

All ten tall towers today: unique exterior ≈ 9.94 (community, with lobbies and site) + 11.8 (R) + 7.1 (H/A) = **28.8 MB**.

---

## 3. Prototypes

### 3.1 The hack (`perf-calc/decided/prototype-decided.diff`)

Environment switches (a `globalThis.__PROTO_ENV` shim serves the browser build):

| switch | effect | against the design |
|---|---|---|
| `WEST_STACK=S47` | west.md's stack: 1F–47F + RF, refuge floors 16F / 31F; 50 levels per tower | exact |
| `NORTH_STACK=150` | 25–33F at 3.9 m and 34–35F at 3.3 m above today's 24F, RF 138.6 m, 30 levels per tower. Homes are copied from the 14–24F band. | T2 should be 2 storeys lower; the 10F / 24F refuge storeys are not modelled |
| `R_STOREYS=53,50,47,44` | 55 / 52 / 49 / 46 levels, still 3 homes per floor | p2.md: 2 homes per floor plus 3 refuge levels |
| `HA_STOREYS=49,44` | H 52 levels, A 47 levels, today's floor builder | level counts exact. Tops are 13–16 m low because refuge and public storeys are taller in the design. |
| `WEST_INSTANCE=1 WEST_FAMILIES=1` | west.md's instanced floor modules | as designed |
| **`R_INSTANCE=1`** (new) | **M0**: one `InstancedMesh` per template material per R tower. The detail floor is hidden by a zero-scale instance matrix. | as p2.md §7.6 |
| **`FAR_ALL=1`** (new) | **M1**: `farSwap` + `farFacade` from `community.js` on 北苑, R, H and A. The R/H/A 1F lobby and roof garden toggle with the near branch. R/H/A lift cars draw only for their own tower. | stand-ins are the 西苑 generator, not each design's |
| `NAV_SHARE=1` | hash-and-verify plan sharing in `buildNav` (§6.1) | as proposed |

Total: **525 levels** (the design has ≈ 523) and 2,696 unit records (the design has ≈ 2,236).

### 3.2 Node results

| | today | decided, naive | decided + 西苑 instanced + far LODs (+ M0 for R) | final design (designs' own figures) |
|---|---:|---:|---:|---:|
| levels | 338 | 525 | 525 | ≈ 523 |
| `buildLayout` CPU (6 runs each) | 2.62–3.63 s | 2.69–3.55 s | — | ≈ same |
| layout heap / levels JSON | 41.1 / 51.3 MB | 58.2 / 83.1 MB | — | ≈ 54 / ≈ 61 MB (R at 2 homes per floor: −21 MB JSON; H/A at 8 suites: −1.5 MB) |
| `buildNav` CPU | 0.65–0.97 s | 0.95–1.14 s | 1.27–1.54 s with share (noise; see §6.1) | ≈ 1.0 s |
| nav heap | 50.7 MB | 80.8 MB | **23.5 MB** with share | ≈ 22 MB |
| nav floors / walls / stops (longest) | 1,591 / 619k / 1,991 (32) | 2,172 / 1,036k / 2,779 (55) | — | ≈ 2,170 / ≈ 750k / ≈ 2,900 (55, R1-LF) |
| **community resident** (test ≤ 10 MB) | **9.94 MB** | **14.44 MB** ✗ | **8.69 MB** (西苑 2.57, 北苑 naive 5.25 incl. far, site 0.87) | **≈ 5.2 MB** |
| W1 exterior / meshes / far triangles | 125k v / 8 / 616 | 203k v / 8 / 1,088 | 38.1k v / 41 / 1,088 | + lit windows, louvres, crown (+0.34 MB for both) |
| T1 exterior / meshes / far | 81.6k v / 8 / — | 129.6k v / 8 / — | 134.7k v (incl. far 5.1k v) / 8 + 2 / 1,698 | ≈ 32k v / 8 + 2 / ≤ 1,500 (north.md curtain wall) |
| R1 meshes / unique / triangles drawn | 131 / 2.95 MB / 202k | 223 / 4.56 MB / 355k | **21** / 4.60 MB / 355k | ≈ 41 / 0.78 + shared 1.05 MB / ≈ 280k |
| R1–R4 unique exterior | 11.8 MB | 16.96 MB | 17.13 MB | ≈ 4.2 MB |
| H / A exterior | 3.80 / 3.31 MB, 18 meshes | 8.29 / 6.41 MB, 18 meshes | 8.33 / 6.45 MB, 20 meshes (+2 far) | 0.73 / 0.69 MB, 8 + 2 meshes |
| H / A 1F lobby (resident) | 4.26 / 4.30 MB | same | same | ≈ 4.9 MB for both |
| **ten towers, unique exterior** | **28.8 MB** | **46.1 MB** | 40.6 MB | **≈ 10.8 MB** |

**Why the prototype is still heavy.** M0 removes calls, not bytes: the clones already shared one geometry. The bytes go away only with each design's new builder.
- R's per-storey direct geometry is 3,888 v per storey; p2.md instances its T-common template.
- H/A's merged punched windows are 8,604 / 7,164 v per storey; hotel-apt.md replaces them with a curtain wall merged up the tower.
- 北苑's per-plan windows are 4,165 v per storey; north.md replaces them with a curtain wall.

### 3.3 Browser results (one run, port 5506)

| view | | today (`f7a3655`) | 200 m everywhere, naive (rev. 1) | **decided + M0 + M1 + 西苑 instanced (measured)** | Δ against today |
|---|---|---:|---:|---:|---:|
| **campus** | main calls / triangles | 2,817 / 3.752 M | 3,273 / 4.693 M | **1,921 / 2.515 M** | **−896 / −1.237 M** |
| | labels | 35 | 33 | 33 | |
| | shadow refresh: calls / triangles | 1,351 / 3.095 M | 1,719 / 3.919 M | **730 / 1.991 M** | −621 / −1.10 M |
| | frame with shadow refresh | 4,203 | 5,025 | 2,684 | −1,519 |
| **N1** (北苑 close, 西苑 290–350 m) | main calls / triangles | 1,312 / 2.418 M | 1,306 / 2.730 M | 1,361 / 2.596 M | +49 / +0.18 M |
| | shadow refresh | 1,357 | 1,725 | 928 | −429 |
| **R1** (≈ 560–600 m from R) | main calls / triangles | 2,833 / 3.747 M | 3,286 / 4.684 M | 2,050 / 3.583 M | −783 / −0.16 M |
| **campusTall** (new, every crown in frame) | main calls / triangles | — | — | 1,994 / 2.587 M | |
| **river** (new, R1–R3, H, A, 北苑 near) | main calls / triangles | — | — | 2,018 / **4.443 M** | over the 4.07 M cap |
| | shadow refresh | — | — | 928 / 3.852 M | |
| memory | scene geometry at load | 284.67 MB | 317.94 MB | 300.82 MB | +16.2 MB (cap +2.1 against today) |
| | GPU buffers after the views | 160.5 MB | 191.3 MB | 179.5 MB | |
| | scene meshes / vertices | 11,284 / — | 17,025 / 16.0 M | 14,430 / 15.2 M | |
| | JS heap at load / after the views | 518 / 340 MB | 616 / 371 MB | 578 / 411 MB (5 views) | |
| | GPU textures / programs | 650 MB / 61 | 650 MB / 61 | 651 MB / **67** | +6 programs |
| load | `goto` → explore ready | 19.6 s | 26.4 s | 33.1 s (two browsers on the machine) | not comparable |

**Where the campus savings come from** (per-building split, approximate):
- R1–R4 drop from ≈ 206 calls each today (321–331 in the 200 m naive run) to ≈ 13–23. 2 of those are the stand-in.
  - The split puts the rest (≈ 20 per tower, also ≈ 21–25 for 北苑 / 西苑 / H / A) in groups outside the LOD branch: the 1F / RF / B-level shells that orbit shows as "common" levels.
  - Moving them into the near branch could save a further ≈ 150–200 campus calls. That is an estimate from the approximate split; verify it before relying on it (M1b, §4.1).
- H and A drop from 58 / 57 today to 24 each.
- 西苑 keeps its existing far LOD.
- In the near views, H and A still cost 64 / 63 calls and 212k / 179k triangles each, and R1–R3 cost 62 calls and 327–367k triangles each. Those are exactly the parts the designs replace.

Screenshots are in `perf-calc/decided/browser/out/decided-{campus,N1,R1,campusTall,river}.jpg`.

### 3.4 From the prototype to the final design

| item | campus | river view triangles | scene geometry (Node MB × 1.10 bytes ratio¹) |
|---|---:|---:|---:|
| measured prototype | 1,921 calls / 2.515 M | 4.443 M | 300.8 MB |
| H, A: naive exterior → curtain wall (8.33 + 6.45 → 0.73 + 0.69 MB) | far: 0 | −0.27 M (212k + 179k → ≈ 60k each, with lobbies) | −14.6 MB |
| H, A: 1F lobbies 8.55 → ≈ 4.9 MB (hotel-apt §8.2) | 0 | (included above) | −4.0 MB |
| R: 3-home naive direct + shells → p2 templates (17.1 → 4.2 MB) | 0 | −0.25 M (R1–R3: 280 / 265 / 250k) | −14.2 MB |
| 北苑: per-plan windows → curtain wall (5.25 → ≈ 1.45 MB) | 0 | −0.06 M | −4.2 MB |
| 西苑: lit windows, louvres, crown | 0 | +0.01 M | +0.4 MB |
| new gates (+15), hardstands, refuge-floor signs | +0–10 calls | | +0.3 MB |
| **final design** | **≈ 1,930 calls / 2.52 M** | **≈ 3.87 M** (no mid tier) / **≈ 3.0 M** (R mid tier, §4.4) | **≈ 264 MB** (260–268) |

¹ Measured browser bytes per vertex in the prototype: 300.8 MB / 15.24 M vertices = 19.7 B (indices included), against the test's 18 B.

---

## 4. Rendering strategies

### 4.1 Order of work

| step | what | campus main calls | status |
|---|---|---:|---|
| **M0** | R: the 29 per-storey shell clones become one `InstancedMesh` per material per tower. The detail floor hides by a zero-scale matrix (`level → index` map, as p2.md §7.2). | ≈ 2,257 today (−560) | prototyped |
| **M1** | far LOD (600 m, `farSwap`, 5 % hysteresis) on R1–R4, T1/T2, H, A. The R/H/A lobby and roof groups toggle with the near branch. R/H/A cars draw only for their own tower. | **1,921 at the decided heights** (measured) | prototyped |
| M1b (optional) | the 1F / RF / B-level shell groups of far towers join the near branch | ≈ −150–200 (unverified estimate) | idea |
| **M2** | each tower's supertall builder: west.md instanced modules, north.md curtain wall, p2.md templates, hotel-apt.md curtain wall. Each brings its own far stand-in. | ≈ 1,930 | design |
| **M3** | R mid tier (350–600 m) | campus 0; river −0.85 M triangles | design |

- **M0 and M1 change no layout.** fps-frozen and every layout test stay green. They are independently shippable, and M1 alone is worth −600 calls against HEAD.
- **Land M0 + M1 before any supertall layout**, then measure each M2 tower against the lower floor they create.

### 4.2 Instanced storey modules (西苑, R)

**Mechanism.** It is the west prototype, generalised:
- For each **module key** (plan family × storey height), the direct geometry of its first floor goes into its own `BatchSet`.
- `flush` it, then wrap each output mesh in an `InstancedMesh` with one instance per floor: matrix = tower frame × `elev`.
- Storey-high walls (piers, pilasters, core walls) stay in `Columns` and merge into tower-tall boxes. That keeps the drawn triangles equal to the naive build; walls inside the module raised west's triangles from 85k to 126k.

**Materials: the "black instance" rule.**
- A vertex-colour batch material draws black on geometry without a `color` attribute. That is why `landingDoors()` clones a plain steel material.
- **Module geometry must come from `BatchSet.flush`**, which writes `color`. Then the shared batch materials work unchanged. The M0 prototype does exactly this and draws correctly (`decided-campus.jpg`, `decided-river.jpg`).
- **Anything instanced from a primitive** (a `BoxGeometry` mullion, louvre blade, rescue-window mark or light fitting) needs a `vertexColors = false` clone with `color` set. For a per-instance tint, use `setColorAt`.
- The clone keeps the tower's own `clippingPlanes` (the landingDoors pattern), so the floor cutaway still cuts instances.
- **Test:** every `InstancedMesh` whose material has `vertexColors` must have `geometry.attributes.color`.

**Shader programs.** Instancing compiles a second program variant per material: 61 → 67 in the prototype. Keep the existing warm-up (`debugShot` steps / `renderer.compile`) and cap programs (§5).

**Night windows** cannot vary per instance through vertex colours. Two options:
- keep `glowSoft` per floor in the merged batch (west.md: +0.12 MB per tower);
- or use 3 glow variants hashed by level, each its own `InstancedMesh` (+3 calls near, ≈ 0 MB).

This is open question Q3.

**`THREE.BatchedMesh`** (r170) could bring a tower to ≈ 9 calls. Without `WEBGL_multi_draw` (Firefox, some Android drivers) it degrades to one call per instance. Use it only behind a capability check. The budgets do not need it.

### 4.3 Merged identical floors: when to merge, when to instance, when to drop the plan

| | merge (today's H/A, 西苑 batches) | instance (西苑, R) | plan-independent curtain wall (北苑, H, A) |
|---|---|---|---|
| draw calls | 1 per material | 1 per material per module | 1 per material |
| memory | **linear in storeys** (H: 155 kB per storey) | **constant** + 64 B per instance | ≈ 430 v per storey (spandrels, slabs, lit panes); mullions and glass merge vertically |
| triangles drawn | same | same | **far fewer** (H: 148k → ≈ 9k) |
| fits | unique floors: crowns, lobbies, refuge bands | storeys that repeat ≥ 3 times with punched windows | glass towers where the plan need not show outside |

**Rule:**
- merge the unique and vertical parts;
- instance repeated punched-window storeys;
- use a curtain wall where the product is a glass tower (each design already chose).
- Never `template.clone()` per storey (today's R): that is linear calls with constant memory, the worst of both.

### 4.4 LOD tiers for all ten towers

| tier | distance (tower centre, 5 % hysteresis) | content | towers |
|---|---|---|---|
| near | < 350 m (R) / < 600 m (others) | full exterior: modules or curtain wall, merged unique parts, lobby, roof, lift cars | all |
| **mid** | 350–600 m | 3 meshes (`facadePlaster` + `facadeWindow` + `glassTint`), ≤ 8k triangles: per-family glazing strips, balcony and enclosure glass as boxes, refuge bands, belt diagonals, crown | **R1–R4 only** |
| far | ≥ 600 m | `farFacade`-style stand-in, 2 meshes, ≤ 2,000 triangles | all ten |

**Why 600 m stays right for 150–200 m towers.**
- The stand-ins reproduce **per-storey** bands, so their error is per storey: balcony depth and mullions, not the silhouette.
- A 3.0–3.4 m storey spans 5.2 px at 600 m and 4.0 px at 780 m (campus) on an 800 px-high viewport. That is independent of tower height.

**Why a mid tier for R only.**
- p2.md's near R is ≈ 280k triangles per tower, against ≈ 9–15k for the H/A/北苑 curtain walls and ≈ 66k for 西苑.
- The river view (R1–R3 at 400–455 m) measured **4.443 M** triangles. After M2 it is ≈ 3.87 M, 5 % under the cap. The 星湾桥, P2-roof and P1-RF views put R in the same band.
- The mid tier takes those views to ≈ 3.0 M, at ≈ 6–10 px per storey.
- Gate it on a browser comparison like the 西苑 one: mean tower-pixel colour within ≈ 10 levels (RESULT.md).

**H/A need no mid tier.** hotel-apt.md's near exterior is ≈ 9k triangles. The 1F lobbies (≈ 40k each) are the near cost, and M1 already hides them beyond 600 m.

**Shadow pass.** `farSwap` decides with the main camera, and the shadow pass reuses that choice. Measured: campus shadow refresh 1,351 → 730 calls.

**Lift cars.** The new cores are closed (all ten towers after M2). Cars draw only while their tower is selected, entered or ridden; this is the community rule in `towerVisibility`, extended in the prototype with one condition. hotel-apt.md's 20 cars become one `InstancedMesh` per material per tower.

**Far stand-in content** must carry the refuge bands and the crown silhouette, or the 0.5 m silhouette test fails by 10–13 m. Measured stand-in cost at the decided heights:
- 西苑 S47: 1,088 triangles;
- 北苑 with today's per-plan generator: 1,698. north.md's curtain-wall stand-in is ≈ 2.5k v, fewer triangles;
- R: ≈ 1.2–1.7k;
- H/A (hotel-apt.md prototype): 340 / 304.

### 4.5 Texture-based façade beyond some distance: not now

- **Saving:** a tiling window texture on the stand-ins would cut each from ≈ 1–1.7k to ≈ 100 triangles. That is ≈ 12k triangles for ten towers, 0.5 % of the 2.5 M campus frame. Calls are unchanged.
- **Cost:**
  - one 512² RGBA texture with mips is 1.4 MB, a per-type 1024² atlas 5.6 MB, on top of GPU textures that are already **651 MB**. On phones memory is the risk, not triangles;
  - a new shader program;
  - it breaks the vertex-colour night switch.
- **Keep as an option for `viewCity` only** (eye at 2,450 m). There the ten stand-ins could also merge into one 2-material mesh (−18 calls).

### 4.6 Shadow camera, far clip, fog

**Shadow frustum.** `env.setShadowFocus`: ortho ±r, sun distance 2r + 260, far 4r + 600. The overview and the 园区 steps use **r = 380** (`app.js:637`, `:883`, `tour.js:86/116`). Revision 1 used 340 for the overview, which was wrong.

Light-space test of crown tops and bases at the decided heights (`perf-calc/decided/shadow-split.txt`, `shadow-focus.txt`):

| focus | r | outside today | outside at the decided heights | cause |
|---|---:|---|---|---|
| overview (−90, 30, −35) | 380 | W1 | W1 | footprint (x −458), not height |
| 园区 steps (0, 0, 0) | 380 | W1, W2 | W1, W2 | footprint |
| river step (−120, 14, −300) | 320 | R4 | R4 | footprint |
| 北苑 / 西苑 / 对岸 steps | 180 / 180 / 220 | other groups only | same | by design (close-ups) |

- **Height adds no frustum miss.** No change is required for the supertall work.
- **Optional fix of the existing misses:**
  - overview r 380 → **410** (texel 0.19 → 0.20 m at 4096);
  - 园区 steps: focus **(−60, 0, −90)** at r **400** (all ten in; texel 0.20 m);
  - river step r 320 → **360**.
- Depth: far = 4r + 600 ≥ 2,120 m covers 200 m anywhere in the box. `low` has no shadows.
- **Far clip** 12,000 m and **near** (dynamic, `distance / 120`, 0.3–4 m): no change.
- **Fog** `Fog(900, 3000)` plus altitude: towers at 600–1,000 m from eye-level river views get 0–5 % fog, so the 600 m swap happens in clear air. No change. Do not use fog to hide LOD: it greys out the staggered skyline the user asked for (DECISIONS §4).

### 4.7 Expected totals

| | `dc4951d` | HEAD | decided, naive | **M0 + M1 (measured)** | **+ M2 (projected)** | + M3 (projected) |
|---|---:|---:|---:|---:|---:|---:|
| campus main calls | 2,781 | 2,817 | ≈ 3,187 | **1,921** | ≈ 1,930 | ≈ 1,930 |
| campus steady (+ labels) | 2,866 | 2,852 | ≈ 3,220 | **1,954** | ≈ 1,965 | ≈ 1,965 |
| campus main triangles | 3.672 M | 3.752 M | ≈ 4.42 M | **2.515 M** | ≈ 2.52 M | ≈ 2.52 M |
| campus frame with shadow refresh | 4,185 | 4,203 | ≈ 4,870 | **2,684** | ≈ 2,700 | ≈ 2,700 |
| river view main triangles | — | — | — | **4.443 M** | ≈ 3.87 M | ≈ 3.0 M |
| N1 main calls / triangles | — | 1,312 / 2.42 M | — | 1,361 / 2.60 M | ≈ 1,330 / ≈ 2.3 M | same |
| scene geometry at load | 271.8 MB | 284.7 MB | ≈ 307 MB | 300.8 MB | **≈ 264 MB** | ≈ 264 MB |
| JS heap at load | — | 518 MB | — | 578 MB | ≈ 540 MB | ≈ 540 MB |

Projections are ±15 % on calls and ±25 % on triangles and bytes. Re-measure each M2 tower with `measure.cjs`, including the **campusTall** and **river** views, plus a P1-RF viewdeck view and the P2 roof.

---

## 5. Budget proposals

**The principle: no campus budget is raised.** M0 + M1 pay for the whole programme. They are measured: −896 calls and −1.24 M triangles in the campus view. Phones get faster, not slower. The new caps go where tall towers bite: near views, heap, nav and per-tower bytes.

| budget | today's rule | today | prototype (measured) | final (projected) | **proposal** | why |
|---|---|---:|---:|---:|---|---|
| campus steady draw calls | ≤ `dc4951d` + 50 = 2,916 | 2,852 | 1,954 | ≈ 1,965 | **keep**; add a **ratchet: ≤ 2,200 steady** once M0 + M1 land | The ratchet stops unrelated work from spending the freed ≈ 900 calls. 2,200 leaves ≈ 235 for the supertall details and future work. |
| campus main triangles | ≤ +0.40 M (4.07 M) | 3.752 M | 2.515 M | ≈ 2.52 M | **keep** | |
| scene geometry at load | ≤ +15 MB (286.8 MB) | 284.7 MB | 300.8 MB ✗ | ≈ 264 MB | **keep**. Gate each M2 tower on it. | The prototype shows that M0 + M1 alone are not enough: M0 removes calls, not bytes. |
| community resident (`community-render.test.js`) | ≤ 10 MB at 18 B per vertex | 9.94 MB | 8.69 MB | ≈ 5.2 MB | **keep 10 MB** | Instancing counts unique geometry once. Do not raise a byte cap because instancing saves GPU cost: bytes are the phone risk. |
| **new:** ten tall towers' unique exterior (Node test) | — | 28.8 MB | 40.6 MB | ≈ 10.8 MB | **≤ 14 MB** | 30 % headroom over the projection; catches a tower that skips its M2 builder |
| **new:** every measured view (campus, N1, R1, campusTall, river, plus P1-RF viewdeck, P2 roof, 西苑 tour step) | — | campus only | river 4.443 M ✗ | river ≈ 3.87 M | **each ≤ 2,916 steady calls and ≤ 4.07 M main triangles** | The campus worst case runs on phones today, so no view may exceed it. Near views are where tall towers bite. |
| campus frame with shadow refresh | none (+73 noted) | 4,203 | 2,684 | ≈ 2,700 | **≤ 4,203** | |
| **new:** JS heap at load (Chromium) | — | 518 MB | 578 MB ✗ | ≈ 540 MB | **≤ 560 MB** | iOS tab kill at ≈ 1–1.5 GB; the load peak is CPU-side arrays before upload |
| **new:** nav build (Node test) | — | 0.65–1.08 s CPU / 50.7 MB | 23.5 MB shared | ≈ 1.0 s / ≈ 22 MB | **≤ 1.5 s CPU and ≤ 40 MB retained** | Unshared, the decided stack is 80.8 MB |
| **new:** shader programs | — | 61 | 67 | ≈ 67–69 | **≤ 70** | each new program is a first-frame compile hitch on phones |
| far LOD per tower | ≤ 2 meshes, ≤ 1,500 triangles (西苑 test) | 616 | 1,088 (西苑), 1,698 (北苑, today's generator) | ≤ 1,500 | **≤ 2 meshes, ≤ 2,000 triangles, all ten towers**; 西苑 may keep 1,500 | The only raise. It is a uniform rule, so 北苑's or R's stand-in may carry crown detail. |
| **new:** mid LOD (R) | — | — | — | — | **≤ 3 meshes, ≤ 8k triangles** | |
| **new:** near exterior per tower | — | W/T 8, R 129, H/A 18 meshes | R 21, W 41 | ≤ 45 | **≤ 45 meshes** | west.md 41, p2.md ≈ 41, H/A 8 |
| `dist/mall.html` | — | 79.69 MB | 79.70 MB | ≈ 80.2 MB | **≤ 81 MB** | plan data only |
| full test suite (concurrency 3) | ≈ 4–5 min | 236 s | — | ≈ 250–256 s | **≤ 300 s** | |

**Why nothing is raised, given that this runs on phones.** The `low` tier keeps every draw call: the crowd is instanced, and only shadows and bloom go. The campus draw-call cap is therefore effectively the phone cap. Spending part of the M0 + M1 saving on near-view instancing is fine; spending it on raising the cap is not.

---

## 6. Engine changes

### 6.1 Nav plan sharing (prototyped)

- **Change.** In `buildNav`, before `indexWalls`, hash each floor's walls and obstacles (numeric, rounded to 1 mm, gate flag included), then verify element by element. A match shares the first floor's `walls`, `obstacles` and `grid`.
  - Pieces, portals, zones, slopes and `y` stay per floor.
  - Gate walls carry their gate state, so gated floors only match floors with the same gate.
- **Measured:**

  | | floors shared | nav heap | nav CPU |
  |---|---:|---:|---:|
  | today (338 levels; rev. 1) | 1,443 of 1,591 | 50.7 → **21.7 MB** | 0.84–1.08 → 0.84–0.85 s |
  | 200 m stretch (614; rev. 1) | 2,289 of 2,439 | 92.9 → 24.1 MB | 1.55–1.67 → 1.37–1.57 s |
  | **decided (525)** | — | **80.8 → 23.5 MB** | 0.95–1.14 → 1.27–1.54 s ² |

  ² Measured under load average 4.6–5.4 with another browser running. The hash pass costs ≈ 0.1 s, and the earlier quiet-ish run showed a net saving. Treat CPU as ±0.3 s.
- **Correctness:** the smoke checksum is identical with and without sharing (every lift stop walked 1 m out, 970 / 1,614 walks; revision 1).
- **Next step: no wall building for repeats.** The layout tags each typical storey with `lv.navPlan = '<tower>-<module>'`, the same key as the render module. `buildNav` then builds walls once per key and copies only the per-floor records.
  - Estimate: nav CPU −30–40 %, because wall building is ≈ 30 % and GC 26 %.
  - Guard: a test that builds both ways and compares wall sets per floor.
- **Cost:** `nav.js` plus one test. `step`, `clearAt` and `wallsNear` are unchanged: they already read `F.walls` and `F.grid` by reference.

### 6.2 Lazy nav per tower (fallback; not recommended)

If heap ever forces it:
- create tower floors above the lobby on first approach: explore within 60 m, or a lift or stair choice into the tower;
- `links[].stops` keep `{floor, x, z}`, and `stopAt` runs on first use;
- `jump` / `teleport` / `spawn` call `ensureNavFloor(id)`.

It touches `linksNear`, `spawn`, `levelSpawn`, `unitSpawn`, `floorLabel` and the AI walkers. With §6.1 the eager build is 23.5 MB, so it is not worth the risk.

### 6.3 Level registration and per-frame object cost

- **Per level, `app.js` registers:**
  - 8 `Group`s;
  - 3 `BatchSet`s;
  - 2 `SignBatch`es (not for towers);
  - a pick box per unit rect, room and feature (`pickBox`, `matrixAutoUpdate` on).
- **Measured** (Node model at the browser's object counts, `perf-calc/decided/matrix-decided.txt`): three runs `scene.updateMatrixWorld()` every frame over every object, visible or not.

  | scene | objects | per frame | with `matrixAutoUpdate = false` |
  |---|---:|---:|---:|
  | today | 13,988 | 1.28 ms | 0.43 ms |
  | decided prototype | 18,630 | **1.92 ms** | 0.43 ms |
  | 200 m naive (rev. 1) | 21,937 | 2.15 ms | 0.46 ms |

  On a phone multiply by about 3–5: ≈ 6–10 ms of a 16.7 ms frame at the decided heights.
- **Change:**
  - `pickBox` sets `matrixAutoUpdate = false` and calls `updateMatrix()`;
  - level `Group`s switch auto-update on only while the exploded view animates `offset`;
  - tower pick boxes are created lazily when a level first becomes visible. Overview picking uses the tower pick box.

### 6.4 Lift rides through 50 floors

- **Today:** `updateLift` → `passFloor` → `app.refresh()` → `towerVisibility` → `ensureTowerFloor(passFloor)`. That is **one synchronous interior build per floor passed**, with LRU disposal (cache 3).
  - It exists for R's glass lifts in the light well.
  - After M2 every tall tower has closed shafts.
- **At the decided heights:** R1-LF passes 54 floors. With the shared ride formula (5 m/s → 18 s) that is ≈ 3 builds per second for 18 s.
- **Change:** build pass floors only for `e.type === 'glass' || e.exterior`. For closed shafts, prebuild the destination (already done at `startLift`) and keep the origin.
- **HUD:** the floor counter and `${y} m` stay on the car screen.

### 6.5 Small items

- `linksNear` runs every frame and scans all stops: 14.7 µs at 2,779 stops. Index by floor (`Map<floor, [link, stopIndex]>`) to get < 2 µs.
- **New level kind `refuge`** (west.md, p2.md, hotel-apt.md, north.md) is handled by:
  - `floorRows` (label);
  - `floorLabel`;
  - `ensureTowerFloor`, which today returns early for levels without residences. Widen it to `|| lv.lobbyPlan || lv.amenityPlan || lv.kind === 'refuge'` (hotel-apt.md §8.4);
  - `setHospitalityCut`;
  - pick info;
  - `towerSub` in `ui.js`, which hard-codes '20层酒店 / 30层住宅' and should derive the count from data.
- **Card gates 16 → 31, zones 14 → 29** (R +8, H/A +7): no engine cost. Gates are per lobby floor. `riverside-integration` pins the counts; coordinate the test edit once.

### 6.6 fps-frozen

- **Rule:** the H/A/R supertall specs are built only when `expansion` is set:
  - p2.md's `supertallResidential(spec)`;
  - hotel-apt.md's `supertallTower(spec)`.
  
  `HOSPITALITY.towers` stays the FPS truth. The compact layout's level count moved 198 → 362 when the prototype edited it directly (revision 1).
- 西苑 and 北苑 exist only under `expansion`. Measured: the FPS hash is unchanged with `WEST_STACK` / `NORTH_STACK`.
- M0, M1 and the mid tier are render-only: no impact.

### 6.7 Test time

| item | Δ CPU | Δ wall at concurrency 3 |
|---|---:|---:|
| nav +0.2–0.3 s in the 42 files that build nav (layout ≈ 0) | ≈ +10 s | ≈ +4 s |
| tower-dependent test bodies (≈ 60 s) × 1.3 units (2,236 / 1,730) | ≈ +18 s | ≈ +6–8 s |
| new tests (instancing, far, mid, framing, zones, nav share, refuge, H/A supertall) | ≈ +15 s | ≈ +5 s |
| **total** | ≈ +43 s | **≈ +15–20 s → ≈ 250–256 s** |

**Mitigations, if needed:**
- Walk tests sample floors: B-levels, 1F, every refuge floor, the first and last of each zone, and RF. Do not walk all 50.
- `residence-access` walks every unit today (14.9 s). Dedupe by plan module or suite signature (hotel-apt.md §9.4), since floors of one module share a nav plan (§6.1).
- §6.1 cuts GC in every nav-building file.
- `mall-stairs.test.js` (126 s) stays the critical path regardless of towers.

---

## 7. UX

### 7.1 Floor rail: zones as data

**Layout contract.** Each tall tower gets `b.zones`, plus `lv.zone`:

```js
b.zones = [{ id, name, from, to, kind: 'basement' | 'lobby' | 'band' | 'refuge' | 'amenity' | 'roof', lifts: [...] }]
```

The zones are the real floor logic the user asked for: product bands and lift banks, with refuge floors as separators. Top-down, per the designs:

| tower | levels | zones (top → bottom) |
|---|---:|---|
| 西苑 W1/W2 (S47) | 50 | RF 屋顶花园 · C 改善 32–47F (高区梯) · 31F 避难层 · 高低区转换 · B 17–30F (低区梯) · 16F 避难层 · A 2–15F (低区梯) · 1F 社区大堂 · B1/B2 住户电梯厅 |
| 北苑 T1 (150 m) | 30 | RF · 顶层复式 34–35F · 云端大平层 25–33F · 24F 避难层 · 错层复式 14–23F · 江景大平层 8–13F (10F 避难层 within) · 7F 空中大堂 · **1–6F 一期商场 podium row** (keep, from the parallel workflow) |
| R1 (200 m) | 55 | RF · PH 顶层复式 52–53F · S 云端 41–51F · 40F 避难层 · H 高区 28–39F · 27F 避难层 · 伸臂桁架 · M 中区 15–26F · 14F 避难层 · L 低区 2–13F · 1F 大堂 · B1 (B2 per p2 Q5) |
| H (200 m) | 52 | RF 停机坪 · 49F 云端餐厅酒吧 · 48F 水疗泳池 · 28–47F 酒店客房 (38F 避难层 within; 45–47F 行政楼层) · 27F 空中大堂 · 26F 避难层 · 3–25F 云澜酒店公寓 (13F 避难层 within) · 1–2F 大堂 · 会议 · B1/B2 |
| A (185 m) | 47 | RF · 44F 空中会所 · 40–43F LOFT · 39F 避难层 · 3–38F 服务式公寓 (13F, 26F 避难层 within) · 2F 住客会所 · 1F · B1/B2 |

**Rail (desktop).**
- Zone headers show the range and home count. The focused floor's zone is expanded; the others are collapsed.
- R1: ≈ 11 headers + ≤ 12 floors ≈ 23 rows ≈ 740 px, against 55 rows ≈ 1,760 px.
- Refuge rows are grey, labelled `避难层 · 设备层`, and selectable (they have a floor). Passenger-lift landings show as not stopping.
- After selection or a ride, `scrollIntoView({block:'nearest'})` the floor. This builds on the parallel workflow's rail scrolling.
- `[` / `]` or PageUp / PageDown step a floor in orbit mode.

**Jump list.** A chip strip above the rows, generated from `b.zones`: 地下 · 低 · 中 · 高 · 顶 · 避. A click expands and scrolls.

**Search box** in the rail header (`楼层 / 房号`):
- `37` or `37F` focuses the level;
- `3702` or `R1-3702` focuses the level and selects the home;
- `避难` lists the refuge floors.

The directory search already matches `u.code`. Add a level match for `/^\d+F?$/`.

**Phone** (horizontal rail, 51 px per chip; 55 chips ≈ 2,800 px ≈ 7 screens):
- a zone-chip row (6–11 chips), plus the selected zone's floors (≤ 16 chips ≈ 820 px);
- or a bottom sheet `选择楼层` with a 5-column grid and the search box.

**Testable in Node.** `floorRows(layout, bid, focus)` stays a pure string function (`floor-rows.js`). Tests:
- ≤ 30 rows with every tower collapsed;
- every level reachable;
- refuge rows marked;
- 北苑's podium row kept.

### 7.2 Directory

- **Building view:** the same zone groups, as collapsible `dir-group` rows with counts (e.g. `中区 15–26F · 24 户`).
- **Facts row:** `电梯` by bank (e.g. `R1 · 客梯 ×3 · 消防梯 ×1`; `H · 穿梭梯 ×3 · 酒店客梯 ×4 · 公寓客梯 ×4 · 消防/服务梯 ×2`), `避难层 n`, and `最高 xxx m`.
- **Search:** O(units), ≈ 2,236 units < 2 ms per keystroke. Rank level matches first.

### 7.3 Lift panel in explore (up to 55 stops)

- **Today.** `options()` lists one `ex-opt` per stop, as 电梯名 · 23F, flex-wrapped in a 560 px box with a 44 vh scroll. Only keys 1–9 work. At an R1 landing the prototype offers 54.
- **Proposal: the band-grouped keypad (COP)** agreed in north.md §4.5, west.md §3.5, p2.md and hotel-apt.md §5.4:
  - a grid of floor-number buttons, 6 columns on desktop and 5 on phones, each ≥ 44 px;
  - one keypad per bank, with the bank name in the header, e.g. `高区 · H1 H2 F2 · 32–47F`, `不停 2–30F`;
  - zone sub-headers; the current floor highlighted;
  - refuge floors appear only on fire lifts; passenger lifts show no button for floors they pass.
- **Keyboard.** With more than 9 options, digits become typed floor entry: buffer for 1 s, Enter to go, Backspace to delete. ↑ / ↓ move; E or Esc close.
- **Stair prompts** are unchanged (the floor above and below).

### 7.4 Ride time

- **Shared formula:** `travel = Δy / (2 × (e.speed ?? 3.5))`. The HUD reads `上行 · 32F · 实际约 37 秒`, and **Space** skips to arrival. This supersedes revision 1's 10 s cap.
- **Rides at the decided heights:**
  - R1-LF 1F → 53F: 182 m at 5 m/s, 18 s in game (36 s real);
  - 西苑 H1 to 47F: 4 m/s, 18 s;
  - H shuttle to 27F: 6 m/s, 8 s, then a hotel local at 4 m/s to 49F, 10 s.
- Long rides make §6.4 (pass-floor builds) mandatory.

### 7.5 Tour

**Measured at the decided heights.** Crown and title label (RF + 26 m, `labels.js:219`) NDC y, desktop / phone (`perf-calc/decided/framing-decided.txt`):

| step | today's camera | crown / label NDC y | re-frame (crown and label ≤ 0.88 on desktop and phone; target height capped) |
|---|---|---|---|
| 园区 (first), `tour.js:86` | (150, 300, 330) → (0, 0, 0) | 1.45 / 1.53 | **(255, 565, 561) → (0, 55, 0)**, 800 m |
| 北苑, `:76` | (−150, 115, −380) → (−236, 55, −232) | 1.53 / 1.83 | **(−120, 171, −432) → (−236, 90, −232)**, 245 m |
| 西苑, `:81` | (−315, 105, −335) → (−425, 42, −236) | 2.67 / 3.26 | **(−238, 194, −404) → (−425, 87, −236)**, 273 m |
| 云澜江 · 星湾桥, `:73` | (120, 46, −560) → (−120, 14, −300) | 1.65 / 1.78 | **(192, 116, −638) → (−120, 74, −300)**, 462 m |
| 对岸看江景 (eye level), `:82` | (−196, 1.7, −446) → (−215, 30, −245) | 1.29 / 1.45 | **keep the eye; target y 30 → 70** (a look-up), 213 m |
| 园区全景 (last), `:116` | (110, 430, 480) → (0, 0, 0) | 1.09 / 1.15 | **(127, 545, 552) → (0, 50, 0)**, 752 m |

- The companion designs add steps: the hotel tower and 27F sky lobby (hotel-apt §9.5), the 北苑 crown (north §8.5), the R1 refuge floor and the P2-roof view (p2 §8.4). Merge them into `tour.js` after the sky-lobby steps (SPEC skylobby §12 order rule), and update the caption list in `riverside-integration.test.js` once.
- **Framing test (Node).** For each tour step that names a tower, the projected crown and label stay within NDC y ≤ 0.9, at aspect 1.6 and 0.46 (with the 1.22 portrait pull-back of `flyTo`).

### 7.6 Orbit camera

- **Default `OVERVIEW`** (125, 480, 590) → (−90, 30, −35): crowns land at NDC y ≤ 0.74 and labels ≤ 0.78 (desktop); 0.63 / 0.66 on phones. **No change** at the decided heights. Revision 1's target lift was for 200 m 西苑 and 北苑.
- **`maxDistance` 3,600, `minDistance` 3, `maxPolarAngle` 0.495π:** keep. `viewCity` at 2,450 m still frames everything.
- **`buildingView(bid)`** already scales with tower height (`max(radius × 2.8, height × 1.8)`, target at 0.42 × height). A 200 m tower is framed from ≈ 360 m, still near, so the selected tower draws its full exterior.
- **Near / far:** keep (§4.6).
- **`measure.cjs`:** keep the campus view for comparability with `dc4951d`, even though it crops R1's crown (1.09). Add **campusTall** (149, 641, 648) → (0, 60, 0), measured at 1,994 / 2.587 M, and **river** (§3.3).

### 7.7 Labels

- Building titles sit at RF + 26 m, about 13 m above the 10–13 m crowns. That is automatic and correct.
- `towerOccluders` derives its boxes from levels. Taller towers hide more mall labels behind them only from the north; the default views look from the south-east.
- Per-level title labels (exploded view) stay per level and hidden.
- Fix `towerSub` (`ui.js`): '20层酒店 / 20层公寓 / 30层住宅' must come from data.

---

## 8. Risks

1. **M0 + M1 sequencing slips.** If the supertall layouts land first, the campus goes to ≈ 3,190 calls and 4.4 M triangles: +270 over the cap and slower on every phone. Make M0 + M1 the gate for the layout work.
2. **M0 + M1 are not enough for bytes.** Measured: scene geometry 300.8 MB (+14 MB over the cap) and JS heap 578 MB with H/A/R/北苑 still on their naive builders. Each tower's M2 builder (curtain wall or templates) must land with its layout, not later.
3. **Near views.** The river view measured 4.443 M triangles. The projection after M2 is ≈ 3.87 M, 5 % under the cap, and only the R mid tier gives real margin. The P1-RF viewdeck and P2-roof views are still unmeasured; add them to `measure.cjs` before M2.
4. **The black-instance rule.** Module geometry from `BatchSet.flush` is safe. Primitive-based instancing (louvres, mullions, rescue marks) renders black without the material clone. Enforce it with the test in §4.2.
5. **Stand-in fidelity.** The far stand-in must carry the refuge bands, belt diagonals and crown silhouette, or the 0.5 m silhouette check fails by 10–13 m. The R mid tier needs its own visual check.
6. **Shader compile hitch.** Instancing added 6 programs (61 → 67). On phones each costs a first-draw stall. Keep the warm-up and the ≤ 70 cap.
7. **JS heap peak on iPhones.** It is +60 MB in the prototype and ≈ +22 MB projected. Check the `low` tier on a real phone if possible.
8. **Lift-ride stutter** (§6.4) until pass-floor builds are skipped in closed shafts. It is worst on phones, with the 4-floor cache and 50-floor rides.
9. **Nav sharing correctness.** A false share would put one floor's walls on another. Element-wise verification prevents it; keep the smoke test and add the per-floor comparison test.
10. **Measurement noise.** This revision ran beside another agent's browser. Treat every timing as ±25–40 % and the load time as unmeasured. Calls, triangles and bytes are exact.
11. **Parallel edits.** `tour.js`, `ui.js` (floor rail), `app.js` (`towerVisibility`) and `riverside-integration.test.js` were edited by the sky-lobby workflow. Merge the zone rail, tour re-frames and gate counts onto them. Do not undo the podium row or the 7F gates.
12. **Five designs, one budget.** Each design claims part of the freed headroom. The measured M0 + M1 floor (1,954 steady) and the ratchet (2,200) give one shared number to allocate against; the designs' near-view caps total ≤ 45 meshes per tower.

## 9. Open questions

- **Q1. R mid LOD.** It is worth ≈ 0.85 M triangles in the river, bridge and P2-roof views, and gives real margin under the near-view cap. Accept a slightly simplified R façade at 350–600 m? Lean: yes.
- **Q2. Ratchet.** After M0 + M1, move the campus cap from 2,916 to 2,200 steady, so the freed calls are kept for phones? Lean: yes.
- **Q3. Night windows on instanced floors (西苑, R).** Three repeating lit-window variants (cheap), or per-floor lit windows (+0.12 MB per tower)? Lean: per floor for 西苑 (west.md), variants for R.
- **Q4. Ride time.** Confirm the shared `Δy / (2 × speed)` ride (≈ 18 s to the top) with Space to skip and the real time on the HUD. The user values realism; a full real-time ride would be ≈ 36 s.
- **Q5. Shadow focus fix.** Fix the pre-existing W1/W2 and R4 shadow-frustum misses at the same time (overview r 410; campus steps (−60, 0, −90) at r 400; river r 360)? They are not caused by height.
- **Q6. Tour length.** The designs add up to five steps (hotel tower, 27F sky lobby, 北苑 crown, R1 refuge, P2 roof). Keep all five, or pick two or three?
- **Q7. Load time.** A quiet-machine A/B (HEAD against M0 + M1) is still owed. Can the parent schedule a slot with no other browser running?

## 10. Files

| file | purpose |
|---|---|
| `perf-calc/decided/prototype-decided.diff` | this revision's hack: decided stacks, `R_INSTANCE` (M0), `FAR_ALL` (M1), `NAV_SHARE`, `WEST_INSTANCE`, browser shim |
| `perf-calc/decided/tops.mjs` | tower levels, units and tops per configuration |
| `perf-calc/decided/cpu.txt` | interleaved layout and nav CPU / wall, 3 rounds, with the load average |
| `perf-calc/decided/navbreak-decided.json`, `navbreak-decided-share.json` | nav per building, layout and nav heap, with and without sharing |
| `perf-calc/decided/comm-geo-naive.json`, `comm-geo-inst.json`, `comm-geo-m01.json` | community geometry: naive, 西苑 instanced, plus the 北苑 far LOD |
| `perf-calc/decided/rha-naive.txt`, `rha-m01.txt` | R / H / A geometry: naive, and with M0 + M1 |
| `perf-calc/decided/perframe.json`, `matrix-decided.mjs`, `matrix-decided.txt` | per-frame `linksNear` / `step`; the `updateMatrixWorld` model |
| `perf-calc/decided/framing-decided.mjs`, `framing-decided.txt`, `shadow-split.mjs`, `shadow-split.txt`, `shadow-focus.mjs`, `shadow-focus.txt` | framing at the decided heights, tour re-frames, shadow frustum |
| `perf-calc/decided/browser/measure-st.cjs`, `browser/run.log`, `browser/out/decided.json`, `browser/out/decided-*.jpg` | the one browser run (port 5506, 5 views) |
| `perf-calc/*` (revision 1) | baseline engine and nav profiles, nav share, the 200 m stretch, test-time breakdown |
