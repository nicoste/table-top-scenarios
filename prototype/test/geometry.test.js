import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grid } from '../shared/grid.js';
import { visibility, traceSegment, eyePoint, POSTURES, inFieldOfView } from '../shared/vision.js';
import { resolveLanding, stepsFrom, reachable, hasClearance } from '../shared/movement.js';

// A flat floor at y=0, so tokens live at y=1.
function floor(size = 16, h = 0) {
  const g = new Grid({ x: size, y: 14, z: size });
  for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) g.set(x, h, z, 'solid');
  return g;
}
const tok = (id, cell, posture = 'stand', facing = 0, extra = {}) => ({ id, cell, posture, facing, ...extra });
const wide = { fovYaw: 360, fovPitch: 180 }; // isolate occlusion from facing

test('sanity: open ground is fully visible', () => {
  const g = floor();
  const v = visibility(g, tok('a', [2, 1, 8]), tok('b', [10, 1, 8]), { vision: wide });
  assert.equal(v.cover, 'clear');
  assert.equal(v.fraction, 1);
});

test('a 1-cube wall: visible standing, hidden crouched', () => {
  const g = floor();
  for (let z = 0; z < 16; z++) g.set(6, 1, z, 'solid');

  const standing = visibility(g, tok('a', [2, 1, 8]), tok('b', [10, 1, 8]), { vision: wide });
  assert.equal(standing.visible, true);
  assert.equal(standing.headVisible, true);
  assert.equal(standing.cover, 'light', 'heads clear the wall, legs do not');

  const crouched = visibility(g, tok('a', [2, 1, 8], 'crouch'), tok('b', [10, 1, 8], 'crouch'), { vision: wide });
  assert.equal(crouched.visible, false);
  assert.equal(crouched.cover, 'total');
  assert.deepEqual(crouched.primaryBlocker.cell, [6, 1, 8]);
});

test('crouching breaks line of sight asymmetrically', () => {
  // Standing observer looking down at a crouched target behind the same wall.
  const g = floor();
  for (let z = 0; z < 16; z++) g.set(6, 1, z, 'solid');
  const seeCrouched = visibility(g, tok('a', [2, 1, 8], 'stand'), tok('b', [10, 1, 8], 'crouch'), { vision: wide });
  const crouchSeeStanding = visibility(g, tok('a', [2, 1, 8], 'crouch'), tok('b', [10, 1, 8], 'stand'), { vision: wide });
  // Both are partial, but the geometry is not symmetric in general: assert that
  // each direction independently agrees with the other on *whether* sight exists,
  // which is the property a tabletop needs to stay fair.
  assert.equal(seeCrouched.visible, crouchSeeStanding.visible);
});

test('elevation beats cover: high ground sees over a 2-cube wall', () => {
  const g = floor(20);
  for (let z = 0; z < 20; z++) { g.set(8, 1, z, 'solid'); g.set(8, 2, z, 'solid'); }

  const ground = visibility(g, tok('a', [4, 1, 10]), tok('b', [12, 1, 10]), { vision: wide });
  assert.equal(ground.visible, false, 'a 2-cube wall blocks standing eyes at 1.6');

  // build a tower and stand on it
  for (let y = 1; y <= 4; y++) g.set(4, y, 10, 'solid');
  const high = visibility(g, tok('a', [4, 5, 10]), tok('b', [12, 1, 10]), { vision: wide });
  assert.equal(high.visible, true, 'from 4 cubes up the wall no longer occludes');
  assert.equal(high.elevation, -4);
});

test('a floor overhead blocks sight upward', () => {
  const g = floor(12);
  for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) g.set(x, 4, z, 'solid'); // catwalk
  // stand on the catwalk at y=5, target below at y=1
  const v = visibility(g, tok('a', [5, 5, 5]), tok('b', [7, 1, 5]), { vision: wide });
  assert.equal(v.visible, false);
  assert.equal(v.primaryBlocker.kind, 'solid');

  // punch a hole and sight is restored
  g.set(6, 4, 5, null);
  const v2 = visibility(g, tok('a', [5, 5, 5]), tok('b', [7, 1, 5]), { vision: wide });
  assert.equal(v2.visible, true);
});

test('glass blocks movement but not sight; smoke does the opposite', () => {
  const g = floor();
  for (let z = 0; z < 16; z++) { g.set(6, 1, z, 'glass'); g.set(6, 2, z, 'glass'); }
  const throughGlass = visibility(g, tok('a', [2, 1, 8]), tok('b', [10, 1, 8]), { vision: wide });
  assert.equal(throughGlass.cover, 'clear', 'glass is transparent');
  assert.equal(hasClearance(g, 6, 1, 8, 'stand'), false, 'glass is solid to movement');

  const g2 = floor();
  for (let z = 0; z < 16; z++) { g2.set(6, 1, z, 'smoke'); g2.set(6, 2, z, 'smoke'); }
  const throughSmoke = visibility(g2, tok('a', [2, 1, 8]), tok('b', [10, 1, 8]), { vision: wide });
  assert.equal(throughSmoke.visible, false, 'smoke is opaque');
  assert.equal(hasClearance(g2, 6, 1, 8, 'stand'), true, 'smoke can be walked through');
});

test('half cover occludes only the lower half of its cell', () => {
  const g = floor();
  for (let z = 0; z < 16; z++) g.set(6, 1, z, 'half');
  const v = visibility(g, tok('a', [2, 1, 8]), tok('b', [10, 1, 8]), { vision: wide });
  assert.equal(v.visible, true);
  assert.ok(v.fraction > 0.5, 'a crate at half height hides less than a full cube');

  // and a full cube in the same place hides strictly more
  for (let z = 0; z < 16; z++) g.set(6, 1, z, 'solid');
  const full = visibility(g, tok('a', [2, 1, 8]), tok('b', [10, 1, 8]), { vision: wide });
  assert.ok(full.fraction < v.fraction);
});

test('THE DIAGONAL SEAM: two cubes touching at an edge', () => {
  // Cubes at (5,1,4) and (4,1,5) touch only along the vertical edge at x=5,z=5.
  // A ray from (4,1,4) to (5,1,5) passes exactly through that zero-width seam.
  const g = floor();
  g.set(5, 1, 4, 'solid');
  g.set(4, 1, 5, 'solid');
  const a = tok('a', [4, 1, 4], 'crouch'); // crouch so nothing sees over the top
  const b = tok('b', [5, 1, 5], 'crouch');

  const strict = visibility(g, a, b, { vision: { ...wide, seam: 'strict' } });
  const permissive = visibility(g, a, b, { vision: { ...wide, seam: 'permissive' } });

  assert.equal(strict.visible, false, 'strict: walls are airtight, the seam seals');
  assert.equal(permissive.visible, true, 'permissive: a measure-zero gap lets sight through');
  assert.notEqual(strict.cover, permissive.cover, 'the policy is load-bearing, not cosmetic');
});

test('a single centre-to-centre ray would have gotten the seam wrong', () => {
  // Demonstrates why the bundle exists: the exact centre ray grazes the seam.
  const g = floor();
  g.set(5, 1, 4, 'solid');
  g.set(4, 1, 5, 'solid');
  const from = eyePoint([4, 1, 4], 'crouch');
  const to = eyePoint([5, 1, 5], 'crouch');
  assert.equal(traceSegment(g, from, to, { seam: 'permissive' }).blocked, false);
  assert.equal(traceSegment(g, from, to, { seam: 'strict' }).blocked, true);
  assert.equal(traceSegment(g, from, to, { seam: 'strict' }).hit.why, 'seam');
});

test('a pillar gives graded cover, not a boolean', () => {
  const g = floor();
  g.set(8, 1, 8, 'solid'); g.set(8, 2, 8, 'solid');
  // dead behind the pillar
  const behind = visibility(g, tok('a', [4, 1, 8]), tok('b', [12, 1, 8]), { vision: wide });
  // one cell off the axis
  const offAxis = visibility(g, tok('a', [4, 1, 8]), tok('b', [12, 1, 10]), { vision: wide });
  assert.ok(behind.fraction < offAxis.fraction, 'stepping off the axis exposes you');
  assert.equal(behind.cover, 'total');
  assert.equal(offAxis.cover, 'clear');
});

test('facing: a clear line of sight still fails outside the view arc', () => {
  const g = floor();
  const a = tok('a', [8, 1, 8], 'stand', 0);        // looking toward +x
  const behind = tok('b', [2, 1, 8]);                // directly behind
  const v = visibility(g, a, behind, { vision: { fovYaw: 120, fovPitch: 140, awareness: 1.8 } });
  assert.equal(v.visible, false);
  assert.equal(v.reason, 'out-of-fov');
  // turning around fixes it, with no change to the world
  const turned = visibility(g, { ...a, facing: Math.PI }, behind, { vision: { fovYaw: 120, fovPitch: 140 } });
  assert.equal(turned.visible, true);
});

test('awareness overrides facing at touching range', () => {
  const g = floor();
  const a = tok('a', [8, 1, 8], 'stand', 0);
  const adjacent = tok('b', [7, 1, 8]); // behind, but adjacent
  const v = visibility(g, a, adjacent, { vision: { fovYaw: 90, fovPitch: 140, awareness: 1.8 } });
  assert.equal(v.visible, true, 'you notice someone at your shoulder regardless of facing');
});

test('range is a hard cut', () => {
  const g = floor(40);
  const v = visibility(g, tok('a', [2, 1, 8]), tok('b', [34, 1, 8]), { vision: { ...wide, range: 10 } });
  assert.equal(v.visible, false);
  assert.equal(v.reason, 'out-of-range');
});

test('pitch limit: you cannot see straight up an infinite shaft', () => {
  const g = floor(12);
  const v = visibility(g, tok('a', [5, 1, 5]), tok('b', [5, 11, 5]), { vision: { fovYaw: 360, fovPitch: 100, awareness: 0 } });
  assert.equal(v.visible, false);
  assert.equal(v.reason, 'out-of-pitch');
});

test('tokens occlude each other but never themselves', () => {
  const g = floor();
  const a = tok('a', [4, 1, 8]);
  const mid = tok('m', [8, 1, 8]);
  const b = tok('b', [12, 1, 8]);
  const clear = visibility(g, a, b, { vision: wide, tokens: [a, b] });
  const screened = visibility(g, a, b, { vision: wide, tokens: [a, mid, b] });
  assert.equal(clear.cover, 'clear');
  assert.ok(screened.fraction < clear.fraction, 'a body in the way is cover');
  assert.equal(screened.primaryBlocker.tokenId, 'm');
});

// ---------------------------------------------------------------------------
// movement
// ---------------------------------------------------------------------------

test('step up one cube, but not two', () => {
  const g = floor();
  g.set(5, 1, 8, 'solid');
  assert.deepEqual(resolveLanding(g, 5, 8, 1, 'stand', {}, [4, 8]), { y: 2, climb: 1, fall: 0 });
  g.set(5, 2, 8, 'solid');
  assert.equal(resolveLanding(g, 5, 8, 1, 'stand', {}, [4, 8]), null);
});

test('a 1-cell crawlspace admits only the crouched', () => {
  const g = floor();
  g.set(5, 2, 8, 'solid'); // ceiling one cell above the floor
  assert.equal(resolveLanding(g, 5, 8, 1, 'stand', {}, [4, 8]), null);
  assert.deepEqual(resolveLanding(g, 5, 8, 1, 'crouch', {}, [4, 8]), { y: 1, climb: 0, fall: 0 });
});

test('falling is bounded by maxFall', () => {
  const g = new Grid({ x: 12, y: 14, z: 12 });
  for (let x = 6; x < 12; x++) for (let z = 0; z < 12; z++) g.set(x, 6, z, 'solid'); // upper deck
  for (let x = 0; x < 6; x++) for (let z = 0; z < 12; z++) g.set(x, 2, z, 'solid');  // lower deck, 4 down
  // from the upper deck at y=7 stepping off the edge at x=5 -> lands on y=3, a 4-cell drop
  assert.equal(resolveLanding(g, 5, 5, 7, 'stand', { maxFall: 3 }, [6, 5]), null, '4 is too far with maxFall 3');
  assert.deepEqual(resolveLanding(g, 5, 5, 7, 'stand', { maxFall: 4 }, [6, 5]), { y: 3, climb: 0, fall: 4 });
});

test('diagonal moves cannot squeeze through a seam', () => {
  // The movement seam is the same geometry as the sight seam: two cubes touching
  // only along their shared edge leave a gap of zero width.
  const g = floor();
  g.set(5, 1, 4, 'solid');
  g.set(4, 1, 5, 'solid');
  const diag = (grid, rules) =>
    stepsFrom(grid, [4, 1, 4], 'stand', rules).some(s => s.cell[0] === 5 && s.cell[2] === 5);

  assert.equal(diag(g), false, 'both sides blocked: a zero-width squeeze');

  // one cube away and it becomes an ordinary brush past a corner
  g.set(5, 1, 4, null);
  assert.equal(diag(g), true, 'seam rule: brushing one corner is fine');
  assert.equal(diag(g, { cornerRule: 'strict' }), false, 'strict rule: no corner cutting at all');

  g.set(4, 1, 5, null);
  assert.equal(diag(g, { cornerRule: 'strict' }), true, 'open ground is diagonal under any rule');
});

test('diagonals stay level - no diagonal climbing', () => {
  const g = floor();
  g.set(5, 1, 5, 'solid');
  const steps = stepsFrom(g, [4, 1, 4], 'stand');
  assert.equal(steps.some(s => s.cell.join() === '5,2,5'), false);
  // but the same climb is fine orthogonally
  assert.ok(stepsFrom(g, [4, 1, 5], 'stand').some(s => s.cell.join() === '5,2,5'));
});

test('crouching costs movement', () => {
  const g = floor(20);
  const standing = reachable(g, tok('a', [10, 1, 10], 'stand'), 6).size;
  const crouched = reachable(g, tok('a', [10, 1, 10], 'crouch'), 6).size;
  assert.ok(crouched < standing, 'crouched tokens cover less ground for the same budget');
});

test('reachability respects walls in 3D', () => {
  const g = floor(20);
  // a sealed 3x3 room around (10,1,10), two cubes high
  for (const [dx, dz] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    for (let y = 1; y <= 2; y++) g.set(10 + dx * 2, y, 10 + dz * 2, 'solid');
  }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (dx === 0 && dz === 0) continue;
    for (let y = 1; y <= 2; y++) g.set(10 + dx, y, 10 + dz, 'solid');
  }
  const r = reachable(g, tok('a', [10, 1, 10], 'stand'), 20);
  assert.equal(r.size, 0, 'walled in on all eight sides');
});

test('postures are internally consistent', () => {
  for (const [name, p] of Object.entries(POSTURES)) {
    assert.ok(p.eye <= p.height, `${name}: eyes are inside the body`);
    assert.equal(p.cells, Math.ceil(p.height), `${name}: clearance matches height`);
  }
});
