// An encounter map: one voxel body belonging to one point of interest (R-145).
//
// Minecraft-shaped, not columnar. The world map stores a *height* per cell
// because geography is a surface; a map stores *blocks* because a tavern has a
// floor above your head and air under its stairs. Nothing here knows about
// vision, fog or tokens — those sit out this round entirely (D-183).
//
// Blocks are held sparsely, keyed by string. A `Map<BlockCoord, …>` would dedupe
// by reference and silently hold duplicates of the same cell, which is the trap
// R-123 already names for chunk coordinates.

import type { PropId, SwatchId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import { DEFAULT_FLOOR } from '../materials/index.js';
import type { CuttingPlane, LevelRange, PlaneJSON } from '../planes/index.js';
import { fullRange, inRange, planesToJSON, planesFromJSON, WATER_LEVEL } from '../planes/index.js';
import { footprintOf } from '../footprint/index.js';

/** Cells along one side of a freshly created map, and the step `+` grows by. */
export const MAP_PATCH = 16;

/**
 * Highest a map may build, in blocks.
 *
 * Bounded because the camera has to know how much to draw, and because the
 * cutting range (R-146) needs a ceiling to be a range *of* something. 32 at the
 * 1.5 m encounter cell is 48 m — a cathedral, a four-storey building with room
 * over the roof, or a dungeon four levels deep.
 */
export const MAP_MAX_HEIGHT = 32;

/**
 * How far below the starting floor a map may be dug (R-160).
 *
 * A separate bound rather than a share of the height, so digging a cellar does
 * not quietly cost the GM a level of sky. 16 at the 1.5 m encounter cell is 24 m
 * down — a four-level dungeon under a building that still has its full height
 * above ground.
 *
 * Negative Y is how a cellar is reached at all. The alternative was shifting the
 * whole body upward to make room, and that renumbers every block, every cutting
 * plane and the saved band together — the renumber R-150 already refuses
 * sideways, with three things to keep in step instead of one (D-203).
 */
export const MAP_MIN_DEPTH = -16;

/**
 * The band that selects the whole of a map, floor to sky (R-161).
 *
 * One value, because two callers that each spell the default out will
 * eventually spell it differently — and did. A map the GM has not cut carries
 * no band at all (`withRange` deletes the entry, so the record does not fill
 * with defaults), which makes "no entry" a value every reader has to supply
 * for itself. The host supplied floor-to-sky; the console still supplied
 * *zero* to sky, left over from before a map could be dug (R-160). So dragging
 * the bottom handle down to Bedrock worked perfectly, stored nothing, and came
 * back drawn at the water line (D-208).
 */
export const WHOLE_MAP: LevelRange = fullRange(MAP_MAX_HEIGHT, MAP_MIN_DEPTH);

export interface BlockCoord {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A prop standing in a map (D-322): which catalogue entry, the cube it was set
 * down at, how it is turned and what it is finished in. The record only — what
 * a prop is and what it does are `props`'s, which knows the catalogue.
 *
 * On the map rather than beside it because it is part of the building: a
 * tavern has its door whether or not anybody is playing in it. Whether the
 * door is open is the session's (D-321).
 */
export interface Prop {
  readonly id: PropId;
  readonly type: string;
  readonly at: BlockCoord;
  /** Quarter turns clockwise from above (R-203). */
  readonly facing: 0 | 1 | 2 | 3;
  /**
   * What its parts that take paint are painted with (D-352): any block
   * material. Absent, or one the registry has never heard of, is its type's
   * first (`paintOf`).
   */
  readonly paint?: SwatchId;
  /** A light's flame, by id (D-335): the colour of what it gives. Only a light has one. */
  readonly flame?: string;
  /**
   * The GM's note on it (D-357): what is in the chest, what the bookcase
   * hides. The GM's alone — never in what the table is sent.
   */
  readonly note?: string;
  /**
   * How far a light reaches, when the GM has set it (D-335): absent means
   * its type's own. Only a light has one; on anything else it means nothing.
   */
  readonly reach?: number;
}

/** How far a light may reach, placed or carried (D-335): whole cubes. */
export const MIN_LIGHT_REACH = 1;
export const MAX_LIGHT_REACH = 20;

/** A reach as kept: whole, and inside the bounds. */
export function cleanReach(reach: number): number {
  return Math.min(MAX_LIGHT_REACH, Math.max(MIN_LIGHT_REACH, Math.round(reach)));
}

export interface EncounterMap {
  /**
   * The lowest cell the map owns in X and Z (R-150).
   *
   * `{0, 0}` for a new map, and it goes **negative** when the GM expands
   * north-east or north-west. This exists so that growing in those directions
   * does not have to renumber every block that is already placed — a renumber is
   * how saved references rot, and it would silently move a wall relative to
   * anything that remembered where it was.
   */
  readonly origin: { readonly x: number; readonly z: number };
  /** Cells in X and Z. Grows with the expand rose (R-150); never shrinks. */
  readonly size: { readonly x: number; readonly z: number };
  /** Filled cells only, keyed by `blockKey`. Absent means air. */
  readonly blocks: ReadonlyMap<string, SwatchId>;
  /**
   * The GM's named horizontal cuts (R-146). Authored, ordered by height.
   *
   * On the map rather than in the save because they are part of the building:
   * a tavern has a cellar floor whether or not anyone is playing in it. Where
   * the party's attention sits *between* them is play state.
   */
  readonly planes: readonly CuttingPlane[];
  /** Doors, bars, furniture (D-322), in the order they were placed. */
  readonly props: readonly Prop[];
}

/**
 * Where the GM can extend a map — the **intercardinals**, and that is not a
 * quirk of naming (D-198).
 *
 * North is the `(-1, -1)` diagonal of the cell grid, chosen so that it points
 * straight up in the view a campaign opens on. The camera is deliberately
 * diagonal to the grid (R-31) so the ground reads as a diamond, which means the
 * grid's *axes* are what run diagonally on screen. Naming them north-east and
 * so on is the arrangement that puts every label where the growth appears.
 */
export type Expand = 'northeast' | 'southeast' | 'southwest' | 'northwest';

/**
 * Which way each direction lies in cell space.
 *
 * Read it off the screen at the default view: `-Z` climbs to the upper right,
 * `+X` falls to the lower right, and the other two mirror them.
 */
const STEPS: Record<Expand, { readonly x: number; readonly z: number }> = {
  northeast: { x: 0, z: -1 },
  southeast: { x: 1, z: 0 },
  southwest: { x: 0, z: 1 },
  northwest: { x: -1, z: 0 },
};

export function blockKey(at: BlockCoord): string {
  return `${at.x},${at.y},${at.z}`;
}

export function parseBlockKey(key: string): BlockCoord | null {
  const parts = key.split(',');
  if (parts.length !== 3) return null;
  const [x, y, z] = parts.map(Number);
  if (x === undefined || y === undefined || z === undefined) return null;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
  return { x, y, z };
}

export function inMap(map: EncounterMap, at: BlockCoord): boolean {
  return Number.isInteger(at.x) && Number.isInteger(at.y) && Number.isInteger(at.z)
    && at.x >= map.origin.x && at.x < map.origin.x + map.size.x
    && at.z >= map.origin.z && at.z < map.origin.z + map.size.z
    && at.y >= MAP_MIN_DEPTH && at.y < MAP_MAX_HEIGHT;
}

export function blockAt(map: EncounterMap, at: BlockCoord): SwatchId | null {
  return map.blocks.get(blockKey(at)) ?? null;
}

// -- the brush (R-162, R-164) -----------------------------------------------

/**
 * A brush is a **named shape**, not a number (D-215).
 *
 * It was a radius while every brush was a flat square, which was exactly as
 * long as that lasted: the GM went to build walls and cellars and found that a
 * flat square is the wrong tool for both. A column is not a radius, so the
 * brush became a small registry — the same shape as materials and markers, and
 * the same reason: another entry is a line, not a change.
 *
 * `span` is odd so the cube under the pointer is always covered — arithmetic
 * rather than a convention anyone has to keep. `rise` grows **away from the
 * surface**: upward normally, downward while digging, so one column builds a
 * wall and the same column sinks a shaft.
 */
export interface Brush {
  readonly id: string;
  readonly name: string;
  /** Cells across, odd, centred on the anchor. */
  readonly span: number;
  /** Cells tall, growing from the anchor. */
  readonly rise: number;
}

export const BRUSHES: readonly Brush[] = [
  { id: 'cube', name: 'Cube', span: 1, rise: 1 },
  // Round, as the world's are (D-364): a cross at 3, rounder as they grow.
  { id: 'flat3', name: 'Flat 3×3', span: 3, rise: 1 },
  { id: 'flat5', name: 'Flat 5×5', span: 5, rise: 1 },
  { id: 'flat7', name: 'Flat 7×7', span: 7, rise: 1 },
  { id: 'flat9', name: 'Flat 9×9', span: 9, rise: 1 },
  { id: 'flat11', name: 'Flat 11×11', span: 11, rise: 1 },
  { id: 'column2', name: 'Column 2', span: 1, rise: 2 },
  { id: 'column3', name: 'Column 3', span: 1, rise: 3 },
];

export const DEFAULT_BRUSH = BRUSHES[0]!;

/** How many cells the largest brush reaches: the cap on a single edit. */
export const MAP_BRUSH_CELLS = BRUSHES
  .reduce((most, brush) => Math.max(most, footprintOf(brush.span).length * brush.rise), 1);

/**
 * The brush with this id, or the single cube.
 *
 * Falls back rather than failing: an id is view state that outlives a reload
 * and a rename, and the narrowest brush is the safe answer to "I no longer
 * know which one you meant".
 */
export function brushById(id: string): Brush {
  return BRUSHES.find((brush) => brush.id === id) ?? DEFAULT_BRUSH;
}

/**
 * The cells a brush covers, anchored on `at`.
 *
 * Flat brushes lie **flat** whichever face was pointed at (D-213) — following
 * the face read as weird, because the outline changed orientation as the
 * pointer crossed an edge and one gesture meant two shapes. Columns are
 * vertical for the same reason in reverse: a shape you choose by name is a
 * shape you can predict.
 *
 * Not clipped: what the map will accept is `setBlocks`' business and what the
 * GM is being shown is the console's. This answers only "where does the brush
 * reach", so the outline and the edit are drawn from the same list.
 */
export function brushPatch(
  at: BlockCoord,
  brush: Brush,
  grow: 'up' | 'down' = 'up',
): readonly BlockCoord[] {
  const step = grow === 'up' ? 1 : -1;
  const cells: BlockCoord[] = [];
  for (let level = 0; level < brush.rise; level += 1) {
    // Round from above (D-364), as the world's brushes are.
    for (const [dx, dz] of footprintOf(brush.span)) {
      cells.push({ x: at.x + dx, y: at.y + level * step, z: at.z + dz });
    }
  }
  return cells;
}

/**
 * Builds in every cell of a patch that is **empty and inside the map**.
 *
 * Not `cells.reduce(setBlock)`: `setBlock` replaces whatever is there, which is
 * what paint wants and what build must never do (R-159). The skipping is the
 * rule, and it lives here rather than as a guard in the host so that a brush
 * lands where it can and leaves the rest alone — refusing all twenty-five cells
 * because one of them is occupied would make a brush useless anywhere near
 * something already built.
 *
 * Identity-preserving (R-165), which is also how a caller learns that nothing
 * happened at all.
 */
export function setBlocks(
  map: EncounterMap,
  cells: readonly BlockCoord[],
  swatch: SwatchId,
): EncounterMap {
  const blocks = new Map(map.blocks);
  let touched = false;
  for (const at of cells) {
    if (!inMap(map, at)) continue;
    const key = blockKey(at);
    if (blocks.has(key)) continue;
    blocks.set(key, swatch);
    touched = true;
  }
  return touched ? { ...map, blocks } : map;
}

/** Erases every cell of a patch that holds a block. Identity-preserving (R-165). */
export function clearBlocks(
  map: EncounterMap,
  cells: readonly BlockCoord[],
): EncounterMap {
  const blocks = new Map(map.blocks);
  let touched = false;
  for (const at of cells) {
    const key = blockKey(at);
    if (!blocks.has(key)) continue;
    blocks.delete(key);
    touched = true;
  }
  return touched ? { ...map, blocks } : map;
}

/**
 * Repaints every cell of a patch that **already holds** a block (R-159).
 *
 * The mirror of `setBlocks`: paint will not conjure a block, build will not
 * overwrite one. A brush dragged across a rooftop therefore colours the roof
 * and not the sky behind it.
 */
export function paintBlocks(
  map: EncounterMap,
  cells: readonly BlockCoord[],
  swatch: SwatchId,
): EncounterMap {
  const blocks = new Map(map.blocks);
  let touched = false;
  for (const at of cells) {
    if (!inMap(map, at)) continue;
    const key = blockKey(at);
    const standing = blocks.get(key);
    if (standing === undefined || standing === swatch) continue;
    blocks.set(key, swatch);
    touched = true;
  }
  return touched ? { ...map, blocks } : map;
}

/**
 * A new map: a flat floor at Y0 across the whole patch (R-149).
 *
 * An empty grid would give the GM nothing to click, and face-adjacency placement
 * (R-147) needs a face to begin from — the same reason a new chunk is created
 * flat and entirely water rather than as nothing (R-78).
 */
export function createMap(swatch: SwatchId = DEFAULT_FLOOR): EncounterMap {
  const blocks = new Map<string, SwatchId>();
  for (let x = 0; x < MAP_PATCH; x += 1) {
    for (let z = 0; z < MAP_PATCH; z += 1) {
      blocks.set(blockKey({ x, y: 0, z }), swatch);
    }
  }
  return {
    origin: { x: 0, z: 0 },
    size: { x: MAP_PATCH, z: MAP_PATCH },
    blocks,
    // A new map starts with its ground named (R-161). A *plane*, not a fixed
    // step: the GM may rename it, move it or delete it, and a dungeon that
    // never sees daylight has no use for it.
    planes: [{ id: freshId<'PlaneId'>('plane'), name: WATER_LEVEL, y: 0 }],
    props: [],
  };
}

/** Identity-preserving: placing what is already there returns the same map (R-165). */
export function setBlock(
  map: EncounterMap,
  at: BlockCoord,
  swatch: SwatchId,
): EncounterMap {
  if (!inMap(map, at)) return map;
  const key = blockKey(at);
  if (map.blocks.get(key) === swatch) return map;
  const blocks = new Map(map.blocks);
  blocks.set(key, swatch);
  return { ...map, blocks };
}

export function clearBlock(map: EncounterMap, at: BlockCoord): EncounterMap {
  const key = blockKey(at);
  if (!map.blocks.has(key)) return map;
  const blocks = new Map(map.blocks);
  blocks.delete(key);
  return { ...map, blocks };
}

/**
 * Extends the map by one patch in a compass direction (R-150).
 *
 * The two directions that run toward lower coordinates move the **origin**
 * instead of renumbering the body. Every block keeps the coordinate it already
 * had, whichever way the map grows — the alternative is shifting thousands of
 * keys and hoping nothing remembered one.
 */
export function growMap(map: EncounterMap, towards: Expand): EncounterMap {
  const step = STEPS[towards];
  // A negative step pushes the origin out; a positive one only adds width.
  const origin = {
    x: map.origin.x + (step.x < 0 ? -MAP_PATCH : 0),
    z: map.origin.z + (step.z < 0 ? -MAP_PATCH : 0),
  };
  const size = {
    x: map.size.x + (step.x !== 0 ? MAP_PATCH : 0),
    z: map.size.z + (step.z !== 0 ? MAP_PATCH : 0),
  };

  // The new ground is floored, for the same reason the first patch is (R-149).
  const blocks = new Map(map.blocks);
  const floor = map.blocks.get(blockKey({ x: map.origin.x, y: 0, z: map.origin.z }))
    ?? DEFAULT_FLOOR;
  const was = (x: number, z: number) =>
    x >= map.origin.x && x < map.origin.x + map.size.x
    && z >= map.origin.z && z < map.origin.z + map.size.z;
  for (let x = origin.x; x < origin.x + size.x; x += 1) {
    for (let z = origin.z; z < origin.z + size.z; z += 1) {
      if (was(x, z)) continue;
      blocks.set(blockKey({ x, y: 0, z }), floor);
    }
  }
  // Spread, so the planes the GM named come along. A cut at "cellar ceiling" is
  // still at that height after the footprint grows sideways.
  return { ...map, origin, size, blocks };
}

/** The middle of the footprint, for framing a camera on it (R-152). */
export function mapCentre(map: EncounterMap): { readonly x: number; readonly z: number } {
  return { x: map.origin.x + map.size.x / 2, z: map.origin.z + map.size.z / 2 };
}

/**
 * The six cells sharing a face with this one.
 *
 * Faces, not edges or corners — the same adjacency a block is *placed* by
 * (R-147), and the 3D reading of a 2D paint bucket's four neighbours. Two cubes
 * touching only along an edge are a diagonal seam, which R-44 treats as sealed;
 * a fill that leaked through one would cross a wall the GM built as solid.
 */
const FACE_NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/**
 * Every block reachable from `at` through blocks of the same material (R-154).
 *
 * The region a bucket fill would repaint. Returned rather than applied so the
 * console can say how many blocks are about to change *before* the GM commits
 * to it — a fill is one click that can rewrite a wing of a building.
 *
 * Empty when the cell is air or outside the map: there is no material to match,
 * and a fill that started from nothing would have to guess what the GM meant.
 *
 * Breadth-first with an explicit queue, not recursion. A region can be the
 * whole body — tens of thousands of cells at the largest footprint — and the
 * recursive version of this function is a stack overflow waiting for a big
 * enough tavern.
 */
export function fillRegion(map: EncounterMap, at: BlockCoord): readonly BlockCoord[] {
  const seed = blockAt(map, at);
  if (!seed) return [];

  const region: BlockCoord[] = [];
  const seen = new Set<string>([blockKey(at)]);
  const queue: BlockCoord[] = [at];

  while (queue.length > 0) {
    const cell = queue.pop()!;
    region.push(cell);
    for (const [dx, dy, dz] of FACE_NEIGHBOURS) {
      const next = { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz };
      const key = blockKey(next);
      if (seen.has(key)) continue;
      // `inMap` is checked before the material so a fill cannot walk out of the
      // footprint into coordinates the map does not own.
      if (!inMap(map, next) || map.blocks.get(key) !== seed) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return region;
}

/**
 * Repaints the connected region at `at` (R-154). Identity-preserving (R-165).
 *
 * Only the *material* changes: a fill never adds or removes a block, so the
 * shape of the building is the same after it as before. That is what makes it
 * safe to hand a one-click tool this much reach.
 */
export function fillMaterial(
  map: EncounterMap,
  at: BlockCoord,
  swatch: SwatchId,
): EncounterMap {
  if (blockAt(map, at) === swatch) return map;
  const region = fillRegion(map, at);
  if (region.length === 0) return map;
  const blocks = new Map(map.blocks);
  for (const cell of region) blocks.set(blockKey(cell), swatch);
  return { ...map, blocks };
}

/**
 * The map as the table may see it: only the blocks inside the range (R-146).
 *
 * A *filter*, not a flag. R-85's standard is that a secret is never sent, so a
 * cellar the GM has cut away is absent from the payload rather than present and
 * undrawn — the table cannot leak what it was never given.
 *
 * The footprint and the planes travel whole. The footprint because the table
 * still has to know how big the floor is, and the planes because their names
 * are not secrets — the party can be told there is a level called "cellar"
 * without being shown what is in it.
 */
export function sliceOf(map: EncounterMap, range: LevelRange): EncounterMap {
  const blocks = new Map<string, SwatchId>();
  for (const [key, swatch] of map.blocks) {
    const at = parseBlockKey(key);
    if (at && inRange(range, at.y)) blocks.set(key, swatch);
  }
  // A prop goes with the level it stands on (D-322): a door on the ground
  // floor is in the ground floor's slice, however tall it is.
  const props = map.props.filter((prop) => inRange(range, prop.at.y));
  return { ...map, blocks, props: props.length === map.props.length ? map.props : props };
}

/**
 * The lowest filled Y, never above zero (R-160).
 *
 * Derived rather than stored: the map's floor *is* wherever the GM has dug to,
 * and a stored depth would be a second answer to the same question. Clamped at
 * zero so a map nobody has dug reports its starting floor, which keeps the band
 * selector's bottom step reading "Floor" instead of a level that does not exist.
 */
export function bottomOfMap(map: EncounterMap): number {
  let bottom = 0;
  for (const key of map.blocks.keys()) {
    const at = parseBlockKey(key);
    if (at && at.y < bottom) bottom = at.y;
  }
  return bottom;
}

/** The highest filled Y, or -1 for a map with nothing in it. */
export function topOfMap(map: EncounterMap): number {
  let top = -1;
  for (const key of map.blocks.keys()) {
    const at = parseBlockKey(key);
    if (at && at.y > top) top = at.y;
  }
  return top;
}

/** What is always written (R-137: stamp the current shape on the way out). */
export interface MapJSON {
  origin: { x: number; z: number };
  size: { x: number; z: number };
  /**
   * The materials this body uses, indexed **from 1**. Index 0 is air and is
   * never in the list, so an empty cell costs nothing to name.
   */
  palette: string[];
  /**
   * The body, run-length encoded: `[count, index, count, index, …]` over every
   * cell of the box, ordered **y, then z, then x** (R-59, D-217).
   *
   * One JSON entry per cube was 27 bytes a cube — a 9,714-block church came to
   * 258 KiB, written whole to disk and pushed whole to both screens on every
   * single cube placed. The same body is about 8 KiB this way, because a map is
   * mostly air and air costs one number however much of it there is.
   */
  runs: number[];
  planes: PlaneJSON[];
  /** The map's props (D-322). Written only when there are any. */
  props?: PropJSON[];
}

/** A prop as written. */
export interface PropJSON {
  id: string;
  type: string;
  at: { x: number; y: number; z: number };
  facing: number;
  /** What it is painted with (D-352). Before props were painted it was a `finish`; see `lookOfJSON`. */
  paint?: string;
  /** A light's flame (D-335). */
  flame?: string;
  /** The GM's note (D-357). Written only when there is one. */
  note?: string;
  /** A light's own reach (D-335). Written only when the GM set one. */
  reach?: number;
}

/** How long a note on a prop may be (D-357): as long as one on somebody (`MAX_MEMBER_NOTE`). */
export const MAX_PROP_NOTE = 500;

/** A note as kept: trimmed, in bounds, and none at all when empty. */
export function cleanPropNote(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const clean = note.trim().slice(0, MAX_PROP_NOTE);
  return clean ? clean : null;
}

/**
 * The materials nearest the finishes props had before they were painted
 * (D-352), so a map saved then keeps its doors oak and its bars iron. A
 * light's finish was its flame, and is read as one.
 */
const FINISH_PAINTS: Readonly<Record<string, string>> = {
  wood: 'material:wood', 'dark-wood': 'material:wood/dark-oak', 'pale-wood': 'material:wood/birch',
  iron: 'material:mineral/iron', 'dark-iron': 'material:mineral/iron', rusted: 'material:mineral/copper',
  stone: 'material:mineral', 'dark-stone': 'material:mineral/dark-rock',
};
const OLD_FLAMES: ReadonlySet<string> = new Set(['fire', 'candle', 'cold', 'green']);

/**
 * A prop's look as written — its paint and its flame — read leniently, from
 * a map or a prefab, and from either spelling: `paint` and `flame`, or the
 * `finish` that was one or the other (D-352). Unchecked against the registry
 * and the catalogue here; what nobody knows is drawn as its type's first.
 */
export function lookOfJSON(entry: Record<string, unknown>): { readonly paint?: SwatchId; readonly flame?: string } {
  const finish = typeof entry.finish === 'string' ? entry.finish : null;
  const paint = typeof entry.paint === 'string' && entry.paint
    ? entry.paint : finish !== null ? FINISH_PAINTS[finish] ?? null : null;
  const flame = typeof entry.flame === 'string' && entry.flame
    ? entry.flame : finish !== null && OLD_FLAMES.has(finish) ? finish : null;
  return { ...(paint ? { paint: paint as SwatchId } : {}), ...(flame ? { flame } : {}) };
}

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/**
 * A map's props, read leniently (R-137a): one without an id, a type or a whole
 * cube is dropped; a facing is brought into range. Not checked against the
 * catalogue here — a type nobody knows still stands where it stood, as one
 * cube that stops walking, which is safer than a wall that vanished.
 */
export function propsOfJSON(json: unknown): readonly Prop[] {
  if (!Array.isArray(json)) return [];
  const out: Prop[] = [];
  for (const raw of json as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const at = entry.at as Record<string, unknown> | undefined;
    if (typeof entry.id !== 'string' || !entry.id || typeof entry.type !== 'string' || !entry.type) continue;
    if (!at || !isWhole(at.x) || !isWhole(at.y) || !isWhole(at.z)) continue;
    if (out.some((prop) => prop.id === entry.id)) continue;
    const facing = isWhole(entry.facing) ? (((entry.facing % 4) + 4) % 4) as Prop['facing'] : 0;
    out.push({
      id: entry.id as PropId,
      type: entry.type,
      at: { x: at.x, y: at.y, z: at.z },
      facing,
      ...lookOfJSON(entry),
      ...(cleanPropNote(entry.note) ? { note: cleanPropNote(entry.note)! } : {}),
      ...(typeof entry.reach === 'number' && Number.isFinite(entry.reach) ? { reach: cleanReach(entry.reach) } : {}),
    });
  }
  return out;
}

export function propsAsJSON(props: readonly Prop[]): PropJSON[] {
  return props.map((prop) => ({
    id: prop.id, type: prop.type, at: { x: prop.at.x, y: prop.at.y, z: prop.at.z },
    facing: prop.facing,
    ...(prop.paint !== undefined ? { paint: prop.paint as string } : {}),
    ...(prop.flame !== undefined ? { flame: prop.flame } : {}),
    ...(prop.note !== undefined ? { note: prop.note } : {}),
    ...(prop.reach !== undefined ? { reach: prop.reach } : {}),
  }));
}

/** How many cells a map's box holds: its footprint by the full height. */
function boxOf(size: { readonly x: number; readonly z: number }): number {
  return size.x * size.z * (MAP_MAX_HEIGHT - MAP_MIN_DEPTH);
}

/**
 * Packs a body into a palette and a run of counts (R-59).
 *
 * Built from the **sparse keys**, not by walking the box: the cost is
 * proportional to what the GM built rather than to how far their map reaches,
 * which matters because the box grows with every expansion while the content
 * does not. Runs of the same value merge as they are pushed, so the empty
 * levels above and below a building collapse into one number each.
 */
export function packBlocks(
  origin: { readonly x: number; readonly z: number },
  size: { readonly x: number; readonly z: number },
  blocks: ReadonlyMap<string, SwatchId>,
): { palette: string[]; runs: number[] } {
  const palette = [...new Set(blocks.values())].sort();
  const indexOf = new Map(palette.map((id, i) => [id, i + 1]));
  const perLevel = size.x * size.z;

  const cells: { at: number; value: number }[] = [];
  for (const [key, swatch] of blocks) {
    const at = parseBlockKey(key);
    if (!at || at.x < origin.x || at.z < origin.z) continue;
    const dx = at.x - origin.x;
    const dz = at.z - origin.z;
    const dy = at.y - MAP_MIN_DEPTH;
    if (dx >= size.x || dz >= size.z || dy < 0 || dy >= MAP_MAX_HEIGHT - MAP_MIN_DEPTH) continue;
    cells.push({ at: dy * perLevel + dz * size.x + dx, value: indexOf.get(swatch)! });
  }
  cells.sort((a, b) => a.at - b.at);

  const runs: number[] = [];
  const push = (count: number, value: number) => {
    if (count <= 0) return;
    const n = runs.length;
    if (n >= 2 && runs[n - 1] === value) runs[n - 2] = runs[n - 2]! + count;
    else runs.push(count, value);
  };

  let cursor = 0;
  for (const cell of cells) {
    // A duplicate index cannot happen — block keys are unique — but a skipped
    // one would silently shift every cube after it, so it is cheaper to be sure.
    if (cell.at < cursor) continue;
    push(cell.at - cursor, 0);
    push(1, cell.value);
    cursor = cell.at + 1;
  }
  push(boxOf(size) - cursor, 0);
  return { palette, runs };
}

/**
 * Unpacks a body, or `null` if the runs do not describe this box exactly.
 *
 * Refusing beats guessing: a stream whose counts do not add up has had a cube
 * inserted or lost somewhere, and every cube after that point is at the wrong
 * coordinate. A map drawn one cell askew is worse than a map that will not
 * open, because only one of the two tells you (R-18).
 */
export function unpackBlocks(
  origin: { readonly x: number; readonly z: number },
  size: { readonly x: number; readonly z: number },
  palette: readonly string[],
  runs: readonly number[],
): Map<string, SwatchId> | null {
  if (runs.length % 2 !== 0) return null;
  const blocks = new Map<string, SwatchId>();
  const perLevel = size.x * size.z;
  let cursor = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const count = runs[i]!;
    const value = runs[i + 1]!;
    if (!Number.isInteger(count) || count < 0) return null;
    if (value !== 0) {
      const swatch = palette[value - 1];
      if (swatch === undefined) return null;
      for (let k = 0; k < count; k += 1) {
        const at = cursor + k;
        const level = Math.floor(at / perLevel);
        const rest = at - level * perLevel;
        blocks.set(blockKey({
          x: origin.x + (rest % size.x),
          y: MAP_MIN_DEPTH + level,
          z: origin.z + Math.floor(rest / size.x),
        }), swatch as SwatchId);
      }
    }
    cursor += count;
  }
  return cursor === boxOf(size) ? blocks : null;
}

export function mapToJSON(map: EncounterMap): MapJSON {
  // The box is repaired *before* packing, not after reading. A run stream can
  // only describe cells inside its own box, so a block that strayed outside
  // the declared footprint would be dropped on the way out and never reach the
  // repair that used to catch it on the way in (R-157, D-199).
  const box = enclosing(map.origin, map.size, map.blocks);
  return {
    ...box,
    ...packBlocks(box.origin, box.size, map.blocks),
    planes: planesToJSON(map.planes),
    ...(map.props.length > 0 ? { props: propsAsJSON(map.props) } : {}),
  };
}

/**
 * What may arrive on the way *in* — the tolerance, and only in this direction
 * (R-137a).
 *
 * Three absences, each saying what it means, none of which needed a schema
 * bump (D-187's reasoning, three times over):
 *
 * - **No origin.** The map could only grow away from it, so `{0,0}` is not a
 *   guess; it is what that map already meant.
 * - **No planes.** Nobody could cut one, so it has exactly one band: all of it.
 * - **No palette or runs, but a `blocks` record.** The body predates packing
 *   (D-217). It is read as it is, and written packed from then on.
 */
export type MapJSONIn = {
  origin?: { x: number; z: number } | undefined;
  size: { x: number; z: number };
  planes?: PlaneJSON[] | undefined;
  /** Absent before there were props: none (D-187). */
  props?: unknown;
  /** The packed body (D-217). */
  palette?: string[] | undefined;
  runs?: number[] | undefined;
  /** The body as it was stored before packing: `"x,y,z": materialId`. */
  blocks?: Record<string, string> | undefined;
};

export function enclosing(
  origin: { readonly x: number; readonly z: number },
  size: { readonly x: number; readonly z: number },
  blocks: ReadonlyMap<string, SwatchId>,
): { origin: { x: number; z: number }; size: { x: number; z: number } } {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const key of blocks.keys()) {
    const at = parseBlockKey(key);
    if (!at) continue;
    if (at.x < minX) minX = at.x;
    if (at.z < minZ) minZ = at.z;
    if (at.x > maxX) maxX = at.x;
    if (at.z > maxZ) maxZ = at.z;
  }
  // Nothing in it to be outside of.
  if (minX === Infinity) return { origin: { x: origin.x, z: origin.z }, size: { x: size.x, z: size.z } };

  const axis = (from: number, width: number, low: number, high: number) => {
    const span = high - low + 1;
    if (span > width) return { from: low, width: span };
    if (low < from) return { from: low, width };
    if (high >= from + width) return { from: high - width + 1, width };
    return { from, width };
  };

  const x = axis(origin.x, size.x, minX, maxX);
  const z = axis(origin.z, size.z, minZ, maxZ);
  return { origin: { x: x.from, z: z.from }, size: { x: x.width, z: z.width } };
}

export function mapFromJSON(json: MapJSONIn | undefined | null): EncounterMap | null {
  if (!json) return null;
  const declared = {
    origin: { x: json.origin?.x ?? 0, z: json.origin?.z ?? 0 },
    size: { x: json.size.x, z: json.size.z },
  };
  const blocks = json.runs
    ? unpackBlocks(declared.origin, declared.size, json.palette ?? [], json.runs)
    : new Map(Object.entries(json.blocks ?? {}) as [string, SwatchId][]);
  // Runs that do not add up are refused rather than drawn askew — see
  // `unpackBlocks`. Null reads as "that map could not be loaded", which the
  // store already knows how to say.
  if (!blocks) return null;
  return {
    // Whatever the file claims, the footprint is widened to hold what is in
    // it. A packed body cannot stray outside its box, but one written before
    // packing could, and may still be on disk.
    ...enclosing(declared.origin, declared.size, blocks),
    blocks,
    planes: planesFromJSON(json.planes),
    props: propsOfJSON(json.props),
  };
}
