/**
 * Asset Loader — 服务端 PNG 解析
 * 从原 src/assetLoader.ts 移植，去掉 VS Code 依赖
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { PNG } from 'pngjs'
import {
  PNG_ALPHA_THRESHOLD,
  WALL_PIECE_WIDTH,
  WALL_PIECE_HEIGHT,
  WALL_GRID_COLS,
  WALL_BITMASK_COUNT,
  FLOOR_PATTERN_COUNT,
  FLOOR_TILE_SIZE,
  CHARACTER_DIRECTIONS,
  CHAR_FRAME_W,
  CHAR_FRAME_H,
  CHAR_FRAMES_PER_ROW,
  CHAR_COUNT,
} from './config.js'

// ── 类型 ────────────────────────────────────────────────────

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  orientation?: string
  state?: string
}

export interface CharacterDirectionSprites {
  down: string[][][]
  up: string[][][]
  right: string[][][]
}

export interface AllAssets {
  characters: CharacterDirectionSprites[]
  floorSprites: string[][][]
  wallSprites: string[][][]
  furnitureCatalog: FurnitureAsset[]
  furnitureSprites: Record<string, string[][]>
  defaultLayout: unknown | null
}

// ── PNG 解析工具函数 ─────────────────────────────────────────

function pixelToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase()
}

function pngToSpriteData(pngBuffer: Buffer, width: number, height: number): string[][] {
  try {
    const png = PNG.sync.read(pngBuffer)
    const sprite: string[][] = []
    for (let y = 0; y < height; y++) {
      const row: string[] = []
      for (let x = 0; x < width; x++) {
        const idx = (y * png.width + x) * 4
        const a = png.data[idx + 3]
        if (a < PNG_ALPHA_THRESHOLD) {
          row.push('')
        } else {
          row.push(pixelToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2]))
        }
      }
      sprite.push(row)
    }
    return sprite
  } catch {
    return Array.from({ length: height }, () => new Array(width).fill(''))
  }
}

// ── 加载所有资产 ─────────────────────────────────────────────

export function loadAllAssets(assetsRoot: string): AllAssets {
  return {
    characters: loadCharacterSprites(assetsRoot),
    floorSprites: loadFloorTiles(assetsRoot),
    wallSprites: loadWallTiles(assetsRoot),
    ...loadFurnitureAssets(assetsRoot),
    defaultLayout: loadDefaultLayout(assetsRoot),
  }
}

// ── 角色精灵 ─────────────────────────────────────────────────

function loadCharacterSprites(assetsRoot: string): CharacterDirectionSprites[] {
  const charDir = path.join(assetsRoot, 'assets', 'characters')
  const characters: CharacterDirectionSprites[] = []

  for (let ci = 0; ci < CHAR_COUNT; ci++) {
    const filePath = path.join(charDir, `char_${ci}.png`)
    if (!fs.existsSync(filePath)) {
      console.warn(`[AssetLoader] Character sprite not found: ${filePath}`)
      continue
    }

    const pngBuffer = fs.readFileSync(filePath)
    const png = PNG.sync.read(pngBuffer)
    const charData: CharacterDirectionSprites = { down: [], up: [], right: [] }

    for (let dirIdx = 0; dirIdx < CHARACTER_DIRECTIONS.length; dirIdx++) {
      const dir = CHARACTER_DIRECTIONS[dirIdx]
      const rowOffsetY = dirIdx * CHAR_FRAME_H
      const frames: string[][][] = []

      for (let f = 0; f < CHAR_FRAMES_PER_ROW; f++) {
        const sprite: string[][] = []
        const frameOffsetX = f * CHAR_FRAME_W
        for (let y = 0; y < CHAR_FRAME_H; y++) {
          const row: string[] = []
          for (let x = 0; x < CHAR_FRAME_W; x++) {
            const idx = ((rowOffsetY + y) * png.width + (frameOffsetX + x)) * 4
            const a = png.data[idx + 3]
            if (a < PNG_ALPHA_THRESHOLD) {
              row.push('')
            } else {
              row.push(pixelToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2]))
            }
          }
          sprite.push(row)
        }
        frames.push(sprite)
      }
      charData[dir] = frames
    }
    characters.push(charData)
  }

  console.log(`[AssetLoader] Loaded ${characters.length} character sprites`)
  return characters
}

// ── 地板 ─────────────────────────────────────────────────────

function loadFloorTiles(assetsRoot: string): string[][][] {
  // Try new Office Tileset first
  const tilesetPath = path.join(assetsRoot, 'assets', 'Office Tileset', 'Office Tileset All 16x16.png')
  if (fs.existsSync(tilesetPath)) {
    const pngBuffer = fs.readFileSync(tilesetPath)
    const png = PNG.sync.read(pngBuffer)
    const sprites: string[][][] = []

    // New tileset: 16x16 tiles in grid, extract first 7 floor patterns
    for (let t = 0; t < FLOOR_PATTERN_COUNT; t++) {
      const sprite: string[][] = []
      for (let y = 0; y < FLOOR_TILE_SIZE; y++) {
        const row: string[] = []
        for (let x = 0; x < FLOOR_TILE_SIZE; x++) {
          const px = t * FLOOR_TILE_SIZE + x
          const idx = (y * png.width + px) * 4
          const a = png.data[idx + 3]
          if (a < PNG_ALPHA_THRESHOLD) {
            row.push('')
          } else {
            row.push(pixelToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2]))
          }
        }
        sprite.push(row)
      }
      sprites.push(sprite)
    }

    console.log(`[AssetLoader] Loaded ${sprites.length} floor tile patterns from Office Tileset`)
    return sprites
  }

  // Fallback to old floors.png
  const floorPath = path.join(assetsRoot, 'assets', 'floors.png')
  if (!fs.existsSync(floorPath)) {
    console.warn('[AssetLoader] floors.png not found')
    return []
  }

  const pngBuffer = fs.readFileSync(floorPath)
  const png = PNG.sync.read(pngBuffer)
  const sprites: string[][][] = []

  for (let t = 0; t < FLOOR_PATTERN_COUNT; t++) {
    const sprite: string[][] = []
    for (let y = 0; y < FLOOR_TILE_SIZE; y++) {
      const row: string[] = []
      for (let x = 0; x < FLOOR_TILE_SIZE; x++) {
        const px = t * FLOOR_TILE_SIZE + x
        const idx = (y * png.width + px) * 4
        const a = png.data[idx + 3]
        if (a < PNG_ALPHA_THRESHOLD) {
          row.push('')
        } else {
          row.push(pixelToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2]))
        }
      }
      sprite.push(row)
    }
    sprites.push(sprite)
  }

  console.log(`[AssetLoader] Loaded ${sprites.length} floor tile patterns`)
  return sprites
}

// ── 墙壁 ─────────────────────────────────────────────────────

function loadWallTiles(assetsRoot: string): string[][][] {
  // Try new Office Tileset VX Ace walls first
  const tilesetWallPath = path.join(assetsRoot, 'assets', 'Office Tileset', 'Office VX Ace', 'A4 Office Walls.png')
  if (fs.existsSync(tilesetWallPath)) {
    const pngBuffer = fs.readFileSync(tilesetWallPath)
    const png = PNG.sync.read(pngBuffer)
    const sprites: string[][][] = []

    // Extract 16 wall pieces from VX Ace format
    for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
      const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH
      const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT
      const sprite: string[][] = []
      for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
        const row: string[] = []
        for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
          const idx = ((oy + r) * png.width + (ox + c)) * 4
          const a = png.data[idx + 3]
          if (a < PNG_ALPHA_THRESHOLD) {
            row.push('')
          } else {
            row.push(pixelToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2]))
          }
        }
        sprite.push(row)
      }
      sprites.push(sprite)
    }

    console.log(`[AssetLoader] Loaded ${sprites.length} wall tile pieces from Office Tileset`)
    return sprites
  }

  // Fallback to old walls.png
  const wallPath = path.join(assetsRoot, 'assets', 'walls.png')
  if (!fs.existsSync(wallPath)) {
    console.warn('[AssetLoader] walls.png not found')
    return []
  }

  const pngBuffer = fs.readFileSync(wallPath)
  const png = PNG.sync.read(pngBuffer)
  const sprites: string[][][] = []

  for (let mask = 0; mask < WALL_BITMASK_COUNT; mask++) {
    const ox = (mask % WALL_GRID_COLS) * WALL_PIECE_WIDTH
    const oy = Math.floor(mask / WALL_GRID_COLS) * WALL_PIECE_HEIGHT
    const sprite: string[][] = []
    for (let r = 0; r < WALL_PIECE_HEIGHT; r++) {
      const row: string[] = []
      for (let c = 0; c < WALL_PIECE_WIDTH; c++) {
        const idx = ((oy + r) * png.width + (ox + c)) * 4
        const a = png.data[idx + 3]
        if (a < PNG_ALPHA_THRESHOLD) {
          row.push('')
        } else {
          row.push(pixelToHex(png.data[idx], png.data[idx + 1], png.data[idx + 2]))
        }
      }
      sprite.push(row)
    }
    sprites.push(sprite)
  }

  console.log(`[AssetLoader] Loaded ${sprites.length} wall tile pieces`)
  return sprites
}

// ── 家具 ─────────────────────────────────────────────────────

function loadFurnitureAssets(assetsRoot: string): {
  furnitureCatalog: FurnitureAsset[]
  furnitureSprites: Record<string, string[][]>
} {
  const catalogPath = path.join(assetsRoot, 'assets', 'furniture', 'furniture-catalog.json')
  if (!fs.existsSync(catalogPath)) {
    console.log('[AssetLoader] No furniture catalog found')
    return { furnitureCatalog: [], furnitureSprites: {} }
  }

  const catalogContent = fs.readFileSync(catalogPath, 'utf-8')
  const catalogData = JSON.parse(catalogContent) as { assets?: FurnitureAsset[] }
  const catalog = catalogData.assets ?? []
  const sprites: Record<string, string[][]> = {}

  for (const asset of catalog) {
    try {
      let filePath = asset.file
      if (!filePath.startsWith('assets/')) filePath = `assets/${filePath}`
      const assetPath = path.join(assetsRoot, filePath)
      if (!fs.existsSync(assetPath)) continue

      const pngBuffer = fs.readFileSync(assetPath)
      sprites[asset.id] = pngToSpriteData(pngBuffer, asset.width, asset.height)
    } catch {
      // skip broken assets
    }
  }

  console.log(`[AssetLoader] Loaded ${Object.keys(sprites).length}/${catalog.length} furniture assets`)
  return { furnitureCatalog: catalog, furnitureSprites: sprites }
}

// ── 默认布局 ─────────────────────────────────────────────────

function loadDefaultLayout(assetsRoot: string): unknown | null {
  const layoutPath = path.join(assetsRoot, 'assets', 'default-layout.json')
  if (!fs.existsSync(layoutPath)) return null

  try {
    const content = fs.readFileSync(layoutPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}
