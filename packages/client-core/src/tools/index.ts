// What a click means, per tool (R-87c).
//
// This was policy buried in a pointer handler in `apps/gm`, which R-23 exempts
// from tests — so the matrix the GM specified had no test at all, and the bug it
// was written to fix (selecting a POI while painting) could come back unnoticed.
// It is a decision table, not three.js, so it lives here and is tested.
//
// `render` reports what is under the pointer and this decides what it meant.
// Neither of them may assume the other's precedence.

import type { Tool } from '../store/index.js';

export interface Cell { readonly cx: number; readonly cz: number; readonly x: number; readonly z: number }
export interface Slot { readonly cx: number; readonly cz: number }

export interface Pointed {
  readonly pawn: { readonly memberId: string | null } | null;
  readonly poiId: string | null;
  readonly cell: Cell | null;
  readonly slot: Slot | null;
}

export type ClickAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'createChunk'; readonly slot: Slot }
  | { readonly kind: 'selectPoi'; readonly poiId: string }
  | { readonly kind: 'selectChunk'; readonly coord: Slot }
  | { readonly kind: 'pickPawn'; readonly pawn: { readonly memberId: string | null } }
  | { readonly kind: 'placePoi'; readonly cell: Cell }
  | { readonly kind: 'paint'; readonly cell: Cell }
  | { readonly kind: 'raise'; readonly cell: Cell };

const nothing: ClickAction = { kind: 'nothing' };

export interface Context {
  /** Does this cell already hold a POI? One per cell (R-119). */
  readonly occupied: (cell: Cell) => boolean;
}

/**
 * The decision table from R-87c.
 *
 * Every tool creates a chunk from an empty slot: the `+` affordance is how the
 * world grows (R-79), not a mode. Everything else is the tool's business, and
 * anything a tool does not name here it ignores — which is why a paint stroke
 * over a marker or a pawn paints the ground rather than selecting the place.
 */
export function clickAction(tool: Tool, pointed: Pointed, context: Context): ClickAction {
  if (pointed.slot) return { kind: 'createChunk', slot: pointed.slot };

  switch (tool) {
    case 'travel':
      // Pawns only. A cell matters during the aim step, which the sequence owns.
      return pointed.pawn ? { kind: 'pickPawn', pawn: pointed.pawn } : nothing;

    case 'select':
      if (pointed.poiId) return { kind: 'selectPoi', poiId: pointed.poiId };
      // Bare ground selects its chunk, the only route to the Known toggle.
      return pointed.cell
        ? { kind: 'selectChunk', coord: { cx: pointed.cell.cx, cz: pointed.cell.cz } }
        : nothing;

    case 'places':
      if (!pointed.cell) return nothing;
      // Dropped rather than dispatched: obeying R-119 is not a mistake and does
      // not deserve a rejection toast. The hover readout says so beforehand.
      return context.occupied(pointed.cell) ? nothing : { kind: 'placePoi', cell: pointed.cell };

    case 'paint':
      return pointed.cell ? { kind: 'paint', cell: pointed.cell } : nothing;

    case 'height':
      return pointed.cell ? { kind: 'raise', cell: pointed.cell } : nothing;

    default:
      return nothing;
  }
}
