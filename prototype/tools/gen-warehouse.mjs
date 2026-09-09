// Generates scenarios/warehouse.json - a demo map where every region exists to
// exercise one specific 3D question. Re-run with: node tools/gen-warehouse.mjs
import { writeFileSync } from 'node:fs';
import { Grid } from '../shared/grid.js';

const S = 26;
const g = new Grid({ x: S, y: 12, z: S });

const box = (x0, y0, z0, x1, y1, z1, kind) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) g.set(x, y, z, kind);
};

// ground
box(0, 0, 0, S - 1, 0, S - 1, 'solid');
// perimeter, 3 high
box(0, 1, 0, S - 1, 3, 0, 'solid');
box(0, 1, S - 1, S - 1, 3, S - 1, 'solid');
box(0, 1, 0, 0, 3, S - 1, 'solid');
box(S - 1, 1, 0, S - 1, 3, S - 1, 'solid');

// A. low wall, 1 cube high: see over it standing, not crouched
box(10, 1, 2, 10, 1, 8, 'solid');

// B. tall wall, 2 cubes high, with a glass window and a doorway
box(10, 1, 11, 10, 2, 18, 'solid');
box(10, 1, 14, 10, 2, 14, 'glass');   // window: sight yes, movement no
g.set(10, 1, 17, null); g.set(10, 2, 17, null); // doorway

// C. the diagonal seam: two cubes touching only along a vertical edge
g.set(15, 1, 5, 'solid');
g.set(16, 1, 6, 'solid');

// D. pillars, 2 high: graded cover depending on how far off-axis you stand
for (const [x, z] of [[6, 13], [6, 17], [14, 8], [18, 12]]) box(x, 1, z, x, 2, z, 'solid');

// E. crate row at half height: shoot over, cannot walk through
box(3, 1, 21, 9, 1, 21, 'half');

// F. catwalk at y=4 with a ramp of single steps, and a hole to look through
box(17, 4, 17, 23, 4, 23, 'solid');
for (let i = 0; i < 3; i++) box(16 - i, 1, 20, 16 - i, 3 - i, 20, 'solid'); // stair blocks
g.set(20, 4, 20, null);               // hole in the catwalk
box(17, 5, 17, 17, 6, 23, 'solid');   // railing along one edge

// G. crawlspace: a 1-cell-high tunnel, crouch only
box(3, 2, 6, 8, 2, 6, 'solid');
box(3, 2, 5, 8, 2, 5, 'solid');
box(3, 1, 5, 8, 1, 5, 'solid');

// H. smoke cloud: walk through, cannot see through
box(19, 1, 3, 20, 2, 4, 'smoke');

const tokens = [
  { id: 'p1', name: 'Vex',      owner: 'player', cell: [3, 1, 3],   posture: 'stand', facing: 0.8,  hp: 12, maxHp: 12, speed: 6, color: '#57d9a3' },
  { id: 'p2', name: 'Rook',     owner: 'player', cell: [3, 1, 10],  posture: 'stand', facing: 0.0,  hp: 16, maxHp: 16, speed: 5, color: '#4db8ff' },
  { id: 'g1', name: 'Sentry A', owner: 'gm',     cell: [14, 1, 3],  posture: 'stand', facing: 3.14, hp: 8,  maxHp: 8,  speed: 6, color: '#ff6b6b' },
  { id: 'g2', name: 'Sentry B', owner: 'gm',     cell: [13, 1, 15], posture: 'crouch', facing: 3.14, hp: 8, maxHp: 8, speed: 6, color: '#ff6b6b' },
  { id: 'g3', name: 'Watcher',  owner: 'gm',     cell: [19, 5, 19], posture: 'stand', facing: 2.4,  hp: 10, maxHp: 10, speed: 5, color: '#ffa94d',
    vision: { range: 28, fovYaw: 140, fovPitch: 150 } },
];

const scenario = { name: 'Warehouse', ...g.toJSON(), tokens };
writeFileSync(new URL('../scenarios/warehouse.json', import.meta.url), JSON.stringify(scenario, null, 1));
console.log(`warehouse.json: ${scenario.voxels.length} voxels, ${tokens.length} tokens`);
