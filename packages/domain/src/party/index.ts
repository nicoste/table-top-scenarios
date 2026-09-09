// Party members are campaign-level *definitions* (R-91). The GM edits the roster
// once; members are instanced onto encounter maps on arrival.

import type { MemberId } from '../ids/index.js';
import { freshId } from '../ids/index.js';

/** Default sight radius in cells: 60 ft at a 5 ft cell (R-46a). */
export const DEFAULT_VISION_RANGE = 12;

export interface PartyMember {
  readonly id: MemberId;
  readonly name: string;
  /** Rendered as a chess pawn in this colour (D-083). */
  readonly colour: string;
  readonly visionRange: number;
}

const PAWN_COLOURS = ['#57d9a3', '#4db8ff', '#ffc857', '#ff6b6b', '#b58cff', '#ff9f43'] as const;

export function nextPawnColour(existing: readonly PartyMember[]): string {
  const used = new Set(existing.map((m) => m.colour));
  return PAWN_COLOURS.find((c) => !used.has(c)) ?? PAWN_COLOURS[0];
}

export function createMember(existing: readonly PartyMember[], name?: string): PartyMember {
  return {
    id: freshId<'MemberId'>('member'),
    name: name?.trim() || `player ${existing.length + 1}`,
    colour: nextPawnColour(existing),
    visionRange: DEFAULT_VISION_RANGE,
  };
}

/** A new campaign starts with exactly one member named "player" (R-92). */
export function startingParty(): readonly PartyMember[] {
  return [
    {
      id: freshId<'MemberId'>('member'),
      name: 'player',
      colour: PAWN_COLOURS[0],
      visionRange: DEFAULT_VISION_RANGE,
    },
  ];
}

export function editMember(
  party: readonly PartyMember[],
  id: MemberId,
  patch: Partial<Omit<PartyMember, 'id'>>,
): readonly PartyMember[] {
  return party.map((m) => {
    if (m.id !== id) return m;
    const visionRange = patch.visionRange === undefined
      ? m.visionRange
      : Math.max(0, Math.round(patch.visionRange));
    const name = patch.name === undefined ? m.name : (patch.name.trim() || m.name);
    return { ...m, ...patch, name, visionRange };
  });
}

/** The roster may not be emptied — a party of nobody has no world position. */
export function removeMember(party: readonly PartyMember[], id: MemberId): readonly PartyMember[] {
  if (party.length <= 1) return party;
  return party.filter((m) => m.id !== id);
}
