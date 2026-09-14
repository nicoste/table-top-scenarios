// The per-tool click matrix (R-87c). Every row of the table the GM specified,
// plus the bug that produced it.

import { describe, it, expect } from 'vitest';
import type { Cell, Pointed } from '@tt/client-core';
import { clickAction, holdsSelection, tableAction } from '@tt/client-core';
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
