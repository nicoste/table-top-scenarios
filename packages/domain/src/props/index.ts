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

import type { PropId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { BlockCoord, EncounterMap, Prop } from '../map/index.js';
import { blockAt, blockKey, inMap } from '../map/index.js';
import type { Facing } from '../place/index.js';
import { asFacing } from '../place/index.js';
import type { Box, Size } from '../boxes/index.js';
import { boxCubes, placedBox } from '../boxes/index.js';

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

/** One entry in the catalogue: *a door*. */
export interface PropType {
  readonly id: string;
  readonly name: string;
  /** Where the catalogue lists it. */
  readonly group: 'doors' | 'furniture';
  /** The box it fills unturned, in cubes: wide (x), tall (y), deep (z). A door is 1 × 2. */
  readonly size: Size;
  /** Whether it has an open state at all. A table does not. */
  readonly opens: boolean;
  /** What it does closed — or always, for one that does not open. */
  readonly closed: PropEffect;
  /** What it does open. The same as closed for one that does not open. */
  readonly open: PropEffect;
  /** The ways it can look, the first the one it is placed in. */
  readonly finishes: readonly PropFinish[];
}

const WOOD: PropFinish = { id: 'wood', name: 'Wood', colour: '#8a5a35' };
const DARK_WOOD: PropFinish = { id: 'dark-wood', name: 'Dark wood', colour: '#4f3424' };
const PALE_WOOD: PropFinish = { id: 'pale-wood', name: 'Pale wood', colour: '#b48a5c' };
const IRON: PropFinish = { id: 'iron', name: 'Iron', colour: '#5d646c' };
const DARK_IRON: PropFinish = { id: 'dark-iron', name: 'Dark iron', colour: '#363a40' };
const RUSTED: PropFinish = { id: 'rusted', name: 'Rusted', colour: '#7a4a34' };

const STOPS_BOTH: PropEffect = { blocksSight: true, blocksWalking: true };
const STOPS_WALKING: PropEffect = { blocksSight: false, blocksWalking: true };
const STOPS_NOTHING: PropEffect = { blocksSight: false, blocksWalking: false };

const fixed = (effect: PropEffect) => ({ opens: false, closed: effect, open: effect });

/** The catalogue (D-328): doors and bars, then furniture. */
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
 *
 * `self` is the prop being turned or moved, which does not get in its own way.
 */
export type PropFooting = 'outside' | 'solid' | 'taken' | 'unsupported';

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
 * Turns or refinishes a prop where it stands. A turn that would not fit is
 * refused — the map comes back as it was. Identity-preserving (R-165).
 */
export function editProp(
  map: EncounterMap,
  id: PropId | string,
  patch: { readonly facing?: Facing; readonly finish?: string },
  standing: ReadonlySet<string> = new Set(),
): EncounterMap {
  const prop = propById(map.props, id);
  const type = prop ? propType(prop.type) : null;
  if (!prop || !type) return map;
  const facing = patch.facing === undefined ? prop.facing : asFacing(patch.facing);
  const finish = patch.finish !== undefined && type.finishes.some((one) => one.id === patch.finish)
    ? patch.finish : prop.finish;
  if (facing === prop.facing && finish === prop.finish) return map;
  const next = { ...prop, facing, finish };
  if (facing !== prop.facing && whyNotPut(map, next, standing, prop.id) !== null) return map;
  return { ...map, props: map.props.map((one) => (one.id === prop.id ? next : one)) };
}

export function removeProp(map: EncounterMap, id: PropId | string): EncounterMap {
  const props = map.props.filter((prop) => prop.id !== id);
  return props.length === map.props.length ? map : { ...map, props };
}

// -- what they do now --------------------------------------------------------

/** Which props stand open, by id: the session's (R-140). Closed is the default. */
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
