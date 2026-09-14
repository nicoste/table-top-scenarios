// Which cell a click meant. No three.js here on purpose.
//
// R-23 exempts `render` from unit tests because you cannot sensibly mock
// three.js. That reason does not cover *this*: deciding that a marker must not
// block the cell it stands on is a rule (R-87c), it needs no GL context, and
// getting it wrong paints the wrong cell — which it did once already (D-163).
// So it lives in its own module and is tested like any other rule.

import type { Campaign, Placement, WorldCell } from '@tt/domain';
import { pawns as pawnsOf } from '@tt/domain';

export interface PickedThings {
  /** The pawn under the pointer, if any. `memberId: null` is the group pawn. */
  readonly pawn: { readonly memberId: string | null } | null;
  readonly placeId: string | null;
  /** What the ray itself found: the ground visible *through* this pixel. */
  readonly rayCell: WorldCell | null;
}

/**
 * The cell a tool should act on.
 *
 * A strict raycast answers "the ground visible through this pixel", which in an
 * angled view is the cell *behind* a marker, because the marker stands above its
 * own ground and the ray passes over it. So clicking a marker would paint its
 * neighbour — technically defensible and useless in practice.
 *
 * A pawn or a marker therefore reports **its own cell**, which is what "the
 * marker does not block the terrain" has to mean. The pawn wins over the marker
 * when both are hit, because it is the thing drawn on top.
 */
export function intendedCell(
  picked: PickedThings,
  campaign: Campaign | null,
  placement: Placement | null,
): WorldCell | null {
  if (picked.pawn && placement && campaign) {
    const found = pawnsOf(placement, campaign.party)
      .find((pawn) => pawn.memberId === picked.pawn?.memberId);
    if (found) return found.cell;
  }
  if (picked.placeId && campaign) {
    const place = campaign.places.find((candidate) => candidate.id === picked.placeId);
    if (place) return place.cell;
  }
  return picked.rayCell;
}
