# OpenClaw Pixel Agent — 改造实施计划

## 目标
将 VS Code 像素小人插件改造为独立 Web App，在 VPS 上部署，可视化 7 个飞书机器人角色的活动状态。

---

## Phase 1: 项目结构重组

### 新目录结构
```
openclaw-pixel-agent/
├── server/                    # 新增：Node.js 后端
│   ├── index.ts               # Express + WebSocket 入口
│   ├── wsServer.ts            # WebSocket 连接管理
│   ├── agentStateManager.ts   # 7 个固定角色状态管理
│   ├── layoutStore.ts         # 布局文件持久化 (复用 ~/.pixel-agents/)
│   ├── assetLoader.ts         # 服务端 PNG→SpriteData 解析 (复用原版逻辑)
│   ├── watcher/               # OpenClaw 活动监听
│   │   ├── types.ts           # 抽象 Watcher 接口
│   │   ├── mockWatcher.ts     # 开发用模拟监听器
│   │   └── fileWatcher.ts     # JSONL 文件监听 (后续实现)
│   └── config.ts              # 7 个角色配置
├── webview-ui/                # 修改：前端 (去掉 VS Code 依赖)
│   └── src/
│       ├── wsClient.ts        # 替换 vscodeApi.ts → WebSocket 客户端
│       └── ...                # 其余文件修改
├── shared/                    # 新增：前后端共享类型
│   └── protocol.ts           # WebSocket 消息协议类型定义
├── Dockerfile                 # 新增
├── docker-compose.yml         # 新增
└── nginx.conf                 # 新增
```

### 要删除/不再使用的文件
- `src/extension.ts` — VS Code 入口
- `src/PixelAgentsViewProvider.ts` — WebviewViewProvider
- `src/agentManager.ts` — Terminal 管理
- `src/fileWatcher.ts` — JSONL 文件监听 (后端会重写)
- `src/transcriptParser.ts` — Claude JSONL 解析
- `src/timerManager.ts` — 权限计时器
- `src/layoutPersistence.ts` — 布局持久化 (后端重写)
- `esbuild.js` — 扩展打包脚本
- `package.json` 中 VS Code 扩展相关配置

### 保留/复用
- `src/assetLoader.ts` — PNG 解析逻辑移到 server/
- `src/constants.ts` — 部分常量移到 shared/
- `webview-ui/` — 整个前端大量复用

---

## Phase 2: 后端服务器 (`server/`)

### 2.1 角色配置 (`server/config.ts`)
```typescript
export const AGENTS = [
  { id: 1, name: 'OpenClaw', role: '主管家', palette: 0, hueShift: 0, seatId: 'seat-center' },
  { id: 2, name: 'Mia', role: 'PM', palette: 1, hueShift: 0, seatId: null },
  { id: 3, name: 'Kai', role: 'Dev', palette: 2, hueShift: 0, seatId: null },
  { id: 4, name: 'Aria', role: 'UI', palette: 3, hueShift: 0, seatId: null },
  { id: 5, name: 'Rex', role: 'QA', palette: 4, hueShift: 0, seatId: null },
  { id: 6, name: 'Nova', role: 'Ops', palette: 5, hueShift: 0, seatId: null },
  { id: 7, name: 'Zoe', role: 'Data', palette: 0, hueShift: 180, seatId: null },
] as const
```

### 2.2 WebSocket 服务 (`server/wsServer.ts`)
- 连接时发送初始状态: `existingAgents` → `characterSpritesLoaded` → `floorTilesLoaded` → `wallTilesLoaded` → `furnitureAssetsLoaded` → `layoutLoaded`
- 接收客户端消息: `webviewReady`, `saveLayout`, `saveAgentSeats`, `setSoundEnabled`
- 去掉不需要的消息: `openClaude`, `focusAgent`, `closeAgent`, `openSessionsFolder`

### 2.3 Agent 状态管理 (`server/agentStateManager.ts`)
状态机: `idle` → `active` → `idle`
- `setAgentActive(id, toolName)` → 广播 `agentToolStart`
- `setAgentIdle(id)` → 广播 `agentToolDone` + `agentToolsClear` + `agentStatus: waiting`
- 接收 watcher 事件并转换为消息协议

### 2.4 资产加载 (`server/assetLoader.ts`)
从 `src/assetLoader.ts` 移植 PNG 解析逻辑:
- 解析 `char_0-5.png` → 角色精灵数据
- 解析 `floors.png` → 地板精灵数据
- 解析 `walls.png` → 墙壁精灵数据
- 解析家具资产 → catalog + 精灵数据
- 启动时一次性加载，缓存在内存中

### 2.5 布局持久化 (`server/layoutStore.ts`)
- 读写 `~/.pixel-agents/layout.json` (复用原版路径)
- 提供 `readLayout()` / `writeLayout()` API
- 默认布局从 `webview-ui/public/assets/default-layout.json` 加载

### 2.6 Express + 入口 (`server/index.ts`)
- Express 服务静态文件 (`dist/webview/`)
- WebSocket 升级处理
- 端口 3210 (可配置)

---

## Phase 3: 前端适配 (`webview-ui/`)

### 3.1 替换 vscodeApi.ts → wsClient.ts
```typescript
// wsClient.ts
let ws: WebSocket | null = null
const messageQueue: unknown[] = []
const handlers: Set<(data: unknown) => void> = new Set()

export function connectWebSocket(url?: string) {
  const wsUrl = url || `ws://${location.host}/ws`
  ws = new WebSocket(wsUrl)
  ws.onopen = () => { messageQueue.forEach(m => ws!.send(JSON.stringify(m))); messageQueue.length = 0 }
  ws.onmessage = (e) => { const data = JSON.parse(e.data); handlers.forEach(h => h(data)) }
  ws.onclose = () => { setTimeout(() => connectWebSocket(url), 3000) } // 自动重连
}

export const vscode = {
  postMessage(msg: unknown) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    else messageQueue.push(msg)
  }
}

export function onMessage(handler: (data: unknown) => void) { handlers.add(handler); return () => handlers.delete(handler) }
```

### 3.2 修改 useExtensionMessages.ts
- 替换 `window.addEventListener('message', handler)` → `onMessage(handler)`
- 替换 `import { vscode } from '../vscodeApi.js'` → `import { vscode } from '../wsClient.js'`
- 其余逻辑不变 (消息协议保持一致)

### 3.3 修改 main.tsx
- 在 React 渲染前调用 `connectWebSocket()`

### 3.4 修改 App.tsx
- 去掉 `focusAgent`/`closeAgent` 的 `vscode.postMessage` 调用 (固定角色不可关闭)
- 点击角色改为选中/取消选中 (不再打开终端)

### 3.5 修改 BottomToolbar.tsx
- 去掉 "+ Agent" 按钮 (固定7个角色)
- 去掉 workspace folder 选择器
- 保留 Layout 和 Settings 按钮

### 3.6 修改 SettingsModal.tsx
- 去掉 "Open Sessions Folder" 按钮
- 导出/导入改为浏览器文件下载/上传
- 保留 Sound Notifications 和 Debug View

### 3.7 修改 ToolOverlay.tsx
- 显示角色名称 + 角色类型 (如 "Mia · PM")
- 去掉关闭按钮 (固定角色)

### 3.8 vite.config.ts
- 配置 WebSocket 代理 (dev 模式)
- 修改 base 路径为 `/opc/`

---

## Phase 4: 模拟 Watcher (开发阶段)

### 4.1 MockWatcher (`server/watcher/mockWatcher.ts`)
- 每 5-30 秒随机激活一个角色
- 随机选择工具类型 (Read/Write/Bash 等)
- 活跃 3-15 秒后回到 idle
- 支持同时多个角色活跃
- 模拟 OpenClaw 分配任务给其他角色

### 4.2 Watcher 接口 (`server/watcher/types.ts`)
```typescript
export interface AgentEvent {
  agentId: number
  type: 'active' | 'idle' | 'thinking' | 'error'
  toolName?: string   // 'Read' | 'Write' | 'Bash' 等
  message?: string    // 最后一条消息摘要
}

export interface Watcher {
  start(callback: (event: AgentEvent) => void): void
  stop(): void
}
```

---

## Phase 5: 部署

### 5.1 Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
EXPOSE 3210
CMD ["node", "dist/server/index.js"]
```

### 5.2 docker-compose.yml
```yaml
services:
  pixel-agent:
    build: .
    ports:
      - "3210:3210"
    volumes:
      - pixel-data:/root/.pixel-agents
    restart: unless-stopped
volumes:
  pixel-data:
```

### 5.3 Nginx 配置
```nginx
location /opc/ {
  proxy_pass http://localhost:3210/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

---

## Phase 6: P1 增强 (后续)
- [ ] 角色名称气泡 (头顶常驻显示)
- [ ] 活动消息摘要气泡
- [ ] 角色间连线动画 (任务分配可视化)
- [ ] 任务历史面板 (右侧抽屉)

---

## 实施顺序

1. **创建 server/ 目录结构** + 安装依赖 (express, ws, pngjs)
2. **创建 wsClient.ts** 替换 vscodeApi.ts
3. **修改 webview-ui 前端代码** (去 VS Code 依赖)
4. **实现 server/assetLoader.ts** (移植 PNG 解析)
5. **实现 server/index.ts + wsServer.ts** (Express + WS)
6. **实现 server/agentStateManager.ts** (7角色状态)
7. **实现 server/layoutStore.ts** (布局持久化)
8. **实现 MockWatcher** (模拟数据)
9. **修改构建脚本** (server + webview 联合构建)
10. **本地测试** (浏览器访问验证)
11. **Docker 化部署文件**
12. **Nginx 配置**
