// The world: a sparse grid of chunks, each a dense 20x20 field of columns.
//
// Sparse at the chunk level (D-010) because an absent chunk *is* the unknown,
// and dense inside a chunk because creating one fills all 400 cells with water.

import type { TerrainId } from '../ids/index.js';
import type { Difficulty } from '../terrain/index.js';
import { WATER } from '../terrain/index.js';

/** Cells along one edge of a chunk: 30 x 1.5 km = a 45 km chunk (D-103). */
export const CHUNK_SIZE = 30;

/** Chunks along one edge of a new world. Per campaign; this is the default. */
export const DEFAULT_WORLD_BOUNDS = { x: 30, z: 30 } as const;

/**
 * Metres per world cell, horizontally: 1.5 km (D-098).
 *
 * Two independent reasons for this number. It is within 7% of the 5e DMG's
 * *province scale* of one mile per hex — the finest scale any published map
 * uses — and it is exactly 1000x the 1.5 m encounter cell, so the two scales
 * relate by a round factor.
 */
export const DEFAULT_METRES_PER_CELL = 1500;

/**
 * Metres per unit of column height: 150 m (D-103).
 *
 * Vertical scale is deliberately **not** the horizontal scale. A column's height
 * is counted in levels, and a level is 150 m of elevation — so the 30-level cap
 * is a 4.5 km mountain. Measuring height in 1.5 km units would make it 45 km.
 */
export const DEFAULT_METRES_PER_LEVEL = 150;

/** Highest a column may stand, in levels. 30 x 150 m = 4.5 km (R-80). */
export const MAX_HEIGHT = 30;

export interface Column {
  readonly height: number;
  readonly terrainId: TerrainId;
  /** Per-cell override; absent means "use the terrain's default" (R-77). */
  readonly difficulty?: Difficulty;
}

export interface ChunkCoord {
  readonly cx: number;
  readonly cz: number;
}

export interface Chunk {
  readonly coord: ChunkCoord;
  /** Row-major, length CHUNK_SIZE * CHUNK_SIZE. */
  readonly columns: readonly Column[];
}

export interface World {
  readonly bounds: { readonly x: number; readonly z: number };
  readonly metresPerCell: number;
  readonly metresPerLevel: number;
  /** Keyed by chunkKey(). Absent = never authored = Unknown (R-16). */
  readonly chunks: ReadonlyMap<string, Chunk>;
}

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`;
}

export function parseChunkKey(key: string): ChunkCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const cx = Number(parts[0]);
  const cz = Number(parts[1]);
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null;
  return { cx, cz };
}

export const SEA_LEVEL_WATER: Column = { height: 0, terrainId: WATER };

/** All eight neighbours: a chunk may be grown diagonally as well (R-79). */
export const CHUNK_NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

/** A brand new chunk: flat, at height 0, entirely water (R-78). */
export function createChunk(coord: ChunkCoord): Chunk {
  return { coord, columns: Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, () => SEA_LEVEL_WATER) };
}

export function emptyWorld(
  bounds: { x: number; z: number } = DEFAULT_WORLD_BOUNDS,
  metresPerCell = DEFAULT_METRES_PER_CELL,
  metresPerLevel = DEFAULT_METRES_PER_LEVEL,
): World {
  return { bounds, metresPerCell, metresPerLevel, chunks: new Map() };
}

/** The middle of the world, where a new campaign's first chunk goes. */
export function centreOfBounds(bounds: { x: number; z: number }): ChunkCoord {
  return { cx: Math.floor(bounds.x / 2), cz: Math.floor(bounds.z / 2) };
}

export function inBounds(world: World, coord: ChunkCoord): boolean {
  return coord.cx >= 0 && coord.cz >= 0 && coord.cx < world.bounds.x && coord.cz < world.bounds.z;
}

export function chunkAt(world: World, coord: ChunkCoord): Chunk | null {
  return world.chunks.get(chunkKey(coord)) ?? null;
}

/**
 * True when the GM has created this chunk.
 *
 * Deliberately **not** called `isKnown`: R-16 uses Known/Unknown for whether the
 * *party* knows a chunk, which is play state in a save. Whether a chunk exists at
 * all is authored content. Two different questions, and one word for both was a
 * bug waiting to happen (D-131).
 */
export function isAuthored(world: World, coord: ChunkCoord): boolean {
  return world.chunks.has(chunkKey(coord));
}

// -- columns -----------------------------------------------------------------

function columnIndex(x: number, z: number): number | null {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return null;
  if (x < 0 || z < 0 || x >= CHUNK_SIZE || z >= CHUNK_SIZE) return null;
  return z * CHUNK_SIZE + x;
}

/** Local column lookup. Returns null out of bounds rather than undefined (D-060). */
export function columnAt(chunk: Chunk, x: number, z: number): Column | null {
  const i = columnIndex(x, z);
  if (i === null) return null;
  return chunk.columns[i] ?? null;
}

function withColumn(chunk: Chunk, x: number, z: number, next: Column): Chunk {
  const i = columnIndex(x, z);
  if (i === null) return chunk;
  const columns = chunk.columns.slice();
  columns[i] = next;
  return { coord: chunk.coord, columns };
}

/** Paint tool (R-88): sets terrain, leaves height alone. */
export function paintTerrain(chunk: Chunk, x: number, z: number, terrainId: TerrainId): Chunk {
  const current = columnAt(chunk, x, z);
  if (!current) return chunk;
  if (current.terrainId === terrainId) return chunk;
  return withColumn(chunk, x, z, { ...current, terrainId });
}

export function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return 0;
  return Math.min(MAX_HEIGHT, Math.max(0, Math.round(height)));
}

/** Height tool (R-89): sets height, leaves terrain alone, snaps and clamps. */
export function setHeight(chunk: Chunk, x: number, z: number, height: number): Chunk {
  const current = columnAt(chunk, x, z);
  if (!current) return chunk;
  const next = clampHeight(height);
  if (current.height === next) return chunk;
  return withColumn(chunk, x, z, { ...current, height: next });
}

export function raiseHeight(chunk: Chunk, x: number, z: number, delta: number): Chunk {
  const current = columnAt(chunk, x, z);
  if (!current) return chunk;
  return setHeight(chunk, x, z, current.height + delta);
}

// -- global coordinates and brushes ------------------------------------------

/**
 * A cell addressed across the whole world rather than within one chunk.
 *
 * Brushes need this: a 3x3 brush near a chunk edge spills into the neighbour,
 * and chunk-relative coordinates cannot express that without special cases.
 */
export interface GlobalCell {
  readonly gx: number;
  readonly gz: number;
}

export function toGlobal(coord: ChunkCoord, x: number, z: number): GlobalCell {
  return { gx: coord.cx * CHUNK_SIZE + x, gz: coord.cz * CHUNK_SIZE + z };
}

export function fromGlobal(cell: GlobalCell): { coord: ChunkCoord; x: number; z: number } {
  return {
    coord: {
      cx: Math.floor(cell.gx / CHUNK_SIZE),
      cz: Math.floor(cell.gz / CHUNK_SIZE),
    },
    x: ((cell.gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    z: ((cell.gz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
  };
}

export const MAX_BRUSH = 3;

export function clampBrush(size: number): number {
  if (!Number.isFinite(size)) return 1;
  return Math.min(MAX_BRUSH, Math.max(1, Math.round(size)));
}

/** The first offset a brush of this size reaches, relative to its anchor. */
function brushStart(size: number): number {
  return -Math.floor((clampBrush(size) - 1) / 2);
}

/**
 * How far the centre of a brush's footprint sits from the centre of its anchor
 * cell, in cells. Zero for odd sizes; half a cell for even ones, which have no
 * centre cell to sit on.
 *
 * Exported so the hover outline can be drawn over exactly the cells `brushCells`
 * will edit, rather than each side deriving it and disagreeing.
 */
export function brushCentreOffset(size: number): number {
  const n = clampBrush(size);
  return brushStart(n) + (n - 1) / 2;
}

/**
 * The cells a brush of this size covers, anchored on `at`.
 *
 * Odd sizes centre on the anchor. Even sizes have no centre, so they extend
 * forward from it — the standard voxel-editor behaviour, and predictable in a
 * way that "round one way or the other" is not.
 */
export function brushCells(at: GlobalCell, size: number): readonly GlobalCell[] {
  const n = clampBrush(size);
  const start = brushStart(n);
  const cells: GlobalCell[] = [];
  for (let dz = start; dz < start + n; dz++) {
    for (let dx = start; dx < start + n; dx++) {
      cells.push({ gx: at.gx + dx, gz: at.gz + dz });
    }
  }
  return cells;
}

/**
 * Applies an edit to every cell a brush covers, across chunk boundaries.
 * Cells in chunks that do not exist are skipped rather than creating them —
 * the GM creates chunks deliberately, with the `+` affordance (R-79).
 */
function applyBrush(
  world: World,
  at: GlobalCell,
  size: number,
  edit: (chunk: Chunk, x: number, z: number) => Chunk,
): World {
  let next = world;
  for (const cell of brushCells(at, size)) {
    const { coord, x, z } = fromGlobal(cell);
    const chunk = chunkAt(next, coord);
    if (!chunk) continue;
    next = replaceChunk(next, edit(chunk, x, z));
  }
  return next;
}

export function paintArea(world: World, at: GlobalCell, size: number, terrainId: TerrainId): World {
  return applyBrush(world, at, size, (chunk, x, z) => paintTerrain(chunk, x, z, terrainId));
}

/** Absolute height across the brush, so a wide brush stamps a plateau. */
export function setHeightArea(world: World, at: GlobalCell, size: number, height: number): World {
  return applyBrush(world, at, size, (chunk, x, z) => setHeight(chunk, x, z, height));
}

export function raiseArea(world: World, at: GlobalCell, size: number, delta: number): World {
  return applyBrush(world, at, size, (chunk, x, z) => raiseHeight(chunk, x, z, delta));
}

// -- world-level edits -------------------------------------------------------

export function addChunk(world: World, coord: ChunkCoord): World {
  if (!inBounds(world, coord) || isAuthored(world, coord)) return world;
  const chunks = new Map(world.chunks);
  chunks.set(chunkKey(coord), createChunk(coord));
  return { ...world, chunks };
}

/**
 * Identity-preserving: handed back the chunk that is already there, it returns
 * the same World. That lets a no-op edit stay a no-op all the way up — the tools
 * already return the same Chunk when nothing changed, and callers compare by
 * identity to decide whether anything needs saving or broadcasting.
 */
export function replaceChunk(world: World, chunk: Chunk): World {
  const key = chunkKey(chunk.coord);
  const existing = world.chunks.get(key);
  if (!existing) return world;
  if (existing === chunk) return world;
  const chunks = new Map(world.chunks);
  chunks.set(key, chunk);
  return { ...world, chunks };
}

/**
 * May the GM create a chunk here? In bounds, not yet authored, and touching
 * something that exists — including diagonally (R-79). An empty world admits
 * only its origin, so a campaign has somewhere to start.
 *
 * This is the single definition. `sim` enforces it and the GM console draws from
 * it; neither reimplements it.
 */
export function isCreatableSlot(world: World, coord: ChunkCoord): boolean {
  if (!inBounds(world, coord) || isAuthored(world, coord)) return false;
  if (world.chunks.size === 0) return coord.cx === 0 && coord.cz === 0;
  return CHUNK_NEIGHBOURS.some(([dx, dz]) => isAuthored(world, { cx: coord.cx + dx, cz: coord.cz + dz }));
}

/** Every slot the GM may create a chunk in. */
export function creatableSlots(world: World): readonly ChunkCoord[] {
  if (world.chunks.size === 0) {
    return isCreatableSlot(world, { cx: 0, cz: 0 }) ? [{ cx: 0, cz: 0 }] : [];
  }
  const seen = new Set<string>();
  const out: ChunkCoord[] = [];
  for (const key of world.chunks.keys()) {
    const at = parseChunkKey(key);
    if (!at) continue;
    for (const [dx, dz] of CHUNK_NEIGHBOURS) {
      const coord = { cx: at.cx + dx, cz: at.cz + dz };
      const k = chunkKey(coord);
      if (seen.has(k) || !isCreatableSlot(world, coord)) continue;
      seen.add(k);
      out.push(coord);
    }
  }
  return out;
}
