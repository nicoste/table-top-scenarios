// Props (D-321, D-322, D-328): things placed in a map one at a time — a door,
// bars, a chest, a table. Not blocks: a material is what a whole cube is made
// of, and anything that is not a whole cube is a prop (D-321).
//
// **The prop is the map's; its state is the session's.** A door being there is
// part of the building — authored, saved with the map, under undo. Whether it
// is open is play state, kept in the save beside where everyone stands
// (R-140), the split the levels already make: a floor is the building's, the
// cut the GM is looking at is the session's.
//
// **Two rules and nothing else**: whether it stops sight, and whether it stops
// walking — each as it stands now, open or closed. A closed door stops both,
// so opening one shows the room beyond and lets the walk through (R-209).
// Furniture stops walking and not sight (D-328), except a bookcase, which is a
// wall of books.
//
// **No secrets** (D-328): a prop is on the table once the party has seen where
// it stands. Something the players must not find yet is added when they do.
//
// **Lights are props too** (D-322, D-335): a torch, a brazier, a campfire.
// What they give is drawn, never ruled — the light changes how the room looks
// and nobody's sight (D-319). A light is placed lit, and its other state is
// out, as a door's is open: the save keeps which props are not as they were
// placed (`Opened`), whatever that means for each.

import type { PropId, SwatchId } from '../ids/index.js';
import { freshId, registryId } from '../ids/index.js';
import { isKnownSwatch, swatchOf } from '../materials/index.js';
import type { BlockCoord, EncounterMap, Prop } from '../map/index.js';
import { blockAt, blockKey, cleanPropNote, cleanReach, inMap } from '../map/index.js';
import type { Facing } from '../place/index.js';
import { asFacing, turned } from '../place/index.js';
import type { Box, Size } from '../boxes/index.js';
import { backOf, boxCubes, placedBox } from '../boxes/index.js';

/** What a prop does to sight and walking, in one of its states. */
export interface PropEffect {
  readonly blocksSight: boolean;
  readonly blocksWalking: boolean;
}

/** One of a light's flames (D-335): *cold blue*. Its colour is the whole of it. */
export interface PropFlame {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
}

/**
 * What a prop that changes calls its two states, and the verbs between them
 * (D-335): a door is placed shut and opened; a light is placed lit and put out.
 */
export interface PropStates {
  /** As it was placed: *shut*, *lit*. */
  readonly placed: string;
  /** The other: *open*, *out*. */
  readonly other: string;
  /** What puts it back as placed: *Close*, *Light*. */
  readonly toPlaced: string;
  /** What changes it: *Open*, *Put out*. */
  readonly toOther: string;
}

/** One entry in the catalogue: *a door*. */
export interface PropType {
  readonly id: string;
  readonly name: string;
  /** Where the catalogue lists it. */
  readonly group: 'doors' | 'furniture' | 'lights' | 'stairs';
  /** The box it fills unturned, in cubes: wide (x), tall (y), deep (z). A door is 1 × 2. */
  readonly size: Size;
  /** Whether it has an open state at all. A table does not. */
  readonly opens: boolean;
  /** What it does closed — or always, for one that does not open. */
  readonly closed: PropEffect;
  /** What it does open. The same as closed for one that does not open. */
  readonly open: PropEffect;
  /**
   * The materials the catalogue suggests it in (D-352), the first the one it
   * is placed in unless another is asked for. Any material paints it; these
   * are only the ones offered first.
   */
  readonly paints: readonly SwatchId[];
  /** A light's flames (D-335), the first the one it is placed with. */
  readonly flames?: readonly PropFlame[];
  /** Its two states' words, when they are not a door's. */
  readonly states?: PropStates;
  /** Hung on a wall — held by the block behind it, not by one below (D-335). */
  readonly hangs?: boolean;
  /**
   * Somebody stands on it as on a block (D-350): its cubes are a floor to the
   * cube above, for standing, placing and the walk. Stairs, and the furniture
   * a whole cube tall — a table, a bookcase, a barrel, a crate (D-351).
   */
  readonly holds?: boolean;
  /** Turned to the wall pointed at when it is put down, its back to it, as a torch hangs (D-350). */
  readonly turnsToWall?: boolean;
  /** Its name is a plural — bars, candles, stairs — so it is never "a" one. */
  readonly plural?: boolean;
  /**
   * Somebody may be in its cube with nothing under them — on its rungs
   * (D-357). A ladder. No rule of moving goes with it: a token is put on a
   * rung as on a floor, by the GM or a confirmed move, and the walk does not
   * climb it.
   */
  readonly climbable?: boolean;
  /** Held by the block behind it, as well as by what is under it or at its ends: a ladder against a wall (D-357). */
  readonly leans?: boolean;
  /**
   * The light it gives while lit (D-335): how far, unless the GM sets its own,
   * and how high over its cube's floor the light comes from — the top of the
   * flame, which can be above the cube — where a lamp casting real shadows is
   * put (D-338).
   */
  readonly light?: { readonly reach: number; readonly rise: number };
}

const SHUT_OR_OPEN: PropStates = { placed: 'shut', other: 'open', toPlaced: 'Close', toOther: 'Open' };
const LIT_OR_OUT: PropStates = { placed: 'lit', other: 'out', toPlaced: 'Light', toOther: 'Put out' };

/** A prop's two states, in words: a door's unless it says otherwise. */
export function statesOf(type: PropType): PropStates {
  return type.states ?? SHUT_OR_OPEN;
}

/** A block material, as a prop is painted with one (D-352). */
const material = (family: string, cut: string | null = null): SwatchId =>
  swatchOf(registryId<'MaterialId'>('material', family), cut);
const OAK = material('wood');
const DARK_OAK = material('wood', 'dark-oak');
const BIRCH = material('wood', 'birch');
const IRON = material('mineral', 'iron');
const COPPER = material('mineral', 'copper');
const GOLD = material('mineral', 'gold');
const ROCK = material('mineral');
const DARK_ROCK = material('mineral', 'dark-rock');

/** What a door, a chest, a stair is offered in: wood, or iron. */
const WOODS = [OAK, DARK_OAK, BIRCH];
const METALS = [IRON, DARK_ROCK, COPPER];

/**
 * The flames (D-335): the colour of what a light gives. The light itself is
 * drawn in it, and so is everything it falls on.
 */
const FIRE: PropFlame = { id: 'fire', name: 'Fire', colour: '#ff9440' };
const CANDLE: PropFlame = { id: 'candle', name: 'Candle', colour: '#ffcf7a' };
const COLD: PropFlame = { id: 'cold', name: 'Cold blue', colour: '#7fb0ff' };
const GREEN: PropFlame = { id: 'green', name: 'Green', colour: '#86f07a' };
export const FLAMES: readonly PropFlame[] = [FIRE, CANDLE, COLD, GREEN];

const STOPS_BOTH: PropEffect = { blocksSight: true, blocksWalking: true };
const STOPS_WALKING: PropEffect = { blocksSight: false, blocksWalking: true };
const STOPS_NOTHING: PropEffect = { blocksSight: false, blocksWalking: false };

const fixed = (effect: PropEffect) => ({ opens: false, closed: effect, open: effect });
/** A light: it changes — lit or out — and does the same to sight and walking either way. */
const burns = (effect: PropEffect, reach: number, rise: number) => ({
  opens: true, closed: effect, open: effect, states: LIT_OR_OUT, light: { reach, rise },
});

/** The catalogue (D-328, D-335): doors and bars, then furniture, then lights. */
export const PROP_TYPES: readonly PropType[] = [
  {
    id: 'door', name: 'Door', group: 'doors', size: { x: 1, y: 2, z: 1 },
    opens: true, closed: STOPS_BOTH, open: STOPS_NOTHING, paints: [OAK, DARK_OAK, IRON],
  },
  {
    id: 'cell-door', name: 'Cell door', group: 'doors', size: { x: 1, y: 2, z: 1 },
    opens: true, closed: STOPS_WALKING, open: STOPS_NOTHING, paints: METALS,
  },
  { id: 'bars', name: 'Bars', plural: true, group: 'doors', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), paints: METALS },
  {
    id: 'portcullis', name: 'Portcullis', group: 'doors', size: { x: 2, y: 2, z: 1 },
    opens: true, closed: STOPS_WALKING, open: STOPS_NOTHING, paints: METALS,
  },
  {
    id: 'chest', name: 'Chest', group: 'furniture', size: { x: 1, y: 1, z: 1 },
    opens: true, closed: STOPS_WALKING, open: STOPS_WALKING, paints: [OAK, DARK_OAK, IRON],
  },
  // A table, a bookcase, a barrel and a crate are a whole cube tall and are
  // stood on (D-351): crates piled up to a balcony are a way up.
  { id: 'table', name: 'Table', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), holds: true, paints: WOODS },
  { id: 'chair', name: 'Chair', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), paints: WOODS },
  // A wall of books: the one piece of furniture you cannot see past.
  { id: 'bookcase', name: 'Bookcase', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_BOTH), holds: true, paints: WOODS },
  { id: 'barrel', name: 'Barrel', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), holds: true, paints: [OAK, DARK_OAK] },
  { id: 'crate', name: 'Crate', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), holds: true, paints: [OAK, BIRCH, DARK_OAK] },
  // Lights (D-335). A torch hangs on the wall behind it; the rest stand.
  // A brazier and a campfire are in the way; the others are not.
  {
    id: 'torch', name: 'Torch', group: 'lights', size: { x: 1, y: 1, z: 1 }, hangs: true,
    ...burns(STOPS_NOTHING, 6, 0.95), paints: [IRON, COPPER, GOLD], flames: FLAMES,
  },
  { id: 'lantern', name: 'Lantern', group: 'lights', size: { x: 1, y: 1, z: 1 }, ...burns(STOPS_NOTHING, 5, 0.3), paints: [IRON, COPPER, GOLD], flames: FLAMES },
  {
    id: 'candles', name: 'Candles', plural: true, group: 'lights', size: { x: 1, y: 1, z: 1 },
    ...burns(STOPS_NOTHING, 3, 0.45), paints: [GOLD, COPPER, IRON], flames: [CANDLE, FIRE, COLD, GREEN],
  },
  { id: 'brazier', name: 'Brazier', group: 'lights', size: { x: 1, y: 1, z: 1 }, ...burns(STOPS_WALKING, 8, 1.1), paints: [IRON, COPPER, DARK_ROCK], flames: FLAMES },
  { id: 'campfire', name: 'Campfire', group: 'lights', size: { x: 1, y: 1, z: 1 }, ...burns(STOPS_WALKING, 10, 0.8), paints: [ROCK, DARK_ROCK], flames: FLAMES },
  // Stairs (D-350): a block in every rule but one look — nobody walks into
  // them or sees through them, and they are stood on as a floor is. They climb
  // toward their back, and are turned to the wall they are set against.
  {
    id: 'stairs', name: 'Stairs', group: 'stairs', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_BOTH),
    holds: true, turnsToWall: true, plural: true, paints: [ROCK, DARK_ROCK, OAK, DARK_OAK],
  },
  // A ladder (D-357): in nobody's way and no wall to sight, set against a wall
  // or stacked rung over rung, and somebody may be anywhere up it.
  {
    id: 'ladder', name: 'Ladder', group: 'stairs', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_NOTHING),
    climbable: true, leans: true, turnsToWall: true, paints: [OAK, DARK_OAK, BIRCH, IRON],
  },
];

export function propType(id: string): PropType | null {
  return PROP_TYPES.find((type) => type.id === id) ?? null;
}

export type { Prop } from '../map/index.js';

/** In the order they were placed. */
export type Props = readonly Prop[];

export const NO_PROPS: Props = [];

/** The box a prop fills. A prop of an unknown type fills its own cube. */
export function propBox(prop: { readonly type: string; readonly at: BlockCoord; readonly facing: Facing }): Box {
  const type = propType(prop.type);
  return placedBox({ size: type?.size ?? { x: 1, y: 1, z: 1 } }, prop.at, { facing: prop.facing });
}

/** Every cube a prop fills. */
export function propCubes(prop: { readonly type: string; readonly at: BlockCoord; readonly facing: Facing }): readonly BlockCoord[] {
  return boxCubes(propBox(prop));
}

/** The prop filling a cube, if any. */
export function propAt(props: Props, at: BlockCoord): Prop | null {
  const key = blockKey(at);
  return props.find((prop) => propCubes(prop).some((cube) => blockKey(cube) === key)) ?? null;
}

export function propById(props: Props, id: PropId | string): Prop | null {
  return props.find((prop) => prop.id === id) ?? null;
}

/**
 * Why a prop cannot stand here, or `null` when it can.
 *
 * - `outside` — some cube of it is not the map's.
 * - `solid` — a block is in one of its cubes.
 * - `taken` — another prop is, or somebody is standing there.
 * - `unsupported` — nothing holds it: something under its bottom is air, and
 *   nothing is at its ends either. A prop stands on a block or on another
 *   prop (D-322: they stack — a tall bookcase is two), or is held at its ends
 *   — left and right, along its width (D-354, D-355): bars across the top of
 *   a doorway, between its posts. Never by what is in front of it or behind
 *   it; one that hangs is the one held from behind.
 * - `unhung` — one that hangs has no block behind it to hang on (D-335).
 *
 * `self` is the prop being turned or moved, which does not get in its own way.
 */
export type PropFooting = 'outside' | 'solid' | 'taken' | 'unsupported' | 'unhung';

/**
 * The two cubes at a prop's ends, along its width, as it is turned (D-355): a
 * door's width runs across its back, so across x unturned and across z a
 * quarter turn on.
 */
function endsOf(facing: Facing): readonly (readonly [number, number])[] {
  const back = backOf(facing);
  return back.x !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
}

export function whyNotPut(
  map: EncounterMap,
  prop: { readonly type: string; readonly at: BlockCoord; readonly facing: Facing },
  standing: ReadonlySet<string> = new Set(),
  self: string | null = null,
): PropFooting | null {
  const others = map.props.filter((one) => one.id !== self);
  const taken = new Set(others.flatMap((one) => propCubes(one).map(blockKey)));
  const cubes = propCubes(prop);
  if (cubes.some((cube) => !inMap(map, cube))) return 'outside';
  if (cubes.some((cube) => blockAt(map, cube))) return 'solid';
  if (cubes.some((cube) => taken.has(blockKey(cube)) || standing.has(blockKey(cube)))) return 'taken';
  if (propType(prop.type)?.hangs) {
    const back = backOf(prop.facing);
    return blockAt(map, { x: prop.at.x + back.x, y: prop.at.y, z: prop.at.z + back.z }) ? null : 'unhung';
  }
  const solidAt = (cube: BlockCoord) => !!blockAt(map, cube) || taken.has(blockKey(cube));
  const bottom = Math.min(...cubes.map((cube) => cube.y));
  const stands = cubes
    .filter((cube) => cube.y === bottom)
    .every((cube) => solidAt({ x: cube.x, y: cube.y - 1, z: cube.z }));
  if (stands) return null;
  // A ladder against a wall (D-357): the block behind it holds it.
  if (propType(prop.type)?.leans) {
    const back = backOf(prop.facing);
    if (cubes.some((cube) => !!blockAt(map, { x: cube.x + back.x, y: cube.y, z: cube.z + back.z }))) return null;
  }
  // Or held at its ends (D-354, D-355): a block or a prop beyond its left or
  // right, along its width — what is in front or behind holds nothing.
  const own = new Set(cubes.map(blockKey));
  const beside = cubes.some((cube) => endsOf(prop.facing).some(([dx, dz]) => {
    const next = { x: cube.x + dx, y: cube.y, z: cube.z + dz };
    return !own.has(blockKey(next)) && solidAt(next);
  }));
  return beside ? null : 'unsupported';
}

/** A material the registry knows, or nothing: what a prop may be painted with (D-352). */
const knownPaint = (paint: string | undefined): SwatchId | null =>
  paint !== undefined && isKnownSwatch(paint as SwatchId) ? paint as SwatchId : null;

/**
 * Puts a prop in a map, or leaves the map as it was if it cannot stand there
 * — the caller asks `whyNotPut` for the reason. It is painted with the
 * catalogue's first material unless another is asked for, and a light burns
 * with its first flame unless one it has is asked for (D-352).
 */
export function putProp(
  map: EncounterMap,
  fields: {
    readonly type: string; readonly at: BlockCoord; readonly facing: Facing;
    readonly paint?: SwatchId | string; readonly flame?: string;
  },
  standing: ReadonlySet<string> = new Set(),
): EncounterMap {
  const type = propType(fields.type);
  if (!type) return map;
  const prop: Prop = {
    id: freshId<'PropId'>('prop'),
    type: type.id,
    at: { x: fields.at.x, y: fields.at.y, z: fields.at.z },
    facing: asFacing(fields.facing),
    paint: knownPaint(fields.paint) ?? type.paints[0]!,
    ...(type.flames
      ? { flame: type.flames.some((flame) => flame.id === fields.flame) ? fields.flame! : type.flames[0]!.id }
      : {}),
  };
  if (whyNotPut(map, prop, standing) !== null) return map;
  return { ...map, props: [...map.props, prop] };
}

/**
 * Turns, repaints, changes a light's flame or sets how far it reaches, where it
 * stands. A turn that would not fit is refused — the map comes back as it
 * was. A reach equal to its type's own is no reach of its own. Identity-
 * preserving (R-165).
 */
export function editProp(
  map: EncounterMap,
  id: PropId | string,
  patch: {
    readonly facing?: Facing; readonly paint?: SwatchId | string; readonly flame?: string; readonly reach?: number;
    /** The GM's note (D-357); an empty one takes it away. */
    readonly note?: string;
  },
  standing: ReadonlySet<string> = new Set(),
): EncounterMap {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : null;
  if (!prop || !type) return map;
  const facing = patch.facing === undefined ? prop.facing : asFacing(patch.facing);
  const paint = knownPaint(patch.paint) ?? prop.paint;
  const flame = patch.flame !== undefined && type.flames?.some((one) => one.id === patch.flame)
    ? patch.flame : prop.flame;
  const asked = patch.reach !== undefined && type.light && Number.isFinite(patch.reach) ? cleanReach(patch.reach) : null;
  const reach = asked === null ? prop.reach : asked === type.light!.reach ? undefined : asked;
  const note = patch.note === undefined ? prop.note : cleanPropNote(patch.note) ?? undefined;
  if (facing === prop.facing && paint === prop.paint && flame === prop.flame && reach === prop.reach && note === prop.note) return map;
  const { reach: _, paint: _paint, flame: _flame, note: _note, ...rest } = prop;
  const next: Prop = {
    ...rest, facing,
    ...(paint !== undefined ? { paint } : {}),
    ...(flame !== undefined ? { flame } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(reach !== undefined ? { reach } : {}),
  };
  if (facing !== prop.facing && whyNotPut(map, next, standing, prop.id) !== null) return map;
  return { ...map, props: map.props.map((one) => (one.id === prop.id ? next : one)) };
}

export function removeProp(map: EncounterMap, id: PropId | string): EncounterMap {
  const props = map.props.filter((prop) => prop.id !== id);
  return props.length === map.props.length ? map : { ...map, props };
}

/**
 * A prop and everything that rests on it, by id (D-354): the candles on the
 * barrel, the bookcase on the bookcase — what is carried when it is moved.
 * Resting is standing on top; what is only held from the side stays.
 */
export function stackOf(props: readonly Prop[], id: PropId | string): readonly Prop[] {
  const first = propById(props, id);
  if (!first) return [];
  const stack = [first];
  const under = new Set(propCubes(first).map(blockKey));
  for (let grew = true; grew;) {
    grew = false;
    for (const prop of props) {
      if (stack.includes(prop)) continue;
      const cubes = propCubes(prop);
      const bottom = Math.min(...cubes.map((cube) => cube.y));
      if (!cubes.some((cube) => cube.y === bottom && under.has(blockKey({ x: cube.x, y: cube.y - 1, z: cube.z })))) continue;
      stack.push(prop);
      for (const cube of cubes) under.add(blockKey(cube));
      grew = true;
    }
  }
  return stack;
}

/** An offset across the floor turned by quarter turns clockwise from above, as a facing turns (R-203). */
function turnedOffset(x: number, z: number, turns: number): { readonly x: number; readonly z: number } {
  let at = { x, z };
  for (let i = 0; i < ((turns % 4) + 4) % 4; i += 1) at = { x: -at.z, z: at.x };
  return at;
}

/**
 * A prop and everything resting on it (`stackOf`) as they would stand moved
 * to `to` and turned by `turns` quarter turns about the prop's own cube
 * (D-354, D-357): each keeps its id and paint, and its place above the one
 * below. The prop first, as `stackOf` gives them. Not judged — `whyNotMove`.
 */
export function landedStack(props: readonly Prop[], id: PropId | string, to: BlockCoord, turns = 0): readonly Prop[] {
  const stack = stackOf(props, id);
  const prop = stack[0];
  if (!prop) return [];
  const turn = ((turns % 4) + 4) % 4;
  return stack.map((one) => {
    const off = turnedOffset(one.at.x - prop.at.x, one.at.z - prop.at.z, turn);
    return {
      ...one,
      at: { x: to.x + off.x, y: to.y + (one.at.y - prop.at.y), z: to.z + off.z },
      facing: turned(one.facing, turn),
    };
  });
}

/**
 * The map with a prop moved so it stands at `to`, everything resting on it
 * carried along (D-354) and all of it turned by `turns` (D-357) — or the
 * reason it cannot go there: the first of them, from the bottom up, that
 * would not stand where it lands.
 */
function moved(
  map: EncounterMap,
  id: PropId | string,
  to: BlockCoord,
  standing: ReadonlySet<string>,
  turns: number,
): { readonly map: EncounterMap } | { readonly why: PropFooting } {
  const prop = propById(map.props, id);
  if (!prop) return { map };
  if (to.x === prop.at.x && to.y === prop.at.y && to.z === prop.at.z && ((turns % 4) + 4) % 4 === 0) return { map };
  const landed = landedStack(map.props, id, to, turns);
  const carried = new Set(landed.map((one) => one.id));
  let next: EncounterMap = { ...map, props: map.props.filter((one) => !carried.has(one.id)) };
  for (const there of [...landed].sort((a, b) => a.at.y - b.at.y)) {
    const why = whyNotPut(next, there, standing);
    if (why) return { why };
    next = { ...next, props: [...next.props, there] };
  }
  // In the order they were in, so nothing else about the map changes.
  const placed = new Map(next.props.map((one) => [one.id, one]));
  return { map: { ...map, props: map.props.map((one) => placed.get(one.id) ?? one) } };
}

/** Why a prop could not be moved to `to` and turned, everything on it with it (D-354), or `null` if it can. */
export function whyNotMove(
  map: EncounterMap,
  id: PropId | string,
  to: BlockCoord,
  standing: ReadonlySet<string> = new Set(),
  turns = 0,
): PropFooting | null {
  const result = moved(map, id, to, standing, turns);
  return 'why' in result ? result.why : null;
}

/**
 * Moves a prop to stand at `to`, carrying what rests on it (D-354), or leaves
 * the map as it was if it cannot go there — the caller asks `whyNotMove`.
 */
export function moveProp(
  map: EncounterMap,
  id: PropId | string,
  to: BlockCoord,
  standing: ReadonlySet<string> = new Set(),
  turns = 0,
): EncounterMap {
  const result = moved(map, id, to, standing, turns);
  return 'why' in result ? map : result.map;
}

// -- what they do now --------------------------------------------------------

/**
 * Which props are not as they were placed, by id: the session's (R-140). A
 * door in it is open; a light in it is out (D-335). As placed is the default.
 */
export type Opened = ReadonlySet<string>;

export const NONE_OPEN: Opened = new Set();

/** The cubes props fill, as the rules see them now. */
export interface PropRules {
  /** Cubes that stop sight now: closed doors, bookcases. */
  readonly sight: ReadonlySet<string>;
  /** Cubes nobody may stand in or walk through now: closed doors, bars, furniture. */
  readonly walking: ReadonlySet<string>;
  /** Every cube a prop fills, open or not: nothing else may be built or placed there. */
  readonly occupied: ReadonlySet<string>;
  /** Cubes somebody may stand on top of, as on a block: stairs (D-350). */
  readonly floors: ReadonlySet<string>;
  /** Cubes somebody may be in with nothing under them: a ladder's (D-357). */
  readonly rungs: ReadonlySet<string>;
}

/** Worked out once per list of props and set of open ones: an edit makes new ones (R-165). */
const ruled = new WeakMap<Props, WeakMap<Opened, PropRules>>();

export function propRules(props: Props, opened: Opened = NONE_OPEN): PropRules {
  let byOpened = ruled.get(props);
  if (!byOpened) { byOpened = new WeakMap(); ruled.set(props, byOpened); }
  const cached = byOpened.get(opened);
  if (cached) return cached;
  const sight = new Set<string>();
  const walking = new Set<string>();
  const occupied = new Set<string>();
  const floors = new Set<string>();
  const rungs = new Set<string>();
  for (const prop of props) {
    const type = propType(prop.type);
    const effect = type ? (type.opens && opened.has(prop.id) ? type.open : type.closed) : STOPS_WALKING;
    for (const cube of propCubes(prop)) {
      const key = blockKey(cube);
      occupied.add(key);
      if (effect.blocksSight) sight.add(key);
      if (effect.blocksWalking) walking.add(key);
      if (type?.holds) floors.add(key);
      if (type?.climbable) rungs.add(key);
    }
  }
  const rules = { sight, walking, occupied, floors, rungs };
  byOpened.set(opened, rules);
  return rules;
}

// -- lights (D-335) ----------------------------------------------------------

/** Whether a prop gives light now: a light, and not put out. */
export function isLit(prop: Prop, opened: Opened = NONE_OPEN): boolean {
  return !!propType(prop.type)?.light && !opened.has(prop.id);
}

/** How far a light reaches — its own, or its type's — or `null` for a prop that gives none. */
export function reachOf(prop: Prop): number | null {
  const light = propType(prop.type)?.light;
  if (!light) return null;
  return prop.reach ?? light.reach;
}

/** The colour of a flame, by its id, or fire's for one nobody knows. */
export function flameColour(id: string): string {
  return (FLAMES.find((flame) => flame.id === id) ?? FLAMES[0]!).colour;
}

/**
 * What a prop is painted with (D-352): its own, or — when it has none, or one
 * the registry has never heard of — its type's first. Every screen draws this.
 */
export function paintOf(prop: { readonly type: string; readonly paint?: SwatchId }): SwatchId {
  if (prop.paint !== undefined && isKnownSwatch(prop.paint)) return prop.paint;
  return propType(prop.type)?.paints[0] ?? ROCK;
}

/** A light's flame (D-335): its own, or its type's first. Null for what is not a light. */
export function flameOf(prop: { readonly type: string; readonly flame?: string }): string | null {
  const flames = propType(prop.type)?.flames;
  if (!flames) return null;
  return flames.some((one) => one.id === prop.flame) ? prop.flame! : flames[0]!.id;
}

/**
 * Whether there is something to stand on under a cube (D-350): a block, or a
 * prop that holds people up — stairs — or a ladder's rung in it (D-357). Every rule that asks for a floor asks
 * this, so a stair is stood on wherever a block would be.
 */
export function floorUnder(map: EncounterMap, at: BlockCoord): boolean {
  const below = { x: at.x, y: at.y - 1, z: at.z };
  if (blockAt(map, below)) return true;
  if (map.props.length === 0) return false;
  const rules = propRules(map.props);
  // Stairs under it (D-350), or a ladder's rung in it (D-357).
  return rules.floors.has(blockKey(below)) || rules.rungs.has(blockKey(at));
}

