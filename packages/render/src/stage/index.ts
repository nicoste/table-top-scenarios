// The Stage owns the canvas, the scene and the GPU resources. React hands it a
// <canvas> once and then talks to it imperatively (R-68). It never imports
// anything from an app, the protocol or the simulation.

import {
  AmbientLight, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh,
  MeshBasicMaterial, PlaneGeometry, Raycaster, Scene, Vector2, WebGLRenderer, BoxGeometry,
  EdgesGeometry, LineSegments, LineBasicMaterial, Group,
} from 'three';
import type { Campaign, Placement, WorldCell } from '@tt/domain';
import { CHUNK_SIZE, brushCentreOffset } from '@tt/domain';
import type { CameraTarget } from '../camera/index.js';
import { applyTarget, clampTarget, createCamera, defaultTarget, PITCH_STEPS, yawRadians } from '../camera/index.js';
import type { ColumnAddress, WorldMeshes } from '../world/index.js';
import { buildWorldMeshes, columnCentre, worldCentre, HEIGHT_SCALE } from '../world/index.js';
import type { PoiMarkers } from '../pois/index.js';
import { buildPoiMarkers, MARKER_ZOOM } from '../pois/index.js';
import type { PartyPawns, PawnRef } from '../pawns/index.js';
import { buildPartyPawns } from '../pawns/index.js';
import { intendedCell } from '../picking/index.js';

export interface SlotAddress { readonly cx: number; readonly cz: number }

/**
 * Everything under the pointer, resolved **independently** (R-87c).
 *
 * There is no precedence here on purpose. `render` reports what is there and the
 * active tool decides what it meant — a paint stroke wants the cell even when a
 * pawn or a marker is standing on it, and it used to get `null` because a marker
 * hit ended the search.
 */
export interface Picked {
  readonly pawn: PawnRef | null;
  readonly poiId: string | null;
  /** The cell, whatever is standing on it. */
  readonly column: ColumnAddress | null;
  /** An empty neighbouring slot where a chunk could be created. */
  readonly slot: SlotAddress | null;
}

let instances = 0;

export class Stage {
  /** How many Stages are alive. A leak means a leaked rAF loop and GL context. */
  static get liveCount(): number { return instances; }

  readonly id = ++instances;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = createCamera();
  private readonly raycaster = new Raycaster();
  private readonly highlight: LineSegments;
  private readonly slots = new Group();
  private world: WorldMeshes | null = null;
  private pois: PoiMarkers | null = null;
  private pawns: PartyPawns | null = null;
  /** Held because pawns are rebuilt on their own schedule, not the world's. */
  private campaign: Campaign | null = null;
  private placement: Placement | null = null;
  private grid: GridHelper | null = null;
  private slotMeshes: { mesh: Mesh; coord: SlotAddress }[] = [];
  private fogMeshes: Mesh[] = [];
  private readonly fog = new Group();
  private target: CameraTarget = defaultTarget();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene.background = new Color('#0f1216');

    this.scene.add(
      new HemisphereLight(0xcfe4ff, 0x2a2f38, 0.9),
      new AmbientLight(0x4a5266, 0.4),
    );
    const key = new DirectionalLight(0xfff6e8, 1.1);
    key.position.set(60, 120, 40);
    this.scene.add(key);

    // The snapped hover highlight, shared by both tools (R-87).
    this.highlight = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.02, 1.02, 1.02)),
      new LineBasicMaterial({ color: 0x8ecbff, depthTest: false }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 10;
    this.scene.add(this.highlight, this.slots, this.fog);

    this.resize();
  }

  setCampaign(campaign: Campaign | null, recentre = false): void {
    if (this.world) { this.scene.remove(this.world.mesh); this.world.dispose(); this.world = null; }
    if (this.pois) { this.scene.remove(this.pois.group); this.pois.dispose(); this.pois = null; }
    this.dropPawns();
    this.campaign = campaign;
    if (!campaign) this.setFogChunks([]);
    for (const { mesh } of this.slotMeshes) {
      this.slots.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.slotMeshes = [];
    if (this.grid) { this.scene.remove(this.grid); this.grid.dispose(); this.grid = null; }
    if (!campaign) return;

    this.world = buildWorldMeshes(campaign);
    this.scene.add(this.world.mesh);

    this.pois = buildPoiMarkers(campaign);
    this.scene.add(this.pois.group);

    this.campaign = campaign;
    this.rebuildPawns();

    const centre = worldCentre(campaign.world);
    this.grid = new GridHelper(CHUNK_SIZE * 24, 24, 0x2a3140, 0x1b2028);
    this.grid.position.set(centre.x, 0.01, centre.z);
    this.scene.add(this.grid);

    if (recentre) this.target = { ...this.target, focus: centre };
  }

  private dropPawns(): void {
    if (!this.pawns) return;
    this.scene.remove(this.pawns.group);
    this.pawns.dispose();
    this.pawns = null;
  }

  private rebuildPawns(): void {
    this.dropPawns();
    if (!this.campaign || !this.placement) return;
    this.pawns = buildPartyPawns(this.campaign, this.placement);
    this.scene.add(this.pawns.group);
  }

  /**
   * Where the party is standing.
   *
   * Separate from `setCampaign` because the party moves far more often than the
   * world changes, and rebuilding terrain to move a pawn would be absurd — the
   * same reason geometry and play state travel on separate channels (R-19a).
   */
  setPlacement(placement: Placement | null): void {
    this.placement = placement;
    this.rebuildPawns();
  }

  /** Puts the travel ghost on a cell, or takes it off (R-132). */
  aimAt(cell: WorldCell | null): void {
    this.pawns?.aimAt(cell);
  }

  /**
   * Chunks the party cannot see, drawn as flat dark tiles.
   *
   * One mechanism, two readings. On the **table display** these are R-16's
   * featureless placeholders: the party learns a chunk is there and nothing
   * else. On the **GM console** the same tiles are a fog overlay showing what
   * the players are missing. Both mean "not visible to the party", so they look
   * the same on purpose.
   */
  setFogChunks(coords: readonly SlotAddress[]): void {
    for (const mesh of this.fogMeshes) {
      this.fog.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.fogMeshes = coords.map((coord) => {
      const mesh = new Mesh(
        new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
        new MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.72 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      // Just above the grid but below the `+` slots, so a creatable slot still reads.
      mesh.position.set((coord.cx + 0.5) * CHUNK_SIZE, 0.04, (coord.cz + 0.5) * CHUNK_SIZE);
      mesh.renderOrder = 1;
      this.fog.add(mesh);
      return mesh;
    });
  }

  /** The `+` slots the GM may create a chunk in (R-79). GM console only. */
  setSlots(slots: readonly SlotAddress[]): void {
    for (const { mesh } of this.slotMeshes) {
      this.slots.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.slotMeshes = slots.map((coord) => {
      const mesh = new Mesh(
        new PlaneGeometry(CHUNK_SIZE - 1.5, CHUNK_SIZE - 1.5),
        new MeshBasicMaterial({ color: 0x3d7dbd, transparent: true, opacity: 0.22 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((coord.cx + 0.5) * CHUNK_SIZE, 0.06, (coord.cz + 0.5) * CHUNK_SIZE);
      this.slots.add(mesh);
      return { mesh, coord };
    });
  }

  setTarget(target: CameraTarget): void { this.target = clampTarget(target); }
  getTarget(): CameraTarget { return this.target; }

  nudgeZoom(factor: number): void {
    this.setTarget({ ...this.target, zoom: this.target.zoom * factor });
  }
  rotate(steps: number): void {
    this.setTarget({ ...this.target, yawStep: this.target.yawStep + steps });
  }
  tilt(steps: number): void {
    this.setTarget({ ...this.target, pitchStep: this.target.pitchStep + steps });
  }
  pan(dxScreen: number, dyScreen: number): void {
    // Pan in the camera's own screen plane, projected onto the ground.
    const scale = this.target.zoom / this.canvas.clientHeight;
    const yaw = yawRadians(this.target);
    const pitch = ((PITCH_STEPS[this.target.pitchStep] ?? 45) * Math.PI) / 180;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const forward = { x: Math.sin(yaw) / Math.sin(pitch), z: Math.cos(yaw) / Math.sin(pitch) };
    this.setTarget({
      ...this.target,
      focus: {
        x: this.target.focus.x - (dxScreen * right.x + dyScreen * forward.x) * scale,
        y: this.target.focus.y,
        z: this.target.focus.z - (dxScreen * right.z + dyScreen * forward.z) * scale,
      },
    });
  }

  private aspect(): number {
    return (this.canvas.clientWidth || 1) / (this.canvas.clientHeight || 1);
  }

  /**
   * Puts the camera where the target says, and makes its world matrix current.
   *
   * Both `render` and `pick` do this. Picking must never depend on a frame
   * having been drawn first: `requestAnimationFrame` does not fire while the tab
   * or pane is hidden, so a pick could otherwise raycast through a camera left
   * at a stale position and silently return the wrong cell — or none at all.
   */
  private syncCamera(): void {
    applyTarget(this.camera, this.target, this.aspect());
    this.camera.updateMatrixWorld();
  }

  /** What is under the pointer: a column, an empty chunk slot, or neither. */
  pick(clientX: number, clientY: number): Picked {
    this.syncCamera();
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    let pawn: PawnRef | null = null;
    if (this.pawns && this.pawns.group.visible) {
      for (const hit of this.raycaster.intersectObjects(this.pawns.group.children, true)) {
        pawn = this.pawns.pawnAt(hit.object);
        if (pawn) break;
      }
    }

    let poiId: string | null = null;
    if (this.pois && this.pois.group.visible) {
      for (const hit of this.raycaster.intersectObjects(this.pois.group.children, true)) {
        poiId = this.pois.poiOf(hit.object);
        if (poiId) break;
      }
    }

    let rayCell: WorldCell | null = null;
    if (this.world) {
      const hit = this.raycaster.intersectObject(this.world.mesh, false)[0];
      if (hit && hit.instanceId !== undefined) rayCell = this.world.addressOf(hit.instanceId);
    }
    // Which cell that *meant* is a rule, and it lives in `picking` where it can
    // be tested without a GL context (R-87c, D-163).
    const column = intendedCell({ pawn, poiId, rayCell }, this.campaign, this.placement);

    let slot: SlotAddress | null = null;
    if (!column) {
      for (const { mesh, coord } of this.slotMeshes) {
        if (this.raycaster.intersectObject(mesh, false).length > 0) { slot = coord; break; }
      }
    }

    return { pawn, poiId, column, slot };
  }

  /**
   * The snapped hover highlight (R-87), sized to the brush footprint so what you
   * are about to change is what is outlined.
   */
  showHighlight(address: ColumnAddress | null, height: number, size = 1): void {
    if (!address) { this.highlight.visible = false; return; }
    const n = Math.max(1, Math.round(size));
    const centre = columnCentre(address);
    const top = height <= 0 ? 0.25 : height * HEIGHT_SCALE;
    // Even brushes extend forward from the anchor, so the outline's centre is
    // offset by half a cell. The offset comes from domain so it cannot drift
    // from what brushCells actually edits.
    const offset = brushCentreOffset(n);
    this.highlight.visible = true;
    this.highlight.position.set(centre.x + offset, top / 2, centre.z + offset);
    this.highlight.scale.set(n, Math.max(top, 0.25), n);
  }

  resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
  }

  render(): void {
    this.syncCamera();
    // Markers and their names share one threshold and toggle together (R-83).
    if (this.pois) {
      this.pois.group.visible = this.target.zoom <= MARKER_ZOOM;
      if (this.pois.group.visible) {
        this.pois.scaleLabels(this.target.zoom, this.canvas.clientHeight || 1);
      }
    }
    // The party shares the threshold, so pawns and places come and go together.
    if (this.pawns) {
      this.pawns.group.visible = this.target.zoom <= MARKER_ZOOM;
      if (this.pawns.group.visible) {
        this.pawns.scaleLabels(this.target.zoom, this.canvas.clientHeight || 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    instances--;
    this.setFogChunks([]);
    this.pawns?.dispose();
    this.pois?.dispose();
    this.world?.dispose();
    this.renderer.dispose();
  }
}
