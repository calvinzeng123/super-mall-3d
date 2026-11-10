# 云澜·西苑 W1 / W2 · 约 200 m 超高层延伸（设计研究）

Study label `supertall`, 2026-11-05. Design only: nothing in `/home/user/super-mall-3d` was edited or committed.

**Base.** Measured at `e7cfb42`, the branch head when this study ran. It already contains the parallel workflow's door leaves (`8bc9336`) and the 北苑 7F 空中大堂 (`f7a3655`: 16 gates, 14 zones). This design sits on top of both and touches neither. The 西苑 gates and zones stay at 6 + 6.

**How the numbers were made.**
- A detached scratch worktree, since removed.
- Scripts are in `west-calc/` next to this file:
  - `stack_lifts.py`: storey stacks, refuge checks and lift traffic, using the codes.md model;
  - `sun.py`: 大寒日 sun hours;
  - `geo.mjs`, `permat.mjs` and `inst.mjs`: resident geometry, draw calls and the instancing prototype;
  - `families.mjs` and `variety.mjs`: plan-generator feasibility;
  - `heap.mjs`: layout memory;
  - `prototype.diff`: the two prototype patches. `WEST_STACK=S61|S47` selects the stack, and `WEST_INSTANCE=1` / `WEST_FAMILIES=1` turn on floor-module instancing.
- Code rules come from `codes.md`. Clause marks follow it: **✔** means checked against the code text in that study, **≈** means from memory or a secondary source.
- Shared engine changes follow `north.md` so that one implementation serves both communities: stair `breakLevels`, the speed-based lift ride, the lift keypad and the floor-rail band headers.

---

## 0. Decisions on one page

1. **Two stacks behind one data switch.** Both share every floor from B2 to 47F's core and the whole low zone.

   | | **S61, as asked** | **S47, recommended** |
   |---|---|---|
   | storeys | 1F–61F + RF | 1F–47F + RF |
   | RF (main roof; height for fire and structure) | **189.0 m** | **145.5 m** |
   | crown top | **200.0 m** | 156.5 m |
   | refuge floors | 16F 46.5 · 31F 93.0 · 46F 139.5 m | 16F 46.5 · 31F 93.0 m |
   | H/B (B = 19.2 m) | **9.84** 🔴, beyond JGJ 3 B级 for 剪力墙 | **7.58** 🟡, within B级 (150 m at 7度) |
   | homes per tower (both) | 285 (570) | 220 (440) |

   **Recommendation: S47.** At 189 m a 19.2 m-deep shear-wall slab is beyond every JGJ 3 table (§5). The plot cannot give a deeper plate: the fire road is fixed 5 m south, and the plot line is 4 m north.

   If the user keeps 200 m everywhere, S61 is fully designed below. It is then exactly as 超限 as 北苑 at 200 m (north.md H/B 9.6), and both should carry the same mitigation story.
2. **3梯5户 kept on every home floor.** There are **6 lifts in two zones**:
   - low bank L1 / L2 / F1, serving 2F–30F;
   - high bank H1 / H2 / F2, serving 32F and up.

   Each home floor sees exactly 3 landing doors. The other bank's 3 shafts show as blank walls.

   One bank of 3 for 57 home floors gives a 66 s interval and 4.3 % handling capacity (✗). Two banks give 54 s / 10.8 % (low) and 58 s / 9.7 % (high, 6 m/s).
3. **The core grows from 15.7 to 18.0 m** (+2.3 m). It stays inside the 8.4 m north band, so the 19.2 m slab depth is unchanged.
   - Only one north home per tower narrows: W1 NW goes from 16.7 to 14.4 m, W2 NE from 16.1 to 13.8 m.
   - The lift lobby, the 1F gate line, the B1/B2 vestibules and both WPG deck portals stay **exactly** where they are today.
4. **Zoned plan families.** The party walls are structural shear walls, so the five slot widths are fixed from the raft to the roof. Variety comes from the plans inside the slots, by refuge segment:
   - **A**, 2F–15F: today's catalogue;
   - **B**, 17F–30F: corners swapped, new variants;
   - **C**, 32F–45F (S47: 32F–47F): 改善, more 3BR and 4BR;
   - **D**, 47F–61F: 云端, 大三房 first.

   The existing generator produces A–D today (≥ 5 distinct plans in every slot, measured). The optional **顶层复式** needs generator work: 0 of 20 duplexes generate in the 8.4–9.0 m-deep slots.
5. **Fire.** Refuge floors are 4.5 m tall:
   - refuge area on the south (hardstand) face, about 150 m² net against 53–61 m² required;
   - plant behind 2.00 h / 3.00 h walls;
   - fire lifts open there; passenger lifts pass sealed;
   - stairs 分隔.

   F1 reaches 31F in 35 s and F2 reaches 61F in 38 s (≤ 60 s). The fire road and hardstands are unchanged.
6. **Render.** Instance the repeated floor modules, one per plan family plus one refuge module. Storey-high walls still merge up the tower in `Columns`. Measured at S61:
   - 西苑 resident geometry falls from **5.72 MB today** to **2.69 MB**. A naive extension would be 10.56 MB.
   - Community total: **9.94 → 6.92 MB** with today's 北苑.
   - Near views pay +33 draw calls per tower. The campus view is unchanged, because it already uses the far LOD (937 m away).
7. **Campus totals that change** (S61 / S47):
   - levels +66 / +38;
   - lifts +6;
   - home records 270 → 570 / 440;
   - one new level kind, `refuge`.

---

## 1. Storey stack

### 1.1 Rules applied

- **Storey height.** Typical storey 3.0 m (GB 55038-2025 minimum, codes.md §2.10; do not go lower). 1F stays 4.5 m and B1/B2 stay as today. Refuge storeys are 4.5 m.
  - A 4.5 m storey passes the stair-depth check: 1.85 + 14 × 0.28 + 1.35 = 7.12 m ≤ 7.8 m.
  - The S61 prototype layout built without a stair error.
- **Refuge floors.**
  - First refuge floor ≤ 50 m above the hardstand (GB 55037 §7.1.14 ✔). The fire road is at grade, so this is ≤ 50 m absolute.
  - Spacing ≤ 50 m (GB 50016 §5.5.23-1 ✔, 宜). The design window is 45–48 m.
  - Top occupied floor ≤ 50 m above the last refuge floor (practice).
- **Numbering.** Floors are numbered through the refuge floors, Chinese practice (16F 避难层). Refuge floors have no home numbers (no 16xx).
- **Elevation formula:** `elev(nF) = 4.5 + 3.0 · (n − 2) + 1.5 · (refuge floors below n)`.

### 1.2 S61 (as asked)

| floor | elevation | storey | kind | family | lift stops |
|---|---|---|---|---|---|
| B2 | −8.4 | 3.9 | garage lobby | — | all 6 |
| B1 | −4.5 | 4.5 | garage lobby | — | all 6 |
| 1F | 0.0 | 4.5 | 社区大堂 | — | all 6 |
| 2F–15F | 4.5 → 43.5 | 3.0 | homes, 14 floors | **A** | L1 L2 F1 |
| **16F** | **46.5** | 4.5 | **避难层 R1** + plant | — | F1 |
| 17F–30F | 51.0 → 90.0 | 3.0 | homes, 14 | **B** | L1 L2 F1 |
| **31F** | **93.0** | 4.5 | **避难层 R2** + fire-water transfer; zone break | — | F1, F2 |
| 32F–45F | 97.5 → 136.5 | 3.0 | homes, 14 | **C** | H1 H2 F2 |
| **46F** | **139.5** | 4.5 | **避难层 R3** + plant | — | F2 |
| 47F–61F | 144.0 → 186.0 | 3.0 | homes, 15 (60F–61F optionally 顶层复式) | **D** | H1 H2 F2 |
| RF | **189.0** | — | roof plant inside the crown (§1.5) | — | H1 H2 F2 |
| crown top | **200.0** | — | 屋顶构架 | | |

Checks:
- Refuge gaps are 46.5 / 46.5 / 46.5 m.
- 61F is 46.5 m above R3 ✓.
- 57 home floors × 5 homes = **285 homes per tower**.

### 1.3 S47 (recommended)

Identical up to 31F. Then:
- 32F–47F: 97.5 → 142.5 m, family C, 16 home floors;
- **RF 145.5 m**;
- crown top 156.5 m.

Checks:
- 47F is 49.5 m above R2. That is ≤ 50 m, but it is the tallest S47 can go without a third refuge floor.
- 44 home floors × 5 = **220 homes per tower**.

Between 48F and 60F every stack needs R3 at 46F. A 54F tower, for example, would carry a whole refuge storey for 8 home floors. So the only sensible choices are S47 or S61.

### 1.4 Refuge floors (16F / 31F / 46F; tower-local coordinates, x east, z south)

**Population and area.** About 19 persons per floor (4BR 5 + 3BR 4 + 3BR 4 + 2BR 3 + 2BR 3). Each refuge floor serves the floors between it and the next refuge floor up (GB 55037 §7.1.15-1 ✔, 5 p/m² per GB 50016 §5.5.23-3 ✔).

| refuge floor | serves (S61) | persons | net area needed | provided |
|---|---|---|---|---|
| 16F | 17F–30F | 266 | 53 m² | ≈ 150 m² |
| 31F | 32F–45F (S47: 32F–47F) | 266 (304) | 53 m² (61 m²) | ≈ 150 m² |
| 46F | 47F–61F | 285 | 57 m² | ≈ 150 m² |

**Plan.** The corridor x[−21.7, 21.7] × z[−1.2, 0.6] stays.
- **避难区** (one protected zone):
  - the south room x[−9.0, 9.0] × z[0.6, 9.6] (162 m² gross);
  - the corridor;
  - the lift lobby.

  It sits on the **hardstand face**: GB 55037 §7.1.15-6 ✔ requires at least one side to project onto the 登高场地.
- **Plant**, behind 2.00 h walls (3.00 h round the pipe zone), entered through a **防火隔间** with 甲级 doors (§7.1.15-2 ✔):
  - **SW** x[−21.7, −9.0] × z[0.6, 9.6]:
    - 31F: fire-water transfer tank (≥ 60 m³ ≈) and transfer pumps. One stage over 189 m exceeds the hydrant pressure limit (GB 50974 §6.2.1 ≈).
    - 16F / 46F: domestic break tank and pressure-reducing (PRV) station.
  - **SE** x[9.0, 21.7]: stair and lift-lobby pressurisation fans for the next ≤ 100 m segment (GB 51251 §3.3.1 ≈); 新风 and electrical rooms.
  - **North band beside the core**: 强电 / 弱电 / BMS / storage.
- **Equipment** (§7.1.15-3/4 ✔): fire-lift exit, hydrant, hose reel, extinguishers, fire phone, PA, and lit `16F 避难层` signs at both stair doors.
- **Ventilation:** natural, ≥ 2 % of 833 m² = 16.7 m² effective opening, on ≥ 2 orientations (GB 51251 §3.2.3 ≈):
  - openable **乙级 fire windows** on the south face (GB 55037 §6.4.7-2 ✔);
  - the corridor-end windows on the E and W faces, which are part of the 避难区.

  That gives two orientations without opening plant rooms to the refuge area.
- **Lifts:**
  - F1 opens on 16F and 31F; F2 on 31F and 46F.
  - L1 / L2 / H1 / H2 pass with **no landing door** (codes.md rule 6), so their panels have no button for these floors.
- **Stairs:** **分隔** (GB 55037 §7.1.9 ✔; GB 50016 §5.5.23-2, §6.4.4 ✔), using the engine design in north.md §5.1 (`breakLevels`).
  - On a refuge floor each 3.6 m 西苑 stair gets a partition at x0 + 1.8 over the door landing.
  - Its door splits into two: left lane x0 + [0.3, 1.7] (departure upward) and right lane x0 + [1.9, 3.3] (arrival from below).
  - Going down, you leave by one door, cross the corridor (避难区) and re-enter by the other.
- **Level record:**
  - `kind: 'refuge'`;
  - name `16F 避难层`, label `避难层 · 设备层 · 仅消防电梯停靠`;
  - `refugePlan: { area, plant[], windows[] }`;
  - walk = corridor + 避难区 room + lift lobby; plant rooms are `rooms` (solid to nav);
  - no `units`.

  The contract (`community-contract.js` `LEVEL_KINDS`) must accept `refuge`. The S61 prototype failed `云澜·西苑两栋塔楼满足社区契约` on exactly this.

### 1.5 RF and the crown

**S61.** RF at 189 m becomes **屋顶设备层**. The open shared roof garden goes, for the same reason as north.md §1.4: an open deck at 189 m is not credible.
- **North band, over the core:**
  - machine room for the 6 m/s high bank, about 6 m tall: overrun plus machine;
  - roof fire tank, ≥ 36 m³ for residential above 100 m (GB 50974 §5.2.1 ≈), combined with a **调谐液体阻尼水箱 (TLD)** of about 300–400 m³ for wind comfort (§5);
  - top pressurisation fans.
- **South band:** the **擦窗机 (BMU)** track and its parking bay.
- **Access:** both stairs and H1 / H2 / F2 reach RF (maintenance and fire), and the roof stays walkable for nav.
- **Residents' outdoor amenity:** stays at grade (the community garden) and in the 1F lobby.

**S47 (145.5 m).** A reduced roof garden is defensible. Keep the south-half deck and planters behind a 2.4 m glass wind screen inside the crown; plant goes on the north half. This keeps today's `roofGarden` and its planter tests alive.

**Crown, both stacks:**
- The party-wall pilasters of the south and north faces continue **11 m above RF** as aluminium fins (`extSatin`), 1.5 m apart, with a ring beam on top.
- It reads as one 屋顶构架 hiding the machine room, TLD and BMU, and it is not counted in the structural height (JGJ 3 Table 11.1.2 note; codes.md rule 17).
- The crown sign `云澜·西苑 n 号楼` moves from `roof.elev + .62` to **RF + 6 m** on the south face. It grows from 9 to about 16 m wide (same atlas cell) and is lit at night.
- **Aviation obstruction lights:** the crown top is above 150 m in both stacks (156.5 / 200 m), so high-intensity white flashing lights go at the four crown corners (ICAO Annex 14 / CAAC ≈). Draw them as `glowSoft` points, night only.

---

## 2. Homes: 3梯5户 and plan families

### 2.1 Why the slot widths cannot change between zones

- 西苑 is a **剪力墙** slab. The party walls between homes and the core walls are the structure. They must run continuously from the raft to the roof.
- Moving a party wall at 31F or 46F would need a **transfer storey** at about 100 m. JGJ 3 §10.2.5 ≈ limits 部分框支 transfer storeys to the bottom few storeys at 7度. That is out of the question.
- So "larger corner homes higher up" cannot mean wider slots. Higher zones get **different plans and bedroom counts inside the same slots**, and optionally top-floor duplexes.
- This is also how real towers do it: one 标准层 grid, several 户型 per zone.

### 2.2 Slots after the core grows (tower-local x; south row 9.0 m deep, north row 8.4 m deep)

| tower | SW | S | SE | NW | core | NE |
|---|---|---|---|---|---|---|
| W1 | [−21.7, −4.7] 17.0 | [−4.7, 5.9] 10.6 | [5.9, 21.7] 15.8 | [−21.7, −7.3] **14.4** (was 16.7) | [−7.3, 10.7] **18.0** | [10.7, 21.7] 11.0 |
| W2 | [−21.7, −7.1] 14.6 | [−7.1, 4.1] 11.2 | [4.1, 21.7] 17.6 | [−21.7, −10.1] 11.6 | [−10.1, 7.9] **18.0** | [7.9, 21.7] **13.8** (was 16.1) |

- **Today's homes:**
  - The south row is unchanged.
  - W1 NE and W2 NW are unchanged.
  - Only the core-side 3BR in each north row is re-cut: W1 NW 140.3 → 121.0 m², W2 NE 135.2 → 115.9 m². Both stay 三房一厅.
- **Efficiency per floor:**
  - W1 home area goes from 623.3 to 604.0 m² of 833 m². 得房率 falls from 74.8 to 72.5 %, normal for a supertall.
  - The core is 18 % of the floor, up from 16 %.
- **Wall thickness.** At the base, real core walls would be about 0.8–1.0 m and party walls about 0.5 m (codes.md §3.4). The game keeps today's thin walls. That costs nothing in plans and is noted as a known simplification.

### 2.3 Families (per refuge segment)

**Generator capability.** Distinct `planSignature`s from the **unchanged** generator over variants 0–31, non-luxury (`west-calc/variety.mjs`):

| slot | W1 | W2 |
|---|---|---|
| SW | 17.0: 2BR 12, 3BR 12, 4BR 10 | 14.6: 2BR 16, 3BR 16 |
| S | 10.6: 2BR 5 | 11.2: 2BR 8 |
| SE | 15.8: 2BR / 3BR / 4BR 16 each | 17.6: 16 each |
| NW | 14.4: 2BR 15, 3BR 16 | 11.6: 2BR 14, 3BR 16 |
| NE | 11.0: 2BR 11, 3BR 8 | 13.8: 2BR 15, 3BR 16 |

The `lux` program (主卧套房 + 衣帽间 + 中西厨) gives **none** in 8.4–9.0 m-deep slots. It was written for 北苑's 16 m wings. Families therefore vary by type and variant, not by `lux`.

**Proposed mixes.** Every floor has 5 different plans, and every plan is distinct within its tower (the generator's `exclude` set). Columns are SW · S · SE · NW · NE.

| family | floors | W1 | W2 | story |
|---|---|---|---|---|
| **A** 标准 | 2F–15F | 4 · 2 · 3 · 3 · 2 (today's SW / S / SE / NE plans kept; NW re-cut) | 3 · 2 · 4 · 2 · 3 (SW / S / SE / NW kept; NE re-cut) | the catalogued homes |
| **B** 换角 | 17F–30F | 3 · 2 · 4 · 3 · 2 | 3 · 2 · 3 · 3 · 2 | the 4BR moves corner (W1); a 大三房 158 m² and a 大两房 116 m² (W2) |
| **C** 改善 | 32F–45F (S47: 32F–47F) | 4 · 2 · 4 · 3 · 3 | 3 · 2 · 4 · 3 · 3 | more bedrooms: W1 2 × 4BR + a compact 92 m² 3BR |
| **D** 云端 | 47F–61F (S61 only) | 3 · 2 · 3 · 3 · 2 | 2 · 2 · 4 · 2 · 3 | fewer, larger rooms: 大三房 153 / 142 m², 大两房 131 m² |

- **Feasibility.** `west-calc/families.mjs` generated families A and B completely for both towers: 10 / 10 plans each, all distinct within the tower, with no validation errors. The first C / D attempt used the `lux` program and failed, which is why the mixes above avoid `lux`. Every C and D type pick above is inside the capability table.
- **Plan count:**
  - S61: 20 flat plans per tower, **40 for 西苑**;
  - S47: 15 per tower, 30.
  - Today: 10.

**顶层复式 (optional, top two floors: 60F–61F in S61, 46F–47F in S47).**
- Five duplexes per tower, one per slot. The entry is on the lower floor. The upper level has a second 乙级 door onto the upper corridor (双入户), so the fire lift still serves a real landing there.
- `generateDuplex` produced **0 / 20** in these slots. Its lower-level program (guest suite, study, tea room, laundry, powder room) does not fit 95–153 m².
- A west duplex program is needed:
  - lower: living, dining, kitchen, one bedroom, bathroom, `DUPLEX_STAIR`;
  - upper: master suite plus 1–2 bedrooms;
  - `rise` parameterised to 3.0 m.
- Budget a separate small task. Without it, the top floors are family D (S61) or C (S47).

### 2.4 Home counts

| | per tower | 西苑 | level records | plans |
|---|---|---|---|---|
| today | 135 | 270 | 270 | 10 |
| **S61** | **285** (280 with 复式) | **570** (560) | 570 | 40 (+10 duplex levels) |
| **S47** | **220** (215) | **440** (430) | 440 | 30 (+10) |

Unit codes stay `W1-0201` … `W1-6105`: two-digit floor plus slot. Duplexes take the entry floor's number (`W1-6001`); the plate reads `6001 · 60–61F`.

### 2.5 Per-home fire items (apply to all homes; the tower is already above 54 m today)

- **户内避难间** (GB 50016 §5.5.32 ✔): one bedroom per home, on the external wall (south row: the hardstand face), with a 乙级 door leaf.
  - Tag it in the plan data: `refugeRoom: 'bed_2'`.
  - Set `fire: '乙级'` on that door in the parallel workflow's `doorLeaves()` record.
  - The catalog marks it.
- **Above 100 m:**
  - sprinklers and smoke detectors in every home (GB 55037 §8.1.9-3, §8.3.2-3 ✔): heads go in the lazy interior only;
  - A级 façade insulation (§6.6.6 ✔);
  - 甲级 doors on stairs and 前室 (§6.4.3 ✔).

### 2.6 Generator and data changes

- **`scripts/prepare-community-plans.mjs` `WEST.towers[i]`:**
  - gains `families: [{ id:'A', floors:[2,15], south:[…], north:[…], variant }, …]`;
  - the north rows take the new slot widths;
  - one `used` set per tower keeps every plan distinct;
  - west generation stays under about 10 s (A + B measured at about 1 s per tower).
- **Data:**
  - becomes `COMMUNITY_PLANS.west[id] = { core, lobby, families: { A: { floors, units }, … } }`;
  - `westTower()` picks a family by `levelNumber`;
  - west plans are about 4.6 kB each, so the west section grows from 46 kB to about 185 kB.
- **File size.** Today's file is 514 kB against a 600 kB cap. With the north's extension it goes far beyond the cap either way. Options:
  - **split** the generated file into `community-plan-data-west.js` and `-north.js`;
  - or raise the cap to 1,200 kB as north.md §3.4 proposes.

  Splitting keeps the north SHA lock independent of the west.

---

## 3. Lifts

### 3.1 Why 3 lifts in total is not enough (`stack_lifts.py`)

Model:
- CIBSE / Barney up-peak, 1,000 kg cars rated 13 persons, loaded to 80 %;
- 19 persons per floor;
- doors open in 2.0 s and close in 3.0 s.

Up-peak with full cars is conservative for homes, whose peak is the evening two-way. Targets are an interval (INT) of 50–60 s and a 5-minute handling capacity (HC5) of about 7 % of the population (codes.md §4.2).

| scheme | INT | HC5 | verdict |
|---|---|---|---|
| S61: one bank of 3 at 4 m/s, 57 stops | 66.4 s | 4.3 % | ✗ |
| S61: one bank of 4 at 5 m/s | 46.2 s | 6.2 % | marginal, and it would be 4梯5户 |
| **S61 low bank: L1 L2 F1, 3.0 m/s, 28 stops** | **54.4 s** | **10.8 %** | ✓ |
| S61 high bank at 5.0 m/s, 29 stops, 97.5 m express | 62.2 s | 9.1 % | marginal |
| **S61 high bank: H1 H2 F2, 6.0 m/s** | **58.5 s** | **9.7 %** | ✓ |
| S47: one bank of 3 at 4 m/s, 44 stops | 59.8 s | 6.2 % | borderline |
| **S47 high bank at 4.0 m/s, 16 stops** | **58.6 s** | **17.5 %** | ✓ |

The same 6-lift core serves both stacks, so S47 → S61 is a data change.

### 3.2 Banks, cars, speeds and stops

| lift | role | car | speed | S61 stops | S47 stops |
|---|---|---|---|---|---|
| **L1, L2** | low-zone passenger | 1,000 kg, 1.6 × 1.4 m | 3.0 m/s, MRL | B2 B1 1F, 2F–15F, 17F–30F (**31**) | same (31) |
| **F1** | low-zone fire lift + stretcher | 1,050 kg, 1.1 × 2.1 m | 3.0 m/s | B2 B1 1F, 2F–31F incl. 16F and 31F (**33**) | same |
| **H1, H2** | high-zone passenger | 1,000 kg | **6.0 m/s** (S47: 4.0) | B2 B1 1F, 32F–45F, 47F–61F, RF (**33**) | B2 B1 1F, 32F–47F, RF (20) |
| **F2** | high-zone fire lift + stretcher | 1,050 kg, 1.1 × 2.1 m | 6.0 m/s (S47: 4.0) | B2 B1 1F, 31F, 32F–61F incl. 46F, RF (**35**) | B2 B1 1F, 31F, 32F–47F, RF (21) |

Notes:
- **Fire lift run times** (GB 50016 §7.3.8-3 ✔, ≤ 60 s; deceleration 0.9 m/s²):
  - F1, 1F → 31F (93 m): **34.9 s**;
  - F2, 1F → 61F (186 m): **38.3 s** at 6 m/s; S47 → 47F: 40.7 s at 4 m/s.
- **Every storey is one fire compartment** (833 m²) and is served by ≥ 1 fire lift (GB 55037 §2.2.6 ✔). Each fire lift stops on every floor of its zone (§2.2.10 ✔), including the refuge floors in that zone.
  - 31F is served by both: F1 is the top of its zone, and F2 serves it because 31F is the refuge floor for 32F–45F.
- **Stretcher:** each zone has its own stretcher lift (GB 50096 §6.4.2 ≈).
- **Machine rooms:**
  - The 6 m/s high bank has a machine room over the core at RF (§1.5).
  - The low bank is machine-room-less, with its machines in the shaft heads at 32F.
  - **Above 32F the low-bank shafts end.** Their 2.6 × 7.6 m footprint becomes core service cells on 33F and up (储藏 / 管井), so the high-zone lobby has 3 lift doors facing a wall.
- **Landing-door instances:** 196 stops per tower (S61), still one `InstancedMesh` per tower. `landingDoors()` already reads `serves`.
- **Lift records** gain:
  - `zone: 'low' | 'high'`;
  - `speed`;
  - `label`: `西苑低区客梯 1`, `西苑高区客梯 1`, `低区消防电梯`, `高区消防电梯`.
- **Per-level `corePlan.lifts[i]`** gains `landing: serves.includes(lv.id)`.
  - `liftShaft()` draws the door side as a solid wall when `landing` is false.
  - That gives the blank shaft walls of the other bank and the sealed passenger shafts on refuge floors.

### 3.3 Core layout (tower-local; north band z[−9.6, −1.2])

The lobby x-range is held at today's value, so everything keyed to it stays: the 1F gate, the B1/B2 vestibule and gate frames, and `deckPortal`.

| element | **W1** x | **W2** x | z | notes |
|---|---|---|---|---|
| Stair A (防烟楼梯间) | [−7.3, −3.7] (moved 2.3 m W) | [−10.1, −6.5] (unchanged) | [−9.6, −1.2] | door S at x0 + [1.1, 2.5]; split at refuge floors (§1.4) |
| service column | [−3.7, −1.25] | [1.85, 4.3] | 管道井 [−9.6, −6.6] · 强弱电 [−6.6, −4.4] · 垃圾间 [−4.4, −1.2] | also holds the 加压送风井 |
| **low bank** L1 · L2 · F1, doors E | [−1.25, 1.35] (2.6) | [−6.5, −3.75] (2.75) | L1 [−9.6, −7.2] · L2 [−7.2, −4.8] · F1 [−4.8, −2.0] · chase [−2.0, −1.2] | F1 nearest the corridor |
| **lift lobby** = 消防电梯合用前室 | **[1.35, 4.35]** (today) | **[−3.75, −0.75]** (today) | [−9.6, −1.2] | 3.0 × 8.4 = 25.2 m² (≥ 6 m², short side ≥ 2.4 m ✓; ≥ the deepest car 2.1 m ✓); open to the corridor as today; north-end window |
| **high bank** H1 · H2 · F2, doors W | [4.35, 7.1] (2.75) | [−0.75, 1.85] (2.6) | as the low bank | 3 + 3 facing (≤ 2 × 4 ✓, GB 50352 §6.9.1 ≈) |
| Stair B | [7.1, 10.7] (unchanged) | [4.3, 7.9] (moved 2.3 m E) | [−9.6, −1.2] | |

Effects:
- **`WEST_SITE.towers[i]`:**
  - `core: [−7.3, 10.7]` / `[−10.1, 7.9]`;
  - new `lobby: [1.35, 4.35]` / `[−3.75, −0.75]`;
  - `serviceSide: 'W' | 'E'`.

  `westCore(c)` becomes `westCore(spec)` with explicit columns, so the vestibule is the lobby x-range.
- **1F lobby** (`communityLobby`):
  - W1 kids' room x[−21.7, −7.3] (14.4 m);
  - W2 reading room x[12.4, 21.7] (9.3 m, was 11.6).

  All automatic from `core.x0` / `core.x1`.
- **Basement lobby** `K.basement` widens 2.3 m: W1 to the west, W2 to the east. That is 29 m² more deck exclusion per level, so WPG-B1/B2 lose about 1–2 bays per level per tower (≈ 4–8 bays). The portals do not move.
- **Optional realism (P2): corridor 前室.**
  - Today both stairs and the lobby open straight onto the corridor. At > 33 m a 防烟楼梯间 needs a 前室.
  - Two hold-open fire doors across the corridor at the core's ends (x = core.x0 and core.x1) make the corridor segment in front of the core the **合用前室** (stairs + fire lifts): 32 m² plus the lobby.
  - Above 100 m these doors are 甲级 (GB 55037 §6.4.3 ✔). They are magnetically held open and close on alarm.
  - The 1–3 south home doors that open into it must be 乙级 (≤ 3 per GB 50016 §5.5.27-3 ✔).
  - In the game these are parked-open door leaves, using the parallel workflow's `doorLeaves()`. No nav change.

### 3.4 B1 / B2, card gates and 梯控

- **Gates are unchanged in number and place:** `W1-1F-GATE`, `W1-B1-GATE`, `W1-B2-GATE` (W2 likewise), 6 gates and 6 zones.
  - The B1/B2 zone polygons grow with the basement rectangle.
  - The 1F zone is unchanged.
- **Both banks open on B2 / B1 / 1F** inside the gated lobby:
  - from the WPG deck: portal → card door → lift lobby → the bank for your floor;
  - overhead signs: `低区 2F–30F · L1 L2 F1` and `高区 32F–61F · RF · H1 H2 F2`.
- **梯控 (realistic, cosmetic):**
  - A resident's card lights only their own floor plus 1F / B1 / B2 (and RF in S47, where the garden stays).
  - Visitors are registered by 礼宾.
  - The pick card / HUD text: `刷卡乘梯 · 仅可到达本户楼层`.
- **Fire mode** (GB 55037 §7.1.7 ✔):
  - card doors release on alarm and open from inside without tools;
  - passenger lifts recall to 1F;
  - F1 / F2 take the 消防员 switch at the 1F lobby.

  Sign sub-text: `火灾时自动释放`.

### 3.5 Game ride and lift prompt (shared with north.md §4.5)

- **Ride time.** `elevator-ride.js`: `travel = Δy / (2 × (e.speed ?? 3.5))`.
  - 1F → 61F on H1 at 6 m/s: 15.5 s. Today's formula (Δy / 7) gives 26.6 s.
  - L1 to 30F: 15 s.
  - The HUD shows the real time (`实际约 38 秒`); **Space** skips.
- **Prompt.** Today it is one button per stop, for every lift near you, with keys 1–9. In the 1F lobby that would be 6 lifts × about 32 stops.
  - Use north.md's **keypad grid**, one keypad per bank: `低区 · L1 L2 F1` / `高区 · H1 H2 F2`.
  - Digits + Enter, grouped by family band; refuge floors appear only on F1 / F2.

---

## 4. Fire (summary; clauses per codes.md)

| topic | design | clause |
|---|---|---|
| height / class | S61 189.0 m (S47 145.5 m) to 屋面面层; 一类高层住宅, > 100 m. The crown is a 屋顶构架 (≤ ¼ of the roof): not counted. | GB 50016 App. A ✔; Table 5.1.1 ✔ |
| fire road / hardstand | **unchanged**: road z[−221.8, −211.8], 10 m wide, 5 m off the south face, full 43.4 m long side (HS-W1 / HS-W2). The 1F canopy is 3.2 m deep (< 4 m) ✓. | GB 55037 §3.4.3, §3.4.6–7 ✔ |
| entrance opposite the hardstand | the 1F street door `Wn-MAIN` on the south face → lobby → lift lobby (< 30 m) | GB 55037 §2.2.2 ✔; GB 50016 §7.3.5 ✔ |
| 消防救援口 | 2 per storey on the south face from 3F (one in the S home, one in the SE home), 1.0 × 1.0 m, red triangle; part of the instanced module (§6) | GB 55037 §2.2.3 ✔ |
| refuge floors | §1.4 | GB 55037 §7.1.14–15 ✔; GB 50016 §5.5.23, §5.5.31 ✔ |
| fire lifts | F1 / F2, one per zone, ≥ 1 per compartment per floor; 合用前室 25 m² | GB 55037 §2.2.6, §2.2.8, §2.2.10 ✔ |
| stairs | 2 separate 防烟楼梯间 per floor at the core ends; home door → nearest stair about ≤ 15 m (estimated from the slot geometry; limit 40 m, 50 m sprinklered); 分隔 at refuge floors; stair / 前室 doors 甲级 above 100 m | GB 55037 §7.3.1-2, §7.1.9, §6.4.3 ✔; GB 50016 Table 5.5.29 ✔ |
| compartments | 833 m² per storey ≤ 1,500 m² (3,000 m² sprinklered): 1 per storey | GB 55037 §4.3.16 ✔ |
| smoke control | stair + lobby pressurisation in two segments ≤ 100 m (fans on 31F and RF) | GB 51251 §3.3.1 ≈ |
| fire water | roof tank ≥ 36 m³; transfer tank + pumps on 31F; PRVs on 16F / 46F | GB 50974 §5.2.1, §6.2.1 ≈ |
| separation | W1–W2 22.6 m ≥ 13 m (> 100 m, no reductions) ✓; P1 is 90 m away | GB 55037 §3.3.1 ✔; GB 50016 §5.2.6 ✔ |
| kids' room | stays on 1F | GB 55037 §4.3.4 ✔ |
| helipad | not required: residential (§7.4.1 covers public buildings > 100 m with a standard floor > 2,000 m²) | GB 50016 §7.4.1 ✔ |

---

## 5. Structure and the height to choose

### 5.1 Numbers (7度 0.10g as briefed; codes.md §3)

| | today | **S47** | **S61** |
|---|---|---|---|
| structural height (main roof) | 85.5 m | 145.5 m | 189.0 m |
| H/B, B = 19.2 m (JGJ 3 Table 3.3.2 剪力墙 6/7度: **6**) | 4.45 ✓ | **7.58** (+26 %) | **9.84** (+64 %); 10.4 to the crown |
| JGJ 3 height table for 剪力墙 (A级 / B级): 7度 120 / 150 m; 6度 140 / 170 m | A级 ✓ | **within B级** at 7度 and 6度 (超限 review, routine) | **beyond B级** at both (超B级) |
| drift limit Δu/h (§3.7.3 ✔) | 1/1000 | 1/1000 | ≈ 1/719 (interpolated 150–250 m) |
| wind comfort, 10-year wind (§3.7.6 ✔, H ≥ 150 m) | n/a | **n/a** (145.5 m) | **required**: ≤ 0.15 m/s² for residential |
| plan aspect L/B | 2.26 | same | same |

### 5.2 What makes it hard, beyond H/B

- **The weak (N–S) direction is resisted only by transverse walls:** party walls, core cross walls and end walls.
  - Those walls are cut by the 1.8 m corridor into an 8.4 m north part and a 9.0 m south part.
  - At each floor they couple only through the corridor slab and link beams.
- **The core sits in the north half.** The centre of stiffness is several metres north of the centre of mass in N–S, so there is torsional eccentricity. JGJ 3 §3.4.5 ≈ asks for a displacement ratio ≤ 1.2, and at most 1.4.
- **Across-wind response.** For wind along the slab, the across-wind face is 19.2 m. The across-wind response governs a slender slab at 200 m, so a wind-tunnel test is mandatory in practice.
- **Policy.** 建科〔2021〕76 号 ≈ (via north.md): 一般不得新建超高层住宅. R1–R4 at 103 m are already over that line; any 西苑 stack above 100 m is a special case.

### 5.3 Mitigations (in order)

1. **Lower the tower to S47.** This is the one that changes the verdict: within B级, no comfort requirement, H/B 7.6.
2. **加强层 on the refuge floors** (JGJ 3 §10.3.1 ✔: "可利用建筑避难层、设备层空间，设置适宜刚度的水平伸臂构件"). This is the slab version of an outrigger.
   - Storey-deep (4.5 m) **跨走廊伸臂墙** tie the north and south parts of every transverse wall line into one 19.2 m-deep wall. Each has a door opening on the corridor line.
   - Deep spandrel walls on both long faces act as flanges.
   - Where north and south party walls do not line up (W1: core walls at −3.7 / −1.25 / 1.35 / 4.35 / 7.1 m against south walls at −4.7 / 5.9 m), the 伸臂墙 run from the nearest core cross wall in the refuge storey's own walls.
   - Columns and walls on and next to these storeys go up one seismic grade.
3. **Thicker walls.** Core and end walls 0.9–1.0 m at the base (C60), stepping to 0.4 m. Transverse walls about 0.5 m. Steel-plate composite walls (钢板剪力墙) in the bottom third for S61.
4. **Torsion.** A thick south corridor wall and thick south-face spandrels balance the north core.
5. **Damping** (S61): a TLD water tank of 300–400 m³ in the crown, sharing the fire reserve. Chamfered crown fins are porous.
6. **Foundation.** H/B > 4, so there must be no zero-stress zone (§12.1.7 ≈). Bored piles plus a raft under WPG-B2, extending beyond the slab. The WPG columns over the raft are re-founded; no game geometry.

**What does not help:** a deeper plate.
- The fire road z0 = −221.8 holds the south face at −226.8, 5 m off the hardstand.
- The plot line is 4 m north of the slab (−250).
- Even 23.2 m with a zero north setback gives H/B 8.1 at 189 m. That also breaks road setbacks: 9.8 m to the 北环 road edge today (PLAN.md risk 7).

**Linking W1 and W2** adds nothing in N–S.

### 5.4 Recommendation

**Build S47: RF 145.5 m, crown 156.5 m.**
- It is the tallest 西苑 that a review panel would plausibly accept on this plot.
- With R1–R4 and H / A at 190–200 m, the cluster still reads as supertall. 西苑 is the lower step at the west end.

If the user insists on about 200 m for 西苑 too, build S61:
- say plainly that it is 超B级 with H/B 9.8;
- list mitigations 2–6 above in the tour or catalog text.

---

## 6. Exterior and the render budget

### 6.1 Measured growth (Node, `west-calc/geo.mjs`, `inst.mjs`; 18 B/vertex as in `tests/community-render.test.js`)

| | today | S47 naive | S61 naive | **S47 instanced** | **S61 instanced** |
|---|---:|---:|---:|---:|---:|
| W1 exterior vertices | 125,436 | 202,842 | 260,190 | 38,112 | 41,304 |
| W1 / W2 per tower (exterior + lobby + B1/B2), MB | 2.81 / 2.90 | 4.21 / 4.29 | 5.24 / 5.32 | 1.24 / 1.33 | **1.30 / 1.39** |
| **community resident total** (test ≤ 10 MB; today's 北苑) | 9.94 | 12.73 ✗ | 14.79 ✗ | 6.80 | **6.92** |
| near draw calls per tower (Node meshes) | 8 | 8 | 8 | 41 | 41 |
| near drawn triangles per tower | 41.2k | 66.5k | 85.3k | 66.4k | 85.2k |
| far LOD triangles per tower | 616 | 1,088 | 1,396 | same | same |

**Per typical home floor:** 4,492 vertices (81 kB). By material:

| material | vertices per floor |
|---|---:|
| `facadePlaster` (sills, lintels, slab ceiling) | 2,237 |
| `extMetal` (trims, mullions, rails) | 1,212 |
| `stone` (slab top) | 343 |
| `extSatin` (bands, curtains) | 275 |
| `glassTint` | 210 |
| `glowSoft` | 119 |
| `glass` | 18 |

The piers, pilasters and core walls already merge up the tower in `Columns`. Every plan floor repeats, so the per-floor parts are what grow.

**Other costs (S61):**
- Layout heap: 41.0 → 50.1 MB.
- 西苑 level JSON: 3.56 → 7.47 MB.
- `buildLayout`: 1.75 → 1.83 s.
- `buildCommunityTower` (W2): 109 → 140 ms.

### 6.2 Instanced floor modules (the fix)

Unlike 北苑 (north.md §7.1: no two floors alike), 西苑 floors repeat 13–15 times per family. That makes instancing the natural fix and keeps today's plan-driven punched windows and balconies, which the user has seen and the interiors match.

- **Layout:** each level gets `facadeModule`:
  - the family id for home floors;
  - `'R'` for refuge floors;
  - `null` for 1F, RF and duplex floors.
- **Render** (`buildCommunityTower`):
  - For every module, the **direct geometry** of its lowest floor is built once into its own `BatchSet`: windows, sills, lintels, trims, railings, curtains, slab, band and rescue-window marks.
  - It is flushed and wrapped per material in an `InstancedMesh`, with one instance per floor (`makeTranslation(0, Δy, 0)`).
  - **Storey-high walls** of every floor still go to the shared `Columns` and merge into tower-tall boxes. That keeps the drawn triangles equal to the naive build (85.2k against 85.3k, measured). Putting walls in the module raised them to 126k in the first prototype.
  - The floor cutaway works unchanged: instances use the tower's clipping-plane materials.
  - Shadows are cast per instance.
- **Night windows.** Keep `glowSoft` (lit panes and curtains, 119 vertices per floor) **per floor in the main batch**, so lit windows do not repeat floor after floor. This costs +0.12 MB per tower.
- **Draw calls near** 西苑:
  - 5 modules × about 6.6 materials + the 8 unique batches = 41 per tower;
  - the shadow refresh adds about +30.
  - The campus view is unaffected (§6.4).
  - In the N1 view (290–350 m, both 西苑 towers near), steady calls rise by about 66: 1,359 → about 1,425. That is still far below the campus worst case of 2,907.
- **Option: `THREE.BatchedMesh`** (r170: `addGeometry` / `addInstance`). One mesh per material holds the unique geometry and the modules, which is 9 calls per tower.
  - It needs `WEBGL_multi_draw`.
  - Without the extension, three r170 loops one draw per instance (checked in `three.module.js`), about 400 calls per tower near. Firefox lacks the extension ≈.
  - Use it only behind a capability check, with the `InstancedMesh` path as the fallback.
- **The same instancing cuts today's 27-storey towers** from 2.81 / 2.90 to 0.90 / 0.99 MB (measured). The method pays off even before the extension.

**Final S61 estimate**, prototype plus the items not prototyped:

| item | per tower |
|---|---:|
| prototype (4 families + refuge) | 1.30 / 1.39 MB |
| per-floor lit windows | +0.12 MB |
| 复式 floors, if built | +0.16 MB |
| louvres and crown | +0.05 MB |
| **total** | **≈ 1.6–1.7 MB** |

- 西苑 total ≈ 3.3 MB, against 5.72 MB today.
- With north.md's 北苑 (≈ 1.6 MB), the community total ≈ **5.8 MB ≤ 10 MB**.

### 6.3 Refuge bands, crown, façade rhythm

- **Bands.** A 4.5 m band at 46.5–51.0, 93.0–97.5 and 139.5–144.0 m:
  - dark grey rain louvres (`extMetal`, horizontal blade trims every 0.3 m) on plant faces;
  - openable 乙级 fire windows with two red rescue triangles on the 避难区 south bay (x[−9, 9]);
  - E / W corridor-end windows.

  One `'R'` module, about 1.5k vertices, instanced 3 times. At night the bands stay dark: no `glowSoft` except exit-sign green.
- **Rhythm:** glass 1F → 14 → band → 14 → band → 14 → band → 15 → crown (S47: 14 → band → 14 → band → 16 → crown).
  - The band at 31F is also the lift zone break.
  - 北苑's bands at 46.2 / 93.6 / 141.9 m are within 0.3–2.4 m of these, so from the river the two communities' bands nearly line up.
- **Crown:** §1.5. Fins continue the pilasters, which are already merged columns: +4 boxes per pilaster line. Ring beam, sign at RF + 6 m, aviation lights.
- **Balconies** stay open glass-balustrade balconies, as today. Above 100 m open balconies bring wind and falling-object concerns. North.md encloses them for 北苑's premium product.
  - For 西苑, propose 封闭阳台 (sealed with sliding glass) **above 31F only** as an open question (Q5).
  - That is a material change in the high-zone modules (glass instead of a rail), at no geometry cost.

### 6.4 Far LOD (600 m, unchanged mechanism)

- **It already carries the campus view.** The campus camera V(110, 430, 480) is 937 m from W2's centre at half height, so 西苑 is drawn as the 2-mesh stand-in.
- **Changes in the campus view:**
  - triangles +0.8k per tower (S61) / +0.5k (S47);
  - draw calls unchanged;
  - scene geometry falls by about 2.5 MB, because the instanced near exterior is smaller.

  The +15 MB campus geometry budget (12.42 MB used) gains headroom for R / H / A.
- **Additions:** refuge-band strips (`FAR_LOUVRE` about `#5d6466`) and a crown silhouette (4 quads plus the machine-room box).
  - S61 lands near 1,550 triangles, so raise the test cap from **1,500 to 2,000**.
  - The per-storey spandrel and band quads (≈ 900 triangles at S61) are the bulk if it must shrink.
- **Silhouette test:** 0.5 m bounds tolerance. The crown fins must appear in the stand-in, or the height check fails by 11 m.

### 6.5 Limits for the implementer

- Community resident ≤ 10 MB (unchanged; expect about 5.8 MB with the north design).
- 西苑 near exterior:
  - ≤ 8 + 7 × modules meshes per tower (S61: ≤ 43);
  - drawn triangles ≤ 200k for both towers (S61 is 170.5k plus louvres and crown).
- Far LOD ≤ 2 meshes and ≤ 2,000 triangles.
- Campus steady calls within +50 of `dc4951d`, measured with `perf/measure.cjs` once all towers land.

### 6.6 Alternative (one method for both communities)

North.md §7.2 replaces 北苑's punched windows with a **plan-independent unitized curtain wall**: mullions and glass merge vertically, 8 meshes per tower.

The same could be done for 西苑. It would cost the punched-window and balcony character, which the user saw in the catalog, and it would put glass in front of party walls and kitchens. The interior windows would then no longer match the exterior.

**Recommendation:** instancing for 西苑, the curtain wall for 北苑. Each fits its product: 西苑 is mass-market 板楼 punched windows; 北苑 is a premium glass tower.

---

## 7. What else changes

### 7.1 Files

| file | change |
|---|---|
| `src/layout/community-sites.js` | `WEST_SITE.levels`: `{ …, refugeHeight: 4.5, top: 61 \| 47, refuge: [16, 31, 46] \| [16, 31], crown: 11 }`, with `roof` computed and asserted; `towers[i].core` / `lobby` / `serviceSide`; `families` (floor ranges); `zones: { low: [2, 30], high: [32, top] }` |
| `src/layout/community.js` | `levelDefs()` with refuge storeys; `westCore(spec)` with the §3.3 columns; 6 lift records (`zone`, `speed`, stop lists §3.2); refuge-level record (§1.4); `corePlan.lifts[i].landing`; low-bank cells above 32F; family lookup per level; `facadeModule`; RF plant (S61) or reduced garden (S47); level names and labels; `storeys` |
| `src/layout/community-contract.js` | `refuge` kind, `refugePlan`, lift `zone` / `speed`, `facadeModule` |
| `src/layout/tower-stairs.js` | `breakLevels` (shared with north.md §5.1); 西苑 door split x0 + [0.3, 1.7] / [1.9, 3.3] |
| `src/layout/elevator-ride.js` | `travel = Δy / (2 · speed)` (shared) |
| `src/layout/community-plan.js` | optional: shallow-slot duplex program (§2.3); nothing for flats |
| `scripts/prepare-community-plans.mjs`, `src/layout/community-plan-data*.js` | families, re-cut north slots, file split (§2.6) |
| `src/render/build/community.js` | floor-module instancing (§6.2); refuge bands; crown; blank lift door walls; far-LOD bands and crown; sign at RF + 6 |
| `src/render/build/residence-interiors.js` (or a new `refuge-interiors.js`) | lazy refuge-floor interior: tanks, pumps, fans as boxes, hydrant cabinets, `16F 避难层` signs, the 避难区 floor finish |
| `src/render/explore.js` | lift keypad per bank (shared) |
| `src/render/floor-rows.js`, `ui.js` | band headers (shared with north.md §8.4) |
| `src/render/tour.js` | 西苑 step (§7.5) |
| `scripts/unit-catalog-plans.mjs`, `docs/unit-catalog-2026-11-05.md` | family sheets (§7.4) |

### 7.2 Tests with pinned counts

S61 / S47. All suites listed in the first row were run against the S61 prototype: 58 / 65 tests pass, and the 7 failures are below.

| test | today | S61 | S47 |
|---|---|---|---|
| **run on the S61 prototype:** `west-garden`, `community-plans`, `community-render`, `label-declutter`, `ui-floor-rows`, `riverside-integration`, `west-parking`, `community-contract`, `community-doors`, `residence-access` | — | 7 fail (rows marked ✗) | — |
| west-garden `3梯5户：每层三部电梯…` ✗ | 3 lifts; 31 levels; shorts B2…28F, RF; RF 85.5; 28F 82.5 | 6 lifts; each home floor served by **exactly 3** (its bank); refuge floors by 1–2 fire lifts; 64 levels; RF 189.0; 61F 186.0 | 6; 50 levels; RF 145.5; 47F 142.5 |
| west-garden `每栋 27 层 × 5 户…两楼共 10 种户型` ✗ | 27 floors / 135 / 10 / 270 | 57 / 285 / **40** / 570 | 44 / 220 / 30 / 440 |
| west-garden `漫游…两部楼梯 B2 ↔ RF` ✗ | uses `${id}-L1` on every floor; 60 routes | the bank's lift per level; walk through the 分隔 doors; 126 routes | 98 |
| west-garden `塔楼满足社区契约` ✗ | — | add `refuge` to `LEVEL_KINDS` | same |
| west-garden gates (6 zones), positions, fire road, garden | — | unchanged ✓ | ✓ |
| community-plans `西苑 10 套…` / `每栋 5 种…` / `≤ 600 kB` | 10 / 5 / 600 kB | 40 + duplexes / 5 per family / split file or 1,200 kB | 30 |
| community-render `≤ 8 次绘制 … 西苑 ≤ 16 次 / 17 万三角形` ✗ (170,520) | 8 / 82k | ≤ 8 + 7 × modules; ≤ 200k | ≤ 140k |
| community-render `社区住宅几何 ≤ 10 MB` ✗ (14.79 naive) | 9.94 | ✓ about 5.8 with instancing | ✓ |
| community-render far LOD `≤ 1,500 三角形` | 616 | cap 2,000 | ✓ 1,088 |
| riverside-integration `园区总数` ✗ | 338 levels · 76 lifts · 106 stairs · 1,066 records / 1,046 homes · west 270 | **404 · 82 · 106** (`breakLevels` keeps the records) · **1,366 / 1,346** (with 复式: 1,336) · west 570 | 376 · 82 · 106 · 1,236 / 1,216 · 440 |
| riverside-integration `W1-B1-GATE → W1-L1 → W1-12F` | — | ✓ unchanged (L1 is low bank, 12F is family A) | ✓ |
| riverside-integration surface lots `[427, 20, 51, 9]`; shared-garages `> 800 per deck` | — | unchanged ✓; −4…8 deck bays | ✓ |
| community-render / community-doors `W1-12F`, `W1-1201` | — | ✓ (family A keeps the SW plan) | ✓ |
| label-declutter title at `85.5 + 26` | 111.5 | RF + 26 = 215: the low camera must look higher | 171.5 |
| ui-floor-rows W1 / W2 | 31 rows | 64 rows + band headers | 50 + headers |

North's own changes to these totals (levels, LS lifts) add on top; the integrator sums them.

### 7.3 WPG lots, shadows, labels, sun

- **In-game shadows.** `env.sunDir` is (−0.55, 0.78, 0.62), so the sun stands in the south-west and shadows fall north-east at 1.06 × height.
  - W2's 200 m crown throws its shadow about 212 m, to about (−229, −385): over 北环 and the river.
  - The nearest public lot, C1 (z −248…−230), stays clear. The shadow edge at x −346 is at z −254.5.
  - **No WPG lot is shaded.**
  - The 西苑 tour step uses `shadow: 180`, which truncates a 212 m shadow. Use 260 (§7.5).
  - The campus shadow box (radius 330 m about the campus centre) never reached 西苑, and still does not.
- **Real winter sun** (`sun.py`, 大寒日 08:00–16:00, 30.3°N, box model).
  - 2F south sill, today: W1 7.50–7.72 h, W2 7.50–7.63 h.
  - With the full cluster (H 200, A 190, T1 200, T2 185, R 186 / 198 / 210 / 198, W 200 m): **W1 6.83–7.22 h, W2 5.90–6.23 h**. The ≥ 2 h requirement holds (GB 50180 ≈).
  - The tall hotel takes the 08:30–10:30 sun from W2.
  - 北苑 and R cannot shade the south faces in winter: they lie at azimuths the winter sun never reaches.
  - The north-row E / W end windows are blocked only by the neighbouring slab, which is already tall enough to do that today, so nothing changes there.
- **Our shadow on neighbours.** At 大寒 noon the 200 m crown's shadow is 243 m long, ending at z ≈ −489, beyond the river's north bank (−412). The north-bank city blocks begin at z −530, so they are not reached.
- **Labels.**
  - The tower title sits at `top + 26`: about 215 m (S61) / 172 m (S47).
  - `towerOccluders()` boxes grow with the towers, so more WPG labels behind 西苑 hide. That is correct behaviour.
  - Re-pin `label-declutter.test.js` (the title height, and the low-camera framing).
  - Optional: cap the title offset at crown top + 4 m so it does not float 26 m above a crown.
- **Resident parking.** 570 homes × 1.0–1.2 ≈ 570–680 bays (S47: 440–530), against about 324 at today's ratio.
  - Proposal: a card-controlled 住户专区 in the WPG-B1/B2 north decks: painted bays and signs, no new geometry.
  - Public stalls remain far above the mall's need (PLAN.md: about 4,270 against 1,525–1,907).

### 7.4 Catalog

- `scripts/unit-catalog-plans.mjs` gets one sheet per family per tower:
  - A at 12F, B at 24F, C at 40F, D at 52F;
  - 复式 at 60–61F, if built.
- `indexHtml` text: `40 个户型（两房 / 三房 / 四房），按避难层分段：A 2F–15F · B 17F–30F · C 32F–45F · D 47F–61F；同段各层同户型`.
- Refuge floors get a one-page plan sheet: the 避难区, plant, and the 分隔 stairs.
- Mark each home's 户内避难间 and rescue windows.
- `docs/unit-catalog-2026-11-05.md`: W1 NW and W2 NE (re-cut) are flagged `改`.

### 7.5 Tour (`src/render/tour.js`; the parallel workflow also edits this file, so merge)

- **Re-frame `云澜·西苑 · 3梯5户社区`:**
  - caption `云澜·西苑 · 3梯5户 · 61 层（避难层 16F / 31F / 46F）`;
  - `pos V(−215, 140, −40)`, `target V(−425, 95, −236)` (S47: target y 73), `dur 6`, `shadow 260`.

  The distance of about 290 m fits the 200 m height in the 42° view.
- **Optional new step `西苑 · 31F 避难层与高低区换乘`:**
  - `focus: 'W1-31F'`;
  - camera at the south face, at y ≈ 100.
- **Update** the caption list in `riverside-integration.test.js` (l.162).

### 7.6 UI floor rail (about 64 rows) and directory

- `floorRows()` band headers, top-down:
  - `RF 屋顶设备层`;
  - `云端 D 47–61F`;
  - `46F 避难层`;
  - `改善 C 32–45F`;
  - `31F 避难层 · 高低区转换`;
  - `B 17–30F`;
  - `16F 避难层`;
  - `A 2–15F`;
  - `1F 社区大堂`;
  - `B1 / B2 住户电梯厅`.
- Each header shows its bank (`低区梯` / `高区梯`).
- Band chips scroll the rail. After a ride, `scrollIntoView` the arrival floor. This builds on the parallel workflow's rail scrolling.
- The `电梯` stat reads 6: the existing `residentialCore` rule counts the core lifts.
- Refuge floor rows: hatched chip, label `避难层`. They are selectable, and the floor view shows the refuge interior.

### 7.7 Nav and layout cost

- 西苑 levels go from 62 to 128 (S61) / 100 (S47).
- Measured at S61:
  - layout heap +9.1 MB;
  - `buildLayout` +0.08 s;
  - every stair-depth check passes.
- The nav floors build lazily as today. Tower stair instances stay lazy. Interiors stay per floor.

---

## 8. Risks

| # | risk | impact | answer |
|---|---|---|---|
| 1 | **S61 is not a credible structure:** 超B级 剪力墙, H/B 9.8, a slab 19.2 m deep and 189 m tall | The realism-minded user may ask "这么薄能盖 200 米吗?" | Recommend S47; if S61, state 超限 and show mitigations 2–6 (§5.3) |
| 2 | Policy: 建科〔2021〕76 号 ≈ "一般不得新建超高层住宅" | Any 西苑 above 100 m is a special case (as are R1–R4 today) | Say so in the catalog / tour text |
| 3 | Road setback: the north face is 9.8 m from the 北环 road edge, 3.8 m from the plot line; towers above 100 m usually need more ≈ | The towers cannot move south (5 m hardstand rule) | Flag it; the only fix is a smaller or narrower slab |
| 4 | Near-view draw calls +33 per tower with `InstancedMesh` modules | N1 / 西苑 close-ups heavier (still below the campus view) | Measure; switch to `BatchedMesh` where `WEBGL_multi_draw` exists |
| 5 | 复式 generator gap (0 / 20) | Top floors stay flats | Separate generator task (§2.3), or accept family D / C |
| 6 | The core re-cut changes 2 catalogued homes per tower | The catalog changes for W1 NW and W2 NE | Flag `改` in the catalog; all others kept |
| 7 | Stair `breakLevels` touch the shared stair / nav engine | Walk tests and stair instances for 北苑 and 西苑 together | One implementation (north.md §5.1); extend the walk test to cross every refuge floor |
| 8 | Family modules repeat curtains | Curtain positions repeat per family | Lit glow stays per floor, so night does not stripe; curtains are a small daytime effect |
| 9 | 3梯5户 at 200 m is unusual in real Chinese practice (3梯4户 / 4梯4户 are typical) | Marketing-level realism | It satisfies the user's requirement with real 高低区 zoning: 6 lifts, 3 per floor |
| 10 | The plan-data file passes 600 kB | The test cap | Split per community (§2.6) |
| 11 | Clauses marked ≈ (GB 50096 §6.4, GB 50352 §6.9.1, GB 51251, GB 50974, JGJ 3 §3.4.5 / §10.2.5 / §12.1.7, ICAO / CAAC, GB 50180, 建科〔2021〕76 号) | Quoting them to the user | Check the clause numbers before quoting |

---

## 9. Open questions (for the user, via the parent)

1. **西苑 height.** **S47** (≈ 157 m to the crown, H/B 7.6, structurally credible; 220 homes per tower), or **S61** (200 m crown, 超B级; 285 homes per tower)?
2. **Plan families.** Four families (A / B / C / D), or three: A covering 2F–30F, then C and D?
3. **顶层复式** at the top two floors: worth the separate generator work, which turns 5 flats into 5 duplexes per tower?
4. **Roof.** S61 drops the roof garden, keeping RF as plant, as 北苑 does at 187 m. S47 keeps a wind-screened roof garden. Agreed?
5. **Balconies above 31F:** keep them open, or 封闭阳台 (sealed) for wind and falling objects?
6. **Corridor 前室 doors (P2):** add the two hold-open 甲级 doors at the core ends, so each 防烟楼梯间 has a real 前室?
7. **Resident parking:** mark a card-controlled 住户专区 of about 600 bays in WPG-B1/B2?

---

## 10. Method and scripts (`west-calc/`)

| script | what | key output |
|---|---|---|
| `stack_lifts.py` (`python3 -I`) | S61 / S47 / S54 stacks, refuge gaps and areas, banks at 2.5–6 m/s, fire-lift times | §1, §3 tables |
| `sun.py` | 大寒日 sun hours on the south sills; noon shadow length | §7.3 |
| `geo.mjs <root>` | per-tower vertices, MB, triangles, calls, far LOD | §6.1 (`WEST_STACK=today\|S47\|S61`) |
| `permat.mjs <root>` | W1 near vertices by material | §6.1 per-floor split |
| `inst.mjs <root>` | instancing prototype: MB, calls, drawn triangles (`WEST_INSTANCE=1`, `WEST_FAMILIES=1`) | §6.1–6.2 |
| `families.mjs <root>`, `variety.mjs <root>` | generator feasibility of families and duplexes; distinct plans per slot | §2.3 |
| `heap.mjs <root>` (`node --expose-gc`) | layout heap and 西苑 JSON size | §6.1, §7.7 |
| `prototype.diff` | `levelDefs()` stacks (`community.js`) and the module-instancing path (`render/build/community.js`) | starting point for the implementer |

The S61 prototype ran the ten 西苑-related test files at concurrency 2: 58 / 65 pass, and the 7 failures are the pins in §7.2. The scratch worktree was removed after the run.
