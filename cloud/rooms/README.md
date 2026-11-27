# 丧尸围城联机服务器（yunlan-mall-rooms）

三人联机的房间服务器：一个 Cloudflare Worker，加一个 Durable Object（`Room`），每个房间码一个实例，用 WebSocket 休眠接口（没人说话时不计时长）。
服务器只做转发和记账：谁坐哪个座位（0 主角 / 1 阿哲 / 2 林医生）、谁是主机、开局信息（种子、哪栋楼）、最近一帧完整快照（给中途加入的人）。
游戏模拟全在主机（房主）的浏览器里跑，见 `src/jimao/coop/`。

## 文件

| 文件 | 做什么 |
| --- | --- |
| `worker.js` | Worker 入口（`/room/<房间码>` 升级成 WebSocket、`/health`、来源检查）和 `Room` 这个 Durable Object |
| `room-core.js` | 房间逻辑（座位、主机迁移、转发、限流、中途加入），和 Cloudflare 无关，`tests/coop-room.test.js` 直接测它 |
| `wrangler.toml` | 名字 `yunlan-mall-rooms`、`workers_dev = true`、DO 绑定 `ROOMS` → `Room`，迁移 `v1` 用 `new_sqlite_classes` |

## 本机试（不用 Cloudflare 账号）

```bash
cd cloud/rooms
CI=1 WRANGLER_SEND_METRICS=false npx -y wrangler@4.166.0 dev --port 8787 --ip 127.0.0.1
```

游戏在 `localhost` / `127.0.0.1` 打开时自动连 `ws://127.0.0.1:8787`（`src/jimao/coop/net.js` 的 `COOP_SERVER.dev`）。
别的地址用网址参数指定：`mall.html?mp=ws://192.168.1.5:8787`（同一个局域网里用手机试，记得 `--ip 0.0.0.0`，并在 `wrangler.toml` 的 `EXTRA_ORIGINS` 里加上页面的来源）。

## 部署

**已经部署、在线：`wss://yunlan-mall-rooms.45q6mmm655.workers.dev`**（`/health` 返回 `ok`），`src/jimao/coop/net.js` 的 `COOP_SERVER.url` 已经填上。
正式站（`yunlan-mall.pages.dev` 和它的预览分支）打开就连它；本机开发（`localhost` / `127.0.0.1`）还是先连 `ws://127.0.0.1:8787`，要连正式的加 `?mp=wss://yunlan-mall-rooms.45q6mmm655.workers.dev`。
改了 `cloud/rooms/` 以后要重新部署一次（下面的命令），客户端改动照常重新打包发 Pages。

需要一个有 **Workers Scripts: Edit** 和 **Durable Objects** 权限的令牌。

```bash
cd cloud/rooms
CLOUDFLARE_ACCOUNT_ID=<账号 ID> CLOUDFLARE_API_TOKEN=<令牌> WRANGLER_SEND_METRICS=false npx -y wrangler@4.166.0 deploy
```

部署完确认 `https://yunlan-mall-rooms.45q6mmm655.workers.dev/health` 返回 `ok`。换了账号 / 子域的话，把 `COOP_SERVER.url` 改成新地址，重新打包发 Pages。

服务器连不上时大厅里显示「联机服务器还没上线（连不上）」，单人照常玩。
网址参数 `?mp=` 只有是 `ws(s)://` / `http(s)://` 地址时才顶替服务器地址；`?mp=1`（封面「联机（三人）」入口、邀请链接都带）只是「进来就打开大厅」。

## 规则（room-core.js 的 `ROOM`）

- 房间码是 **4 位数字**（`0000`–`9999`，手机上弹数字键盘；别的一律 400）；`want=create` 时房间里已经有人回 `taken`（客户端自动换一个码重建，撞过的不再抽），`want=join` 时房间是空的回 `nope`。
- 最多 3 人，第四个回 `full`。第一个进来的是主机；主机走了，座位号最小的人提成主机（广播 `{ t: 'host' }`），没人了房间清空。
- 猜房间码（4 位只有一万个，限流收紧了）：同一个 IP（`CF-Connecting-IP`）加入空房间（`nope`）或者建房撞上有人的房间（`taken`，建房也能用来探哪些码有人）一分钟里满 10 次、或一刻钟里满 30 次，之后再加入 / 建房直接回 `slow`（大厅显示「试错太多次了」）。记在 Worker 实例的内存里，尽力而为（`worker.js` 的 `JOIN_LIMIT`）；DO 用响应头 `X-Room-Join: nope / taken` 告诉 Worker 这次没进去。
- 大厅：谁都能发 `{ t: 'meta', ready?: 布尔, ping?: 毫秒 }`（准备 / 自己量的延迟），服务器洗过（延迟取整、上限 9999，不是布尔的准备不认）记在名单上，广播 `{ t: 'peer', ev: 'meta', players }`；准备变了马上广播，只变延迟的同一个人隔 3 秒才广播一次；开局时准备清掉。
- 一下子的动作（扔手雷 / 燃烧瓶 / 诱饵弹、榴弹、挥刀）和开枪都随操作 `i` 发给主机（`ev` / `sh`），主机核对后随快照 `s` 转给大家；客户端发不了 `s`，所以冒充不了别人扔的东西。
- 谁能发什么：`welcome / peer / host / full / taken / nope / slow / err / pong / need` 只有服务器发，客户端发来的直接丢掉；不是主机的人只能发 `ROOM.peer` 里的 `i / vote / boardReq / heal`（外加 `name`、`meta`、`ping`），只转给主机（带了 `to` 也只给主机）；主机的其他消息照 `to` 转。客户端那边也只认房主座位（`f`）发来的开局和规则消息。
- 来源只认 `https://yunlan-mall.pages.dev`、它的预览分支 `https://*.yunlan-mall.pages.dev`、本机 `http://localhost:*` / `http://127.0.0.1:*`，再加 `EXTRA_ORIGINS`。
- 限流：每条连接每秒补 45 条、最多攒 90 条，超了丢掉，丢了 400 条以上断开；主机单条最大 64 KB（完整快照），别人 8 KB。
- 心跳：客户端发文本 `ping`，运行时直接回 `pong`（`setWebSocketAutoResponse`，不叫醒房间）。
- DO 休眠醒来：座位、名字、主机标记、开局信息都存在每条连接上（`serializeAttachment`），醒来按它们摆回去；最近一帧完整快照只在内存里，醒来叫主机补一帧（`{ t: 'need' }`）。

## 消息

所有消息都是 JSON 文本，`t` 是类型。服务器给别人转发时补上 `f`（发的人的座位号）。

| 方向 | `t` | 内容 |
| --- | --- | --- |
| 服务器 → 想加入的 | `full` / `taken` / `nope` / `slow` | 进不来：满了 / 房间码被占了 / 没有这个房间 / 猜错太多次 |
| 服务器 → 新来的 | `welcome` | `seat`、`host`、`players`、`started`、`start`（开局信息）、`snap`（最近一帧完整快照的原文） |
| 服务器 → 大家 | `peer` | `ev: 'join' / 'leave' / 'name'`、`seat`、`name`、`players`、`host` |
| 服务器 → 大家 | `host` | 新主机的座位号（主机迁移） |
| 主机 → 大家 | `start` | `seed`、`tower`、`round`、`stage`（读档 / 主机迁移时的步数）、`mig: 1`（换了主机、还是这一局：已经在打的客户端不重开） |
| 主机 → 大家 | `s` | 快照：`ht` 主机时间、`k` 完整帧、`z` 丧尸、`rm` 收起的、`c` 人物、`sv` 关卡状态、`kill`、`sh` 弹道、`r` 无线电、`h` 直升机、`ha` 回血回执（座位 → 第几次）、`x` 扩展字段 |
| 客户端 → 主机 | `i` | `ct` 客户端时间、`p` 自己的位置朝向、`sh` 开的枪、`hit` 命中、`cut` 请主机定的目标、`heal` 自己回的血 `[第几次, 多少]` |
| 客户端 → 主机 | `vote` / `boardReq` / `heal` | 玩法规则：投票重来、请大家登机（`heal` 现在随 `i` 发，单独发也认） |
| 主机 → 大家 / 某人 | 其他（`over`、`votes`、`boardAll` ……） | `to: 'all'` 发给除自己以外所有人；`to: 座位号` 只发给那个人（玩法规则用 `coop.send()` / `coop.on()`） |
