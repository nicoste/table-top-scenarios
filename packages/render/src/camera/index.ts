// The god view (R-29 to R-32): orthographic, stepped yaw and pitch, no free
// orbit. Holds no game state — it is driven by a CameraTarget and nothing else.

import { MathUtils, OrthographicCamera, Vector3 } from 'three';

/**
 * Four yaw positions, 90 degrees apart, all offset by 45 (R-31).
 *
 * The offset is the point: every position is a *diagonal* view, so the grid
 * always reads as a diamond and rotating cycles which corner faces you. Axis-
 * aligned views (0/90/180/270) collapse the isometric depth cues and look wrong.
 */
export const YAW_STEPS = 4;
export const YAW_OFFSET = 45;
/**
 * Pitch positions, in degrees above the horizon. Finely spaced around 45 — the
 * classic isometric angle and where most of the work happens — then coarser as
 * the view goes overhead, which is where you want a survey rather than nuance.
 *
 * Stops at 75 on purpose: at 90 the camera is directly above its focus and
 * `lookAt` with a +Y up vector is degenerate.
 */
export const PITCH_STEPS = [30, 35, 40, 45, 55, 65, 75] as const;

/** The camera's yaw in degrees for a given step. */
export function yawDegrees(target: Pick<CameraTarget, 'yawStep'>): number {
  const step = ((target.yawStep % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
  return YAW_OFFSET + step * (360 / YAW_STEPS);
}

/** The camera's yaw in radians, for anything that needs to move in its plane. */
export function yawRadians(target: Pick<CameraTarget, 'yawStep'>): number {
  return MathUtils.degToRad(yawDegrees(target));
}

/**
 * How long the camera takes to settle into a new angle (R-156), as the time
 * constant of an exponential approach — roughly a third of the way there per
 * this many seconds.
 *
 * Short on purpose. The transition exists to show the GM *which way* the world
 * turned, not to be admired; anything slower starts to feel like lag on the
 * next keypress.
 */
export const TURN_TAU = 0.085;

/**
 * The representation of `goal` nearest to `current`, for an angle in degrees.
 *
 * Without this, turning from 315 to 45 eases the *long* way round: three
 * quarters of a circle backwards, through the direction the GM just came from.
 * Returns 405 instead, which is the same bearing and the short way.
 */
export function nearestAngle(goal: number, current: number): number {
  /*
   * `euclideanModulo` rather than `%`, because JavaScript's remainder keeps
   * the sign of its left-hand side: `-10 % 360` is `-10`, not `350`. This
   * used to add 540 before taking the remainder to force the sign — correct,
   * and a magic number standing in for a function three.js already has
   * (D-236).
   */
  return current + MathUtils.euclideanModulo(goal - current + 180, 360) - 180;
}

/**
 * Eases `current` toward `goal` over `dt` seconds.
 *
 * Exponential rather than linear so the motion has no corners at either end,
 * and frame-rate independent because the caller's `dt` is real elapsed time —
 * a fixed step per frame would turn twice as fast on a 120Hz display.
 *
 * Snaps when it is within a twentieth of a degree: an approach never arrives,
 * and a camera that is forever almost still is a render loop that never rests.
 */
export function approach(current: number, goal: number, dt: number, tau = TURN_TAU): number {
  if (dt <= 0) return current;
  /*
   * `MathUtils.damp` is this exact formula — `lerp(x, y, 1 - exp(-lambda dt))`
   * — and cites the same source the hand-written version did (D-236). What is
   * still ours is the snap below, which is the part three.js does not do and
   * the part this project actually needs.
   */
  const next = MathUtils.damp(current, goal, 1 / tau, dt);
  return Math.abs(goal - next) < 0.05 ? goal : next;
}

/**
 * Where **north** is on screen, in degrees clockwise from straight up (R-155),
 * given the camera's azimuth in degrees.
 *
 * It is the azimuth less the yaw offset, which is a fact about this projection
 * and not a coincidence worth leaving implicit.
 *
 * The camera sits at `focus + (sin y, ., cos y)` and looks inward, so
 * screen-right is `(cos y, -sin y)` and screen-up is `(-sin y, -cos y)` in the
 * ground plane. A ground direction `(dx, dz)` therefore lands at
 * `atan2(dx cos y - dz sin y, -(dx sin y + dz cos y))`.
 *
 * North is the `(-1, -1)` diagonal of the cell grid (D-198), so that comes out
 * as `atan2(sin y - cos y, sin y + cos y)`, and since
 * `sin y - cos y = sqrt2 sin(y - 45)` and `sin y + cos y = sqrt2 cos(y - 45)`,
 * the bearing is exactly `y - 45` — zero at the default view, which is the
 * whole point of choosing that diagonal.
 *
 * A function rather than a comment at the call site because it is the one place
 * that claim is written down, and the one place a test can hold it to account.
 * It takes degrees rather than a step so it serves the eased camera mid-turn,
 * where there is no step to speak of.
 */
export function northBearing(yawDeg: number): number {
  return yawDeg - YAW_OFFSET;
}

export interface CameraTarget {
  focus: { x: number; y: number; z: number };
  zoom: number;      // world units visible vertically
  yawStep: number;   // 0..7
  pitchStep: number; // index into PITCH_STEPS
}

export const MIN_ZOOM = 6;
export const MAX_ZOOM = 260;

export function defaultTarget(focus = { x: 0, y: 0, z: 0 }): CameraTarget {
  // yawStep 0 is the 45-degree view a campaign opens on.
  return { focus, zoom: 40, yawStep: 0, pitchStep: 3 };
}

export function clampTarget(target: CameraTarget): CameraTarget {
  return {
    focus: target.focus,
    zoom: MathUtils.clamp(target.zoom, MIN_ZOOM, MAX_ZOOM),
    yawStep: ((target.yawStep % YAW_STEPS) + YAW_STEPS) % YAW_STEPS,
    pitchStep: MathUtils.clamp(target.pitchStep, 0, PITCH_STEPS.length - 1),
  };
}

export function createCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.set(1, 1, 1);
  return camera;
}

const DISTANCE = 800; // orthographic: distance only affects clipping

/** The camera as it is actually pointed: angles, not steps (R-156). */
export interface CameraView {
  focus: { x: number; y: number; z: number };
  zoom: number;
  yawDeg: number;
  pitchDeg: number;
}

/**
 * Points the camera. The one place the projection is computed, so a stepped
 * target and an eased mid-turn view cannot end up framed differently.
 */
export function placeCamera(
  camera: OrthographicCamera,
  view: CameraView,
  aspect: number,
): void {
  const halfH = view.zoom / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();

  const yawRad = MathUtils.degToRad(view.yawDeg);
  const pitchRad = MathUtils.degToRad(view.pitchDeg);

  const horizontal = Math.cos(pitchRad) * DISTANCE;
  camera.position.set(
    view.focus.x + Math.sin(yawRad) * horizontal,
    view.focus.y + Math.sin(pitchRad) * DISTANCE,
    view.focus.z + Math.cos(yawRad) * horizontal,
  );
  camera.lookAt(new Vector3(view.focus.x, view.focus.y, view.focus.z));
}

export function applyTarget(
  camera: OrthographicCamera,
  target: CameraTarget,
  aspect: number,
): void {
  const t = clampTarget(target);
  placeCamera(camera, {
    focus: t.focus,
    zoom: t.zoom,
    yawDeg: yawDegrees(t),
    pitchDeg: PITCH_STEPS[t.pitchStep] ?? 45,
  }, aspect);
}

/** The pitch in degrees a target is asking for. */
export function pitchDegrees(target: Pick<CameraTarget, 'pitchStep'>): number {
  return PITCH_STEPS[MathUtils.clamp(target.pitchStep, 0, PITCH_STEPS.length - 1)] ?? 45;
}
