/**
 * 应用配置类型 — 前后端共享
 */

export interface AgentConfig {
  id: number
  name: string
  role: string
  palette: number   // 0-5
  hueShift: number  // 0-360
}

export interface OpenClawSettings {
  enabled: boolean
  sessionDir: string    // 如 ~/.openclaw/agents
  apiEndpoint: string   // 如 http://localhost:8080
}

export interface FeishuSettings {
  enabled: boolean
  webhookUrl: string
}

export interface AppConfig {
  version: 1
  agents: AgentConfig[]
  openclaw: OpenClawSettings
  feishu: FeishuSettings
}

/** 默认配置：7 个角色 */
export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    agents: [
      { id: 1, name: 'OpenClaw', role: '主管家', palette: 0, hueShift: 0 },
      { id: 2, name: 'Mia', role: 'PM', palette: 1, hueShift: 0 },
      { id: 3, name: 'Kai', role: 'Dev', palette: 2, hueShift: 0 },
      { id: 4, name: 'Aria', role: 'UI', palette: 3, hueShift: 0 },
      { id: 5, name: 'Rex', role: 'QA', palette: 4, hueShift: 0 },
      { id: 6, name: 'Nova', role: 'Ops', palette: 5, hueShift: 0 },
      { id: 7, name: 'Zoe', role: 'Data', palette: 0, hueShift: 180 },
    ],
    openclaw: {
      enabled: false,
      sessionDir: '',
      apiEndpoint: '',
    },
    feishu: {
      enabled: false,
      webhookUrl: '',
    },
  }
}
