// Maps through `sim` (D-183): the guards, the permission line, and the boundary.
//
// The boundary is the part that matters. A map may hold a cellar the party has
// not found, and until the cutting range exists there is no way to send part of
// a body — so none of it is sent (D-184).

import { describe, it, expect } from 'vitest';
import { apply, emptyHistory, openedWith } from '@tt/sim';
import { viewFor } from '@tt/protocol';
import type { GmView, HostState, Intent, TableView } from '@tt/protocol';
import type { Campaign } from '@tt/domain';
import {
  createCampaign, createLiveSave, DEFAULT_MATERIALS, DEFAULT_FLOOR, swatchOf,
  MAP_PATCH, MAP_MAX_HEIGHT, ORIGIN, MAP_BRUSH_CELLS, brushById, brushPatch,
  blockAt, mapFromJSON,
  EMPTY_LIBRARY,
} from '@tt/domain';
import { IntentSchema } from '@tt/protocol';

const NOW = '2026-01-01T00:00:00.000Z';
const run = (s: HostState, i: Intent, role: 'gm' | 'table' = 'gm') => apply(s, role, i, NOW);
const cell = (x: number, z: number) => ({ cx: ORIGIN.cx, cz: ORIGIN.cz, x, z });
const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id) as string;

/**
 * A revealed place with one revealed point of interest, in a Known chunk.
 *
 * Its map comes with it — a point of interest is never mapless (D-187), which
 * is why no test here has to create one first.
 */
function seeded() {
  const campaign = createCampaign('Ashfall');
  let state: HostState = {
    campaigns: [{ id: campaign.id, name: campaign.name }],
    active: campaign,
    activeSave: createLiveSave(campaign, NOW),
    history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [],
  };
  state = run(state, { kind: 'setChunkKnown', cx: ORIGIN.cx, cz: ORIGIN.cz, known: true }).state;
  state = run(state, { kind: 'addPlace', cell: cell(5, 6), name: 'Casilda' }).state;
  const placeId = state.active!.places[0]!.id;
  state = run(state, { kind: 'setPlaceRevealed', placeId, revealed: true }).state;
  state = run(state, { kind: 'addPoi', placeId, name: 'The tavern', visibleToParty: true }).state;
  const poiId = state.active!.places[0]!.pois[0]!.id;
  return { state, placeId, poiId };
}

const poiOf = (state: HostState) => state.active!.places[0]!.pois[0]!;

describe('a point of interest arrives with its map (D-187)', () => {
  it('is a floor from the moment it is named, with no second step', () => {
    const { state } = seeded();
    expect(poiOf(state).map?.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
  });

  it('rejects a place or point of interest that is not there', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, { kind: 'setBlock', placeId: 'place_ghost', poiId, cells: [{ x: 0, y: 1, z: 0 }], swatch: STONE }).rejected)
      .toBe('no such place');
    expect(run(state, { kind: 'setBlock', placeId, poiId: 'poi_ghost', cells: [{ x: 0, y: 1, z: 0 }], swatch: STONE }).rejected)
      .toBe('no such point of interest');
  });

  it('fills in a map for one read from an older file, on the way in', () => {
    // A campaign written before D-187 holds `map: null`. No schema bump went
    // with the change, because a missing map announces itself — so the open
    // boundary is where it is repaired (R-137a). Tested through the boundary
    // the host actually uses, not through the helper behind it.
    const { state, poiId } = seeded();
    const mapless: Campaign = {
      ...state.active!,
      places: state.active!.places.map((place) => ({
        ...place,
        pois: place.pois.map((poi) => ({ ...poi, map: null })),
      })),
    };
    const opened = openedWith(
      { campaigns: [], active: null, activeSave: null, history: emptyHistory(), library: EMPTY_LIBRARY, prefabs: [] },
      mapless,
      null,
      NOW,
      new Set(),
    );
    const poi = opened.state.active!.places[0]!.pois[0]!;
    expect(poi.id).toBe(poiId);
    expect(poi.name).toBe('The tavern');
    expect(poi.map?.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
  });

  it('says so rather than throwing if a mapless one ever reaches an edit (R-18)', () => {
    // Unreachable through the intents, and deliberately still guarded: `map` is
    // nullable because the *table* is sent none (D-184), and a narrowing that
    // threw would take the message handler with it.
    const { state, placeId, poiId } = seeded();
    const leaked: HostState = {
      ...state,
      active: {
        ...state.active!,
        places: state.active!.places.map((place) => ({
          ...place,
          pois: place.pois.map((poi) => ({ ...poi, map: null })),
        })),
      },
    };
    expect(run(leaked, { kind: 'setBlock', placeId, poiId, cells: [{ x: 0, y: 1, z: 0 }], swatch: STONE }).rejected)
      .toBe('that point of interest has no map');
  });
});

describe('building', () => {
  const withMap = seeded;

  it('places and clears a block', () => {
    const { state, placeId, poiId } = withMap();
    const built = run(state, { kind: 'setBlock', placeId, poiId, cells: [{ x: 2, y: 1, z: 3 }], swatch: STONE }).state;
    expect(poiOf(built).map!.blocks.get('2,1,3')).toBe(STONE);

    const cleared = run(built, { kind: 'clearBlock', placeId, poiId, cells: [{ x: 2, y: 1, z: 3  }]}).state;
    expect(poiOf(cleared).map!.blocks.has('2,1,3')).toBe(false);
  });

  it('refuses a block outside the footprint or above the cap', () => {
    const { state, placeId, poiId } = withMap();
    for (const at of [
      { x: MAP_PATCH, y: 0, z: 0 },
      { x: 0, y: MAP_MAX_HEIGHT, z: 0 },
      { x: -1, y: 0, z: 0 },
    ]) {
      expect(run(state, { kind: 'setBlock', placeId, poiId, cells: [at], swatch: STONE }).rejected)
        .toBe('that is outside the map');
    }
  });

  it('refuses a material nobody registered', () => {
    const { state, placeId, poiId } = withMap();
    expect(run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 0, y: 1, z: 0 }], swatch: 'material:unobtanium',
    }).rejected).toBe('unknown material');
  });

  it('grows the footprint and floors the new ground', () => {
    const { state, placeId, poiId } = withMap();
    const grown = run(state, { kind: 'growMap', placeId, poiId, towards: 'southeast' }).state;
    expect(poiOf(grown).map!.size).toEqual({ x: MAP_PATCH * 2, z: MAP_PATCH });
    expect(poiOf(grown).map!.blocks.get(`${MAP_PATCH},0,0`)).toBe(DEFAULT_FLOOR);
  });

  it('grows the northerly directions by moving the origin, not the blocks', () => {
    const { state, placeId, poiId } = withMap();
    const built = run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 3, y: 1, z: 3 }], swatch: STONE,
    }).state;
    const grown = run(built, { kind: 'growMap', placeId, poiId, towards: 'northeast' }).state;
    expect(poiOf(grown).map!.origin).toEqual({ x: 0, z: -MAP_PATCH });
    // The wall is where the GM left it, which is the whole point.
    expect(poiOf(grown).map!.blocks.get('3,1,3')).toBe(STONE);
    expect(poiOf(grown).map!.blocks.get(`0,0,-1`)).toBe(DEFAULT_FLOOR);
  });
});

describe('undo covers map edits for free (R-140a)', () => {
  it('takes back a block without the handler knowing about history', () => {
    // The snapshot is taken by comparing campaign identity across `apply`, so a
    // new intent is undoable the moment it edits the campaign — nothing had to
    // be registered anywhere.
    const { state, placeId, poiId } = seeded();
    const next = run(state, { kind: 'setBlock', placeId, poiId, cells: [{ x: 1, y: 1, z: 1 }], swatch: STONE }).state;
    expect(poiOf(next).map!.blocks.has('1,1,1')).toBe(true);

    const undone = run(next, { kind: 'undo' }).state;
    expect(poiOf(undone).map!.blocks.has('1,1,1')).toBe(false);
    expect(poiOf(undone).map).not.toBeNull();
  });

  it('gives each cube its own undo, because each cube is its own click (R-153)', () => {
    // Blocks carry no stroke id: a map click is a click, not a gesture. The
    // coalescing rule is still general at the boundary and the world's brush
    // still uses it (R-140b, covered in history.test.ts) — a map simply never
    // asks for it, so a wall of five is five presses back rather than one.
    const { state, placeId, poiId } = seeded();
    let next = state;
    for (let x = 0; x < 5; x += 1) {
      next = run(next, { kind: 'setBlock', placeId, poiId, cells: [{ x, y: 1, z: 0 }], swatch: STONE }).state;
    }
    expect(poiOf(next).map!.blocks.has('4,1,0')).toBe(true);

    const once = run(next, { kind: 'undo' }).state;
    expect(poiOf(once).map!.blocks.has('4,1,0')).toBe(false);
    expect(poiOf(once).map!.blocks.has('3,1,0')).toBe(true);

    let back = once;
    for (let i = 0; i < 4; i += 1) back = run(back, { kind: 'undo' }).state;
    for (let x = 0; x < 5; x += 1) {
      expect(poiOf(back).map!.blocks.has(`${x},1,0`), `block ${x}`).toBe(false);
    }
  });
});

describe('the boundary (D-184)', () => {
  it('sends the party a point of interest by name, with no body', () => {
    const { state, placeId, poiId } = seeded();
    const next = run(state, { kind: 'setBlock', placeId, poiId, cells: [{ x: 1, y: 1, z: 1 }], swatch: STONE }).state;

    const table = viewFor('table', next) as TableView;
    const poi = table.campaign!.places[0]!.pois[0]!;
    expect(poi.name).toBe('The tavern');
    expect(poi.map).toBeNull();
  });

  it('puts no block anywhere on the table wire', () => {
    // Not "the table does not draw it" — absent. A body may hold a cellar the
    // party has not found, and until the range exists there is no way to send
    // part of one (R-85).
    const { state, placeId, poiId } = seeded();
    const next = run(state, { kind: 'setBlock', placeId, poiId, cells: [{ x: 7, y: 9, z: 7 }], swatch: STONE }).state;

    const payload = JSON.stringify(viewFor('table', next));
    expect(payload).not.toContain('"blocks"');
    expect(payload).not.toContain('7,9,7');
  });

  it('still gives the GM the whole body (D-182)', () => {
    const { state, placeId, poiId } = seeded();
    const next = run(state, { kind: 'setBlock', placeId, poiId, cells: [{ x: 7, y: 9, z: 7 }], swatch: STONE }).state;

    const gm = viewFor('gm', next) as GmView;
    const poi = gm.campaign!.places[0]!.pois[0]!;
    expect(blockAt(mapFromJSON(poi.map)!, { x: 7, y: 9, z: 7 })).toBe(STONE);
  });
});

describe('a map is authored content, so the table seat cannot touch it (R-136)', () => {
  it('refuses every map intent from the table', () => {
    const { state, placeId, poiId } = seeded();
    const withMap = state;
    for (const intent of [
      { kind: 'setBlock', placeId, poiId, cells: [{ x: 0, y: 1, z: 0 }], swatch: STONE },
      { kind: 'clearBlock', placeId, poiId, cells: [{ x: 0, y: 0, z: 0  }]},
      { kind: 'growMap', placeId, poiId, towards: 'southeast' },
    ] as Intent[]) {
      expect(run(withMap, intent, 'table').rejected, intent.kind).toBe('only the GM can do that');
    }
  });
});

describe('deleting a point of interest (R-151)', () => {
  it('takes its map with it', () => {
    const { state, placeId, poiId } = seeded();
    const gone = run(state, { kind: 'removePoi', placeId, poiId }).state;
    expect(gone.active!.places[0]!.pois).toEqual([]);
  });

  it('is undoable, blocks and all — which is why the × only asks, it does not warn', () => {
    // The confirmation in front of this is prevention, not the recovery: undo
    // is bounded (R-140a) and cleared when the campaign changes, so "you can
    // always take it back" is not a promise the GM should have to rely on.
    const { state, placeId, poiId } = seeded();
    const built = run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 4, y: 1, z: 4 }], swatch: STONE,
    }).state;
    const gone = run(built, { kind: 'removePoi', placeId, poiId }).state;
    expect(gone.active!.places[0]!.pois).toEqual([]);

    const back = run(gone, { kind: 'undo' }).state;
    expect(poiOf(back).name).toBe('The tavern');
    expect(poiOf(back).map!.blocks.get('4,1,4')).toBe(STONE);
  });
});

describe('the bucket fill through sim (R-154)', () => {
  const GRASS = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Grass')!.id) as string;

  it('repaints the region the GM clicked, in one undo', () => {
    const { state, placeId, poiId } = seeded();
    const filled = run(state, {
      kind: 'fillMaterial', placeId, poiId, x: 0, y: 0, z: 0, swatch: GRASS,
    }).state;
    // The whole floor, and nothing added or removed.
    expect(poiOf(filled).map!.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
    for (const material of poiOf(filled).map!.blocks.values()) expect(material).toBe(GRASS);

    // One intent, so one press takes all 256 back — no stroke id needed.
    const undone = run(filled, { kind: 'undo' }).state;
    expect(poiOf(undone).map!.blocks.get('0,0,0')).toBe(DEFAULT_FLOOR);
    expect(poiOf(undone).map!.blocks.get('15,0,15')).toBe(DEFAULT_FLOOR);
  });

  it('refuses a material nobody registered', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'fillMaterial', placeId, poiId, x: 0, y: 0, z: 0, swatch: 'material:unobtanium',
    }).rejected).toBe('unknown material');
  });

  it('says so rather than going quiet outside the map (R-18)', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'fillMaterial', placeId, poiId, x: MAP_PATCH, y: 0, z: 0, swatch: STONE,
    }).rejected).toBe('that is outside the map');
  });

  it('is authored content, so the table seat cannot fill (R-136)', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'fillMaterial', placeId, poiId, x: 0, y: 0, z: 0, swatch: STONE,
    }, 'table').rejected).toBe('only the GM can do that');
  });
});

describe('building never overwrites, painting never conjures (R-159)', () => {
  const GRASS = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Grass')!.id) as string;

  it('refuses to build where a block already stands', () => {
    // The hazard the levels toggle would otherwise create: with the band shown
    // alone, a ray passes through what is hidden and lands on the far side, so
    // the cell "in front" of a face can hold a block the GM cannot see. The
    // domain's setBlock would have silently repainted it.
    const { state, placeId, poiId } = seeded();
    const built = run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 2, y: 1, z: 2 }], swatch: STONE,
    }).state;
    expect(run(built, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 2, y: 1, z: 2 }], swatch: GRASS,
    }).rejected).toBe('there is already a block there');
    // And the block it refused to overwrite is untouched.
    expect(poiOf(built).map!.blocks.get('2,1,2')).toBe(STONE);
  });

  it('refuses to build on the floor, which is a block like any other', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 0, y: 0, z: 0 }], swatch: STONE,
    }).rejected).toBe('there is already a block there');
  });

  it('paints a block that is there', () => {
    const { state, placeId, poiId } = seeded();
    const painted = run(state, {
      kind: 'paintBlock', placeId, poiId, cells: [{ x: 0, y: 0, z: 0 }], swatch: STONE,
    }).state;
    expect(poiOf(painted).map!.blocks.get('0,0,0')).toBe(STONE);
  });

  it('refuses to paint thin air', () => {
    // The mirror image, and it is why these are two intents rather than one:
    // each refuses precisely what the other is for.
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'paintBlock', placeId, poiId, cells: [{ x: 0, y: 5, z: 0 }], swatch: STONE,
    }).rejected).toBe('there is nothing there to paint');
  });

  it('checks the bounds and the material before either', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'paintBlock', placeId, poiId, cells: [{ x: MAP_PATCH, y: 0, z: 0 }], swatch: STONE,
    }).rejected).toBe('that is outside the map');
    expect(run(state, {
      kind: 'paintBlock', placeId, poiId, cells: [{ x: 0, y: 0, z: 0 }], swatch: 'material:unobtanium',
    }).rejected).toBe('unknown material');
  });

  it('is refused for the table seat, like every other authored edit (R-136)', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'paintBlock', placeId, poiId, cells: [{ x: 0, y: 0, z: 0 }], swatch: STONE,
    }, 'table').rejected).toBe('only the GM can do that');
  });

  it('coalesces a brush drag into one undo, as setBlock did (R-140b)', () => {
    const { state, placeId, poiId } = seeded();
    let next = state;
    for (let x = 0; x < 4; x += 1) {
      next = run(next, {
        kind: 'paintBlock', placeId, poiId, cells: [{ x, y: 0, z: 0 }], swatch: STONE, stroke: 'brush1',
      }).state;
    }
    expect(poiOf(next).map!.blocks.get('3,0,0')).toBe(STONE);
    const undone = run(next, { kind: 'undo' }).state;
    for (let x = 0; x < 4; x += 1) {
      expect(poiOf(undone).map!.blocks.get(`${x},0,0`), `x${x}`).toBe(DEFAULT_FLOOR);
    }
  });
});

describe('a brush arrives as one intent (R-162)', () => {
  const GRASS = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Grass')!.id) as string;

  it('places a whole patch, and one undo takes all of it back (R-140a)', () => {
    // The reason the cells travel together. Twenty-five intents would be
    // twenty-five undo steps for one click, and a GM who erased a 5×5 by
    // accident would be pressing undo twenty-five times.
    const { state, placeId, poiId } = seeded();
    const cells = brushPatch({ x: 5, y: 1, z: 5 }, brushById('flat5'));
    const built = run(state, { kind: 'setBlock', placeId, poiId, cells, swatch: STONE }).state;
    for (const cell_ of cells) {
      expect(poiOf(built).map!.blocks.get(`${cell_.x},${cell_.y},${cell_.z}`)).toBe(STONE);
    }
    const undone = run(built, { kind: 'undo' }).state;
    for (const cell_ of cells) {
      expect(poiOf(undone).map!.blocks.has(`${cell_.x},${cell_.y},${cell_.z}`)).toBe(false);
    }
  });

  it('lands on the free cells of a patch and leaves what is standing', () => {
    const { state, placeId, poiId } = seeded();
    const one = run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 5, y: 1, z: 5 }], swatch: STONE,
    }).state;
    // A 3 over it — a cross (D-364): the middle is taken, the four around it are not.
    const wide = run(one, {
      kind: 'setBlock', placeId, poiId, cells: brushPatch({ x: 5, y: 1, z: 5 }, brushById('flat3')), swatch: GRASS,
    });
    expect(wide.rejected).toBeUndefined();
    const blocks = poiOf(wide.state).map!.blocks;
    expect(blocks.get('5,1,5')).toBe(STONE);
    expect(blocks.get('4,1,5')).toBe(GRASS);
    expect(blocks.get('5,1,6')).toBe(GRASS);
    expect(blocks.get('6,1,6')).toBeUndefined();
  });

  it('refuses only when there is nothing at all to place', () => {
    // A new map is a solid floor at y0, so a flat patch there is entirely
    // occupied — which is the one case that should be refused, and the message
    // is the same one a single cube has always got.
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'setBlock', placeId, poiId, cells: brushPatch({ x: 5, y: 0, z: 5 }, brushById('flat3')), swatch: STONE,
    }).rejected).toBe('there is already a block there');
  });

  it('clips a patch to the footprint rather than failing (R-157)', () => {
    // A brush at the corner laps over the edge of the map. What is inside is
    // placed; what is outside is not a cell and is simply skipped.
    const { state, placeId, poiId } = seeded();
    const cells = brushPatch({ x: 0, y: 1, z: 0 }, brushById('flat3'));
    const next = run(state, { kind: 'setBlock', placeId, poiId, cells, swatch: STONE });
    expect(next.rejected).toBeUndefined();
    const blocks = poiOf(next.state).map!.blocks;
    expect(blocks.get('0,1,0')).toBe(STONE);
    expect(blocks.has('-1,1,0')).toBe(false);
    expect(blocks.has('0,1,-1')).toBe(false);
  });

  it('refuses a patch that is entirely outside the map', () => {
    const { state, placeId, poiId } = seeded();
    expect(run(state, {
      kind: 'setBlock', placeId, poiId, cells: brushPatch({ x: 900, y: 1, z: 900 }, brushById('flat3')), swatch: STONE,
    }).rejected).toBe('that is outside the map');
  });

  it('repaints the blocks of a patch and conjures none (R-159)', () => {
    const { state, placeId, poiId } = seeded();
    // One level up from the floor, so the patch is entirely air but for the
    // cube put there first — paint must take that one and conjure no others.
    const cells = brushPatch({ x: 5, y: 1, z: 5 }, brushById('flat3'));
    const built = run(state, {
      kind: 'setBlock', placeId, poiId, cells: [{ x: 5, y: 1, z: 5 }], swatch: STONE,
    }).state;
    const next = run(built, { kind: 'paintBlock', placeId, poiId, cells, swatch: GRASS });
    expect(next.rejected).toBeUndefined();
    const blocks = poiOf(next.state).map!.blocks;
    expect(blocks.get('5,1,5')).toBe(GRASS);
    // Its eight neighbours were empty and stay empty: paint conjures nothing.
    expect(blocks.has('4,1,5')).toBe(false);
    expect(blocks.has('6,1,6')).toBe(false);
    // And the floor below is untouched, because the patch is flat (D-213).
    expect(blocks.get('5,0,5')).toBe(DEFAULT_FLOOR);
  });

  it('erases a whole patch, and refuses when the patch is empty', () => {
    const { state, placeId, poiId } = seeded();
    const cells = brushPatch({ x: 5, y: 0, z: 5 }, brushById('flat3'));
    const cleared = run(state, { kind: 'clearBlock', placeId, poiId, cells });
    expect(cleared.rejected).toBeUndefined();
    for (const cell_ of cells) {
      expect(poiOf(cleared.state).map!.blocks.has(`${cell_.x},${cell_.y},${cell_.z}`)).toBe(false);
    }
    expect(run(cleared.state, { kind: 'clearBlock', placeId, poiId, cells }).rejected)
      .toBe('there is nothing there to erase');
  });

  it('caps the list at the widest brush, at the edge (R-17)', () => {
    // The list is bounded by the same rule that shapes it. Without the cap an
    // intent could name a million cells, and the host would dutifully try.
    const many = Array.from({ length: MAP_BRUSH_CELLS + 1 }, (_, i) => ({ x: i, y: 1, z: 0 }));
    const parsed = IntentSchema.safeParse({
      kind: 'setBlock', placeId: 'place_1', poiId: 'poi_1', cells: many, swatch: STONE,
    });
    expect(parsed.success).toBe(false);
    expect(IntentSchema.safeParse({
      kind: 'setBlock', placeId: 'place_1', poiId: 'poi_1', cells: many.slice(0, MAP_BRUSH_CELLS), swatch: STONE,
    }).success).toBe(true);
    // And an empty list is not an edit, so it is not a legal intent either.
    expect(IntentSchema.safeParse({
      kind: 'setBlock', placeId: 'place_1', poiId: 'poi_1', cells: [], swatch: STONE,
    }).success).toBe(false);
  });
});
