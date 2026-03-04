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
import type { Watcher, AgentEvent } from './types.js'

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

/** OpenClaw 工具名到像素小人动画的映射 */
const TOOL_NAME_MAP: Record<string, string> = {
  // OpenClaw 工具名 → 像素小人工具名
  'file_read': 'Read',
  'file_write': 'Write',
  'file_edit': 'Edit',
  'shell': 'Bash',
  'search': 'Grep',
  'browse': 'WebFetch',
  'think': 'Read',
  'plan': 'Read',
  'code': 'Write',
  'test': 'Bash',
  'deploy': 'Bash',
  'design': 'Edit',
  'analyze': 'Grep',
}

export class OpenClawWatcher implements Watcher {
  private sessionDir: string
  private watchers: fs.FSWatcher[] = []
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private callback: ((event: AgentEvent) => void) | null = null
  private fileOffsets = new Map<string, number>()

  constructor(sessionDir?: string) {
    // 默认路径，根据实际 OpenClaw 部署调整
    this.sessionDir = sessionDir ?? path.join(
      process.env['HOME'] ?? '/root',
      '.openclaw',
      'agents',
    )
  }

  start(callback: (event: AgentEvent) => void): void {
    this.callback = callback
    console.log(`[OpenClawWatcher] 开始监听: ${this.sessionDir}`)

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

    // TODO: 根据实际 OpenClaw JSONL 格式调整解析逻辑
    // 以下是基于 Claude Code JSONL 格式的示例

    if (record.type === 'assistant') {
      const content = record.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as { type?: string; name?: string }
          if (b.type === 'tool_use') {
            const toolName = TOOL_NAME_MAP[b.name ?? ''] ?? 'Read'
            this.callback({ agentId, type: 'active', toolName })
          }
        }
      }
    } else if (record.type === 'system') {
      // turn_duration 表示一轮结束
      this.callback({ agentId, type: 'idle' })
    }
  }
}
