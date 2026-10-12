import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TRAVEL_MODES, groundCost, isPassable, swatchOf, isKnownSwatch,
  DEFAULT_METRES_PER_CELL, DEFAULT_METRES_PER_LEVEL, DEFAULT_BOUNDS, CHUNK_SIZE, MAX_HEIGHT,
  DEFAULT_SLOPE_FACTOR,
} from '@tt/domain';
import type { MaterialId, SwatchId, TravelMode } from '@tt/domain';

/** A swatch written the way the world stores one: "liquid", "liquid/shore". */
const g = (spec: string): SwatchId => {
  const [family, cut] = spec.split('/');
  const swatch = swatchOf(`material:${family}` as MaterialId, cut ?? null);
  if (!isKnownSwatch(swatch)) throw new Error(`no such ground: ${spec}`);
  return swatch;
};

const mode = (id: string): TravelMode => {
  const found = DEFAULT_TRAVEL_MODES.find((m) => m.id === `travel:${id}`);
  if (!found) throw new Error(`no such mode: ${id}`);
  return found;
};
const cost = (m: string, ground: string) => groundCost(mode(m), g(ground));

describe('the ocean needs a boat, not a big multiplier', () => {
  it('cannot be crossed on foot at any cost', () => {
    expect(cost('foot', 'liquid')).toBe('impassable');
    expect(cost('horse', 'liquid')).toBe('impassable');
    expect(cost('forced', 'liquid')).toBe('impassable');
    // Every cut of the family, because a boat is what the family needs and
    // green water is not a loophole (R-192).
    expect(cost('foot', 'liquid/green')).toBe('impassable');
  });

  it('is ordinary going by ship', () => {
    expect(cost('ship', 'liquid')).toBe(1);
    expect(cost('galley', 'liquid')).toBe(1);
    // Keyed on the family, so a cut nobody thought about is still sailable.
    expect(cost('ship', 'liquid/green')).toBe(1);
  });

  it('does not let a ship sail overland', () => {
    for (const ground of ['grass', 'vegetation', 'mineral', 'brick/dressed', 'soil/sand']) {
      expect(cost('ship', ground), ground).toBe('impassable');
    }
  });

  it('meets the land at the shore, so a boat has somewhere to put in', () => {
    // One cut of the same family, going both ways: a boat is slower there and
    // a party can wade it. The swatch key beats the family key, and the cut's
    // own difficulty beats the family's (R-192, D-281).
    expect(cost('ship', 'liquid/shore')).toBe(1.5);
    expect(cost('foot', 'liquid/shore')).toBe(3);
    expect(isPassable(cost('ship', 'liquid/shore'))).toBe(true);
    expect(isPassable(cost('foot', 'liquid/shore'))).toBe(true);
  });
});

describe('a column override beats the mode', () => {
  it('lets a bridge cross water', () => {
    expect(groundCost(mode('foot'), g('liquid'), 1)).toBe(1);
  });

  it('lets the GM close a road', () => {
    expect(groundCost(mode('foot'), g('brick/dressed'), 'impassable')).toBe('impassable');
  });

  it('beats even a mode that says the ground is its own', () => {
    // A ford in the shallows: the place wins over the boat's 1.5.
    expect(groundCost(mode('ship'), g('liquid/shore'), 0.5)).toBe(0.5);
  });
});

describe('ground difficulties are grounded and ordered (R-192)', () => {
  const of = (spec: string) => {
    const d = groundCost(mode('foot'), g(spec));
    if (d === 'impassable') throw new Error(`${spec} is impassable`);
    return d;
  };

  it('uses grass as the reference at exactly 1', () => {
    // The 3.5 overland table normalised so open country is 1, which is what
    // every other number here is a multiple of.
    expect(of('grass')).toBe(1);
  });

  it('makes laid stone the only thing faster than open ground', () => {
    expect(of('brick')).toBeLessThan(1);
    for (const spec of [
      'soil/sand', 'vegetation', 'mineral', 'soil/snow', 'vegetation/dark', 'liquid/shore',
    ]) {
      expect(of(spec), spec).toBeGreaterThanOrEqual(1);
    }
  });

  it('ranks dark undergrowth as the worst passable land', () => {
    const land = ['grass', 'brick', 'soil', 'soil/sand', 'vegetation', 'mineral', 'wood'];
    for (const spec of land) expect(of('vegetation/dark'), spec).toBeGreaterThan(of(spec));
  });

  it('keeps bare rock modest, because slope charges for the climb (R-52a)', () => {
    // A hill is height now, not a ground (D-281). Charging for the climb here
    // as well as in the slope factor is what made mountains absurd.
    expect(of('mineral')).toBeLessThanOrEqual(2);
  });

  it('charges more for wading than for any of it', () => {
    const land = ['grass', 'brick', 'soil/sand', 'vegetation/dark', 'mineral'];
    for (const spec of land) expect(of('liquid/shore'), spec).toBeGreaterThan(of(spec));
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

  it('makes a world cell exactly 1000 poi cells', () => {
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
