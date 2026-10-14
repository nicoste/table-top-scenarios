// The party inside a map: a standee per member, standing in a cube of their
// own (R-184, R-187).
//
// What one looks like is in `../standee` — the world draws the same thing on a
// cell (R-90, D-303). What is here is everything that is about *a map*: the
// cube a member stands in, the line down to the floor when there is nothing
// under them, and which token a ray hit.

import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import type { Material, Mesh } from 'three';
import type { BlockCoord } from '@tt/domain';
import { GOLD, standees } from '../standee/index.js';

/** Which token was picked: a member of the party (silver tokens are later, D-255). */
export interface TokenRef {
  readonly memberId: string;
}

/** One member standing in a cube, as the stage is handed it. */
export interface TokenSpec {
  readonly memberId: string;
  readonly colour: string;
  readonly at: BlockCoord;
  /**
   * How far down the first block is: zero when standing on one (R-34). The
   * stage works it out from the body it is drawing, so a trapdoor opened under
   * somebody shows on the next rebuild without anybody re-sending the tokens.
   */
  readonly drop: number;
}

export interface PartyTokens {
  readonly group: Group;
  /**
   * What a ray should be tested against: one invisible upright volume per
   * token. It does not turn, so a pick never depends on which way the last
   * drawn frame left the token (R-36a).
   */
  readonly proxies: readonly Mesh[];
  tokenAt(object: object): TokenRef | null;
  /**
   * Turns every clip and card, and the ghost's, about the vertical to the
   * camera's bearing (R-187). One angle: the yaw the camera sits at. The bases
   * do not turn.
   */
  turnTo(yaw: number): void;
  /**
   * Puts the ghost on a cube, in the colour of whoever is being moved, or takes
   * it off. Called on every pointer move while aiming, so it moves one group
   * and builds nothing.
   */
  aimAt(at: BlockCoord | null, colour?: string): void;
  dispose(): void;
}

const centre = (at: BlockCoord) => ({ x: at.x + 0.5, y: at.y, z: at.z + 0.5 });

export function buildPartyTokens(tokens: readonly TokenSpec[]): PartyTokens {
  const group = new Group();
  const owners = new Map<object, TokenRef>();
  const proxies: Mesh[] = [];
  const turning: Group[] = [];
  const shop = standees();
  const stalks: BufferGeometry[] = [];
  const stalkMaterial: Material = new LineBasicMaterial({ color: GOLD });

  for (const token of tokens) {
    const { x, y, z } = centre(token.at);
    const { root, turner, proxy } = shop.make(token.colour);
    root.position.set(x, y, z);
    proxy.position.set(x, y, z);
    turning.push(turner);
    owners.set(proxy, { memberId: token.memberId });
    proxies.push(proxy);
    group.add(root, proxy);

    // A token with nothing under it draws a line down to what it would land
    // on, the one case its base cannot answer (R-34).
    if (token.drop > 0) {
      const line = new BufferGeometry();
      line.setAttribute('position', new Float32BufferAttribute([x, y, z, x, y - token.drop, z], 3));
      stalks.push(line);
      group.add(new LineSegments(line, stalkMaterial));
    }
  }

  // The ghost: built once and parked, because aiming moves it many times a
  // second. The same token, translucent, its card in the mover's colour.
  const { root: ghost, turner: ghostTurner, card: ghostCard } = shop.ghost();
  ghost.visible = false;
  turning.push(ghostTurner);
  group.add(ghost);

  return {
    group,
    proxies,
    tokenAt: (object) => owners.get(object) ?? null,
    turnTo(yaw) {
      for (const turner of turning) turner.rotation.y = yaw;
    },
    aimAt(at, colour) {
      if (!at) {
        ghost.visible = false;
        return;
      }
      const { x, y, z } = centre(at);
      ghost.position.set(x, y, z);
      ghostCard.color.set(colour ?? '#ffffff');
      ghost.visible = true;
    },
    dispose() {
      shop.dispose();
      for (const geometry of stalks) geometry.dispose();
      stalkMaterial.dispose();
    },
  };
}
