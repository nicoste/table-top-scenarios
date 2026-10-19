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

import {
  BoxGeometry, Color, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Opened, Prop } from '@tt/domain';
import { propBox, propType, turnedSize } from '@tt/domain';

/** One part of a prop: a box (or a cylinder), centred at `at`, in the prop's unturned box. */
interface Part {
  readonly size: readonly [number, number, number];
  readonly at: readonly [number, number, number];
  readonly tone?: 'base' | 'dark' | 'light' | 'books' | 'brass';
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
      return [
        { size: [0.94, 0.98, 0.46], at: [0.5, 0.49, 0.3] },
        ...[0.17, 0.5, 0.83].map((y) => ({ size: [0.82, 0.24, 0.36] as const, at: [0.5, y, 0.36] as const, tone: 'books' as const })),
        ...[0.33, 0.66].map((y) => ({ size: [0.88, 0.04, 0.44] as const, at: [0.5, y, 0.31] as const, tone: 'dark' as const })),
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

const BOOKS = '#7b3d33';
const BRASS = '#c9a24f';
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
    books: BOOKS,
    brass: BRASS,
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
  const material = (colour: string) => {
    let made = materials.get(colour);
    if (!made) {
      made = new MeshStandardMaterial({ color: colour, roughness: 0.85, metalness: 0.05 });
      materials.set(colour, made);
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
      const mesh = new Mesh(geometry, material(tones[part.tone ?? 'base']));
      mesh.position.set(part.at[0], part.at[1], part.at[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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
