/**
 * Mock Watcher — 开发阶段模拟 OpenClaw Agent 活动
 * 随机激活/休息角色，模拟真实工作节奏
 */

import type { Watcher, AgentEvent } from './types.js'

const TOOL_NAMES = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'Task'] as const

function randomRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export class MockWatcher implements Watcher {
  private timers: ReturnType<typeof setTimeout>[] = []
  private callback: ((event: AgentEvent) => void) | null = null
  private activeAgents = new Set<number>()
  private agentIds: number[] = []

  start(callback: (event: AgentEvent) => void, agentIds?: number[]): void {
    this.callback = callback
    this.agentIds = agentIds ?? []
    console.log(`[MockWatcher] Started — simulating ${this.agentIds.length} agents`)

    for (const id of this.agentIds) {
      this.scheduleNext(id)
    }
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
    this.activeAgents.clear()
    console.log('[MockWatcher] Stopped')
  }

  /** 配置变更后重启 */
  restart(agentIds: number[]): void {
    this.stop()
    if (this.callback) {
      this.start(this.callback, agentIds)
    }
  }

  private scheduleNext(agentId: number): void {
    if (!this.callback) return

    if (this.activeAgents.has(agentId)) {
      // 当前活跃 → 安排休息
      const workDuration = randomRange(3000, 15000) // 3-15秒工作
      const timer = setTimeout(() => {
        this.activeAgents.delete(agentId)
        this.callback?.({ agentId, type: 'idle' })
        this.scheduleNext(agentId)
      }, workDuration)
      this.timers.push(timer)
    } else {
      // 当前空闲 → 安排下次活跃
      const idleDuration = randomRange(5000, 30000) // 5-30秒空闲
      const timer = setTimeout(() => {
        this.activeAgents.add(agentId)
        const toolName = randomPick(TOOL_NAMES)
        this.callback?.({ agentId, type: 'active', toolName })
        this.scheduleNext(agentId)
      }, idleDuration)
      this.timers.push(timer)
    }
  }
}
