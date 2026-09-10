// POI markers: low-poly shapes built from the data-driven spec in `domain`
// (R-82), plus a name label. Both appear and disappear together (R-83).

import {
  BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, Mesh,
  MeshLambertMaterial, Sprite, SpriteMaterial, SRGBColorSpace,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Campaign, Marker, MarkerPart } from '@tt/domain';
import { CHUNK_SIZE, DEFAULT_MARKERS, markerById } from '@tt/domain';
import { surfaceAt } from '../world/index.js';

/**
 * Zoom at which markers and names appear, in world units visible vertically.
 *
 * Above this the world is wide enough that a one-cell marker is a few pixels
 * and a label is soup, so neither earns the space (R-83).
 */
export const MARKER_ZOOM = 55;

export interface PoiMarkers {
  readonly group: Group;
  /** Which POI a picked object belongs to. */
  poiOf(object: object): string | null;
  /**
   * Keeps name labels a constant size **on screen**.
   *
   * A Sprite under an orthographic camera is sized in world units, so a label
   * that reads well at one zoom balloons when you zoom in and vanishes when you
   * zoom out. Scaling it by the zoom each frame makes it behave like a map
   * label instead of a scenery object.
   */
  scaleLabels(zoom: number, viewportHeightPx: number): void;
  dispose(): void;
}

/** How tall a name should be on screen, in CSS pixels. */
export const LABEL_PIXELS = 13;

function geometryFor(part: MarkerPart): BufferGeometry {
  const [w, h, d] = part.size;
  switch (part.shape) {
    case 'cone': return new ConeGeometry(w, h, 8);
    case 'cylinder': return new CylinderGeometry(w, w, h, 10);
    case 'box':
    default: return new BoxGeometry(w, h, d);
  }
}

export interface Label { readonly sprite: Sprite; readonly aspect: number }

/** A map caption. Shared with the party pawns, which label the same way (R-90). */
export function nameLabel(text: string): Label {
  const pad = 16;
  const font = '600 34px ui-sans-serif, system-ui, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  if (measure) measure.font = font;
  const width = Math.ceil((measure?.measureText(text).width ?? text.length * 18) + pad * 2);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(64, width);
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(8,10,14,.78)';
    ctx.beginPath();
    ctx.roundRect(0, 12, canvas.width, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#eef2f7';
    ctx.fillText(text, canvas.width / 2, 33);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 6;
  // Scale is set every frame by scaleLabels; this is a placeholder.
  sprite.scale.set(1, 1, 1);
  return { sprite, aspect: canvas.width / canvas.height };
}

export function buildPoiMarkers(campaign: Campaign): PoiMarkers {
  const group = new Group();
  const owners = new Map<object, string>();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: CanvasTexture[] = [];
  const labels: Label[] = [];
  const colour = new Color();

  for (const poi of campaign.pois) {
    const marker: Marker | null = markerById(DEFAULT_MARKERS, poi.markerId);
    const base = surfaceAt(campaign, poi.cell);
    const x = poi.cell.cx * CHUNK_SIZE + poi.cell.x + 0.5;
    const z = poi.cell.cz * CHUNK_SIZE + poi.cell.z + 0.5;

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
      owners.set(mesh, poi.id);
      geometries.push(geometry);
      materials.push(material);
      tallest = Math.max(tallest, part.at[1] + part.size[1] / 2);
    }

    const name = nameLabel(poi.name);
    name.sprite.position.set(0, tallest + 0.45, 0);
    pin.add(name.sprite);
    owners.set(name.sprite, poi.id);
    textures.push(name.sprite.material.map as CanvasTexture);
    materials.push(name.sprite.material);
    labels.push(name);

    group.add(pin);
  }

  return {
    group,
    poiOf: (object) => owners.get(object) ?? null,
    scaleLabels(zoom, viewportHeightPx) {
      if (viewportHeightPx <= 0) return;
      const height = (LABEL_PIXELS / viewportHeightPx) * zoom;
      for (const entry of labels) {
        entry.sprite.scale.set(height * entry.aspect, height, 1);
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
