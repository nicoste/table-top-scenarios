// Local-network tabletop host. One GM, one Player, plus spectators.
//
// The server is authoritative for two things that matter:
//  1. Permissions - the Player may only act through tokens it owns, and only
//     make moves the movement rules allow.
//  2. Fog of war - visibility is computed here and the Player is *sent* a
//     filtered world. Hidden enemies are not shipped to the client at all, so
//     you cannot read them out of the network tab.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { Grid } from './shared/grid.js';
import { visibility, visibleVoxels, mergeSets, POSTURES, DEFAULT_VISION } from './shared/vision.js';
import { reachable, pathTo, DEFAULT_MOVE } from './shared/movement.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------

const state = {
  scenarioName: 'Warehouse',
  grid: new Grid(),
  tokens: [],
  round: 1,
  activeId: null,
  rules: { ...DEFAULT_MOVE, seam: DEFAULT_VISION.seam },
  // what the Player has ever seen, so the map builds up instead of flickering
  explored: new Set(),
  log: [],
};

function loadScenario(name) {
  const file = path.join(ROOT, 'scenarios', path.basename(name) + '.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  state.scenarioName = json.name || name;
  state.grid = Grid.fromJSON(json);
  state.tokens = (json.tokens || []).map(t => ({
    posture: 'stand', facing: 0, hp: 10, maxHp: 10, speed: 6, moveUsed: 0,
    owner: 'gm', color: '#ff6b6b', ...t,
  }));
  state.explored = new Set();
  state.round = 1;
  state.activeId = state.tokens[0]?.id ?? null;
  note(`loaded scenario "${state.scenarioName}" (${state.grid.count} voxels)`);
}

function saveScenario(name) {
  const safe = path.basename(String(name || 'untitled')).replace(/[^a-z0-9_-]/gi, '_');
  const json = { name: state.scenarioName, ...state.grid.toJSON(), tokens: state.tokens };
  fs.writeFileSync(path.join(ROOT, 'scenarios', safe + '.json'), JSON.stringify(json, null, 1));
  return safe;
}

function listScenarios() {
  try {
    return fs.readdirSync(path.join(ROOT, 'scenarios')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  } catch { return []; }
}

function note(text) {
  state.log.unshift({ t: Date.now(), text });
  if (state.log.length > 60) state.log.pop();
}

const tokenById = id => state.tokens.find(t => t.id === id);

// ---------------------------------------------------------------------------
// visibility, computed server-side
// ---------------------------------------------------------------------------

// Everything the Player's tokens can collectively see.
function playerView() {
  const mine = state.tokens.filter(t => t.owner === 'player');
  const voxelSets = [], seenTokens = new Set(), pairs = [];

  for (const obs of mine) {
    voxelSets.push(visibleVoxels(state.grid, obs, { vision: { seam: state.rules.seam } }));
    for (const other of state.tokens) {
      if (other.owner === 'player') { seenTokens.add(other.id); continue; }
      const v = visibility(state.grid, obs, other, {
        tokens: state.tokens,
        vision: { seam: state.rules.seam },
      });
      if (v.visible) {
        seenTokens.add(other.id);
        pairs.push({ observer: obs.id, target: other.id, cover: v.cover, fraction: v.fraction, headVisible: v.headVisible });
      }
    }
  }

  const visibleCells = mergeSets(voxelSets);
  for (const k of visibleCells) state.explored.add(k);
  return { visibleCells, seenTokens, pairs };
}

// ---------------------------------------------------------------------------
// serialisation per role
// ---------------------------------------------------------------------------

function snapshot(role) {
  const view = playerView();
  const base = {
    type: 'state',
    role,
    scenarioName: state.scenarioName,
    scenarios: listScenarios(),
    size: state.grid.size,
    round: state.round,
    activeId: state.activeId,
    rules: state.rules,
    log: state.log.slice(0, 20),
    postures: POSTURES,
    contacts: view.pairs,
  };

  if (role === 'gm') {
    return {
      ...base,
      voxels: state.grid.toJSON().voxels,
      tokens: state.tokens,
      // so the GM can see exactly what the Player is being shown
      playerVisibleCells: [...view.visibleCells],
      playerSeenTokens: [...view.seenTokens],
    };
  }

  // The Player gets explored geometry only, and only the enemies currently seen.
  const voxels = state.grid.toJSON().voxels.filter(([x, y, z]) => state.explored.has(`${x},${y},${z}`));
  return {
    ...base,
    voxels,
    tokens: state.tokens
      .filter(t => t.owner === 'player' || view.seenTokens.has(t.id))
      .map(t => (t.owner === 'player' ? t : { ...t, hp: undefined, maxHp: undefined })),
    playerVisibleCells: [...view.visibleCells],
    playerSeenTokens: [...view.seenTokens],
  };
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

// Spectators are read-only: they receive the Player's filtered view (see
// snapshot()) and may not act through any token.
function mayControl(role, token) {
  if (!token) return false;
  if (role === 'gm') return true;
  return role === 'player' && token.owner === 'player';
}

function applyAction(role, msg) {
  const deny = reason => ({ error: reason });

  switch (msg.action) {
    case 'setVoxel': {
      if (role !== 'gm') return deny('only the GM can edit the map');
      const { x, y, z, kind } = msg;
      if (!state.grid.set(x, y, z, kind || null)) return deny('out of bounds');
      // Editing the world can strand a token; drop anyone left unsupported.
      return {};
    }

    case 'moveToken': {
      const t = tokenById(msg.id);
      if (!mayControl(role, t)) return deny('not your token');
      const goal = msg.cell.join(',');

      // The GM placing a token is not a move: no pathing, no budget. Running
      // reachability here would flood the whole map to answer a question nobody
      // asked.
      if (role === 'gm' && msg.free) {
        t.cell = msg.cell;
        note(`${t.name} placed at ${goal}`);
        return {};
      }

      const reach = reachable(state.grid, t, t.speed - t.moveUsed, state.rules);
      const entry = reach.get(goal);
      if (!entry) {
        // A GM click outside the budget is a placement, not an error.
        if (role === 'gm') { t.cell = msg.cell; note(`${t.name} placed at ${goal}`); return {}; }
        return deny('cannot reach that cell with the movement left');
      }
      const path = pathTo(reach, t.cell.join(','), goal);
      t.cell = msg.cell;
      t.moveUsed = Math.min(t.speed, t.moveUsed + entry.cost);
      if (entry.fall > 0) note(`${t.name} dropped ${entry.fall} cell${entry.fall > 1 ? 's' : ''}`);
      return { path };
    }

    case 'setPosture': {
      const t = tokenById(msg.id);
      if (!mayControl(role, t)) return deny('not your token');
      if (!POSTURES[msg.posture]) return deny('unknown posture');
      // Standing up needs the headroom for it.
      const need = POSTURES[msg.posture].cells;
      for (let i = 0; i < need; i++) {
        if (state.grid.blocksMove(t.cell[0], t.cell[1] + i, t.cell[2])) return deny('not enough headroom to do that here');
      }
      t.posture = msg.posture;
      return {};
    }

    case 'setFacing': {
      const t = tokenById(msg.id);
      if (!mayControl(role, t)) return deny('not your token');
      t.facing = Number(msg.facing) || 0;
      return {};
    }

    case 'addToken': {
      if (role !== 'gm') return deny('only the GM can add tokens');
      const id = 'n' + Math.random().toString(36).slice(2, 8);
      state.tokens.push({
        id, name: msg.name || 'Token', owner: msg.owner === 'player' ? 'player' : 'gm',
        cell: msg.cell, posture: 'stand', facing: 0, hp: 10, maxHp: 10, speed: 6, moveUsed: 0,
        color: msg.owner === 'player' ? '#57d9a3' : '#ff6b6b',
      });
      return { id };
    }

    case 'deleteToken': {
      if (role !== 'gm') return deny('only the GM can remove tokens');
      state.tokens = state.tokens.filter(t => t.id !== msg.id);
      return {};
    }

    case 'setHp': {
      if (role !== 'gm') return deny('only the GM can change hit points');
      const t = tokenById(msg.id);
      if (!t) return deny('no such token');
      t.hp = Math.max(0, Math.min(t.maxHp, Number(msg.hp)));
      return {};
    }

    case 'setRules': {
      if (role !== 'gm') return deny('only the GM can change the rules');
      Object.assign(state.rules, msg.rules || {});
      note(`rules: seam=${state.rules.seam}, corners=${state.rules.cornerRule}`);
      return {};
    }

    case 'endTurn': {
      if (role !== 'gm') return deny('only the GM advances the round');
      for (const t of state.tokens) t.moveUsed = 0;
      state.round++;
      note(`round ${state.round}`);
      return {};
    }

    case 'loadScenario': {
      if (role !== 'gm') return deny('only the GM can load a scenario');
      try { loadScenario(msg.name); } catch (e) { return deny('could not load: ' + e.message); }
      return {};
    }

    case 'saveScenario': {
      if (role !== 'gm') return deny('only the GM can save');
      const saved = saveScenario(msg.name);
      note(`saved as "${saved}"`);
      return { saved };
    }

    case 'clearFog': {
      if (role !== 'gm') return deny('only the GM can reveal the map');
      if (msg.reveal) for (const k of state.grid.cells.keys()) state.explored.add(k);
      else state.explored = new Set();
      return {};
    }

    // Read-only: explain one observer/target pair, with every ray it cast.
    //
    // This query is a potential information leak, so it is fenced on both ends.
    // Looking through an NPC's eyes would reveal that NPC's position, and asking
    // about a target the Player cannot see would leak its distance and elevation
    // even when the answer is "no line of sight".
    case 'explain': {
      const obs = tokenById(msg.observer);
      const tgt = tokenById(msg.target);
      if (!obs || !tgt) return deny('pick an observer and a target');
      if (role !== 'gm') {
        if (obs.owner !== 'player') return deny('you can only look through your own tokens');
        if (tgt.owner !== 'player' && !playerView().seenTokens.has(tgt.id)) {
          return deny('you have no contact with that target');
        }
      }
      const v = visibility(state.grid, obs, tgt, {
        tokens: state.tokens, debug: true, vision: { seam: state.rules.seam },
      });
      return { explain: { observer: obs.id, target: tgt.id, ...v } };
    }

    // Read-only: reachable cells for a token, for the move overlay.
    case 'reach': {
      const t = tokenById(msg.id);
      if (!t) return deny('no such token');
      if (role !== 'gm' && t.owner !== 'player') return deny('not your token');
      const budget = msg.full ? t.speed : t.speed - t.moveUsed;
      const reach = reachable(state.grid, t, budget, state.rules);
      return { reach: { id: t.id, cells: [...reach].map(([k, v]) => [k, Number(v.cost.toFixed(2)), v.fall]) } };
    }

    default:
      return deny('unknown action: ' + msg.action);
  }
}

// ---------------------------------------------------------------------------
// http + websocket
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
};

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';

  const routes = [
    ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
    ['/shared/', path.join(ROOT, 'shared')],
    ['', path.join(ROOT, 'public')],
  ];
  for (const [prefix, base] of routes) {
    if (!p.startsWith(prefix || '/')) continue;
    const rel = p.slice(prefix.length);
    const file = path.join(base, rel);
    if (!file.startsWith(base)) { res.writeHead(403); res.end('no'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server });
const clients = new Map(); // ws -> role

function rolesTaken() {
  const taken = new Set(clients.values());
  return { gm: taken.has('gm'), player: taken.has('player') };
}

function broadcast() {
  for (const [ws, role] of clients) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(snapshot(role)));
  }
}

wss.on('connection', (ws, req) => {
  const want = new URL(req.url, 'http://localhost').searchParams.get('role');
  const taken = rolesTaken();
  let role = 'spectator';
  if (want === 'gm' && !taken.gm) role = 'gm';
  else if (want === 'player' && !taken.player) role = 'player';
  else if (!taken.gm && want !== 'player') role = 'gm';
  else if (!taken.player) role = 'player';

  clients.set(ws, role);
  note(`${role} connected`);
  ws.send(JSON.stringify({ type: 'hello', role, requested: want }));
  broadcast();

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const result = applyAction(role, msg) || {};
    // Read-only queries answer just the asker; anything else moves the world.
    const readOnly = msg.action === 'explain' || msg.action === 'reach';
    ws.send(JSON.stringify({ type: 'result', for: msg.action, nonce: msg.nonce, ...result }));
    if (!readOnly && !result.error) broadcast();
  });

  ws.on('close', () => { clients.delete(ws); note(`${role} disconnected`); broadcast(); });
});

loadScenario(process.env.SCENARIO || 'warehouse');

server.listen(PORT, () => {
  const nets = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log(`\n  Tabletop host running`);
  console.log(`  GM      http://localhost:${PORT}/?role=gm`);
  console.log(`  Player  http://localhost:${PORT}/?role=player`);
  for (const ip of nets) console.log(`  LAN     http://${ip}:${PORT}/?role=player`);
  console.log('');
});
