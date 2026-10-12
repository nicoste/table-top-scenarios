// What stands on the world's cells (R-193), drawn.
//
// **One InstancedMesh per part of per cover**, which is the same split R-173
// makes one level down: a part is a fixed shape in a fixed material, so every
// oak trunk in the world is one mesh and every canopy above them is another.
// Four covers of two parts each is eight draw calls for however many trees a
// GM plants, and the only thing that varies per instance is a colour and a
// matrix — which is exactly what an instance can carry.
//
// **Placement is derived, never stored** (D-280). A cover's jitter, its turn
// and its size come from a hash of the cell's own coordinate, so two forest
// cells differ without a byte on disk, retuning a cover restyles every world
// that uses it, and the same cell looks the same for the life of the campaign.
// The same reasoning as grain, and the same hash (R-172).
//
// **Covers are not picked.** They are scenery standing on a cell, and the cell
// is always what a click means — so they are raycast by nothing, and a tool
// aiming through a tree lands on the ground beneath it. A marker needed
// `intendedCell` for this (D-163); a cover needs only to stay out of the way.

import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Group, InstancedMesh,
  MeshStandardMaterial, Object3D,
} from 'three';
import type { BufferGeometry } from 'three';
import type { Campaign, Cover, CoverPart, World } from '@tt/domain';
import {
  CHUNK_SIZE, DEFAULT_COVERS, coverById, colourOf, cutIdIn, familyOf,
} from '@tt/domain';
import { grainAt } from '../grain/index.js';
import { HEIGHT_SCALE } from '../world/index.js';

/**
 * How far a cover may wander from the middle of its cell, in cell widths.
 *
 * Enough that a wood does not read as a chessboard, little enough that a cover
 * never crosses into the cell beside it — which would make the one thing a
 * cover has to say, *which cell this is*, a lie.
 */
const WANDER = 0.17;
/** And how much bigger or smaller one may be. A tenth either way. */
const VARY = 0.1;

export interface CoverField {
  readonly group: Group;
  /** How many covers are standing. Zero means a bare world, not a missing one. */
  readonly count: number;
  dispose(): void;
}

function geometryFor(part: CoverPart): BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    // Eight and six segments: these are symbols a few pixels across, and the
    // triangles saved are multiplied by every cell in a forest.
    case 'cone': return new ConeGeometry(w, h, 8);
    case 'cylinder': return new CylinderGeometry(w, w, h, 6);
    case 'box':
    default: return new BoxGeometry(w, h, d);
  }
}

/** Where the ground is, so a cover stands on it rather than in it. */
function columnTop(height: number): number {
  return height <= 0 ? 0.25 : height * HEIGHT_SCALE;
}

interface Standing {
  readonly gx: number;
  readonly gz: number;
  readonly top: number;
}

export function buildCovers(campaign: Campaign): CoverField {
  const world: World = campaign.world;
  const group = new Group();

  // Grouped by cover first, because a mesh is per part and its size has to be
  // known before it is made.
  const stands = new Map<string, { cover: Cover; cells: Standing[] }>();
  let count = 0;
  for (const chunk of world.chunks.values()) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const column = chunk.columns[z * CHUNK_SIZE + x];
        if (!column?.cover) continue;
        const cover = coverById(DEFAULT_COVERS, column.cover);
        // A cover the registry has never heard of draws nothing. Unlike a
        // material it has no colour to be obviously wrong in, and a world
        // written by a newer build should lose its scenery rather than its
        // ground (R-137a).
        if (!cover) continue;
        let pile = stands.get(cover.id as string);
        if (!pile) {
          pile = { cover, cells: [] };
          stands.set(cover.id as string, pile);
        }
        pile.cells.push({
          gx: chunk.coord.cx * CHUNK_SIZE + x,
          gz: chunk.coord.cz * CHUNK_SIZE + z,
          top: columnTop(column.height),
        });
        count += 1;
      }
    }
  }

  const geometries: BufferGeometry[] = [];
  const surfaces: MeshStandardMaterial[] = [];
  const meshes: InstancedMesh[] = [];
  /* One scratch of each, for the whole field (R-172). */
  const pose = new Object3D();
  const shade = new Color();
  const hsl = { h: 0, s: 0, l: 0 };

  for (const { cover, cells } of stands.values()) {
    /*
     * Worked out once per cell and shared by every part of the cover, so a
     * trunk and the canopy above it wander together. Separate hashes per part
     * would scatter a tree into its pieces.
     */
    const poses = cells.map(({ gx, gz, top }) => ({
      x: gx + 0.5 + grainAt(gx, 7, gz) * WANDER,
      z: gz + 0.5 + grainAt(gx, 13, gz) * WANDER,
      y: top,
      yaw: grainAt(gx, 19, gz) * Math.PI,
      scale: 1 + grainAt(gx, 23, gz) * VARY,
      drift: grainAt(gx, 29, gz),
    }));

    cover.parts.forEach((part, partIndex) => {
      const family = familyOf(part.swatch);
      if (!family) return;
      const geometry = geometryFor(part);
      geometries.push(geometry);

      // The family's own surface, exactly as a cube of it would be drawn
      // (R-173) — which is the point: retune Vegetation and every canopy on
      // every world follows, along with every leaf in every building.
      const surface = new MeshStandardMaterial({
        roughness: family.roughness,
        metalness: 0,
        transparent: family.opacity < 1,
        opacity: family.opacity,
      });
      if (family.glow > 0) {
        surface.emissive = new Color(family.cuts[0]!.colour);
        surface.emissiveIntensity = family.glow;
      }
      surfaces.push(surface);

      const base = new Color(colourOf(family, cutIdIn(part.swatch)));
      const mesh = new InstancedMesh(geometry, surface, Math.max(1, poses.length));
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = poses.length;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Nothing raycasts this group, but a cover must not be pickable even by
      // accident: a tool aiming through a wood means the ground under it.
      mesh.raycast = () => {};
      mesh.name = `cover:${cover.id}:${partIndex}`;

      const [ox, oy, oz] = part.at;
      poses.forEach((at, index) => {
        pose.position.set(
          at.x + ox * at.scale,
          at.y + oy * at.scale,
          at.z + oz * at.scale,
        );
        pose.rotation.set(0, at.yaw, 0);
        pose.scale.setScalar(at.scale);
        pose.updateMatrix();
        mesh.setMatrixAt(index, pose.matrix);

        // Lightness in HSL, not a multiply: scaling the channels together
        // drags the family's hue about (R-172, D-237).
        shade.copy(base);
        if (family.grain > 0) {
          shade.getHSL(hsl);
          shade.setHSL(hsl.h, hsl.s,
            Math.min(1, Math.max(0, hsl.l + at.drift * family.grain)));
        }
        mesh.setColorAt(index, shade);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
      meshes.push(mesh);
    });
  }

  return {
    group,
    count,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const surface of surfaces) surface.dispose();
      for (const mesh of meshes) mesh.dispose();
    },
  };
}
