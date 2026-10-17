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
  BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import { coverCrop } from '@tt/domain';
import { mosaicTiles } from './mosaic.js';

/**
 * Gold for the party (D-254). Silver, for everything else, comes with silver
 * tokens (D-255). Painted rather than metallic: metalness renders black with
 * no environment to reflect (D-238).
 */
export const GOLD = '#d2a63c';

/**
 * Silver, for everyone who is not the party (D-255, D-307): the same standee
 * in another metal, so the two read apart at a glance across a table.
 */
export const SILVER = '#c3c9d0';

/**
 * The card of a silver token with no picture (D-307): *"keep the color
 * grayish, no extra work, like we do with colors for the party, but here is
 * always gray."* Darker than the plate, so card and stand do not run together.
 */
export const SILVER_CARD = '#858c94';

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

/**
 * A card's width over its height: a poker card's 5:7 (D-269). Exported for
 * whoever prepares a picture for one, so the picture is cut to the shape it
 * will be shown in and nothing is stretched (R-204).
 */
export const CARD_ASPECT = 5 / 7;

/**
 * Where pictures come from, and how to ask for a frame when one arrives.
 *
 * Handed in rather than known: `render` may not know the host's addresses
 * (R-5), and it draws on change rather than every frame (R-170), so a picture
 * that finishes loading has to say so.
 */
export interface Pictures {
  /** The address a picture is fetched from, by its name (R-204). */
  readonly url: (id: string) => string;
  /** Asks for one frame — a picture has arrived. */
  readonly redraw: () => void;
}

/**
 * Every picture loaded, by address, for as long as the page lives.
 *
 * Kept **outside** any one set of standees on purpose. Standees are rebuilt
 * whenever somebody moves (R-19a), and a picture loaded per rebuild would
 * show the plain card for a frame or two every step — a card that blinks
 * back to its colour as the token walks. A picture is the same picture after
 * a step, so it is loaded once. Pictures are small (R-204) and few: the
 * party, and the Tokens Library's entries in use (D-307).
 */
const loaded = new Map<string, {
  readonly texture: Texture;
  ready: boolean;
  readonly waiting: Set<() => void>;
}>();
const loader = new TextureLoader();

/**
 * The picture at this address if it has arrived; otherwise `null`, and
 * `onReady` is called once when it does. A picture that fails to load never
 * calls — the card keeps its colour, which is the answer the GM would get
 * with no picture at all.
 */
function pictureAt(url: string, onReady: () => void): Texture | null {
  let entry = loaded.get(url);
  if (!entry) {
    const waiting = new Set<() => void>();
    const texture = loader.load(
      url,
      () => {
        const done = loaded.get(url);
        if (!done) return;
        done.ready = true;
        for (const call of done.waiting) call();
        done.waiting.clear();
      },
      undefined,
      () => { loaded.get(url)?.waiting.clear(); },
    );
    // Pictures are made in sRGB, like every swatch colour (D-238).
    texture.colorSpace = SRGBColorSpace;
    entry = { texture, ready: false, waiting };
    loaded.set(url, entry);
  }
  if (entry.ready) return entry.texture;
  entry.waiting.add(onReady);
  return null;
}

/** A mosaic card's size in pixels: a card picture's, for the same sharpness (R-204). */
const MOSAIC_WIDTH = 256;
const MOSAIC_HEIGHT = Math.round(MOSAIC_WIDTH / (5 / 7));
/** The lines between a mosaic's faces, and their colour: dark, so each face reads apart. */
const MOSAIC_GAP = 6;
const MOSAIC_LINES = '#1b1f26';

/** How faint a faint standee is (R-206). */
const FAINT = 0.35;

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
  /**
   * `picture` is the name of the picture on the card, if it has one (R-204).
   * The card shows the colour until the picture has arrived, then the picture
   * — never a black card while it loads.
   */
  make(
    colour: string,
    picture?: string | null,
    /**
     * Drawn faint: a token the GM has kept off the table, on the console that
     * can still see it (R-206). Faint from the start and faint when its
     * picture arrives, which a fade applied afterwards would not be.
     */
    faint?: boolean,
  ): { root: Group; turner: Group; proxy: Mesh };
  /**
   * A standee whose card is a **mosaic** of several faces (D-314): the party
   * travelling together, each member's picture — or colour, without one — in
   * a tile of its own. Pictures still arriving are drawn as their colour and
   * swapped in as they land.
   */
  makeMosaic(faces: readonly { readonly colour: string; readonly picture: string | null }[]): {
    root: Group; turner: Group; proxy: Mesh;
  };
  /**
   * The same thing, translucent, for a move that has not happened yet. Its
   * card material comes back with it: a ghost is recoloured on every aim and
   * must never be rebuilt there.
   */
  ghost(): { root: Group; turner: Group; card: MeshStandardMaterial };
  dispose(): void;
}

export function standees(pictures?: Pictures, metal: string = GOLD): Standees {
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  /** Mosaics' own canvases — unlike pictures, these belong to this set alone. */
  const textures: Texture[] = [];
  /** Set by `dispose`, so a picture arriving afterwards touches nothing. */
  let disposed = false;

  const base = new BoxGeometry(BASE, BASE_HEIGHT, BASE).translate(0, BASE_HEIGHT / 2, 0);
  const clip = new BoxGeometry(CLIP.width, CLIP.height, CLIP.depth)
    .translate(0, BASE_HEIGHT + CLIP.height / 2, 0);
  const card = new PlaneGeometry(CARD.width, CARD.height)
    .translate(0, CARD_FOOT + CARD.height / 2, 0);
  const proxyShape = new CylinderGeometry(PROXY_RADIUS, PROXY_RADIUS, STANDEE_HEIGHT, 12)
    .translate(0, STANDEE_HEIGHT / 2, 0);
  geometries.push(base, clip, card, proxyShape);

  // Ordinary lit materials, like everything else in a world of cubes (D-266).
  // `gold` by name because it was first; it is whichever metal this set is in.
  const gold = new MeshStandardMaterial({ color: metal, roughness: 0.45, metalness: 0 });
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
   * A card with a picture on it: lit like the coloured card, so dusk tints a
   * portrait the way it tints the cubes (R-187). One material per picture per
   * set of standees; the picture itself is shared across every set.
   */
  const faces = new Map<string, MeshStandardMaterial>();
  const faceOf = (texture: Texture) => {
    let material = faces.get(texture.uuid);
    if (!material) {
      material = new MeshStandardMaterial({
        map: texture, roughness: 0.85, metalness: 0, side: DoubleSide,
      });
      faces.set(texture.uuid, material);
      materials.push(material);
    }
    return material;
  };
  /** A faint copy of each material, made once per set and shared. */
  const faints = new Map<Material, Material>();
  const faintOf = (material: Material) => {
    let copy = faints.get(material);
    if (!copy) {
      copy = material.clone();
      copy.transparent = true;
      copy.opacity = FAINT;
      copy.depthWrite = false;
      faints.set(material, copy);
      materials.push(copy);
    }
    return copy;
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
    make(colour, picture, faint = false) {
      const look = (material: Material) => (faint ? faintOf(material) : material);
      const root = new Group();
      // The clip and the card turn; the base stays square to the grid.
      const turner = new Group();
      const face = part(card, look(cardOf(colour)));
      turner.add(part(clip, look(gold)), face);
      root.add(part(base, look(gold)), turner);
      const proxy = new Mesh(proxyShape, unseen);
      if (picture && pictures) {
        const url = pictures.url(picture);
        const arrived = pictureAt(url, () => {
          if (disposed) return;
          const texture = loaded.get(url)?.texture;
          if (!texture) return;
          face.material = look(faceOf(texture));
          pictures.redraw();
        });
        // Already here: no frame to ask for, it is being built into one.
        if (arrived) face.material = look(faceOf(arrived));
      }
      return { root, turner, proxy };
    },
    makeMosaic(faces) {
      const root = new Group();
      const turner = new Group();
      const canvas = document.createElement('canvas');
      canvas.width = MOSAIC_WIDTH;
      canvas.height = MOSAIC_HEIGHT;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const material = new MeshStandardMaterial({
        map: texture, roughness: 0.85, metalness: 0, side: DoubleSide,
      });
      materials.push(material);
      textures.push(texture);
      const tiles = mosaicTiles(faces.length, MOSAIC_WIDTH, MOSAIC_HEIGHT, MOSAIC_GAP);

      /*
       * Drawn whole every time, which is cheap — one small canvas — and means
       * a picture arriving late just triggers another draw rather than a
       * patch to get right.
       */
      const draw = () => {
        const pen = canvas.getContext('2d');
        if (!pen) return;
        pen.fillStyle = MOSAIC_LINES;
        pen.fillRect(0, 0, canvas.width, canvas.height);
        faces.forEach((face, i) => {
          const tile = tiles[i]!;
          const url = face.picture && pictures ? pictures.url(face.picture) : null;
          const image = url ? loaded.get(url) : undefined;
          const source = image?.ready
            ? (image.texture.image as CanvasImageSource & { width: number; height: number })
            : null;
          if (source && source.width > 0) {
            const { sx, sy, sw, sh } = coverCrop(source.width, source.height, tile.width / tile.height);
            pen.drawImage(source, sx, sy, sw, sh, tile.x, tile.y, tile.width, tile.height);
          } else {
            pen.fillStyle = face.colour;
            pen.fillRect(tile.x, tile.y, tile.width, tile.height);
          }
        });
        texture.needsUpdate = true;
      };
      draw();
      // Any picture not here yet redraws the mosaic when it lands.
      for (const face of faces) {
        if (!face.picture || !pictures) continue;
        pictureAt(pictures.url(face.picture), () => {
          if (disposed) return;
          draw();
          pictures.redraw();
        });
      }

      turner.add(part(clip, gold), part(card, material));
      root.add(part(base, gold), turner);
      const proxy = new Mesh(proxyShape, unseen);
      return { root, turner, proxy };
    },
    ghost() {
      const ghostGold = new MeshStandardMaterial({
        color: metal, roughness: 0.45, metalness: 0,
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
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      // The pictures stay: they are shared by every set of standees (`loaded`).
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
