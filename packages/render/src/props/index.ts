// Props in a map (D-322): a door, bars, a chest — each drawn as a handful of
// boxes in its finish, in the blocky style of everything else, and open or
// shut as the save says. No model files: a prop is a few parts, and a part is
// a box (or, for a barrel, a cylinder) at a place in the prop's own box.
//
// Each is built unturned, in its own box with the corner at the origin, then
// turned about the box's middle — the same quarter turns the rules use
// (`placedBox`), so what is drawn fills exactly the cubes that stop sight and
// walking. Picked by an invisible box the size of its cubes, which does not
// turn, as a token's volume does not (R-36a).
//
// **Painted with any block material** (D-352): the parts that take paint are
// in the prop's paint — some a designed shade darker or lighter, and each a
// few percent off it by which part it is, so a chest is not one flat colour
// and two chests painted alike look alike. The parts that do not — a door's
// knob, a chest's lock, a barrel's hoops, wax, embers — keep their own.
//
// The large painted parts take the paint's figure too (D-353) — a wooden
// door's grain, a brick chest's courses — in the world's own coordinates, as
// a block's does, so a brick door's courses run on from the wall beside it.
// Small ones — a leg, a rod, a rim — stay plain: a figure a cube across reads
// as nothing on a part a tenth of one.
//
// A light (D-335) is painted on what holds the flame, and its flame is its
// own: a blocky flame in that colour, unlit by anything — it is the light —
// and gone when the light is out. What it lights is `lamplight`'s.

import {
  BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
} from 'three';
import { Float32BufferAttribute } from 'three';
import type { BufferGeometry, Material } from 'three';
import type { BlockCoord, Facing, Material as Family, Opened, Prop, SwatchId } from '@tt/domain';
import { familyOf, flameColour, flameOf, paintOf, propBox, propType, swatchColour, turnedSize } from '@tt/domain';
import { grainAt } from '../grain/index.js';
import { figure, isFigured } from '../patterns/index.js';

/**
 * What a part is coloured: its paint (`base`), darker or lighter (D-352); a
 * fixed material that no paint changes; or, for a light, its flame — `flame`
 * in the flame's colour and `core`, nearer white — which no light falls on,
 * because it is the light.
 */
type Tone = 'base' | 'dark' | 'light' | 'brass' | 'iron' | 'wood' | 'wax' | 'ember' | 'ash' | 'flame' | 'core';

/** The tones the paint gives. */
const PAINTED: ReadonlySet<Tone> = new Set(['base', 'dark', 'light']);

/** The tones that are the light itself: drawn flat, and casting no shadow. */
const BURNING: ReadonlySet<Tone> = new Set(['flame', 'core']);

/** One part of a prop: a box (or a cylinder), centred at `at`, in the prop's unturned box. */
interface Part {
  readonly size: readonly [number, number, number];
  readonly at: readonly [number, number, number];
  readonly tone?: Tone;
  readonly round?: boolean;
}

/** An open door or gate swings flat against the side of its cube. */
const swung = (parts: readonly Part[]): readonly Part[] => parts.map((part) => ({
  ...part,
  size: [part.size[2], part.size[1], part.size[0]],
  at: [0.08 + (part.at[2] - 0.5), part.at[1], part.at[0]],
}));

const rods = (count: number, width: number, height: number, thick = 0.06): Part[] =>
  Array.from({ length: count }, (_, i) => ({
    size: [thick, height, thick] as const,
    at: [((i + 0.5) / count) * width, height / 2, 0.5] as const,
  }));

const rails = (width: number, heights: readonly number[], thick = 0.07): Part[] =>
  heights.map((y) => ({ size: [width - 0.04, thick, thick] as const, at: [width / 2, y, 0.5] as const }));

/**
 * A blocky flame standing on `y`, `width` across: a base in the flame's own
 * colour, a paler heart rising out of it, and a small tip on top.
 */
const fire = (x: number, y: number, z: number, width: number): Part[] => [
  { size: [width, width * 0.7, width], at: [x, y + width * 0.35, z], tone: 'flame' },
  { size: [width * 0.6, width * 0.8, width * 0.6], at: [x, y + width * 0.7, z], tone: 'core' },
  { size: [width * 0.3, width * 0.4, width * 0.3], at: [x, y + width * 1.3, z], tone: 'flame' },
];

/** A light's parts: what holds the flame, and the flame while it is lit. */
const burning = (holder: readonly Part[], flames: readonly Part[], lit: boolean): readonly Part[] =>
  lit ? [...holder, ...flames] : holder.map((part) => (part.tone === 'ember' ? { ...part, tone: 'ash' as const } : part));

/** What each prop is made of, unturned, shut or open. */
function partsOf(type: string, open: boolean): readonly Part[] {
  switch (type) {
    case 'door': {
      const shut: Part[] = [
        { size: [0.92, 1.96, 0.12], at: [0.5, 0.98, 0.5] },
        { size: [0.08, 0.08, 0.16], at: [0.8, 1.0, 0.5], tone: 'brass' },
      ];
      return open ? swung(shut) : shut;
    }
    case 'cell-door': {
      const shut = [...rods(5, 1, 1.96), ...rails(1, [0.06, 1.0, 1.9])];
      return open ? swung(shut) : shut;
    }
    case 'bars':
      return [...rods(5, 1, 1), ...rails(1, [0.06, 0.94])];
    case 'portcullis': {
      const gate = [...rods(9, 2, 1.96, 0.07), ...rails(2, [0.35, 0.95, 1.55])];
      // Raised into the wall over the opening: only its teeth show.
      return open ? gate.map((part) => ({ ...part, at: [part.at[0], part.at[1] + 1.7, part.at[2]] as const })) : gate;
    }
    case 'chest':
      // Hollow (D-353): a floor and four walls, so open it is a box with
      // nothing in it rather than a block with its lid up. The rim runs round
      // the outside, and the lock is its front, so which way it faces shows
      // (D-351).
      return [
        { size: [0.8, 0.05, 0.56], at: [0.5, 0.025, 0.5], tone: 'dark' },
        { size: [0.8, 0.42, 0.05], at: [0.5, 0.21, 0.245] },
        { size: [0.8, 0.42, 0.05], at: [0.5, 0.21, 0.755] },
        { size: [0.05, 0.42, 0.46], at: [0.125, 0.21, 0.5] },
        { size: [0.05, 0.42, 0.46], at: [0.875, 0.21, 0.5] },
        { size: [0.84, 0.06, 0.03], at: [0.5, 0.3, 0.205], tone: 'dark' },
        { size: [0.84, 0.06, 0.03], at: [0.5, 0.3, 0.795], tone: 'dark' },
        { size: [0.03, 0.06, 0.6], at: [0.085, 0.3, 0.5], tone: 'dark' },
        { size: [0.03, 0.06, 0.6], at: [0.915, 0.3, 0.5], tone: 'dark' },
        open
          ? { size: [0.82, 0.56, 0.1], at: [0.5, 0.7, 0.2] }
          : { size: [0.82, 0.12, 0.58], at: [0.5, 0.48, 0.5] },
        { size: [0.1, 0.12, 0.04], at: [0.5, 0.36, 0.8], tone: 'brass' },
      ];
    // A table, a bookcase, a barrel and a crate are a whole cube tall, so
    // somebody standing on one stands on its top (D-351).
    case 'table':
      return [
        { size: [0.96, 0.08, 0.96], at: [0.5, 0.96, 0.5] },
        ...[[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([x, z]) => ({
          size: [0.08, 0.92, 0.08] as const, at: [x!, 0.46, z!] as const, tone: 'dark' as const,
        })),
      ];
    case 'chair':
      return [
        { size: [0.5, 0.06, 0.5], at: [0.5, 0.33, 0.5] },
        { size: [0.5, 0.5, 0.06], at: [0.5, 0.61, 0.28] },
        ...[[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]].map(([x, z]) => ({
          size: [0.06, 0.32, 0.06] as const, at: [x!, 0.16, z!] as const, tone: 'dark' as const,
        })),
      ];
    case 'bookcase':
      // Open at the front (D-333): a back, two sides, a top and a bottom and
      // two shelves — empty, so it can be a pantry, an armoury or a library as
      // the GM likes (D-334). Three quarters of its cube deep, from the back,
      // so its top is somewhere to stand (D-351).
      return [
        { size: [0.94, 1, 0.04], at: [0.5, 0.5, 0.05] },
        { size: [0.05, 1, 0.75], at: [0.055, 0.5, 0.405] },
        { size: [0.05, 1, 0.75], at: [0.945, 0.5, 0.405] },
        { size: [0.94, 0.05, 0.75], at: [0.5, 0.975, 0.405] },
        { size: [0.94, 0.05, 0.75], at: [0.5, 0.025, 0.405] },
        ...[0.34, 0.67].map((y) => ({ size: [0.84, 0.035, 0.71] as const, at: [0.5, y, 0.425] as const })),
      ];
    case 'barrel':
      return [
        { size: [0.76, 1, 0.76], at: [0.5, 0.5, 0.5], round: true },
        // Iron hoops, whatever it is painted (D-352).
        ...[0.16, 0.84].map((y) => ({ size: [0.79, 0.06, 0.79] as const, at: [0.5, y, 0.5] as const, tone: 'iron' as const, round: true })),
      ];
    case 'crate':
      return [
        { size: [0.88, 0.98, 0.88], at: [0.5, 0.49, 0.5] },
        ...[[0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92]].map(([x, z]) => ({
          size: [0.1, 1, 0.1] as const, at: [x!, 0.5, z!] as const, tone: 'dark' as const,
        })),
      ];
    case 'stairs':
      // Three steps climbing toward the back (D-350), each from the floor up,
      // with a paler edge to its tread so the steps read from above.
      return [1, 2, 3].flatMap((k) => {
        const front = 1 - (k - 1) / 3;
        return [
          { size: [1, k / 3, 1 / 3] as const, at: [0.5, k / 6, front - 1 / 6] as const },
          { size: [1, 0.03, 0.07] as const, at: [0.5, k / 3 + 0.015, front - 0.035] as const, tone: 'light' as const },
        ];
      });
    case 'ladder':
      // Against the wall behind it (D-357): two rails and three rungs, a
      // cube tall, so ladders stacked one on another run on unbroken.
      return [
        ...[0.15, 0.85].map((x) => ({ size: [0.07, 1, 0.07] as const, at: [x, 0.5, 0.12] as const })),
        ...[1 / 6, 1 / 2, 5 / 6].map((y) => ({ size: [0.66, 0.05, 0.05] as const, at: [0.5, y, 0.12] as const, tone: 'light' as const })),
      ];
    // More ways up (D-358). A rope against the wall behind it, as a ladder is
    // (D-359), knotted, so ropes one over another run on as one; painted
    // iron, it is a chain.
    case 'rope':
      return [
        { size: [0.06, 1, 0.06], at: [0.5, 0.5, 0.12], round: true },
        ...[0.25, 0.75].map((y) => ({ size: [0.1, 0.07, 0.1] as const, at: [0.5, y, 0.12] as const, tone: 'dark' as const, round: true })),
      ];
    // Grips on the wall behind, staggered up it.
    case 'holds':
      return ([[0.28, 0.14, 0.16], [0.7, 0.36, 0.13], [0.36, 0.58, 0.15], [0.68, 0.84, 0.17]] as const).map(([x, y, w], i) => ({
        size: [w, 0.09, 0.09] as const, at: [x, y, 0.045] as const, ...(i % 2 ? { tone: 'dark' as const } : {}),
      }));
    // Strands up the wall behind, and leaves along them.
    case 'vines':
      return [
        ...[0.28, 0.55, 0.8].map((x) => ({ size: [0.035, 1, 0.03] as const, at: [x, 0.5, 0.02] as const, tone: 'dark' as const })),
        ...([[0.2, 0.18], [0.36, 0.42], [0.5, 0.7], [0.62, 0.3], [0.74, 0.9], [0.86, 0.55], [0.3, 0.86]] as const).map(([x, y], i) => ({
          size: [0.13, 0.09, 0.035] as const, at: [x, y, 0.035] as const, ...(i % 3 === 1 ? { tone: 'light' as const } : {}),
        })),
      ];
    // Lights (D-335): `open` is out.
    case 'torch':
      // Hung on the wall behind it, which is toward −z unturned.
      return burning([
        { size: [0.16, 0.24, 0.04], at: [0.5, 0.5, 0.02] },
        { size: [0.05, 0.05, 0.2], at: [0.5, 0.46, 0.12] },
        { size: [0.13, 0.06, 0.13], at: [0.5, 0.5, 0.24] },
        { size: [0.07, 0.34, 0.07], at: [0.5, 0.64, 0.24], tone: 'wood' },
      ], fire(0.5, 0.8, 0.24, 0.12), !open);
    case 'lantern':
      return burning([
        { size: [0.34, 0.05, 0.34], at: [0.5, 0.025, 0.5] },
        ...[[0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65]].map(([x, z]) => ({
          size: [0.035, 0.3, 0.035] as const, at: [x!, 0.2, z!] as const, tone: 'dark' as const,
        })),
        { size: [0.36, 0.05, 0.36], at: [0.5, 0.375, 0.5] },
        { size: [0.2, 0.06, 0.2], at: [0.5, 0.43, 0.5] },
        { size: [0.04, 0.1, 0.04], at: [0.5, 0.51, 0.5], tone: 'dark' },
      ], fire(0.5, 0.06, 0.5, 0.17), !open);
    case 'candles': {
      // Three, each its own height: across, how tall, and how deep.
      const sticks = [[0.42, 0.24, 0.44], [0.58, 0.18, 0.42], [0.5, 0.13, 0.6]] as const;
      return burning([
        { size: [0.42, 0.04, 0.42], at: [0.5, 0.02, 0.5], round: true },
        ...sticks.map(([x, tall, z]) => ({
          size: [0.07, tall, 0.07] as const, at: [x, 0.04 + tall / 2, z] as const, tone: 'wax' as const,
        })),
      ], sticks.flatMap(([x, tall, z]) => fire(x, 0.04 + tall, z, 0.045)), !open);
    }
    case 'brazier':
      return burning([
        ...[[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]].map(([x, z]) => ({
          size: [0.06, 0.5, 0.06] as const, at: [x!, 0.25, z!] as const, tone: 'dark' as const,
        })),
        { size: [0.74, 0.16, 0.74], at: [0.5, 0.56, 0.5], round: true },
        { size: [0.62, 0.04, 0.62], at: [0.5, 0.65, 0.5], tone: 'ember', round: true },
      ], [...fire(0.5, 0.66, 0.5, 0.26), ...fire(0.36, 0.66, 0.6, 0.13), ...fire(0.64, 0.66, 0.4, 0.12)], !open);
    case 'campfire':
      return burning([
        ...Array.from({ length: 8 }, (_, i) => {
          const turn = (i / 8) * Math.PI * 2;
          return {
            size: [0.16, 0.1, 0.16] as const,
            at: [0.5 + Math.cos(turn) * 0.36, 0.05, 0.5 + Math.sin(turn) * 0.36] as const,
          };
        }),
        { size: [0.4, 0.03, 0.4], at: [0.5, 0.015, 0.5], tone: 'ember', round: true },
        { size: [0.56, 0.08, 0.1], at: [0.5, 0.07, 0.5], tone: 'wood' },
        { size: [0.1, 0.08, 0.56], at: [0.5, 0.15, 0.5], tone: 'wood' },
      ], [...fire(0.5, 0.19, 0.5, 0.22), ...fire(0.38, 0.11, 0.6, 0.12), ...fire(0.62, 0.11, 0.4, 0.11)], !open);
    default:
      // A type this screen does not know: a plain box, so it is not invisible.
      return [{ size: [0.9, 0.9, 0.9], at: [0.5, 0.45, 0.5] }];
  }
}

export interface PropMeshes {
  readonly group: Group;
  /** What a ray is tested against: a box per prop, the size of its cubes. */
  readonly proxies: readonly Mesh[];
  propAt(object: object): string | null;
  /** Draws the paint's figure on the large parts, or does not — the screen's switch (R-177). */
  setFigures(on: boolean): void;
  dispose(): void;
}

const BRASS = '#c9a24f';
/** What no paint changes (D-352): a lock's brass, a barrel's hoops, a torch's handle, wax, embers. */
const FIXED = {
  iron: '#3b3f45', wood: '#5b3b24', wax: '#efe5cc', ember: '#8a2c10', ash: '#3d3936',
} as const;
/**
 * Out of sight, a prop is greyed as an explored block is (R-45, D-332): most
 * of the way to its own grey, and dimmed. The same two numbers as the blocks'
 * (`render/blocks`), so a remembered room reads as one thing.
 */
const GREYED = 0.75;
const DIMMED = 0.55;

/** A colour as the fog draws it out of sight. */
function greyed(colour: string): string {
  const { r, g, b } = new Color(colour);
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  return `#${new Color(
    (r + (grey - r) * GREYED) * DIMMED,
    (g + (grey - g) * GREYED) * DIMMED,
    (b + (grey - b) * GREYED) * DIMMED,
  ).getHexString()}`;
}

/** The colour of each tone, from a paint and — for a light — a flame. */
function tonesOf(paint: string, flame: string): Record<Tone, string> {
  const base = new Color(paint);
  return {
    base: paint,
    dark: `#${base.clone().multiplyScalar(0.62).getHexString()}`,
    light: `#${base.clone().lerp(new Color('#ffffff'), 0.25).getHexString()}`,
    brass: BRASS,
    ...FIXED,
    flame,
    core: `#${new Color(flame).lerp(new Color('#fff3c4'), 0.45).getHexString()}`,
  };
}

/**
 * How far a painted part's shade wanders from its paint's (D-352): a few
 * percent, so the lid, the body and the bands of a chest are three shades of
 * one oak rather than one flat colour.
 */
const DRIFT = 0.07;

/** A number for a type, so its parts wander differently from another type's. */
const seedOf = (type: string) => [...type].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 7);

/**
 * The colour of a part: its tone's, and for a painted one, nudged by which
 * part of which type it is — never by where the prop stands, so two chests
 * in the same paint look the same (D-352). Deterministic, as a block's grain
 * is (R-172).
 */
function partColour(tones: Record<Tone, string>, tone: Tone, part: number, seed: number): string {
  if (!PAINTED.has(tone)) return tones[tone];
  return `#${new Color(tones[tone]).multiplyScalar(1 + DRIFT * grainAt(part, seed, 3)).getHexString()}`;
}

/** The look of a prop as drawn: its paint's colour, and a light's flame's. */
function lookOf(prop: { readonly type: string; readonly paint?: SwatchId; readonly flame?: string }): Record<Tone, string> {
  const flame = flameOf(prop);
  return tonesOf(swatchColour(paintOf(prop)) ?? '#9aa3ad', flame ? flameColour(flame) : '#ff9440');
}

/**
 * How wide a part's middle side must be to take its paint's figure (D-353):
 * a door, a chest's wall, a table's top, a stair's step — not a leg or a rod.
 */
const FIGURED_FROM = 0.3;

/** Whether a part is large enough for a figure: its middle side, at least `FIGURED_FROM`. */
const takesFigure = (part: Part) => [...part.size].sort((a, b) => a - b)[1]! >= FIGURED_FROM;

/** A part's shape: a box, or a cylinder for what is round. */
const shapeOf = (part: Part): BufferGeometry => (part.round
  ? new CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[1], 14)
  : new BoxGeometry(part.size[0], part.size[1], part.size[2]));

/**
 * Where a prop's parts hang: a group turned about the middle of its box, with
 * an inner group at its unturned corner that the parts are placed in.
 */
function holderFor(prop: Pick<Prop, 'type' | 'at' | 'facing'>): { holder: Group; inner: Group } {
  const size = propType(prop.type)?.size ?? { x: 1, y: 1, z: 1 };
  const box = propBox(prop);
  const turned = turnedSize(size, prop.facing);
  const holder = new Group();
  holder.position.set(box.min.x + turned.x / 2, box.min.y, box.min.z + turned.z / 2);
  holder.rotation.y = -prop.facing * (Math.PI / 2);
  const inner = new Group();
  inner.position.set(-size.x / 2, 0, -size.z / 2);
  holder.add(inner);
  return { holder, inner };
}

/**
 * `inSight` says whether the party sees a prop now — `null` when nobody is
 * asking, the GM's own view, where nothing is greyed.
 */
export function buildProps(
  props: readonly Prop[],
  opened: Opened,
  inSight: ((prop: Prop) => boolean) | null = null,
  /** Whether the large parts draw their paint's figure, as the screen's switch says (R-177). */
  figures = true,
): PropMeshes {
  const group = new Group();
  const proxies: Mesh[] = [];
  const owners = new Map<object, string>();
  const geometries: BufferGeometry[] = [];
  const materials = new Map<string, Material>();
  const switches: ((on: boolean) => void)[] = [];
  /**
   * One material a colour — flat for a flame, which is the light and is lit
   * by none. A painted part is its paint's family's (D-352, D-353): as rough
   * as a block of it, glowing as one does, and on a large part, figured.
   */
  const material = (colour: string, flat: boolean, family: Family | null = null, figured = false, glows = false) => {
    const drawn = figured && !!family && isFigured(family);
    const key = `${flat ? 'flat' : 'lit'}:${colour}:${family?.id ?? ''}:${drawn}:${glows}`;
    let made = materials.get(key);
    if (!made) {
      if (flat) {
        made = new MeshBasicMaterial({ color: colour });
      } else {
        const surface = new MeshStandardMaterial({ color: colour, roughness: family?.roughness ?? 0.85, metalness: family ? 0 : 0.05 });
        if (family && glows && family.glow > 0) {
          surface.emissive = new Color(colour);
          surface.emissiveIntensity = family.glow;
        }
        if (drawn) {
          const set = figure(surface, family!);
          set(figures);
          switches.push(set);
        }
        made = surface;
      }
      materials.set(key, made);
    }
    return made;
  };
  const hidden = new MeshBasicMaterial({ visible: false });

  for (const prop of props) {
    const type = propType(prop.type);
    const size = type?.size ?? { x: 1, y: 1, z: 1 };
    const tones = lookOf(prop);
    const seen = !inSight || inSight(prop);
    const seed = seedOf(prop.type);
    const family = familyOf(paintOf(prop));
    const box = propBox(prop);
    const turned = turnedSize(size, prop.facing);

    // Turned about the middle of its box, built from its unturned corner.
    const { holder, inner } = holderFor(prop);

    partsOf(prop.type, !!type?.opens && opened.has(prop.id)).forEach((part, i) => {
      const geometry = shapeOf(part);
      geometries.push(geometry);
      const tone = part.tone ?? 'base';
      const flat = BURNING.has(tone);
      const colour = partColour(tones, tone, i, seed);
      const painted = PAINTED.has(tone);
      const mesh = new Mesh(geometry, material(
        seen ? colour : greyed(colour), flat, painted ? family : null, painted && takesFigure(part), seen,
      ));
      mesh.position.set(part.at[0], part.at[1], part.at[2]);
      mesh.castShadow = !flat;
      mesh.receiveShadow = !flat;
      // Drawn, never picked: the proxy answers for the whole prop.
      mesh.raycast = () => {};
      inner.add(mesh);
    });
    group.add(holder);

    const volume = new BoxGeometry(turned.x, turned.y, turned.z);
    geometries.push(volume);
    const proxy = new Mesh(volume, hidden);
    proxy.position.set(box.min.x + turned.x / 2, box.min.y + turned.y / 2, box.min.z + turned.z / 2);
    owners.set(proxy, prop.id);
    proxies.push(proxy);
    group.add(proxy);
  }

  return {
    group,
    proxies,
    propAt: (object) => owners.get(object) ?? null,
    setFigures(on) {
      for (const set of switches) set(on);
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const made of materials.values()) made.dispose();
      hidden.dispose();
    },
  };
}

/**
 * A prop about to be put down (D-351): the prop itself, turned as it will be
 * and in its finish, so the GM sees which way it faces before the click.
 */
export interface PropGhostDrawn {
  readonly type: string;
  readonly at: BlockCoord;
  readonly facing: Facing;
  /** What it will be painted with (D-352); its type's first when null. */
  readonly paint: SwatchId | null;
  /** A light's flame; its type's first when null. */
  readonly flame: string | null;
  /** It cannot go there: drawn red. */
  readonly refused: boolean;
}

export interface PropGhost {
  /**
   * Draws these — the prop in hand, or one being moved with all it carries
   * (D-354) — or nothing. The caller adds the group to its scene.
   */
  show(ghosts: readonly PropGhostDrawn[] | null): Group | null;
  dispose(): void;
}

/** Where it cannot go — the prefab ghost's red. */
const REFUSED = '#ff5a5a';

/**
 * How bright a face of the ghost is, by which way it faces in the world: the
 * top brightest, the sides less, one pair less again. The ghost is lit by
 * nothing — it must show in a dark cellar — so its shape is shaded by hand,
 * enough to read a stair's treads from its risers.
 */
function shadeFaces(geometry: BufferGeometry, turn: number): void {
  const normals = geometry.getAttribute('normal');
  const shades: number[] = [];
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  for (let i = 0; i < normals.count; i += 1) {
    const [x, y, z] = [normals.getX(i), normals.getY(i), normals.getZ(i)];
    const worldX = x * cos + z * sin;
    const shade = y > 0.5 ? 1 : y < -0.5 ? 0.45 : Math.abs(worldX) > 0.5 ? 0.8 : 0.62;
    shades.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(shades, 3));
}

export function buildPropGhost(): PropGhost {
  const materials = new Map<string, MeshBasicMaterial>();
  const material = (colour: string) => {
    let made = materials.get(colour);
    if (!made) {
      // See-through, as every ghost is, and writing no depth, so it hides
      // nothing behind it (`prefab-ghost`).
      made = new MeshBasicMaterial({ color: colour, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
      materials.set(colour, made);
    }
    return made;
  };
  let current: { group: Group; geometries: BufferGeometry[] } | null = null;
  const drop = () => {
    if (!current) return;
    current.group.removeFromParent();
    for (const geometry of current.geometries) geometry.dispose();
    current = null;
  };

  return {
    show(ghosts) {
      drop();
      const shown = (ghosts ?? []).filter((ghost) => propType(ghost.type));
      if (shown.length === 0) return null;
      const group = new Group();
      const geometries: BufferGeometry[] = [];
      for (const ghost of shown) {
        const tones = lookOf({
          type: ghost.type, ...(ghost.paint ? { paint: ghost.paint } : {}), ...(ghost.flame ? { flame: ghost.flame } : {}),
        });
        const seed = seedOf(ghost.type);
        const { holder, inner } = holderFor(ghost);
        // Shut and lit: as it is put down.
        partsOf(ghost.type, false).forEach((part, i) => {
          const geometry = shapeOf(part);
          shadeFaces(geometry, holder.rotation.y);
          geometries.push(geometry);
          const mesh = new Mesh(geometry, material(ghost.refused ? REFUSED : partColour(tones, part.tone ?? 'base', i, seed)));
          mesh.position.set(part.at[0], part.at[1], part.at[2]);
          mesh.raycast = () => {};
          // Over the body's own cubes, under the outline that frames it.
          mesh.renderOrder = 10;
          inner.add(mesh);
        });
        group.add(holder);
      }
      current = { group, geometries };
      return group;
    },
    dispose() {
      drop();
      for (const made of materials.values()) made.dispose();
    },
  };
}

