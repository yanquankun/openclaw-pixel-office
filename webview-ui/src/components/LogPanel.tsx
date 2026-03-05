/**
 * 活动日志组件 — 显示实时行为记录（右上角常驻面板）
 */

import { useState, useEffect, useRef } from 'react'

interface LogPanelProps {
  isOpen: boolean
  onClose: () => void
}

interface LogEntry {
  timestamp: string
  agentName?: string
  action: string
  detail?: string
}

export function LogPanel({ isOpen, onClose }: LogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    setIsLoading(true)
    fetch('./api/activity-logs')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.logs) {
          setLogs(data.logs)
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))

    // 每 3 秒刷新一次
    const interval = setInterval(() => {
      fetch('./api/activity-logs')
        .then(r => r.json())
        .then(data => {
          if (data.success && data.logs) {
            setLogs(data.logs)
          }
        })
        .catch(console.error)
    }, 3000)

    return () => clearInterval(interval)
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 'min(400px, 35vw)',
        maxHeight: '60vh',
        background: 'var(--pixel-bg)',
        border: '3px solid var(--pixel-border)',
        borderRadius: 0,
        boxShadow: 'var(--pixel-shadow)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 标题栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--pixel-accent)',
          borderBottom: '2px solid var(--pixel-border)',
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '18px',
            color: '#000',
            fontFamily: "'FS Pixel Sans', monospace",
            fontWeight: 'bold',
          }}
        >
          📋 行为日志
        </h2>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '2px solid #000',
            borderRadius: 0,
            padding: '2px 8px',
            fontSize: '18px',
            cursor: 'pointer',
            fontFamily: "'FS Pixel Sans', monospace",
            color: '#000',
            lineHeight: 1,
          }}
          title="关闭"
        >
          ✕
        </button>
      </div>

      {/* 日志内容 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 10,
          fontFamily: "'FS Pixel Sans', monospace",
          fontSize: '13px',
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        {isLoading && logs.length === 0 ? (
          <div style={{ color: 'var(--pixel-text-dim)', textAlign: 'center', padding: 20 }}>
            加载中...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ color: 'var(--pixel-text-dim)', textAlign: 'center', padding: 20 }}>
            暂无日志记录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {logs.map((log, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--pixel-border)',
                  borderRadius: 0,
                  padding: '6px 10px',
                }}
              >
                <div style={{ color: 'var(--pixel-accent)', fontSize: '11px', marginBottom: 3 }}>
                  {log.timestamp} {log.agentName && `· ${log.agentName}`}
                </div>
                <div style={{ color: 'var(--pixel-text)', lineHeight: 1.4 }}>{log.action}</div>
                {log.detail && (
                  <div style={{ color: 'var(--pixel-text-dim)', fontSize: '11px', marginTop: 3 }}>
                    {log.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
