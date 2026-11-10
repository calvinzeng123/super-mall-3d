# CODES · 云澜汇 ~200 m 超高层延伸 — the rulebook

Study label `supertall`, 2026-11-05. This is a design study against `/home/user/super-mall-3d`, branch `claude/wonderful-thompson-olaaxb` at `cc917a7`. Nothing in the main checkout was changed and nothing was committed.

**Scope:**
- 一期: 云澜·北苑 T1/T2 (on the P1 roof), 云澜酒店 H and 云澜服务公寓 A.
- 西区住宅: 云澜·西苑 W1/W2.
- 二期住宅区: 云澜汇楼盘 R1–R4.

**User choice:** "做成 200 m 左右的超高层" (about 55–65 storeys, more lifts, refuge floors).

**Built on top of the parallel workflow.** This rulebook assumes:
- the 北苑 7F 空中大堂 + club, with the P1-RF ⇄ T-7F portals and the T1/T2-7F-GATE speed gates;
- door leaves as layout records.

None of the rules below undo them.

**How to read the citations:**
- **✔** = checked against the code text during this study:
  - GB 55037-2022: full text.
  - GB 50016-2014 (2018 ed.): full text.
  - JGJ 3-2010: tables 3.3.1-1/2, 3.3.2, 11.1.2 and 11.1.3, and clauses 3.3 (commentary), 3.7.3, 3.7.6, 9.2.1, 10.3 and 10.6.
- **≈** = from memory or from a secondary source. It is right in substance, but check the clause number before quoting it to a reviewer.

Measured facts come from `buildLayout({expansion:true})` in a scratch worktree. The worktree has since been removed. The scripts are in `calc/` next to this file.

---

## 0. Design rules — the one page the tower designers follow

| # | Topic | Rule (what to build) | Basis |
|---|---|---|---|
| 1 | **Height and class** | Building height is measured from 室外设计地面 to the 屋面面层. Rooftop plant and stair or lift houses are not counted if they cover ≤ ¼ of the roof. **北苑 is measured from grade, not from the P1 roof.** Every tower above 100 m is 超高层 and 一类高层. | GB 50016 App. A.0.1 ✔; Table 5.1.1 ✔; GB 50352-2019 §3.1.2 ≈ |
| 2 | **Refuge floors: where** | Required above 100 m.<br>• First refuge floor: floor level **≤ 50 m** above the fire hardstand (mandatory). Design it at **44–48 m**.<br>• Next refuge floors: **≤ 50 m** apart. Design them **45–48 m** apart.<br>• Top occupied floor: ≤ 50 m above the last refuge floor (practice).<br>• Typical levels: **≈ 46 / ≈ 93 / ≈ 140 / (≈ 187) m**. That is 2 refuge floors for a roof ≤ ~145 m, 3 for ≤ ~190 m and 4 at ~200 m.<br>• **北苑 7F (34 m, sky lobby) cannot be a refuge floor.** The first one goes at 9F–10F (≈ 42–46 m). | GB 55037 §7.1.14 ✔; GB 50016 §5.5.23-1 ✔, §5.5.31 ✔ |
| 3 | **Refuge floors: what** | Only the refuge area (避难区) plus plant. **No homes, club, gym, lobby or kids' room.**<br>• Pipe zones: 3.00 h walls. Shafts and plant rooms: 2.00 h walls. They connect to the refuge area only through a 防火隔间 with 甲级 doors.<br>• Required: a fire-lift door, hydrant + hose reel + extinguisher, fire phone, PA, and lit floor/refuge signs at every stair door.<br>• **The refuge area sits on the hardstand face.** At least one side of it must project onto the hardstand. | GB 55037 §7.1.15-1…6 ✔; GB 50016 §5.5.23-4…8 ✔ |
| 4 | **Refuge floors: size and look** | **Net refuge area** ≥ (people on all floors served) ÷ **5 p/m²**. Count people per home: 2BR 3.0, 3BR 4.0, 4BR 5.0; hotel 2/key; serviced apartment 2/unit. That gives ~30–80 m²; the rest of the floor is plant.<br>**Floor-to-floor height:**<br>• 4.5 m: refuge + light plant.<br>• **5.4–6.0 m**: with an outrigger/belt truss or AHUs.<br>**Façade:**<br>• refuge area: openable **乙级 fire windows**;<br>• plant: rain-louvre band;<br>• natural ventilation ≥ 2 % of the floor area, on ≥ 2 orientations, each ≥ 2 m².<br>It reads as a 4.5–6 m louvre band every 13–15 storeys. | GB 55037 §7.1.15-1 ✔, §6.4.7-2 ✔; GB 50016 §5.5.23-3,9 ✔; GB 51251-2017 §3.2.3 ≈ |
| 5 | **Stairs at refuge floors** | Every stair must make evacuees **pass through the refuge area**: 分隔, 同层错位 or 上下层断开. This is the only floor where a stair may change plan position.<br>Engine: a stair is not `continuous` across a refuge floor. Split it into two runs joined by a walk through the refuge area. | GB 55037 §7.1.9 ✔; GB 50016 §5.5.23-2 ✔, §6.4.4 ✔ |
| 6 | **Lifts at refuge floors** | **Fire lifts open on every refuge floor.**<br>Passenger and private lifts **pass through with no landing door** (practice: no rule asks them to stop, and the refuge area must be smoke-tight). Their panels have no button for the refuge floor. | GB 55037 §7.1.15-3 ✔, §7.1.15-5 ✔ |
| 7 | **Household refuge room (>54 m)** | Every home in 北苑, 西苑 and R gets one room on an external wall with an openable window:<br>• walls ≥ 1.00 h;<br>• door 宜 **乙级防火门**;<br>• window integrity 宜 ≥ 1.00 h.<br>→ Pick one bedroom per home, preferably on the hardstand face, and tag its door leaf `fire:'乙级'`. | GB 50016 §5.5.32 ✔ (not carried into GB 55037) |
| 8 | **Fire lifts** | • **≥ 1 per fire compartment.** Every storey here is one compartment, so each floor needs ≥ 1.<br>• Stops at **every floor of its served zone**, refuge floors included. Zoned fire lifts are allowed.<br>• ≥ 800 kg. Use **1,000–1,050 kg with a 2.1 m-deep car**, which also serves as the residential stretcher lift.<br>• **首层 → top ≤ 60 s**: **≥ 3.0 m/s to 160 m, ≥ 4.0 m/s to 190–210 m**.<br>• 前室 ≥ 6 m², short side ≥ 2.4 m. 合用前室: residential ≥ 6 m², public ≥ 10 m². Scissor 三合一 ≥ 12 m².<br>• At ground: direct to outside, or through a protected passage ≤ 30 m.<br>• **北苑: 首层 = P1-1F (0 m)**, and LF has **no doors on P1-2F–6F**. | GB 55037 §2.2.6 ✔, §2.2.8 ✔, §2.2.10 ✔, §7.1.8-7 ✔; GB 50016 §7.3.5 ✔, §7.3.8-3 ✔ (宜), §5.5.28-4 ✔; GB 50096 §6.4.2 ≈ |
| 9 | **Passenger lifts** | • ≥ 2 lifts in 12F+ residential, one of them stretcher-sized.<br>• Stop every floor, or skip ≤ 2 floors (北苑's alternate-floor private lifts are fine).<br>• ≤ 4 in a row, ≤ 2 × 4 facing.<br>• Lobby depth ≥ the deepest car and ≥ 1.5 m.<br>Sizing is in §4.4. In short:<br>• **西苑: 2 zones × 3 lifts** (each floor still sees 3 = 3梯5户);<br>• **R: 4 lifts at 5 m/s** (4梯3户);<br>• **北苑: private lift per home stack at 4–6 m/s + fire lift**;<br>• **H: 6 guest lifts at 6 m/s + 3 service lifts**;<br>• **A: 6 lifts at 6 m/s + 2 service lifts**. | GB 50096 §6.4.2/6.4.4/6.4.5 ≈; GB 50352 §6.9.1 ≈ |
| 10 | **Fire mode and card gates** | • All non-fire lifts recall to 首层 / 转换层.<br>• Card readers are bypassed. The fire-service switch is at the ground-floor fire lift.<br>• **Speed gates and card doors on escape routes release automatically on alarm** and open from inside without tools. Homes' own doors are exempt. | GB 55037 §7.1.7 ✔, §2.2.10-4 ✔; GB 50116 §4.7.1 ≈ |
| 11 | **Stairs** | • Residential above 33 m and every 一类高层公共: **防烟楼梯间**.<br>• Above 54 m: **≥ 2 exits per floor**. A scissor pair counts as 2 if every home/room door is ≤ 10 m from it (residential 前室 may be shared ≥ 6 m²; public 前室 separate).<br>• Flights ≥ 1.1 m net. 前室: residential ≥ 4.5 m², public ≥ 6 m².<br>• Above 100 m: stair, 前室 and fire-lift doors are **甲级**.<br>• Hotel: room door ≤ 30 m from an exit (37.5 m with sprinklers); dead-end ≤ 15 m (18.75 m). | GB 55037 §7.3.1-2 ✔, §7.3.2-3 ✔, §7.4.4 ✔, §7.1.4 ✔, §7.1.8-7 ✔, §6.4.3 ✔; GB 50016 §5.5.10 ✔, §5.5.28 ✔, Table 5.5.17 ✔ |
| 12 | **Compartments and other >100 m triggers** | • Compartment ≤ 1,500 m², or 3,000 m² with sprinklers → **one compartment per storey** in every tower. H/A at 2,812 m² is close, so **do not enlarge their plates**.<br>• Sprinklers and fire alarm in residential above 100 m.<br>• Floors ≥ 2.00 h.<br>• Residential external insulation **A级** above 100 m.<br>• **Kids' rooms only on 1F–3F**: none on sky or refuge floors. | GB 55037 §4.3.16 ✔, §8.1.9-3 ✔, §8.3.2-3 ✔, §5.1.3 ✔, §6.6.6 ✔, §4.3.4 ✔ |
| 13 | **Fire-truck access** | • Hardstand ≥ **20 × 10 m**, **5–10 m** from the façade, slope ≤ 3 %, rated for a heavy fire truck.<br>• Continuous along ≥ one long side, with no podium > 4 m deep in between, and a stair entrance at the hardstand.<br>• **Rescue windows** ≥ 1.0 × 1.0 m on every floor from 3F, ≥ 2 per compartment on the rescue face.<br>• Fire roads: residential ≥ 1 long side; **H and A (public) on 2 long sides**.<br>• Status: 北苑 HS1/HS2 ✓, 西苑 fire road ✓; **R, H and A hardstands are not modelled yet**. | GB 55037 §2.2.2 ✔, §2.2.3 ✔, §3.4.3 ✔, §3.4.6–7 ✔; GB 50016 §7.2.1–7.2.2 ✔ |
| 14 | **Helipad** | **H and A**: public, > 100 m, standard floor 74 × 38 = 2,812 m² > 2,000 → **宜**: provide a roof helipad or helicopter rescue platform.<br>• ≥ 5 m from rooftop protrusions;<br>• ≥ 2 exits;<br>• obstruction and emergency lights;<br>• hydrant.<br>Mandatory only above 250 m. Residential towers do not need one. | GB 50016 §7.4.1–7.4.2 ✔; GB 55037 §2.2.11–12 ✔ |
| 15 | **Separation** | A building above 100 m must be **≥ 13 m from any high-rise, with no reductions allowed**. A podium (裙房) may be closer.<br>**H–P1 = 5.97 m and A–P1 = 7.01 m → BLOCKER**: above their podium, set H and A back ≥ 13 m from P1. T1–T2 = 14.0 m ✓, R gaps 24 m ✓, W1–W2 22.6 m ✓. | GB 55037 §3.3.1–3.3.2 ✔; GB 50016 §5.2.6 ✔ |
| 16 | **Structure flags** (7度 0.10g assumed) | Using H/B limits of 6 (shear wall), 7 (frame-core) and 8 (tube-in-tube):<br>• **北苑 T1/T2 🔴 at 200 m**: H/B 12.5 from grade, 10.4 above the podium. Credible cap **RF ≈ 145–150 m** (H/B 7.0–7.3 above the podium); 162 m is the outer bound.<br>• **西苑 🔴 at 200 m**: H/B 10.4. Cap **≈ 145–150 m** with the catalogued 19.2 m slab, or rebuild as a **≤ 27 m-deep slab** (H/B 7.4 at 200 m).<br>• **R1–R4 🟡/🟢**: H/B 6.3 on the plate. Needs a **central core (~17 × 12 m)** replacing the north-facing 03 home, plus SRC/CFST columns.<br>• **H, A 🟢**: H/B 5.3. Needs a **central core** and outriggers at the refuge floors.<br>• **All ~200 m towers are 超限高层** (special seismic review). That is normal. | JGJ 3 Tables 3.3.1-1/2, 3.3.2, 11.1.2/3 ✔; §3.3.2 commentary ✔; 建质〔2015〕67号 ≈ |
| 17 | **"200 m" = main roof ≤ 190 m + crown** | JGJ 3 measures structural height to the **main roof**, and the crown is excluded. A main roof ≤ 190 m keeps an SRC/CFST frame + RC core within Table 11.1.2 at 7度. A 10–15 m 屋顶构架 makes it read as 200 m. | JGJ 3 Table 11.1.2 ✔ + note |
| 18 | **Outriggers live on refuge floors** | Outrigger (伸臂) and belt (腰/环带) trusses use the refuge/plant storeys:<br>• 1 level → ~0.6 H;<br>• 2 levels → roof + ~0.5 H;<br>• more → evenly from the top down.<br>Columns and walls at and next to those floors go up one seismic grade. | JGJ 3 §10.3.1–10.3.3 ✔ |
| 19 | **北苑-specific** | • 大底盘双塔: no transfer floor in the tower just above the P1 roof; the cores and columns go straight down through P1.<br>• The duplexes must stay **跃层 with aligned slabs**. Structural 错层 caps the height at 80 m.<br>• At each refuge floor the interlock must end and restart with one **single-level home**, like today's 14E / 24W. | JGJ 3 §10.6.3 ✔, §10.1.3/§10.4 ≈ |
| 20 | **Roof** | • High-level fire tank: residential above 100 m ≥ 36 m³; public above 100 m ≥ 50 m³ (≥ 100 m³ above 150 m).<br>• Fire-water transfer tanks and pumps every ~100 m, on refuge floors.<br>• Stair pressurisation split into ≤ 100 m segments, with fans on refuge floors.<br>• Also: lift machine rooms (≥ 4 m/s), BMU (擦窗机) and track, obstruction lights, crown, and a TMD for the slender towers. | GB 50974 §5.2.1, §6.2.1 ≈; GB 51251 §3.3.1 ≈ |

---

## 1. The towers today (measured)

All values are from `buildLayout({expansion:true})` at `cc917a7`, using `calc/towers.mjs` and `calc/gaps.mjs`.

| id | footprint (m) | base | top storey | RF (屋面) | homes/keys | lifts | stairs | today's code gaps |
|---|---|---|---|---|---|---|---|---|
| T1 | 36 × 16 | P1 roof 34.0 | 24F @ 93.6 | **96.9** | 34 | LW, LE private + **LF fire** | 2 (scissor) | none (< 100 m by design) |
| T2 | 32 × 16 | P1 roof 34.0 | 24F @ 93.6 | **96.9** | 34 | same | 2 | none |
| W1/W2 | 43.4 × 19.2 | grade | 28F @ 82.5 | 85.5 | 135 each | 2 passenger + fire | 2 | none |
| R1–R4 | 42 × 33.2 envelope (plate 40.8 × 31.8, three wings, light wells) | grade | 30F @ 100.0 | **103.4** | 87 each | **2, no fire role** | 2 | **> 100 m with no refuge floor (GB 55037 §7.1.14); no fire lift (§2.2.6-1)** |
| H | 74 × 38 | grade | 20F @ 67.7 | 71.1 | 190 keys | **2, no fire role** | 2 (ends) | **no fire lift (一类高层公共, §2.2.6-3)**; interval ≈ 77 s |
| A | 38 × 74 | grade | 20F @ 67.7 (6.5 m) | 74.2 | 190 units | **2, no fire role** | 2 | same as H |

**Spacings:**

| between | gap | note |
|---|---|---|
| H–P1 | **5.97 m** | |
| A–P1 | **7.01 m** | |
| T1–T2 | 14.00 m | |
| R1–R2 | 24.0 m | |
| W1–W2 | 22.6 m | |
| W1/W2 north façade | ≈ 4 m | to the plot line z −250 (PLAN.md risk 7) |

The user notices things that do not add up. The extension fixes three gaps that exist today:
- R1–R4 are already 103.4 m tall with no refuge floor.
- R, H and A have no fire lift.
- H and A have 2 lifts for 190 keys.

---

## 2. Fire code for ~200 m residential and public towers

### 2.1 Which code wins

- **GB 55037-2022《建筑防火通用规范》**:
  - In force since 2023-06-01.
  - Every clause is mandatory (强制性工程建设规范).
  - It absorbed GB 50016's mandatory clauses and replaces them.
- **GB 50016-2014 (2018 ed.)** remains the design code for everything GB 55037 does not say. Many of those clauses are "宜 / 不宜" (should), for example:
  - the 50 m spacing between refuge floors;
  - the 60 s fire-lift run;
  - the 54 m household room.

  Plan reviewers still apply them, so **treat them as rules**.
- **Residential above 54 m** is 一类高层住宅. **Public above 50 m** (hotel, serviced apartment) is 一类高层公共 (GB 50016 Table 5.1.1 ✔).
- **Serviced apartments are public buildings** for fire purposes: GB 50016 Table 5.1.1 note 2 ✔, "宿舍、公寓等非住宅类居住建筑的防火要求，应符合本规范有关公共建筑的规定". GB 55037 §7.4 is titled "公共建筑和非住宅类居住建筑" ✔.
- **Mixed use (北苑 on P1).** GB 50016 §5.4.10-3 ✔:
  - The residential part follows the residential rules for evacuation, compartments and internal fire equipment.
  - "该建筑的其他防火设计应根据建筑的**总高度**和建筑规模按本规范有关公共建筑的规定执行".

  GB 55037 §4.3.2 ✔ adds:
  - the residential part and the mall are fully separated by 2.00 h walls **with no openings** and 2.00 h floors;
  - their stairs and exits are independent.

  This is why the 北苑 stairs and LF pass P1-2F–6F sealed. The 7F sky lobby's doors open onto the **open-air** P1 roof, which is outside, so this is consistent. **Keep the P1-RF forecourt and 连廊雨棚 open-sided.** A roofed, enclosed mall space touching the lobby would become a forbidden opening.

### 2.2 Refuge floors (避难层)

**When required.** "建筑高度大于 100m 的工业与民用建筑应设置避难层，且第一个避难层的楼面至消防车登高操作场地地面的高度不应大于 50m。" (GB 55037 §7.1.14 ✔)

GB 50016 §5.5.23-1 ✔ adds: "两个避难层（间）之间的高度不宜大于50m". §5.5.31 ✔ applies the rule to residential above 100 m.

The old rule, "every 15 storeys", came from the withdrawn GB 50045. Many Chinese towers still look like that: 13–15 storeys between refuge floors.

**What the 50 m is measured from:** the **hardstand level**, which is at grade for all ten towers. 北苑's hardstands are on 北外环 at ≈ 0 m, so its first refuge floor must be at **≤ 50 m absolute**, which is only 16 m above the P1 roof. The 7F (34.0 m) is the 空中大堂 + club, and a refuge floor "除可布置设备用房外，不应用于其他用途" (§7.1.15-2). So **the first 北苑 refuge floor is at 9F or 10F**: today's 9F is at 42.6 m and 10F at 46.2 m. Taking one 大平层 storey out works.

**Requirements**

GB 55037 §7.1.15 ✔ (all mandatory):
1. Net refuge area ≥ the full population of every floor between this refuge floor and the next one up. GB 50016 §5.5.23-3 ✔: "宜按 5.0 人/m² 计算".
2. Only plant may share the floor:
   - flammable pipes are grouped, and the pipe zone is walled at 3.00 h;
   - shafts and plant rooms are walled at 2.00 h;
   - where plant connects to the refuge area or corridor, use a **防火隔间** with 甲级 doors.
3. Required: **fire-lift exit**, hydrant, hose reel, extinguisher, fire phone, PA.
4. Lit signs naming the refuge floor and storey, at each stair entrance and exit.
5. Smoke control **and openable external windows**. GB 55037 §6.4.7-2 ✔: those windows are ≥ **乙级 fire windows**.
6. **"避难区应至少有一边水平投影位于同一侧的消防车登高操作场地范围内"**. Put the refuge area on the hardstand face:
   - 北苑: north (river) face;
   - 西苑: south face;
   - R, H, A: whichever face gets the hardstand.

**Ventilation (GB 51251-2017 ≈).**
- Naturally ventilated refuge floor: openable windows on **≥ 2 orientations**, total effective area ≥ **2 %** of the floor area, ≥ **2.0 m²** per orientation (§3.2.3).
- Mechanically pressurised: windows still ≥ 1 % (§3.3.12), at ≥ 30 m³/(h·m²) of net refuge area (§3.4.3).
- Pressurisation systems above 100 m are split into **≤ 100 m vertical segments** (§3.3.1), so stair-pressurisation fan rooms sit on refuge floors.

**Height.** No national minimum, but evacuation routes need ≥ 2.1 m clear (GB 55037 §7.1.5 ✔). Practice:
- **4.5 m** for refuge + water tanks and pumps;
- **5.4–6.0 m** when the storey carries an outrigger or belt truss, or AHUs. A one-storey truss is as deep as the storey.

**Sizing examples** (people ÷ 5 per m²):

| tower | floors served | people | net refuge area |
|---|---|---|---|
| 西苑 | 15 floors × 5 homes × 3.6 | 270 | **≈ 54 m²** |
| 北苑 | 13 floors × 2 homes × 4.5 | 117 | **≈ 24 m²** |
| R | 13 floors × 3 homes × 4 | 156 | **≈ 31 m²** |
| H | 13 floors × 10 keys × 2 | 260 | **≈ 52 m²** |

So the refuge area is a strip on the hardstand face. The rest of the storey is plant (§5.2).

**Lifts on refuge floors.**
- The **fire lift must open** there (§7.1.15-3 ✔; GB 50016 §5.5.23-5 ✔).
- No clause requires passenger lifts to stop. Practice and fire-safety guidance keep them **closed**: "搭乘客梯是无法进入避难层的，必须走楼梯或者乘消防电梯" (酒泉消防 explainer, reprinted by 光明网 on 2026-01-18 and 2026-06-29). The refuge area must keep smoke out (§7.1.15-5), and only fire-lift doors are listed.
- Optional: lifts designated for **assisted evacuation** (§7.1.12 ✔) may stop "仅停靠特定楼层和首层" in fire mode. A refuge-floor → ground shuttle is a realistic touch for the hotel.

**Stairs on refuge floors.** "通向避难层的疏散楼梯应使人员在避难层处必须经过避难区上下" (GB 55037 §7.1.9 ✔). GB 50016 §5.5.23-2 ✔ allows 分隔 / 同层错位 / 上下层断开, and §6.4.4 ✔ allows a stair to change position only at a refuge floor. The easiest version for the engine and for players is **分隔**:
- same shaft;
- a fire wall across the refuge-floor landing;
- door A from the upper flight into the refuge area;
- a walk across the refuge area;
- door B onto the lower flight.

### 2.3 The 54 m household refuge room

GB 50016 §5.5.32 ✔: "建筑高度大于54m的住宅建筑，每户应有一间房间符合下列规定：1 应靠外墙设置，并应设置可开启外窗；2 内、外墙体的耐火极限不应低于1.00h，该房间的门宜采用乙级防火门，外窗的耐火完整性不宜低于1.00h。"

It already applies to every 北苑 and 西苑 home, and to every R home. It survives in GB 50016 only, not in GB 55037, but reviewers apply it.

In-game: one bedroom per home, on the external wall (ideally the hardstand face), with a 乙级 fire-door leaf (closer, 1.00 h). This fits the parallel workflow's new door-leaf records.

### 2.4 Fire lifts (消防电梯)

**GB 55037 §2.2.6 ✔.** Required in residential above 33 m and in every 一类高层公共. "每个防火分区可供使用的消防电梯不应少于1部". Above 250 m, the special 公消〔2018〕57号 measures would apply (2 per compartment, no scissor stairs). **They do not apply at 200 m.**

**GB 55037 §2.2.10 ✔:**
1. **"应能在所服务区域每层停靠"**:
   - a zoned fire lift (low zone / high zone with express) is allowed;
   - a **refuge floor inside its zone must be served**;
   - **北苑 LF serves only the residential part** (P1-B2/B1/1F + 7F up). It must not open on mall floors (§4.3.2).
2. ≥ 800 kg.
3. IPX5 controls.
4. Fire-service button at the 首层 entrance.
5. A级 car finishes.
6. Intercom + CCTV.

**GB 50016 §7.3.8-3 ✔: "电梯从首层至顶层的运行时间不宜大于60s".** Run time is t = H/v + v/a + a/j. With a = 0.9 m/s² and j = 1.5 m/s³ (`calc/lifts.py`):

| rise | 2.5 m/s | 3.0 | 3.5 | **4.0** | 5.0 | 6.0 |
|---|---|---|---|---|---|---|
| 130 m | 55 s | 47 | 42 | 38 | 32 | 29 |
| 160 m | 67 | **57** | 50 | 45 | 38 | 34 |
| 190 m | 79 | 67 | 59 | **53** | 44 | 39 |
| 200 m | 83 | 71 | 62 | **55** | 46 | 41 |
| 210 m | 87 | 74 | 65 | **58** | 48 | 42 |

→ The fire lift needs **≥ 3.0 m/s up to ~160 m and ≥ 4.0 m/s up to ~210 m**. For a zoned high-zone fire lift, H is the run from 首层 to the top floor; the express section helps.

**前室 (GB 55037 §2.2.8 ✔, §7.1.8-7 ✔):**
- own 前室 ≥ 6.0 m², short side ≥ 2.4 m;
- shared with a smoke-proof stair: residential ≥ 6.0 m², public ≥ 10.0 m²;
- scissor-stair shared 前室 + fire-lift 前室 ("三合一", residential): ≥ 12.0 m², short side ≥ 2.4 m (GB 50016 §5.5.28-4 ✔);
- at ground: straight outside, or through a protected passage (GB 50016 §7.3.5-1 ✔: ≤ 30 m);
- **above 100 m: 甲级 doors** (GB 55037 §6.4.3 ✔).

Fire lifts may double as passenger or service lifts (GB 50016 §7.3.4 ≈). In Chinese residential towers they are normally one of the 3 lifts in "3梯5户".

### 2.5 Stairs

| case | rule | source |
|---|---|---|
| Residential above 33 m | 防烟楼梯间. Home doors opening into a 前室 must be ≥ 乙级. GB 50016 §5.5.27-3 ✔: ≤ 3 home doors per 前室. | GB 55037 §7.3.2-3 ✔ |
| Residential above 54 m | ≥ 2 exits per floor per unit | GB 55037 §7.3.1-2 ✔ |
| 一类高层公共 | 防烟楼梯间 | GB 55037 §7.4.4 ✔ |
| Public: ≥ 2 exits per compartment per floor | | GB 55037 §7.4.1 ✔ |
| **Scissor stairs, residential** | Allowed when "任一户门至最近疏散楼梯间入口的距离不大于10m":<br>• 防烟;<br>• 1.00 h wall between the flights;<br>• 前室 "不宜共用" (shared ≥ 6.0 m²);<br>• not "宜" shared with the fire-lift 前室 (if shared ≥ 12 m², short side ≥ 2.4 m).<br>北苑's A/B pair qualifies: both doors are within 5 m. | GB 50016 §5.5.28 ✔ |
| **Scissor stairs, public** (hotel core) | Same 10 m test; **前室 separate**. | GB 50016 §5.5.10 ✔ |
| Widths | Residential stair ≥ 1.1 m, corridors ≥ 1.1 m. Public: by population, ≥ 1.1 m. | GB 55037 §7.1.4 ✔ |
| Hotel travel | Room door → exit ≤ 30 m between two exits and ≤ 15 m dead-end, **+25 % with sprinklers** → 37.5 / 18.75 m. Today's H end-stairs at x ±33 put the middle rooms ≈ 33 m away. That is acceptable with sprinklers; a central core stair makes it comfortable. | GB 50016 Table 5.5.17 ✔ |
| Residential travel | ≤ 40 m between two exits and ≤ 20 m dead-end (high-rise), +25 % with sprinklers | GB 50016 Table 5.5.29 ✔ |
| Escape gates | Card gates and access-controlled exit doors "应具有在火灾时自动释放的功能，且人员不需使用任何工具即能容易地从内部打开" (home doors exempt). **Applies to T1/T2-7F-GATE and the W/R lobby gates.** | GB 55037 §7.1.7 ✔ |

### 2.6 Fire compartments and other above-100 m switches

- Compartment ≤ **1,500 m²** in a high-rise, ×2 with sprinklers (GB 55037 §4.3.16-1,4 ✔; GB 50016 Table 5.3.1 ✔, which also covers residential). Plates:

  | tower | plate | compartments per storey |
  |---|---|---|
  | 北苑 | 576 / 512 m² | 1 |
  | 西苑 | 833 m² | 1 |
  | R | ≈ 1,000 m² | 1 |
  | H/A | **2,812 m²** | 1, with sprinklers (≤ 3,000) — **do not grow the plate**, or a second compartment and fire lift appear |

- Sprinklers: all 一类高层公共, and **residential above 100 m** (GB 55037 §8.1.9-1,3 ✔).
- Fire alarm: hotels, and residential above 100 m (§8.3.2-2,3 ✔). In-game: sprinkler heads and smoke detectors in homes above 100 m.
- Floor slabs ≥ 2.00 h above 100 m (§5.1.3 ✔).
- Residential above 100 m: external-wall insulation **A级** (§6.6.6 ✔).
- Above 100 m, the doors to 防烟楼梯间, 前室 and fire-lift 前室 are **甲级** (§6.4.3 ✔). Shaft inspection doors are 甲级 too (§6.4.4-2 ✔).
- **Children's activity rooms only on 1F–3F** (§4.3.4 ✔). No 儿童乐园 in sky lobbies, clubs or the 7F.

### 2.7 Fire-truck access (消防车道 / 登高操作场地)

**Hardstand** (GB 50016 §7.2.1–7.2.2 ✔; GB 55037 §3.4.6–3.4.7 ✔):
- **≥ 20 × 10 m** for buildings above 50 m;
- **5–10 m** from the façade;
- slope ≤ 3 %;
- structure under it rated for a full heavy fire truck;
- no trees, overhead lines or garage ramps in between;
- continuous along ≥ one long side, or ≥ ¼ of the perimeter and not less than one long side;
- **no podium deeper than 4 m** between the hardstand and the tower.

**Stairs and rescue windows:**
- A stair exit or stair entrance directly opposite the hardstand (GB 55037 §2.2.2 ✔).
- **消防救援口** (GB 55037 §2.2.3 ✔):
  - every floor from 3F;
  - ≥ 2 per compartment on the rescue face;
  - ≥ 1.0 × 1.0 m (0.8 m wide if a door);
  - safety glass;
  - permanent markings inside and out.

  Every home and refuge floor on the hardstand face gets two marked rescue windows (red triangle decal).

**Fire roads** (GB 55037 §3.4.3 ✔):
- residential: ≥ 1 long side;
- **high-rise public (H, A): ≥ 2 long sides**, unless the site makes only one possible; with one road, it must be on the hardstand side.

**Why 50 m.** Standard 登高平台车 reach about 50–55 m; a few brigades have 101 m units. That is why the first refuge floor is within reach and why everything above relies on the fire lift. At 200 m, firefighting is internal: fire lift → refuge floor staging → hydrants.

**Status:**
- 北苑: HS1 36 × 10 and HS2 32 × 10 on 北外环, 5 m from the façade. P1's north wall is flush with the tower face, so there is a 0 m podium in between ✓.
- 西苑: 10 m fire road at z [−221.8, −211.8], 5 m off the south façade ✓.
- **R1–R4, H and A: no hardstand records yet.** Designers must add them.

### 2.8 Helipad

- GB 50016 §7.4.1 ✔: "建筑高度大于100m且标准层建筑面积大于2000m²的公共建筑，宜在屋顶设置直升机停机坪或供直升机救助的设施". → **H and A qualify (2,812 m²)**. 北苑 (576 m² floor, residential) and R/西苑 (residential) do not.
- GB 55037 §2.2.11 ✔: mandatory only **above 250 m**.
- §2.2.12 ✔ and GB 50016 §7.4.2 ✔:
  - ≥ 5 m clear of rooftop protrusions (machine rooms, tanks, antennae);
  - **≥ 2 exits** to the pad;
  - obstruction lights and emergency lighting all round;
  - a hydrant at the pad;
  - structure sized for the waiting crowd and design wind (§2.2.13 ✔).
- Size, rule of thumb (ICAO Annex 14 Vol II ≈): a rooftop pad for a 12–17 m rescue helicopter is a **20–26 m** square or circle with an "H" and a 1.5 m safety net. H's roof (74 × 38) fits one plus a BMU track.

### 2.9 Separation distances

**GB 55037 §3.3.1 ✔:** "除裙房与相邻建筑的防火间距可按单、多层建筑确定外，建筑高度大于100m的民用建筑与相邻建筑的防火间距…与高层民用建筑的防火间距不应小于13m".

**GB 50016 §5.2.6 ✔:** for buildings above 100 m, "当符合…允许减小的条件时，仍不应减小". The fire-wall reductions are gone.

**GB 55037 §3.3.2 ✔:** buildings linked by bridges, link corridors or a shared lower block still count as two buildings.

→ **H (5.97 m) and A (7.01 m) from P1 fail once they pass 100 m.** P1 is a 34 m high-rise. The clean fix: H and A keep a podium (≤ 24 m, 裙房) at today's footprint, and the **tower above it steps back ≥ 13 m from P1**:
- **H** loses ~7 m on the P1 side.
- **A**'s tower becomes ~32 m wide instead of 38 m, giving H/B 6.25 at 200 m, which is still 🟢.

Other gaps:
- 北苑 T1–T2 = 14.0 m ✓. That is only 1 m of margin, so **never widen either plate toward the gap**.
- R1–R4 at 24 m ✓; W1–W2 at 22.6 m ✓.

### 2.10 Corrections to the baseline brief

| brief said | correct reference |
|---|---|
| "§7.3.1–7.3.2: … ground to top within 60 s" | The 60 s is **GB 50016 §7.3.8-3 (宜)**. §7.3.1 is now GB 55037 §2.2.6 (which buildings, 1 per compartment); §7.3.2 is "分别设置在不同防火分区内，且每个防火分区不应少于1台". |
| "lifts that must stop at refuge floors (GB 50016 §7.4.x / §5.5.23-?)" | §7.4 is the helipad. The clause is **GB 50016 §5.5.23-5 "避难层应设置消防电梯出口"** = **GB 55037 §7.1.15-3**. It covers fire lifts only. |
| "§5.5.23: first refuge ≤ 50 m above the fire-rescue ground" | Now mandatory in **GB 55037 §7.1.14**, measured to the **消防车登高操作场地地面**. The **50 m spacing** stays "不宜" (GB 50016 only). |
| GB 50368 for residential lifts | GB 50368-2005 is superseded by **GB 55038-2025《住宅项目规范》** (in force 2025-05-01): lifts in 4F+ homes, and **storey height ≥ 3.0 m**. 西苑's 3.0 m storey is exactly at the minimum, so do not go lower. ≈ for the supersession detail. |
| Area at 5 p/m² | GB 50016 says 宜 5.0 p/m². GB 55037 §7.1.15-1 sets *who* is counted: everyone between this refuge floor and the next one up. |

---

## 3. Structural plausibility

### 3.1 The limits (JGJ 3-2010, all ✔)

**Table 3.3.1-1, A级 maximum height (m), RC:**

| system | non-seismic | 6度 | **7度** | 8度 0.2g | 8度 0.3g | 9度 |
|---|---|---|---|---|---|---|
| 框架-剪力墙 | 150 | 130 | **120** | 100 | 80 | 50 |
| 剪力墙 (all walls to grade) | 150 | 140 | **120** | 100 | 80 | 60 |
| 部分框支剪力墙 | 130 | 120 | **100** | 80 | 50 | — |
| 框架-核心筒 | 160 | 150 | **130** | 100 | 90 | 70 |
| 筒中筒 | 200 | 180 | **150** | 120 | 100 | 80 |

**Table 3.3.1-2, B级 maximum height (m), RC:**

| system | non-seismic | 6度 | **7度** | 8度 0.2g | 8度 0.3g |
|---|---|---|---|---|---|
| 框架-剪力墙 | 170 | 160 | **140** | 120 | 100 |
| 剪力墙 | 180 | 170 | **150** | 130 | 110 |
| 部分框支剪力墙 | 150 | 140 | **120** | 100 | 80 |
| 框架-核心筒 | 220 | 210 | **180** | 140 | 120 |
| 筒中筒 | 300 | 280 | **230** | 170 | 150 |

**Table 11.1.2, 混合结构 maximum height (m):**

| system | non-seismic | 6度 | **7度** | 8度 0.2g | 8度 0.3g | 9度 |
|---|---|---|---|---|---|---|
| 钢框架-钢筋混凝土核心筒 | 210 | 200 | **160** | 120 | 100 | 70 |
| **型钢(钢管)混凝土框架-钢筋混凝土核心筒** | 240 | 220 | **190** | 150 | 130 | 70 |
| 钢外筒-钢筋混凝土核心筒 | 280 | 260 | **210** | 160 | 140 | 80 |
| 型钢(钢管)混凝土外筒-钢筋混凝土核心筒 | 300 | 280 | **230** | 170 | 150 | 90 |

**Table 3.3.2 / 11.1.3, H/B limits ("不宜大于"):**

| system | non-seismic | **6、7度** | 8度 | 9度 |
|---|---|---|---|---|
| 框架-剪力墙, 剪力墙 | 7 | **6** | 5 | 4 |
| 框架-核心筒 (RC or 混合) | 8 | **7** | 6 | 4 |
| 筒中筒 (RC or 混合) | 8 | **8** | 7 | 5 |

**How B is measured** (§3.3.2 commentary ✔):
- "可按所考虑方向的最小宽度计算", excluding small protrusions such as stair or lift bumps.
- "对带有裙房的高层建筑，当裙房的面积和刚度相对于其上部塔楼的面积和刚度较大时，计算高宽比的房屋高度和宽度可按裙房以上塔楼结构考虑". P1 (270 × 236 m, 6 storeys + 2 basements) qualifies, so for 北苑 **H is measured from 34 m**.

**Beyond the tables.** The §3.3.1 commentary ✔: "房屋高度超过表3.3.1-2规定的特殊工程，则应通过专门的审查、论证". The 超限 thresholds of 建质〔2015〕67号 Table 1 ≈ are the A级 RC heights and the 11.1.2 hybrid heights. At 7度 that means RC frame-core above 130 m and SRC-frame/RC-core above 190 m. **Every ~200 m tower here is a 超限高层**, which goes through 超限高层建筑工程抗震设防专项审查 (建设部令第111号 ≈). That is routine for 200 m towers in China. What a panel will not accept without extraordinary measures is **H/B ≥ ~9–10**.

**Seismic intensity.** The repo names no city; PLAN.md's sun model uses 30.3°N, which is Hangzhou's latitude. The brief says 7度 0.10g, and this rulebook uses 7度. If the site were Hangzhou (≈ 6度 0.05g), the height limits rise (frame-core B级 210 m; SRC frame-core 220 m), but **the H/B limits do not change** (6 and 7度 share a column). Wind governs the slender towers there in any case. Hangzhou's basic wind pressure is ≈ 0.45 kN/m², and 北苑 and 西苑 face open river terrain.

**Other checks that bite at 200 m:**
- Drift Δu/h:
  - ≤ 150 m: frame-core 1/800, shear wall or tube-in-tube 1/1000 (Table 3.7.3 ≈);
  - ≥ 250 m: 1/500;
  - linear in between (§3.7.3 ✔) → at 200 m **≈ 1/615 (frame-core)** and **≈ 1/667 (shear wall)**.
- Wind comfort for H ≥ 150 m, 10-year wind (§3.7.6 ✔): peak acceleration **≤ 0.15 m/s² for 住宅/公寓** and **≤ 0.25 m/s² for 旅馆**. The slender 北苑 and 西苑 would need a **TMD** (调谐质量阻尼器), a 1–2-storey damper room at the top.
- Foundation (§12.1.7 ≈): H/B > 4 → no zero-stress zone under the raft. That means piles + raft, and for 北苑 the piles sit inside P1-B2.
- Upper floors may overhang **≤ 10 % of B and ≤ 4 m**. Setbacks above 0.2 H keep ≥ 75 % of B (§3.5.5 ≈; §10.6.1 ✔ sends anything beyond to §10.6). → **A "deeper plate on the upper floors" can add at most 1.6 m to 北苑** (10 % of 16 m). That confirms it is not a real option over P1.
- Plan irregularity (GB 50011 Table 3.4.3-1 ≈; JGJ 3 Table 3.4.3 ≈):
  - recess > 30 % of the overall dimension → 凹凸不规则;
  - l/Bmax ≤ 0.35 at 6–7度.

### 3.2 Per tower

| tower | B used | H/B at RF 200 m | verdict | max RF for H/B ≤ 7 / ≤ 8 | recommended |
|---|---|---|---|---|---|
| **北苑 T1** 36 × 16 | 16 (N–S) | **12.5** from grade, **10.4** above the 34 m podium | 🔴 | **146 m / 162 m** (above the podium) | **RF ≈ 145–150 m**, ~37–39F, 2–3 refuge floors |
| **北苑 T2** 32 × 16 | 16 | same | 🔴 | same | same; may differ from T1 by one or two storeys for a stagger |
| **西苑 W1/W2** 43.4 × 19.2 | 19.2 | **10.4** | 🔴 | **134 m / 154 m** | **RF ≈ 145–150 m** keeping the catalogued homes, **or** rebuild as a ≤ 27 m-deep slab (H/B 7.4 at 200 m) with new homes |
| **R1–R4** plate 40.8 × 31.8 | 31.8 | **6.3** | 🟡 → 🟢 once fixed | 223 m / 254 m | **main roof 176–190 m** + crown (staggered, e.g. 176/188/200/188), with a central core and SRC/CFST columns |
| **H** 74 × 38 | 38 | **5.3** | 🟢 | — | main roof ≤ 190 m + crown; central core; outriggers at refuge floors; **tower set back ≥ 13 m from P1** |
| **A** 38 × 74 | 38 (32 after the P1 setback) | 5.3 (6.25) | 🟢 | — | same as H |

**北苑, why it is red and stays red.**
- The 16 m N–S depth is the whole problem. The core (8 × 16 m, `NORTH_CORE`) already spans the full depth, so:
  - in N–S **there is no lever arm for outriggers**;
  - mega-columns cannot sit outside the core;
  - a tube-in-tube cannot fit;
  - joining T1 and T2 with bridges does not deepen anything.
- The plate cannot grow:
  - north: the hardstand edge must stay clear;
  - south: the 方庭 glass canopy is 5.5 m away;
  - overhang is ≤ 1.6 m (§3.5.5).
- In E–W (32–36 m) the tower is fine.

Options:
- **Shear-wall system**: core + transverse party walls in the wings. B级 7度 limit **150 m**, which also matches H/B ≈ 7.25 above the podium. This gives the **≈ 145–150 m cap**.
- **162 m** (H/B 8.0) is the most a review panel would plausibly accept, with a TMD and C60–C80 walls.
- **200 m is not credible.**

Also:
- 大底盘双塔 (JGJ 3 §10.6.3 ✔):
  - the towers' combined centroid should be ≤ 20 % of the podium dimension from the podium centroid. That needs **a seismic joint** isolating the 方庭-north block of P1 as the towers' base;
  - "转换层不宜设置在底盘屋面的上层塔楼内";
  - strengthen the podium roof ± 1 storey.
- Pile count, order of magnitude: about 35–45 bored piles of Ø1.2–1.5 m per tower at 150 m, placed in P1-B2.

**西苑, why it is red.**
- 19.2 m depth.
- The core (15.7 × 8.4 m) sits in the north half only, so the 8.4 m N–S core width is H/24 at 200 m.
- Outriggers N–S reach only ~11 m to south columns.

Two honest paths:
- **(a) ≈ 145–150 m.**
  - Keeps every catalogued 两房 / 三房 / 四房 home.
  - 剪力墙 B级 7度 = 150 m.
  - H/B 7.6–7.8 is amber, defensible with 超限 review + TMD.
  - 47–48F, 44 home floors × 5 = **220 homes per tower** (today 135).
- **(b) ~200 m with a deeper slab.**
  - Site budget along z: plot north line −250 → keep today's 4 m north setback (slab z0 = −246) → slab → 5 m → 10 m fire road → plot south line −204. That allows **≤ 27 m depth**.
  - H/B 7.4 at 200 m.
  - All five homes per floor must be re-planned, still as 3梯5户 and still all different.
  - The core can then be centred and ~17 m in N–S.
  - Check local 退界 rules (PLAN.md risk 7).

**R1–R4, the best supertall candidates.**
- H/B 6.3 on the plate is within frame-core (7) and above shear wall (6). Use **SRC/CFST frame + RC core (混合)**: 7度 limit **190 m** to the main roof.
- Today the plate has **no core**: just a corridor bar, 2 lifts and 2 end stairs.
  - A 200 m tower needs a core ≥ H/12 ≈ **16.7 m** (§9.2.1 ✔) in at least one direction.
  - The natural place is the **north wing x[−8.8, 8.8] z[−15.9, −1.6]**, currently the north-facing **03 home**. That home gets 0 h of winter sun (PLAN.md §6 Q8), so converting it fixes a known realism defect too.
- The light wells are 12.8 / 31.8 = **40 %** deep, which is > 30 % = 凹凸不规则. Tie the well mouths with floor bands at every storey, or at least at the refuge and outrigger floors.
- Outriggers: 2–3 levels on refuge floors (≈ 93 m + roof hat truss, or 46 / 93 / 140), reaching to corner mega-columns at the wing tips (±20 m lever).

**H and A, green on slenderness, blocked on spacing.**
- 74 × 38 has L/B 1.95: fine for frame-core, and even for tube-in-tube (矩形 L/B ≤ 2 ≈ §9.3.2).
- They need a **central core**, about **28–32 × 12–14 m** (two scissor stairs + 6 guest + 3 service lifts + shafts). Today the lifts sit at one end, and only two stairs at the ends.
- Outriggers at refuge floors to the façade columns: ±19 m lever in the short direction.
- The §2.9 spacing blocker (≥ 13 m from P1) must be solved first.

### 3.3 Mitigation menu, ranked by realism

1. **Lower the slender ones.**
   - 北苑 ≈ 145–150 m;
   - 西苑 ≈ 145–150 m.

   Both stay "超高层" (> 100 m) with 2–3 refuge floors, so the skyline still reads as a supertall cluster.
2. **Count the crown, not the structure.**
   - Main roof ≤ 190 m (R, H, A) or ≤ 150 m (北苑, 西苑).
   - A 10–15 m 屋顶构架 hides the BMU, plant and the TMD.
3. **Stagger heights:**
   - R1–R4 rising toward the river or the mall, e.g. 176 / 188 / 200 / 188;
   - H ≈ 190 and A ≈ 180;
   - T1 ≈ 150 and T2 ≈ 145.

   This reads more natural than four identical extrusions, and only the tallest R carries the 200 m figure.
4. **Outriggers + belt trusses on refuge floors** (R, H, A; 西苑 weakly). JGJ 3 §10.3.1 ✔ says exactly this: "可利用建筑避难层、设备层空间，设置适宜刚度的水平伸臂构件".
5. **Mega-columns** at the R wing tips and the H/A corners: SRC or CFST, ~1.6–2.0 m at the base.
6. **TMD at the top** for wind comfort (0.15 m/s² residential). It is plausible even on 150 m 北苑/西苑 slabs.
7. **Deeper plates.** Only 西苑 can do this (≤ 27 m, new homes). **Not 北苑** (≤ 1.6 m overhang, hardstand to the north, canopy to the south).

### 3.4 Core-size rules of thumb at ~200 m

| rule | value | basis |
|---|---|---|
| Core width | ≥ **H/12** (≈ 16.7 m at 200 m; ≈ 12.5 m at 150 m). May be smaller with corner walls or outriggers. | JGJ 3 §9.2.1 ✔ |
| Inner tube (筒中筒) | H/12–H/15 | JGJ 3 §9.3.3 ≈ |
| Core share of the floor plate | 20–28 % at 200 m (lifts + stairs + shafts + walls). 一梯一户 cores run proportionally larger. | practice |
| Core slenderness H / b_core | ≤ 12–15 without outriggers; ≤ ~18–20 with 2–3 outrigger levels | practice |
| Core outer walls at the base | ≈ 0.9–1.2 m (C60), stepping down every 10–15 storeys to 0.4–0.5 m at the top | practice |
| Frame columns, SRC/CFST, 8–10 m spacing | ≈ 1.4–1.8 m square at the base | practice |
| Lift shafts | ≈ 2.6 × 2.6 m for 1,000–1,050 kg at ≤ 4 m/s; ≈ 2.9 × 2.9 m for 1,600 kg at 5–6 m/s. Pit 3–4 m, overrun 5–7 m, machine room above for ≥ 4 m/s traction. Hangzhou also requires shaft vent openings top and bottom from 2.5 m/s (杭市管〔2022〕96号 ✔). | practice |

---

## 4. Lift traffic sizing

### 4.1 Code minimums

| rule | basis |
|---|---|
| Residential 12F and above: **≥ 2 lifts per building, one sized for a stretcher** (deep car, typically 1,000–1,050 kg, about 1.1 × 2.1 m) | GB 50096-2011 §6.4.2 ≈ |
| Residential lifts "宜每层设站". Where they do not, "不设站的层数不应超过两层". Zoned banks serve every floor of their zone, so they comply. 北苑 private lifts skip alternate floors (LW even, LE odd), so they comply. | GB 50096 §6.4.4 ≈ |
| Lobby depth ≥ the deepest car and ≥ 1.5 m (residential). Public buildings use GB 50352 Table 6.9.1 (≥ 1.5 B, 2.4 m for a group of 4, < 4.5 m facing). | GB 50096 §6.4.5 ≈; GB 50352 §6.9.1 ≈ |
| ≤ 4 lifts in a row; ≤ 2 × 4 facing; lifts not counted as exits; no lift shaft wrapped by a stair | GB 50352-2019 §6.9.1 ≈ (items 9–12 ✔) |
| Lifts not next to bedrooms (or isolated) | GB 50096 §6.4.6/6.4.7 ≈; GB 50352 §6.9.1-9 ✔ |

### 4.2 Targets and rules of thumb

| building | people | 5-min HC (%POP) | interval | homes or keys per lift | speed |
|---|---|---|---|---|---|
| Residential, normal → high end | studio 1.5, 1BR 1.8, **2BR 3.0, 3BR 4.0** (4BR 5.0 extrapolated) | **≈ 7 %** (two-way), range 5–9 % | **50–60 s** (luxury ≤ 45–50 s) | 60–90 normal, 30–60 comfortable, < 30 luxury | see below |
| Hotel | 1.5–2.0 per key | 10–15 % up-peak | 30–50 s | 70–100 keys (comfortable), < 70 luxury | |
| Serviced apartment | 2 per unit | 8–12 % | ≤ 45–50 s | 60–80 units | |

Sources for the rows:
- Residential population and HC/interval: Arup, 505 George St residential tower, citing CIBSE Guide D ✔. The 5–9 % range and the homes-per-lift bands are ≈ (《全国民用建筑工程设计技术措施》, CIBSE).
- Hotel and serviced apartment: ≈ (CIBSE Guide D; 技术措施).

**Speed by rise (practice):**

| rise | speed |
|---|---|
| ≤ 50 m | 1.75–2.0 m/s |
| 50–100 m | 2.5–3.0 m/s |
| 100–150 m | 3.5–4.0 m/s |
| 150–200 m | 4–6 m/s |
| express high zones of 200–270 m towers | 6–7 m/s |

Fire lift: §2.4 (≥ 4 m/s to 200 m).

**Real-world anchor ✔.** Arup's 505 George St (Sydney, 74 levels, residential) uses 3 zones:
- **3 lifts at 3.5 m/s** for levels 4–25;
- **3 at 5.0 m/s** for 26–46;
- **4 at 6.0 m/s** for 47–74.

All are 1,600 kg / 21-person cars, designed to a 50–60 s interval and 7 % two-way. A 200 m Chinese residential tower is about two of those zones.

### 4.3 Formulas (CIBSE Guide D / Barney up-peak; implemented in `calc/lifts.py`)

```
P    = 0.8 × rated persons                          (average car load)
N    = floors served above the main lobby (in the zone)
S    = N · [1 − (1 − 1/N)^P]                        (expected stops)
H    = N − Σ_{i=1}^{N−1} (i/N)^P                    (highest reversal floor, in floors)
t_v  = d_f / v                                      (one floor at rated speed)
t_f(d) = d/v + v/a + a/j     if d ≥ v(v/a + a/j)    (flight time, jerk-limited)
       = 2(v_p/a + a/j),  v_p = ½a(−a/j + √((a/j)² + 4d/a))   if d ≥ 2a³/j²
       = (32 d / j)^{1/3}    otherwise
t_s  = t_f(d_f) − t_v + t_o + t_c + 0.5             (time lost per stop)
RTT  = 2·(D_express + H·d_f)/v + (S + 1)·t_s + 2·P·t_p
INT  = RTT / L                                      (L = lifts in the group)
HC5  = 300 · P · L / RTT    →  %POP = 100·HC5 / population
Fire lift 60 s check:  t_f(H_top) ≤ 60 s  →  v_min ≈ H / (60 − v/a − a/j)
```

Assumptions:
- a = 1.0 m/s² (0.9 for fire lifts), j = 1.5 m/s³, t_p = 1.2 s.
- Doors: t_o / t_c = 2.0 / 3.0 s for residential (900 mm side-opening); 1.8 / 2.8 s for hotel centre-opening.

Up-peak with full cars is **conservative** for residential, whose real peak is evening two-way. Read the residential intervals as upper bounds.

### 4.4 Results for this campus (`python3 -I calc/lifts.py`)

| tower / scheme | floors | lifts | v (m/s) | car | INT | HC5 %POP | verdict |
|---|---|---|---|---|---|---|---|
| 西苑 today (27 home floors) | 27 | 3 | 2.5 | 13p | 56 s | 11.4 % | OK |
| 西苑 ~200 m, **single bank of 3** | 62 | 3 | 4.0 | 13p | **70 s** | **4.0 %** | ✗ "3梯5户" cannot stay 3 lifts in total |
| 西苑 ~200 m, single bank of 4 | 62 | 4 | 5.0 | 15p | 52 s | 6.2 % | marginal (and it is 4梯5户) |
| **西苑 ~200 m, low zone 2F–32F** | 31 | **3** | 3.0 | 13p | 57 s | 9.8 % | ✓ |
| **西苑 ~200 m, high zone 33F–63F (express 96 m)** | 31 | **3** | 6.0 (5.0) | 13p | 59 s (63 s) | 9.4 % (8.8 %) | ✓ → **6 lifts, each floor sees 3 = 3梯5户 kept** |
| R today | 29 | 2 | 2.5 | 13p | **92 s** | 9.8 % | ✗ interval |
| R ~200 m, single bank of 3 | 56 | 3 | 5.0 | 13p | 65 s | 7.1 % | marginal |
| **R ~200 m, single bank of 4** | 56 | **4** | 5.0 | 13p | **49 s** | 9.5 % | ✓ **4梯3户** (or 2 zones × 3 = 3梯3户, 57–60 s) |
| 北苑 private lift (1 family per trip), RF 150–200 m | — | 1 per home stack | 4–6 | — | RTT 71–77 s → **average wait ≈ 36–39 s** | — | ✓ luxury; LF fire lift is the standby/service lift |
| H today | 19 | 2 | 2.5 | 13p | **77 s** | 14.2 % | ✗ interval |
| **H ~200 m (~500 keys), single bank of 6** | 50 | **6** | 6.0 | 21p (1,600 kg) | **39 s** | 17 % | ✓ (83 keys/lift = comfortable) |
| H, 2 zones × 4 | 25 + 25 | 8 | 4 / 6 | 18p | 46 / 51 s | 23–25 % | ✓ but more shafts |
| **A ~200 m (~500 units), single bank of 6** | 50 | **6** | 6.0 | 15p | **32 s** | 11.2 % | ✓ |

### 4.5 Typical layouts to copy

**3梯5户 at ~200 m (西苑):**
- Two banks of 3 facing across one lift lobby (≤ 2 × 4 ✓).
- Low bank: L1, L2 + **F1** fire/stretcher lift, serving B2–32F at 2.5–3.0 m/s.
- High bank: H1, H2 + **F2** fire/stretcher lift, serving B2/B1/1F + 33F–top at 5–6 m/s (F2 ≥ 4 m/s for the 60 s rule).
- On any floor only one bank's 3 doors open; the other bank shows blank shaft walls (in the game: no landing doors on those floors).
- Two separate 防烟楼梯间 at the core ends, as today. At refuge floors, the stairs transfer through the refuge area (分隔).
- **The resident still experiences 3梯5户**, and the tower has 6 lifts. This is how real Chinese 200 m 住宅 do it ("高低区").

**一梯一户 luxury (北苑):**
- Each home stack has a **private lift opening straight into its 入户厅** (card or fingerprint): LW serves the W homes, LE the E homes.
- A shared **fire lift (LF, also the service/standby lift)** opens into a 前室 that also serves the **scissor stair** and each home's back/service door.
- Marketed as 一梯一户; physically 3 lifts per 2 homes.
- At ≥ 150 m: private lifts **4–5 m/s**, LF **≥ 3.5–4 m/s**.
- LF and both stairs stop at refuge floors; LW/LE pass them closed.
- A 4th standby lift is optional above 150 m. The fire lift is the backup today.

**2梯4户 / point tower → at ~200 m (R1–R4, 3 homes per floor):**
- One bank of **4 at 5 m/s** (one fire lift, one stretcher) in the new central core: "4梯3户".
- Or 2 zones × 3: "3梯3户".
- Two 防烟楼梯间, or a scissor pair if every door is ≤ 10 m away.
- A typical 30-storey 2梯4户 uses 2 lifts + a scissor stair (三合一 前室 ≥ 12 m²). At 200 m that grows to 4 lifts or 2 zones.

**Hotel (H, ~500 keys):**
- Central core with **6 guest lifts (3 + 3 facing) at 6 m/s, 1,600 kg**, in a guest lift lobby.
- A separate back-of-house lobby with **3 service lifts** (1,600–2,000 kg, one of them **the fire lift**, ≥ 4 m/s, every floor including refuge floors), linen, trash and housekeeping rooms.
- Two scissor or separate smoke-proof stairs with **separate 前室** (public rule).
- Optional **云端大堂 / sky bar** on the top floor, reached by 2 express shuttles (6–7 m/s, 1F → top) or by the guest bank.
- A standalone hotel keeps its check-in lobby at grade; a sky lobby only pays when the hotel sits on top of offices.
- A 500-key tower of 165 m² suites is large for one hotel (see §7).

**Serviced apartment (A, ~500 units):**
- 6 lifts at 6 m/s (or 2 zones × 4).
- **2 service lifts**, one being the fire lift.
- Public-building stair rules (separate 前室).

---

## 5. Vocabulary and plant of real 200 m Chinese towers

### 5.1 Glossary

| term | meaning | in this campus |
|---|---|---|
| 避难层 / 避难区 / 避难间 | Refuge floor / the refuge zone on it / a refuge room | every ~46 m |
| 设备层 | MEP plant floor; usually the same storey as a 避难层 ("避难层兼设备层") | same floors |
| 转换层 | **Structural** transfer storey (walls above → columns below), JGJ 3 §10.2. Also, loosely, the **lift transfer floor** in fire recall (GB 50116 §4.7.1 ≈: "首层或电梯转换层"). | none in the towers. **No structural transfer above P1's roof.** |
| 加强层 | Strengthened storey = outrigger + belt | on refuge floors (R, H, A) |
| 伸臂桁架 | **Outrigger** truss, core → perimeter mega-column | R, H, A |
| 腰桁架 / 环带桁架 | **Belt** truss round the perimeter at the outrigger level | R, H, A |
| 帽桁架 | Hat truss at the roof | optional, H and R |
| 巨柱 | Mega-column (SRC or CFST) | R wing tips, H/A corners |
| 核心筒 / 框架-核心筒 / 筒中筒 / 剪力墙 | Core / frame-core / tube-in-tube / shear-wall | |
| 大底盘多塔 | Several towers on one podium | 北苑 on P1 |
| 跃层 / 复式 vs 错层 | Duplex home with aligned slabs vs split-level structure | **北苑 must stay 跃层 structurally** |
| 屋顶构架 / 塔冠 | Crown: an architectural frame above the main roof | 10–15 m |
| 擦窗机 (BMU) | Building maintenance unit: roof track, telescopic jib, parking garage (GB/T 19154 ≈) | every tower |
| 调谐质量阻尼器 (TMD) | Damper at the top for wind comfort | 北苑, 西苑 (if they stay slender) |
| 航空障碍灯 | Aviation obstruction lights: medium intensity from ~45 m; **high-intensity white flashing on objects > 150 m** (ICAO Annex 14 practice ≈; local CAAC rules) | all |
| 高位消防水箱 / 转输水箱 / 减压水箱 | Roof fire tank / relay tank / break tank | roof + refuge floors |

### 5.2 What sits on a refuge floor (residential, ~200 m)

**Plan, by position:**
- **Hardstand face:** the refuge area (避难区), a strip of 25–60 m² net with openable 乙级 fire windows. It contains:
  - hydrant + hose reel + extinguishers;
  - fire phone + PA speaker;
  - lit "避难层 / 16F" signs.
- **Core:** the fire-lift landing opens here. Passenger lifts are blank walls. Both stairs land in fire-walled vestibules: you walk out of the stair from above, cross the refuge area, and enter the stair down (分隔).
- **Other faces, behind 2.00 h / 3.00 h walls and a 防火隔间:**
  - fire-water **relay tank + relay pumps**: about every ~100 m, because static pressure > 1.0 MPa at a hydrant forces zoning (GB 50974 §6.2.1 ≈); relay tank ≥ 60 m³ in a series system ≈;
  - domestic **break tank / PRV station**;
  - stair and 前室 **pressurisation fans** for the next ≤ 100 m segment (GB 51251 §3.3.1 ≈);
  - electrical and telecom rooms.
- **Hotel and serviced apartment, in addition:**
  - AHUs (新风机组);
  - chilled and hot-water **plate heat exchangers** (pressure break every ~100–150 m);
  - a hotel linen and storage relay.

**Structure:** outrigger diagonals cross the plant zone, and belt trusses run in the façade line. Storey height is 5.4–6.0 m.

### 5.3 How it looks on the façade

- A **4.5–6 m band every 13–15 storeys** (≈ 46 / 93 / 140 / 187 m).
- **Rain-louvre panels** (防雨百叶) on the plant zones, usually a darker grey than the curtain wall. **Openable fire-rated windows** on the refuge-area bay, on the hardstand face, visible as a different pane module with red rescue-window triangles.
- At night: **dark** bands. No interior lights, only exit-sign glow.
- On R, H and A the belt truss may be expressed as a solid spandrel band or visible diagonals behind the louvres.
- The rhythm is: base → 3 bands → crown.

### 5.4 The roof

- **High-level fire tank** + jockey pump (GB 50974 §5.2.1 ≈):
  - residential above 100 m: ≥ 36 m³;
  - public above 100 m: ≥ 50 m³;
  - public above 150 m: ≥ 100 m³.
- **Lift machine rooms** for ≥ 4 m/s traction lifts: ~1–1.5 storeys over the core.
- Stair-pressurisation and smoke-exhaust fans.
- Cooling towers (hotel, apartment).
- **BMU**: a perimeter track, or a central slewing unit with a parking garage hidden in the crown.
- **Crown frame** (10–15 m).
- **Obstruction lights** at the top corners; high-intensity strobes above 150 m.
- Lightning conductors.
- **TMD room** in the crown (slender towers).
- **Helipad** (H, A), ≥ 5 m clear of all of the above, with two stair exits.
- Residential roof gardens: allowed, but the stairs must reach the roof and the plant must stay fenced.

---

## 6. Worked floor stacks (illustrative; `python3 -I calc/stacks.py`)

The script inserts a refuge floor whenever the next storey would put a floor more than 48 m above the last refuge floor (2 m margin under 50 m). Floor numbers include refuge floors, which is Chinese practice ("16F 避难层").

| tower | storey heights | RF target | refuge floors (floor @ level) | top floor | home floors | homes |
|---|---|---|---|---|---|---|
| 北苑 | 7F 5.0; 3.45 average (3.6 flats / 3.3 duplex); refuge 4.5 | **≈ 145 m** | 10F @ 45.9, 23F @ 91.8 | 37F @ 141.2 | 28 | 56 per tower |
| 北苑 | same | ≈ 150 m | + 36F @ 137.7 | 39F @ 149.1 | 29 | 58 |
| 北苑 | same | 200 m (🔴) | 10F, 23F, 36F, 49F @ 183.6 | 53F @ 198.5 | 42 | 84 |
| 西苑 | 1F 4.5, 3.0, refuge 4.5 | **≈ 145 m** | 16F @ 46.5, 31F @ 93.0 | 47F @ 142.5 | 44 | 220 per tower |
| 西苑 | same | 200 m (🔴 unless 27 m deep) | 16F, 31F, 46F @ 139.5, 61F @ 186.0 | 65F @ 199.5 | 60 | 300 |
| R | 1F 4.8, 3.4, refuge 5.4 | ≈ 190 m | 14F @ 45.6, 27F @ 91.8, 40F @ 138.0 | 54F @ 187.6 | 50 | 150 per tower |
| R | same | 200 m | + 53F @ 184.2 | 57F @ 199.8 | 52 | 156 |
| H / A | 1F 6.5, 3.4, refuge 6.0 | ≈ 190 m | 14F @ 47.3, 27F @ 94.1, 40F @ 140.9 | 53F @ 187.7 | 49 | 490 keys/units |

Design notes:
- **Last segment.** The top-floor-to-last-refuge gap shown as "49.6 m" for R at ~190 m is at the limit. Designers should shave one storey or move the refuge floor up one storey.
- **北苑 first refuge floor.** It lands on today's **10F** (46.2 m today, 45.9 m in the averaged stack), so one 大平层 storey becomes 避难层兼设备层. The 7F sky lobby stays as the parallel workflow builds it.
- **北苑 duplexes.** A refuge floor at 23F or 36F must sit where both the W and E interlocks end. Put a single-level home directly below and above each refuge floor, the same trick as today's 14E / 24W.

---

## 7. Risks

1. **北苑 and 西苑 cannot honestly reach 200 m on their current plates.** H/B 10.4–12.5 against a limit of 7. If the user insists on "200 m 左右" for them, the realistic answers are:
   - 北苑 ≈ 145–150 m (and say why);
   - for 西苑, a new 27 m-deep slab with re-planned homes.

   Shipping 200 m slabs anyway is exactly the kind of thing this user notices.
2. **H and A fail the 13 m separation to P1** once they pass 100 m (GB 55037 §3.3.1 mandatory; no reductions). The tower part must step back ≥ 13 m from P1 above a podium. This changes their silhouette and reduces A's width to ~32 m.
3. **R1–R4 need a central core.** It takes out the north-wing 03 home. That changes a shipped template, the GLB prototype and the tests. R1–R4 are **already non-compliant today** (103.4 m, no refuge floor, no fire lift); the extension should fix that rather than copy it upward.
4. **Interlocking duplexes vs refuge floors (北苑).** Every refuge floor forces a single-level home above and below it. The "every home different" catalogue grows.
5. **Stairs stop being continuous.** Refuge-floor transfers break the engine's `continuous: true` stair model (tower-stairs.js, passLevels) and the nav graph. Needed: split stair records plus a refuge-area walk.
6. **3梯5户 needs 6 lifts in 2 zones at 200 m.** The core grows from 15.7 × 8.4 m to roughly 22 × 9 m, or deepens. Keeping 3 lifts total is not realistic: 4 % HC and a 70 s interval.
7. **Card gates must fail open on alarm** (GB 55037 §7.1.7). If the parallel workflow's T1/T2-7F-GATE logic has no fire mode, a realism-minded user will ask "火灾时怎么出去?"
8. **Hotel programme.** ~490–500 keys of 165 m² suites in one 200 m tower is very large: one luxury tower usually has 200–350 keys. Options:
   - lower floors as hotel, upper floors as hotel-managed residences;
   - or keep the keys and say it is a resort-scale flagship.
9. **Fire-lift speed.** LF in 北苑 must be ≥ 3–4 m/s (today a slow residential lift is implied), and every zoned fire lift must reach its top in ≤ 60 s from **P1-1F / 1F**, not from the sky lobby.
10. **Citations marked ≈** — GB 50096 §6.4.x, GB 50352 §6.9.1 items 1–8, GB 51251, GB 50974, GB 50116, the 建质〔2015〕67号 table, JGJ 3 §3.4.3 / 3.5.5 / 9.3.x / 10.1.3 / 10.2.5 / 12.1.7, and GB 50011 Table 3.4.3-1 — were not re-read in this study. The numbers match common practice, but check the clause numbers before quoting them to the user as "规范第 x 条".
11. **Performance** (out of scope here, flagged for the integrator). Going from 19–32 to 40–65 levels per tower roughly doubles the per-floor content. Refuge floors are cheap (no homes) and help.

## 8. Open questions for the user or orchestrator

1. **北苑 height.** Accept **≈ 145–150 m** (structurally credible; 2–3 refuge floors; 28–29 home floors, 56–58 homes per tower)? Or keep 200 m and accept that it is not realistic (H/B 10.4)?
2. **西苑.** **≈ 145 m** keeping every catalogued 3梯5户 home (220 homes per tower)? Or **200 m with a new 27 m-deep slab** and re-planned homes?
3. **Seismic intensity / city.** 7度 0.10g as briefed, or the Hangzhou-like 6度 implied by the 30.3°N sun model? This changes the height tables, not the H/B verdicts.
4. **H and A setback.** May their towers step back ≥ 13 m from P1 above a ≤ 24 m podium (A becomes ~32 m wide)? Or should they be moved?
5. **R1–R4 core.** May the north-wing 03 home become the core? That also removes the 0 h-sun home.
6. **Staggered heights.** OK to stagger (e.g. R 176 / 188 / 200 / 188, H ≈ 190, A ≈ 180, T1 ≈ 150, T2 ≈ 145) rather than ten identical 200 m towers? Is "200 m" the crown or the main roof (recommended: the crown)?
7. **Helipads on H and A.** Recommended (宜, and very visible). Include them?
8. **Refuge-floor numbering.** Number them like ordinary floors (16F 避难层; Chinese practice), with no button in the residents' lifts. Agreed?

---

## 9. Sources

**Code texts read in this study (✔):**
- **GB 55037-2022《建筑防火通用规范》**, full text (copy hosted by 福建省特种设备检验研究院): http://www.fjase.cn/tzsbweb/userfiles/files/GB55037-2022%E3%80%8A%E5%BB%BA%E7%AD%91%E9%98%B2%E7%81%AB%E9%80%9A%E7%94%A8%E8%A7%84%E8%8C%83%E3%80%8B.pdf
  - Clauses used: §2.2.2–2.2.13, 3.3.1–3.3.2, 3.4.3–3.4.7, 4.3.2, 4.3.4, 4.3.16, 5.1.3, 6.4.3–6.4.4, 6.4.7, 6.6.6, 7.1.4–7.1.9, 7.1.12–7.1.16, 7.3.1–7.3.2, 7.4.1, 7.4.4, 8.1.9, 8.3.2.
- **GB 50016-2014 (2018 ed.)《建筑设计防火规范》**, full text (copy hosted by 大连化物所): https://ylaqjdb.dicp.ac.cn/__local/B/50/27/DE69BE1DA05C0B3C39F030E7790_97E042CF_629214.pdf
  - Clauses used: Table 5.1.1 + notes, 5.2.6, Table 5.3.1, 5.4.10, 5.5.10, 5.5.12, 5.5.17, 5.5.23, 5.5.25–5.5.32, 6.4.3–6.4.4, 7.1.2, 7.2.1–7.2.3, 7.3.5–7.3.8, 7.4.1–7.4.2, App. A.0.1.
- **JGJ 3-2010**:
  - Tables 3.3.1-1/2 and 3.3.2: MIDAS code manual, http://manual.midasuser.com/building/cn/code/10/htm101/033.htm
  - §3.3 commentary: https://gf.cabr-fire.com/article-17062.htm
  - §3.7.3 / 3.7.6: https://gf.cabr-fire.com/article-17066.htm
  - §9.2.1: https://gf.cabr-fire.com/article-17444.htm
  - §10.3: https://gf.cabr-fire.com/article-17450.htm
  - §10.6: https://gf.cabr-fire.com/article-17453.htm
  - §11.1 + Tables 11.1.2 / 11.1.3 (table images): https://gf.cabr-fire.com/article-17455.htm

**Lifts and refuge floors (✔ where marked):**
- Arup, *Vertical Transportation Design Statement – 505 George Street* (CIBSE Guide D targets, occupancy ratios, 3-zone residential scheme), City of Sydney CSPC 2014-12-04 Item 15, Attachment A21 ✔: https://meetings.cityofsydney.nsw.gov.au/Data/Central%20Sydney%20Planning%20Committee/20141204/Agenda/141204_CSPC_ITEM15_ATTACHMENTA21.pdf
- 杭州市《建设项目电梯设计及选型配置管理办法》(杭市管〔2022〕96号) ✔: zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn (…/90bc69eec01a47a98c6b3e6770536c64.docx)
- GB 55038-2025《住宅项目规范》 news (storey height ≥ 3 m, lifts from 4F) ✔: https://www.news.cn/house/20250401/5701ed566ec14e68af711d504c930882/c.html
- GB 55037 fire-lift clause interpretation ("所服务区域每层停靠"): https://b.1190119.com/article-11101.htm and https://www.233.com/cfe/zhishiku/1139/91282.html
- Refuge-floor practice (ordinary lifts do not enter refuge floors): 酒泉消防 explainer reprinted by 光明网, https://m.gmw.cn/2026-06/29/content_1304513855.htm and https://m.gmw.cn/2026-01/18/content_1304308935.htm
- Refuge-floor clause summaries: https://www.233.com/cfe/zhishiku/1139/91305.html and https://m.233.com/cfe/zhishiku/1140/103722.html
- CIBSE Lifts Group 2023 seminar (Guide D 2025 structure): https://www.cibse.org/media/5a4lpbwp/chapter-3-4-9-a2.pdf

**Not re-read (≈):**
- GB 50096-2011 §6.4;
- GB 50352-2019 §3.1.2, §6.9.1 (items 9–12 checked in the English edition preview, chinesestandard.net);
- GB 51251-2017 §3.2.3, 3.3.1, 3.3.12, 3.4.3;
- GB 50974-2014 §5.2.1, 6.2.1;
- GB 50116-2013 §4.7.1;
- GB 50011-2010 Table 3.4.3-1;
- 建质〔2015〕67号 附件1 Table 1;
- 建设部令第111号;
- 《全国民用建筑工程设计技术措施》 lift bands;
- CIBSE Guide D hotel figures;
- ICAO Annex 14 (helipad, obstruction lights).

**Repo facts:**
- `calc/towers.mjs`, `calc/gaps.mjs` (buildLayout measurements);
- `src/layout/community-sites.js`, `north-towers.js`, `community.js`, `hospitality.js`, `residential-plan.js`;
- `docs/planning/2026-11-04-p1-air-rights/PLAN.md`;
- the sky-lobby SPEC.
