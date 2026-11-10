# SPEC · 云澜汇 超高层延伸（supertall）— implementation spec

Study label `supertall`, 2026-11-05. Repo `/home/user/super-mall-3d`, branch `claude/wonderful-thompson-olaaxb`.

**Base: `9bdb886`.** Its `src/` equals `e7cfb42` and `f7a3655`. The parallel workflow's two pieces have already landed there:
- door leaves as layout records and nav obstacles (`8bc9336`);
- the 北苑 7F 空中大堂: P1-RF ⇄ T-7F portals, `T1/T2-7F-GATE`, 16 gates / 14 zones, `towerVisibility`, the floor-rail podium row and scrolling, the tour steps and the P1-RF viewdeck (`f7a3655`).

This spec builds on both and undoes neither. If more of that workflow lands before implementation, rebase onto it; nothing here depends on it.

**Inputs merged** (all in this folder): `DECISIONS.md` (the user's choices; it overrides everything), `codes.md`, `north.md`, `west.md`, `p2.md`, `hotel-apt.md` (v2), `perf.md` (rev. 2).

**Every merged number was recomputed** by `spec-calc/final.py` (`python3 -I spec-calc/final.py`, output in `spec-calc/final.out`): stacks, elevations, refuge spacing, refuge areas, fire-lift run times, H/B, home and record counts, lift stops and campus totals. Render and perf figures are perf.md's measurements (M0 + M1) and the designs' projections (±25 %), marked as such.

**Revision 2 (after `CRITIQUE.md`, 38 issues).** Every C-n is resolved or rejected with a reason; the **Resolution log** at the end maps each one to its change. The revision's new numbers (stair depths and risers, 北苑 4 m/s runs, R stops without the penthouse upper level, H fire-only landings, gates / zones / hardstands, lift landings, roof-structure areas) come from `spec-calc/final2.py` (`final2.out`), which re-runs `final.py`'s stacks. Two node probes measured the hotel lot against HS-H and the west-lot bays near `H-SIDE` (`spec-calc/lot.mjs`, `westlot2.mjs`, read-only in the main checkout at `9bdb886`; its uncommitted edits from the parallel workflow touch only `nav.js` and `north-*.js`, not the hotel, garage or west-lot modules measured). The Chinese user summary is Appendix B (subagents may not write a separate `SUMMARY-zh.md`).

**Clause marks** follow codes.md: **✔** = checked against the code text; **≈** = from memory or a secondary source, so check the number before quoting it to the user.

Nothing in the main checkout was edited and nothing was committed.

---

## 0. Decisions

### 0.1 Heights (the decisions table)

| tower | 中文名 | storeys | levels (own) | top floor | main roof RF (= fire / structural height) | crown / top | refuge floors | H/B (short side) |
|---|---|---|---|---|---|---|---|---|
| T1 | 云澜·北苑 1 号楼 | 35 (1F–6F are P1) | 30 (7F–35F + RF) | 35F @ 137.4 | **140.7 m** | **150.7 m** | 10F 46.2 · 24F 93.6 | 6.67 above the 34 m podium, valid because there is no joint at the towers (§0.3); 8.79 from grade |
| T2 | 云澜·北苑 2 号楼 | 33 | 28 (7F–33F + RF) | 33F @ 129.6 | **132.9 m** | **142.9 m** | 10F 46.2 · 24F 93.6 | 6.18 (8.31) |
| W1, W2 | 云澜·西苑 1 / 2 号楼 | 47 | 50 (B2–47F + RF) | 47F @ 142.5 | **145.5 m** | **156.5 m** | 16F 46.5 · 31F 93.0 | 7.58 (B = 19.2) |
| R1 | 云澜汇楼盘 1 号楼 | 53 | 56 (B2–53F + RF) | 53F @ 183.3 | **186.7 m** | **200.0 m** | 14F 45.6 · 27F 90.9 · 40F 137.1 | 5.87 (B = 31.8) |
| R2 | 云澜汇楼盘 2 号楼 | 50 | 53 | 50F @ 173.1 | **176.5 m** | **189.8 m** | same | 5.55 |
| R3 | 云澜汇楼盘 3 号楼 | 47 | 50 | 47F @ 162.9 | **166.3 m** | **179.6 m** | same | 5.23 |
| R4 | 云澜汇楼盘 4 号楼 | 44 | 47 | 44F @ 152.7 | **156.1 m** | **169.4 m** | same | 4.91 |
| H | 云澜酒店 | 48 | 51 (B2–48F + RF) | 48F @ 179.4 | **185.4 m** | lantern 194.2 · **helideck 196.8 m** | 13F 45.5 · 26F 90.8 · 37F 136.8 | 5.79 (B = 32) |
| A | 云澜服务公寓 | 44 | 47 (B2–44F + RF) | 44F @ 169.6 | **174.6 m** | **184.6 m** | 13F 45.5 · 26F 90.8 · 39F 137.6 | 5.49 (B = 31.8) |

Today: T1/T2 RF 96.9 (top 100.1), W1/W2 RF 85.5 (88.7), R1–R4 RF 103.4 (106.6), H RF 71.1 (74.3), A RF 74.2 (77.4).

- "200 m" means the **crown** (codes.md rule 17). JGJ 3 measures structural height to the main roof, so every main roof stays ≤ 190 m (Table 11.1.2 ✔, SRC/CFST frame + RC core at 7度). The crowns are 屋顶构架 covering ≤ ¼ of the roof, so they do not count in the fire height either (GB 50016 App. A.0.1 ✔).
- 北苑 and 西苑 stay at about 150 m (DECISIONS 2): 北苑 uses north.md's 150 m variant; 西苑 uses west.md's S47. Neither 200 m variant is built.
- R1–R4 follow p2.md. H and A follow hotel-apt.md v2.

### 0.2 Skyline composition: staggered (错落), and why

Crowns, highest first: **R1 200.0 · H 196.8 · R2 189.8 · A 184.6 · R3 179.6 · R4 169.4 · W1 = W2 156.5 · T1 150.7 · T2 142.9.**

- **Two summits, one per phase, never side by side in one view.** R1 (200.0) marks 二期 at 星湾路 and the 星湾桥 bridgehead. H (196.8) marks 一期. From the 星湾桥 R1 reads 55° and H 28°; from the 三期 plaza H reads 41° and R1 35° (hotel-apt.md §9.3, re-run with these heights).
- **A 星湾路 gateway.** A (184.6) and R1 (200.0) frame the road. Because A is nearer the road, they read as an equal pair from 北外环 (65° / 66°).
- **R1–R4 step down eastward** in a clean 3-storey (10.2 m) rhythm, tallest by the road, tapering to the campus edge. Four identical 200 m extrusions 66 m apart would read as a wall from the river.
- **The river front is the low step.** The ≈ 150 m 北苑 and 西苑 pairs stand in front by the water, with H 46–54 m above them behind. 北苑 steps within its pair (T1 150.7, T2 142.9), so the slender towers also stop sharing one wake.
- **Level bands tie the groups together.** The refuge (louvre) bands sit at ≈ 46 / ≈ 91–94 / ≈ 137 m in every tower. Within 二期 and the 一期 hospitality pair they line up within 0.8 m; 北苑 and 西苑 are within 3 m.
- **All crowns stay in the user's band.** The 200 m group runs 169–200 (band 165–215), and the 150 m pairs run 143–157 (band 140–160).
- **The 西苑 pair is equal** (both S47, as DECISIONS 2 pins 47F). A stepped 西苑 (W2 at 44F, crown 147.5 m) is open question Q1.

### 0.3 Structure: the mitigations

| tower | system | why it passes / the 超限 items | mitigations built into the design (and drawn where visible) |
|---|---|---|---|
| 北苑 T1/T2 | RC shear walls (剪力墙), 大底盘双塔 on P1 | B级 7度 shear-wall limit 150 m (Table 3.3.1-2 ✔); RF 140.7 / 132.9 ✓. H/B above the podium 6.67 / 6.18 against 6 (shear wall) to 7 (frame-core): mild 超限, special review. Taking H/B above the podium needs the towers tied into a large, stiff podium (JGJ 3 §3.3.2 commentary ≈), so **there is no seismic joint at the towers**. The pair also sits on P1's north edge, eccentric on the base: a further review item (JGJ 3 §10.6.3 ≈). | Full-depth (16 m) transverse walls on the core lines x = ±4, the wing party lines and the end walls. **24F 加强层**: belt walls in both façade lines plus outrigger walls on the wing centre line z = 0 (the same line as the refuge-floor fire wall). Steel-plate composite walls B2–14F. Walls run through P1 to a piled raft in P1-B2, with **no transfer above the P1 roof** (codes.md rule 19), and are drawn there (§1.1 "Structure in P1"). **P1 is the 大底盘** (JGJ 3 §10.6.3 ✔): no joint round the tower bays; any P1 movement joint stays at least two bays away from them. Duplexes stay 跃层 on aligned slabs. 1.2 m chamfered corners, porous crown fins. A TLD in the roof fire tank is optional: the comfort check (JGJ 3 §3.7.6 ✔) starts at 150 m and the main roofs are below it. |
| 西苑 W1/W2 | RC shear-wall slab | 145.5 m ≤ B级 150 m ✓. H/B 7.58 > 6 → 超限 review. No comfort check (< 150 m). | **加强层 on 16F and 31F**: storey-deep 跨走廊伸臂墙 tie the north and south parts of every transverse wall line into one 19.2 m-deep wall, with deep spandrel walls as flanges. Core and end walls 0.9–1.0 m at the base (C60), stepping to 0.4 m. A thick south corridor wall and spandrels balance the north core in torsion. Piled raft under WPG-B2. Party walls fixed from raft to roof: no transfer storey. |
| R1–R4 | 型钢(钢管)混凝土框架-钢筋混凝土核心筒 (混合) | Main roof ≤ 190 m ✓ (R1 186.7). H/B 5.87 ≤ 7 ✓. Review items: the core sits 11 m (35 % of depth) north of the plate centroid (torsion), and the slot is 45 % deep (凹凸不规则). | A real 17.6 × 14.3 m core in the old 03 wing. **Outrigger + belt trusses on 27F and 40F** (5.4 m storeys), drawn behind the louvres. Six SRC/CFST mega-columns expressed on the façade. Edge beams across the slot at every floor. Hat truss in the R1 crown. TMD rooms in the R1 / R2 crowns. B2 under each tower for embedment and lift pits. |
| H, A | SRC frame + full-depth RC core + RC 山墙 | Main roof ≤ 190 ✓ (H 185.4, 4.6 m margin; A 174.6). H/B 5.79 / 5.49 ✓. Review item: the H 26F (8.6 m) + 27F (6.8 m) tall storeys. | Core 22 × 32 m spanning the full depth (≥ H/12 ✓, JGJ 3 §9.2.1 ✔). A real plant mezzanine slab at 26F + 4.3 m tied to the columns (optional belt truss there). Thickened 27F columns. **No outriggers**: the core already reaches the façade. Wind tunnel for the 66 m broad faces. Piled raft under B2. |

Every tower above 130 m is a 超限高层 and goes through 超限高层建筑工程抗震设防专项审查 (≈ 建设部令第111号 / 建质〔2015〕67号). That is routine at this height and is said on the pick cards and in the catalog, not hidden. The seismic intensity is 7度 0.10g as briefed; at the Hangzhou-like 6度 the H/B verdicts do not change (codes.md §3.1).

### 0.4 Homes and rooms, before → after

| group | today | after | change |
|---|---|---|---|
| 北苑 T1 / T2 | 24 / 24 homes; 34 / 34 level units | **41 / 37 homes; 52 / 48 level units** | 40 kept, 38 new (T1 21, T2 17), 8 retired (10W, 10E, 24W, 23–24E per tower). Every home 3BR+ and distinct within its tower; 9 interlocked 错层复式 + 1 顶层复式 pair per tower. |
| 西苑 W1 / W2 | 135 / 135 homes, 5 plans each | **220 / 220**, 15 plans each (A / B / C families) | 3梯5户 on all 44 home floors per tower; each floor 5 different plans (两房 / 三房 / 四房). 2 catalogued plans re-cut (W1 NW 140.3 → 121.0 m², W2 NE 135.2 → 115.9 m², both still 三房一厅). |
| R1–R4 | 87 each, 348 homes, 3 per floor (01 / 02 / 03 × 116) | **96 / 90 / 84 / 78 = 348 homes** (356 records), 2 per floor, all south-facing | 01 × 96, 02 × 170, 03 × 74, 顶层复式 × 8. The north-facing 03 wing becomes the core. |
| H 云澜酒店 | 190 king suites | **176 云澜酒店公寓 + 144 hotel keys = 320** | 8 per floor (today 10); 行政楼层 44F–46F; public floors 2F, 27F, 47F, 48F. **Fewer hotel keys than today (144 against 190)**: Q2 puts this to the user against the all-hotel program K (≈ 330 keys, 1F lobby kept). |
| A 云澜服务公寓 | 190 (180 + 10 LOFT) | **272 serviced suites + 32 LOFT = 304** | 8 per floor; 2F 住客会所, 44F 顶层空中会所 |
| **campus residence records / homes** | **1,066 / 1,046** | **1,520 / 1,490** | +454 / +444 |

### 0.5 Refuge floors (避难层)

| tower | refuge floors (floor @ elevation, storey) | first above the hardstand / spacing / top occupied floor above the last | net area needed (5 p/m²) → provided |
|---|---|---|---|
| T1 | 10F @ 46.2 (3.6) · 24F @ 93.6 (5.4, 加强层) | 46.2 / 47.4 / +43.8 | 17.2 → ≈ 200 m²; 18.6 → ≈ 200 m² |
| T2 | same | 46.2 / 47.4 / +36.0 | 17.2; 15.0 → ≈ 170 m² |
| W1 / W2 | 16F @ 46.5 (4.5) · 31F @ 93.0 (4.5) | 46.5 / 46.5 / +49.5 | 53.2; 60.8 → ≈ 150 m² |
| R1–R4 | 14F @ 45.6 (4.5) · 27F @ 90.9 (5.4) · 40F @ 137.1 (5.4) | 45.6 / 45.3, 46.2 / +46.2 (R1) … +15.6 (R4) | 21.6; 19.2; 22.2 → ≈ 213 m² |
| H | 13F @ 45.5 (4.5) · 26F @ 90.8 (8.6) · 37F @ 136.8 (6.0) | 45.5 / 45.3, 46.0 / +42.6 | 38.4; 78.8; 92.8 → 120 / 160 / 160 m² |
| A | 13F @ 45.5 (4.5) · 26F @ 90.8 (6.0) · 39F @ 137.6 (6.0) | 45.5 / 45.3, 46.8 / +32.0 | 38.4; 38.4; 43.2 → ≈ 120 m² |

All measured from the ground hardstand at 0.0 m (GB 55037 §7.1.14 ✔), including 北苑: no fire appliance reaches the 34 m P1 roof, and 7F is the public sky lobby, which a refuge floor may not be (§7.1.15-2 ✔). Spacing ≤ 50 m (GB 50016 §5.5.23-1 ✔). Refuge floors are numbered storeys (`16F 避难层`) with no homes.

"Top occupied floor above the last" is this spec's own stricter check (the clause limits the first refuge floor and the spacing between refuge floors). It counts enclosed storeys only. **Open-air `kind: 'roof'` levels are exempt**, which covers the 西苑 RF garden, 52.5 m above 31F, while 47F is 49.5 m above it (C-17). DECISIONS 2 names the 西苑 refuge floors as 16F / 31F, so they stay there.

### 0.6 Lifts (更多电梯)

| tower | today | after | interval (up-peak, conservative) | fire lift 1F → top floor (≤ 60 s, GB 50016 §7.3.8-3 ✔) |
|---|---|---|---|---|
| T1 / T2 | 3 each (LW, LE, LF) | **4 each**, all 1,050 kg 1.1 × 2.1 m stretcher cars with rear counterweight (the only car that fits the 1.9 m shafts, C-4): LW, LE private **4 m/s**; LF fire 4 m/s; **LS** second fire lift + 服务梯 4 m/s | private lift per home stack: mean wait ≈ 36–39 s | 39.4 s / 37.4 s |
| W1 / W2 | 3 each | **6 each**: low bank L1 L2 F1 (3 m/s, 2F–31F), high bank H1 H2 F2 (4 m/s, 31F–RF) | 54 s / 59 s | F1 → 31F 34.9 s; F2 → 47F 40.7 s |
| R1–R4 | 2 each, no fire lift | **4 each**: L1–L3 passenger 5 m/s (L2 stretcher), LF fire 5 m/s | 43–46 s (57–62 s with LF on fire duty) | 42.8 / 40.8 / 38.7 / 36.7 s |
| H | 2, no fire lift | **13**: RB 4 × 3.5 m/s, SH 3 × 6 m/s, HL 4 × 4 m/s, S1 / S2 fire + service 4 m/s (S1's landings outside the 酒店公寓 zone open in fire mode only, C-3) | RB 46 s, SH 32 s, HL 46 s | S1 49.9 s |
| A | 2, no fire lift | **7**: L1–L5 5 m/s, S1 / S2 fire + service 4 m/s | 38 s | 47.4 s |
| **campus** | **76 lifts** | **108** (+32) | | |

### 0.7 Campus totals (expansion layout)

| | today (pinned in `riverside-integration.test.js`) | after |
|---|---:|---:|
| levels | 338 | **526** (H +28, A +24, R +78, W +38, T +20) |
| lifts | 76 | **108** |
| stairs | 106 | **106** (refuge breaks are per-level data; H/A/R keep 2 stair records each) |
| shops (non-residence units) | 664 | 664 |
| residence records / homes | 1,066 / 1,046 | **1,520 / 1,490** |
| homes per community (west, north) | 270, 48 | **440, 78** |
| card gates / zones | 16 / 14 | **92 / 59** (§1.0 "card zones"): 北苑 +4 / +4 (RF terrace doors); R +20 / +12 (1F, B1, B2 gates + 2 stair exit doors per tower); H +47 / +25 (1F, B1, B2 gates + 44 stair re-entry doors on the 22 酒店公寓 floors, one zone per floor); A +5 / +4 (1F, B1, B2, `A-2F-LINK` + the ST2 exit door) |
| fire hardstands in `site.fireAccess` | 2 (HS1, HS2) | **8** (+ HS-R1…R4, HS-H, HS-A; 西苑's stay in `site.westGarden.hardstands`) |
| lift landings in towers | 646 | **1,889** (no closed-shaft glass is drawn for them, C-14) |
| `buildLayout({expansion:false})` | FPS hash | **byte-identical** |

### 0.8 Defaults taken

DECISIONS 5: each designer's recommended default, unless it conflicts with DECISIONS 1–4.

**Campus-wide**
1. **Continuous floor numbering**: no skipped 4 / 13 / 14; refuge floors are numbered storeys (`24F 避难层`). Passenger-lift panels have no button for floors a lift passes.
2. **Balconies above 100 m are enclosed** (封闭阳台, sliding glass and one operable vent / rescue panel). Below 100 m each product keeps its own look:
   - 北苑: enclosed everywhere behind the new curtain wall (north.md default);
   - 西苑: open below 32F, enclosed from 32F (the high zone);
   - R: open in L / M, enclosed from 28F (the H family) up.
3. **Card gates fail open on alarm** and open from inside without tools (GB 55037 §7.1.7 ✔): `gateRecord.releaseOnAlarm = true`, sign sub-text `火灾时自动释放`, modelled by `buildNav(L, { gates: 'open' })`.
4. **Shared roof gardens are retired above ≈ 140 m** on 北苑 (two penthouse terraces instead), R and H/A (plant, BMU, crown). 西苑 S47 keeps a reduced, wind-screened 屋顶花园 (west.md Q4).
5. **Seismic basis 7度 0.10g** as briefed; the city is unnamed.
6. **Shadow-frustum fix**, which also cures today's W1/W2 and R4 misses (perf Q5): overview r 380 → 410; 园区 steps focus (−60, 0, −90) at r 400; river step r 320 → 360.
6a. **Signs and captions name flagship floors by zone, not number** (`行政楼层`, `顶层空中会所`), so no amenity is branded 「44F」 (C-30). The floor rail still lists the numbers.

**北苑**
7. 4 lifts per tower (K4: + LS), all four **1,050 kg 1.1 × 2.1 m stretcher cars with rear counterweight**, LW / LE at **4 m/s** (C-4); 三合一前室 widened to 12.8 m² gross, ≥ 12.0 m² net (C-18).
8. RF: two private 顶层复式 terraces. No shared roof garden. **The terrace doors from the core are exit-only card doors** (free from the terrace, the owner's card from the core; north.md's optional terrace gates, now on, C-3).
9. One plan-independent curtain wall for the whole tower, including the kept 8F–23F (north.md Q5 default). This is open question Q3 because the user has seen those floors.

**R1–R4**
10. Core in the old 03 wing, two south homes per floor (DECISIONS 3).
11. Generated 顶层复式 penthouses (procedural, `generateDuplex`).
12. B2 under each tower (p2.md Q5), with `R*n*-B2-GATE`.
13. RF roof garden dropped for plant, BMU and the crown.
14. No new "04" GLB.
15. Hardstands on the south (lobby) side.
16. Card gates on the new R lobbies.

**西苑**
17. S47 on both towers.
18. Three plan families A / B / C.
19. No 顶层复式: the generator gap (0 / 20 duplexes fit) is deferred.
20. **Corridor 前室 doors on**: two hold-open 甲级 doors at the core ends make each 防烟楼梯间 a real 前室 (GB 55037 §7.3.2-3 ✔). The designer left it optional; it is taken because it is a code requirement already owed at today's 85 m.
21. A painted card-holder 住户专区 in WPG-B1/B2: signs only, no gate.

**H and A**
22. H program R: 酒店公寓 3F–25F (176), 26F refuge / transfer floor, 27F 空中大堂, hotel 28F–46F (144 keys), 47F spa and pool, 48F sky dining and bar.
23. Check-in, the piano lounge and the restaurant move to 27F; 1F becomes the arrival hall plus the residents' lobby (open question Q2).
24. Helideck on H, **view only** (救援专用: drawn with its deck stairs, not walkable, no stair records, C-32); a helicopter winching area (救助设施) on A.
25. A's hardstand is a marked strip on the west half of 星湾路. HS-H takes **19 of the 22** hotel-lot stalls (C-24). The hotel keeps **≥ 20 surface short-stay stalls**: the 3 left in its lot plus 20 west-lot bays within 40 m of `H-SIDE`, marked `酒店短停` (measured: 60 west-lot stalls lie within 60 m of that door, the nearest at 33 m). The displaced stalls are not promised a basement home, because the core shrinks H-B1 / B2 (C-2, C-7).
26. P1W3 西里木构茶舍 is classed 一、二级, so the 9 m separation applies.
27. Glass lifts retired in the expansion variant.
28. The podium keeps today's footprint with a P1-facing fire wall; the 9 m podium fallback applies only if the authority requires it.

**Perf and UX**
29. M0 + M1 land before any supertall layout.
30. Campus ratchet ≤ 2,200 steady calls once they land.
31. An R mid LOD tier (350–600 m).
32. Night windows: per floor on 西苑, three hashed variants on R.
33. Lift ride `Δy / (2 × speed)`, with the real time on the HUD and **Space** to skip (open question Q4).
34. Four new tour steps plus re-frames (§3.3).
35. **Far stand-ins get a night layer**: one extra mesh per far tower, visible at night only, so the default and tour views keep lit windows, crowns and aviation lights (C-9).
36. **Closed tower shafts draw no glass** in `buildElevators()`; only glass and exterior lifts keep their per-stop shaft panes (C-14).

**Access and stairs** (C-1, C-3)
37. Every gated tower has **no card bypass**: §1.0 "card zones" lists the rules and the test.
38. Stair flights stay ≤ 18 risers. A storey taller than 6.12 m gets two loops with a doorless mid-storey landing (`maxRisers: 18`, expansion-only builders).
39. **1F splits every new tower stair** (R, H, A): the basement run and the above-ground run arrive at separate doors (GB 50016 §6.4.4-3 ≈).

### 0.9 What does not change

- **Compact FPS layout.** `buildLayout({expansion:false})` stays byte-identical, and `tests/fps-frozen.test.js` stays untouched. 北苑 and 西苑 exist only in the expansion layout. The supertall R/H/A are built by new expansion-only builders (`supertallResidential()`, `supertallTower()`); `HOSPITALITY.towers` and `tower()` remain the FPS truth. One consequence: the compact H/A keep their 6.5 m lobby stairs with 20 risers per flight, a defect that exists today. Fixing it would change the FPS hash, so it is recorded in HANDOFF instead (C-1).
- **The parallel workflow's work.** The 7F sky lobby, `T1/T2-7F-GATE`, the four `T?-SKY-*` portals, the P1-RF forecourt and its open-sided 连廊雨棚 (it must stay open-sided, GB 50016 §5.4.10-3 ✔), the P1-RF viewdeck, the door-leaf records, `towerVisibility`, the floor-rail podium row and its scroll rule, and the sky-lobby tour-step order rule.
- **P1 and the mall.** `hostPassLevels` stay sealed: no residential lift opens on P1-2F–6F. The P1 column `rect(t.core…)` and `NORTH_ACCESS` are unchanged.

---

## 1. Per tower

### 1.0 Rules common to every tower

| topic | rule (what to build) | basis |
|---|---|---|
| class | All ten towers are > 100 m: 超高层, 一类高层. Residential: 北苑, 西苑, R. Public: H (hotel + 酒店公寓) and A (serviced apartments = 非住宅类居住建筑). | GB 50016 Table 5.1.1 + note 2 ✔ |
| refuge-floor content | 避难区 on the **hardstand face** (at least one side over the 登高场地) plus plant only. Plant is behind 2.00 h walls, the pipe zone behind 3.00 h, entered through a 防火隔间 with 甲级 doors. Fire-lift door, 消火栓 + 软管卷盘 + extinguisher, 消防专线电话, 应急广播, lit `nF 避难层` signs at every stair door, openable 乙级 fire windows on ≥ 2 orientations. No homes, club, gym, lobby or kids' room. | GB 55037 §7.1.15-1…6 ✔, §6.4.7-2 ✔ |
| stairs at refuge floors | **分隔**: the stair keeps its shaft, a partition crosses the landing, and a second door makes evacuees leave, cross the 避难区 and re-enter. Engine: `breakLevels` (§2.1). | GB 55037 §7.1.9 ✔; GB 50016 §5.5.23-2 ✔, §6.4.4 ✔ |
| stair flights | ≤ 18 risers per flight at 0.17 m. Two flights then rise at most 6.12 m, so a taller storey gets **two loops** (four flights) with a doorless landing at mid-storey: H/A 1F (6.5 m), H 26F (8.6 m, the landing at the plant mezzanine), H 27F (6.8 m), A 40F–43F (6.5 m) and 北苑's P1-1F → 2F run (6.5 m). Depth needed (`final2.out`): 6.6 m for 3.3–3.4 m storeys, 7.72 m for 4.5 m, 8.28 m for 5.4 m, **8.84 m for 6.0 m**. | GB 50352 §6.8.5 ≈ (3–18 risers per flight) |
| 1F stair split | In every new tower stair (R, H, A), the basement run and the above-ground run arrive at **separate 1F doors** behind a 2.00 h partition. 1F is in the stair's `breakLevels`, so nobody walking down from the homes ends up in the garage. | GB 50016 §6.4.4-3 ≈ |
| **card zones (no bypass)** | 1. A lift's normal-mode landings never link a gated home or suite floor with a public area outside its gate. A fire or service lift that must reach public floors gets **fire-mode-only landings** there (`e.fireOnly`: landing door drawn, sign `消防专用`, no call button, not a nav link until fire mode). 2. Every stair door at 1F or below that opens onto a public area or outdoors is an **exit-only card door**: free egress from the stair through `GATE.exitSensor`, a card from outside, release on alarm. 3. Where public floors share a stair with gated floors (only H: 2F, 27F, 47F, 48F and the hotel floors above the 酒店公寓), every gated floor's stair door is a **re-entry card door**: free from the floor into the stair, a card from the stair side, release on alarm. Egress is never locked. 4. Test: with gates closed (`buildNav(L)`), no path from `site`, P1, P2 or a public floor reaches any home floor of 北苑, 西苑 or R, any A suite floor, or H 3F–25F. Hotel floors 28F–46F stay open in the game, as today (their room-key 梯控 is cosmetic). | GB 55037 §7.1.7 ✔ (controlled exit doors release on alarm and open from inside without tools) |
| lifts at refuge floors | Fire lifts open; passenger and private lifts pass with no landing door (blank shaft wall, no button). | GB 55037 §7.1.15-3 ✔; codes.md rule 6 |
| fire lifts | ≥ 1 per storey (one compartment per storey); stop on every floor of their zone, refuge floors included; ≥ 1,000 kg, 2.1 m-deep stretcher car; 1F → top ≤ 60 s; 前室 ≥ 6 m² (三合一 ≥ 12 m², public 合用 ≥ 10 m²). Above 100 m: 甲级 stair, 前室 and fire-lift doors. | GB 55037 §2.2.6, §2.2.8, §2.2.10, §6.4.3 ✔; GB 50016 §7.3.8-3, §5.5.28-4 ✔ |
| 户内避难间 | Residential > 54 m (北苑, 西苑, R): one bedroom per home on an external wall with an openable window, preferably on the hardstand face. Tag `residence.refugeRoom`. Where a home has door-leaf records (北苑, 西苑, R penthouses), that leaf gets `fire: '乙级'`. The R GLB homes have their doors baked into the GLB, so they get the tag and the pick card only, with no door-leaf record (C-26). Pick card `主卧（户内避难间 · 乙级防火门 · 1.00 h 墙）`. Not required for H/A (not 住宅). | GB 50016 §5.5.32 ✔ |
| rescue windows | 2 marked 消防救援口 (1.0 × 1.0 m, red-triangle decal) per storey on the hardstand face, from 3F, or from 7F on 北苑 (its first storey above P1, the sky lobby included, C-34). Refuge floors are included. | GB 55037 §2.2.3 ✔ |
| hardstand | ≥ 20 × 10 m, 5–10 m off the façade, along a full long side, no trees, planters, ramps, parked cars or > 4 m podium in between. A record in `site.fireAccess` with the 「消防登高场地」 marking. 西苑's existing pair stays in `site.westGarden.hardstands`, and `hardstandErrors` reads both lists (C-23). | GB 55037 §3.4.6–7 ✔; GB 50016 §7.2.1–2 ✔ |
| fire roads | Residential towers: one long side, which is also the rescue face (GB 50016 §7.1.2 ≈). **H and A each get one long side only**, a site exception under GB 55037 §3.4.3 ✔ ("unless the site makes only one possible"). H uses the south long side plus the west short side: P1 is 7 m to the east and the annexes 6.85 m to the north. A uses the east long side (星湾路): its west side faces P1 at 7 m and its north end holds the ramp trenches. The exception is recorded on the pick card and in HANDOFF, because the fire authority accepts it case by case (C-36). | GB 55037 §3.4.3 ✔ |
| other > 100 m switches | Sprinklers and smoke detectors in every home and suite (heads only in the lazy interior); A级 external insulation; floors ≥ 2.00 h; stair pressurisation in ≤ 100 m segments with fans on refuge floors (basements on their own system); a fire-water transfer tank + pumps on the middle refuge floor; a roof tank (residential ≥ 36 m³; public > 150 m ≥ 100 m³). | GB 55037 §8.1.9, §8.3.2, §6.6.6, §5.1.3 ✔; GB 51251 §3.3.1 ≈; GB 50974 §5.2.1, §6.2.1 ≈ |
| separation | ≥ 13 m from any high-rise, with no reductions; podiums excepted. T1–T2 14.0 ✓, W1–W2 22.6 ✓, R gaps 24 ✓, H tower–P1 15.25 ✓, A tower–P1 **13.21** ✓ (0.21 m margin: lock it in a test). | GB 55037 §3.3.1 ✔; GB 50016 §5.2.6 ✔ |
| crown | 屋顶构架 ≤ ¼ of the roof, not counted; a test sums the real roof-structure footprints (C-33). Obstruction lights: high-intensity white flashing by day on every crown above 150 m; **T2 (142.9 m) gets medium-intensity red** at its crown corners (C-28). At night all ten towers show red, so T2 is not dark beside T1. | GB 50016 App. A.0.1 ✔; ICAO Annex 14 / CAAC ≈ |
| night | Refuge bands stay dark (exit-sign glow only). Crown edges are lit with `glowSoft`. | codes.md §5.3 |

### 1.1 云澜·北苑 T1 / T2 (150 m variant; north.md §6.3, worked out in full)

**Storey table.** T1 is shown; T2 is identical through 31F.

| floor | elev (m) | storey (m) | use | band | lifts that open |
|---|---:|---:|---|---|---|
| P1-B2 / P1-B1 / P1-1F | −12.0 / −8.4 / 0.0 | (P1) | residents' lift lobbies behind the existing gates (unchanged) | host | LW LE LF LS |
| P1-2F … P1-6F | 6.5 … 28.5 | (P1) | mall floors: the shafts pass sealed (`hostPassLevels`) | host | none |
| 7F | 34.0 | 5.0 | **空中大堂 + 住户会所** (kept as the parallel workflow built it) | SKY | all 4 |
| 8F, 9F | 39.0, 42.6 | 3.6 | 江景大平层 W / E (kept) | L | all 4 |
| **10F** | **46.2** | 3.6 | **避难层 R1**: 避难区 (north halves of both wings + landings), PRV station, 新风. Was 10W / 10E. | R1 | LF LS |
| 11F–13F | 49.8 / 53.4 / 57.0 | 3.6 | 江景大平层 W / E (kept) | L | all 4 |
| 14F–23F | 60.6 · 63.9 · 67.2 · 70.5 · 73.8 · 77.1 · 80.4 · 83.7 · 87.0 · 90.3 | 3.3 | **错层复式** (kept): W 14–15, 16–17, 18–19, 20–21, 22–23; E 15–16, 17–18, 19–20, 21–22; single-level **14E** (kept) and **23E 端户大平层** (new) | D | LW on W entries, LE on E entries; LF LS all |
| **24F** | **93.6** | 5.4 | **避难层 R2 + 设备层 + 加强层**: 避难区, belt / outrigger walls, fire-water transfer tank + pumps, segment-1 pressurisation fans. Was 24W + the upper level of 23–24E. | R2 | LF LS |
| 25F–33F | 99.0 · 102.9 · 106.8 · 110.7 · 114.6 · 118.5 · 122.4 · 126.3 · 130.2 | 3.9 | **云端大平层** W / E (new) | C | all 4 |
| 34F–35F | 134.1 / 137.4 | 3.3 | **顶层复式** W / E (new; entry 34F; private roof terrace) | PH | LW LE on 34F; LF LS both |
| RF | **140.7** | 3.2 | core plant (5 m/s machine rooms, roof fire tank ≥ 36 m³, optional TLD, BMU, segment-2 fans) + **two private PH terraces** | RF | LW (W terrace), LE (E terrace), LF LS |
| crown | **150.7** | — | fin crown + core lantern, name sign at RF + 6 m | — | — |

- **T2**: 25F–31F 云端大平层 (99.0 … 122.4); 32F–33F 顶层复式 (126.3 / 129.6); **RF 132.9; crown 142.9**.
- **Records** (`north-site.js`, split out of `community-sites.js` in P0a):
  - `northStack(tower)` returns `{ short, levelNumber, elev, height, kind, band }`; `kind` gains `'refuge'`; `band ∈ SKY | L | R1 | D | R2 | C | PH | RF`;
  - `NORTH_SITE.towers[i]` gains `top` (35 / 33), `crown` (10.0 / 10.0) and `levels`;
  - `NORTH_SITE.refuge = ['10F', '24F']`;
  - `NORTH_SITE.levels` stays T1's stack for existing readers.

**Lifts: K4, four lifts in the unchanged 8 × 16 m core** (north.md §4.3; the core cannot grow at the podium, §4.2 there).
- The north band is re-slotted into four 1.9 × 3.0 m shafts: LW u −3.0, LF −1.0, LS 1.0, LE 3.0 (tower-local).
  - World x: T1 −263.0 / −261.0 / −259.0 / −257.0; T2 −215.0 / −213.0 / −211.0 / −209.0.
- **Cars (C-4).** A 1.9 m hoistway leaves no room for a 1.7 m car once guide rails, counterweight and running clearance are in (real 4–5 m/s hoistways are about 2.4–2.6 m wide). All four cars are therefore **1,050 kg, 1.1 × 2.1 m stretcher cars with rear counterweight**, which fit 1.9 × 3.0 m. The private lifts LW / LE run at **4.0 m/s**. The cabin is drawn 1.1 m wide and centred in its shaft. The 0.1 m walls between shafts are a modelling simplification (real core walls are 0.2–0.3 m between hoistways); it is recorded in HANDOFF. Wider private cars would need K3 (no LS, so fewer lifts, against DECISIONS 5) or the 12 m core that north.md §4.1 rules out, so the narrower car is the decision, and it goes in the user's "what changes" list (§7.3).
- Landings: W x[−4, −2.0], **F (三合一前室) x[−2.0, 2.0] = 4.0 × 3.2 = 12.8 m² gross, ≈ 12.1 m² net** with 0.1 m partitions inside the inter-shaft gaps (≥ 12.0 m² 使用面积, short side ≥ 2.4 m, GB 50016 §5.5.28-4 ✔; today 9.0 m² ✗), E x[2.0, 4] (C-18). W / E are 2.0 m wide and still hold the 1.0 m doors at u ±3.0; F holds LF / LS at u ±1.0 and both stair doors.
- The sky lobby's lift hall still opens into landing E (T1) / W (T2): those landings keep their outer edge at x = ±4. The nearest residential stop to the 7F gate line is 5.4 m (≥ `GATE.reachClear` 2 m); LE stays at −257.0.

| lift | role | car / speed | stops | T1 count | T2 count |
|---|---|---|---|---:|---:|
| LW 北苑住户电梯 W | `private-w` | 1,050 kg, 1.1 × 2.1 m, **4 m/s** | P1-B2 B1 1F · 7F · 8 9 11 12 13 · 14 16 18 20 22 · 25–33 · 34 · RF (T2: 25–31 · 32 · RF) | 25 | 23 |
| LE 北苑住户电梯 E | `private-e` | same | P1-B2 B1 1F · 7F · 8 9 11 12 13 · 14 15 17 19 21 23 · 25–33 · 34 · RF (T2: 25–31 · 32 · RF) | 26 | 24 |
| LF 北苑消防电梯 1 | `fire` | 1,050 kg, 1.1 × 2.1 m, **4 m/s** | every own level + P1-B2 B1 1F | 33 | 31 |
| LS 北苑消防电梯 2 · 服务梯 | `fire-service` | same | same as LF | 33 | 31 |

- `northStops(id, homes, levels)` is derived from the home data (north.md §4.4).
- LW / LE never open on 10F / 24F or on the other side's upper levels.
- **Stop rule (C-19).** GB 50096-2011 §6.4.5 ≈ asks residential lifts to stop on every floor that has a 户门 and a public corridor. (The "skip at most two floors" wording is the 1999 edition's, so it is not cited.) Every design here complies floor by floor: duplex upper levels have no 户门; refuge floors, host floors (P1-2F–6F) and plant floors have no homes; each 西苑 zone's floors are served by their own bank. The private lifts' passes are therefore floors without a 户门 for that lift, not skips.
- LF / LS never open on P1-2F–6F.
- Runs: LF 1F → 35F **39.4 s**, → RF 40.2 s; T2 → 33F 37.4 s. LW 1F → 34F **38.2 s** real, **16.8 s** in game (T2 → 32F 36.2 s / 15.8 s).

**Stairs.**
- ST-A / ST-B scissor pair, 防烟, unchanged in plan. Home door → stair door 3–6 m (≤ 10 m, GB 50016 §5.5.28 ✔).
- `breakLevels: ['T?-10F', 'T?-24F']`: on those floors each stair gets a lane partition over the door landing and a second door (stair A: x[−3.5, −2.4] into landing W; stair B: x[2.4, 3.5] into landing E). Both landings are part of the 避难区.
- `maxRisers: 18` (C-1): the P1-1F → 2F run (6.5 m, 20 risers per flight today) becomes two loops of 10 risers. Every other storey fits two flights in the 9.6 m-deep stair (the worst is P1's 5.5 m storeys: 17 risers, 8.56 m needed).
- 甲级 doors from 25F up.
- **Access (C-3)**: the stairs stay as the parallel workflow gated them (P1-B2 / B1 / 1F lobbies behind the existing gates; 7F behind `T?-7F-GATE`). The RF terrace doors from the core become exit-only card doors `T?-RF-W-GATE` / `T?-RF-E-GATE` (zones `T?-RF-W` / `-E`, +4 / +4), so the stairs no longer lead onto a neighbour's private terrace.

**Structure in P1 (C-37).** The shear walls that carry the towers run through P1-B2…6F. P-north draws them there in the expansion layout only: 0.6 m 结构墙 on the plate-end and party-wall lines, with 3 m openings (连梁 over) wherever a line crosses a shop, corridor or door, and nav obstacles for the solid parts. They are built in a post-pass from `north-towers.js`, so the P1 builders are untouched. Guard: every mall walk test and every shop-door clearance stays green. Any wall piece that would break one is left out and listed in HANDOFF as a known simplification.

**Fire.**
- Hardstands HS1 (36 × 10) / HS2 (32 × 10) on 北外环, 5 m off the north faces; unchanged ✓.
- Rescue windows: 2 per storey on the north face from **7F** (C-34: the sky lobby's north glass gets two marked panels too), refuge floors included.
- Refuge plan (`lv.refugePlan`, tower-local):
  - 避难区 = landings W / E + the north half of each wing, z[−8, 0], on the river / hardstand face;
  - plant = the south halves, z[0, 8], behind a 3.00 h wall on z = 0 (also the outrigger wall line on 24F), entered through a 防火隔间;
  - W south: PRVs (10F) or the transfer tank + pumps (24F); E south: electrical rooms and pressurisation fans.
- Pressurisation: segment 1 = 1F–23F with fans on 24F; segment 2 = 24F–RF with fans on RF. The P1 basements have their own system.
- The 7F lobby keeps its two open-roof exits. The `T?-7F-GATE` releases on alarm.
- No helipad (residential; GB 50016 §7.4.1 ✔ covers public buildings only).

**Homes** (all 3BR+, all distinct within the tower by `planSignature`).

| band | floors | kind | types | T1 | T2 |
|---|---|---|---|---:|---:|
| L 江景大平层 (kept) | 8, 9, 11, 12, 13 | `flat` | 3BR / 4BR | 10 | 10 |
| D 错层复式 (kept) | 14–23 | `duplex` × 9 + `flat` 14E | 4BR / 5BR | 10 | 10 |
| D-end (new) | 23E | `flat` | 4BR | 1 | 1 |
| C 云端大平层 (new) | 25–33 / 25–31 | `flat`, 3.9 m storey | T1 4 / 3 / 5 / 4BR cycle; T2 3 / 4 / 4 / 3BR | 18 | 14 |
| PH 顶层复式 (new) | 34–35 / 32–33 | `penthouse`, two levels, roof terrace | 5BR + 挑空 where the generator allows | 2 | 2 |
| **total** | | | | **41** (52 level units) | **37** (48) |

- Titles: `23E 端户大平层`, `25W 云端大平层`, `34–35W 顶层复式 · 上层`; tags keep the `${l0}${l1}${side}` form.
- The `penthouse-flat` kind (24W) is retired.
- 户内避难间: the master bedroom (on a two-level home, the entry-level bedroom), preferring the north (hardstand) face.

**Plan generation** (`scripts/plans/north.mjs`, the north module of the split driver; north.md §3).
- `--extend-north`:
  - load the kept homes;
  - drop `T?-10W`, `T?-10E`, `T?-24W` and `T?-23E` (the 23–24E duplex);
  - seed `used` with the keys and signatures of every existing home, dropped ones included;
  - generate in a fixed order: 23E, band C, band PH.
- `NORTH_BANDS`:

  ```js
  export const NORTH_BANDS = [
    { band: 'D-end', floors: [23, 23], side: 'E', kind: 'flat', types: ['4BR'] },
    { band: 'C', floors: { T1: [25, 33], T2: [25, 31] }, kind: 'flat', variantExtras: true,
      types: { T1: ['4BR', '3BR', '5BR', '4BR'], T2: ['3BR', '4BR', '4BR', '3BR'] } },
    { band: 'PH', floors: 'top-1..top', kind: 'penthouse', sides: 'both', type: '5BR', voidAbove: true },
  ];
  ```

- `variantExtras` (茶室 / 家庭厅 / 工人房 + 卫 / 双主卧套房 / 酒窖) is a generator flag that is **off by default**, so the west output never changes. Gate on `meta.rank ≤ 24` and log `meta.score`.
- Store `spec: { type, variant, voidAbove }` per part; export `planKey()`.
- Full regeneration and `--extend-north` must give byte-identical output (test on one tower).
- Cost: 42 new level plans ≈ 290 kB, so the north data file is ≈ 680 kB (cap 800 kB). `--extend-north` ≈ 1.5 min; full regeneration ≈ 3 min.
- T2's 12 m wings get no 挑空 from today's generator (north.md risk R6). Default: flat ceilings in T2's PH; the void relaxation is a stretch item behind a flag.

**Exterior** (north.md §7, scaled to 150 m).
- **Unitized curtain wall, independent of the plans**:
  - modules: N / S wing faces T1 10 × 1.4 m, T2 8 × 1.5 m; E / W 10 × 1.6 m;
  - 0.9 m back-painted bronze spandrel per storey;
  - 0.35 m `extSatin` fins on every second mullion;
  - 1.2 m chamfered corners;
  - the stone core spine on N / S with the accent fins;
  - enclosed 封闭式观江阳台 with an operable vent bay;
  - mullions and vision glass merge vertically from 8F to the crown;
  - the spandrel is omitted only where a duplex 挑空 meets the façade.
- **Refuge bands**: 10F (3.6 m, 6 bronze blades between the fins); 24F (5.4 m, 8 blades plus belt-wall diagonals behind on N / S). 乙级 fire windows on the 避难区 bays; red rescue triangles.
- **Crown**: fins rise 10 m above RF, their tops stepping +10 / +8 / +6 m from the core to the plate ends (a gentle gable from the river). A 3 m glass wind screen shelters the terraces. The core lantern carries the name sign at RF + 6 m (existing sign-atlas cell) and the obstruction lights: high-intensity on T1, medium-intensity red on T2 (C-28), both red at night. `glowSoft` fin tops at night.
- Gap faces (T1 E end, T2 W end) are fritted.
- **Lazy per-floor detail** moves into `residence-interiors.js`: wet-room panels, curtains, guard bars, sliders, lift lintels, landing finishes, stair door heads, exit signs.
- **Far LOD** beyond 600 m: 2 meshes ≤ 1,500 triangles, carrying the bands and the crown silhouette.
- **Estimates**: T1 ≈ 26k, T2 ≈ 24k exterior vertices (today 81.6k / 81.3k); 北苑 resident total ≈ 1.45 MB (today 3.36 MB); still 8 exterior meshes per tower.

**Pick-card text**: `住户电梯 W / E · 消防电梯 ×2（含服务梯）· 一梯一户`; `10F 避难层 · 设备层 · 消防电梯停靠`; `顶层复式私家露台 · 消防联动释放`.

### 1.2 云澜·西苑 W1 / W2 (S47; west.md)

**Storey table** (both towers). `elev(nF) = 4.5 + 3.0·(n − 2) + 1.5·(refuge floors below n)`.

| floor | elev (m) | storey | use | family | lifts that open |
|---|---:|---:|---|---|---|
| B2 / B1 | −8.4 / −4.5 | 3.9 / 4.5 | 住户电梯厅 + WPG deck portals (unchanged places; the basement lobby widens 2.3 m) | — | all 6 |
| 1F | 0.0 | 4.5 | 社区大堂, `Wn-1F-GATE` | — | all 6 |
| 2F–15F | 4.5 → 43.5 | 3.0 | homes, 14 floors × 5 | **A 标准** | L1 L2 F1 |
| **16F** | **46.5** | 4.5 | **避难层 R1** + plant (break tank, PRVs) | — | F1 |
| 17F–30F | 51.0 → 90.0 | 3.0 | homes, 14 floors | **B 换角** | L1 L2 F1 |
| **31F** | **93.0** | 4.5 | **避难层 R2** + fire-water transfer tank + pumps; the 高低区 break | — | F1, F2 |
| 32F–47F | 97.5 → 142.5 | 3.0 | homes, 16 floors (balconies enclosed) | **C 改善** | H1 H2 F2 |
| RF | **145.5** | — | north half plant (machine room for the high bank, roof tank ≥ 36 m³, fans); south half a reduced **屋顶花园** behind a 2.4 m glass wind screen | — | H1 H2 F2 |
| crown | **156.5** | — | party-wall pilasters continue 11 m as fins + ring beam | — | — |

- 47F is 49.5 m above 31F (≤ 50 ✓, the S47 limit). The roof garden is open air, 52.5 m above 31F. `checkRefugeStack` exempts open-air roofs and says so in its doc comment (§0.5, C-17); risk 13.
- `west-site.js` (split out of `community-sites.js`): `WEST_SITE.levels = { B2: −8.4, B1: −4.5, lobbyHeight: 4.5, floorHeight: 3.0, refugeHeight: 4.5, top: 47, refuge: [16, 31], crown: 11 }`, with `roof` computed and asserted (145.5). Also `towers[i].core` / `lobby` / `serviceSide`, `families` and `zones: { low: [2, 30], high: [32, 47] }`.

**Lifts: 6 in two banks; every home floor sees exactly 3 doors (3梯5户 kept).**

| lift | role | car | speed | stops | count |
|---|---|---|---|---|---:|
| L1, L2 西苑低区客梯 | `passenger`, zone low | 1,000 kg | 3.0 m/s, MRL | B2 B1 1F · 2F–15F · 17F–30F | 31 |
| F1 低区消防电梯 | `fire`, zone low | 1,050 kg, 1.1 × 2.1 m | 3.0 m/s | B2 B1 1F · 2F–31F (incl. 16F, 31F) | 33 |
| H1, H2 西苑高区客梯 | `passenger`, zone high | 1,000 kg | 4.0 m/s | B2 B1 1F · 32F–47F · RF | 20 |
| F2 高区消防电梯 | `fire`, zone high | 1,050 kg, 1.1 × 2.1 m | 4.0 m/s | B2 B1 1F · 31F · 32F–47F · RF | 21 |

- **Bank order (C-21).** The two banks face each other across the lift lobby, and the lobby must be at least as deep as the two facing cars (GB 50352 §6.9.1 ≈). F1 facing F2 would need 2.1 + 2.1 = 4.2 m. So the high bank is ordered **F2 · H2 · H1** from north to south (the low bank stays L1 · L2 · F1). Each 2.1 m car then faces a 1.4 m car (3.5 m), and the lobby widens **3.0 → 3.5 m** by taking 0.5 m from the service column (2.45 → 1.95 m).

- Traffic: low bank 54 s / 10.8 %; high bank 58.6 s / 17.5 %.
- Runs: F1 1F → 31F 34.9 s; F2 1F → 47F 40.7 s.
- The low-bank shafts end in 32F (MRL heads). From 33F up their footprint becomes 储藏 / 管井 cells, so the high-zone lobby has 3 doors facing a wall.
- `corePlan.lifts[i].landing = serves.includes(lv.id)`. `landing: false` draws the door side as solid wall.
- 1F / B1 / B2 overhead signs: `低区 2F–30F · L1 L2 F1` and `高区 32F–47F · RF · H1 H2 F2`.

**Core** (west.md §3.3). It grows 15.7 → **18.0 m** inside the 8.4 m north band; the slab depth stays 19.2 m.

| | W1 x | W2 x |
|---|---|---|
| stair A | [−7.3, −3.7] (moved 2.3 m W) | [−10.1, −6.5] |
| service column | [−3.7, −1.75] | [2.35, 4.3] |
| low bank L1 · L2 · F1 (N → S) | [−1.75, 0.85] | [−6.5, −3.75] |
| **lift lobby = 消防电梯合用前室** (3.5 × 8.4 = 29.4 m²) | [0.85, 4.35] (east edge as today) | [−3.75, −0.25] (west edge as today) |
| high bank F2 · H2 · H1 (N → S) | [4.35, 7.1] | [−0.25, 2.35] |
| stair B | [7.1, 10.7] | [4.3, 7.9] (moved 2.3 m E) |

- The 1F gate line, the B1/B2 vestibules and gate frames, and both WPG deck portals stay **exactly** where they are. If a gate frame spans the lobby mouth, its record grows 0.5 m to match the wider lobby; the gate itself does not move.
- **Access (C-3)**: both stairs' 1F doors stay inside `Wn-1F` after the 2.3 m move (P-west asserts it), and their B1 / B2 doors stay inside the gated vestibules, so 西苑 needs no new gate.
- Gates and zones stay at 6 + 6; the B1/B2 zone polygons grow with the basement rectangle.
- The basement-lobby widening costs about 4–8 WPG deck bays.

**Stairs.**
- Two separate 防烟楼梯间 at the core ends; home door → stair ≤ 15 m.
- **Corridor 前室** (default 20): hold-open 甲级 door leaves across the corridor at x = core.x0 and core.x1. They make the corridor segment in front of the core the 合用前室. The ≤ 3 south home doors that open into it are 乙级 (GB 50016 §5.5.27-3 ✔).
- `breakLevels: ['Wn-16F', 'Wn-31F']`: partition at x0 + 1.8; the door splits into x0 + [0.3, 1.7] and x0 + [1.9, 3.3].

**Fire.**
- Fire road z[−221.8, −211.8], 5 m off the full south face (HS-W1 / HS-W2): unchanged ✓. They stay in `site.westGarden.hardstands`, not `site.fireAccess`, so `hardstandPaint()` never paints them twice; `hardstandErrors` reads both lists (C-23).
- Rescue windows: 2 per storey on the south face (the S and SE homes), part of the instanced module.
- Refuge plan:
  - 避难区 = the south room x[−9, 9] × z[0.6, 9.6] + the corridor + the lift lobby;
  - plant SW (31F transfer tank + pumps; 16F break tank + PRVs) and SE (fans, 新风, electrical) behind 2.00 h / 3.00 h walls and a 防火隔间;
  - ventilation: south 乙级 windows + the E / W corridor-end windows (two orientations, ≥ 2 % of 833 m²).
- Pressurisation: 1F–30F with fans on 31F; 31F–RF with fans on RF.
- 户内避难间 in every home: a bedroom on the external wall (south row: the hardstand face), `refugeRoom: 'bed_2'`.

**Homes** (all distinct within a tower; 5 different plans on every floor). Columns: SW · S · SE · NW · NE.

| family | floors | W1 bedrooms | W2 bedrooms |
|---|---|---|---|
| A 标准 | 2F–15F | 4 · 2 · 3 · 3* · 2 (today's plans; *NW re-cut 121.0 m²) | 3 · 2 · 4 · 2 · 3* (*NE re-cut 115.9 m²) |
| B 换角 | 17F–30F | 3 · 2 · 4 · 3 · 2 | 3 · 2 · **4** · 3 · 2 |
| C 改善 | 32F–47F | 4 · 2 · 4 · 3 · 3 | 3 · 2 · 4 · 3 · 3 |

- **Every floor of every family has a 两房, a 三房 and a 四房** (C-10: W2 B's SE slot becomes a 4BR, one of the 16 distinct W2 SE 4BR variants in west.md's capability table, with a signature different from families A and C). Counts and the 15 plans per tower are unchanged.
- 220 homes per tower, 440 for 西苑.
- 15 plans per tower, 30 in all (today 10).
- Unit codes `W1-0201` … `W1-4705`; refuge floors have no units.

**Plan generation** (`scripts/plans/west.mjs`).
- `WEST.towers[i].families = [{ id, floors, south, north, variant }]`, the re-cut north slots, and one `used` set per tower.
- The `lux` program is not used: it fits none of the 8.4–9.0 m slots.
- Measured feasibility: families A and B generate completely (10 / 10, distinct, no errors). The C picks are inside the capability table (west.md §2.3).
- About 3 s per tower.
- Output: `community-plan-data-west.js` ≈ 140 kB (cap 250 kB).

**Exterior** (west.md §6).
- Today's punched windows and balconies are kept and **instanced per family module**: A, B, C and the refuge module R (≈ 1.5k v, instanced twice).
  - Storey-high walls stay in `Columns`.
  - `glowSoft` lit panes stay per floor in the main batch, so lit windows do not repeat.
- High-zone (C) balconies are enclosed from 32F: glass instead of a rail, no geometry cost.
- **Bands** at 46.5–51.0 and 93.0–97.5 m: dark-grey rain louvres on the plant faces; 乙级 fire windows with two red triangles on the 避难区 bay x[−9, 9].
  - The rhythm reads 1F → 14 → band → 14 → band → 16 → crown.
- **Crown**: pilasters continue 11 m as aluminium fins with a ring beam. The sign `云澜·西苑 n 号楼` moves to RF + 6 m on the south face, about 16 m wide, lit. Aviation lights at the four corners (crown > 150 m).
- **Far LOD** (existing 600 m mechanism) gains bands and the crown: ≈ 1,100 triangles ≤ 1,500.
- **Estimates**: ≈ 1.45 MB per tower (today 2.81 / 2.90); near ≤ 36 meshes per tower (8 + 7 × 4 modules); both towers ≤ 140k drawn triangles.

### 1.3 云澜汇楼盘 R1–R4 (p2.md; expansion layout only)

**Storey table** (R1; R2–R4 stop earlier, below).

| floor | elev (m) | storey | use | family | lifts that open |
|---|---:|---:|---|---|---|
| B2 | −8.4 | 4.2 | footprint garage (+≈ 18 stalls), lift lobby + `Rn-B2-GATE`, lift pits. The internal ramp to B1 runs along x in the **south half** (tower-local z[2, 7], clear of the core at z[−15.9, −1.6], 28 m at 15 %, C-27) | — | all 4 |
| B1 | −4.2 | 4.2 | shared garage spine, lift lobby + `Rn-B1-GATE` | — | all 4 |
| 1F | 0.0 | 4.8 | 住宅大堂 (= 扩大前室), `Rn-1F-GATE` speed gates at the band mouth; management NW, reading room NE | — | all 4 |
| 2F–13F | 4.8 … 42.2 | 3.4 | **L 低区**: 01 (W) + 02 (E), open balconies | L | all 4 |
| **14F** | **45.6** | **4.5** | **避难层 R1**: 避难区, PRVs, segment-1 fans | — | LF |
| 15F–26F | 50.1 … 87.5 | 3.4 | **M 中区**: 03 (W, now facing south) + 02, open balconies | M | all 4 |
| **27F** | **90.9** | **5.4** | **避难层 R2 + 加强层**: outrigger + belt truss, transfer tank + pumps, break tank | — | LF |
| 28F–39F | 96.3 … 133.7 | 3.4 | **H 高区**: 01 + 02, enclosed balconies | H | all 4 |
| **40F** | **137.1** | **5.4** | **避难层 R3 + 加强层**: outrigger + belt truss, PRVs | — | LF |
| 41F–51F | 142.5 … 176.5 | 3.4 | **S 云端**: 03 + 02, enclosed | S | all 4 |
| 52F–53F | 179.9 / 183.3 | 3.4 | **PH 顶层复式** W + E (entry 52F; 53F is the upper level, with no 户门) | PH | 52F all 4; 53F LF |
| RF | **186.7** | 3.2 | machine room, roof tank ≥ 36 m³, BMU, segment-2 fans, TMD (R1 / R2) | — | LF |
| crown | **200.0** | 13.3 | twin-blade crown with a glass seam; name sign at RF + 8 m on N and S; hat truss (R1) | — | — |

| | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| top floor | 53F @ 183.3 | 50F @ 173.1 | 47F @ 162.9 | 44F @ 152.7 |
| RF / crown | 186.7 / 200.0 | 176.5 / 189.8 | 166.3 / 179.6 | 156.1 / 169.4 |
| S floors / PH floors | 41–51 / 52–53 | 41–48 / 49–50 | 41–45 / 46–47 | 41–42 / 43–44 |
| homes (records) | 96 (98) | 90 (92) | 84 (86) | 78 (80) |
| levels (B2 … RF) | 56 | 53 | 50 | 47 |
| top home floor above 40F | +46.2 | +36.0 | +25.8 | +15.6 |

**Plate** (tower-local; p2.md §3.2).
- core x[−8.8, 8.8] z[−15.9, −1.6] (251.7 m²);
- enclosed band (候梯厅 + 入户走道) x[−12, 12] z[−1.6, 1.6];
- W wing x[−19.4, −1.8] z[1.6, 15.9]: 03, or 01 + a 2 m AC strip;
- E wing x[3.8, 19.4]: 02;
- slot x[−1.8, 3.8], a void from 2F;
- NW / NE voids open air.
- Storey ≈ 803 m² (core 31 %), one compartment.

**Core.**
- ST1 / ST2 x[−8.6, −4.8] / [4.8, 8.6], z[−15.7, −7.0] (8.7 m deep: the 5.4 m storeys need 8.28 m, C-1 check); 1.3 m flights; doors 13.4 m apart.
- LF x[−1.4, 1.4] z[−10, −7].
- **Two 前室, not one (C-20).** Two independent 防烟楼梯间 entered through one shared 前室 would lose their independence: one smoke event would reach both exits. The former 67 m² U is split by a 2.00 h wall with an 甲级 door line at x = +1.6:
  - **ST1 + LF 合用前室** to the west, x[−8.8, 1.6] (≈ 40 m²; residential ≥ 6 m², short side ≥ 2.4 m, GB 50016 §6.4.3 ✔ / §7.3.5 ✔);
  - **ST2 独立前室** to the east, x[1.6, 8.8] (≈ 27 m²; ≥ 4.5 m²);
  - each keeps its 甲级 stair door at x ∓6.9 and its own 甲级 door to the band.
- L1 / L2 / L3 x[−4.1, −1.5] / [−1.3, 1.3] / [1.5, 4.1], z[−4.5, −1.6], doors south onto the band.
- Distances: home doors → nearest 前室 door 5.1 m, → stair door 9.5 m.

**Lifts.**

| lift | car | speed | stops | R1 | R2 | R3 | R4 |
|---|---|---|---|---:|---:|---:|---:|
| L1, L3 | 1,050 kg | 5 m/s | B2 B1 1F + every floor with a 户门 (the penthouse entry 52F, not its upper level) | 51 | 48 | 45 | 42 |
| L2 | 1,050 kg, 1.1 × 2.1 m stretcher | 5 m/s | same | 51 | 48 | 45 | 42 |
| LF 消防电梯 | 1,050 kg, 2.1 m deep | 5 m/s | **every level** B2 → RF | 56 | 53 | 50 | 47 |

- L1–L3 carry the refuge levels and the penthouse upper level in `shaftLevels` and not in `serves` (C-35, the same rule as 北苑's private lifts). On the top floor the band holds only the stair doors and LF's landing (`消防电梯停靠`), with no 户门.
- LF runs to the top floor: 42.8 / 40.8 / 38.7 / 36.7 s.
- Interval 46.3 s (R1) … 43.0 s (R4). Marketed as 三梯两户 + 消防梯.
- Fire mode: L1–L3 recall to 1F; the gates release.
- Cars are drawn only while the tower is selected, entered or ridden (closed shafts). The glass lifts in the light well are retired in the expansion variant.

**Stairs.** Two independent 防烟楼梯间 (not scissor), on every floor, to RF. `breakLevels` on 14F / 27F / 40F: going down you leave, cross the 前室 + band + 避难区, and re-enter. **1F is also a break level** (§1.0, GB 50016 §6.4.4-3 ≈): the B2 → 1F run arrives at its own door into the 前室 inside `Rn-1F`, and the above-ground run arrives at the main door. The above-ground run also has a direct north door to outside, which is an **exit-only card door** `Rn-ST1-EXIT` / `Rn-ST2-EXIT` (free egress, a card from outside, release on alarm; +2 gates per tower, C-3). The B1 / B2 stair doors open into the 前室 inside the gated B-lobbies.

**Fire.**
- **HS-R1…HS-R4**: x[x−21, x+21] × z[−195.4, −185.4] (x = 49 / 115 / 181 / 247), 42 × 10 m, 6.0 m off the south envelope. They merge with the 6 m 住宅消防与落客环路.
  - The `landscape()` south row of planters, trees, benches and bollards is removed inside the clear zone.
  - The ring gets two driveway connections: 星湾北街 at x ≈ 278 and 星湾路 at x ≈ 20.
- 避难区 on the south part of both wings, z[9.5, 15.9] (≈ 213 m²) + band + 前室. Plant in z[1.6, 9.5].
- Pressurisation: B1–27F with fans on 27F; 28F–RF with fans on RF.
- 户内避难间: `bed_primary` (south wall) in every home. The GLB homes get the `residence.refugeRoom` tag and the pick-card line only, because their doors are baked into the GLBs and have no door-leaf record. A load-time tint of that GLB door material is optional (C-26). The procedural penthouses get a real `fire: '乙级'` leaf.
- 1F lobby = 扩大前室: LF → south door ≈ 24 m (≤ 30 m, GB 50016 §7.3.5 ✔).

**Homes and plans.**
- Families L (01 + 02), M (03 + 02), H (01 + 02, enclosed), S (03 + 02, enclosed), PH (two procedural duplexes, W ≈ 503 m², E ≈ 446 m²).
- **The 01 / 02 / 03 GLBs and `residential-plan-data.js` are reused 1:1**: no re-bake, no `prepare-residential-plans.py`. 03's frame rotation goes 180° → 0°.
- **Penthouses**: `generateDuplex()` with the R wing specs (W 17.6 × 14.3 with a north edge that is exterior only beyond x −12, E 15.6 × 14.3), `luxury` program, 挑空 living, `DUPLEX_STAIR.rise` = 3.4. Built by `scripts/plans/r-penthouse.mjs` (`--r-only`) into `src/layout/r-penthouse-plan-data.js` (≈ 0.1 MB, cap 200 kB). The frozen 西苑 / 北苑 data are not regenerated.
  - **Hooks (C-15).** The generator, unit building and drawing live in files P-R does not own. P0a adds them behind flags, and P-R is their only caller: a `wing` option on `generateDuplex()` (`{ w, d, exteriorEdges, rise }`; absent = today's behaviour, byte-identical west / north output) and a `buildDuplexUnits(spec, frame)` export in `community-units.js`. P0b makes `residence-interiors.js` draw any two-level residence from its plan data, whatever its community.
  - **Spike first (C-16).** No script has run `generateDuplex` on these wings yet, and the same generator produced 0 / 20 duplexes on the 西苑 slots and no 挑空 on T2's 12 m wings. P0a runs a spike on both R wing specs (`spec-calc`-style script, no data written). If it fails, P-R starts on the **fallback**: the top two floors become family S (03 + 02). Homes per tower stay 96 / 90 / 84 / 78; records drop by 8 (356 → 348; `r.js` records 0; campus 1,512; residenceAccess 972); the tour and catalog drop "顶层复式"; L1–L3 then stop at the top floor too (+1 stop each).
- Unit codes `R1-0201` (W) / `R1-0202` (E); penthouses `R1-5201` / `R1-5202` with `residence.homeLevels` [52F, 53F].
- Kitchen and children's-room windows face open air over the NW / NE voids. The bath / laundry / NE-bedroom windows that face the enclosed band are drawn frosted (fixed obscure glass).

**Exterior** (p2.md §7).
- Façade chapters bottom → top: 1F glass lobby · L (punched GLB windows, open balconies, AC louvres) · 14F band · M · 27F band with belt diagonals · H (enclosed-balcony glass) · 40F band · S · PH (full-height curtain wall, double-height 空中花园 bay) · crown.
- The 5.6 m glass seam in the slot has edge beams at every floor and is lit at night.
- The six mega-columns are expressed.
- North face: the stone core with fins.
- **Instanced templates shared by all four towers**: T-L, T-M, T-H, T-S (4 meshes each), T-common (≈ 6), T-ref-4.5 / T-ref-5.4. Each tower clips with its own material clone; the visited floor hides by a zero-scale instance. A per-tower unique batch (B1, 1F, PH, RF, crown, columns, sign, lights) is ≈ 40k v.
- **Mid LOD** (350–600 m): 3 meshes, ≤ 8k triangles. **Far LOD** (≥ 600 m): 2 meshes, ≤ 1,500 triangles.
- The lobby and RF groups move inside the near branch.
- **Estimates**: R1 near ≈ 41 meshes, ≈ 280k triangles; R1–R4 unique ≈ 4.2 MB (today 11.8); campus view ≈ 8 meshes for all four (today ≈ 620).

**Site.**
- **R1's B1 arrival turns east, not west (C-8).** R1-IN / R1-OUT fall from street level at x 20 to B1 (−4.2) at x 48 over z[−246.5, −235]. A westward aisle would run under the ramp slabs with only 1.35–2.85 m of headroom (< 2.2 m). So from the ramp toes at x 48 the aisle runs **east** along z[−248, −238] to x[59, 69] (R1-local x 10…20, past the core's east face at x 57.8, under the open-air NE void), then south into the B1 cross aisle. The north B1 slab for the L stays as today. P-R updates the pins p2.md names (`hospitality.test.js` l. 115 / l. 166, `residential-integration.test.js` l. 186).
- B1 loses ≈ 6 stalls per tower to the core; B2 adds ≈ 18 per tower.
- The pocket gardens, the 住宅过街通廊 and the P2 links are unchanged.

### 1.4 云澜酒店 H (hotel-apt.md v2, program R; expansion layout only)

**Massing.**
- Podium 1F–2F (11.5 m) on today's 74 × 38 m footprint: all four P1 links stay (1F dock, 2F skybridge, B1 metro, B2 garage). Its P1-facing wall becomes a 防火墙 with 甲级 doors.
- **Tower 3F–RF: 66 × 32 m**, x[−284, −218] z[−94.15, −62.15], flush with the podium on W and S, set back 8 m E and 6 m N.
  - 15.25 m to P1 ✓; 12.85 m to the P1W3 / P1W4 annexes (≥ 9 m for 一、二级 ✓).
  - The 2F roof strips are non-accessible planting.

**Storey table.**

| floor | elev (m) | storey | use | lifts that open |
|---|---:|---:|---|---|
| B2 / B1 | −8.4 / −4.5 | 3.9 / 4.5 | 住客车库; B1 地铁连廊 (unchanged); `H-B1/B2-GATE` at the RB lobby | RB SH S1 S2 |
| 1F | 0.0 | 6.5 | **酒店落客大堂** (E, `H-MAIN`) + **云澜酒店公寓 · 住户大堂** (W, `H-SIDE`, `H-1F-GATE` in front of RB) | RB SH S1 S2 |
| 2F | 6.5 | 5.0 | **会议中心**: pre-function where the P1 skybridge lands; 4–6 meeting rooms | SH S2 · S1 fire mode |
| 3F–12F | 11.5 … 42.1 | 3.4 | 云澜酒店公寓, 8 per floor | RB S1 |
| **13F** | **45.5** | 4.5 | **避难层 R1** + light plant, PRVs | S1 |
| 14F–25F | 50.0 … 87.4 | 3.4 | 云澜酒店公寓 | RB S1 |
| **26F** | **90.8** | **8.6** | **避难层 R2 + 双层高设备层**: 避难区 + pumps on the slab; plant mezzanine at +4.3 m (AHUs, heat exchangers); the core holds the RB overrun + machine room + HL pits; transfer tank + pumps | S2 · S1 fire mode |
| **27F** | **99.4** | 6.8 | **空中大堂**: 礼宾 · 办理入住, 行政酒廊 · 大堂吧, 悦庭钢琴酒廊, 云宴全日餐厅 | SH HL S2 · S1 fire mode |
| 28F–36F | 106.2 … 133.4 | 3.4 | hotel, 8 suites per floor (28F core south row = SH machine room) | HL S2 · S1 fire mode |
| **37F** | **136.8** | 6.0 | **避难层 R3** + AHUs, PRVs, electrical | S2 · S1 fire mode |
| 38F–46F | 142.8 … 170.0 | 3.4 | hotel; 44F–46F **行政楼层** (signed by zone, not number) | HL S2 · S1 fire mode |
| 47F | 173.4 | 6.0 | **云境水疗 · 室内泳池** (≈ 18 × 7 m) · 健身 | HL S2 · S1 fire mode |
| 48F | 179.4 | 6.0 | **云端餐厅** (W) · **云端酒吧** (E) | HL S2 · S1 fire mode |
| RF | **185.4** | — | wing roofs: BMU, cooling towers behind louvres; ST1 / ST2 roof exits | S2 · S1 fire mode |
| lantern / deck | 194.2 / **196.8** | — | 22 × 19 m core lantern (HL and S1 / S2 machine rooms, fire tank ≥ 100 m³, fans) carrying the **26 × 26 m 停机坪** | stairs |

- The roof structures are ≈ 502 m² (lantern 418 + stair housings, BMU garage and cooling-tower screens ≈ 84) ≤ ¼ of 2,112 m² = 528 m², so the height stays at RF. The lantern shrinks 22 × 20 → 22 × 19 m: it still covers every shaft (z ±6.4) and the margin grows from 4 m² to 26 m². `hospitality-supertall.test.js` sums the real footprints (C-33).
- The 26F plant mezzanine is a 设备夹层: no lift stop, no public access, shown inside the `26F 避难层 · 设备层` rail row.

**Stacked shafts: why 26F is 8.6 m.** RB (B2 → 25F) and HL (27F → 48F) share one row of four shaft positions. 25F (87.4) + RB headroom 5.2 + RB machine room 3.2 + HL pit 3.6 = 99.4 = 27F: **12.0 m needed and provided**. In the game, RB's `shaftLevels` run B2 → 26F, HL's run 27F → RF, and the 26F core cell between them is solid.

**Lifts.**

| bank | cars | car | speed | stops | count | interval |
|---|---:|---|---:|---|---:|---:|
| RB 酒店公寓客梯 (card 梯控) | 4 | 1,350 kg | 3.5 m/s | B2 B1 1F · 3F–12F · 14F–25F | 25 | 46 s |
| SH 穿梭梯 (public) | 3 | 1,600 kg | 6 m/s | B2 B1 1F 2F 27F | 5 | 32 s |
| HL 酒店客梯 (room-key 梯控 28F–46F) | 4 | 1,600 kg | 4 m/s | 27F · 28F–36F · 38F–48F | 21 | 46 s |
| S1 消防 / 公寓服务梯 | 1 | 1,600 kg, 2.4 m deep | 4 m/s | normal: B2 B1 1F · 3F–25F (13F refuge with the key); **fire mode only**: 2F · 26F–48F · RF | 26 + 25 = 51 doors | 1F → 48F 49.9 s |
| S2 消防 / 酒店服务梯 (zoned fire lift) | 1 | same | 4 m/s | B2 B1 1F 2F · 26F–48F · RF | 28 | |

- 13 cars in 9 shaft positions.
- **S1 never links the 酒店公寓 with a public floor in normal mode (C-3).** Its B2 / B1 / 1F landings are inside the RB gate zones (`H-RES-B2 / B1 / 1F`). Its landings on 2F, 26F–48F and RF are `fireOnly`: the door is drawn and signed `消防专用`, with no call button, and it becomes a nav link only in fire mode. Fire coverage is unchanged: every storey still has at least one fire lift, and the hotel floors have two.
- S2 serves only the hotel side and never stops on 3F–25F, so its B2 / B1 / 1F landings sit in the hotel back of house, outside any gate.
- Fire mode: RB / SH recall to 1F, HL to 27F; S1's fire-only landings open; every gate releases.

**Core (re-planned for C-1; tower-local, x along the 66 m length, z across, origin at the plate centre).** The v2 schematic put ST1 / ST2 at x −11…−4, z ±(10…16): 6.0 m deep, where every H storey throws `insufficient stair depth` (8.84 m is needed for the 6.0 m storeys). It also put the stairs 10 m from the fire lobbies it said they shared. The revised core puts one stair at each end of the core, diagonally opposite, each in a 合用前室 with its fire lift.

| zone | x | z | contents |
|---|---|---|---|
| **ST1** (NW) | −11 … −6.6 | −16 … −6.4 | 防烟楼梯间 **4.4 × 9.6 m**: two 1.6 m flights (the engine's width), door at z −6.4 |
| **合用前室 1** (ST1 + S1) | −11 … −4.6 | −6.4 … −2.0 | 28 m² (public ≥ 10 m²); 甲级 door onto the lift hall at x ≈ −9.5, 1.5 m from the W wing corridor |
| S1 | −4.6 … −1.6 | −6.4 … −3.4 | 3.0 × 2.8 m shaft, door west into 前室 1 |
| N shaft row | −1.6 … 9.6 | −5.0 … −2.0 | 4 × 2.8 m: RB (B2–26F) stacked under HL (27F–RF); A: L1–L3 + risers |
| lift hall | −11 … 11 | −2.0 … 2.0 | the through corridor, 4 m. At 1F / B1 / B2 a glass wall on z = 0 splits it into the RB half (N, entered from the W, gated) and the SH half (S, entered from the E) |
| S shaft row | −9.6 … 1.6 | 2.0 … 5.0 | SH × 3 + spare; A: L4–L5 + risers |
| S2 | 1.6 … 4.6 | 3.4 … 6.4 | door east into 前室 2 |
| **合用前室 2** (ST2 + S2) | 4.6 … 11 | 2.0 … 6.4 | 28 m²; 甲级 door onto the lift hall at x ≈ 9.5 |
| **ST2** (SE) | 6.6 … 11 | 6.4 … 16 | 4.4 × 9.6 m, on the hardstand face; at 1F its outer door opens onto HS-H |
| façade bays | the rest of x[−11, 11] beyond z ±6.4 | | AHU / 新风 behind louvres (N), housekeeping and electrical (S), risers |

- The stairs are ≈ 22 m apart (door to door), ≥ 5 m ✓.
- Each wing's dead-end corridor reaches a 前室 door at the core face. The farthest suite door must be ≤ 18.75 m from a 前室 door on hotel floors (高层旅馆, sprinklered) and ≤ 25 m on 公寓 floors (GB 50016 Table 5.5.17 ✔). hotel-apt.md's 16.5 m figure is re-measured on the real door positions in `hospitality-supertall.test.js`. A corner suite whose door lands farther away is mirrored so its door sits at the inner end.
- The stair rooms keep the 2 stair records each (106 campus-wide).

**Plate** (8 suites, two per 22 m wing face, either side of the 22 m full-depth core).
- Corner suites get two slot windows on the 山墙 (转角套房).
- Curtain-wall glass on the suite rear wall: no reveal.
- `lv.unitUsage = 'apartment'` on 3F–25F (`serviced-suite`, catLabel 云澜酒店公寓); `king-suite` on hotel floors.
- Travel distance: see the core bullets above (≤ 18.75 m hotel / ≤ 25 m 公寓, measured in the test).

**Stairs.** ST1 / ST2 防烟楼梯间 with 合用前室 (above), **1.6 m flights**, 分隔 at 13F / 26F / 37F, plus the **1F split** (§1.0), to RF. `maxRisers: 18` gives two loops on 1F (6.5 m: 4 × 10 risers), 26F (8.6 m: 4 × 13 risers; the mid-storey landing is at the plant mezzanine, doorless) and 27F (6.8 m: 4 × 10). The 6.0 m storeys keep two flights of 18 risers (8.84 m of the 9.6 m depth). Open steel deck stairs at the N and S edges lead to the helideck (≥ 2 exits, GB 50016 §7.4.2 ✔). They are drawn but not walkable (C-32).
- **Capacity (C-25)**: two 1.6 m stairs give 3.2 m, or **320 persons per floor** at 1.00 m per 100 (GB 50016 §5.5.21 ≈). Public floors are capped at **300**: 27F ≈ 250 (the 26F refuge sizing), 47F ≈ 160, 48F ≈ 160. The cap is printed on their pick cards and checked in a test.

**Basements (re-planned for C-2; podium-local, centre (−247, −81.15), 74 × 38 m).** The tower core lands on the B1 / B2 decks at x[−15, 7] × z[−13, 19], with its walls down to B2. Today's `addTowerGarageRamps()` ramp lanes (x[−25, 5] at z −14.5 and −7.5) would cross ST1 and 前室 1, and its main cross aisle rect(−29, −3, 29, 3) would run through the N shaft row. `hospitality-supertall.js` therefore re-plans both decks instead of calling it (hotel-apt §9.1's "unchanged" is withdrawn):
- **W ↔ E cross aisle** in the 6 m north strip z[−19, −13], x[−37, 37], outside the tower footprint.
- **B1 ↔ B2 ramp pair** in the east part, along z: down x[23, 28], up x[30, 35], z[−13, 13] (26 m for 3.9 m = 15 % with 3.6 m transitions inside it), turning on B2 in the bay z[13, 19]. The street ramps H-IN / H-OUT keep landing at x ≈ 10 / 18 on the arrival lane x[7.5, 21] (unchanged).
- **Lift lobbies**: the lift hall opens at the core's west face (x −15: the RB half behind `H-B1/B2-GATE`) and east face (x 7: the SH half, public), each by a marked 1.8 m walkway to the cross aisle. P-HA routes the east one clear of the arrival lane x[7.5, 21], crossing it only at a marked crossing south of its end (z > 2.5).
- **Stalls**: the west part x[−37, −15] and the east part south of the arrival lane. P-HA re-counts them (today 20 / 19 on B1 / B2; an estimated 10–14 per deck after the core). That is why no surface stall is promised a basement bay (default 25).
- Re-run `p1.test.js` (ramp slopes, overlaps), `underground-connections.test.js` (the H-IN / OUT light tubes), `hospitality-relocation.test.js` (dock pairs, stalls) and the B2 → P1-B1 garage link, which must land on the new cross aisle.

**Access (C-3).**
- Gates `H-1F-GATE` (speed gates at the RB half's west mouth), `H-B1-GATE` and `H-B2-GATE` (glass doors), with zones `H-RES-1F / B1 / B2`.
- **44 re-entry card doors** `H-ST1-nF` / `H-ST2-nF` on the 22 酒店公寓 floors (3F–12F, 14F–25F). Each sits on the 前室's lift-hall door: free from the floor into the stair, a resident card from the stair side, release on alarm, with zone `H-RES-nF` per floor. They are needed because 2F, 27F, 47F and 48F are public and share both stairs with the 酒店公寓. Egress is never locked; only re-entry into the residents' floors from the stair is.
- With those, ST1's and ST2's 1F and basement doors can stay ordinary doors, the hardstand door included. They lead only to egress routes, public floors and hotel floors.
- Hotel floors have no gates (room-key 梯控 on HL is cosmetic, as today).

**Fire.**
- **HS-H**: x[−284, −218] × z[−57.15, −47.15], 66 × 10 m, 5 m off the south face. It covers **19 of the 22** `hotel-shared-parking` stalls (measured: centre inside or on the edge, C-24). Those stalls are removed, and the hotel's ≥ 20 surface short-stay stalls are kept as 3 in the lot plus 20 west-lot bays marked `酒店短停` within 40 m of `H-SIDE` (default 25). ST2 exits onto it.
- Fire roads: the south long side plus the west short side, a recorded site exception (§1.0 "fire roads", C-36).
- Rescue windows: 2 per storey on the S face.
- 避难区 on the S face: 13F ≈ 120 m², 26F ≈ 160 m² (≈ 3.9 m clear under the mezzanine), 37F ≈ 160 m².
- **Helideck** (宜, GB 50016 §7.4.1 ✔; the standard floor is 2,112 m² > 2,000):
  - 26 × 26 m at 196.8 m, ≥ 5 m clear of protrusions;
  - safety net, H and TLOF marks, perimeter + flood lights, hydrant;
  - primary approach north over the 云澜江, secondary south;
  - nothing within 330 m pierces the approach surface (R1 is 3.2 m above the deck but 331 m away, under the 4.5 % surface);
  - **view only** in the game: pick card `停机坪 · 救援专用 · 不对访客开放`; no stair records, no nav.

**Program and what the user sees (C-12).** 144 hotel keys sit above 176 酒店公寓. The tour caption and the pick card say so: `酒店客房 144 间 · 酒店公寓 176 套`. Q2 offers the all-hotel program K (≈ 330 keys, no sky lobby, 1F lobby kept, ≈ 10–11 lifts) as the alternative.

**Exterior** (hotel-apt.md §8).
- **Tripartite**: two glass wings per long face on a 1.375 m module, with a bronze fin every 4th mullion (marking 5.5 m and the 11 m party walls) and a 1.0 m travertine spandrel per storey; a 22 m travertine core spine with 8 louvre fins; 山墙 with 4 window slots.
- Mullions are continuous 2F → parapet.
- Bands: refuge louvres; **26F + 27F read as one 15.4 m 腰线** at 91–106 m; 47F–48F a 12 m glass lantern band; the lantern + lit deck edge on top.
- Podium glass 1F–2F. Hotel palette (#f3ebdc / #8e7653 / #526b76).
- **Prototyped**: 8 meshes, 26.9k v near (today 176k + stairs); far stand-in 2 meshes, 336 triangles. Lazy 2F / 27F / 47F / 48F interiors.

### 1.5 云澜服务公寓 A (hotel-apt.md v2; expansion layout only)

**Massing.**
- Podium 1F–2F on today's 38 × 74 m footprint.
- **Tower 31.8 × 66 m**, x[−47.8, −16] z[−247, −181]: flush on the 星湾路 (E) face, set back 6.2 m W and 4 m at each end.
  - 13.21 m to P1 (vertex (−61.01, −185.05)) — **0.21 m margin**; 15.0 m to P1E; 44 m to R1.
- Plate 2,099 m² (> 2,000 m²: the rescue facility is 宜; do not shrink the plate).

**Storey table.**

| floor | elev (m) | storey | use | lifts that open |
|---|---:|---:|---|---|
| B2 / B1 | −8.4 / −4.5 | 3.9 / 4.5 | 住客车库 / 地铁连廊; `A-B1/B2-GATE` | L S |
| 1F | 0.0 | 6.5 | **迎宾大堂**: 公寓接待 · 邻里餐厅 · 共享厨房 · 信报快递; `A-1F-GATE` | L S |
| 2F | 6.5 | 5.0 | **住客会所** (健身 · 洗衣 · 共享办公 · 会客); the skybridge lands behind `A-2F-LINK` | L S |
| 3F–12F | 11.5 … 42.1 | 3.4 | 服务公寓, 8 per floor | L S |
| **13F** | **45.5** | 4.5 | 避难层 R1 | S1 S2 |
| 14F–25F | 50.0 … 87.4 | 3.4 | 服务公寓 | L S |
| **26F** | **90.8** | 6.0 | 避难层 R2 + plant, transfer tank + pumps | S1 S2 |
| 27F–38F | 96.8 … 134.2 | 3.4 | 服务公寓 | L S |
| **39F** | **137.6** | 6.0 | 避难层 R3 + plant | S1 S2 |
| 40F–43F | 143.6 · 150.1 · 156.6 · 163.1 | 6.5 | **LOFT 复式公寓**, 8 per floor (`createSuiteMezzanine`, upper bedroom at +3.05 m) | L S (lower level) |
| 44F | 169.6 | 5.0 | **顶层空中会所** (signed by zone, C-30): 住客酒廊 · 共享厨房餐厅 · 阅读 · 室内空中花园 | L S |
| RF | **174.6** | — | plant, BMU, **直升机救助设施** (10 × 10 m winching area on a wing roof, ≥ 5 m from the lantern) | S1 S2 |
| lantern | **184.6** | — | 22 × 19 m: machine rooms, fire tank ≥ 100 m³, name sign, obstruction lights. Roof structures ≈ 480 m² ≤ ¼ of 2,099 = 525 m² (tested, C-33) | — |

**Lifts.**

| lift | cars | speed | stops | interval / run |
|---|---:|---:|---|---|
| L1–L5 公寓客梯 (card 梯控) | 5 | 5 m/s | B2 B1 1F 2F · 3F–12F · 14F–25F · 27F–38F · 40F–44F (43) | 38 s |
| S1 / S2 消防 / 服务梯 | 2 | 4 m/s | every level (47) | 1F → 44F 47.4 s |

- L1–L3 face L4–L5. L overruns to ≈ 175.9 m, so its machine room is in the lantern.
- A has no public floor above its gates (2F is behind `A-2F-LINK`, 44F is residents only), so S1 / S2 serve every level in normal mode. Their B2 / B1 / 1F landings sit inside the gated lift hall (`A-B2 / B1 / 1F`, C-3).

**Core.** The same plan as H (§1.4 core table) on A's 31.8 m depth: ST1 x[−11, −6.6] z[−15.9, −6.3] and ST2 x[6.6, 11] z[6.3, 15.9], each 4.4 × 9.6 m in a 合用前室 with S1 / S2; L1–L3 in the N row, L4–L5 in the S row. The 1.8 m corridor (±0.9) is kept to hold the 13.21 m.

**Stairs and fire.**
- 2 防烟楼梯间, each in a 合用前室 with its fire lift, 1.6 m flights, 分隔 at 13F / 26F / 39F, the 1F split, and `maxRisers: 18`: 1F and the 40F–43F LOFT storeys (6.5 m) get two loops of 10 risers (C-1).
- **Access (C-3)**: both stairs' 1F doors open inside `A-1F`, and their B1 / B2 doors inside `A-B1 / B2`. ST2's outer door to 星湾路 is the exit-only card door `A-ST2-EXIT` (+1 gate).
- **Basements (C-2)**: re-planned as for H. The cross aisle runs in the 6.2 m west strip (P1 side) outside the tower footprint. The B1 ↔ B2 ramp pair goes in the end part away from the A-IN / A-OUT landings. The lift-hall walkways join the aisle. P-HA re-counts the stalls (today 22 / 24).
- Fire road: the east long side only, a recorded site exception (§1.0, C-36).
- Hardstand **HS-A**: the west half of 星湾路, x[−10, 0] along the 66 m frontage, 6 m off the façade. Markings only: yellow grid, 禁停; the trees and lamps on that stretch are removed and the drop-off moves to the ends. Needs municipal acceptance ≈ (risk 10).
- Rescue windows and 避难区 on the E (星湾路) face, ≈ 120 m².

**Exterior.**
- Same language as H in A's palette (#dfddd3 / #454d50 / #638087): siblings, not twins.
- The 40F–43F LOFT band is 26 m of double-height glass with no mid spandrel, under the 44F club glass and the lantern with the name sign.
- **Prototyped**: 8 meshes, 25.2k v; far stand-in 308 triangles.

---

## 2. Shared engine, render and perf changes

### 2.1 Layout engine (package P0a)

| item | contract | notes |
|---|---|---|
| **`refuge` level kind** | `LEVEL_KINDS += 'refuge'` (`community-contract.js`). A refuge level has `units: []`, `name: 'nF 避难层'`, `theme.label: '避难层 · 设备层 · 消防电梯停靠'` (+ ` · 加强层` when `refugePlan.outrigger`). | The S61 prototype failed the west contract on exactly this. |
| **`src/layout/refuge.js`** (new) | `refugeLevel({ id, short, elev, height, frame, areas, plant, vestibules, windows, fixtures, outrigger })` → level record with `lv.refugePlan = { areas: [{ id, name: '避难区', poly, net }], plant: [{ id, name, poly, rating: '2.00h' \| '3.00h', contents }], vestibules: [{ name: '防火隔间', poly, doors }], windows: [{ edge, span, kind: 'fire-window-B' \| 'louvre' }], fixtures: [{ kind: 'hydrant' \| 'hose-reel' \| 'extinguisher' \| 'fire-phone' \| 'pa' \| 'sign', x, z, label }], serves, persons, netRequired, outrigger }`. Walk = areas + corridors; plant = solid rooms. `checkRefugeStack(building, levels, { ground: 0 })` returns errors for: first > 50 m above the hardstand; gap > 50 m; top enclosed occupied storey > 50 m above the last refuge floor (open-air `kind: 'roof'` levels are exempt, and the doc comment says so: C-17); `net < persons / 5`; no fire lift serving it; a passenger lift serving it; a unit on it; the area not touching the hardstand face. | One helper for all five tower types. |
| **stair `breakLevels`** (`tower-stairs.js`) | A stair record gains `breakLevels: [levelId]` and per break level `{ door2: seg, partition: seg }` (tower-local). `towerStairPlan` adds the lane partition over the door landing. `buildTowerStairAccess` ends route (R−1 → R) at the arrival lane's door and starts route (R → R+1) at the other door. The stair room on R gets `doors: [door1, door2]` + a `navWalls` partition. The same mechanism makes the 1F split (§1.0). | north.md §5.1. Stair records stay one per stair (106 total). |
| **stair `maxRisers`** (`tower-stairs.js`, C-1) | Optional `stair.maxRisers` (expansion-only builders set 18). Then each storey gets `loops = ceil(rise / (2 × maxRisers × 0.17))`. Each loop is two flights of `rise / loops / 2`, and between loops there is a doorless landing at the door end at `lo + k × rise / loops` (a surface with `parentFloor: lo.id`, chained like `passLevels`). Without the field the engine is byte-identical to today. The depth check uses the loop's flight. A new test asserts `buildTowerStairAccess` succeeds for H and A and that no expansion-only tower has a flight above 18 risers. | The compact H/A 6.5 m lobby keeps its 20 risers (FPS hash); recorded in HANDOFF. |
| **lift fields** | `e.speed` (m/s, read as `e.speed ?? 3.5`); `e.role` (`private-w`, `private-e`, `fire`, `fire-service`, `passenger`, `residence`, `shuttle`, `hotel`, `service-fire`); `e.zone` (`low` / `high` / null); `e.card` (`resident` / `room-key` / null); `e.serves` (normal-mode door levels), `e.shaftLevels` (every level the shaft passes, existing) and **`e.fireOnly`** (levels with a landing door used only in fire mode, C-3). `corePlan.lifts[i].landing = e.serves.includes(lv.id) \|\| e.fireOnly?.includes(lv.id)`. `buildNav(L)` links `serves`; `buildNav(L, { gates: 'open' })` links `serves` + `fireOnly`. `LIFT_ROLES` in the contract extends to match. | `elevator-shafts.js` already handles pass levels for P1. |
| **ride time** (`elevator-ride.js`) | `travel = max(1.2, Δy / (2 × (e.speed ?? 3.5)))`. With the default speed this equals today's `Δy / 7`, so `elevator-ride.test.js` stays green. The ride exposes `realSeconds = run(Δy, speed)` for the HUD. | |
| **zones as data** (`src/layout/zones.js`, new) | `b.zones = [{ id, name, from, to, kind: 'basement' \| 'lobby' \| 'band' \| 'refuge' \| 'amenity' \| 'podium' \| 'roof', lifts: [ids], homes }]` and `lv.zone`. `towerZones(b, levels)` derives a default from level kinds for towers without explicit bands. **Expansion layout only.** | Feeds the rail, directory, keypad and search. |
| **hardstands** (`src/layout/hardstand.js`, new) | `hardstandRecord({ id, building, rect, face, label: '消防登高场地' })` → `site.fireAccess`. `hardstandErrors(rec, building, site)`: ≥ 20 × 10; near edge 5–10 m off the façade; covers the long side; no tree, planter, trench, ramp or parking stall inside it or between it and the façade. It reads both `site.fireAccess` and `site.westGarden.hardstands`. | `site.fireAccess` holds HS1 / HS2 today. 西苑's HS-W1 / W2 live in `site.westGarden.hardstands` and stay there (C-23). |
| **gates** | `gateRecord({ …, releaseOnAlarm = true, role = 'entry', leaf = 'own' })`; sign sub-text `火灾时自动释放`. **`role: 'exit'`** = an exit-only door: the stair or terrace is the v > 0 side, so `GATE.exitSensor` gives free egress and the reader is outside. **`role: 'reentry'`** = a stair re-entry door: the floor is the v > 0 side (free into the stair), and the reader is on the stair side. `leaf: 'existing'` means the gate sits in an existing stair or fire-door opening, so the render draws the reader and the sign but no glass leaf. `kind` stays `'glass-door'`, and `gateRecordErrors` adds the role / leaf checks. `stairReentryGates(stair, levels, zoneOf)` emits the re-entry doors. `zoneRecord` is unchanged (one floor each). `accessControl` exists only in the expansion layout, so these fields never reach the compact JSON. | GB 55037 §7.1.7 ✔ |
| **refuge rooms** | `community-units.js` `doorLeaves()`: the door of `residence.refugeRoom` gets `fire: '乙级'`. `community-plan.js`: `pickRefugeRoom(residence, face)` + a `validateHome` check (exists, is a bedroom or study, on an external wall with a window); `planKey()` export; `DUPLEX_STAIR.rise` as a parameter (3.3 default); a `variantExtras` program flag (default off). | No data regeneration in P0a. |
| **R penthouse hooks** (C-15, C-16) | `generateDuplex(spec, { wing: { w, d, exteriorEdges, rise } })`: absent `wing` = today's code path (west / north output byte-identical, tested by hash). `community-units.js` exports `buildDuplexUnits(spec, frame)` for non-community callers. P0a also runs the **penthouse spike** on both R wing specs and records the result in `docs/supertall/p0a.md`. | P-R is the only caller. |
| **plan data split** | `community-plan-data.js` becomes a re-export shim over `community-plan-data-north.js` + `community-plan-data-west.js` (byte-identical content). `scripts/prepare-community-plans.mjs` becomes a driver over `scripts/plans/{north,west}.mjs` (move-only) with `--community north\|west\|r`. | So P-north and P-west never touch the same generated file. |
| **site split** | `community-sites.js` re-exports `north-site.js` and `west-site.js` (move-only). | Same reason. |
| **supertall dispatch** | `hospitality.js`: `const st = expansion ? (supertallResidential(t) ?? supertallTower(t)) : null; parts.push(st ?? tower(t))`. Supertall parts return `{ …part, access, fireAccess }`, collected into `access` and `site.fireAccess`. `src/layout/r-supertall.js` and `src/layout/hospitality-supertall.js` are created as stubs returning `null`. Region markers `// <supertall:R>` … `// </supertall:R>` and `// <supertall:HA>` mark the only lines of `hospitality.js` that P-R and P-HA may edit (the R garage / arrival section; the hotel surface-parking section). P0a also adds an expansion-only **`supertallSitePass(layout)`** hook, called once at the end of `buildLayout({ expansion: true })`, with a `// <supertall:HA>` stub. P-HA uses it to tag the 20 west-lot `酒店短停` bays (stall `type` stays, `hotelShortStay: true` is added). | The compact path is untouched (fps-frozen). |
| **nav plan sharing** (`nav.js`) | Before `indexWalls`, hash each floor's walls and obstacles (1 mm rounding, gate flag included) and verify element-wise; matches share `walls`, `obstacles` and `grid`. Optional `lv.navPlan` key (the render module key) skips wall building for repeats. | perf.md §6.1: nav heap 80.8 → 23.5 MB at the decided heights. |
| **`floorLabel`** (`nav.js`) | Names the refuge zones from `lv.refugePlan.areas`: `云澜·北苑 1 号楼 · 24F 避难层（避难区）`, `R1 · 14F 避难层 · 避难区`. Also the sky lobby and public floors from `lv.amenityPlan` / `lobbyPlan` names. | |
| **campus deltas** (tests) | `tests/campus-deltas/{base,north,west,r,ha}.js`. Each exports `{ levels, lifts, records, homes, west, north, gates, zones, residenceAccess, hardstands, compactIdentical }`; `index.js` sums them. `hardstands` lists `[id, building]` pairs (C-7). `index.js` also exports **`COMPACT_IDENTICAL`** = `['P2', 'P3', 'H', 'A', 'R1', 'R2', 'R3', 'R4']` minus every package's `compactIdentical.remove` (C-6). `riverside-integration.test.js` (counts, `site.fireAccess`), `residence-access.test.js`, `suite-nav.test.js` and `p1-expansion-layout.test.js` read the sum. | Each package edits only its own delta file, so pins never conflict. |

The deltas the packages will set (`spec-calc/final2.out`):

| file | levels | lifts | records | homes | west | north | gates | zones | residenceAccess (H+A+R records) | hardstands | compactIdentical.remove |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `base.js` (today) | 338 | 76 | 1,066 | 1,046 | 270 | 48 | 16 | 14 | 728 | 2 (HS1, HS2) | — |
| `north.js` | +20 | +2 | +32 | +30 | | +30 | +4 | +4 | | | |
| `west.js` | +38 | +6 | +170 | +170 | +170 | | | | | | |
| `r.js` | +78 | +8 | +8 | 0 | | | +20 | +12 | +8 | +4 | R1–R4 |
| `ha.js` | +52 | +16 | +244 | +244 | | | +52 | +29 | +244 | +2 | H, A |
| **sum** | **526** | **108** | **1,520** | **1,490** | **440** | **78** | **92** | **59** | **980** | **8** | P2, P3 stay |

- Gates: 北苑 = 2 RF terrace doors per tower. R = 3 lobby gates + 2 stair exit doors per tower (zones 3). H = 3 lobby gates + 44 re-entry doors (zones 3 + 22 floors). A = 4 gates + 1 exit door (zones 4).
- With the C-16 fallback, `r.js` records become 0: records 1,512 and residenceAccess 972.

**Rule for shared builders (C-13).** `lift()` in `mall.js` is shared by the mall, `tower()` and `northTower()`; `towerStairPlan` / `buildTowerStairAccess` and `gateRecord` are shared too. The fields `speed`, `role`, `zone`, `card`, `fireOnly`, `breakLevels`, `maxRisers`, `releaseOnAlarm`, gate `role` / `leaf`, `refugeRoom` and `lv.zone` are **never written by a shared builder that the compact layout calls**. Readers use defaults (`e.speed ?? 3.5`, `stair.breakLevels ?? []`, `stair.maxRisers` undefined = today). Only expansion-only builders write them: `northTower()`, the 西苑 builder, `supertallResidential()`, `supertallTower()` and the access records, which exist only in the expansion layout.

### 2.2 Render engine (package P0b)

| item | contract | notes |
|---|---|---|
| **`src/render/build/far-lod.js`** (new) | `farSwap(b, top, near, far, { radius = 600, hysteresis = .05 })` (moved from `community.js`) and `farStandIn(B, b, spec)`. `spec = { faces: [{ edge, bands: [{ y0, y1, kind: 'glass' \| 'spandrel' \| 'louvre' \| 'stone' }] }], crown: [{ rect, y0, y1 }], extras }`. 2 meshes (`facadePlaster` + `facadeWindow`) by day. **Night layer (C-9)**: a third mesh per far tower in the existing `facadeWindowLit` material (no new shader program), built from `spec.night = { windows, crownEdges, aviation }`. It holds vertex-coloured lit-window strips (per-floor hashed, refuge bands dark), the crown edge lines and the red aviation points. `onNight` toggles its `visible`, so daytime calls are unchanged and night views add one call per far tower. A campus-wide merged far-lit mesh was rejected: it could not follow each tower's own near / far swap without a custom shader. The shadow pass reuses the main camera's choice. | **M1**: applied in P0b to all ten towers with today's builders. Each tower package later supplies its own spec. Today every tall tower is beyond 600 m in `OVERVIEW` and the 园区 tour steps (R1 ≈ 896 m, H 856, A 907, T1 994, W1 1,089), and today's far stand-ins have no night emissive. Without this layer, the night skyline would be ten dark towers. |
| **near-branch groups** | The R/H/A 1F lobby and RF garden groups join the near branch. R/H/A lift cars draw only for their own tower (the `towerVisibility` "mine" rule, extended by one condition). | perf.md M1 |
| **`src/render/build/facade-modules.js`** (new) | `moduleSet(ctx, b, plane)`: `.build(key, fn(B))` builds one floor's direct geometry into its own `BatchSet`; `.instance(key, levels)` puts one `InstancedMesh` per output material with matrix = tower frame × `elev`; `.hide(levelId)` / `.show(levelId)` set a zero-scale matrix and restore it; `.meshes`. **Black-instance rule**: geometry must come from `BatchSet.flush` (it writes `color`); primitive geometry gets a `vertexColors = false` clone with `color`. Each tower clones materials with its own `clippingPlanes`. | **M0**: applied in P0b to today's R per-storey shells (`residential-shell.js`, 116 clone meshes → one `InstancedMesh` per material per tower). Then 西苑 modules and R templates use it. |
| **`src/render/build/curtain-wall.js`** (new) | `curtainWall(B, edges, { levels, module, finEvery, spandrel, chamfer, skip })`: mullions and vision glass merged vertically, a spandrel per storey. Also `louvreBand(B, edge, y0, y1, { blades, fireWindows })`, `rescueMarks(B, edge, levels, spans)`, `crownFins(B, edges, y0, heights)`, `aviationLights(B, points)` (glowSoft, night only), `belt(B, edge, y0, y1, diagonals)`. | Used by 北苑 and H/A; `louvreBand`, `rescueMarks` and `aviationLights` by all. |
| **`src/render/build/refuge-floor.js`** (new) | `buildRefugeFloor(ctx, L)` from `lv.refugePlan`: tank / pump / fan boxes, hydrant cabinets, signs, the 避难区 floor finish, louvre backs, the fire-lift door. ≤ 3k v, one group, built lazily through the floor LRU. | |
| **community render split** | `src/render/build/community.js` keeps the dispatcher, lobby, basement, `landingDoors` and **`liftShaft()`**, the function that draws `landing: false` as a blank wall (l. 224–235; P0b owns it, C-15). `community-north.js` and `community-west.js` take the per-community exteriors (move-only, identical output). | So P-north and P-west never edit the same render file. |
| **residence-interiors** | Fire-door finish (乙级 colour, closer, signage) on `fire: '乙级'` leaves. Any two-level residence is drawn from its plan data whatever its community, so the R penthouses need no edit here (C-15). | P-north later adds its moved façade inner detail. |
| **stairs / lifts / cores** | `tower-stairs.js` draws the second door and the partition at break levels, and the extra mid-storey landings of multi-loop storeys (C-1). `tower-elevators.js` draws closed-shaft cars instanced per tower, visible only when the tower is entered, focused or ridden, sized from the record (北苑 cabins 1.1 m wide, centred, C-4). `residential-cores.js` and `liftShaft()` read the shaft count and widths from records (K4 needs 4) and draw `landing: false` as a blank wall; a `fireOnly` landing gets a door with a `消防专用` plate. **`elevators.js` (C-14)**: `buildElevators()` draws its per-stop glass panes, posts, rings and sills only for `e.type === 'glass' \|\| e.exterior`. Closed tower shafts are already drawn by the core renderers and their cars by `tower-elevators.js`. Before removing them, P0b checks in one cutaway shot per tower type that the landing sill and door frame are still drawn by the core renderer. A type that relies on `buildElevators` keeps one sill box per stop (≈ 24 vertices instead of ≈ 470). | Today's 646 tower stops cost ≈ 5.5 MB (estimate: 470 v × 18 B); the decided 1,889 would cost ≈ 16 MB. After the skip, ≈ 0. |
| **`access-gates.js`** | Draws the gate `role` / `leaf` variants: `leaf: 'existing'` draws only the reader on the card side and the sign (`住户楼层 · 刷卡进入` for re-entry; `仅供疏散 · 外侧刷卡` for exit). | It was "record-driven, nobody"; P0b now owns this one change (C-3). |
| **fixtures** (C-15) | P0b's tests for the refuge rows, the refuge-free passenger keypad, `refuge-floor.js` (from `lv.refugePlan`), the second stair door (from `breakLevels`) and the zone rail run on **synthetic fixtures** with the §2.1 shapes (`tests/fixtures/supertall-records.js`). The rail reads `b.zones ?? railZonesFallback(b, levels)`. At the P0 merge, P0b switches the import to P0a's `towerZones()` in the merge commit. The real-data checks of those items sit in each tower package's tests. | P0b never waits for P0a, and never tests P0a's code through its own fixtures. |
| **`app.js`** | (a) `ensureTowerFloor` builds when `lv.units.some(residence) \|\| lv.kind === 'refuge' \|\| lv.lobbyPlan \|\| lv.amenityPlan`. (b) Pass-floor interior builds only for `e.exterior \|\| e.type === 'glass'`; closed shafts prebuild only the destination. (c) Pick boxes `matrixAutoUpdate = false`; level groups auto-update only while the exploded view animates. (d) Core and refuge pick texts come from layout data (`b.coreCard`, `lv.pickText`). (e) Overview shadow r 380 → 410. | perf.md §6.3–6.4 |
| **`explore.js`** | Lift keypad (§3.2). | |
| **`floor-rows.js` / `ui.js`** | Zone rail and directory (§3.1). `towerSub` comes from data ('20层酒店' / '30层住宅' are removed). | Builds on the podium row and scrolling. |
| **`perf/measure.cjs`** | Adds the views campusTall (149, 641, 648) → (0, 60, 0) and river (−60, 40, −600) → (−40, 90, −220), plus P1-RF viewdeck, P2 roof and the 西苑 tour step. Keeps campus for comparability with `dc4951d`. | |

### 2.3 Perf: the order of work and the budgets

**Order.**
1. **M0 + M1 (P0b) land first.** At the decided heights they were measured at campus main 2,817 → 1,921 calls, triangles 3.75 → 2.51 M and shadow refresh 1,351 → 730.
2. **M2**: each tower package's own builder (curtain wall / instanced modules / templates). Each must land with its layout, not later: M0 removes calls, not bytes.
3. **M3**: the R mid tier, in P-R.

**Budgets.** No campus budget is raised; new caps go where tall towers bite.

| budget | rule today | `dc4951d` | HEAD | M0 + M1 at decided heights (measured) | final (projected ±25 %) | **rule after this work** | why |
|---|---|---:|---:|---:|---:|---|---|
| campus steady calls (+ labels) | ≤ `dc4951d` + 50 = **2,916** | 2,866 | 2,852 (`perf/RESULT.md` has 2,907: the main pass agrees, the label count differs by 55) | 1,954 | ≈ 1,965 (+ 10 at night: the far-lit layer) | **keep 2,916; ratchet ≤ 2,200 once P0b lands.** P0b first re-measures campus steady, labels included, at `9bdb886`. If the re-measured M0 + M1 figure is above 2,000, the ratchet is that figure + 200 (C-31) | Keeps the freed ≈ 900 calls for phones (the `low` tier keeps every call). |
| campus main triangles | ≤ +0.40 M = **4.07 M** | 3.672 M | 3.752 M | 2.515 M | ≈ 2.52 M | keep | |
| scene geometry at load | ≤ +15 MB = **286.8 MB** | 271.8 | 284.7 | 300.8 ✗ (naive H/A/R/北苑) | ≈ 264 (perf.md kept today's lift counts; the C-14 skip removes ≈ 5.5 MB more, est.) | keep; **every tower package must lower its own towers' bytes** | Bytes are the phone risk. |
| community resident (`community-render.test.js`, 18 B/v) | ≤ **10 MB** | — | 9.94 | 8.69 | ≈ 5.2 (西苑 ≈ 2.9, 北苑 ≈ 1.45, site 0.87) | keep 10 MB | |
| **new**: ten tall towers' unique exterior (Node) | — | — | 28.8 MB | 40.6 MB | ≈ 10.8 MB | **≤ 14 MB** | Catches a tower that skips its M2 builder. |
| **new**: every measured view (campus, campusTall, river, N1, R1, P1-RF viewdeck, P2 roof, 西苑 step) | — | — | — | river 4.443 M ✗ | river ≈ 3.0 M with the R mid tier (≈ 3.87 M without) | **each ≤ 2,916 steady calls and ≤ 4.07 M main triangles** | Near views are where tall towers bite. |
| **new**: frame with shadow refresh | — | 4,185 | 4,203 | 2,684 | ≈ 2,700 | ≤ 4,203 | |
| **new**: JS heap at load (Chromium) | — | — | 518 MB | 578 MB ✗ | ≈ 540 MB | **≤ 560 MB** | iOS tab kill ≈ 1–1.5 GB. |
| **new**: nav build (Node) | — | — | 0.65–1.08 s / 50.7 MB | 23.5 MB with sharing | ≈ 1.0 s / ≈ 22 MB | **≤ 1.5 s CPU, ≤ 40 MB retained** | Unshared, the decided stack is 80.8 MB. |
| **new**: shader programs | — | — | 61 | 67 | ≈ 67–69 | **≤ 70** | Each is a first-draw compile hitch on phones. |
| far LOD per tower | ≤ 2 meshes, ≤ 1,500 triangles (西苑 test) | | | | | **≤ 2 meshes by day, + 1 night layer ≤ 600 triangles; ≤ 2,000 triangles, all ten; 西苑 keeps 1,500**; silhouette within 0.5 m including the crown | C-9 |
| **new**: closed-shaft glass from `buildElevators` (Node) | — | | ≈ 5.5 MB (est.) | | ≈ 0 | **≤ 0.5 MB campus-wide** (sills only) | C-14: unbudgeted otherwise (≈ 16 MB at the decided stops) |
| **new**: R mid LOD | — | | | | | ≤ 3 meshes, ≤ 8k triangles | |
| **new**: near exterior per tower | — | | W/T 8, R 129, H/A 18 meshes | | | **≤ 45 meshes** (北苑, H, A ≤ 8; 西苑 ≤ 36; R ≤ 45) | |
| plan data | one file ≤ 600 kB | | 514.5 kB | | north ≈ 680, west ≈ 140, R PH ≈ 110 kB | **north ≤ 800, west ≤ 250, R PH ≤ 200 kB** | The split files (§2.1). |
| `dist/mall.html` | — | | 79.69 MB | 79.70 MB | ≈ 80.1 MB | **≤ 81 MB** | |
| full test suite (concurrency 3) | ≈ 4–5 min | | 236 s | | ≈ 250–256 s | **≤ 300 s** | Walk tests sample floors (B-levels, 1F, every refuge floor, first and last of each zone, RF). |

Projected layout cost: levels 338 → 526; layout heap 41 → ≈ 54 MB; `buildLayout` ≈ unchanged (2.6–3.6 s CPU; the mall and garages dominate); `buildNav` ≈ 1.0 s with sharing.

### 2.4 Per-frame and ride costs

- `updateMatrixWorld`: 1.92 → 0.43 ms per frame with static matrices (P0b).
- `linksNear` is indexed by floor (14.7 → < 2 µs).
- Lift rides through 50 floors build no pass-floor interiors in closed shafts. That would otherwise be ≈ 3 synchronous builds per second for 18 s.

---

## 3. UX

### 3.1 Floor rail and directory (`floor-rows.js`, `ui.js`; P0b)

- **Zones as data**: rows come from `b.zones`, top-down. Headers show the range and the home count. The focused floor's zone is expanded; the others are collapsed.
  - R1: ≈ 11 headers + ≤ 12 floors ≈ 23 rows, against 56.
- **Refuge rows**: hatched grey chip, labelled `避难层 · 设备层`, selectable. Passenger-lift landings show as not stopping.
- **Kept from the parallel workflow**: the `1–6F 一期商场 · 住户电梯直达 7F` podium row and scroll-to-bottom when nothing is focused. After a selection or ride, `scrollIntoView({ block: 'nearest' })`.
- **Chip strip** above the rows, generated from the zones (地下 · 低 · 中 · 高 · 顶 · 避). `[` / `]` or PageUp / PageDown step a floor in orbit mode.
- **Search box** `楼层 / 房号`: `37` / `37F` focuses the level; `3702` / `R1-3702` focuses and selects the home; `避难` lists the refuge floors.
- **Phone**: a zone-chip row plus the selected zone's floors, or a `选择楼层` bottom sheet (5-column grid + search).
- **Directory**: the same zone groups as collapsible `dir-group` rows (`中区 15–26F · 24 户`). The facts row shows `电梯` by bank, `避难层 n` and `最高 xxx m`. Level matches rank first.

Zones per tower (top → bottom):

| tower | zones |
|---|---|
| T1 (T2) | RF 屋顶 · 私家露台（刷卡） · 顶层复式 34–35F (32–33F) · 云端大平层 25–33F (25–31F) · 24F 避难层 · 设备层 · 错层复式 14–23F · 江景大平层 8–13F (10F 避难层 within) · 7F 空中大堂 · 1–6F 一期商场 (podium row) |
| W1 / W2 | RF 屋顶花园 · 高区 C 32–47F · H1 H2 F2 · 31F 避难层 · 高低区转换 · 低区 B 17–30F · L1 L2 F1 · 16F 避难层 · 低区 A 2–15F · 1F 社区大堂 · B1 / B2 住户电梯厅 |
| R1 (R2–R4 to their tops) | RF 屋顶设备层 · 顶层复式 52–53F · 云端 S 41–51F · 40F 避难层 · 伸臂桁架 · 高区 H 28–39F · 27F 避难层 · 伸臂桁架 · 中区 M 15–26F · 14F 避难层 · 低区 L 2–13F · 1F 大堂 · B1 / B2 |
| H | RF · 停机坪（仅观赏） · 48F 云端餐厅 · 酒吧 · 47F 云境水疗 · 泳池 · 酒店客房 28–46F (37F 避难层 within; 行政楼层 at the top of it) · 27F 空中大堂 · 26F 避难层 · 设备层 · 云澜酒店公寓 3–25F (13F 避难层 within) · 2F 会议中心 · 1F 落客大堂 · 住户大堂 · B1 / B2 |
| A | RF · 直升机救助 · 顶层空中会所 44F · LOFT 40–43F · 39F 避难层 · 服务公寓 3–38F (13F / 26F 避难层 within) · 2F 住客会所 · 1F 迎宾大堂 · B1 / B2 |

### 3.2 Lift panel, ride and HUD (`explore.js`, `elevator-ride.js`; P0a + P0b)

- **Keypad (COP)** replaces the flat list when a lift has more than 9 stops:
  - a grid of floor buttons, 6 columns on desktop and 5 on phones, each ≥ 44 px;
  - one keypad per bank, with the bank name in the header (`高区 · H1 H2 F2 · 32–47F · 不停 2–30F`);
  - zone sub-headers; the current floor highlighted;
  - **refuge floors appear only on fire-lift keypads**; passenger keypads have no button for floors they pass.
  - **Refuge buttons read `避难层 · 消防/检修专用` with a key icon (C-29).** In normal mode pressing one asks for a confirm (`使用消防员钥匙？`), and fire mode unlocks them. The floors stay visitable in the game, as in a real building with a fire-service key.
  - **`fireOnly` landings** (H S1 on 2F, 26F–48F and RF) show greyed with `消防专用` and cannot be pressed until fire mode.
  - The longest is R1-LF with 56 stops.
- **Keyboard**: digits buffer for 1 s, then Enter goes and Backspace deletes; ↑ / ↓ move; E / Esc close. With ≤ 9 stops, keys 1–9 work as today.
- **Card text** on residential keypads: `刷卡乘梯 · 仅可到达本户楼层` (cosmetic; the game does not restrict floors). On HL: `房卡梯控 28–46F · 27F / 47F / 48F 公共`.
- **Ride**: `Δy / (2 × speed)`; the HUD reads `上行 · 32F · 实际约 37 秒`; **Space** skips to arrival. Examples:

  | ride | real | in game |
  |---|---:|---:|
  | R1-LF 1F → 53F | 42.8 s | 18.3 s |
  | 西苑 H1 1F → 47F | ≈ 40 s | 17.8 s |
  | 北苑 LW 1F → 34F | 38.2 s | 16.8 s |
  | H: SH 1F → 27F, then HL 27F → 48F | | 8.3 s + 10 s |

### 3.3 Tour (`tour.js`; P-int)

**Re-frames** (perf.md §7.5, numerically solved at the decided heights; the acceptance is the framing test: crown and label NDC y ≤ 0.9 at aspect 1.6 and 0.46).

| step | today | new |
|---|---|---|
| 园区 (first) | (150, 300, 330) → (0, 0, 0) | (255, 565, 561) → (0, 55, 0) |
| 北苑 | (−150, 115, −380) → (−236, 55, −232) | (−120, 171, −432) → (−236, 90, −232); caption `云澜·北苑 · 约 150 米江景双塔（10F / 24F 避难层 · 顶层复式）` |
| 西苑 | (−315, 105, −335) → (−425, 42, −236) | (−238, 194, −404) → (−425, 87, −236), shadow 260; caption `云澜·西苑 · 3梯5户 · 47 层（避难层 16F / 31F · 高低区电梯）` |
| 云澜江 · 星湾桥 | (120, 46, −560) → (−120, 14, −300) | (192, 116, −638) → (−120, 74, −300), shadow r 360 |
| 对岸看江景 (eye level) | (−196, 1.7, −446) → (−215, 30, −245) | same eye; target y 70 |
| 园区全景 (last) | (110, 430, 480) → (0, 0, 0) | (127, 545, 552) → (0, 50, 0) |

**New steps (4).** The sky-lobby steps stay before the 1F gate steps (skylobby SPEC §12 order rule).
1. `云澜酒店 · 约 200 米超高层（空中大堂 · 云端酒吧 · 停机坪）· 酒店客房 144 间 · 酒店公寓 176 套` (C-12): building H, pos ≈ V(−100, 160, 125), target V(−251, 110, −78), dur 6, shadow 300. It goes after the 一期 main-entrance segment.
2. `云澜酒店 27F 空中大堂 · 办理入住`: building H, focus `H-27F`, eye at ≈ 101 m in the E wing looking W along the gallery, dur 5.
3. `云澜汇楼盘 · 四塔错落江景双户（R1 200 m）`: from the P2 roof, V(150, 75, −120) → V(150, 110, −218), shadow 220.
4. `R1 27F 避难层 · 伸臂桁架`: building R1, focus `R1-27F`, a cutaway onto the belt diagonals and the 避难区 signs.

The caption list in `riverside-integration.test.js` is updated once (P-int).

### 3.4 Camera, shadows, labels

- `OVERVIEW` (125, 480, 590) → (−90, 30, −35) is **unchanged**: crowns land at NDC y ≤ 0.74 on desktop and ≤ 0.63 on phones.
- `maxDistance`, `minDistance` and `maxPolarAngle` are unchanged. `buildingView(bid)` already scales with height: a 200 m tower is framed from ≈ 360 m and draws near.
- Shadows: overview r 410; 园区 steps focus (−60, 0, −90) at r 400; river step r 360 (default 6). Height itself adds no frustum miss.
- Fog stays `Fog(900, 3000)`. Never use fog to hide LOD: it greys the staggered skyline.
- Labels: building titles at RF + 26 m follow automatically (H 211.4, R1 212.7, W 171.5). `towerOccluders` grows with the towers; that is correct behaviour.
- **Night**: `OVERVIEW` and the 园区 tour steps see every tall tower beyond the 600 m far radius, so their night look comes from the far night layer (§2.2, C-9): lit windows, dark refuge bands, lit crown edges and red aviation lights.
- **Sun**: the game sun is fixed from the south-west (`env.js` `sunDir` (−0.55, 0.78, 0.62)), so shadows fall to the north-east. H shades the P1 roof at x ≈ −190…−96; 北苑, the 方庭 roof and the 方庭 stay sunlit; R and 北苑 shade the river, whose water receives shadows. Real-world winter-sun figures (risk 17) stay in the docs (C-38).

### 3.5 Pick cards and HUD text (data-driven, P0b mechanism; text set by each package)

- Core cards:
  - 北苑 `住户电梯 W / E · 消防电梯 ×2（含服务梯）· 一梯一户`;
  - 西苑 `低区梯 L1 L2 F1 · 高区梯 H1 H2 F2 · 3梯5户`;
  - R `客梯 ×3 · 消防梯 ×1 · 三梯两户`;
  - H `酒店穿梭梯 ×3 · 酒店客梯 ×4 · 公寓客梯 ×4 · 消防/服务梯 ×2`;
  - A `公寓客梯 ×5 · 消防/服务梯 ×2`.
- Refuge floors: `24F 避难层 · 设备层 · 加强层 · 仅消防电梯停靠`. The 避难区 card lists the hydrant, phone, PA and signs.
- 超限 note on the tower card: `超高层 · 超限高层抗震专项审查 · 剪力墙（北苑 / 西苑）／ 型钢混凝土框架-核心筒（R / H / A）`.
- H 1F arrival hall: `办理入住请乘穿梭梯至 27F 空中大堂`.
- H tower card: `酒店客房 144 间 · 酒店公寓 176 套`; helideck: `停机坪 · 救援专用 · 不对访客开放`; public floors: `本层限 300 人`.
- Stair doors: `住户楼层 · 刷卡进入 · 火灾时自动释放` (H re-entry), `仅供疏散 · 外侧刷卡` (exit doors).
- 北苑 lift card: `住户电梯 1,050 kg · 担架梯 · 4 m/s`.
- H / A fire-road note on the tower card: `消防车道：单长边（场地条件，个案审批）`.

---

## 4. Tests: new tests and every pin that changes

| file | owner | today | after |
|---|---|---|---|
| `fps-frozen.test.js` | nobody | hash | **unchanged; every package runs it** |
| `riverside-integration.test.js` | P0a (deltas) → P-int (captions) | 338 · 76 · 106 · 664 · 1,066 / 1,046 · [270, 48] · [16, 14] | from `campus-deltas`: **526 · 108 · 106 · 664 · 1,520 / 1,490 · [440, 78] · [92, 59]**; l. 63–65 `site.fireAccess` deep-equals the deltas' `hardstands` sum (8 pairs, C-7); tour captions + 4 steps |
| `north-residences.test.js` | P-north | `top ≤ 100`; levels 19; LW / LE lists; 8F–24F two homes per floor; 24 / 34 / 24; `uppers` 20 | RF ≤ 150 (140.7 / 132.9), crown ≤ 160; levels 30 / 28; `checkRefugeStack` clean; stops LW 25 / 23, LE 26 / 24, LF = LS 33 / 31, roles `['private-w', 'fire', 'fire-service', 'private-e']`, cars 1.1 × 2.1 m and LW / LE `speed` 4 (C-4), private lifts stop on every floor with that side's 户门 and nowhere else (C-19), none on 10F / 24F; F lobby net ≥ 12.0 m² (C-18); RF terrace gates exit-only; every home floor 2 homes, refuge floors 0; homes 41 / 37, level units 52 / 48, distinct = homes, interlocked 9, `uppers` 22; stair walk crosses each 避难区 |
| `sky-lobby.test.js` | P-north | near `['T1-LE', −257.3, 'T1-10F']`, far `['T1-LW', −262.7, 'T1-16F']`, T2 −214.7 / −209.3 with `T2-10F`; 16 options | x → T1 −257.0 / −263.0, T2 −215.0 / −209.0; `T?-10F` → `T?-11F`; options from 7F: T1-LW 24, T1-LE 25, T2-LW 22, T2-LE 23 |
| `community-contract.test.js` | P0a (refuge case) → P-north | `NORTH_SITE.levels.length` 19; `.at(-1).elev` 96.9 | 30; 140.7; mutation list gains a refuge level |
| `community-doors.test.js` | P-north | `T1-10F`, `T1-16F`, `T1-17F`, `T2-20F` | `T1-10F` → `T1-11F`; the rest kept; the refuge-room leaf is `fire: '乙级'` |
| `community-plans.test.js` → split by P0a into `community-plans-north.test.js` / `-west.test.js` | P-north / P-west | 68 north level plans; 24 per tower; 34 parts; hash; ≤ 600 kB; west 10 / 5 per tower | north **100** level plans; 41 / 37 homes; two-level 11 / 11; parts 52 / 48; `perFloor` keys = every home floor (T1 26, T2 24); new hash; spot regen `T1-8W` + `T1-25W` from the recorded `spec`; ≤ 800 kB. West **30** plans, 15 per tower, 5 distinct per floor per family; ≤ 250 kB. Both: every home has one valid `refugeRoom` |
| `community-render.test.js` | P0b (moves north / west cases out) | ≤ 8 calls; 西苑 ≤ 16 / 170k; ≤ 10 MB; west far ≤ 1,500; `T1-10F` furniture | shared cases only: ≤ 10 MB (unchanged cap) |
| `north-render.test.js` | P-north | gate floors ≤ 6 | + ≤ 8 meshes; T1 ≤ 40k, T2 ≤ 36k exterior vertices; far LOD ≤ 2 meshes ≤ 1,500 triangles by day + the night layer, silhouette within 0.5 m incl. the crown; a ray through 24F hits a louvre; `T1-11F` furniture; P1 structural-wall pieces clear every shop door (C-37); two rescue panels on 7F (C-34) |
| `west-render.test.js` (new, by P0b's move) | P-west | — | near ≤ 36 meshes per tower; both ≤ 140k triangles; far ≤ 1,500 by day + the night layer; every `InstancedMesh` with `vertexColors` has `color`; one instance hidden after hiding the detail floor |
| `west-garden.test.js` | P-west | 3 lifts; 31 levels; B2…28F, RF; RF 85.5; 28F 82.5; 27 / 135 / 10 / 270; 60 routes | 6 lifts, each home floor served by exactly 3; refuge floors by fire lifts only; high bank ordered F2 · H2 · H1 and lobby ≥ 3.5 m (C-21); every floor of every family has a 2BR, 3BR and 4BR (C-10); 1F stair doors inside `Wn-1F`; 50 levels; RF 145.5; 47F 142.5; 44 / 220 / 30 / 440; 98 routes through the 分隔 doors; contract accepts `refuge` |
| `label-declutter.test.js` | P-west | title at 111.5 | 171.5 |
| `hospitality.test.js` | P0a | expansion + compact mixed | restricted to the **compact** layout (FPS truth; values unchanged: 20 floors, 10 per floor, 30-storey R, 728, 12 tower lifts); expansion pins move to the new files below |
| `r-supertall.test.js` (new; P0a stub → P-R) | P-R | — | stacks 53 / 50 / 47 / 44; RF 186.7 / 176.5 / 166.3 / 156.1, crown 200.0 / 189.8 / 179.6 / 169.4; `checkRefugeStack` clean; 2 units per home floor, W ∈ {01, 03}, E = 02; 0 on 14 / 27 / 40; PH on the top two; homes 96 / 90 / 84 / 78 (records 98 / 92 / 86 / 80); LF serves every level (56 / 53 / 50 / 47), L1–L3 **51 / 48 / 45 / 42** with the refuge floors and the penthouse upper level in `shaftLevels` (C-35); LF run ≤ 60 s; **ST1 + LF 合用前室 ≥ 6 m² and ST2 独立前室 ≥ 4.5 m², no door between them** (C-20); 1F split; stair flights ≤ 18 risers; band never covers a kitchen window; gates `Rn-1F/B1/B2-GATE` and exit doors `Rn-ST1/ST2-EXIT` pass `gateRecordErrors` and release; B1 arrival aisle has ≥ 2.2 m headroom everywhere (C-8); B2 ramp clear of the core (C-27) |
| `r-hardstand.test.js` (new) | P-R | — | `hardstandErrors` clean for HS-R1…R4; touches the loop; no planter / tree / trench |
| `r-render.test.js` (new; P0b M0 → P-R) | P0b → P-R | — | P0b: R shells instanced, black-instance rule, hide one instance. P-R: near ≤ 45 meshes; R unique ≤ 5 MB; mid ≤ 3 meshes ≤ 8k; far ≤ 2 ≤ 1,500 by day + the night layer, silhouette within 0.5 m |
| `residential-integration.test.js` | P-R | 348 homes, 87 per tower, `storeys 30`, `height 103.4`, routes on 2F / 30F, plate pieces | 348 (96 / 90 / 84 / 78); storeys 53 / 50 / 47 / 44; height 186.7 / 176.5 / 166.3 / 156.1; routes home → band → L1–L3 + 前室 → ST1 / ST2 / LF on 2F, 15F, 28F, 41F and the PH floor; new plate pieces; garage aisles clear the core |
| `hospitality-supertall.test.js` (new) | P-HA | — | tower ≥ 13 m from P1 and ≥ 9 m from the annexes above 2F (A's 13.21 locked); `checkRefugeStack`; 26F ≥ 12.0 m stacked-shaft budget; RB and HL share no stop; S1 has a landing door on every level (26 normal + 25 `fireOnly`), S2 its zone + refuge floors; passenger lifts sealed on refuge floors; fire runs ≤ 60 s; roof structures summed from real footprints ≤ 528 / 525 m² (C-33); H 320 = 176 + 144, A 304 = 272 + 32; `buildTowerStairAccess` succeeds for H and A, ST1 / ST2 ≥ 9.6 m deep, flights ≤ 18 risers (C-1); the farthest suite door ≤ 18.75 m (hotel) / ≤ 25 m (公寓) from a 前室 door; public-floor occupant cap ≤ 300 and ≤ the stairs' 320 (C-25); S1 `fireOnly` exactly 2F · 26F–48F · RF; the basement cross aisle, ramps and lift lobbies clear the core walls, and ramp slopes ≤ 15 % (C-2); gates `H-1F/B1/B2-GATE`, 44 `H-ST?-nF` re-entry doors, `A-1F/B1/B2-GATE`, `A-2F-LINK`, `A-ST2-EXIT`; HS-H `hardstandErrors` clean; ≥ 20 hotel short-stay surface stalls |
| `hospitality-supertall-render.test.js` (new) | P-HA | — | ≤ 8 near meshes, ≤ 45k v per tower; far ≤ 2 meshes ≤ 2,000 triangles by day + the night layer, silhouette incl. lantern and deck; refuge-band ray hits a louvre; nothing above the deck within 5 m |
| `hospitality-lobby.test.js` | P-HA | 190 per tower; 7-zone 1F; LOFT A-20F | H 320 / A 304; 1F per variant; `H-27F.lobbyPlan.variant === 'skylobby'`; LOFTs `A-40F…43F` (32); every zone reachable from its lift |
| `hospitality-relocation.test.js` | P-HA | 380; 190 / 190; lift clearance B2–RF; dock pairs | 624; 320 / 304; clearance per bank and `serves`; dock pairs unchanged |
| `residence-access.test.js`, `suite-nav.test.js` | P0a | 728 walked | count from deltas (**980** records); walk deduped by plan signature × storey height |
| `tower-stairs.test.js`, `elevator-ride.test.js`, `refuge.test.js` (new), `nav-share.test.js` (new), `zones.test.js` (new) | P0a | — | `breakLevels` on a synthetic tower (the descending walk crosses the 避难区); ride with the default speed equals today's; `checkRefugeStack` catches each error and exempts open-air roofs; `maxRisers` loops on a synthetic 8.6 m storey (4 flights of 13 risers, one doorless landing); nav checksum identical with and without sharing |
| `ui-floor-rows.test.js`, `lift-keypad.test.js` (new), `far-lod.test.js` (new), `facade-modules.test.js` (new), `curtain-wall.test.js` (new) | P0b | podium row | ≤ 30 rows with every tower collapsed; every level reachable; refuge rows marked; podium row kept; keypad has no refuge button on passenger lifts, and refuge buttons on fire lifts carry the key confirm (C-29); `fireOnly` landings greyed; far silhouettes for all ten towers; the far night layer has lit vertices and emissive > 0 at night and is hidden by day (C-9); `buildElevators` builds nothing for closed tower shafts (C-14) — all on synthetic fixtures (C-15) |
| `supertall-budget.test.js` (new) | P-int | — | ten towers' unique exterior ≤ 14 MB; the plan-data caps |
| `tour-framing.test.js` (new) | P-int | — | each tower step: crown and label NDC y ≤ 0.9 at aspect 1.6 and 0.46 |
| `nav.test.js`, `playable.test.js`, `forecourt.test.js` | nobody | `H-ST2-1F-2F-flight-1`, `R4-30F`, `R*n*-MAIN` | unchanged (keep the ids) |
| `p1-expansion-layout.test.js` l. 7, l. 50–60 (C-6) | P0a | `deepEqual` of buildings and levels for `['P2','P3','H','A','R1','R2','R3','R4']` against the compact layout | the literal becomes `COMPACT_IDENTICAL` from `tests/campus-deltas/index.js`; P-R removes R1–R4 and P-HA removes H, A in their own delta files; fps-frozen keeps covering the compact side |
| `tower-stairs.test.js` l. 92–101 (C-7) | P0a → P-HA | `A-20F` LOFT has 10 units; `A-RF` elev **74.2**; A height 74.2 | P0a scopes these pins to the compact layout; P-HA re-pins `A-40F…43F` (32 LOFTs) and RF 174.6 in `hospitality-supertall.test.js` |
| `suite-nav.test.js` l. 27–33 (C-7) | P0a → P-HA | 380 homes; 10 duplexes, all on `A-20F`; H / A each 20 numbered levels; 728 | from deltas (980); duplexes 32, all on `A-40F…43F`; numbered levels H 48 / A 44 |
| `suite-nav.test.js` l. 107, l. 125 (C-7) | P0a | `homes.find(h => h.lv.id === 'A-2F')` | `A-3F` (A-2F becomes the 住客会所 and has no suites) |
| `p1-fidelity.test.js` l. 186, `hospitality-relocation.test.js` l. 53 (C-7) | P0a (helper) → P-HA | `hotel-shared-parking` ≥ 20 stalls (酒店仍须保留地面短停车位) | both call `hotelShortStay(L)`: the lot's stalls plus west-lot bays with `hotelShortStay: true` within 60 m of `H-SIDE`, ≥ 20 (expansion: 3 + 20 = 23); the compact layout keeps its own lot, so `hotelShortStay` equals today's count there; the loop pins are unchanged |
| `p1.test.js`, `underground-connections.test.js` (C-2) | P-HA | ramp slopes and overlaps; H-IN / OUT and A-IN / OUT light tubes | re-run on the re-planned H / A basements; no pin changes expected beyond the ramp ids |
| **`no-bypass.test.js`** (new, C-3) | P0a (harness, synthetic) → each tower package adds its towers | — | with gates closed (`buildNav(L)`), no path from `site`, any P1 / P2 level or a public floor (H 2F / 27F / 47F / 48F) reaches a home floor of 北苑 / 西苑 / R, an A suite floor or H 3F–25F; with `gates: 'open'` every home floor reaches the ground; the 北苑 RF terraces are reachable only from their own penthouse |
| `hospitality.test.js` l. 115 / l. 166, `residential-integration.test.js` l. 186 (C-8) | P-R | today's R1 B1 arrival aisle | the east-turning aisle (§1.3 Site) |

Full suite: `node --test --test-concurrency=3 tests/*.test.js`, ≤ 300 s.

---

## 5. Packages for parallel implementation

### 5.1 Order

```
P0a (layout engine) ─┐
                     ├─► merge ─► P-north ─┐
P0b (render / UI)  ──┘           P-west  ──┤
                                 P-R     ──┼─► merge (any order) ─► P-int (tour, docs, catalog, perf, shots)
                                 P-HA    ──┘
```

- P0a and P0b run in parallel on disjoint files. P0b reads `b.zones` and the new lift and gate fields with fallbacks, and tests its consumers on synthetic fixtures (§2.2 "fixtures", C-15), so it does not wait for P0a. At the P0 merge it switches the rail to `towerZones()`.
- Both must leave **every existing test green**, `fps-frozen` unchanged and the expansion layout unchanged (bar additive fields).
- The four tower packages start from the merged P0 head and never edit each other's files. Their only shared surfaces are their own `tests/campus-deltas/*.js` file and the marked regions in `hospitality.js`.

**Worktree protocol** (every package):
- `git worktree add --detach <scratchpad>/wt-<pkg> <P0 head>`;
- copy the gitignored `src/render/{pbr,suite,residential,people}-data.js`;
- symlink `node_modules`;
- commit on a package branch `supertall/<pkg>`.

**Shared-machine rule** (4 CPUs):
- one browser at a time, campus-wide, through `flock <scratchpad>/browser.lock`;
- ports P0b 5511, P-north 5512, P-west 5513, P-R 5514, P-HA 5515, P-int 5516;
- tests at `--test-concurrency=2` while another package is testing.

### 5.2 Ownership matrix (file → package; "→" = sequential hand-over)

| file | owner |
|---|---|
| `src/layout/refuge.js`, `zones.js`, `hardstand.js` (new) | P0a |
| `src/layout/community-contract.js`, `tower-stairs.js`, `elevator-ride.js`, `elevator-shafts.js`, `nav.js`, `access-records.js`, `community-units.js`, `layout.js` | P0a |
| `src/layout/community-plan.js` | P0a → P-north (only `variantExtras` content and the optional 12 m-wing void relaxation, both behind flags) |
| `scripts/prepare-community-plans.mjs` (driver) | P0a |
| `scripts/plans/north.mjs` / `src/layout/community-plan-data-north.js` | P0a (move) → P-north |
| `scripts/plans/west.mjs` / `src/layout/community-plan-data-west.js` | P0a (move) → P-west |
| `scripts/plans/r-penthouse.mjs`, `src/layout/r-penthouse-plan-data.js` (new) | P-R |
| `src/layout/community-plan-data.js`, `community-sites.js` (re-export shims) | P0a |
| `src/layout/north-site.js` | P0a (move) → P-north |
| `src/layout/west-site.js` | P0a (move) → P-west |
| `src/layout/north-towers.js`, `north-residences.js`, `residential-access.js` | P-north |
| `src/layout/community.js` | P-west |
| `src/layout/hospitality.js` | P0a; then only region `<supertall:R>` → P-R, region `<supertall:HA>` → P-HA |
| `src/layout/r-supertall.js` (stub by P0a), `residential-plan.js` | P-R |
| `src/layout/hospitality-supertall.js` (stub by P0a), `hospitality-lobby.js`, `suite-plan.js` | P-HA |
| `src/render/build/far-lod.js`, `facade-modules.js`, `curtain-wall.js`, `refuge-floor.js` (new) | P0b |
| `src/render/build/community.js` (incl. `liftShaft()`) | P0b |
| `src/render/build/community-north.js` (split) | P0b → P-north |
| `src/render/build/community-west.js` (split) | P0b → P-west |
| `src/render/build/residence-interiors.js` | P0b (fire-door finish) → P-north |
| `src/render/build/residential-shell.js` | P0b (M0) → P-R |
| `src/render/build/residential-models.js`, `src/render/residential-lighting.js` | P-R |
| `src/render/build/hospitality.js` | P0b (M1 hooks, dispatch, roof-garden skip flag, hardstand-driven landscape clearing); then only regions `<supertall:R>` → P-R, `<supertall:HA>` → P-HA |
| `src/render/build/r-supertall.js` (stub by P0b) | P-R |
| `src/render/build/hospitality-supertall.js` (stub by P0b), `hospitality-lobby.js` (render), `suite-models.js`, `suite-interiors.js` | P-HA |
| `src/render/build/tower-stairs.js`, `tower-elevators.js`, `residential-cores.js`, `elevators.js` | P0b |
| `src/render/app.js`, `explore.js`, `floor-rows.js`, `ui.js` | P0b |
| `perf/measure.cjs` | P0b |
| `src/render/tour.js` | P-int |
| `scripts/unit-catalog-plans.mjs`, `docs/unit-catalog-*`, `README.md`, `HANDOFF.md`, `docs/qa-*` | P-int (packages write notes to `docs/supertall/<pkg>.md`) |
| `src/render/build/access-gates.js` | P0b (the gate `role` / `leaf` variants only) |
| `src/render/build/labels.js`, `env.js`, `src/layout/playable.js` | nobody (record-driven / unchanged) |
| `src/layout/west-parking.js` | nobody: P-HA tags the `酒店短停` bays through the `supertallSitePass` hook (in `hospitality-supertall.js`) |
| P1 levels (`mall.js`, `p1-*.js`) | nobody: P-north's structural-wall pieces are a post-pass in `north-towers.js` |
| `tests/campus-deltas/base.js`, `index.js`, `tests/fixtures/supertall-records.js`, the `no-bypass.test.js` harness | P0a (fixtures file: P0b) |
| `tests/campus-deltas/north.js` / `west.js` / `r.js` / `ha.js` | P-north / P-west / P-R / P-HA |
| tests | as in the §4 owner column |

### 5.3 Package scopes, acceptance and shots

**P0a — layout engine and contracts.**
- **Scope**: §2.1 in full: the refuge kind + `refuge.js`, `breakLevels`, lift fields, ride formula, zones, hardstand, gate release, the refuge-room API, the plan-data / site / script splits, the supertall dispatch stubs and region markers, nav sharing + `floorLabel`, campus deltas (with `hardstands` and `COMPACT_IDENTICAL`), the test restructuring (`hospitality.test.js` compact-only, plan tests split, `residence-access` / `suite-nav` / `p1-expansion-layout` from deltas, the compact scoping of the `tower-stairs` / `suite-nav` pins, `hotelShortStay()`). New in revision 2: `maxRisers` loops (C-1), `fireOnly` (C-3), gate `role` / `leaf` + `stairReentryGates()` (C-3), the `no-bypass` harness, the R penthouse hooks and spike (C-15, C-16), the `supertallSitePass` hook, the shared-builder rule test (C-13).
- **Acceptance**:
  - the full suite is green with today's values;
  - `fps-frozen` unchanged;
  - `buildLayout({ expansion: false })` is byte-identical (fps-frozen), and no shared builder writes a field from the C-13 list (a test greps the compact JSON for each key);
  - the expansion `JSON.stringify(buildLayout({ expansion: true }))` differs from HEAD only by the additive keys `zones`, `zone`, `releaseOnAlarm` and gate `role` / `leaf` on expansion-only records (a test diff-checks this; lift `speed` / `role` arrive later with each tower package);
  - the penthouse spike result is recorded (C-16);
  - plan-data content hash unchanged across the split;
  - the nav smoke checksum is identical with and without sharing;
  - nav heap ≤ 30 MB at today's heights;
  - new unit tests pass.
- **Shots**: none (layout only).

**P0b — render engine and UI.**
- **Scope**: §2.2 in full: M0 on today's R; M1 on all ten towers with today's builders; the façade kits; refuge interior; the community render split; stairs / lifts / cores rendering; the `app.js` hooks; keypad (with the refuge key confirm and greyed `fireOnly` landings, C-29); zone rail; `towerSub`; `measure.cjs` views; the shadow-radius default. New in revision 2: the far night layer (C-9), the closed-shaft skip in `elevators.js` (C-14), the gate `role` / `leaf` rendering in `access-gates.js` (C-3), `liftShaft()` reading K4 widths (C-15), the fixtures, and the baseline re-measure before the ratchet (C-31).
- **Acceptance**:
  - render tests green;
  - one `measure.cjs` run: campus steady ≤ 2,200 (projected ≈ 1,900 at today's heights), triangles ≤ 4.07 M, scene geometry ≤ 286.8 MB, JS heap ≤ 560 MB, programs ≤ 70;
  - the black-instance test passes;
  - far silhouettes within 0.5 m for all ten towers;
  - no LOD pop visible in the R1 view (560–620 m).
- **Shots** (port 5511):
  - `p0b-campus-before.jpg` / `-after.jpg` (parity);
  - `p0b-R1-view.jpg`;
  - `p0b-keypad-T1-LF.jpg`;
  - `p0b-rail-T1.jpg` and `p0b-rail-phone.jpg`.

**P-north — 北苑 to 150 m.**
- **Scope**: §1.1: `northStack`, K4 core + LS, `northStops`, refuge levels (10F / 24F) via `refugeLevel`, `breakLevels`, RF terraces, `--extend-north` + bands + data, curtain wall + refuge bands + crown + far stand-in (`community-north.js`), moved interior detail, pick texts, zones, delta file. New in revision 2: 1.1 × 2.1 m cars and LW / LE at 4 m/s (C-4), F partitions at x ±2.0 (C-18), the RF terrace exit doors (C-3), `maxRisers` on the stairs through P1 (C-1), the structural walls in P1 (C-37), 7F rescue panels (C-34), T2 medium-intensity lights (C-28), the far night layer spec.
- **Acceptance**:
  - §4 north rows green;
  - `checkRefugeStack` clean;
  - 41 / 37 homes all distinct;
  - kept homes byte-identical in plan data apart from `refugeRoom` / `spec`;
  - community resident ≤ 10 MB and 北苑 ≤ 1.6 MB;
  - North's towers' bytes below today's;
  - sky-lobby, residential-access and riverside-integration green.
- **Shots** (5512):
  - `north-pair-river.jpg` (re-framed step);
  - `north-T1-24F-refuge-cutaway.jpg`;
  - `north-T1-crown-terrace.jpg`;
  - `north-T1-LF-keypad.jpg`;
  - `north-T1-rail.jpg`;
  - `north-night.jpg`.

**P-west — 西苑 S47.**
- **Scope**: §1.2: stack, 18.0 m core, 6 lifts in 2 banks with blank-wall landings, refuge levels 16F / 31F, corridor 前室 doors, families A / B / C + data, instanced modules + bands + crown + far (`community-west.js`), the S47 roof garden, label pin, 住户专区 signs, zones, delta. New in revision 2: high bank F2 · H2 · H1 and the 3.5 m lobby (C-21), W2 family B with a 4BR in SE (C-10), the 1F stair-door assertion (C-3), the far night layer spec.
- **Acceptance**:
  - §4 west rows green;
  - every home floor sees exactly 3 lift doors;
  - 5 distinct plans per floor;
  - west near ≤ 36 meshes per tower;
  - community ≤ 10 MB;
  - West's bytes below today's.
- **Shots** (5513):
  - `west-pair.jpg`;
  - `west-W1-1F-two-banks.jpg`;
  - `west-W1-31F-refuge.jpg`;
  - `west-W1-40F-high-zone-lobby.jpg` (3 doors + blank wall);
  - `west-W1-rail.jpg`;
  - `west-night.jpg`.

**P-R — 二期 R1–R4.**
- **Scope**: §1.3: `r-supertall.js` (stack, plate, core, families, refuge levels, PH units, lifts, stairs, 1F lobby, B2, gates), the R1 B1 arrival re-route and the hardstands (in its `hospitality.js` region), `r-penthouse` data, templates + mid / far LOD (`residential-shell.js`, `r-supertall.js` render), 2-variant interiors and lighting, zones, delta. New in revision 2: the penthouse spike result or the fallback (C-16), L1–L3 without the penthouse upper level (C-35), the split 前室 (C-20), the 1F split and the exit doors (C-3), the east-turning B1 arrival (C-8), the south-half B2 ramp (C-27), the GLB refuge-room tag (C-26), the far night layer spec.
- **Acceptance**:
  - §4 R rows green;
  - R unique ≤ 5 MB;
  - river-view triangles ≤ 4.07 M once P-HA's numbers are in (measured with today's H/A otherwise);
  - campus ≤ 2,200;
  - `fps-frozen` unchanged (the compact R stays 30-storey).
- **Shots** (5514):
  - `r-group-from-P2-roof.jpg`;
  - `r-R1-27F-outrigger.jpg`;
  - `r-R1-1F-gate.jpg`;
  - `r-R1-LF-keypad.jpg`;
  - `r-R1-rail.jpg`;
  - `r-hardstands.jpg`;
  - `r-PH-interior.jpg`.

**P-HA — 云澜酒店 and 服务公寓.**
- **Scope**: §1.4–1.5: `hospitality-supertall.js` (layout and render), lobby variants, suites at 8 per floor, the stacked shafts, 13 + 7 lifts, refuge levels, the helideck and winching area, HS-H and the HS-A markings, the hotel stalls (in its `hospitality.js` region), roof gardens retired, cars instanced, zones, delta. New in revision 2: the re-planned core and 9.6 m stairs (C-1), the re-planned basements (C-2), S1 `fireOnly`, the 44 re-entry doors and `A-ST2-EXIT` (C-3), the 20 `酒店短停` west-lot bays via `supertallSitePass` (C-7, C-24), the 22 × 19 m lanterns and the roof-structure test (C-33), the occupant caps (C-25), the fire-road exception record (C-36), the view-only helideck (C-32), the key count on cards and captions (C-12), zone-named 行政楼层 / 顶层空中会所 (C-30), the far night layer spec.
- **Acceptance**:
  - §4 H/A rows green;
  - H/A unique exterior ≤ 1.6 MB together;
  - 1F lobbies ≤ 5 MB;
  - campus ≤ 2,200;
  - `fps-frozen` unchanged.
- **Shots** (5515):
  - `ha-H-tower.jpg`;
  - `ha-H-27F-skylobby.jpg`;
  - `ha-H-26F-refuge.jpg`;
  - `ha-H-helideck-night.jpg`;
  - `ha-A-gateway-xingwan-road.jpg`;
  - `ha-H-shuttle-keypad.jpg`;
  - `ha-H-rail.jpg`.

**P-int — integration.**
- **Scope**: §6: tour edits (§3.3), the framing test, the budget test, the catalog (北苑: **38 new, 40 kept, 8 retired**; north level rows 68 → 100 (C-22); 西苑 family sheets; R PH; refuge-floor sheets; entries the user has seen are marked `已调整` / `已取消` rather than dropped (C-11)), README / HANDOFF / docs, the final `measure.cjs` on all views, the screenshots for the user, the dist rebuild.
- **Acceptance**: the full suite green ≤ 300 s; every §2.3 budget met; the campus-delta sum equals the layout; screenshots reviewed.

---

## 6. Integration, verification and screenshots

**Merge.**
1. P0a + P0b into the branch (fast-forward or merge commits).
2. The four tower packages in any order: each rebases on the branch tip, re-runs its tests and the full suite, then merges.
3. P-int last.

Merge conflicts should be limited to none: only own files, own delta file, own `hospitality.js` regions.

**Verification commands.**
- `node --test --test-concurrency=3 tests/*.test.js` (≤ 300 s).
- `node --test tests/fps-frozen.test.js`.
- `python3 -I <scratchpad>/res/supertall/spec-calc/final.py`. Its stacks must equal `buildLayout()`: P-int adds a small Node check that prints the same table from the layout and diffs it.
- `perf/measure.cjs` (HANDOFF §8) at `high`, one browser, on all views: campus, campusTall, river, N1, R1, P1-RF viewdeck, P2 roof, 西苑 step. Compare with `dc4951d` and HEAD.
- **A quiet-machine load-time A/B** (HEAD vs. the final branch, no other browser running; perf.md Q7). The orchestrator schedules the slot.

**Screenshots for the user** (P-int; `docs/qa-2026-11-xx-supertall/`; 1280 × 800 desktop + 390 × 844 phone where noted).

| # | group | shot | camera / how |
|---|---|---|---|
| 1 | skyline | 园区俯瞰 day | `OVERVIEW` |
| 2 | skyline | 园区全景, every crown | campusTall (149, 641, 648) → (0, 60, 0) |
| 3 | skyline | 云澜江 · 星湾桥 | re-framed step (192, 116, −638) → (−120, 74, −300) |
| 4 | skyline | 对岸看江景, eye level | (−196, 1.7, −446) → (−215, 70, −245) |
| 5 | skyline | 星湾桥 midspan facing the campus | eye 1.7 m above the deck at midspan, looking S |
| 6 | skyline | 星湾路 at 北外环: the A / R1 gateway | eye level, looking S along 星湾路 |
| 7 | skyline | 三期 中心广场 facing N (H summit) | eye level |
| 8 | skyline | night overview: dark refuge bands, aviation lights, lit crowns, all from the far night layer (C-9) | `OVERVIEW`, night |
| 9 | family | 北苑 pair | re-framed 北苑 step |
| 10 | family | 西苑 pair | re-framed 西苑 step |
| 11 | family | R1–R4 from the P2 roof | new step 3 |
| 12 | family | 云澜酒店 + helideck | new step 1 |
| 13 | family | A + R1 gateway, close | from 星湾路 |
| 14 | family | 北苑 crown + 顶层复式 terrace | (−238, 160, −262) → (−260, 148, −232) |
| 15 | refuge | T1-24F cutaway: 避难区 on the river face, plant behind the fire wall, LF / LS open, LW / LE blank | focus `T1-24F` |
| 16 | refuge | W1-31F: 避难区, 高低区 transfer, 分隔 stair doors | focus `W1-31F` |
| 17 | refuge | R1-27F 伸臂桁架 | new step 4 |
| 18 | refuge | H-26F double-height plant + 27F sky lobby above | focus `H-26F` |
| 19 | refuge | louvre-band close-up with rescue-window triangles and 乙级 fire windows | any tower, day |
| 20 | lift panel | T1-LF keypad at 7F (bands; 10F / 24F present) and T1-LW (no refuge buttons) | explore |
| 21 | lift panel | W1 1F: two keypads, 低区 / 高区 | explore |
| 22 | lift panel | R1-LF keypad (56 stops) | explore |
| 23 | lift panel | H 1F shuttle (5 stops) and HL at 27F | explore |
| 24 | lift panel | ride HUD `上行 · 32F · 实际约 37 秒` | explore, mid-ride |
| 25 | floor rail | T1 (podium row kept), R1 expanded on 中区, H | orbit, desktop |
| 26 | floor rail | phone: zone chips + bottom sheet | 390 × 844 |
| 27 | floor rail | directory: zone groups, 电梯 by bank, 避难层 count | orbit |
| 28 | gates | R1-1F-GATE, H-1F-GATE, A-2F-LINK | explore |
| 29 | gates | H 12F stair re-entry door from the stair side (`住户楼层 · 刷卡进入`), R1 ST1 north exit door from outside | explore |
| 30 | site | HS-H yellow grid with the 3 remaining stalls and the drop-off loop; the west-lot `酒店短停` bays by `H-SIDE` | orbit, day |
| 31 | stairs | H 26F stair cutaway: four flights and the doorless mid-landing at the plant mezzanine | focus `H-26F` |
| 32 | shadows | river from the 星湾桥 step: tower shadows on the water not clipped by the 410 / 360 shadow radii (C-38) | re-framed step, day |

---

## 7. Risks and open questions

### 7.1 Risks

| # | risk | mitigation |
|---|---|---|
| 1 | **Policy.** 建科〔2021〕76号 ≈ says 一般不得新建超高层住宅. 北苑, 西苑 and R are residential above 100 m (R already is today, at 103 m). | Say it in the catalog and tour text; H/A are public, so the policy does not bite there. |
| 2 | **超限 structure**: 北苑 H/B 6.67 above the podium; 西苑 7.58; R's 11 m eccentric core; H's 26F + 27F tall storeys. | §0.3 mitigations, drawn where visible (bands, belts, mega-columns); the pick-card note. |
| 3 | **北苑's kept floors change face**: punched windows → curtain wall, balconies enclosed. | Plans and furniture are unchanged; the kept homes' interior shots are re-shot or marked 立面已更新 (Q3). |
| 4 | **R goes from three to two homes per floor**; 348 homes on nearly twice the height reads as "taller but not more homes". | Present the reasons together: core, sun (03 got 0 h), lifts, kitchen windows (decided, DECISIONS 3). |
| 5 | **H's familiar 1F lobby moves to 27F.** | 1F pick card; tour step 2 (Q2). |
| 6 | **Sequencing**: a supertall layout landing before M0 + M1 puts the campus at ≈ 3,190 calls / 4.4 M triangles. Bytes stay high until each M2 builder lands. | P0b is a gate; each tower package must lower its own bytes (acceptance). |
| 7 | **River and near views** sit ≈ 5 % under the triangle cap without the R mid tier. | The mid tier is in P-R; add the P1-RF and P2-roof views to `measure.cjs` early (P0b). |
| 8 | **Shared engine changes** (`breakLevels`, nav sharing, keypad) touch every tower's walk tests. | One implementation in P0a / P0b with synthetic tests; walk tests sample floors. |
| 9 | **Black instances** from primitive-based instancing. | `facade-modules` rule + test. |
| 10 | **A's hardstand on 星湾路** (municipal road) and its 13.21 m separation with 0.21 m margin. | Markings only; lock P1's NE corner in a test; never widen A's corridor. |
| 11 | **Podium separations** (H 5.97 / A 7.01 m) rely on the fire-wall reduction for a > 100 m building's podium. | Fallback: podium faces to 9 m, docks +3 / +2 m (hotel-apt.md §2.1). |
| 12 | **Lift figures marked ≈**: H's stacked RB / HL budget (exactly 12.0 m); 北苑's 1.9 m hoistways, now with 1.1 × 2.1 m cars at 4 m/s, and 0.1 m modelled walls between shafts. | Record in HANDOFF. 26F can grow ≤ 1.0 m with the H main roof still < 187 m. |
| 13 | **西苑 S47 is at the limit**: 47F is 49.5 m above 31F; the roof garden is 52.5 m above it (open air). | `checkRefugeStack` exempts open-air roofs, stated in its doc (C-17). Moving the second refuge floor to 32F would make everything ≤ 50 m, but DECISIONS 2 names 16F / 31F. It stays the fallback if the authority reading changes. |
| 14 | **Penthouse interiors** (R procedural) are plainer than the GLB homes below; T2 PH has no 挑空. | Contact-sheet review; the void relaxation is a flagged stretch. |
| 15 | **"Distinct by signature" ≠ "visibly varied"** for 18 云端 flats per tower. | `variantExtras`, the rank gate, contact sheets before freezing. |
| 16 | **Parking**: R ≈ 0.36 stalls per home with B2; 西苑 440 homes against ≈ 324 resident bays. | Painted 住户专区; a full-plot garage is out of scope. |
| 17 | **Shadows (real world)**: on the winter solstice H throws 1.6 h of shade on 北苑's low floors and the P1-RF viewdeck; R shades the river promenade. | Every receiver keeps ≥ 6 h (≥ 2 h required, GB 50180 ≈), and this stays in the docs. The game's fixed south-west sun casts to the north-east instead (§3.4), so QA shoots only shot 32 (C-38). |
| 18 | **Lift-ride stutter** until pass-floor builds are skipped; phone heap. | P0b items (b) and (c); measure the `low` tier. |
| 19 | **Citations marked ≈**: GB 50096 §6.4 (incl. §6.4.5 每层设站), GB 50352 §6.8.5 / §6.9.1 (items 1–8), GB 50016 §5.5.21, §6.4.4-3 and §7.1.2, GB 51251, GB 50974, GB 50116, JGJ 3 §3.3.2 commentary / 3.4.5 / 3.5.5 / 10.2.5 / 10.6.3 detail / 12.1.7–8, GB 50011 Table 3.4.3-1, 建质〔2015〕67号, ICAO Annex 14 / CAAC, GB 50180. | Check before quoting a clause number to the user. |
| 20 | **Stair re-entry card doors** (H, 44 doors). GB 50016 §6.5.1 ≈ wants fire doors openable by hand from both sides. The re-entry doors lock only re-entry from the stair, never egress, and release on alarm. That is common practice but read case by case. | GB 55037 §7.1.7 ✔ for the release; if the authority refuses, the fallback is a staffed 1F concierge plus CCTV, with the gates kept as signs only, and the user is told. |
| 21 | **H / A basements lose stalls** to the full-depth cores (estimated 10–14 per deck, today 19–24). | P-HA re-counts; the hotel's surface short-stay stays at ≥ 20 through the west-lot bays, and no stall count is promised before measurement. |
| 22 | **R penthouse generation** is unproven (the same generator produced 0 / 20 on the 西苑 slots). | The P0a spike and the written fallback (§1.3, C-16). |
| 23 | **More gates** (16 → 92) add nav links and render items. | They are records with no lanes or cabinets for the re-entry and exit kinds; `no-bypass.test.js` and the nav build budget (≤ 1.5 s, ≤ 40 MB) cover them. |
| 24 | **Fire roads on one long side for H and A** (public high-rise). | A recorded site exception under GB 55037 §3.4.3 ✔, shown on the tower card (C-36). |

### 7.2 Open questions for the user (each with the default that is built if unanswered)

1. **西苑 pair.** Both towers at 47F (crown 156.5 m), as decided? Or W2 three storeys lower (44F, crown 147.5 m, 15 fewer homes) so the 西苑 pair also steps like 北苑? **Default: both 47F.**
2. **云澜酒店: what goes in the 200 m tower, and where the lobby is (C-12).**
   - **R (default):** 176 云澜酒店公寓 on 3F–25F, a 27F 空中大堂 at 99 m, then **144 hotel keys** on 28F–46F, with spa, pool, sky dining and bar on 47F–48F. Check-in, the piano lounge and the restaurant move from 1F to 27F, and 1F becomes the arrival hall plus the residents' lobby. That is how real 200 m hotels work (the hotel sits on top of something else), but the tower then has fewer hotel rooms than today (144 against 190).
   - **K:** all hotel, ≈ 330 keys, check-in stays on 1F, ≈ 10–11 lifts, no sky lobby. That is resort scale for one tower.
   - **Default: R.**
3. **北苑 façade.** One curtain wall for the whole tower, so the kept 8F–23F also become glass with enclosed 观江阳台 and the two towers read as one 150 m glass pair? Or keep today's punched windows below 100 m? That costs ≈ 2 MB over the geometry budget and loses the vertical merge. **Default: one curtain wall.**
4. **Lift ride time.** Compressed (about half the real time; the HUD shows the real time; Space skips), or the full real time (≈ 33–50 s to the top)? **Default: compressed.**

Everything else was decided by DECISIONS.md, taken as the designers' defaults (§0.8), or settled by this revision as an engineering consequence (Resolution log). Those include the 北苑 structure (no joint, C-5), the 北苑 lift cars (C-4), the 西苑 roof (C-17), hotel parking (C-7), the far LOD at night (C-9) and the 44F naming (C-30).

### 7.3 你看过、这次会变的 (things the user has already seen that change, C-11)

Each item goes in the user summary (Appendix B). In the catalog it is marked `已调整` or `已取消`, not dropped silently.

| what the user has seen | what happens | why |
|---|---|---|
| 北苑 10W / 10E in both towers (the catalog section 「北苑的 7、8、9、10 楼在哪里」 answered "一层都没有少") | **retired**: 10F becomes 避难层 1 | The first refuge floor must be ≤ 50 m above the fire-rescue ground; 10F is at 46.2 m. 11F would leave only 0.2 m of margin, so 10F is kept as the refuge floor. |
| 北苑 24W 顶层大平层 and 23–24E 复式 (both towers) | **retired**: 24F becomes 避难层 2 + 加强层; 23E becomes a new 端户大平层 | The second refuge floor (93.6 m) and the outrigger storey. |
| 北苑 shared RF 屋顶花园 | **replaced** by two private 顶层复式 terraces (card doors) | A shared open deck at 141 m is not credible; the shared amenities are on 7F and the P1 roof. |
| 北苑 private lifts (wide cars) | **narrower**: 1,050 kg 1.1 × 2.1 m stretcher cars at 4 m/s | Four lifts must fit the unchanged 8 m core above the mall (DECISIONS: 4 lifts per tower). |
| 北苑 kept 8F–23F façade | punched windows → one curtain wall, balconies enclosed | Q3 |
| 西苑 W1 NW (140.3 m²) and W2 NE (135.2 m²) | **re-cut** to 121.0 / 115.9 m², still 三房一厅 | The core grows 15.7 → 18.0 m for six lifts in two banks. |
| R1–R4: 3 homes per floor, 03 facing north | **2 homes per floor**, all south-facing; 03 now faces south; glass lifts in the light well retired | The core takes the north 03 wing (DECISIONS 3). |
| 云澜酒店 1F lobby, 190 king suites | 27F sky lobby; 144 keys + 176 酒店公寓 | Q2 |
| 酒店 · 一期共享地面停车 by the hotel's south face | 19 of 22 stalls become the yellow HS-H hardstand; 20 `酒店短停` bays are marked in the west lot by the hotel west door (3 stay) | A 200 m hotel needs a fire-rescue hardstand along its full south face. |
| H / A 屋顶花园 | **retired**; amenities move indoors (H 47F–48F, A 44F) and onto the podium roofs | An open shared deck at 175–185 m is not credible. |

---

## Appendix A. Where each number comes from

| numbers | source |
|---|---|
| stacks, elevations, refuge spacing and areas, fire-lift runs, H/B, homes, records, lift stops, campus totals | `spec-calc/final.py` → `spec-calc/final.out` (recomputed for this spec) |
| 北苑 150 m homes, bands, generator times and sizes | north.md §2–3, §6.3, rescaled to 25–33F / 25–31F + PH |
| 西苑 S47 traffic, slots, families, render | west.md §1.3, §2–3, §6 (measured at `e7cfb42`) |
| R plate, core, traffic, render | p2.md §2–7 (measured at `e7cfb42`; render estimates ±25 %) |
| H / A stacks, shafts, lifts, separations, exteriors, sun, skyline angles | hotel-apt.md v2 (measured at `9bdb886`) |
| M0 + M1 measurements, budgets, tour re-frames, nav sharing, per-frame costs | perf.md rev. 2 (one browser run on port 5506, Node at `9bdb886`) |
| code clauses | codes.md (✔ / ≈ as marked) |
| revision 2: stair depths and risers, multi-loop storeys, 北苑 4 m/s runs, R stops, H fire-only landings, gates / zones / hardstands, lift landings, roof structures, F lobby area | `spec-calc/final2.py` → `spec-calc/final2.out` (re-runs `final.py`'s stacks) |
| hotel lot vs HS-H (19 of 22); west-lot bays near `H-SIDE` (60 within 60 m, nearest 33 m); H / A basement stalls today (20 / 19, 22 / 24) | `spec-calc/lot.mjs`, `spec-calc/westlot2.mjs` (node, read-only, `buildLayout({ expansion: true })` in the main checkout at `9bdb886`; `hospitality.js`, `west-parking.js`, `shared-garages.js` and `p1-landscape.js` unmodified there) |
| stair engine rule, gates, nav gate model, `buildElevators` filter, hotel lot rows | code read at `9bdb886`: `tower-stairs.js` l. 5–40, `access-records.js`, `nav.js` l. 392–412 / 886–899, `elevators.js` l. 10–47, `hospitality.js` l. 146, 316–330, 413–426, `shared-garages.js` l. 358–364 |

Two corrections against the inputs, made while merging:
- **perf.md §7.1 lists H with 52 levels**, 49F dining, 48F spa and 38F refuge (hotel-apt v1). The spec uses **v2**: 51 levels, 47F spa, 48F dining, refuge floors 13F / 26F / 37F.
- **The 北苑 150 m variant** is computed here with 24F at 5.4 m (as north.md specifies): RF 140.7 / 132.9. perf.md's prototype (RF 138.6) kept today's 3.3 m 24F and modelled no refuge storeys. Lift speeds were 5 m/s private and 4 m/s fire, sized for 141 m (north.md's 6 / 5 m/s were for 187 m). Revision 2 lowers the private lifts to 4 m/s with 1.1 × 2.1 m cars, the only cars that fit the 1.9 m shafts (C-4).

---

## Appendix B. 中文摘要（给用户；对应原 SUMMARY-zh.md）

**一句话**：北苑和西苑按规范做到约 150 米，二期 R1–R4、云澜酒店和服务公寓做到约 200 米。每栋都有避难层、更多电梯和真实的消防逻辑，天际线高低错落。紧凑版 FPS 布局一字节不变。

**高度（"200 米"指塔冠；结构主屋面都 ≤ 190 米）**

| 楼栋 | 层数 | 主屋面 | 塔冠 | 避难层 |
|---|---|---|---|---|
| 北苑 1 号楼 | 35 层（1–6F 为一期商场） | 140.7 m | 150.7 m | 10F · 24F |
| 北苑 2 号楼 | 33 层 | 132.9 m | 142.9 m | 10F · 24F |
| 西苑 1 / 2 号楼 | 47 层 | 145.5 m | 156.5 m | 16F · 31F |
| 云澜汇楼盘 1 号楼 | 53 层 | 186.7 m | 200.0 m | 14F · 27F · 40F |
| 2 / 3 / 4 号楼 | 50 / 47 / 44 层 | 176.5 / 166.3 / 156.1 m | 189.8 / 179.6 / 169.4 m | 同上 |
| 云澜酒店 | 48 层 | 185.4 m | 停机坪 196.8 m | 13F · 26F · 37F |
| 云澜服务公寓 | 44 层 | 174.6 m | 184.6 m | 13F · 26F · 39F |

**天际线**：二期以 R1（200 m，星湾路桥头）为顶，一期以酒店（196.8 m）为顶，两个最高点不在同一视角里并排出现。R1–R4 每栋降 3 层，向东递减。服务公寓和 R1 在星湾路形成一对门户。临江的北苑、西苑约 150 米，是前排的低台阶。各楼避难层的百叶带都在约 46 / 91–94 / 137 米，形成横向呼应。

**规范逻辑**：
- 每栋第一个避难层距消防登高场地都 ≤ 50 米，避难层之间也 ≤ 50 米。北苑从地面算起，不从商场屋顶算。
- 避难层只放避难区和设备，楼梯在避难层错开（分隔），客梯不停，消防电梯停。
- 每层都有消防电梯，首层到顶层都 ≤ 60 秒。
- 住宅每户有一间户内避难间，每层有两个消防救援窗。
- 所有门禁在火灾时自动释放。楼梯里的人永远能往外走；任何门禁只限制"从外面进入住户区"。

**电梯**：北苑每栋 4 部（一梯一户的私家梯 2 部 + 消防梯 2 部，其中 1 部兼服务梯）。西苑每栋 6 部，分高低区，每层仍是 3梯5户。R 每栋 4 部（三梯两户 + 消防梯）。酒店 13 部（穿梭梯直达 27F 空中大堂）。服务公寓 7 部。全园电梯 76 → 108 部。

**户数**：北苑 48 → 78 户（每户 3 房以上，各不相同；错层复式保留；新增云端大平层和顶层复式）。西苑 270 → 440 户（每层 5 户各不相同，每层都有两房、三房、四房）。R 仍 348 户（每层 2 户，全南向，含 8 套顶层复式）。酒店 144 间客房 + 176 套酒店公寓。服务公寓 304 套（含 32 套 LOFT）。

**门禁（不可绕过）**：
- 住户电梯、消防梯、服务梯在平时都不会把公共区域和住户楼层连通。酒店的消防梯在公共楼层只在火灾模式下开门。
- 楼梯通向室外的门都是"只出不进"的刷卡门。
- 酒店公寓 22 个住户层的楼梯门从楼梯一侧刷卡才能进入（从走廊进楼梯不受限）。
- 新增测试：门禁关闭时，从园区、商场或公共楼层走不进任何住户层。

**你看过、这次会变的**（目录里会标 `已调整` / `已取消`，不会悄悄删掉）：
- 北苑 10W / 10E、24W 顶层大平层、23–24E 复式取消，两栋共 8 户。原因：第一个避难层必须在 50 米以内（10F = 46.2 m），24F 是第二个避难层兼加强层。
- 北苑屋顶共享花园改为两个顶层复式的私家露台（刷卡门）。
- 北苑私家梯轿厢变窄，改为 1.1 × 2.1 m 担架梯，4 m/s。原因：4 部电梯要放进商场上方不变的 8 米核心筒。
- 西苑 W1 西北户、W2 东北户各缩小约 19 m²，仍是三房一厅，因为核心筒要放 6 部电梯。
- R 每层 3 户变 2 户，全部南向；采光井里的观光电梯取消。
- 酒店大堂移到 27F；酒店南侧地面停车场变成黄色消防登高场地，在酒店西门旁的西停车场划出 20 个"酒店短停"车位（原地保留 3 个）。
- 酒店和公寓的屋顶花园取消，改为室内会所和裙房屋顶绿化。

**需要你决定的问题**（不回答就按默认做）：
1. **西苑两栋**：都做 47 层（默认），还是 2 号楼低 3 层（44 层，塔冠 147.5 m，少 15 户），让西苑也一高一低？
2. **云澜酒店**：下部 176 套酒店公寓 + 27F 空中大堂 + 上部 144 间客房（默认，但客房比现在的 190 间少），还是全部做酒店（约 330 间，大堂留在 1F）？
3. **北苑立面**：整栋统一玻璃幕墙、阳台封闭（默认），还是 100 米以下保留现在的窗洞立面？
4. **乘梯时间**：压缩到实际时间的一半左右，HUD 显示真实时间，空格键可跳过（默认）；还是按真实时间（到顶约 33–50 秒）？

**怎么实施**：先做两个引擎包（布局 P0a、渲染与界面 P0b），然后北苑、西苑、R、酒店/公寓四个包并行，最后做整合（导览、目录、性能测量和截图）。每个包只改自己的文件，并在独立工作树里完成。

---

## Resolution log (CRITIQUE.md → this revision)

✅ = resolved as the critique proposed; ✅* = resolved, with a different or narrower fix than proposed (the reason is given); ⛔ = proposal rejected, with the reason.

| C-n | sev. | resolution | where |
|---|---|---|---|
| C-1 H/A stairs too shallow; > 18 risers | Crit. | ✅* The engine gets **`maxRisers` loops**: a storey above 6.12 m gets four flights and a doorless mid-landing, set only by expansion-only builders, so the compact layout is unchanged. This one mechanism replaces the proposed `H-26M` pass level, and the 26F mid-landing falls at the plant mezzanine. H / A cores are re-planned with **4.4 × 9.6 m** stairs at the core ends (9.6 m covers the deepest two-flight storey, 6.0 m = 8.84 m; 11.1 m is not needed once 26F loops). 北苑's P1-1F → 2F run (6.5 m) loops too. The compact H/A 20-riser defect is recorded in HANDOFF. Tests: `buildTowerStairAccess` succeeds for H and A; ≤ 18 risers in every expansion-only tower. | §0.8-38, §0.9, §1.0, §1.1, §1.4 Core / Stairs, §1.5, §2.1, §4; `final2.out` |
| C-2 H/A cores on the garage | Crit. | ✅ Both decks are re-planned around the core (cross aisle in the 6 m north strip; ramp pair in the east part; lift-hall walkways), and hotel-apt's "unchanged" is withdrawn. The stalls are re-counted, and no basement home is promised to the displaced surface stalls. Re-run list in §1.4. | §1.4 Basements, §1.5, §4 |
| C-3 card-gate bypasses | Major | ✅* §1.0 "card zones" rules 1–4. **H S1** gets `fireOnly` landings on 2F, 26F–48F and RF, and normal B2 / B1 / 1F landings inside the RB gate zones. **H S2** needs no gate, because it never stops on 3F–25F. **44 H re-entry doors** cover the 酒店公寓 floors, the only floors that share stairs with public floors. With them, H ST2's hardstand door can stay an ordinary door (narrower than proposed). **R** gets 8 stair exit doors; **A** gets `A-ST2-EXIT` with S1 / S2 inside its gate zones; **北苑** RF terrace doors are on (+4). **西苑** 1F stair doors are asserted inside `Wn-1F`. `no-bypass.test.js` covers all of it. Gates / zones 35 / 33 → **92 / 59**. | §0.7, §0.8-8, §1.0, §1.1–1.5, §2.1, §2.2, §4 |
| C-4 北苑 hoistways too small | Major | ✅ 1,050 kg 1.1 × 2.1 m rear-counterweight stretcher cars in all four shafts; LW / LE 4 m/s (1F → 34F 38.2 s real, 16.8 s in game); cabins drawn 1.1 m wide; 0.1 m walls recorded in HANDOFF. It is **not** made a user question (proposed Q5): DECISIONS 5 fixes 4 lifts, and K3 would drop one. It is listed in §7.3 instead. | §0.6, §0.8-7, §1.1, §3.2, §7.3 |
| C-5 H/B vs seismic joint | Major | ✅ Option (a): no joint at the towers; P1 is the 大底盘; H/B 6.67 / 6.18 stands; joints ≥ 2 bays away; the eccentric position on the base is added as a review item. This is an engineering call, not a user question. | §0.1, §0.3 |
| C-6 `p1-expansion-layout` collision | Major | ✅ `COMPACT_IDENTICAL` from `campus-deltas/index.js`, with per-package `compactIdentical.remove`. | §2.1, §4 |
| C-7 missed pinned tests | Major | ✅* All five rows added to §4. Hotel lot: rather than drop the ≥ 20 pin or ask the user, the hotel keeps ≥ 20 surface short-stay stalls (3 in its lot + 20 marked west-lot bays within 40 m of `H-SIDE`; measured 60 within 60 m). Both pins call `hotelShortStay(L)`. `site.fireAccess` is compared with the deltas' `hardstands` sum (8). | §0.8-25, §1.4 Fire, §2.1, §4 |
| C-8 R1 arrival under the ramps | Major | ✅ The aisle turns east to x[59, 69], then south; pins updated by P-R. | §1.3 Site, §4 |
| C-9 dark far towers at night | Major | ✅* A night layer as **+1 mesh per far tower** in the existing `facadeWindowLit` material, visible only at night. The proposed merged campus mesh was rejected: it cannot follow each tower's own near / far swap without a custom shader (+1 program). Day calls are unchanged; night views add ≤ 10. | §0.8-35, §2.2, §2.3, §3.4, §4, shot 8 |
| C-10 W2 B lacks a 4BR | Major | ✅ W2 B → 3 · 2 · 4 · 3 · 2; every family floor in both towers now has 2 / 3 / 4BR; test added. | §1.2 Homes, §4 |
| C-11 removals not surfaced | Major | ✅ §7.3 table, Appendix B list, catalog marks `已调整` / `已取消`; 10F kept as the refuge floor (11F would leave 0.2 m). | §5.3 P-int, §7.3, App. B |
| C-12 fewer hotel rooms | Major | ✅ Q2 now offers program R against all-hotel K (≈ 330 keys, 1F lobby kept); key counts go on the tour caption and the cards. | §0.4, §1.4, §3.3, §3.5, §7.2 Q2 |
| C-13 FPS hash and new fields | Major | ✅ The shared-builder rule lists the fields; readers use defaults; the P0a acceptance is reworded (compact byte-identical + a key grep; expansion diff limited to the listed keys). | §2.1, §5.3 P0a |
| C-14 unbudgeted shaft glass | Major | ✅ `buildElevators` skips closed tower shafts (a cutaway check first, a sill fallback); new budget row ≤ 0.5 MB; ≈ 5.5 MB saved against today (estimate); 1,889 landings noted. | §0.7, §0.8-36, §2.2, §2.3, §4 |
| C-15 package seams | Major | ✅ (1) P0b fixtures and a rail fallback, switched at the P0 merge; (2) `liftShaft()` assigned to P0b; (3) P0a hooks (`generateDuplex` `wing`, `buildDuplexUnits`), with P0b drawing any two-level home; (4) see C-6 / C-7. | §2.1, §2.2, §5.1–5.3 |
| C-16 penthouse generation unproven | Major | ✅ The P0a spike plus the written fallback (family S on the top two floors; records 1,512; residenceAccess 972; L1–L3 + 1 stop). | §1.3, §2.1, §7.1-22 |
| C-17 西苑 open roof vs the check | Minor | ⛔ Default (b) (move R2 to 32F) is **not** taken. DECISIONS 2 names the 西苑 refuge floors 16F / 31F; GB 50016 §5.5.23-1 limits only the first refuge floor and the spacing; and the 91–94 m band alignment would be lost. Option (a) is taken instead: `checkRefugeStack` exempts open-air `kind: 'roof'` levels, stated in its doc. (b) is recorded as the fallback. | §0.5, §1.2, §2.1, §7.1-13 |
| C-18 net 前室 area | Minor | ✅ Partitions at x ±2.0: 12.8 m² gross, ≈ 12.1 m² net (`final2.out`); LE stays at −257.0. | §0.8-7, §1.1, §4 |
| C-19 lift-stop citation | Minor | ✅ GB 50096-2011 §6.4.5 ≈ (每层设站 where there are 户门 and a corridor); the "longest skip" claim is removed; the floor-by-floor compliance is stated. | §1.1, §4, §7.1-19 |
| C-20 R shared 前室 | Minor | ✅ Split at x +1.6: ST1 + LF 合用前室 ≈ 40 m², ST2 独立前室 ≈ 27 m². | §1.3 Core, §4 |
| C-21 西苑 facing fire lifts | Minor | ✅ High bank F2 · H2 · H1; lobby 3.0 → 3.5 m (service column 2.45 → 1.95 m); the gate stays put. | §1.2, §4 |
| C-22 stale catalog figure | Minor | ✅ 38 new, 40 kept, 8 retired; north rows 68 → 100. | §5.3 P-int |
| C-23 HS-W location | Minor | ✅ They stay in `site.westGarden.hardstands` (no double paint); `hardstandErrors` reads both lists. | §1.0, §1.2, §2.1 |
| C-24 HS-H stall count | Minor | ✅ 19 of 22 (measured, centre inside or on the edge). | §0.8-25, §1.4 |
| C-25 stair capacity | Minor | ✅ The re-planned stairs give 1.6 m flights (320 persons per floor); public floors capped at 300 on cards and in a test. | §1.4 Stairs, §3.5, §4 |
| C-26 GLB door leaves | Minor | ✅ Tag + pick card only for the GLB homes; optional material tint; the penthouses keep a real leaf. | §1.0, §1.3 |
| C-27 R B2 ramp | Minor | ✅ Along x in the south half z[2, 7], 28 m at 15 %. | §1.3, §4 |
| C-28 T2 aviation lights | Minor | ✅ Medium-intensity red on T2; all ten red at night. | §1.0, §1.1 |
| C-29 refuge floors via fire lifts | Minor | ✅ `避难层 · 消防/检修专用` with a key confirm; fire mode unlocks it. | §3.2, §4 |
| C-30 flagship 44F | Minor | ✅ Named by zone (`行政楼层`, `顶层空中会所`), not by number; not a user question. | §0.8-6a, §1.4, §1.5, §3.1 |
| C-31 baseline mismatch | Minor | ✅ P0b re-measures (labels included) at `9bdb886` before the ratchet; the ratchet is 2,200 or the measured figure + 200. | §2.3, §5.3 P0b |
| C-32 helideck walkable? | Minor | ✅ View only (救援专用): stairs drawn, no records, stairs stay 106. | §0.8-24, §1.4 |
| C-33 roof structures at ¼ | Minor | ✅ Lanterns 22 × 19 m: H ≈ 502 ≤ 528 m² (margin 4 → 26 m²), A ≈ 480 ≤ 525 m²; a test sums the real footprints. | §1.0, §1.4, §1.5, §4; `final2.out` |
| C-34 北苑 7F rescue windows | Minor | ✅ Two marked panels on 7F's north glass; rescue windows from 7F. | §1.0, §1.1, §4 |
| C-35 R stops at the PH upper level | Minor | ✅ 53F (etc.) dropped from L1–L3: 51 / 48 / 45 / 42; LF keeps every level. | §1.3, §4; `final2.out` |
| C-36 H/A fire roads | Minor | ✅ The site exception is recorded with GB 55037 §3.4.3 ✔ and its reasons, on the tower card and in HANDOFF. | §1.0, §1.4, §1.5, §3.5, §7.1-24 |
| C-37 walls through P1 not drawn | Minor | ✅* Drawn by P-north as an expansion-only post-pass (0.6 m walls with 3 m openings, nav obstacles), guarded by the mall walk and shop-door tests; any piece that fails is left out and listed in HANDOFF. | §0.3, §1.1, §4, §5.2 |
| C-38 shadow QA in the game | Minor | ✅ The game sun casts to the north-east; real-world figures stay in the docs; QA shot 32 checks the river shadows against the 410 / 360 radii. | §3.4, §6 shot 32, §7.1-17 |

**Critique §E open questions → outcome.** 1 structure: decided, (a). 2 hotel program: **kept for the user (Q2)**. 3 西苑 roof: decided, (a), see C-17. 4 hotel surface parking: decided, ≥ 20 kept via the west-lot bays. 5 北苑 cars: decided, the narrower cars, in §7.3. 6 far LOD at night: decided, +1 mesh per tower. 7 44F naming: decided, by zone. The user questions are §7.2 Q1–Q4.

**Final consistency pass (revision 2).**
- `stacks_dump.py` re-adds every stack from the storey heights. Every `nF @ elevation` in this spec (26) and every storey-table row (47; the 2 P1 host rows aside) matches.
- Refuge checks (`final.out`): first ≤ 46.5 m and gaps ≤ 47.4 m everywhere; top enclosed storey ≤ 49.5 m above the last refuge floor.
- Lift stops (`final2.out`): 北苑 25 / 26 / 33 / 33 (T2 23 / 24 / 31 / 31); 西苑 31 / 31 / 33 / 20 / 20 / 21; R L 51 / 48 / 45 / 42 and LF 56 / 53 / 50 / 47; H RB 25, SH 5, HL 21, S1 26 + 25, S2 28; A L 43, S 47; 1,889 tower landings.
- Homes 41 / 37, 220 × 2, 96 / 90 / 84 / 78, 320, 304 → 1,490 homes / 1,520 records; levels 526; lifts 108; gates / zones 92 / 59; hardstands 8.
