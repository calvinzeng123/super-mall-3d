# CRITIQUE · supertall SPEC.md (adversarial review)

Reviewed: `SPEC.md` (1,099 lines) against `DECISIONS.md`, `codes.md`, `north.md`, `west.md`, `p2.md`, `hotel-apt.md` (v2), `perf.md` (rev. 2), `spec-calc/final.out`, and the code at `9bdb886` (`/home/user/super-mall-3d`, read-only; no worktree, no browser). Node was used only to read the current layout (stall and lift-stop counts).

Severity: **Critical** = blocks a package or breaks a mandatory rule as written; **Major** = a test fails, a result is wrong, the user would see nonsense, or two packages collide; **Minor** = clarity, citation or small numeric fix. ✔ / ≈ follow codes.md: ≈ means check the clause text before quoting it.

**Counts: 2 Critical · 14 Major · 22 Minor (38 issues).**

---

## A. What holds up (re-derived, no action)

- **Stacks and elevations.** Every row in §0.1 / §1.1–1.5 re-adds: 北苑 7F 34.0 → 10F 46.2 → 24F 93.6 (5.4) → 25F 99.0 → 33F 130.2 → 34F 134.1 → RF 140.7 (T2 RF 132.9); 西苑 `elev(nF)` formula gives 16F 46.5, 31F 93.0, 47F 142.5, RF 145.5; R1 14F 45.6 / 27F 90.9 / 40F 137.1 / 53F 183.3 / RF 186.7, R2–R4 tops 173.1 / 162.9 / 152.7; H 13F 45.5 / 26F 90.8 / 27F 99.4 / 37F 136.8 / 48F 179.4 / RF 185.4; A 39F 137.6 / 40F–43F at 6.5 / 44F 169.6 / RF 174.6.
- **Refuge spacing from the right ground.** All first refuge floors are measured from the grade hardstands (HS1/HS2 on 北外环, the 西苑 fire road, HS-R, HS-H, the 星湾路 strip), not from the 34 m P1 roof. First ≤ 50, gaps ≤ 50 in every tower (GB 55037 §7.1.14 ✔, GB 50016 §5.5.23-1 ✔). The one gap is the 西苑 open roof, see C-17.
- **Counts.** Lift stops (LW 25 / LE 26 / LF = LS 33; 西苑 31 / 33 / 20 / 21; R 52 / 56 …; H 25 / 5 / 21 / 51 / 28; A 43 / 47), homes (41 / 37, 220 × 2, 96 / 90 / 84 / 78, 320, 304), records (1,520), levels (526 = 338 + 20 + 38 + 78 + 28 + 24), lifts (108), gates and zones (35 / 33) and the `campus-deltas` table all sum correctly. `residenceAccess` 728 + 8 + 244 = 980 ✓.
- **Fire lifts.** Every storey is served by ≥ 1 fire lift, refuge floors and RF included; all 1F → top runs ≤ 60 s.
- **Separations.** T1–T2 14.0, W1–W2 22.6, R gaps 24, H–P1 15.25, A–P1 13.21 (lock it, as the spec says).
- **Camera.** `camera.far` 12,000 and `maxDistance` 3,600 (`app.js` l. 101, 108) clear 200 m towers. The shadow camera far plane is `4r + 600`, so height adds no depth clipping. `buildingView()` frames R1 from max(2.8 r, 1.8 × 189.9) ≈ 342 m ✓. Building titles sit at max level elev + 26 (`labels.js` l. 218–219): R1 212.7, H 211.4, A 200.6, W 171.5, T1 166.7, all above their crowns ✓. The exploded view is disabled for towers (`ui.js` l. 222) ✓.
- **DECISIONS.md compliance.** Scope (1) ✓; 北苑 150 m variant and 西苑 S47 (2) ✓; R / H / A ≈ 200 m with the 13 m step-back (3) ✓; stagger 200 / 190 / 180 / 169, tallest by 星湾路, 北苑 one higher and one lower, pairs 143–157, others 169–200 (4) ✓; the defaults (4 lifts in 北苑, generated R penthouses, balconies enclosed above 100 m, south hardstands, R card gates, continuous numbering) are recorded in §0.8 (5) ✓.
- **Floor numbering choice (stated).** Numbering is continuous: no 4 / 13 / 14 / 18 skipped, and refuge floors are numbered storeys. This matches DECISIONS 5 and the existing towers. Refuge floors fall on 10F / 24F, 16F / 31F, 14F / 27F / 40F, 13F / 26F / 37F and 13F / 26F / 39F, so some unlucky numbers carry no homes. The remaining cultural point is C-30.

---

## B. Critical

### C-1 · Critical · H / A stairs cannot be built by the stair engine, and the tall storeys break the 18-riser rule
**Where:** SPEC §1.4 "Stairs", §1.5; hotel-apt §5.3 (ST1 / ST2 at x −11…−4, z ±(10…16), i.e. a **6.0 m z-depth**); `src/layout/tower-stairs.js` l. 5–18 and 33–36.

`towerStairPlan` takes the stair's **z-extent** as its depth. `buildTowerStairAccess` throws `insufficient stair depth` unless `3.8 + 0.28 × ceil(rise / 2 / 0.17) ≤ depth`. The required depth by storey height:

| storey | 3.4 | 4.5 | 5.0 | 6.0 | 6.5 (H/A 1F, A 40F–43F) | 6.8 (H 27F) | 8.6 (H 26F) |
|---|---:|---:|---:|---:|---:|---:|---:|
| risers per flight | 10 | 14 | 15 | 18 | **20** | **20** | **26** |
| z-depth needed (m) | 6.6 | 7.72 | 8.0 | 8.84 | 9.4 | 9.4 | 11.08 |

- With 6.0 m, **every H/A storey throws**, the typical 3.4 m one included.
- The engine's two flights per storey reach at most 2 × 18 × 0.17 = 6.12 m legally (≤ 18 risers per flight, GB 50352 §6.8.5 ≈). 6.5, 6.8 and 8.6 m storeys need more flights. Today's H/A 6.5 m lobby already has 20 risers per flight, so this is an existing defect that the design multiplies.

**Fix (P0a + P-HA):**
- Give `towerStairPlan` / `buildTowerStairAccess` multi-run storeys: `runs = ceil(rise / 3.06)`, with one extra landing per added run.
- Or model the 26F plant mezzanine (+4.3 m) as a doorless stair pass level `H-26M`, and add a mid landing on the 6.5 / 6.8 m storeys. `passLevels` already chains routes this way.
- Make ST1 / ST2 at least **9.6 m deep in z** (11.1 m if 26F stays a single storey). Re-check the hotel-apt §5.3 core against that.
- Add tests: `buildTowerStairAccess` succeeds for H and A, and max risers per flight ≤ 18 in every tower.

### C-2 · Critical · H / A basements: the new full-depth core lands on today's garage aisles and ramps
**Where:** SPEC §1.4 / §1.5 storey tables ("B2 / B1 … unchanged"); hotel-apt §9.1 ("`addTowerGarageRamps()` and the B1 / B2 rows are unchanged, except about two stalls"); `src/layout/hospitality.js` `addTowerGarageRamps()` l. 316–330.

H measured in podium-local coordinates (podium centre −247, −81.15). The tower core is x[−15, 7] × z[−13, 19]:
- ST1 is at x[−15, −8] z[−13, −7]. The two B1 ↔ B2 ramp lanes x[−25, 5] × z[−17, −12] / [−10, −5] run through it.
- The S1 fire lobby is at x[1.6, 7] z[−7, 1]. Lane 2 and the east turn x[5, 13] z[−18, 2.5] hit it.
- The **main cross aisle** x[−29, 29] z[−3, 3] runs through the N shaft row x[−9.6, 1.6] z[−2, 1], so cars would drive through RB / HL hoistways.
- A has the same conflict: its core spans local x ±11 of the 74 m podium, which the same lanes and cross aisle cross.

RB, SH, S1 and S2 all stop at B1 / B2, and the 18 displaced hotel stalls are said to "move to B1 / B2" into this same space.

**Fix (P-HA, `hospitality-supertall.js`):**
- Re-plan both decks around the core, with the core walls down to B2.
- H: ramps in the east part (local x[7, 37], 30 m clear), where the street ramps H-IN / H-OUT already land at local x ≈ 10 / 18. The W ↔ E cross aisle goes in the 6 m north strip z[−19, −13] outside the tower footprint. The lift lobbies and gates face that aisle.
- Mirror this for A.
- Re-run `p1.test.js` (ramp slopes and overlap), `underground-connections.test.js` (H-IN / OUT and A-IN / OUT light tubes), `hospitality-relocation.test.js` (dock pairs, stalls) and the B2 → P1-B1 garage link.
- Re-count stalls before promising the 18 hotel stalls a home.

---

## C. Major

### C-3 · Major · Card gates can be bypassed through service lifts and stair exit doors
**Where:** SPEC §1.4 lifts (S1 "every level", S2 B2 B1 1F 2F 26F–48F), §1.5 (S1 / S2 every level), §1.3 Stairs ("ST1 / ST2 also get a direct north door to outside at 1F"), §1.4 Fire ("ST2 exits onto [HS-H]").

The gates (`H-1F-GATE` in front of RB only; `A-1F / B1 / B2-GATE`; `Rn-1F / B1 / B2-GATE`) do not cover:
- **H S1** (公寓服务梯, every level) and **A S1 / S2**: 1F / B1 / B2 landings with no stated zone. A visitor rides to any apartment floor.
- **H S2** (hotel back-of-house): from 1F / 2F to every hotel floor, which skips HL's room-key 梯控.
- **R ST1 / ST2 north doors** and **H ST2's hardstand door**: in nav, a stair door is two-way, so anyone walks in from outside and climbs to every home floor.

The user asked for card gates and notices a gate that does nothing.

**Fix:**
- Put the S1 / S2 landings at 1F / B1 / B2 inside a gated back-of-house zone, or inside the RB / L gate zone. Use `gateRecord({ kind: 'glass-door' })`, zone ids such as `H-BOH-1F`.
- Model every stair door to outside as an **exit-only gate**: free egress through `exitSensor`, card from outside, `releaseOnAlarm`.
- Re-count gates and zones (≈ +15; R alone +8) in the deltas and §0.7.
- New test: with gates closed (`buildNav(L)`), no nav path from `site`, P1 or P2 reaches any home or suite level of R / H / A.
- Confirm the 西苑 1F stair doors, which move 2.3 m with the S47 core, stay inside `Wn-1F`.

### C-4 · Major · 北苑 K4 hoistways are physically too small for the stated cars and speeds
**Where:** SPEC §1.1 Lifts ("four 1.9 m shafts", LW / LE "1.7 × 2.8 m inside, 5 m/s"); north.md §4.3; risk 12.

Four 1.9 m shafts in an 8.0 m core leave 0.1 m between shafts and 0.05 m at the ends. The 0.1 m rings make the "car" equal to the whole hoistway: 1.7 × 2.8 m, with no room for guide rails, counterweight or running clearance. Real 4–5 m/s hoistways are about 2.4–2.6 m wide. A 140 m shear-wall core also has 300–600 mm walls, not 100 mm. "Tight" understates this.

**Fix:**
- Specify all four cars as **1,050 kg 1.1 × 2.1 m stretcher cars with rear counterweight**. They fit a 1.9 × 3.0 m hoistway.
- Run LW / LE at **4.0 m/s**. 1F → 34F is then ≈ 37 s real and 16.8 s in game.
- Draw the cabin 1.1 m wide and centred in the shaft.
- Record the 0.1 m shaft walls as a modelling simplification in HANDOFF.
- If 1.7 m-wide private cars are a must, the only honest options are K3 (no LS) or the 12 m core that north.md §4.1 rejects. Put that to the user (open question 5).

### C-5 · Major · 北苑 H/B is taken above the podium while the spec also separates the towers from it
**Where:** SPEC §0.1 (H/B 6.67 / 6.18 "above the 34 m podium"), §0.3 ("Seismic joint round the tower bays of P1"); north.md §6.1.

The above-podium H/B is allowed only when the tower is tied to a large, stiff podium (JGJ 3 §3.3.2 commentary ≈). A seismic joint round the tower bays makes each tower a separate structure on a 16 m-deep base. H/B then becomes **8.79 / 8.31 from grade**, above the 6 (shear wall) and 7 (frame-core) limits of JGJ 3 Table 3.3.2 ✔. One of the two statements is wrong.

**Fix:** choose one.
- (a) **No joint at the tower**: P1 acts as a 大底盘. Joints, if any, go between P1 wings at least two bays away from the tower bays. Keep 6.67 / 6.18 and JGJ 3 §10.6.3.
- (b) **Keep the joint**: report 8.8 / 8.3 as the 超限 item, and give the reason on the pick card and in the catalog.

Default: (a), because it matches the "walls run through P1, no transfer" line.

### C-6 · Major · `p1-expansion-layout.test.js` requires H / A / R1–R4 to equal the compact layout
**Where:** `tests/p1-expansion-layout.test.js` l. 7 (`old = buildLayout({ expansion: false })`) and l. 50–60 (`deepEqual` of buildings and levels for `['P2','P3','H','A','R1','R2','R3','R4']`). This file is not in SPEC §4.

The test fails as soon as `supertallResidential()` or `supertallTower()` returns a part. Its fix is one array literal that both P-R and P-HA would edit: an ownership collision.

**Fix:** P0a replaces the literal with a shared constant `COMPACT_IDENTICAL = ['P2', 'P3', 'H', 'A', 'R1', 'R2', 'R3', 'R4']` exported from `tests/campus-deltas/index.js`. Each tower package removes its own ids in its own delta file (for example `r.js` exports `compactIdentical: { remove: ['R1', 'R2', 'R3', 'R4'] }`). fps-frozen keeps covering the compact side. Add the row to §4.

### C-7 · Major · Other pinned tests that SPEC §4 misses
**Where:** SPEC §4.

| test (line) | pin | broken by | fix |
|---|---|---|---|
| `tower-stairs.test.js` l. 92–101 | `A-20F` LOFT has 10 units; `A-RF` elev **74.2**; A height 74.2 | P-HA (the file is owned by P0a) | P0a scopes these pins to the compact layout; P-HA re-pins `A-40F…43F` and RF 174.6 in `hospitality-supertall.test.js` |
| `suite-nav.test.js` l. 27–33 | 380 homes; 10 duplexes, all on `A-20F`; H / A each 20 numbered levels; 728 | P-HA (owned by P0a) | read from deltas (980); duplexes 32, all on `A-40F…43F`; 48 / 44 numbered levels |
| `suite-nav.test.js` l. 107, l. 125 | `homes.find(h => h.lv.id === 'A-2F')` | P-HA: A-2F becomes the 住客会所 and has no suites, so `find` returns `undefined` and the test crashes | use `A-3F` |
| `p1-fidelity.test.js` l. 186 and `hospitality-relocation.test.js` l. 53 | `hotel-shared-parking` keeps **≥ 20 stalls** | P-HA: HS-H covers **19 of the 22** stall centres (measured; the spec says 18), leaving 3 | either re-plan the lot so ≥ 20 short-stay stalls remain south of HS-H, beside the `H-dropoff` loop (z[−46, −31.5]), or change both pins with the user-facing reason (open question 4) |
| `riverside-integration.test.js` l. 63–65 | `site.fireAccess` deep-equals `[['HS1','T1'], ['HS2','T2']]` | P-R and P-HA (and P-west if HS-W moves in, C-23) | add `hardstands` to `campus-deltas`; the test compares against the sum |

### C-8 · Major · R1's re-routed B1 arrival runs under the street ramps
**Where:** SPEC §1.3 Site ("re-routed west along z[−248, −238] to enter at local x[−20, −10]"); p2.md §8.2; `hospitality.js` l. 489–494.

R1-IN and R1-OUT run x[20, 48] at z[−246.5, −241.5] and [−240, −235], falling from street level at x 20 to B1 (−4.2) at x 48. Turning **west** from the toes along z[−248, −238] to x 29–39 puts the B1 aisle under ramp surfaces at y −1.35 (x 29) to −2.85 (x 39). That is 1.35–2.85 m of headroom before the ramp slab, below the 2.2 m car clearance.

**Fix:** turn **east**. From the toes at x 48, run along z[−248, −238] to x[59, 69] (local x 10…20, past the core's east face at x 57.8, under the open-air NE void), then south into the B1 cross aisle. Add the north B1 slab for the L as today. Update the `hospitality` l. 115 / l. 166 and `residential-integration` l. 186 pins that p2.md names.

### C-9 · Major · At night the default and tour skyline views show ten dark towers
**Where:** SPEC §2.2 `far-lod.js` ("2 meshes (facadePlaster + facadeWindow)"); §3.4; screenshot 8 ("night overview: … aviation lights, lit crowns"); `community.js` `farFacade()` l. 486–537; `facade-materials.js` l. 39–45.

Every tall tower is more than 600 m from `OVERVIEW` (125, 480, 590): R1 ≈ 896 m, H ≈ 856, A ≈ 907, T1 ≈ 994, W1 ≈ 1,089. The 园区 tour steps are farther still. So the default view and the night view show the far stand-ins, and those use `facadeWindow`, which has **no night emissive**. Only `facadeWindowLit` ramps with `onNight`, and `glowSoft` is near-only. Lit windows, lit crowns and aviation lights all vanish in exactly the views where the 200 m skyline is the subject. Today's 西苑 far LOD already behaves this way, but at this height it dominates the picture.

**Fix:**
- `farStandIn` gets a night-lit layer: vertex-coloured lit-window strips, crown edge and aviation points in a far-lit material whose emissive ramps with `onNight`.
- That is +1 mesh per tower, or one campus-wide merged far-lit mesh (+1 call in total, which the ratchet absorbs).
- Far tests: the far group has lit vertices and emissive > 0 at night.

### C-10 · Major · 西苑 W2 family B has no 四房 on 14 floors
**Where:** SPEC §1.2 Homes (W2 B 17F–30F = 3 · 2 · 3 · 3 · 2); west.md §2.3.

Every 西苑 floor today mixes 两房, 三房 and 四房, and the user's rule names all three. W2 17F–30F would carry 70 homes without a 四房, which the user may read as the rule being dropped.

**Fix:** W2 B → **3 · 2 · 4 · 3 · 2**. Put a 4BR in SE: west.md's capability table gives 16 distinct 4BR variants for W2 SE, so a signature distinct from family A's SE exists. Counts and the 15 plans per tower are unchanged.

### C-11 · Major · Removals the user has already seen are not surfaced
**Where:** SPEC §0.4 ("8 retired"), §1.1 RF, §1.2 ("2 catalogued plans re-cut"), §7.2 (only the hotel lobby is asked).

These retire or change things the user has seen:
- 10W / 10E in both towers. That is the floor of the catalog's own section 「北苑的 7、8、9、10 楼在哪里」 (`docs/unit-catalog-2026-11-05.md`), which answered "一层都没有少".
- 24W 顶层大平层 and 23–24E.
- The shared 北苑 RF 屋顶花园.
- W1 NW and W2 NE, each shrunk by 19.3 m².

A picky user will find these, and none of them is in the open questions or the risks.

**Fix:**
- Add a "你看过、这次会变的" list to the user summary: 8 北苑 homes retired (why: the first refuge floor must be ≤ 50 m from the ground, 10F = 46.2 m), the RF garden replaced by two penthouse terraces, two 西苑 plans re-cut.
- Mark the catalog entries 已调整 or 已取消 rather than silently dropping them.
- Keep 10F; 11F leaves a 0.2 m margin.

### C-12 · Major · The hotel more than doubles in height but loses hotel rooms
**Where:** SPEC §0.4 (H: 190 king suites → 144 keys + 176 云澜酒店公寓), §0.8 default 22, §7.2 Q2.

"云澜酒店 · 约 200 米超高层" with fewer hotel rooms than today (144 against 190), because 3F–25F become 酒店公寓, reads as wrong unless explained. Q2 asks only about moving the lobby.

**Fix:** extend Q2. Present program R (144 keys + 176 apartments, sky lobby) against an all-hotel option, which hotel-apt §3.1 has as an alternative to program R. Put the key count in the tour caption and the pick card, for example `酒店客房 144 间 · 酒店公寓 176 套`.

### C-13 · Major · Guard the FPS hash against the new record fields
**Where:** SPEC §2.1 lift fields ("`e.speed` (m/s, default 3.5)"), P0a acceptance ("`JSON.stringify(buildLayout())` differs … only by `zones`, `zone`, `speed`, `releaseOnAlarm`"); `src/layout/mall.js` `lift()` is shared by the mall, `tower()` and `northTower()`.

If the default is written into `lift()`, or `breakLevels: []` into `towerStairPlan`, the compact JSON changes and `fps-frozen` fails. The acceptance text even invites a `speed` diff.

**Fix:**
- State the rule: `speed`, `role`, `zone`, `card`, `breakLevels`, `releaseOnAlarm`, `refugeRoom` and `lv.zone` are **never written by shared builders**. They are read with defaults (`e.speed ?? 3.5`) and written only by expansion-only builders.
- P0a acceptance: compact JSON byte-identical (fps-frozen), and the expansion diff limited to the listed keys on expansion-only records.

### C-14 · Major · Unbudgeted lift-shaft geometry from `elevators.js`
**Where:** SPEC §2.3 budgets and the §3.4 derivation (perf.md); `src/render/build/elevators.js` l. 10–46; `elevator-shafts.js` sets `rideable = true` on every lift.

`buildElevators()` draws, for every rideable lift, which means **every** lift, glass panes, corner posts, rings and a sill on every served level: about 13 boxes, ≈ 470 vertices per stop. Tower stops go from **646 today to ≈ 1,901**, an increase of about 590k vertices (≈ +10 MB at 18 B/v). That is about +7 MB more than perf.md's prototype, which kept today's lift counts. This is an estimate from the code, not a measurement. The panes are also glass and metal drawn inside opaque concrete cores.

**Fix:**
- In P0b, skip closed-core lifts in `buildElevators`: draw shafts only for `e.type === 'glass' || e.exterior`. Tower cores are already drawn by `liftShaft()` / `residential-cores.js`, and cars by `tower-elevators.js`.
- Add a "lift shafts" row to §2.3 and re-measure scene geometry after P0b.

### C-15 · Major · Package seams and ownership gaps
**Where:** SPEC §5.1–5.2.

1. **P0b runs in parallel with P0a but tests P0a's data.** Its tests cover refuge rows, the keypad without refuge buttons, `refuge-floor.js` from `lv.refugePlan`, the second stair door from `breakLevels`, and the zone rail from `towerZones()` in P0a's `zones.js`. **Fix:** P0b ships synthetic fixtures with the §2.1 shapes, and lands the zone rail after P0a merges. Or sequence those four items after P0a.
2. **`landing: false` → blank wall lives in `liftShaft()`** in render `community.js` (l. 224–235), which P0b keeps, not in `residential-cores.js` as §2.2 says. **Fix:** assign `liftShaft()` to P0b explicitly.
3. **R penthouses need files P-R does not own:**
   - `community-plan.js`: `generateDuplex` with the R wing specs, including a north edge that is exterior only beyond x −12;
   - `community-units.js`: unit building;
   - `residence-interiors.js` / `companionsOf`: drawing.

   The owners are P0a → P-north. **Fix:** P0a adds an R wing-spec hook (or the generator change itself) behind a flag, and the matrix lists P-R as the only caller.
4. **`riverside-integration.test.js` and `p1-expansion-layout.test.js`:** see C-6 and C-7.

### C-16 · Major · R penthouse generation is unproven, with no fallback
**Where:** SPEC §1.3 Homes, §0.8 default 11.

No p2-calc script runs `generateDuplex` on the R wing specs (W 17.6 × 14.3 with a partly exterior north edge, E 15.6 × 14.3, `rise` 3.4). The same generator produced 0 / 20 on the 西苑 slots and no 挑空 on T2's 12 m wings.

**Fix:**
- Spike the generation in P0a, or at the start of P-R.
- Write the fallback into §1.3: the top two floors become family S (03 + 02). Homes per tower stay 96 / 90 / 84 / 78; records drop by 8 (356 → 348; `r.js` records 0); the tour and catalog drop "顶层复式".

---

## D. Minor

### C-17 · Minor · 西苑 open roof garden vs `checkRefugeStack`
**Where:** §1.2 ("roof garden … 52.5 m above 31F: acceptable"), §2.1 `checkRefugeStack` ("top occupied floor > 50 m above the last refuge floor" is an error), P-west acceptance (`checkRefugeStack` clean).

The rule and the design disagree, so the test outcome depends on the implementer.

**Fix:** pick one.
- (a) Exempt open-air RF in `checkRefugeStack`, and say so.
- (b) **Move R2 to 32F.** 32F at 96.0 m; gap 49.5; 47F 46.5 and RF 49.5 above it, all ≤ 50. Home floors 2–15 / 17–31 / 33–47 (14 / 15 / 15 = 44, still 220 homes). Balconies enclosed from 33F (100.5 m). The 91–94 m band alignment loses 3 m.
- (c) Retire the garden, as default 4 does on every other tower above 140 m.

Default (b).

### C-18 · Minor · 北苑 三合一前室 12.2 m² is a gross figure
**Where:** §1.1 ("F … 3.8 × 3.2 = 12.2 m²"). GB 50016 §5.5.28-4 ✔ counts 使用面积 (≥ 12.0, short side ≥ 2.4). Partitions on x = ±1.9 bring the net area below 12.

**Fix:** put the partitions at **x = ±2.0**, inside the 0.1 m gaps between shafts: 4.0 × 3.2 = 12.8 m² gross ≈ 12.4 m² net. Landings W / E become 2.0 m and still hold the 1.0 m doors at u ±3.0. Re-pin the sky-lobby reach (LE −257.0 is unchanged).

### C-19 · Minor · Wrong lift-skip citation, and a false "longest skip" claim
**Where:** §1.1 ("longest skip is 2 floors … within GB 50096 §6.4.4 ≈").

"Skip at most two floors" is the GB 50096-**1999** wording (§4.1.8). The 2011 edition (§6.4.4 ≈) asks lifts to stop on every floor that has 户门 and a public corridor. The claim is also false on its own terms: LW / LE pass six P1 levels between 1F and 7F, the 西苑 high bank passes 2F–31F, and LE 23F → 25F skips one floor, not two.

**Fix:** cite the 2011 rule. Every design complies per floor: duplex upper floors have no 户门, refuge and host floors have no homes, and each zone's floors are served by their own bank.

### C-20 · Minor · R: two independent stairs share one 前室
**Where:** §1.3 Core ("三合一前室 ≈ 67 m²"); p2.md §3.2.

§5.5.28-4 is the scissor-stair rule. Two independent 防烟楼梯间 that enter through one 前室 lose their independence: one smoke event affects both exits (≈; not a quoted prohibition).

**Fix:** split the U at x ≈ +1.6:
- ST1 + LF 合用前室 to the west (residential ≥ 6 m², GB 50016 §6.4.3 ✔);
- ST2's own 前室 to the east (≥ 4.5 m²);
- each keeps its 甲级 door at x ∓6.9.

Rename it 合用前室.

### C-21 · Minor · 西苑: the two fire lifts face each other across a 3.0 m lobby
**Where:** §1.2 core table; west.md §3.3 (both banks ordered N → S as L1 / L2 / F1 and H1 / H2 / F2).

GB 50352 §6.9.1 (≈) asks that the depth between facing banks be at least the sum of the facing car depths. F1 facing F2 needs 2.1 + 2.1 = 4.2 m.

**Fix:** reverse the high-bank order so each 2.1 m car faces a 1.4 m car (3.5 m), and widen the lobby to 3.5 m by taking 0.5 m from the service column. Or keep 3.0 m and mark the clause ≈ in HANDOFF.

### C-22 · Minor · Stale catalog figure
**Where:** §5.3 P-int ("北苑 66 → new sheets"). 66 is north.md's 200 m count.

**Fix:** the 150 m variant has **38 new** (T1 21, T2 17), **40 kept** and **8 retired**. North level rows go 68 → 100.

### C-23 · Minor · "HS-W already exist" in `site.fireAccess`
**Where:** §2.1 hardstands. `site.fireAccess` holds only HS1 / HS2 (`north-residences.js` l. 74–75). The 西苑 hardstands are `site.westGarden.hardstands` (`community.js` l. 338).

**Fix:** decide whether P-west moves them into `fireAccess`. If it does, the `riverside` pin applies (C-7) and `residential-cores.js` `hardstandPaint()` starts painting them twice. Otherwise `hardstandErrors` must read both lists.

### C-24 · Minor · HS-H stall count
**Where:** §1.4 / §0.8 default 25 ("18 of the 22"). Measured: **19** of 22 stall centres fall inside x[−284, −218] × z[−57.15, −47.15]. Use 19 (and see C-7).

### C-25 · Minor · Stair capacity on the H public floors
**Where:** §1.4 (ST1 / ST2 with 1.2 m flights; 27F lobby and restaurant, 47F spa, 48F dining and bar).

Two 1.2 m flights give 2.4 m, or **240 persons per floor** at 1.00 m per 100 persons (GB 50016 Table 5.5.21-1 ≈). The 26F refuge sizing implies about 250 people on 27F.

**Fix:** state an occupant cap (≤ 240 per floor) on the 27F / 47F / 48F cards and in a test, or widen the flights to 1.3 m.

### C-26 · Minor · R GLB homes have no door-leaf records
**Where:** §1.3 Fire ("户内避难间 … including the GLB homes"), p2.md §3.4 ("door-leaf record gets `fire: '乙级'`"). `doorLeaves()` exists only for community homes (`community-units.js`, `residence-interiors.js`). The R doors are baked into the GLBs.

**Fix:** tag `residence.refugeRoom` and show it on the pick card only, or tint that GLB door's material at load. Do not promise a door-leaf record.

### C-27 · Minor · R B2 ramp
**Where:** §1.3 B2 ("internal ramp to B1"); p2.md §8.2 ("like `addTowerGarageRamps` for H / A").

Those lanes (local x[−25, 5] × z[−17, −5]) cross the R core (x ±8.8, z[−15.9, −1.6]).

**Fix:** place the R ramp in the south half (z > 1.6), along x.

### C-28 · Minor · Aviation lights on T2
**Where:** §1.0 crown row ("all except T2").

Obstacles of 45–150 m normally carry medium-intensity red lights (ICAO Annex 14 ≈). At night T2 alone would be unlit beside T1.

**Fix:** medium-intensity red on T2, and high-intensity on the others as specified.

### C-29 · Minor · Refuge floors are reachable in normal operation through the fire lifts
**Where:** §1.0 lifts row, §3.2 keypad ("refuge floors appear only on fire-lift keypads"), §1.3 (LF "in the passenger group in normal mode").

**Fix:** the refuge buttons read `避难层 · 消防/检修专用`. In normal mode they need a confirm (`消防员钥匙`), shown as a key icon; fire mode unlocks them. This keeps the floors visitable in the game, and it is realistic.

### C-30 · Minor · Flagship uses on 44F
**Where:** A 44F 空中会所; H 44F–46F 行政楼层 (the executive lounge sits on 44F); R4's penthouse on 43F–44F.

Numbering stays continuous (DECISIONS 5 ✓). In Chinese practice, though, a flagship amenity branded 「44F」 reads badly (四十四).

**Fix:** name these by zone in signs and captions (`顶层空中会所`, `行政楼层`), not by floor number. Or move the H lounge to 45F.

### C-31 · Minor · Inconsistent draw-call baseline
**Where:** §2.3 (HEAD campus steady 2,852) against `scratchpad/perf/RESULT.md` (main 2,817, steady **2,907**). The main pass is the same, but the label count differs by 55.

**Fix:** re-measure the steady count, labels included, at `9bdb886` before setting the 2,200 ratchet.

### C-32 · Minor · Can the player reach the helideck?
**Where:** §1.4 (deck at 196.8; "open steel deck stairs" from RF 185.4, an 11.4 m climb); §0.7 (stairs 106 unchanged); tour step 1 caption (停机坪).

**Fix:** say whether the deck is walkable. If it is: +2 stair records (106 → 108) plus nav. If not: "view only" and no stair records.

### C-33 · Minor · Roof structures at the ¼ limit
**Where:** §1.4 ("≈ 524 m² ≤ ¼ of 2,112 m²"): 528 m² allowed, a 4 m² (0.8 %) margin. Any extra stair housing or cooling-tower screen moves the fire height to the lantern (194.2 m).

**Fix:** a test that sums the actual roof-structure footprints (lantern, stair housings, BMU garage, cooling towers) to ≤ 528 m².

### C-34 · Minor · No rescue windows on 北苑 7F
**Where:** §1.1 Fire ("2 per storey on the north face from 8F"). 7F (34 m: lift hall and club) also faces HS1 / HS2, and GB 55037 §2.2.3 ✔ applies to every storey on the rescue face.

**Fix:** add 2 marked panels on 7F's north glass.

### C-35 · Minor · R passenger lifts stop at the penthouse upper level; 北苑 lifts never do
**Where:** §1.3 Lifts ("PH upper level included", 52 stops) against §1.1 ("LW / LE never open on … the other side's upper levels").

**Fix:** either give the R penthouses a second 户门 on 53F onto the band and say so (双入户), or drop 53F from L1–L3 (52 → 51, 49 → 48, …).

### C-36 · Minor · Fire roads for H and A
**Where:** §1.4 / §1.5 Fire; codes.md rule 13 ("H and A (public) on 2 long sides", GB 55037 §3.4.3 ✔). A has one long side (星湾路). H has the south side plus the west short side.

**Fix:** record the site exception with the clause and the reason (P1 7 m to the west, annexes to the north) in §1.0 or §1.4–1.5. The authority accepts it case by case.

### C-37 · Minor · The 北苑 shear walls through P1 are not drawn
**Where:** §0.3 ("walls run through P1 to a piled raft"); north.md §6.2-4 ("the game's shops under the wings … have no tower walls"). A user exploring P1 2F–6F under 150 m towers sees open shops carrying nothing.

**Fix:** optional, expansion-only. Add 0.6 m 结构墙 nav obstacles on P1 B2–6F along the T1 / T2 plate ends and party lines, or state it as a known simplification in HANDOFF.

### C-38 · Minor · The shadow QA item cannot be shot in the game
**Where:** risk 17 ("H throws 1.6 h of winter shade on 北苑 … shoot it in QA"). The game sun is fixed from the south-west (`env.js` `sunDir` (−0.55, 0.78, 0.62)), so shadows fall north-east. In the game:
- H shades the P1 roof at x ≈ −190…−96;
- the 北苑, the 方庭 天台 (farm, viewdeck) and the 方庭 itself stay sunlit;
- R and 北苑 shade the river, whose water receives shadows (`river.js` l. 194).

**Fix:** keep the real-world sun figures in the docs only. The QA shot checks that the river shadows are not cut off by the 410 / 360 shadow radii.

---

## E. Open questions (for the orchestrator or the user)

1. **北苑 structure (C-5):** no joint, so P1 counts as the stiff base and H/B is 6.67 / 6.18 (default)? Or keep the joint and report H/B 8.8 / 8.3?
2. **Hotel program (C-12):** program R (144 keys + 176 酒店公寓, sky lobby at 27F) or an all-hotel tower?
3. **西苑 roof (C-17):** move R2 to 32F so everything is ≤ 50 m (default), exempt the open roof, or retire the garden?
4. **Hotel surface parking (C-7):** re-plan the lot so ≥ 20 short-stay stalls stay on the surface, or accept 3 on the surface and the rest in B1 / B2?
5. **北苑 private cars (C-4):** accept 1.1 × 2.1 m cars at 4 m/s (default), or drop LS (K3) to keep wider cars?
6. **Far LOD at night (C-9):** +1 mesh per tower or one merged campus-wide far-lit mesh (default)?
7. **44F naming (C-30):** name the flagship amenities by zone (default), or move them off 44F?

---

## F. Evidence (for the reviser)

- Stair depth: `towerStairPlan` depth = `r.z1 − r.z0`. The throw condition in `buildTowerStairAccess` is `end + 1.35 > depth − 0.6`, with `end = 1.85 + 0.28 × ceil((rise / 2 − 1e-7) / 0.17)`.
- H garage: podium frame `(−247, −81.1533717, 0°)`. `addTowerGarageRamps` reserves `rect(−29, −3, 29, 3)`, `rect(−29, −18, −25, 2.5)` and `rect(5, −18, 13, 2.5)`, and lanes `rect(−25, z − 2.5, 5, z + 2.5)` for z ∈ {−14.5, −7.5}. The tower core and ST1 / S1 come from hotel-apt §5.3, moved from the tower centre (−251, −78.15).
- Lift stops today, from `buildLayout()`: total 966; towers 646 (H 46, A 46, R 64 × 4, W 93 × 2, T 56 × 2). After, from the SPEC stop lists: 226 + 312 + 776 + 278 + 309 = 1,901.
- Hotel lot: 22 stalls in `hotel-shared-parking`, 19 with their centre inside HS-H.
- Far distances from `OVERVIEW` (125, 480, 590) to the tower centre at mid-height: R1 896 m, H 856, A 907, T1 994, W1 1,089 (farSwap radius 600).
