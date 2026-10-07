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
// Which is exactly why a **shade** is not a split (R-176): it only changes the
// colour, and colour is the thing instances already carry. Dark stone and pale
// stone share a mesh, and three shades of everything cost nothing at all.
//
// Face picking is the reason this exists separately from the world's mesh: the
// world stores a height per cell and never needs to know *which side* was hit,
// while placing a block does (R-147).

import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshStandardMaterial,
  Object3D, Vector3,
} from 'three';
import type { Intersection } from 'three';
import type { BlockCoord, EncounterMap, Material, SwatchId } from '@tt/domain';
import { parseBlockKey, materialIn, cutIdIn, colourOf } from '@tt/domain';
import { grainAt } from '../grain/index.js';
import { figure } from '../patterns/index.js';

/** Where a click on a block face means a new block should go (R-147). */
export interface FacePick {
  /** The block that was actually hit. */
  readonly block: BlockCoord;
  /** The empty cell against the hit face — where a placement lands. */
  readonly adjacent: BlockCoord;
}

/**
 * How one block is drawn under the party's fog (R-45): in sight, as lit;
 * explored, desaturated; hidden, not at all. Named for R-84: "visible" means
 * three other things in this codebase already.
 */
export type FogState = 'inSight' | 'explored' | 'hidden';

export interface BlockBody {
  readonly group: Group;
  /**
   * Draws each block in its fog state, or every block as lit for `null`.
   *
   * **An attribute write, never a rebuild** (R-69): a colour per instance, and
   * for a hidden block an instance scaled to nothing, which also takes it out
   * of picking — a hidden block must not be clickable (R-159's reason). Says
   * whether any block was hidden or shown, because only that changes a shadow.
   */
  setFog(fogOf: ((key: string) => FogState) | null): boolean;
  /** Draws the figure in each material's surface, or does not (R-177). */
  setFigures(on: boolean): void;
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
/** A hidden block's instance: the cube scaled to nothing. */
const NOWHERE = new Matrix4().makeScale(0, 0, 0);
/**
 * Explored is desaturated (R-45): most of the way to its own grey, and
 * dimmed, so a room the party has left reads as remembered beside the one
 * they are looking at, in any material and at any hour.
 */
const GREYED = 0.75;
const DIMMED = 0.55;

export function buildBlockBody(map: EncounterMap, materials: readonly Material[]): BlockBody {
  const group = new Group();
  const geometry = new BoxGeometry(CUBE, CUBE, CUBE);
  const known = new Map(materials.map((m) => [m.id as string, m]));
  const unknown: Material = {
    id: 'material:unknown' as Material['id'],
    name: 'Unknown',
    cuts: [{ id: 'unknown', name: 'Unknown', colour: '#ff00ff' }],
    blocksSight: true,
    grain: 0,
    roughness: 1,
    glow: 0,
    opacity: 1,
    pattern: 'none',
  };

  /*
   * What a swatch resolves to, worked out once per swatch rather than once per
   * cube: a body is thousands of blocks and at most a few dozen swatches, and
   * `shadeColour` is a round trip through HSL.
   */
  const cuts = new Map<string, { material: Material; tint: Color }>();
  const cutOf = (swatch: SwatchId) => {
    let cut = cuts.get(swatch);
    if (!cut) {
      const material = known.get(materialIn(swatch) as string) ?? unknown;
      cut = { material, tint: new Color(colourOf(material, cutIdIn(swatch))) };
      cuts.set(swatch, cut);
    }
    return cut;
  };

  // Grouped first, because a mesh is per material and its size has to be known
  // before it is made. Keyed on the **material**, not the swatch: the shades of
  // one stone differ only in a per-instance colour and share everything else.
  const piles = new Map<string, { material: Material; blocks: BlockCoord[]; tints: Color[] }>();
  for (const [key, swatch] of map.blocks) {
    const at = parseBlockKey(key);
    if (!at) continue;
    const { material, tint } = cutOf(swatch);
    let pile = piles.get(material.id as string);
    if (!pile) {
      pile = { material, blocks: [], tints: [] };
      piles.set(material.id as string, pile);
    }
    pile.blocks.push(at);
    pile.tints.push(tint);
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
  /**
   * What fog needs to redraw a mesh without rebuilding it (R-69): each
   * instance's key, its own colour before any fog, and whether it is hidden.
   */
  const fogged: {
    mesh: InstancedMesh;
    blocks: BlockCoord[];
    keys: string[];
    lit: Float32Array;
    hidden: Uint8Array;
  }[] = [];
  const used: MeshStandardMaterial[] = [];
  const figures: ((on: boolean) => void)[] = [];
  let count = 0;

  for (const { material, blocks, tints } of piles.values()) {
    base.set(material.cuts[0]!.colour);
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
    figures.push(figure(surface, material));

    const mesh = new InstancedMesh(geometry, surface, Math.max(1, blocks.length));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.count = blocks.length;
    const lit = new Float32Array(blocks.length * 3);
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
      // The shade is already in the tint; grain nudges it from there (R-176).
      shade.copy(tints[index] ?? base);
      if (material.grain > 0) {
        shade.getHSL(hsl);
        const drift = grainAt(at.x, at.y, at.z) * material.grain;
        shade.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + drift)));
      }
      mesh.setColorAt(index, shade);
      lit[index * 3] = shade.r;
      lit[index * 3 + 1] = shade.g;
      lit[index * 3 + 2] = shade.b;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    byMesh.set(mesh, blocks);
    fogged.push({
      mesh,
      blocks,
      keys: blocks.map((at) => `${at.x},${at.y},${at.z}`),
      lit,
      hidden: new Uint8Array(blocks.length),
    });
    count += blocks.length;
  }

  return {
    group,
    count,
    setFigures(on) {
      for (const set of figures) set(on);
    },
    setFog(fogOf) {
      let reshaped = false;
      for (const { mesh, blocks, keys, lit, hidden } of fogged) {
        let moved = false;
        for (let index = 0; index < keys.length; index += 1) {
          const state = fogOf ? fogOf(keys[index]!) : 'inSight';
          const hide = state === 'hidden' ? 1 : 0;
          if (hide !== hidden[index]) {
            hidden[index] = hide;
            moved = true;
            if (hide) {
              mesh.setMatrixAt(index, NOWHERE);
            } else {
              const at = blocks[index]!;
              pose.position.set(at.x + 0.5, at.y + 0.5, at.z + 0.5);
              pose.updateMatrix();
              mesh.setMatrixAt(index, pose.matrix);
            }
          }
          const r = lit[index * 3]!;
          const g = lit[index * 3 + 1]!;
          const b = lit[index * 3 + 2]!;
          if (state === 'explored') {
            const grey = 0.299 * r + 0.587 * g + 0.114 * b;
            shade.setRGB(
              (r + (grey - r) * GREYED) * DIMMED,
              (g + (grey - g) * GREYED) * DIMMED,
              (b + (grey - b) * GREYED) * DIMMED,
            );
          } else {
            shade.setRGB(r, g, b);
          }
          mesh.setColorAt(index, shade);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        if (moved) {
          mesh.instanceMatrix.needsUpdate = true;
          reshaped = true;
        }
      }
      return reshaped;
    },
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
