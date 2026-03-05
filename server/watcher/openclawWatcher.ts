/**
 * OpenClaw Watcher — 监听 OpenClaw Agent 活动状态
 *
 * 对接方式说明：
 * OpenClaw 部署在 VPS 上，可以通过以下方式获取 Agent 活动状态：
 *
 * 方案1 (推荐): 监听 OpenClaw 的 session JSONL 文件
 *   ~/.openclaw/agents/{role}/sessions/*.jsonl
 *   实时 tail 文件，解析 tool_use/tool_result 事件
 *
 * 方案2: 监听 Gateway 日志
 *   journalctl --user -u openclaw-gateway
 *   解析 dispatching/dispatch complete 状态
 *
 * 方案3: 如果 OpenClaw 暴露 WebSocket/HTTP API
 *   直接订阅事件推送
 *
 * 当前为模板实现，需要根据实际 OpenClaw 部署情况填充具体逻辑
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Watcher, AgentEvent } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 活动日志文件路径（与 server/index.ts 一致）
const projectRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, '..', '..', '..')
  : path.resolve(__dirname, '..')
const ACTIVITY_LOG_FILE = path.join(projectRoot, 'activity.log')

/** 记录活动日志 */
function logActivity(agentName: string, action: string, detail?: string): void {
  try {
    const timestamp = new Date().toLocaleString('zh-CN', { hour12: false })
    const line = `${timestamp} | ${agentName} | ${action}${detail ? ` | ${detail}` : ''}\n`
    if (!fs.existsSync(ACTIVITY_LOG_FILE)) {
      fs.writeFileSync(ACTIVITY_LOG_FILE, '', 'utf-8')
    }
    fs.appendFileSync(ACTIVITY_LOG_FILE, line, 'utf-8')
  } catch (err) {
    console.error('[OpenClawWatcher] Failed to write activity log:', err)
  }
}

/** OpenClaw 角色名到 Agent ID 的映射 */
const ROLE_TO_AGENT_ID: Record<string, number> = {
  'main': 1,        // OpenClaw 主管家
  'pm': 2,          // Mia · PM
  'dev': 3,         // Kai · Dev
  'ui': 4,          // Aria · UI
  'qa': 5,          // Rex · QA
  'ops': 6,         // Nova · Ops
  'data': 7,        // Zoe · Data
}

/** Agent ID 到角色名的反向映射 */
const AGENT_ID_TO_ROLE: Record<number, string> = {}
for (const [role, id] of Object.entries(ROLE_TO_AGENT_ID)) {
  AGENT_ID_TO_ROLE[id] = role
}

/** 角色名到显示名的映射 */
const ROLE_TO_DISPLAY_NAME: Record<string, string> = {
  'main': 'OpenClaw',
  'pm': 'Mia·PM',
  'dev': 'Kai·Dev',
  'ui': 'Aria·UI',
  'qa': 'Rex·QA',
  'ops': 'Nova·Ops',
  'data': 'Zoe·Data',
}

/** OpenClaw 工具名到像素小人动画的映射 */
const TOOL_NAME_MAP: Record<string, string> = {
  // OpenClaw 工具名 → 像素小人工具名
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  exec: 'Bash',
  web_search: 'WebFetch',
  web_fetch: 'WebFetch',
  browser: 'WebFetch',
  message: 'Task',
  sessions_send: 'Task',
  sessions_spawn: 'Task',
  image: 'Read',
  pdf: 'Read',
  nodes: 'Bash',
}

export class OpenClawWatcher implements Watcher {
  private sessionDir: string
  private watchers: fs.FSWatcher[] = []
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private callback: ((event: AgentEvent) => void) | null = null
  private fileOffsets = new Map<string, number>()
  private allowedAgentIds: Set<number> | null = null

  constructor(sessionDir?: string) {
    // 默认路径，根据实际 OpenClaw 部署调整
    this.sessionDir = sessionDir ?? path.join(
      process.env['HOME'] ?? '/root',
      '.openclaw',
      'agents',
    )
  }

  private idleTimers = new Map<number, ReturnType<typeof setTimeout>>()

  start(callback: (event: AgentEvent) => void, agentIds?: number[]): void {
    this.callback = callback
    console.log(`[OpenClawWatcher] 开始监听: ${this.sessionDir}`)

    // Optional: limit watching to specific agent IDs
    if (Array.isArray(agentIds) && agentIds.length > 0) {
      this.allowedAgentIds = new Set(agentIds)
    }

    if (!fs.existsSync(this.sessionDir)) {
      console.warn(`[OpenClawWatcher] 目录不存在: ${this.sessionDir}`)
      console.warn('[OpenClawWatcher] 回退使用 MockWatcher 模拟数据')
      return
    }

    // 扫描所有角色目录
    this.scanRoles()

    // 定时轮询 (备用)
    this.pollTimer = setInterval(() => this.scanRoles(), 2000)
  }

  stop(): void {
    for (const w of this.watchers) w.close()
    this.watchers = []
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null

    for (const t of this.idleTimers.values()) {
      clearTimeout(t)
    }
    this.idleTimers.clear()

    this.callback = null
    console.log('[OpenClawWatcher] 停止监听')
  }

  private scanRoles(): void {
    try {
      const entries = fs.readdirSync(this.sessionDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const roleName = entry.name.toLowerCase()
        const agentId = ROLE_TO_AGENT_ID[roleName]
        if (agentId === undefined) continue
        if (this.allowedAgentIds && !this.allowedAgentIds.has(agentId)) continue

        const sessionsDir = path.join(this.sessionDir, entry.name, 'sessions')
        if (!fs.existsSync(sessionsDir)) continue

        this.watchSessionDir(sessionsDir, agentId)
      }
    } catch {
      // 目录可能不存在
    }
  }

  private watchSessionDir(dir: string, agentId: number): void {
    // 找最新的 JSONL 文件
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          mtime: fs.statSync(path.join(dir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime)

      if (files.length === 0) return

      const latestFile = files[0]
      this.tailFile(latestFile.path, agentId)
    } catch {
      // ignore
    }
  }

  private tailFile(filePath: string, agentId: number): void {
    const offset = this.fileOffsets.get(filePath) ?? 0
    const stat = fs.statSync(filePath)
    if (stat.size <= offset) return

    const buffer = Buffer.alloc(stat.size - offset)
    const fd = fs.openSync(filePath, 'r')
    fs.readSync(fd, buffer, 0, buffer.length, offset)
    fs.closeSync(fd)

    this.fileOffsets.set(filePath, stat.size)

    const newContent = buffer.toString('utf-8')
    const lines = newContent.split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as {
          type?: string
          message?: { content?: unknown }
        }
        this.processRecord(record, agentId)
      } catch {
        // skip malformed lines
      }
    }
  }

  private processRecord(
    record: { type?: string; message?: { content?: unknown } },
    agentId: number,
  ): void {
    if (!this.callback) return

    // OpenClaw JSONL（我们当前版本）：
    // record.type === 'message'
    // record.message.content: Array<{type:'text'|'thinking'|'toolCall', name?:string, arguments?:object}>

    if (record.type !== 'message') return

    const content = record.message?.content
    if (!Array.isArray(content)) return

    // Extract first toolCall in this record
    for (const block of content) {
      const b = block as { type?: string; name?: string }
      if (b && b.type === 'toolCall') {
        const raw = (b.name ?? '').trim()
        const toolName = TOOL_NAME_MAP[raw] ?? (
          raw === 'exec' ? 'Bash'
          : raw === 'read' ? 'Read'
          : raw === 'edit' ? 'Edit'
          : raw === 'write' ? 'Write'
          : raw === 'web_search' ? 'WebFetch'
          : raw === 'web_fetch' ? 'WebFetch'
          : raw === 'browser' ? 'WebFetch'
          : raw === 'message' ? 'Task'
          : 'Read'
        )

        this.callback({ agentId, type: 'active', toolName })

        // 记录活动日志
        const roleName = AGENT_ID_TO_ROLE[agentId] || `agent-${agentId}`
        const displayName = ROLE_TO_DISPLAY_NAME[roleName] || roleName
        logActivity(displayName, '执行工具', toolName)

        // Debounced idle: mark idle if no further toolCall within TTL
        const prev = this.idleTimers.get(agentId)
        if (prev) clearTimeout(prev)
        const t = setTimeout(() => {
          if (this.callback) {
            this.callback({ agentId, type: 'idle' })
            logActivity(displayName, '任务完成', '进入待命状态')
          }
        }, 22000)
        this.idleTimers.set(agentId, t)

        break
      }
    }
  }
}
