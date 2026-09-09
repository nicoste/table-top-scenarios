# Table Top Scenarios

A local-network 3D tabletop: one **GM** (full control) and one **Player** (their own
tokens only). The world is cubes on a 1×1×1 grid. It is a proof of concept, and
the thing it is really a proof of is the **geometry engine** — how sight, occlusion,
cover and movement behave in three dimensions.

```bash
npm install
npm start
```

- GM — <http://localhost:8080/?role=gm>
- Player — <http://localhost:8080/?role=player>

The console prints the LAN address for the second machine. Seats are exclusive:
the first GM connection takes the GM seat, the first Player connection takes the
Player seat, and anyone after that becomes a read-only spectator who sees the
Player's view.

```bash
npm test      # 29 tests: 23 geometry, 6 trust boundary
npm run demo  # prints the engine's answers to every 3D case, with numbers
```

`npm run demo` is the fastest way to judge the geometry without driving the UI:
it builds small synthetic maps and prints exposure percentages, cover grades and
the blocking voxel for each case — elevation gradients, the four voxel kinds side
by side, both seam policies, posture gating, and the field-of-view cutoff.

---

## The coordinate model

Integer cells `(x, y, z)` with **y up**. Cell `(x,y,z)` owns the world box
`[x,x+1] × [y,y+1] × [z,z+1]`.

There is no separate floor type. A token stands in an *empty* cell whose
neighbour below blocks movement — i.e. on top of a cube. That single decision
removes a whole class of ambiguity: "is the token in the floor cell or above it"
never comes up.

### Voxel kinds

The four kinds exist to span the full 2×2 matrix of *blocks sight* × *blocks
movement*, so the two concerns stay visibly independent instead of being
conflated into "wall".

| Kind | Blocks sight | Blocks movement | Occupies |
|---|---|---|---|
| `solid` | yes | yes | full cell |
| `glass` | no | yes | full cell |
| `smoke` | yes | no | full cell |
| `half` | below y+0.5 only | yes | lower half |

`half` is a crate or low wall: you can shoot over it but not walk through it.

### Postures

Posture is the hinge that couples sight to movement. It is not cosmetic.

| Posture | Body height | Eye height | Cells of clearance | Move cost |
|---|---|---|---|---|
| Standing | 1.8 | 1.6 | 2 | ×1 |
| Crouched | 1.0 | 0.8 | 1 | ×2 |
| Prone | 0.35 | 0.3 | 1 | ×4 |

Consequences that fall out for free:

- A **one-cube wall** is transparent to a standing token and opaque to a crouched
  one. Crouching is a real tactical choice, not a modifier.
- A **one-cell-high crawlspace** admits only crouched or prone tokens, because
  clearance and eye height come from the same table.
- **Standing up is refused** where there is no headroom for it.

---

## How sight works

### A bundle of rays, not one ray

A single centre-to-centre ray cannot distinguish "fully exposed" from "only the
top of the head is showing", and both of those are common and tactically
different. So each query casts **13 rays** from the observer's eye to a lattice of
points inside the target's body box, plus one explicitly at the target's own eye
height.

The fraction that get through grades the result:

| Rays through | Result |
|---|---|
| all | no cover |
| ≥ 50% | light cover |
| > 0 | heavy cover |
| none | total cover |

The query also reports `headVisible` and `bodyVisible` separately, so "I can see
their head over the crate but nothing else" is a fact the UI can state, and the
voxel that stopped the most rays is named.

Body sample points are **inset** from the body box, horizontally and vertically.
That is deliberate: it keeps sample points off the integer grid planes, so
degenerate coplanar rays never arise and do not need special-casing.

### Traversal, and the diagonal seam

Traversal is Amanatides & Woo 3D DDA, but the interesting part is what happens at
ties.

When two cubes touch only along a **diagonal edge**, the gap between them has zero
width. A ray aimed exactly at that edge passes through a hole of measure zero.
Naive DDA lets sight leak through — the classic *"I can see through the corner of
the wall"* bug. And it is not a rare case: centre-to-centre rays sit on half-integer
offsets, so they hit these seams constantly.

Whether the seam seals is a **rules question, not an implementation detail**, so it
is a setting rather than an accident:

- `strict` — grazing a solid at a seam blocks. Walls are airtight.
- `permissive` — only a real pass-through blocks. You can peek the diagonal.

Both are covered by tests that assert they *disagree*, so the policy cannot
silently stop mattering.

Occlusion is tested against each voxel's actual world box, not against "is the
cell full". That is what makes `half` work: a ray above y+0.5 crosses the cell but
misses the box.

### Field of view

A yaw limit plus a pitch limit, not a single cone. A cone of any sane angle makes
anything directly overhead invisible, which is wrong — people can look up. Default
120° horizontal, 140° vertical, 24 cells of range.

Below the **awareness radius** (1.8 cells) facing is ignored: you notice someone at
your shoulder regardless of which way you are turned.

### Tokens as occluders

Token bodies block sight, but the two ends of a query never occlude themselves —
otherwise a target would block every ray to its own sample points. A body in the
way is reported as cover with the screening token named.

---

## How movement works

- **Clearance** — the token's posture decides how many cells above its feet must be
  free.
- **Support** — the cell below the feet must block movement, or the token falls.
- **Landing** — entering a column resolves to a height: climb at most 1, fall at
  most 3, preferring the smallest change. Climbing also needs headroom in the
  column being *left*, so you cannot rise through a ceiling.
- **Diagonals** stay level and are subject to a corner policy that mirrors the
  sight seam, for the same geometric reason:
  - `seam` — a diagonal is impossible only when **both** orthogonal neighbours are
    blocked, i.e. the gap is a zero-width edge. Brushing one corner is allowed,
    because physically it is.
  - `strict` — the classic grid-VTT rule: both orthogonals must be open.

Reachability is Dijkstra over that step graph, so the move overlay is exactly the
set of cells the rules permit — cheaper cells brighter, drops highlighted.

---

## Fog of war is a trust boundary, not a shader

Visibility is computed **on the server**, and the Player is *sent a filtered world*:

- Unexplored geometry is never transmitted.
- NPCs the Player's tokens cannot currently see are not in the payload at all.
- Enemy hit points are stripped.
- Explored-but-not-currently-visible geometry is shaded rather than hidden, so the
  map accumulates instead of flickering.

Line-of-sight queries are fenced on both ends, because a read-only query is still
an information leak:

- You cannot look **through an NPC's eyes** (that would reveal its position).
- You cannot **range a target you have no contact with** — even the answer "no line
  of sight" would leak its distance and elevation.

Six tests hold that boundary in place. The GM can tick *"Shade what the Player
cannot see"* to view the world through the Player's fog without giving up control.

---

## Controls

| | |
|---|---|
| Orbit / zoom | right-drag, wheel |
| Modes | `1` select, `2` build, `3` vision |
| Select token | click it, or the list |
| Move | select, then click a highlighted cell |
| Turn | right-drag on the selected token, or `Q` / `E` |
| Cycle posture | `C` |
| Build | click a face to add on that side, `Alt`+click to remove |
| Build plane | the level slider — clicks on empty space land there |
| Explain a pair | vision mode, click observer then target |

The **eye view** inset renders from the selected observer's eye at its real eye
height and FOV. It is the honest check on the whole engine: if the ray maths and
the picture ever disagree, you can see it immediately.

---

## Files

```
shared/grid.js       voxel world, kinds, serialisation
shared/vision.js     DDA traversal, seam policy, ray bundles, cover, FOV
shared/movement.js   clearance, support, landing, corner policy, Dijkstra
server.js            state, permissions, server-side fog, static host
public/scene.js      three.js rendering and picking
public/app.js        networking, UI, the explanation panel
tools/gen-warehouse.mjs   builds the demo map
tools/demo-3d.mjs         prints the 3D geometry report
test/geometry.test.js     the 3D claims above, asserted
test/server.test.js       the trust boundary, asserted
```

`shared/` is imported unchanged by both the server and the browser, so the client
previews with exactly the code that adjudicates.

## The demo map

Each region of `scenarios/warehouse.json` exists to exercise one question:

| Where | Tests |
|---|---|
| low wall, x=10, z=2–8 | 1 cube: see over standing, not crouched |
| tall wall, x=10, z=11–18 | 2 cubes: needs elevation |
| glass at 10,1–2,14 | sight through a movement blocker |
| cubes at 15,1,5 and 16,1,6 | the diagonal seam, both policies |
| pillars | graded cover vs. distance off-axis |
| crate row, z=21 | half-height: shoot over, cannot pass |
| catwalk at y=4 with a hole | vertical occlusion both ways |
| crawlspace, z=5–6 | posture-gated movement |
| smoke at 19–20 | movement through a sight blocker |

## Limits, and what I would do next

Honest about what this does not do:

- **No lighting model.** Visibility ignores illumination entirely — no darkness, no
  light sources, no low-light vision. This is the biggest missing axis, and the
  ray bundle is the right place to add it: attenuate per-sample rather than
  gate per-target.
- **No initiative or actions.** There is a round counter and a movement budget;
  there is no turn order, no attacks, no conditions.
- **Fog is per-side, not per-token.** The Player's tokens share one explored set.
- **No sound propagation**, which on a voxel grid is a genuinely interesting dual
  of the sight problem — it goes *around* corners instead of stopping at them.
- **Whole-state broadcast** on every change. Fine at this scale, wrong at ten times
  it.
- **Cover grading is a ray count**, so it is sensitive to the sample lattice.
  `quality: fast | normal | fine` trades rays for stability; `normal` (13) is the
  default.
