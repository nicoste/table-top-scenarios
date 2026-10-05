// Every figure a material claims is one the renderer can actually draw (R-177).
//
// R-23 exempts `render` from unit tests because three.js and the DOM cannot be
// sensibly mocked, and the GLSL in `patterns` is squarely inside that: what a
// stripe *looks like* is settled by looking at it. But "a material names a
// pattern that exists" is a rule, not a shader (R-23b), and its failure mode is
// silent — an unimplemented name draws a flat face and nothing anywhere says so.

import { describe, it, expect } from 'vitest';
import { DEFAULT_MATERIALS } from '@tt/domain';
import { isFigured } from '@tt/render';

describe('a material cannot ask for a figure that is not there (R-177)', () => {
  it('draws every pattern the registry names', () => {
    for (const material of DEFAULT_MATERIALS) {
      if (material.pattern === 'none') continue;
      expect(
        isFigured(material),
        `${material.name} asks for '${material.pattern}', which no figure implements`,
      ).toBe(true);
    }
  });

  it('says no to a material whose pattern is a typo', () => {
    // The guard earning its keep: the union stops this at compile time, and
    // this stops it if anyone widens the union and forgets the shader.
    const invented = { ...DEFAULT_MATERIALS[0]!, pattern: 'herringbone' as never };
    expect(isFigured(invented)).toBe(false);
  });

  it('leaves a family with no figure alone', () => {
    // The ones with no structure to draw: a liquid's surface is its motion and
    // glass has nothing in it at all.
    const glassy = DEFAULT_MATERIALS.find((m) => m.name === 'Glassy')!;
    expect(glassy.pattern).toBe('none');
    expect(isFigured(glassy)).toBe(false);
  });

  it('figures every family that has a structure, and only those', () => {
    const figured = DEFAULT_MATERIALS.filter((m) => m.pattern !== 'none');
    expect(figured.map((m) => `${m.name}:${m.pattern}`).sort()).toEqual([
      'Brick:courses',
      'Grass:speckle',
      'Mineral:plates',
      'Soil:grit',
      'Vegetation:leaves',
      'Wood:stripes',
    ]);
  });
});
