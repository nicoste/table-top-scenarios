import { describe, it, expect } from 'vitest';
import type { MemberId, WorldCell } from '@tt/domain';
import {
  emptyPlacement, isPartyPlaced, memberCell, pawns,
  withGroupAt, withMemberAt, gathered, scattered, prunePlacement,
  placementToJSON, placementFromJSON,
  createCampaign, createLiveSave, upgraded, SAVE_SCHEMA_VERSION,
} from '@tt/domain';
const AT = '2026-01-01T00:00:00.000Z';

const at = (cx: number, cz: number, x = 0, z = 0): WorldCell => ({ cx, cz, x, z });
const roster = (...ids: string[]) => ids.map((id) => ({ id: id as MemberId }));
const ids = (...v: string[]) => new Set(v as MemberId[]);

describe('an unplaced party', () => {
  it('starts together and nowhere', () => {
    const p = emptyPlacement();
    expect(p.together).toBe(true);
    expect(p.at).toBeNull();
    expect(isPartyPlaced(p)).toBe(false);
  });

  it('draws no pawns at all, rather than a pawn at the origin', () => {
    expect(pawns(emptyPlacement(), roster('a', 'b'))).toEqual([]);
  });
});

describe('together', () => {
  it('is one pawn wherever the party is, whoever is asking', () => {
    const p = withGroupAt(emptyPlacement(), at(4, 4, 9, 9));
    expect(pawns(p, roster('a', 'b', 'c'))).toEqual([{ memberId: null, cell: at(4, 4, 9, 9) }]);
    expect(memberCell(p, 'b' as MemberId)).toEqual(at(4, 4, 9, 9));
  });

  it('preserves identity when moved to the cell it is already on (R-165)', () => {
    const p = withGroupAt(emptyPlacement(), at(1, 1));
    expect(withGroupAt(p, at(1, 1))).toBe(p);
    expect(withGroupAt(p, at(1, 2))).not.toBe(p);
  });
});

describe('separating and gathering (D-153)', () => {
  const start = withGroupAt(emptyPlacement(), at(5, 5, 2, 2));

  it('starts everyone on the group cell, to be dragged apart', () => {
    const split = scattered(start, roster('a', 'b', 'c'));
    expect(split.together).toBe(false);
    expect(pawns(split, roster('a', 'b', 'c')).map((p) => p.cell))
      .toEqual([at(5, 5, 2, 2), at(5, 5, 2, 2), at(5, 5, 2, 2)]);
  });

  it('gathers at the first roster member, not at the group cell', () => {
    let split = scattered(start, roster('a', 'b', 'c'));
    split = withMemberAt(split, 'a' as MemberId, at(9, 9, 1, 1));
    split = withMemberAt(split, 'b' as MemberId, at(7, 7, 3, 3));

    const back = gathered(split, roster('a', 'b', 'c'));
    expect(back.together).toBe(true);
    expect(back.at).toEqual(at(9, 9, 1, 1));
  });

  it('follows the roster order it is given, so reordering changes who leads', () => {
    let split = scattered(start, roster('a', 'b'));
    split = withMemberAt(split, 'a' as MemberId, at(1, 1));
    split = withMemberAt(split, 'b' as MemberId, at(2, 2));
    expect(gathered(split, roster('b', 'a')).at).toEqual(at(2, 2));
  });

  it('forgets individual cells on gathering, so separating again is not a rewind', () => {
    let split = scattered(start, roster('a', 'b'));
    split = withMemberAt(split, 'b' as MemberId, at(8, 8));
    const again = scattered(gathered(split, roster('a', 'b')), roster('a', 'b'));
    // Everyone back on one cell, not back to where they had wandered.
    expect(new Set(pawns(again, roster('a', 'b')).map((p) => JSON.stringify(p.cell))).size).toBe(1);
  });

  it('survives an empty-ish roster without inventing a position', () => {
    expect(gathered(emptyPlacement(), []).at).toBeNull();
    expect(pawns(scattered(emptyPlacement(), roster('a')), roster('a'))).toEqual([]);
  });
});

describe('a member added while the party is separated', () => {
  it('appears where the party split, not shadowing the first member', () => {
    let split = scattered(withGroupAt(emptyPlacement(), at(6, 6)), roster('a'));
    split = withMemberAt(split, 'a' as MemberId, at(20, 20));
    // 'b' joined the roster after the split and has no cell of its own.
    expect(memberCell(split, 'b' as MemberId)).toEqual(at(6, 6));
  });
});

describe('pruning (D-155)', () => {
  it('drops a member who has left the roster', () => {
    let p = scattered(withGroupAt(emptyPlacement(), at(0, 0)), roster('keep', 'gone'));
    p = withMemberAt(p, 'gone' as MemberId, at(3, 3));
    const pruned = prunePlacement(p, ids('keep'));
    expect([...pruned.members.keys()]).toEqual(['keep']);
    expect(prunePlacement(pruned, ids('keep'))).toBe(pruned);
  });

  it('does not need pruning to stop drawing them', () => {
    // pawns() walks the roster, so a stale entry is invisible before it is pruned.
    let p = scattered(withGroupAt(emptyPlacement(), at(0, 0)), roster('keep', 'gone'));
    p = withMemberAt(p, 'gone' as MemberId, at(3, 3));
    expect(pawns(p, roster('keep')).map((x) => x.memberId)).toEqual(['keep']);
  });
});

describe('serialisation', () => {
  it('round-trips, since a Map does not survive JSON any more than a Set does', () => {
    let p = scattered(withGroupAt(emptyPlacement(), at(1, 2, 3, 4)), roster('a', 'b'));
    p = withMemberAt(p, 'b' as MemberId, at(5, 6, 7, 8));
    const back = placementFromJSON(JSON.parse(JSON.stringify(placementToJSON(p))));
    expect(back.together).toBe(false);
    expect(back.at).toEqual(at(1, 2, 3, 4));
    expect(back.members.get('b' as MemberId)).toEqual(at(5, 6, 7, 8));
  });

  it('sorts member keys, so an autosave does not churn the diff', () => {
    let p = scattered(withGroupAt(emptyPlacement(), at(0, 0)), []);
    p = withMemberAt(p, 'z' as MemberId, at(1, 1));
    p = withMemberAt(p, 'a' as MemberId, at(2, 2));
    expect(Object.keys(placementToJSON(p).members)).toEqual(['a', 'z']);
  });

  it('reads a save written before placement existed as an unplaced party', () => {
    expect(placementFromJSON(undefined)).toEqual(emptyPlacement());
    expect(placementFromJSON({})).toEqual(emptyPlacement());
  });
});

describe('schema versions (R-61)', () => {
  it('stamps the current version when the old save is adopted', () => {
    // Otherwise it gets written back still claiming to be version 1 while
    // carrying version-2 data, and later code branching on the version is wrong.
    const old = { ...createLiveSave(createCampaign('Ashfall'), AT), schemaVersion: 1 };
    const once = upgraded(old);
    expect(once.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // Idempotent, and identity-preserving the second time (R-165).
    expect(upgraded(once)).toBe(once);
  });

  it('leaves a current save alone, identity included', () => {
    const now = createLiveSave(createCampaign('Ashfall'), AT);
    expect(upgraded(now)).toBe(now);
  });
});
