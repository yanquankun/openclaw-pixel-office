/**
 * Agent State Manager — 动态角色的状态管理
 */

import type { AgentConfig } from './config.js'

export type AgentStatus = 'idle' | 'active' | 'waiting'

export interface AgentState {
  config: AgentConfig
  status: AgentStatus
  currentToolId: string | null
  currentToolName: string | null
  seatId: string | null
}

export type AgentEventCallback = (msg: unknown) => void

let toolIdCounter = 0
function nextToolId(): string {
  return `tool-${++toolIdCounter}`
}

export class AgentStateManager {
  private agents: Map<number, AgentState> = new Map()
  private broadcast: AgentEventCallback = () => {}

  constructor(agentConfigs: AgentConfig[]) {
    this.initFromConfigs(agentConfigs)
  }

  private initFromConfigs(configs: AgentConfig[]): void {
    this.agents.clear()
    for (const config of configs) {
      this.agents.set(config.id, {
        config,
        status: 'idle',
        currentToolId: null,
        currentToolName: null,
        seatId: null,
      })
    }
  }

  /** 配置变更后重建所有 agent 并广播 */
  reinitialize(configs: AgentConfig[]): void {
    this.initFromConfigs(configs)
    for (const msg of this.getInitMessages()) {
      this.broadcast(msg)
    }
  }

  setBroadcast(fn: AgentEventCallback): void {
    this.broadcast = fn
  }

  /** 获取初始化时发送给新连接的消息序列 */
  getInitMessages(): unknown[] {
    const agentMeta: Record<number, { palette: number; hueShift: number; seatId?: string }> = {}
    const folderNames: Record<number, string> = {}

    for (const [id, agent] of this.agents) {
      agentMeta[id] = {
        palette: agent.config.palette,
        hueShift: agent.config.hueShift,
        seatId: agent.seatId ?? undefined,
      }
      folderNames[id] = `${agent.config.name} · ${agent.config.role}`
    }

    return [{
      type: 'existingAgents',
      agents: Array.from(this.agents.keys()),
      agentMeta,
      folderNames,
    }]
  }

  /** 更新座位分配 */
  updateSeats(seats: Record<number, { seatId: string | null }>): void {
    for (const [idStr, data] of Object.entries(seats)) {
      const id = Number(idStr)
      const agent = this.agents.get(id)
      if (agent) {
        agent.seatId = data.seatId
      }
    }
  }

  /** 激活角色 (开始工作) */
  setActive(id: number, toolName: string): void {
    const agent = this.agents.get(id)
    if (!agent) return

    const toolId = nextToolId()
    agent.status = 'active'
    agent.currentToolId = toolId
    agent.currentToolName = toolName

    this.broadcast({ type: 'agentToolStart', id, toolId, status: toolName })
    this.broadcast({ type: 'agentStatus', id, status: 'active' })
  }

  /** 角色完成工作 */
  setIdle(id: number): void {
    const agent = this.agents.get(id)
    if (!agent || agent.status === 'idle') return

    if (agent.currentToolId) {
      this.broadcast({ type: 'agentToolDone', id, toolId: agent.currentToolId })
    }
    this.broadcast({ type: 'agentToolsClear', id })
    this.broadcast({ type: 'agentStatus', id, status: 'waiting' })

    agent.status = 'idle'
    agent.currentToolId = null
    agent.currentToolName = null
  }

  getAgent(id: number): AgentState | undefined {
    return this.agents.get(id)
  }

  getAllAgents(): AgentState[] {
    return Array.from(this.agents.values())
  }
}
