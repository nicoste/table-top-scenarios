// POI markers. Cosmetic only (R-82): a castle and a cave differ in what is
// drawn and in nothing else.
//
// A marker is described as **data** — a few primitives with offsets — not as a
// model file. `domain` cannot depend on three.js, there is no asset pipeline
// yet, and a low-poly marker is a handful of boxes and cones anyway. `render`
// builds meshes from this; adding a marker is a data entry, not code.

import type { MarkerId } from '../ids/index.js';
import { registryId } from '../ids/index.js';

export type PartShape = 'box' | 'cone' | 'cylinder';

export interface MarkerPart {
  readonly shape: PartShape;
  /** Offset from the marker's base centre, in cell widths. y is up. */
  readonly at: readonly [number, number, number];
  /** box: full extents. cone/cylinder: [radius, height, radius]. */
  readonly size: readonly [number, number, number];
  readonly colour: string;
}

export interface Marker {
  readonly id: MarkerId;
  readonly name: string;
  readonly parts: readonly MarkerPart[];
}

const STONE = '#9aa0a8';
const DARK = '#3a4048';
const ROOF = '#8d4b3a';
const WALL = '#d8cdb4';
const WOOD = '#6b5138';
const GREEN = '#3f6b40';
const GOLD = '#d9b45b';
const CANVAS = '#c9c2ad';

const box = (at: MarkerPart['at'], size: MarkerPart['size'], colour: string): MarkerPart =>
  ({ shape: 'box', at, size, colour });
const cone = (at: MarkerPart['at'], size: MarkerPart['size'], colour: string): MarkerPart =>
  ({ shape: 'cone', at, size, colour });
const cyl = (at: MarkerPart['at'], size: MarkerPart['size'], colour: string): MarkerPart =>
  ({ shape: 'cylinder', at, size, colour });

const marker = (value: string, name: string, parts: readonly MarkerPart[]): Marker => ({
  id: registryId<'MarkerId'>('marker', value),
  name,
  parts,
});

/**
 * The starting set. Append-only (R-11): entries may be added, never renamed or
 * reordered, because POIs reference these ids.
 */
export const DEFAULT_MARKERS: readonly Marker[] = [
  marker('village', 'Village', [
    box([-0.18, 0.16, 0.1], [0.26, 0.32, 0.26], WALL),
    cone([-0.18, 0.42, 0.1], [0.22, 0.2, 0.22], ROOF),
    box([0.16, 0.13, -0.12], [0.22, 0.26, 0.22], WALL),
    cone([0.16, 0.36, -0.12], [0.19, 0.17, 0.19], ROOF),
  ]),
  marker('town', 'Town', [
    box([-0.22, 0.22, 0.14], [0.3, 0.44, 0.3], WALL),
    cone([-0.22, 0.56, 0.14], [0.25, 0.24, 0.25], ROOF),
    box([0.2, 0.18, -0.16], [0.28, 0.36, 0.28], WALL),
    cone([0.2, 0.46, -0.16], [0.24, 0.22, 0.24], ROOF),
    box([0.02, 0.12, 0.3], [0.22, 0.24, 0.22], WALL),
  ]),
  marker('city', 'City', [
    box([-0.2, 0.3, 0.12], [0.3, 0.6, 0.3], WALL),
    box([0.18, 0.4, -0.1], [0.28, 0.8, 0.28], WALL),
    cone([0.18, 0.94, -0.1], [0.22, 0.28, 0.22], ROOF),
    cyl([0.0, 0.55, 0.28], [0.11, 1.1, 0.11], STONE),
    cone([0.0, 1.22, 0.28], [0.15, 0.24, 0.15], GOLD),
  ]),
  marker('castle', 'Castle', [
    box([0, 0.2, 0], [0.62, 0.4, 0.5], STONE),
    cyl([-0.26, 0.42, -0.2], [0.13, 0.84, 0.13], STONE),
    cone([-0.26, 0.94, -0.2], [0.18, 0.26, 0.18], ROOF),
    cyl([0.26, 0.36, 0.2], [0.12, 0.72, 0.12], STONE),
    cone([0.26, 0.82, 0.2], [0.17, 0.24, 0.17], ROOF),
  ]),
  marker('fort', 'Fort', [
    box([0, 0.18, 0], [0.66, 0.36, 0.56], STONE),
    box([-0.28, 0.44, -0.24], [0.16, 0.24, 0.16], STONE),
    box([0.28, 0.44, -0.24], [0.16, 0.24, 0.16], STONE),
    box([-0.28, 0.44, 0.24], [0.16, 0.24, 0.16], STONE),
    box([0.28, 0.44, 0.24], [0.16, 0.24, 0.16], STONE),
  ]),
  marker('cave', 'Cave', [
    box([0, 0.22, 0.06], [0.66, 0.44, 0.42], STONE),
    box([0, 0.15, -0.2], [0.28, 0.3, 0.12], DARK),
  ]),
  marker('mine', 'Mine', [
    box([0, 0.13, 0.08], [0.5, 0.26, 0.34], STONE),
    box([0, 0.16, -0.16], [0.22, 0.32, 0.1], DARK),
    box([-0.16, 0.34, 0.1], [0.07, 0.42, 0.07], WOOD),
    box([0.16, 0.34, 0.1], [0.07, 0.42, 0.07], WOOD),
  ]),
  marker('forest', 'Forest', [
    cone([-0.2, 0.3, 0.12], [0.2, 0.6, 0.2], GREEN),
    cone([0.18, 0.36, -0.1], [0.22, 0.72, 0.22], GREEN),
    cone([0.04, 0.24, 0.3], [0.17, 0.48, 0.17], GREEN),
  ]),
  marker('ruin', 'Ruin', [
    box([-0.22, 0.16, -0.1], [0.14, 0.32, 0.14], STONE),
    box([0.18, 0.26, 0.14], [0.13, 0.52, 0.13], STONE),
    box([0.0, 0.06, -0.22], [0.42, 0.12, 0.16], STONE),
  ]),
  marker('temple', 'Temple', [
    box([0, 0.1, 0], [0.58, 0.2, 0.46], WALL),
    cyl([-0.2, 0.34, -0.16], [0.06, 0.48, 0.06], WALL),
    cyl([0.2, 0.34, -0.16], [0.06, 0.48, 0.06], WALL),
    cone([0, 0.7, 0], [0.34, 0.3, 0.34], GOLD),
  ]),
  marker('camp', 'Camp', [
    cone([-0.16, 0.16, 0.08], [0.19, 0.32, 0.19], CANVAS),
    cone([0.18, 0.14, -0.1], [0.17, 0.28, 0.17], CANVAS),
    box([0.02, 0.03, 0.28], [0.14, 0.06, 0.14], WOOD),
  ]),
  marker('port', 'Port', [
    box([-0.1, 0.1, 0.1], [0.36, 0.2, 0.3], WOOD),
    cyl([0.16, 0.42, -0.06], [0.04, 0.84, 0.04], WOOD),
    box([0.16, 0.5, 0.06], [0.02, 0.34, 0.24], CANVAS),
  ]),
];

/** What a new POI gets before the GM picks something. */
export const DEFAULT_MARKER: MarkerId = registryId<'MarkerId'>('marker', 'village');

export function markerById(markers: readonly Marker[], id: MarkerId): Marker | null {
  return markers.find((m) => m.id === id) ?? null;
}

export function isKnownMarker(id: MarkerId): boolean {
  return DEFAULT_MARKERS.some((m) => m.id === id);
}
