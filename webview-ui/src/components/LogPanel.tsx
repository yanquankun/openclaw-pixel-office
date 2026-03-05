/**
 * 活动日志组件 — 显示实时行为记录
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

    // 每 5 秒刷新一次
    const interval = setInterval(() => {
      fetch('./api/activity-logs')
        .then(r => r.json())
        .then(data => {
          if (data.success && data.logs) {
            setLogs(data.logs)
          }
        })
        .catch(console.error)
    }, 5000)

    return () => clearInterval(interval)
  }, [isOpen])

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(600px, 90vw)',
        maxHeight: '70vh',
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
          padding: '12px 16px',
          background: 'var(--pixel-accent)',
          borderBottom: '2px solid var(--pixel-border)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '20px',
            color: '#000',
            fontFamily: "'FS Pixel Sans', monospace",
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
            padding: '4px 10px',
            fontSize: '20px',
            cursor: 'pointer',
            fontFamily: "'FS Pixel Sans', monospace",
            color: '#000',
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
          padding: 12,
          fontFamily: "'FS Pixel Sans', monospace",
          fontSize: '14px',
          background: 'rgba(0,0,0,0.3)',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logs.map((log, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--pixel-border)',
                  borderRadius: 0,
                  padding: '8px 12px',
                }}
              >
                <div style={{ color: 'var(--pixel-accent)', fontSize: '12px', marginBottom: 4 }}>
                  {log.timestamp} {log.agentName && `· ${log.agentName}`}
                </div>
                <div style={{ color: 'var(--pixel-text)' }}>{log.action}</div>
                {log.detail && (
                  <div style={{ color: 'var(--pixel-text-dim)', fontSize: '12px', marginTop: 4 }}>
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
