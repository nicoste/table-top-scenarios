// The sun's arc (R-181). Pure, so the figures are settled here rather than by
// squinting at a screen.

import { describe, it, expect } from 'vitest';
import {
  DAYLIGHT, OPEN_SKY, MIN_ANGLE, MAX_ANGLE, MAX_SUN, MAX_FILL,
  MAP_MAX_HEIGHT, MAP_MIN_DEPTH,
  clampLighting, clampAmbience, sunDirection, shadowReach, hourLabel, bounceOf,
  sunReaches, litBy,
} from '@tt/domain';

const length = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);

describe('the sun travels one arc, so an hour is one number (R-181)', () => {
  it('is overhead at 90 and low at both ends', () => {
    expect(sunDirection(90).y).toBeCloseTo(1, 5);
    expect(sunDirection(MIN_ANGLE).y).toBeLessThan(0.2);
    expect(sunDirection(MAX_ANGLE).y).toBeLessThan(0.2);
  });

  it('never dips below the horizon, which is what the range is for', () => {
    for (let a = MIN_ANGLE; a <= MAX_ANGLE; a += 1) {
      expect(sunDirection(a).y, `at ${a}°`).toBeGreaterThan(0);
    }
  });

  it('crosses the sky: the two ends are opposite, the middle is neither', () => {
    const dawn = sunDirection(MIN_ANGLE);
    const dusk = sunDirection(MAX_ANGLE);
    expect(Math.sign(dawn.x)).toBe(-Math.sign(dusk.x));
    expect(Math.sign(dawn.z)).toBe(-Math.sign(dusk.z));
    expect(sunDirection(90).x).toBeCloseTo(0, 5);
  });

  it('is a unit vector at every hour, because the renderer treats it as one', () => {
    for (let a = MIN_ANGLE; a <= MAX_ANGLE; a += 7) {
      expect(length(sunDirection(a)), `at ${a}°`).toBeCloseTo(1, 6);
    }
  });

  it('keeps shadows finite, which is why the range stops short of the horizon', () => {
    // At the horizon this diverges; ten degrees is a long evening shadow and a
    // number a shadow camera can still be sized to.
    expect(shadowReach(90)).toBeCloseTo(0, 4);
    expect(shadowReach(MIN_ANGLE)).toBeGreaterThan(4);
    expect(shadowReach(MIN_ANGLE)).toBeLessThan(7);
    expect(shadowReach(MIN_ANGLE)).toBeCloseTo(shadowReach(MAX_ANGLE), 4);
  });

  it('is longest at the ends and shortest overhead, with nothing jumping', () => {
    let previous = shadowReach(MIN_ANGLE);
    for (let a = MIN_ANGLE + 1; a <= 90; a += 1) {
      const reach = shadowReach(a);
      expect(reach, `at ${a}°`).toBeLessThanOrEqual(previous + 1e-9);
      previous = reach;
    }
  });
});

describe('an hour has a name as well as a number', () => {
  it('runs dawn to dusk across the arc', () => {
    expect(hourLabel(MIN_ANGLE)).toBe('dawn');
    expect(hourLabel(35)).toBe('morning');
    expect(hourLabel(90)).toBe('midday');
    expect(hourLabel(140)).toBe('afternoon');
    expect(hourLabel(MAX_ANGLE)).toBe('dusk');
  });

  it('names every angle in range, and never changes back', () => {
    const seen: string[] = [];
    for (let a = MIN_ANGLE; a <= MAX_ANGLE; a += 1) {
      const name = hourLabel(a);
      expect(name).toBeTruthy();
      if (seen[seen.length - 1] !== name) seen.push(name);
    }
    expect(seen).toEqual(['dawn', 'morning', 'midday', 'afternoon', 'dusk']);
  });
});

describe('what a GM sets is pulled back into range', () => {
  it('clamps the angle, the levels, and refuses a colour it cannot read', () => {
    const wild = clampLighting({
      angle: 900,
      sun: 'tangerine',
      sunLevel: 99,
      ambience: { colour: '#ABCDEF', level: -4 },
    });
    expect(wild.angle).toBe(MAX_ANGLE);
    expect(wild.sun).toBe(DAYLIGHT.sun);
    expect(wild.sunLevel).toBe(MAX_SUN);
    expect(wild.ambience.colour).toBe('#abcdef');
    expect(wild.ambience.level).toBe(0);
  });

  it('leaves the default alone, which is the test that it is in range itself', () => {
    expect(clampLighting(DAYLIGHT)).toEqual(DAYLIGHT);
  });

  it('survives a value that is not a number at all', () => {
    const broken = clampLighting({ ...DAYLIGHT, angle: NaN, sunLevel: NaN });
    expect(broken.angle).toBe(MIN_ANGLE);
    expect(broken.sunLevel).toBe(0);
  });

  it('holds the sun within range at full tilt', () => {
    expect(clampLighting({ ...DAYLIGHT, ambience: { colour: '#ffffff', level: 99 } })
      .ambience.level).toBe(MAX_FILL);
  });
});

describe('the ground bounces a dimmer version of the sky', () => {
  it('is darker than the fill it came from, channel for channel', () => {
    const sky = '#cfe4ff';
    const ground = bounceOf(sky);
    expect(ground).toMatch(/^#[0-9a-f]{6}$/);
    for (const at of [1, 3, 5]) {
      expect(Number.parseInt(ground.slice(at, at + 2), 16))
        .toBeLessThan(Number.parseInt(sky.slice(at, at + 2), 16));
    }
  });

  it('falls back rather than throwing on a colour it cannot read', () => {
    expect(bounceOf('not a colour')).toBe(bounceOf(OPEN_SKY.colour));
  });
});

describe('the ambience belongs to a place, not to the hour (R-182)', () => {
  it('clamps on its own, and falls back when it is missing entirely', () => {
    expect(clampAmbience({ colour: '#ABCDEF', level: 99 }))
      .toEqual({ colour: '#abcdef', level: MAX_FILL });
    expect(clampAmbience(null)).toEqual(OPEN_SKY);
    expect(clampAmbience({ colour: 'emerald', level: 0.3 }).colour).toBe(OPEN_SKY.colour);
  });

  it('is what a sun is not: the hour cannot change it', () => {
    // The whole point of the split. Moving the sun across the sky leaves the
    // light inside a cave exactly where the GM put it (D-252).
    const cave = { colour: '#2f7a4a', level: 0.55 };
    for (const angle of [MIN_ANGLE, 90, MAX_ANGLE]) {
      expect(clampLighting({ ...DAYLIGHT, angle, ambience: cave }).ambience).toEqual(cave);
    }
  });
});

describe('a band that stops below the Sun is indoors (R-183)', () => {
  const band = (lower: number, upper: number) => ({ lower, upper });

  it('is sunlit only when the band reaches the top of the ladder', () => {
    expect(sunReaches(band(MAP_MIN_DEPTH, MAP_MAX_HEIGHT), MAP_MAX_HEIGHT)).toBe(true);
    expect(sunReaches(band(MAP_MIN_DEPTH, MAP_MAX_HEIGHT - 1), MAP_MAX_HEIGHT)).toBe(false);
    // Cutting the *floor* away is still outdoors: the roof is what matters.
    expect(sunReaches(band(4, MAP_MAX_HEIGHT), MAP_MAX_HEIGHT)).toBe(true);
  });

  it('keeps the GM’s sun where they left it, and only dims what is drawn', () => {
    // So raising the band back gives the daylight they had, not nothing.
    const dusk = { ...DAYLIGHT, sunLevel: 2.4 };
    const indoors = litBy(dusk, OPEN_SKY, false);
    expect(indoors.sunLevel).toBe(0);
    expect(dusk.sunLevel).toBe(2.4);
    expect(litBy(dusk, OPEN_SKY, true).sunLevel).toBe(2.4);
  });

  it('leaves the hour and the colours alone, because only the sun goes out', () => {
    const indoors = litBy(DAYLIGHT, OPEN_SKY, false);
    expect(indoors.angle).toBe(DAYLIGHT.angle);
    expect(indoors.sun).toBe(DAYLIGHT.sun);
  });

  it('carries the ambience it is given, lit or not', () => {
    const cave = { colour: '#2f7a4a', level: 0.55 };
    expect(litBy(DAYLIGHT, cave, false).ambience).toEqual(cave);
    expect(litBy(DAYLIGHT, cave, true).ambience).toEqual(cave);
  });
});
