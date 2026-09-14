// The world as columns. One InstancedMesh for every column in every known
// chunk, coloured by terrain, so a repaint is an attribute write rather than a
// rebuild (the same reasoning as R-69/R-70).

import {
  BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshLambertMaterial,
  Object3D, Vector3,
} from 'three';
import type { Campaign, Chunk, World, WorldCell } from '@tt/domain';
import { CHUNK_SIZE, MAX_HEIGHT, DEFAULT_TERRAIN, chunkAt, columnAt, terrainById } from '@tt/domain';

/**
 * Vertical exaggeration, in cell widths per height level.
 *
 * True scale would be 200 m of elevation over a 1500 m cell = 0.133, which makes
 * a 4 km mountain range read as a gentle swell from a god view. 0.6 is roughly a
 * 4.5x exaggeration — the same liberty printed relief maps take, and for the same
 * reason. It is a legibility choice, not a measurement.
 */
export const HEIGHT_SCALE = 0.6;
/** Water and bare sea floor still need a visible slab. */
const SEA_SLAB = 0.25;

export interface ColumnAddress {
  readonly cx: number;
  readonly cz: number;
  readonly x: number;
  readonly z: number;
}

export interface WorldMeshes {
  readonly mesh: InstancedMesh;
  /** instanceId -> which column, for picking. */
  addressOf(instanceId: number): ColumnAddress | null;
  dispose(): void;
}

/** World-space centre of a column, in cells. */
export function columnCentre(address: ColumnAddress): Vector3 {
  return new Vector3(
    address.cx * CHUNK_SIZE + address.x + 0.5,
    0,
    address.cz * CHUNK_SIZE + address.z + 0.5,
  );
}

function columnTop(height: number): number {
  return height <= 0 ? SEA_SLAB : height * HEIGHT_SCALE;
}

/**
 * The height anything standing on a cell should sit at — markers, pawns, a
 * travel ghost. One definition, so a pawn never floats above the ground a place
 * on the same cell is planted in.
 */
export function surfaceAt(campaign: Campaign, cell: WorldCell): number {
  const chunk = chunkAt(campaign.world, { cx: cell.cx, cz: cell.cz });
  const column = chunk ? columnAt(chunk, cell.x, cell.z) : null;
  return columnTop(column?.height ?? 0);
}

export function buildWorldMeshes(campaign: Campaign): WorldMeshes {
  const world: World = campaign.world;
  const chunks = [...world.chunks.values()];
  const count = Math.max(1, chunks.length * CHUNK_SIZE * CHUNK_SIZE);

  const mesh = new InstancedMesh(
    new BoxGeometry(1, 1, 1),
    new MeshLambertMaterial({ color: 0xffffff }),
    count,
  );
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;

  const addresses: ColumnAddress[] = [];
  const dummy = new Object3D();
  const matrix = new Matrix4();
  const colour = new Color();
  let i = 0;

  for (const chunk of chunks) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const column = columnAt(chunk, x, z);
        if (!column) continue;
        const address: ColumnAddress = { cx: chunk.coord.cx, cz: chunk.coord.cz, x, z };
        const top = columnTop(column.height);
        const centre = columnCentre(address);

        dummy.position.set(centre.x, top / 2, centre.z);
        dummy.scale.set(1, top, 1);
        dummy.updateMatrix();
        matrix.copy(dummy.matrix);
        mesh.setMatrixAt(i, matrix);

        const terrain = terrainById(DEFAULT_TERRAIN, column.terrainId);
        colour.set(terrain?.colour ?? '#888888');
        // Cheap depth cue: higher ground reads lighter (R-34 territory).
        if (column.height > 0) colour.multiplyScalar(0.82 + (Math.min(column.height, MAX_HEIGHT) / MAX_HEIGHT) * 0.24);
        mesh.setColorAt(i, colour);

        addresses.push(address);
        i++;
      }
    }
  }

  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh,
    addressOf: (instanceId) => addresses[instanceId] ?? null,
    dispose() {
      mesh.geometry.dispose();
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      mesh.dispose();
    },
  };
}

/** Where the camera should look when a campaign opens: the middle of its land. */
export function worldCentre(world: World): { x: number; y: number; z: number } {
  const chunks = [...world.chunks.values()];
  if (chunks.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = chunks.reduce(
    (acc: { x: number; z: number }, c: Chunk) => ({ x: acc.x + c.coord.cx, z: acc.z + c.coord.cz }),
    { x: 0, z: 0 },
  );
  return {
    x: (sum.x / chunks.length + 0.5) * CHUNK_SIZE,
    y: 0,
    z: (sum.z / chunks.length + 0.5) * CHUNK_SIZE,
  };
}
