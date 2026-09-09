// Line of sight, occlusion and cover on the voxel grid.
//
// Design notes, because these are the decisions that make or break 3D reasoning:
//
// 1. A single centre-to-centre ray is not enough. Two tokens can see each other's
//    heads over a wall while their bodies are hidden, and "half visible" is a
//    different tactical fact from "fully visible". So we cast a bundle of rays
//    from the eye to a lattice of points inside the target's body volume and
//    grade the result by the fraction that get through.
//
// 2. Ray traversal is Amanatides & Woo 3D DDA, but the interesting part is what
//    happens at ties. When two cubes touch only along a diagonal edge, the shared
//    edge has zero thickness, and a ray aimed exactly at it passes through a gap
//    of measure zero. Naive DDA silently leaks sight through that seam - the
//    classic "I can see through the corner of the wall" bug. Whether that seam
//    seals is a rules call, not an implementation detail, so it is a policy:
//      'strict'     - grazing a solid at a seam blocks (walls are airtight)
//      'permissive' - only a real pass-through blocks (you can peek the diagonal)
//
// 3. Occlusion is tested against the actual world-space box of each voxel, not
//    against "is this cell full". That is what makes `half` cover work: a ray
//    above y+0.5 crosses the cell but misses the box.
//
// 4. Field of view is a yaw limit plus a pitch limit rather than a single cone.
//    A cone makes anything directly overhead invisible at any sane FOV, which is
//    wrong: people can look up.

import { Grid } from './grid.js';

const EPS_T = 1e-9;      // tie tolerance in ray parameter t (t spans [0,1])
const EPS_PASS = 1e-7;   // minimum t-overlap to count as a real pass-through
const MAX_STEPS = 4096;

export const POSTURES = {
  stand:  { label: 'Standing', height: 1.8,  eye: 1.6, cells: 2, moveCost: 1 },
  crouch: { label: 'Crouched', height: 1.0,  eye: 0.8, cells: 1, moveCost: 2 },
  prone:  { label: 'Prone',    height: 0.35, eye: 0.3, cells: 1, moveCost: 4 },
};

export const DEFAULT_VISION = {
  range: 24,          // cells
  fovYaw: 120,        // total horizontal arc, degrees
  fovPitch: 140,      // total vertical arc, degrees
  awareness: 1.8,     // inside this radius facing is ignored (you notice adjacency)
  seam: 'strict',
  quality: 'normal',
};

export const COVER = {
  clear: { label: 'No cover',      level: 0 },
  light: { label: 'Light cover',   level: 1 },
  heavy: { label: 'Heavy cover',   level: 2 },
  total: { label: 'Total cover',   level: 3 },
};

// ---------------------------------------------------------------------------
// geometry primitives
// ---------------------------------------------------------------------------

// Segment/box overlap in ray parameter space. Returns [t0,t1] clipped to [0,1],
// or null when the segment misses the box entirely.
export function segmentBox(from, d, b) {
  let t0 = 0, t1 = 1;
  const lo = [b.x0, b.y0, b.z0];
  const hi = [b.x1, b.y1, b.z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) {
      if (from[a] < lo[a] || from[a] > hi[a]) return null;
      continue;
    }
    let ta = (lo[a] - from[a]) / d[a];
    let tb = (hi[a] - from[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

export function eyePoint(cell, posture) {
  return [cell[0] + 0.5, cell[1] + (POSTURES[posture] || POSTURES.stand).eye, cell[2] + 0.5];
}

// The token's body as a world box. Inset horizontally so a body is neither a
// zero-width needle nor flush against the walls of its own cell.
export function bodyBox(cell, posture, margin = 0.2) {
  const h = (POSTURES[posture] || POSTURES.stand).height;
  return {
    x0: cell[0] + margin, x1: cell[0] + 1 - margin,
    y0: cell[1],          y1: cell[1] + h,
    z0: cell[2] + margin, z1: cell[2] + 1 - margin,
  };
}

// Lattice fractions, inset from the faces so no sample lands exactly on a grid
// plane. Coplanar rays are the other big source of 3D flakiness and this avoids
// having to special-case them at all.
function fractions(n, inset = 0.08) {
  if (n <= 1) return [0.5];
  const span = 1 - 2 * inset;
  return Array.from({ length: n }, (_, i) => inset + (i * span) / (n - 1));
}

const QUALITY = {
  fast:   { nx: 1, ny: 2, nz: 1 },  //  2 body rays + head
  normal: { nx: 2, ny: 3, nz: 2 },  // 12 body rays + head
  fine:   { nx: 2, ny: 4, nz: 2 },  // 16 body rays + head
};

// Sample points over the target: a body lattice plus an explicit head point at
// eye height, so "only the head is showing" is reportable on its own.
export function targetSamples(cell, posture, quality = 'normal') {
  const q = QUALITY[quality] || QUALITY.normal;
  const b = bodyBox(cell, posture);
  const pts = [];
  const fy = fractions(q.ny), fx = fractions(q.nx), fz = fractions(q.nz);
  for (const ty of fy) for (const tx of fx) for (const tz of fz) {
    pts.push({
      p: [b.x0 + tx * (b.x1 - b.x0), b.y0 + ty * (b.y1 - b.y0), b.z0 + tz * (b.z1 - b.z0)],
      part: ty > 0.66 ? 'head' : ty > 0.33 ? 'torso' : 'legs',
    });
  }
  pts.push({ p: eyePoint(cell, posture), part: 'head' });
  return pts;
}

// ---------------------------------------------------------------------------
// ray traversal
// ---------------------------------------------------------------------------

// Walk the grid from `from` to `to` and return the first thing that occludes.
// `blockers` is an optional list of extra world boxes (token bodies).
export function traceSegment(grid, from, to, opts = {}) {
  const seam = opts.seam || 'strict';
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-9) return { blocked: false, hit: null, steps: 0 };

  let best = null; // earliest hit found so far
  const consider = (box, t, why) => {
    if (!best || t < best.t) best = { t, box, why };
  };

  // extra boxes (token bodies) are few, so a linear scan is fine
  for (const b of opts.blockers || []) {
    const r = segmentBox(from, d, b);
    if (r && r[1] - r[0] > EPS_PASS) consider(b, Math.max(r[0], 0), 'token');
  }

  const cell = [Math.floor(from[0]), Math.floor(from[1]), Math.floor(from[2])];
  const step = [0, 0, 0], tDelta = [Infinity, Infinity, Infinity], tMax = [Infinity, Infinity, Infinity];
  for (let a = 0; a < 3; a++) {
    if (d[a] > 0) {
      step[a] = 1; tDelta[a] = 1 / d[a];
      tMax[a] = (cell[a] + 1 - from[a]) / d[a];
    } else if (d[a] < 0) {
      step[a] = -1; tDelta[a] = -1 / d[a];
      tMax[a] = (cell[a] - from[a]) / d[a];
    }
  }

  // Test one cell. `grazing` cells are the seam siblings: the ray only touches
  // them at a point, so under 'strict' any contact at all counts.
  const testCell = (x, y, z, grazing) => {
    const box = grid.opaqueBox(x, y, z);
    if (!box) return;
    const r = segmentBox(from, d, box);
    if (!r) return;
    if (grazing) {
      if (seam === 'strict' && r[1] >= r[0] - EPS_T) consider(box, Math.max(r[0], 0), 'seam');
    } else if (r[1] - r[0] > EPS_PASS) {
      consider(box, Math.max(r[0], 0), 'occluder');
    }
  };

  let steps = 0;
  for (;;) {
    if (++steps > MAX_STEPS) break;
    testCell(cell[0], cell[1], cell[2], false);
    if (best && best.t <= Math.min(tMax[0], tMax[1], tMax[2])) break; // nothing later can win

    const m = Math.min(tMax[0], tMax[1], tMax[2]);
    if (!(m <= 1)) break; // segment ends inside the current cell

    // which axes cross at the same instant? 2 => an edge, 3 => a corner
    const tied = [];
    for (let a = 0; a < 3; a++) if (tMax[a] <= m + EPS_T) tied.push(a);

    if (tied.length > 1 && seam === 'strict') {
      // Every cell sharing the crossed edge/corner, other than the destination:
      // each proper non-empty subset of the tied axes.
      const n = tied.length;
      for (let mask = 1; mask < (1 << n) - 1; mask++) {
        const c = [cell[0], cell[1], cell[2]];
        for (let i = 0; i < n; i++) if (mask & (1 << i)) c[tied[i]] += step[tied[i]];
        testCell(c[0], c[1], c[2], true);
      }
    }

    for (const a of tied) { cell[a] += step[a]; tMax[a] += tDelta[a]; }
  }

  if (!best) return { blocked: false, hit: null, steps };
  return {
    blocked: true,
    steps,
    hit: {
      kind: best.box.kind || 'token',
      cell: best.box.kind ? [best.box.x0, best.box.y0 | 0, best.box.z0] : null,
      tokenId: best.box.tokenId || null,
      t: best.t,
      why: best.why,
      point: [from[0] + d[0] * best.t, from[1] + d[1] * best.t, from[2] + d[2] * best.t],
    },
  };
}

export function hasLineOfSight(grid, from, to, opts) {
  return !traceSegment(grid, from, to, opts).blocked;
}

// ---------------------------------------------------------------------------
// field of view
// ---------------------------------------------------------------------------

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// facing is a yaw in radians, 0 = +x, increasing toward +z.
export function inFieldOfView(eye, point, facing, vision) {
  const v = { range: DEFAULT_VISION.range, ...vision };
  const dx = point[0] - eye[0], dy = point[1] - eye[1], dz = point[2] - eye[2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist > v.range) return { ok: false, reason: 'out-of-range', dist };
  if (dist <= (v.awareness ?? DEFAULT_VISION.awareness)) return { ok: true, reason: 'awareness', dist };
  const yaw = Math.atan2(dz, dx);
  if (Math.abs(angleDelta(yaw, facing)) > (v.fovYaw * Math.PI / 180) / 2) {
    return { ok: false, reason: 'out-of-fov', dist };
  }
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (Math.abs(pitch) > (v.fovPitch * Math.PI / 180) / 2) {
    return { ok: false, reason: 'out-of-pitch', dist };
  }
  return { ok: true, reason: 'in-fov', dist };
}

// ---------------------------------------------------------------------------
// token-to-token visibility
// ---------------------------------------------------------------------------

function coverFromFraction(f) {
  if (f >= 0.999) return 'clear';
  if (f >= 0.5) return 'light';
  if (f > 0) return 'heavy';
  return 'total';
}

/**
 * How well can `observer` see `target`?
 * Returns the graded result plus, when opts.debug is set, every ray it cast so
 * the UI can draw exactly what the engine looked at.
 */
export function visibility(grid, observer, target, opts = {}) {
  const vision = { ...DEFAULT_VISION, ...(observer.vision || {}), ...(opts.vision || {}) };
  const eye = eyePoint(observer.cell, observer.posture);
  const samples = targetSamples(target.cell, target.posture, vision.quality);

  // Token bodies occlude each other, but never the two ends of the query.
  const blockers = [];
  if (opts.tokens) {
    for (const t of opts.tokens) {
      if (t.id === observer.id || t.id === target.id) continue;
      if (t.blocksSight === false) continue;
      const b = bodyBox(t.cell, t.posture);
      b.tokenId = t.id;
      blockers.push(b);
    }
  }

  const traceOpts = { seam: vision.seam, blockers };
  const rays = [];
  const blockerTally = new Map();
  let visibleCount = 0, headVisible = false, bodyVisible = false;
  let anyInFov = false, nearestReason = 'out-of-range';

  for (const s of samples) {
    const fov = inFieldOfView(eye, s.p, observer.facing || 0, vision);
    if (!fov.ok) {
      if (fov.reason === 'out-of-fov' || fov.reason === 'out-of-pitch') nearestReason = fov.reason;
      if (opts.debug) rays.push({ from: eye, to: s.p, blocked: true, reason: fov.reason, part: s.part });
      continue;
    }
    anyInFov = true;
    const r = traceSegment(grid, eye, s.p, traceOpts);
    if (r.blocked) {
      const k = r.hit.cell ? r.hit.cell.join(',') : 'token:' + r.hit.tokenId;
      blockerTally.set(k, (blockerTally.get(k) || 0) + 1);
    } else {
      visibleCount++;
      if (s.part === 'head') headVisible = true; else bodyVisible = true;
    }
    if (opts.debug) {
      rays.push({ from: eye, to: s.p, blocked: r.blocked, hit: r.hit, part: s.part, reason: r.blocked ? 'occluded' : 'clear' });
    }
  }

  const fraction = samples.length ? visibleCount / samples.length : 0;
  const dx = target.cell[0] - observer.cell[0];
  const dy = target.cell[1] - observer.cell[1];
  const dz = target.cell[2] - observer.cell[2];

  let reason;
  if (visibleCount > 0) reason = 'visible';
  else if (!anyInFov) reason = nearestReason;
  else reason = 'occluded';

  let primaryBlocker = null;
  for (const [k, n] of blockerTally) {
    if (!primaryBlocker || n > primaryBlocker.count) {
      primaryBlocker = k.startsWith('token:')
        ? { tokenId: k.slice(6), count: n }
        : { cell: k.split(',').map(Number), kind: grid.get(...k.split(',').map(Number)), count: n };
    }
  }

  return {
    visible: visibleCount > 0,
    fraction,
    cover: coverFromFraction(fraction),
    reason,
    headVisible,
    bodyVisible,
    samples: samples.length,
    visibleSamples: visibleCount,
    distance: Math.hypot(dx, dy, dz),
    gridDistance: Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)),
    elevation: dy,
    primaryBlocker,
    rays: opts.debug ? rays : undefined,
  };
}

// ---------------------------------------------------------------------------
// area visibility (fog of war)
// ---------------------------------------------------------------------------

// Sample points on the faces of a voxel that face the observer, nudged just
// outside the surface so the cube does not occlude itself.
function voxelSamples(x, y, z, eye) {
  const out = [];
  const e = 0.02, i = 0.2;
  const faces = [
    [eye[0] < x,     [[x - e, y + i, z + i], [x - e, y + 1 - i, z + i], [x - e, y + i, z + 1 - i], [x - e, y + 0.5, z + 0.5]]],
    [eye[0] > x + 1, [[x + 1 + e, y + i, z + i], [x + 1 + e, y + 1 - i, z + i], [x + 1 + e, y + i, z + 1 - i], [x + 1 + e, y + 0.5, z + 0.5]]],
    [eye[1] < y,     [[x + i, y - e, z + i], [x + 1 - i, y - e, z + 1 - i], [x + 0.5, y - e, z + 0.5]]],
    [eye[1] > y + 1, [[x + i, y + 1 + e, z + i], [x + 1 - i, y + 1 + e, z + 1 - i], [x + 0.5, y + 1 + e, z + 0.5]]],
    [eye[2] < z,     [[x + i, y + i, z - e], [x + 1 - i, y + i, z - e], [x + i, y + 1 - i, z - e], [x + 0.5, y + 0.5, z - e]]],
    [eye[2] > z + 1, [[x + i, y + i, z + 1 + e], [x + 1 - i, y + i, z + 1 + e], [x + i, y + 1 - i, z + 1 + e], [x + 0.5, y + 0.5, z + 1 + e]]],
  ];
  for (const [facing, pts] of faces) if (facing) out.push(...pts);
  if (!out.length) out.push([x + 0.5, y + 0.5, z + 0.5]); // eye inside the cube
  return out;
}

// Which voxels can this observer see? Returns a Set of "x,y,z" keys.
export function visibleVoxels(grid, observer, opts = {}) {
  const vision = { ...DEFAULT_VISION, ...(observer.vision || {}), ...(opts.vision || {}) };
  const range = Math.min(vision.range, opts.maxRange ?? 16);
  const eye = eyePoint(observer.cell, observer.posture);
  const seen = new Set();
  const traceOpts = { seam: vision.seam };

  for (const [k, kind] of grid.cells) {
    const [x, y, z] = k.split(',').map(Number);
    const centre = [x + 0.5, y + 0.5, z + 0.5];
    const fov = inFieldOfView(eye, centre, observer.facing || 0, { ...vision, range: range + 1.5 });
    // A cube's near face can be in view when its centre is marginally outside,
    // so only reject on distance here and let the samples decide the rest.
    if (fov.reason === 'out-of-range') continue;
    for (const p of voxelSamples(x, y, z, eye)) {
      if (!inFieldOfView(eye, p, observer.facing || 0, { ...vision, range }).ok) continue;
      if (!traceSegment(grid, eye, p, traceOpts).blocked) { seen.add(k); break; }
    }
  }
  return seen;
}

export function mergeSets(sets) {
  const out = new Set();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

export { Grid };
