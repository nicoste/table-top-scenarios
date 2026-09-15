// Which surface the stage is showing, and what the camera owes it (R-152).
//
// A surface is the world map or one point of interest's map — never both
// (R-148). Two rules live here rather than in the stage, because both were
// wrong in `setMap` and neither was visible from reading it (R-23b).

/** What the camera should do when the surface changes. */
export type SurfaceMove =
  /** Nothing. The body changed, the surface did not. */
  | 'keep'
  /** Frame the new surface, remembering what was framed before. */
  | 'frame'
  /** Put back the framing the world had before a map took over. */
  | 'restore';

/**
 * Compares the surface on screen with the one being asked for.
 *
 * `null` is the world; any other string identifies one map. The key matters
 * more than it looks: the console resolves the open map from the wire on every
 * render (D-185), so `setMap` is called again for every block placed. Keyed on
 * the *body*, that framed the map afresh each time and dragged the camera back
 * to the middle while the GM was building at the edge.
 */
export function surfaceMove(from: string | null, to: string | null): SurfaceMove {
  if (from === to) return 'keep';
  if (to !== null) return 'frame';
  return 'restore';
}

/**
 * Are the world's place markers and party pawns drawn?
 *
 * Two conditions, and only one of them used to be checked. The zoom threshold
 * is R-83: markers and their labels come and go together so the world does not
 * turn into a wall of text. The surface is R-148: inside a tavern there is no
 * such thing as a village marker, and the render loop was re-showing both
 * groups every frame after `setMap` had hidden them — a map is tens of cells
 * across, so its zoom is always under the threshold.
 */
export function showWorldMarkers(showingMap: boolean, zoom: number, threshold: number): boolean {
  return !showingMap && zoom <= threshold;
}
