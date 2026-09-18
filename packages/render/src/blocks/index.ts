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
import type { BlockCoord, EncounterMap, LevelRange, Material } from '@tt/domain';
import { parseBlockKey, inRange } from '@tt/domain';

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

/**
 * How far an out-of-range level is faded on the GM console (R-146, D-182).
 *
 * Dimmed, not hidden. The console draws the **whole** body so the GM can peek
 * into the cellar while the party is upstairs, and the fade is what tells them
 * at a glance which part the table is being shown — R-76's preview obligation
 * met by one view rather than a second mode.
 *
 * Not so dark that geometry disappears: the GM still has to be able to build in
 * there, and clicking a face they cannot see is how a wall ends up one level off.
 */
const CUT_AWAY = 0.28;

export function buildBlockBody(
  map: EncounterMap,
  materials: readonly Material[],
  range: LevelRange | null = null,
): BlockBody {
  const group = new Group();
  const geometry = new BoxGeometry(CUBE, CUBE, CUBE);
  const material = new MeshLambertMaterial();
  const colours = new Map(materials.map((m) => [m.id as string, new Color(m.colour)]));
  const fallback = new Color('#ff00ff');

  const entries: { at: BlockCoord; colour: Color }[] = [];
  for (const [key, materialId] of map.blocks) {
    const at = parseBlockKey(key);
    if (!at) continue;
    const colour = (colours.get(materialId as string) ?? fallback).clone();
    // A null range means "no band is set", not "nothing is in range" — the world
    // view and the table both hand over exactly what they want drawn.
    if (range && !inRange(range, at.y)) colour.multiplyScalar(CUT_AWAY);
    entries.push({ at, colour });
  }

  const mesh = new InstancedMesh(geometry, material, Math.max(1, entries.length));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = entries.length;

  // Instance index -> block, so a raycast hit can be turned back into a
  // coordinate. `instanceId` is the only thing three.js hands back.
  const byIndex: BlockCoord[] = [];
  const pose = new Object3D();
  entries.forEach(({ at, colour }, index) => {
    // Blocks are addressed by their corner; the mesh is centred, so add a half.
    pose.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    mesh.setColorAt(index, colour);
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
