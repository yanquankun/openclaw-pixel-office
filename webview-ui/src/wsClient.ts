/**
 * WebSocket 客户端 — 替换原版 vscodeApi.ts
 * 提供与 vscode.postMessage 兼容的 API 接口
 */

let ws: WebSocket | null = null
const messageQueue: unknown[] = []
const handlers = new Set<(data: unknown) => void>()
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export function connectWebSocket(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${location.host}/ws`

  console.log(`[WS] Connecting to ${wsUrl}`)
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('[WS] Connected')
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    // 发送队列中缓冲的消息
    for (const msg of messageQueue) {
      ws!.send(JSON.stringify(msg))
    }
    messageQueue.length = 0
  }

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string)
      for (const handler of handlers) {
        handler(data)
      }
    } catch {
      // ignore malformed messages
    }
  }

  ws.onclose = () => {
    console.log('[WS] Disconnected, reconnecting in 3s...')
    ws = null
    reconnectTimer = setTimeout(connectWebSocket, 3000)
  }

  ws.onerror = () => {
    // onclose 会处理重连
    ws?.close()
  }
}

/**
 * 兼容 vscode.postMessage 的发送接口
 */
export const vscode = {
  postMessage(msg: unknown): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      messageQueue.push(msg)
    }
  },
}

/**
 * 注册消息处理器 (替代 window.addEventListener('message'))
 * 返回取消注册函数
 */
export function onServerMessage(handler: (data: unknown) => void): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}
