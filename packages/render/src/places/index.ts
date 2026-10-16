// Place markers: low-poly shapes built from the data-driven spec in `domain`
// (R-82), plus a name caption in HTML over the canvas (R-196). Both appear and
// disappear together (R-83).

import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Campaign, Marker, MarkerPart } from '@tt/domain';
import { CHUNK_SIZE, DEFAULT_MARKERS, markerById } from '@tt/domain';
import { surfaceAt } from '../world/index.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { caption, dropCaption } from '../captions/index.js';

/**
 * Zoom at which markers and names appear, in world units visible vertically.
 *
 * Above this the world is wide enough that a one-cell marker is a few pixels
 * and a label is soup, so neither earns the space (R-83).
 */
export const MARKER_ZOOM = 55;

export interface PlaceMarkers {
  readonly group: Group;
  /**
   * Whether these markers still draw this campaign, so they can be kept
   * (R-69, D-290).
   *
   * A marker depends on its place and on the height of the cell under it, and
   * on nothing else — so painting a coastline leaves every marker exactly
   * where it was. The stage used to rebuild them on **every accepted intent**
   * regardless, which tore each caption out of the document and put a fresh
   * one back: eleven times in one brush stroke, which is what a GM sees as a
   * name that blinks and shifts while they paint.
   *
   * A value check and not an identity one, because `places` is decoded fresh
   * from the wire every message (the world has a cache, D-270; this does not).
   * It is a handful of places and a string compare, against a rebuild of
   * every marker's geometry.
   */
  matches(campaign: Campaign): boolean;
  /** Which place a picked object belongs to. */
  placeOf(object: object): string | null;
  /**
   * Which place's **caption** is under this screen point, if any (R-196).
   *
   * A caption is HTML now and passes pointer events through, so a ray cannot
   * find it the way it found the sprite this replaces. Clicking a name has
   * always selected its place — the name is a far bigger target than the
   * marker — so the hit test is done against the element's own rectangle
   * instead. A handful of places and only on a pick, which is a pointer move
   * at most.
   */
  captionAt(clientX: number, clientY: number): string | null;
  /**
   * Fades one place to a faint copy, or none (R-203).
   *
   * The place in the GM's hand: it is still where it was until it is set
   * down, and the faint copy is where a right-click would put it back. A
   * material write, not a rebuild, since it changes on every pick-up.
   */
  dim(placeId: string | null): void;
  dispose(): void;
}

/** Quarter turns clockwise from above, as an angle about the vertical. */
export function facingAngle(facing: number): number {
  // three.js turns anticlockwise for a positive angle seen from above, and a
  // facing turns clockwise — so the sign is flipped here and nowhere else.
  return -facing * (Math.PI / 2);
}

/** How faint the place in the GM's hand is left at home. */
const HOME_OPACITY = 0.28;

/**
 * Everything a marker is drawn from, as one string (D-290).
 *
 * Exported and tested for the reason the covers' is (R-23b): a marker that is
 * rebuilt when it did not need to be looks exactly like one that was not, and
 * the caption under it is what pays.
 */
export function markerSignature(campaign: Campaign): string {
  return campaign.places.map((place) => [
    place.id, place.name, place.markerId, place.facing,
    place.cell.cx, place.cell.cz, place.cell.x, place.cell.z,
    surfaceAt(campaign, place.cell),
  ].join(':')).join('|');
}

function geometryFor(part: MarkerPart): BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'cone': return new ConeGeometry(w, h, 8);
    case 'cylinder': return new CylinderGeometry(w, w, h, 10);
    case 'box':
    default: return new BoxGeometry(w, h, d);
  }
}

export function buildPlaceMarkers(campaign: Campaign): PlaceMarkers {
  const signature = markerSignature(campaign);
  const group = new Group();
  const owners = new Map<object, string>();
  const captions: { readonly object: CSS2DObject; readonly placeId: string }[] = [];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const byPlace = new Map<string, { readonly materials: MeshLambertMaterial[]; readonly name: CSS2DObject }>();
  const colour = new Color();

  for (const place of campaign.places) {
    const marker: Marker | null = markerById(DEFAULT_MARKERS, place.markerId);
    const base = surfaceAt(campaign, place.cell);
    const x = place.cell.cx * CHUNK_SIZE + place.cell.x + 0.5;
    const z = place.cell.cz * CHUNK_SIZE + place.cell.z + 0.5;

    const pin = new Group();
    pin.position.set(x, base, z);
    // The whole marker turns about its cell's centre; the caption hangs on
    // that axis, so it does not move (R-203).
    pin.rotation.y = facingAngle(place.facing);
    let tallest = 0.5;
    const own: MeshLambertMaterial[] = [];

    for (const part of marker?.parts ?? []) {
      const geometry = geometryFor(part);
      colour.set(part.colour);
      const material = new MeshLambertMaterial({ color: colour.getHex() });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(part.at[0], part.at[1], part.at[2]);
      pin.add(mesh);
      owners.set(mesh, place.id);
      geometries.push(geometry);
      materials.push(material);
      own.push(material);
      tallest = Math.max(tallest, part.at[1] + part.size[1] / 2);
    }

    /*
     * At the top of the marker, and no higher: the gap above it is the
     * caption's own padding in CSS pixels, so it is the same gap at every
     * zoom (R-196). This used to be `tallest + 0.45` *world* units, which is
     * two pixels zoomed out and thirty zoomed in (D-287).
     */
    const name = caption(place.name);
    name.position.set(0, tallest, 0);
    pin.add(name);
    captions.push({ object: name, placeId: place.id });
    byPlace.set(place.id, { materials: own, name });

    group.add(pin);
  }

  return {
    group,
    matches: (next) => markerSignature(next) === signature,
    placeOf: (object) => owners.get(object) ?? null,
    captionAt(clientX, clientY) {
      if (!group.visible) return null;
      for (const { object, placeId } of captions) {
        const element = object.element as HTMLElement;
        // Hidden captions have no box worth asking about, and off-screen ones
        // are display:none, which reports an empty rect anyway.
        if (element.style.display === 'none') continue;
        const box = element.getBoundingClientRect();
        if (box.width === 0) continue;
        if (clientX >= box.left && clientX <= box.right
          && clientY >= box.top && clientY <= box.bottom) return placeId;
      }
      return null;
    },
    dim(placeId) {
      for (const [id, { materials: parts, name }] of byPlace) {
        const faint = id === placeId;
        for (const material of parts) {
          if (material.transparent === faint) continue;
          material.transparent = faint;
          material.opacity = faint ? HOME_OPACITY : 1;
          // A faint copy must not hide the ghost standing on its own cell.
          material.depthWrite = !faint;
          material.needsUpdate = true;
        }
        (name.element as HTMLElement).style.opacity = faint ? String(HOME_OPACITY + 0.2) : '';
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      // Each caption by hand: removing the group from the scene says nothing
      // to the nodes hanging under it (D-289).
      for (const { object } of captions) dropCaption(object);
    },
  };
}

/**
 * A translucent copy of one marker, for where a place would go (R-203): the
 * marker picked in the panel on the cell under the pointer, or the place in
 * the GM's hand.
 *
 * Built per marker and kept by the caller, because aiming moves it on every
 * pointer move and turning it is a rotation, not a rebuild.
 */
export interface MarkerGhost {
  readonly group: Group;
  readonly markerId: string;
  dispose(): void;
}

export function buildMarkerGhost(markerId: string): MarkerGhost {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const marker = markerById(DEFAULT_MARKERS, markerId as Marker['id']);
  for (const part of marker?.parts ?? []) {
    const geometry = geometryFor(part);
    const material = new MeshLambertMaterial({
      color: part.colour, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(part.at[0], part.at[1], part.at[2]);
    mesh.renderOrder = 5;
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }
  return {
    group,
    markerId,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
