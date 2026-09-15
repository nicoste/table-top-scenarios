// Which surface is on screen, and what the camera owes it (R-152).
//
// Both of these were wrong inside `Stage.setMap` and neither was visible from
// reading it — the stage needs a WebGL context, so the only way either rule
// gets a test is out here (R-23b).

import { describe, it, expect } from 'vitest';
import { surfaceMove, showWorldMarkers, MARKER_ZOOM } from '@tt/render';

const TAVERN = 'place_1/poi_1';
const CELLAR = 'place_1/poi_2';

describe('surfaceMove', () => {
  it('does nothing when the body changed but the surface did not', () => {
    // The whole reason the key exists. The console resolves the open map from
    // the wire every render (D-185), so this is asked again for every block
    // placed; framing the map each time dragged the camera back to the middle
    // while the GM was building at the edge.
    expect(surfaceMove(TAVERN, TAVERN)).toBe('keep');
    expect(surfaceMove(null, null)).toBe('keep');
  });

  it('frames a map on the way in', () => {
    expect(surfaceMove(null, TAVERN)).toBe('frame');
  });

  it('frames the next map when the GM goes straight from one to another', () => {
    expect(surfaceMove(TAVERN, CELLAR)).toBe('frame');
  });

  it('restores the world on the way out', () => {
    expect(surfaceMove(TAVERN, null)).toBe('restore');
  });
});

describe('showWorldMarkers', () => {
  it('hides them inside a map, whatever the zoom', () => {
    // The bug this replaces: the render loop set visibility from the zoom alone
    // and so re-showed the world's markers on the frame after `setMap` hid
    // them. A map is tens of cells across, so its zoom is *always* under the
    // threshold — the condition that was missing is the one that always fails.
    expect(showWorldMarkers(true, 26, MARKER_ZOOM)).toBe(false);
    expect(showWorldMarkers(true, MARKER_ZOOM * 4, MARKER_ZOOM)).toBe(false);
  });

  it('keeps the zoom threshold in the world (R-83)', () => {
    expect(showWorldMarkers(false, MARKER_ZOOM, MARKER_ZOOM)).toBe(true);
    expect(showWorldMarkers(false, MARKER_ZOOM - 1, MARKER_ZOOM)).toBe(true);
    expect(showWorldMarkers(false, MARKER_ZOOM + 1, MARKER_ZOOM)).toBe(false);
  });
});
