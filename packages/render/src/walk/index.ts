// The walk a token being moved would take inside a map (R-209): a square on
// each floor between the token and its ghost, and over the ghost, how far.
//
// The world route's squares (R-197, D-297), one surface down and for the same
// reason: a square per floor interpolates nothing, so a stair reads as a stair
// and a diagonal as two floors touching at a corner. The number is a bare
// number (D-316) — what it counts in is the table's business, as with sight.

import { BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { BlockCoord } from '@tt/domain';
import { routePatches, ROUTE_LIFT } from '../route/index.js';
import { caption, dropCaption } from '../captions/index.js';
import { STANDEE_HEIGHT } from '../standee/index.js';

/** A walk as the stage is handed it: where it ends, the floors on the way, and what to say. */
export interface WalkDrawn {
  readonly to: BlockCoord;
  /** From the token to the target, both included; empty when there is no path. */
  readonly cubes: readonly BlockCoord[];
  /** The length, or "no path". Said over the ghost. */
  readonly label: string;
}

export interface WalkPreview {
  readonly group: Group;
  /**
   * Draws a walk in the mover's colour, or clears it. Called when the aim
   * changes cube, not on every pointer move, so rebuilding a handful of
   * squares each time costs nothing.
   */
  show(walk: WalkDrawn | null, colour?: string): void;
  dispose(): void;
}

export function buildWalkPreview(): WalkPreview {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.72,
    // Over the floors it crosses and through the walls in front of them, as
    // the world route is drawn over the hills (R-197): a path hidden behind a
    // wall is the one the GM most needs to see.
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(new BufferGeometry(), material);
  // Under the ghost and the highlight, which say what a click will do.
  mesh.renderOrder = 4;
  const label = caption('');
  group.add(mesh, label);
  group.visible = false;

  return {
    group,
    show(walk, colour) {
      mesh.geometry.dispose();
      if (!walk) {
        mesh.geometry = new BufferGeometry();
        group.visible = false;
        return;
      }
      /*
       * Both ends are dropped, as on the world: the token stands on the first
       * floor and the ghost on the last, so a square under either says the
       * same thing twice.
       */
      mesh.geometry = routePatches(walk.cubes.slice(1, -1).map((at) =>
        new Vector3(at.x + 0.5, at.y + ROUTE_LIFT, at.z + 0.5)));
      material.color.set(colour ?? '#ffffff');
      // At the top of the ghost's card, where a token's name would sit.
      label.position.set(walk.to.x + 0.5, walk.to.y + STANDEE_HEIGHT, walk.to.z + 0.5);
      (label.element.firstChild as HTMLElement).textContent = walk.label;
      group.visible = true;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      dropCaption(label);
    },
  };
}
