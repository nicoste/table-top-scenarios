// The Move sequence and its rules (R-184, R-185, R-188). Pure, so tested here
// rather than excused by R-23 for living next to a canvas (R-23b).

import { describe, it, expect } from 'vitest';
import type { BlockCoord, MemberId, SwatchId, Tokens } from '@tt/domain';
import {
  createMap, setBlock, addPlane, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, DEFAULT_FLOOR, sliceOf, NO_TOKENS,
} from '@tt/domain';
import type { FacePick } from '@tt/render';
import {
  still, grab, armedStride, tokenAim, aimStride, strideGhost, strideIntent,
  tableCeiling, standVerdict, tokenAction, stridePrompt, jumps, mapAction, mapAllowed,
} from '@tt/client-core';
import type { Stride } from '@tt/client-core';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const face = (block: BlockCoord, step: BlockCoord): FacePick => ({
  block,
  adjacent: { x: block.x + step.x, y: block.y + step.y, z: block.z + step.z },
});
const tokens = (entries: Record<string, BlockCoord>): Tokens =>
  new Map(Object.entries(entries).map(([id, at]) => [id as MemberId, at]));
const aiming = (stride: Stride) => stride as Extract<Stride, { step: 'aiming' }>;
const STONE = 'material:stone' as SwatchId;

describe('a token is aimed by a block\'s top face (R-184)', () => {
  it('stands in the cube above the block pointed at', () => {
    expect(tokenAim(face(cube(3, 0, 3), cube(0, 1, 0)))).toEqual(cube(3, 1, 3));
  });

  it('aims at nothing from a side face, so pointing at a wall never puts somebody on it', () => {
    expect(tokenAim(face(cube(3, 1, 3), cube(1, 0, 0)))).toBeNull();
    expect(tokenAim(face(cube(3, 1, 3), cube(0, 0, -1)))).toBeNull();
    expect(tokenAim(null)).toBeNull();
  });

  it('puts somebody on a ladder\'s rung, whichever face of it is pointed at (D-357)', () => {
    const ladderFace = face(cube(5, 2, 3), cube(-1, 0, 0));
    expect(tokenAim(face(cube(6, 2, 3), cube(-1, 0, 0)), ladderFace, true)).toEqual(cube(5, 2, 3));
    expect(tokenAim(face(cube(6, 2, 3), cube(-1, 0, 0)), face(cube(5, 2, 3), cube(0, 1, 0)), true)).toEqual(cube(5, 2, 3));
  });

  it('stands on the top of a prop nearer than the floor behind it, and past its side on that floor (D-350)', () => {
    const floor = face(cube(3, 0, 3), cube(0, 1, 0));
    expect(tokenAim(floor, face(cube(3, 1, 3), cube(0, 1, 0)))).toEqual(cube(3, 2, 3));
    expect(tokenAim(floor, face(cube(3, 1, 3), cube(-1, 0, 0)))).toEqual(cube(3, 1, 3));
  });
});

describe('the sequence arms itself when somebody is waiting (D-167, R-188)', () => {
  it('holds the next member to place while Move is in hand', () => {
    expect(armedStride(still, true, 'aldra')).toEqual(grab('aldra'));
  });

  it('does nothing while there is nobody left to place', () => {
    expect(armedStride(still, true, null)).toBe(still);
  });

  it('keeps a sequence already running, whoever is next', () => {
    const running = aimStride(grab('brann'), cube(2, 1, 2), null);
    expect(armedStride(running, true, 'aldra')).toBe(running);
  });

  it('drops the sequence when the tool is put down', () => {
    expect(armedStride(grab('aldra'), false, 'aldra')).toBe(still);
    expect(armedStride(still, false, 'aldra')).toBe(still);
  });
});

describe('aiming (R-132, R-138)', () => {
  it('shows a ghost only where the move would be made', () => {
    const fine = aimStride(grab('aldra'), cube(2, 1, 2), null);
    expect(strideGhost(fine)).toEqual(cube(2, 1, 2));
    const refused = aimStride(grab('aldra'), cube(2, 1, 2), 'a block is there');
    expect(strideGhost(refused)).toBeNull();
  });

  it('preserves identity while the pointer stays on one cube', () => {
    const once = aimStride(grab('aldra'), cube(2, 1, 2), null);
    expect(aimStride(once, cube(2, 1, 2), null)).toBe(once);
  });

  it('sends a move that names its map, so a stale one is refused rather than replayed', () => {
    const ready = aiming(aimStride(grab('aldra'), cube(2, 1, 2), null));
    expect(strideIntent(ready, cube(2, 1, 2), 'place_1', 'poi_1')).toEqual({
      kind: 'moveToken', placeId: 'place_1', poiId: 'poi_1', memberId: 'aldra', at: cube(2, 1, 2),
    });
  });
});

describe('a move in progress owns the click (D-174, R-188)', () => {
  it('confirms or cancels while aiming, whatever is under the pointer', () => {
    expect(tokenAction({ memberId: 'brann' }, true)).toEqual({ kind: 'confirm' });
    expect(tokenAction(null, true)).toEqual({ kind: 'confirm' });
  });

  it('picks a token otherwise, and nothing else does anything', () => {
    expect(tokenAction({ memberId: 'brann' }, false)).toEqual({ kind: 'pickToken', memberId: 'brann' });
    expect(tokenAction(null, false)).toEqual({ kind: 'nothing' });
  });
});

describe('a screen judges a cube from what it holds (R-185, R-138)', () => {
  const map = () => createMap();

  it('says why a cube cannot be stood in', () => {
    const built = setBlock(map(), cube(4, 1, 4), STONE);
    const standing = tokens({ brann: cube(6, 1, 6) });
    expect(standVerdict(built, standing, 'aldra', cube(4, 1, 4), null)).toBe('a block is there');
    expect(standVerdict(built, standing, 'aldra', cube(3, 3, 3), null)).toBe('nothing to stand on');
    expect(standVerdict(built, standing, 'aldra', cube(6, 1, 6), null)).toBe('somebody is standing there');
    expect(standVerdict(built, standing, 'aldra', cube(40, 1, 3), null)).toBe('outside the map');
    expect(standVerdict(built, standing, 'aldra', cube(3, 1, 3), null)).toBeNull();
  });

  it('judges the levels first, as the host does for the table (R-85)', () => {
    // A block at 4 and a band of [0, 4): the cube at 4 is behind the cut.
    const built = setBlock(setBlock(map(), cube(3, 3, 3), STONE), cube(3, 4, 3), STONE);
    expect(standVerdict(built, NO_TOKENS, 'aldra', cube(3, 4, 3), { band: { lower: 0, upper: 4 } }))
      .toBe('outside the levels being shown');
  });

  it('gives the table a ceiling at the first level above the highest it was shown', () => {
    // Planes at 4 and 8, a storey of [4, 8) with something at 7: the table is
    // sent 4 to 7 and the plane list, and the band can only stop at a plane.
    let body = setBlock(setBlock(map(), cube(2, 4, 2), DEFAULT_FLOOR), cube(2, 7, 2), STONE);
    body = { ...body, planes: addPlane(addPlane(body.planes, 'Ground', 4, MAP_MAX_HEIGHT, MAP_MIN_DEPTH), 'Upstairs', 8, MAP_MAX_HEIGHT, MAP_MIN_DEPTH) };
    const slice = sliceOf(body, { lower: 4, upper: 8 });
    expect(tableCeiling(slice)).toBe(8);
    // Standing on the thing at 7 would be the cube at 8 — the slab upstairs.
    expect(standVerdict(slice, NO_TOKENS, 'aldra', cube(2, 8, 2), { ceiling: 8 }))
      .toBe('above the levels being shown');
    expect(standVerdict(slice, NO_TOKENS, 'aldra', cube(2, 5, 2), { ceiling: 8 })).toBeNull();
  });

  it('lets the table stand somebody only where the party has seen, as the host does (D-275)', () => {
    const seen = new Set(['3,1,3']);
    expect(standVerdict(map(), NO_TOKENS, 'aldra', cube(5, 1, 5), { ceiling: 8 }, seen))
      .toBe('the party has not seen it');
    expect(standVerdict(map(), NO_TOKENS, 'aldra', cube(3, 1, 3), { ceiling: 8 }, seen)).toBeNull();
    // Still the levels first: a cube above them is that, whatever was seen.
    expect(standVerdict(map(), NO_TOKENS, 'aldra', cube(3, 9, 3), { ceiling: 8 }, new Set(['3,9,3'])))
      .toBe('above the levels being shown');
    // And the console, which passes no sight, stands anybody anywhere (R-39).
    expect(standVerdict(map(), NO_TOKENS, 'aldra', cube(5, 1, 5), null)).toBeNull();
  });

  it('lets the table stand somebody on a roof when nothing is cut', () => {
    // Uncut, the only stop above anything is the Sun.
    const roofed = setBlock(map(), cube(2, 9, 2), STONE);
    expect(tableCeiling(roofed)).toBe(MAP_MAX_HEIGHT);
  });
});

describe('Move is a tool of its own (D-258)', () => {
  it('edits no block, whatever face is under the pointer', () => {
    const reach = {
      brush: { id: 'cube', name: 'Cube', span: 1, rise: 1 }, alt: false, shift: true, within: null,
    };
    expect(mapAction('move', face(cube(3, 0, 3), cube(0, 1, 0)), reach)).toEqual({ kind: 'nothing' });
  });
});

describe('build says before the click that somebody is standing there (R-186)', () => {
  it('stops a single cube aimed at a token\'s cube', () => {
    const action = mapAction('build', face(cube(3, 0, 3), cube(0, 1, 0)), {
      brush: { id: 'cube', name: 'Cube', span: 1, rise: 1 }, alt: false, shift: false, within: null,
    });
    expect(mapAllowed(action, { occupied: false, inBounds: true, standing: true }))
      .toEqual({ kind: 'stop', why: 'somebody is standing there' });
  });
});

describe('the prompt says who and what', () => {
  const name = (id: string) => ({ aldra: 'Aldra' } as Record<string, string>)[id] ?? null;

  it('asks for a floor, a confirm, or says why not', () => {
    expect(stridePrompt(grab('aldra'), name, true)).toBe('Placing Aldra — point at a floor.');
    expect(stridePrompt(aimStride(grab('aldra'), cube(1, 1, 1), null), name, false))
      .toBe('Move Aldra here? Click to confirm, hold Shift to jump, Escape or right-click to cancel.');
    // Shift held: the move is a jump, and says how to walk instead (D-371).
    expect(stridePrompt(aimStride(grab('aldra'), cube(1, 1, 1), null), name, false, true))
      .toBe('Jump Aldra here? Click to confirm, let go of Shift to walk, Escape or right-click to cancel.');
    // Placing somebody for the first time is neither a walk nor a jump.
    expect(stridePrompt(aimStride(grab('aldra'), cube(1, 1, 1), null), name, true, true))
      .toBe('Place Aldra here? Click to confirm, Escape or right-click to cancel.');
    // Jump path chosen on screen (D-372): Shift is how to walk instead, and held, how to jump again.
    expect(stridePrompt(aimStride(grab('aldra'), cube(1, 1, 1), null), name, false, true, false))
      .toBe('Jump Aldra here? Click to confirm, hold Shift to walk, Escape or right-click to cancel.');
    expect(stridePrompt(aimStride(grab('aldra'), cube(1, 1, 1), null), name, false, false, true))
      .toBe('Move Aldra here? Click to confirm, let go of Shift to jump, Escape or right-click to cancel.');
  });

  it('a move is the path chosen on screen, and Shift does the other one (D-372)', () => {
    expect(jumps(false, false)).toBe(false);
    expect(jumps(false, true)).toBe(true);
    expect(jumps(true, false)).toBe(true);
    expect(jumps(true, true)).toBe(false);
    expect(stridePrompt(aimStride(grab('aldra'), cube(1, 1, 1), 'a block is there'), name, false))
      .toBe('Aldra: a block is there.');
    expect(stridePrompt(still, name, false)).toBeNull();
  });
});
