// Silver tokens: everyone in a map who is not the party (D-307) — a goblin
// from the Tokens Library, placed on a floor, named so the table can say
// which one: *"goblin N7"*.
//
// **The GM's, not the players'** (R-136): every change to one is GM-only, and
// the table is sent one only while the party can see it (R-206).
//
// **Play state, in the save**, like the party's tokens — so undo never touches
// them (R-140) and deleting one asks first instead. Unlike the party's, they
// are present in every map whether or not the party is in it: the GM lays a
// dungeon's goblins out before anybody walks in.

import type { SilverId, TemplateId } from '../ids/index.js';
import { freshId } from '../ids/index.js';
import type { BlockCoord, EncounterMap } from '../map/index.js';
import { blockAt, blockKey, inMap } from '../map/index.js';
import type { LevelRange } from '../planes/index.js';
import type { Footing, Tokens } from '../tokens/index.js';
import { sameCube, standingAt, standsInBand } from '../tokens/index.js';
import type { TokenTemplate } from '../library/index.js';

export interface SilverToken {
  readonly id: SilverId;
  /** The library entry it was placed from: its picture, and its fate (D-307). */
  readonly templateId: TemplateId;
  /** Its own name, and the one the table hears: "Goblin N7". The GM may rename it. */
  readonly name: string;
  readonly at: BlockCoord;
  /**
   * Kept off the table even where the party could see it — an invisible
   * stalker in plain sight. It can only hide more: nothing shows a token the
   * party cannot see (R-206).
   */
  readonly hidden: boolean;
}

/** One map's silver tokens, in the order they were placed. */
export type SilverTokens = readonly SilverToken[];

export const NO_SILVER: SilverTokens = [];

export const MAX_SILVER_NAME = 48;

/**
 * The letters a name's suffix is drawn from: A to Z without **I** and **O**,
 * which a table reads as 1 and 0 (D-307).
 */
export const SUFFIX_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** The silver token standing in a cube, if any. */
export function silverAt(silver: SilverTokens, at: BlockCoord): SilverToken | null {
  return silver.find((token) => sameCube(token.at, at)) ?? null;
}

/** The cubes silver tokens stand in, by `blockKey` — for the party's footing. */
export function silverCubes(silver: SilverTokens, except?: SilverId | string): ReadonlySet<string> {
  return new Set(silver.filter((token) => token.id !== except).map((token) => blockKey(token.at)));
}

/**
 * A name for a new token placed from `base`: `"Goblin N7"` — one letter, one
 * digit, picked at random and **not already used in this map** (D-307).
 * Compared without case, so "goblin n7" and "Goblin N7" are the same name.
 *
 * Random tries first, then every pair in order, so a crowded map still gets
 * one: 240 per base name. Past that, two digits.
 */
export function nameFor(
  base: string,
  taken: Iterable<string>,
  random: () => number = Math.random,
): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  const named = (suffix: string) => `${base} ${suffix}`;
  const free = (suffix: string) => !used.has(named(suffix).toLowerCase());
  const pick = (count: number) => Math.min(count - 1, Math.floor(random() * count));
  for (let tries = 0; tries < 24; tries += 1) {
    const suffix = `${SUFFIX_LETTERS[pick(SUFFIX_LETTERS.length)]}${pick(10)}`;
    if (free(suffix)) return named(suffix);
  }
  for (const letter of SUFFIX_LETTERS) {
    for (let digit = 0; digit < 10; digit += 1) if (free(`${letter}${digit}`)) return named(`${letter}${digit}`);
  }
  for (const letter of SUFFIX_LETTERS) {
    for (let digits = 10; digits < 100; digits += 1) if (free(`${letter}${digits}`)) return named(`${letter}${digits}`);
  }
  return named(String(used.size));
}

/**
 * Why a silver token cannot stand in a cube, or `null` when it can.
 *
 * The party's footing rule (R-184) — a floor beneath, nothing in the cube —
 * and **one to a cube, gold or silver** (D-307). `party` is the party's tokens
 * *present* in this map; a member remembered in a map the party has left is
 * nobody's obstacle, and is placed again if a goblin takes the cube (D-256).
 * The token being moved is not in its own way.
 */
export function whyNotPlace(
  map: EncounterMap,
  party: Tokens,
  silver: SilverTokens,
  at: BlockCoord,
  self?: SilverId | string,
): Footing | null {
  if (!inMap(map, at)) return 'outside';
  if (blockAt(map, at)) return 'solid';
  if (!blockAt(map, { x: at.x, y: at.y - 1, z: at.z })) return 'unsupported';
  if (standingAt(party, at) !== null) return 'taken';
  const there = silverAt(silver, at);
  if (there && there.id !== self) return 'taken';
  return null;
}

/**
 * Places a new token from a library entry, named for it (D-307). Refuses
 * rather than repairs: a cube it cannot stand in leaves the list as it was.
 * The new token is the last of the list.
 */
export function spawnSilver(
  map: EncounterMap,
  party: Tokens,
  silver: SilverTokens,
  template: TokenTemplate,
  at: BlockCoord,
  random: () => number = Math.random,
): SilverTokens {
  if (whyNotPlace(map, party, silver, at) !== null) return silver;
  const token: SilverToken = {
    id: freshId<'SilverId'>('silver'),
    templateId: template.id,
    name: nameFor(template.name, silver.map((other) => other.name), random),
    at: { x: at.x, y: at.y, z: at.z },
    hidden: false,
  };
  return [...silver, token];
}

function mapToken(
  silver: SilverTokens,
  id: SilverId | string,
  change: (token: SilverToken) => SilverToken,
): SilverTokens {
  let touched = false;
  const next = silver.map((token) => {
    if (token.id !== id) return token;
    const changed = change(token);
    if (changed !== token) touched = true;
    return changed;
  });
  return touched ? next : silver;
}

/** Moves one, if the cube will take it. Identity-preserving (R-165). */
export function moveSilver(
  map: EncounterMap,
  party: Tokens,
  silver: SilverTokens,
  id: SilverId | string,
  at: BlockCoord,
): SilverTokens {
  if (whyNotPlace(map, party, silver, at, id) !== null) return silver;
  return mapToken(silver, id, (token) => (sameCube(token.at, at)
    ? token
    : { ...token, at: { x: at.x, y: at.y, z: at.z } }));
}

/** Renames one. A blank name keeps the old one rather than leaving it nameless. */
export function renameSilver(silver: SilverTokens, id: SilverId | string, name: string): SilverTokens {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_SILVER_NAME);
  return mapToken(silver, id, (token) => (!clean || clean === token.name ? token : { ...token, name: clean }));
}

/** Keeps one off the table, or lets the party see it again (R-206). */
export function hideSilver(silver: SilverTokens, id: SilverId | string, hidden: boolean): SilverTokens {
  return mapToken(silver, id, (token) => (token.hidden === hidden ? token : { ...token, hidden }));
}

export function removeSilver(silver: SilverTokens, id: SilverId | string): SilverTokens {
  const next = silver.filter((token) => token.id !== id);
  return next.length === silver.length ? silver : next;
}

/**
 * Only the tokens whose library entry still exists. Deleting an entry takes
 * its tokens with it (D-307); a campaign that was not open when it went does
 * this on opening.
 */
export function onLibrary(silver: SilverTokens, live: ReadonlySet<string>): SilverTokens {
  const next = silver.filter((token) => live.has(token.templateId));
  return next.length === silver.length ? silver : next;
}

/**
 * Drops the tokens standing inside a block — built over while nobody was
 * looking. The party's rule (D-256): a token in a wall is not a state anybody
 * can put one in.
 */
export function settledSilver(map: EncounterMap, silver: SilverTokens): SilverTokens {
  const next = silver.filter((token) => inMap(map, token.at) && !blockAt(map, token.at));
  return next.length === silver.length ? silver : next;
}

/**
 * The silver tokens the players may see (R-206): inside the band, in a cube
 * the party sees **right now**, and not hidden by the GM.
 *
 * **One rule, two readers.** The host cuts the table's payload with it, and
 * the console's Party's view draws with it — so the preview cannot show the
 * GM a goblin the table will not get (D-311), which it did for one round
 * because the console drew every token it held.
 */
export function silverShown(silver: SilverTokens, sight: ReadonlySet<string>, range: LevelRange): SilverTokens {
  const next = silver.filter((token) =>
    !token.hidden && standsInBand(range, token.at) && sight.has(blockKey(token.at)));
  return next.length === silver.length ? silver : next;
}

/** The tokens standing inside a band (R-185). Identity-preserving. */
export function silverInBand(silver: SilverTokens, range: LevelRange): SilverTokens {
  const next = silver.filter((token) => standsInBand(range, token.at));
  return next.length === silver.length ? silver : next;
}

export interface SilverTokenJSON {
  id: string;
  templateId: string;
  name: string;
  at: { x: number; y: number; z: number };
  hidden?: boolean | undefined;
}

export function silverToJSON(silver: SilverTokens): SilverTokenJSON[] {
  return silver.map((token) => ({
    id: token.id,
    templateId: token.templateId,
    name: token.name,
    at: { x: token.at.x, y: token.at.y, z: token.at.z },
    ...(token.hidden ? { hidden: true } : {}),
  }));
}

export function silverFromJSON(json: readonly SilverTokenJSON[] | undefined | null): SilverTokens {
  if (!json || json.length === 0) return NO_SILVER;
  return json.map((token) => ({
    id: token.id as SilverId,
    templateId: token.templateId as TemplateId,
    name: token.name,
    at: { x: token.at.x, y: token.at.y, z: token.at.z },
    hidden: token.hidden === true,
  }));
}
