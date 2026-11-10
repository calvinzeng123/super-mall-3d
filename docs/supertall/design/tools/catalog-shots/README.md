# 户型目录渲染工具 (home catalog shooter)

One headless Chromium session; a JSON list of shots in, 1280x800 JPEGs (quality 0.88) and one
JSON line per shot out. It re-opens the page after a crash, a hung shot (7 min) or a blank image
and retries each shot once. Geometry comes from the page's own layout (`window.__mall.ctx.layout`),
so the framing always matches what is rendered.

Directory: `/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/catalog/tool/`

| file | role |
| --- | --- |
| `shoot.cjs` | the runner (Node, CommonJS; Playwright from `/opt/node-tools`) |
| `plan-core.js` | pure planner: unit lookup, world bounds, top camera, room pick, standing points (runs in the page and in Node) |
| `cat-helpers.js`, `vr-helpers.js` | injected into the page: `window.__cat` (top / interior shot, ray probe, image stats) and `window.__vr` (first-person go / look / idle) |
| `list.mjs` | prints, without a browser, every residence unit on a level: unit id, home, plan, world bounds, top camera, living / master standing points |
| `gen-spec.mjs` | writes a spec with top + living interior (+ master for 4+ bedrooms) for every unit on the given levels |
| `door-leaves.mjs` | lists where each interior door leaf is drawn (for the 竖着的门板 bug) |

## Command

```bash
T=/tmp/claude-0/-home-user-super-mall-3d/696de14d-a14b-56e5-8956-2ce14976e3b6/scratchpad/catalog/tool
cd $T
node gen-spec.mjs T1-8F T1-9F T1-10F > /path/shots.json      # or write the spec by hand
node shoot.cjs --spec /path/shots.json --out /path/renders --port <your port> > /path/run.log 2>&1
```

Options: `--port N` (default 5302; the runner starts `python3 -m http.server N --directory <repo>`
itself if nothing listens there and kills it at the end), `--repo DIR` (directory to serve, default
`/home/user/super-mall-3d`; it must contain `dist/mall.html`), `--url URL` (page URL, default
`http://127.0.0.1:N/dist/mall.html`), `--no-serve`, `--log FILE` (default `<out>/shots.log.jsonl`,
appended), `--jpeg 0.88`, `--preset balanced` (quality preset), `--only name1,name2`,
`--skip-existing`, `--shot-timeout 420` (seconds).

Exit code 0 = every shot written, 1 = some shot failed (see the log), 3 = fatal (page never loaded).
It runs ONE browser; the page loads in about 20 s, the first shot then waits about 60 s for the
residential assets, later shots take 3 to 10 s each. It waits before launching while
MemAvailable < 3 GB. Run it in the foreground with a generous Bash timeout (a 60-shot run is
about 10 min) or in the background and poll the log.

## Spec format

A JSON array (or `{ "shots": [...] }`). Every shot has `name` (file = `<out>/<name>.jpg`) and `kind`.
A home is addressed by **`unit`** (the unit id on one level, `<building>-<n>F-<slot>`, e.g.
`W1-12F-SW`, `T1-17F-W`) or by **`home` + `level`** (e.g. `{"home": "T1-16W", "level": "T1-17F"}`
picks the part of duplex T1-16W on 17F).

| kind | fields (optional ones in brackets) |
| --- | --- |
| `top` | `unit` or `home`+`level`; [`fill` 0.85, `tilt` 15, `lift` 0, `steps` 2, `hide` [building ids], `hideOthers` true, `bounds` {x0,x1,z0,z1}, `pos`+`target` to override the camera] |
| `interior` | `unit` or `home`+`level`; [`room` 'living' / 'master' / a room id, `side` 'N'/'S'/'E'/'W' (unit-local side to face), `mode` 'face'/'diag', `pitch` -0.08, `stand` [x,z] + `look` [x,z] world to override, `maxTries` 14] |
| `master` | same as `interior` with `room: 'master'`, `mode: 'diag'`, `pitch: -0.22` |
| `explore` | raw first person: `level`, `stand` [x,z], `look` [x,z], [`pitch` 0, `unit`] |
| `orbit` | raw orbit: `pos` [x,y,z], `target` [x,y,z], [`focus` level id, `night`, `steps`] |

Example (north parts):

```json
[
 {"name": "T1-16W-16F-top",       "kind": "top",      "unit": "T1-16F-W"},
 {"name": "T1-16W-16F-interior",  "kind": "interior", "unit": "T1-16F-W"},
 {"name": "T1-16W-U-17F-top",     "kind": "top",      "home": "T1-16W", "level": "T1-17F"},
 {"name": "T1-16W-U-17F-interior","kind": "interior", "home": "T1-16W", "level": "T1-17F"},
 {"name": "T1-16W-U-17F-master",  "kind": "master",   "unit": "T1-17F-W"},
 {"name": "T1-15E-U-16F-family1", "kind": "interior", "unit": "T1-16F-E", "room": "family_1"}
]
```

File naming used for the catalog: `<plan>-<NN>F-top.jpg`, `-interior.jpg`, `-master.jpg`, where
`<plan>` is `residence.plan` (`W1-SW`; north: `T1-10W`, `T1-16W` for a duplex's lower part,
`T1-16W-U` for its upper part). `gen-spec.mjs` writes exactly these names.

### North unit ids (T1 and T2 are the same)

`T1-8F` .. `T1-13F`: flats `T1-<n>F-W` (plan `T1-<n>W`) and `T1-<n>F-E` (plan `T1-<n>E`).
`T1-14F`: `E` = single-level `T1-14E`, `W` = lower of duplex `T1-14W`.
`T1-15F` .. `T1-23F`: each floor holds one lower part and one upper part, e.g. `T1-16F`: `W` = lower
of `T1-16W` (plan `T1-16W`), `E` = upper of `T1-15E` (plan `T1-15E-U`).
`T1-24F`: `W` = single-level `T1-24W`, `E` = upper of `T1-23E` (plan `T1-23E-U`).
`node list.mjs T1-16F` prints the unit ids and home ids of a floor.

## Getting the geometry without a browser

```bash
node list.mjs T1-17F            # human-readable
node list.mjs --json T1-17F     # JSON
```

prints per unit: `bounds` (world AABB of the unit footprint, from `unit.polys[0]`), `floorY`
(`level.elev`), the `top` camera, and for `living` and `master` the room chosen, which compass
direction it faces, why (`window` / `balcony` / `nearest-exterior` / `forced`), and the first
standing point `stand` and look target `look` (world x,z). The runner tries the further candidates
from `__catPlan.standCandidates()` if the first one is blocked.

## Framing rules

**Top (a).** Orbit mode, daytime, labels off, `app.setFocus(<level id>)` so every floor above is cut
away (a duplex's upper storey is hidden when its lower storey is focused; focusing an upper part
shows the lower one through the stair hole). Every other tower within 60 m of the home is hidden
for the shot (`hidden` in the log, e.g. W2 when shooting W1, T2 when shooting T1). Camera:
`pos = (cx, floorY + H, cz + H*tan(15deg))`, `target = (cx, floorY, cz)` (+`lift`), so north (-z) is
up in the image. `H = dist*cos(15deg)` with
`dist = max(W / (2*tan(hfov/2)*fill), D*cos(15deg) / (2*tan(vfov/2)*fill))`, W/D = the
x/z extents of the home's world bounds, vfov = the orbit camera's 42 deg, fill = 0.85.
The log's `screen.floor` / `screen.wallTop` give where the floor rectangle and the wall tops land in
the image (0..1, y down); typical: floor y 0.11..0.97 for the 16 m-deep north homes (the north wall
tops just touch the frame top; use `"fill": 0.8` if you want more margin).
In north-row west homes (W?-NW, W?-NE) the entry is at the bottom of the image, because north is up.

**Interior (b).** Explore mode, eye = floor + 1.62 m (`NAV.eye`; HUD/explore fixed). Room: the
largest `living`, else the largest `family` (upper duplex parts), else the largest room that is not
a hall/stair/void/balcony. Side to face: the room's exterior `windows` (longest edge), else the
balcony it opens onto, else its side nearest the exterior. Stand: 0.7 m inside the opposite edge,
centred (then laterals +-0.3/0.55 of the half width, insets 1.1/1.5/0.45/2.0 m, then a free-point
grid), never within 0.3 m of a bed or plan obstacle; look 5 m beyond the window line, pitch -0.08.
Each candidate is checked by a ray probe from the eye (forward >= 1.3 m, +-25 deg >= 0.6 m, down
ray must hit the floor, i.e. not standing over furniture); the first clear one is shot.
**Master (c)**, for homes with 4+ bedrooms: `bed_master` (else a room named 主卧, else the largest
bedroom), mode `diag`: from a far-side corner aimed between the bed and the window centre,
pitch -0.22. Note the lower part of a north duplex has no master suite (it falls back to 长辈房 /
客房); shoot the master on the upper part's level.

## Log (`shots.log.jsonl`, one JSON object per line)

`name, file, ok, attempt, secs, spec, stats {mean, std, blank}` and

* top: `cam {pos, target, H, dist}, hidden, focus, bounds, screen, unit, code, plan, label, resLoaded`
* interior / master / explore: `level, room {id, kind, name, local, world}, side, faces, why, stand,
  look, eye, floorY, yaw, pitch, clear, tries, probe, hud {where, mode, prompt, toast, card},
  unitAt {unit, code, home, plan}, roomAt {id, name, kind}, resLoaded`
* failures: `ok: false, err`. `errors` = page errors / console errors during the shot.

**HUD check:** `hud.where` names the tower and floor only (e.g. `云澜·北苑 1 号楼 · 17F 错层复式`,
`云澜·西苑 2 号楼 · 12F 五户住宅`), never the home; `hud.card` (centre pick) was always null inside
homes. The home is verified by `unitAt` (point-in-footprint of the eye position on that level) and
`roomAt`; both must name the requested unit and room. Check `clear: true` and `resLoaded: true`.

## Checks after a run

Look at every image. Reshoot (same spec with `--only <name>`, optionally with `stand`/`look`/`side`/
`room`/`fill` overrides) when an image is black or blank (`stats.blank`), on the wrong home
(`unitAt`), blocked by a wall or furniture, or shows the floor above.

## Gotchas

* Do not run two browsers at once on this machine; kill only your own PIDs (`pgrep -af shoot.cjs`).
* Residence detail is cached for 3 floors (plus duplex companions); the runner waits for
  `__mall.residenceCache` to include the level before every shot.
* `debugShot` asks for JPEG 0.86; `cat-helpers.js` overrides it to `--jpeg` via `toDataURL`.
* Windows carry a facade "drawn-back curtain" (flat cream pane, 0.5 m wide) inside the glass, and
  the dresser mirror is drawn with the glass material (a pale translucent square on the wall); both
  are expected render features, not framing problems.
