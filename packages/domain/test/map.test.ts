// The encounter map body (R-145, R-149, R-150).

import { describe, it, expect } from 'vitest';
import type { MaterialId, Place, PlaceCell } from '@tt/domain';
import {
  addPlace, addPoi, withPoiMaps, fillRegion, fillMaterial, mapCentre, enclosing,
  createMap, setBlock, clearBlock, growMap, blockAt, blockKey, parseBlockKey,
  inMap, topOfMap, mapToJSON, mapFromJSON,
  MAP_PATCH, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, bottomOfMap,
  DEFAULT_FLOOR, DEFAULT_MATERIALS, isKnownMaterial,
} from '@tt/domain';

const STONE = DEFAULT_MATERIALS.find((m) => m.name === 'Stone')!.id;
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

  it('preserves identity when nothing changes (R-12)', () => {
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

  it('sorts keys, so an autosave does not churn the diff', () => {
    let map = createMap();
    map = setBlock(map, at(9, 9, 9), STONE);
    map = setBlock(map, at(1, 1, 1), STONE);
    const keys = Object.keys(mapToJSON(map).blocks);
    expect(keys).toEqual([...keys].sort());
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
    const byName = (n: string) => DEFAULT_MATERIALS.find((m) => m.name === n)!;
    expect(byName('Stone').blocksSight).toBe(true);
    expect(byName('Glass').blocksSight).toBe(false);
    expect(byName('Water').blocksSight).toBe(false);
    expect(byName('Ice').blocksSight).toBe(false);
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

    it('preserves identity when every one already has a map (R-12)', () => {
      const places = seeded();
      expect(withPoiMaps(places)).toBe(places);
      expect(withPoiMaps([])).toEqual([]);
    });
  });
});

describe('the bucket fill (R-154)', () => {
  const GRASS = DEFAULT_MATERIALS.find((m) => m.name === 'Grass')!.id;

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

  it('preserves identity when the region is already that material (R-12)', () => {
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
    const blocks = new Map<string, MaterialId>();
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
    const blocks = new Map<string, MaterialId>();
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
