// Where the party is standing. Play state, so it lives in a save and never in
// the campaign (R-8, D-155): a duplicated campaign starts with the party
// unplaced, because the copy has not been played.
//
// Sibling of `discovery/` and shaped the same way — a plain immutable record with
// identity-preserving edits, and its own JSON pair, because a Map does not
// survive JSON.stringify any more than a Set does.

import type { MemberId } from '../ids/index.js';
import type { WorldCell } from '../world/index.js';
import { sameWorldCell } from '../world/index.js';

export interface Placement {
  /** One pawn for the whole party, or one per member (D-153). */
  readonly together: boolean;
  /** Where the group stands. `null` = the party is not on the map yet. */
  readonly at: WorldCell | null;
  /** Per-member cells, used while separated. Absent = fall back to `at`. */
  readonly members: ReadonlyMap<MemberId, WorldCell>;
}

/** A party that has not been placed. Both a new save and a duplicate start here. */
export function emptyPlacement(): Placement {
  return { together: true, at: null, members: new Map() };
}

export function isPartyPlaced(placement: Placement): boolean {
  return placement.at !== null || placement.members.size > 0;
}

/**
 * Where one member's pawn stands.
 *
 * The fallback is `at` rather than "the first member's cell", so a member added
 * while the party is separated appears where the party was when it split, and
 * does not silently follow member one around.
 */
export function memberCell(placement: Placement, id: MemberId): WorldCell | null {
  if (placement.together) return placement.at;
  return placement.members.get(id) ?? placement.at;
}

/** What to draw: one entry per pawn, in roster order. */
export function pawns(
  placement: Placement,
  roster: readonly { readonly id: MemberId }[],
): readonly { readonly memberId: MemberId | null; readonly cell: WorldCell }[] {
  if (placement.together) {
    return placement.at ? [{ memberId: null, cell: placement.at }] : [];
  }
  const out: { memberId: MemberId | null; cell: WorldCell }[] = [];
  for (const member of roster) {
    const cell = memberCell(placement, member.id);
    if (cell) out.push({ memberId: member.id, cell });
  }
  return out;
}

export function withGroupAt(placement: Placement, cell: WorldCell): Placement {
  if (placement.at && sameWorldCell(placement.at, cell)) return placement;
  return { ...placement, at: cell };
}

export function withMemberAt(placement: Placement, id: MemberId, cell: WorldCell): Placement {
  const current = placement.members.get(id);
  if (current && sameWorldCell(current, cell)) return placement;
  const members = new Map(placement.members);
  members.set(id, cell);
  return { ...placement, members };
}

/**
 * Everyone back to one pawn, at the **first roster member's cell** (D-153).
 *
 * Per-member cells are cleared rather than remembered: scattering again starts
 * everyone on the group cell, which is what was asked for, and keeping them
 * would make "separate" mean two different things depending on history.
 */
export function gathered(
  placement: Placement,
  roster: readonly { readonly id: MemberId }[],
): Placement {
  const first = roster[0];
  const at = (first && memberCell(placement, first.id)) ?? placement.at;
  return { together: true, at, members: new Map() };
}

/** One pawn each, all starting on the group cell for the GM to drag apart. */
export function scattered(
  placement: Placement,
  roster: readonly { readonly id: MemberId }[],
): Placement {
  const members = new Map<MemberId, WorldCell>();
  if (placement.at) for (const member of roster) members.set(member.id, placement.at);
  return { together: false, at: placement.at, members };
}

/**
 * Drops positions for members who are no longer on the roster.
 *
 * Same tolerance and same moment as `pruneDiscovery`: a stale entry is not an
 * error, but opening the campaign is a good time to stop carrying it.
 */
export function prunePlacement(
  placement: Placement,
  liveMemberIds: ReadonlySet<MemberId>,
): Placement {
  const keep = [...placement.members].filter(([id]) => liveMemberIds.has(id));
  if (keep.length === placement.members.size) return placement;
  return { ...placement, members: new Map(keep) };
}

export interface PlacementJSON {
  together: boolean;
  at: WorldCell | null;
  members: Record<string, WorldCell>;
}

export function placementToJSON(placement: Placement): PlacementJSON {
  const members: Record<string, WorldCell> = {};
  for (const id of [...placement.members.keys()].sort()) {
    members[id] = placement.members.get(id)!;
  }
  return { together: placement.together, at: placement.at, members };
}

export function placementFromJSON(json: Partial<PlacementJSON> | undefined): Placement {
  if (!json) return emptyPlacement();
  return {
    together: json.together ?? true,
    at: json.at ?? null,
    members: new Map(Object.entries(json.members ?? {}) as [MemberId, WorldCell][]),
  };
}
