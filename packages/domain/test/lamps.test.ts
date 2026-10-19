// Lamplight (D-335): light fills the air from each flame, dimmer the further
// it went, and stops at blocks and at whatever stops sight — so it never
// shines through a wall, and a shut door keeps it in the room.

import { describe, it, expect } from 'vitest';
import type { BlockCoord, EncounterMap, SwatchId } from '@tt/domain';
import {
  createMap, setBlocks, DEFAULT_FLOOR, putProp, propLights, carriedAt, lampField, lightIn, glow, TORCH,
  NONE_OPEN, withCarried, NO_CARRIED, carriedOnRoster, carriedToJSON, carriedFromJSON, carriedLightFromJSON,
  MAX_LIGHT_REACH, flameColour, lightSilver, silverToJSON, silverFromJSON, nextShadows, LIGHT_SHADOWS,
} from '@tt/domain';
import type { SilverToken } from '@tt/domain';

const cube = (x: number, y: number, z: number): BlockCoord => ({ x, y, z });
const STONE = DEFAULT_FLOOR as SwatchId;
const torch = (at: BlockCoord, reach = 4) => ({ at, colour: '#ffffff', reach, rise: 0.5 });
const brightness = (map: EncounterMap, sources: ReturnType<typeof torch>[], at: BlockCoord, opened = NONE_OPEN) =>
  lightIn(lampField(map, opened, sources), at)[0];

/** A wall across x = 5, from the floor to y = 6, the whole width of the map. */
function walled(): EncounterMap {
  const wall: BlockCoord[] = [];
  for (let z = 0; z < 16; z += 1) for (let y = 1; y <= 6; y += 1) wall.push(cube(5, y, z));
  return setBlocks(createMap(), wall, STONE);
}

describe('how bright, how far', () => {
  it('is full at the flame, dimmer with distance, and nothing past its reach', () => {
    expect(glow(0, 4)).toBe(1);
    expect(glow(2, 4)).toBeLessThan(glow(1, 4));
    expect(glow(4, 4)).toBeGreaterThan(0);
    expect(glow(5, 4)).toBe(0);
  });

  it('lights the cubes round a flame by how far they are, and none beyond its reach', () => {
    const map = createMap();
    const sources = [torch(cube(8, 1, 8))];
    expect(brightness(map, sources, cube(8, 1, 8))).toBeCloseTo(1);
    expect(brightness(map, sources, cube(10, 1, 8))).toBeLessThan(brightness(map, sources, cube(9, 1, 8)));
    expect(brightness(map, sources, cube(14, 1, 8))).toBe(0);
  });

  it('is nothing at all with no lights, or a light inside a block', () => {
    expect(lampField(createMap(), NONE_OPEN, [])).toBeNull();
    expect(lampField(createMap(), NONE_OPEN, [torch(cube(3, 0, 3))])).toBeNull();
  });

  it('covers the lights\' own box, cut to the map, and says where blocks are', () => {
    const field = lampField(createMap(), NONE_OPEN, [torch(cube(1, 1, 1), 2)])!;
    expect(field.origin).toEqual({ x: 0, y: -2, z: 0 });
    expect(field.size.x).toBeLessThan(16);
    // The floor under the flame is a block: no light can be in it.
    const floor = (1 - field.origin.x) + field.size.x * ((0 - field.origin.y) + field.size.y * (1 - field.origin.z));
    expect(field.data[floor * 4 + 3]).toBe(0);
    const air = (1 - field.origin.x) + field.size.x * ((1 - field.origin.y) + field.size.y * (1 - field.origin.z));
    expect(field.data[air * 4 + 3]).toBe(1);
  });

  it('never takes one light\'s far corners for walls where another light shines', () => {
    // The first light's box reaches (5,1,5), but its reach does not: that cube
    // is the second light's flame, open air, and must read as air.
    const field = lampField(createMap(), NONE_OPEN, [torch(cube(2, 1, 2), 2), torch(cube(5, 1, 5), 4)])!;
    const air = (at: BlockCoord) => {
      const f = (at.x - field.origin.x) + field.size.x * ((at.y - field.origin.y) + field.size.y * (at.z - field.origin.z));
      return field.data[f * 4 + 3];
    };
    expect(air(cube(5, 1, 5))).toBe(1);
    expect(air(cube(4, 1, 5))).toBe(1);
    expect(air(cube(5, 0, 5))).toBe(0);
  });

  it('adds lights up, in their colours', () => {
    const map = createMap();
    const blue = lightIn(lampField(map, NONE_OPEN, [{ at: cube(8, 1, 8), colour: flameColour('cold'), reach: 4, rise: 0.5 }]), cube(8, 1, 9));
    expect(blue[2]).toBeGreaterThan(blue[0]);
    const one = brightness(map, [torch(cube(8, 1, 8))], cube(8, 1, 10));
    const two = brightness(map, [torch(cube(8, 1, 8)), torch(cube(8, 1, 12))], cube(8, 1, 10));
    expect(two).toBeGreaterThan(one);
  });
});

describe('what stops it', () => {
  it('never shines through a wall', () => {
    const map = walled();
    const sources = [torch(cube(3, 1, 7))];
    expect(brightness(map, sources, cube(1, 1, 7))).toBeGreaterThan(0);
    // Two cubes away either side; the far one only by going over a wall too tall for its reach.
    expect(brightness(createMap(), sources, cube(7, 1, 7))).toBeGreaterThan(0);
    expect(brightness(map, sources, cube(7, 1, 7))).toBe(0);
  });

  it('is kept in by a shut door, which is lit on its side, and let out by an open one', () => {
    const wall: BlockCoord[] = [];
    for (let z = 0; z < 16; z += 1) for (let y = 1; y <= 6; y += 1) if (!(z === 7 && y <= 2)) wall.push(cube(5, y, z));
    const map = putProp(setBlocks(createMap(), wall, STONE), { type: 'door', at: cube(5, 1, 7), facing: 1 });
    const door = map.props[0]!.id as string;
    const sources = [torch(cube(3, 1, 7))];
    expect(brightness(map, sources, cube(6, 1, 7))).toBe(0);
    expect(brightness(map, sources, cube(5, 1, 7))).toBeGreaterThan(0);
    expect(brightness(map, sources, cube(6, 1, 7), new Set([door]))).toBeGreaterThan(0);
  });

  it('does not squeeze between two blocks that meet at a corner', () => {
    const columns: BlockCoord[] = [];
    for (let y = 1; y <= 6; y += 1) columns.push(cube(4, y, 6), cube(5, y, 7));
    const map = setBlocks(createMap(), columns, STONE);
    const sources = [torch(cube(4, 1, 7), 2)];
    expect(brightness(createMap(), sources, cube(5, 1, 6))).toBeGreaterThan(0);
    expect(brightness(map, sources, cube(5, 1, 6))).toBe(0);
  });
});

describe('shadows (D-337)', () => {
  it('a pillar throws one: dimmer behind it, never black, and nothing changes beside it', () => {
    const pillar = [1, 2, 3, 4, 5, 6].map((y) => cube(8, y, 8));
    const map = setBlocks(createMap(), pillar, STONE);
    const sources = [torch(cube(5, 1, 8), 8)];
    const open = brightness(createMap(), sources, cube(11, 1, 8));
    const behind = brightness(map, sources, cube(11, 1, 8));
    expect(behind).toBeGreaterThan(0);
    expect(behind).toBeLessThan(open * 0.5);
    expect(brightness(map, sources, cube(8, 1, 11))).toBeCloseTo(brightness(createMap(), sources, cube(8, 1, 11)));
  });

  it('a doorway throws a wedge of light into the room beyond, and the rest of it has what bounced', () => {
    const wall: BlockCoord[] = [];
    for (let z = 0; z < 16; z += 1) for (let y = 1; y <= 6; y += 1) if (!(z === 7 && y <= 2)) wall.push(cube(5, y, z));
    const map = setBlocks(createMap(), wall, STONE);
    const sources = [torch(cube(2, 1, 7), 8)];
    const through = brightness(map, sources, cube(8, 1, 7));
    expect(through).toBeCloseTo(glow(6, 8));
    const aside = brightness(map, sources, cube(6, 1, 10));
    expect(aside).toBeGreaterThan(0);
    expect(aside).toBeLessThan(glow(5, 8) * 0.5);
  });
});

describe('a screen\'s choice of shadows (D-339)', () => {
  it('steps soft, real, none and round again, starting soft', () => {
    expect(LIGHT_SHADOWS[0]).toBe('soft');
    expect(nextShadows('soft')).toBe('real');
    expect(nextShadows('real')).toBe('none');
    expect(nextShadows('none')).toBe('soft');
  });

  it('with none, a pillar throws no shadow: the light finds its way round, as at first (D-335)', () => {
    const pillar = [1, 2, 3, 4, 5, 6].map((y) => cube(8, y, 8));
    const map = setBlocks(createMap(), pillar, STONE);
    const sources = [torch(cube(5, 1, 8), 8)];
    const soft = lightIn(lampField(map, NONE_OPEN, sources, 'soft'), cube(11, 1, 8))[0];
    const none = lightIn(lampField(map, NONE_OPEN, sources, 'none'), cube(11, 1, 8))[0];
    expect(none).toBeGreaterThan(soft * 2);
    // Walls still stop it.
    expect(brightness(walled(), [torch(cube(3, 1, 7))], cube(7, 1, 7))).toBe(0);
    expect(lightIn(lampField(walled(), NONE_OPEN, [torch(cube(3, 1, 7))], 'none'), cube(7, 1, 7))[0]).toBe(0);
  });
});

describe('a light whose lamp casts its own shadows (D-338)', () => {
  it('leaves only what bounced round in the field, where its lamp cannot reach', () => {
    const pillar = [1, 2, 3, 4, 5, 6].map((y) => cube(8, y, 8));
    const map = setBlocks(createMap(), pillar, STONE);
    const lamp = { ...torch(cube(5, 1, 8), 8), shadowed: true };
    // In plain view, the field has only the bounce: the lamp lights it.
    expect(brightness(map, [lamp], cube(5, 1, 11))).toBeLessThan(brightness(map, [torch(cube(5, 1, 8), 8)], cube(5, 1, 11)) * 0.5);
    // Behind the pillar the two agree: only what bounced reaches it either way.
    expect(brightness(map, [lamp], cube(11, 1, 8))).toBeCloseTo(brightness(map, [torch(cube(5, 1, 8), 8)], cube(11, 1, 8)));
  });
});

describe('where the lights are', () => {
  it('is every lit light in a map, in its flame and its reach', () => {
    let map = putProp(createMap(), { type: 'campfire', at: cube(3, 1, 3), facing: 0 });
    map = putProp(map, { type: 'candles', at: cube(9, 1, 9), facing: 0 });
    map = putProp(map, { type: 'table', at: cube(12, 1, 12), facing: 0 });
    const [fire, candles] = map.props;
    expect(propLights(map.props)).toEqual([
      { at: cube(3, 1, 3), colour: flameColour('fire'), reach: 10, rise: 0.8 },
      { at: cube(9, 1, 9), colour: flameColour('candle'), reach: 3, rise: 0.45 },
    ]);
    // Put out, it gives none.
    expect(propLights(map.props, new Set([fire!.id as string]))).toEqual([propLights(map.props)[1]]);
    expect(candles!.type).toBe('candles');
  });

  it('is where somebody carrying one stands', () => {
    expect(carriedAt(cube(2, 1, 2), TORCH)).toEqual({ at: cube(2, 1, 2), colour: flameColour('fire'), reach: 6, rise: 1.1 });
  });
});

describe('the lights the party carries, in the save', () => {
  it('gives one and takes it, keeps no empty entry, and forgets members who left', () => {
    const one = withCarried(NO_CARRIED, 'member_a', TORCH);
    expect(one.get('member_a')).toEqual(TORCH);
    expect(withCarried(one, 'member_a', { ...TORCH })).toBe(one);
    expect(withCarried(one, 'member_a', null).size).toBe(0);
    expect(carriedOnRoster(one, new Set(['member_b'])).size).toBe(0);
    expect(carriedOnRoster(one, new Set(['member_a']))).toBe(one);
  });

  it('round-trips, and reads an odd one leniently', () => {
    const carried = withCarried(NO_CARRIED, 'member_a', { flame: 'cold', reach: 9 });
    expect(carriedFromJSON(carriedToJSON(carried))).toEqual(carried);
    expect(carriedFromJSON(undefined)).toBe(NO_CARRIED);
    expect(carriedLightFromJSON({ flame: 'plasma', reach: 400 })).toEqual({ flame: 'fire', reach: MAX_LIGHT_REACH });
    expect(carriedLightFromJSON('torch')).toBeNull();
  });
});

describe('a silver token\'s light', () => {
  it('is given and taken, and written with the token only when it has one', () => {
    const goblin = { id: 'silver_a', templateId: 'template_a', name: 'Goblin N7', at: cube(2, 1, 2), hidden: false, note: '' } as SilverToken;
    const lit = lightSilver([goblin], 'silver_a', { flame: 'green', reach: 4 });
    expect(lit[0]!.light).toEqual({ flame: 'green', reach: 4 });
    expect(lightSilver(lit, 'silver_a', { flame: 'green', reach: 4 })).toBe(lit);
    expect(silverFromJSON(silverToJSON(lit))).toEqual(lit);
    expect(silverToJSON([goblin])[0]).not.toHaveProperty('light');
    expect(lightSilver(lit, 'silver_a', null)[0]).toEqual(goblin);
  });
});
