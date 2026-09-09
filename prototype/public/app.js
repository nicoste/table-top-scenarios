import { Stage } from '/scene.js';
import { VOXEL_KINDS, KIND_NAMES } from '/shared/grid.js';
import { POSTURES, DEFAULT_VISION } from '/shared/vision.js';

const $ = sel => document.querySelector(sel);
const el = id => document.getElementById(id);

const stage = new Stage(el('view'), el('pipView'));
stage.pipEnabled = true;

const ui = {
  role: 'spectator',
  mode: 'select',
  kind: 'solid',
  level: 1,
  selectedId: null,
  observerId: '',
  targetId: '',
  reach: null,       // { id, cells }
  explain: null,
  hoverCell: null,
  showPlayerFog: false,
};

let state = null;

// ---------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------

const wantedRole = new URLSearchParams(location.search).get('role') || 'gm';
let ws, pending = new Map(), nonce = 0;

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?role=${wantedRole}`);
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'hello') {
      ui.role = msg.role;
      document.body.classList.toggle('role-gm', msg.role === 'gm');
      const badge = el('roleBadge');
      badge.textContent = msg.role === 'gm' ? 'Game Master' : msg.role === 'player' ? 'Player' : 'Spectator';
      badge.className = 'badge ' + msg.role;
      if (msg.requested && msg.requested !== msg.role) {
        toast(`"${msg.requested}" is already taken — you are the ${msg.role}`);
      }
      return;
    }
    if (msg.type === 'state') { state = msg; onState(); return; }
    if (msg.type === 'result') {
      if (msg.error) toast(msg.error);
      if (msg.reach) { ui.reach = msg.reach; redrawOverlay(); }
      if (msg.explain) { ui.explain = msg.explain; renderExplain(); redrawOverlay(); }
      if (msg.path) stage.drawPath(msg.path);
      pending.get(msg.nonce)?.(msg);
      pending.delete(msg.nonce);
    }
  };
  ws.onclose = () => { toast('disconnected — retrying'); setTimeout(connect, 1500); };
}

function send(action, extra = {}) {
  if (ws?.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ action, nonce: ++nonce, ...extra }));
}

// ---------------------------------------------------------------------------
// state -> view
// ---------------------------------------------------------------------------

function onState() {
  stage.setGridSize(state.size);
  el('scenarioName').textContent = state.scenarioName;
  el('roundLabel').textContent = `round ${state.round}`;

  // Fog: the Player always sees a filtered world. The GM can opt into the same
  // shading to check what the Player is being shown.
  const lit = (ui.role === 'player' || ui.showPlayerFog)
    ? new Set(state.playerVisibleCells) : null;
  stage.setVoxels(state.voxels, lit);

  const seen = new Set(state.playerSeenTokens);
  const dim = new Set();
  if (ui.role === 'gm' && ui.showPlayerFog) {
    for (const t of state.tokens) if (!seen.has(t.id)) dim.add(t.id);
  }
  stage.setTokens(state.tokens, { selectedId: ui.selectedId, dimIds: dim });

  if (ui.selectedId && !state.tokens.some(t => t.id === ui.selectedId)) ui.selectedId = null;

  renderTokenList();
  renderSelected();
  renderPickers();
  renderContacts();
  renderLog();
  renderScenarioList();
  syncRules();

  if (ui.selectedId) send('reach', { id: ui.selectedId });
  else { ui.reach = null; redrawOverlay(); }

  if (ui.observerId && ui.targetId) send('explain', { observer: ui.observerId, target: ui.targetId });

  const eye = state.tokens.find(t => t.id === (ui.observerId || ui.selectedId));
  stage.setEyeView(eye, { ...DEFAULT_VISION, ...(eye?.vision || {}) });
  el('pipLabel').textContent = eye ? `eye view — ${eye.name} (${POSTURES[eye.posture].label.toLowerCase()})` : 'eye view';
}

function redrawOverlay() {
  stage.clearOverlay();
  if (ui.mode === 'build' && ui.hoverCell) stage.drawCursor(ui.hoverCell, ui.kind);
  if (ui.mode === 'select' && ui.reach && ui.reach.id === ui.selectedId) stage.drawReach(ui.reach.cells);
  if (ui.mode === 'vision' || ui.explain) {
    if (el('showRays').checked && ui.explain?.rays) stage.drawRays(ui.explain.rays);
    if (ui.explain?.primaryBlocker?.cell) stage.drawBlocker(ui.explain.primaryBlocker.cell);
  }
  if (el('showCone').checked) {
    const obs = state?.tokens.find(t => t.id === (ui.observerId || ui.selectedId));
    if (obs) stage.drawViewCone(obs, { ...DEFAULT_VISION, ...(obs.vision || {}) });
  }
}

// ---------------------------------------------------------------------------
// panels
// ---------------------------------------------------------------------------

function renderTokenList() {
  const seen = new Set(state.playerSeenTokens);
  el('tokenList').innerHTML = state.tokens.map(t => {
    const mine = t.owner === 'player';
    const unseen = ui.role === 'gm' && ui.showPlayerFog && !seen.has(t.id);
    const hp = t.hp != null ? `${t.hp}/${t.maxHp}` : '·';
    const left = Math.max(0, t.speed - (t.moveUsed || 0));
    return `<li data-id="${t.id}" class="${t.id === ui.selectedId ? 'on' : ''} ${unseen ? 'unseen' : ''}">
      <span class="dot" style="background:${t.color}"></span>
      <span class="nm">${escape(t.name)}</span>
      <span class="meta">${mine ? 'PC' : 'NPC'} · ${hp} · ${left.toFixed(0)}mv</span>
    </li>`;
  }).join('');
  for (const li of el('tokenList').children) {
    li.onclick = () => { select(li.dataset.id); };
  }
}

function renderSelected() {
  const t = state.tokens.find(x => x.id === ui.selectedId);
  const info = el('selInfo');
  const seg = el('postureSeg');
  if (!t) {
    info.textContent = 'nothing selected';
    info.className = 'muted';
    seg.innerHTML = '';
    el('facingHint').hidden = true;
    return;
  }
  const p = POSTURES[t.posture];
  const controllable = ui.role === 'gm' || t.owner === 'player';
  info.className = '';
  info.innerHTML = `<b>${escape(t.name)}</b> at ${t.cell.join(', ')}
    <div class="muted">eye height ${p.eye} · needs ${p.cells} cell${p.cells > 1 ? 's' : ''} clearance
    · ${Math.max(0, t.speed - (t.moveUsed || 0)).toFixed(1)} of ${t.speed} movement left</div>`;

  seg.innerHTML = Object.entries(POSTURES).map(([k, v]) =>
    `<button data-posture="${k}" class="${t.posture === k ? 'on' : ''}" ${controllable ? '' : 'disabled'}>${v.label}</button>`
  ).join('');
  for (const b of seg.children) {
    b.onclick = () => send('setPosture', { id: t.id, posture: b.dataset.posture });
  }
  el('facingHint').hidden = !controllable;
}

function renderPickers() {
  for (const [id, key] of [['obsPick', 'observerId'], ['tgtPick', 'targetId']]) {
    const sel = el(id);
    const prev = ui[key];
    sel.innerHTML = '<option value="">—</option>' + state.tokens.map(t =>
      `<option value="${t.id}" ${t.id === prev ? 'selected' : ''}>${escape(t.name)}</option>`
    ).join('');
  }
}

function renderContacts() {
  const box = el('contacts');
  if (!state.contacts?.length) { box.innerHTML = '<span class="muted">no enemy in sight</span>'; return; }
  const name = id => state.tokens.find(t => t.id === id)?.name || id;
  box.innerHTML = state.contacts.map(c =>
    `<div><b>${escape(name(c.observer))}</b> sees ${escape(name(c.target))}
     <span class="muted">— ${coverLabel(c.cover)}, ${Math.round(c.fraction * 100)}% exposed${c.headVisible && c.fraction < 0.5 ? ', head only' : ''}</span></div>`
  ).join('');
}

function renderLog() {
  el('log').innerHTML = (state.log || []).map(l => `<li>${escape(l.text)}</li>`).join('');
}

function coverLabel(c) {
  return { clear: 'no cover', light: 'light cover', heavy: 'heavy cover', total: 'total cover' }[c] || c;
}

// The explanation panel: the whole reason this thing exists. It reports not just
// the verdict but the geometry that produced it.
function renderExplain() {
  const e = ui.explain;
  const box = el('explain');
  if (!e) { box.innerHTML = 'Pick two tokens to see how the engine reasons about them.'; return; }
  const obs = state.tokens.find(t => t.id === e.observer);
  const tgt = state.tokens.find(t => t.id === e.target);
  if (!obs || !tgt) { box.innerHTML = '<span class="muted">token gone</span>'; return; }

  const pct = Math.round(e.fraction * 100);
  const reasons = {
    visible: 'clear line of sight to at least part of the body',
    occluded: 'every ray hit something',
    'out-of-fov': 'the target is outside the horizontal view arc',
    'out-of-pitch': 'the target is outside the vertical view arc',
    'out-of-range': 'beyond sight range',
  };

  let why = reasons[e.reason] || e.reason;
  if (e.primaryBlocker?.cell) {
    const k = e.primaryBlocker.kind;
    why += ` — mostly stopped by the ${VOXEL_KINDS[k]?.label.toLowerCase() || k} at ${e.primaryBlocker.cell.join(', ')}`;
  } else if (e.primaryBlocker?.tokenId) {
    const b = state.tokens.find(t => t.id === e.primaryBlocker.tokenId);
    why += ` — mostly screened by ${escape(b?.name || 'another token')}`;
  }
  if (e.headVisible && !e.bodyVisible) why += '. Only the head is exposed.';
  if (!e.headVisible && e.bodyVisible) why += '. The head is hidden but the body is not.';
  if (e.elevation) why += ` ${escape(tgt.name)} is ${Math.abs(e.elevation)} cell${Math.abs(e.elevation) > 1 ? 's' : ''} ${e.elevation > 0 ? 'above' : 'below'}.`;

  box.innerHTML = `
    <div class="verdict ${e.cover}">${coverLabel(e.cover)}</div>
    <div class="muted">${escape(obs.name)} → ${escape(tgt.name)}</div>
    <div class="bar"><i style="width:${pct}%;background:${pct > 99 ? 'var(--ok)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)'}"></i></div>
    <dl>
      <dt>exposed</dt><dd>${pct}% (${e.visibleSamples}/${e.samples} rays)</dd>
      <dt>distance</dt><dd>${e.distance.toFixed(1)} cells (grid ${e.gridDistance})</dd>
      <dt>elevation</dt><dd>${e.elevation > 0 ? '+' : ''}${e.elevation}</dd>
      <dt>head</dt><dd>${e.headVisible ? 'visible' : 'hidden'}</dd>
      <dt>body</dt><dd>${e.bodyVisible ? 'visible' : 'hidden'}</dd>
      <dt>posture</dt><dd>${POSTURES[obs.posture].label} → ${POSTURES[tgt.posture].label}</dd>
    </dl>
    <div class="why">${why}</div>`;
}

function syncRules() {
  el('seam').value = state.rules.seam || 'strict';
  el('cornerRule').value = state.rules.cornerRule || 'seam';
}

// ---------------------------------------------------------------------------
// interaction
// ---------------------------------------------------------------------------

function select(id) {
  ui.selectedId = id === ui.selectedId ? null : id;
  if (ui.selectedId && !ui.observerId) { ui.observerId = ui.selectedId; el('obsPick').value = ui.selectedId; }
  if (state) { renderTokenList(); renderSelected(); }
  if (ui.selectedId) send('reach', { id: ui.selectedId });
  else { ui.reach = null; redrawOverlay(); }
  const eye = state?.tokens.find(t => t.id === (ui.observerId || ui.selectedId));
  stage.setEyeView(eye, { ...DEFAULT_VISION, ...(eye?.vision || {}) });
  maybeExplain();
}

function maybeExplain() {
  if (ui.observerId && ui.targetId) send('explain', { observer: ui.observerId, target: ui.targetId });
  else { ui.explain = null; renderExplain(); redrawOverlay(); }
}

const canvas = el('view');

canvas.addEventListener('pointermove', ev => {
  if (ui.mode !== 'build') return;
  const hit = stage.pick(ev);
  const cell = hit ? targetCellFor(hit, ev) : null;
  const changed = String(cell) !== String(ui.hoverCell);
  ui.hoverCell = cell;
  if (changed) redrawOverlay();
});

// In build mode a click on a face adds the cube on that side; a click on the
// build plane adds at the chosen level.
function targetCellFor(hit, ev) {
  if (hit.type === 'voxel') {
    if (ev.altKey) return hit.cell;
    return [hit.cell[0] + hit.normal[0], hit.cell[1] + hit.normal[1], hit.cell[2] + hit.normal[2]];
  }
  if (hit.type === 'plane') return hit.cell;
  return null;
}

canvas.addEventListener('pointerdown', ev => {
  if (ev.button !== 0) return;
  const hit = stage.pick(ev);

  if (ui.mode === 'build' && ui.role === 'gm') {
    if (!hit) return;
    if (ev.altKey) {
      if (hit.type === 'voxel') send('setVoxel', { x: hit.cell[0], y: hit.cell[1], z: hit.cell[2], kind: null });
      return;
    }
    const c = targetCellFor(hit, ev);
    if (c) send('setVoxel', { x: c[0], y: c[1], z: c[2], kind: ui.kind });
    return;
  }

  if (!hit) { select(null); return; }

  if (hit.type === 'token') {
    if (ui.mode === 'vision') {
      // In vision mode clicking assigns observer, then target.
      if (!ui.observerId || (ui.observerId && ui.targetId)) { ui.observerId = hit.id; ui.targetId = ''; }
      else ui.targetId = hit.id;
      el('obsPick').value = ui.observerId;
      el('tgtPick').value = ui.targetId;
      maybeExplain();
      return;
    }
    select(hit.id);
    return;
  }

  // Clicking the world with a token selected is a move order.
  if (ui.selectedId && ui.mode === 'select') {
    const dest = hit.type === 'voxel'
      ? [hit.cell[0] + hit.normal[0], hit.cell[1] + hit.normal[1], hit.cell[2] + hit.normal[2]]
      : hit.cell;
    const key = dest.join(',');
    const ok = ui.reach?.cells.some(c => c[0] === key);
    if (!ok && ui.role !== 'gm') { toast('out of reach'); return; }
    send('moveToken', { id: ui.selectedId, cell: dest });
  }
});

// Right-drag on a selected token turns it.
let turning = null;
canvas.addEventListener('pointerdown', ev => {
  if (ev.button !== 2 || !ui.selectedId) return;
  const hit = stage.pick(ev, { includePlane: false });
  if (hit?.type === 'token' && hit.id === ui.selectedId) {
    turning = { id: hit.id };
    stage.controls.enabled = false;
    ev.stopPropagation();
  }
}, true);

addEventListener('pointermove', ev => {
  if (!turning) return;
  const hit = stage.pick(ev);
  const t = state?.tokens.find(x => x.id === turning.id);
  if (!hit?.point || !t) return;
  const facing = Math.atan2(hit.point.z - (t.cell[2] + 0.5), hit.point.x - (t.cell[0] + 0.5));
  send('setFacing', { id: t.id, facing });
});

addEventListener('pointerup', () => { if (turning) { turning = null; stage.controls.enabled = true; } });
canvas.addEventListener('contextmenu', ev => ev.preventDefault());

addEventListener('keydown', ev => {
  if (ev.target.matches('input,select,textarea')) return;
  const t = state?.tokens.find(x => x.id === ui.selectedId);
  if ((ev.key === 'q' || ev.key === 'e') && t) {
    send('setFacing', { id: t.id, facing: (t.facing || 0) + (ev.key === 'q' ? -Math.PI / 8 : Math.PI / 8) });
  }
  if (ev.key === 'c' && t) {
    const order = ['stand', 'crouch', 'prone'];
    send('setPosture', { id: t.id, posture: order[(order.indexOf(t.posture) + 1) % 3] });
  }
  if (ev.key === 'Escape') select(null);
  if (ev.key >= '1' && ev.key <= '3') setMode(['select', 'build', 'vision'][+ev.key - 1]);
  if (ev.key === 'Delete' && t && ui.role === 'gm') send('deleteToken', { id: t.id });
});

// ---------------------------------------------------------------------------
// controls
// ---------------------------------------------------------------------------

function setMode(m) {
  if (m === 'build' && ui.role !== 'gm') return;
  ui.mode = m;
  for (const b of el('modeSeg').children) b.classList.toggle('on', b.dataset.mode === m);
  el('buildPanel').hidden = m !== 'build';
  ui.hoverCell = null;
  redrawOverlay();
}
for (const b of el('modeSeg').children) b.onclick = () => setMode(b.dataset.mode);

el('kindList').innerHTML = KIND_NAMES.map(k =>
  `<button data-kind="${k}" class="${k === ui.kind ? 'on' : ''}" title="${VOXEL_KINDS[k].hint}">
     <span class="swatch" style="background:${VOXEL_KINDS[k].color}"></span>${VOXEL_KINDS[k].label}
   </button>`
).join('');
for (const b of el('kindList').children) {
  b.onclick = () => {
    ui.kind = b.dataset.kind;
    for (const o of el('kindList').children) o.classList.toggle('on', o === b);
    redrawOverlay();
  };
}

el('level').oninput = e => {
  ui.level = +e.target.value;
  el('levelOut').textContent = ui.level;
  stage.setBuildLevel(ui.level);
  redrawOverlay();
};
stage.setBuildLevel(1);

el('obsPick').onchange = e => { ui.observerId = e.target.value; maybeExplain(); onEyeChange(); };
el('tgtPick').onchange = e => { ui.targetId = e.target.value; maybeExplain(); };
el('showRays').onchange = redrawOverlay;
el('showCone').onchange = redrawOverlay;

function onEyeChange() {
  const eye = state?.tokens.find(t => t.id === (ui.observerId || ui.selectedId));
  stage.setEyeView(eye, { ...DEFAULT_VISION, ...(eye?.vision || {}) });
  el('pipLabel').textContent = eye ? `eye view — ${eye.name}` : 'eye view';
}

el('seam').onchange = e => send('setRules', { rules: { seam: e.target.value } });
el('cornerRule').onchange = e => send('setRules', { rules: { cornerRule: e.target.value } });
el('revealAll').onclick = () => send('clearFog', { reveal: true });
el('resetFog').onclick = () => send('clearFog', { reveal: false });
el('showPlayerFog').onchange = e => { ui.showPlayerFog = e.target.checked; if (state) onState(); };
el('endTurn').onclick = () => send('endTurn');

el('addPlayerToken').onclick = () => addTokenAt('player');
el('addGmToken').onclick = () => addTokenAt('gm');
function addTokenAt(owner) {
  const cell = ui.hoverCell || [Math.floor(state.size.x / 2), 1, Math.floor(state.size.z / 2)];
  send('addToken', { owner, cell, name: owner === 'player' ? 'PC' : 'NPC' });
}

el('loadScenario').onclick = () => send('loadScenario', { name: el('scenarioPick').value });
el('saveScenario').onclick = () => send('saveScenario', { name: el('saveName').value });

el('pipToggle').onclick = () => {
  const p = el('pip');
  p.classList.toggle('collapsed');
  stage.pipEnabled = !p.classList.contains('collapsed');
  el('pipToggle').textContent = stage.pipEnabled ? 'hide' : 'show';
};

// keep the scenario dropdown fresh without stomping the current choice
let scenariosRendered = '';
function renderScenarioList() {
  const list = (state.scenarios || []).join(',');
  if (list === scenariosRendered) return;
  scenariosRendered = list;
  el('scenarioPick').innerHTML = (state.scenarios || []).map(s => `<option>${escape(s)}</option>`).join('');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

let toastTimer;
function toast(text) {
  const t = el('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Debug handle. Only ever holds what the server actually sent to this role, so
// it reveals nothing the client was not already given - handy for checking that
// the Player really is being kept in the dark.
Object.defineProperty(window, 'tabletop', { get: () => ({ ui, state, stage }) });

(function loop() {
  requestAnimationFrame(loop);
  stage.render();
})();

connect();
