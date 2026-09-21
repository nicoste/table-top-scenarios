// The per-tool click matrix (R-87c). Every row of the table the GM specified,
// plus the bug that produced it.

import { describe, it, expect } from 'vitest';
import type { Cell, Pointed } from '@tt/client-core';
import {
  clickAction, holdsSelection, tableAction, mapAction, mapHover, mapDrags, mapAllowed,
  cameraAction, CAMERA_HINT,
} from '@tt/client-core';
import type { MapAim } from '@tt/client-core';
import type { Tool } from '@tt/client-core';

const cell = (x: number, z: number): Cell => ({ cx: 15, cz: 15, x, z });
const EMPTY: Pointed = { pawn: null, placeId: null, cell: null, slot: null };
const free = { occupied: () => false };
const taken = { occupied: () => true };

const ALL_TOOLS: Tool[] = ['select', 'paint', 'height', 'places', 'travel'];

describe('the bug that produced the matrix', () => {
  const onAMarker: Pointed = { ...EMPTY, placeId: 'poi_keep', cell: cell(5, 5) };

  it('does not select a place while painting', () => {
    // "you can select places while you are attempting to paint. Discovered this
    // while painting snow around the party token."
    expect(clickAction('paint', onAMarker, free)).toEqual({ kind: 'paint', cell: cell(5, 5) });
  });

  it('does not select a place while raising ground', () => {
    expect(clickAction('height', onAMarker, free)).toEqual({ kind: 'raise', cell: cell(5, 5) });
  });

  it('does not select a place while travelling', () => {
    expect(clickAction('travel', onAMarker, free)).toEqual({ kind: 'nothing' });
  });

  it('still selects it with the neutral tool', () => {
    expect(clickAction('select', onAMarker, free)).toEqual({ kind: 'selectPlace', placeId: 'poi_keep' });
  });
});

describe('a pawn standing on the terrain', () => {
  const onAPawn: Pointed = { ...EMPTY, pawn: { memberId: null }, cell: cell(7, 7) };

  it('is picked up only by travel', () => {
    expect(clickAction('travel', onAPawn, free))
      .toEqual({ kind: 'pickPawn', pawn: { memberId: null } });
  });

  it('does not block painting the ground it stands on', () => {
    expect(clickAction('paint', onAPawn, free)).toEqual({ kind: 'paint', cell: cell(7, 7) });
  });

  it('is not selectable by the select tool', () => {
    // Select picks the chunk under it, not the pawn: travel owns pawns.
    expect(clickAction('select', onAPawn, free))
      .toEqual({ kind: 'selectChunk', coord: { cx: 15, cz: 15 } });
  });
});

describe('places', () => {
  it('creates on an empty cell', () => {
    expect(clickAction('places', { ...EMPTY, cell: cell(2, 2) }, free))
      .toEqual({ kind: 'placePoi', cell: cell(2, 2) });
  });

  it('drops the click on a taken cell rather than asking to be refused', () => {
    expect(clickAction('places', { ...EMPTY, cell: cell(2, 2) }, taken))
      .toEqual({ kind: 'nothing' });
  });

  it('ignores a marker under the pointer and looks at the cell', () => {
    // The marker's own cell is what `render` reports (D-163), so this is the
    // occupied case and the click is dropped.
    expect(clickAction('places', { ...EMPTY, placeId: 'poi_keep', cell: cell(5, 5) }, taken))
      .toEqual({ kind: 'nothing' });
  });
});

describe('select', () => {
  it('prefers a place over its chunk', () => {
    expect(clickAction('select', { ...EMPTY, placeId: 'poi_keep', cell: cell(5, 5) }, free))
      .toEqual({ kind: 'selectPlace', placeId: 'poi_keep' });
  });

  it('selects the chunk from bare ground', () => {
    expect(clickAction('select', { ...EMPTY, cell: { cx: 3, cz: 4, x: 1, z: 1 } }, free))
      .toEqual({ kind: 'selectChunk', coord: { cx: 3, cz: 4 } });
  });
});

describe('an empty slot is not a mode (R-79)', () => {
  it('creates a chunk whatever the tool is', () => {
    const onASlot: Pointed = { ...EMPTY, slot: { cx: 16, cz: 15 } };
    for (const tool of ALL_TOOLS) {
      expect(clickAction(tool, onASlot, free), tool)
        .toEqual({ kind: 'createChunk', slot: { cx: 16, cz: 15 } });
    }
  });

  it('wins even when a marker is somehow also under the pointer', () => {
    const both: Pointed = { ...EMPTY, placeId: 'poi_keep', slot: { cx: 16, cz: 15 } };
    expect(clickAction('select', both, free).kind).toBe('createChunk');
  });
});

describe('empty space', () => {
  it('means nothing, for every tool', () => {
    for (const tool of ALL_TOOLS) {
      expect(clickAction(tool, EMPTY, free), tool).toEqual({ kind: 'nothing' });
    }
  });
});

describe('travel with no pawn under the pointer', () => {
  it('still means nothing here — starting the sequence is not a click (D-167)', () => {
    // This test used to read as though the dead end were correct behaviour. It
    // is right that a click on bare ground picks up nothing; what was missing is
    // that the sequence arms itself when there is nothing to pick up, which is
    // `armed()` in the travel module, not a row of this table.
    expect(clickAction('travel', { ...EMPTY, cell: cell(1, 1) }, free))
      .toEqual({ kind: 'nothing' });
  });
});

describe('which tool holds a selection (D-168)', () => {
  it('is the neutral tool, and only it', () => {
    expect(holdsSelection('select')).toBe(true);
    for (const tool of ALL_TOOLS.filter((t) => t !== 'select')) {
      expect(holdsSelection(tool), tool).toBe(false);
    }
  });

  it('agrees with what the click table can actually select', () => {
    // Tied together on purpose. A sixth tool that can select something must
    // also hold it, or its inspector opens and is wiped by the next render;
    // one that cannot select must not hold one, or a stale panel lingers.
    // This fails if only one of the two is updated.
    const onAMarker: Pointed = { ...EMPTY, placeId: 'poi_keep', cell: cell(5, 5) };
    const onGround: Pointed = { ...EMPTY, cell: cell(5, 5) };

    for (const tool of ALL_TOOLS) {
      const canSelect = [onAMarker, onGround]
        .map((pointed) => clickAction(tool, pointed, free).kind)
        .some((kind) => kind === 'selectPlace' || kind === 'selectChunk');
      expect(holdsSelection(tool), tool).toBe(canSelect);
    }
  });
});

describe('the table display has no tools, so the rule is different (D-174)', () => {
  const onAPawn: Pointed = { ...EMPTY, pawn: { memberId: null }, cell: cell(7, 7) };
  const onAPlace: Pointed = { ...EMPTY, placeId: 'poi_keep', cell: cell(5, 5) };

  it('starts a move from a pawn', () => {
    expect(tableAction(onAPawn, false)).toEqual({ kind: 'pickPawn', pawn: { memberId: null } });
  });

  it('selects a place', () => {
    expect(tableAction(onAPlace, false)).toEqual({ kind: 'selectPlace', placeId: 'poi_keep' });
  });

  it('clears the selection on bare ground', () => {
    // No chunk to inspect and no tool to go back to, so clicking nothing is the
    // way out of a selection.
    expect(tableAction({ ...EMPTY, cell: cell(1, 1) }, false)).toEqual({ kind: 'clearSelection' });
    expect(tableAction(EMPTY, false)).toEqual({ kind: 'clearSelection' });
  });

  it('gives a travel in progress the click, whatever is under it', () => {
    // "you tap on the player token, then selecting a place should keep going
    // with the travel flow, not select the place."
    for (const pointed of [onAPawn, onAPlace, EMPTY, { ...EMPTY, cell: cell(2, 2) }]) {
      expect(tableAction(pointed, true)).toEqual({ kind: 'travel' });
    }
  });

  it('never offers a player anything that edits the world', () => {
    // Whatever is under the pointer, on either branch, the answer is one of
    // four — and none of them paints, raises, places or selects a chunk (R-136).
    const allowed = new Set(['nothing', 'travel', 'pickPawn', 'selectPlace', 'clearSelection']);
    for (const aiming of [true, false]) {
      for (const pointed of [onAPawn, onAPlace, EMPTY, { ...EMPTY, slot: { cx: 1, cz: 1 } }]) {
        expect(allowed.has(tableAction(pointed, aiming).kind)).toBe(true);
      }
    }
  });
});

describe('face adjacency inside a map (D-181)', () => {
  const face = { block: { x: 3, y: 2, z: 5 }, adjacent: { x: 3, y: 3, z: 5 } };

  it('builds against the face, not on the block that was hit', () => {
    // Click the top of a block and the new one lands on top. Reading the wrong
    // field of the same pick digs a hole where a wall should go.
    expect(mapAction('build', face)).toEqual({ kind: 'place', at: { x: 3, y: 3, z: 5 } });
  });

  it('erases the block that was hit, not its neighbour', () => {
    expect(mapAction('erase', face)).toEqual({ kind: 'erase', at: { x: 3, y: 2, z: 5 } });
  });

  it('means nothing when the pointer is over no face at all', () => {
    expect(mapAction('build', null)).toEqual({ kind: 'nothing' });
    expect(mapAction('erase', null)).toEqual({ kind: 'nothing' });
  });

  it('never confuses the two, whichever way the face points', () => {
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      const block = { x: 4, y: 4, z: 4 };
      const f = { block, adjacent: { x: 4 + dx!, y: 4 + dy!, z: 4 + dz! } };
      expect(mapAction('build', f)).toEqual({ kind: 'place', at: f.adjacent });
      expect(mapAction('erase', f)).toEqual({ kind: 'erase', at: block });
    }
  });
});

describe('mapHover — what the GM is told is about to happen (R-153)', () => {
  const face = { block: { x: 4, y: 1, z: 7 }, adjacent: { x: 4, y: 2, z: 7 } };

  it('outlines the very cube a click would place', () => {
    const hover = mapHover(mapAction('build', face));
    expect(hover.ghost).toEqual(face.adjacent);
    expect(hover.label).toBe('Build at 4,2,7');
  });

  it('outlines the block a click would remove, not the space beside it', () => {
    // The off-by-one-along-the-normal that R-147 exists to prevent. Deriving
    // both the words and the outline from one MapAction is what keeps the thing
    // that lights up and the thing that changes the same thing.
    const hover = mapHover(mapAction('erase', face));
    expect(hover.ghost).toEqual(face.block);
    expect(hover.label).toBe('Erase 4,1,7');
  });

  it('shows nothing when the pointer is over nothing', () => {
    const hover = mapHover(mapAction('build', null));
    expect(hover).toEqual({ label: null, ghost: null });
  });

  it('never disagrees with itself about which cube it means', () => {
    for (const tool of ['build', 'erase'] as const) {
      const action = mapAction(tool, face);
      const hover = mapHover(action);
      expect(hover.ghost, tool).toBe(action.kind === 'nothing' ? null : action.at);
      expect(hover.label, tool).toContain(
        `${hover.ghost!.x},${hover.ghost!.y},${hover.ghost!.z}`,
      );
    }
  });
});

describe('the map toolset (R-153, R-154)', () => {
  const face = { block: { x: 4, y: 1, z: 7 }, adjacent: { x: 4, y: 2, z: 7 } };

  it('gives build the empty cell and every other tool the block itself', () => {
    // The off-by-one-along-the-normal, once per tool. Build is the only one that
    // acts on a cell that is not there yet; paint and fill act on what you see,
    // which is where erase already acted.
    expect(mapAction('build', face)).toEqual({ kind: 'place', at: face.adjacent });
    expect(mapAction('erase', face)).toEqual({ kind: 'erase', at: face.block });
    expect(mapAction('paint', face)).toEqual({ kind: 'paint', at: face.block });
    expect(mapAction('fill', face)).toEqual({ kind: 'fill', at: face.block });
  });

  it('does nothing for any tool when the pointer is over nothing', () => {
    for (const tool of ['build', 'erase', 'paint', 'fill'] as const) {
      expect(mapAction(tool, null), tool).toEqual({ kind: 'nothing' });
    }
  });

  it('lets only the brush drag', () => {
    // The test is whether the gesture moves its own target, not whether it is
    // destructive. Build climbs its own cubes and erase eats into what it
    // exposes; paint leaves the geometry exactly where it was. Fill is out for
    // the other reason: it is already a bulk action.
    expect(mapDrags('paint')).toBe(true);
    expect(mapDrags('build')).toBe(false);
    expect(mapDrags('erase')).toBe(false);
    expect(mapDrags('fill')).toBe(false);
  });

  it('says how many blocks a fill would repaint, and only for a fill', () => {
    const reach = (total: number, unseen = 0) => ({ total, unseen });
    expect(mapHover(mapAction('fill', face), reach(42)).label).toBe('Fill from 4,1,7 — 42 blocks');
    expect(mapHover(mapAction('fill', face), reach(1)).label).toBe('Fill from 4,1,7 — 1 block');
    // The count is the client's to compute, so the label must survive not
    // having it rather than printing "undefined blocks".
    expect(mapHover(mapAction('fill', face)).label).toBe('Fill from 4,1,7');
    expect(mapHover(mapAction('paint', face), reach(42)).label).toBe('Paint 4,1,7');
  });

  it('warns how much of a fill reaches past the levels being shown (R-159)', () => {
    // A fill follows connected material straight through a cut, so with levels
    // hidden the honest readout says how much of it the GM cannot see.
    expect(mapHover(mapAction('fill', face), { total: 42, unseen: 12 }).label)
      .toBe('Fill from 4,1,7 — 42 blocks, 12 unseen');
    expect(mapHover(mapAction('fill', face), { total: 42, unseen: 0 }).label)
      .toBe('Fill from 4,1,7 — 42 blocks');
  });

  it('outlines the block each tool would touch', () => {
    for (const tool of ['erase', 'paint', 'fill'] as const) {
      expect(mapHover(mapAction(tool, face)).ghost, tool).toEqual(face.block);
    }
    expect(mapHover(mapAction('build', face)).ghost).toEqual(face.adjacent);
  });
});

describe('the camera keys are the same on both screens (R-156)', () => {
  it('binds turn and tilt, and nothing else', () => {
    expect(cameraAction('KeyQ')).toEqual({ kind: 'turn', steps: -1 });
    expect(cameraAction('KeyE')).toEqual({ kind: 'turn', steps: 1 });
    expect(cameraAction('KeyR')).toEqual({ kind: 'tilt', steps: 1 });
    expect(cameraAction('KeyF')).toEqual({ kind: 'tilt', steps: -1 });
  });

  it('turns are opposite and tilts are opposite', () => {
    const q = cameraAction('KeyQ')!;
    const e = cameraAction('KeyE')!;
    expect(q.steps).toBe(-e.steps);
    expect(cameraAction('KeyR')!.steps).toBe(-cameraAction('KeyF')!.steps);
  });

  it('leaves every key it does not own alone', () => {
    // The digits are tools, which differ per surface and per seat (R-148), and
    // Escape belongs to whatever is in progress.
    for (const code of ['Digit1', 'Digit4', 'Escape', 'KeyZ', 'BracketLeft', 'KeyW']) {
      expect(cameraAction(code), code).toBeNull();
    }
  });

  it('describes the controls it actually implements', () => {
    // The legend both screens print. If a binding moved and this did not, the
    // help would be a lie on two screens at once.
    for (const key of ['Q/E', 'R/F']) expect(CAMERA_HINT).toContain(key);
    expect(CAMERA_HINT).toContain('pan');
    expect(CAMERA_HINT).toContain('zoom');
  });
});

describe('what a click may do while levels are hidden (R-159)', () => {
  const face = { block: { x: 4, y: 1, z: 7 }, adjacent: { x: 4, y: 2, z: 7 } };
  const band = { lower: 0, upper: 4 };
  const aim = (over: Partial<MapAim> = {}): MapAim =>
    ({ levelling: false, range: band, occupied: false, inBounds: true, ...over });

  it('refuses to build into a cell that already holds a block', () => {
    // Impossible while everything is drawn — a face you can see has air in
    // front of it. Hiding levels breaks that, because a ray passes through
    // what is hidden and lands on the far side.
    expect(mapAllowed(mapAction('build', face), aim({ occupied: true })))
      .toEqual({ kind: 'stop', why: 'a block is already there' });
    expect(mapAllowed(mapAction('build', face), aim())).toEqual({ kind: 'go' });
  });

  it('refuses a placement above the band, but only while levelling', () => {
    // `face.adjacent` is y=2, so a band of [0,2) puts it just outside — the
    // block would be placed and then vanish, which is worse than a refusal.
    const tight = { lower: 0, upper: 2 };
    expect(mapAllowed(mapAction('build', face), aim({ levelling: true, range: tight })))
      .toEqual({ kind: 'stop', why: 'outside the levels you are showing' });
    // Same cell, same band, levels all shown: perfectly fine, and a GM
    // building above the band is not making a mistake.
    expect(mapAllowed(mapAction('build', face), aim({ levelling: false, range: tight })))
      .toEqual({ kind: 'go' });
  });

  it('refuses a placement below the band too', () => {
    const upstairs = { lower: 8, upper: 12 };
    expect(mapAllowed(mapAction('build', face), aim({ levelling: true, range: upstairs })))
      .toEqual({ kind: 'stop', why: 'outside the levels you are showing' });
  });

  it('allows a placement inside the band while levelling', () => {
    // Half-open, so the band's own lower step counts as inside it.
    expect(mapAllowed(mapAction('build', face), aim({ levelling: true, range: { lower: 2, upper: 6 } })))
      .toEqual({ kind: 'go' });
    expect(mapAllowed(mapAction('build', face), aim({ levelling: true, range: band })))
      .toEqual({ kind: 'go' });
  });

  it('refuses erase, paint and fill on empty space', () => {
    for (const tool of ['erase', 'paint', 'fill'] as const) {
      expect(mapAllowed(mapAction(tool, face), aim({ occupied: false })), tool)
        .toEqual({ kind: 'stop', why: 'nothing there' });
      expect(mapAllowed(mapAction(tool, face), aim({ occupied: true })), tool)
        .toEqual({ kind: 'go' });
    }
  });

  it('needs no band check for the tools that act on a picked block', () => {
    // Only a visible block can be picked, so erase, paint and fill cannot reach
    // past the cut however the band is set.
    for (const tool of ['erase', 'paint', 'fill'] as const) {
      expect(
        mapAllowed(mapAction(tool, face), aim({ levelling: true, occupied: true })),
        tool,
      ).toEqual({ kind: 'go' });
    }
  });

  it('stops silently when the pointer is over nothing', () => {
    expect(mapAllowed(mapAction('build', null), aim())).toEqual({ kind: 'stop', why: '' });
    // An empty reason prints nothing rather than "— " with a blank after it.
    expect(mapHover(mapAction('build', null), undefined, { kind: 'stop', why: '' }).label)
      .toBeNull();
  });
});

describe('a cell the map does not own (R-159)', () => {
  // Clicking the outward side face of an edge block aims past the footprint.
  // The host has always refused it; the readout now says so first, which is the
  // same principle as the rest of R-159 — no toast for a gesture that could
  // never work.
  const edge = { block: { x: 47, y: 0, z: 0 }, adjacent: { x: 48, y: 0, z: 0 } };
  const outside = {
    levelling: false,
    range: { lower: 0, upper: 32 },
    occupied: false,
    inBounds: false,
  };

  it('refuses every tool, whatever else is true', () => {
    for (const tool of ['build', 'erase', 'paint', 'fill'] as const) {
      expect(mapAllowed(mapAction(tool, edge), outside), tool)
        .toEqual({ kind: 'stop', why: 'outside the map' });
    }
  });

  it('says so before the occupancy or the band would', () => {
    // A cell the map does not own is not "already occupied" and not "outside
    // the levels" — it is not a cell. The most basic refusal reads first.
    expect(mapAllowed(mapAction('build', edge), { ...outside, occupied: true, levelling: true }))
      .toEqual({ kind: 'stop', why: 'outside the map' });
  });
});
