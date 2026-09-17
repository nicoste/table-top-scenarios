// Which surface is on screen, and what the camera owes it (R-152).
//
// Both of these were wrong inside `Stage.setMap` and neither was visible from
// reading it — the stage needs a WebGL context, so the only way either rule
// gets a test is out here (R-23b).

import { describe, it, expect } from 'vitest';
import {
  surfaceMove, showWorldMarkers, MARKER_ZOOM, northBearing, yawDegrees, yawRadians,
  nearestAngle, approach, TURN_TAU,
} from '@tt/render';

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

describe('northBearing (R-155, D-198)', () => {
  it('points straight up in the view a campaign opens on', () => {
    // The whole reason north is the (-1,-1) diagonal: at the default yaw the
    // needle is vertical, which is what the GM asked for.
    expect(northBearing(yawDegrees({ yawStep: 0 }))).toBeCloseTo(0);
  });

  it('turns a quarter with the camera, one bearing per step', () => {
    // Derived, not tabulated: these are right only because YAW_OFFSET is 45 and
    // there are four steps, and a table of them would go quietly wrong the day
    // either changes.
    expect(northBearing(yawDegrees({ yawStep: 1 }))).toBeCloseTo(90);
    expect(northBearing(yawDegrees({ yawStep: 2 }))).toBeCloseTo(180);
    expect(northBearing(yawDegrees({ yawStep: 3 }))).toBeCloseTo(270);
  });

  it('agrees with the projection it claims to describe', () => {
    // Screen-right is (cos y, -sin y) and screen-up is (-sin y, -cos y), so a
    // ground direction (dx, dz) lands at atan2(dx cos y - dz sin y,
    // -(dx sin y + dz cos y)). Checked against north's own vector rather than
    // trusted, because a compass 90 degrees out is worse than no compass.
    const NORTH = { dx: -1, dz: -1 };
    for (const yawStep of [0, 1, 2, 3]) {
      const y = yawRadians({ yawStep });
      const screenX = NORTH.dx * Math.cos(y) - NORTH.dz * Math.sin(y);
      const screenUp = -(NORTH.dx * Math.sin(y) + NORTH.dz * Math.cos(y));
      const bearing = (Math.atan2(screenX, screenUp) * 180) / Math.PI;
      const expected = northBearing(yawDegrees({ yawStep }));
      expect(((bearing - expected) % 360 + 360) % 360, `step ${yawStep}`).toBeCloseTo(0);
    }
  });

  it('puts the grid axes on the intercardinals, which is what the rose grows along', () => {
    // -Z is north-east and +X is south-east, at the default view and at every
    // other, because both the compass and the axes turn with the camera.
    const axes = { northeast: { dx: 0, dz: -1 }, southeast: { dx: 1, dz: 0 } };
    for (const yawStep of [0, 1, 2, 3]) {
      const y = yawRadians({ yawStep });
      const north = northBearing(yawDegrees({ yawStep }));
      for (const [name, d] of Object.entries(axes)) {
        const screenX = d.dx * Math.cos(y) - d.dz * Math.sin(y);
        const screenUp = -(d.dx * Math.sin(y) + d.dz * Math.cos(y));
        const bearing = (Math.atan2(screenX, screenUp) * 180) / Math.PI;
        const fromNorth = ((bearing - north) % 360 + 360) % 360;
        expect(fromNorth, `${name} at step ${yawStep}`)
          .toBeCloseTo(name === 'northeast' ? 45 : 135);
      }
    }
  });

  it('holds mid-turn, where there is no step to speak of (R-156)', () => {
    // The reason it takes degrees: the eased camera spends most of a turn
    // between two steps, and the compass has to be right there too.
    expect(northBearing(87.3)).toBeCloseTo(42.3);
  });

  it('wraps a yaw step that ran past the last one', () => {
    expect(yawDegrees({ yawStep: 4 })).toBeCloseTo(yawDegrees({ yawStep: 0 }));
    expect(yawDegrees({ yawStep: -1 })).toBeCloseTo(yawDegrees({ yawStep: 3 }));
  });
});

describe('easing a turn (R-156)', () => {
  describe('nearestAngle — the short way round', () => {
    it('crosses zero forwards instead of unwinding three quarters', () => {
      // The bug this exists to prevent: 315 to 45 is one step clockwise, and
      // the naive version eases backwards through 180 — past the view the GM
      // just left, in the wrong direction, for three times as long.
      expect(nearestAngle(45, 315)).toBeCloseTo(405);
      expect(nearestAngle(315, 45)).toBeCloseTo(-45);
    });

    it('leaves an ordinary step alone', () => {
      expect(nearestAngle(135, 45)).toBeCloseTo(135);
      expect(nearestAngle(45, 135)).toBeCloseTo(45);
    });

    it('is a no-op when it is already there', () => {
      expect(nearestAngle(45, 45)).toBeCloseTo(45);
      expect(nearestAngle(405, 45)).toBeCloseTo(45);
    });

    it('never returns the long way, for any pair of steps', () => {
      for (const from of [45, 135, 225, 315]) {
        for (const to of [45, 135, 225, 315]) {
          expect(Math.abs(nearestAngle(to, from) - from), `${from}->${to}`)
            .toBeLessThanOrEqual(180.0001);
        }
      }
    });
  });

  describe('approach', () => {
    it('moves toward the goal without overshooting it', () => {
      let a = 0;
      for (let i = 0; i < 200; i += 1) {
        const next = approach(a, 90, 1 / 60);
        expect(next).toBeGreaterThanOrEqual(a);
        expect(next).toBeLessThanOrEqual(90);
        a = next;
      }
      expect(a).toBe(90);
    });

    it('arrives exactly, so the loop stops having work to do', () => {
      // Without the snap an exponential approach never lands, and a camera
      // forever almost-still is a watcher notified forever.
      expect(approach(89.99, 90, 1 / 60)).toBe(90);
      expect(approach(90, 90, 1 / 60)).toBe(90);
    });

    it('takes the same real time at any frame rate', () => {
      // 30Hz and 240Hz must not turn at different speeds — the whole reason
      // `dt` is elapsed seconds and not a fixed step per frame. Measured over a
      // tenth of a second, short of the snap, so this tests the easing and not
      // the moment it decides it has arrived.
      const after = (dt: number, seconds: number) => {
        let a = 0;
        for (let i = 0; i < Math.round(seconds / dt); i += 1) a = approach(a, 90, dt);
        return a;
      };
      expect(after(1 / 30, 0.1)).toBeCloseTo(after(1 / 240, 0.1), 6);
      expect(after(1 / 30, 0.1)).toBeCloseTo(90 * (1 - Math.exp(-0.1 / TURN_TAU)), 6);
    });

    it('settles in a small multiple of its time constant', () => {
      let a = 0;
      const dt = 1 / 120;
      let elapsed = 0;
      while (a !== 90 && elapsed < 5) { a = approach(a, 90, dt); elapsed += dt; }
      expect(a).toBe(90);
      // Fast enough not to feel like lag on the next keypress.
      expect(elapsed).toBeLessThan(TURN_TAU * 12);
    });

    it('snaps rather than crawls after a long gap', () => {
      // A hidden tab stops requestAnimationFrame; the next frame's dt is huge
      // and the camera should simply be there.
      expect(approach(45, 135, 30)).toBe(135);
      expect(approach(45, 135, 0)).toBe(45);
    });
  });
});
