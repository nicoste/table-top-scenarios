// Which surface is on screen, and what the camera owes it (R-152).
//
// Both of these were wrong inside `Stage.setMap` and neither was visible from
// reading it — the stage needs a WebGL context, so the only way either rule
// gets a test is out here (R-23b).

import { describe, it, expect } from 'vitest';
import { surfaceMove, showWorldMarkers, MARKER_ZOOM, northBearing, yawRadians } from '@tt/render';

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

describe('northBearing (R-155)', () => {
  it('is the camera azimuth, one bearing per yaw step', () => {
    // Derived, not tabulated: the four numbers below are right only because
    // YAW_OFFSET is 45 and there are four steps, and a table of them would go
    // quietly wrong the day either changes.
    expect(northBearing({ yawStep: 0 })).toBeCloseTo(45);
    expect(northBearing({ yawStep: 1 })).toBeCloseTo(135);
    expect(northBearing({ yawStep: 2 })).toBeCloseTo(225);
    expect(northBearing({ yawStep: 3 })).toBeCloseTo(315);
  });

  it('agrees with the projection it claims to describe', () => {
    // North is (0,-1) on the ground. Screen-right is (cos y, -sin y) and
    // screen-up is (-sin y, -cos y), so north projects to (sin y, cos y) — a
    // bearing of y clockwise from up. Checked here rather than trusted, because
    // a compass that is 90 degrees out is worse than no compass.
    for (const yawStep of [0, 1, 2, 3]) {
      const y = yawRadians({ yawStep });
      const screenX = 0 * Math.cos(y) - -1 * Math.sin(y);
      const screenUp = -(0 * Math.sin(y) + -1 * Math.cos(y));
      const bearing = (Math.atan2(screenX, screenUp) * 180) / Math.PI;
      const expected = northBearing({ yawStep });
      expect(((bearing - expected) % 360 + 360) % 360, `step ${yawStep}`).toBeCloseTo(0);
    }
  });

  it('wraps a yaw step that ran past the last one', () => {
    expect(northBearing({ yawStep: 4 })).toBeCloseTo(northBearing({ yawStep: 0 }));
    expect(northBearing({ yawStep: -1 })).toBeCloseTo(northBearing({ yawStep: 3 }));
  });
});
