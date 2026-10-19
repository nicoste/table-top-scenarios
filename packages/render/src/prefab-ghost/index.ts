// The ghost of a prefab about to be placed (D-321): every cube it would put
// down, see-through, in its own material's colour — and red where it would
// land outside the map and be left out.
//
// Cubes, not a meshed body. The body mesher builds faces, shading and grain
// for blocks that stay; a ghost follows the pointer and is thrown away, and a
// box per cube in one instanced draw is all it needs to say *this, here*.

import { BoxGeometry, Color, InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import type { BlockCoord, SwatchId } from '@tt/domain';
import { DEFAULT_MATERIALS, colourOf, cutIdIn, materialById, materialIn } from '@tt/domain';

/** One cube of the ghost. */
export interface GhostCube {
  readonly at: BlockCoord;
  readonly swatch: SwatchId;
  /** Outside the map: drawn red, because it will be left out. */
  readonly outside: boolean;
}

/** Where it would be left out. */
const OUTSIDE = new Color('#ff5a5a');

export interface PrefabGhost {
  /** Null when nothing is shown; replaced on every `show`. */
  readonly mesh: () => InstancedMesh | null;
  /** Draws these cubes, or nothing. The caller adds `mesh()` to its scene. */
  show(cubes: readonly GhostCube[] | null): InstancedMesh | null;
  dispose(): void;
}

export function buildPrefabGhost(): PrefabGhost {
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    // Seen through what it overlaps — it is what a click will put there —
    // but writing no depth, so it hides nothing behind it.
    depthWrite: false,
  });
  /** A colour per swatch, worked out once: a prefab is many cubes and few swatches. */
  const tints = new Map<string, Color>();
  const tintOf = (swatch: SwatchId): Color => {
    let tint = tints.get(swatch);
    if (!tint) {
      const family = materialById(DEFAULT_MATERIALS, materialIn(swatch));
      tint = new Color(family ? colourOf(family, cutIdIn(swatch)) : '#9aa3ad');
      tints.set(swatch, tint);
    }
    return tint;
  };
  let current: InstancedMesh | null = null;
  const matrix = new Matrix4();

  const drop = () => {
    if (!current) return;
    current.removeFromParent();
    current.dispose();
    current = null;
  };

  return {
    mesh: () => current,
    show(cubes) {
      drop();
      if (!cubes || cubes.length === 0) return null;
      const mesh = new InstancedMesh(geometry, material, cubes.length);
      cubes.forEach((cube, i) => {
        // A block is addressed by its corner; a box is centred on its origin.
        matrix.makeTranslation(cube.at.x + 0.5, cube.at.y + 0.5, cube.at.z + 0.5);
        mesh.setMatrixAt(i, matrix);
        mesh.setColorAt(i, cube.outside ? OUTSIDE : tintOf(cube.swatch));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // Over the body's own cubes, under the outline that frames it.
      mesh.renderOrder = 10;
      // Never what a ray hits: the ghost is not in the map.
      mesh.raycast = () => {};
      current = mesh;
      return mesh;
    },
    dispose() {
      drop();
      geometry.dispose();
      material.dispose();
    },
  };
}
