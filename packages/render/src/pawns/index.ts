// The party on the world map: a standee per member in that member's colour
// (D-083, D-303), plus the translucent ghost that shows where a move would
// land (R-132).
//
// These were chess pawns, and a map's tokens were card holders — the same six
// people in two shapes, which R-90 says not to do. What one looks like now
// lives in `../standee`; what is here is everything about *the world*: which
// cell a member stands on, the surface height under them, and the captions
// that only appear when the party has split.
//
// Same zoom threshold as a place marker (R-83); it differs in moving, and in
// being pickable on both screens.

import { Group } from 'three';
import type { Mesh } from 'three';
import type { Campaign, PartyMember, Placement, WorldCell } from '@tt/domain';
import { CHUNK_SIZE, pawns as pawnsOf } from '@tt/domain';
import { surfaceAt } from '../world/index.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { caption, dropCaption } from '../captions/index.js';
import { STANDEE_HEIGHT, standees } from '../standee/index.js';

/** Which pawn was picked: a member, or the whole party travelling together. */
export interface PawnRef {
  /** null = the group pawn, i.e. the party is together (D-153). */
  readonly memberId: string | null;
}

export interface PartyPawns {
  readonly group: Group;
  /**
   * What a ray should be tested against: one invisible upright volume per
   * pawn, as a map's tokens have (R-36a). The card turns with the camera, so
   * testing the drawn shape would make a pick depend on which way the last
   * frame left it.
   */
  readonly proxies: readonly Mesh[];
  pawnAt(object: object): PawnRef | null;
  /**
   * Turns every card about the vertical to the camera's bearing (R-187). The
   * bases stay square to the grid.
   */
  turnTo(yaw: number): void;
  /**
   * Puts the ghost on a cell, or takes it off the board.
   *
   * Called on every pointer move during the aim step, so it repositions one
   * existing group and never rebuilds anything.
   */
  aimAt(cell: WorldCell | null): void;
  dispose(): void;
}

/**
 * The colour of the pawn the whole party shares (O-022).
 *
 * Neutral on purpose: it is not any one member, and borrowing somebody's
 * colour would say it was.
 */
const TOGETHER = '#e6e9ef';

const centre = (cell: WorldCell) => ({
  x: cell.cx * CHUNK_SIZE + cell.x + 0.5,
  z: cell.cz * CHUNK_SIZE + cell.z + 0.5,
});

export function buildPartyPawns(campaign: Campaign, placement: Placement): PartyPawns {
  const group = new Group();
  const owners = new Map<object, PawnRef>();
  const proxies: Mesh[] = [];
  const turning: Group[] = [];
  const captions: CSS2DObject[] = [];
  const shop = standees();

  const byId = new Map<string, PartyMember>(campaign.party.map((m) => [m.id, m]));

  function addPawn(cell: WorldCell, ref: PawnRef, hex: string, name: string | null): void {
    const { x, z } = centre(cell);
    const y = surfaceAt(campaign, cell);
    const { root, turner, proxy } = shop.make(hex);
    root.position.set(x, y, z);
    proxy.position.set(x, y, z);
    turning.push(turner);
    owners.set(proxy, ref);
    proxies.push(proxy);

    // Only the separated pawns are named. One pawn needs no caption, and six
    // captions on a 1350 km map is soup (O-021).
    if (name) {
      // At the card's top edge; the gap above it is the caption's padding, in
      // pixels, at every zoom (R-196).
      const label = caption(name);
      label.position.set(0, STANDEE_HEIGHT, 0);
      root.add(label);
      captions.push(label);
    }

    group.add(root, proxy);
  }

  for (const pawn of pawnsOf(placement, campaign.party)) {
    const member = pawn.memberId ? byId.get(pawn.memberId) : null;
    addPawn(
      pawn.cell,
      { memberId: pawn.memberId },
      member?.colour ?? TOGETHER,
      member ? member.name : null,
    );
  }

  // The ghost is built once and parked out of sight, because aiming moves the
  // pointer many times a second.
  const { root: ghost, turner: ghostTurner } = shop.ghost();
  ghost.visible = false;
  turning.push(ghostTurner);
  group.add(ghost);

  return {
    group,
    proxies,
    pawnAt: (object) => owners.get(object) ?? null,
    turnTo(yaw) {
      for (const turner of turning) turner.rotation.y = yaw;
    },
    aimAt(cell) {
      if (!cell) {
        ghost.visible = false;
        return;
      }
      const { x, z } = centre(cell);
      ghost.position.set(x, surfaceAt(campaign, cell), z);
      ghost.visible = true;
    },
    dispose() {
      shop.dispose();
      // The pawns are rebuilt whenever the party moves, so this leaks faster
      // than the places do if it is left out (D-289).
      for (const label of captions) dropCaption(label);
    },
  };
}
