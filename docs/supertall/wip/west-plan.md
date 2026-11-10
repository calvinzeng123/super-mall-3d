# Supertall P-west：云澜·西苑 W1 (47F) / W2 (44F)

**Status / next step:** plan written; starting the layout (west-site.js, community.js, plan families).

Branch `supertall/west`, based on `64c8857` (P0 merged). Scope: SPEC §1.2 (west.md S47), the P-west block of
SPEC §5.3, the west rows of SPEC §4, and the C-n items the Resolution log gives P-west (C-3 1F stair doors, C-10 W2
B SE 4BR, C-17 roof exemption, C-21 bank order). DECISIONS round 2 Q1 overrides SPEC: **W2 is 44F**, 3 floors lower.

## Plan (change list)

Layout (records, nav, tests first):
1. `src/layout/west-site.js`: per-tower `top` (47 / 44), `core` / `lobby` / `serviceSide` / explicit core columns,
   `levels` (refugeHeight 4.5, refuge [16, 31], crown 11), `families`, `zones`; `roof` computed and asserted.
2. `scripts/plans/west.mjs` + `src/layout/community-plan-data-west.js`: families A / B / C per tower (re-cut north
   slots W1 NW 14.4 m, W2 NE 13.8 m), every plan distinct within its tower (planSignature), each floor 2BR + 3BR + 4BR,
   a 户内避难间 per plan (`refugeRoom` on the data unit, `pickRefugeRoom(plan, 'S')`). Top-level `units` stays
   family A (readers of today's shape keep working).
3. `src/layout/community.js`: stack with 16F / 31F refuge storeys (`refugeLevel`), 18.0 m core (`westCore(spec)`),
   6 lifts in two banks (L1 L2 F1 3 m/s low; F2 H2 H1 4 m/s high; `speed` / `role` / `zone` / `card` / `car`),
   blank-wall landings (`corePlan.lifts[i].landing`), low-bank shafts ending in 32F (cells from 33F), stair
   `breakLevels` 16F / 31F (doors x0 + [0.3, 1.7] / [1.9, 3.3]), corridor 前室 doors (hold-open 甲级 leaves at
   core.x0 / core.x1, nav obstacles, 乙级 home doors inside), reduced RF garden (south half, plant north half),
   `b.zones` (低区 A / 低区 B / 高区 C …), `b.coreCard`, refuge `pickText`, bank signs data, 住户专区 data.
4. `tests/campus-deltas/west.js`: levels +35, lifts +6, records / homes / west +155, expansionChanged.
5. Tests: `west-garden.test.js` (§4 west row, W2 numbers), `community-plans-west.test.js` (30 plans), new
   `west-supertall.test.js` (stack, refuge check, lift stops / runs, banks, C-21, C-10, C-3, 前室 doors, zones).

Render:
6. `src/render/build/community-west.js`: west façade kit (copied from community.js `homeFacade`, with curtain
   split and enclosed C balconies), instanced family modules A / B / C + refuge module R (`moduleSet`), refuge
   louvre bands with 乙级 fire windows and rescue marks, crown fins + ring beam, sign at RF + 6 m, aviation lights,
   far stand-in with bands and crown (≤ 1,500 triangles) and the night layer, bank signs, 住户专区 signs.
7. `tests/west-render.test.js`: near ≤ 36 meshes per tower, both ≤ 140k triangles, far ≤ 1,500 + night, black
   instances, one instance hidden.
8. UI text: `label-declutter` pin, zone names, pick cards.

Shots and measure (port 5513), then this doc's as-built tables.
