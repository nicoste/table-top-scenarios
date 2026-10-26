// What stands behind a block, drawn through it (D-368, R-216), as rules
// rather than pictures (R-23b): what gets twins, in what order they are
// drawn, and which props take part at all.

import { describe, it, expect } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Raycaster, Vector3 } from 'three';
import type { Material, Object3D } from 'three';
import type { Prop, PropId, SwatchId } from '@tt/domain';
import { NONE_OPEN } from '@tt/domain';
import { buildProps } from '../src/props/index.js';
import { buildXRay } from '../src/xray/index.js';

/** A standee's shape: a base that stays, and a card on a group that turns. */
function standee(card: Material = new MeshStandardMaterial()): { root: Group; base: Mesh; face: Mesh } {
  const root = new Group();
  const base = new Mesh(new BoxGeometry(0.6, 0.05, 0.6), new MeshStandardMaterial());
  const turner = new Group();
  const face = new Mesh(new PlaneGeometry(0.6, 0.9), card);
  face.position.y = 0.5;
  turner.add(face);
  root.add(base, turner);
  return { root, base, face };
}

const twinsOf = (root: Object3D) => {
  const twins: Mesh[] = [];
  root.traverse((object) => { if ((object as Mesh).isMesh && object.userData.xray) twins.push(object as Mesh); });
  return twins;
};

const prop = (type: string, paint: string, x = 0): Prop => ({
  id: `prop_${type}` as PropId, type, at: { x, y: 1, z: 0 }, facing: 0, paint: paint as SwatchId,
});

describe('showing through a wall (D-368)', () => {
  it('gives each part a ghost, and each group of parts one mask and four nudged outlines', () => {
    const { root, base, face } = standee();
    buildXRay().add(root, 'tokens');
    expect(base.children.filter((c) => c.userData.xray)).toHaveLength(1);
    expect(face.children.filter((c) => c.userData.xray)).toHaveLength(1);
    // The base's group and the card's turning group: a mask and four outlines each.
    expect(twinsOf(root)).toHaveLength(2 + 2 * 5);
  });

  it('draws the mask, then the outline, then the ghost, then the thing — props before tokens', () => {
    const props = standee();
    const tokens = standee();
    const xray = buildXRay();
    xray.add(props.root, 'props');
    xray.add(tokens.root, 'tokens');
    const orders = (root: Group) => {
      const twins = twinsOf(root);
      const byKind = (kind: 'mask' | 'outline' | 'ghost') => twins.filter((twin) => {
        const material = twin.material as Material;
        if (kind === 'ghost') return twin.parent instanceof Mesh;
        return !(twin.parent instanceof Mesh) && (kind === 'mask' ? !material.colorWrite : material.colorWrite);
      }).map((twin) => twin.renderOrder);
      return { mask: Math.max(...byKind('mask')), outline: Math.max(...byKind('outline')), ghost: Math.max(...byKind('ghost')) };
    };
    const p = orders(props.root);
    const t = orders(tokens.root);
    expect(p.mask).toBeLessThan(p.outline);
    expect(p.outline).toBeLessThan(p.ghost);
    expect(p.ghost).toBeLessThan(props.face.renderOrder);
    expect(props.face.renderOrder).toBeLessThan(t.mask);
    expect(t.mask).toBeLessThan(t.outline);
    expect(t.outline).toBeLessThan(t.ghost);
    expect(t.ghost).toBeLessThan(tokens.face.renderOrder);
    // All of it under what is drawn over the world: the walk, the areas, the highlight.
    expect(tokens.face.renderOrder).toBeLessThan(1);
  });

  it('a ghost follows its part: a picture that arrives late shows through as the picture', () => {
    const colour = new MeshStandardMaterial({ color: '#858c94' });
    const { root, face } = standee(colour);
    buildXRay().add(root, 'tokens');
    const ghost = face.children.find((c) => c.userData.xray) as Mesh;
    expect((ghost.material as MeshStandardMaterial).color.getHexString()).toBe('858c94');
    face.material = new MeshStandardMaterial({ color: '#2f5fa8' });
    expect((ghost.material as MeshStandardMaterial).color.getHexString()).toBe('2f5fa8');
  });

  it('is never what a ray hits', () => {
    const { root } = standee();
    buildXRay().add(root, 'tokens');
    root.updateMatrixWorld(true);
    const ray = new Raycaster(new Vector3(0, 0.5, 5), new Vector3(0, 0, -1));
    const hits = ray.intersectObject(root, true);
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.object.userData.xray).toBeUndefined();
  });

  it('shows the furniture and lights the party sees through walls — not doors, bars, or the ways up', () => {
    const table = prop('table', 'material:wood', 0);
    const bars = prop('bars', 'material:mineral/iron', 2);
    const unseen = { ...prop('chair', 'material:wood', 4), id: 'prop_far' as PropId };
    const built = buildProps([table, bars, unseen], NONE_OPEN, (p) => p.id !== 'prop_far', true, buildXRay());
    const twinned = new Set<number>();
    built.group.traverse((object) => {
      if (!object.userData.xray) return;
      let holder: Object3D = object;
      while (holder.parent && holder.parent !== built.group) holder = holder.parent;
      twinned.add(built.group.children.indexOf(holder));
    });
    // The holders are added in the props' order, each followed by its proxy.
    expect([...twinned]).toEqual([0]);
  });

  it('shows no prop through a wall on the GM\'s own view, where nobody says what the party sees', () => {
    const built = buildProps([prop('table', 'material:wood')], NONE_OPEN, null, true, buildXRay());
    expect(twinsOf(built.group)).toHaveLength(0);
  });

  it('draws bars after everything that shows through, so a goblin in a cell is not outlined bar by bar', () => {
    const built = buildProps([prop('bars', 'material:mineral/iron'), prop('table', 'material:wood', 2)], NONE_OPEN, null, true, buildXRay());
    const orders = new Map<string, number>();
    built.group.children.forEach((holder, i) => {
      holder.traverse((object) => { if ((object as Mesh).isMesh && !built.proxies.includes(object as Mesh)) orders.set(`${i}`, object.renderOrder); });
    });
    const [barsOrder, , tableOrder] = [orders.get('0'), orders.get('1'), orders.get('2')];
    expect(barsOrder).toBeGreaterThan(0.8);
    // A table stops nobody seeing past it, but it is a solid thing in the room: it hides.
    expect(tableOrder).toBe(0);
  });
});
