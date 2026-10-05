// The encounter map body (R-145, R-149, R-150).

import { describe, it, expect } from 'vitest';
import type { MaterialId, SwatchId, Place, PlaceCell } from '@tt/domain';
import {
  addPlace, addPoi, withPoiMaps, fillRegion, fillMaterial, mapCentre, enclosing,
  createMap, setBlock, clearBlock, growMap, blockAt, blockKey, parseBlockKey,
  inMap, topOfMap, mapToJSON, mapFromJSON,
  MAP_PATCH, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, bottomOfMap,
  BRUSHES, DEFAULT_BRUSH, MAP_BRUSH_CELLS, brushById, brushPatch,
  setBlocks, paintBlocks, clearBlocks,
  DEFAULT_FLOOR, DEFAULT_MATERIALS, swatchOf, isKnownMaterial,
  materialIn, cutIdIn, cutOf, colourOf, isKnownSwatch, swatchFor,
} from '@tt/domain';

const STONE = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!.id);
const at = (x: number, y: number, z: number) => ({ x, y, z });

describe('a new map (R-149)', () => {
  it('is a flat floor, not an empty grid', () => {
    // An empty grid gives the GM nothing to click, and face-adjacency placement
    // needs a face to start from — same reason a new chunk is water, not nothing.
    const map = createMap();
    expect(map.size).toEqual({ x: MAP_PATCH, z: MAP_PATCH });
    expect(map.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
    expect(blockAt(map, at(0, 0, 0))).toBe(DEFAULT_FLOOR);
    expect(blockAt(map, at(MAP_PATCH - 1, 0, MAP_PATCH - 1))).toBe(DEFAULT_FLOOR);
  });

  it('has air above the floor, not blocks', () => {
    expect(blockAt(createMap(), at(0, 1, 0))).toBeNull();
    expect(topOfMap(createMap())).toBe(0);
  });
});

describe('bounds', () => {
  const map = createMap();

  it('rejects anything outside the footprint or above the cap', () => {
    expect(inMap(map, at(0, 0, 0))).toBe(true);
    expect(inMap(map, at(MAP_PATCH, 0, 0))).toBe(false);
    expect(inMap(map, at(0, 0, MAP_PATCH))).toBe(false);
    expect(inMap(map, at(-1, 0, 0))).toBe(false);
    expect(inMap(map, at(0, MAP_MAX_HEIGHT, 0))).toBe(false);
    expect(inMap(map, at(0, MAP_MAX_HEIGHT - 1, 0))).toBe(true);
  });

  it('allows digging below the starting floor, down to a limit (R-160)', () => {
    // Negative Y is how a cellar is reached. Shifting the whole body upward to
    // make room would renumber every block, every cutting plane and the saved
    // band together (D-203).
    expect(inMap(map, at(0, -1, 0))).toBe(true);
    expect(inMap(map, at(0, MAP_MIN_DEPTH, 0))).toBe(true);
    expect(inMap(map, at(0, MAP_MIN_DEPTH - 1, 0))).toBe(false);
  });

  it('rejects fractional coordinates rather than rounding them', () => {
    expect(inMap(map, at(0.5, 0, 0))).toBe(false);
  });

  it('refuses to place outside, silently and identity-preserving', () => {
    expect(setBlock(map, at(99, 0, 0), STONE)).toBe(map);
  });
});

describe('placing and clearing', () => {
  it('places a block in the air', () => {
    const map = setBlock(createMap(), at(3, 4, 5), STONE);
    expect(blockAt(map, at(3, 4, 5))).toBe(STONE);
    expect(topOfMap(map)).toBe(4);
  });

  it('preserves identity when nothing changes (R-165)', () => {
    const map = setBlock(createMap(), at(3, 4, 5), STONE);
    expect(setBlock(map, at(3, 4, 5), STONE)).toBe(map);
    expect(clearBlock(map, at(9, 9, 9))).toBe(map);
  });

  it('replaces the material of a block that is already there', () => {
    const one = setBlock(createMap(), at(1, 1, 1), STONE);
    const two = setBlock(one, at(1, 1, 1), DEFAULT_FLOOR);
    expect(blockAt(two, at(1, 1, 1))).toBe(DEFAULT_FLOOR);
    expect(two.blocks.size).toBe(one.blocks.size);
  });

  it('clears a block back to air', () => {
    const map = clearBlock(createMap(), at(0, 0, 0));
    expect(blockAt(map, at(0, 0, 0))).toBeNull();
    // The floor may be dug through — a hole into a cellar has to be possible.
    expect(map.blocks.size).toBe(MAP_PATCH * MAP_PATCH - 1);
  });
});

describe('growing (R-150, D-198)', () => {
  it('extends the two directions that add width, leaving the origin alone', () => {
    // South-east is +X and south-west is +Z: both grow away from the origin,
    // so nothing has to move.
    const se = growMap(createMap(), 'southeast');
    expect(se.origin).toEqual({ x: 0, z: 0 });
    expect(se.size).toEqual({ x: MAP_PATCH * 2, z: MAP_PATCH });
    expect(blockAt(se, at(MAP_PATCH, 0, 0))).toBe(DEFAULT_FLOOR);
    expect(inMap(se, at(MAP_PATCH, 0, 0))).toBe(true);

    const sw = growMap(createMap(), 'southwest');
    expect(sw.origin).toEqual({ x: 0, z: 0 });
    expect(sw.size).toEqual({ x: MAP_PATCH, z: MAP_PATCH * 2 });
  });

  it('extends the northerly two by moving the origin negative', () => {
    // The point of the origin. Renumbering the body instead would move every
    // wall the GM built relative to anything that remembered where it was.
    const nw = growMap(createMap(), 'northwest');
    expect(nw.origin).toEqual({ x: -MAP_PATCH, z: 0 });
    expect(nw.size).toEqual({ x: MAP_PATCH * 2, z: MAP_PATCH });
    expect(inMap(nw, at(-1, 0, 0))).toBe(true);
    expect(inMap(nw, at(-MAP_PATCH - 1, 0, 0))).toBe(false);
    expect(blockAt(nw, at(-1, 0, 0))).toBe(DEFAULT_FLOOR);

    const ne = growMap(createMap(), 'northeast');
    expect(ne.origin).toEqual({ x: 0, z: -MAP_PATCH });
    expect(blockAt(ne, at(0, 0, -1))).toBe(DEFAULT_FLOOR);
  });

  it('puts each direction on the axis it appears to run along on screen', () => {
    // Read off the default view: -Z climbs to the upper right, +X falls to the
    // lower right (D-198). Getting this pair the wrong way round would send the
    // map off in a direction the GM did not click.
    expect(growMap(createMap(), 'northeast').origin.z).toBe(-MAP_PATCH);
    expect(growMap(createMap(), 'northeast').origin.x).toBe(0);
    expect(growMap(createMap(), 'northwest').origin.x).toBe(-MAP_PATCH);
    expect(growMap(createMap(), 'northwest').origin.z).toBe(0);
    expect(growMap(createMap(), 'southeast').size.x).toBe(MAP_PATCH * 2);
    expect(growMap(createMap(), 'southwest').size.z).toBe(MAP_PATCH * 2);
  });

  it('leaves every existing block at the coordinate it already had, any direction', () => {
    const built = setBlock(createMap(), at(2, 3, 4), STONE);
    let grown = built;
    for (const towards of ['southeast', 'southwest', 'northwest', 'northeast'] as const) {
      grown = growMap(grown, towards);
      expect(blockAt(grown, at(2, 3, 4)), towards).toBe(STONE);
    }
    expect(grown.size).toEqual({ x: MAP_PATCH * 3, z: MAP_PATCH * 3 });
    expect(grown.origin).toEqual({ x: -MAP_PATCH, z: -MAP_PATCH });
  });

  it('floors only the new ground, and keeps the floor material', () => {
    const grown = growMap(createMap(STONE), 'southwest');
    expect(blockAt(grown, at(0, 0, MAP_PATCH))).toBe(STONE);
    expect(grown.blocks.size).toBe(MAP_PATCH * MAP_PATCH * 2);
  });

  it('floors the new ground of a north-west grow exactly once', () => {
    const grown = growMap(growMap(createMap(), 'northwest'), 'northwest');
    expect(grown.blocks.size).toBe(MAP_PATCH * MAP_PATCH * 3);
    expect(grown.origin).toEqual({ x: -MAP_PATCH * 2, z: 0 });
  });

  it('centres on the middle of the footprint, wherever the origin is', () => {
    expect(mapCentre(createMap())).toEqual({ x: MAP_PATCH / 2, z: MAP_PATCH / 2 });
    const nw = growMap(createMap(), 'northwest');
    expect(mapCentre(nw)).toEqual({ x: 0, z: MAP_PATCH / 2 });
  });
});

describe('keys', () => {
  it('round-trip', () => {
    expect(parseBlockKey(blockKey(at(1, 2, 3)))).toEqual(at(1, 2, 3));
    expect(parseBlockKey(blockKey(at(-4, 0, 12)))).toEqual(at(-4, 0, 12));
  });

  it('refuse malformed input rather than producing a NaN coordinate', () => {
    expect(parseBlockKey('1,2')).toBeNull();
    expect(parseBlockKey('a,b,c')).toBeNull();
    expect(parseBlockKey('1,2,3,4')).toBeNull();
    expect(parseBlockKey('1.5,2,3')).toBeNull();
  });
});

describe('serialisation', () => {
  it('round-trips through JSON, since a Map does not survive stringify', () => {
    const map = setBlock(setBlock(createMap(), at(1, 1, 1), STONE), at(2, 5, 2), STONE);
    const back = mapFromJSON(JSON.parse(JSON.stringify(mapToJSON(map))))!;
    expect(back.size).toEqual(map.size);
    expect(back.blocks.size).toBe(map.blocks.size);
    expect(blockAt(back, at(2, 5, 2))).toBe(STONE);
  });

  it('writes the same bytes for the same body, whatever order it was built in', () => {
    /*
     * This used to say "sorts keys, so an autosave does not churn the diff",
     * which was the same worry about a shape that no longer exists: runs are
     * ordered by position, so the ordering is the format's rather than a
     * precaution. What still has to hold is that the file does not change when
     * the body has not.
     */
    let one = createMap();
    one = setBlock(one, at(9, 9, 9), STONE);
    one = setBlock(one, at(1, 1, 1), STONE);
    let other = createMap();
    other = setBlock(other, at(1, 1, 1), STONE);
    other = setBlock(other, at(9, 9, 9), STONE);
    const body = (m: typeof one) => {
      const { palette, runs } = mapToJSON(m);
      return JSON.stringify({ palette, runs });
    };
    expect(body(one)).toBe(body(other));
  });

  it('reads a missing map as no map at all', () => {
    expect(mapFromJSON(null)).toBeNull();
    expect(mapFromJSON(undefined)).toBeNull();
  });
});

describe('the materials registry (R-75)', () => {
  it('is namespaced and append-only in shape', () => {
    for (const material of DEFAULT_MATERIALS) {
      expect(material.id).toMatch(/^material:[a-z0-9-]+$/);
      expect(isKnownMaterial(material.id)).toBe(true);
    }
  });

  it('rejects a material nobody registered', () => {
    expect(isKnownMaterial('material:unobtanium' as MaterialId)).toBe(false);
  });

  it('carries blocksSight as a material property, transparent ones included', () => {
    // Specified now, unused until vision lands (D-183) — but glass being
    // see-through is a fact about glass, not about being a block.
    // On the family, not the cut: ice and water see through the same amount
    // because they are the same stuff frozen, and that is the rule that put
    // them in one family (R-178).
    const byName = (n: string) => DEFAULT_MATERIALS.find((m) => m.name === n)!;
    expect(byName('Brick').blocksSight).toBe(true);
    expect(byName('Mineral').blocksSight).toBe(true);
    expect(byName('Glassy').blocksSight).toBe(false);
    expect(byName('Liquids').blocksSight).toBe(false);
    // Ice is glassy, not liquid: what it shares with glass is that you look
    // through it at something hard (D-246).
    expect(byName('Glassy').cuts.map((cut) => cut.name)).toContain('Ice');
  });
});

describe('a point of interest owns exactly one map (R-145, D-187)', () => {
  const cell: PlaceCell = { cx: 3, cz: 4, x: 5, z: 6 };
  const seeded = (): readonly Place[] => {
    const places = addPlace([], cell, 'Casilda');
    return addPoi(places, places[0]!.id, 'The tavern');
  };

  it('is created with the point of interest, not on a second request', () => {
    const poi = seeded()[0]!.pois[0]!;
    expect(poi.name).toBe('The tavern');
    expect(poi.map?.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
    expect(blockAt(poi.map!, at(0, 0, 0))).toBe(DEFAULT_FLOOR);
  });

  it('gives each one its own body, so building in one leaves the other alone', () => {
    let places = seeded();
    const placeId = places[0]!.id;
    places = addPoi(places, placeId, 'The cellar');
    const [tavern, cellar] = places[0]!.pois;
    expect(tavern!.map).not.toBe(cellar!.map);
  });

  describe('withPoiMaps, the boundary repair (R-137a)', () => {
    it('fills in one read without a map, keeping its id and its name', () => {
      const places = seeded();
      const mapless = places.map((place) => ({
        ...place,
        pois: place.pois.map((poi) => ({ ...poi, map: null })),
      }));
      const fixed = withPoiMaps(mapless);
      expect(fixed[0]!.pois[0]!.id).toBe(places[0]!.pois[0]!.id);
      expect(fixed[0]!.pois[0]!.name).toBe('The tavern');
      expect(fixed[0]!.pois[0]!.map?.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
    });

    it('never touches a body that is already there', () => {
      const places = seeded();
      const built = places.map((place) => ({
        ...place,
        pois: place.pois.map((poi) => ({ ...poi, map: setBlock(poi.map!, at(1, 1, 1), STONE) })),
      }));
      const fixed = withPoiMaps(built);
      expect(fixed).toBe(built);
      expect(blockAt(fixed[0]!.pois[0]!.map!, at(1, 1, 1))).toBe(STONE);
    });

    it('preserves identity when every one already has a map (R-165)', () => {
      const places = seeded();
      expect(withPoiMaps(places)).toBe(places);
      expect(withPoiMaps([])).toEqual([]);
    });
  });
});

describe('the bucket fill (R-154)', () => {
  const GRASS = swatchOf(DEFAULT_MATERIALS.find((m) => m.name === 'Grass')!.id);

  it('repaints the block clicked and its same-material neighbours', () => {
    // A three-block run of stone in the air, floor untouched below it.
    let map = createMap();
    for (let x = 0; x < 3; x += 1) map = setBlock(map, at(x, 1, 0), STONE);

    const filled = fillMaterial(map, at(1, 1, 0), GRASS);
    for (let x = 0; x < 3; x += 1) expect(blockAt(filled, at(x, 1, 0)), `x${x}`).toBe(GRASS);
    // The floor is a different material, so the fill did not fall through it.
    expect(blockAt(filled, at(1, 0, 0))).toBe(DEFAULT_FLOOR);
  });

  it('stops at a block of another material', () => {
    let map = createMap();
    for (let x = 0; x < 5; x += 1) map = setBlock(map, at(x, 1, 0), STONE);
    map = setBlock(map, at(2, 1, 0), GRASS); // a seam across the run

    const filled = fillMaterial(map, at(0, 1, 0), GRASS);
    expect(blockAt(filled, at(1, 1, 0))).toBe(GRASS);
    expect(blockAt(filled, at(3, 1, 0)), 'beyond the seam').toBe(STONE);
    expect(blockAt(filled, at(4, 1, 0)), 'beyond the seam').toBe(STONE);
  });

  it('does not leak through a diagonal seam (R-44)', () => {
    // Two stone blocks touching only along an edge. A fill that used 18 or 26
    // neighbours would cross a wall the GM built as solid.
    let map = createMap();
    map = setBlock(map, at(1, 1, 1), STONE);
    map = setBlock(map, at(2, 2, 1), STONE);

    const filled = fillMaterial(map, at(1, 1, 1), GRASS);
    expect(blockAt(filled, at(1, 1, 1))).toBe(GRASS);
    expect(blockAt(filled, at(2, 2, 1))).toBe(STONE);
  });

  it('walks in all three dimensions, not just along the ground', () => {
    let map = createMap();
    for (let y = 1; y <= 4; y += 1) map = setBlock(map, at(3, y, 3), STONE);
    const filled = fillMaterial(map, at(3, 4, 3), GRASS);
    for (let y = 1; y <= 4; y += 1) expect(blockAt(filled, at(3, y, 3)), `y${y}`).toBe(GRASS);
  });

  it('fills the whole floor when the floor is what was clicked', () => {
    const filled = fillMaterial(createMap(), at(0, 0, 0), STONE);
    expect(filled.blocks.size).toBe(MAP_PATCH * MAP_PATCH);
    for (const material of filled.blocks.values()) expect(material).toBe(STONE);
  });

  it('never adds or removes a block, only repaints', () => {
    const map = setBlock(createMap(), at(5, 1, 5), STONE);
    const filled = fillMaterial(map, at(0, 0, 0), STONE);
    expect(filled.blocks.size).toBe(map.blocks.size);
  });

  it('does nothing from air, or from outside the map', () => {
    const map = createMap();
    expect(fillMaterial(map, at(0, 5, 0), STONE)).toBe(map);
    expect(fillMaterial(map, at(99, 0, 0), STONE)).toBe(map);
    expect(fillRegion(map, at(0, 5, 0))).toEqual([]);
  });

  it('preserves identity when the region is already that material (R-165)', () => {
    const map = createMap();
    expect(fillMaterial(map, at(0, 0, 0), DEFAULT_FLOOR)).toBe(map);
  });

  it('reports the region so the console can say how big the fill is', () => {
    let map = createMap();
    for (let x = 0; x < 4; x += 1) map = setBlock(map, at(x, 2, 0), STONE);
    expect(fillRegion(map, at(2, 2, 0))).toHaveLength(4);
    expect(fillRegion(map, at(0, 0, 0))).toHaveLength(MAP_PATCH * MAP_PATCH);
  });
});

describe('a map never holds a block outside its own bounds (R-157)', () => {
  it('slides a footprint that lost its origin, keeping its size', () => {
    // The state found in a live campaign: 64 by 64 of floor running from -16 to
    // 47, on a map whose stored origin said zero. The size was right, the
    // blocks were right, only the origin had gone missing — so `inMap` rejected
    // a quarter of the floor and the GM could not touch it.
    const blocks = new Map<string, SwatchId>();
    for (let x = -16; x < 48; x += 1) {
      for (let z = -16; z < 48; z += 1) blocks.set(blockKey(at(x, 0, z)), DEFAULT_FLOOR);
    }
    const fixed = enclosing({ x: 0, z: 0 }, { x: 64, z: 64 }, blocks);
    expect(fixed.origin).toEqual({ x: -16, z: -16 });
    // Not 80: widening would add sixteen columns of in-bounds cells with no
    // floor under them, which is not what the GM grew.
    expect(fixed.size).toEqual({ x: 64, z: 64 });
  });

  it('widens only when the blocks genuinely span more than the declared size', () => {
    const blocks = new Map<string, SwatchId>();
    for (let x = -2; x < 20; x += 1) blocks.set(blockKey(at(x, 0, 0)), DEFAULT_FLOOR);
    const fixed = enclosing({ x: 0, z: 0 }, { x: 16, z: 16 }, blocks);
    expect(fixed.origin.x).toBe(-2);
    expect(fixed.size.x).toBe(22);
    // The axis with nothing wrong is left exactly as declared.
    expect(fixed.origin.z).toBe(0);
    expect(fixed.size.z).toBe(16);
  });

  it('leaves a footprint that already contains its blocks alone', () => {
    const map = setBlock(createMap(), at(3, 4, 5), STONE);
    const fixed = enclosing(map.origin, map.size, map.blocks);
    expect(fixed.origin).toEqual({ x: 0, z: 0 });
    expect(fixed.size).toEqual({ x: MAP_PATCH, z: MAP_PATCH });
  });

  it('never shrinks a footprint to fit its blocks', () => {
    // A map dug hollow still owns the ground it was given: growing is the GM's
    // decision and erasing a corner is not a request to give it back.
    const dug = clearBlock(createMap(), at(0, 0, 0));
    const fixed = enclosing(dug.origin, dug.size, dug.blocks);
    expect(fixed.size).toEqual({ x: MAP_PATCH, z: MAP_PATCH });
  });

  it('keeps an empty map exactly as declared', () => {
    const fixed = enclosing({ x: 4, z: 4 }, { x: 8, z: 8 }, new Map());
    expect(fixed).toEqual({ origin: { x: 4, z: 4 }, size: { x: 8, z: 8 } });
  });

  it('repairs on the way in, so what is read back is editable', () => {
    const blocks: Record<string, string> = {};
    for (let x = -3; x < 5; x += 1) blocks[`${x},0,0`] = DEFAULT_FLOOR;
    const read = mapFromJSON({ size: { x: 5, z: 1 }, blocks })!;
    expect(read.origin).toEqual({ x: -3, z: 0 });
    for (let x = -3; x < 5; x += 1) {
      expect(inMap(read, at(x, 0, 0)), `x${x}`).toBe(true);
    }
  });

  it('growing never produces a block outside the footprint, any direction', () => {
    // The invariant the repair exists to protect. Checked for every direction
    // and every combination of two, because the pair that moves the origin is
    // the one that could leave a strip behind.
    const DIRS = ['northeast', 'southeast', 'southwest', 'northwest'] as const;
    for (const first of DIRS) {
      for (const second of DIRS) {
        const map = growMap(growMap(createMap(), first), second);
        for (const key of map.blocks.keys()) {
          expect(inMap(map, parseBlockKey(key)!), `${first}+${second} ${key}`).toBe(true);
        }
        expect(enclosing(map.origin, map.size, map.blocks).origin, `${first}+${second}`)
          .toEqual(map.origin);
      }
    }
  });
});

describe('how deep a map goes (R-160)', () => {
  it('bottoms out at the starting floor until something is dug', () => {
    // Clamped at zero so a map nobody has dug reports its own floor, which
    // keeps the band selector's lowest step a level that actually exists.
    expect(bottomOfMap(createMap())).toBe(0);
    expect(bottomOfMap(setBlock(createMap(), at(2, 6, 2), STONE))).toBe(0);
  });

  it('follows the deepest block once there is a cellar', () => {
    let map = setBlock(createMap(), at(2, -1, 2), STONE);
    expect(bottomOfMap(map)).toBe(-1);
    map = setBlock(map, at(3, -4, 3), STONE);
    expect(bottomOfMap(map)).toBe(-4);
  });

  it('refuses to dig past the limit', () => {
    const map = createMap();
    expect(setBlock(map, at(0, MAP_MIN_DEPTH - 1, 0), STONE)).toBe(map);
    expect(blockAt(setBlock(map, at(0, MAP_MIN_DEPTH, 0), STONE), at(0, MAP_MIN_DEPTH, 0)))
      .toBe(STONE);
  });

  it('keeps a cellar when the footprint grows', () => {
    const dug = setBlock(createMap(), at(2, -2, 2), STONE);
    expect(blockAt(growMap(dug, 'northwest'), at(2, -2, 2))).toBe(STONE);
    expect(bottomOfMap(growMap(dug, 'northwest'))).toBe(-2);
  });
});

const CUBE = brushById('cube');
const FLAT3 = brushById('flat3');
const FLAT5 = brushById('flat5');
const COLUMN3 = brushById('column3');
const patchOf = (x: number, y: number, z: number, brush = CUBE, grow: 'up' | 'down' = 'up') =>
  brushPatch(at(x, y, z), brush, grow);

describe('the brush (R-162, R-164)', () => {
  describe('the registry', () => {
    it('offers the five shapes the GM named', () => {
      expect(BRUSHES.map((b) => b.name))
        .toEqual(['Cube', 'Flat 3×3', 'Flat 5×5', 'Column 2', 'Column 3']);
    });

    it('spans an odd number of cells, so the centre cube is always covered', () => {
      // The GM's "so we keep the center cube always", made arithmetic rather
      // than a convention: an even span is not in the registry to be chosen.
      for (const brush of BRUSHES) expect(brush.span % 2, brush.name).toBe(1);
    });

    it('caps a single edit at the largest shape', () => {
      const largest = Math.max(...BRUSHES.map((b) => b.span * b.span * b.rise));
      expect(MAP_BRUSH_CELLS).toBe(largest);
      for (const brush of BRUSHES) {
        expect(brushPatch(at(0, 0, 0), brush).length, brush.name)
          .toBeLessThanOrEqual(MAP_BRUSH_CELLS);
      }
    });

    it('falls back to one cube for an id it does not know', () => {
      // The id is view state and outlives a reload; the narrowest brush is the
      // safe answer to "I no longer know which one you meant".
      expect(brushById('flat9')).toBe(DEFAULT_BRUSH);
      expect(brushById('')).toBe(DEFAULT_BRUSH);
      expect(DEFAULT_BRUSH.span).toBe(1);
      expect(DEFAULT_BRUSH.rise).toBe(1);
    });
  });

  describe('brushPatch — where the brush reaches', () => {
    it('is one cube at the narrowest', () => {
      expect(patchOf(1, 2, 3)).toEqual([at(1, 2, 3)]);
    });

    it('covers span squared by rise, and always the cube it is anchored on', () => {
      for (const brush of BRUSHES) {
        const cells = brushPatch(at(1, 2, 3), brush);
        expect(cells, brush.name).toHaveLength(brush.span * brush.span * brush.rise);
        expect(cells, brush.name).toContainEqual(at(1, 2, 3));
        // No cell twice: a patch that repeated one would edit it twice and
        // count wrong in the readout.
        expect(new Set(cells.map(blockKey)).size, brush.name).toBe(cells.length);
      }
    });

    it('keeps a flat brush flat, whichever face was pointed at (D-213)', () => {
      // One shape and one level, every time. Following the face meant the
      // outline changed orientation as the pointer crossed an edge, so the
      // same gesture meant two different things depending on the pixel.
      for (const brush of [CUBE, FLAT3, FLAT5]) {
        expect(new Set(brushPatch(at(1, 2, 3), brush).map((c) => c.y)), brush.name)
          .toEqual(new Set([2]));
      }
    });

    it('raises a column from the anchor, not around it', () => {
      // A wall grows from where you clicked. Centring it would bury the bottom
      // of every column in whatever it was standing on.
      expect(new Set(patchOf(1, 2, 3, COLUMN3).map((c) => c.y))).toEqual(new Set([2, 3, 4]));
      expect(new Set(patchOf(1, 2, 3, COLUMN3).map((c) => c.x))).toEqual(new Set([1]));
    });

    it('sinks a column instead when it is growing down', () => {
      // Which is what the dig modifier asks for: the same shape, a shaft.
      expect(new Set(patchOf(1, 2, 3, COLUMN3, 'down').map((c) => c.y)))
        .toEqual(new Set([2, 1, 0]));
    });

    it('spreads a flat brush evenly, so the centre really is the centre', () => {
      const cells = patchOf(10, 0, 10, FLAT5);
      expect(Math.min(...cells.map((c) => c.x))).toBe(8);
      expect(Math.max(...cells.map((c) => c.x))).toBe(12);
      expect(Math.min(...cells.map((c) => c.z))).toBe(8);
      expect(Math.max(...cells.map((c) => c.z))).toBe(12);
    });

    it('reaches below zero like anything else does (R-160)', () => {
      expect(new Set(patchOf(4, -3, 4, FLAT3).map((c) => c.y))).toEqual(new Set([-3]));
      expect(new Set(patchOf(4, -1, 4, COLUMN3, 'down').map((c) => c.y)))
        .toEqual(new Set([-1, -2, -3]));
    });
  });

  describe('setBlocks — build lands where it can', () => {
    it('fills the empty cells of a patch and leaves the rest alone', () => {
      // The rule that makes a wide brush usable next to something already
      // built: refusing all twenty-five because one was occupied would not be.
      const map = createMap();
      const cells = brushPatch(at(2, 0, 2), FLAT3);
      const next = setBlocks(map, cells, STONE);
      // A new map is a floor at y0, so every cell of a flat patch there is taken.
      expect(next).toBe(map);

      const above = brushPatch(at(2, 1, 2), FLAT3);
      const built = setBlocks(map, above, STONE);
      expect(built).not.toBe(map);
      for (const cell of above) expect(blockAt(built, cell)).toBe(STONE);
    });

    it('never overwrites, which is the difference from paint (R-159)', () => {
      const map = setBlock(createMap(), at(2, 1, 2), STONE);
      const other = swatchOf(DEFAULT_MATERIALS.find((m) => swatchOf(m.id) !== STONE)!.id);
      const next = setBlocks(map, brushPatch(at(2, 1, 2), FLAT3), other);
      expect(blockAt(next, at(2, 1, 2))).toBe(STONE);
      // The eight neighbours were empty, so they take the new material.
      expect(blockAt(next, at(3, 1, 2))).toBe(other);
    });

    it('drops the cells the map does not own (R-157)', () => {
      // A brush at the corner laps over the edge. What is outside is skipped,
      // not placed and not an error — the same way it clips at the band.
      const map = createMap();
      const cells = brushPatch(at(0, 1, 0), FLAT3);
      const next = setBlocks(map, cells, STONE);
      const placed = cells.filter((cell) => blockAt(next, cell));
      expect(placed).toHaveLength(4);
      for (const cell of placed) expect(inMap(next, cell)).toBe(true);
    });

    it('keeps identity when there was nothing to do (R-165)', () => {
      const map = createMap();
      expect(setBlocks(map, [at(-500, 1, -500)], STONE)).toBe(map);
      expect(setBlocks(map, [], STONE)).toBe(map);
    });
  });

  describe('paintBlocks — paint will not conjure', () => {
    it('repaints only the cells that hold a block', () => {
      const map = createMap();
      const cells = [...brushPatch(at(2, 0, 2), FLAT3), at(2, 5, 2)];
      const other = swatchOf(DEFAULT_MATERIALS.find((m) => swatchOf(m.id) !== DEFAULT_FLOOR)!.id);
      const next = paintBlocks(map, cells, other);
      expect(blockAt(next, at(2, 0, 2))).toBe(other);
      // The cell in the air stayed empty rather than becoming a block.
      expect(blockAt(next, at(2, 5, 2))).toBeNull();
    });

    it('keeps identity when every cell is already that material (R-165)', () => {
      const map = createMap();
      expect(paintBlocks(map, brushPatch(at(2, 0, 2), FLAT3), DEFAULT_FLOOR)).toBe(map);
    });
  });

  describe('clearBlocks — erase takes what is there', () => {
    it('removes every cell of a patch that held a block', () => {
      const map = createMap();
      const cells = brushPatch(at(4, 0, 4), FLAT5);
      const next = clearBlocks(map, cells);
      for (const cell of cells) expect(blockAt(next, cell)).toBeNull();
      expect(next.blocks.size).toBe(map.blocks.size - cells.length);
    });

    it('keeps identity when the patch was already empty (R-165)', () => {
      const map = createMap();
      expect(clearBlocks(map, brushPatch(at(4, 9, 4), FLAT3))).toBe(map);
    });
  });
});

describe('the packed body (R-59, D-217)', () => {
  const build = (cells: readonly { x: number; y: number; z: number }[]) => {
    let map = createMap();
    for (const cell of cells) map = setBlock(map, cell, STONE);
    return map;
  };
  const roundTrip = (map: ReturnType<typeof createMap>) => mapFromJSON(mapToJSON(map))!;

  it('comes back exactly, cube for cube', () => {
    const map = build([at(0, 1, 0), at(5, 7, 9), at(15, 0, 15), at(3, -4, 3)]);
    const back = roundTrip(map);
    expect(back.blocks.size).toBe(map.blocks.size);
    for (const [key, material] of map.blocks) expect(back.blocks.get(key), key).toBe(material);
  });

  it('comes back exactly at the very edges of the box', () => {
    // The corners and both height bounds, where an off-by-one in the index
    // arithmetic would put a cube on the far side of the map or lose it.
    const map = build([
      at(0, MAP_MIN_DEPTH, 0),
      at(MAP_PATCH - 1, MAP_MAX_HEIGHT - 1, MAP_PATCH - 1),
      at(0, MAP_MAX_HEIGHT - 1, MAP_PATCH - 1),
      at(MAP_PATCH - 1, MAP_MIN_DEPTH, 0),
    ]);
    const back = roundTrip(map);
    for (const key of map.blocks.keys()) expect(back.blocks.has(key), key).toBe(true);
    expect(back.blocks.size).toBe(map.blocks.size);
  });

  it('survives a body with nothing in it', () => {
    const empty = clearBlocks(createMap(), [...createMap().blocks.keys()].map(
      (k) => parseBlockKey(k)!,
    ));
    expect(empty.blocks.size).toBe(0);
    expect(roundTrip(empty).blocks.size).toBe(0);
  });

  it('keeps every material distinct through the palette', () => {
    let map = createMap();
    const some = DEFAULT_MATERIALS.slice(0, 5);
    some.forEach((material, i) => { map = setBlock(map, at(i, 5, 0), swatchOf(material.id)); });
    const back = roundTrip(map);
    some.forEach((material, i) => {
      expect(blockAt(back, at(i, 5, 0)), material.name).toBe(material.id);
    });
  });

  it('keeps a body that strayed outside its declared footprint (R-157)', () => {
    /*
     * A run stream can only describe cells inside its own box, so if the box
     * were not repaired first, a stray cube would be dropped on the way out —
     * silently, and before the repair that used to catch it on the way in.
     * This is the bug of D-199 arriving by a new route.
     */
    const map = { ...createMap(), blocks: new Map([...createMap().blocks, ['-5,1,-5', STONE]]) };
    const back = roundTrip(map);
    expect(blockAt(back, at(-5, 1, -5))).toBe(STONE);
    expect(back.blocks.size).toBe(map.blocks.size);
  });

  it('still reads a body written before packing (R-137a)', () => {
    // The migration, and the only reason the GM's campaign still opens. A file
    // with `blocks` and no runs is read as it is, and written packed after.
    const old = {
      origin: { x: 0, z: 0 },
      size: { x: 16, z: 16 },
      blocks: { '1,0,1': STONE as string, '2,3,4': STONE as string },
      planes: [],
    };
    const read = mapFromJSON(old)!;
    expect(read.blocks.size).toBe(2);
    expect(blockAt(read, at(2, 3, 4))).toBe(STONE);
    // And writing it back produces the packed shape, not the one it came in as.
    const written = mapToJSON(read);
    expect(written.runs.length).toBeGreaterThan(0);
    expect('blocks' in written).toBe(false);
  });

  it('refuses a stream whose counts do not describe the box', () => {
    /*
     * A cube inserted or lost shifts every cube after it, so the map would
     * open drawn one cell askew — which looks like the GM's own mistake.
     * Refusing says so instead (R-18).
     */
    const good = mapToJSON(build([at(2, 2, 2)]));
    expect(mapFromJSON(good)).not.toBeNull();
    expect(mapFromJSON({ ...good, runs: [...good.runs.slice(0, -1)] })).toBeNull();
    expect(mapFromJSON({ ...good, runs: good.runs.map((n, i) => (i === 0 ? n + 1 : n)) }))
      .toBeNull();
    expect(mapFromJSON({ ...good, palette: [] })).toBeNull();
  });

  it('is dramatically smaller than one entry per cube, which is the point', () => {
    // A floor and a wall: the shape of a real map, mostly air.
    let map = createMap();
    for (let y = 1; y < 8; y += 1) {
      for (let x = 0; x < MAP_PATCH; x += 1) map = setBlock(map, at(x, y, 0), STONE);
    }
    const packed = JSON.stringify(mapToJSON(map)).length;
    const perCube = JSON.stringify(
      Object.fromEntries([...map.blocks].map(([k, v]) => [k, v])),
    ).length;
    expect(packed).toBeLessThan(perCube / 4);
  });
});

describe('families and their cuts (R-178)', () => {
  const BRICK = DEFAULT_MATERIALS.find((m) => m.name === 'Brick')!;
  const MINERAL = DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!;

  it('writes the default cut bare, so the commonest block costs the shortest string', () => {
    expect(swatchFor(BRICK, 'clay')).toBe(BRICK.id as string);
    expect(swatchFor(BRICK, 'limestone')).toBe(`${BRICK.id}/limestone`);
    expect(cutIdIn(BRICK.id as unknown as SwatchId)).toBeNull();
    expect(cutOf(BRICK, null).id).toBe('clay');
  });

  it('round-trips every cut of every family', () => {
    for (const material of DEFAULT_MATERIALS) {
      for (const cut of material.cuts) {
        const swatch = swatchFor(material, cut.id);
        expect(materialIn(swatch)).toBe(material.id);
        expect(cutOf(material, cutIdIn(swatch)).id).toBe(cut.id);
        expect(colourOf(material, cutIdIn(swatch))).toBe(cut.colour);
        expect(isKnownSwatch(swatch)).toBe(true);
      }
    }
  });

  it('refuses a cut that belongs to another family', () => {
    // Gold is a mineral; it is not a kind of glass.
    const glass = DEFAULT_MATERIALS.find((m) => m.name === 'Glassy')!;
    expect(isKnownSwatch(swatchOf(MINERAL.id, 'gold'))).toBe(true);
    expect(isKnownSwatch(swatchOf(glass.id, 'gold'))).toBe(false);
  });

  it('refuses an unknown family, an invented cut, and the default spelled out', () => {
    expect(isKnownSwatch('material:unobtanium/gold' as SwatchId)).toBe(false);
    expect(isKnownSwatch(swatchOf(BRICK.id, 'chartreuse'))).toBe(false);
    // One value, one spelling: `material:brick` already means clay.
    expect(isKnownSwatch(swatchOf(BRICK.id, 'clay'))).toBe(false);
  });

  it('every family has a default, and no family repeats a cut id', () => {
    for (const material of DEFAULT_MATERIALS) {
      expect(material.cuts.length, `${material.name} has no cuts`).toBeGreaterThan(0);
      const ids = material.cuts.map((cut) => cut.id);
      expect(new Set(ids).size, `${material.name} repeats a cut id`).toBe(ids.length);
    }
  });

  it('keeps the families the registry is organised by, and drops what folded in', () => {
    expect(DEFAULT_MATERIALS.map((m) => m.name)).toEqual([
      'Brick', 'Mineral', 'Wood', 'Soil', 'Grass', 'Vegetation', 'Liquids', 'Glowing', 'Glassy',
    ]);
    // Metal, thatch, stone, sand, dirt, snow and ice are cuts now, not families.
    for (const gone of ['metal', 'thatch', 'stone', 'sand', 'dirt', 'snow', 'ice', 'water']) {
      expect(isKnownSwatch(`material:${gone}` as SwatchId), `material:${gone} still resolves`)
        .toBe(false);
    }
  });

  it('survives the packing, which is what puts a cut on disk', () => {
    let map = createMap();
    MINERAL.cuts.forEach((cut, i) => {
      map = setBlock(map, at(i, 5, 0), swatchFor(MINERAL, cut.id));
    });
    const back = mapFromJSON(mapToJSON(map))!;
    MINERAL.cuts.forEach((cut, i) => {
      expect(blockAt(back, at(i, 5, 0))).toBe(swatchFor(MINERAL, cut.id));
    });
  });

  it('gives no two cuts of one family the same colour', () => {
    for (const material of DEFAULT_MATERIALS) {
      const colours = material.cuts.map((cut) => cut.colour);
      expect(new Set(colours).size, `${material.name} repeats a colour`).toBe(colours.length);
    }
  });
});

describe('a fill stops where the cut changes (R-176)', () => {
  const MINERAL = DEFAULT_MATERIALS.find((m) => m.name === 'Mineral')!;
  const DARK = swatchFor(MINERAL, 'dark-rock');
  const GOLD = swatchFor(MINERAL, 'gold');

  it('treats two cuts of one mineral as different, which is what makes a seam repaintable', () => {
    // A wall of dark rock with one course of gold running through it.
    let map = createMap();
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        map = setBlock(map, at(x, y, 0), y === 2 ? GOLD : DARK);
      }
    }
    const course = fillRegion(map, at(0, 2, 0));
    expect(course).toHaveLength(4);
    expect(course.every((cell) => cell.y === 2)).toBe(true);

    const repainted = fillMaterial(map, at(0, 2, 0), DARK);
    expect(blockAt(repainted, at(3, 2, 0))).toBe(DARK);
    expect(blockAt(repainted, at(3, 1, 0))).toBe(DARK);
  });
});
