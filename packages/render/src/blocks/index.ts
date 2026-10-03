// An encounter map's voxel body: **one InstancedMesh per material** (R-173).
//
// Instanced because a body is thousands of identical cubes: a draw call each
// would stall, and a merged geometry would have to be rebuilt to move one block.
// Instancing rebuilds the whole buffer on an edit, which is fast enough at this
// size and far simpler than tracking dirty regions — the world mesh made the
// same trade.
//
// Split per material because **colour is the only thing an instance can carry**.
// Roughness and emission are uniforms on the material, so a single mesh can
// draw a thousand shades of one substance and cannot draw thatch beside ice.
// Thirteen draw calls instead of one is nothing here — the world already makes
// twenty, and 116,568 triangles cost this card 0.7 ms (MEASUREMENTS.md).
//
// Face picking is the reason this exists separately from the world's mesh: the
// world stores a height per cell and never needs to know *which side* was hit,
// while placing a block does (R-147).

import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, MeshStandardMaterial,
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
  const known = new Map(materials.map((m) => [m.id as string, m]));
  const unknown: Material = {
    id: 'material:unknown' as Material['id'],
    name: 'Unknown',
    colour: '#ff00ff',
    blocksSight: true,
    grain: 0,
    roughness: 1,
    glow: 0,
    opacity: 1,
  };

  // Grouped first, because a mesh is per material and its size has to be known
  // before it is made.
  const piles = new Map<string, { material: Material; blocks: BlockCoord[] }>();
  for (const [key, materialId] of map.blocks) {
    const at = parseBlockKey(key);
    if (!at) continue;
    const id = materialId as string;
    let pile = piles.get(id);
    if (!pile) {
      pile = { material: known.get(id) ?? unknown, blocks: [] };
      piles.set(id, pile);
    }
    pile.blocks.push(at);
  }

  /*
   * One scratch colour for the whole body (R-172). Nine thousand `new Color`
   * would be nine thousand allocations on the rebuild that runs each time a
   * cube is placed, to make a value three.js copies out of immediately.
   */
  const base = new Color();
  const shade = new Color();
  const hsl = { h: 0, s: 0, l: 0 };
  const pose = new Object3D();
  /** Which mesh holds which blocks, so a hit can be turned back into a cube. */
  const byMesh = new Map<InstancedMesh, BlockCoord[]>();
  const used: MeshStandardMaterial[] = [];
  let count = 0;

  for (const { material, blocks } of piles.values()) {
    base.set(material.colour);
    const surface = new MeshStandardMaterial({
      roughness: material.roughness,
      /*
       * Flat zero, deliberately. A metal in this lighting model reflects its
       * surroundings and scatters almost nothing, so metalness without an
       * environment map renders **black** — worse than the painted grey it
       * replaces. Metal is a decision with an environment attached (D-238).
       */
      metalness: 0,
      /*
       * **Depth writes stay on** (R-174). Instances inside one mesh are drawn
       * in buffer order and nothing sorts them, so switching depth writes off
       * — the usual move for transparency — makes a sea blend with itself in
       * whatever order its cubes happen to sit in the buffer, and a cube at
       * the far edge can wash over one at the near. Left on, the nearest face
       * at each pixel wins and blends with the ground behind it, which is
       * both what water looks like and one layer of overdraw instead of
       * sixty (D-239).
       */
      transparent: material.opacity < 1,
      opacity: material.opacity,
    });
    /*
     * Set after construction rather than passed as `emissive: undefined`,
     * which three.js answers with a warning for every material that does not
     * glow. Twelve warnings a rebuild cost 4 ms in a browser capturing the
     * console — more than the split they were blamed on (D-238).
     */
    if (material.glow > 0) {
      surface.emissive = base.clone();
      surface.emissiveIntensity = material.glow;
    }
    used.push(surface);

    const mesh = new InstancedMesh(geometry, surface, Math.max(1, blocks.length));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = blocks.length;
    blocks.forEach((at, index) => {
      // Blocks are addressed by their corner; the mesh is centred, so add a half.
      pose.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5);
      pose.updateMatrix();
      mesh.setMatrixAt(index, pose.matrix);
      /*
       * Lightness rather than a plain multiply: scaling r, g and b together
       * drags a colour toward black or past white and changes how saturated
       * it looks, where a nudge in HSL keeps the material's own hue (R-172).
       */
      shade.copy(base);
      if (material.grain > 0) {
        shade.getHSL(hsl);
        const drift = grainAt(at.x, at.y, at.z) * material.grain;
        shade.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + drift)));
      }
      mesh.setColorAt(index, shade);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    byMesh.set(mesh, blocks);
    count += blocks.length;
  }

  return {
    group,
    count,
    faceOf(hit) {
      const blocks = byMesh.get(hit.object as InstancedMesh);
      if (!blocks || hit.instanceId === undefined) return null;
      const block = blocks[hit.instanceId];
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
      for (const surface of used) surface.dispose();
      for (const mesh of byMesh.keys()) mesh.dispose();
    },
  };
}
