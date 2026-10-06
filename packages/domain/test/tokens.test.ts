// Where the party stands in a map (R-184 to R-186).
//
// The cube is the thing vision is waiting for: R-43 measures eye height from
// the floor of a token's cube, so these tests are about what makes a cube one a
// token can stand in, and what is allowed to change that afterwards.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, MemberId, SwatchId, Tokens } from '@tt/domain';
import {
  createMap, setBlock, clearBlock, DEFAULT_FLOOR, MAP_MIN_DEPTH,
  whyNotStand, placeToken, standsInBand, tokensInBand, onRoster, unplaced, clearOfTokens,
  settled, dropBelow, standingAt, tokensToJSON, tokensFromJSON, NO_TOKENS,
  createCampaign, createLiveSave, tokensFor, tokensIn, withTokens, settleTokens, pruneTokens,
} from '@tt/domain';

const AT = '2026-01-01T00:00:00.000Z';
const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const member = (id: string) => id as MemberId;
const roster = (...ids: string[]) => ids.map((id) => ({ id: member(id) }));
const tokens = (entries: Record<string, BlockCoord>): Tokens =>
  new Map(Object.entries(entries).map(([id, at]) => [member(id), at]));

/** A new map's floor is at y0 across 16×16, so the cube above it is y1. */
const floor = () => createMap();

describe('a token stands in an empty cube, on a block (R-184)', () => {
  it('stands on the floor', () => {
    expect(whyNotStand(floor(), NO_TOKENS, member('a'), cube(3, 1, 3))).toBeNull();
  });

  it('refuses a cube that holds a block — a token occupies its cube', () => {
    const map = setBlock(floor(), cube(3, 1, 3), DEFAULT_FLOOR);
    expect(whyNotStand(map, NO_TOKENS, member('a'), cube(3, 1, 3))).toBe('solid');
  });

  it('refuses a cube with nothing beneath it — placing needs footing', () => {
    // Two up from the floor is air above air.
    expect(whyNotStand(floor(), NO_TOKENS, member('a'), cube(3, 2, 3))).toBe('unsupported');
  });

  it('stands on whatever is there, not only on the starting floor', () => {
    const map = setBlock(floor(), cube(3, 1, 3), DEFAULT_FLOOR);
    expect(whyNotStand(map, NO_TOKENS, member('a'), cube(3, 2, 3))).toBeNull();
  });

  it('refuses a cube the map does not own', () => {
    expect(whyNotStand(floor(), NO_TOKENS, member('a'), cube(16, 1, 3))).toBe('outside');
    expect(whyNotStand(floor(), NO_TOKENS, member('a'), cube(3, 1.5, 3))).toBe('outside');
  });
});

describe('one token to a cube (R-184)', () => {
  it('refuses a cube somebody else is standing in', () => {
    const standing = tokens({ b: cube(3, 1, 3) });
    expect(whyNotStand(floor(), standing, member('a'), cube(3, 1, 3))).toBe('taken');
  });

  it('does not count the mover as being in their own way', () => {
    const standing = tokens({ a: cube(3, 1, 3) });
    expect(whyNotStand(floor(), standing, member('a'), cube(3, 1, 3))).toBeNull();
  });
});

describe('placing and moving are the same act (D-150)', () => {
  it('puts a member nobody has placed into the map', () => {
    const placed = placeToken(floor(), NO_TOKENS, member('a'), cube(2, 1, 2));
    expect(placed.get(member('a'))).toEqual(cube(2, 1, 2));
  });

  it('moves a member already standing somewhere', () => {
    const before = tokens({ a: cube(2, 1, 2) });
    expect(placeToken(floor(), before, member('a'), cube(5, 1, 5)).get(member('a')))
      .toEqual(cube(5, 1, 5));
  });

  it('refuses rather than repairs: a cube that cannot be stood in changes nothing', () => {
    const before = tokens({ a: cube(2, 1, 2), b: cube(5, 1, 5) });
    const map = floor();
    expect(placeToken(map, before, member('a'), cube(5, 1, 5))).toBe(before);
    expect(placeToken(map, before, member('a'), cube(2, 3, 2))).toBe(before);
  });

  it('preserves identity when the member is already there (R-165)', () => {
    const before = tokens({ a: cube(2, 1, 2) });
    expect(placeToken(floor(), before, member('a'), cube(2, 1, 2))).toBe(before);
  });
});

describe('a token is in the band when it stands inside the storey shown (R-185)', () => {
  // Planes at 4 and 8: the ground floor is [4, 8) — its slab at 4, its rooms
  // 5 to 7. A plane belongs to what is above it (R-146).
  const ground = { lower: 4, upper: 8 };

  it('includes somebody standing on the storey\'s floor', () => {
    expect(standsInBand(ground, cube(0, 5, 0))).toBe(true);
  });

  it('includes somebody standing on something inside the storey', () => {
    expect(standsInBand(ground, cube(0, 7, 0))).toBe(true);
  });

  it('excludes somebody on top of the storey\'s walls — their cube is the next slab\'s level', () => {
    expect(standsInBand(ground, cube(0, 8, 0))).toBe(false);
  });

  it('excludes somebody whose floor was cut away beneath the band', () => {
    // Standing on 3, the cellar's top, with the cube at the ground slab's level.
    expect(standsInBand(ground, cube(0, 4, 0))).toBe(false);
  });

  it('filters a map\'s tokens, and keeps the same object when nobody is cut (R-165)', () => {
    const all = tokens({ a: cube(0, 5, 0), b: cube(0, 9, 0) });
    expect([...tokensInBand(all, ground).keys()]).toEqual([member('a')]);
    const inside = tokens({ a: cube(0, 5, 0) });
    expect(tokensInBand(inside, ground)).toBe(inside);
  });
});

describe('edits never move a token (R-186)', () => {
  it('leaves a standing token\'s cube out of a build', () => {
    const patch = [cube(1, 1, 1), cube(2, 1, 1), cube(3, 1, 1)];
    expect(clearOfTokens(patch, tokens({ a: cube(2, 1, 1) }))).toEqual([cube(1, 1, 1), cube(3, 1, 1)]);
  });

  it('returns the patch untouched when nobody is in the way', () => {
    const patch = [cube(1, 1, 1)];
    expect(clearOfTokens(patch, tokens({ a: cube(5, 1, 5) }))).toBe(patch);
  });

  it('knows how far a token would fall once the floor under it is erased', () => {
    const map = floor();
    expect(dropBelow(map, cube(3, 1, 3))).toBe(0);
    const trapdoor = clearBlock(map, cube(3, 0, 3));
    expect(dropBelow(trapdoor, cube(3, 1, 3))).toBe(1 - MAP_MIN_DEPTH);
    const ledge = setBlock(setBlock(map, cube(3, 1, 3), DEFAULT_FLOOR), cube(3, 4, 3), DEFAULT_FLOOR);
    // Standing on the block at 4; take it away and the next one down is at 1.
    expect(dropBelow(clearBlock(ledge, cube(3, 4, 3)), cube(3, 5, 3))).toBe(3);
  });
});

describe('the way back into a map repairs it (D-256)', () => {
  it('drops a position that was built over while the party was away', () => {
    const map = setBlock(floor(), cube(2, 1, 2), 'material:stone' as SwatchId);
    const remembered = tokens({ a: cube(2, 1, 2), b: cube(5, 1, 5) });
    expect([...settled(map, remembered).keys()]).toEqual([member('b')]);
  });

  it('keeps somebody left floating — that is a state the GM can put them in', () => {
    const trapdoor = clearBlock(floor(), cube(2, 0, 2));
    const remembered = tokens({ a: cube(2, 1, 2) });
    expect(settled(trapdoor, remembered)).toBe(remembered);
  });
});

describe('who is left to place (R-188)', () => {
  it('walks the roster in its own order and skips whoever is standing', () => {
    const standing = tokens({ b: cube(1, 1, 1) });
    expect(unplaced(roster('a', 'b', 'c'), standing)).toEqual([member('a'), member('c')]);
  });

  it('is nobody once everyone stands somewhere', () => {
    expect(unplaced(roster('a'), tokens({ a: cube(1, 1, 1) }))).toEqual([]);
  });

  it('reads through the roster, so a removed member stands nowhere', () => {
    const standing = tokens({ a: cube(1, 1, 1), gone: cube(2, 1, 2) });
    expect([...onRoster(standing, roster('a')).keys()]).toEqual([member('a')]);
    expect(onRoster(standing, roster('a', 'gone'))).toBe(standing);
  });
});

describe('positions are remembered per map (D-256)', () => {
  const save = () => createLiveSave(createCampaign('Ashfall'), AT);

  it('holds each map\'s positions apart', () => {
    let s = save();
    s = withTokens(s, 'poi_tavern', tokens({ a: cube(1, 1, 1) }));
    s = withTokens(s, 'poi_cellar', tokens({ a: cube(9, 1, 9) }));
    expect(tokensFor(s, 'poi_tavern').get(member('a'))).toEqual(cube(1, 1, 1));
    expect(tokensFor(s, 'poi_cellar').get(member('a'))).toEqual(cube(9, 1, 9));
  });

  it('is nobody, by default, in a map nobody has stood in', () => {
    expect(tokensFor(save(), 'poi_anywhere').size).toBe(0);
  });

  it('keeps no entry for a map everyone has left, so the record does not fill with empties', () => {
    let s = withTokens(save(), 'poi_tavern', tokens({ a: cube(1, 1, 1) }));
    s = withTokens(s, 'poi_tavern', NO_TOKENS);
    expect(s.tokens.has('poi_tavern')).toBe(false);
  });

  it('preserves identity when nothing changed (R-165)', () => {
    const s = save();
    expect(withTokens(s, 'poi_tavern', tokensFor(s, 'poi_tavern'))).toBe(s);
  });

  it('settles one map on the way in and leaves the others alone', () => {
    const built = setBlock(floor(), cube(1, 1, 1), 'material:stone' as SwatchId);
    let s = withTokens(save(), 'poi_tavern', tokens({ a: cube(1, 1, 1) }));
    s = withTokens(s, 'poi_cellar', tokens({ a: cube(1, 1, 1) }));
    const entered = settleTokens(s, 'poi_tavern', built);
    expect(tokensFor(entered, 'poi_tavern').size).toBe(0);
    expect(tokensFor(entered, 'poi_cellar').size).toBe(1);
  });

  it('forgets removed members and deleted maps when the campaign opens', () => {
    let s = withTokens(save(), 'poi_tavern', tokens({ a: cube(1, 1, 1), gone: cube(2, 1, 2) }));
    s = withTokens(s, 'poi_deleted', tokens({ a: cube(3, 1, 3) }));
    const pruned = pruneTokens(s, new Set(['poi_tavern']), new Set([member('a')]));
    expect([...pruned.tokens.keys()]).toEqual(['poi_tavern']);
    expect([...tokensFor(pruned, 'poi_tavern').keys()]).toEqual([member('a')]);
    expect(pruneTokens(pruned, new Set(['poi_tavern']), new Set([member('a')]))).toBe(pruned);
  });

  it('reads a map\'s tokens off the wire record, nobody when it has no entry', () => {
    const wire = { poi_tavern: { a: { x: 1, y: 1, z: 1 } } };
    expect(tokensIn(wire, 'poi_tavern').get(member('a'))).toEqual(cube(1, 1, 1));
    expect(tokensIn(wire, 'poi_cellar').size).toBe(0);
  });
});

describe('tokens as JSON', () => {
  it('round-trips, sorted by member so an unchanged file does not diff', () => {
    const t = tokens({ b: cube(2, 1, 2), a: cube(1, 1, 1) });
    const json = tokensToJSON(t);
    expect(Object.keys(json)).toEqual(['a', 'b']);
    expect(tokensFromJSON(json)).toEqual(t);
    expect(standingAt(tokensFromJSON(json), cube(2, 1, 2))).toBe(member('b'));
  });
});
