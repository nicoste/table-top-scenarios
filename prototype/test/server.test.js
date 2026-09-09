// Exercises the trust boundary: the Player must not receive, or be able to
// query, anything its tokens cannot see.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8099 + (process.pid % 200);
let child;

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
  });
  // wait for the port to answer
  for (let i = 0; i < 80; i++) {
    try { await fetch(`http://localhost:${PORT}/`); return; }
    catch { await new Promise(r => setTimeout(r, 50)); }
  }
  throw new Error('server did not start');
});

after(() => child?.kill());

function seat(role) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/?role=${role}`);
    const client = {
      ws, state: null, assigned: null,
      ask(action, extra = {}) {
        return new Promise(res => {
          const h = raw => {
            const m = JSON.parse(raw);
            if (m.type === 'result' && m.for === action) { ws.off('message', h); res(m); }
          };
          ws.on('message', h);
          ws.send(JSON.stringify({ action, ...extra }));
        });
      },
      next() {
        return new Promise(res => {
          const h = raw => {
            const m = JSON.parse(raw);
            if (m.type === 'state') { ws.off('message', h); res(m); }
          };
          ws.on('message', h);
        });
      },
      close() { ws.close(); },
    };
    ws.on('error', reject);
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.type === 'hello') client.assigned = m.role;
      if (m.type === 'state') { client.state = m; if (client.assigned) resolve(client); }
    });
  });
}

test('roles are exclusive and the third connection is a spectator', async () => {
  const gm = await seat('gm');
  const pl = await seat('player');
  const third = await seat('gm');
  assert.equal(gm.assigned, 'gm');
  assert.equal(pl.assigned, 'player');
  assert.equal(third.assigned, 'spectator');
  gm.close(); pl.close(); third.close();
});

test('the Player is sent a filtered world, not a filtered UI', async () => {
  const gm = await seat('gm');
  const pl = await seat('player');

  assert.ok(gm.state.voxels.length > pl.state.voxels.length,
    'unexplored geometry never reaches the Player');
  assert.ok(gm.state.tokens.length > pl.state.tokens.length,
    'unseen NPCs never reach the Player');

  const hiddenIds = new Set(pl.state.tokens.map(t => t.id));
  assert.ok(gm.state.tokens.some(t => !hiddenIds.has(t.id)));

  for (const t of pl.state.tokens.filter(t => t.owner === 'gm')) {
    assert.equal(t.hp, undefined, 'enemy hit points are stripped');
  }
  gm.close(); pl.close();
});

test('the Player cannot act outside its own tokens', async () => {
  const gm = await seat('gm');
  const pl = await seat('player');
  const npc = gm.state.tokens.find(t => t.owner === 'gm').id;

  assert.match((await pl.ask('setVoxel', { x: 5, y: 5, z: 5, kind: 'solid' })).error, /GM/);
  assert.match((await pl.ask('moveToken', { id: npc, cell: [1, 1, 1] })).error, /not your token/);
  assert.match((await pl.ask('endTurn')).error, /GM/);
  assert.match((await pl.ask('setHp', { id: npc, hp: 0 })).error, /GM/);
  assert.match((await pl.ask('setRules', { rules: { seam: 'permissive' } })).error, /GM/);
  assert.match((await pl.ask('clearFog', { reveal: true })).error, /GM/);
  assert.match((await pl.ask('saveScenario', { name: 'x' })).error, /GM/);
  gm.close(); pl.close();
});

test('the Player cannot use line-of-sight queries as a scanner', async () => {
  const gm = await seat('gm');
  const pl = await seat('player');
  const mine = pl.state.tokens.find(t => t.owner === 'player').id;
  const seen = new Set(pl.state.tokens.map(t => t.id));
  const unseen = gm.state.tokens.find(t => !seen.has(t.id)).id;
  const npcSeen = pl.state.tokens.find(t => t.owner === 'gm').id;

  assert.match((await pl.ask('explain', { observer: unseen, target: mine })).error,
    /own tokens/, 'no looking through enemy eyes');
  assert.match((await pl.ask('explain', { observer: mine, target: unseen })).error,
    /no contact/, 'no ranging an enemy you cannot see');
  assert.match((await pl.ask('reach', { id: unseen })).error, /not your token/);

  const ok = await pl.ask('explain', { observer: mine, target: npcSeen });
  assert.equal(ok.error, undefined, 'a contact you already have is fair game');
  assert.ok(ok.explain.fraction > 0);
  gm.close(); pl.close();
});

test('the Player may only move within the movement it has left', async () => {
  const gm = await seat('gm');
  const pl = await seat('player');
  const me = pl.state.tokens.find(t => t.owner === 'player');

  const far = await pl.ask('moveToken', { id: me.id, cell: [me.cell[0] + 12, me.cell[1], me.cell[2]] });
  assert.match(far.error, /cannot reach/);

  const near = await pl.ask('moveToken', { id: me.id, cell: [me.cell[0] + 1, me.cell[1], me.cell[2]] });
  assert.equal(near.error, undefined);
  assert.ok(Array.isArray(near.path));

  const after = await pl.next().catch(() => null) ?? pl.state;
  const moved = (after.tokens || pl.state.tokens).find(t => t.id === me.id);
  assert.ok(moved.moveUsed > 0, 'movement is spent');
  gm.close(); pl.close();
});

test('a GM edit propagates to the Player', async () => {
  const gm = await seat('gm');
  const pl = await seat('player');
  const before = pl.state.voxels.length;
  const wait = pl.next();
  await gm.ask('setVoxel', { x: 3, y: 1, z: 4, kind: 'solid' });
  const next = await wait;
  assert.ok(next.voxels.length >= before, 'the Player sees the new geometry it can see');
  await gm.ask('setVoxel', { x: 3, y: 1, z: 4, kind: null });
  gm.close(); pl.close();
});
