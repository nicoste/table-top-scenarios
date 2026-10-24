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
import type { Pictures } from '../standee/index.js';
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
   * Whether these pawns still draw this campaign and placement exactly — the
   * same members, names, colours, pictures, cells and ground under them — and
   * if so, takes the campaign on for aiming and keeps itself (D-366). Every
   * accepted intent sends a fresh campaign and placement; rebuilding on each
   * tore the names out of the page and put them back, a blink at every paint
   * stroke, as the place markers once did (D-290).
   */
  reuse(campaign: Campaign, placement: Placement, pictures: Pictures | undefined): boolean;
  /**
   * Puts the ghost on a cell, or takes it off the board.
   *
   * Called on every pointer move during the aim step, so it repositions one
   * existing group and never rebuilds anything.
   */
  aimAt(cell: WorldCell | null): void;
  dispose(): void;
}

const centre = (cell: WorldCell) => ({
  x: cell.cx * CHUNK_SIZE + cell.x + 0.5,
  z: cell.cz * CHUNK_SIZE + cell.z + 0.5,
});

/**
 * Everything a set of pawns is drawn from, as one string (D-366): who stands
 * where, as whom — name, colour, picture — and how high the ground is under
 * each. The party together is one pawn made of everyone's faces.
 */
export function pawnSignature(campaign: Campaign, placement: Placement): string {
  const byId = new Map<string, PartyMember>(campaign.party.map((m) => [m.id, m]));
  const everyone = campaign.party.map((m) => `${m.colour}/${m.image ?? ''}`).join(',');
  return pawnsOf(placement, campaign.party).map((pawn) => {
    const member = pawn.memberId ? byId.get(pawn.memberId) ?? null : null;
    const who = member ? `${member.id}/${member.name}/${member.colour}/${member.image ?? ''}` : `party/${everyone}`;
    const { cx, cz, x, z } = pawn.cell;
    return `${who}@${cx},${cz},${x},${z}:${surfaceAt(campaign, pawn.cell)}`;
  }).join('|');
}

export function buildPartyPawns(
  campaign: Campaign,
  placement: Placement,
  pictures?: Pictures,
): PartyPawns {
  const signature = pawnSignature(campaign, placement);
  /** The campaign aiming reads the ground from: the latest one these pawns were kept for. */
  let ground = campaign;
  const group = new Group();
  const owners = new Map<object, PawnRef>();
  const proxies: Mesh[] = [];
  const turning: Group[] = [];
  const captions: CSS2DObject[] = [];
  const shop = standees(pictures);

  const byId = new Map<string, PartyMember>(campaign.party.map((m) => [m.id, m]));

  /**
   * One pawn on a cell: a member alone, with their card and name, or the
   * party together, whose card is a **mosaic** of everyone's faces (D-314).
   * It was a blank grey card, which said a token was there and nothing about
   * who (O-022).
   */
  function addPawn(cell: WorldCell, ref: PawnRef, member: PartyMember | null): void {
    const { x, z } = centre(cell);
    const y = surfaceAt(campaign, cell);
    const { root, turner, proxy } = member
      ? shop.make(member.colour, member.image)
      : shop.makeMosaic(campaign.party.map((one) => ({ colour: one.colour, picture: one.image })));
    const name = member ? member.name : null;
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
    addPawn(pawn.cell, { memberId: pawn.memberId }, pawn.memberId ? byId.get(pawn.memberId) ?? null : null);
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
    reuse(next, nextPlacement, nextPictures) {
      if (nextPictures !== pictures || pawnSignature(next, nextPlacement) !== signature) return false;
      ground = next;
      return true;
    },
    turnTo(yaw) {
      for (const turner of turning) turner.rotation.y = yaw;
    },
    aimAt(cell) {
      if (!cell) {
        ghost.visible = false;
        return;
      }
      const { x, z } = centre(cell);
      ghost.position.set(x, surfaceAt(ground, cell), z);
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
