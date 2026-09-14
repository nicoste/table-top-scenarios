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
 * Does this tool hold a selection?
 *
 * Only the neutral tool does. An inspector left open under Paint describes
 * something the tool cannot act on, and its buttons edit a thing the GM has
 * mentally moved on from (D-168).
 *
 * Deliberately **not** "clear on every tool change": placing a POI switches to
 * `select` and pre-selects the new one (D-127), and that must survive. The rule
 * is about which tool owns a selection, not about the transition.
 */
export function holdsSelection(tool: Tool): boolean {
  return tool === 'select';
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

/** What a click means on the table display, which has no tools (R-134). */
export type TableAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'travel' }
  | { readonly kind: 'pickPawn'; readonly pawn: { readonly memberId: string | null } }
  | { readonly kind: 'selectPoi'; readonly poiId: string }
  | { readonly kind: 'clearSelection' };

/**
 * The table display's policy (D-174).
 *
 * A travel in progress owns the click completely — *"you tap on the player
 * token, then selecting a place should keep going with the travel flow, not
 * select the place"*. So aiming short-circuits before anything else is
 * considered, and a POI under the pointer contributes its cell rather than
 * itself (`intendedCell`, D-163).
 *
 * Otherwise: a pawn starts a move, a place is selected, and bare ground clears
 * the selection. There is no chunk to inspect here and no tool to return to, so
 * clicking nothing is the way out.
 */
export function tableAction(pointed: Pointed, aiming: boolean): TableAction {
  if (aiming) return { kind: 'travel' };
  if (pointed.pawn) return { kind: 'pickPawn', pawn: pointed.pawn };
  if (pointed.poiId) return { kind: 'selectPoi', poiId: pointed.poiId };
  return { kind: 'clearSelection' };
}
