# OpenClaw Pixel Agent — 像素办公室可视化

在网页上用像素小人实时展示 OpenClaw 飞书 Bot 角色的活动状态。角色数量和名称完全可配置。

---

## 快速开始

### 本地开发

```bash
# 1. 安装依赖
npm install
cd webview-ui && npm install && cd ..

# 2. 构建
npm run build

# 3. 启动服务 (默认端口 3210)
npm start

# 4. 打开浏览器
open http://localhost:3210
```

开发模式（前后端热重载）:

```bash
# 终端1: 启动后端
npm run dev:server

# 终端2: 启动前端 (Vite dev server, 自动代理 WebSocket 和 API)
npm run dev:webview
```

### 生产部署 (Docker)

```bash
docker compose up -d
docker compose logs -f
```

### 生产部署 (PM2)

```bash
npm run build
pm2 start dist/server/server/index.js --name pixel-agent
```

### Nginx 反代

```nginx
location /opc/ {
    proxy_pass http://127.0.0.1:3210/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;
}
```

```bash
sudo nginx -t && sudo nginx -s reload
```

---

## 配置页面使用说明

### 打开配置页面

有两种方式进入配置页面：

1. **直接访问** — 浏览器打开 `http://localhost:3210/config`
2. **从办公室进入** — 在像素办公室页面底部工具栏点击 **Config** 按钮

### 配置项说明

#### Agents 配置

管理像素办公室中的角色小人。不再固定为 7 个，可自由增减。

| 字段 | 说明 | 取值范围 |
|------|------|----------|
| **名称** | 角色显示名 | 任意文本，如 `OpenClaw`、`Kai` |
| **角色** | 角色职位描述 | 任意文本，如 `主管家`、`Dev`、`PM` |
| **皮肤** | 像素小人的基础外观 | `0`-`5`，共 6 种预设皮肤 |
| **色调** | 色调偏移角度 | `0`-`360`，用于在相同皮肤上创造视觉差异 |

操作：
- **添加** — 点击 `+ 添加 Agent` 按钮，系统自动分配最少使用的皮肤
- **删除** — 点击对应行末尾的 `X` 按钮
- **修改** — 直接编辑输入框，拖动色调滑块

> 小贴士：前 6 个角色使用不同的皮肤（palette 0-5）即可获得最大视觉区分度。超过 6 个时，系统会自动通过色调偏移来区分相同皮肤的角色。

#### OpenClaw 连接

对接 OpenClaw 系统，让像素小人根据真实 Agent 活动状态来动作。

| 字段 | 说明 | 示例 |
|------|------|------|
| **启用** | 是否开启 OpenClaw 对接 | 勾选/取消 |
| **Session 目录** | OpenClaw Agent 的会话文件目录 | `~/.openclaw/agents` |
| **API 端点** | OpenClaw Gateway 的 HTTP API 地址 | `http://localhost:8080` |

> 当前版本中，OpenClaw 对接为预留配置。启用后，服务端会读取这些配置，但实际的 Watcher 逻辑需要根据你的 OpenClaw 部署情况来适配（见下方"对接 OpenClaw"章节）。

#### 飞书机器人

配置飞书 Webhook，用于接收 Agent 活动通知。

| 字段 | 说明 | 示例 |
|------|------|------|
| **启用** | 是否开启飞书 Webhook | 勾选/取消 |
| **Webhook URL** | 飞书自定义机器人的 Webhook 地址 | `https://open.feishu.cn/open-apis/bot/v2/hook/xxx` |

### 保存与重置

- **保存配置** — 点击后立即生效：
  - 配置写入 `~/.pixel-agents/config.json`
  - 办公室中的角色小人实时更新（增减、改名）
  - MockWatcher 按新角色列表重启模拟
- **重置** — 从服务端重新加载当前已保存的配置，丢弃本次未保存的修改

### 配置文件位置

所有配置持久化在运行服务端的机器上：

```
~/.pixel-agents/
├── config.json      # Agent 和连接配置
└── layout.json      # 办公室布局（桌椅摆放等）
```

- **本地开发**：保存在你的 Mac 用户目录 `$HOME/.pixel-agents/`
- **VPS 部署**：保存在 VPS 上运行 Node.js 进程的用户目录
- **Docker 部署**：需要挂载 volume 才能持久化（`docker-compose.yml` 中已配置）

---

## 对接 OpenClaw

### 架构说明

```
浏览器 ←→ WebSocket ←→ Node.js Server ←→ Watcher (监听 OpenClaw)
                           ↓
                   AgentStateManager (动态角色，由配置驱动)
                           ↓
                   广播状态变更给所有连接的浏览器
```

### Watcher 接口

所有 Watcher 实现同一个接口 (`server/watcher/types.ts`):

```typescript
interface AgentEvent {
  agentId: number          // 对应配置中的 agent ID
  type: 'active' | 'idle'
  toolName?: string        // 'Read' | 'Write' | 'Bash' | 'Edit' | 'Grep' 等
}

interface Watcher {
  start(callback: (event: AgentEvent) => void, agentIds?: number[]): void
  stop(): void
}
```

### 对接方案

#### 方案 A: 监听 OpenClaw Session JSONL 文件 (推荐)

已提供模板实现 `server/watcher/openclawWatcher.ts`。

修改 `server/index.ts`:

```typescript
import { OpenClawWatcher } from './watcher/openclawWatcher.js'

const watcher = new OpenClawWatcher(appConfig.openclaw.sessionDir)
```

需要根据实际 OpenClaw 目录结构调整:
- `ROLE_TO_AGENT_ID` 映射 — 角色目录名到 Agent ID
- `TOOL_NAME_MAP` 映射 — OpenClaw 工具名到像素动画类型
- `processRecord()` — 根据实际 JSONL 格式解析

#### 方案 B: OpenClaw HTTP/WebSocket API

如果 OpenClaw Gateway 暴露了活动事件 API：

```typescript
export class ApiWatcher implements Watcher {
  start(callback, agentIds) {
    const ws = new WebSocket('ws://your-openclaw-gateway/events')
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data)
      callback({
        agentId: ROLE_TO_AGENT_ID[event.role],
        type: event.status === 'busy' ? 'active' : 'idle',
        toolName: mapToolName(event.tool),
      })
    }
  }
}
```

### 工具名 → 动画映射

| 动画类型 | 工具名 | 表现 |
|----------|--------|------|
| **打字** | Write, Edit, Bash, Task | 小人坐在椅子上快速打字 |
| **阅读** | Read, Grep, Glob, WebFetch, WebSearch | 小人坐在椅子上翻阅 |

---

## 默认角色

首次启动时，默认配置 7 个角色（可在配置页面自由修改）：

| ID | 名称 | 角色 | 皮肤 | 色调 |
|----|------|------|------|------|
| 1  | OpenClaw | 主管家 | 0 | 0° |
| 2  | Mia | PM | 1 | 0° |
| 3  | Kai | Dev | 2 | 0° |
| 4  | Aria | UI | 3 | 0° |
| 5  | Rex | QA | 4 | 0° |
| 6  | Nova | Ops | 5 | 0° |
| 7  | Zoe | Data | 0 | 180° |

---

## 项目结构

```
server/                         # Node.js 后端
├── index.ts                    # Express + REST API + WebSocket 入口
├── wsServer.ts                 # WebSocket 连接管理
├── agentStateManager.ts        # 动态角色状态机
├── configStore.ts              # 配置持久化 (~/.pixel-agents/config.json)
├── layoutStore.ts              # 布局持久化 (~/.pixel-agents/layout.json)
├── assetLoader.ts              # PNG → 精灵数据解析
├── config.ts                   # 服务端常量
└── watcher/
    ├── types.ts                # Watcher 抽象接口
    ├── mockWatcher.ts          # 模拟数据 (开发用)
    └── openclawWatcher.ts      # OpenClaw 对接模板

webview-ui/                     # React + Canvas 前端
├── src/
│   ├── wsClient.ts             # WebSocket 客户端
│   ├── main.tsx                # 入口 + 路由 (/, /config)
│   ├── App.tsx                 # 像素办公室主组件
│   ├── pages/
│   │   └── ConfigPage.tsx      # 配置页面
│   ├── hooks/                  # React Hooks
│   ├── components/             # UI 组件 (工具栏、设置等)
│   └── office/                 # 像素办公室引擎
│       ├── engine/             # 游戏循环、渲染器、角色AI
│       ├── layout/             # 布局序列化、寻路
│       ├── sprites/            # 精灵数据和缓存
│       ├── editor/             # 布局编辑器
│       └── components/         # Canvas 和 UI 覆盖层
└── public/assets/              # 精灵 PNG 资产

shared/                         # 前后端共享类型
├── protocol.ts                 # WebSocket 消息协议
└── configTypes.ts              # 配置数据结构
```

## REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取当前配置 |
| POST | `/api/config` | 保存配置（立即生效，重建角色和 Watcher） |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3210` | 服务端口 |

## 致谢

- 像素办公室引擎基于 [pixel-agents](https://github.com/pablodelucca/pixel-agents) (MIT License)
- 字体: FS Pixel Sans
