# 超高层延伸 · 当前状态（2026-11-10）

P0 基础引擎已合并进分支（`64c8857`）。四组楼的建设在 2026-11-06 按用户要求暂停，园区里的楼高还是原样。

## 已完成

- **方案设计**：[design/SPEC.md](design/SPEC.md) 是实施规格；[design/DECISIONS.md](design/DECISIONS.md) 是用户的决定，和 SPEC 不一致时以它为准。同目录下是各楼的研究稿（`north.md`、`west.md`、`p2.md`、`hotel-apt.md`、`codes.md`、`perf.md`）、评审稿 `CRITIQUE.md` 和计算脚本（`spec-calc/` 等）。
- **P0a 布局引擎**、**P0b 渲染与界面**：见 [p0a.md](p0a.md)、[p0b.md](p0b.md)、[p0-merge.md](p0-merge.md)。全套测试 604/604 通过。

## 暂停时各组的状态

| 组 | 状态 | 保存位置 |
|---|---|---|
| P-west 西苑 W1 / W2 | 只写了计划 | [wip/west-plan.md](wip/west-plan.md) |
| P-north 北苑 T1 / T2 | 改了户型生成脚本和生成数据，没做完，没跑测试 | `wip/north-wip.patch.gz` 是完整补丁；`wip/north-plans-script.patch` 是其中脚本那部分，方便阅读 |
| P-R 二期 R1–R4 | 未开始 | — |
| P-HA 酒店 H + 公寓 A | 未开始 | — |

## 用户第二轮决定带来的数字

SPEC 按「西苑两栋都是 47 层」写的。用户后来选了 W2 低 3 层，下面这些数要在建设时按 `design/spec-calc/` 的公式复核：

- W2：44 层，44F 标高 133.5 m，屋面 136.5 m，构架顶约 147.5 m，205 户。W1 不变（47 层，220 户）。西苑共 425 户。
- 全园合计相应减少：楼层 523（SPEC 写 526），住宅 1,475 户（SPEC 写 1,490）。

其余三项（酒店用方案 R、北苑 100 m 以下保留现在的窗和开放阳台、电梯乘坐时间压到一半左右）都写在 DECISIONS.md 的 Round 2 里。

## 怎么继续

1. 从分支最新提交给每组建一个 worktree，分支名 `supertall/<组>`。
2. 北苑先还原半成品：`gunzip -c docs/supertall/wip/north-wip.patch.gz | git apply`。补丁基于 `64c8857` 的 `src/`。生成数据也可以用 `scripts/prepare-community-plans.mjs --community north` 重新生成。
3. 各组的任务书在 [design/towers-workflow.js](design/towers-workflow.js)：建设、独立审查、修复、合并四段。里面的 scratchpad 路径要换成 `docs/supertall/design`。
4. 合并顺序：west → north → r → ha。西苑先合，因为它省下的几何体积要留给北苑保留的旧立面。
5. 之后做整合（SPEC §5.3 的 P-int）：导览、户型目录、文档、性能复测、重建 dist、截图。
6. 四组都落地后删除 `wip/`。

## 还没修的小问题

- 商场天台方庭观光梯出口处，指示牌的立柱挡住「云澜·北苑」的「北」字。计划并入 P-north。
- 楼层栏：桌面端滚动后，顶部的楼栋标签会压住前几行；选中的楼层行没有白色高亮。计划并入 P-int。

## 工具

`design/tools/catalog-shots/` 是户型目录的截图工具（平面图、俯视剖切、室内实景），整合阶段重拍目录时用。用法见该目录的 README。
