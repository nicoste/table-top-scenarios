// The encounter map body (R-145, R-149, R-150).

import { describe, it, expect } from 'vitest';
import type { MaterialId, Place, PlaceCell } from '@tt/domain';
import {
  addPlace, addPoi, withPoiMaps,
  createMap, setBlock, clearBlock, growMap, blockAt, blockKey, parseBlockKey,
  inMap, topOfMap, mapToJSON, mapFromJSON,
  MAP_PATCH, MAP_MAX_HEIGHT, DEFAULT_FLOOR, DEFAULT_MATERIALS, isKnownMaterial,
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
    expect(inMap(map, at(0, -1, 0))).toBe(false);
    expect(inMap(map, at(0, MAP_MAX_HEIGHT, 0))).toBe(false);
    expect(inMap(map, at(0, MAP_MAX_HEIGHT - 1, 0))).toBe(true);
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

describe('growing (R-150)', () => {
  it('extends one axis by a patch and floors the new ground', () => {
    const grown = growMap(createMap(), 'x');
    expect(grown.size).toEqual({ x: MAP_PATCH * 2, z: MAP_PATCH });
    expect(blockAt(grown, at(MAP_PATCH, 0, 0))).toBe(DEFAULT_FLOOR);
    expect(inMap(grown, at(MAP_PATCH, 0, 0))).toBe(true);
  });

  it('leaves every existing block at the coordinate it already had', () => {
    // Growing outward from the origin only, because renumbering a body is how
    // saved references rot.
    const built = setBlock(createMap(), at(2, 3, 4), STONE);
    const grown = growMap(growMap(built, 'x'), 'z');
    expect(blockAt(grown, at(2, 3, 4))).toBe(STONE);
  });

  it('keeps the floor material the map was created with', () => {
    const grown = growMap(createMap(STONE), 'z');
    expect(blockAt(grown, at(0, 0, MAP_PATCH))).toBe(STONE);
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
