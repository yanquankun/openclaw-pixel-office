/**
 * 服务端常量 — 角色配置从 config.json 动态加载
 */

// 重导出共享配置类型
export type { AgentConfig, AppConfig, OpenClawSettings, FeishuSettings } from '../shared/configTypes.js'

// ── 服务端常量 ──────────────────────────────────────────────

export const SERVER_PORT = parseInt(process.env['PORT'] ?? '3210', 10)

/** 资产根目录 (webview-ui/public/) */
export const ASSETS_ROOT = 'webview-ui/public'

/** 布局 & 配置持久化目录 */
export const LAYOUT_DIR = '.pixel-agents'
export const LAYOUT_FILE = 'layout.json'

// ── PNG 解析常量 (从原 src/constants.ts 移植) ─────────────────

export const PNG_ALPHA_THRESHOLD = 128
export const WALL_PIECE_WIDTH = 16
export const WALL_PIECE_HEIGHT = 32
export const WALL_GRID_COLS = 4
export const WALL_BITMASK_COUNT = 16
export const FLOOR_PATTERN_COUNT = 7
export const FLOOR_TILE_SIZE = 16
export const CHARACTER_DIRECTIONS = ['down', 'up', 'right'] as const
export const CHAR_FRAME_W = 16
export const CHAR_FRAME_H = 32
export const CHAR_FRAMES_PER_ROW = 7
export const CHAR_COUNT = 6
