// What a prop is drawn with, as rules rather than pictures (R-23b): which of
// its parts carry their paint's figure (D-353), and that a chest has room in it.

import { describe, it, expect } from 'vitest';
import type { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import type { Prop, PropId, SwatchId } from '@tt/domain';
import { NONE_OPEN } from '@tt/domain';
import { buildProps } from '../src/props/index.js';

const prop = (type: string, paint: string): Prop => ({
  id: `prop_${type}` as PropId, type, at: { x: 0, y: 1, z: 0 }, facing: 0, paint: paint as SwatchId,
});

/** Every drawn part of what was built: the meshes that are not the picking proxies. */
function partsOf(built: ReturnType<typeof buildProps>): Mesh[] {
  const parts: Mesh[] = [];
  built.group.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh && !built.proxies.includes(mesh)) parts.push(mesh);
  });
  return parts;
}

const figureOf = (mesh: Mesh) => (mesh.material as MeshStandardMaterial).customProgramCacheKey();

describe('a prop in its paint (D-353)', () => {
  it('draws its paint\'s figure on its large parts — a table\'s top, not its legs', () => {
    const parts = partsOf(buildProps([prop('table', 'material:wood')], NONE_OPEN));
    const [top, ...legs] = parts;
    expect(figureOf(top!)).toBe('tt-stripes');
    for (const leg of legs) expect(figureOf(leg)).not.toBe('tt-stripes');
  });

  it('draws no figure where the paint has none, and none on what paint does not reach', () => {
    const glass = partsOf(buildProps([prop('crate', 'material:glass')], NONE_OPEN));
    for (const part of glass) expect(figureOf(part)).not.toMatch(/^tt-/);
    // A barrel's hoops are iron whatever it is painted.
    const barrel = partsOf(buildProps([prop('barrel', 'material:brick')], NONE_OPEN));
    expect(barrel.map(figureOf).filter((key) => key === 'tt-courses')).toHaveLength(1);
  });

  it('a chest is hollow: open, nothing fills the middle of it', () => {
    const open = new Set(['prop_chest']);
    const middle = { x: 0.5, y: 0.25, z: 0.5 };
    for (const part of partsOf(buildProps([prop('chest', 'material:wood')], open))) {
      const { width, height, depth } = (part.geometry as BoxGeometry).parameters;
      const { x, y, z } = part.position;
      const holds = Math.abs(middle.x - x) < width / 2 && Math.abs(middle.y - y) < height / 2 && Math.abs(middle.z - z) < depth / 2;
      expect(holds, `a part at ${x}, ${y}, ${z} fills the chest`).toBe(false);
    }
  });
});
