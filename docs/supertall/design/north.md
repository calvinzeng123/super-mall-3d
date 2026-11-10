# 云澜·北苑 T1 / T2 · 约 200 m 超高层延伸（设计研究）

Study label `supertall/north`, 2026-11-05. Base: `/home/user/super-mall-3d` at **`f7a3655`** (`merge: 北苑 7F 空中大堂 from the mall roof`). At that commit both parallel workflows have already landed:

- the doors work (`8bc9336`): door leaves are layout records and nav obstacles;
- the 7F 空中大堂 (`c82f17b`): the P1-RF ⇄ T-7F portals, `T1/T2-7F-GATE`, 16 gates and 14 zones, `towerVisibility`, the floor-rail podium row and the tour steps.

This design builds on both and undoes neither.

Nothing in the main checkout was edited and nothing was committed. Measurements and the plan-generation prototype ran in a detached scratch worktree, which has since been removed.

The code rules are cross-checked against the codes agent's note `/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/res/supertall/codes.md`, cited below as **codes.md**. This design follows codes.md on:

- refuge floors designed at 44–48 m and 45–48 m apart;
- outrigger refuge floors 5.4 m tall;
- the interlock ending in a single-level home at each refuge floor;
- 三合一前室 ≥ 12 m².

It differs from codes.md on one point, the height. codes.md rates 北苑 at 200 m 🔴, with a credible cap at a roof of about 150 m. This design gives the 200 m the user asked for **and** a data-level 150 m variant (§6.3, open question Q1).

**Prototype files**, all under `/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/res/supertall/proto/`:

| file | what |
|---|---|
| `north-gen.mjs` | Runs the **unchanged** generator (`src/layout/community-plan.js`) for a full ~50-home stack per tower. Run as `node north-gen.mjs <worktree> T1 out.json`. |
| `T1.json`, `T2.json`, `T1.log`, `T2.log` | Its output: 54 / 50 homes, 78 / 70 level plans, 0 `validateHome` errors, every home distinct, 156 s / 150 s, 6.9 kB per level plan. |
| `stack2.mjs` | The storey stacks (200 m and 150 m variants): refuge spacing, H/B, home counts, derived lift stops, the GB 50096 skip check, lift and ride times. |
| `list2.mjs`, `list.md` | The floor-by-floor tables in §1.2. |

**Measured baselines** at `f7a3655` (Node three, the `tests/community-render.test.js` method):

- community resident geometry: 552,293 vertices = **9.941 MB**;
- T1 / T2 exterior: 81,642 / 81,306 vertices, 8 meshes each;
- 7F groups: 14,160 / 9,492 vertices;
- exterior cost per north storey: 4,130–4,540 vertices, because per-plan windows stop the vertical merge;
- plan data: 514,519 B, of which north is 458.7 kB for 68 level plans (6.75 kB each);
- layout build 2.5 s, nav 0.7 s, 130 nav floors in the north towers;
- 16 gates, 14 zones.

---

## 0. Decisions on one page

1. **Keep 7F–23F and extend above them.**
   - The homes on 8F, 9F, 11F–13F and the 14F–23F interlock stay byte-identical.
   - **T1** rises to **48F, RF 186.9 m, crown 199.9 m**.
   - **T2** rises to **44F, RF 173.7 m, crown 184.7 m**.
   - T2 is deliberately lower: the skyline steps, and T2 is less slender.
2. **Three refuge floors**, at the same elevations in both towers so that the louvre bands line up across the pair:

   | | floor | elevation | storey | notes |
   |---|---|---|---|---|
   | R1 | 10F | 46.2 m | 3.6 m | replaces 10W / 10E |
   | R2 | 24F | 93.6 m | 5.4 m, outriggers | replaces 24W and 23–24E |
   | R3 | 36F | 141.9 m | 5.4 m, outriggers | |

   - Spacing is 46.2 / 47.4 / 48.3 m, inside codes.md's design windows of 44–48 m and 45–48 m.
   - The top occupied floor is +41.7 m (T1) and +28.5 m (T2) above R3.
   - The rescue ground is the ground hardstand HS1 / HS2 at 0.0 m, not the 34 m podium roof (§1.3).
3. **Product bands, bottom to top:**
   - 7F 空中大堂;
   - L, 8F–13F: 江景大平层, 3.6 m;
   - D, 14F–23F: interlocking 错层复式, 3.3 m. Kept: it starts at 14E and now ends at a new single-level 23E (codes.md §19);
   - C, 25F–35F: **云端大平层**, new, 3.9 m;
   - H, 37F–46F (T1) / 37F–42F (T2): **空中大宅**, new. Two-level 5BR homes; W and E enter on the same odd floors;
   - PH, the top pair: **顶层复式**, with a private roof terrace on RF reached by the home's own private lift.

   A single-level full-floor 空中大宅 is impossible. The core spans the plate's full 16 m depth, and the two wings meet only through the shared fire lobby (§2.2).
4. **Home counts:**
   - **T1: 55 homes / 76 level units. T2: 51 / 68. North: 106 homes / 144 level plans**, up from 48 / 68.
   - 40 are kept and 66 are new.
   - 8 are removed: 10W, 10E, 24W and 23–24E in each tower.
   - Every home differs within its tower. The prototype found 54 / 50 distinct homes with the unchanged generator.
5. **Lifts: 4 per tower in the unchanged 8 × 16 core:**
   - **LW** and **LE**: private, 6 m/s, each serving its side's entry floors and RF;
   - **LF**: fire lift, 5 m/s, every floor;
   - **LS** (new): second fire lift and 服务梯, 5 m/s, every floor.

   The north band is re-slotted into four 1.9 m shafts. The fire lobby F widens to 3.8 × 3.2 = 12.2 m². That also fixes today's 9.0 m² 三合一前室, which is below the GB 50016 §5.5.28-4 minimum of 12 m².

   The core **cannot grow** at the podium. T2 is boxed in by the mall's `P1-SQ-ST-SV` stair and `P1-SQ-F1` freight lift to the east, and by its own 1F lobby and the sky lobby to the west (§4.2).
6. **Fire:**
   - On each refuge floor every stair is **分隔**: a partition and a second door per stair. Evacuees must cross the refuge area (GB 55037 §7.1.9).
   - LF and LS open on every refuge floor; LW and LE pass sealed.
   - Each home tags one **户内避难间** (GB 50016 §5.5.32).
   - Each storey gets two marked rescue windows (消防救援口) on the river face above HS1 / HS2 (GB 55037 §2.2.3).
7. **Structure:** H/B in the N–S direction above the podium is **9.6 (T1) / 8.7 (T2)**, against a JGJ 3 Table 3.3.2 limit of 6–8. The towers are 超限 (codes.md: 🔴).
   - Mitigations:
     - shear walls that run the full 16 m depth;
     - outriggers and belt walls on R2 / R3;
     - steel-plate composite walls in the lower third;
     - walls continuous through P1 to the raft;
     - chamfered corners and a porous crown;
     - a tuned damper in the crown.
   - **150 m variant**: drop R3 and above. T1 RF ≈ 141 m, H/B 6.7 (§6.3).
8. **Exterior: a plan-independent unitized curtain wall** replaces today's per-plan punched windows.
   - Mullions and vision glass merge vertically, so the resident geometry no longer grows with the floor count.
   - Plan detail moves to the lazily built per-floor interior.
   - Still 8 exterior meshes per tower, plus a north **far LOD** (2 meshes) beyond 600 m.
   - Estimate: north resident geometry **3.36 MB → about 1.6 MB**, and about −16 campus main-pass calls (§7.5).

| key number | T1 | T2 |
|---|---|---|
| floors (own levels) | 7F–48F + RF = 43 levels; 48 storeys counting 一期 1F–6F | 7F–44F + RF = 39 levels; 44 storeys |
| RF (fire height, GB 50016 App. A) / crown top | 186.9 m / 199.9 m | 173.7 m / 184.7 m |
| plate / core | 36 × 16 m / 8 × 16 m (unchanged) | 32 × 16 m / 8 × 16 m (unchanged) |
| homes / level units | 55 / 76 (21 two-level) | 51 / 68 (17 two-level) |
| homes per private lift | W 27, E 28 | W 25, E 26 |
| lifts | 4: LW, LE at 6 m/s; LF, LS at 5 m/s | 4 |
| stops | LW 32, LE 33, LF / LS 46 | LW 30, LE 31, LF / LS 42 |
| fire lift 1F → RF | 42 s at 5 m/s (≤ 60 s, GB 50016 §7.3.8-3) | 40 s |
| refuge floors | 10F 46.2 · 24F 93.6 · 36F 141.9 | same |
| H/B (N–S, B = 16 m), above podium / from ground | 9.6 / 11.7 | 8.7 / 10.9 |

---

## 1. Storey stack, 7F (34 m) to about 200 m

### 1.1 Approach

- **Floor numbers stay continuous.**
  - No 4 / 13 / 14 skipping, and no unnumbered refuge storeys. The user has already asked once where "missing" floors went (SPEC skylobby §13).
  - Refuge floors are numbered storeys named `10F 避难层`.
- **Kept floors stay put.** 7F–23F keep their numbers and elevations. Three kept floors change use:
  - 10F becomes R1;
  - 24F becomes R2, at the old 24F elevation of 93.6 m;
  - on 23F, the E side becomes a new single-level end flat (23E).
  - The tests that name `T1-14F/15F`, `T1-16F/17F`, `T2-16F/17F` and `T2-20F` stay valid. Only the three `T1-10F` / `T2-10F` references move to 11F (§8.2).
- **Why 10F rather than 11F for R1.** 11F (49.8 m) would also be legal and would avoid touching any test. But it leaves 0.2 m of margin under the 50 m limit, and it pushes R2 to 25F at 96.9 m. That breaks codes.md's 44–48 m design window. 10F at 46.2 m keeps a 3.8 m margin.
- **Storey count.** The duplex stair has a fixed 3.3 m rise (`DUPLEX_STAIR`). Floor heights are:
  - 大平层 3.6 m;
  - 云端大平层 3.9 m;
  - refuge floors 3.6–5.4 m.

  At these heights 200 m comes to **48 storeys** counting the mall's 1F–6F, not 55–65; that range assumes 3.0 m ordinary floors, as in R1–R4. The 200 m height is kept, and the storey count follows from it.

### 1.2 Floor by floor

T2 is identical up to 36F. Above it: 37F–42F 空中大宅, 43F–44F 顶层复式, RF 173.7 m. The full tables are in `proto/list.md`.

| floor | elev m | storey m | use |
|---|---:|---:|---|
| 7F | 34.0 | 5.0 | 空中大堂 + 住户会所 (kept, sky-lobby spec) |
| 8F, 9F | 39.0, 42.6 | 3.6 | 江景大平层 W / E (kept) |
| **10F** | **46.2** | 3.6 | **R1 避难层**: refuge area, PRV station, fresh-air plant. No outrigger. Was 10W / 10E. |
| 11F–13F | 49.8, 53.4, 57.0 | 3.6 | 江景大平层 W / E (kept) |
| 14F–23F | 60.6 … 90.3 | 3.3 | Interlocking duplexes: W 14–15, 16–17, 18–19, 20–21, 22–23; E 15–16, 17–18, 19–20, 21–22. Single-level 14E (kept) and **23E (new)**. |
| **24F** | **93.6** | 5.4 | **R2 避难层 + 设备层**: outrigger and belt walls, fire-water transfer tank and pumps, pressurization fans for segment 1. Was 24W and the upper level of 23–24E. |
| 25F–35F | 99.0 … 138.0 | 3.9 | 云端大平层 W / E (new, 22 homes) |
| **36F** | **141.9** | 5.4 | **R3 避难层 + 设备层**: outrigger and belt walls, domestic-water PRVs |
| 37F–46F | 147.3 … 177.0 | 3.3 | 空中大宅: 37–38, 39–40, 41–42, 43–44, 45–46, W and E (new, 10 homes) |
| 47F, 48F | 180.3, 183.6 | 3.3 | 顶层复式 47–48 W and E (new, 2 homes) |
| RF | 186.9 | 3.2 | Roof plant: TMD / TLD, 6 m/s machine rooms, BMU, top pressurization fans; the two private terraces. Crown fins to 199.9 m. |

**Records** (`src/layout/community-sites.js`):

- Replace the shared `northLevels` with `northStack(top)`. It returns `{ short, levelNumber, elev, height, kind, band }`.
  - `kind` gains `'refuge'`.
  - `band` is one of `L | R1 | D | R2 | C | R3 | H | PH | RF`.
- `NORTH_SITE.towers[i]` gains `top` (48 / 44), `crown` (13.0 / 11.0) and `levels`.
- `NORTH_SITE.refuge = ['10F', '24F', '36F']`.
- `NORTH_SITE.levels` remains as T1's stack for existing readers. The contract fixture uses it for 14F / 15F, which are unchanged.

### 1.3 The 50 m rule and the 34 m podium

**Clauses:**

- GB 55037-2022 §7.1.14 (mandatory; codes.md ✔): "建筑高度大于 100m 的工业与民用建筑应设置避难层，且第一个避难层的楼面至消防车登高操作场地地面的高度不应大于 50m".
- GB 50016-2014 (2018) §5.5.23-1: refuge floors "宜" ≤ 50 m apart.
- GB 50016 §5.5.31: the same applies to residential buildings over 100 m.
- GB 55037 §7.1.15-2: a refuge floor holds nothing except the refuge area and plant.

**How the podium counts:**

- The 消防车登高操作场地 for 北苑 is the pair of ground hardstands HS1 / HS2 on 北外环, at y = 0.0 and 5 m north of the tower faces.
- The P1 roof (34 m) has no appliance access. It is the escape route for the 7F sky lobby's public part, but it is not a rescue ground.
- So the 50 m is measured from 0.0: **the first refuge floor must be at ≤ 50 m absolute**. That leaves 7F–11F.
- 7F is the public sky lobby and club, so it is excluded (§7.1.15-2).
- **10F at 46.2 m** is inside codes.md's 44–48 m design window.
- Test pins (§8.2):
  - `R1.elev − HS.y ≤ 50`;
  - consecutive refuge floors ≤ 50 m apart;
  - top occupied floor − R3 ≤ 50.
- Building height for fire classification is measured from grade, not from the P1 roof (GB 50016 App. A.0.1; codes.md §1).

**Refuge area** (GB 55037 §7.1.15-1, GB 50016 §5.5.23-3: 5 persons/m² for the floors between this refuge floor and the next one up). Persons per home follow codes.md: 3BR 4.0, 4BR 5.0, 5BR taken as 6.0.

| refuge floor | serves | homes | persons | net area needed | provided |
|---|---|---:|---:|---:|---:|
| R1 10F | 11F–23F | 17 | ≈ 86 | 17 m² | ≈ 2 × 100 m² (T1) / 2 × 85 m² (T2): the north (hardstand-face) halves of both wings |
| R2 24F | 25F–35F | 22 | ≈ 103 | 21 m² | same |
| R3 36F | 37F–48F (T1) | 12 | 72 | 14 m² | same |

Homes on 8F–9F, below R1, evacuate downward.

**Refuge floor plan** (new `lv.refugePlan`, tower-local; wings are W x[wx0, −4] and E x[4, ex1]):

- **避难区 W / E** = the landing corridor W / E plus the north half of each wing, z[−8, 0].
  - It faces the river and the hardstand (codes.md §3: the refuge area must face the rescue side).
  - It is ventilated on two orientations (N and the end face) through openable 乙级 fire windows (GB 55037 §6.4.7-2).
  - On refuge floors the W / E landings are corridors: `open: true` but with no lift door.
- **设备区 W / E** = the south halves, z[0, 8]. W holds the transfer tank and pumps (R2) or the PRV station; E holds the electrical and pressurization fan rooms.
  - A 3.00 h wall at z = 0 separates them from the refuge area. On R2 / R3 this is also the outrigger wall line (§6).
  - Access is only through a 防火隔间 (vestibule) with 甲级 doors (codes.md §3; GB 50016 §5.5.23-4).
- **Fixtures**, drawn and named on the pick cards:
  - 消火栓箱, 软管卷盘 and extinguisher;
  - 消防专线电话 and 应急广播;
  - 避难层 signs at every stair door;
  - emergency lighting.
- **HUD:** `云澜·北苑 1 号楼 · 10F 避难层（避难区）`. Level name `10F 避难层`; label `避难层 · 设备层 · 消防电梯停靠`. The floor rail shows 避难层.

### 1.4 RF and the crown

**RF** stays `kind: 'roof'`. The **residents' roof garden goes**: a shared open deck at 187 m is not credible. The shared amenities stay on 7F and the P1 roof. RF has two zones:

- **Core zone:** F, both stair doors, LF / LS. It leads into the crown plant:
  - machine rooms for the 6 m/s lifts;
  - the high-level fire tank. GB 50974-2014 §5.2.1 (codes.md ≈) asks ≥ 36 m³ for residential over 100 m; this design provides it as part of the damper water (§6);
  - the TMD / TLD room;
  - the BMU 擦窗机 track;
  - the top pressurization fans.
- **W and E private terraces**, one per penthouse, behind the crown's glass wind screen.
  - The penthouse's own private lift (LW for W, LE for E) stops at RF and opens onto its terrace landing. These are the `RF` entries already in `northStops()`.
  - The exit route is the existing landing ↔ F fire door. Modelled as an open door; the pick card reads `顶层复式私家露台 · 消防联动释放`.
  - In reality the door is card-locked from F and releases on alarm, from the terrace side without tools (GB 55037 §7.1.7).
  - Optional: make the two doors `glass-door` gate records (+2 gates, +2 zones per tower: gates 16 → 20, zones 14 → 18). **Default: off.**

**Crown** (render, §7.3): the curtain-wall fins rise 13 m (T1) / 11 m (T2) above RF. A core "lantern" carries the tower name and the aviation lights.

---

## 2. Home types and counts

### 2.1 Bands

| band | floors | data `kind` | types | per-level size | homes T1 / T2 |
|---|---|---|---|---|---|
| L (kept) | 8, 9, 11, 12, 13 | `flat` | 3BR / 4BR lux | 16 × 14 (T1, 224 m²) / 16 × 12 (T2, 192 m²) | 10 / 10 |
| D (kept + 23E) | 14–23 | `duplex` (interlocked) + `flat` 14E / 23E | 4BR / 5BR; 23E 3BR / 4BR | same | 11 / 11 |
| C (new) | 25–35 | `flat` | 3BR / 4BR / 5BR, 3.9 m storey | same | 22 / 22 |
| H (new) | 37 … | `sky-duplex` (aligned: W and E enter on the same odd floors) | 5BR, 挑空 where the generator allows | 448 / 384 m² | 10 / 6 |
| PH (new) | top pair | `penthouse` | 5BR + 挑空 + roof terrace | same + ≈ 200 m² terrace | 2 / 2 |
| **total** | | | | | **55 / 51** |

**Titles and codes:**

- `23E 端户大平层`, `25W 云端大平层`, `37–38W 空中大宅 · 下层 / 上层`, `47–48W 顶层复式 · 上层`.
- Keep the `${l0}${l1}${side}` tags (`T1-3738W-L`).
- The `penthouse-flat` kind (24W) disappears with 24W.

**About "错层".** The user's 错层复式 are, structurally, **跃层** homes on aligned slabs, interlocked only by which floor they enter on. codes.md §19 notes that a true structural 错层 would cap the height at 80 m. So the slabs must stay aligned, as they already are.

**Duplex 挑空:**

- The generator gives T1 (14 m wings) a void about half the time: 5 of 10 duplexes today, 9 of 24 two-level homes in the prototype.
- It gives **T2 (12 m wings) none**, today or in the prototype. Its "a 挑空 living must stay inside the public column" rule rejects every T2 candidate.
- So T2's 空中大宅 / PH get flat ceilings unless the generator is extended (risk R6).

### 2.2 Why there is no full-floor 空中大宅

- `NORTH_CORE` is rect(−4, −8, 4, 8): it spans the full plate depth.
- The W and E wings touch only through the landing band, and its middle third, F, is the 三合一前室 (both stairs plus the fire lifts). That must stay a shared protected space.
- So 空中大宅 is defined as a **two-level wing home**: 448 / 384 m², 5BR, with a private lift hall on the entry level.

### 2.3 户内避难间 (GB 50016 §5.5.32)

- **The rule** applies to residential buildings over 54 m. Every home needs one room on an external wall with an openable window. Its walls must be ≥ 1.00 h; its door 宜 乙级; its window integrity 宜 ≥ 1.00 h.
- **It is already owed today**, because the 97 m towers exceed 54 m. It applies to all 106 homes, kept and new. codes.md §7 also lists 西苑 and R.
- **Generator** (`src/layout/community-plan.js`):
  - Set `residence.refugeRoom = '<room id>'`. Use the master bedroom; on a two-level home, the entry-level guest bedroom. Prefer one on the N (hardstand) face.
  - `validateHome` checks the room exists, is a bedroom or study, and has a window.
- **Render:**
  - The room's door leaf from `doorLeaves()` gets `fire: '乙级'` and a fire-door finish.
  - Its curtain-wall bay gets an operable vent.
  - Pick card: `主卧（户内避难间 · 乙级防火门 · 1.00 h 墙）`.
- **Data:** the kept homes gain one field; their geometry is unchanged.

---

## 3. Plan generation

### 3.1 Extend, do not regenerate

The north data is "locked" (the test comment reads "北苑部分锁定"). The doors work and the catalog depend on the kept homes. So `scripts/prepare-community-plans.mjs` gets a mode that leaves them alone.

**`--extend-north`:**
- Load `COMMUNITY_PLANS.north`.
- Drop `T?-10W`, `T?-10E`, `T?-24W` and `T?-23E` (the 23–24E duplex).
- Seed `used` with the keys and signatures of **every** existing home, dropped ones included, so the drop cannot change the result.
- Generate in a fixed order: 23E, then bands C, H, PH.

**Key replay:**
- `meta.key` is not stored, but it can be rebuilt from `rooms` (`kind:x0,z0,x1,z1`, sorted).
- Export `planKey(residence)` so the script and the tests can rebuild the exclude set from the data alone.

**Recorded spec:**
- Store `spec: { type, variant, voidAbove }` on each part (about 40 B).
- A test can then regenerate any home with `exclude` set to the keys of the other homes in its tower.

**Full regeneration** (`node scripts/prepare-community-plans.mjs`):
- It runs the old north loop with the dropped homes generated and then discarded, followed by the new bands.
- Both modes give byte-identical output. A test checks this on one tower.

**Band table** (replaces the hard-coded loops):

```js
export const NORTH_BANDS = [
  { band: 'D-end', floors: [23, 23], side: 'E', kind: 'flat', types: ['4BR'] },
  { band: 'C', floors: [25, 35], kind: 'flat', types: { T1: ['4BR', '3BR', '5BR', '4BR'], T2: ['3BR', '4BR', '4BR', '3BR'] } },
  { band: 'H', floors: [37, 'top-2'], kind: 'sky-duplex', step: 2, sides: 'both', type: '5BR', voidAbove: true },
  { band: 'PH', floors: ['top-1', 'top'], kind: 'penthouse', sides: 'both', type: '5BR', voidAbove: true },
];
```

**Diversity:**
- Uniqueness stays by `planSignature`, per tower.
- So that 22 C flats per tower do not slide down the candidate ranking, extend `program()` with variant extras: 茶室, 家庭厅, 工人房 + 卫, 双主卧套房, 酒窖 / 储藏.
- Gate on `meta.rank ≤ 24` and log `meta.score`.

### 3.2 Evidence: the prototype, with the generator unchanged

`proto/north-gen.mjs` built a superset mix per tower:
- 28 flats;
- 2 end flats;
- 12 interlocked duplexes;
- 10 / 6 two-level 5BR homes;
- 2 penthouses.

| | T1 | T2 |
|---|---|---|
| homes / level plans | 54 / 78 | 50 / 70 |
| missing / `validateHome` errors | 0 / 0 | 0 / 0 |
| distinct (`planSignature`, per tower) | 54 / 54 | 50 / 50 |
| time (nice 10, shared 4-CPU machine) | 156 s | 150 s |
| time per kind | flat 0.9 s · duplex 1.7 s · two-level 5BR 8.7 s · PH 11 s | flat 0.7 s · duplex 3.8 s · two-level 10.3 s · PH 11.2 s |
| JSON per level plan | 6.94 kB | 6.89 kB |
| two-level homes with 挑空 | 9 of 24 | **0** |
| most variant tries for one home | 16 | 16 |

### 3.3 Numbers for this design

| | now | proposed |
|---|---|---|
| north homes / level plans | 48 / 68 | **106 / 144**: 40 kept, 66 new (T1 35, T2 31) |
| west | 10 plans, 48 kB | unchanged here (the west agent's) |
| `src/layout/community-plan-data.js` | 514.5 kB | **≈ 1.04 MB** (144 × 6.85 kB + 48 kB + wrapper) |
| `--extend-north` time | — | **≈ 4 min**: T1 23 flats + 12 two-level ≈ 130 s, T2 ≈ 100 s |
| full regeneration | ≈ 80 s | ≈ 5–6 min |
| determinism | spec → plan | unchanged: fixed band order, seeded `used`, no randomness, no clock |

### 3.4 Size

- Prototype field shares: `partitions` 36 %, `rooms` 24 %, `facadeWalls` 22 %, `homeStair` 5 %, `bathrooms` 4 %, `obstacles` + `beds` 6 %.
- **Recommended:** raise the cap in `tests/community-plans.test.js` from 600 kB to **1,200 kB**.
  - The file grows by +0.53 MB inside a 79.7 MB `dist/mall.html`.
  - It parses in about 15 ms.
- **Optional later:** store `rooms` plus the door list and rebuild `partitions` / `facadeWalls` / `bathrooms` / `beds` at load time. Use a split-out `finish()` with no search, about 1 ms per plan. That saves about 55 %, but the layout would then import `community-plan.js` at runtime, which it deliberately avoids today.

### 3.5 `tests/community-plans.test.js`

- '…北苑 68 个楼层户型…' → **144**.
- '一梯一户：北苑每栋 24 户…':
  - homes 55 / 51, distinct = homes;
  - interlocked duplexes 9 per tower;
  - two-level homes 21 / 17;
  - parts 76 / 68;
  - `perFloor` keys = every home floor (8F–top minus 10 / 24 / 36), each with 2 homes.
- '复式上下层…' covers `duplex`, `sky-duplex` and `penthouse`.
- '冻结数据…':
  - new sha256;
  - keep the `T1-8W` spot regeneration;
  - **add** a spot regeneration of `T1-25W` from its recorded `spec` and the replayed `exclude`;
  - cap 1,200 kB.
- **New:** every home has exactly one `refugeRoom` that passes the §5.5.32 checks.

---

## 4. Lifts

### 4.1 Options

| | K: 3 lifts (minimal) | **K4: 4 lifts in the same core (recommended)** | Z: 5–6 lifts in a 12 m core |
|---|---|---|---|
| lifts | LW, LE private + LF | LW, LE private 6 m/s + **LF, LS** fire / service 5 m/s | 2 private per side (paired, or high / low zones) + LF (+ LS) |
| core | 8 × 16, unchanged | 8 × 16; north band re-slotted to 4 × 1.9 m shafts | 12 × 16: T1 grows west, T2 east |
| P1 impact | none | none: same column on B2–6F | **T2 hits the mall stair `P1-SQ-ST-SV` x[−208, −200] and freight lift `P1-SQ-F1` (−206.3, −229) on B1M–6F.** T1 cuts shops `SQ-NW` / `SQ-kids` (16 × 22 m, B1M–6F) and shifts its 1F lobby, B1 / B2 foyer and `SQ-EQ-1N` 4 m. Measured with `buildLayout()`. |
| homes per private lift | 27–28 / 25–26 | the same; service traffic moves to LS | 13–14 |
| 三合一前室 F (§5.5.28-4: ≥ 12 m², short side ≥ 2.4 m) | 9.0 m² ✗ today (could be widened) | **12.2 m² ✓** | ✓ |
| lifts on a refuge floor | 1 (LF). The existing "≥ 2 per level" test would fail. | 2 (LF, LS) | 2 |
| "更多电梯" | no | yes (3 → 4, 主梯 + 服务梯) | yes |
| test churn | low | medium: shaft x positions move 0.3 m | high, including the sky-lobby geometry |

**Recommendation: K4.**
- It adds lifts without touching the mall.
- It gives each home the classic 豪宅 split, 主梯入户 + 服务梯（消防梯）分流.
- It gives the fire service two fire lifts at 187 m.
- It fixes the undersized 三合一前室, a real non-compliance today.

Its costs:
- The private cars get narrower: 1.7 × 2.8 m inside, against 2.2 × 2.8 m today. They are deep stretcher-type cars.
- 1.9 m hoistways are tight for 6 m/s; real ones are about 2.4–2.6 m. Record this in the HANDOFF.

Alternatives:
- **K** is the fallback. codes.md §4.4 finds one private lift per home stack plus LF acceptable for luxury: RTT 71–77 s, mean wait ≈ 36–39 s.
- **Z is not recommended.** It needs a mall fire stair and a freight lift moved, and that is out of scope.

### 4.2 Why the core cannot grow at the podium (measured)

**T2:**
- East of its column x[−216, −208] on B1M–6F: the mall's `P1-SQ-ST-SV` stair (x[−208, −200], z[−240, −234], still serving 6F) and the `SQ-freight` room / `P1-SQ-F1`.
- West: the 1F residents' lobby x[−224, −216], the street door x[−221.2, −218.8], and at 7F the sky lobby (x[−228, −216]).

**T1:**
- West: the 1F residents' lobby x[−280, −264], the B1 / B2 foyer x[−270, −264] and `SQ-EQ-1N`.
- East: at 7F the sky-lobby lift hall x[−256, −251.6].

**Growing above 7F only** would need pits in P1-6F: the `SQ-NW` shop for T1, and the 4F–RF notch or the stair for T2. It would also force high-zone residents to change lifts at 7F.

**Deeper plates are not an option either:** JGJ 3 §3.5.5 (codes.md ≈) allows an overhang ≤ 10 % of B, which is 1.6 m.

### 4.3 K4 core layout (tower-local; `NORTH_CORE`)

```
north façade z = −8
 ┌───────┬───────┬───────┬───────┐ z −7.8
 │  LW   │  LF   │  LS   │  LE   │ shafts 1.9 × 3.0: x[−3.95,−2.05] [−1.95,−0.05] [0.05,1.95] [2.05,3.95]
 └──┬┬───┴──┬┬───┴───┬┬──┴───┬┬──┘ z −4.8  doors 1.0 m at u −3.0 / −1.0 / 1.0 / 3.0
 │ W landing │      F (三合一前室)   │ E landing │   W x[−4,−1.9] · F x[−1.9,1.9] = 12.2 m² · E x[1.9,4]
 │ 2.1 × 3.2 ╪ fire door 0.9    fire door ╪ 2.1 × 3.2 │   partitions at x = ±1.9, doors z[−3.65,−2.75]
 └───────────┴──┬door A┬──┬door B┬──┴───────────┘ z −1.6  stair doors x[−1.35,−0.25] / [0.25,1.35] (unchanged)
 │   stair A  (−4 … −0.2)  ║   stair B  (0.2 … 4)   │ z −1.6 … 8 (unchanged)
south façade z = 8
```

```js
lifts: [
  { key: 'LW', u: -3.0, w: 1.9, role: 'private-w', label: '北苑住户电梯 W', speed: 6 },
  { key: 'LF', u: -1.0, w: 1.9, role: 'fire', label: '北苑消防电梯 1', speed: 5 },
  { key: 'LS', u:  1.0, w: 1.9, role: 'fire-service', label: '北苑消防电梯 2 · 服务梯', speed: 5 },
  { key: 'LE', u:  3.0, w: 1.9, role: 'private-e', label: '北苑住户电梯 E', speed: 6 },
],
landings: { W: rect(-4, -4.8, -1.9, -1.6), F: rect(-1.9, -4.8, 1.9, -1.6), E: rect(1.9, -4.8, 4, -1.6) },
fillers: [rect(-4, -8, 4, -7.8), rect(-4, -7.8, -3.95, -4.8), rect(-2.05, -7.8, -1.95, -4.8), rect(-0.05, -7.8, 0.05, -4.8),
  rect(1.95, -7.8, 2.05, -4.8), rect(3.95, -7.8, 4, -4.8), rect(-0.2, -1.6, 0.2, 8)],
```

**Positions and checks:**
- World stops in T1 (frame origin −260): LW −263.0, LF −261.0, LS −259.0, LE −257.0, all at z ≈ −235.8. T2: −215.0 / −213.0 / −211.0 / −209.0.
- Sky-lobby reach: the nearest residential stop (T1 LE at −257.0) is 5.4 m from the 7F gate line (−251.6), well over `GATE.reachClear` = 2 m.
- All lifts are `type: 'passenger'`, which keeps the test "≥ 2 per own level" true.
- Car lobby depth is 3.2 m, at least the car depth and ≥ 1.5 m. Four lifts in a row, ≤ 4 (GB 50352 §6.9.1; codes.md §9).
- Above 100 m the stair, 前室 and fire-lift doors are 甲级 (GB 55037 §6.4.3, codes.md §11). This appears on the pick cards.

**Host levels:**
- `addHostCore` and `residential-cores.js` read `NORTH_CORE`, so B2 / B1 / 1F get the four-shaft column automatically.
- The P1 column `rect(t.core…)` and `NORTH_ACCESS` are unchanged. LS opens onto the 1F / B1 / B2 band behind the existing gates.

### 4.4 Stops: `northStops()` derived from the home data

```js
/** hosts + 7F + the entry floor of every home on that side + RF (PH terrace); LF/LS every own level. */
export function northStops(id, homes, levels) {
  const n = (k) => `${id}-${k}F`, hosts = [...NORTH_SITE.hostDoorLevels];
  const entries = (s) => [...new Set(homes.filter((h) => h.side === s).map((h) => h.levels[0]))].sort((a, b) => a - b).map(n);
  const all = [...hosts, ...levels.map((l) => l.id)];
  return { LW: [...hosts, n(7), ...entries('W'), `${id}-RF`], LE: [...hosts, n(7), ...entries('E'), `${id}-RF`], LF: all, LS: all };
}
```

| lift | stops | count |
|---|---|---|
| **T1 LW** | B2 B1 1F · 7F · 8F 9F 11F 12F 13F · 14F 16F 18F 20F 22F · 25F–35F · 37F 39F 41F 43F 45F 47F · RF | 32 |
| **T1 LE** | B2 B1 1F · 7F · 8F 9F 11F 12F 13F 14F · 15F 17F 19F 21F 23F · 25F–35F · 37F … 47F · RF | 33 |
| **T2 LW / LE** | the same up to 35F, then 37F 39F 41F 43F · RF | 30 / 31 |
| **LF / LS** | every own level, plus B2 / B1 / 1F | 46 (T1) / 42 (T2) |

**Rules:**
- LW / LE never open on 10F / 24F / 36F (refuge) or on the other side's upper levels.
- GB 50096 §6.4.4 (codes.md ≈) allows a lift to skip at most 2 floors in a row. The largest skip is 2 (LW 22F → 25F, 35F → 37F) ✓.
- LF / LS never open on P1 2F–6F (`hostPassLevels`, unchanged; codes.md: the residential fire lift must not open on mall floors).

**Card gates are unchanged:** `STREET`, `1F`, `B1`, `B2` and the sky lobby's `7F`, so 16 gates and 14 zones.
- Every lift door below 7F stays inside a gated zone.
- All gates release on alarm (GB 55037 §7.1.7).

### 4.5 Speeds, the game ride and the lift prompt

**Speeds:**
- **LF / LS** at 5 m/s: 1F → RF takes 42 s (T1) / 40 s (T2). That is ≤ 60 s (GB 50016 §7.3.8-3), above codes.md's ≥ 4 m/s for 190–210 m.
  - Cars: 1,000–1,050 kg, 2.1 m deep, stretcher-capable (GB 55037 §2.2.10; GB 50096 §6.4.2).
- **LW / LE** at 6 m/s: 1F → 48F takes 37 s.
- codes.md §4.4 rates one private lift per stack at 4–6 m/s as luxury: RTT 71–77 s, mean wait 36–39 s. Each private lift serves 25–28 homes. LS takes housekeeping, delivery and removal traffic.

**Game ride** (`src/layout/elevator-ride.js`):
- Today `travel = Δy / 7`, which gives 26.2 s for 1F → 48F.
- Proposal: `travel = Δy / (2 × (e.speed ?? 3.5))`. That gives 15.3 s for the private lifts and 18.4 s for the fire lifts.
- The HUD reads `上行 · 32F · 实际约 37 秒`, and **Space** skips to arrival.
- No test pins the divisor.

**Lift prompt** (`src/render/explore.js` `options()` / `renderPrompt()`):
- Today it is a flat list with keys 1–9, but LF / LS will offer 45 floors.
- Proposal: a keypad grid (`.ex-grid`) grouped by band (地库 / 7F / 低区 / 复式 / 云端 / 空中大宅 / 避难层).
- Keys: digits plus Enter to type a floor ("3", "5", Enter → 35F), and Backspace.

---

## 5. Fire

| topic | design | clause |
|---|---|---|
| rescue ground | HS1 x[−278, −242] and HS2 x[−228, −196] × z[−255, −245] on the ground, 5 m from the north faces. 36 / 32 × 10 m, so ≥ 20 × 10. No podium in between (P1's north wall is flush with the tower). Unchanged. | GB 55037 §3.4.6–7; GB 50016 §7.2.1–7.2.2 |
| entrance opposite the hardstand | the 1F street doors `Tn-STREET` on z = −240, leading to the core stairs | GB 55037 §2.2.2; GB 50016 §7.2.3 |
| 消防救援口 | 2 per storey on each tower's N face, one per wing, from 8F up. 1.0 × 1.0 m clear, safety glass, red-triangle marker. Drawn as 2 quads per storey (§7.2). | GB 55037 §2.2.3 |
| exits | 2 scissor stairs (防烟楼梯间). Home door → stair door ≤ 10 m (measured about 3–6 m). 1.00 h wall between flights. Flights ≥ 1.1 m. | GB 55037 §7.3.1-2, §7.3.2-3, §7.1.4; GB 50016 §5.5.28 |
| 三合一前室 | F = 12.2 m², short side 3.2 m (today 9.0 m² ✗); 甲级 doors above 100 m | GB 50016 §5.5.28-4; GB 55037 §6.4.3 |
| stairs at refuge floors | **分隔** on 10F / 24F / 36F (§5.1): evacuees go through the refuge area | GB 55037 §7.1.9; GB 50016 §5.5.23-2, §6.4.4 |
| refuge floors | §1.3: area, 3.00 h plant wall, 防火隔间, fire-lift door, hydrant, phone, PA, signs, 乙级 windows | GB 55037 §7.1.14–7.1.15, §6.4.7-2; GB 50016 §5.5.23 |
| fire lifts | LF and LS stop on every own level, refuge floors and RF included, in the F lobby. Pit drainage and water protection noted, not modelled. | GB 55037 §2.2.6, §2.2.8, §2.2.10; GB 50016 §7.3.5, §7.3.7, §7.3.8 |
| 户内避难间 | one per home (§2.3) | GB 50016 §5.5.32 |
| smoke control | mechanical pressurization of both stairs and F, in two vertical segments ≤ 100 m: B2–23F with fans on R2 (24F), 24F–RF with fans on RF. Shafts sit inside the core fillers (not modelled). | GB 51251-2017 §3.1.2, §3.3.1 |
| fire water | one stage would exceed 2.4 MPa, so: transfer tank and pumps on R2 (24F), PRVs on R1 / R3, the roof tank (≥ 36 m³) | GB 50974-2014 §6.2.1, §5.2.1 |
| sprinklers | homes above 100 m are sprinklered: pick-card text; heads only in the lazy interior | GB 55037 §8.1.9-3 |
| helipad | not required: §7.4.1 is advisory and only for *public* buildings over 100 m with floors over 2,000 m² (北苑: residential, 576 / 512 m²) | GB 50016 §7.4.1 |
| sky lobby (7F) | unchanged; the gate releases on alarm. Keep the P1-RF forecourt and 连廊雨棚 open-sided (codes.md, GB 50016 §5.4.10-3). | SPEC skylobby §6; GB 55037 §7.1.7 |
| aviation lights | above 150 m: obstacle lights at the crown corners and the lantern. `glowSoft` red, night only. | ICAO Annex 14 §6 / CAAC MH 5001 (to confirm) |

### 5.1 Stairs at refuge floors (分隔)

**Layout:**
- `towerStairPlan(stair)` gains `breakLevels` (the refuge level ids). At such a level each stair gets a partition between its two lanes over the door landing (local v ∈ [0, 1.85]) and a **second door**:
  - stair A: door 2 at x[−3.5, −2.4] (left lane), opening into landing W;
  - stair B: door 2 at x[2.4, 3.5] (right lane), opening into landing E.
  - On refuge floors both landings are part of the 避难区.
- `buildTowerStairAccess` at a break level R:
  - route (R−1) → R ends outside the arrival lane's door;
  - route R → (R+1) starts outside the departure lane's door;
  - the stair room on R gets `doors: [door1, door2]` and a `navWalls` partition at x = (left + right) / 2.

**Effect:** going down, the walk leaves through one door, crosses landing W or E (refuge area) and F, and re-enters through the other door. No storey route crosses the partition.

**Tests:**
- `tests/north-residences.test.js` '两部疏散楼梯…' still walks every route.
- New: descending ST-A from RF to 7F passes through the 避难区 polygon on each refuge level, and `floorLabel` reads `避难层`.

---

## 6. Structure: H/B and the height to choose

### 6.1 Numbers

- B = 16 m in N–S, the weak axis. The E–W widths are 36 / 32 m (H/B 5.2 / 5.4).
- H is measured from 34 m, because P1 (270 × 236 m) qualifies as a large stiff podium (JGJ 3 §3.3.2 commentary; codes.md):
  - T1 (186.9 − 34) / 16 = **9.6**;
  - T2 **8.7**;
  - from grade: 11.7 / 10.9.
- JGJ 3-2010 limits, assuming 7度 0.10g (codes.md uses 7度; the latitude suggests Hangzhou, about 6度, and the H/B limits are the same for 6 and 7度):

| system | B级 max height, 7度 (Table 3.3.1-2) | H/B max, 6–7度 (Table 3.3.2) |
|---|---:|---:|
| 剪力墙 | 150 m | 6 |
| 框架-核心筒 | 180 m | 7 |
| 筒中筒 | 230 m | 8 |
| 混合 (Ch. 11, Tables 11.1.2 / 11.1.3) | 190–230 m | 7 |

- **Result: 超限高层**, both above B级 for a shear-wall tower and above every H/B limit. It needs:
  - 超限高层建筑工程抗震设防专项审查 (住建部令第 111 号; 建质〔2015〕67 号);
  - wind-tunnel tests;
  - treatment as a 大底盘多塔 (JGJ 3 §10.6.3). The towers sit eccentrically at P1's north edge, so an expansion joint (抗震缝) round the tower bays is likely.
- codes.md §16 rates 北苑 🔴 and says it stays red. There is no lever arm for outriggers in N–S, and linking T1 to T2 deepens nothing.
- JGJ 3 §9.2.1 asks a core width ≥ H/12 (15.6 m). The core is 16 m deep in N–S but only 8 m in E–W. E–W is carried by the end and party walls instead.

### 6.2 Mitigations (structural; no game geometry beyond the noted items)

1. **N–S walls the full 16 m depth.** The core walls at x = ±4 already are. Add full-depth cross walls on each wing's party line (x = ±11 for T1 / ±10 for T2) and at the end walls (x = ±18 / ±16). That gives five to six 16 m-deep wall lines in the weak direction.
2. **Outrigger and belt walls on R2 and R3** (JGJ 3 §10.3; codes.md §18; 5.4 m storeys):
   - belt walls along both façades (z = ±8) through the wings;
   - outrigger walls on the wing centreline z = 0, from the core to the end walls. This is the same line as the refuge / plant fire wall.
   - They help mostly in E–W and in torsion.
   - Walls at and next to these floors go up one seismic grade.
3. **Composite walls:** steel-plate composite shear walls (钢板组合剪力墙) in C60 for B2–14F, so the base walls stay 600–800 mm and pass the 轴压比 check.
4. **No transfer above the P1 roof** (codes.md §19). Tower walls run straight through P1 to the B2 raft.
   - The game's shops under the wings (`SQ-NW`, `SQ-N2` …) have no tower walls in them. That gap already exists at 97 m.
   - Optional fix: 0.6 m "结构墙" nav obstacles on P1 B2–6F along the plate ends and party lines.
5. **Foundation:** bored piles to rock plus a 3 m raft at B2, spreading one bay into P1. H/B > 4 means no zero-stress zone is allowed under the raft (JGJ 3 §12.1.7; codes.md). Expect about twice the air-rights study's 55 piles per pair.
6. **Wind:**
   - The rectangular 16 m section has Strouhal ≈ 0.12 and a first period of about 5 s. Across-wind lock-in is at about 27 m/s, inside the design wind (Hangzhou w₀ ≈ 0.45 kN/m², open river exposure).
   - Countermeasures:
     - 1.2 m chamfered corners in the curtain wall;
     - a porous fin crown;
     - T1 / T2 heights 13 m apart, to reduce wake interference across the 14 m gap;
     - a **TMD / TLD** in the crown (about 1 % of modal mass, 100–150 t; the fire tank water can be part of a TLD).
   - Comfort target ≤ 0.15 m/s² at the 10-year wind for 住宅 (JGJ 3 §3.7.6); drift per §3.7.3.

### 6.3 Height to choose

| variant | T1 | T2 | H/B above podium | refuge floors | homes | notes |
|---|---|---|---|---|---|---|
| **200 (this design)** | RF 186.9, crown 199.9 | RF 173.7, crown 184.7 | 9.6 / 8.7 🔴 | 3 | 106 | what the user chose; 超限 |
| 150 (codes.md cap) | 25F–33F 云端大平层 + 34F–35F 顶层复式 (3.3 m), RF ≈ 141, crown ≈ 151 | two storeys lower, RF ≈ 133 | 6.7 / 6.2 | 2 (10F, 24F) | ≈ 78 | inside 框架-核心筒 / 筒中筒 limits above the podium; still over 剪力墙 |

The variant is a band table in `NORTH_BANDS` / `NORTH_SITE.towers[i].top`. Labels, the LOD, the tests and the catalog all read the data, so switching is a data change. **Recommendation:** build the 200 m stack as asked, and put the 150 m choice to the user as Q1, along with the policy point below.

**Policy:** 建科〔2021〕76 号 says 一般不得新建超高层住宅 (residential over 100 m). A real 200 m tower would need a special case.

---

## 7. Exterior and the render budget

### 7.1 Why the façade has to change

- Every home draws its own windows today: sills, lintels, piers, trims and mullions from `residence.facadeWalls`. Every floor's plans are unique, so `Columns` cannot merge anything up the tower. That costs 4.1–4.5k vertices per storey.
- Extending it to 43 / 39 levels would add about **+200k vertices (+3.6 MB)**:
  - community geometry about 13.5 MB, against a 10 MB budget;
  - the scene above its +15 MB budget (+12.42 MB is used already).
- Instancing cannot help: no two floors are alike.

### 7.2 Unitized curtain wall (单元式幕墙), independent of the plans

**Modules:**
- N / S wing faces: T1 14 m = 10 × 1.4 m bays; T2 12 m = 8 × 1.5 m.
- E / W end faces: 16 m = 10 × 1.6 m.
- The 8 m core spine on N and S stays a solid stone strip, with the existing accent fins and stair slots.

**Each storey:**
- a 0.9 m back-painted bronze spandrel at the slab, vision glass above;
- 0.35 m bronze fins (`extSatin`) on every second mullion, slim `extMetal` mullions between;
- 1.2 m chamfered corner bays;
- A级 non-combustible façade above 100 m (GB 55037 §6.6.6).

**Balconies** become enclosed 封闭式观江阳台 behind the same glass, with an operable vent bay. At 100–187 m open balconies bring wind and falling-object problems. The plan's `balcony` room and slider stay and are drawn lazily.

**Duplex 挑空:** the spandrel is omitted where a void meets the façade. That is the only per-floor variation, and it is free.

**Resident pieces** (the existing 8 batches; costs: box 36 v, quad 6 v, non-indexed `BatchSet`):

| piece | rule | T1 estimate |
|---|---|---:|
| mullions and fins | one box each, from 8F to the crown top, continuous through the refuge bands: 66 (T1) / 58 (T2) | 2.4k |
| vision glass | one pane per wing face per band segment (6 faces × 5) | 0.2k |
| spandrel + slab-edge band | 4 boxes + 4 quads × 38 home storeys | 6.4k |
| slabs | a box per wing, decomposed round stair holes and voids (`subtractRects`) | 5.5k |
| "lived-in" panes | 8 curtain / lit quads per storey (night glow as today) | 1.8k |
| rescue-window markers | 2 per storey, N face | 0.5k |
| core | merged shaft and stair walls with full-height door slots; per-storey core cells only where the landings change | 4.1k |
| refuge bands | 10F louvres; 24F / 36F louvres + belt diagonals on N / S | 4.5k |
| 7F sky-lobby storey | as today (doors, canopies, sign plate) | 4.0k |
| crown and RF | ring beam, wind screen, lantern, machine room / TMD / BMU boxes, aviation lights, terraces | 2.5k |
| **T1** | | **≈ 32k** (today 81.6k) |
| **T2** | | **≈ 29k** (today 81.3k) |

**Moves into the lazy per-floor interior** (`src/render/build/residence-interiors.js`, built by `ensureTowerFloor()` and cached like today's furniture):
- frosted wet-room panels, inner curtains, guard bars;
- balcony sliders and partition-to-glass closure trims;
- lift lintels and door heads, landing finishes and lamps;
- stair door heads and exit signs.

That is about 3–4k vertices per loaded floor, for a few floors at a time.

### 7.3 Refuge bands, crown and the pair

**Refuge bands:**
- 10F (3.6 m): bronze horizontal louvres, 6 blades, between the continuous fins.
- 24F / 36F (5.4 m): 8 blades, with the belt-wall diagonals (2 X's per wing face, darker `extSatin`) behind them on N / S.
- The refuge-area bays use openable 乙级 fire windows; the plant bays are rain louvres (codes.md §4).
- The bands line up across T1 and T2 at 46.2 / 93.6 / 141.9 m. They split T1 into 2 / 13 / 11 / 12 home storeys (T2: 2 / 13 / 11 / 8). That is a louvre band every 11–13 storeys, as codes.md expects.

**Crown:**
- The fins continue 13 m (T1) / 11 m (T2) above RF. Their tops step down from the core to the plate ends (+13 / +10 / +7 m), so from the river the crown reads as a gentle gable.
- A 3 m glass wind screen at the foot shelters the penthouse terraces.
- The core lantern (+15 m on T1):
  - carries the tower name, moved from `roof.elev + .62` to `RF + 8`, 9 × 1.8 m on the N face, using the existing sign-atlas cell;
  - carries red aviation lights at the corners.
- At night, `glowSoft` strips light the fin tops (`mats.onNight`).

**The pair:** T1 and T2 use the same language; T2 is lower, with a smaller lantern.

### 7.4 North far LOD

- Reuse `farFacade()` / `farSwap()` (`COMMUNITY_FAR_LOD` = 600 m, 5 % hysteresis) with a curtain-wall variant:
  - mass box, glass strip per face per band, a spandrel line per storey;
  - refuge bands, core spine, crown silhouette (4 quads plus the lantern box).
- Cost: about 2.5k vertices in 2 meshes (`facadePlaster`, `facadeWindow`).
- The campus view (about 1,000 m) and the R1 view switch to it: **−8 main-pass calls per north tower**, −3 in the shadow pass. The near path keeps 8 meshes.

### 7.5 Budget

| | now (`f7a3655`) | proposed (estimate, ±25 %) |
|---|---:|---:|
| T1 / T2 exterior | 81.6k / 81.3k v | ≈ 32k / 29k v (+ 2.5k far each) |
| T1 / T2 7F group | 14.2k / 9.5k v | unchanged |
| **north resident total** | **186.6k v = 3.36 MB** | **≈ 90k v ≈ 1.6 MB** |
| community total (`community-render` test, ≤ 10 MB) | 9.94 MB | ≈ 8.2 MB before the 西苑 extension (≈ 1.8 MB left for W1 / W2) |
| campus main-pass calls, north towers | ≈ 20 (10 each; double-sided glass) | **≈ 4** (far LOD) |
| campus triangles, north | ≈ 54k | ≈ 2k |
| near views (N1, P1 roof) | 8 meshes per tower | 8 meshes per tower |

**Implementation limits:**
- exterior ≤ 8 meshes;
- T1 ≤ 45k, T2 ≤ 40k vertices;
- far ≤ 2 meshes and ≤ 1,500 triangles;
- community ≤ 10 MB (unchanged);
- campus steady calls within +50 of `dc4951d`.

The budgets are shared with the 西苑 / R / H / A agents. Measure with `perf/measure.cjs` (HANDOFF §8) once they land too.

### 7.6 Other render effects

- **Shadow camera** (`env.setShadowFocus`, campus radius 330): a 187 m tower top near the frustum edge may lose its shadow. Check the N1 and campus shots.
- **Labels** sit at `top + 26` and follow the new heights automatically.
- **光穹 main view:** the towers now rise well above the dome. The elevation angle goes from about 15–17° to about **30°**, estimated from the air-rights PLAN distances. This is a deliberate skyline change; tell the user.
- **Gap faces** (T1 E end x = −242 and T2 W end x = −228, 14 m apart): fritted glass on those bays for privacy. The generator already turns living rooms toward the river.
- **Pedestrian wind** on the P1-RF forecourt between two 180 m towers: add 2 free-standing glass wind screens at the forecourt's north edge, open above and at both ends so the forecourt stays open-sided. Draw them in the P1-RF batch: +0 calls. Note that a wind-tunnel check is needed.

---

## 8. Everything else that must change

### 8.1 Files

| file | change |
|---|---|
| `src/layout/community-sites.js` | `northStack()`; per-tower `top`, `crown`, `levels`; `refuge`; header comment |
| `src/layout/north-towers.js` | `NORTH_CORE` as K4 (4 lifts, F 3.8 m); data-driven `northStops()`; the LS elevator; `speed`; `levelName` / `levelLabel` per band (`江景大平层` / `错层复式` / `云端大平层` / `空中大宅` / `顶层复式` / `避难层` / `屋顶露台`); `refugePlan()` (§1.3); RF terraces and walks; corePlan `lifts[i].sealed` per level (refuge floors keep open landing corridors); `b.bands`, `b.refugeLevels`, `b.crownTop`, `b.massing.top`; titles for the new kinds. `SKY_LOBBY` untouched. |
| `src/layout/tower-stairs.js` | `breakLevels`: second door, partition, split routes (§5.1) |
| `src/layout/community-contract.js` | `LEVEL_KINDS` += `'refuge'`; the `refugePlan` contract; elevator role `fire-service` |
| `src/layout/community-plan.js` | `refugeRoom`; `planKey()`; program variants; optional relaxation of 挑空 for 12 m wings |
| `scripts/prepare-community-plans.mjs` | `NORTH_BANDS`; `--extend-north`; per-part `spec`; header text |
| `src/layout/community-plan-data.js` | regenerated (≈ 1.04 MB) |
| `src/layout/nav.js` | refuge-zone names in `floorLabel()` |
| `src/layout/elevator-ride.js` | ride time from the rated speed (§4.5) |
| `src/render/build/community.js` | `curtainWall()`, `refugeBand()`, new `crown()`, north far LOD; the per-plan façade moves out; sign position; header comment ("8 draw calls" stays) |
| `src/render/build/residence-interiors.js` | per-floor façade inner detail and core detail; refuge-floor fixtures; fire-door finish on the `refugeRoom` door |
| `src/render/build/residential-cores.js`, `tower-elevators.js`, `tower-stairs.js` | the 4-shaft core, the LS car, sealed shaft doors, the second stair door at refuge levels |
| `src/render/explore.js` | lift keypad grid (§4.5) |
| `src/render/floor-rows.js`, `src/render/ui.js` | band headers (§8.4) |
| `src/render/tour.js` | §8.5 |
| `src/render/app.js` | core pick card `住户电梯 W / E · 消防电梯 ×2（含服务梯）· 一梯一户`; refuge-floor and terrace pick texts |
| `README.md`, `HANDOFF.md`, `docs/` | the 200 m stack; the 1.9 m shaft compromise; the §5 code table; the catalog (§8.3) |

### 8.2 Tests with pinned counts

| test | pinned today | new |
|---|---|---|
| `north-residences` '满足社区契约…' | `top ≤ 100`; `levels.length 19` | RF ≤ 190 and crown ≤ 205; levels 43 / 39; plus `R1.elev − 0 ≤ 50`, `Rk+1 − Rk ≤ 50`, top floor − R3 ≤ 50 |
| `north-residences` '电梯停靠' | LW / LE lists, LF everywhere | §4.4 lists (no 10F / 24F / 36F); LS = LF; roles `['private-w', 'fire', 'fire-service', 'private-e']`; "≥ 2 passenger lifts per own level" still passes (LF + LS on refuge floors); add the GB 50096 skip ≤ 2 check |
| `north-residences` '8F–24F 每层恰两户…' | 8F–24F | every home floor has 2 homes; refuge floors have 0 units; the stair walk covers every two-level home |
| `north-residences` '每栋 24 户 34 个楼层单元…' | 24 / 34 / 10 / 24 | 55 / 76 and 51 / 68; distinct = homes; interlocked 9, two-level 21 / 17; `uppers.length` 20 → 38 |
| `north-residences` '两部疏散楼梯…' | routes B2 → RF | same, plus the refuge-break walk (§5.1) |
| `north-residences` '核心筒穿过一期…' | 3 core rooms, 16 removed units, 367 P1 units | unchanged: the column does not change |
| `community-plans` (all) | 68 / 24 / 10 / 34 / hash / 600 kB | §3.5 |
| `community-contract` | `NORTH_SITE.levels.length 19`; `.at(-1).elev 96.9`; fixture `T1-14W` on 14F / 15F | 43 levels and RF 186.9 (T1 stack); fixture unchanged (14–15W kept); add a refuge-level case to the mutation list |
| `community-render` | ≤ 8 meshes; ≤ 10 MB; west far LOD; `T1-10F` furniture case (l.467) | same limits; **north far LOD test** (≤ 2 meshes, silhouette within 0.5 m including the crown); T1 / T2 vertex caps; a ray through a refuge band hits a louvre; `T1-10F` → `T1-11F` |
| `community-doors` | `T1-10F`, `T1-16F`, `T1-17F`, `T2-20F` | `T1-10F` → `T1-11F`; the rest are kept |
| `sky-lobby` | `near: ['T1-LE', -257.3, 'T1-10F']`, `far: ['T1-LW', -262.7, 'T1-16F']`, T2 −214.7 / −209.3 with `T2-10F`; "16 options" | x → T1 −257.0 / −263.0, T2 −215.0 / −209.0; `T?-10F` → `T?-11F`; options from 7F → T1-LE 32, T1-LW 31, T2-LW 29, T2-LE 30 |
| `riverside-integration` | gates / zones 16 / 14; `T2-LW → T2-16F`; HUD `16F 错层复式` | unchanged (20 / 18 only if the RF terrace gates are enabled); tour captions per §8.5 |
| `residential-access`, `residence-access` | B2 / B1 / 1F stops; reach | unchanged; re-run the reach BFS with the new stop x |
| `north-render` | gate floors ≤ 6 | unchanged |
| `ui-floor-rows` | podium row | plus band-header rows |
| `fps-frozen` | compact layout byte-identical | unchanged (`NORTH_SITE` is expansion-only); run it |

Full suite: `node --test --test-concurrency=3 tests/*.test.js`. Expect about 5 min. The plan test still regenerates only west plus two spot homes.

### 8.3 Catalog (`docs/unit-catalog-2026-11-05.md`, `scripts/unit-catalog-plans.mjs`)

**Scale:** about 106 north + 10 west = 116 homes, plus whatever the 西苑 / 二期 extensions add. North level rows go from 68 to 144.

**Keeping it manageable:**

1. **Split by tower:** `docs/unit-catalog/north-T1.md`, `north-T2.md`, `west.md`, plus an index page.
2. **Group by band (L, D, C, H, PH).** Each band gets:
   - a **contact sheet**, e.g. `index-T1-C.jpg`: 22 plans at one scale, each labelled like `25W 4BR 224㎡ · 户内避难间 主卧`;
   - a table **generated from `buildLayout()`**: code, floors, type, area, bedrooms, 挑空, refuge room, lift. A test checks that every home id appears exactly once.
3. **Per-home composites:**
   - Only the 66 new homes get the three-panel composites.
   - The 40 kept homes keep their plan images.
   - The interior shots of kept homes change, because the façade is now a curtain wall. Reshoot them, or mark them "立面已更新".
   - The 8 removed homes are retired.
   - Shooting: one browser on the assigned port, about 66 × 2 shots ≈ 20 min.
4. **Regenerate `north-section.jpg`** with:
   - all 43 / 39 levels and the refuge bands;
   - the four lifts' stops as coloured ticks;
   - the "1–6F 一期商场" block.

### 8.4 UI floor rail with about 45 floors (`floor-rows.js`, `ui.js`)

**Band headers:** `floorRows()` inserts non-clickable `<div class="floor-band">` rows from `b.bands`, top-down:
- `顶层复式 47–48F`;
- `空中大宅 37–46F`;
- `36F 避难层` (a one-row band with a hatched chip);
- `云端大平层 25–35F`;
- `24F 避难层`;
- `错层复式 14–23F`;
- `江景大平层 8–13F`, with `10F 避难层` inside it;
- `7F 空中大堂`;
- the existing `1–6F 一期商场` podium row.

**Navigation:**
- **Band chips** above the list scroll to each band. At 1280 × 800 the rail shows only about 7 rows.
- **No focus:** keep the existing scroll-to-bottom (7F, the low floors and the podium).
- **After a lift ride:** `scrollIntoView` the arrival floor.

**Directory:**
- the same headers;
- refuge floors show `避难层`;
- the `电梯` stat counts the 4 core lifts (the existing `residentialCore` rule).

### 8.5 Tour (`src/render/tour.js`, riverside steps)

- **Re-frame** `云澜·北苑 · 一梯一户江景大平层与错层复式` for the 200 m pair:
  - caption → `云澜·北苑 · 200 米江景双塔（避难层 · 空中大宅 · 屋顶冠）`;
  - `pos V(-40, 170, -560)`, `target V(-236, 105, -232)`, `dur 6`, `shadow 260`.
- **Add a crown step** after it:
  - caption `云澜·北苑 · 顶层复式私家露台与屋顶冠`;
  - building `T1`, `focus: 'T1-RF'`;
  - `pos V(-238, 202, -262)`, `target V(-260, 188, -232)`, `dur 5`.
- **Keep** the two sky-lobby steps before the 1F gate steps (SPEC skylobby §12 order rule).
- **`对岸看江景商场与北苑`**: raise the target to y ≈ 70 so both crowns stay in frame.
- **Update** the caption list in `riverside-integration.test.js` (l.162).

### 8.6 Nav and layout cost

- North levels go from 38 to 82, and tower nav floors from about 130 to about 280.
- Estimate: layout +0.3 s (2.5 s today), nav +0.1 s (0.7 s today).
- `floor-detail-streaming` already excludes tower levels.
- Landing-door instances: 4 lifts × 32–46 stops ≈ 155 per tower, still one InstancedMesh.
- Tower stair instances stay lazy.

---

## 9. Risks

| # | risk | mitigation |
|---|---|---|
| R1 | **Policy:** 建科〔2021〕76 号 discourages new 超高层住宅 | Tell the user plainly; offer the 150 m variant (Q1) |
| R2 | **Structure:** H/B 9.6 / 8.7 and over B级 height mean 超限 (codes.md 🔴) | §6.2 mitigations; height lives in the data (§6.3) |
| R3 | **The façade changes on floors the user has already seen** (punched windows → curtain wall) | Present it as the logic of a real 200 m tower; plans and furniture are unchanged; reshoot or note the kept homes' interior shots |
| R4 | **1.9 m hoistways** are a compromise for 6 m/s lifts, and the private cars get narrower | Document it; K (3 lifts, 2.4 m shafts) is the fallback |
| R5 | **8 kept homes removed** (10W / 10E / 24W / 23–24E per tower); 23E is new | Needed for R1 / R2 in the codes windows; the catalog retires them |
| R6 | **No 挑空 in T2** (12 m wings) with the current generator | Relax the "living inside the public column" rule for upper voids, or accept flat ceilings in T2's H / PH |
| R7 | **Distinct by signature ≠ visibly varied:** 22 C flats per tower may look alike | Program variants, rank gate, contact-sheet review before freezing |
| R8 | **Shared budgets** (+50 calls, +15 MB, community 10 MB) | North returns about 1.7 MB and about 16 campus calls; agree an allocation with the other agents first |
| R9 | **Data file ≈ 1.04 MB** | Cap raised to 1.2 MB; compaction path in §3.4 |
| R10 | **Test churn:** sky-lobby x positions and option counts, `T?-10F` references, hash, contract pins | Listed in §8.2; most kept floors avoid churn |
| R11 | **Ride length** (26 s with today's formula) and a 45-option lift prompt | §4.5 speed formula, skip key, keypad |
| R12 | **Shadow frustum, 光穹 view, gap wind** at 200 m | §7.6 checks and new QA screenshots |
| R13 | **Realism gaps already present:** no tower walls through P1 shops; no riser shafts; the 9 m² 三合一前室 (fixed here) | §6.2-4 optional obstacles; §5 notes |
| R14 | **西苑 also owes the §5.5.32 户内避难间** | Hand §2.3 to the west agent |

## 10. Open questions (for the user, via the parent)

1. **Q1 Height:** 200 m as chosen (T1 crown 200 m / T2 185 m, 超限, against the 2021 guidance), or the realistic about 150 m (T1 RF ≈ 141 m, 2 refuge floors), which is codes.md's cap? Default: 200 m, as chosen.
2. **Q2 Lifts:** 4 per tower (2 private + 2 fire / service; recommended), or exactly 3 with the current wider 2.4 m private cars?
3. **Q3 Skyline:** a stepped pair (T1 200 m / T2 185 m), or both about 200 m? And how should 北苑 rank against the 二期 R1–R4 / 西苑 / H / A heights the other agents propose? codes.md suggests R1–R4 at 176 / 188 / 200 / 188.
4. **Q4 RF:** drop the shared roof garden for two penthouse terraces (default), or keep a shared 屋顶花园 inside a glass wind screen?
5. **Q5 Façade:** a uniform curtain wall for the whole tower including the existing 8F–23F (default), or keep the punched windows below 100 m? That alternative costs about 2 MB and loses the vertical merge.
6. **Q6 Seismic intensity / city:** Hangzhou (≈ 6度, from the sun latitude) or 7度? It changes how far over 超限 the towers are, not the game.
7. **Q7 Balconies:** enclosed everywhere (default, one façade), or only above 100 m?
8. **Q8 Airport / local height limits:** unknown; they affect only the aviation lights.
