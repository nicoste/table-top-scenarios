// The god view (R-29 to R-32): orthographic, stepped yaw and pitch, no free
// orbit. Holds no game state — it is driven by a CameraTarget and nothing else.

import { OrthographicCamera, Vector3 } from 'three';

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

/** The camera's yaw in radians, for anything that needs to move in its plane. */
export function yawRadians(target: Pick<CameraTarget, 'yawStep'>): number {
  const step = ((target.yawStep % YAW_STEPS) + YAW_STEPS) % YAW_STEPS;
  return ((YAW_OFFSET + step * (360 / YAW_STEPS)) * Math.PI) / 180;
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
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target.zoom)),
    yawStep: ((target.yawStep % YAW_STEPS) + YAW_STEPS) % YAW_STEPS,
    pitchStep: Math.min(PITCH_STEPS.length - 1, Math.max(0, target.pitchStep)),
  };
}

export function createCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.set(1, 1, 1);
  return camera;
}

const DISTANCE = 800; // orthographic: distance only affects clipping

export function applyTarget(
  camera: OrthographicCamera,
  target: CameraTarget,
  aspect: number,
): void {
  const t = clampTarget(target);
  const halfH = t.zoom / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();

  const yawRad = yawRadians(t);
  const pitchRad = ((PITCH_STEPS[t.pitchStep] ?? 45) * Math.PI) / 180;

  const horizontal = Math.cos(pitchRad) * DISTANCE;
  camera.position.set(
    t.focus.x + Math.sin(yawRad) * horizontal,
    t.focus.y + Math.sin(pitchRad) * DISTANCE,
    t.focus.z + Math.cos(yawRad) * horizontal,
  );
  camera.lookAt(new Vector3(t.focus.x, t.focus.y, t.focus.z));
}
