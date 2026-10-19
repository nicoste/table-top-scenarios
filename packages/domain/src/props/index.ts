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

import type { PropId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { BlockCoord, EncounterMap, Prop } from '../map/index.js';
import { blockAt, blockKey, cleanReach, inMap } from '../map/index.js';
import type { Facing } from '../place/index.js';
import { asFacing } from '../place/index.js';
import type { Box, Size } from '../boxes/index.js';
import { backOf, boxCubes, placedBox } from '../boxes/index.js';

/** What a prop does to sight and walking, in one of its states. */
export interface PropEffect {
  readonly blocksSight: boolean;
  readonly blocksWalking: boolean;
}

/** One way a prop can look: *dark wood*. Its colour is the whole of it. */
export interface PropFinish {
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
  readonly group: 'doors' | 'furniture' | 'lights';
  /** The box it fills unturned, in cubes: wide (x), tall (y), deep (z). A door is 1 × 2. */
  readonly size: Size;
  /** Whether it has an open state at all. A table does not. */
  readonly opens: boolean;
  /** What it does closed — or always, for one that does not open. */
  readonly closed: PropEffect;
  /** What it does open. The same as closed for one that does not open. */
  readonly open: PropEffect;
  /** The ways it can look, the first the one it is placed in. A light's are its flames. */
  readonly finishes: readonly PropFinish[];
  /** Its two states' words, when they are not a door's. */
  readonly states?: PropStates;
  /** Hung on a wall — held by the block behind it, not by one below (D-335). */
  readonly hangs?: boolean;
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

const WOOD: PropFinish = { id: 'wood', name: 'Wood', colour: '#8a5a35' };
const DARK_WOOD: PropFinish = { id: 'dark-wood', name: 'Dark wood', colour: '#4f3424' };
const PALE_WOOD: PropFinish = { id: 'pale-wood', name: 'Pale wood', colour: '#b48a5c' };
const IRON: PropFinish = { id: 'iron', name: 'Iron', colour: '#5d646c' };
const DARK_IRON: PropFinish = { id: 'dark-iron', name: 'Dark iron', colour: '#363a40' };
const RUSTED: PropFinish = { id: 'rusted', name: 'Rusted', colour: '#7a4a34' };

/**
 * The flames (D-335): a light's finish is the colour of what it gives. The
 * light itself is drawn in it, and so is everything it falls on.
 */
const FIRE: PropFinish = { id: 'fire', name: 'Fire', colour: '#ff9440' };
const CANDLE: PropFinish = { id: 'candle', name: 'Candle', colour: '#ffcf7a' };
const COLD: PropFinish = { id: 'cold', name: 'Cold blue', colour: '#7fb0ff' };
const GREEN: PropFinish = { id: 'green', name: 'Green', colour: '#86f07a' };
export const FLAMES: readonly PropFinish[] = [FIRE, CANDLE, COLD, GREEN];

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
    opens: true, closed: STOPS_BOTH, open: STOPS_NOTHING, finishes: [WOOD, DARK_WOOD, IRON],
  },
  {
    id: 'cell-door', name: 'Cell door', group: 'doors', size: { x: 1, y: 2, z: 1 },
    opens: true, closed: STOPS_WALKING, open: STOPS_NOTHING, finishes: [IRON, DARK_IRON, RUSTED],
  },
  { id: 'bars', name: 'Bars', group: 'doors', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), finishes: [IRON, DARK_IRON, RUSTED] },
  {
    id: 'portcullis', name: 'Portcullis', group: 'doors', size: { x: 2, y: 2, z: 1 },
    opens: true, closed: STOPS_WALKING, open: STOPS_NOTHING, finishes: [IRON, DARK_IRON, RUSTED],
  },
  {
    id: 'chest', name: 'Chest', group: 'furniture', size: { x: 1, y: 1, z: 1 },
    opens: true, closed: STOPS_WALKING, open: STOPS_WALKING, finishes: [WOOD, DARK_WOOD, IRON],
  },
  { id: 'table', name: 'Table', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), finishes: [WOOD, DARK_WOOD, PALE_WOOD] },
  { id: 'chair', name: 'Chair', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), finishes: [WOOD, DARK_WOOD, PALE_WOOD] },
  // A wall of books: the one piece of furniture you cannot see past.
  { id: 'bookcase', name: 'Bookcase', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_BOTH), finishes: [WOOD, DARK_WOOD, PALE_WOOD] },
  { id: 'barrel', name: 'Barrel', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), finishes: [WOOD, DARK_WOOD] },
  { id: 'crate', name: 'Crate', group: 'furniture', size: { x: 1, y: 1, z: 1 }, ...fixed(STOPS_WALKING), finishes: [WOOD, PALE_WOOD, DARK_WOOD] },
  // Lights (D-335). A torch hangs on the wall behind it; the rest stand.
  // A brazier and a campfire are in the way; the others are not.
  {
    id: 'torch', name: 'Torch', group: 'lights', size: { x: 1, y: 1, z: 1 }, hangs: true,
    ...burns(STOPS_NOTHING, 6, 0.95), finishes: FLAMES,
  },
  { id: 'lantern', name: 'Lantern', group: 'lights', size: { x: 1, y: 1, z: 1 }, ...burns(STOPS_NOTHING, 5, 0.3), finishes: FLAMES },
  {
    id: 'candles', name: 'Candles', group: 'lights', size: { x: 1, y: 1, z: 1 },
    ...burns(STOPS_NOTHING, 3, 0.45), finishes: [CANDLE, FIRE, COLD, GREEN],
  },
  { id: 'brazier', name: 'Brazier', group: 'lights', size: { x: 1, y: 1, z: 1 }, ...burns(STOPS_WALKING, 8, 1.1), finishes: FLAMES },
  { id: 'campfire', name: 'Campfire', group: 'lights', size: { x: 1, y: 1, z: 1 }, ...burns(STOPS_WALKING, 10, 0.8), finishes: FLAMES },
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
 * - `unsupported` — something under its bottom is air. A prop stands on a
 *   block or on another prop (D-322: they stack — a tall bookcase is two).
 * - `unhung` — one that hangs has no block behind it to hang on (D-335).
 *
 * `self` is the prop being turned or moved, which does not get in its own way.
 */
export type PropFooting = 'outside' | 'solid' | 'taken' | 'unsupported' | 'unhung';

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
  const bottom = Math.min(...cubes.map((cube) => cube.y));
  const held = cubes
    .filter((cube) => cube.y === bottom)
    .every((cube) => {
      const below = { x: cube.x, y: cube.y - 1, z: cube.z };
      return !!blockAt(map, below) || taken.has(blockKey(below));
    });
  return held ? null : 'unsupported';
}

/**
 * Puts a prop in a map, or leaves the map as it was if it cannot stand there
 * — the caller asks `whyNotPut` for the reason. Its finish is the catalogue's
 * first unless one it has is asked for.
 */
export function putProp(
  map: EncounterMap,
  fields: { readonly type: string; readonly at: BlockCoord; readonly facing: Facing; readonly finish?: string },
  standing: ReadonlySet<string> = new Set(),
): EncounterMap {
  const type = propType(fields.type);
  if (!type) return map;
  const prop: Prop = {
    id: freshId<'PropId'>('prop'),
    type: type.id,
    at: { x: fields.at.x, y: fields.at.y, z: fields.at.z },
    facing: asFacing(fields.facing),
    finish: type.finishes.some((finish) => finish.id === fields.finish) ? fields.finish! : type.finishes[0]!.id,
  };
  if (whyNotPut(map, prop, standing) !== null) return map;
  return { ...map, props: [...map.props, prop] };
}

/**
 * Turns, refinishes or — for a light — sets how far it reaches, where it
 * stands. A turn that would not fit is refused — the map comes back as it
 * was. A reach equal to its type's own is no reach of its own. Identity-
 * preserving (R-165).
 */
export function editProp(
  map: EncounterMap,
  id: PropId | string,
  patch: { readonly facing?: Facing; readonly finish?: string; readonly reach?: number },
  standing: ReadonlySet<string> = new Set(),
): EncounterMap {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : null;
  if (!prop || !type) return map;
  const facing = patch.facing === undefined ? prop.facing : asFacing(patch.facing);
  const finish = patch.finish !== undefined && type.finishes.some((one) => one.id === patch.finish)
    ? patch.finish : prop.finish;
  const asked = patch.reach !== undefined && type.light && Number.isFinite(patch.reach) ? cleanReach(patch.reach) : null;
  const reach = asked === null ? prop.reach : asked === type.light!.reach ? undefined : asked;
  if (facing === prop.facing && finish === prop.finish && reach === prop.reach) return map;
  const { reach: _, ...rest } = prop;
  const next: Prop = { ...rest, facing, finish, ...(reach !== undefined ? { reach } : {}) };
  if (facing !== prop.facing && whyNotPut(map, next, standing, prop.id) !== null) return map;
  return { ...map, props: map.props.map((one) => (one.id === prop.id ? next : one)) };
}

export function removeProp(map: EncounterMap, id: PropId | string): EncounterMap {
  const props = map.props.filter((prop) => prop.id !== id);
  return props.length === map.props.length ? map : { ...map, props };
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
  for (const prop of props) {
    const type = propType(prop.type);
    const effect = type ? (type.opens && opened.has(prop.id) ? type.open : type.closed) : STOPS_WALKING;
    for (const cube of propCubes(prop)) {
      const key = blockKey(cube);
      occupied.add(key);
      if (effect.blocksSight) sight.add(key);
      if (effect.blocksWalking) walking.add(key);
    }
  }
  const rules = { sight, walking, occupied };
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
