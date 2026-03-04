/**
 * WebSocket 消息协议 — 前后端共享类型定义
 * 保持与原版 VS Code postMessage 协议兼容
 */

// ── 服务端 → 客户端消息 ──────────────────────────────────────

export interface LayoutLoadedMsg {
  type: 'layoutLoaded'
  layout: unknown
}

export interface AgentCreatedMsg {
  type: 'agentCreated'
  id: number
  folderName?: string
}

export interface AgentClosedMsg {
  type: 'agentClosed'
  id: number
}

export interface ExistingAgentsMsg {
  type: 'existingAgents'
  agents: number[]
  agentMeta: Record<number, { palette?: number; hueShift?: number; seatId?: string }>
  folderNames: Record<number, string>
}

export interface AgentToolStartMsg {
  type: 'agentToolStart'
  id: number
  toolId: string
  status: string
}

export interface AgentToolDoneMsg {
  type: 'agentToolDone'
  id: number
  toolId: string
}

export interface AgentToolsClearMsg {
  type: 'agentToolsClear'
  id: number
}

export interface AgentStatusMsg {
  type: 'agentStatus'
  id: number
  status: 'active' | 'waiting'
}

export interface AgentSelectedMsg {
  type: 'agentSelected'
  id: number
}

export interface CharacterSpritesLoadedMsg {
  type: 'characterSpritesLoaded'
  characters: Array<{ down: string[][][]; up: string[][][]; right: string[][][] }>
}

export interface FloorTilesLoadedMsg {
  type: 'floorTilesLoaded'
  sprites: string[][][]
}

export interface WallTilesLoadedMsg {
  type: 'wallTilesLoaded'
  sprites: string[][][]
}

export interface FurnitureAssetsLoadedMsg {
  type: 'furnitureAssetsLoaded'
  catalog: unknown[]
  sprites: Record<string, string[][]>
}

export interface SettingsLoadedMsg {
  type: 'settingsLoaded'
  soundEnabled: boolean
}

export type ServerMessage =
  | LayoutLoadedMsg
  | AgentCreatedMsg
  | AgentClosedMsg
  | ExistingAgentsMsg
  | AgentToolStartMsg
  | AgentToolDoneMsg
  | AgentToolsClearMsg
  | AgentStatusMsg
  | AgentSelectedMsg
  | CharacterSpritesLoadedMsg
  | FloorTilesLoadedMsg
  | WallTilesLoadedMsg
  | FurnitureAssetsLoadedMsg
  | SettingsLoadedMsg

// ── 客户端 → 服务端消息 ──────────────────────────────────────

export interface WebviewReadyMsg {
  type: 'webviewReady'
}

export interface SaveLayoutMsg {
  type: 'saveLayout'
  layout: unknown
}

export interface SaveAgentSeatsMsg {
  type: 'saveAgentSeats'
  seats: Record<number, { palette: number; hueShift: number; seatId: string | null }>
}

export interface SetSoundEnabledMsg {
  type: 'setSoundEnabled'
  enabled: boolean
}

export type ClientMessage =
  | WebviewReadyMsg
  | SaveLayoutMsg
  | SaveAgentSeatsMsg
  | SetSoundEnabledMsg
