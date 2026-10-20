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
// A light (D-335) is drawn in fixed iron, wood and stone, and its finish is
// its flame: a blocky flame in that colour, unlit by anything — it is the
// light — and gone when the light is out. What it lights is `lamplight`'s.

import {
  BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Opened, Prop } from '@tt/domain';
import { propBox, propType, turnedSize } from '@tt/domain';

/**
 * What a part is coloured: its finish (`base`), darker or lighter; or, for a
 * light, a fixed material, and its flame — `flame` in the finish's colour and
 * `core`, nearer white — which no light falls on, because it is the light.
 */
type Tone = 'base' | 'dark' | 'light' | 'brass' | 'iron' | 'wood' | 'stone' | 'wax' | 'ember' | 'ash' | 'flame' | 'core';

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
      return [
        { size: [0.8, 0.42, 0.56], at: [0.5, 0.21, 0.5] },
        { size: [0.84, 0.06, 0.6], at: [0.5, 0.3, 0.5], tone: 'dark' },
        open
          ? { size: [0.82, 0.56, 0.1], at: [0.5, 0.7, 0.2] }
          : { size: [0.82, 0.12, 0.58], at: [0.5, 0.48, 0.5] },
      ];
    case 'table':
      return [
        { size: [0.94, 0.08, 0.94], at: [0.5, 0.54, 0.5] },
        ...[[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]].map(([x, z]) => ({
          size: [0.08, 0.5, 0.08] as const, at: [x!, 0.25, z!] as const, tone: 'dark' as const,
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
      // the GM likes (D-334).
      return [
        { size: [0.94, 0.98, 0.04], at: [0.5, 0.49, 0.09] },
        { size: [0.05, 0.98, 0.44], at: [0.055, 0.49, 0.29] },
        { size: [0.05, 0.98, 0.44], at: [0.945, 0.49, 0.29] },
        { size: [0.94, 0.05, 0.44], at: [0.5, 0.955, 0.29] },
        { size: [0.94, 0.05, 0.44], at: [0.5, 0.025, 0.29] },
        ...[0.33, 0.66].map((y) => ({ size: [0.84, 0.035, 0.42] as const, at: [0.5, y, 0.29] as const })),
      ];
    case 'barrel':
      return [
        { size: [0.68, 0.84, 0.68], at: [0.5, 0.42, 0.5], round: true },
        ...[0.18, 0.66].map((y) => ({ size: [0.71, 0.05, 0.71] as const, at: [0.5, y, 0.5] as const, tone: 'dark' as const, round: true })),
      ];
    case 'crate':
      return [
        { size: [0.84, 0.84, 0.84], at: [0.5, 0.42, 0.5] },
        ...[[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]].map(([x, z]) => ({
          size: [0.08, 0.86, 0.08] as const, at: [x!, 0.43, z!] as const, tone: 'dark' as const,
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
    // Lights (D-335): `open` is out.
    case 'torch':
      // Hung on the wall behind it, which is toward −z unturned.
      return burning([
        { size: [0.16, 0.24, 0.04], at: [0.5, 0.5, 0.02], tone: 'iron' },
        { size: [0.05, 0.05, 0.2], at: [0.5, 0.46, 0.12], tone: 'iron' },
        { size: [0.13, 0.06, 0.13], at: [0.5, 0.5, 0.24], tone: 'iron' },
        { size: [0.07, 0.34, 0.07], at: [0.5, 0.64, 0.24], tone: 'wood' },
      ], fire(0.5, 0.8, 0.24, 0.12), !open);
    case 'lantern':
      return burning([
        { size: [0.34, 0.05, 0.34], at: [0.5, 0.025, 0.5], tone: 'iron' },
        ...[[0.35, 0.35], [0.65, 0.35], [0.35, 0.65], [0.65, 0.65]].map(([x, z]) => ({
          size: [0.035, 0.3, 0.035] as const, at: [x!, 0.2, z!] as const, tone: 'iron' as const,
        })),
        { size: [0.36, 0.05, 0.36], at: [0.5, 0.375, 0.5], tone: 'iron' },
        { size: [0.2, 0.06, 0.2], at: [0.5, 0.43, 0.5], tone: 'iron' },
        { size: [0.04, 0.1, 0.04], at: [0.5, 0.51, 0.5], tone: 'iron' },
      ], fire(0.5, 0.06, 0.5, 0.17), !open);
    case 'candles': {
      // Three, each its own height: across, how tall, and how deep.
      const sticks = [[0.42, 0.24, 0.44], [0.58, 0.18, 0.42], [0.5, 0.13, 0.6]] as const;
      return burning([
        { size: [0.42, 0.04, 0.42], at: [0.5, 0.02, 0.5], tone: 'brass', round: true },
        ...sticks.map(([x, tall, z]) => ({
          size: [0.07, tall, 0.07] as const, at: [x, 0.04 + tall / 2, z] as const, tone: 'wax' as const,
        })),
      ], sticks.flatMap(([x, tall, z]) => fire(x, 0.04 + tall, z, 0.045)), !open);
    }
    case 'brazier':
      return burning([
        ...[[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]].map(([x, z]) => ({
          size: [0.06, 0.5, 0.06] as const, at: [x!, 0.25, z!] as const, tone: 'iron' as const,
        })),
        { size: [0.74, 0.16, 0.74], at: [0.5, 0.56, 0.5], tone: 'iron', round: true },
        { size: [0.62, 0.04, 0.62], at: [0.5, 0.65, 0.5], tone: 'ember', round: true },
      ], [...fire(0.5, 0.66, 0.5, 0.26), ...fire(0.36, 0.66, 0.6, 0.13), ...fire(0.64, 0.66, 0.4, 0.12)], !open);
    case 'campfire':
      return burning([
        ...Array.from({ length: 8 }, (_, i) => {
          const turn = (i / 8) * Math.PI * 2;
          return {
            size: [0.16, 0.1, 0.16] as const,
            at: [0.5 + Math.cos(turn) * 0.36, 0.05, 0.5 + Math.sin(turn) * 0.36] as const,
            tone: 'stone' as const,
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
  dispose(): void;
}

const BRASS = '#c9a24f';
/** A light's own materials (D-335): what holds the flame is not in the flame's colour. */
const FIXED = {
  iron: '#3b3f45', wood: '#5b3b24', stone: '#7a776f', wax: '#efe5cc', ember: '#8a2c10', ash: '#3d3936',
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

/** The colour of each tone of a finish, worked out once a colour. */
function tonesOf(colour: string): Record<NonNullable<Part['tone']>, string> {
  const base = new Color(colour);
  return {
    base: colour,
    dark: `#${base.clone().multiplyScalar(0.62).getHexString()}`,
    light: `#${base.clone().lerp(new Color('#ffffff'), 0.25).getHexString()}`,
    brass: BRASS,
    ...FIXED,
    flame: colour,
    core: `#${base.clone().lerp(new Color('#fff3c4'), 0.45).getHexString()}`,
  };
}

/**
 * `inSight` says whether the party sees a prop now — `null` when nobody is
 * asking, the GM's own view, where nothing is greyed.
 */
export function buildProps(
  props: readonly Prop[],
  opened: Opened,
  inSight: ((prop: Prop) => boolean) | null = null,
): PropMeshes {
  const group = new Group();
  const proxies: Mesh[] = [];
  const owners = new Map<object, string>();
  const geometries: BufferGeometry[] = [];
  const materials = new Map<string, Material>();
  /** One material a colour — flat for a flame, which is the light and is lit by none. */
  const material = (colour: string, flat: boolean) => {
    const key = `${flat ? 'flat' : 'lit'}:${colour}`;
    let made = materials.get(key);
    if (!made) {
      made = flat
        ? new MeshBasicMaterial({ color: colour })
        : new MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0.05 });
      materials.set(key, made);
    }
    return made;
  };
  const hidden = new MeshBasicMaterial({ visible: false });

  for (const prop of props) {
    const type = propType(prop.type);
    const size = type?.size ?? { x: 1, y: 1, z: 1 };
    const finish = type?.finishes.find((one) => one.id === prop.finish) ?? type?.finishes[0];
    const lit = tonesOf(finish?.colour ?? '#9aa3ad');
    const tones = !inSight || inSight(prop)
      ? lit
      : Object.fromEntries(Object.entries(lit).map(([tone, colour]) => [tone, greyed(colour)])) as typeof lit;
    const box = propBox(prop);
    const turned = turnedSize(size, prop.facing);

    // Turned about the middle of its box, built from its unturned corner.
    const holder = new Group();
    holder.position.set(box.min.x + turned.x / 2, box.min.y, box.min.z + turned.z / 2);
    holder.rotation.y = -prop.facing * (Math.PI / 2);
    const inner = new Group();
    inner.position.set(-size.x / 2, 0, -size.z / 2);
    holder.add(inner);

    for (const part of partsOf(prop.type, !!type?.opens && opened.has(prop.id))) {
      const geometry = part.round
        ? new CylinderGeometry(part.size[0] / 2, part.size[0] / 2, part.size[1], 14)
        : new BoxGeometry(part.size[0], part.size[1], part.size[2]);
      geometries.push(geometry);
      const tone = part.tone ?? 'base';
      const flat = BURNING.has(tone);
      const mesh = new Mesh(geometry, material(tones[tone], flat));
      mesh.position.set(part.at[0], part.at[1], part.at[2]);
      mesh.castShadow = !flat;
      mesh.receiveShadow = !flat;
      // Drawn, never picked: the proxy answers for the whole prop.
      mesh.raycast = () => {};
      inner.add(mesh);
    }
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
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const made of materials.values()) made.dispose();
      hidden.dispose();
    },
  };
}
