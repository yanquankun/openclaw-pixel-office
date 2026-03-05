/**
 * 配置页面 — Agent 管理、OpenClaw 连接、飞书设置
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { AppConfig, AgentConfig } from '../../../shared/configTypes.js'

// ── 样式常量 ─────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--pixel-bg)',
  color: 'var(--pixel-text)',
  fontFamily: "'FS Pixel Sans', monospace",
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 720,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
}

const sectionStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  padding: 16,
  marginBottom: 16,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 20,
  marginBottom: 12,
  color: 'var(--pixel-accent)',
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  color: 'var(--pixel-text)',
  fontFamily: "'FS Pixel Sans', monospace",
  fontSize: 16,
  padding: '6px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 60,
  textAlign: 'center',
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 18,
  color: 'var(--pixel-text)',
  background: 'var(--pixel-btn-bg)',
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  cursor: 'pointer',
  fontFamily: "'FS Pixel Sans', monospace",
}

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--pixel-accent)',
  color: '#000',
  border: '2px solid var(--pixel-accent)',
}

const btnDangerStyle: React.CSSProperties = {
  ...btnStyle,
  color: '#ff6b6b',
  border: '2px solid #ff6b6b',
}

const linkStyle: React.CSSProperties = {
  color: 'var(--pixel-accent)',
  textDecoration: 'none',
  fontSize: 18,
}

const agentRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginBottom: 8,
  flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'rgba(255,255,255,0.5)',
  minWidth: 40,
}

const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
}

const toastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 20,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'var(--pixel-accent)',
  color: '#000',
  padding: '10px 24px',
  fontSize: 18,
  border: '2px solid var(--pixel-border)',
  borderRadius: 0,
  boxShadow: 'var(--pixel-shadow)',
  zIndex: 9999,
  fontFamily: "'FS Pixel Sans', monospace",
}

// ── 调色板预览色 ─────────────────────────────────────────────

const PALETTE_COLORS = ['#f5d6b8', '#c4a882', '#8b6d5c', '#6b4c3b', '#f0c0a0', '#d4a574']

function PalettePreview({ palette, hueShift }: { palette: number; hueShift: number }) {
  const baseColor = PALETTE_COLORS[palette] ?? PALETTE_COLORS[0]
  return (
    <div
      style={{
        width: 20,
        height: 20,
        background: baseColor,
        border: '2px solid var(--pixel-border)',
        filter: hueShift ? `hue-rotate(${hueShift}deg)` : undefined,
        flexShrink: 0,
      }}
      title={`Palette ${palette}, HueShift ${hueShift}`}
    />
  )
}

// ── 主组件 ───────────────────────────────────────────────────

export function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 使用相对路径，避免 basename 问题
    fetch('./api/config')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setConfig)
      .catch((err) => {
        console.error('[ConfigPage] Failed to load config:', err)
        setError('无法加载配置')
      })
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const handleSave = async () => {
    if (!config) return
    if (config.agents.length === 0) {
      showToast('至少需要 1 个 Agent')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('./api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        showToast('配置已保存!')
      } else {
        const data = await res.json()
        showToast(`保存失败: ${data.error ?? '未知错误'}`)
      }
    } catch {
      showToast('网络错误')
    }
    setSaving(false)
  }

  const addAgent = () => {
    if (!config) return
    const maxId = config.agents.reduce((max, a) => Math.max(max, a.id), 0)
    const usedPalettes = config.agents.map(a => a.palette)
    // 选择使用最少的 palette
    const counts = [0, 1, 2, 3, 4, 5].map(p => ({
      palette: p,
      count: usedPalettes.filter(u => u === p).length,
    }))
    counts.sort((a, b) => a.count - b.count)
    const palette = counts[0].palette
    const needsHueShift = counts[0].count > 0

    const newAgent: AgentConfig = {
      id: maxId + 1,
      name: `Agent${maxId + 1}`,
      role: '角色',
      palette,
      hueShift: needsHueShift ? Math.floor(Math.random() * 270) + 45 : 0,
    }
    setConfig({ ...config, agents: [...config.agents, newAgent] })
  }

  const removeAgent = (id: number) => {
    if (!config) return
    setConfig({ ...config, agents: config.agents.filter(a => a.id !== id) })
  }

  const updateAgent = (id: number, patch: Partial<AgentConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      agents: config.agents.map(a => (a.id === id ? { ...a, ...patch } : a)),
    })
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ color: '#ff6b6b', fontSize: 20 }}>{error}</div>
      </div>
    )
  }

  if (!config) {
    return (
      <div style={pageStyle}>
        <div style={{ fontSize: 20 }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      {toast && <div style={toastStyle}>{toast}</div>}

      <div style={containerStyle}>
        {/* 头部 */}
        <div style={headerStyle}>
          <Link to="/" style={linkStyle}>&lt;- 返回办公室</Link>
          <span style={{ fontSize: 24 }}>配置中心</span>
        </div>

        {/* Agents 配置 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Agents 配置</div>
          {config.agents.map(agent => (
            <div key={agent.id} style={agentRowStyle}>
              <PalettePreview palette={agent.palette} hueShift={agent.hueShift} />
              <span style={{ ...labelStyle, minWidth: 24 }}>#{agent.id}</span>
              <input
                style={{ ...inputStyle, width: 100 }}
                value={agent.name}
                onChange={e => updateAgent(agent.id, { name: e.target.value })}
                placeholder="名称"
              />
              <input
                style={{ ...inputStyle, width: 80 }}
                value={agent.role}
                onChange={e => updateAgent(agent.id, { role: e.target.value })}
                placeholder="角色"
              />
              <span style={labelStyle}>皮肤</span>
              <input
                style={smallInputStyle}
                type="number"
                min={0}
                max={5}
                value={agent.palette}
                onChange={e => updateAgent(agent.id, { palette: Math.min(5, Math.max(0, parseInt(e.target.value) || 0)) })}
              />
              <span style={labelStyle}>色调</span>
              <input
                style={{ ...inputStyle, width: 80 }}
                type="range"
                min={0}
                max={360}
                value={agent.hueShift}
                onChange={e => updateAgent(agent.id, { hueShift: parseInt(e.target.value) || 0 })}
              />
              <span style={{ ...labelStyle, minWidth: 30 }}>{agent.hueShift}°</span>
              <button
                style={btnDangerStyle}
                onClick={() => removeAgent(agent.id)}
                title="删除此 Agent"
              >
                X
              </button>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button style={btnStyle} onClick={addAgent}>+ 添加 Agent</button>
          </div>
        </div>

        {/* OpenClaw 连接配置 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>OpenClaw 连接</div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={config.openclaw.enabled}
              onChange={e =>
                setConfig({ ...config, openclaw: { ...config.openclaw, enabled: e.target.checked } })
              }
              style={{ width: 18, height: 18 }}
            />
            <span>启用 OpenClaw 对接</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={labelStyle}>Session 目录</span>
            <input
              style={{ ...inputStyle, marginTop: 4 }}
              value={config.openclaw.sessionDir}
              onChange={e =>
                setConfig({ ...config, openclaw: { ...config.openclaw, sessionDir: e.target.value } })
              }
              placeholder="如：~/.openclaw/agents"
              disabled={!config.openclaw.enabled}
            />
          </div>
          <div>
            <span style={labelStyle}>API 端点</span>
            <input
              style={{ ...inputStyle, marginTop: 4 }}
              value={config.openclaw.apiEndpoint}
              onChange={e =>
                setConfig({ ...config, openclaw: { ...config.openclaw, apiEndpoint: e.target.value } })
              }
              placeholder="如：http://localhost:8080"
              disabled={!config.openclaw.enabled}
            />
          </div>
        </div>

        {/* 飞书机器人配置 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>飞书机器人</div>
          <div style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={config.feishu.enabled}
              onChange={e =>
                setConfig({ ...config, feishu: { ...config.feishu, enabled: e.target.checked } })
              }
              style={{ width: 18, height: 18 }}
            />
            <span>启用飞书 Webhook</span>
          </div>
          <div>
            <span style={labelStyle}>Webhook URL</span>
            <input
              style={{ ...inputStyle, marginTop: 4 }}
              value={config.feishu.webhookUrl}
              onChange={e =>
                setConfig({ ...config, feishu: { ...config.feishu, webhookUrl: e.target.value } })
              }
              placeholder="如：https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
              disabled={!config.feishu.enabled}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            style={btnStyle}
            onClick={() => {
              fetch('./api/config').then(r => r.json()).then(setConfig)
              showToast('已重新加载')
            }}
          >
            重置
          </button>
          <button
            style={btnPrimaryStyle}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  )
}
