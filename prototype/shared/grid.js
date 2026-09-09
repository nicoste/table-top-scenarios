// Voxel world model.
//
// Coordinates are integer cells (x, y, z) with y as UP. Cell (x,y,z) occupies the
// world-space box [x,x+1] x [y,y+1] x [z,z+1]. There is no separate "floor" type:
// a token stands in an empty cell whose neighbour below blocks movement, exactly
// like standing on top of a cube.

// The four kinds span the full 2x2 matrix of (blocks vision) x (blocks movement),
// which keeps the two concerns visibly independent instead of conflated.
export const VOXEL_KINDS = {
  solid: { blocksMove: true,  opaque: 'full',  color: '#8b929c', label: 'Solid',      hint: 'blocks sight + movement' },
  glass: { blocksMove: true,  opaque: 'none',  color: '#63c7f5', label: 'Glass',      hint: 'blocks movement only' },
  smoke: { blocksMove: false, opaque: 'full',  color: '#b3a9c4', label: 'Smoke',      hint: 'blocks sight only' },
  half:  { blocksMove: true,  opaque: 'lower', color: '#c9964f', label: 'Half cover', hint: 'blocks movement, blocks sight below 0.5' },
};

export const KIND_NAMES = Object.keys(VOXEL_KINDS);

// Height of the opaque part of a cell, as a fraction of the cell. `half` only
// occludes the bottom half, so you can shoot over a crate you cannot walk through.
export const HALF_HEIGHT = 0.5;

export function key(x, y, z) { return x + ',' + y + ',' + z; }

export function parseKey(k) { return k.split(',').map(Number); }

export class Grid {
  constructor(size = { x: 40, y: 14, z: 40 }) {
    this.size = { ...size };
    this.cells = new Map(); // key -> kind name
  }

  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.size.x && y < this.size.y && z < this.size.z;
  }

  get(x, y, z) { return this.cells.get(key(x, y, z)) || null; }

  set(x, y, z, kind) {
    if (!this.inBounds(x, y, z)) return false;
    const k = key(x, y, z);
    if (!kind) this.cells.delete(k);
    else if (VOXEL_KINDS[kind]) this.cells.set(k, kind);
    else return false;
    return true;
  }

  // Movement blocking. Out of bounds counts as blocked on the sides and floor so
  // tokens cannot walk off the edge of the world, but the ceiling stays open.
  blocksMove(x, y, z) {
    if (x < 0 || z < 0 || x >= this.size.x || z >= this.size.z || y < 0) return true;
    if (y >= this.size.y) return false;
    const kind = this.get(x, y, z);
    return kind ? VOXEL_KINDS[kind].blocksMove : false;
  }

  // The occluding box of a cell in world space, or null if sight passes freely.
  // Only the y extent varies: `half` occupies the lower part of its cell.
  opaqueBox(x, y, z) {
    const kind = this.get(x, y, z);
    if (!kind) return null;
    const o = VOXEL_KINDS[kind].opaque;
    if (o === 'none') return null;
    return {
      kind,
      x0: x, x1: x + 1,
      y0: y, y1: o === 'lower' ? y + HALF_HEIGHT : y + 1,
      z0: z, z1: z + 1,
    };
  }

  get count() { return this.cells.size; }

  toJSON() {
    const voxels = [];
    for (const [k, kind] of this.cells) {
      const [x, y, z] = parseKey(k);
      voxels.push([x, y, z, kind]);
    }
    return { size: this.size, voxels };
  }

  static fromJSON(json) {
    const g = new Grid(json?.size);
    for (const [x, y, z, kind] of json?.voxels || []) g.set(x, y, z, kind);
    return g;
  }
}
