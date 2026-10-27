// The world: a sparse grid of chunks, each a dense 20x20 field of columns.
//
// Sparse at the chunk level (D-010) because an absent chunk *is* the unknown,
// and dense inside a chunk because creating one fills all 400 cells with water.

import type { CoverId, SwatchId } from '../ids/index.js';
import type { Difficulty } from '../materials/index.js';
import { DEFAULT_MATERIALS, swatchOf } from '../materials/index.js';
import { BRUSH_SPANS, footprintOf } from '../footprint/index.js';

/** Cells along one edge of a chunk: 30 x 600 m = an 18 km chunk (D-103, D-373). */
export const CHUNK_SIZE = 30;

/** Chunks along one edge of a new world. Per campaign; this is the default. */
export const DEFAULT_WORLD_BOUNDS = { x: 30, z: 30 } as const;

/**
 * Metres per world cell, horizontally: 600 m (D-373).
 *
 * A name for a size, not a shape: it says how long a journey takes and never
 * which way it goes, because the slopes come from `LEVEL_HEIGHT` alone. 600
 * because a quarter of it is 150 m, the level every campaign was painted in
 * before x, y and z shared a scale — so no height already painted changes its
 * metres, and the 30-level cap is still a 4.5 km mountain.
 */
export const DEFAULT_METRES_PER_CELL = 600;

/**
 * How tall a level stands, in cell widths: a quarter (D-373).
 *
 * One scale for x, y and z. The world is drawn at it and the route climbs at
 * it, so the slope a GM sees is the slope the party pays for (R-52a): a
 * neighbour one level up is 25%, two is 50%, three is 75% — a hike, a hard
 * climb, and scree.
 */
export const LEVEL_HEIGHT = 0.25;

/** Highest a column may stand, in levels: 7.5 cells, 4.5 km at 600 m (R-80). */
export const MAX_HEIGHT = 30;

export interface Column {
  readonly height: number;
  /**
   * What the cell is made of: a swatch from the materials registry, the same
   * one a map's cubes hold (R-176, D-280).
   *
   * Not a terrain id. A terrain was a colour and a difficulty for twelve
   * names the material registry already describes, and keeping it meant every
   * appearance feature since D-237 landed on maps and not on the world.
   */
  readonly ground: SwatchId;
  /**
   * What stands on it (R-193): trees, boulders, nothing.
   *
   * **Absent on most cells, and absent means bare.** A forest is grass with
   * this set to trees; there is no "forest" anywhere (D-280). One per cell to
   * begin with — a density, light scrub through to dense jungle, is a later
   * question and a second field when it comes.
   */
  readonly cover?: CoverId;
  /** Per-cell override; absent means "use the ground's own" (R-77, R-192). */
  readonly difficulty?: Difficulty;
}

export interface ChunkCoord {
  readonly cx: number;
  readonly cz: number;
}

/**
 * One cell, addressed as the chunk it belongs to plus its offset inside it.
 *
 * This lives here rather than in `place/` (D-156): it is a world coordinate, and
 * `party/` has to name one too. A party module importing from `place/` to say
 * where somebody is standing would be nonsense.
 */
export interface WorldCell {
  readonly cx: number;
  readonly cz: number;
  readonly x: number;
  readonly z: number;
}

export function sameWorldCell(a: WorldCell, b: WorldCell): boolean {
  return a.cx === b.cx && a.cz === b.cz && a.x === b.x && a.z === b.z;
}

export function chunkOf(cell: WorldCell): ChunkCoord {
  return { cx: cell.cx, cz: cell.cz };
}

/**
 * Total on purpose. Zod validates at the edge (R-17) so a real intent always
 * carries a cell, but a predicate whose job is to answer "is this a cell" must
 * not throw when the answer is no.
 */
export function isValidWorldCell(cell: WorldCell | null | undefined): boolean {
  if (!cell) return false;
  return Number.isInteger(cell.cx) && Number.isInteger(cell.cz)
    && Number.isInteger(cell.x) && Number.isInteger(cell.z)
    && cell.x >= 0 && cell.x < CHUNK_SIZE && cell.z >= 0 && cell.z < CHUNK_SIZE;
}

export interface Chunk {
  readonly coord: ChunkCoord;
  /** Row-major, length CHUNK_SIZE * CHUNK_SIZE. */
  readonly columns: readonly Column[];
}

export interface World {
  readonly bounds: { readonly x: number; readonly z: number };
  readonly metresPerCell: number;
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

/** What a freshly created chunk is filled with (R-78): open water at sea level. */
export const OPEN_WATER: SwatchId = swatchOf(
  DEFAULT_MATERIALS.find((m) => m.name === 'Liquids')!.id,
);

export const SEA_LEVEL_WATER: Column = { height: 0, ground: OPEN_WATER };

/**
 * The twelve terrain ids a world written before D-280 holds, as swatches.
 *
 * Read-only and read-once: a world is decoded through this and written back as
 * swatches from then on (R-137a, R-144). It is a table rather than a rule
 * because there is nothing general to say — somebody chose twelve names once
 * and this is where they land.
 *
 * **Forest and jungle arrive as undergrowth, not as trees.** A cover is a
 * second axis that does not exist yet (D-280), so the closest honest ground is
 * Vegetation, which also happens to carry forest's old difficulty exactly. The
 * GM repaints them with the Forest preset when covers land.
 *
 * **Hills arrive as grass and lose their 1.5.** A hill is *height*, and the
 * slope factor already charges for climbing it (R-52a); the old palette kept a
 * flat 1.5 on top because a terrain had nowhere else to say "hilly". Two axes
 * mean it does.
 */
export const GROUND_FROM_TERRAIN: Readonly<Record<string, SwatchId>> = {
  'terrain:water': 'material:liquid' as SwatchId,
  'terrain:shallows': 'material:liquid/shore' as SwatchId,
  'terrain:sand': 'material:soil/sand' as SwatchId,
  'terrain:grass': 'material:grass' as SwatchId,
  'terrain:forest': 'material:vegetation' as SwatchId,
  'terrain:hills': 'material:grass/dark' as SwatchId,
  'terrain:rock': 'material:mineral' as SwatchId,
  'terrain:snow': 'material:soil/snow' as SwatchId,
  'terrain:swamp': 'material:vegetation/dark' as SwatchId,
  'terrain:road': 'material:brick/dressed' as SwatchId,
  'terrain:moor': 'material:grass/dried' as SwatchId,
  'terrain:jungle': 'material:vegetation/dark' as SwatchId,
};

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
): World {
  return { bounds, metresPerCell, chunks: new Map() };
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

/**
 * Cover tool (R-193): sets what stands on a cell, or clears it.
 *
 * `null` is the eraser and the reason this takes one rather than having a
 * `clearCover` beside it: "nothing" is a value the GM picks from the same
 * list, not a separate gesture.
 */
export function paintCover(chunk: Chunk, x: number, z: number, cover: CoverId | null): Chunk {
  const current = columnAt(chunk, x, z);
  if (!current) return chunk;
  if ((current.cover ?? null) === cover) return chunk;
  if (!cover) {
    // Deleted rather than set to null, so a bare cell is one shape however it
    // got that way — and so the wire can tell "no cover" from "cover: null".
    const { cover: _gone, ...bare } = current;
    return withColumn(chunk, x, z, bare);
  }
  return withColumn(chunk, x, z, { ...current, cover });
}

/** Paint tool (R-88): sets the ground, leaves height alone. */
export function paintGround(chunk: Chunk, x: number, z: number, ground: SwatchId): Chunk {
  const current = columnAt(chunk, x, z);
  if (!current) return chunk;
  if (current.ground === ground) return chunk;
  return withColumn(chunk, x, z, { ...current, ground });
}

export function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return 0;
  return Math.min(MAX_HEIGHT, Math.max(0, Math.round(height)));
}

/** Height tool (R-89): sets height, leaves the ground alone, snaps and clamps. */
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

/**
 * The world's brushes, and **every one of them is odd** (R-88a, D-291).
 *
 * The same the map offers as flats (R-164), and round as they are (D-364),
 * for the same reason: an odd
 * span has a centre cell, so the footprint sits on the cell you are pointing
 * at and the outline is where the edit lands. 2×2 had no centre, so it had to
 * lean one way — forward, which is the voxel-editor convention and still
 * reads as the brush being off by half a cell from the pointer. Two sizes a
 * step apart also said less than three a stride apart: 1, 3 and 5 is a cell,
 * a patch and a stroke.
 */
export const WORLD_BRUSHES = BRUSH_SPANS;

export const MAX_BRUSH: number = WORLD_BRUSHES[WORLD_BRUSHES.length - 1]!;

/** The listed size nearest the one asked for; the narrowest for nonsense. */
export function clampBrush(size: number): number {
  if (!Number.isFinite(size)) return WORLD_BRUSHES[0];
  return WORLD_BRUSHES.reduce((best, n) => (
    Math.abs(n - size) < Math.abs(best - size) ? n : best
  ), WORLD_BRUSHES[0] as number);
}

/** One size wider or narrower, stopping at the ends. `[` and `]` (R-88a). */
export function stepBrush(size: number, by: number): number {
  const at = (WORLD_BRUSHES as readonly number[]).indexOf(clampBrush(size));
  return WORLD_BRUSHES[Math.min(WORLD_BRUSHES.length - 1, Math.max(0, at + by))]!;
}

/** The first offset a brush of this size reaches, relative to its anchor. */
function brushStart(size: number): number {
  return -Math.floor((clampBrush(size) - 1) / 2);
}

/**
 * How far the centre of a brush's footprint sits from the centre of its anchor
 * cell, in cells.
 *
 * **Always zero now**, because every brush is odd (D-291). It stays exported
 * and stays called: the hover outline reads it rather than assuming, so the
 * day an even brush comes back the outline follows it instead of drifting
 * half a cell off the cells `brushCells` edits.
 */
export function brushCentreOffset(size: number): number {
  const n = clampBrush(size);
  return brushStart(n) + (n - 1) / 2;
}

/**
 * The cells a brush of this size covers, anchored on `at`: round, as near as
 * cells get — a cross at 3, and rounder as it grows (D-364) — and centred,
 * because every listed size is odd (D-291).
 */
export function brushCells(at: GlobalCell, size: number): readonly GlobalCell[] {
  return footprintOf(clampBrush(size)).map(([dx, dz]) => ({ gx: at.gx + dx, gz: at.gz + dz }));
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

export function paintArea(world: World, at: GlobalCell, size: number, ground: SwatchId): World {
  return applyBrush(world, at, size, (chunk, x, z) => paintGround(chunk, x, z, ground));
}

export function coverArea(
  world: World, at: GlobalCell, size: number, cover: CoverId | null,
): World {
  return applyBrush(world, at, size, (chunk, x, z) => paintCover(chunk, x, z, cover));
}

/** Absolute height across the brush, so a wide brush stamps a plateau. */
export function setHeightArea(world: World, at: GlobalCell, size: number, height: number): World {
  return applyBrush(world, at, size, (chunk, x, z) => setHeight(chunk, x, z, height));
}

/**
 * Every column under the brush raised or lowered by `delta` from the height it
 * had in `from` (D-367) — the ground as a drag found it — so the shape under
 * the brush moves as one, its offsets kept. Each column stops at the limits on
 * its own: one that reaches the top stays there while the rest keep climbing
 * toward it. Measured from `from` rather than from now, so a drag that goes
 * too far and comes back gives back the shape it started with.
 */
export function liftArea(world: World, from: World, at: GlobalCell, size: number, delta: number): World {
  return applyBrush(world, at, size, (chunk, x, z) => {
    const was = columnAt(chunkAt(from, chunk.coord) ?? chunk, x, z);
    return was ? setHeight(chunk, x, z, was.height + delta) : chunk;
  });
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
