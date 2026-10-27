// The world as columns: **one InstancedMesh per material** (R-173), the same
// split a map's body makes, for the same reason — colour is the only thing an
// instance can carry, and roughness, glow and transparency are uniforms.
//
// It used to be one `MeshLambertMaterial` and one mesh for everything, which
// is why lava on the world looked like painted grey while lava in a room
// glowed. Nothing tied the two together: maps drew from the materials registry
// and the world drew from a terrain one (D-280). Now they draw from the same
// registry through the same arithmetic, so a family retuned once is retuned
// everywhere (D-283).
//
// Still instanced and still rebuilt whole on an edit, which is the trade the
// map's body makes too: a chunk is 900 columns, the rebuild is a walk, and
// tracking dirty regions would buy nothing at this size.
//
// What stays different from a map's body is **picking**: a column stores a
// height and never needs to know which side was hit, where placing a block
// does (R-147). So this resolves a hit to a cell and no further.

import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshStandardMaterial,
  Object3D, Vector3,
} from 'three';
import type { Intersection } from 'three';
import type { Campaign, Chunk, Material, SwatchId, World, WorldCell } from '@tt/domain';
import {
  CHUNK_SIZE, LEVEL_HEIGHT, MAX_HEIGHT, chunkAt, columnAt, colourOf, cutIdIn, familyOf,
} from '@tt/domain';
import { grainAt } from '../grain/index.js';
import { figure } from '../patterns/index.js';

/**
 * How much the height cue brightens the ground, top to bottom.
 *
 * A cheap depth cue from before there were lights: high ground reads lighter
 * (R-34 territory). It survives the move to real lighting because a world is
 * seen from directly above, where a sun tells you very little about which way
 * the land slopes.
 */
const FLOOR_LIT = 0.82;
const LIT_RANGE = 0.24;

export interface ColumnAddress {
  readonly cx: number;
  readonly cz: number;
  readonly x: number;
  readonly z: number;
}

export interface WorldMeshes {
  /** One mesh per material, under one group (R-173). */
  readonly group: Group;
  /** Which column a raycast hit, or null if it hit something that is not one. */
  cellOf(hit: Intersection): ColumnAddress | null;
  /** Draws the figure in each material's surface, or does not (R-177). */
  setFigures(on: boolean): void;
  dispose(): void;
}

/** World-space centre of a column, in cells. */
export function columnCentre(address: ColumnAddress): Vector3 {
  return new Vector3(
    address.cx * CHUNK_SIZE + address.x + 0.5,
    0,
    address.cz * CHUNK_SIZE + address.z + 0.5,
  );
}

/**
 * How tall a column stands, in cell widths: a level for each level, and one
 * more beneath them all, so the sea and the shore beside it are a slab and
 * every step up is the same quarter (D-373). True scale — no exaggeration, so
 * the slope drawn is the slope the route pays for (R-52a).
 */
export function columnTop(height: number): number {
  return (Math.max(0, height) + 1) * LEVEL_HEIGHT;
}

/**
 * The height anything standing on a cell should sit at — markers, pawns, a
 * travel ghost. One definition, so a pawn never floats above the ground a place
 * on the same cell is planted in.
 */
export function surfaceAt(campaign: Campaign, cell: WorldCell): number {
  const chunk = chunkAt(campaign.world, { cx: cell.cx, cz: cell.cz });
  const column = chunk ? columnAt(chunk, cell.x, cell.z) : null;
  return columnTop(column?.height ?? 0);
}

/** A swatch the registry has never heard of: drawn, and obviously wrong. */
const UNKNOWN: Material = {
  id: 'material:unknown' as Material['id'],
  name: 'Unknown',
  cuts: [{ id: 'unknown', name: 'Unknown', colour: '#ff00ff' }],
  blocksSight: true,
  grain: 0,
  roughness: 1,
  glow: 0,
  opacity: 1,
  pattern: 'none',
  difficulty: 'impassable',
};

interface Pile {
  readonly material: Material;
  readonly addresses: ColumnAddress[];
  readonly heights: number[];
  readonly tints: Color[];
}

export function buildWorldMeshes(campaign: Campaign): WorldMeshes {
  const world: World = campaign.world;
  const group = new Group();
  const geometry = new BoxGeometry(1, 1, 1);

  /*
   * What a swatch resolves to, worked out once per swatch rather than once per
   * column: a world is tens of thousands of cells and at most a few dozen
   * swatches, and this is a registry lookup and a colour parse.
   */
  const seen = new Map<string, { material: Material; tint: Color }>();
  const resolve = (swatch: SwatchId) => {
    let known = seen.get(swatch as string);
    if (!known) {
      const material = familyOf(swatch) ?? UNKNOWN;
      known = { material, tint: new Color(colourOf(material, cutIdIn(swatch))) };
      seen.set(swatch as string, known);
    }
    return known;
  };

  // Grouped first, because a mesh is per material and its size has to be known
  // before it is made. Keyed on the **material**, not the swatch: the cuts of
  // one family differ only in a per-instance colour (R-176).
  const piles = new Map<string, Pile>();
  for (const chunk of world.chunks.values()) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const column = columnAt(chunk, x, z);
        if (!column) continue;
        const { material, tint } = resolve(column.ground);
        let pile = piles.get(material.id as string);
        if (!pile) {
          pile = { material, addresses: [], heights: [], tints: [] };
          piles.set(material.id as string, pile);
        }
        pile.addresses.push({ cx: chunk.coord.cx, cz: chunk.coord.cz, x, z });
        pile.heights.push(column.height);
        pile.tints.push(tint);
      }
    }
  }

  /* One scratch colour for the whole world (R-172), not one per cell. */
  const shade = new Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const pose = new Object3D();
  const matrix = new Matrix4();
  const surfaces: MeshStandardMaterial[] = [];
  const figures: ((on: boolean) => void)[] = [];
  /** Which mesh holds which columns, so a hit can be turned back into a cell. */
  const byMesh = new Map<InstancedMesh, readonly ColumnAddress[]>();

  for (const { material, addresses, heights, tints } of piles.values()) {
    /*
     * The same surface a map's cubes get, built the same way — including
     * setting emission after construction rather than passing `undefined`,
     * which three.js answers with a warning per material (D-238).
     */
    const surface = new MeshStandardMaterial({
      roughness: material.roughness,
      metalness: 0,
      transparent: material.opacity < 1,
      opacity: material.opacity,
    });
    if (material.glow > 0) {
      surface.emissive = new Color(material.cuts[0]!.colour);
      surface.emissiveIntensity = material.glow;
    }
    surfaces.push(surface);
    figures.push(figure(surface, material));

    const mesh = new InstancedMesh(geometry, surface, Math.max(1, addresses.length));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = addresses.length;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    addresses.forEach((address, index) => {
      const top = columnTop(heights[index]!);
      const centre = columnCentre(address);
      pose.position.set(centre.x, top / 2, centre.z);
      pose.scale.set(1, top, 1);
      pose.updateMatrix();
      matrix.copy(pose.matrix);
      mesh.setMatrixAt(index, matrix);

      shade.copy(tints[index]!);
      /*
       * Grain before the height cue, and in HSL: scaling r, g and b together
       * drags a colour toward black or past white, where a nudge in lightness
       * keeps the material's hue (R-172, D-237). This is also what makes two
       * cells of one ground differ without storing anything (D-280).
       */
      if (material.grain > 0) {
        shade.getHSL(hsl);
        const drift = grainAt(address.cx * CHUNK_SIZE + address.x, 0,
          address.cz * CHUNK_SIZE + address.z) * material.grain;
        shade.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + drift)));
      }
      const height = heights[index]!;
      if (height > 0) {
        shade.multiplyScalar(FLOOR_LIT + (Math.min(height, MAX_HEIGHT) / MAX_HEIGHT) * LIT_RANGE);
      }
      mesh.setColorAt(index, shade);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    byMesh.set(mesh, addresses);
  }

  return {
    group,
    cellOf(hit) {
      const addresses = byMesh.get(hit.object as InstancedMesh);
      if (!addresses || hit.instanceId === undefined) return null;
      return addresses[hit.instanceId] ?? null;
    },
    setFigures(on) {
      for (const set of figures) set(on);
    },
    dispose() {
      geometry.dispose();
      for (const surface of surfaces) surface.dispose();
      for (const mesh of byMesh.keys()) mesh.dispose();
    },
  };
}

/** Where the camera should look when a campaign opens: the middle of its land. */
export function worldCentre(world: World): { x: number; y: number; z: number } {
  const chunks = [...world.chunks.values()];
  if (chunks.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = chunks.reduce(
    (acc: { x: number; z: number }, c: Chunk) => ({ x: acc.x + c.coord.cx, z: acc.z + c.coord.cz }),
    { x: 0, z: 0 },
  );
  return {
    x: (sum.x / chunks.length + 0.5) * CHUNK_SIZE,
    y: 0,
    z: (sum.z / chunks.length + 0.5) * CHUNK_SIZE,
  };
}
