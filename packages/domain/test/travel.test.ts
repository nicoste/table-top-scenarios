import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TERRAIN, DEFAULT_TRAVEL_MODES, terrainCost, isPassable, registryId, requireTerrain,
  DEFAULT_METRES_PER_CELL, DEFAULT_METRES_PER_LEVEL, DEFAULT_BOUNDS, CHUNK_SIZE, MAX_HEIGHT,
  DEFAULT_SLOPE_FACTOR,
} from '@tt/domain';
import type { TerrainId, TravelMode } from '@tt/domain';

const t = (name: string) => registryId<'TerrainId'>('terrain', name) as TerrainId;
const mode = (id: string): TravelMode => {
  const found = DEFAULT_TRAVEL_MODES.find((m) => m.id === `travel:${id}`);
  if (!found) throw new Error(`no such mode: ${id}`);
  return found;
};
const cost = (m: string, terrain: string) => terrainCost(mode(m), DEFAULT_TERRAIN, t(terrain));

describe('the ocean needs a boat, not a big multiplier', () => {
  it('cannot be crossed on foot at any cost', () => {
    expect(cost('foot', 'water')).toBe('impassable');
    expect(cost('horse', 'water')).toBe('impassable');
    expect(cost('forced', 'water')).toBe('impassable');
  });

  it('is ordinary going by ship', () => {
    expect(cost('ship', 'water')).toBe(1);
    expect(cost('galley', 'water')).toBe(1);
  });

  it('does not let a ship sail overland', () => {
    for (const terrain of ['grass', 'forest', 'rock', 'road', 'swamp', 'sand']) {
      expect(cost('ship', terrain), terrain).toBe('impassable');
    }
  });

  it('meets the land at the shallows, so a boat has somewhere to put in', () => {
    expect(isPassable(cost('ship', 'shallows'))).toBe(true);
    expect(isPassable(cost('foot', 'shallows'))).toBe(true);
  });
});

describe('a column override beats the mode', () => {
  it('lets a bridge cross water', () => {
    expect(terrainCost(mode('foot'), DEFAULT_TERRAIN, t('water'), 1)).toBe(1);
  });

  it('lets the GM close a road', () => {
    expect(terrainCost(mode('foot'), DEFAULT_TERRAIN, t('road'), 'impassable')).toBe('impassable');
  });
});

describe('terrain difficulties are grounded and ordered', () => {
  const of = (name: string) => {
    const d = requireTerrain(DEFAULT_TERRAIN, t(name)).defaultDifficulty;
    if (d === 'impassable') throw new Error(`${name} is impassable`);
    return d;
  };

  it('uses grassland as the reference at exactly 1', () => {
    expect(of('grass')).toBe(1);
  });

  it('makes roads the only thing faster than open ground', () => {
    expect(of('road')).toBeLessThan(1);
    for (const name of ['sand', 'forest', 'hills', 'rock', 'snow', 'swamp', 'jungle', 'shallows']) {
      expect(of(name), name).toBeGreaterThanOrEqual(1);
    }
  });

  it('ranks jungle as the worst passable land', () => {
    const land = ['grass', 'road', 'sand', 'forest', 'hills', 'rock', 'snow', 'swamp', 'moor'];
    for (const name of land) expect(of('jungle'), name).toBeGreaterThan(of(name));
  });

  it('keeps rock and hills modest, because slope charges for the climb (R-52a)', () => {
    expect(of('rock')).toBeLessThanOrEqual(2);
    expect(of('hills')).toBeLessThanOrEqual(2);
  });
});

describe('travel modes', () => {
  it('order on foot from cautious to forced march', () => {
    expect(mode('cautious').kmPerDay).toBeLessThan(mode('foot').kmPerDay);
    expect(mode('foot').kmPerDay).toBeLessThan(mode('forced').kmPerDay);
  });

  it('put a galley ahead of everything else', () => {
    for (const m of DEFAULT_TRAVEL_MODES) {
      if (m.id !== 'travel:galley') expect(m.kmPerDay).toBeLessThanOrEqual(mode('galley').kmPerDay);
    }
  });

  it('match 5e: 24 miles a day on foot at a normal pace', () => {
    expect(Math.round(mode('foot').kmPerDay / 1.609)).toBe(24);
    expect(Math.round(mode('ship').kmPerDay / 1.609)).toBe(48);
    expect(Math.round(mode('galley').kmPerDay / 1.609)).toBe(96);
  });

  it('give every mode a unique namespaced id', () => {
    const ids = DEFAULT_TRAVEL_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^travel:[a-z-]+$/.test(id))).toBe(true);
  });
});

describe('the scales, derived so they cannot go stale', () => {
  it('puts a world cell within 7% of the DMG province scale of one mile', () => {
    const miles = DEFAULT_METRES_PER_CELL / 1609.34;
    expect(Math.abs(miles - 1)).toBeLessThan(0.07);
  });

  it('makes a world cell exactly 1000 encounter cells', () => {
    expect(DEFAULT_METRES_PER_CELL / 1.5).toBe(1000);
  });

  it('makes a chunk about a day on foot, which is the useful mental model', () => {
    const chunkKm = (CHUNK_SIZE * DEFAULT_METRES_PER_CELL) / 1000;
    expect(chunkKm).toBe(45);
    const days = chunkKm / mode('foot').kmPerDay;
    expect(days).toBeGreaterThan(0.8);
    expect(days).toBeLessThan(1.3);
  });

  it('gives a default world of continent scale', () => {
    const worldKm = (DEFAULT_BOUNDS.x * CHUNK_SIZE * DEFAULT_METRES_PER_CELL) / 1000;
    expect(worldKm).toBe(1350);
    expect(Math.round(worldKm / mode('foot').kmPerDay)).toBe(35);
  });

  it('caps mountains at 4.5 km, because height is levels not cells', () => {
    expect(MAX_HEIGHT * DEFAULT_METRES_PER_LEVEL).toBe(4500);
  });

  it('keeps slopeFactor tied to the height level via Naismith (R-52a)', () => {
    const flatEquivalentMetres = (DEFAULT_METRES_PER_LEVEL / 600) * 5000;
    const implied = flatEquivalentMetres / DEFAULT_METRES_PER_CELL;
    expect(Math.abs(implied - DEFAULT_SLOPE_FACTOR)).toBeLessThan(0.01);
  });
});
