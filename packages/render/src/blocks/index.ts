// An encounter map's voxel body. One InstancedMesh for every block, coloured per
// instance from the materials registry (R-75).
//
// Instanced because a body is thousands of identical cubes: a draw call each
// would stall, and a merged geometry would have to be rebuilt to move one block.
// Instancing rebuilds the whole buffer on an edit, which is fast enough at this
// size and far simpler than tracking dirty regions — the world mesh made the
// same trade.
//
// Face picking is the reason this exists separately from the world's mesh: the
// world stores a height per cell and never needs to know *which side* was hit,
// while placing a block does (R-147).

import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, MeshLambertMaterial,
  Object3D, Vector3,
} from 'three';
import type { Intersection } from 'three';
import type { BlockCoord, EncounterMap, Material } from '@tt/domain';
import { parseBlockKey } from '@tt/domain';
import { grainAt } from '../grain/index.js';

/** Where a click on a block face means a new block should go (R-147). */
export interface FacePick {
  /** The block that was actually hit. */
  readonly block: BlockCoord;
  /** The empty cell against the hit face — where a placement lands. */
  readonly adjacent: BlockCoord;
}

export interface BlockBody {
  readonly group: Group;
  /** How many blocks are drawn. Zero means an empty body, not a missing one. */
  readonly count: number;
  /**
   * Resolves an intersection to the block hit and the cell beside it.
   *
   * Needs the raycast hit rather than a coordinate, because the *face normal* is
   * the whole point: clicking the top of a block means "put one on top", and
   * clicking its side means "put one beside it".
   */
  faceOf(hit: Intersection): FacePick | null;
  dispose(): void;
}

const CUBE = 1;

export function buildBlockBody(map: EncounterMap, materials: readonly Material[]): BlockBody {
  const group = new Group();
  const geometry = new BoxGeometry(CUBE, CUBE, CUBE);
  const material = new MeshLambertMaterial();
  const colours = new Map(materials.map((m) => [m.id as string, new Color(m.colour)]));
  const grains = new Map(materials.map((m) => [m.id as string, m.grain]));
  const fallback = new Color('#ff00ff');
  /*
   * One scratch colour for every cube in the body (R-172). Nine thousand
   * `new Color` would be nine thousand allocations on the rebuild that runs
   * each time a cube is placed, to produce a value three.js copies out of
   * immediately.
   */
  const shade = new Color();
  const hsl = { h: 0, s: 0, l: 0 };

  const entries: { at: BlockCoord; colour: Color; grain: number }[] = [];
  for (const [key, materialId] of map.blocks) {
    const at = parseBlockKey(key);
    if (!at) continue;
    // Every block handed over is drawn, at its material's own colour. Which
    // blocks those are is the caller's decision — the console hands over a
    // slice when the GM is levelling, and the table only ever had one (R-159).
    entries.push({
      at,
      colour: colours.get(materialId as string) ?? fallback,
      grain: grains.get(materialId as string) ?? 0,
    });
  }

  const mesh = new InstancedMesh(geometry, material, Math.max(1, entries.length));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = entries.length;

  // Instance index -> block, so a raycast hit can be turned back into a
  // coordinate. `instanceId` is the only thing three.js hands back.
  const byIndex: BlockCoord[] = [];
  const pose = new Object3D();
  entries.forEach(({ at, colour, grain }, index) => {
    // Blocks are addressed by their corner; the mesh is centred, so add a half.
    pose.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    /*
     * Lightness rather than a plain multiply: scaling r, g and b together
     * drags a colour toward black or past white and shifts how saturated it
     * looks, where a nudge in HSL keeps the material's own hue.
     */
    shade.copy(colour);
    if (grain > 0) {
      shade.getHSL(hsl);
      shade.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + grainAt(at.x, at.y, at.z) * grain)));
    }
    mesh.setColorAt(index, shade);
    byIndex[index] = at;
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  return {
    group,
    count: entries.length,
    faceOf(hit) {
      if (hit.object !== mesh || hit.instanceId === undefined) return null;
      const block = byIndex[hit.instanceId];
      if (!block) return null;
      const normal = hit.face?.normal;
      if (!normal) return null;
      // The normal arrives in the mesh's local space. Every instance shares the
      // cube's orientation and none of them rotate, so it is already the world
      // direction — rounded, because a face normal is one of six unit vectors and
      // floating point should not be allowed to invent a seventh.
      const step = new Vector3(Math.round(normal.x), Math.round(normal.y), Math.round(normal.z));
      return {
        block,
        adjacent: { x: block.x + step.x, y: block.y + step.y, z: block.z + step.z },
      };
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
