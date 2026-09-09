// 3D movement on the voxel grid.
//
// The 3D issues that matter here:
//  - Vertical clearance. A standing token needs 2 empty cells, crouched needs 1.
//    So a 1-cell-high crawlspace is passable only when crouched, which ties
//    posture to movement the same way it ties to sight.
//  - Support. A token must have something solid directly below its feet.
//    Stepping into a column resolves to a landing height: climb at most
//    maxStep, fall at most maxFall.
//  - Corner cutting. Moving diagonally between two solids that touch only at
//    their shared edge would squeeze through a zero-width gap; the same seam
//    problem as sight, and it is rejected the same way.

import { POSTURES } from './vision.js';

// cornerRule mirrors the seam policy in vision.js, and for the same reason:
//   'seam'   - a diagonal is impossible only when BOTH orthogonal neighbours are
//              blocked, i.e. the gap is a zero-width edge. Brushing past a single
//              corner is allowed, because physically it is.
//   'strict'  - the classic grid-VTT rule: a diagonal needs both orthogonals open.
// Neither is "correct"; it is a house rule, so it is a setting.
export const DEFAULT_MOVE = { maxStep: 1, maxFall: 3, allowDiagonal: true, cornerRule: 'seam' };

export const DIRS8 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function postureCells(posture) {
  return (POSTURES[posture] || POSTURES.stand).cells;
}

// Are the cells the token's body would occupy free of movement blockers?
export function hasClearance(grid, x, y, z, posture) {
  const n = postureCells(posture);
  for (let i = 0; i < n; i++) if (grid.blocksMove(x, y + i, z)) return false;
  return true;
}

export function hasSupport(grid, x, y, z) {
  return grid.blocksMove(x, y - 1, z);
}

export function isStandable(grid, x, y, z, posture) {
  return hasClearance(grid, x, y, z, posture) && hasSupport(grid, x, y, z);
}

/**
 * Entering column (x,z) from height fromY: which height does the token end at?
 * Prefers the smallest vertical change, climbing before falling.
 * Returns { y, climb, fall } or null when the column cannot be entered.
 */
export function resolveLanding(grid, x, z, fromY, posture, rules = DEFAULT_MOVE, origin = null) {
  const { maxStep, maxFall } = { ...DEFAULT_MOVE, ...rules };
  const n = postureCells(posture);
  for (let dy = 0; dy <= maxStep; dy++) {
    const y = fromY + dy;
    if (!isStandable(grid, x, y, z, posture)) continue;
    // Climbing needs headroom above the token's own head in the column it is
    // leaving, otherwise it would rise straight through a ceiling.
    if (dy > 0 && origin) {
      let boxedIn = false;
      for (let i = 0; i < dy; i++) {
        if (grid.blocksMove(origin[0], fromY + n + i, origin[1])) { boxedIn = true; break; }
      }
      if (boxedIn) continue;
    }
    return { y, climb: dy, fall: 0 };
  }
  for (let dy = 1; dy <= maxFall; dy++) {
    const y = fromY - dy;
    if (y < 0) break;
    if (!hasClearance(grid, x, y, z, posture)) break; // hit a ceiling on the way down
    if (isStandable(grid, x, y, z, posture)) return { y, climb: 0, fall: dy };
  }
  return null;
}

/**
 * Legal single steps out of a cell, with cost.
 * Diagonals must have both orthogonal neighbours clear at the origin height and
 * must stay level: no diagonal climbing, no diagonal squeeze through a seam.
 */
export function stepsFrom(grid, cell, posture, rules = DEFAULT_MOVE) {
  const r = { ...DEFAULT_MOVE, ...rules };
  const [x, y, z] = cell;
  const out = [];
  for (const [dx, dz] of DIRS8) {
    const diagonal = dx !== 0 && dz !== 0;
    if (diagonal && !r.allowDiagonal) continue;

    const nx = x + dx, nz = z + dz;
    const landing = resolveLanding(grid, nx, nz, y, posture, r, [x, z]);
    if (!landing) continue;

    if (diagonal) {
      if (landing.y !== y) continue; // level diagonals only
      const sideA = hasClearance(grid, x + dx, y, z, posture);
      const sideB = hasClearance(grid, x, y, nz, posture);
      if (r.cornerRule === 'strict') {
        if (!sideA || !sideB) continue; // no corner cutting at all
      } else if (!sideA && !sideB) {
        continue;                       // a true seam squeeze: zero-width gap
      }
    }

    const base = diagonal ? 1.5 : 1;
    const cost = (base + landing.climb) * (POSTURES[posture] || POSTURES.stand).moveCost;
    out.push({ cell: [nx, landing.y, nz], cost, climb: landing.climb, fall: landing.fall, diagonal });
  }
  return out;
}

/**
 * Every cell reachable within `budget` movement, by Dijkstra.
 * Returns Map("x,y,z" -> { cost, from, climb, fall }).
 */
export function reachable(grid, token, budget, rules = DEFAULT_MOVE) {
  const start = token.cell.join(',');
  const best = new Map([[start, { cost: 0, from: null, climb: 0, fall: 0 }]]);
  // small frontier; a sorted-insert queue is plenty at tabletop scale
  const queue = [{ key: start, cell: token.cell, cost: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const cur = queue.shift();
    if (cur.cost > (best.get(cur.key)?.cost ?? Infinity)) continue;
    for (const s of stepsFrom(grid, cur.cell, token.posture, rules)) {
      const cost = cur.cost + s.cost;
      if (cost > budget + 1e-9) continue;
      const k = s.cell.join(',');
      if (cost < (best.get(k)?.cost ?? Infinity) - 1e-9) {
        best.set(k, { cost, from: cur.key, climb: s.climb, fall: s.fall });
        queue.push({ key: k, cell: s.cell, cost });
      }
    }
  }
  best.delete(start);
  return best;
}

// Reconstruct the path to a cell from a `reachable` map.
export function pathTo(reachMap, startKey, goalKey) {
  if (!reachMap.has(goalKey)) return null;
  const path = [];
  let k = goalKey;
  while (k && k !== startKey) {
    path.unshift(k.split(',').map(Number));
    k = reachMap.get(k)?.from;
    if (path.length > 4096) return null;
  }
  return path;
}
