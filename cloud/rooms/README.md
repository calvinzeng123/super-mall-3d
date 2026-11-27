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

需要一个有 **Workers Scripts: Edit** 和 **Durable Objects** 权限的令牌（现在环境里那个「云澜汇」令牌只有 Pages 权限，上传脚本会被拒——试过）。

```bash
cd cloud/rooms
CLOUDFLARE_ACCOUNT_ID=<账号 ID> CLOUDFLARE_API_TOKEN=<令牌> WRANGLER_SEND_METRICS=false npx -y wrangler@4.166.0 deploy
```

第一次部署会让账号开 `workers.dev` 子域（Dashboard → Workers & Pages → 右侧 Subdomain）。部署完拿到地址
`https://yunlan-mall-rooms.<子域>.workers.dev`，先确认 `https://yunlan-mall-rooms.<子域>.workers.dev/health` 返回 `ok`，然后：

1. 把 `src/jimao/coop/net.js` 里 `COOP_SERVER.url` 填成 `wss://yunlan-mall-rooms.<子域>.workers.dev`；
2. 重新打包、照常发布 Pages（见 HANDOFF「发布到 Cloudflare Pages」）。

没填之前（或者服务器连不上），大厅里显示「联机服务器还没上线」，单人照常玩。临时试线上服务器不用改代码：网址加 `?mp=wss://...`。

## 规则（room-core.js 的 `ROOM`）

- 房间码 4–6 位，服务器认 `A–Z` 和 `2–9`（客户端生成的不带 O、I）；`want=create` 时房间里已经有人回 `taken`（客户端自动换一个码重建），`want=join` 时房间是空的回 `nope`。
- 最多 3 人，第四个回 `full`。第一个进来的是主机；主机走了，座位号最小的人提成主机（广播 `{ t: 'host' }`），没人了房间清空。
- 来源只认 `https://yunlan-mall.pages.dev`、它的预览分支 `https://*.yunlan-mall.pages.dev`、本机 `http://localhost:*` / `http://127.0.0.1:*`，再加 `EXTRA_ORIGINS`。
- 限流：每条连接每秒补 45 条、最多攒 90 条，超了丢掉，丢了 400 条以上断开；主机单条最大 64 KB（完整快照），别人 8 KB。
- 心跳：客户端发文本 `ping`，运行时直接回 `pong`（`setWebSocketAutoResponse`，不叫醒房间）。
- DO 休眠醒来：座位、名字、主机标记、开局信息都存在每条连接上（`serializeAttachment`），醒来按它们摆回去；最近一帧完整快照只在内存里，醒来叫主机补一帧（`{ t: 'need' }`）。

## 消息

所有消息都是 JSON 文本，`t` 是类型。服务器给别人转发时补上 `f`（发的人的座位号）。

| 方向 | `t` | 内容 |
| --- | --- | --- |
| 服务器 → 新来的 | `welcome` | `seat`、`host`、`players`、`started`、`start`（开局信息）、`snap`（最近一帧完整快照的原文） |
| 服务器 → 大家 | `peer` | `ev: 'join' / 'leave' / 'name'`、`seat`、`name`、`players`、`host` |
| 服务器 → 大家 | `host` | 新主机的座位号（主机迁移） |
| 主机 → 大家 | `start` | `seed`、`tower`、`round`、`stage`（读档 / 主机迁移时的步数） |
| 主机 → 大家 | `s` | 快照：`ht` 主机时间、`k` 完整帧、`z` 丧尸、`rm` 收起的、`c` 人物、`sv` 关卡状态、`kill`、`sh` 弹道、`r` 无线电、`h` 直升机、`x` 扩展字段 |
| 客户端 → 主机 | `i` | `ct` 客户端时间、`p` 自己的位置朝向、`sh` 开的枪、`hit` 命中、`cut` 做完的目标 |
| 任意 | 其他 | 默认发给主机；`to: 'all'` 发给除自己以外所有人；`to: 座位号` 只发给那个人（玩法规则用 `coop.send()` / `coop.on()`） |
