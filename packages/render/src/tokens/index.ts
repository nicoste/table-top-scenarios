// The party inside a map: a gold base, a clip, and a card standing in it in the
// member's colour — the GM's picture of a playing card on a brass stand
// (D-254, D-266, R-187).
//
// The base is square to the grid and never turns, like the cubes it stands
// among. The clip and the card turn together about the vertical so the card
// points at the camera, and about nothing else — at the default view that puts
// them 45° to the base (D-268). The card stays upright the way a real one does.
//
// The world's pawns are the same members at the other scale (R-90). Here every
// member stands in a cube of their own (R-184).

import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
} from 'three';
import type { Material } from 'three';
import type { BlockCoord } from '@tt/domain';

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

/**
 * Gold for the party (D-254). Silver, for everything else, comes with silver
 * tokens (D-255). Painted rather than metallic: metalness renders black with
 * no environment to reflect (D-238).
 */
const GOLD = '#d2a63c';

/**
 * The base: a flat square plate, square to the grid and narrower than the cube
 * it stands in, so it never covers the cell (D-268, D-269).
 */
const BASE = 0.63;
const BASE_HEIGHT = 0.05;
/** The clip on the base that holds the card, and the slot depth it grips. */
const CLIP = { width: 0.22, height: 0.12, depth: 0.1 } as const;
/** How far into the clip the card goes. */
const GRIP = 0.1;
/**
 * The card: a poker card's proportions, 2.5 by 3.5 inches — 5:7 — and as tall
 * as it can be with the whole token exactly one cube high (D-269). Its foot
 * sits where the clip grips it, so its height is what is left of the cube.
 */
const CARD_FOOT = BASE_HEIGHT + CLIP.height - GRIP;
const CARD_HEIGHT = 1 - CARD_FOOT;
const CARD = { width: CARD_HEIGHT * (5 / 7), height: CARD_HEIGHT } as const;
/**
 * The pick volume: wide enough to take in the plate's corners however the
 * token is turned, and as tall as the cube.
 */
const PROXY_RADIUS = 0.5;
const PROXY_HEIGHT = 1;

const centre = (at: BlockCoord) => ({ x: at.x + 0.5, y: at.y, z: at.z + 0.5 });

export function buildPartyTokens(tokens: readonly TokenSpec[]): PartyTokens {
  const group = new Group();
  const owners = new Map<object, TokenRef>();
  const proxies: Mesh[] = [];
  const turning: Group[] = [];
  const materials: Material[] = [];
  const geometries: BufferGeometry[] = [];

  // Shared by every token; each is positioned by the group it sits in.
  const base = new BoxGeometry(BASE, BASE_HEIGHT, BASE).translate(0, BASE_HEIGHT / 2, 0);
  const clip = new BoxGeometry(CLIP.width, CLIP.height, CLIP.depth)
    .translate(0, BASE_HEIGHT + CLIP.height / 2, 0);
  const card = new PlaneGeometry(CARD.width, CARD.height)
    .translate(0, CARD_FOOT + CARD.height / 2, 0);
  const proxyShape = new CylinderGeometry(PROXY_RADIUS, PROXY_RADIUS, PROXY_HEIGHT, 12);
  geometries.push(base, clip, card, proxyShape);

  // Ordinary lit materials, like everything else in a world of cubes (D-266).
  const gold = new MeshStandardMaterial({ color: GOLD, roughness: 0.45, metalness: 0 });
  const cards = new Map<string, MeshStandardMaterial>();
  const cardOf = (colour: string) => {
    let material = cards.get(colour);
    if (!material) {
      material = new MeshStandardMaterial({
        color: colour, roughness: 0.85, metalness: 0, side: DoubleSide,
      });
      cards.set(colour, material);
    }
    return material;
  };
  /*
   * The volume is never drawn. Three.js tests a mesh against a ray whatever its
   * material's `visible` says, and draws nothing whose material is invisible —
   * which is exactly the split a pick volume needs.
   */
  const unseen = new MeshBasicMaterial({ visible: false });
  const stalkMaterial = new LineBasicMaterial({ color: GOLD });
  materials.push(gold, unseen, stalkMaterial);

  /*
   * **No token casts a shadow** (D-254). It turns whenever the camera does, so
   * its shadow would turn with the view — stale unless the shadow map were
   * redrawn on every turn, which is R-180's economy spent on the most frequent
   * event there is. `castShadow` is false by default; it is written here so
   * nobody adds it back by reflex. It **receives**, like every cube around it.
   */
  const part = (shape: BufferGeometry, material: Material) => {
    const mesh = new Mesh(shape, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  };

  for (const token of tokens) {
    const { x, y, z } = centre(token.at);
    const standee = new Group();
    standee.position.set(x, y, z);
    // The clip and the card turn; the base stays square to the grid.
    const turner = new Group();
    turner.add(part(clip, gold), part(card, cardOf(token.colour)));
    standee.add(part(base, gold), turner);
    turning.push(turner);

    const proxy = new Mesh(proxyShape, unseen);
    proxy.position.set(x, y + PROXY_HEIGHT / 2, z);
    owners.set(proxy, { memberId: token.memberId });
    proxies.push(proxy);

    group.add(standee, proxy);

    // A token with nothing under it draws a line down to what it would land
    // on, the one case its base cannot answer (R-34).
    if (token.drop > 0) {
      const line = new BufferGeometry();
      line.setAttribute('position', new Float32BufferAttribute([x, y, z, x, y - token.drop, z], 3));
      geometries.push(line);
      group.add(new LineSegments(line, stalkMaterial));
    }
  }

  // The ghost: built once and parked, because aiming moves it many times a
  // second. The same token, translucent, its card in the mover's colour.
  const ghost = new Group();
  ghost.visible = false;
  const ghostGold = new MeshStandardMaterial({
    color: GOLD, roughness: 0.45, metalness: 0, transparent: true, opacity: 0.45, depthWrite: false,
  });
  const ghostCard = new MeshStandardMaterial({
    color: 0xffffff, roughness: 0.85, metalness: 0, side: DoubleSide,
    transparent: true, opacity: 0.5, depthWrite: false,
  });
  materials.push(ghostGold, ghostCard);
  const ghostTurner = new Group();
  const ghostBase = new Mesh(base, ghostGold);
  const ghostClip = new Mesh(clip, ghostGold);
  const ghostFace = new Mesh(card, ghostCard);
  for (const mesh of [ghostBase, ghostClip, ghostFace]) mesh.renderOrder = 5;
  ghostTurner.add(ghostClip, ghostFace);
  ghost.add(ghostBase, ghostTurner);
  turning.push(ghostTurner);
  group.add(ghost);

  return {
    group,
    proxies,
    tokenAt: (object) => owners.get(object) ?? null,
    turnTo(yaw) {
      for (const standee of turning) standee.rotation.y = yaw;
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
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const material of cards.values()) material.dispose();
    },
  };
}
