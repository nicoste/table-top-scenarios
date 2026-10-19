// Areas on a map, and the ruler (D-341).
//
// An area is drawn as **the floors it covers, tinted, and a faint outline of
// its shape** — the GM's choice: the tint says who is in it, the outline what
// it is. A sphere's outline is its circle on the floor and two arcs over it; a
// cone's and a line's, their shape on the floor the way they point; a cube's,
// its box. A small handle stands on the cube it starts from, which is what a
// press picks up to move it.
//
// The ruler is a line from one cube's middle to another's and how far, a bare
// number (D-316), drawn over everything as the walk is: a ruler hidden behind
// a wall measures nothing anybody can read.

import {
  BoxGeometry, BufferGeometry, DoubleSide, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshBasicMaterial, OctahedronGeometry, Vector3,
} from 'three';
import type { Aim, AreaShape, BlockCoord, EncounterMap } from '@tt/domain';
import { areaFloors } from '@tt/domain';
import { routePatches, ROUTE_LIFT } from '../route/index.js';
import { caption, dropCaption } from '../captions/index.js';

/** One area as a screen hands it over: where it is now, in its colour. */
export interface AreaDrawn {
  readonly id: string;
  readonly shape: AreaShape;
  readonly at: BlockCoord;
  readonly aim: Aim;
  readonly size: number;
  readonly colour: string;
  /** Drawn faint: hidden from the table, which only the console draws at all. */
  readonly faint?: boolean;
}

export interface AreaMeshes {
  readonly group: Group;
  dispose(): void;
}

/** How much of a floor a square covers: nearly all, so an area reads as one patch with the cubes in it. */
const PATCH = 0.94;

/** The outline's points, in pairs, for one area: its shape on the floor it starts from. */
function outlineOf(area: AreaDrawn): number[] {
  const out: number[] = [];
  const y = area.at.y + ROUTE_LIFT + 0.01;
  const c = { x: area.at.x + 0.5, z: area.at.z + 0.5 };
  const segment = (a: readonly [number, number, number], b: readonly [number, number, number]) => out.push(...a, ...b);
  const ring = (points: readonly (readonly [number, number, number])[]) => {
    for (let i = 0; i < points.length - 1; i += 1) segment(points[i]!, points[i + 1]!);
  };
  if (area.shape === 'sphere') {
    const r = area.size + 0.5;
    const steps = 64;
    ring(Array.from({ length: steps + 1 }, (_, i) => {
      const turn = (i / steps) * Math.PI * 2;
      return [c.x + Math.cos(turn) * r, y, c.z + Math.sin(turn) * r] as const;
    }));
    // Two arcs over it, so a sphere does not read as a circle painted on the floor.
    for (const across of [[1, 0], [0, 1]] as const) {
      ring(Array.from({ length: steps / 2 + 1 }, (_, i) => {
        const turn = (i / (steps / 2)) * Math.PI;
        return [c.x + across[0] * Math.cos(turn) * r, y + Math.sin(turn) * r, c.z + across[1] * Math.cos(turn) * r] as const;
      }));
    }
    return out;
  }
  if (area.shape === 'cube') {
    const sx = Math.sign(area.aim.x) || 1;
    const sz = Math.sign(area.aim.z) || 1;
    const x0 = sx > 0 ? area.at.x : area.at.x - area.size + 1;
    const z0 = sz > 0 ? area.at.z : area.at.z - area.size + 1;
    const box = new EdgesGeometry(new BoxGeometry(area.size, area.size, area.size));
    const points = box.getAttribute('position');
    for (let i = 0; i < points.count; i += 1) {
      out.push(points.getX(i) + x0 + area.size / 2, points.getY(i) + area.at.y + area.size / 2 + ROUTE_LIFT, points.getZ(i) + z0 + area.size / 2);
    }
    box.dispose();
    return out;
  }
  // A cone or a line, on the floor, the way it points across it.
  const flat = Math.hypot(area.aim.x, area.aim.z);
  const a = flat > 0 ? { x: area.aim.x / flat, z: area.aim.z / flat } : { x: 1, z: 0 };
  const p = { x: -a.z, z: a.x };
  const long = area.size + 0.5;
  const end = { x: c.x + a.x * long, z: c.z + a.z * long };
  if (area.shape === 'cone') {
    const half = long / 2;
    const left = [end.x + p.x * half, y, end.z + p.z * half] as const;
    const right = [end.x - p.x * half, y, end.z - p.z * half] as const;
    segment([c.x, y, c.z], left);
    segment([c.x, y, c.z], right);
    segment(left, right);
    return out;
  }
  const start = { x: c.x + a.x * 0.5, z: c.z + a.z * 0.5 };
  const corners = [
    [start.x + p.x * 0.5, y, start.z + p.z * 0.5],
    [end.x + p.x * 0.5, y, end.z + p.z * 0.5],
    [end.x - p.x * 0.5, y, end.z - p.z * 0.5],
    [start.x - p.x * 0.5, y, start.z - p.z * 0.5],
  ] as const;
  ring([...corners, corners[0]]);
  return out;
}

/** Draws these areas over this body: built when the areas or the body change, never per frame. */
export function buildAreas(map: EncounterMap, areas: readonly AreaDrawn[]): AreaMeshes {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: (MeshBasicMaterial | LineBasicMaterial)[] = [];
  const handle = new OctahedronGeometry(0.16);
  geometries.push(handle);

  for (const area of areas) {
    const floors = areaFloors(map, area, area.at);
    const tint = new MeshBasicMaterial({
      color: area.colour,
      transparent: true,
      opacity: area.faint ? 0.16 : 0.34,
      depthWrite: false,
      side: DoubleSide,
    });
    const patches = routePatches(floors.map((at) => new Vector3(at.x + 0.5, at.y + ROUTE_LIFT, at.z + 0.5)), PATCH);
    const mesh = new Mesh(patches, tint);
    mesh.renderOrder = 3;
    mesh.raycast = () => {};

    const lines = new BufferGeometry();
    lines.setAttribute('position', new Float32BufferAttribute(outlineOf(area), 3));
    const edge = new LineBasicMaterial({ color: area.colour, transparent: true, opacity: area.faint ? 0.35 : 0.8 });
    const outline = new LineSegments(lines, edge);
    outline.renderOrder = 3;
    outline.raycast = () => {};

    const knob = new MeshBasicMaterial({ color: area.colour, transparent: !!area.faint, opacity: area.faint ? 0.5 : 1 });
    const start = new Mesh(handle, knob);
    start.position.set(area.at.x + 0.5, area.at.y + 0.3, area.at.z + 0.5);
    start.raycast = () => {};

    geometries.push(patches, lines);
    materials.push(tint, edge, knob);
    group.add(mesh, outline, start);
  }

  return {
    group,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

/** A ruler as a screen hands it over: two cubes and how far apart, already worded. */
export interface RulerDrawn {
  readonly from: BlockCoord;
  readonly to: BlockCoord;
  readonly label: string;
}

export interface Ruler {
  readonly group: Group;
  show(ruler: RulerDrawn | null): void;
  dispose(): void;
}

export function buildRuler(): Ruler {
  const group = new Group();
  const material = new LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
  const line = new LineSegments(new BufferGeometry(), material);
  line.renderOrder = 6;
  const ends = new MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const dot = new OctahedronGeometry(0.12);
  const a = new Mesh(dot, ends);
  const b = new Mesh(dot, ends);
  a.renderOrder = 6;
  b.renderOrder = 6;
  const label = caption('');
  group.add(line, a, b, label);
  group.visible = false;

  return {
    group,
    show(ruler) {
      if (!ruler) { group.visible = false; return; }
      // From middle to middle, a little over the floor, where a token's feet would be.
      const from = [ruler.from.x + 0.5, ruler.from.y + 0.25, ruler.from.z + 0.5] as const;
      const to = [ruler.to.x + 0.5, ruler.to.y + 0.25, ruler.to.z + 0.5] as const;
      line.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute([...from, ...to], 3));
      line.geometry = geometry;
      a.position.set(...from);
      b.position.set(...to);
      label.position.set(to[0], to[1] + 0.6, to[2]);
      (label.element.firstChild as HTMLElement).textContent = ruler.label;
      group.visible = true;
    },
    dispose() {
      line.geometry.dispose();
      material.dispose();
      ends.dispose();
      dot.dispose();
      dropCaption(label);
    },
  };
}
