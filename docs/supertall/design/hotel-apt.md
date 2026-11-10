# 云澜酒店 H · 云澜服务公寓 A · 约 200 m 超高层延伸（设计研究，v2）

Study label `supertall/hotel-apt`, 2026-11-05. This is a design study only: nothing in `/home/user/super-mall-3d` was edited or committed.

**What changed in v2.** v1 was written before the user's decisions (`DECISIONS.md`). This version applies them:
- H and A go to about 200 m, inside the 165–215 m band.
- The towers keep 13 m from P1 by stepping back above the podium.
- The skyline is staggered (错落) against the chosen neighbours:
  - 北苑 on the ≈ 150 m variant (T1 ≈ 151, T2 ≈ 143);
  - 西苑 S47 (crown 156.5);
  - R1–R4 at 200 / 189.8 / 179.6 / 169.4.
- Every open question takes this study's recommended default (§11, "Defaults taken").

v2 also corrects two v1 errors that a real reviewer would catch:
1. **Stacked lift shafts did not fit** (§5.2). v1 put the hotel locals above the residence lifts with only 9.4 m between the two banks' landings. It needs 12.0 m. 26F grows to an 8.6 m double-height refuge/plant floor. The hotel loses one floor to keep the main roof clear of the 190 m structural limit: **144 keys** (v1: 152).
2. **The H tower was modelled 35.8 m deep** in v1's sun and exterior prototypes. It is 32 m deep, as v1's own gap table says. Both prototypes were re-run.

**Base.** Measured at `9bdb886`, today's branch head. Its sources are identical to `e7cfb42`; only `dist/` was rebuilt. The parallel workflows have landed:
- the door leaves (`8bc9336`);
- the 北苑 7F 空中大堂 (`f7a3655`: 16 gates, 14 zones, the flush P1-RF viewdeck).

This design builds on both and changes neither.

**Method.** Measurements ran in a detached scratch worktree (gitignored data files copied, `node_modules` symlinked), removed afterwards. Scripts and outputs are in `hotel-calc/` (§12). v2 files carry a `_v2` / `-v2` suffix. v1 outputs are kept for the record. No browser was started.

**Companion studies** (cited as **codes.md**, **north.md**, **west.md**, **p2.md**, **perf.md**):
- Clause marks follow codes.md:
  - **✔** = checked against the code text;
  - **≈** = from memory or a secondary source; check before quoting.
- The shared engine work follows north.md, west.md and perf.md, so one implementation serves every tower:
  - stair `breakLevels` at refuge floors;
  - the speed-based (capped) lift ride and the keypad lift panel;
  - zones as data (`b.zones`) for the floor rail;
  - the `refuge` level kind;
  - the far-LOD `farSwap()`;
  - nav plan sharing.

**Measured baselines** (`buildLayout({expansion:true})`, Node three, 18 B/vertex as in `tests/community-render.test.js`):

| | H 云澜酒店 | A 云澜服务公寓 |
|---|---|---|
| footprint, frame | 74 × 38 m, x[−284, −210] z[−100.15, −62.15], 0° | 38 × 74 m, x[−54, −16] z[−251, −177], 90° |
| levels | B2, B1, 1F (6.5 m), 2F–20F (3.4 m), RF @ 71.1 → 23 | same; 20F LOFT 6.5 m; RF @ 74.2 → 23 |
| keys / units | 190 king suites (10 per floor, 11 × 15 m) | 190 (180 serviced + 10 LOFT on 20F) |
| lifts / stairs | 2 glass lifts (`exterior: true`) at the west end; 2 end stairs | same |
| links to P1 | 1F dock, 2F skybridge, B1 → P1-B1M (metro), B2 → P1-B1 (garage) | same, at A's south end |
| nearest neighbours | P1 5.97 m; P1W3 / P1W4 6.85 m | P1 7.01 m; P1E 11 m; R1 44 m |
| exterior (resident) | **176,202 v in 9 batched meshes** (3.17 MB) + 18,580 v of instanced stairs | 149,166 v in 9 meshes + 23,764 v of stairs |
| 1F lobby (resident) | 236,484 v (4.26 MB) | 238,608 v (4.30 MB) |
| campus view, main pass (`perf/out/bd-after-campus.json`, re-read) | **58 calls**, 130k triangles; shadow refresh 30 calls | **57 calls**, 124k triangles; shadow refresh 29 |

perf.md §2.5 counts H at 211.1k v with its own grouping. The difference changes no conclusion here.

---

## 0. Decisions on one page

1. **Podium + tower** (unchanged from v1):
   - Each building keeps a **1F–2F podium** (11.5 m) on today's 74 × 38 m footprint, so all four P1 links stay exactly where they are.
   - Above 2F a **66 × 32 m tower** (A: 66 × 31.8 m) steps back from P1. GB 55037 §3.3.1 ✔ asks ≥ 13 m from a > 100 m building to P1 (a 34 m high-rise), with no reductions (GB 50016 §5.2.6 ✔).
   - Measured (re-run at `9bdb886`):
     - H tower: **15.25 m** to P1, **12.85 m** to P1W3 / P1W4;
     - A tower: **13.21 m** to P1, 15.0 m to P1E, 44 m to R1.
2. **H is a mixed hospitality tower**, program **R** (default). Main roof (RF) **185.4 m**, helideck ≈ **196.8 m**:
   - 1F: two lobbies, 酒店落客大堂 + 酒店公寓住户大堂;
   - 2F: 会议中心, where the P1 skybridge lands;
   - 3F–25F: **云澜酒店公寓, 176 homes**;
   - **26F**: 避难层 + double-height plant / lift-transfer floor, 8.6 m;
   - **27F 空中大堂**, 6.8 m;
   - 28F–46F: **hotel, 144 keys** (44F–46F 行政楼层);
   - 47F 云境水疗 · 室内泳池; 48F 云端餐厅 · 云端酒吧;
   - refuge floors **13F / 26F / 37F**.
3. **A stays a serviced-apartment tower** (unchanged). RF **174.6 m**, crown ≈ **184.6 m**:
   - 2F 住客会所 behind a card door at the skybridge mouth;
   - 3F–38F: 272 serviced suites; 40F–43F: 32 LOFT 复式; 44F 空中会所;
   - refuge floors 13F / 26F / 39F;
   - **304 units**.
4. **Refuge datum shared with A and R1–R4:**
   - H: 45.5 / 90.8 / 136.8 m; A: 45.5 / 90.8 / 137.6 m; R1–R4: 45.6 / 90.9 / 137.1 m.
   - The louvre bands of 二期 and the 一期 hospitality pair run level within 0.8 m across 星湾路.
   - 北苑 (46.2 / 93.6) and 西苑 (46.5 / 93.0) are within 3 m.
5. **Skyline (§9.3):**
   - H is **一期's summit** and R1 is **二期's**. They never compete in one view: from the 星湾桥 R1 reads 55° and H 28°; from the 三期 plaza H reads 41° and R1 35°.
   - A (184.6) pairs with R1 (200) as the 星湾路 gateway; from 北外环 they read 65° / 66°.
   - H rises about 46–54 m behind the ≈ 150 m 北苑 pair from the river.
6. **Plate:** 8 suites per floor, two in each 22 m glass wing either side of a full-depth 22 m core. The user's suite GLB repeats unchanged; the 4 end suites are corner suites.
7. **Lifts:**
   - **H: 13** — residence bank RB 4 × 3.5 m/s (46 s interval), shuttles SH 3 × 6 m/s (32 s), hotel locals HL 4 × 4 m/s (46 s), service/fire S1 + S2. HL is stacked on RB's footprint above the 26F machine room.
   - **A: 7** — 5 × 5 m/s (38 s) plus 2 service/fire lifts.
   - Fire lifts 1F → top floor: **49.9 s (H)**, **47.4 s (A)** at 4 m/s (≤ 60 s, GB 50016 §7.3.8-3 ✔).
8. **Structure:**
   - H/B = 185.4 / 32 = **5.79 (H)** and 174.6 / 31.8 = **5.49 (A)**: limit 7 for frame-core (JGJ 3 Table 3.3.2 ✔).
   - SRC frame + RC core spanning the full depth + RC end walls.
   - Main roof ≤ 190 m (Table 11.1.2 ✔, 7度), with 4.6 m margin for H.
   - 超限审查 in any case.
9. **Exterior / render:**
   - Tripartite curtain-wall slab, prototyped with the real `BatchSet`:
     - near **8 meshes / 26.9k v (H), 25.2k v (A)**, against 176k / 149k today;
     - far LOD **2 meshes / 336 and 308 triangles**.
   - Campus view H + A: **115 → ≈ 4–6 main-pass calls**, −0.25 M triangles.
   - H/A need **no mid LOD tier**: the near façade already costs about 9k triangles.
10. **Compact FPS layout untouched.** The supertall H/A are built only when `expansion` is true; `HOSPITALITY.towers` stays the FPS truth (`tests/fps-frozen.test.js`).

| key number | H 云澜酒店 | A 云澜服务公寓 |
|---|---|---|
| storeys / levels | 1F–48F + RF; **51 levels** with B2 / B1 (today 23) | 1F–44F + RF; **47 levels** (today 23) |
| RF / top | **185.4 m** / helideck ≈ **196.8 m**, deck lights ≈ 198 m | **174.6 m** / crown ≈ **184.6 m** |
| podium / tower plate | 74 × 38 (1F–2F) / 66 × 32 = 2,112 m² | 38 × 74 / 31.8 × 66 = 2,099 m² |
| keys / homes | **144 hotel keys + 176 酒店公寓** | 272 serviced + 32 LOFT = **304** |
| refuge floors | 13F 45.5 (4.5 m) · **26F 90.8 (8.6 m)** · 37F 136.8 (6.0 m) | 13F 45.5 · 26F 90.8 · 39F 137.6 |
| refuge spacing / top above the last | 45.5 · 45.3 · 46.0 / 42.6 m | 45.5 · 45.3 · 46.8 / 32.0 m |
| net refuge area needed (5 p/m²) | 38 / 79 / 93 m² | 38 / 38 / 43 m² |
| lifts | 13 (RB 4, SH 3, HL 4, S 2) | 7 (L 5, S 2) |
| H/B | 5.79 | 5.49 |
| helipad | 停机坪, 26 × 26 m deck on the core lantern (GB 50016 §7.4.1 ✔ 宜) | 直升机救助设施, 10 × 10 m winching area on a wing roof |
| hardstand | south, 66 × 10 m (18 of 22 surface stalls) | west half of 星湾路 along the 66 m frontage (default; §2.3) |

---

## 1. Today (what the code does)

- **Layout.** `src/layout/hospitality.js` `tower(spec)`, driven by `HOSPITALITY.towers`:
  - H: `storeys: 20, lobbyHeight: 6.5, floorHeight: 3.4`; A the same, with its top storey at 6.5 m;
  - one footprint for every level (`outline` from `spec.w × spec.d`);
  - B2 / B1 garages;
  - 1F `lobbyPlan` = `createHospitalityLobby()`, 7 zones on 74 × 38;
  - from 2F, `addUnit()` places 5 + 5 suites of 11 × 15 m either side of a 5 m E–W corridor, with the N row rotated 180°;
  - `residence()` attaches `createSuitePlan()` (the user's GLB survey) plus `suiteAdditionObstacles(usage)`;
  - a storey ≥ 6.5 m with suites becomes a duplex via `createSuiteMezzanine()` (A-20F LOFT).
  - Note that `buildLayout()` defaults to `expansion: true`, so most tests see the expansion variant.
- **Stairs and lifts.**
  - `H-ST1` rect(−36, −14, −30, −4) and `H-ST2` rect(30, 4, 36, 14), continuous B2 → RF.
  - Two lifts at lu −34.25 / −30.75, lv 4.5 (2.8 × 3 m), serving every level. They are `exterior: true` glass shafts, drawn by `liftEnclosures()` into the tower batch.
- **Docks.** P1 wing gateways at P1-1F / 2F / B1M / B1 join H-1F / 2F / B1 / B2 (A the same).
  - The 2F skybridge lands **on a guest floor**: mall shoppers walk straight into a suite corridor today.
- **Render.** `src/render/build/hospitality.js` `buildHospitality()`:
  - one clipped `BatchSet` per tower;
  - `facadeFloor()` per level and edge (window per suite, 1.5 m reveals, curtains, lit panes);
  - `slab()`, `corridorLights()`, `crown()`, `liftEnclosures()`;
  - instanced protected stairs per storey height;
  - the 1F lobby and the RF roof garden.
  - Suite interiors are lazy: `ensureTowerFloor()` (app.js l. 392) builds only when `lv.units.some(u => u.residence)`. `buildSuiteModels()` instances the GLB primitives, with a 3-floor LRU.
- **Gaps today** (codes.md §1):
  - no fire lift;
  - 2 lifts for 190 keys;
  - no hardstand record;
  - at 74 m, H and A already need a hardstand along a long side.

---

## 2. Massing: podium, tower, separation

### 2.1 Why the tower steps back

- **The 13 m rule.** GB 55037 §3.3.1 ✔: "除裙房与相邻建筑的防火间距可按单、多层建筑确定外，建筑高度大于100m的民用建筑…与高层民用建筑的防火间距不应小于13m". It applies to the whole tower, not only the part above 100 m.
  - The same clause asks ≥ 9 m to 一、二级 single- and multi-storey buildings, ≥ 11 m to 三级, ≥ 14 m to 四级 / 木结构 (codes.md quotes the opening; the 9 / 14 m figures are ≈).
- **The podium exception.** A 裙房 (≤ 24 m, outside the tower's footprint) "可按单、多层建筑确定". The 11.5 m podium therefore keeps today's footprint, under these conditions:
  - its P1-facing wall becomes a 防火墙 with 甲级 doors at the dock openings;
  - its roof is ≥ 1.00 h, with no skylights;
  - this is the GB 50016 Table 5.2.2 note reduction to ≥ 4 m for a high-rise neighbour (≈; measured 5.97 / 7.01 m).
- **Unresolved.** codes.md did not settle whether §5.2.6 ("> 100 m: reductions still not allowed") also strips the podium of that note. The concrete fallback, if the fire authority says it does, is to pull the podium's P1 face back to 9.0 m:
  - H: east face x −210 → ≈ −213.0;
  - A: west face x −54 → −52.0;
  - the four dock corridors lengthen by 3 m (H) / 2 m (A);
  - the tower above is unaffected.

### 2.2 Footprints (world coordinates; `hotel-calc/gaps.mjs`, re-run)

| part | x | z | size | binding neighbour |
|---|---|---|---|---|
| H podium 1F–2F (unchanged) | −284 … −210 | −100.15 … −62.15 | 74 × 38 | P1 5.97 m (fire-wall reduction, §2.1) |
| **H tower 3F–RF** | **−284 … −218** | **−94.15 … −62.15** | **66 × 32** | P1 **15.25 m**; P1W3 / P1W4 **12.85 m** |
| A podium 1F–2F (unchanged) | −54 … −16 | −251 … −177 | 38 × 74 | P1 7.01 m |
| **A tower 3F–RF** | **−47.8 … −16** | **−247 … −181** | **31.8 × 66** | P1 **13.21 m** (P1 vertex (−61.01, −185.05)); P1E 15.0 m; R1 44 m |

- **H.**
  - Flush with the podium on the west (H-SIDE door) and south (hardstand) faces.
  - Set back 8 m east and 6 m north. The 11 m suite module fixes 66 m.
- **A.**
  - Flush on the east (星湾路) face. Set back 6.2 m west and 4 m at each end.
  - **The margin is 0.21 m**: nothing on P1's NE corner may grow, and A's corridor may never widen. The sky-lobby work moved the P1-RF viewdeck inside P1's outline, so the gap is unchanged.
- **P1W3 西里木构茶舍** (roof 12 m) is 12.85 m from H. A true 木结构 needs 14 m. **Default: P1W3 is classed 一、二级** (steel / concrete with timber cladding; "木构" is style), so 9 m applies.
- **The 2F roof strips** become planted, non-accessible 屋顶绿化 at 11.5 m: H 8 m east and 6 m north; A 6.2 m west and 4 m at each end.
- **Plates:**
  - H 2,112 m² and A 2,099 m²: one fire compartment each with sprinklers (≤ 3,000 m², GB 55037 §4.3.16 ✔);
  - both are > 2,000 m², so a helipad or rescue facility is 宜 (GB 50016 §7.4.1 ✔);
  - do not shrink A below 2,000 m² without dropping its rescue platform.

### 2.3 Fire-truck access

- **H hardstand `HS-H`:** x[−284, −218] × z[−57.15, −47.15], 66 × 10 m, 5 m off the south face (GB 50016 §7.2.1–7.2.2 ✔; GB 55037 §3.4.6–7 ✔).
  - It covers 18 of the 22 `hotel-shared-parking` stalls. **Default: they move to H-B1 / B2.**
  - It joins the `hotel-parking-access` road (z ≈ −49).
  - The south face is flush, so there is no podium in between ✓. ST2 exits straight onto it (§2.2.2 ✔).
  - Fire roads: the south (long side) and the west parking roads (short side). North is impossible (annexes at 6.85 m; P1 to the east).
  - GB 55037 §3.4.3 ✔ wants 2 long sides for high-rise public buildings "unless the site makes only one possible". The one is on the hardstand side ✓.
- **A hardstand.** There is no in-site option: the west long side faces P1 at 7 m, and the north end has the garage ramp trenches (no hardstand over garage entrances, §7.2.2 ✔).
  - **Default: the west half of 星湾路, x[−10, 0] along A's 66 m frontage**, marked as 消防登高操作场地:
    - near edge 6 m from the façade (5–10 m ✓), 10 m wide ✓;
    - the trees and lamps in the 6 m sidewalk on that stretch are removed (no obstructions in between, §7.2.2 ✔);
    - yellow grid and 禁停 markings; the drop-off moves to either end.
  - No road geometry changes; it is markings and street furniture only.
  - It needs the local authority to accept a municipal road as a hardstand (≈; common in dense Chinese districts, not universal).
  - Fallback: narrow 星湾路 locally and build an in-site lay-by.
- **Rescue windows** (GB 55037 §2.2.3 ✔): 2 per storey from 3F on the hardstand face (H south, A east), with red-triangle markers. Refuge-floor 避难区 bays have openable 乙级 windows on the same face (§7.1.15-6 ✔).

---

## 3. Storey stacks

### 3.1 Program for H (default R)

A 200 m tower that is all hotel would hold about 330 keys of 165 m² suites. That is resort scale, and real 200 m hotels sit **on top of** something else, reached by shuttles to a sky lobby.

| | **R — 酒店公寓 + 酒店 (default)** | O — 写字楼 + 酒店 | K — all hotel |
|---|---|---|---|
| low zone | 3F–25F: 176 hotel-branded residences (same GLB, apartment variant), own lobby, card gates | ≈ 18 office floors at 4.2 m, ≈ 24,000 m² NLA | hotel rooms |
| sky lobby | 27F | ≈ 23F | none |
| hotel | 28F–46F, **144 keys** | ≈ 136–144 keys | ≈ 330 keys |
| lifts | 13 | ≈ 17 | ≈ 10–11 |
| new content | none: suites, lobbies and LOFT all exist | an office interior type and office gates | none |

- 144 keys of 165 m² suites is a credible ultra-luxury all-suite hotel. Real top-of-tower hotels in China run about 150–250 keys (≈).
- The stack is data (`SUPERTALL.H.stack`). Switching to O later is a data change plus the office content.

### 3.2 H, floor by floor (`hotel-calc/stack_lifts_v2.out`)

| floor | elev (m) | storey | use | lifts that open |
|---|---:|---:|---|---|
| B2 / B1 | −8.4 / −4.5 | 3.9 / 4.5 | 住客车库; B1 = 地铁连廊 (unchanged) | RB, SH, S1, S2 |
| 1F | 0.0 | 6.5 | **酒店落客大堂** (east, H-MAIN facing the P1 dock) + **云澜酒店公寓 · 住户大堂** (west, H-SIDE door) | RB, SH, S1, S2 |
| 2F | 6.5 | 5.0 | **会议中心**: pre-function at the east end where the P1-2F skybridge lands; 4–6 meeting rooms | SH, S1, S2 |
| 3F–12F | 11.5–42.1 | 3.4 | 云澜酒店公寓, 8 per floor | RB, S1 |
| **13F** | **45.5** | 4.5 | **避难层兼设备层 R1**: refuge + water / electrical plant | S1 (fire) |
| 14F–25F | 50.0–87.4 | 3.4 | 云澜酒店公寓, 8 per floor | RB, S1 |
| **26F** | **90.8** | **8.6** | **避难层 R2 + 双层高设备层.** The refuge area and pump rooms sit on the slab. A wing plant mezzanine at +4.3 m carries the hotel AHUs and heat exchangers. The core holds the RB overrun, the RB machine room and the HL pits (§5.2). The fire-water transfer tank and pumps are here. | S1, S2 |
| **27F** | **99.4** | 6.8 | **空中大堂**: 办理入住 · 大堂吧 · 云宴全日餐厅 · 行政酒廊 | SH, HL, S1, S2 |
| 28F | 106.2 | 3.4 | hotel, 8 suites. The core's south row holds the **SH machine room**. | HL, S1, S2 |
| 29F–36F | 109.6–133.4 | 3.4 | hotel, 8 suites per floor | HL, S1, S2 |
| **37F** | **136.8** | 6.0 | **避难层兼设备层 R3**: refuge + plant | S1, S2 |
| 38F–46F | 142.8–170.0 | 3.4 | hotel; 44F–46F 行政楼层 | HL, S1, S2 |
| 47F | 173.4 | 6.0 | 云境水疗 · 室内泳池 · 健身 | HL, S1, S2 |
| 48F | 179.4 | 6.0 | 云端餐厅 (W wing) · 云端酒吧 (E wing) | HL, S1, S2 |
| RF | 185.4 | — | Main roof: wing roofs with BMU and cooling towers behind louvres; the ST1 / ST2 roof exits | S1, S2 |
| lantern / deck | ≈ 194.2 / ≈ 196.8 | — | Core lantern, 22 × 20 m: HL and S1 / S2 machine rooms, fire tank, fans. The **26 × 26 m helideck** sits on top. | stairs only |

**Notes:**
- Numbering is continuous: no 4 / 13 / 14 skipping, and refuge floors are numbered storeys (DECISIONS 5, north.md, west.md).
- The 26F plant mezzanine is a 设备夹层 inside 26F with no lift stop and no public access. It is shown in the floor rail as part of `26F 避难层 · 设备层`, not as a floor.
- The sky lobby sits **above** R2, never on it: a refuge floor holds only the refuge area and plant (GB 55037 §7.1.15-2 ✔), the same lesson as 北苑 7F.
- Lift panels carry no button for floors a lift passes.

### 3.3 A, floor by floor (unchanged from v1)

| floor | elev (m) | storey | use | lifts that open |
|---|---:|---:|---|---|
| B2 / B1 | −8.4 / −4.5 | 3.9 / 4.5 | 住客车库 / 地铁连廊 | L1–L5, S1, S2 |
| 1F | 0.0 | 6.5 | 迎宾大堂: 公寓接待 · 邻里餐厅 · 共享厨房 · 信报快递, re-planned around the core; speed gates | L, S |
| 2F | 6.5 | 5.0 | **住客会所**: 健身瑜伽 · 洗衣 · 共享办公 · 会客. The P1 skybridge lands behind a **card door** (`A-2F-LINK`). | L, S |
| 3F–12F | 11.5–42.1 | 3.4 | 服务公寓, 8 per floor | L, S |
| **13F** | 45.5 | 4.5 | 避难层 R1 | S1, S2 |
| 14F–25F | 50.0–87.4 | 3.4 | 服务公寓 | L, S |
| **26F** | 90.8 | 6.0 | 避难层 R2 + plant | S1, S2 |
| 27F–38F | 96.8–134.2 | 3.4 | 服务公寓 | L, S |
| **39F** | 137.6 | 6.0 | 避难层 R3 + plant | S1, S2 |
| 40F–43F | 143.6–163.1 | 6.5 | **LOFT 复式公寓**, 8 per floor (`createSuiteMezzanine`, upper bedroom at +3.05 m) | L, S (lower level) |
| 44F | 169.6 | 5.0 | **空中会所**: 住客酒廊 · 共享厨房餐厅 · 阅读 · 室内空中花园 | L, S |
| RF | 174.6 | — | plant, BMU, **直升机救助设施** on a wing roof | S1, S2 |
| lantern | ≈ 184.6 | — | Core lantern, 22 × 20 m: L and S machine rooms, fire tank, name sign, obstruction lights | |

- A has no stacked shafts, so the v1 stack holds.
- The L bank's 5 m/s overrun from 44F reaches ≈ 175.9 m, just above RF, so its machine room is in the lantern.

**Why no roof gardens at the top.** Today's H / A RF 屋顶花园 are retired in the expansion variant: an open shared deck at 175–185 m is not credible, the same call as north.md §1.4. The amenities move indoors (48F bar, 44F club) and onto the 2F podium roofs. A test that pins today's roof garden must exclude the supertall variant.

### 3.4 Refuge floors (GB 55037 §7.1.14–7.1.15 ✔, §7.1.9 ✔)

- **Area.** Net area ≥ everyone on the floors between this refuge floor and the next one up, at 5 p/m² (GB 50016 §5.5.23-3 ✔). Counted as: 2 p per key or unit, 3 per LOFT, 250 in the sky lobby, 160 per H amenity floor, 120 in A's club.

  | refuge floor | people served | net area needed | 避难区 on the hardstand face |
  |---|---:|---:|---|
  | H 13F | 192 | 38 m² | S face: the core bay plus the W-wing S bay, ≈ 120 m² |
  | H 26F | 394 | 79 m² | S face, ≈ 160 m², under the 4.3 m plant mezzanine (≈ 3.9 m clear) |
  | H 37F | 464 | 93 m² | S face, ≈ 160 m² |
  | A 13F / 26F / 39F | 192 / 192 / 216 | 38 / 38 / 43 m² | E face (星湾路), ≈ 120 m² |

- **Plan:**
  - the 避难区 is on the hardstand face, with openable 乙级 fire windows on ≥ 2 orientations and two marked rescue windows;
  - hydrant, hose reel, extinguishers, fire phone and PA;
  - lit `避难层 · 26F` signs at every stair door;
  - plant behind 3.00 h walls through a 防火隔间 with 甲级 doors (§7.1.15-2 ✔; GB 50016 §5.5.23-4).
- **Plant by floor:**
  - 13F (4.5 m): light plant, domestic-water PRVs;
  - **26F (8.6 m)**: fire-water transfer tank and pumps, the segment-1 / segment-2 stair-pressurisation fans (GB 51251 ≈), the hotel AHUs on the mezzanine, the RB machine room;
  - 37F (6.0 m): hotel AHUs, PRVs, electrical;
  - A's 26F / 39F (6.0 m): the same set without the lift transfer.
- **Stairs: 分隔 at every refuge floor.** north.md §5.1 `breakLevels`: a partition and a second door per stair. Evacuees leave the stair from above, cross the refuge area and re-enter below.
- **Lifts:** S1 / S2 open on refuge floors; passenger lifts pass sealed (§7.1.15-3 ✔).

### 3.5 Roof, lantern and helipad

- **H.**
  - **The lantern is 22 × 20 m** (440 m², 21 % of the roof) over the core centre. With the two stair-exit enclosures (≈ 2 × 42 m²) the roof structures total ≈ 524 m² ≤ ¼ of 2,112 m². So the building height stays at the main roof (GB 50016 App. A.0.1 ✔, "占屋面面积不大于1/4者").
    - v1's lantern covered the whole 22 × 32 m core (33 %). That would have moved the measured height to the lantern top.
    - It holds:
      - the HL machine rooms (the 48F overrun reaches 185.0);
      - the S1 / S2 machine rooms (RF overrun to 191.0, room to ≈ 194.2);
      - the high-level fire tank (≥ 100 m³, public > 150 m; GB 50974 ≈);
      - top pressurisation fans; the BMU garage.
  - **Helideck:**
    - 26 × 26 m steel deck at **≈ 196.8 m**, cantilevering 2 m E–W and 3 m N–S over the lantern;
    - sized for D ≤ 16.7 m rescue helicopters: TLOF ≥ 0.83 D, FATO ≥ 1 D, plus a 0.25 D safety area (ICAO Annex 14 Vol II / MH 5013 ≈);
    - a 1.5 m safety net, "H" and TLOF markings, perimeter and flood lights, a hydrant;
    - **two exits**: open steel stairs at the N and S edges down to RF, where ST1 / ST2 come out (GB 50016 §7.4.2 ✔; GB 55037 §2.2.12 ✔: ≥ 2 exits, ≥ 5 m clear of protrusions);
    - nothing projects above the deck: v1's mast is dropped, because a mast does not belong next to a FATO.
  - **Approach sectors** (≈ ICAO Annex 14 Vol II, a 4.5 % approach surface):
    - With 北苑 on the 150 m variant, nothing within 330 m is above the deck: T1 ≈ 151 m at 130 m north (face to face), 西苑 156.5 m at ≥ 160 m WNW, A 184.6 m at ≈ 258 m ESE (centre to centre).
    - R1 (200.0 m) is 3.2 m above the deck but 331 m east. The approach surface is ≈ 211.7 m there, so R1 is under it.
    - **Primary approach: north over the 云澜江** (open water, no people below). Secondary: south over the hotel lot.
    - v1's closed sectors toward T1 / W2 no longer apply.
  - **Lights:** above 150 m, high-intensity white flashing obstruction lights at the lantern corners; medium-intensity red about every 45 m on the core spine (CAAC MH 5001 / ICAO Annex 14 Vol I ≈). The helideck lights are separate.
- **A.**
  - The lantern is 22 × 20 m (21 %), ≈ 10 m tall: machine rooms, BMU, fire tank, name sign, obstruction lights.
  - **直升机救助设施** on a wing roof (RF 174.6): a 10 × 10 m winching area with its marking, ≥ 5 m from the lantern, and lights. GB 50016 §7.4.1 ✔ accepts "供直升机救助的设施" in place of a pad; it needs no approach surfaces.

---

## 4. Rooms and suites per floor

### 4.1 The tower plate (tower-local: x along the 66 m length, z across, origin at the plate centre)

```
z −16 ┌──────────── wing W (22 m) ───────────┬──── core 22 m ────┬──────────── wing E (22 m) ───────────┐
      │  suite N1 (corner)  │  suite N2      │ AHU · 布草 · ST1   │  suite N3          │  suite N4 (corner)│  N face
 −1.0 ├─────────────────────┴ corridor 2.0 ──┤ lift hall 4.0 m    ├─ corridor 2.0 ─────┴──────────────────┤
 +1.0 │  suite S1 (corner)  │  suite S2      │ shafts · 前室 · ST2│  suite S3          │  suite S4 (corner)│  S face
z +16 └──────────────────────────────────────┴───────────────────┴───────────────────────────────────────┘
      x −33                                 −11                  11                                    33
```

- **Suite frames** keep today's `addUnit()` frames: unit front on the corridor line, depth 15 m to the glass.
  - N row: `toW(F, x0 + 11, −1.0)` at `deg + 180`; S row: `toW(F, x0, 1.0)` at `deg`; x0 ∈ {−33, −22, 11, 22}.
  - A uses a 1.8 m corridor (±0.9) to hold its 13.21 m.
- **No reveal.** The curtain-wall glass sits on the suite's rear wall, so `windowBay(… inset)` is not used on supertall floors.
- **Corner suites** (N1, S1, N4, S4) touch a 山墙. Each gets two continuous window slots on that wall, one on the bedroom and one on the living room, placed from `createSuitePlan().rooms`. Labels: "转角套房" / "转角公寓".
- **Area:**

  | | m² | share |
  |---|---:|---:|
  | suites (8 × 165) | 1,320 | 62.5 % |
  | core | 704 | 33 % |
  | corridors | 88 | 4.5 % |

  A 33 % core is on the high side of codes.md's 20–28 %. It is the price of 13 lifts on a 2,100 m² plate.
- **Hotel floors** (28F–36F, 38F–46F; 18 floors):
  - 8 × `king-suite` (GLB + hotel additions: pantry, wardrobe, luggage);
  - 布草间 / housekeeping and the service lobby in the core; from 29F the core's south row is free for linen and storage.
- **Residence floors** (H 3F–25F): 8 × `serviced-suite` (kitchen, laundry, wardrobe), `catLabel` "云澜酒店公寓". `addUnit` needs a per-level unit usage (`lv.unitUsage = 'apartment'` inside a `hotel` building).
- **A floors:**
  - 8 × `serviced-suite` on 3F–38F;
  - 8 × `loft-apartment` on 40F–43F: the existing `lv.height ≥ 6.5` rule triggers `createSuiteMezzanine` ✓.
- **Every floor of a tower is the same plate.** That is real hotel and serviced-apartment practice, and it is what makes the exterior cheap (§8). The "every home different" rule belongs to 西苑 and 北苑.
- **Suite-model repeat:** one GLB instance set per floor with 8 instances (today 10). No new GLB and no re-bake.

### 4.2 Public floors

| floor | plan (zones re-used from `createHospitalityLobby` where possible) |
|---|---|
| **H-1F** (74 × 38; the core sits at podium-local x[−15, 7]) | **East (x 7…37): 酒店落客大堂**: H-MAIN, bell desk, concierge, small lounge, luggage room; the SH shuttles open east. **West (x −37…−15): 酒店公寓住户大堂**: H-SIDE door, concierge and mail, lounge, **speed gates `H-1F-GATE`** in front of RB. A glass wall on the lift hall's centre line splits it into an RB half (entered from the west) and an SH half (from the east). |
| H-2F (podium, 5.0 m) | 会议中心: pre-function at the skybridge mouth, 4–6 meeting rooms, business centre, washrooms. RB passes sealed. |
| **H-27F 空中大堂** (6.8 m) | Today's 1F zones, re-planned around the core: **E wing N 礼宾 · 办理入住** (marble desk, fluted backdrop, chandelier); **E wing S 行政酒廊 · 大堂吧**; **W wing N 悦庭 · 钢琴酒廊**; **W wing S 云宴 · 全日制餐厅**. The corridor line becomes a 2 m gallery. |
| H-47F (6.0 m) | 云境水疗: W wing gym and yoga (today's 1F fitness kit) and treatment rooms; E wing **indoor pool ≈ 18 × 7 m** along the south glass, jacuzzi, loungers; changing rooms in the core |
| H-48F (6.0 m) | W wing 云端餐厅, E wing 云端酒吧 (bar counter, lounge seating) |
| **A-1F** | 公寓接待, 邻里餐厅 · 共享厨房, 信报快递; **`A-1F-GATE`** at the lift hall; A-SIDE door to 星湾路 kept |
| A-2F (podium) | 住客会所: today's fitness, laundry and co-working kit; **`A-2F-LINK`** card door at the skybridge mouth |
| A-44F | 空中会所: lounge, shared kitchen and dining, library, indoor winter garden |

**The visible change (default taken).** H's familiar 1F lobby (check-in, piano lounge, restaurant) moves to 27F at 99 m, and the ground floor becomes an arrival hall plus the residents' lobby. That is how sky-lobby hotels work. Name it on the 1F arrival-hall pick card: `办理入住请乘穿梭梯至 27F 空中大堂`.

---

## 5. Lifts

### 5.1 Banks (`hotel-calc/stack_lifts_v2.out`; codes.md up-peak model, full cars, conservative)

| bank | cars | car | speed | stops | rise | interval | HC5 | notes |
|---|---:|---|---:|---|---:|---:|---:|---|
| **H RB** 酒店公寓客梯 | 4 | 1,350 kg / 18 p | 3.5 m/s | B2, B1, 1F, 3F–12F, 14F–25F (25) | 95.8 m | **46 s** | 27 % | 3 cars → 62 s ✗. Card 梯控 (own floor only). 44 homes per lift. |
| **H SH** 穿梭梯 | 3 | 1,600 kg / 21 p | 6 m/s | B2, B1, 1F, 2F, 27F (5) | 99.4 m express | **32 s** | 43 % | 2 cars → 49 s. Public: guests, diners, spa visitors. |
| **H HL** 酒店客梯 | 4 | 1,600 kg / 21 p | 4 m/s | 27F, 28F–36F, 38F–48F (21) | 80.0 m | **46 s** | 37 % | 3 cars → 61 s ✗. Room-key 梯控 for 28F–46F; 27F / 47F / 48F public. **Stacked on RB's footprint** (§5.2). |
| **H S1** 消防 / 公寓服务梯 | 1 | 1,600 kg, 2.4 m-deep car | 4 m/s | every level B2 → RF (51) | 193.8 m | — | — | 1F → 48F **49.9 s**; → RF 51.4 s |
| **H S2** 消防 / 酒店服务梯 | 1 | same | 4 m/s | B2, B1, 1F, 2F, 26F–48F, RF (28) | | — | — | Zoned fire lift ("所服务区域每层停靠", GB 55037 §2.2.10-1 ✔); passes 3F–25F sealed. Hotel back-of-house: room service, linen, 27F / 48F kitchens. |
| **A L1–L5** 公寓客梯 | 5 | 1,150 kg / 15 p | 5 m/s | B2, B1, 1F, 2F, 3F–12F, 14F–25F, 27F–38F, 40F–44F (43) | 178.0 m | **38 s** | 16 % | 6 cars → 32 s; two zones of 3 → 56–58 s. 61 units per lift. Card 梯控. |
| **A S1 / S2** 消防 / 服务梯 | 2 | 1,600 kg, deep car | 4 m/s | every level (47) | 183.0 m | — | — | 1F → 44F **47.4 s**; → RF 48.7 s |

**Totals:** H 13 cars in 9 shaft positions (RB/HL 4 stacked + SH 3 + S 2); A 7.

**Rules:**
- ≤ 4 cars in a row and ≤ 2 × 4 facing; lobby depth ≥ the sum of facing car depths and < 4.5 m (GB 50352 §6.9.1 ≈). RB/HL (4) face SH (3) across a 4.0 m hall; A's L1–L3 face L4–L5.
- S1 / S2 open into a 合用前室 ≥ 10 m² shared with a stair (public; GB 55037 §2.2.8 ✔), with 甲级 doors above 100 m (§6.4.3 ✔).
- One fire lift per compartment per floor is met by S1 on every floor (§2.2.6 ✔). The hotel floors have two.

### 5.2 Stacked shafts: the vertical budget that sets 26F at 8.6 m

RB (B2 → 25F) and HL (27F → 48F) share one row of four shaft positions, as real sky-lobby towers do. Between RB's top landing and HL's bottom landing the core must hold, in order:

| item | figure (typical traction-lift data ≈; GB 7588 gives the method, not the numbers) | elevation |
|---|---|---|
| RB top landing 25F | | 87.4 |
| RB headroom, top landing → machine-room slab (3.5 m/s) | ≈ 5.2 m | → 92.6 |
| RB machine room (clear + slab) | ≈ 3.2 m | → 95.8 |
| HL pit, pit floor → bottom landing (4 m/s) | ≈ 3.6 m | 95.8 → **99.4 = 27F** |

- **Need 12.0 m, have 12.0 m** with 26F at 8.6 m.
- v1 had 26F at 6.0 m (27F at 96.8): 9.4 m, **2.6 m short**.
- In the game, RB's `shaftLevels` run B2 → 26F (the hoistway rises 1.8 m into 26F) and HL's run 27F → RF. The 26F core cell between them is solid: machine room and pit, drawn as core walls.

Other machine rooms:
- **SH** (6 m/s, top landing 27F at 99.4): headroom ≈ 7.0 m to 106.4, so the machine room fills the core's **south row on 28F** (106.4–109.6). The 28F housekeeping moves to the north façade bay.
- **HL**: overrun to 185.0, so the machine room is in the RF lantern.
- **S1 / S2**: overrun above the RF stop to 191.0; machine room to ≈ 194.2 inside the lantern; the deck is above.
- **A L1–L5**: overrun to ≈ 175.9 (just above RF), so the machine room is in the lantern.

### 5.3 Core (tower-local schematic; the implementer refines the walls)

| zone | x | z | contents |
|---|---|---|---|
| lift hall | −11 … 11 | −2.0 … 2.0 | the through-corridor, widened to 4 m |
| N shaft row | −5.6 … 5.6 | −5.0 … −2.0 | 4 shafts of 2.8 × 3.0: RB (B2–26F) then HL (27F–RF) for H; L1–L3 for A |
| S shaft row | −5.6 … 5.6 | 2.0 … 5.0 | H: SH ×3 + one spare (to 27F), the SH machine room on 28F, then linen and storage; A: L4–L5 |
| fire lobbies | 5.6 … 11 | ±(2 … 10) | S1 (N), S2 (S), each in a 合用前室 ≥ 10 m² with its stair |
| stairs | −11 … −4 | ±(10 … 16) | **ST1 (N), ST2 (S)**: 防烟楼梯间, 1.2 m flights, separate 前室 (GB 55037 §7.4.4 ✔). ST2 exits to the hardstand (H south / A east). Both end at RF; the deck stairs continue outside. |
| façade bays | −4 … 11 | ±(10 … 16) | AHU / 新风机房 behind louvres (N); housekeeping or electrical (S); risers |

**Travel** (GB 50016 Table 5.5.17 ✔, +25 % with sprinklers):
- The farthest suite door is 16.5 m from a stair door, against ≤ 18.75 m (高层旅馆) and ≤ 25 m (公寓) ✓.
- The two stairs are about 20 m apart ✓.

### 5.4 Access control and fire mode (expansion layout only)

| gate (`access-records.js` `gateRecord`) | kind | zone |
|---|---|---|
| `H-1F-GATE` 酒店公寓住户通道 | speed gates (3 lanes, as the community lobbies) | `H-RES-1F` |
| `H-B1-GATE`, `H-B2-GATE` | glass doors at the RB lift lobby | `H-RES-B1`, `H-RES-B2` |
| `A-1F-GATE` | speed gates | `A-1F` |
| `A-B1-GATE`, `A-B2-GATE` | glass doors | `A-B1`, `A-B2` |
| `A-2F-LINK` 住户连廊 | glass door at the skybridge mouth | `A-2F` |

- **Counts:** H/A add **7 gates and 7 zones**. With today's 16 / 14 and p2.md's 8 / 8 for R1–R4, the campus goes to **31 gates / 29 zones**. 西苑 stays at 6 + 6, and 北苑's optional RF gates are off.
  - `riverside-integration.test.js` l. 206 pins `[16, 14]` and must take the final number.
- **Hotel:** no gates. Its security is the room-key 梯控 on HL: a lift attribute `card: 'room-key'` with the public stops listed.
- **Fire mode:**
  - every card gate and door releases on alarm and opens from inside without tools (GB 55037 §7.1.7 ✔);
  - RB / SH / L recall to 1F; HL recalls to 27F (GB 50116 §4.7.1 ≈);
  - the fire-service switch is at the 1F S1 landing (§2.2.10-4 ✔).

### 5.5 In the game

- **Ride.** Today the ride lasts `max(1.2, |Δy| / 7)` s (`elevator-ride.js`): H 1F → 27F would be 14.2 s, 27F → 48F 11.4 s, A 1F → 44F 24.2 s. Use perf.md §6.4's capped, speed-based ride.
  - A hotel guest makes two rides, shuttle then local. That is realistic; keep the skip key.
- **Lift prompt.** The keypad of perf.md §7 / north.md is needed for HL (21 stops) and A (43).
- **Records.** Lifts use the existing `serves` (door levels) and `shaftLevels` (every level the shaft passes), as 北苑 does. New fields: `role` (`residence` / `shuttle` / `hotel` / `service-fire`), `speed`, `card`. `exterior: false`: concrete shafts, no glass enclosure.
- **Cabins.** Each glass cabin costs about 7 draw calls today and is always drawn. For 20 cars: one InstancedMesh per material per tower, drawn only while that tower is entered or focused (the shafts are opaque).

---

## 6. Fire (summary; clauses per codes.md)

| item | H | A | basis |
|---|---|---|---|
| class | 一类高层公共 (hotel + 酒店公寓), > 100 m | 一类高层公共 (serviced apartments = 非住宅类居住建筑) | GB 50016 Table 5.1.1 ✔ |
| building height (fire) | 185.4 m: roof structures ≤ ¼ of the roof (§3.5) | 174.6 m | GB 50016 App. A.0.1 ✔ |
| household refuge room (> 54 m) | **not required**: 酒店公寓 is not 住宅 | not required | GB 50016 §5.5.32 ✔ (住宅 only) |
| refuge floors | 13F / 26F / 37F at 45.5 / 90.8 / 136.8; spacing 45.5 / 45.3 / 46.0; top floor +42.6 | 13F / 26F / 39F; +32.0 | GB 55037 §7.1.14–15 ✔; GB 50016 §5.5.23 ✔ |
| stairs | 2 separate 防烟楼梯间 with separate 前室, 分隔 at refuge floors, to RF; deck stairs to the helideck | 2, same | GB 55037 §7.4.4 ✔, §7.1.9 ✔; GB 50016 §7.4.2 ✔ |
| fire lifts | S1 (every floor), S2 (zone 26F–RF); refuge floors; 4 m/s, 49.9 s | S1, S2 (47.4 s) | GB 55037 §2.2.6 ✔, §2.2.10 ✔; GB 50016 §7.3.8-3 ✔ |
| compartments | 1 per storey (2,112 m²) | 1 (2,099 m²) | GB 55037 §4.3.16 ✔ |
| sprinklers / alarm | yes | yes | §8.1.9 ✔, §8.3.2 ✔ |
| doors > 100 m | 甲级 at stairs, 前室, fire-lift 前室 | same | §6.4.3 ✔ |
| hardstand | south, 66 × 10 m ✓ | west half of 星湾路 (default; local approval ≈) | GB 50016 §7.2.1–2 ✔; GB 55037 §3.4.6–7 ✔ |
| rescue windows | 2 per storey on the S face | 2 per storey on the E face | §2.2.3 ✔ |
| helipad | 停机坪, 26 × 26 m (宜) | 救助设施 (宜) | GB 50016 §7.4.1–2 ✔ |
| separation (tower) | 15.25 m to P1 ✓; 12.85 m to P1W3 / P1W4, with P1W3 classed 一、二级 by default | 13.21 m to P1 ✓; 15 m to P1E ✓ | GB 55037 §3.3.1 ✔ (13 m); 9 / 14 m ≈ |
| separation (podium) | 5.97 m with the fire-wall reduction; fallback 9 m (§2.1) | 7.01 m; fallback 9 m | GB 50016 Table 5.2.2 notes ≈; §5.2.6 ✔ |
| card gates | release on alarm | release on alarm | GB 55037 §7.1.7 ✔ |

---

## 7. Structure

- **Slenderness** (JGJ 3 Table 3.3.2 ✔, 6–7度):

  | | H/B (short) | long direction | frame-core limit |
  |---|---:|---:|---:|
  | H | 185.4 / 32 = **5.79** | 2.8 | 7 |
  | A | 174.6 / 31.8 = **5.49** | 2.6 | 7 |

  - The 11.5 m podium is too small to count as a stiff base, so H is measured from grade.
  - These are the most comfortable towers in the cluster (R1 5.87; 北苑 150 m 6.7).
- **System:**
  - **SRC (型钢混凝土) perimeter columns** on the 11 m suite grid, ≈ 1.4–1.6 m at the base;
  - **RC core 22 × 32 m spanning the full depth**: two 32 m flange walls at x = ±11, with coupling beams over the corridor openings;
  - **RC 山墙** at x = ±33 for torsion;
  - core width ≥ H/12 = 15.5 m ✓ (JGJ 3 §9.2.1 ✔).
- **Height class.**
  - As 型钢混凝土框架-钢筋混凝土核心筒, Table 11.1.2 ✔ allows **190 m at 7度**. H's main roof at 185.4 m keeps **4.6 m** (v1: 3.8 m) and A keeps 15.4 m.
  - Reviewers may class a full-depth core plus end walls as 框架-剪力墙 (B级 7度 140 m, Table 3.3.1-2 ✔). Plan for 超限审查 either way (codes.md rule 16; routine at 200 m).
- **The 26F / 27F tall storeys** (8.6 m + 6.8 m) are the main item (JGJ 3 §3.5.2 ≈: the storey stiffness ratio against the storey above):
  - **26F**: the wing plant mezzanine at +4.3 m is a real slab tied to the columns, which halves their length. Optionally make 26F the **belt-truss storey** (环带桁架 in the 山墙 and façade bays, no outriggers), which double-height plant floors suit.
  - **27F**: thicken the sky-lobby columns and the core walls at 27F; check γ ≥ 0.9.
  - **No outriggers / 加强层.** In the short direction the core already reaches the façade columns. A 加强层 would create the stiffness jump that JGJ 3 §10.3 ✔ asks to avoid when it is not needed.
- **Checks to carry:**
  - drift ≈ 1/650 at 185 m (§3.7.3 ✔, interpolated);
  - wind acceleration ≤ 0.25 m/s² for the hotel and ≤ 0.15 m/s² for apartments (§3.7.6 ✔). The 66 m broad faces face N / S, so **a wind-tunnel test is needed**. No TMD is expected at H/B < 6;
  - the 47F pool (≈ 18 × 7 × 1.4 m, ≈ 175 t of water) on transfer-free framing in the E wing;
  - piles + raft under B2 (H/B > 4, no zero-stress zone, §12.1.7 ≈).
- **Recommended heights** (the composition is in §9.3):
  - **H: main roof 185.4 m, helideck ≈ 196.8 m**;
  - **A: main roof 174.6 m, crown ≈ 184.6 m**.
  - Neither should go higher: H's main roof would pass 190 m, and A's would cost 4 floors (main roof ≈ 188 m, H/B 5.9) to gain a symmetry the gateway already has visually.
- **Policy** (≈ 建科〔2021〕76号): the "no new 超高层住宅" line does not bite, because H and A are public buildings and 公寓. Cities with > 3 M urban population may build 150–250 m.

---

## 8. Exterior and the render budget

### 8.1 Façade concept

**Tripartite slab:**
- **two glass wings** per long face (22 m each);
- a **22 m core spine** between them, in travertine with 8 dark louvre fins. On the N face it hides the AHU louvres. It rises past the wing roofs into the lantern;
- **山墙 end walls** in travertine, each with 4 continuous vertical window slots.

**Wings:**
- unitized curtain wall on a **1.375 m module** (8 per suite). Every 4th mullion is a 0.5 m-deep bronze fin, so the fins mark the 5.5 m half-suite rhythm and the 11 m party walls;
- one 1.0 m travertine spandrel per storey;
- mullions run **continuously** from 2F to the parapet (merged vertically, so 48 storeys cost what 20 do);
- A级 non-combustible façade materials above 100 m (GB 55037 §6.6.6 ✔ is residential-specific; good practice here).

**Bands:**
- refuge floors: horizontal louvre blades on every face, dark at night (exit-sign glow only);
- **26F is the deepest band (8.6 m)**, directly under the 6.8 m clear-glass 27F sky lobby with its projecting bronze fin line. Together they read as one 15.4 m 腰线 at 91–106 m, the classic sky-lobby signature, a storey above the R1–R4 and A bands at 90.8–90.9;
- the 避难区 bays on the hardstand face carry openable fire windows and red rescue triangles.

**Tops:**
- **H**: 47F–48F form a 12 m glass lantern band under the wing parapets. The 22 × 20 m core lantern rises ≈ 9 m and carries the helideck (lit edge, no mast);
- **A**: the 40F–43F LOFT band is 26 m of double-height glass with no mid spandrel (the mezzanine is set back inside), under the 44F club glass, then the core lantern with the name sign.

**Palettes:**
- H keeps the hotel palette: travertine #f3ebdc, bronze #8e7653, glazing #526b76;
- A keeps its own: #dfddd3, metal #454d50, glazing #638087.

The two towers read as siblings, not twins.

**Night:** 2 lit or curtain quads per unit per storey in a rotating pattern (as today); a lit sky lobby and top band; dark refuge bands.

**Podium:** 1F–2F glass with 3.2 m mullions (today's lobby curtain wall, extended to 2F); canopies unchanged.

### 8.2 Measured and prototyped cost (Node, 18 B/vertex; `proto-exterior-v2.out`)

| | today (measured, `geo.mjs` re-run) | proposed (prototype, v2 stacks, real depths) | with +50 % margin for core cells, signs, lobby glass |
|---|---:|---:|---:|
| H exterior | 176,202 v in 9 meshes + 18,580 v of instanced stairs | **26,892 v, 8 meshes**, 8,964 triangles | ≈ 40k v ≈ 0.73 MB |
| A exterior | 149,166 v in 9 meshes + 23,764 v of stairs | **25,224 v, 8 meshes**, 8,408 triangles | ≈ 38k v ≈ 0.68 MB |
| far stand-in | none | **1,008 / 924 v, 2 meshes, 336 / 308 triangles** | ≤ 2,000 triangles (perf.md cap) |
| landing doors | per-level boxes | 278 (H) / 309 (A) instances of a 108 v door: 1 InstancedMesh, 1 draw | |
| protected stairs | one instanced pair per storey height | the 3.4 m flight instanced (2 meshes). The odd heights (3.9, 4.5, 5.0, 6.0, 6.5, 6.8, 8.6) merge into the tower batch. | 0 extra calls |
| 1F lobbies, resident | 236k + 239k v (8.55 MB) | H: two compact lobbies ≈ 120k; A ≈ 150k (estimate) | ≈ 4.9 MB |
| 27F sky lobby, 2F, 44F / 47F / 48F | — | **lazy**, built on first visit and kept in the LRU | not resident |

**Why it is cheap:**
- Every glazed element is merged up the tower. Only spandrels, slabs and lit panes are per storey: about 430 v per storey per tower.
- The per-suite windows, sills, reveals and corridor lights (≈ 1k v per storey today) leave the resident batch. They move to the lazy floor interior or disappear with the curtain wall.
- Slabs are 2 wing boxes per level (the core owns its floors) instead of an extrusion with holes.

**Against perf.md:**
- The all-tall-tower unique-geometry cap allots H/A **2.6 MB**; this uses ≈ 1.4 MB.
- perf.md §4.2 assumed instanced storey modules for H/A at 1.2–1.3 MB plus a mid tier. With the merged curtain wall neither is needed: the near façade is already ≈ 9k triangles, inside perf.md's mid-tier cap (≤ 8k triangles per mesh set, 3 meshes). **Drop H/A from the mid tier**; it stays an R-only item.
- perf.md assumed about 56 storeys (194 m) for H/A (its Q5). The answer is H 48 storeys / 51 levels (main roof 185.4) and A 44 / 47 levels (main roof 174.6). The refuge floors are as above; the modules are none (merged).

### 8.3 Draw calls and triangles

| view | today H + A | proposed H + A | Δ |
|---|---:|---:|---:|
| campus V(110, 430, 480): H 746 m, A 787 m away → far LOD | **115 main-pass calls**, 254k triangles; shadow refresh 59 | **≈ 4–6** (2 far meshes each; 1F lobby, cabins and roof hidden by the LOD) | **≈ −110 calls, −0.25 M triangles; shadow ≈ −55** |
| N1 V(−150, 115, −380): H 317 m, A 205 m → near | ≈ 115 | ≈ 2 × (8 exterior + 2 double-sided glass + 1 doors + 2 stairs + 1 sign + ≈ 18 lobby) ≈ 64 | ≈ −50 |
| inside a hotel floor | GLB instances for 10 suites | for 8 suites (same draws, fewer instances) | 0 |

- perf.md's ≈ 1,950-call campus estimate already counts H/A far LODs (its M1). This design is how H/A deliver them.

**Implementation limits** (perf.md §5 caps):
- near exterior ≤ 8 batched meshes (perf cap 45) and ≤ 45k vertices per tower;
- far ≤ 2 meshes and ≤ 2,000 triangles; silhouette within 0.5 m including the lantern and the helideck;
- the LOD hides the 1F lobby group and the lift cabins beyond 600 m (`farSwap()` from community.js, exported, with extra `near` members);
- every measured view within the campus caps (`perf/measure.cjs`).

### 8.4 Render code shape

- **New `src/render/build/hospitality-supertall.js`** for `b.supertall` towers:
  - `curtainWall()`, `spine()`, `endWalls()`, `refugeBands()`, `skyBand()`;
  - `lanternH()` (deck, net, lights, markings) and `lanternA()` (rescue mark);
  - `podiumGlass()`;
  - `farFacade()` + `farSwap()`;
  - core walls merged up the tower; instanced landing doors;
  - the clipping plane from `setHospitalityCut()` unchanged.
- **Kept for the compact layout:** today's `facadeFloor()` / `windowBay()` / `liftEnclosures()` path.
- **`hospitality-lobby.js` (layout and render)** is parametrized by plate, height and zone set: `createHospitalityLobby(F, usage, { variant: 'arrival' | 'residence' | 'skylobby' | 'club' | 'spa' | 'dining', plate, core })`. The chandelier height follows the storey.
- **Lazy public floors.** Widen `ensureTowerFloor()`'s test to `… || lv.lobbyPlan || lv.amenityPlan || lv.kind === 'refuge'` (refuge fixtures: hydrants, signs, fire windows) and build them through `buildResidenceFloor()`.

---

## 9. What else changes

### 9.1 P1 links

- **The 1F dock, 2F skybridge, B1 metro link and B2 garage link are unchanged**: the podium keeps today's footprint and the 1F / 2F elevations (2F stays at 6.5 m).
- What changes is what they land in:
  - H-2F becomes the public 会议中心, so shoppers no longer arrive on a guest corridor;
  - A-2F becomes the residents' club behind `A-2F-LINK`.
- H-B1 metro arrivals reach RB (card) or SH (public).
- `addTowerGarageRamps()` and the B1 / B2 rows are unchanged, except about two stalls per deck near each core for the new lift lobbies.
- If the podium fallback of §2.1 is needed, the four dock corridors lengthen by 3 m (H) / 2 m (A).

### 9.2 Shadows (`hotel-calc/sun_ha_v2.out`; 大寒日 08:00–16:00, 30.3°N, box model as west.md)

| receiver | today | v2 (H 185.4 / 196.4, A 174.6 / 184.6) | lost to | standard |
|---|---:|---:|---|---|
| 北苑 T1 / T2 south windows, 8F–14F (39.5–61.5 m) | 8.0 h | **6.4 h** | H, 1.6 h around noon | ≥ 2 h (GB 50180 §4.0.9 ≈) ✓ |
| 北苑 T2 south, 20F (81 m) | 8.0 h | 6.95 h | H 1.1 h | ✓ |
| 北苑 T1 south, 20F | 8.0 h | 7.5 h | H 0.5 h | ✓ |
| 北苑 south, 25F and up (≥ 100 m) | 8.0 h | 8.0 h | — | ✓ |
| P1-RF 方庭退台观景台 (the sky-lobby viewdeck, (−235, −225)) | 8.0 h | **6.45 h** | H 1.6 h | ✓ public roof |
| P1-RF 方庭 decks SQ-D1 / SQ-D4 | 8.0 h | 6.0–6.1 h | H 2.0 h | ✓ |
| P1-RF W-wing deck next to H | 6.5 h | **7.6 h**: **better than today**, because the tower steps back 8 m and the podium is lower | H 0.5 h | ✓ |
| 西苑 W2 south (2F and 50 m) | 7.9 / 8.0 h | 6.4 h | H 1.6 h (morning; west.md found the same) | ✓ |
| R1 west face (2F / 60 m) | 3.05 / 3.6 h | 3.3 h | A 0.7 h | ✓ |
| R1 south face | 8.0 h | 8.0 h | — | ✓ |

- **Sensitivity:** H at 150 m would cut 北苑's 8F loss to 0.5–0.85 h and the viewdeck's to 0.5 h. Height does matter at the low floors, but every receiver keeps ≥ 6 h against the 2 h rule, so there is **no code reason to lower H**.
- v1's "height is not the lever" came from the 35.8 m-deep model and is withdrawn.

**In-game sun** (`env.sunDir` (−0.55, 0.78, 0.62): shadows fall NE at 1.06 × height):
- H's 196.8 m top throws a ≈ 209 m shadow NE, across the P1 W-wing roof to the east end of the 方庭 decks (≈ (−108, −237)) and onto P1C.
- A's shadow falls on R1's west face up to ≈ 120 m.
- Both are legitimate and visible. **Shoot them in QA.**
- Shadow camera: with perf.md's overview radius 420, H's and A's tops are inside the frustum.

**Pedestrian wind** (downwash off a 66 m slab) at the H south hardstand and the P1 W roof deck: keep the entrance canopies, add a canopy over the ST2 exit, and note it for the wind tunnel.

### 9.3 Skyline composition (DECISIONS 4; `hotel-calc/skyline.out`)

Apparent top elevation angle, left to right, from the views the user actually sees. 西苑 156.5, 北苑 151 / 143, R1–R4 200 / 189.8 / 179.6 / 169.4.

| view | sequence (top elevation angle) | summit |
|---|---|---|
| 云澜江 · 星湾桥 tour (120, 46, −560) | R3 21.0 · R2 22.8 · **R1 23.8** · A 20.1 · H 14.0 · T2 11.7 · T1 11.8 · W2 10.3 · W1 9.5 | R1 |
| 星湾桥 midspan, facing the campus | R3 39.7 · R2 48.4 · **R1 55.4** · A 51.8 · H 27.5 | R1 |
| 星湾路 at 北外环 | R2 54.2 · **R1 66.3** · A 65.4 · H 31.0 | R1 / A gateway |
| 对岸看北苑 tour (−196, 1.7, −446) | R2 26.0 · R1 30.6 · A 32.9 · T2 33.4 · H 27.9 · **T1 33.8** · W2 28.3 · W1 24.8 | 北苑 in front, H behind it |
| 北苑 tour (−150, 115, −380) | **H 14.5** · T2 9.9 · T1 11.0 · W2 8.4 · W1 7.0 | H |
| 三期 中心广场, facing N | **H 41.1** · W1 17.7 · W2 19.7 · T1 23.9 · T2 24.4 · A 35.6 · R1 35.3 · R2 31.1 · R3 26.7 · R4 22.7 | H |

- **What reads:**
  - one summit per phase, never side by side in a view: R1 over 二期 and the bridge, H over 一期 and 三期;
  - a 星湾路 gateway (A 185 / R1 200), which reads as an equal pair from the road because A is nearer;
  - the ≈ 150 m 北苑 and 西苑 pairs in front by the river, with H 46–54 m above them behind.
- Raising H to 212 m changes only H's own angle (by 1.4–2.2°) and pushes the main roof past 190 m. Lowering it to 186 m loses 一期's summit in the 北苑 and 三期 views. **Keep the deck at ≈ 197 m.**

### 9.4 Files

| file | change |
|---|---|
| `src/layout/hospitality.js` | `buildHospitality()`: `HOSPITALITY.towers.map(t => expansion && SUPERTALL[t.id] ? supertallTower(t) : tower(t))`. Hardstand `HS-H` (and the `HS-A` marking on 星湾路) into `site.fireAccess`. Remove 18 stalls from `hotel-shared-parking` (expansion only). `HOSPITALITY` itself unchanged. |
| **new** `src/layout/hospitality-supertall.js` | `SUPERTALL.{H,A}`: podium and tower rects, stack (§3), core rects, lifts with `serves` / `shaftLevels` / `role` / `speed` / `card`, stairs with `breakLevels`. `supertallTower(spec)` returns the same part shape as `tower()` plus `b.supertall = { podium, tower, refugeLevels, lantern, deckTop }`, `b.zones`, per-level `lv.footprint` / `lv.unitUsage` / `lv.refugePlan` / `lv.amenityPlan`, and the gates and zones. It reuses `addUnit()` (exported), `createSuitePlan()`, `createSuiteMezzanine()` and `createHospitalityLobby()`. |
| `src/layout/hospitality-lobby.js` | variants with plate and core parameters (§8.4) |
| `src/layout/tower-stairs.js` | `breakLevels` (shared with north.md §5.1) |
| `src/layout/access-records.js` or a new `hospitality-access.js` | the 7 gates and 7 zones |
| `src/layout/nav.js`, `elevator-ride.js` | refuge and sky-lobby names in `floorLabel()`; the capped speed-based ride (shared) |
| `src/render/build/hospitality.js` | branch to the supertall builder; retire the roof garden for `b.supertall` |
| **new** `src/render/build/hospitality-supertall.js` | §8.4 |
| `src/render/build/tower-elevators.js` | opaque-shaft cabins, instanced per tower, drawn only when the tower is entered or focused |
| `src/render/build/access-gates.js` | the new gate records (no code change if it stays record-driven) |
| `src/render/app.js` | widen `ensureTowerFloor()`. Core pick card `酒店穿梭梯 ×3 · 酒店客梯 ×4 · 公寓客梯 ×4 · 消防/服务梯 ×2`. Helideck and refuge pick texts. `towerVisibility` unchanged. |
| `src/render/ui.js` | `towerSub` hard-codes `'20层酒店' / '20层公寓'` (l. 22). Derive it from data, as for the community towers. Zones-as-data floor rail (perf.md §7.1). |
| `src/render/explore.js`, `floor-rows.js` | lift keypad and band headers (shared) |
| `src/render/tour.js` | §9.6 |
| `src/render/build/labels.js` | labels at `deckTop + 26` (≈ 223 m for H) |
| `README.md`, `HANDOFF.md`, `docs/` | the stacks, the program, the code table, the budget |

### 9.5 Tests

| test | pinned today | new |
|---|---|---|
| `hospitality.test.js` '酒店公寓各20层…' (l. 14) | 20 floors, 10 units per floor, 728 legacy units | H 48 storeys, A 44; 8 per unit floor, 0 on refuge and public floors; H 320 + A 304 = **624** + R (p2.md 348) |
| `hospitality.test.js` '12部塔楼电梯…' (l. 153) | 12 tower lifts | **36** (H 13, A 7, R 16). Iterate `shaftLevels`; the 26F core cell is solid (RB ends, HL starts at 27F). |
| `hospitality-lobby.test.js` | 190 units per tower; 7-zone 1F; LOFT on A-20F | 1F per variant; `H-27F.lobbyPlan.variant === 'skylobby'`; LOFTs on `A-40F…43F` (32); nav to every zone from its lift |
| `hospitality-relocation.test.js` | 380 units; 190 / 190; lift clearance B2–RF; dock pairs | new counts; dock pairs unchanged (1F / 2F / B1 / B2); clearance per bank and per `serves` |
| `residence-access.test.js` | 728 homes walked | **dedupe by suite signature** (one per variant and storey height) to keep the time flat; otherwise 972 |
| `suite-nav.test.js`, `suite-asset.test.js` | 10 suites per floor | 8 per floor; corner-suite slots on room walls |
| `nav.test.js` | slope `H-ST2-1F-2F-flight-1` | keep the id (ST2 still has a 1F → 2F flight) |
| `tower-stairs.test.js` | continuous stairs | refuge `breakLevels` walk (shared) |
| `riverside-integration.test.js` l. 206 | gates / zones `[16, 14]` | **[31, 29]** once R and H/A land (coordinated); tour captions |
| `fps-frozen.test.js`, `playable.test.js` | compact hash; FPS H/A | **unchanged; run them** |
| new `hospitality-supertall.test.js` | — | tower ≥ 13 m from P1 and ≥ 9 m from the annexes above 2F; refuge spacing (first ≤ 50 m, ≤ 50 m apart, top ≤ 50 m above the last); 26F storey ≥ RB headroom + machine room + HL pit − 3.4; fire lifts stop on every refuge floor and every level of their zone; passenger lifts sealed on refuge floors; 1F → top ≤ 60 s at rated speed; RB and HL never share a stop; roof structures ≤ ¼ of the roof; gate geometry (`gateRecordErrors`); hardstand 5–10 m off the face and ≥ the long side |
| new render test | — | ≤ 8 near meshes, ≤ 45k v per tower; far ≤ 2 meshes / ≤ 2,000 triangles; silhouette within 0.5 m including the lantern and deck; rays through a refuge band hit a louvre; nothing above the deck within 5 m |

### 9.6 Tour

Add two steps after the 一期 main-entrance segment and before the riverside steps, keeping the sky-lobby order rule (skylobby SPEC §12). Positions derive from the layout, as for the other steps; perf.md §7.5 solved the framing numerically.

1. `云澜酒店 · 约 200 米超高层（空中大堂 · 云端酒吧 · 停机坪）`: pos ≈ V(−100, 160, 125), target V(−251, 110, −78), dur 6, shadow 300.
2. `云澜酒店 27F 空中大堂 · 办理入住`: building `H`, focus `H-27F`, eye at ≈ 101 m in the E wing looking west along the gallery, dur 5.

Optional third step: `云澜服务公寓 · LOFT 与空中会所`, from the river side. Update the caption list in `riverside-integration.test.js`.

### 9.7 UI and layout cost

- **Floor rail zones** (`b.zones`):
  - H: `1–2F 大堂 · 会议` · `3–25F 云澜酒店公寓` (13F 避难层 separator) · `26F 避难层 · 设备层` · `27F 空中大堂` · `28–46F 酒店客房` (37F 避难层; 44–46F 行政楼层) · `47F 水疗泳池` · `48F 云端餐厅酒吧` · `RF · 停机坪`;
  - A: `1F` · `2F 住客会所` · `3–38F 服务公寓` (13F / 26F 避难层) · `39F 避难层` · `40–43F LOFT` · `44F 空中会所` · `RF`.
- **Directory:** the `电梯` stat counts banks.
- **Layout cost:**
  - H/A levels 46 → **98**; unit records 380 → **624**;
  - heap ≈ +2.1–2.5 MB of plan JSON (8.4 kB per suite). Sharing one `suitePlan` per variant cuts the heap;
  - nav: perf.md §6.1's plan sharing makes the 40 identical suite floors per tower nearly free;
  - estimate buildLayout +0.5 s and nav +0.2 s with sharing.

---

## 10. Risks

| # | risk | mitigation |
|---|---|---|
| R1 | **The familiar 1F hotel lobby moves to 27F** (default taken); the ground floor becomes an arrival hall | The content is reused and found at 99 m; the 1F pick card points there |
| R2 | **A's hardstand is on 星湾路** (no in-site long side; pre-existing at 74 m) | Default: the west half of the road, markings only. Needs local acceptance (≈). Fallback: a local narrowing with an in-site lay-by. |
| R3 | **Podium gaps 5.97 / 7.01 m** rely on the Table 5.2.2 fire-wall note for the podium of a > 100 m building | Fire authority to confirm. Fallback: podium faces to 9 m (§2.1), docks +3 / +2 m. |
| R4 | **P1W3 "木构茶舍" at 12.85 m**: a true 木结构 needs 14 m | Default: classed 一、二级 with timber cladding. A rebuild is impossible without moving H. |
| R5 | **A's 13.21 m to P1 has 0.21 m of margin** | Lock P1's NE corner in a test; never widen A's corridor |
| R6 | **Stacked RB / HL shafts** depend on the ≈ lift figures (5.2 / 3.2 / 3.6 m) | 26F is sized exactly to them. If the chosen product needs more, raise 26F (≤ +1.0 m keeps the main roof < 187 m) or use a side machine room with diverter sheaves. |
| R7 | 26F (8.6 m) + 27F (6.8 m) tall storeys; a 33 % core | Plant mezzanine / belt truss at 26F; thicker 27F columns; 超限 review |
| R8 | 超限 review and wind tunnel (broad 66 m faces) | Normal at this height; numbers in §7 |
| R9 | **18 of 22 hotel surface stalls** become the H hardstand | Default: they move to H-B1 / B2; sign the lot 消防登高场地 |
| R10 | 20 lift cars; each always-drawn glass cabin costs about 7 calls today | Instanced, hidden outside the tower (§5.5) |
| R11 | Test time and heap (624 H/A homes) | Dedupe by suite signature; share `suitePlan` objects; perf.md nav sharing |
| R12 | Two H/A implementations (compact and expansion) | One `supertallTower()` module; compact path frozen by test |
| R13 | Gate / zone totals pinned in several tests, with three studies adding gates | Land R and H/A together, or pin the totals in one shared constant |
| R14 | The helideck depends on the 150 m 北苑 choice for open sectors | Primary approach north over the river. If 北苑 ever goes to 200 m, re-check the T1 sector (v1 found it closed). |
| R15 | The user may notice the residences' lobby inside a building named 云澜酒店 | HUD and pick text `云澜酒店公寓 · 住户大堂`; the zone headers name both products |

---

## 11. Defaults taken (for SPEC.md) and remaining questions

**Defaults taken** (DECISIONS 5: the designer's recommendation where nothing conflicts):

1. **H program R:** 酒店公寓 3F–25F (176) + 26F refuge / transfer + 27F 空中大堂 + hotel 28F–46F (**144 keys**) + 47F spa and pool + 48F sky dining and bar.
2. **Check-in, the piano lounge and the restaurant move to 27F**; 1F becomes the arrival hall plus the residents' lobby.
3. **Heights:** H main roof 185.4 m / helideck ≈ 196.8 m; A main roof 174.6 m / crown ≈ 184.6 m (§9.3).
4. **A's hardstand:** the west half of 星湾路 along A's 66 m frontage, markings and street furniture only.
5. **P1W3** is classed 一、二级 (timber cladding), so 9 m applies.
6. **Helideck on H and a winching area on A:** both included.
7. **18 hotel surface stalls** become H's hardstand; they move to B1 / B2.
8. **Glass lifts:** none. Every lift is in the fire-rated concrete core, and today's glass lifts are retired in the expansion variant.
9. **Continuous floor numbering**, refuge floors numbered; the 26F plant mezzanine is not a numbered floor.
10. **Podium:** today's footprint with the P1-facing fire wall; the 9 m fallback only if the authority requires it.
11. **Roof gardens** on H / A RF retired in the expansion variant; amenities indoors and on the 2F podium roofs (non-accessible planting).

**Remaining questions** (genuinely the user's, not code):

1. **Ride time** (shared with perf.md Q1): a real ≈ 45 s two-leg ride to 48F, or a capped ride with the real time shown?
2. **Confirm the 27F lobby move.** The default is taken, but it is the one change the user will see first in a familiar building.
3. **Fire-authority items to confirm in a real project:** the podium reductions (R3) and the municipal-road hardstand (R2). In the model they are defaults; in reality they are approvals.

---

## 12. Method and scripts (`hotel-calc/`; `node <script> <worktree>` or `python3 -I <script>`)

| script | what | output |
|---|---|---|
| `measure.mjs` | H/A levels, lifts, stairs, entrances, docks, nearest neighbours | `measure.out` (v1, unchanged sources) |
| `geo.mjs` | today's H/A exterior and lobby meshes and vertices (Node three, real `buildHospitality`). It stops at `buildPublicGarageShells` after the towers are complete; the tower numbers are whole. | `geo.out` (re-run at `9bdb886`, identical) |
| `gaps.mjs` | separations of the proposed tower and podium rects from every outline; stalls under the H hardstand | `gaps.out` (re-run, identical) |
| **`stack_lifts_v2.py`** | the v2 H stack and A, refuge spacing and areas, the **stacked-shaft vertical budget**, machine-room positions, lift traffic, fire-lift 60 s, ride times | `stack_lifts_v2.out` |
| `stack_lifts.py` | v1 stacks (R, O, A) and the alternatives' lift banks | `stack_lifts.out` (superseded for H) |
| **`sun_ha_v2.py`** | 大寒日 sun hours with the 32 m H depth, v2 heights, 北苑 150 m, 西苑 S47, R1–R4 as decided, plus the P1-RF viewdeck | `sun_ha_v2.out` |
| **`skyline.py`** | apparent top angles and left-to-right order from six views, for H at 196 / 186 / 212 m | `skyline.out` |
| **`proto-exterior-v2.mjs`** | the curtain-wall exteriors and far stand-ins with the real `BatchSet`, v2 stacks, 32 / 31.8 m depths (not wired into the app) | `proto-exterior-v2.out` |
| `proto-exterior.mjs`, `sun_ha.py` | v1 (35.8 m H depth) | superseded |
| `neighbours.mjs`, `outline.mjs` | P1 outline, annex roofs, P1-RF decks, roads near H/A, hotel-lot stalls | (console) |

The campus draw-call figures for H/A come from `perf/out/bd-after-campus.json`, re-aggregated for this version (H 58 / 130,454 triangles; A 57 / 123,794; shadow 30 / 29).
