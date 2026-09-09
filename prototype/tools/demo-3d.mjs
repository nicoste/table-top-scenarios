// Prints the engine's answers to the 3D questions that a voxel tabletop has to
// get right. Every number here comes from the same modules the server uses.
//   node tools/demo-3d.mjs
import { Grid } from '../shared/grid.js';
import { visibility, POSTURES } from '../shared/vision.js';
import { stepsFrom, resolveLanding } from '../shared/movement.js';

const WIDE = { fovYaw: 360, fovPitch: 180, awareness: 0 }; // isolate occlusion from facing
const tok = (cell, posture = 'stand', id = 't') => ({ id, cell, posture, facing: 0 });

function floor(size = 20) {
  const g = new Grid({ x: size, y: 14, z: size });
  for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) g.set(x, 0, z, 'solid');
  return g;
}

const bar = f => {
  const n = Math.round(f * 20);
  return '\x1b[32m' + '█'.repeat(n) + '\x1b[90m' + '·'.repeat(20 - n) + '\x1b[0m';
};

function look(g, a, b, vision = {}) {
  const v = visibility(g, { ...a, id: 'a' }, { ...b, id: 'b' }, { vision: { ...WIDE, ...vision } });
  const blk = v.primaryBlocker?.cell ? `${v.primaryBlocker.kind}@${v.primaryBlocker.cell.join(',')}` : '—';
  return { v, row: `${bar(v.fraction)} ${String(Math.round(v.fraction * 100)).padStart(3)}%  ${v.cover.padEnd(6)} ${blk}` };
}

const h = t => console.log(`\n\x1b[1m${t}\x1b[0m`);
const row = (label, s) => console.log(`  ${label.padEnd(38)} ${s}`);

console.log('\n\x1b[1m3D geometry report\x1b[0m  — exposure bar, % of rays through, cover grade, main blocker');

h('1. A wall one cube high, 8 cells apart');
{
  const g = floor(); for (let z = 0; z < 20; z++) g.set(10, 1, z, 'solid');
  for (const p of ['stand', 'crouch', 'prone']) {
    row(`${POSTURES[p].label} (eye ${POSTURES[p].eye}) both sides`, look(g, tok([6, 1, 10], p), tok([14, 1, 10], p)).row);
  }
  row('Standing looking at a crouched target', look(g, tok([6, 1, 10], 'stand'), tok([14, 1, 10], 'crouch')).row);
}

h('2. Elevation against a wall two cubes high (observer stands on a tower)');
{
  for (const y of [1, 2, 3, 4, 5]) {
    // fresh grid per row: a tower of y-1 cubes, with the observer standing on top
    const g = floor();
    for (let z = 0; z < 20; z++) { g.set(10, 1, z, 'solid'); g.set(10, 2, z, 'solid'); }
    for (let i = 1; i < y; i++) g.set(6, i, 10, 'solid');
    row(`feet at y=${y} (${y - 1} cube${y === 2 ? '' : 's'} up)`, look(g, tok([6, y, 10]), tok([14, 1, 10])).row);
  }
}

h('3. The same cell, four different kinds of cube');
{
  for (const kind of ['solid', 'glass', 'smoke', 'half']) {
    const g = floor(); for (let z = 0; z < 20; z++) g.set(10, 1, z, kind);
    const { v, row: r } = look(g, tok([6, 1, 10], 'crouch'), tok([14, 1, 10], 'crouch'));
    const walk = stepsFrom(g, [9, 1, 10], 'crouch').some(s => s.cell.join(',') === '10,1,10');
    row(`${kind.padEnd(6)} sight`, `${r}   movement: ${walk ? 'passable' : 'blocked'}`);
  }
}

h('4. The diagonal seam — cubes touching only along an edge');
{
  const g = floor(); g.set(10, 1, 9, 'solid'); g.set(9, 1, 10, 'solid');
  for (const seam of ['strict', 'permissive']) {
    row(`sight, seam=${seam}`, look(g, tok([9, 1, 9], 'crouch'), tok([10, 1, 10], 'crouch'), { seam }).row);
  }
  for (const cornerRule of ['seam', 'strict']) {
    const ok = stepsFrom(g, [9, 1, 9], 'crouch', { cornerRule }).some(s => s.cell.join(',') === '10,1,10');
    row(`movement, corners=${cornerRule}`, ok ? 'ALLOWED' : 'blocked');
  }
  g.set(10, 1, 9, null);
  for (const cornerRule of ['seam', 'strict']) {
    const ok = stepsFrom(g, [9, 1, 9], 'crouch', { cornerRule }).some(s => s.cell.join(',') === '10,1,10');
    row(`  one cube removed, corners=${cornerRule}`, ok ? 'ALLOWED' : 'blocked');
  }
}

h('5. Stepping off-axis from behind a 2-high pillar');
{
  const g = floor(); g.set(10, 1, 10, 'solid'); g.set(10, 2, 10, 'solid');
  for (let dz = 0; dz <= 3; dz++) {
    row(`target ${dz} cells off the pillar axis`, look(g, tok([5, 1, 10]), tok([15, 1, 10 + dz])).row);
  }
}

h('6. Vertical occlusion — a catwalk overhead');
{
  const g = floor(14); for (let x = 0; x < 14; x++) for (let z = 0; z < 14; z++) g.set(x, 4, z, 'solid');
  row('from the catwalk down, floor intact', look(g, tok([5, 5, 7]), tok([8, 1, 7])).row);
  g.set(6, 4, 7, null); g.set(7, 4, 7, null);
  row('after opening a hatch', look(g, tok([5, 5, 7]), tok([8, 1, 7])).row);
}

h('7. Posture gates movement as well as sight');
{
  const g = floor(); g.set(11, 2, 10, 'solid');            // ceiling 1 cell up
  for (const p of ['stand', 'crouch', 'prone']) {
    const land = resolveLanding(g, 11, 10, 1, p, {}, [10, 10]);
    row(`${POSTURES[p].label} into a 1-cell crawlspace`, land ? `enters at y=${land.y}` : 'does not fit');
  }
  const g2 = floor(); g2.set(11, 1, 10, 'solid');
  row('step up onto one cube', resolveLanding(g2, 11, 10, 1, 'stand', {}, [10, 10]) ? 'ALLOWED' : 'blocked');
  g2.set(11, 2, 10, 'solid');
  row('step up onto two cubes', resolveLanding(g2, 11, 10, 1, 'stand', {}, [10, 10]) ? 'ALLOWED' : 'blocked');
}

h('8. Facing, at a fixed 6-cell distance with clear line of sight');
{
  const g = floor();
  for (const deg of [0, 30, 60, 75, 90, 180]) {
    const a = Math.PI * deg / 180;
    const target = [Math.round(10 + Math.cos(a) * 6), 1, Math.round(10 + Math.sin(a) * 6)];
    const v = visibility(g, { ...tok([10, 1, 10]), facing: 0, id: 'a' }, { ...tok(target), id: 'b' },
      { vision: { fovYaw: 120, fovPitch: 140, awareness: 1.8 } });
    row(`target ${String(deg).padStart(3)}° off the facing`, `${v.visible ? 'seen' : 'not seen'}  (${v.reason})`);
  }
}

console.log('');
