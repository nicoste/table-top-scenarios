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
import type { BlockCoord, Brush, LevelRange, StairFacing } from '@tt/domain';
import { brushPatch, facingWithBack, inRange } from '@tt/domain';
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
  | { readonly kind: 'pickPlace'; readonly placeId: string }
  | { readonly kind: 'paint'; readonly cell: Cell }
  | { readonly kind: 'cover'; readonly cell: Cell }
  | { readonly kind: 'raise'; readonly cell: Cell };

const nothing: ClickAction = { kind: 'nothing' };

export interface Context {
  /** The place on this cell, if there is one. One per cell (R-119). */
  readonly placeAt: (cell: Cell) => string | null;
}

/**
 * The parts of the console a tool brings with it (R-207): its brush, its
 * swatches, its library — shown while that tool is in hand, and never under
 * another.
 *
 * **Listed, not excluded.** The Material card was written as "everything
 * but Move", so the first tool added after it — Spawn — got a material
 * picker it had no use for. Each tool now names what it shows, a tool that
 * names nothing shows nothing, and `Record` makes the compiler ask about
 * every new tool.
 */
export type ToolPart =
  | 'brush' | 'ground' | 'cover' | 'markers' | 'travel'
  | 'material' | 'library' | 'prefabs' | 'props' | 'measure';

const WORLD_PARTS: Record<Tool, readonly ToolPart[]> = {
  select: [],
  travel: ['travel'],
  places: ['markers'],
  height: ['brush'],
  paint: ['brush', 'ground'],
  cover: ['brush', 'cover'],
};

const MAP_PARTS: Record<MapTool, readonly ToolPart[]> = {
  build: ['brush', 'material'],
  paint: ['brush', 'material'],
  move: [],
  spawn: ['library'],
  prefabs: ['prefabs'],
  props: ['props'],
  measure: ['measure'],
};

/** Whether this world tool brings this part with it (R-207). */
export function worldToolShows(tool: Tool, part: ToolPart): boolean {
  return WORLD_PARTS[tool].includes(part);
}

/** Whether this map tool brings this part with it (R-207). */
export function mapToolShows(tool: MapTool, part: ToolPart): boolean {
  return MAP_PARTS[tool].includes(part);
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

    case 'places': {
      /*
       * A place under the pointer is **picked up** (R-203): its marker, its
       * name, or the cell it stands on. This click used to do nothing at all
       * — R-119 refused a second place there and nothing else was asked of
       * it — so the gesture was free. Inspecting is the Select tool's, and
       * stays there (D-168).
       */
      const here = pointed.placeId ?? (pointed.cell ? context.placeAt(pointed.cell) : null);
      if (here) return { kind: 'pickPlace', placeId: here };
      return pointed.cell ? { kind: 'placePoi', cell: pointed.cell } : nothing;
    }

    case 'paint':
      return pointed.cell ? { kind: 'paint', cell: pointed.cell } : nothing;

    // The second axis, and the same gesture: covers are not pickable, so a
    // click through a wood aims at the ground under it (R-193).
    case 'cover':
      return pointed.cell ? { kind: 'cover', cell: pointed.cell } : nothing;

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

/**
 * What a click means inside an encounter map (D-181, R-162).
 *
 * `at` is where the gesture is aimed — the cube the readout names and the one
 * the refusals are about. `cells` is everything the click actually edits: the
 * brush's patch, already clipped to the levels the GM is being shown. They are
 * the same single cell at the narrowest brush.
 *
 * Both are here, on one value, because the outline and the edit are drawn from
 * it: the cubes that light up are by construction the cubes the click changes.
 */
export type MapAction =
  | { readonly kind: 'nothing' }
  /** `under` is the dig modifier: the cell below the cube, not against its face. */
  | {
    readonly kind: 'place';
    readonly at: BlockCoord;
    readonly cells: readonly BlockCoord[];
    readonly under: boolean;
    /** With the Stairs brush: which way they climb (D-349). */
    readonly stairs?: StairFacing;
  }
  | { readonly kind: 'erase'; readonly at: BlockCoord; readonly cells: readonly BlockCoord[] }
  | { readonly kind: 'paint'; readonly at: BlockCoord; readonly cells: readonly BlockCoord[] }
  /** A fill takes no brush: it already reaches as far as the material goes. */
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
/**
 * Which cell a tool is aimed at.
 *
 * `under` is the **dig modifier** (R-160), held on Alt/Option. It changes build
 * alone, and it changes it from *against the face* to *below the cube* — which
 * is the one placement a god camera cannot otherwise express. The camera sits
 * between 30 and 75 degrees above the horizon and cube faces are single-sided,
 * so a downward normal never comes back from a raycast: `face.adjacent` is
 * mathematically incapable of being below the block. The modifier reaches the
 * cell the geometry cannot point at (D-203).
 *
 * "It cares about the cube, not the face" — the GM's words, and the reason it
 * reads off `face.block` rather than adjusting `face.adjacent` by the normal.
 * Pointing at any side of a cube digs under *that cube*.
 */
export interface MapReach {
  /** The shape the brush lays down (R-164). */
  readonly brush: Brush;
  /** Alt/Option — build *under* the cube rather than against its face (R-160). */
  readonly alt: boolean;
  /** Shift — the tool's other mode: erase under Build, fill under Paint. */
  readonly shift: boolean;
  /**
   * The levels a brush may touch, or `null` for all of them.
   *
   * The GM's band while they are levelling. A flat patch is all on one level
   * and is admitted or refused whole; a column spans two or three, so it is
   * **clipped** — it lays down what is inside the band and stops at the cut,
   * the same way it stops at the edge of the map (R-164).
   *
   * Either way an *empty* patch still means one thing, which is what
   * `mapAllowed` reads: the cube being aimed at is outside the band. A column
   * grows away from the surface it was aimed at, so it can never reach back
   * into the band from outside it.
   */
  readonly within: LevelRange | null;
  /** Which way stairs climb when nothing says otherwise — turned with Z / X (D-349). */
  readonly stairFacing?: StairFacing;
}

/**
 * Which way stairs laid against this face climb (D-349): set against the
 * side of a block, they climb toward it — their high side to the wall, as a
 * torch hangs from one; on a floor, the hand's own turn.
 */
export function stairsFacing(face: FacePick, hand: StairFacing): StairFacing {
  if (face.adjacent.y !== face.block.y) return hand;
  return (facingWithBack({ x: face.block.x - face.adjacent.x, z: face.block.z - face.adjacent.z }) ?? hand) as StairFacing;
}

/**
 * Two tools and two modifiers, which is the whole of the map's toolset (R-162).
 *
 * | | Build | Paint |
 * | --- | --- | --- |
 * | plain | place | repaint |
 * | Shift | **erase** | **fill** |
 * | Alt | build underneath | — |
 *
 * Shift is the tool's other mode, and it is Shift rather than the more obvious
 * Ctrl because macOS delivers Ctrl+click as a secondary click — which this
 * console already spends on panning the camera. A binding that works on one
 * platform is not a binding.
 *
 * Build is the only mode that acts on an *empty* cell. The others act on the
 * block you can see, which is the one under the pointer.
 */
export function mapAction(
  tool: MapTool,
  face: FacePick | null,
  reach: MapReach,
): MapAction {
  // Move and Spawn edit no block: they put people on floors, and their
  // sequences are their own (R-188, R-206). Prefabs edit many at once, and
  // theirs is its own too (D-321).
  if (!face || tool === 'move' || tool === 'spawn' || tool === 'prefabs' || tool === 'props' || tool === 'measure') {
    return { kind: 'nothing' };
  }
  /** With the Stairs brush, which way they climb (D-349). */
  const stairsOf = (aimed: FacePick) =>
    (reach.brush.stairs ? { stairs: stairsFacing(aimed, reach.stairFacing ?? 0) } : {});
  /** The brush's cells, with the band's say applied (R-164). */
  const patch = (at: BlockCoord, grow: 'up' | 'down' = 'up'): readonly BlockCoord[] => {
    const cells = brushPatch(at, reach.brush, grow);
    return reach.within ? cells.filter((cell) => inRange(reach.within!, cell.y)) : cells;
  };

  if (tool === 'build') {
    // Erasing acts on the cube that was hit, which is already "the cube, not
    // the face" — so the dig modifier has nothing left to say and is ignored.
    if (reach.shift) return { kind: 'erase', at: face.block, cells: patch(face.block) };
    if (reach.alt) {
      const at = { x: face.block.x, y: face.block.y - 1, z: face.block.z };
      // Down, so that a column digs a shaft rather than building up into the
      // cube that was pointed at. Alt means *downward*, and it means it for
      // the brush's shape as much as for where the first cube lands.
      return { kind: 'place', at, cells: patch(at, 'down'), under: true, ...stairsOf(face) };
    }
    return { kind: 'place', at: face.adjacent, cells: patch(face.adjacent), under: false, ...stairsOf(face) };
  }

  if (reach.shift) return { kind: 'fill', at: face.block };
  return { kind: 'paint', at: face.block, cells: patch(face.block) };
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
 *
 * It reads the **action** rather than the tool now that erase and fill are
 * modifiers on the two tools (R-162). Asking the tool would let a held Shift
 * drag an erase across the geometry it is eating, which is the case the rule
 * exists to prevent.
 */
export function mapDrags(action: MapAction): boolean {
  return action.kind === 'paint';
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
  /**
   * Is somebody standing in that cell (R-186)?
   *
   * A brush builds around the party — the host clips their cubes out of a
   * patch — so a click aimed straight at one is a click with nothing to do,
   * and says so before it is made.
   */
  readonly standing: boolean;
}

/** Whether a click may proceed, and if not, what to tell the GM (R-18). */
export type MapVerdict =
  | { readonly kind: 'go' }
  | { readonly kind: 'stop'; readonly why: string };

/**
 * Whether the aimed-at cell is one this tool may act on.
 *
 * Three refusals:
 *
 * - **Building into an occupied cell.** With everything drawn this could not
 *   happen: a face you can see has air in front of it. With the band shown
 *   alone, a ray passes through what is hidden and lands on the far side, so
 *   the cell "in front" of the face may hold a block a level down. The host
 *   refuses it too — this is so the GM reads why *before* clicking.
 * - **Nothing left to act on**, because the band clipped the whole patch —
 *   which happens exactly when the cube being aimed at is outside it. The
 *   block would have been placed and then vanished, unseen (R-162).
 * - A cell **outside the footprint**, which is what the outward face of an
 *   edge block aims at.
 *
 * Erasing, painting and filling need no band check of their own: they act on a
 * block that was picked, and only visible blocks can be picked.
 */
export function mapAllowed(action: MapAction, aim: MapAim): MapVerdict {
  if (action.kind === 'nothing') return { kind: 'stop', why: '' };

  if (!aim.inBounds) return { kind: 'stop', why: 'outside the map' };

  /*
   * An empty patch means the band clipped every cell, which can only happen
   * when the cube being aimed at is itself outside it (R-162). The clip
   * replaces the explicit band check this used to make: two mechanisms for one
   * rule is how they come to disagree.
   */
  if (action.kind !== 'fill' && action.cells.length === 0) {
    return { kind: 'stop', why: 'outside the levels you are showing' };
  }

  if (action.kind === 'place') {
    if (aim.occupied) return { kind: 'stop', why: 'a block is already there' };
    if (aim.standing) return { kind: 'stop', why: 'somebody is standing there' };
    return { kind: 'go' };
  }

  if (!aim.occupied) return { kind: 'stop', why: 'nothing there' };
  return { kind: 'go' };
}

export interface MapHover {
  /** What the readout says, or `null` when the pointer is over nothing. */
  readonly label: string | null;
  /** The cubes to outline — empty for none (R-153). */
  readonly ghost: readonly BlockCoord[];
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

/** Digging reads differently from building, because it is aimed differently. */
const verbFor = (action: Exclude<MapAction, { kind: 'nothing' }>): string =>
  (action.kind === 'place' && action.under ? 'Build under' : VERBS[action.kind]);

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
  if (action.kind === 'nothing') return { label: null, ghost: [] };
  const { x, y, z } = action.at;
  const where = `${verbFor(action)} ${x},${y},${z}`;
  const cells = action.kind === 'fill' ? [action.at] : action.cells;

  // A refusal reads *instead* of the action, because the action is not going to
  // happen and saying both would be telling the GM two things at once. The
  // outline stays on the cube that was aimed at, so a refused gesture still
  // shows where it was pointing.
  if (verdict?.kind === 'stop' && verdict.why) {
    return { label: `${where} — ${verdict.why}`, ghost: [action.at] };
  }

  // A fill says how much it is about to repaint, because one click can reach a
  // long way and the outline can only mark where it starts (R-154). With levels
  // hidden it also says how much of that reach is out of sight, since a fill
  // follows connected material straight through a cut.
  if (action.kind === 'fill' && reach) {
    const unseen = reach.unseen > 0 ? `, ${reach.unseen} unseen` : '';
    return {
      label: `${where} — ${reach.total} block${reach.total === 1 ? '' : 's'}${unseen}`,
      ghost: cells,
    };
  }
  // A brush says how many cubes it covers, because the outline shows the shape
  // and not how much of it will take — cells already built, or already the
  // right colour, are skipped without a word.
  if (cells.length > 1) return { label: `${where} — ${cells.length} wide`, ghost: cells };
  return { label: where, ghost: cells };
}
