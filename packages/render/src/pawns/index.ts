// The party on the map: a chess pawn per member in that member's colour (D-083),
// plus the translucent ghost that shows where a move would land (R-132).
//
// Same treatment as a place marker and the same zoom threshold (R-90, R-83) — it
// differs in moving, and in being pickable on both screens.

import {
  Color, CylinderGeometry, Group, Mesh, MeshLambertMaterial, SphereGeometry,
} from 'three';
import type { BufferGeometry, Material } from 'three';
import type { Campaign, PartyMember, Placement, WorldCell } from '@tt/domain';
import { CHUNK_SIZE, pawns as pawnsOf } from '@tt/domain';
import { surfaceAt } from '../world/index.js';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { caption, dropCaption } from '../captions/index.js';

/** Which pawn was picked: a member, or the whole party travelling together. */
export interface PawnRef {
  /** null = the group pawn, i.e. the party is together (D-153). */
  readonly memberId: string | null;
}

export interface PartyPawns {
  readonly group: Group;
  pawnAt(object: object): PawnRef | null;
  /**
   * Puts the ghost on a cell, or takes it off the board.
   *
   * Called on every pointer move during the aim step, so it repositions one
   * existing mesh and never rebuilds anything.
   */
  aimAt(cell: WorldCell | null): void;
  dispose(): void;
}

const centre = (cell: WorldCell) => ({
  x: cell.cx * CHUNK_SIZE + cell.x + 0.5,
  z: cell.cz * CHUNK_SIZE + cell.z + 0.5,
});

/** A pawn: a wide foot, a waist, a head. Recognisable at a few pixels. */
function pawnGeometry(): readonly BufferGeometry[] {
  return [
    new CylinderGeometry(0.34, 0.42, 0.16, 12),
    new CylinderGeometry(0.16, 0.26, 0.34, 12),
    new SphereGeometry(0.24, 12, 10),
  ];
}
const PART_HEIGHTS = [0.08, 0.33, 0.68] as const;
/** Top of the head, for hanging a label above it. */
const PAWN_TOP = 0.92;

export function buildPartyPawns(campaign: Campaign, placement: Placement): PartyPawns {
  const group = new Group();
  const owners = new Map<object, PawnRef>();
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const captions: CSS2DObject[] = [];
  const colour = new Color();

  const byId = new Map<string, PartyMember>(campaign.party.map((m) => [m.id, m]));

  function addPawn(cell: WorldCell, ref: PawnRef, hex: string, name: string | null): void {
    const pawn = new Group();
    const { x, z } = centre(cell);
    pawn.position.set(x, surfaceAt(campaign, cell), z);
    colour.set(hex);

    for (const [index, geometry] of pawnGeometry().entries()) {
      const material = new MeshLambertMaterial({ color: colour.getHex() });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(0, PART_HEIGHTS[index]!, 0);
      pawn.add(mesh);
      owners.set(mesh, ref);
      geometries.push(geometry);
      materials.push(material);
    }

    // Only the separated pawns are named. One pawn needs no caption, and six
    // captions on a 1350 km map is soup (O-021).
    if (name) {
      // At the pawn's crown; the gap above it is the caption's padding, in
      // pixels, at every zoom (R-196).
      const label = caption(name);
      label.position.set(0, PAWN_TOP, 0);
      pawn.add(label);
      captions.push(label);
    }

    group.add(pawn);
  }

  for (const pawn of pawnsOf(placement, campaign.party)) {
    const member = pawn.memberId ? byId.get(pawn.memberId) : null;
    addPawn(
      pawn.cell,
      { memberId: pawn.memberId },
      member?.colour ?? '#e6e9ef',
      member ? member.name : null,
    );
  }

  // The ghost is built once and parked out of sight, because aiming moves the
  // pointer many times a second.
  const ghost = new Group();
  ghost.visible = false;
  for (const [index, geometry] of pawnGeometry().entries()) {
    const material = new MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, PART_HEIGHTS[index]!, 0);
    mesh.renderOrder = 5;
    ghost.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  }
  group.add(ghost);

  return {
    group,
    pawnAt: (object) => owners.get(object) ?? null,
    aimAt(cell) {
      if (!cell) {
        ghost.visible = false;
        return;
      }
      const { x, z } = centre(cell);
      ghost.position.set(x, surfaceAt(campaign, cell), z);
      ghost.visible = true;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      // The pawns are rebuilt whenever the party moves, so this leaks faster
      // than the places do if it is left out (D-289).
      for (const label of captions) dropCaption(label);
    },
  };
}
