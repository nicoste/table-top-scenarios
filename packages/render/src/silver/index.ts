// Silver tokens in a map (D-307, R-206): everyone who is not the party, drawn
// as the party's standee in silver, with their name over them — "goblin N7"
// is what a player says aloud, so it is always shown.
//
// What one looks like is `../standee`'s (R-201); what is here is what is
// about *silver* tokens: the name, the faded look of one the GM has hidden,
// and which one a ray hit.

import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import type { Material, Mesh } from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { BlockCoord } from '@tt/domain';
import type { Pictures } from '../standee/index.js';
import { SILVER, SILVER_CARD, STANDEE_HEIGHT, standees } from '../standee/index.js';
import { caption, dropCaption } from '../captions/index.js';
import type { XRay } from '../xray/index.js';

/** One silver token, as the stage is handed it. */
export interface SilverSpec {
  readonly id: string;
  readonly name: string;
  readonly at: BlockCoord;
  /** The picture on its card, by name; without one the card is grey. */
  readonly picture: string | null;
  /**
   * Kept off the table by the GM (R-206). Only the console is ever handed a
   * hidden one, and draws it faded so the GM can see what the players cannot.
   */
  readonly hidden: boolean;
  /** How far down the first block is: zero when standing on one (R-34). */
  readonly drop: number;
  /** Shown through walls: in play, which on the console means seen by the party (R-216, D-369). */
  readonly showsThrough: boolean;
}

export interface SilverTokens3D {
  readonly group: Group;
  /** Invisible upright volumes, one per token, for rays (R-36a). */
  readonly proxies: readonly Mesh[];
  /** Which token a ray hit. */
  silverAt(object: object): string | null;
  /** Turns every card to the camera's bearing (R-187). */
  turnTo(yaw: number): void;
  /** The translucent silver standee where one would be placed or moved, or none. */
  aimAt(at: BlockCoord | null): void;
  dispose(): void;
}

const centre = (at: BlockCoord) => ({ x: at.x + 0.5, y: at.y, z: at.z + 0.5 });

export function buildSilverTokens(
  specs: readonly SilverSpec[],
  pictures?: Pictures,
  /** Has each token show through what hides it (R-216). */
  xray?: XRay,
): SilverTokens3D {
  const group = new Group();
  const shop = standees(pictures, SILVER);
  const owners = new Map<object, string>();
  const proxies: Mesh[] = [];
  const turning: Group[] = [];
  const captions: CSS2DObject[] = [];
  const own: (Material | BufferGeometry)[] = [];
  const stalkMaterial = new LineBasicMaterial({ color: SILVER });
  own.push(stalkMaterial);

  for (const spec of specs) {
    const { x, y, z } = centre(spec.at);
    const { root, turner, proxy } = shop.make(SILVER_CARD, spec.picture, spec.hidden);
    root.position.set(x, y, z);
    proxy.position.set(x, y, z);
    turning.push(turner);
    owners.set(proxy, spec.id);
    proxies.push(proxy);

    // The name, always: it is how anybody at the table says which one.
    const label = caption(spec.hidden ? `${spec.name} · hidden` : spec.name);
    label.position.set(0, STANDEE_HEIGHT, 0);
    if (spec.hidden) (label.element as HTMLElement).style.opacity = '0.6';
    root.add(label);
    captions.push(label);

    group.add(root, proxy);
    if (xray && spec.showsThrough) own.push(...xray.add(root, 'tokens'));

    if (spec.drop > 0) {
      const line = new BufferGeometry();
      line.setAttribute('position', new Float32BufferAttribute([x, y, z, x, y - spec.drop, z], 3));
      own.push(line);
      group.add(new LineSegments(line, stalkMaterial));
    }
  }

  const { root: ghost, turner: ghostTurner } = shop.ghost();
  ghost.visible = false;
  turning.push(ghostTurner);
  group.add(ghost);

  return {
    group,
    proxies,
    silverAt: (object) => owners.get(object) ?? null,
    turnTo(yaw) {
      for (const turner of turning) turner.rotation.y = yaw;
    },
    aimAt(at) {
      if (!at) { ghost.visible = false; return; }
      const { x, y, z } = centre(at);
      ghost.position.set(x, y, z);
      ghost.visible = true;
    },
    dispose() {
      shop.dispose();
      for (const thing of own) thing.dispose();
      for (const label of captions) dropCaption(label);
    },
  };
}
