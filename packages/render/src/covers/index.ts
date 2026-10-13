// What stands on the world's cells (R-193), drawn.
//
// **One InstancedMesh per part of per cover**, which is the same split R-173
// makes one level down: a part is a fixed shape in a fixed material, so every
// oak trunk in the world is one mesh and every canopy above them is another.
// Four covers of two parts each is eight draw calls for however many trees a
// GM plants, and the only thing that varies per instance is a colour and a
// matrix — which is exactly what an instance can carry.
//
// **Placement is derived, never stored** (D-280). A clump's jitter, its turn
// and its size come from a hash of the cell's own coordinate **and which
// clump it is**, so the two trees in a cell differ from each other as well as
// from the two in the cell beside it — all without a byte on disk. Retuning a
// cover restyles every world that uses it, and the same cell looks the same
// for the life of the campaign. The same reasoning as grain, and the same
// hash (R-172).
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
import type { Campaign, Chunk, Cover, CoverPart, World } from '@tt/domain';
import {
  CHUNK_SIZE, DEFAULT_COVERS, clumpsIn, coverById, colourOf, cutIdIn, familyOf,
} from '@tt/domain';
import { grainAt } from '../grain/index.js';
import { HEIGHT_SCALE } from '../world/index.js';

/**
 * How far a clump may wander from where the registry stands it, in cell
 * widths.
 *
 * Enough that a wood does not read as a chessboard, little enough that nothing
 * crosses into the cell beside it — which would make the one thing a cover has
 * to say, *which cell this is*, a lie. The registry already puts the two
 * clumps a third of a cell apart, so this only has to break the repeat.
 */
const WANDER = 0.075;
/** And how much bigger or smaller one may be. A fifth either way. */
const VARY = 0.2;
/*
 * Salts, so the five numbers a clump needs come from five different draws of
 * the same hash. Odd and spread out, for the reason `grainAt` gives: the axes
 * must not share factors or neighbours land together. The clump index is
 * folded in, which is what makes the two trees in a cell differ.
 */
const SALT = { x: 7, z: 13, yaw: 19, scale: 23, shade: 29 } as const;
const CLUMP_STRIDE = 37;

export interface CoverField {
  readonly group: Group;
  /**
   * Whether this field still draws this campaign, so it can be kept (D-292).
   *
   * A cover is drawn from where it stands, which cover it is and how high the
   * ground under it is — so painting a coastline moves not one tree, and the
   * stage used to re-instance every tree in the world on each brush cell
   * anyway. The same mistake the markers had (D-290), made twice in one
   * round, because "the world changed" is not the same question as "did what
   * I draw change".
   */
  matches(campaign: Campaign): boolean;
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

/**
 * What a chunk contributes to the field, as a string — **cached on the chunk
 * object itself**.
 *
 * A signature that walked every column of every chunk on every intent would
 * have replaced a rebuild with a slightly cheaper walk, which is not the
 * point. A chunk is identity-preserved when nothing in it changed (R-165), so
 * an edit makes exactly one new `Chunk` and every other one answers from the
 * cache. A `WeakMap`, so chunks the world has dropped take their entries with
 * them.
 */
const signatures = new WeakMap<Chunk, string>();

function chunkSignature(chunk: Chunk): string {
  const known = signatures.get(chunk);
  if (known !== undefined) return known;
  const parts: string[] = [];
  for (let i = 0; i < chunk.columns.length; i += 1) {
    const column = chunk.columns[i]!;
    // Only the cells that hold something: most of a world holds nothing, and
    // the empty ones are exactly what must not make this O(world).
    if (column.cover) parts.push(`${i}:${column.cover}:${column.height}`);
  }
  const made = parts.join(',');
  signatures.set(chunk, made);
  return made;
}

/**
 * Everything the cover field is drawn from, as one string (D-292).
 *
 * Exported and tested, because "a painted coast moves no tree" is a rule and
 * its failure mode is silent — it does not look wrong, it just re-instances a
 * continent of forest per brush cell (R-23b).
 */
export function coverSignature(world: World): string {
  const parts: string[] = [];
  for (const [key, chunk] of world.chunks) parts.push(`${key}=${chunkSignature(chunk)}`);
  return parts.join(';');
}

export function buildCovers(campaign: Campaign): CoverField {
  const world: World = campaign.world;
  const signature = coverSignature(world);
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
     * One pose per clump per cell, shared by every part of that clump: a
     * trunk and the crown above it wander together, and the tree beside them
     * does not. Hashing per *part* would scatter a tree into its pieces;
     * hashing per *cell* — which is what this did first — moved both trees as
     * one and left every cell a copy of the same pair (D-285).
     */
    const clumps = clumpsIn(cover);
    const poses = cells.map(({ gx, gz, top }) => (
      Array.from({ length: clumps }, (_unused, clump) => {
        const salt = clump * CLUMP_STRIDE;
        return {
          x: gx + 0.5 + grainAt(gx, SALT.x + salt, gz) * WANDER,
          z: gz + 0.5 + grainAt(gx, SALT.z + salt, gz) * WANDER,
          y: top,
          yaw: grainAt(gx, SALT.yaw + salt, gz) * Math.PI,
          scale: 1 + grainAt(gx, SALT.scale + salt, gz) * VARY,
          drift: grainAt(gx, SALT.shade + salt, gz),
        };
      })
    ));

    /*
     * Parts that are the same shape, the same size and the same substance
     * share a mesh however many clumps they belong to — the two trunks of a
     * pair of oaks are one `InstancedMesh` with two instances per cell, not
     * two meshes with one each. R-173's rule, applied where it actually bites:
     * a mesh is per *material and geometry*, and everything else an instance
     * carries.
     */
    const kinds = new Map<string, CoverPart[]>();
    for (const part of cover.parts) {
      const key = `${part.shape}|${part.size.join(',')}|${part.swatch}`;
      const kind = kinds.get(key);
      if (kind) kind.push(part); else kinds.set(key, [part]);
    }

    for (const parts of kinds.values()) {
      const sample = parts[0]!;
      const family = familyOf(sample.swatch);
      if (!family) continue;
      const geometry = geometryFor(sample);
      geometries.push(geometry);

      // The family's own surface, exactly as a cube of it would be drawn
      // (R-173) — which is the point: retune Vegetation and every crown on
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

      const base = new Color(colourOf(family, cutIdIn(sample.swatch)));
      const total = poses.length * parts.length;
      const mesh = new InstancedMesh(geometry, surface, Math.max(1, total));
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.count = total;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Nothing raycasts this group, but a cover must not be pickable even by
      // accident: a tool aiming through a wood means the ground under it.
      mesh.raycast = () => {};
      mesh.name = `cover:${cover.id}:${sample.shape}`;

      let index = 0;
      for (const part of parts) {
        const [ox, oy, oz] = part.at;
        for (const perClump of poses) {
          // Clamped rather than trusted: a part naming a clump the cover does
          // not have would otherwise read `undefined` and throw, and the
          // cover it belongs to is data.
          const at = perClump[Math.min(part.clump, perClump.length - 1)]!;
          /*
           * The clump's offset is **not** turned by the yaw. Rotating it
           * would orbit each clump around the cell's centre by its own angle,
           * and two clumps orbiting independently can swing on top of each
           * other. The yaw spins each part about its own axis instead — a
           * crown at thirty degrees against its neighbour's — which is the
           * variety without the collision. Both parts of a clump share this
           * offset, so a crown stays over its trunk either way.
           */
          pose.position.set(
            at.x + ox * at.scale,
            at.y + oy * at.scale,
            at.z + oz * at.scale,
          );
          // The clump's turn and the part's own, which is what splays a
          // palm's fronds without a shape for a frond.
          pose.rotation.set(0, at.yaw + (part.turn ?? 0), 0);
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
          index += 1;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
      meshes.push(mesh);
    }
  }

  return {
    group,
    matches: (next) => coverSignature(next.world) === signature,
    count,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const surface of surfaces) surface.dispose();
      for (const mesh of meshes) mesh.dispose();
    },
  };
}
