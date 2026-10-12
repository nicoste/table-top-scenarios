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
import { caption } from '../captions/index.js';

/**
 * Zoom at which markers and names appear, in world units visible vertically.
 *
 * Above this the world is wide enough that a one-cell marker is a few pixels
 * and a label is soup, so neither earns the space (R-83).
 */
export const MARKER_ZOOM = 55;

export interface PlaceMarkers {
  readonly group: Group;
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
  dispose(): void;
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
  const group = new Group();
  const owners = new Map<object, string>();
  const captions: { readonly element: HTMLElement; readonly placeId: string }[] = [];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const colour = new Color();

  for (const place of campaign.places) {
    const marker: Marker | null = markerById(DEFAULT_MARKERS, place.markerId);
    const base = surfaceAt(campaign, place.cell);
    const x = place.cell.cx * CHUNK_SIZE + place.cell.x + 0.5;
    const z = place.cell.cz * CHUNK_SIZE + place.cell.z + 0.5;

    const pin = new Group();
    pin.position.set(x, base, z);
    let tallest = 0.5;

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
    captions.push({ element: name.element as HTMLElement, placeId: place.id });

    group.add(pin);
  }

  return {
    group,
    placeOf: (object) => owners.get(object) ?? null,
    captionAt(clientX, clientY) {
      if (!group.visible) return null;
      for (const { element, placeId } of captions) {
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
    /*
     * The captions are DOM and three.js takes their nodes out itself, on the
     * `removed` event every `CSS2DObject` listens for. Nothing to dispose
     * here, which is most of what this change bought (O-031).
     */
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
