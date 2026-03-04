/**
 * Layout Store — 布局文件持久化
 * 读写 ~/.pixel-agents/layout.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { LAYOUT_DIR, LAYOUT_FILE } from './config.js'

const layoutDir = path.join(os.homedir(), LAYOUT_DIR)
const layoutPath = path.join(layoutDir, LAYOUT_FILE)

export function readLayout(): unknown | null {
  try {
    if (!fs.existsSync(layoutPath)) return null
    const content = fs.readFileSync(layoutPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export function writeLayout(layout: unknown): void {
  try {
    if (!fs.existsSync(layoutDir)) {
      fs.mkdirSync(layoutDir, { recursive: true })
    }
    // 原子写入: 先写 .tmp 再 rename
    const tmpPath = layoutPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(layout, null, 2))
    fs.renameSync(tmpPath, layoutPath)
  } catch (err) {
    console.error('[LayoutStore] Error writing layout:', err)
  }
}
