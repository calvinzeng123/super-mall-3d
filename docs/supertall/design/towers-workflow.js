export const meta = {
  name: 'supertall-towers',
  description: 'Build the four supertall tower packages (北苑, 西苑, 二期 R1–R4, 酒店 H + 公寓 A) in parallel worktrees, review each independently, fix, then merge all four and verify',
  phases: [
    { title: 'Build', detail: 'P-north, P-west, P-R, P-HA in parallel worktrees from the P0 head 64c8857' },
    { title: 'Review', detail: 'an independent reviewer per package: diff, numbers, browser' },
    { title: 'Fix', detail: 'reproduce and fix each review finding, re-test, re-shoot' },
    { title: 'Merge', detail: 'merge all four, full suite, totals, budgets on all views, push' },
  ],
}

const S = '/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad'
const REPO = '/home/user/super-mall-3d'
const ST = S + '/res/supertall'
const BASE = '64c8857'

const CTX = `## Context
Repo ${REPO}. A Three.js 3D mall campus (云澜汇). Branch claude/wonderful-thompson-olaaxb is at ${BASE}, pushed. That commit is the merged supertall P0 base: P0a (layout engine and contracts) and P0b (render engine and UI). Full suite 604/604. The live demo is https://yunlan-mall-calvin-v2.netlify.app/ (no deploy in this workflow).

The user asked: "我想继续往上延伸 一期和西区住宅 以及二期住宅区". So the towers grow into supertalls:
- 北苑 T1/T2 and 西苑 W1/W2 to about 150 m;
- 二期 R1–R4, 云澜酒店 H and 云澜服务公寓 A to about 200 m;
- the skyline is staggered (错落).

**Design documents (read the parts for your package in full):**
- ${ST}/SPEC.md, the implementation spec: §0 decisions, §1.0 common rules, §1.x per tower, §2.3 budgets, §3 UX, §4 tests, §5.2 ownership matrix, §5.3 package scopes / acceptance / shots, §6, Resolution log.
- ${ST}/DECISIONS.md, the user's decisions. **They override SPEC wherever they differ.** Round 2 overrides SPEC's §7.2 defaults:
  - **Q1:** W2 is 44F, 3 floors lower than W1 (47F).
  - **Q2:** the hotel is program R.
  - **Q3:** 北苑 keeps today's punched windows and open 观江阳台 below 100 m. The curtain wall is only for the new floors above.
  - **Q4:** lift rides are compressed to about half. The HUD shows the real time, and Space skips.
- Research files: ${ST}/codes.md, north.md, west.md, p2.md, hotel-apt.md, perf.md. Calculations: ${ST}/spec-calc/ (final.py / final2.py and their .out).
- **The API you build on (read before coding):**
  - ${REPO}/docs/supertall/p0a.md (layout contracts: refugeLevel, checkRefugeStack, breakLevels / applyStairBreaks, maxRisers, lift fields and ride, gateRecord / segmentGate / stairReentryGates, zones, hardstands, supertall dispatch regions, campus deltas, the no-bypass harness);
  - p0b.md (far LOD spec, moduleSet, curtainWall / splitFacade / transitionBand, refuge floor, cores / stairs / cars, gates, render dispatch, rail / keypad / ride HUD);
  - p0-merge.md (the hand-over and notes for the tower packages).

**Browser checks:**
- \`npm run build\` builds dist/mall.html (about 1–2 min).
- Serve the worktree root with \`python3 -m http.server <your port>\` and open /dist/mall.html.
- Playwright: require('/opt/node-tools/node_modules/playwright'). Chromium args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'], 1280×800, deviceScaleFactor 1.
- Click [data-mode=tour] and wait for window.__mall.explore.
- Tools to reuse:
  - ${S}/catalog/tool/ (README.md; top-down and first-person shots);
  - ${S}/finalshots/ (window.__vr helpers);
  - ${S}/p0b/ and ${S}/p0merge/ (P0b's shot scripts and runners, run.cjs);
  - perf/measure.cjs (HANDOFF §8).

**Shared machine (4 CPUs, 15 GB, four packages run at once):**
- Every browser session runs under \`flock ${S}/browser.lock <cmd>\`, so only one browser runs campus-wide. Close it when done.
- Every full-suite run goes under \`flock ${S}/suite.lock node --test --test-concurrency=2 tests/*.test.js\`. Single test files can run freely.
- Use only your assigned port. Never \`pkill -f\` broad patterns; kill only your own PIDs.

**Rules:**
- Package branches stay local. Never push them and never open a PR. Only the merge step pushes, and only to claude/wonderful-thompson-olaaxb.
- Commit with explicit \`git add\` paths.
- Never commit dist/ in a package worktree. Restore it with \`git checkout -- dist/\` after every build.
- Commit messages end with:
  (the attribution trailers the running session specifies)
  No model identifiers anywhere.
- buildLayout({expansion:false}), the compact FPS layout, must stay byte-identical (tests/fps-frozen.test.js). The compact H / A / R stay as they are today.
- Never weaken a test to get green. When a pinned value legitimately moves, update it with a comment saying why. Report every changed assertion.
- User-facing text (labels, signs, captions, pick cards) is Simplified Chinese.
`

const WT = pkg => `${REPO}/.claude/worktrees/st-${pkg}`

const SETUP = pkg => `## Worktree (resume-safe)
Work only in ${WT(pkg)}, on branch supertall/${pkg}.

**If that path already exists**, a container restart interrupted an earlier attempt. cd into it, read \`git log --oneline ${BASE}..HEAD\`, \`git status\` and docs/supertall/${pkg}.md if present. Keep all of that work: review it, then continue from where it stopped. Do not reset or discard anything.

**Otherwise, set it up:**
- \`git -C ${REPO} worktree add -b supertall/${pkg} ${WT(pkg)} ${BASE}\`;
- copy the gitignored ${REPO}/src/render/{pbr,suite,residential,people}-data.js into the worktree's src/render/;
- \`ln -s ${REPO}/node_modules ${WT(pkg)}/node_modules\`.

**Commit early and often on supertall/${pkg}.** WIP commits are fine, so a container restart loses little. Keep docs/supertall/${pkg}.md up to date as you go, with a "status / next step" line at the top.`

const OWN = `## Ownership
- Touch only what SPEC §5.2 gives your package, plus:
  - your own tests/campus-deltas/<pkg>.js file;
  - your no-bypass entries (in your delta file, as p0a.md describes);
  - your own new tests;
  - docs/supertall/<pkg>.md.
- The other three packages edit their own files at the same time in other worktrees.
- If a file owned by P0a, P0b or nobody truly must change:
  - make the smallest additive change;
  - list it under "shared-file edits" in your doc and in \`problems\`, so the merge can reconcile it.
- In src/layout/hospitality.js and src/render/build/hospitality.js, edit only inside your own marked region.`

const PKG_SCHEMA = {
  type: 'object',
  properties: {
    headCommit: { type: 'string' },
    worktree: { type: 'string' },
    testsPassed: { type: 'number' },
    testsTotal: { type: 'number' },
    failing: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    numbers: { type: 'string', description: 'the as-built table: storeys, RF, crown, refuge floors, homes/keys, lifts and stops, gates/zones, hardstands, bytes, meshes, triangles' },
    sharedFileEdits: { type: 'array', items: { type: 'string' } },
    changedAssertions: { type: 'array', items: { type: 'string' } },
    forPint: { type: 'array', items: { type: 'string' }, description: 'items for the integration package: catalog changes, tour steps, captions, docs' },
    shots: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['headCommit', 'worktree', 'testsPassed', 'testsTotal', 'failing', 'summary', 'numbers', 'sharedFileEdits', 'changedAssertions', 'forPint', 'shots', 'problems'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          title: { type: 'string' },
          where: { type: 'string' },
          evidence: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['id', 'severity', 'title', 'where', 'evidence', 'suggestedFix'],
      },
    },
    checkedOk: { type: 'array', items: { type: 'string' } },
    shots: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['findings', 'checkedOk', 'shots', 'summary'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    ...PKG_SCHEMA.properties,
    findingOutcomes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          outcome: { type: 'string', enum: ['fixed', 'rejected', 'deferred'] },
          note: { type: 'string' },
        },
        required: ['id', 'outcome', 'note'],
      },
    },
  },
  required: [...PKG_SCHEMA.required, 'findingOutcomes'],
}

const PKGS = [
  {
    key: 'north', port: 5512, name: 'P-north — 云澜·北苑 T1 / T2 to about 150 m',
    scope: `SPEC §1.1 (150 m variant, north.md §6.3), the P-north block in §5.3, the north rows of §4, and the C-n items the Resolution log assigns to P-north.

Targets:
- **T1:** 35 storeys, RF 140.7 m, crown 150.7 m.
- **T2:** 33 storeys, RF 132.9 m, crown 142.9 m.
- **Refuge floors:** 10F @ 46.2 and 24F @ 93.6 (加强层).
- **Lifts:** 4 per tower (LW, LE private at 4 m/s; LF fire; LS fire + service). All cars are 1.1 × 2.1 m.
- **Homes:** 41 / 37; level units 52 / 48. 40 homes are kept, 38 are new and 8 are retired (10W, 10E, 24W and 23–24E in each tower). Every home is 3BR+ and distinct within its tower.
- **Also:**
  - the RF terraces with exit-only gates;
  - maxRisers on the stairs through P1 (empty the C-1 KNOWN list in tests/tower-stairs.test.js that P0a left for you);
  - the structural walls in P1 as a post-pass in north-towers.js;
  - two rescue panels on 7F;
  - medium-intensity red obstruction lights on T2;
  - the far stand-in and night layer spec;
  - zones;
  - the sky-lobby pins (sky-lobby.test.js per §4);
  - tests/campus-deltas/north.js.

**DECISIONS round 2, Q3 (overrides SPEC §0.8-9 and §1.1's one-curtain-wall default):**
- Keep today's punched windows and open 观江阳台 on the kept floors below 100 m: 8F–23F, everything below the 24F refuge band. Do not enclose those balconies.
- Use the curtain wall only on the new floors above (25F and up) and on the crown, with P0b's splitFacade / transitionBand at the change.
- Kept homes keep their plans and interiors (byte-identical in plan data apart from refugeRoom / spec).

**Budget:**
- SPEC's "北苑 ≤ 1.6 MB" assumed a full curtain wall. With Q3 your target is **北苑 resident geometry ≤ today's 3.36 MB**.
- The existing community cap (≤ 10 MB, today 9.979 MB) must stay green **in your worktree on its own**: 西苑 is unchanged there; P-west lowers it in parallel.
- Find savings within your own files, e.g. instance the repeated curtain-wall storeys and share balcony / window geometry.
- Raise a cap only as a last resort, with a written justification (DECISIONS round 2 allows "or the budget change must be justified"), and report it in problems.

**Also fix (open task):** the roof wayfinding board at the 方庭 glass-lift exit on the P1 roof (rf.skySigns, the GW roof exit). From that exit its post hides part of 「北」 in 「云澜·北苑」. Move or offset the post, or the board, so the text reads clearly from the exit.

**Shots** (port 5512), saved to ${S}/supertall-shots/north/:
- north-pair-river.jpg (re-framed step);
- north-T1-24F-refuge-cutaway.jpg;
- north-T1-crown-terrace.jpg;
- north-T1-LF-keypad.jpg;
- north-T1-rail.jpg;
- north-night.jpg;
- north-transition-100m.jpg (close view of where the punched façade meets the curtain wall);
- north-gw-sign.jpg (the fixed wayfinding sign).`,
  },
  {
    key: 'west', port: 5513, name: 'P-west — 云澜·西苑 W1 (47F) / W2 (44F)',
    scope: `SPEC §1.2 (west.md S47), the P-west block in §5.3, the west rows of §4, and the C-n items the Resolution log assigns to P-west.

**SPEC builds both towers as S47. DECISIONS round 2, Q1 overrides that: W2 is 44F, 3 floors lower.**
- **W1:** 47F, 50 levels (B2–47F + RF). 47F @ 142.5, RF 145.5 m, crown 156.5 m.
- **W2:** 44F, 47 levels (B2–44F + RF). 44F @ 133.5, RF 136.5 m, crown about 147.5 m. Check these against the stack formulas in west.md / spec-calc.
- **Both:**
  - refuge floors 16F @ 46.5 and 31F @ 93.0;
  - 3梯5户 on every home floor, 5 different plans per floor (2BR, 3BR and 4BR on every floor of every family);
  - 6 lifts in 2 banks. Low: L1 L2 F1 at 3 m/s, 2F–31F. High: H1 H2 F2 at 4 m/s, 31F–RF, ordered F2 · H2 · H1, with a lobby ≥ 3.5 m.
- **Homes:** W1 44 home floors = 220 homes; W2 41 home floors = 205 homes; **西苑 425 homes** (SPEC said 440).
- **Recompute for W2:**
  - its lift stops (the high bank ends at 44F + RF);
  - fire-lift run times (≤ 60 s);
  - the top-occupied-floor check;
  - the label-declutter pin;
  - every pinned total: SPEC §4 west rows and your campus delta.
  - Record each W2 number in your doc, with the SPEC value it replaces.

**Also:**
- the 18.0 m core, with blank-wall landings where a bank passes;
- corridor 前室 doors;
- families A / B / C and their plan data;
- W2 family B with a 4BR in SE (C-10);
- instanced modules, bands, crown, far stand-in and night layer in community-west.js;
- the S47 roof garden (W2's roof sits 9 m lower);
- 住户专区 signs;
- the 1F stair-door assertion (C-3);
- zones;
- tests/campus-deltas/west.js.

**Budget:** west near ≤ 36 meshes per tower; both towers ≤ 140k triangles; far ≤ 1,500 triangles by day plus the night layer. **West's resident bytes must end below today's (2.81 / 2.90 MB per tower)**. The merge relies on this saving, because 北苑 keeps its punched façade.

**Shots** (port 5513), saved to ${S}/supertall-shots/west/:
- west-pair.jpg (shows the 3-floor step);
- west-W1-1F-two-banks.jpg;
- west-W1-31F-refuge.jpg;
- west-W1-40F-high-zone-lobby.jpg (3 doors + blank wall);
- west-W1-rail.jpg;
- west-W2-rail.jpg;
- west-night.jpg.`,
  },
  {
    key: 'r', port: 5514, name: 'P-R — 二期 云澜汇楼盘 R1–R4 to 200 / 189.8 / 179.6 / 169.4 m',
    scope: `SPEC §1.3 (p2.md), the P-R block in §5.3, the R rows of §4, and the C-n items the Resolution log assigns to P-R. Expansion layout only; the compact R stays 30-storey.

**Targets (§0.1):**
- R1 / R2 / R3 / R4: 53 / 50 / 47 / 44 storeys;
- RF 186.7 / 176.5 / 166.3 / 156.1 m;
- crown 200.0 / 189.8 / 179.6 / 169.4 m;
- refuge floors 14F @ 45.6, 27F @ 90.9 and 40F @ 137.1 (outrigger + belt trusses on 27F / 40F).
- **Homes:** the 17.6 × 14.3 m core replaces the north 03 wing. 2 south homes per floor. 96 / 90 / 84 / 78 homes (records 98 / 92 / 86 / 80), with generated 顶层复式 penthouses on the top two floors.
  - P0a's penthouse spike **passed**: 4 distinct duplexes per wing. Use the procedural penthouses (generateDuplex with the wing hook); no fallback.
- **Lifts:** 4 per tower. L1–L3 passenger lifts at 5 m/s (L2 stretcher) stop at 51 / 48 / 45 / 42, without the penthouse upper level (C-35). LF fire lift at 5 m/s stops on every level, run ≤ 60 s.
- **Also:**
  - the split 前室 (C-20);
  - the 1F stair split and exit doors (C-3);
  - the east-turning R1 B1 arrival (C-8);
  - the south-half B2 ramp (C-27);
  - the GLB refuge-room tag (C-26);
  - gates Rn-1F/B1/B2-GATE and Rn-ST1/ST2-EXIT;
  - hardstands HS-R1…R4 (r-hardstand.test.js);
  - templates plus mid / far LOD and the night layer;
  - 2-variant interiors and lighting;
  - zones;
  - tests/campus-deltas/r.js, which removes R1–R4 from COMPACT_IDENTICAL.
- Only you edit inside the <supertall:R> regions of src/layout/hospitality.js and src/render/build/hospitality.js.
- **Short names:** P0a noted floorLabel uses b.short, today '住宅1'. Set the short names SPEC uses ('R1' …) if that is what the labels and tests want, and check the pick cards.

**Budget:** R unique ≤ 5 MB; near ≤ 45 meshes; mid ≤ 3 meshes ≤ 8k; far ≤ 2 meshes ≤ 1,500 triangles by day; campus ≤ 2,200 calls. Measure the river view; triangles ≤ 4.07 M, with today's H / A in your worktree.

**Shots** (port 5514), saved to ${S}/supertall-shots/r/:
- r-group-from-P2-roof.jpg;
- r-R1-27F-outrigger.jpg;
- r-R1-1F-gate.jpg;
- r-R1-LF-keypad.jpg;
- r-R1-rail.jpg;
- r-hardstands.jpg;
- r-PH-interior.jpg;
- r-night.jpg.`,
  },
  {
    key: 'ha', port: 5515, name: 'P-HA — 云澜酒店 H (48F, program R) and 云澜服务公寓 A (44F)',
    scope: `SPEC §1.4–§1.5 (hotel-apt.md v2), the P-HA block in §5.3, the H / A rows of §4, and the C-n items the Resolution log assigns to P-HA. Expansion layout only; the compact H / A stay as today.

**DECISIONS round 2, Q2: the hotel is program R.**
- 176 云澜酒店公寓 on the lower floors (3F–25F, with the 13F refuge floor between);
- the 27F 空中大堂 with check-in;
- 144 hotel keys above;
- 行政楼层 44F–46F, signed by zone, not by number;
- public floors 2F, 27F, 47F and 48F.
- 320 in all.

**H:**
- 48F, RF 185.4 m, lantern 194.2 m, helideck 196.8 m (view-only, C-32);
- refuge floors 13F @ 45.5, 26F @ 90.8 (8.6 m, with the plant mezzanine) and 37F @ 136.8;
- 13 lifts: RB 4 × 3.5 m/s, SH 3 × 6 m/s, HL 4 × 4 m/s, S1 / S2 fire + service. S1 is fireOnly at exactly 2F · 26F–48F · RF.
- 44 stair re-entry card doors on the 22 酒店公寓 floors.

**A:**
- 44F, RF 174.6 m, crown 184.6 m;
- refuge floors 13F / 26F / 39F;
- 272 serviced suites + 32 LOFT on A-40F…43F = 304;
- 2F 住客会所 and 44F 顶层空中会所 (both signed by zone);
- 7 lifts: L1–L5 at 5 m/s, S1 / S2;
- A-2F-LINK and A-ST2-EXIT.

**Both:**
- 8 suites per floor;
- step back from P1 for the 13 m separation above 100 m (A tower–P1 13.21 m: lock it in a test);
- the re-planned core and the 9.6 m stairs (C-1), and the re-planned basements (C-2);
- the occupant caps (C-25), the roof-structure test (C-33), the 22 × 19 m lanterns;
- the fire-road exception record (C-36);
- HS-H and the HS-A markings;
- 20 酒店短停 west-lot bays via supertallSitePass (C-7, C-24), at least 20 short-stay stalls;
- roof gardens retired;
- cars instanced;
- zones;
- tests/campus-deltas/ha.js, which removes H and A from COMPACT_IDENTICAL;
- re-pin the compact-scoped H / A lines in tower-stairs.test.js and suite-nav.test.js as SPEC §4 assigns.
- Only you edit inside the <supertall:HA> regions of src/layout/hospitality.js and src/render/build/hospitality.js. You own hospitality-supertall.js (layout and render), hospitality-lobby.js, suite-plan.js, suite-models.js and suite-interiors.js.

**Budget:** H / A unique exterior ≤ 1.6 MB together; 1F lobbies ≤ 5 MB; near ≤ 8 meshes and ≤ 45k vertices per tower; far ≤ 2 meshes and ≤ 2,000 triangles by day plus the night layer; campus ≤ 2,200 calls.

**Shots** (port 5515), saved to ${S}/supertall-shots/ha/:
- ha-H-tower.jpg;
- ha-H-27F-skylobby.jpg;
- ha-H-26F-refuge.jpg;
- ha-H-helideck-night.jpg;
- ha-A-gateway-xingwan-road.jpg;
- ha-H-shuttle-keypad.jpg;
- ha-H-rail.jpg;
- ha-A-40F-loft.jpg.`,
  },
]

const BUILD = p => `${CTX}
## Your task: supertall package ${p.name}
Port ${p.port}.

${SETUP(p.key)}

${OWN}

## Scope
${p.scope}

## Acceptance (SPEC §5.3 for your package, plus these)
- Your §4 rows are green, and the full suite is green (under the suite lock).
- fps-frozen is unchanged.
- checkRefugeStack is clean for each of your towers.
- The no-bypass harness passes with your towers registered:
  - with the gates closed, no public path reaches a gated floor;
  - with the gates open, every home floor reaches the ground.
- Fire-lift runs are ≤ 60 s, and stair flights are ≤ 18 risers.
- Your campus delta makes riverside-integration's counts match the layout.
- Your budgets are met, measured: Node-side byte / mesh counts plus one perf/measure.cjs campus run under the browser lock.
- **Every shot listed above is taken, and you looked at each one yourself.** Re-take weak ones. Check for:
  - z-fighting;
  - gaps between storeys;
  - floating or misaligned parts;
  - black instanced materials;
  - missing floors;
  - clipped labels;
  - LOD pops.

## Process
1. Read the docs listed in Context for your package and the P0 API docs before coding. Plan the change list in your doc first.
2. Layout first: records, nav, tests. Then render, then UI text, then shots and measure.
3. Write docs/supertall/${p.key}.md:
   - what was built;
   - the as-built numbers table against SPEC/DECISIONS;
   - deviations and why;
   - shared-file edits;
   - every changed test assertion with its reason;
   - items for P-int (catalog entries kept / changed / retired, tour steps, captions, README / HANDOFF facts).
4. **Final state:** everything committed on supertall/${p.key}, dist/ restored, \`git status\` clean. Do not remove the worktree: a reviewer and a fixer use it next.

Return the structured result. outputs/shots are absolute paths.`

const REVIEW = (p, built) => `${CTX}
## Your task: independent review of supertall package ${p.name}
Port ${p.port}. The package is built in ${WT(p.key)} on branch supertall/${p.key}, based on ${BASE}.

**You do not edit source, tests or docs in the worktree.** Write scratch scripts and shots under ${S}/review-st/${p.key}/. If you build dist/ in the worktree to look at it, restore it after: \`git -C ${WT(p.key)} checkout -- dist/\`.

The builder's report:
\`\`\`json
${JSON.stringify(built, null, 1)}
\`\`\`

The package scope, as the builder was given it:
${p.scope}

Review the package against SPEC (§1.x for these towers, §1.0, §4 rows, §5.3 acceptance) and DECISIONS, including the round-2 overrides. Find what is wrong, missing or fragile. Be adversarial: the builder's report claims things, so verify them.

1. **Diff** (\`git -C ${WT(p.key)} diff ${BASE}...HEAD\`). Look for:
   - correctness bugs;
   - unjustified deviations from SPEC/DECISIONS;
   - edits outside the ownership matrix that are not declared;
   - weakened or loosened tests: check every changed assertion and its reason;
   - hard-coded hacks;
   - any change that reaches the compact layout;
   - dead code;
   - Chinese text errors.
2. **Numbers.** Compute, from buildLayout({expansion:true}) in a Node script:
   - storeys, RF and crown;
   - refuge floors with elevations and spacing;
   - top-occupied-floor distance;
   - homes / keys per floor and in total;
   - lifts with roles, speeds and stops, and passed floors without landings;
   - fire-lift runs;
   - stair risers per flight;
   - gates, zones and hardstands.
   Compare them with SPEC §0.1 / §0.4–§0.7 and DECISIONS. Run:
   - checkRefugeStack;
   - the no-bypass harness;
   - fps-frozen;
   - the package's tests;
   - one full suite under the suite lock.
3. **Browser** (under the browser lock, your port). Build dist in the worktree, then restore it. Check:
   - **Exteriors**, day and night: campus overview, the river / 星湾桥 view, and close views of the façade, refuge bands and crown.
   - **Inside, in explore mode:**
     - a refuge floor;
     - the lobby: walk to a card gate; does it block without a card, and does E open it?
     - a home or suite floor;
     - the lift keypad: zones, refuge key confirm, greyed fireOnly landings;
     - a ride with the HUD real time and Space to skip;
     - the floor rail.
   - **Visual bugs:**
     - z-fighting;
     - gaps between kept and new storeys;
     - floating or misaligned parts;
     - black instances;
     - wrong materials;
     - missing floors in the rail;
     - clipped labels;
     - LOD pop;
     - the shadow radius.
   - Look at each of the builder's shots too.

**For every finding**, give:
- id: ${p.key.toUpperCase()}-R1, ${p.key.toUpperCase()}-R2, …;
- severity: blocker / major / minor / nit;
- where: file:line, or a view;
- evidence: a command plus an output excerpt, or a screenshot path you took;
- a suggested fix.

Report only what you reproduced. Also list what you checked that is OK.`

const FIX = (p, built, review) => `${CTX}
## Your task: fix stage for supertall package ${p.name}
Port ${p.port}. Work in ${WT(p.key)} on branch supertall/${p.key}. That is the builder's worktree; keep its work.

${OWN}

The builder's report:
\`\`\`json
${JSON.stringify(built, null, 1)}
\`\`\`

The independent reviewer's findings:
\`\`\`json
${JSON.stringify(review, null, 1)}
\`\`\`

The package scope:
${p.scope}

**For each finding:**
1. Reproduce it first.
2. If it is real, fix it properly.
3. If it is not, mark it rejected with the evidence.
- Fix every blocker, major and minor. Fix nits when cheap.
- Defer only what needs another package's file, and say which file and what change.
- Then:
  - re-run the affected tests and one full suite (under the suite lock);
  - re-check fps-frozen and the no-bypass harness;
  - re-take every shot the fixes affect (look at each one);
  - update docs/supertall/${p.key}.md with a "review fixes" section;
  - commit on supertall/${p.key}.
- **Final state:** dist/ restored, \`git status\` clean, worktree kept for the merge.

Return the structured result. findingOutcomes covers every finding id.`

const MERGE = results => `${CTX}
## Your task: merge the four supertall tower packages into claude/wonderful-thompson-olaaxb, verify everything, push
Work in the main checkout ${REPO}, which is at ${BASE} and clean. Port 5516.

The packages' final reports (null means a package did not finish; merge the others and report it):
\`\`\`json
${JSON.stringify(results, null, 1)}
\`\`\`

1. **Merge order:**
   - supertall/west first, because its byte saving frees room for 北苑's kept punched façade;
   - then supertall/north, supertall/r and supertall/ha.
   - Use \`git merge --no-ff\`. Expected conflicts are limited: the two hospitality.js files (separate regions), possibly shared-file edits the reports list, and test files.
   - Resolve each conflict by keeping both packages' intent.
   - After each merge, run that package's own tests and fps-frozen. Commit any fix-up as its own commit.
2. **Then verify the whole** (the machine should be quiet now):
   - The full suite: \`node --test --test-concurrency=3 tests/*.test.js\`, all green, with the time recorded (budget ≤ 300 s).
   - fps-frozen.
   - The no-bypass harness with all towers.
   - riverside-integration: the campus-delta sum equals the layout.
   - **Totals.** Recompute them from buildLayout and compare with SPEC §0.7, adjusted for round-2 Q1 (W2 44F: 3 fewer levels and 15 fewer homes, so 西苑 425). Explain every difference.
   - **The stack table from the layout** against \`python3 -I ${ST}/spec-calc/final.py\` (W2 differs by Q1).
   - **Budgets (SPEC §2.3).**
     - Node-side: community resident ≤ 10 MB, the ten towers' unique exterior ≤ 14 MB, nav heap and CPU.
     - Then \`npm run build\`, dist/mall.html ≤ 81 MB, and perf/measure.cjs at high, under the browser lock, on **all** views: campus, campusTall, river, N1, R1, P1-RF viewdeck, P2 roof, 西苑 step.
     - Compare with the P0 numbers in docs/supertall/p0-merge.md and p0b.md.
3. **Skyline shots** of the merged build, saved to ${S}/supertall-shots/towers-merge/:
   - campus overview, day and night;
   - campusTall (149, 641, 648) → (0, 60, 0);
   - the 星湾桥 re-framed step (192, 116, −638) → (−120, 74, −300);
   - eye level from the far bank (−196, 1.7, −446) → (−215, 70, −245);
   - 星湾路 at 北外环, looking S.
   Look at each one and list visible problems: clashes between packages, wrong heights, LOD pops, dark towers at night, shadows clipped.
4. **Write docs/supertall/towers-merge.md:**
   - merges and conflicts;
   - fix-ups;
   - totals;
   - the stack table;
   - budgets for every view;
   - shots;
   - the open items for the integration step: from every package's forPint, plus the P0-merge leftovers (on desktop the building-tab grid draws over the scrolled floor rail; the pressed rail row lacks the white pill).
5. **Finish:**
   - commit (not dist/: restore it, because the integration step rebuilds it);
   - push to claude/wonderful-thompson-olaaxb (retry network failures up to 4 times with backoff);
   - remove the four worktrees (\`git worktree remove\`) and delete the local supertall/* branches, after the push succeeds.
   - Leave \`git status\` clean.

Return the structured result: summary, numbers (totals and budgets), problems (everything still open, with severity), shots in forPint/shots.`

phase('Build')
const results = await pipeline(
  PKGS,
  p => agent(BUILD(p), { label: `build:${p.key}`, phase: 'Build', schema: PKG_SCHEMA }),
  (built, p) => built
    ? agent(REVIEW(p, built), { label: `review:${p.key}`, phase: 'Review', schema: REVIEW_SCHEMA }).then(r => ({ built, review: r }))
    : null,
  (br, p) => br
    ? agent(FIX(p, br.built, br.review || { findings: [], note: 'review agent failed; self-review against SPEC instead' }), { label: `fix:${p.key}`, phase: 'Fix', schema: FIX_SCHEMA })
        .then(f => ({ pkg: p.key, built: br.built, review: br.review, fixed: f }))
    : null,
)

const byPkg = {}
PKGS.forEach((p, i) => { byPkg[p.key] = results[i] ? { fixed: results[i].fixed, reviewSummary: results[i].review && results[i].review.summary } : null })
log(`packages finished: ${PKGS.filter((p, i) => results[i] && results[i].fixed).map(p => p.key).join(', ') || 'none'}`)

phase('Merge')
const merged = await agent(MERGE(byPkg), { label: 'merge:towers', phase: 'Merge', schema: PKG_SCHEMA })

return { packages: results, merged }
