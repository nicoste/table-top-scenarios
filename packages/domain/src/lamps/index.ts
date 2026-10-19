// Lamplight (D-335): how much light each cube near a lit light gets — a torch
// on a wall, a brazier, a member carrying a lantern.
//
// **It fills the air, cube by cube.** Light goes from the flame to every cube
// it can reach through the air, the long way round a corner, and is dimmer the
// further it went — so it never shines through a wall, a shut door keeps it
// in the room, and opening the door lets it out into the corridor. Blocks and
// what stops sight stop it (R-212); the cubes of a shut door are lit on the
// side the light came from and pass none of it on.
//
// **Drawn, never ruled.** Nothing here changes who sees what (D-319): sight is
// the GM's number. This is how the room looks, worked out when something in it
// changes — a block, a door, a light, somebody carrying one moving — and never
// per frame (R-170), so a map may have as many lights as the GM likes.
//
// The steps are the walk's (R-209): 1 along an edge, √2 across a face, √3
// corner to corner — and a step across never squeezes between two cubes that
// stop it, so light does not leak through the crack where two walls meet.
//
// **Shadows** (D-337): that way round is only the light that bounces. A cube
// the flame can see in a straight line gets the flame's full light for how
// far it is; one it cannot — behind a pillar, round a corner, off to the side
// of a doorway — gets a share of the light that found its way round. So a
// pillar throws a shadow, a doorway throws a wedge of light into the room
// beyond, and nothing is ever pitch black where light can reach.

import type { BlockCoord, EncounterMap } from '../map/index.js';
import { blockKey, cleanReach, inMap, MAP_MAX_HEIGHT, MAP_MIN_DEPTH, MAX_LIGHT_REACH } from '../map/index.js';
import type { Opened, Props } from '../props/index.js';
import { FLAMES, NONE_OPEN, flameColour, isLit, propRules, reachOf } from '../props/index.js';

// -- carried lights ----------------------------------------------------------

/**
 * A light somebody carries (D-335): a torch, a lantern. Which flame, and how
 * far it reaches. It goes where they go.
 */
export interface CarriedLight {
  readonly flame: string;
  readonly reach: number;
}

/** What a light is picked up as: a torch's fire, six cubes. */
export const TORCH: CarriedLight = { flame: 'fire', reach: 6 };

export interface CarriedLightJSON {
  flame: string;
  reach: number;
}

/** A carried light read leniently (R-137a): an unknown flame is fire, a reach is brought into bounds. */
export function carriedLightFromJSON(json: unknown): CarriedLight | null {
  if (!json || typeof json !== 'object') return null;
  const raw = json as Record<string, unknown>;
  const flame = typeof raw.flame === 'string' && FLAMES.some((one) => one.id === raw.flame) ? raw.flame : TORCH.flame;
  const reach = typeof raw.reach === 'number' && Number.isFinite(raw.reach) ? cleanReach(raw.reach) : TORCH.reach;
  return { flame, reach };
}

export function carriedLightToJSON(light: CarriedLight): CarriedLightJSON {
  return { flame: light.flame, reach: light.reach };
}

/** A light as kept: a flame there is, and a reach in bounds. */
export function cleanCarried(light: CarriedLight): CarriedLight {
  return carriedLightFromJSON(light)!;
}

export function sameLight(a: CarriedLight | null, b: CarriedLight | null): boolean {
  return a === b || (!!a && !!b && a.flame === b.flame && a.reach === b.reach);
}

/**
 * The lights the party's members carry, by member id (D-335). Across maps, as
 * a member's note is (D-315): a member lights a torch and has it lit wherever
 * they go next. Nobody carrying one has no entry.
 */
export type CarriedLights = ReadonlyMap<string, CarriedLight>;

export const NO_CARRIED: CarriedLights = new Map();

/** Gives one member a light, or takes theirs away with `null`. Identity-preserving (R-165). */
export function withCarried(carried: CarriedLights, id: string, light: CarriedLight | null): CarriedLights {
  const next = light ? cleanCarried(light) : null;
  if (sameLight(carried.get(id) ?? null, next)) return carried;
  const copy = new Map(carried);
  if (next) copy.set(id, next);
  else copy.delete(id);
  return copy;
}

/** Only the lights of members still on the roster, for tidying on the way in. */
export function carriedOnRoster(carried: CarriedLights, live: ReadonlySet<string>): CarriedLights {
  const keep = [...carried].filter(([id]) => live.has(id));
  return keep.length === carried.size ? carried : new Map(keep);
}

export function carriedToJSON(carried: CarriedLights): Record<string, CarriedLightJSON> {
  return Object.fromEntries([...carried.keys()].sort().map((id) => [id, carriedLightToJSON(carried.get(id)!)]));
}

export function carriedFromJSON(json: Readonly<Record<string, unknown>> | undefined | null): CarriedLights {
  if (!json) return NO_CARRIED;
  const out = new Map<string, CarriedLight>();
  for (const [id, raw] of Object.entries(json)) {
    const light = carriedLightFromJSON(raw);
    if (light) out.set(id, light);
  }
  return out.size === 0 ? NO_CARRIED : out;
}

// -- where the light is ------------------------------------------------------

/** One light where it burns: a lit prop's cube, or where its carrier stands. */
export interface LightSource {
  readonly at: BlockCoord;
  readonly colour: string;
  readonly reach: number;
}

/** A map's lit props, as lights. */
export function propLights(props: Props, opened: Opened = NONE_OPEN): readonly LightSource[] {
  return props
    .filter((prop) => isLit(prop, opened))
    .map((prop) => ({ at: prop.at, colour: flameColour(prop.finish), reach: reachOf(prop)! }));
}

/** A carried light, burning where its carrier stands. */
export function carriedAt(at: BlockCoord, light: CarriedLight): LightSource {
  return { at, colour: flameColour(light.flame), reach: light.reach };
}

/** How bright a light is this far from its flame: full there, and nothing past its reach. */
export function glow(distance: number, reach: number): number {
  if (distance > reach + 0.5) return 0;
  const left = Math.max(0, 1 - distance / (reach + 1));
  return left * left;
}

/**
 * The light in a box of cubes around the lights, ready to draw (D-335).
 *
 * Four numbers a cube, x fastest, then y, then z: red, green and blue, in
 * linear light — the way a screen adds light up — and a fourth that is 1
 * where light can be and 0 inside a block, so a face is lit by the air in
 * front of it and never by the inside of the wall beside it.
 */
export interface LampField {
  /** The box's lowest corner. */
  readonly origin: BlockCoord;
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  readonly data: Float32Array<ArrayBuffer>;
}

/** As bright as overlapping lights add up to: three at their flames. The screen eases it further. */
const BRIGHTEST = 3;

/**
 * What one cube is to light: not looked at — beyond a light's reach, or the
 * map's edge — or it stops light, passes it on, or takes it and passes none
 * on. *Not looked at* is not *stops*: one light's far corners are another's
 * open air, and only a cube that is a block may say there is a wall.
 */
const UNSEEN = 0;
const STOPS = 1;
const PASSES = 2;
const KEEPS = 3;

/** How far one light got, in the box of cubes around it. */
interface Spread {
  readonly min: BlockCoord;
  /** The box's side, in cubes. */
  readonly side: number;
  readonly cubes: Uint8Array;
  /** Its brightness in each cube, 0 to 1. */
  readonly level: Float32Array;
}

/** The 26 steps, each with what it costs and the cubes it passes between. */
const STEPS = (() => {
  const steps: { dx: number; dy: number; dz: number; cost: number; between: readonly (readonly [number, number, number])[] }[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const moved = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        if (moved === 0) continue;
        // Every cube of the step's own little box but its two ends.
        const between: [number, number, number][] = [];
        for (const bx of dx === 0 ? [0] : [0, dx]) {
          for (const by of dy === 0 ? [0] : [0, dy]) {
            for (const bz of dz === 0 ? [0] : [0, dz]) {
              const ends = (bx === 0 && by === 0 && bz === 0) || (bx === dx && by === dy && bz === dz);
              if (!ends) between.push([bx, by, bz]);
            }
          }
        }
        steps.push({ dx, dy, dz, cost: Math.sqrt(moved), between });
      }
    }
  }
  return steps;
})();

/** A heap of cubes by how far the light went to reach them, nearest on top. */
class Nearest {
  private readonly far: number[] = [];
  private readonly cube: number[] = [];

  get size(): number { return this.far.length; }

  push(far: number, cube: number): void {
    let i = this.far.length;
    this.far.push(far);
    this.cube.push(cube);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.far[up]! <= far) break;
      this.far[i] = this.far[up]!;
      this.cube[i] = this.cube[up]!;
      i = up;
    }
    this.far[i] = far;
    this.cube[i] = cube;
  }

  /** Takes the nearest: its distance and its cube. */
  pop(): [number, number] {
    const top: [number, number] = [this.far[0]!, this.cube[0]!];
    const far = this.far.pop()!;
    const cube = this.cube.pop()!;
    const n = this.far.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        if (left >= n) break;
        const right = left + 1;
        const child = right < n && this.far[right]! < this.far[left]! ? right : left;
        if (this.far[child]! >= far) break;
        this.far[i] = this.far[child]!;
        this.cube[i] = this.cube[child]!;
        i = child;
      }
      this.far[i] = far;
      this.cube[i] = cube;
    }
    return top;
  }
}

/** The steps as moves through a box `side` cubes wide: index offsets, worked out once per width. */
const stepsFor = (() => {
  const made = new Map<number, readonly { readonly offset: number; readonly cost: number; readonly between: readonly number[] }[]>();
  return (side: number) => {
    let steps = made.get(side);
    if (!steps) {
      const at = (x: number, y: number, z: number) => x + side * (y + side * z);
      steps = STEPS.map((step) => ({
        offset: at(step.dx, step.dy, step.dz),
        cost: step.cost,
        between: step.between.map(([x, y, z]) => at(x, y, z)),
      }));
      made.set(side, steps);
    }
    return steps;
  };
})();

/**
 * How far one light gets from its flame, through the air of this map.
 *
 * Only the cubes no further than its reach in a straight line are looked at:
 * no way round is shorter than the straight one. That ball sits inside the
 * box with a cube to spare on every side, so a step from inside it never
 * leaves the box and needs no checking.
 */
function spread(map: EncounterMap, stops: ReadonlySet<string>, at: BlockCoord, reach: number): Spread | null {
  const limit = reach + 0.5;
  const r = Math.floor(limit) + 1;
  const side = 2 * r + 1;
  const min = { x: at.x - r, y: at.y - r, z: at.z - r };
  const count = side * side * side;
  const cubes = new Uint8Array(count);
  const low = { x: map.origin.x, z: map.origin.z };
  const high = { x: map.origin.x + map.size.x, z: map.origin.z + map.size.z };
  for (let z = 0; z < side; z += 1) {
    const gz = min.z + z;
    if (gz < low.z || gz >= high.z) continue;
    for (let y = 0; y < side; y += 1) {
      const gy = min.y + y;
      if (gy < MAP_MIN_DEPTH || gy >= MAP_MAX_HEIGHT) continue;
      for (let x = 0; x < side; x += 1) {
        const gx = min.x + x;
        if (gx < low.x || gx >= high.x) continue;
        const dx = x - r;
        const dy = y - r;
        const dz = z - r;
        if (dx * dx + dy * dy + dz * dz > limit * limit) continue;
        const key = `${gx},${gy},${gz}`;
        cubes[x + side * (y + side * z)] = map.blocks.has(key) ? STOPS : stops.has(key) ? KEEPS : PASSES;
      }
    }
  }
  const start = r + side * (r + side * r);
  // A flame inside a block gives nothing; one inside a shut door still burns.
  if (cubes[start] === STOPS || cubes[start] === UNSEEN) return null;

  const steps = stepsFor(side);
  const far = new Float64Array(count).fill(Infinity);
  const heap = new Nearest();
  far[start] = 0;
  heap.push(0, start);
  while (heap.size > 0) {
    const [d, i] = heap.pop();
    if (d > far[i]!) continue;
    if (cubes[i] === KEEPS && i !== start) continue;
    for (const step of steps) {
      const j = i + step.offset;
      if (cubes[j] === STOPS || cubes[j] === UNSEEN) continue;
      const next = d + step.cost;
      if (next > limit || next >= far[j]!) continue;
      let clear = true;
      for (const between of step.between) {
        if (cubes[i + between] !== PASSES) { clear = false; break; }
      }
      if (!clear) continue;
      far[j] = next;
      heap.push(next, j);
    }
  }
  const level = new Float32Array(count);
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const i = x + side * (y + side * z);
        if (far[i]! === Infinity) continue;
        const bounced = BOUNCE * glow(far[i]!, reach);
        const straight = Math.hypot(x - r, y - r, z - r);
        level[i] = inView(cubes, side, r, x, y, z) ? Math.max(glow(straight, reach), bounced) : bounced;
      }
    }
  }
  return { min, side, cubes, level };
}

/** How much of a light reaches a cube its flame cannot see: what bounced round (D-337). */
const BOUNCE = 0.3;

/**
 * Whether a straight line from the flame, in the middle of the box, to the
 * middle of cube (x, y, z) passes nothing that stops light (D-337).
 *
 * Every cube the line touches is asked, and where it passes exactly through
 * an edge or a corner, every cube meeting there — so, like a step of the
 * light's own, it never slips through the crack where two walls meet. The
 * cube at the far end may stop light itself: a shut door is lit on the side
 * the flame can see.
 */
function inView(cubes: Uint8Array, side: number, r: number, x: number, y: number, z: number): boolean {
  const dx = x - r;
  const dy = y - r;
  const dz = z - r;
  const way = [Math.sign(dx), Math.sign(dy), Math.sign(dz)] as const;
  // How far along the line, 0 to 1, each cube's width is, and where the next
  // face in each direction comes: half a cube out from the middle.
  const across = [dx === 0 ? Infinity : 1 / Math.abs(dx), dy === 0 ? Infinity : 1 / Math.abs(dy), dz === 0 ? Infinity : 1 / Math.abs(dz)];
  const next = [across[0]! / 2, across[1]! / 2, across[2]! / 2];
  const at = [r, r, r];
  const stopsAt = (cx: number, cy: number, cz: number) => {
    if (cx === x && cy === y && cz === z) return false;
    const cube = cubes[cx + side * (cy + side * cz)];
    return cube === STOPS || cube === KEEPS;
  };
  for (;;) {
    const t = Math.min(next[0]!, next[1]!, next[2]!);
    if (t >= 1 - 1e-9) return true;
    const moves = [0, 1, 2].filter((axis) => next[axis]! - t < 1e-9);
    // Through an edge or a corner: every cube that meets there, not only the one beyond.
    if (moves.length > 1) {
      for (let mask = 1; mask < (1 << moves.length) - 1; mask += 1) {
        const side3 = [at[0]!, at[1]!, at[2]!];
        moves.forEach((axis, k) => { if (mask & (1 << k)) side3[axis] = side3[axis]! + way[axis]!; });
        if (stopsAt(side3[0]!, side3[1]!, side3[2]!)) return false;
      }
    }
    for (const axis of moves) {
      at[axis] = at[axis]! + way[axis]!;
      next[axis] = next[axis]! + across[axis]!;
    }
    if (stopsAt(at[0]!, at[1]!, at[2]!)) return false;
  }
}

/**
 * Worked out once per light, map and set of what stops it: moving one
 * carried torch redoes that torch and none of the others. A new map — every
 * edit makes one (R-165) — starts again.
 */
const spreads = new WeakMap<EncounterMap, WeakMap<ReadonlySet<string>, Map<string, Spread | null>>>();

function spreadOf(map: EncounterMap, stops: ReadonlySet<string>, source: LightSource): Spread | null {
  let byStops = spreads.get(map);
  if (!byStops) { byStops = new WeakMap(); spreads.set(map, byStops); }
  let bySource = byStops.get(stops);
  if (!bySource) { bySource = new Map(); byStops.set(stops, bySource); }
  const reach = cleanReach(source.reach);
  const key = `${blockKey(source.at)}:${reach}`;
  if (!bySource.has(key)) bySource.set(key, spread(map, stops, source.at, reach));
  return bySource.get(key)!;
}

/** A colour's red, green and blue, 0 to 1, in linear light. */
function channels(colour: string): readonly [number, number, number] {
  const hex = /^#?([0-9a-f]{6})$/i.exec(colour)?.[1] ?? 'ffffff';
  const n = Number.parseInt(hex, 16);
  const linear = (byte: number) => {
    const c = byte / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [linear((n >> 16) & 255), linear((n >> 8) & 255), linear(n & 255)];
}

/**
 * The light these lights give in this map, as it stands with these props
 * open (D-335) — or `null` for none. The box is the lights' own, cut to the
 * map, so a map with one candle in a corner is not a texture the size of the
 * map. Lights that overlap add up, to three flames and no further.
 */
export function lampField(map: EncounterMap, opened: Opened, sources: readonly LightSource[]): LampField | null {
  const stops = map.props.length > 0 ? propRules(map.props, opened).sight : NO_STOPS;
  const lit = sources
    .filter((source) => inMap(map, source.at) && source.reach > 0)
    .map((source) => ({ source, spread: spreadOf(map, stops, source) }))
    .filter((one): one is { source: LightSource; spread: Spread } => one.spread !== null);
  if (lit.length === 0) return null;

  const low = { x: map.origin.x, y: MAP_MIN_DEPTH, z: map.origin.z };
  const high = { x: map.origin.x + map.size.x - 1, y: MAP_MAX_HEIGHT - 1, z: map.origin.z + map.size.z - 1 };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { spread: one } of lit) {
    min.x = Math.min(min.x, Math.max(low.x, one.min.x));
    min.y = Math.min(min.y, Math.max(low.y, one.min.y));
    min.z = Math.min(min.z, Math.max(low.z, one.min.z));
    max.x = Math.max(max.x, Math.min(high.x, one.min.x + one.side - 1));
    max.y = Math.max(max.y, Math.min(high.y, one.min.y + one.side - 1));
    max.z = Math.max(max.z, Math.min(high.z, one.min.z + one.side - 1));
  }
  const size = { x: max.x - min.x + 1, y: max.y - min.y + 1, z: max.z - min.z + 1 };
  const count = size.x * size.y * size.z;
  const light = new Float32Array(count * 3);
  const solid = new Uint8Array(count);

  for (const { source, spread: one } of lit) {
    const [red, green, blue] = channels(source.colour);
    for (let y = 0; y < one.side; y += 1) {
      const fy = one.min.y + y - min.y;
      if (fy < 0 || fy >= size.y) continue;
      for (let z = 0; z < one.side; z += 1) {
        const fz = one.min.z + z - min.z;
        if (fz < 0 || fz >= size.z) continue;
        for (let x = 0; x < one.side; x += 1) {
          const fx = one.min.x + x - min.x;
          if (fx < 0 || fx >= size.x) continue;
          const i = x + one.side * (y + one.side * z);
          const f = fx + size.x * (fy + size.y * fz);
          if (one.cubes[i] === STOPS) { solid[f] = 1; continue; }
          const level = one.level[i]!;
          if (level === 0) continue;
          light[f * 3] = light[f * 3]! + level * red;
          light[f * 3 + 1] = light[f * 3 + 1]! + level * green;
          light[f * 3 + 2] = light[f * 3 + 2]! + level * blue;
        }
      }
    }
  }

  const data = new Float32Array(count * 4);
  for (let f = 0; f < count; f += 1) {
    data[f * 4] = Math.min(BRIGHTEST, light[f * 3]!);
    data[f * 4 + 1] = Math.min(BRIGHTEST, light[f * 3 + 1]!);
    data[f * 4 + 2] = Math.min(BRIGHTEST, light[f * 3 + 2]!);
    data[f * 4 + 3] = solid[f] ? 0 : 1;
  }
  return { origin: min, size, data };
}

const NO_STOPS: ReadonlySet<string> = new Set();

/** The light a field says a cube has, in linear light — for tests and for nobody else. */
export function lightIn(field: LampField | null, at: BlockCoord): readonly [number, number, number] {
  if (!field) return [0, 0, 0];
  const x = at.x - field.origin.x;
  const y = at.y - field.origin.y;
  const z = at.z - field.origin.z;
  if (x < 0 || y < 0 || z < 0 || x >= field.size.x || y >= field.size.y || z >= field.size.z) return [0, 0, 0];
  const f = x + field.size.x * (y + field.size.y * z);
  return [field.data[f * 4]!, field.data[f * 4 + 1]!, field.data[f * 4 + 2]!];
}

export { MAX_LIGHT_REACH };
