// The Stage owns the canvas, the scene and the GPU resources. React hands it a
// <canvas> once and then talks to it imperatively (R-68). It never imports
// anything from an app, the protocol or the simulation.

import {
  AmbientLight, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, PCFSoftShadowMap,
  Vector3,
  MeshBasicMaterial, PlaneGeometry, Raycaster, Scene, Vector2, WebGLRenderer, BoxGeometry,
  WebGLRenderTarget, HalfFloatType, MathUtils,
  EdgesGeometry, LineSegments, LineBasicMaterial, Group,
} from 'three';
import type {
  BlockCoord, Campaign, EncounterMap, Material, Placement, WorldCell,
} from '@tt/domain';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CHUNK_SIZE, brushCentreOffset, mapCentre } from '@tt/domain';
import type { CameraTarget } from '../camera/index.js';
import {
  approach, clampTarget, createCamera, defaultTarget, nearestAngle, northBearing,
  PITCH_STEPS, pitchDegrees, placeCamera, yawDegrees, yawRadians,
} from '../camera/index.js';
import { surfaceMove, showWorldMarkers } from '../surface/index.js';
import type { ColumnAddress, WorldMeshes } from '../world/index.js';
import { buildWorldMeshes, columnCentre, worldCentre, HEIGHT_SCALE } from '../world/index.js';
import type { PlaceMarkers } from '../places/index.js';
import { buildPlaceMarkers, MARKER_ZOOM } from '../places/index.js';
import type { PartyPawns, PawnRef } from '../pawns/index.js';
import { buildPartyPawns } from '../pawns/index.js';
import type { BlockBody, FacePick } from '../blocks/index.js';
import { buildBlockBody } from '../blocks/index.js';
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
  /**
   * The block face under the pointer, when a map is open (R-147). Carries both
   * the block hit and the empty cell against that face, so placing and erasing
   * read from one pick.
   */
  readonly face: FacePick | null;
  readonly pawn: PawnRef | null;
  readonly placeId: string | null;
  /** The cell, whatever is standing on it. */
  readonly column: ColumnAddress | null;
  /** An empty neighbouring slot where a chunk could be created. */
  readonly slot: SlotAddress | null;
}

let instances = 0;

/**
 * How often a screen redraws at most (R-169).
 *
 * Thirty, deliberately. This is a map on a table, not a shooter: nothing in it
 * moves except a camera easing between four fixed angles, and a 120 Hz display
 * was costing four times the GPU to show the same still picture. The GM's
 * laptop runs this all session and the table's box may be a modest one.
 *
 * Three.js has no frame limiter — `setAnimationLoop` takes no rate — so the
 * cap lives in the loop that calls `render`, which is the app's.
 *
 * **The slop matters.** Frames arrive on the display's clock, so a budget of
 * exactly 33.3 ms on a 120 Hz panel is missed by the tick at 33.3 and waits
 * for the one at 41.6 — which is 24 fps, not 30. A couple of milliseconds of
 * tolerance lands it on the right tick at 60, 120 and 144.
 */
export const FRAME_BUDGET_MS = 1000 / 30;
export const FRAME_SLOP_MS = 2;

/**
 * How long a still screen may go without redrawing anyway (R-170).
 *
 * A safety net, not the mechanism: everything that changes the picture says so
 * (`invalidate`), and this only catches the one that forgets. Half a second is
 * chosen to be *noticeable* if it ever fires — a stale screen that heals in
 * 500 ms is a bug somebody reports, where one that heals in 30 ms is a bug
 * nobody finds.
 */
export const IDLE_HEARTBEAT_MS = 500;

/**
 * How far occlusion reaches, in device pixels (R-175).
 *
 * Tuned by eye against the old world-space radius of 0.8 cubes, which is
 * about 15 pixels with a map framed — so framed looks the same as it did and
 * only the close-up changed.
 */
const OCCLUSION_RADIUS_PX = 15;


/** What `Stage.cost()` reports (R-166). */
export interface StageCost {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  /** Milliseconds the last map body took to build. */
  readonly rebuildMs: number;
  /** How many cubes are drawn, or zero outside a map. */
  readonly blocks: number;
  /** Milliseconds the GPU spent on a recent frame, or null where unavailable. */
  readonly gpuMs: number | null;
}

export class Stage {
  /** How many Stages are alive. A leak means a leaked rAF loop and GL context. */
  static get liveCount(): number { return instances; }

  readonly id = ++instances;
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly occlusion: GTAOPass;
  private readonly key: DirectionalLight;
  /**
   * Where the sun is, as a **direction**, kept apart from the light's position.
   *
   * A directional light has no place, only a bearing — but three.js takes the
   * bearing from `position`, and the shadow camera has to be *moved* to sit
   * over whatever surface is open. Deriving the direction back out of that
   * position is what the first version did, and since the position by then
   * included the surface's centre, every refit rotated the sun somewhere new.
   * `setMap` runs on every edit, so the sun wandered off with the building
   * (D-248).
   */
  private readonly sun = new Vector3(90, 70, -60).normalize();
  /** Set by anything that moves geometry; cleared by the frame that redraws the map. */
  private shadowsStale = true;
  /** Off until a screen is shown to afford it (R-168, D-225). */
  /** Whether materials draw the figure in their surface (R-177). */
  private figuring = true;
  private occluding = false;
  private readonly scene = new Scene();
  private readonly camera = createCamera();
  private readonly raycaster = new Raycaster();
  private readonly highlight: LineSegments;
  /** The outline of the cube a click would add or remove (R-153). */
  private readonly blockGhost: LineSegments;
  /** How long the last map body took to build — the usual cause of a hitch. */
  private rebuildMs = 0;
  /*
   * Nothing in this scene moves on its own (R-170). A map on a table is still
   * for minutes at a time while the GM looks at it and talks, and redrawing an
   * identical picture thirty times a second is the whole of what was making a
   * laptop warm. So a frame is drawn when something has changed, when the
   * camera is still easing, or when the heartbeat says it has been too long.
   */
  private dirty = true;
  private lastDrawn = 0;
  /*
   * GPU time, which is the number the overlay was missing and the reason a
   * fan noticed what the panel could not (D-226). `requestAnimationFrame` is
   * locked to the display, so frame time reports *lateness*, never *load*: a
   * card doing four times the work reads the same until it drops a frame.
   *
   * Measured with a timer query, which browsers expose grudgingly — it is
   * absent on plenty of configurations and returns nothing on others. Null
   * throughout when it is unavailable, rather than a number that is wrong.
   */
  private readonly timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery | null = null;
  private gpuMs: number | null = null;
  private readonly slots = new Group();
  private world: WorldMeshes | null = null;
  private places: PlaceMarkers | null = null;
  private pawns: PartyPawns | null = null;
  /** Held because pawns are rebuilt on their own schedule, not the world's. */
  private campaign: Campaign | null = null;
  private placement: Placement | null = null;
  private grid: GridHelper | null = null;
  private slotMeshes: { mesh: Mesh; coord: SlotAddress }[] = [];
  private fogMeshes: Mesh[] = [];
  private readonly fog = new Group();
  /**
   * The encounter map, when one is open. Mutually exclusive with the world
   * (R-148): a surface is either the world or a map, never both, so opening one
   * hides the other's groups rather than layering them.
   */
  private blocks: BlockBody | null = null;
  /**
   * Which surface is on screen: `null` for the world, otherwise a map's key.
   * Compared against the key `setMap` is handed, so the camera reacts to a
   * change of surface and not to a change of body (R-152).
   */
  private surface: string | null = null;
  /**
   * The world's framing, parked while a map is open.
   *
   * Without it, leaving a map left the camera at the map's centre and its zoom,
   * which in world coordinates is empty space hundreds of cells from the place
   * the GM had been looking at — the world was still drawn, just nowhere near.
   */
  private parked: CameraTarget | null = null;
  private target: CameraTarget = defaultTarget();
  /**
   * Told whenever the camera moves, so an overlay can follow it (R-155).
   *
   * A callback rather than a getter the app polls: the compass must be right
   * after a rotate, a map framing and a return to the world, and three of those
   * happen inside this class without the app asking for anything.
   */
  private onCamera: ((bearing: number) => void) | null = null;
  /**
   * Where the camera actually points, easing toward the target's angles (R-156).
   *
   * Separate from `target` because a stepped target is where the GM asked to be
   * and this is where the camera has got to. Only the two angles are eased:
   * focus follows a drag and must not lag behind the hand, and zoom already
   * arrives in small multiplicative steps.
   */
  private live = { yawDeg: yawDegrees(defaultTarget()), pitchDeg: pitchDegrees(defaultTarget()) };
  /** Last frame's timestamp, so the easing is in seconds and not in frames. */
  private lastFrame = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    /*
     * Shadows, **never updated on their own** (R-180).
     *
     * A shadow map is one extra pass over the scene, and three.js redraws it
     * every frame unless told otherwise. Nothing in this scene moves by
     * itself: the sun is where the GM left it and the geometry changes when a
     * cube is placed, so the map is redrawn on those events and on no others —
     * which is R-170's trade one level down. Idle, it costs nothing at all.
     *
     * `PCFSoft` rather than VSM: softer edges are not worth light leaking
     * through a wall in a scene made entirely of walls.
     */
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    /*
     * Counted across the whole frame, not per pass (D-226).
     *
     * `info` resets itself before each render by default, so once a composer
     * is in the path the only numbers left at the end are the last pass's —
     * a full-screen quad. The panel duly reported one draw call and one
     * triangle for a scene of 9,714 cubes, which is worse than reporting
     * nothing: it looked like occlusion had made the scene cheaper.
     */
    this.renderer.info.autoReset = false;
    const gl = this.renderer.getContext();
    this.timer = 'createQuery' in gl
      ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.timer)
      : null;
    this.scene.background = new Color('#0f1216');

    /*
     * **Rebalanced for a world that casts shadows** (R-180).
     *
     * This was a hemisphere at 0.9 and an ambient at 0.4 against a key of 1.1,
     * which is a sensible rig for a scene where nothing casts: plenty of fill
     * so no face is ever unreadably dark. Switch shadows on under it and a
     * shadowed surface still collects more than half its light from the sky,
     * so the shadow is a dimming you have to be told about.
     *
     * That cost an afternoon. The shadows were working from the first build —
     * the sun was moved twice and the frustum refitted on the theory that they
     * were falling out of view, and all of it was invisible for the same
     * reason (D-248). Fill is now a third of what it was and the key is nearly
     * double, which leaves a shadowed cube at about a quarter of a lit one:
     * plainly darker, and still a cube you can build with.
     */
    this.scene.add(
      new HemisphereLight(0xcfe4ff, 0x2a2f38, 0.4),
      new AmbientLight(0x4a5266, 0.12),
    );
    this.key = new DirectionalLight(0xfff6e8, 1.9);
    /*
     * **Chosen so the shadows land where they can be seen** (R-180).
     *
     * It used to sit at (60, 120, 40), which shades the visible faces nicely
     * and throws every shadow up the screen, directly behind the thing casting
     * it — invisible at the camera a campaign opens on, which is the only
     * camera most scenes are ever looked at from. That cost nothing while
     * nothing cast a shadow, and was the first thing switching them on
     * revealed (D-248).
     *
     * `-Z` climbs to the upper right on this camera and `+X` falls to the
     * lower right (R-31), so a light over the far side throws shadows down and
     * left, across ground the viewer is looking at, while still lighting the
     * two faces that are towards them.
     *
     * **And it is a low sun, about 33° up.** At the old elevation of nearly
     * 60° a shadow is 0.6 of its caster's height, so a keep twenty cells wide
     * and nine tall threw its shadow almost entirely onto its own footprint,
     * underneath itself. Late afternoon is the hour at which a building looks
     * like a building.
     */
    this.key.position.copy(this.sun);
    this.key.castShadow = true;
    /*
     * A thousand square is plenty, because the *frustum* is what buys
     * sharpness and this one is fitted to the surface on screen (R-148 says
     * there is only ever one). A shadow camera sized to the whole world would
     * spend most of its texels on ground nobody is looking at.
     */
    this.key.shadow.mapSize.set(1024, 1024);
    /*
     * Bias along the normal rather than along the view. Every face here is
     * axis-aligned and a cube's own top is the surface most likely to shade
     * itself; a flat depth bias fixes that by sliding the shadow off the thing
     * casting it, which is worse (D-248).
     */
    this.key.shadow.normalBias = 0.05;
    this.scene.add(this.key, this.key.target);

    // The snapped hover highlight, shared by both tools (R-87).
    this.highlight = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.02, 1.02, 1.02)),
      new LineBasicMaterial({ color: 0x8ecbff, depthTest: false }),
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 10;

    // The same idea one surface down, and a unit box so that `showBlockGhost`
    // can scale it to a brush's patch rather than rebuild its geometry. White
    // by default, because inside a map it is the *only* thing outlined and it
    // marks cubes that are not there yet (R-153, R-162).
    this.blockGhost = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.02, 1.02, 1.02)),
      new LineBasicMaterial({ color: 0xffffff, depthTest: false }),
    );
    this.blockGhost.visible = false;
    this.blockGhost.renderOrder = 11;

    this.scene.add(this.highlight, this.blockGhost, this.slots, this.fog);

    /*
     * Ambient occlusion, as a post-process (R-168).
     *
     * Three.js ships this — `GTAOPass` — and the alternative was meshing every
     * body by hand to bake darkness into vertex colours, plus rewriting how a
     * click resolves to a cube. This touches neither: it works from depth and
     * normals, so it shades the world's terrain as well as a map's cubes, and
     * nothing about the geometry or the picking changes.
     *
     * The cost moves from build time to **every frame**, which is the part
     * worth watching rather than assuming — see `cost()` and R-166. It is
     * **off by default**: the GM's console runs all session on a laptop, and
     * the first thing this did on one was warm it up (D-225).
     *
     * The render target is **multisampled on purpose.** A composer draws into
     * its own buffer, where the renderer's `antialias` does nothing, and the
     * default target has no samples — so wiring this up naively trades soft
     * corners for hard jagged edges on every cube, which is a bad swap.
     */
    this.composer = new EffectComposer(
      this.renderer,
      new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 }),
    );
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.occlusion = new GTAOPass(this.scene, this.camera, 1, 1);
    /*
     * **The radius is in pixels, not in cubes** (R-175).
     *
     * It was 0.8 world units — near a cube's width, which is what makes a
     * corner look like a corner, and the obviously right answer: occlusion is
     * a fact about geometry and should not care where the camera is.
     *
     * It costs what its *footprint* costs. A world radius covers more pixels
     * the closer the camera comes, and the pass went from 10.5 ms with the
     * church framed to 30.7 ms zoomed in — a 33 ms frame with nothing else in
     * it, worst exactly when the GM is close in placing cubes (D-240).
     *
     * `screenSpaceRadius` reads `radius` in hundreds of pixels instead, so
     * the footprint and the cost are the same at every zoom. What it gives up
     * is world-correctness: zoomed out the shading reaches further in world
     * terms than it should, zoomed in less. At a table nobody is checking
     * that — they are reading depth off the corners, and the corners are
     * drawn at every zoom now.
     */
    this.occlusion.updateGtaoMaterial({
      radius: OCCLUSION_RADIUS_PX / 100,
      screenSpaceRadius: true,
      scale: 1,
      thickness: 1,
    });
    this.composer.addPass(this.occlusion);
    // Last, because the composer works in half-float and somebody has to put
    // it back into the colour space the canvas expects.
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  setCampaign(campaign: Campaign | null, recentre = false): void {
    this.invalidate();
    if (this.world) { this.scene.remove(this.world.mesh); this.world.dispose(); this.world = null; }
    if (this.places) { this.scene.remove(this.places.group); this.places.dispose(); this.places = null; }
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
    this.world.mesh.castShadow = true;
    this.world.mesh.receiveShadow = true;
    this.scene.add(this.world.mesh);
    if (!this.showingMap) this.fitShadows(CHUNK_SIZE * 3, worldCentre(campaign.world));

    this.places = buildPlaceMarkers(campaign);
    this.scene.add(this.places.group);

    this.campaign = campaign;
    this.rebuildPawns();

    const centre = worldCentre(campaign.world);
    this.grid = new GridHelper(CHUNK_SIZE * 24, 24, 0x2a3140, 0x1b2028);
    this.grid.position.set(centre.x, 0.01, centre.z);
    this.scene.add(this.grid);

    if (recentre) this.setTarget({ ...this.target, focus: centre });

    // Everything above is freshly built and therefore visible. If a map is the
    // surface, it must not be.
    this.applySurface();
  }

  /**
   * Hides everything the world owns while a map is the surface (R-148).
   *
   * Called from every path that *rebuilds* one of these groups, not just from
   * `setMap`. A rebuilt group is a new Object3D with `visible` true, so
   * `setCampaign` and `rebuildPawns` used to put the world's terrain, grid,
   * markers and pawns back on screen inside an open map. That it looked fine
   * was an accident of effect ordering — the console happened to run its
   * campaign effect before its map effect, so `setMap` undid the damage in the
   * same commit. Ordering is not a rule, and this is (D-191).
   */
  private applySurface(): void {
    const worldVisible = !this.showingMap;
    if (this.world) this.world.mesh.visible = worldVisible;
    if (this.places) this.places.group.visible = worldVisible;
    if (this.pawns) this.pawns.group.visible = worldVisible;
    this.slots.visible = worldVisible;
    this.fog.visible = worldVisible;
    if (this.grid) this.grid.visible = worldVisible;
    // Always off: the next pointer move puts it back where it belongs, and an
    // outline left over from the surface before is worse than none.
    this.blockGhost.visible = false;
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
    this.applySurface();
  }

  /**
   * Where the party is standing.
   *
   * Separate from `setCampaign` because the party moves far more often than the
   * world changes, and rebuilding terrain to move a pawn would be absurd — the
   * same reason geometry and play state travel on separate channels (R-19a).
   */
  setPlacement(placement: Placement | null): void {
    this.invalidate();
    this.placement = placement;
    this.rebuildPawns();
  }

  /**
   * Opens an encounter map, or closes it and returns to the world.
   *
   * The world's groups are hidden rather than torn down, so leaving a map does
   * not pay to rebuild terrain the GM has not touched. A surface is one or the
   * other, never both (R-148).
   *
   * `key` identifies the *surface*, not the body. The body arrives new on every
   * render, so keying the camera on it re-framed the map for every block placed
   * (R-152). Pass the same key while the same map is open.
   *
   * Whatever body it is handed is drawn in full. Cutting is the caller's job:
   * the console hands over a slice while the GM is levelling, and the table was
   * only ever sent one (R-159). A dimmed block is still clickable, which is how
   * a GM ends up editing something they cannot see — so there is no dimming.
   */
  setMap(
    map: EncounterMap | null,
    materials: readonly Material[],
    key: string | null = null,
  ): void {
    this.invalidate();
    if (this.blocks) {
      this.scene.remove(this.blocks.group);
      this.blocks.dispose();
      this.blocks = null;
    }

    const next = map ? key : null;
    const move = surfaceMove(this.surface, next);
    this.surface = next;

    if (map) {
      const begun = performance.now();
      this.blocks = buildBlockBody(map, materials);
      this.rebuildMs = performance.now() - begun;
      // A body is rebuilt on every edit, so the switch has to be re-applied to
      // the new materials or placing one cube would turn the figures back on.
      this.blocks.setFigures(this.figuring);
      for (const mesh of this.blocks.group.children) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      this.scene.add(this.blocks.group);
      // A map is tens of cells across; the world is hundreds (R-148).
      this.fitShadows(Math.max(map.size.x, map.size.z), mapCentre(map));
    }
    this.applySurface();

    if (move === 'frame' && map) {
      // A map is tens of cells where the world is hundreds, so the world's zoom
      // would frame it as a speck. Fit the footprint with a margin — and park
      // the world's framing first, so leaving puts the GM back where they were.
      this.parked ??= this.target;
      const middle = mapCentre(map);
      const centre = { x: middle.x, y: 0, z: middle.z };
      const zoom = Math.max(map.size.x, map.size.z) * 1.6;
      this.setTarget({ ...defaultTarget(centre), zoom });
    } else if (move === 'restore') {
      if (this.parked) this.setTarget(this.parked);
      this.parked = null;
    }
  }

  /** Whether a map is currently the surface, rather than the world. */
  get showingMap(): boolean {
    return this.blocks !== null;
  }

  /** Puts the travel ghost on a cell, or takes it off (R-132). */
  aimAt(cell: WorldCell | null): void {
    this.invalidate();
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
    this.invalidate();
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
    this.invalidate();
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

  setTarget(target: CameraTarget): void {
    this.invalidate();
    this.target = clampTarget(target);
  }

  /**
   * Subscribes to where north is, and fires once immediately so the caller
   * starts in sync rather than a turn behind. Pass `null` to unsubscribe.
   *
   * The *live* bearing, not the target's: during a turn it arrives once per
   * frame, so a compass drawn from it moves with the world instead of snapping
   * ahead of it (R-155, R-156).
   */
  watchCamera(cb: ((bearing: number) => void) | null): void {
    this.onCamera = cb;
    cb?.(northBearing(this.live.yawDeg));
  }
  getTarget(): CameraTarget { return this.target; }

  nudgeZoom(factor: number): void {
    this.invalidate();
    this.setTarget({ ...this.target, zoom: this.target.zoom * factor });
  }
  rotate(steps: number): void {
    this.invalidate();
    this.setTarget({ ...this.target, yawStep: this.target.yawStep + steps });
  }
  tilt(steps: number): void {
    this.invalidate();
    this.setTarget({ ...this.target, pitchStep: this.target.pitchStep + steps });
  }
  pan(dxScreen: number, dyScreen: number): void {
    this.invalidate();
    // Pan in the camera's own screen plane, projected onto the ground.
    const scale = this.target.zoom / this.canvas.clientHeight;
    const yaw = yawRadians(this.target);
    const pitch = MathUtils.degToRad(PITCH_STEPS[this.target.pitchStep] ?? 45);
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
   * Moves the camera toward the angles the target asks for (R-156).
   *
   * Called from `render` and nowhere else. `pick` must not advance it: a pick
   * can happen many times between frames, and feeding it a made-up `dt` would
   * make the turn's speed depend on how much the pointer moved.
   */
  /**
   * Says the picture has changed and a frame is owed (R-170).
   *
   * Public as well as internal, because a caller may change something the
   * stage cannot see — and an extra frame costs nothing while a missed one is
   * a screen that lies.
   */
  invalidate(): void {
    this.dirty = true;
  }

  /**
   * The shadow map is out of date, because something it was drawn from moved.
   *
   * Separate from `invalidate` on purpose: turning the camera owes a *frame*
   * and owes nothing to the shadows, because a directional light's shadow
   * camera is fixed to the scene and not to the view. Conflating the two would
   * have redrawn the shadow map on every mouse move (R-180).
   */
  private restage(): void {
    this.shadowsStale = true;
    this.invalidate();
  }

  /**
   * Fits the shadow camera to what is on screen.
   *
   * Sharpness is the frustum, not the resolution: 1024 texels across a map's
   * 96 cells is eleven to a cube, and the same 1024 across the whole world
   * would be one to a chunk. Only one surface is ever shown (R-148), so the
   * box can be refitted whenever that changes.
   */
  private fitShadows(span: number, centre: { x: number; z: number }): void {
    // A map rotated 45° to the shadow camera is 1.41 times its own width, and
    // a low sun pushes its shadows further still — so the box is the footprint
    // with room, not the footprint.
    const reach = Math.max(span, 8) * 0.85;
    const shadow = this.key.shadow.camera;
    shadow.left = -reach;
    shadow.right = reach;
    shadow.top = reach;
    shadow.bottom = -reach;
    shadow.near = 1;
    shadow.far = reach * 6;
    shadow.updateProjectionMatrix();
    // The light is a *direction*; its position only has to be far enough back
    // that the near plane clears the tallest thing in the scene. Read from
    // `sun`, never from the position this line is about to overwrite.
    const from = this.sun.clone().multiplyScalar(reach * 2.5);
    this.key.position.set(centre.x + from.x, from.y, centre.z + from.z);
    this.key.target.position.set(centre.x, 0, centre.z);
    this.key.target.updateMatrixWorld();
    this.restage();
  }

  /** Returns whether the camera actually moved, which is one reason to draw. */
  private advance(dt: number): boolean {
    const goalYaw = nearestAngle(yawDegrees(this.target), this.live.yawDeg);
    const yawDeg = approach(this.live.yawDeg, goalYaw, dt);
    const pitchDeg = approach(this.live.pitchDeg, pitchDegrees(this.target), dt);
    if (yawDeg === this.live.yawDeg && pitchDeg === this.live.pitchDeg) return false;
    this.live = { yawDeg, pitchDeg };
    // Only while it is actually turning, so a pan or a zoom costs a watcher
    // nothing.
    this.onCamera?.(northBearing(yawDeg));
    return true;
  }

  /**
   * Puts the camera where it currently *points*, and makes its world matrix
   * current.
   *
   * Both `render` and `pick` do this, and both must use the same angles: a pick
   * mid-turn has to hit what is on screen, not where the turn is heading.
   * Picking must also never depend on a frame having been drawn first —
   * `requestAnimationFrame` does not fire while the tab or pane is hidden, so a
   * pick could otherwise raycast through a stale camera and silently return the
   * wrong cell, or none at all.
   */
  private syncCamera(): void {
    const t = clampTarget(this.target);
    placeCamera(this.camera, {
      focus: t.focus,
      zoom: t.zoom,
      yawDeg: this.live.yawDeg,
      pitchDeg: this.live.pitchDeg,
    }, this.aspect());
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

    // A map is a different surface, not an overlay on the world (R-148), so it
    // answers with a face and nothing else — there is no terrain column, no
    // place marker and no chunk slot inside one.
    if (this.blocks) {
      for (const hit of this.raycaster.intersectObject(this.blocks.group, true)) {
        const face = this.blocks.faceOf(hit);
        if (face) return { face, pawn: null, placeId: null, column: null, slot: null };
      }
      return { face: null, pawn: null, placeId: null, column: null, slot: null };
    }

    let pawn: PawnRef | null = null;
    if (this.pawns && this.pawns.group.visible) {
      for (const hit of this.raycaster.intersectObjects(this.pawns.group.children, true)) {
        pawn = this.pawns.pawnAt(hit.object);
        if (pawn) break;
      }
    }

    let placeId: string | null = null;
    if (this.places && this.places.group.visible) {
      for (const hit of this.raycaster.intersectObjects(this.places.group.children, true)) {
        placeId = this.places.placeOf(hit.object);
        if (placeId) break;
      }
    }

    let rayCell: WorldCell | null = null;
    if (this.world) {
      const hit = this.raycaster.intersectObject(this.world.mesh, false)[0];
      if (hit && hit.instanceId !== undefined) rayCell = this.world.addressOf(hit.instanceId);
    }
    // Which cell that *meant* is a rule, and it lives in `picking` where it can
    // be tested without a GL context (R-87c, D-163).
    const column = intendedCell({ pawn, placeId, rayCell }, this.campaign, this.placement);

    let slot: SlotAddress | null = null;
    if (!column) {
      for (const { mesh, coord } of this.slotMeshes) {
        if (this.raycaster.intersectObject(mesh, false).length > 0) { slot = coord; break; }
      }
    }

    return { face: null, pawn, placeId, column, slot };
  }

  /**
   * The snapped hover highlight (R-87), sized to the brush footprint so what you
   * are about to change is what is outlined.
   */
  showHighlight(address: ColumnAddress | null, height: number, size = 1): void {
    this.invalidate();
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

  /**
   * Outlines the cubes a click would add, remove or repaint (R-153, R-162).
   *
   * The world's highlight cannot do this job: it sits on a *column* and stretches
   * to its height, while a map's target is one cube anywhere in the air — which
   * is the whole reason a map stores blocks and the world stores heights.
   *
   * **One box around the whole patch**, not an outline per cube. A brush's
   * cells are contiguous and stay contiguous when the map's edge or the GM's
   * band clips them, so their bounding box *is* the patch — and a single scaled
   * box needs no geometry rebuilt as the brush changes size. Twenty-five
   * outlines would also draw twenty-four interior edges nobody asked to see.
   *
   * `tint` is what the *gesture* means, not what it is made of — white for
   * building and painting, red for erasing. Tinting it with the material was
   * tried and is a bad idea: a cube goes down against cubes of the same
   * material, so the outline vanishes into the surface it exists to stand out
   * from (D-212).
   */
  showBlockGhost(cells: readonly BlockCoord[], tint = 0xffffff): void {
    this.invalidate();
    if (cells.length === 0 || !this.showingMap) { this.blockGhost.visible = false; return; }
    let lowX = Infinity; let lowY = Infinity; let lowZ = Infinity;
    let highX = -Infinity; let highY = -Infinity; let highZ = -Infinity;
    for (const at of cells) {
      if (at.x < lowX) lowX = at.x;
      if (at.y < lowY) lowY = at.y;
      if (at.z < lowZ) lowZ = at.z;
      if (at.x > highX) highX = at.x;
      if (at.y > highY) highY = at.y;
      if (at.z > highZ) highZ = at.z;
    }
    this.blockGhost.visible = true;
    // Blocks are addressed by their corner and the outline is centred, so add
    // half a cell — the same half `buildBlockBody` adds to every instance.
    this.blockGhost.position.set(
      (lowX + highX) / 2 + 0.5,
      (lowY + highY) / 2 + 0.5,
      (lowZ + highZ) / 2 + 0.5,
    );
    this.blockGhost.scale.set(highX - lowX + 1, highY - lowY + 1, highZ - lowZ + 1);
    (this.blockGhost.material as LineBasicMaterial).color.setHex(tint);
  }

  /**
   * Collects a timer query once the driver has finished with it.
   *
   * A result is never ready on the frame that asked for it, so this reads the
   * one in flight and only starts another when that is done — which makes the
   * figure a recent frame's rather than this one's, and that is the honest
   * best a browser allows.
   *
   * A **disjoint** means the GPU was interrupted and every outstanding timing
   * is nonsense; the whole result is thrown away rather than reported low.
   */
  private readTimer(gl: WebGL2RenderingContext): void {
    if (!this.timer || !this.pending) return;
    const disjoint = gl.getParameter(this.timer.GPU_DISJOINT_EXT) as boolean;
    const ready = gl.getQueryParameter(this.pending, gl.QUERY_RESULT_AVAILABLE) as boolean;
    if (!ready && !disjoint) return;
    if (ready && !disjoint) {
      const ns = gl.getQueryParameter(this.pending, gl.QUERY_RESULT) as number;
      this.gpuMs = ns / 1e6;
    }
    gl.deleteQuery(this.pending);
    this.pending = null;
  }

  /**
   * What this screen is costing the GPU, for the overlay (R-166).
   *
   * Straight from `renderer.info`, which three.js keeps for free and resets
   * every frame — so these are the *last* frame's numbers, which is what makes
   * them worth watching while something moves. There is no browser API for GPU
   * memory at all; `geometries`, `textures` and `programs` are the nearest
   * honest thing, and they are also the leak detector: if they climb while the
   * GM works, something is not being disposed.
   */
  cost(): StageCost {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      rebuildMs: this.rebuildMs,
      blocks: this.blocks?.count ?? 0,
      gpuMs: this.gpuMs,
    };
  }

  resize(): void {
    this.invalidate();
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    // The composer owns the buffers now, and an unresized pass renders the
    // last size into the new canvas.
    this.composer.setSize(w, h);
  }

  /**
   * Turns ambient occlusion off, for a screen that cannot afford it (R-168).
   *
   * Kept as a switch rather than a build-time choice because the machine that
   * matters is the one driving the table, and it is not the one this was
   * written on.
   */
  setOcclusion(on: boolean): void {
    this.invalidate();
    this.occluding = on;
    this.occlusion.enabled = on;
  }

  /**
   * Draws the figure in each material's surface, or does not (R-177).
   *
   * A switch for the same reason occlusion has one (R-168): so the person
   * standing in front of the screen can A/B it against the numbers beside it.
   * **On by default**, because it costs nothing measurable.
   */
  setFigures(on: boolean): void {
    this.invalidate();
    this.figuring = on;
    this.blocks?.setFigures(on);
  }

  /**
   * Draws if a frame is owed, and says what kind of frame it was (R-170).
   *
   * The distinction is not bookkeeping: a **heartbeat** frame is half a second
   * after the last one, and is not representative of anything. Its interval is
   * the heartbeat rather than a cost, and the GPU has had time to clock down
   * between frames so it measures *slower* than a frame drawn while something
   * is happening. Reported as a cost, it reads as a screen that gets faster
   * the busier it is (D-230). So only real frames are measured.
   */
  render(): 'skipped' | 'drawn' | 'heartbeat' {
    const now = performance.now();
    // First frame has no previous one to measure against; a zero `dt` leaves the
    // camera exactly where it starts, which is what an unstarted turn means.
    const dt = this.lastFrame === 0 ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    /*
     * Eased every tick even when no frame is drawn, or a turn would advance
     * only on the frames that happened to be drawn and arrive in steps.
     */
    const moving = this.advance(dt);
    const changed = this.dirty || moving;
    if (!changed && now - this.lastDrawn < IDLE_HEARTBEAT_MS) return 'skipped';
    this.dirty = false;
    this.lastDrawn = now;
    this.syncCamera();
    // Markers and their names share one threshold and toggle together (R-83),
    // and neither belongs to a map's surface at all (R-148). This line used to
    // check only the zoom, which quietly undid `setMap`'s hiding on the very
    // next frame — a map's zoom is always under the threshold.
    const markers = showWorldMarkers(this.showingMap, this.target.zoom, MARKER_ZOOM);
    if (this.places) {
      this.places.group.visible = markers;
      if (markers) this.places.scaleLabels(this.target.zoom, this.canvas.clientHeight || 1);
    }
    // The party shares the threshold, so pawns and places come and go together.
    if (this.pawns) {
      this.pawns.group.visible = markers;
      if (markers) this.pawns.scaleLabels(this.target.zoom, this.canvas.clientHeight || 1);
    }
    this.renderer.info.reset();
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.readTimer(gl);
    // Timed only when it is a real frame, for the reason in the doc above.
    if (changed && this.timer && !this.pending) {
      this.pending = gl.createQuery();
      if (this.pending) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.pending);
    }
    /*
     * Straight to the canvas when occlusion is off — **not** through the
     * composer with one pass disabled (D-225).
     *
     * The composer is not free on its own: it renders into a half-float
     * target, multisampled, at the device's pixel ratio, and then blits it
     * back. Leaving that in the path and merely skipping the AO pass would
     * mean "off" still cost more than before any of this existed, and would
     * make the switch useless as a comparison — which is the only thing it is
     * for.
     */
    /*
     * Redrawn here and only here, in the frame that was going to render
     * anyway. `needsUpdate` is read by that render and cleared by three.js, so
     * setting it earlier would have it consumed by a frame we skipped (R-180).
     */
    if (this.shadowsStale) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsStale = false;
    }
    if (this.occluding) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (changed && this.timer && this.pending) gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    return changed ? 'drawn' : 'heartbeat';
  }

  dispose(): void {
    instances--;
    this.blockGhost.geometry.dispose();
    (this.blockGhost.material as LineBasicMaterial).dispose();
    this.setFogChunks([]);
    this.blocks?.dispose();
    this.pawns?.dispose();
    this.places?.dispose();
    this.world?.dispose();
    this.renderer.dispose();
  }
}
