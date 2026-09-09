// three.js presentation layer. Knows nothing about rules - it draws whatever the
// server said, plus the overlays that make the geometry legible.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VOXEL_KINDS, HALF_HEIGHT } from '/shared/grid.js';
import { POSTURES } from '/shared/vision.js';

const UNSEEN_TINT = new THREE.Color('#2a2f38');   // explored but not currently visible
const CUBE = new THREE.BoxGeometry(1, 1, 1);
const HALF_CUBE = new THREE.BoxGeometry(1, HALF_HEIGHT, 1);

export class Stage {
  constructor(canvas, pipCanvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.pip = new THREE.WebGLRenderer({ canvas: pipCanvas, antialias: true });
    this.pip.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#14161a');
    this.scene.fog = new THREE.Fog('#14161a', 45, 110);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.camera.position.set(26, 24, 34);

    this.eyeCam = new THREE.PerspectiveCamera(75, 260 / 168, 0.05, 300);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.maxPolarAngle = Math.PI * 0.495;   // never go below the floor
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.target.set(13, 1, 13);

    // lighting: one key light plus hemisphere, enough to read shape without drama
    const hemi = new THREE.HemisphereLight('#b9d5ff', '#2b2f38', 0.85);
    const key = new THREE.DirectionalLight('#fff4e6', 1.15);
    key.position.set(18, 30, 10);
    this.scene.add(hemi, key, new THREE.AmbientLight('#4a5266', 0.5));

    this.world = new THREE.Group();          // voxels
    this.tokenGroup = new THREE.Group();
    this.overlay = new THREE.Group();        // reach, rays, cone, cursor
    this.scene.add(this.world, this.tokenGroup, this.overlay);

    this.kindMeshes = new Map();   // kind -> { mesh, wire, cells }
    this.tokenObjects = new Map(); // id -> Group
    this.hiddenForPip = [];

    this.buildPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this.buildPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.buildPlane);

    this.gridHelper = null;
    this.raycaster = new THREE.Raycaster();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pip.setSize(260, 168, false);
  }

  setGridSize(size) {
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    const n = Math.max(size.x, size.z);
    this.gridHelper = new THREE.GridHelper(n, n, '#333a45', '#262c35');
    this.gridHelper.position.set(size.x / 2, 1.002, size.z / 2);
    this.scene.add(this.gridHelper);
    this.controls.target.set(size.x / 2, 1, size.z / 2);
  }

  setBuildLevel(y) { this.buildPlane.position.y = y; }

  // -------------------------------------------------------------------------
  // voxels
  // -------------------------------------------------------------------------

  /**
   * voxels: [[x,y,z,kind], ...]
   * lit:    Set of "x,y,z" currently visible, or null to light everything
   */
  setVoxels(voxels, lit) {
    const byKind = new Map();
    for (const v of voxels) {
      if (!byKind.has(v[3])) byKind.set(v[3], []);
      byKind.get(v[3]).push(v);
    }

    for (const [kind, spec] of Object.entries(VOXEL_KINDS)) {
      const list = byKind.get(kind) || [];
      let entry = this.kindMeshes.get(kind);

      if (!entry || entry.mesh.count < list.length || entry.capacity > list.length * 3 + 64) {
        if (entry) { this.world.remove(entry.mesh, entry.wire); entry.mesh.dispose(); entry.wire.dispose(); }
        const capacity = Math.max(list.length + 32, 64);
        const geo = kind === 'half' ? HALF_CUBE : CUBE;
        const transparent = kind === 'glass' || kind === 'smoke';
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({
          color: '#ffffff',
          transparent, opacity: kind === 'glass' ? 0.28 : kind === 'smoke' ? 0.55 : 1,
          depthWrite: !transparent,
        }), capacity);
        const wire = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
          color: '#0b0d11', wireframe: true, transparent: true, opacity: 0.35,
        }), capacity);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        mesh.frustumCulled = false; wire.frustumCulled = false;
        entry = { mesh, wire, cells: [], capacity, kind };
        this.kindMeshes.set(kind, entry);
        this.world.add(mesh, wire);
      }

      const base = new THREE.Color(spec.color);
      const m = new THREE.Matrix4();
      entry.cells = [];
      list.forEach((v, i) => {
        const [x, y, z] = v;
        const yOff = kind === 'half' ? HALF_HEIGHT / 2 : 0.5;
        m.makeTranslation(x + 0.5, y + yOff, z + 0.5);
        entry.mesh.setMatrixAt(i, m);
        entry.wire.setMatrixAt(i, m);
        const visible = !lit || lit.has(`${x},${y},${z}`);
        entry.mesh.setColorAt(i, visible ? base : UNSEEN_TINT);
        entry.cells.push([x, y, z]);
      });
      entry.mesh.count = entry.wire.count = list.length;
      entry.mesh.instanceMatrix.needsUpdate = true;
      entry.wire.instanceMatrix.needsUpdate = true;
      if (entry.mesh.instanceColor) entry.mesh.instanceColor.needsUpdate = true;
    }
  }

  // -------------------------------------------------------------------------
  // tokens
  // -------------------------------------------------------------------------

  setTokens(tokens, { selectedId, dimIds } = {}) {
    const alive = new Set();
    for (const t of tokens) {
      alive.add(t.id);
      let obj = this.tokenObjects.get(t.id);
      if (!obj) { obj = this.makeToken(t); this.tokenObjects.set(t.id, obj); this.tokenGroup.add(obj); }
      this.updateToken(obj, t, { selected: t.id === selectedId, dim: dimIds?.has(t.id) });
    }
    for (const [id, obj] of this.tokenObjects) {
      if (alive.has(id)) continue;
      this.tokenGroup.remove(obj);
      this.tokenObjects.delete(id);
    }
  }

  makeToken(t) {
    const g = new THREE.Group();
    const colour = new THREE.Color(t.color || '#ff6b6b');

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.5, 4, 12),
      new THREE.MeshLambertMaterial({ color: colour })
    );
    body.name = 'body';

    const base = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    base.rotation.x = -Math.PI / 2;
    base.name = 'base';

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.28, 12),
      new THREE.MeshBasicMaterial({ color: '#ffffff' })
    );
    arrow.rotation.z = -Math.PI / 2;
    arrow.name = 'arrow';

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.035, 8, 32),
      new THREE.MeshBasicMaterial({ color: '#6ea8fe' })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.name = 'ring';
    ring.visible = false;

    const label = makeLabel(t.name);
    label.name = 'label';

    g.add(body, base, arrow, ring, label);
    g.userData.tokenId = t.id;
    body.userData.tokenId = t.id;
    return g;
  }

  updateToken(obj, t, { selected, dim }) {
    const p = POSTURES[t.posture] || POSTURES.stand;
    const [x, y, z] = t.cell;
    obj.position.set(x + 0.5, y, z + 0.5);
    obj.userData.token = t;

    const body = obj.getObjectByName('body');
    // A capsule of total height h: radius 0.26 caps, so cylinder = h - 2r.
    const cyl = Math.max(0.06, p.height - 0.52);
    body.scale.set(1, cyl / 0.5, 1);
    body.position.y = p.height / 2;
    body.material.opacity = dim ? 0.35 : 1;
    body.material.transparent = !!dim;

    const arrow = obj.getObjectByName('arrow');
    arrow.position.set(Math.cos(t.facing || 0) * 0.46, Math.min(p.eye, p.height - 0.1), Math.sin(t.facing || 0) * 0.46);
    arrow.rotation.set(0, -(t.facing || 0), -Math.PI / 2);

    obj.getObjectByName('base').position.y = 0.02;
    obj.getObjectByName('ring').visible = !!selected;

    const label = obj.getObjectByName('label');
    label.position.y = p.height + 0.42;
    label.visible = !dim;
  }

  // -------------------------------------------------------------------------
  // overlays
  // -------------------------------------------------------------------------

  clearOverlay() {
    for (const c of [...this.overlay.children]) {
      this.overlay.remove(c);
      c.geometry?.dispose();
      if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
    }
  }

  // cells: [["x,y,z", cost, fall], ...]
  drawReach(cells) {
    if (!cells?.length) return;
    const geo = new THREE.PlaneGeometry(0.86, 0.86);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false,
    }), cells.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cells.length * 3), 3);
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const near = new THREE.Color('#6ea8fe'), far = new THREE.Color('#3d5f9e'), drop = new THREE.Color('#ffc857');
    const maxCost = Math.max(...cells.map(c => c[1]), 1);
    cells.forEach(([key, cost, fall], i) => {
      const [x, y, z] = key.split(',').map(Number);
      m.copy(rot).setPosition(x + 0.5, y + 0.03, z + 0.5);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, fall > 0 ? drop : near.clone().lerp(far, cost / maxCost));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 2;
    this.overlay.add(mesh);
  }

  // rays: [{from,to,blocked,hit,reason}]
  drawRays(rays) {
    if (!rays?.length) return;
    const pos = [], col = [];
    const clear = new THREE.Color('#57d9a3');
    const blocked = new THREE.Color('#ff6b6b');
    const fovOut = new THREE.Color('#6b7280');
    const marks = [];

    for (const r of rays) {
      const c = r.blocked ? (r.reason === 'occluded' ? blocked : fovOut) : clear;
      // A blocked ray is drawn only as far as the thing that stopped it, which
      // is the whole point: you can see where sight died.
      const end = r.hit?.point || r.to;
      pos.push(...r.from, ...end);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (r.hit?.point) marks.push(r.hit.point);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, depthTest: false,
    }));
    lines.renderOrder = 3;
    this.overlay.add(lines);

    if (marks.length) {
      const dots = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.045, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#ff6b6b', depthTest: false }),
        marks.length
      );
      const m = new THREE.Matrix4();
      marks.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); dots.setMatrixAt(i, m); });
      dots.instanceMatrix.needsUpdate = true;
      dots.renderOrder = 4;
      this.overlay.add(dots);
    }
  }

  // Highlight the voxel that stopped the most rays.
  drawBlocker(cell) {
    if (!cell) return;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.06, 1.06, 1.06),
      new THREE.MeshBasicMaterial({ color: '#ff6b6b', wireframe: true, depthTest: false })
    );
    box.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
    box.renderOrder = 4;
    this.overlay.add(box);
  }

  drawViewCone(token, vision) {
    const p = POSTURES[token.posture] || POSTURES.stand;
    const eye = new THREE.Vector3(token.cell[0] + 0.5, token.cell[1] + p.eye, token.cell[2] + 0.5);
    const half = (vision.fovYaw * Math.PI / 180) / 2;
    const r = Math.min(vision.range, 18);
    const segs = 28;
    const pos = [];
    for (let i = 0; i <= segs; i++) {
      const a = (token.facing || 0) - half + (2 * half * i) / segs;
      pos.push(eye.x, eye.y, eye.z, eye.x + Math.cos(a) * r, eye.y, eye.z + Math.sin(a) * r);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: '#6ea8fe', transparent: true, opacity: 0.22,
    }));
    this.overlay.add(lines);
  }

  drawCursor(cell, kind) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, kind === 'half' ? HALF_HEIGHT : 1, 1),
      new THREE.MeshBasicMaterial({ color: '#6ea8fe', transparent: true, opacity: 0.25 })
    );
    box.position.set(cell[0] + 0.5, cell[1] + (kind === 'half' ? HALF_HEIGHT / 2 : 0.5), cell[2] + 0.5);
    this.overlay.add(box);
  }

  drawPath(path) {
    if (!path?.length || path.length < 2) return;
    const pos = [];
    for (const [x, y, z] of path) pos.push(x + 0.5, y + 0.12, z + 0.5);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.overlay.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false })));
  }

  // -------------------------------------------------------------------------
  // picking
  // -------------------------------------------------------------------------

  pointerRay(ev) {
    const ndc = new THREE.Vector2(
      (ev.clientX / innerWidth) * 2 - 1,
      -(ev.clientY / innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  /** What is under the pointer? { token } | { cell, normal, kind } | { plane } | null */
  pick(ev, { includePlane = true } = {}) {
    const ray = this.pointerRay(ev);

    const tokenHits = ray.intersectObjects(this.tokenGroup.children, true);
    for (const h of tokenHits) {
      const id = h.object.userData.tokenId || h.object.parent?.userData.tokenId;
      if (id) return { type: 'token', id, point: h.point };
    }

    const voxelMeshes = [...this.kindMeshes.values()].filter(e => e.mesh.count > 0).map(e => e.mesh);
    const voxelHits = ray.intersectObjects(voxelMeshes, false);
    if (voxelHits.length) {
      const h = voxelHits[0];
      const entry = [...this.kindMeshes.values()].find(e => e.mesh === h.object);
      const cell = entry?.cells[h.instanceId];
      if (cell) {
        const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld));
        return {
          type: 'voxel', cell, kind: entry.kind, point: h.point,
          normal: [Math.round(n.x), Math.round(n.y), Math.round(n.z)],
        };
      }
    }

    if (includePlane) {
      const planeHit = ray.intersectObject(this.buildPlane, false)[0];
      if (planeHit) {
        return {
          type: 'plane',
          cell: [Math.floor(planeHit.point.x), Math.round(this.buildPlane.position.y), Math.floor(planeHit.point.z)],
          point: planeHit.point,
        };
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------

  setEyeView(token, vision) {
    this.eyeToken = token || null;
    this.eyeVision = vision;
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (!this.eyeToken || !this.pipEnabled) return;
    const t = this.eyeToken;
    const p = POSTURES[t.posture] || POSTURES.stand;
    this.eyeCam.fov = Math.min(this.eyeVision?.fovPitch ?? 100, 120);
    this.eyeCam.updateProjectionMatrix();
    this.eyeCam.position.set(t.cell[0] + 0.5, t.cell[1] + p.eye, t.cell[2] + 0.5);
    this.eyeCam.lookAt(
      t.cell[0] + 0.5 + Math.cos(t.facing || 0) * 4,
      t.cell[1] + p.eye,
      t.cell[2] + 0.5 + Math.sin(t.facing || 0) * 4
    );
    // Hide the observer's own body, otherwise the eye view is all torso.
    const own = this.tokenObjects.get(t.id);
    const wasVisible = own?.visible;
    if (own) own.visible = false;
    this.pip.render(this.scene, this.eyeCam);
    if (own) own.visible = wasVisible;
  }
}

function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(10,12,16,.72)';
  const w = g.measureText(text).width + 24;
  g.beginPath();
  g.roundRect((256 - w) / 2, 12, w, 40, 10);
  g.fill();
  g.fillStyle = '#e6e9ef';
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 5;
  return sprite;
}
