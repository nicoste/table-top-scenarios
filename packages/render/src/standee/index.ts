// What a party member looks like, wherever they are standing (R-187, R-201).
//
// A gold plate square to the grid, a brass clip on it, and a card standing in
// the clip in the member's colour — the GM's picture of a playing card on a
// stand (D-254, D-266). The plate never turns; the clip and the card turn
// together about the vertical so the card faces the camera, and about nothing
// else (D-268).
//
// **One definition, two placements.** This used to live inside the map's
// tokens, and the world drew chess pawns instead — the same six people in two
// shapes, which is the thing R-90 says not to do (D-303). The map puts a
// standee in a cube and the world puts one on a cell; what they stand on
// differs and what they look like does not.
//
// Sized against **one cell**, which is what makes it portable: a map cell is
// 1.5 m and a world cell is 1.5 km, and the token is a symbol at both.

import {
  BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry,
} from 'three';
import type { BufferGeometry, Material } from 'three';

/**
 * Gold for the party (D-254). Silver, for everything else, comes with silver
 * tokens (D-255). Painted rather than metallic: metalness renders black with
 * no environment to reflect (D-238).
 */
export const GOLD = '#d2a63c';

/**
 * The base: a flat square plate, square to the grid and narrower than the
 * cell it stands in, so it never covers it (D-268, D-269).
 */
const BASE = 0.63;
const BASE_HEIGHT = 0.05;
/** The clip on the base that holds the card, and the slot depth it grips. */
const CLIP = { width: 0.22, height: 0.12, depth: 0.1 } as const;
/** How far into the clip the card goes. */
const GRIP = 0.1;
/**
 * The card: a poker card's proportions, 2.5 by 3.5 inches — 5:7 — and as tall
 * as it can be with the whole token exactly one cell high (D-269). Its foot
 * sits where the clip grips it, so its height is what is left.
 */
const CARD_FOOT = BASE_HEIGHT + CLIP.height - GRIP;
const CARD_HEIGHT = 1 - CARD_FOOT;
const CARD = { width: CARD_HEIGHT * (5 / 7), height: CARD_HEIGHT } as const;

/** The whole token is one cell tall, which is where a caption hangs from. */
export const STANDEE_HEIGHT = 1;
/**
 * The pick volume: wide enough to take in the plate's corners however the
 * token is turned, and as tall as the token.
 */
const PROXY_RADIUS = 0.5;

/**
 * The shapes and materials a set of standees shares, made once and disposed
 * together.
 *
 * A workshop rather than a factory function per token: every standee on a
 * surface shares four geometries and one gold, and only the card's colour
 * differs — which is the same economy the cubes make (R-173).
 */
export interface Standees {
  /**
   * One standee, positioned by its caller.
   *
   * `root` goes in the scene, `turner` is what the camera's bearing is
   * applied to, and `proxy` is the invisible volume a ray is tested against —
   * separate so a pick never depends on which way the last drawn frame left
   * the card (R-36a).
   */
  make(colour: string): { root: Group; turner: Group; proxy: Mesh };
  /**
   * The same thing, translucent, for a move that has not happened yet. Its
   * card material comes back with it: a ghost is recoloured on every aim and
   * must never be rebuilt there.
   */
  ghost(): { root: Group; turner: Group; card: MeshStandardMaterial };
  dispose(): void;
}

export function standees(): Standees {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];

  const base = new BoxGeometry(BASE, BASE_HEIGHT, BASE).translate(0, BASE_HEIGHT / 2, 0);
  const clip = new BoxGeometry(CLIP.width, CLIP.height, CLIP.depth)
    .translate(0, BASE_HEIGHT + CLIP.height / 2, 0);
  const card = new PlaneGeometry(CARD.width, CARD.height)
    .translate(0, CARD_FOOT + CARD.height / 2, 0);
  const proxyShape = new CylinderGeometry(PROXY_RADIUS, PROXY_RADIUS, STANDEE_HEIGHT, 12)
    .translate(0, STANDEE_HEIGHT / 2, 0);
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
      materials.push(material);
    }
    return material;
  };
  /*
   * The volume is never drawn. Three.js tests a mesh against a ray whatever
   * its material's `visible` says, and draws nothing whose material is
   * invisible — which is exactly the split a pick volume needs.
   */
  const unseen = new MeshBasicMaterial({ visible: false });
  materials.push(gold, unseen);

  /*
   * **No token casts a shadow** (D-254). It turns whenever the camera does,
   * so its shadow would turn with the view — stale unless the shadow map were
   * redrawn on every turn, which is R-180's economy spent on the most
   * frequent event there is. `castShadow` is false by default; it is written
   * here so nobody adds it back by reflex. It **receives**, like every cube
   * around it.
   */
  const part = (shape: BufferGeometry, material: Material) => {
    const mesh = new Mesh(shape, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  };

  return {
    make(colour) {
      const root = new Group();
      // The clip and the card turn; the base stays square to the grid.
      const turner = new Group();
      turner.add(part(clip, gold), part(card, cardOf(colour)));
      root.add(part(base, gold), turner);
      const proxy = new Mesh(proxyShape, unseen);
      return { root, turner, proxy };
    },
    ghost() {
      const ghostGold = new MeshStandardMaterial({
        color: GOLD, roughness: 0.45, metalness: 0,
        transparent: true, opacity: 0.45, depthWrite: false,
      });
      const ghostCard = new MeshStandardMaterial({
        color: 0xffffff, roughness: 0.85, metalness: 0, side: DoubleSide,
        transparent: true, opacity: 0.5, depthWrite: false,
      });
      materials.push(ghostGold, ghostCard);
      const root = new Group();
      const turner = new Group();
      const plate = new Mesh(base, ghostGold);
      const hold = new Mesh(clip, ghostGold);
      const face = new Mesh(card, ghostCard);
      for (const mesh of [plate, hold, face]) mesh.renderOrder = 5;
      turner.add(hold, face);
      root.add(plate, turner);
      return { root, turner, card: ghostCard };
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
