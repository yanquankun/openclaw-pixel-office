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
import type { AgentEvent } from './watcher/types.js'
import * as fs from 'node:fs'
import { loadAllAssets } from './assetLoader.js'
import { AgentStateManager } from './agentStateManager.js'
import { createWsServer } from './wsServer.js'
import { MockWatcher } from './watcher/mockWatcher.js'
import { OpenClawWatcher } from './watcher/openclawWatcher.js'
import { readConfig, writeConfig } from './configStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 编译后位于 dist/server/server/，需要向上 3 级；开发模式 (tsx) 位于 server/，向上 1 级
// 通过检测路径中是否包含 'dist' 来判断
const projectRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, '..', '..', '..')
  : path.resolve(__dirname, '..')

// 活动日志文件路径
const ACTIVITY_LOG_FILE = path.join(projectRoot, 'activity.log')

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

// 活动日志 API
app.get('/api/activity-logs', (_req, res) => {
  try {
    if (!fs.existsSync(ACTIVITY_LOG_FILE)) {
      return res.json({ success: true, logs: [], date: new Date().toISOString().split('T')[0] })
    }
    const content = fs.readFileSync(ACTIVITY_LOG_FILE, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    // 取最后 100 条
    const recent = lines.slice(-100)
    const logs = recent.map(line => {
      // 格式：【YYYY-MM-DD HH:MM:SS】· agentName | action · detail
      const match = line.match(/^【(.+?)】· (.+?) \| (.+?)(?: · (.+))?$/)
      if (match) {
        return {
          timestamp: match[1] || '',
          agentName: match[2] || '',
          action: match[3] || '',
          detail: match[4] || '',
        }
      }
      // Fallback: split by |
      const parts = line.split(' | ')
      return {
        timestamp: parts[0] || '',
        agentName: parts[1] || '',
        action: parts[2] || '',
        detail: parts[3] || '',
      }
    })
    res.json({ success: true, logs, date: new Date().toISOString().split('T')[0] })
  } catch (err) {
    console.error('[ActivityLogs] Error reading log file:', err)
    res.json({ success: false, error: 'Failed to read logs' })
  }
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
  // Restart watcher with new agent list
  watcher.stop()
  watcher.start(onAgentEvent, config.agents.map(a => a.id))

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

// ── Watcher (OpenClaw / Mock) ───────────────────────────────

const watcher = appConfig.openclaw?.enabled
  ? new OpenClawWatcher(appConfig.openclaw.sessionDir)
  : new MockWatcher()

const onAgentEvent = (event: AgentEvent) => {
  if (event.type === 'active') {
    agentManager.setActive(event.agentId, event.toolName ?? 'Read')
  } else {
    agentManager.setIdle(event.agentId)
  }
}

watcher.start(onAgentEvent, appConfig.agents.map(a => a.id))

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
