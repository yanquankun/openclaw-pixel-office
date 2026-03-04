/**
 * OpenClaw Pixel Agent — 服务端入口
 * Express 静态文件 + REST API + WebSocket
 */

import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createServer } from 'node:http'
import { SERVER_PORT, ASSETS_ROOT } from './config.js'
import type { AppConfig } from './config.js'
import { loadAllAssets } from './assetLoader.js'
import { AgentStateManager } from './agentStateManager.js'
import { createWsServer } from './wsServer.js'
import { MockWatcher } from './watcher/mockWatcher.js'
import { readConfig, writeConfig } from './configStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 编译后位于 dist/server/server/，需要向上 3 级；开发模式 (tsx) 位于 server/，向上 1 级
// 通过检测路径中是否包含 'dist' 来判断
const projectRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, '..', '..', '..')
  : path.resolve(__dirname, '..')

// ── 加载资产 ─────────────────────────────────────────────────

console.log('[Server] Loading assets...')
const assetsRoot = path.join(projectRoot, ASSETS_ROOT)
const assets = loadAllAssets(assetsRoot)
console.log('[Server] Assets loaded successfully')

// ── 加载配置 & 创建 Agent 状态管理器 ──────────────────────────

const appConfig = readConfig()
console.log(`[Server] Loaded config: ${appConfig.agents.length} agents`)

const agentManager = new AgentStateManager(appConfig.agents)

// ── Express + HTTP Server ────────────────────────────────────

const app = express()
const httpServer = createServer(app)

// JSON body 解析
app.use(express.json())

// ── REST API ─────────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  const config = readConfig()
  res.json(config)
})

app.post('/api/config', (req, res) => {
  const config = req.body as AppConfig
  // 基本验证
  if (!config || config.version !== 1 || !Array.isArray(config.agents)) {
    res.status(400).json({ error: 'Invalid config format' })
    return
  }
  // 验证 agent ID 唯一性
  const ids = new Set(config.agents.map(a => a.id))
  if (ids.size !== config.agents.length) {
    res.status(400).json({ error: 'Duplicate agent IDs' })
    return
  }

  writeConfig(config)

  // 重建运行时状态
  agentManager.reinitialize(config.agents)
  watcher.restart(config.agents.map(a => a.id))

  console.log(`[Server] Config updated: ${config.agents.length} agents`)
  res.json({ ok: true })
})

// ── 静态文件: 前端构建产物 ────────────────────────────────────

const webviewDist = path.join(projectRoot, 'dist', 'webview')
app.use(express.static(webviewDist))

// SPA fallback (Express v5 语法)
app.get('/{*path}', (_req, res) => {
  res.sendFile(path.join(webviewDist, 'index.html'))
})

// ── WebSocket ────────────────────────────────────────────────

createWsServer(httpServer, assets, agentManager)

// ── Watcher (模拟) ───────────────────────────────────────────

const watcher = new MockWatcher()
watcher.start((event) => {
  if (event.type === 'active') {
    agentManager.setActive(event.agentId, event.toolName ?? 'Read')
  } else {
    agentManager.setIdle(event.agentId)
  }
}, appConfig.agents.map(a => a.id))

// ── 启动 ─────────────────────────────────────────────────────

httpServer.listen(SERVER_PORT, () => {
  console.log(`[Server] OpenClaw Pixel Agent running at http://localhost:${SERVER_PORT}`)
})

// 优雅退出
process.on('SIGINT', () => {
  watcher.stop()
  httpServer.close()
  process.exit(0)
})
