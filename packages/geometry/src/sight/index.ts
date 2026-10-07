// Sight lines through a grid of cubes (R-41, R-44). Numbers in, numbers out:
// which cubes stop sight is the caller's question, asked one cube at a time.
//
// A line is walked with Amanatides and Woo's traversal — every cube the
// segment passes through, in order, and no others — and stops at the first
// one that blocks. That is the whole of "can the eye see this point".

export interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Whether the cube at these integer coordinates stops sight. */
export type Blocks = (x: number, y: number, z: number) => boolean;

/**
 * Two crossings this close together, measured along the whole segment, are
 * one crossing: the line goes through an edge or a corner, not a face.
 */
const TIE = 1e-9;
/** No sight line is longer than this many cubes; a guard, not a range. */
const MAX_STEPS = 4096;

/**
 * Whether nothing stops sight between two points.
 *
 * Both cubes at the ends are tested along with every cube between: the eye
 * does not see out of a solid block, and a point inside one is not seen.
 *
 * **Seams are sealed (R-44).** Where the line crosses an edge or a corner
 * rather than a face, it passes through a point every cube around it shares,
 * so every one of those cubes is tested and any that blocks stops it. Two
 * cubes touching only along a diagonal edge leave no gap to see through, and a
 * line grazing a single cube's edge is stopped as well — walls are airtight,
 * and a line exactly on an edge is a coincidence that the next sample point
 * will not repeat (R-41).
 */
export function lineIsClear(blocks: Blocks, from: Point, to: Point): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  let z = Math.floor(from.z);
  if (blocks(x, y, z)) return false;

  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const sz = Math.sign(dz);
  // How far along the segment, as a fraction of it, one whole cube is.
  const ux = sx !== 0 ? 1 / Math.abs(dx) : Infinity;
  const uy = sy !== 0 ? 1 / Math.abs(dy) : Infinity;
  const uz = sz !== 0 ? 1 / Math.abs(dz) : Infinity;
  // Where along the segment the next face in each direction is crossed.
  let tx = sx > 0 ? (x + 1 - from.x) / dx : sx < 0 ? (x - from.x) / dx : Infinity;
  let ty = sy > 0 ? (y + 1 - from.y) / dy : sy < 0 ? (y - from.y) / dy : Infinity;
  let tz = sz > 0 ? (z + 1 - from.z) / dz : sz < 0 ? (z - from.z) / dz : Infinity;

  for (let step = 0; step < MAX_STEPS; step++) {
    const t = Math.min(tx, ty, tz);
    // The segment ends inside the cube it is in.
    if (t > 1) return true;
    // Which faces are crossed at once: one bit an axis.
    const crossed = (tx <= t + TIE ? 1 : 0) | (ty <= t + TIE ? 2 : 0) | (tz <= t + TIE ? 4 : 0);
    if (crossed & (crossed - 1)) {
      // An edge or a corner: every cube sharing it, other than the one the
      // line leaves and the one it enters, is a step along some of the
      // crossed axes but not all of them.
      for (let some = 1; some < 8; some++) {
        if ((some & crossed) !== some || some === crossed) continue;
        if (blocks(x + (some & 1 ? sx : 0), y + (some & 2 ? sy : 0), z + (some & 4 ? sz : 0))) return false;
      }
    }
    if (crossed & 1) { x += sx; tx += ux; }
    if (crossed & 2) { y += sy; ty += uy; }
    if (crossed & 4) { z += sz; tz += uz; }
    if (blocks(x, y, z)) return false;
  }
  return true;
}

/**
 * A box of cubes, one small number each, dense rather than sparse.
 *
 * Sight asks about the same few thousand cubes tens of thousands of times, and
 * a lookup here is an index into a typed array where a sparse map would build
 * a string key on every step. Zero means empty; what the other numbers mean is
 * the caller's.
 */
export interface CubeGrid {
  /** The lowest cube in the box. */
  readonly min: Point;
  /** Cubes along each axis. */
  readonly size: Point;
  /** One per cube, y then z then x. Written while the grid is built, never after. */
  readonly cells: Uint8Array;
}

export function cubeGrid(min: Point, size: Point): CubeGrid {
  return {
    min,
    size,
    cells: new Uint8Array(Math.max(0, size.x * size.y * size.z)),
  };
}

/** Where a cube sits in `cells`, or -1 outside the box. */
export function cubeIndex(grid: CubeGrid, x: number, y: number, z: number): number {
  const lx = x - grid.min.x;
  const ly = y - grid.min.y;
  const lz = z - grid.min.z;
  if (lx < 0 || ly < 0 || lz < 0 || lx >= grid.size.x || ly >= grid.size.y || lz >= grid.size.z) return -1;
  return (ly * grid.size.z + lz) * grid.size.x + lx;
}

/** The number at a cube, and zero outside the box: outside is empty. */
export function cubeAt(grid: CubeGrid, x: number, y: number, z: number): number {
  const index = cubeIndex(grid, x, y, z);
  return index < 0 ? 0 : grid.cells[index] ?? 0;
}
