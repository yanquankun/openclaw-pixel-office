import { TileType, FurnitureType, TILE_SIZE, Direction } from '../types.js'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, Seat, FurnitureInstance, FloorColor } from '../types.js'
import { getCatalogEntry } from './furnitureCatalog.js'
import { getColorizedSprite } from '../colorize.js'

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = []
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = []
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c])
    }
    map.push(row)
  }
  return map
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks
  const deskZByTile = new Map<string, number>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    const deskZY = item.row * TILE_SIZE + entry.sprite.length
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        const prev = deskZByTile.get(key)
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY)
      }
    }
  }

  const instances: FurnitureInstance[] = []
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const x = item.col * TILE_SIZE
    const y = item.row * TILE_SIZE
    const spriteH = entry.sprite.length
    let zY = y + spriteH

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it)
        zY = (item.row + 1) * TILE_SIZE + 1
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE
      }
    }

    // Surface items render in front of the desk they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const deskZ = deskZByTile.get(`${item.col + dc},${item.row + dr}`)
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5
        }
      }
    }

    // Colorize sprite if this furniture has a color override
    let sprite = entry.sprite
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color
      sprite = getColorizedSprite(`furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`, entry.sprite, item.color)
    }

    instances.push({ sprite, x, y, zY })
  }
  return instances
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(furniture: PlacedFurniture[], excludeTiles?: Set<string>): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`
        if (excludeTiles && excludeTiles.has(key)) continue
        tiles.add(key)
      }
    }
  }
  return tiles
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(furniture: PlacedFurniture[], excludeUid?: string): Set<string> {
  const tiles = new Set<string>()
  for (const item of furniture) {
    if (item.uid === excludeUid) continue
    const entry = getCatalogEntry(item.type)
    if (!entry) continue
    const bgRows = entry.backgroundTiles || 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }
  return tiles
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front': return Direction.DOWN
    case 'back': return Direction.UP
    case 'left': return Direction.LEFT
    case 'right': return Direction.RIGHT
    default: return Direction.DOWN
  }
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>()

  // Build set of all desk tiles
  const deskTiles = new Set<string>()
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || !entry.isDesk) continue
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        deskTiles.add(`${item.col + dc},${item.row + dr}`)
      }
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP },    // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN },   // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT },   // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT },   // desk is right of chair → face RIGHT
  ]

  // For each chair, every footprint tile becomes a seat.
  // Multi-tile chairs (e.g. 2-tile couches) produce multiple seats.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type)
    if (!entry || entry.category !== 'chairs') continue

    let seatCount = 0
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const tileCol = item.col + dc
        const tileRow = item.row + dr

        // Determine facing direction:
        // 1) Chair orientation takes priority
        // 2) Adjacent desk direction
        // 3) Default forward (DOWN)
        let facingDir: Direction = Direction.DOWN
        if (entry.orientation) {
          facingDir = orientationToFacing(entry.orientation)
        } else {
          for (const d of dirs) {
            if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
              facingDir = d.facing
              break
            }
          }
        }

        // First seat uses chair uid (backward compat), subsequent use uid:N
        const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`
        seats.set(seatUid, {
          uid: seatUid,
          seatCol: tileCol,
          seatRow: tileRow,
          facingDir,
          assigned: false,
        })
        seatCount++
      }
    }
  }

  return seats
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>()
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`)
  }
  return tiles
}

/** Default floor colors for the two rooms */
const DEFAULT_LEFT_ROOM_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }  // warm beige
const DEFAULT_RIGHT_ROOM_COLOR: FloorColor = { h: 25, s: 45, b: 5, c: 10 }  // warm brown
const DEFAULT_CARPET_COLOR: FloorColor = { h: 280, s: 40, b: -5, c: 0 }     // purple
const DEFAULT_DOORWAY_COLOR: FloorColor = { h: 35, s: 25, b: 10, c: 0 }     // tan

/** Create the default office layout for the web deployment. */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F2 = TileType.FLOOR_2
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4
  const F5 = TileType.FLOOR_5
  const F6 = TileType.FLOOR_6

  const cols = 26
  const rows = 21
  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows - 1 || c === 0 || c === cols - 1
      const isUpperDivider = r === 6 && c >= 2 && c <= cols - 3 && !(c >= 11 && c <= 14)
      const isLowerDivider = r === 13 && c >= 5 && c <= 20 && !(c >= 12 && c <= 13)

      if (isBorder || isUpperDivider || isLowerDivider) {
        tiles.push(W)
        tileColors.push(null)
        continue
      }

      const isUpperDoor = r === 6 && c >= 11 && c <= 14
      const isLowerDoor = r === 13 && c >= 12 && c <= 13
      if (isUpperDoor || isLowerDoor) {
        tiles.push(F4)
        tileColors.push(DEFAULT_DOORWAY_COLOR)
        continue
      }

      if (r <= 5) {
        if (c <= 12) {
          tiles.push(F1)
          tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
        } else {
          tiles.push(F2)
          tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
        }
        continue
      }

      if (r <= 12) {
        if (c >= 8 && c <= 17) {
          tiles.push(F3)
          tileColors.push(DEFAULT_CARPET_COLOR)
        } else if (c <= 12) {
          tiles.push(F1)
          tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
        } else {
          tiles.push(F2)
          tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
        }
        continue
      }

      if (c <= 12) {
        tiles.push(F5)
        tileColors.push({ h: 32, s: 26, b: 8, c: 6 })
      } else {
        tiles.push(F6)
        tileColors.push({ h: 210, s: 20, b: -8, c: 8 })
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    { uid: 'whiteboard-tl', type: FurnitureType.WHITEBOARD, col: 3, row: 1 },
    { uid: 'whiteboard-tr', type: FurnitureType.WHITEBOARD, col: 18, row: 1 },
    { uid: 'whiteboard-mid', type: FurnitureType.WHITEBOARD, col: 11, row: 7 },
    { uid: 'whiteboard-bottom', type: FurnitureType.WHITEBOARD, col: 11, row: 15 },

    { uid: 'bookshelf-l1', type: FurnitureType.BOOKSHELF, col: 1, row: 2 },
    { uid: 'bookshelf-l2', type: FurnitureType.BOOKSHELF, col: 1, row: 4 },
    { uid: 'bookshelf-r1', type: FurnitureType.BOOKSHELF, col: 24, row: 2 },
    { uid: 'bookshelf-r2', type: FurnitureType.BOOKSHELF, col: 24, row: 4 },
    { uid: 'bookshelf-b1', type: FurnitureType.BOOKSHELF, col: 1, row: 15 },
    { uid: 'bookshelf-b2', type: FurnitureType.BOOKSHELF, col: 24, row: 15 },

    { uid: 'cooler-left', type: FurnitureType.COOLER, col: 2, row: 8 },
    { uid: 'cooler-right', type: FurnitureType.COOLER, col: 23, row: 8 },

    { uid: 'plant-tl', type: FurnitureType.PLANT, col: 2, row: 1 },
    { uid: 'plant-tr', type: FurnitureType.PLANT, col: 23, row: 1 },
    { uid: 'plant-mid-l', type: FurnitureType.PLANT, col: 9, row: 10 },
    { uid: 'plant-mid-r', type: FurnitureType.PLANT, col: 16, row: 10 },
    { uid: 'plant-bl', type: FurnitureType.PLANT, col: 2, row: 18 },
    { uid: 'plant-br', type: FurnitureType.PLANT, col: 23, row: 18 },

    { uid: 'desk-tl-1', type: FurnitureType.DESK, col: 4, row: 2 },
    { uid: 'desk-tl-2', type: FurnitureType.DESK, col: 8, row: 2 },
    { uid: 'desk-tr-1', type: FurnitureType.DESK, col: 16, row: 2 },
    { uid: 'desk-tr-2', type: FurnitureType.DESK, col: 20, row: 2 },
    { uid: 'desk-mid-1', type: FurnitureType.DESK, col: 9, row: 8 },
    { uid: 'desk-mid-2', type: FurnitureType.DESK, col: 14, row: 8 },
    { uid: 'desk-bl-1', type: FurnitureType.DESK, col: 5, row: 15 },
    { uid: 'desk-bl-2', type: FurnitureType.DESK, col: 9, row: 15 },
    { uid: 'desk-br-1', type: FurnitureType.DESK, col: 15, row: 15 },
    { uid: 'desk-br-2', type: FurnitureType.DESK, col: 19, row: 15 },

    { uid: 'chair-tl-1-top', type: FurnitureType.CHAIR, col: 4, row: 1 },
    { uid: 'chair-tl-1-bottom', type: FurnitureType.CHAIR, col: 5, row: 4 },
    { uid: 'chair-tl-2-top', type: FurnitureType.CHAIR, col: 8, row: 1 },
    { uid: 'chair-tl-2-bottom', type: FurnitureType.CHAIR, col: 9, row: 4 },

    { uid: 'chair-tr-1-top', type: FurnitureType.CHAIR, col: 16, row: 1 },
    { uid: 'chair-tr-1-bottom', type: FurnitureType.CHAIR, col: 17, row: 4 },
    { uid: 'chair-tr-2-top', type: FurnitureType.CHAIR, col: 20, row: 1 },
    { uid: 'chair-tr-2-bottom', type: FurnitureType.CHAIR, col: 21, row: 4 },

    { uid: 'chair-mid-1-top', type: FurnitureType.CHAIR, col: 9, row: 7 },
    { uid: 'chair-mid-1-bottom', type: FurnitureType.CHAIR, col: 10, row: 10 },
    { uid: 'chair-mid-2-top', type: FurnitureType.CHAIR, col: 14, row: 7 },
    { uid: 'chair-mid-2-bottom', type: FurnitureType.CHAIR, col: 15, row: 10 },

    { uid: 'chair-bl-1-top', type: FurnitureType.CHAIR, col: 5, row: 14 },
    { uid: 'chair-bl-1-bottom', type: FurnitureType.CHAIR, col: 6, row: 17 },
    { uid: 'chair-bl-2-top', type: FurnitureType.CHAIR, col: 9, row: 14 },
    { uid: 'chair-bl-2-bottom', type: FurnitureType.CHAIR, col: 10, row: 17 },

    { uid: 'chair-br-1-top', type: FurnitureType.CHAIR, col: 15, row: 14 },
    { uid: 'chair-br-1-bottom', type: FurnitureType.CHAIR, col: 16, row: 17 },
    { uid: 'chair-br-2-top', type: FurnitureType.CHAIR, col: 19, row: 14 },
    { uid: 'chair-br-2-bottom', type: FurnitureType.CHAIR, col: 20, row: 17 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout)
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json)
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout)
    }
  } catch { /* ignore parse errors */ }
  return null
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout)
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. If tileColors is already present, no migration needed.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  if (layout.tileColors && layout.tileColors.length === layout.tiles.length) {
    return layout // Already migrated
  }

  // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
  // but need color assignments
  const tileColors: Array<FloorColor | null> = []
  for (const tile of layout.tiles) {
    switch (tile) {
      case 0: // WALL
        tileColors.push(null)
        break
      case 1: // was TILE_FLOOR → FLOOR_1 beige
        tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
        break
      case 2: // was WOOD_FLOOR → FLOOR_2 brown
        tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
        break
      case 3: // was CARPET → FLOOR_3 purple
        tileColors.push(DEFAULT_CARPET_COLOR)
        break
      case 4: // was DOORWAY → FLOOR_4 tan
        tileColors.push(DEFAULT_DOORWAY_COLOR)
        break
      default:
        // New tile types (5-7) without colors — use neutral gray
        tileColors.push(tile > 0 ? { h: 0, s: 0, b: 0, c: 0 } : null)
    }
  }

  return { ...layout, tileColors }
}
