// Where the party stands inside a map (R-184).
//
// Not a new kind of thing. A token is a party member — the campaign's
// definition (R-91) — and this is where that member is standing, which is play
// state (R-8): the world map's pawns one surface down (D-155). Silver tokens,
// everything that is not the party, are a later round (D-255).
//
// Nothing here knows about vision. What it settles is the thing vision is
// waiting for: R-43 measures eye height from **the floor of the token's cube**,
// so a token's cube has to be a cube with a floor — empty, and standing on a
// block.

import type { MemberId } from '../ids/index.js';
import type { BlockCoord, EncounterMap } from '../map/index.js';
import { blockAt, blockKey, inMap, MAP_MIN_DEPTH } from '../map/index.js';
import type { LevelRange } from '../planes/index.js';
import { inRange } from '../planes/index.js';
import type { Opened } from '../props/index.js';
import { NONE_OPEN, propRules } from '../props/index.js';

/**
 * Where each placed member stands in one map.
 *
 * A member missing from it is simply not placed there — which is how a party
 * walks into a map for the first time, and how a member added to the roster
 * mid-scene arrives (D-167's "nothing to pick up yet").
 */
export type Tokens = ReadonlyMap<MemberId, BlockCoord>;

export const NO_TOKENS: Tokens = new Map();

export function sameCube(a: BlockCoord, b: BlockCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Who is standing in this cube, if anyone. */
export function standingAt(tokens: Tokens, at: BlockCoord): MemberId | null {
  for (const [id, cube] of tokens) if (sameCube(cube, at)) return id;
  return null;
}

/**
 * Why a member cannot stand in a cube, or `null` when they can (R-184).
 *
 * - `outside` — not a cube the map owns.
 * - `solid` — a block is there. A token *occupies* its cube, so the cube is
 *   empty; an eye 1.2 cubes up from a floor inside a wall would see nothing
 *   (R-43).
 * - `unsupported` — nothing beneath it. Placing needs footing, which is what
 *   makes "the floor of the token's cube" a floor. A token can still *end up*
 *   floating, when the GM opens a trapdoor under it (R-186) — but it is never
 *   put there.
 * - `taken` — somebody else is standing in it. One to a cube, for R-119's
 *   reason: a click on two tokens in one cube could mean either.
 * - `blocked` — a prop that stops walking fills it, as it stands now: a
 *   closed door, bars, a table (D-322). An open door is a doorway.
 *
 * The mover's own cube is not `taken`: moving a member to where they already
 * stand is a no-op, not a collision.
 */
export type Footing = 'outside' | 'solid' | 'unsupported' | 'taken' | 'blocked';

export function whyNotStand(
  map: EncounterMap,
  tokens: Tokens,
  memberId: MemberId,
  at: BlockCoord,
  /**
   * Cubes somebody who is not the party stands in, by `blockKey` — silver
   * tokens (D-307). One to a cube, gold or silver.
   */
  others: ReadonlySet<string> = NO_CUBES,
  /** Which props stand open in this map (D-322); every one is shut unless said. */
  opened: Opened = NONE_OPEN,
): Footing | null {
  if (!inMap(map, at)) return 'outside';
  if (blockAt(map, at)) return 'solid';
  if (map.props.length > 0 && propRules(map.props, opened).walking.has(blockKey(at))) return 'blocked';
  if (!blockAt(map, { x: at.x, y: at.y - 1, z: at.z })) return 'unsupported';
  const standing = standingAt(tokens, at);
  if (standing !== null && standing !== memberId) return 'taken';
  if (others.has(blockKey(at))) return 'taken';
  return null;
}

const NO_CUBES: ReadonlySet<string> = new Set();

/**
 * Puts a member in a cube: the first placement and every move after it are
 * the same act (D-150).
 *
 * **Refuses rather than repairs.** A cube the member cannot stand in leaves
 * the tokens as they were, so nothing built from this function can hold a
 * token in a wall or two in one cube. The caller asks `whyNotStand` for the
 * reason; this only guarantees the outcome. Identity-preserving (R-165).
 */
export function placeToken(
  map: EncounterMap,
  tokens: Tokens,
  memberId: MemberId,
  at: BlockCoord,
  others: ReadonlySet<string> = NO_CUBES,
  opened: Opened = NONE_OPEN,
): Tokens {
  if (whyNotStand(map, tokens, memberId, at, others, opened) !== null) return tokens;
  const current = tokens.get(memberId);
  if (current && sameCube(current, at)) return tokens;
  const next = new Map(tokens);
  next.set(memberId, { x: at.x, y: at.y, z: at.z });
  return next;
}

/**
 * Is a token standing inside the storey this band shows (R-185)?
 *
 * **Both** its cube and the floor beneath it. A plane is a floor and belongs
 * to what is above it (R-146), so a storey is the levels from its floor up to
 * the next plane — and a token is in it when it stands on that floor or on
 * something within it, with its own cube inside too.
 *
 * Each half rules out a different wrong answer. Floor alone would admit a
 * token standing on the top of the storey's walls, its cube level with the
 * slab of the storey above — which the table may not be told is there. Cube
 * alone would admit a token whose floor was cut away, drawn hanging over
 * nothing.
 */
export function standsInBand(range: LevelRange, at: BlockCoord): boolean {
  return inRange(range, at.y) && inRange(range, at.y - 1);
}

/** The tokens standing inside a band (R-185). Identity-preserving. */
export function tokensInBand(tokens: Tokens, range: LevelRange): Tokens {
  const keep = [...tokens].filter(([, at]) => standsInBand(range, at));
  return keep.length === tokens.size ? tokens : new Map(keep);
}

/**
 * Only the members still on the roster. Identity-preserving.
 *
 * Read through rather than pruned on the spot, the way the world's pawns are
 * (`pawns`): removing a member is an authored edit and undoable (R-140), and
 * undoing it brings them back standing where they were, because the save
 * never forgot. The stale entry goes the next time that map's positions are
 * written, or when the campaign next opens — and until then it is in nobody's
 * way, because every reader reads through this.
 */
export function onRoster(
  tokens: Tokens,
  roster: readonly { readonly id: MemberId }[],
): Tokens {
  const live = new Set(roster.map((member) => member.id));
  const keep = [...tokens].filter(([id]) => live.has(id));
  return keep.length === tokens.size ? tokens : new Map(keep);
}

/**
 * The roster members not standing anywhere in this map, **in roster order**.
 *
 * The order is what placement walks through: arming the Move tool holds the
 * first of these, and confirming one arms the next (R-188, D-167).
 */
export function unplaced(
  roster: readonly { readonly id: MemberId }[],
  tokens: Tokens,
): readonly MemberId[] {
  return roster.filter((member) => !tokens.has(member.id)).map((member) => member.id);
}

/**
 * The cells of a patch that nobody is standing in (R-186).
 *
 * Build skips them, the way it skips cells already holding a block (R-162):
 * a brush lands where it can and leaves the rest. Returns the same array when
 * nothing is in the way.
 */
export function clearOfTokens(
  cells: readonly BlockCoord[],
  tokens: Tokens,
): readonly BlockCoord[] {
  if (tokens.size === 0) return cells;
  const clear = cells.filter((at) => standingAt(tokens, at) === null);
  return clear.length === cells.length ? cells : clear;
}

/**
 * Drops the tokens whose cube can no longer be stood in (D-256).
 *
 * Positions are remembered per map, and a cube can be built over while the
 * party is somewhere else — nothing clips a brush around tokens that are not
 * present (R-186). So the way back in repairs it: that member is placed again.
 * A token left **floating** is kept, because floating is a state the GM can
 * put somebody in (R-186); a token inside a block is not.
 *
 * Identity-preserving (R-165).
 */
export function settled(
  map: EncounterMap,
  tokens: Tokens,
  others: ReadonlySet<string> = NO_CUBES,
  opened: Opened = NONE_OPEN,
): Tokens {
  /*
   * And not where somebody else now stands. A goblin placed while the party
   * was elsewhere can be on the cube a member was last remembered in — the
   * memory is no presence, so nothing refused it (D-307). The member is
   * placed again, as for a cube built over — and for a prop put there (D-322).
   */
  const blocked = map.props.length > 0 ? propRules(map.props, opened).walking : NO_CUBES;
  const keep = [...tokens].filter(([, at]) =>
    inMap(map, at) && !blockAt(map, at) && !others.has(blockKey(at)) && !blocked.has(blockKey(at)));
  return keep.length === tokens.size ? tokens : new Map(keep);
}

/**
 * How far a token would fall to the first block beneath it: zero when it is
 * standing on one (R-34, R-186).
 *
 * The length of the stalk a floating token draws. With nothing at all below
 * it, the stalk runs to bedrock, which is as far down as a map goes (R-161).
 */
export function dropBelow(map: EncounterMap, at: BlockCoord): number {
  for (let y = at.y - 1; y >= MAP_MIN_DEPTH; y -= 1) {
    if (blockAt(map, { x: at.x, y, z: at.z })) return at.y - (y + 1);
  }
  return at.y - MAP_MIN_DEPTH;
}

export type TokensJSON = Record<string, { x: number; y: number; z: number }>;

/** Sorted by member, so a file that did not change does not diff (R-59's spirit). */
export function tokensToJSON(tokens: Tokens): TokensJSON {
  const out: TokensJSON = {};
  for (const id of [...tokens.keys()].sort()) {
    const at = tokens.get(id)!;
    out[id] = { x: at.x, y: at.y, z: at.z };
  }
  return out;
}

export function tokensFromJSON(json: Readonly<TokensJSON> | undefined | null): Tokens {
  if (!json) return NO_TOKENS;
  return new Map(
    Object.entries(json).map(([id, at]) => [id as MemberId, { x: at.x, y: at.y, z: at.z }]),
  );
}
