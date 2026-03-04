/**
 * Config Store — 配置文件持久化
 * 读写 ~/.pixel-agents/config.json
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { LAYOUT_DIR } from './config.js'
import { createDefaultConfig } from '../shared/configTypes.js'
import type { AppConfig } from '../shared/configTypes.js'

const configDir = path.join(os.homedir(), LAYOUT_DIR)
const configPath = path.join(configDir, 'config.json')

export function readConfig(): AppConfig {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(content) as AppConfig
      if (parsed.version === 1 && Array.isArray(parsed.agents)) {
        return parsed
      }
    }
  } catch { /* fall through */ }
  return createDefaultConfig()
}

export function writeConfig(config: AppConfig): void {
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    // 原子写入: 先写 .tmp 再 rename
    const tmpPath = configPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2))
    fs.renameSync(tmpPath, configPath)
  } catch (err) {
    console.error('[ConfigStore] Error writing config:', err)
  }
}
