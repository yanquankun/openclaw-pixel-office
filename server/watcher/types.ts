/**
 * Watcher 抽象接口 — 用于监听 OpenClaw Agent 活动
 */

export interface AgentEvent {
  agentId: number
  type: 'active' | 'idle'
  toolName?: string  // 'Read' | 'Write' | 'Bash' | 'Edit' | 'Grep' | 'Glob' | 'WebFetch' | 'Task'
  message?: string   // 消息摘要
}

export interface Watcher {
  start(callback: (event: AgentEvent) => void, agentIds?: number[]): void
  stop(): void
}
