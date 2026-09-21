// What a click means, per tool (R-87c).
//
// This was policy buried in a pointer handler in `apps/gm`, which R-23 exempts
// from tests — so the matrix the GM specified had no test at all, and the bug it
// was written to fix (selecting a place while painting) could come back unnoticed.
// It is a decision table, not three.js, so it lives here and is tested.
//
// `render` reports what is under the pointer and this decides what it meant.
// Neither of them may assume the other's precedence.

import type { MapTool, Tool } from '../store/index.js';
import type { BlockCoord, LevelRange } from '@tt/domain';
import { inRange } from '@tt/domain';
import type { FacePick } from '@tt/render';

export interface Cell { readonly cx: number; readonly cz: number; readonly x: number; readonly z: number }
export interface Slot { readonly cx: number; readonly cz: number }

export interface Pointed {
  readonly pawn: { readonly memberId: string | null } | null;
  readonly placeId: string | null;
  readonly cell: Cell | null;
  readonly slot: Slot | null;
}

export type ClickAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'createChunk'; readonly slot: Slot }
  | { readonly kind: 'selectPlace'; readonly placeId: string }
  | { readonly kind: 'selectChunk'; readonly coord: Slot }
  | { readonly kind: 'pickPawn'; readonly pawn: { readonly memberId: string | null } }
  | { readonly kind: 'placePoi'; readonly cell: Cell }
  | { readonly kind: 'paint'; readonly cell: Cell }
  | { readonly kind: 'raise'; readonly cell: Cell };

const nothing: ClickAction = { kind: 'nothing' };

export interface Context {
  /** Does this cell already hold a place? One per cell (R-119). */
  readonly occupied: (cell: Cell) => boolean;
}

/**
 * Does this tool hold a selection?
 *
 * Only the neutral tool does. An inspector left open under Paint describes
 * something the tool cannot act on, and its buttons edit a thing the GM has
 * mentally moved on from (D-168).
 *
 * Deliberately **not** "clear on every tool change": placing a place switches to
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
      if (pointed.placeId) return { kind: 'selectPlace', placeId: pointed.placeId };
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
  | { readonly kind: 'selectPlace'; readonly placeId: string }
  | { readonly kind: 'clearSelection' };

/**
 * The table display's policy (D-174).
 *
 * A travel in progress owns the click completely — *"you tap on the player
 * token, then selecting a place should keep going with the travel flow, not
 * select the place"*. So aiming short-circuits before anything else is
 * considered, and a place under the pointer contributes its cell rather than
 * itself (`intendedCell`, D-163).
 *
 * Otherwise: a pawn starts a move, a place is selected, and bare ground clears
 * the selection. There is no chunk to inspect here and no tool to return to, so
 * clicking nothing is the way out.
 */
export function tableAction(pointed: Pointed, aiming: boolean): TableAction {
  if (aiming) return { kind: 'travel' };
  if (pointed.pawn) return { kind: 'pickPawn', pawn: pointed.pawn };
  if (pointed.placeId) return { kind: 'selectPlace', placeId: pointed.placeId };
  return { kind: 'clearSelection' };
}

/** What a click means inside an encounter map (D-181). */
export type MapAction =
  | { readonly kind: 'nothing' }
  | { readonly kind: 'place'; readonly at: BlockCoord }
  | { readonly kind: 'erase'; readonly at: BlockCoord }
  | { readonly kind: 'paint'; readonly at: BlockCoord }
  | { readonly kind: 'fill'; readonly at: BlockCoord };

/**
 * Face adjacency, and it is the whole of R-147 in four lines.
 *
 * Build acts on the cell **against** the face — click the top of a block and the
 * new one lands on top of it. Erase acts on the block that was **hit**. Reading
 * one from the other is the bug this function exists to prevent: they differ by
 * exactly one step along the face normal, so a single wrong field digs a hole
 * where a wall should go.
 */
export function mapAction(tool: MapTool, face: FacePick | null): MapAction {
  if (!face) return { kind: 'nothing' };
  // Build is the only tool that acts on the *empty* cell. The other three act on
  // the block you can see, which is the one under the pointer.
  switch (tool) {
    case 'build': return { kind: 'place', at: face.adjacent };
    case 'erase': return { kind: 'erase', at: face.block };
    case 'paint': return { kind: 'paint', at: face.block };
    case 'fill': return { kind: 'fill', at: face.block };
  }
}

/**
 * May a drag of this tool keep acting, or is one click one action (R-153)?
 *
 * The test is not "is it destructive" but **does the gesture move its own
 * target**. Build and erase change the geometry, so the face under a stationary
 * pointer is a different face a moment later: a build drag climbs its own
 * cubes, an erase drag eats into what it exposes. Paint changes only a
 * material, so the block under the pointer stays exactly where it was — which
 * is what makes dragging a brush safe here and is the same reason the world's
 * terrain brush drags (R-140b).
 *
 * Fill is excluded for a different reason: it is already a bulk action. One
 * click can repaint a wing of a building, and dragging one would fire another
 * whole region per cell entered.
 */
export function mapDrags(tool: MapTool): boolean {
  return tool === 'paint';
}

/**
 * What the console knows about the cell a tool is aimed at (R-159).
 *
 * `levelling` is the GM's own toggle: when it is on they are shown only the
 * band, exactly as the table is, and the blocks outside it are absent from the
 * scene rather than dimmed — so they cannot be clicked, which is half the
 * safety. The other half is here.
 */
export interface MapAim {
  readonly levelling: boolean;
  readonly range: LevelRange;
  /** Is there a block at the cell the tool picked? */
  readonly occupied: boolean;
  /**
   * Is that cell inside the map's footprint at all?
   *
   * Clicking the outward side face of an edge block aims at a cell the map does
   * not own — the host has always refused it, and saying so in the readout
   * spares the GM a toast for a gesture that was never going to work.
   */
  readonly inBounds: boolean;
}

/** Whether a click may proceed, and if not, what to tell the GM (R-18). */
export type MapVerdict =
  | { readonly kind: 'go' }
  | { readonly kind: 'stop'; readonly why: string };

/**
 * Whether the aimed-at cell is one this tool may act on.
 *
 * Two refusals, and both exist because hiding levels makes the screen stop
 * telling the whole truth:
 *
 * - **Building into an occupied cell.** With everything drawn this could not
 *   happen: a face you can see has air in front of it. With the band shown
 *   alone, a ray passes through what is hidden and lands on the far side, so
 *   the cell "in front" of the face may hold a block a level down. The host
 *   refuses it too — this is so the GM reads why *before* clicking.
 * - **Building outside the band.** The block would be placed and then vanish,
 *   because the GM is not being shown that level. Refusing beats a cube that
 *   blinks out of existence.
 *
 * And one that has nothing to do with levelling: a cell **outside the
 * footprint**, which is what the outward face of an edge block aims at.
 *
 * Erase, paint and fill need no band check: they act on a block that was
 * picked, and only visible blocks can be picked.
 */
export function mapAllowed(action: MapAction, aim: MapAim): MapVerdict {
  if (action.kind === 'nothing') return { kind: 'stop', why: '' };

  if (!aim.inBounds) return { kind: 'stop', why: 'outside the map' };

  if (action.kind === 'place') {
    if (aim.occupied) return { kind: 'stop', why: 'a block is already there' };
    if (aim.levelling && !inRange(aim.range, action.at.y)) {
      return { kind: 'stop', why: 'outside the levels you are showing' };
    }
    return { kind: 'go' };
  }

  if (!aim.occupied) return { kind: 'stop', why: 'nothing there' };
  return { kind: 'go' };
}

export interface MapHover {
  /** What the readout says, or `null` when the pointer is over nothing. */
  readonly label: string | null;
  /** The cube to outline, or `null` for none (R-153). */
  readonly ghost: BlockCoord | null;
}

/**
 * What the GM is told is about to happen — in words and as an outline.
 *
 * Both derived from the one `MapAction`, so the cube that lights up is by
 * construction the cube the click edits. Computing the outline from the face
 * and the readout from the action would be two chances to get the
 * off-by-one-along-the-normal wrong (R-147), and only one of them would look
 * wrong on screen.
 */
const VERBS: Record<Exclude<MapAction['kind'], 'nothing'>, string> = {
  place: 'Build at',
  erase: 'Erase',
  paint: 'Paint',
  fill: 'Fill from',
};

/** What a fill is about to touch, and how much of it the GM cannot see. */
export interface FillReach {
  readonly total: number;
  /** Of those, how many sit on levels the GM is not being shown (R-159). */
  readonly unseen: number;
}

export function mapHover(
  action: MapAction,
  reach?: FillReach,
  verdict?: MapVerdict,
): MapHover {
  if (action.kind === 'nothing') return { label: null, ghost: null };
  const { x, y, z } = action.at;
  const where = `${VERBS[action.kind]} ${x},${y},${z}`;

  // A refusal reads *instead* of the action, because the action is not going to
  // happen and saying both would be telling the GM two things at once.
  if (verdict?.kind === 'stop' && verdict.why) {
    return { label: `${where} — ${verdict.why}`, ghost: action.at };
  }

  // A fill says how much it is about to repaint, because one click can reach a
  // long way and the outline can only mark where it starts (R-154). With levels
  // hidden it also says how much of that reach is out of sight, since a fill
  // follows connected material straight through a cut.
  if (action.kind === 'fill' && reach) {
    const unseen = reach.unseen > 0 ? `, ${reach.unseen} unseen` : '';
    return {
      label: `${where} — ${reach.total} block${reach.total === 1 ? '' : 's'}${unseen}`,
      ghost: action.at,
    };
  }
  return { label: where, ghost: action.at };
}
