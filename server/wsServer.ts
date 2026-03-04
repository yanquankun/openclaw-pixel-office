/**
 * WebSocket 服务器 — 管理客户端连接和消息广播
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import type { AllAssets } from './assetLoader.js'
import type { AgentStateManager } from './agentStateManager.js'
import { readLayout, writeLayout } from './layoutStore.js'

export function createWsServer(
  httpServer: Server,
  assets: AllAssets,
  agentManager: AgentStateManager,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  const clients = new Set<WebSocket>()

  // 设置广播函数
  agentManager.setBroadcast((msg) => {
    const data = JSON.stringify(msg)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    }
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log(`[WS] Client connected (total: ${clients.size})`)

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; [k: string]: unknown }
        handleClientMessage(ws, msg, assets, agentManager)
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[WS] Client disconnected (total: ${clients.size})`)
    })
  })

  return wss
}

function handleClientMessage(
  ws: WebSocket,
  msg: { type: string; [k: string]: unknown },
  assets: AllAssets,
  agentManager: AgentStateManager,
): void {
  switch (msg.type) {
    case 'webviewReady':
      sendInitialState(ws, assets, agentManager)
      break

    case 'saveLayout':
      writeLayout(msg.layout)
      break

    case 'saveAgentSeats':
      agentManager.updateSeats(msg.seats as Record<number, { seatId: string | null }>)
      break

    case 'setSoundEnabled':
      // 仅客户端本地设置，不需要服务端持久化
      break
  }
}

function sendInitialState(
  ws: WebSocket,
  assets: AllAssets,
  agentManager: AgentStateManager,
): void {
  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  // 1. 角色精灵
  send({ type: 'characterSpritesLoaded', characters: assets.characters })

  // 2. 地板
  send({ type: 'floorTilesLoaded', sprites: assets.floorSprites })

  // 3. 墙壁
  send({ type: 'wallTilesLoaded', sprites: assets.wallSprites })

  // 4. 家具
  if (assets.furnitureCatalog.length > 0) {
    send({
      type: 'furnitureAssetsLoaded',
      catalog: assets.furnitureCatalog,
      sprites: assets.furnitureSprites,
    })
  }

  // 5. 布局
  const layout = readLayout() ?? assets.defaultLayout
  send({ type: 'layoutLoaded', layout })

  // 6. 设置
  send({ type: 'settingsLoaded', soundEnabled: true })

  // 7. 现有角色 (7 个固定角色)
  for (const initMsg of agentManager.getInitMessages()) {
    send(initMsg)
  }
}
