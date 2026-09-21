# Architecture

The authoritative description of how this project is built. Read
[GLOSSARY.md](GLOSSARY.md) first; every term below is defined there.

Rules are numbered `R-n` so they can be cited in review and superseded by a
decision in [DECISIONS.md](DECISIONS.md). If code and this document disagree,
the document is right and the code is a bug.

---

## 0. The decision protocol

> **R-0.** No architectural choice may be made silently. If a choice is already
> covered by a rule here, proceed and cite it. If it is not, stop, state the
> choice and its alternatives, agree on it, and record it as a numbered entry in
> `DECISIONS.md` — then proceed. Decisions are never edited in place; a wrong
> rule is **superseded** by a later numbered decision so the reasoning survives.

This applies to anyone working in the repo, human or model. The failure mode
this exists to prevent is a codebase whose shape nobody chose.

---

## 1. What this is, and what it refuses to be

A table tool for a group sitting in one room, on two screens: a **GM console**
and a **table display**. It represents space, sight and persistent world state —
the things that are genuinely hard to hold in your head.

> **R-1.** The tool models state, never adjudication. If the people at the table
> can decide something faster than they can type it, the tool does not model it.

Explicitly out of scope, permanently: dice, initiative order, damage, conditions,
spell effects, character sheets, rules lookup, chat, voice, accounts.

Explicitly in scope: 3D space, line of sight and cover, world/place navigation,
travel time, world building, point of interest building, discovery, persistence.

> **R-2.** Every feature request is answered first with "is this off-tool?" A
> feature that resolves something humans enjoy resolving is rejected on purpose.

See also **R-39**: the GM sitting beside the players is a standing licence to
prefer an override over more precision.

---

## 2. Shape

Three deployables, one LAN, no cloud.

```
   GM console  ──┐                        ┌── reads/writes ── campaigns/*.json
  (browser)      │                        │
                 ├── WebSocket ──> host ──┤
  table display ─┘                (Node)  └── reads/writes ── saves/*.json
   (browser)
```

The host is the only authority. Both clients are views over snapshots it sends
them.

> **R-3.** The host owns all truth. Clients send *intents*, never state. A client
> may predict for responsiveness but the host's snapshot always wins.

> **R-4.** The table display is filtered **on the host**, not in the browser. A
> secret the players must not see is never transmitted. This is about preventing
> shoulder-reading, not defending against attackers — but the mechanism is the
> same and it is cheaper to do correctly from the start than to retrofit.

---

## 3. Packages

A monorepo of npm workspaces. Each package is a unit of *encapsulation*: it has a
declared dependency list and a single public entry point.

```
apps/
  host/          Node process: transport, session lifecycle, static serving
  gm/            GM console (browser)
  table/         Table display (browser)

packages/
  geometry/      pure spatial math. no I/O, no domain nouns
  domain/        the nouns and their invariants. pure data + pure functions
  protocol/      the wire contract: intents, snapshots, schemas, mappers
  sim/           authoritative simulation: apply intent -> new state, filter views
  persistence/   campaign & save stores, serialisation, schema migration
  render/        three.js: turns domain data into meshes
  ui/            presentational primitives. knows no domain
  client-core/   what both browser apps need: net, snapshot store, view stack,
                 and the snapshot -> render bridge. Role-neutral by rule.
```

### The dependency graph is the architecture

```
geometry   <-- domain   <-- protocol   <-- persistence
    ^           ^   ^          ^              ^
    |           |   |          |              |
    +--------- sim -+          |              |
                ^              |              |
                +------------ host -----------+

geometry <-- render <-- client-core <-- gm, table
domain   <-- render
protocol <-- client-core
ui       <-- gm, table
```

> **R-5.** These edges are exhaustive. Any import not implied by the graph is a
> build failure, not a discussion.

Consequences worth stating out loud, because they are the point:

- **`geometry` depends on nothing.** Not on three.js, not on `domain`. It is
  numbers in, numbers out, and it runs in a test in microseconds.
- **`sim` may not import `host`, `render`, `ui`, or any app.** It must run
  headless. If simulating a turn needs a canvas, the design is wrong.
- **`render` may not import `protocol`, `sim`, or `persistence`.** It renders
  domain data. It does not know a network exists.
- **`apps/table` may not import anything GM-only.** GM panels live in `apps/gm`
  and are therefore *unreachable* from the table display. The role split is
  enforced by the build, not by an `if`.
- **Nothing imports `apps/host`.**

### Enforcement — the teeth

Rules that aren't checked are decoration. All four run in CI and on pre-commit:

1. **`dependency-cruiser`** — *the authority on the graph.* `npm run arch`. The
   rules are generated from the same graph object above, are repo-root aware, and
   catch relative-path escapes (`../../other-package/src/...`) that nothing else
   can. A violation names the rule that failed:
   `error layer:table: apps/table/src/leak.ts → apps/gm/src/index.ts`.
2. **npm workspaces + `exports`.** Each `package.json` exposes only `"."`, so a
   deep path is not resolvable at runtime.
3. **TypeScript project references.** A package that isn't a declared dependency
   fails `npm run typecheck`.
4. **ESLint `no-restricted-imports`.** Narrow but exact: it catches deep imports
   written as package specifiers (`@tt/domain/src/index.js`). It deliberately
   does *not* police relative-path escapes — a depth heuristic cannot distinguish
   `../../index.js` inside one package from `../../other/src/index.js` across two.
   Rule 1 owns that case.

`npm run verify` runs all four plus tests. Verified at scaffold time: deliberately
importing `apps/gm` from `apps/table`, and `domain` from `geometry`, both fail.

> **R-6.** A package's public surface is its `index.ts` and nothing else.
> Everything else is `internal/` and invisible. Widening the surface is a
> decision, not a convenience.

> **R-7.** Adding a workspace, or an edge to the graph, requires a numbered
> decision. This is the rule that stops the graph rotting into a mesh.

---

## 4. The domain model

### Authored content and play state are separate stores

This is the most important structural decision in the project.

> **R-8.** A **campaign** holds authored content. A **save** holds play state and
> references its campaign by id *and* schema version. They are never mixed in one
> file. Saving a session must not fork the world; editing the world must not
> corrupt old saves.

```ts
// ---- authored: changes when the GM builds ----
Campaign {
  id: CampaignId
  schemaVersion: number
  name: string
  world: World
  party: PartyMember[]                             // definitions, not placements
  places: Place[]                                      // flat, not per chunk (R-118)
  points of interest: Map<EncounterId, EncounterMap>
}

// A party member is a *template*. The GM edits them once per campaign and
// instances them onto encounter maps later (R-91).
PartyMember {
  id: MemberId
  name: string                                     // starts as "player"
  colour: string                                   // rendered as a chess pawn
  visionRange: number                              // cells; default 12 (R-46a)
}

World {
  chunkBounds: { x: number; z: number }            // default 20 x 20
  cellScale: { metresPerCell: number }             // feeds travel
  chunks: SparseMap<ChunkCoord, Chunk>             // sparse: absent = unauthored
}

Chunk  { coord: ChunkCoord; terrain: ColumnGrid /* 30x30 */ }
Column {
  height: number                 // in cells; 0 = sea level
  terrainId: TerrainId           // from the palette; carries the default difficulty
  difficulty?: number            // per-cell override; absent = the terrain's default
}

Place {                          // one cell of the world map
  id: PlaceId
  name: string
  cell: CellXZ                   // exactly one cell (R-50). Footprint: see O-014.
  markerId: MarkerId             // cosmetic only (R-85)
  pois: Poi[]                    // ORDERED, GM sorts. What is *inside* the place.
  notes: PlaceNote[]             // ORDERED, GM sorts. See R-86.
}

Poi {                            // a church, a market, an arena (D-176)
  id: PoiId
  name: string
  visibleToParty: boolean        // false = never leaves the host (R-85)
}

PlaceNote {
  id: NoteId
  text: string
  visibleToParty: boolean        // false = never leaves the host (R-86)
}

EncounterMap {
  id: EncounterId
  name: string                   // "Market", "Main square", "Level 2"
  bounds: Vec3
  voxels: SparseVoxelGrid<MaterialId>
}

// ---- play state: changes during a session ----
Save {
  id: SaveId
  campaignId: CampaignId
  campaignSchemaVersion: number
  label: string
  savedAt: string
  party:     { at: MapRef }
  discovery: { chunks: Set<ChunkCoord>; places: Set<PlaceId> }
  points of interest: Map<EncounterId, EncounterState>
}

EncounterState {
  tokens: Token[]
  revealed: Set<CellKey>         // R-15: auto ∪ manual, minus manual hides
  overlay: SparseVoxelGrid<MaterialId | 'removed'>   // R-9: play-mode edits
}

Token {
  id: TokenId
  side: 'party' | 'gm'
  name: string
  labelVisible: boolean          // GM toggles; false = table display gets no name
  cell: Vec3
  notes: string                  // GM ONLY. never serialised into a table snapshot
  miniatureId: MiniatureId
}
// No posture (D-035), no facing (D-039), no speed or movement budget — nobody
// asked for one and moving a figure is off-tool (R-1).
```

> **R-9.** The GM is always in either **Build mode** or **Play mode**.
> Build-mode edits write to the **campaign**. Play-mode edits write a sparse
> **overlay** stored in the save. Loading a session is `campaign + overlay`.
>
> This is what makes the fake-wall case work: the GM removes a wall mid-session,
> the party sees it gone, and running the same dungeon for another group starts
> with the wall intact. An overlay entry referencing a cell the campaign no
> longer has is ignored, not an error.

### Ids are branded and stable

> **R-10.** Every id is a branded string type (`type PlaceId = string & {__poi:true}`).
> Never a raw `string`, never a number, never an array index.

> **R-11.** Registries are addressed by **stable string id** and are
> **append-only**. `material:mossy-stone`, never `materials[7]`. Renaming or
> reordering a registry entry is a migration, not an edit. This is the single
> most common way voxel projects corrupt saved maps.

---

## 5. One grid primitive, two scales

Chunk terrain is columnar (one contiguous column per cell). Encounter maps are
free-form voxels. A heightmap is a *constrained* sparse voxel grid, so:

> **R-12.** There is exactly one `VoxelGrid` implementation in `geometry`. The
> world builder is a *brush set* that maintains the column invariant; the
> point of interest builder is a brush set that does not. One data structure, one
> renderer, one serialiser, two toolsets.

---

## 5b. Scales

Two cell sizes, both explicit, both stored on the campaign rather than hardcoded.

| Scale | Size | Grid | Real extent |
|---|---|---|---|
| World cell | **1.5 km** | 30×30 per chunk | chunk = **45 km** ≈ 1.15 days on foot |
| World | — | 30×30 chunks (**default**, per campaign) | **1350 km** ≈ 35 days on foot |
| Height level | **150 m** | 0–30 | cap = a **4.5 km** mountain |
| Encounter cell | **1.5 m** (5 ft) | sparse, unbounded | — |

> **R-103.** World cell size is **1.5 km**, for two independent reasons: it is
> within 7% of the 5e DMG's *province scale* of one mile per hex — the finest
> scale any published map uses — and it is exactly **1000×** the encounter cell,
> so the two scales relate by a round factor.

> **R-104.** **Vertical scale is not horizontal scale.** Column height is counted
> in *levels* of 150 m, not in cell widths. Conflating them would make the
> 30-level cap a 45 km mountain. `World` carries both `metresPerCell` and
> `metresPerLevel`.

> **R-105.** World **bounds are a per-campaign setting**, defaulting to 30×30
> chunks. The bound exists so the `+` affordance (R-79) terminates and coordinates
> stay sane — not because any particular bound is a rule. Anything derived from it, such as where
> a new campaign's first chunk goes, is **computed from the bounds** rather than
> hardcoded.

> **R-25.** Encounter maps have **no hard maximum**. Storage is sparse, so cost
> tracks filled voxels, not the bounding volume. The budget that actually matters
> is **party fog**, which scales with filled voxels within vision range — not with
> map bounds. How those voxels are turned into triangles is deliberately *not*
> specified here: see R-69 and R-70.

> **R-26.** Multi-level dungeons are **separate linked encounter maps**, not one
> tall volume. A level is 5–10 cells tall; 200 cells is a 300 m tower. This keeps
> fog cheap and the editor sane.

> **R-27.** All body and eye heights are expressed in **metres**, and clearance is
> derived as `ceil(height / cellSize)`. Never store heights in cells — that
> silently couples the posture model to one cell size.

---

## 6. Addressing and navigation

> **R-13.** Every view is identified by a `MapRef`. Navigation is a stack of them.

```ts
type MapRef =
  | { kind: 'world' }
  | { kind: 'point of interest'; poiId: PlaceId; encounterId: EncounterId }
```

> **R-13a.** There are **two scales, not three.** The world is a single continuous
> map showing every `Known` chunk as it actually is, with all `Revealed` places
> visible. Zooming is *camera zoom* — it reveals no new information, so a chunk is
> not a view.
>
> A **chunk** remains the unit of **authoring** (a 30×30 block the GM creates) and
> of **knowledge** (`Known` / `Unknown`). It is simply not a place you navigate to.
> This removes a navigation level, a set of zoom clamps, and the question of what
> "simplified" would have meant.

Back navigation, deep links and "where is the party" all fall out of this. The
GM console and table display each hold their own stack — the GM may look at a
chunk while the table shows an point of interest.

> **R-14.** The GM may drive the table display's view, but the two stacks stay
> independent. The GM previewing a map must never change what the table shows
> unless the GM explicitly presents it.

---

## 6b. Camera and presentation

There is exactly one way to look at this tool: **a god view, orthographic, at a
stepped angle.** No first-person camera, no per-token view, ever.

> **R-29.** The projection is **orthographic**, not perspective. Cubes read at a
> consistent size everywhere, the grid stays legible at any zoom, distances can be
> judged by eye, and picking is uniform across the screen. Perspective buys
> nothing here and costs legibility.

> **R-30.** **One camera rig serves both scales.** World and point of interest differ only
> in what is loaded and in the zoom and pan clamps. Entering an encounter map is a
> `MapRef` change (R-13); moving around the world is plain camera work.

> **R-31.** Yaw is stepped (R-31a); pitch steps through a fixed set,
> **30/35/40/45/55/65/75°** — finely spaced around 45, the classic isometric
> angle where most work happens, then coarser as the view goes overhead, where a
> survey matters more than nuance. It stops at 75 because at 90 the camera sits
> directly above its focus and `lookAt` with a +Y up vector is degenerate.
>
> Free-orbit is deliberately not offered: stepped angles keep voxel geometry
> readable and the isometric depth cues consistent.

> **R-32.** The camera holds **no game state**. It is driven by a `CameraTarget`
> — focus point, zoom, yaw and pitch step — and knows nothing about tokens, fog,
> selection or turn state. A camera that knows about game state stops being a
> camera and becomes the place everything accumulates.

### Occlusion fade is a geometry query, not a camera feature

In a god view, geometry between the camera and the party must fade or the party
is invisible indoors. That is a spatial question, so it lives with the spatial code.

> **R-33.** "Which voxels lie between the camera and these tokens?" is a pure
> function in `geometry` (segment versus voxel set, with a radius). `render`
> consumes the answer and applies a fade material. `render` must not compute it,
> and the camera must not know it happened.

### Depth legibility

Orthographic projection's one genuine weakness is depth ambiguity: a tall near
cube and a short far cube can land on the same pixels. These are not polish.

> **R-34.** Every token renders a **ground stalk** — a vertical line from the
> token to the cell it occupies. In an isometric view a floating figure is
> genuinely ambiguous about which cell it stands on, and this removes the
> ambiguity for free.

> **R-35.** Encounter maps support a **view-height clamp**: render only up to
> level *N*. Without it a roofed or multi-level map cannot be seen into at all.
> The clamp is a view setting, never game state, and never affects visibility
> (R-15) — clamping the camera must not reveal anything.

> **R-36.** Picking resolves to the **frontmost non-faded surface**. Faded
> geometry (R-33) is not pickable, which is what makes clicking a token through a
> wall work.

> **R-36a.** **Picking must never depend on a frame having been drawn.** Anything
> that positions the camera for rendering also has to run before a raycast, from
> the same source of truth.
>
> `requestAnimationFrame` does not fire while the tab or pane is hidden, and a
> click can arrive before the first frame. A pick that borrows the render loop's
> camera then raycasts through a stale one and returns the wrong cell, or none —
> silently, because there is nothing to throw.

### Rendering strategy

> **R-69.** **Fog state is never baked into geometry.** It is a per-cube attribute
> the shader reads, so changing fog updates an attribute and never rebuilds a mesh.
>
> This is a hard rule because the obvious optimisation quietly breaks it. Greedy
> meshing merges adjacent cubes into single quads — but cubes in different fog
> states must look different, and fog changes on every token step. Bake fog into
> the mesh and you re-mesh continuously, which costs more than the meshing saved.

> **R-70.** Which meshing strategy `render` uses is an **internal detail** behind a
> stable seam: *here is the map, here is the fog state, draw it*. Nothing outside
> `render` may depend on how.
>
> Start with **`InstancedMesh` per material** and a per-instance fog attribute:
> one draw call per material, fog updates are an attribute write, and it is a few
> dozen lines. A couple of hundred thousand instances is well within three.js.
> Greedy meshing with a fog lookup texture is the optimisation to reach for **if
> measurement demands it** — and R-70 is what makes that swap a non-event.

---

---

## 6c. A place owns points of interest; a point of interest owns its maps

> **R-49.** A place holds an **ordered list of points of interest**, and each point
> of interest has **exactly one map**, created with it (D-178, D-187). A
> three-floor tavern is two or three points of interest — "tavern keep", "tavern
> underground" — sitting next to each other in that one list, not a nested tree.
>
> Third wording of this rule, and worth saying so. It first read "a place holds an
> ordered list of encounter maps", because place and point of interest were the
> same word. D-176 split them and moved maps down a level. D-178 then flattened
> it: one map each, because a single scannable list of everything in a place is
> the job the panel does, and ordering already groups a building's floors.
>
> It still **replaces** the ad-hoc map-to-map linking of D-023: the place *is* the
> container, so there is nothing to link. Navigation picks from a named list.
> Connectors ("the stairs at C7 lead to Level 2") are deliberately not modelled —
> the GM says so out loud (R-1, R-39).

> **R-118.** places are a **flat list on the campaign**, not a field on each chunk.
> "Every place" is then one read rather than a walk over chunks, a place can be found
> without knowing which chunk holds it, and moving one across a chunk boundary is
> a field change rather than a move between containers.

> **R-119.** **At most one place per cell.** Two would make the tap gesture (R-86)
> ambiguous, and R-50 already says a place is one cell.

> **R-50.** A place occupies **exactly one cell**. Multi-cell footprints are a
> wanted future feature — an "expand place" tool that assigns extra cells — and are
> deliberately not modelled yet (O-014). Building the single-cell case first keeps
> travel targeting, marker placement and the tap gesture unambiguous.

> **R-51.** A point of interest's map has **no geometric relationship to the world
> cell its place sits on**, and the tool never implies one. A place occupies one
> **1.5 km** cell (D-098); its market map may be 150 m across and its dungeon may
> be larger than the realm above it. An accepted abstraction, resolved by D-042
> and never surfaced in the UI.
>
> Originally worded as "a place's encounter maps" against a 200 m cell — both
> stale: the cell became 1.5 km in D-098, and maps moved down to points of
> interest in D-176/D-178.

---

## 6c2. World terrain

> **R-77.** Terrain is chosen from an append-only **palette**, not a colour
> picker. Each entry carries its own default difficulty, so painting geography
> paints travel cost at the same time.
>
> ```ts
> Terrain {
>   id: TerrainId               // stable string (R-11): terrain:swamp
>   name: string
>   colour: string
>   defaultDifficulty: number   // or 'impassable'
> }
> ```
>
> A column may **override** the difficulty it inherited (`Column.difficulty`), so
> the road through the swamp does not need its own terrain type.

> **R-78.** A new chunk is created **flat at height 0, entirely `terrain:water`**.
> The GM raises land out of the sea rather than starting from a blank plane, which
> makes "unfinished" and "ocean" the same state instead of two.

> **R-79.** The world view shows a **`+` affordance in every empty chunk slot
> adjacent to an existing chunk**, GM console only. A campaign begins with one
> chunk. The world therefore grows outward from where the GM started, and the
> table display never sees a `+`.

> **R-80.** Column height is capped at **30 levels** — a 4.5 km mountain at 150 m
> per level (R-104), roughly Mont Blanc. Stored on the campaign so it can be raised,
> but 20 is the default and the intended ceiling.

### Interaction

> **R-81.** Tapping a world cell or a place opens a **contextual action**, resolved
> against the party's position:
>
> | Target | Party is there | Party is elsewhere |
> |---|---|---|
> | place | **Enter** — pick from its encounter maps (R-49) | **Travel here** |
> | Plain cell | — | **Travel here** |
>
> One gesture, and the tool works out which of the two things you meant. The GM
> console's gestures are different — see R-86.

---

## 6c3. Places in the world view

> **R-82.** Markers are **cosmetic**. A castle, a cave and a forest differ only in
> which model is drawn; the tool attaches no meaning to the choice. The GM picks
> whatever best represents the place and the fiction lives off-tool.

> **R-83a.** A name label holds a **constant size on screen**, not in the world.
> A sprite under an orthographic camera is sized in world units, so a label that
> reads well at one zoom balloons on zooming in and disappears on zooming out.
> Scaling it by the camera's zoom each frame makes it behave like a map label
> rather than a piece of scenery.

> **R-83.** A place's **marker and its name share a single zoom threshold** and
> appear together. Below it, neither is drawn.
>
> The reason is arithmetic: zoomed out to the default 30×30 chunks you are looking
> at 900 cells across, which on a 1920 px screen is about **2 px per cell**. A miniature
> in one cell would be five pixels and a label would be soup. Above the threshold
> the 3D miniature and its name are both legible; below it, neither earns the
> pixels.

> **R-84.** *Three different things are called "visible" and they must never be
> conflated in code:*
>
> | Concept | Meaning | Lives in |
> |---|---|---|
> | `Revealed` | the party knows this place exists | save (R-16) |
> | `visibleToParty` | this **note** may be shown to players | campaign (R-86) |
> | *drawn* | currently past the zoom threshold | view state, nothing persisted |
>
> Only the first two are state. The third is a rendering consequence and is never
> stored, never transmitted, and never called "visible" in an identifier.

> **R-85.** A place carries an **ordered list of notes**, each independently marked
> `visibleToParty`. The GM adds, edits, reorders and toggles them.
>
> Notes with `visibleToParty: false` are **stripped by `viewFor`** (R-19) and never
> reach the table display. This is the same trust boundary as hidden tokens: a
> secret the players must not read is not transmitted, not merely not rendered.

> **R-86.** Interaction differs by app, which is the point of having two:
>
> | | GM console | Table display |
> |---|---|---|
> | Tap a cell | create/edit menu for that cell | travel here |
> | Tap a place | create/edit menu for that place | info panel: name + visible notes, and enter or travel (R-81) |

---

## 6c4. The world terrain builder

Two tools that share one hover affordance. This is the surface the GM spends the
most time in, so it gets specified rather than improvised.

> **R-87.** A **highlight stroke snaps to the hovered cell** and is shared by both
> tools. The tools differ only in what a gesture does, never in what the cursor
> looks like, so the GM never has to work out which mode they are in from the
> cursor alone.

> **R-87a.** There is a **neutral tool**, `select`, and it is the default.
>
> It changes nothing and only picks things out. Without it every click on the map
> edits something, so there is no way to inspect a place without risking creating
> another, and no safe state for an action to finish in.
>
> **After an action that creates something, the app returns to `select` with the
> new thing selected.** Staying in the creating tool arms the next click to
> create again, which is what makes an editor feel hostile.

> **R-87b.** ~~Clicking a place marker selects it **whatever the tool is**.~~
> **Superseded by R-87c (D-162).** The half that survives: selecting a place does
> *not* change the tool, because switching to Places would arm the next click to
> create another one — the very thing R-87a exists to prevent.
>
> The rest was wrong. "Whatever the tool" meant a paint stroke near a marker
> selected the place instead of painting the ground, which is how it was found:
> painting snow around the party.

> **R-87c.** **`render` reports what is under the pointer; the tool decides what
> it meant.** `Picked` resolves pawn, place, cell and empty slot *independently*,
> with no precedence, so a tool that wants terrain always gets terrain.
>
> The cell it reports for a marker or a pawn is **that thing's own cell**, not
> what the ray found. A strict raycast answers "the ground visible through this
> pixel", and a marker stands *above* its ground, so in an angled view the ray
> passes over it and lands on the neighbour — clicking a marker would paint the
> cell behind it. `intendedCell` in `render/picking` owns that decision, has no
> three.js in it, and is unit tested, because it is a rule and getting it wrong
> silently edits the wrong cell (D-163).
>
> Anything a tool does not name, it ignores:
>
> | Tool | Picks | Ignores |
> |---|---|---|
> | **Select** | a place; otherwise the cell's **chunk** | pawns |
> | **Paint** | the cell | places, pawns |
> | **Height** | the cell | places, pawns |
> | **Places** | an **empty** cell | places, pawns; a taken cell is dropped |
> | **Travel** | a pawn, then a cell while aiming | places |
>
> Creating a chunk from an empty `+` slot is **outside** the table: every tool
> does it, because that affordance is how the world grows (R-79), not a mode.
>
> Select keeps chunk selection because it is the only route to the Known toggle.
> If that moves elsewhere, Select becomes places only.
>
> **Only the neutral tool holds a selection** (`holdsSelection`, D-168). Changing
> to any other tool drops it, because an inspector left open under Paint
> describes something that tool cannot act on and offers edits to a thing the GM
> has moved on from. Note the rule is about *ownership*, not the transition:
> placing a place switches to Select and pre-selects the new one (D-127), and that
> has to survive. A test ties `holdsSelection` to what `clickAction` can actually
> select, so a sixth tool cannot update one without the other.
>
> A Places click on a taken cell is **dropped, not dispatched**: one place per cell
> (R-119) is a rule, not a mistake, and it does not deserve a red toast. The hover
> readout says *"Already a place here"* first, so the dropped click reads as the
> rule rather than as a dead button (R-18).

> **R-88.** **Paint tool** (brush icon): pick a terrain from the palette (R-77),
> tap a cell to paint it, or drag to paint many. Height is untouched.

> **R-88a.** Both tools share a **brush size** of 1×1, 2×2 or 3×3, and the hover
> outline is drawn at that size so what is outlined is what will change.
>
> A brush is **one intent**, not one per cell: nine intents would mean nine saves
> and nine broadcasts for a single click (R-19a). Odd sizes centre on the anchor;
> even sizes have no centre cell, so they extend forward from it. `domain` owns
> both the footprint and the outline's offset, so the outline cannot drift from
> the cells actually edited.

> **R-88b.** A brush may **cross chunk boundaries**. Cells landing in chunks that
> do not exist are skipped, never created — chunks are made deliberately, with
> the `+` affordance (R-79).

> **R-89.** **Height tool** (mountain icon): same highlight, but a **vertical drag
> on a cell raises or lowers it**, snapping to whole levels. Terrain is untouched.
> Clamped to `[0, MAX_HEIGHT]` (R-80). With a brush wider than one cell it stamps
> a **flat plateau**, which is what makes it useful for building.
>
> Separating paint from height means neither gesture can surprise you by doing the
> other, and it is why a fresh chunk being uniform water (R-78) works as a
> starting point: paint the coastline, then pull the mountains up out of it.

## 6c5. The party marker

> **R-90.** The party renders exactly like a place marker — a miniature, sharing the
> same zoom threshold (R-83) — differing in that **it moves**.
>
> It *was* also "not clickable, no gesture attached". That held only while the
> party was a read-only indicator. Picking a pawn is now the first step of every
> move (R-132), so the marker is selectable on both screens.

---

## 6d. Travel

Travel is arithmetic over spatial data — squarely the "hard to hold in your head"
category (R-1), and squarely in scope.

> **R-52.** A column's difficulty comes from its **terrain** (R-77), optionally
> overridden per cell. `impassable` routes around.

> **R-52b.** Difficulty is resolved **per travel mode**, not per terrain alone. A
> `TravelMode` carries `kmPerDay`, a `fallback` of `terrain-default` or
> `impassable`, and per-terrain overrides.
>
> This is why water is impassable rather than merely expensive: a multiplier of
> any size means "crossable, slowly", which would let an armoured party wade the
> ocean. `travel:ship` sets `fallback: impassable` and overrides water to 1, so a
> ship crosses water and **cannot sail overland**. `shallows` is passable to both,
> which is what gives a boat somewhere to put in.
>
> A **column override beats the mode**, so a bridge is a cell painted passable —
> a property of the place, not of the traveller. And mixed journeys need no new
> machinery: walk to the port, then sail, is two legs of the trip splitting
> already agreed in R-57.

> **R-52a.** **Altitude costs nothing; slope costs.** Being high is free — climbing
> is not. Entering a neighbouring column adds a penalty proportional to the
> difference in height, so a mountain is expensive to cross and a plateau is not.
>
> ```
> stepCost = baseDistance × difficulty(target) + slopeFactor × |Δheight|
> ```
>
> `slopeFactor` is **0.83**, and it is *derived, not chosen*. Naismith's rule —
> the standard hillwalking estimate — charges an hour per 600 m of ascent and an
> hour per 5 km of flat ground, so one 150 m level (R-104) is worth 1.25 km of
> walking against a 1.5 km cell.
>
> **It moves when the height level moves**, and a test asserts the relationship,
> so the two cannot drift apart.
>
> Descent is charged the same as ascent until someone asks otherwise; that is the
> simple version and this was asked to stay simple.

> **R-53.** The route is **weighted shortest path** over chunk columns, 8-way with
> `√2` diagonal cost. Generic weighted pathfinding lives in `geometry`; paces,
> difficulty semantics and the time formula live in `domain`. Nothing fancy: a
> default 30×30 chunk world of 30×30 cells each is 900² = **810k nodes**, which
> Dijkstra handles in well under a second — and routes only cross `Known` chunks
> (R-55), so the reachable graph is almost always a small fraction of that.

> **R-54.** The calculator reports **total distance**, takes a **pace** from an
> append-only registry (`pace:walk`, `pace:forced-march`, `pace:horse`,
> `pace:ship`, …) per R-13, and reports **time**:
>
> ```
> effectiveDistance = Σ (cellDistance × difficulty)
> time              = effectiveDistance / paceSpeed
> ```

> **R-55.** Routes are computed **through `Known` chunks only**. If a destination
> cannot be reached across known territory, travel is **refused with that reason** —
> and the answer is the scouting loop (R-57), not a longer route.
>
> A consequence worth naming: because every cell on a route is in a known chunk,
> its difficulty is known too, so **the player-facing estimate and the GM's true
> estimate are identical**. There is no divergence to model and nothing to filter.

> **R-56.** Travel **never reveals anything**. Arriving at the frontier does not
> mark the next chunk `Known`; only the GM does that (R-16).

### The scouting loop

> **R-57.** Expanding the map is a four-step loop, and it is the *only* way the
> world grows:
>
> 1. the party travels to a cell at the **edge of known territory**
> 2. scouting happens **off-tool** — the GM adjudicates it however they like
> 3. the GM **reveals** the adjacent chunk, and whichever of its places are accurate
> 4. the party makes a **separate journey** into the now-known chunk
>
> Each step is an ordinary action the tool already supports. Nothing here is a
> special mode, a request queue, or a notification. This is why R-16a can simply
> forbid interacting with unknown chunks: there is no interaction to replace.

> **R-58.** The party has a **position on the world map** — a chunk coordinate plus
> a cell — rendered as a marker like a place. Travel targets are any cell in a
> `Known` chunk, or a `Revealed` place's cell. Time passing is off-tool; the tool
> moves the marker and reports distance and duration.

---

## 7. Visibility

### The licence that governs this whole section

> **R-39.** **The GM is in the room.** Players sit at the same table, one screen
> each, an arm's length from the GM. The tool therefore does not need to be a
> perfect adjudicator — it needs to be *correct enough and predictable*. Wherever
> the choice is between more precision and a GM override, choose the override.
> Nicolás: *"if the GM feels like something is wrong, he is just some steps away."*

This is not laziness; it is the constraint that keeps the fog model small enough
to stay comprehensible to the people using it.

### Two separate mechanisms

> **R-15.** Encounter-map fog is **calculated**. Geometry decides it: binary
> per-cube line of sight from party tokens, unioned across the party. The GM does
> not paint it.

> **R-16.** World and chunk scale carry **no geometry whatsoever** — no sight
> range, no line of sight, no rays. Knowledge is GM-granted, full stop:
>
> - a **chunk** is `Unknown` or `Known`. Unknown renders as a featureless
>   placeholder: no terrain silhouette and no places, because the shape of the land
>   is itself information.
> - a **Place** is `Hidden` or `Revealed`, independently of its chunk, so a known
>   chunk can still hold secrets.
>
> Both are toggled by the GM from off-tool fiction — a background, a purchased
> map, the outcome of a scouting action.

> **R-16a.** An `Unknown` chunk is **inert on the table display**: not clickable,
> not selectable, not a travel target. The map grows through the scouting loop
> (R-57), not by asking.

**Do not unify these.** Encounter fog is computed; world knowledge is authored.
They share the word "fog" and nothing else. This was briefly merged and the merge
was a regression.


### Binary, not graded

> **R-40.** There is **no cover model and no posture model**. Visibility has two
> outcomes. Anything a percentage would have expressed is off-tool (R-1) and the
> GM decides it out loud.

> **R-41.** Binary does **not** mean one ray. A handful of sample points per cube
> are tested and *any* clear sample makes it visible. This costs the same as
> grading did and is far more predictable than a single centre-to-centre ray,
> which flickers on corners and makes the diagonal seam painfully visible. What
> we removed is the fraction-to-cover mapping, not the sampling.

> **R-42.** Granularity is **whole cubes**, never cube faces. Face-level
> visibility is more truthful and produces visually noisy half-lit geometry. R-39
> settles it: coarse and legible beats precise and confusing.

### One eye height, and the rule of thumb it buys

With no posture there is a single eye height. Its value is a **usability**
decision, not an anatomical one.

> **R-43.** Eye height is **1.2 × cell size** above the floor of the token's
> cell — 1.8 m at the 1.5 m cell of D-024. It is stored as a **ratio**, not as
> metres, because the rule it protects is about whole cubes.

> **R-43a.** The eye height ratio must stay strictly within **(1.0, 2.0)**. Below
> 1.0 a single cube blocks; at or above 2.0 a two-cube wall stops blocking. Both
> break the rule below, so this is an invariant with a test, not a preference.

The rule that falls out:

> **A one-cube wall is chest-high — you see over it. Two cubes block.**
> **And each cube of elevation buys you one more cube of wall.**

Concretely: an observer whose feet are at height *f* sees over walls of height
*f+1* or less, and is blocked by *f+2* or more. On flat ground that is
see-over-1, blocked-by-2. Standing on one cube: see-over-2, blocked-by-3.

Elevation now does the work posture used to, and terrain already varies, so it
costs nothing. 1.8 m is also simply a believable tall human, which keeps the
debug eye view (R-48) from looking absurd.

### Seams are sealed, and it is not a setting

> **R-44.** Two cubes touching only along a diagonal edge leave a gap of zero
> width. Sight does **not** pass through it. This was a configurable policy while
> cover grading existed; with binary fog, a knob whose effect nobody can predict
> is worse than a firm answer. Walls are airtight.

### Only blocks occlude

> **R-74.** A **block is the only sight-blocking element in the world.** Tokens
> never occlude — a figure standing in a doorway hides nothing behind it.
>
> This is not an approximation we tolerate; it is the model. It keeps fog a pure
> function of terrain, so it changes only when the map changes or a token moves,
> and it removes an entire category of "why can't I see past my own ally".

> **R-75.** Whether a block blocks sight is a property of its **material**, not of
> being a block. Water, glass and anything else transparent are blocks that do not
> occlude.
>
> ```ts
> Material {
>   id: MaterialId          // stable string, append-only (R-11)
>   name: string
>   blocksSight: boolean
>   // appearance: colour / texture / opacity
> }
> ```
>
> So `material:stone` occludes, `material:glass` and `material:water` do not, and
> adding a new transparent material is a registry entry rather than a code change.

### Cube fog states

> **R-45.** A cube is `Hidden`, `Explored` or `Visible`. Hidden is not rendered;
> Explored is rendered desaturated; Visible is lit. Explored is **cumulative** —
> once seen, a cube stays known, which is what stops fog strobing as tokens move.
> Confirmed in D-064.

> **R-46.** Vision is **omnidirectional with a range limit**. The range is a
> property of **each token** and the GM can edit it per token. No facing, no view
> arc, no per-turn rotation bookkeeping.

> **R-46a.** Default range is **60 ft = 12 cells** at the 5 ft cell of D-024.

### The GM sees what the party sees

> **R-76.** Enemy awareness is **entirely off-tool** — the tool never computes
> whether an NPC can see the party. But the GM console must be able to **preview
> the table display's view**: the same scene rendered with the party's fog, so the
> GM can check what is currently on the players' screen without leaning over.
>
> This is a feature, not a diagnostic. It is distinct from the eye view in R-48,
> which renders from one token's position; this renders from the GM's own camera
> using the party's revealed set.

### Debugging

> **R-48.** Two GM-only diagnostics, both off by default, neither ever available
> on the table display: a **ray overlay** drawn in the isometric scene, and an
> **eye view** rendered from a chosen token. The eye view is a debug tool, not a
> feature — it answers "why does the engine think this is visible?" and is the
> fastest way to see a fog bug. It is never presented to players (D-036).

### Retired

`R-27` (heights in metres, derived clearance), `R-28` (posture), `R-37` (eye
height guard) and the graded-cover half of the original `R-15` are **retired** by
D-035. Numbers are not reused; decisions cite them.

---

## 8. Simulation

> **R-17.** `sim` is pure: `(state, intent) => { state, events }`. No clocks, no
> randomness, no I/O. The host supplies time and persistence.

> **R-18.** Every mutation is an **intent** with an explicit permission check.
> An intent the sender may not perform is rejected with a reason, never silently
> ignored.

> **R-19.** Filtering is a single function per role, `viewFor(role, state)`, and
> it is the **only** path from state to a client. There is no second route by
> which a field can reach a screen.

> **R-19a.** That single filter feeds **two channels**, because one blob per
> change does not survive contact with a real map:
>
> - **Geometry** — voxels — is sent once when a map is opened, then only as
>   **deltas** for individual edits (R-9).
> - **Play state** — tokens, fog, discovery, overlay — is small and is sent
>   **whole** on every change.
>
> The reason is not bandwidth; on a LAN that is free. It is that resending
> geometry forces the client to **re-mesh**, which stutters visibly on every
> token step. Applying play state only changes materials, which is cheap.

---

## 8a. Campaigns, sessions and the two entry points

> **R-91.** Party members are **campaign-level definitions**, not point of interest
> placements. The GM edits the roster once — name, colour, vision range — and
> instances those members onto encounter maps when the party arrives somewhere.
> A member's identity survives every map they walk through.

### The GM's path

> **R-92.** The GM console's opening screen is a **campaign list**:
>
> - no campaigns yet → a single "create campaign" affordance
> - otherwise → the list, plus "create another"
> - creating one asks for **a name and nothing else**
>
> Then the campaign view: the world map, one chunk of water surrounded by `+`
> slots (R-79), the paint and height tools (R-88, R-89), and the party panel — a
> roster starting with one member named "player" (R-91).

> **R-93.** The GM console **always displays the address players should connect
> to**, floating in a screen corner. The host knows its own LAN addresses; not
> surfacing them would mean the GM reads them off a terminal.

### The players' path

> **R-94.** The table display **auto-connects to whatever host served it**. The
> player opens `http://<gm-ip>:8080/table` and is in; there is no address field,
> because reaching the page already required knowing the address.
>
> The GM console shows that full URL (R-93) alongside a **QR code**, so a player
> can scan it off the GM's screen. The table display has no campaign list — the GM
> chooses the campaign and the table follows.

---

## 8b. Storage format

> **R-59.** Structure is **JSON**; voxel payloads are **packed**. Campaign
> manifest, world, chunks, places, registries and every save stay hand-editable and
> diffable. Voxel bodies use a per-32³-chunk **palette plus run-length encoding**.
>
> The reason is arithmetic: a campaign with ~20 places, several points of interest
> each and one map apiece holds several hundred thousand filled cubes. One JSON entry per cube is 10–35 MB;
> palette+RLE puts the same content at 1–3 MB. Saves are small either way
> (tokens, flags, overlay) so they stay plain JSON.

> **R-60.** A campaign is a **directory, not a file**:
>
> ```
> campaigns/<id>/
>   campaign.json          manifest, registries, cell scales
>   world.json             chunk grid, terrain, places
>   points of interest/<id>.vox    packed voxel body, one file per map
> saves/<id>.json          play state: tokens, discovery, fog, overlay
> ```
>
> This is what makes editing one dungeon level rewrite one file instead of the
> whole campaign, and it keeps a campaign something you can hand to someone as a
> folder.

> **R-61.** Every persisted file carries a `schemaVersion`. Migrations are
> forward-only, live in `persistence`, and are tested against fixtures of older
> versions. A save also records the campaign version it was made against (R-8).

> **R-61a.** A stored grid records the **stride it was written with**, never
> relying on the current `CHUNK_SIZE`. Decode re-lays it into whatever the
> current size is: a smaller chunk keeps its shape and the remainder becomes sea,
> a larger one is cropped.
>
> The re-lay must go through `(x, z)`, not a flat index. Copying the flat array
> straight across shears the map diagonally — which is exactly the bug this rule
> exists to prevent, and the test uses a diagonal stripe because a sheared
> diagonal is obvious and a sheared blob is not.

---

## 8c. The pattern

Three orthogonal layers. Each answers a different question, and together they
decide where any new code goes. See [PLAYBOOK.md](PLAYBOOK.md) for how to apply
them; this section is the definition.

> **R-95.** The architecture is **hexagonal at the package level**,
> **unidirectional at runtime**, and **feature-sliced inside apps**. It is
> deliberately neither VIPER nor full Clean ceremony (D-087).

### The rings

> **R-96.** Dependencies point **inward**, toward what changes least.
>
> | Ring | Packages | Constraint |
> |---|---|---|
> | Core | `geometry`, `domain` | zero dependencies; pure |
> | Use cases | `sim` | pure; `(state, intent) → (state, events)` |
> | Ports | interfaces declared by the host | no implementation |
> | Adapters | `persistence`, `host`, `render`, `apps/*` | every side effect lives here |
>
> This is Clean's dependency rule without Clean's boilerplate: no interface per
> boundary, no DTO at every crossing, no mappers both ways. Pure functions over
> immutable data are already testable without any of it.

### Purity, and the ports it requires

> **R-97.** **`sim` is completely pure.** No clock, no filesystem, no socket, no
> randomness, no ambient state. Everything it needs is an argument.
>
> The payoff is that the entire rules engine is testable with no test doubles at
> all — which is the whole reason the boundary is worth defending.

> **R-98.** The host owns every side effect and supplies `sim` with what it needs
> through four ports:
>
> ```ts
> interface CampaignStore { list(): CampaignSummary[]; load(id): Campaign; save(c): void }
> interface SaveStore     { list(campaignId): SaveSummary[]; load(id): Save; save(s): void }
> interface Clock         { now(): number }
> interface Broadcast     { send(role: Role, message: OutboundMessage): void }
> ```
>
> Ports are declared where they are *used* (in `apps/host`), not where they are
> implemented. `persistence` implements two of them and knows nothing about the
> other two.

### Flow

> **R-99.** State changes travel in exactly one direction:
>
> ```
> gesture → intent → host → sim → state' + events → viewFor(role) → channel → client store → render
> ```
>
> Clients never mutate state; they dispatch intents and render snapshots. It is
> Flux-shaped, but the reducer lives on the server — which is what makes the
> secrecy property (R-19, R-4) structural rather than diligent.

### Working order

> **R-100.** Features are built **`domain` → `protocol` → `sim` → `render` → app**.
> Steps that need nothing are skipped; the order is never reordered. Starting in
> the app is how logic ends up in a panel.

> **R-101.** **Paint terrain is the reference feature.** It is a real v0.1 feature,
> not sample code, chosen because it is small and touches every ring. New work
> should look like it.
>
> Purpose-built example code is deliberately avoided: nothing depends on it, so
> nothing fails when it drifts, and it ends up teaching a pattern the codebase
> abandoned.

> **R-102.** The playbook's cited paths, rule numbers, decision numbers and test
> names are **verified by `test/docs.test.ts`**. A playbook that lies is worse than
> no playbook, and prose does not fail on its own.

---

## 9. Internal structure

### 9.1 Packages

```
packages/<name>/
  package.json          exports only "."
  tsconfig.json         references its declared deps
  README.md             what it owns, what it must never know
  src/
    index.ts            the barrel: the entire public surface
    <concept>/          one folder per cohesive concept
      internal/         not exported. free to change without notice.
  test/
    <concept>.test.ts
```

> **R-20.** A folder holds at most ~7 files. Reaching 8 is the signal to split the
> concept, not to keep adding.

> **R-21.** Every package's README names what it must *never* know. Stating the
> negative is what keeps a package from quietly becoming a god-module.

### 9.2 Browser apps

The failure mode to design against is the horizontal soup — `components/`,
`hooks/`, `utils/`, `state/` — where one feature is smeared across four folders
and every folder grows without limit.

> **R-62.** Apps are organised by **feature (vertical slice)**, never by kind.
> There is no top-level `components/`, `utils/`, `helpers/` or `state/`. A feature
> owns its panel, its local state, its input handling and the intents it sends.

```
apps/gm/
  index.html
  vite.config.ts
  src/
    main.ts             the composition root: the ONLY place things are wired
    shell/              layout, top bar, panel docking
    features/
      build-world/      height & colour brushes, palette, difficulty painting
      build-point of interest/  voxel stamping, material palette
      place/              place inspector, its point of interest-map list
      travel/           route, pace picker, distance & time
      fog/              the manual reveal/hide brush (R-47)
      tokens/           placement, movement, names, notes
      session/          campaign picker, save/load, build vs play mode
      debug/            ray overlay and eye view (R-48). GM-only by construction.
    scene/              GM-only scene overlays: build cursor, debug ray lines

apps/table/
  src/
    main.ts
    shell/
    features/
      navigate/         view stack, place selection
      tokens/           moving party tokens
      travel/           read-only route and estimate
    scene/
```

> **R-63.** Features do not import each other. If two need the same thing, it
> moves down into `client-core` or `ui`. This is the rule that stops the feature
> folders growing lateral dependencies and becoming the soup by another route.

> **R-64.** **Server state and view state are separate stores.**
> - *Server state* is the latest snapshot. It is deep-readonly, replaced
>   wholesale, and never mutated locally.
> - *View state* is local: camera, selection, active tool, view stack, panel
>   open/closed. A snapshot must never overwrite it.
>
> Mixing them produces the classic bug where an incoming snapshot resets the
> camera or closes the panel the GM was typing into.

> **R-65.** Exactly one module opens a socket: `client-core`'s net client.
> Features never touch the network; they dispatch intents. There is one path in
> and one path out.

> **R-66.** `main.ts` is the **composition root** and the only place dependencies
> are wired together. No module reaches out for a collaborator. This is D-015
> made concrete. The moment one module can reach out and find another, the
> dependency graph stops describing the system.

### 9.3 The host

```
apps/host/src/
  main.ts             composition root
  transport/          ws server, connection -> role seat (GM / table / spectator)
  session/            load campaign + save, apply intents, broadcast snapshots
  static/             serves the two browser builds
```

> **R-67.** The host contains **no game logic**. Every decision comes from `sim`;
> the host supplies time, sockets and files. If a rule is being decided in
> `apps/host`, it is in the wrong place.

---

## 10. Conventions

- **TypeScript strict**, `noUncheckedIndexedAccess`, no `any`, no non-null `!`.
- **Files** `kebab-case.ts`. **Types** `PascalCase`. **Functions** `camelCase`.
- **No barrel-of-barrels.** `index.ts` re-exports named symbols explicitly, never
  `export *`.
- **No classes for data.** Plain readonly types plus pure functions. Classes only
  where identity and lifecycle genuinely exist (e.g. a renderer holding GPU
  resources).
- **No singletons, no service locators.** Dependencies are passed in. A located
  dependency is an edge that no tool can see and no rule can constrain.
- **Runtime validation only at the boundary.** Zod schemas in `protocol` validate
  every inbound message and every file read. Inside the packages, types are
  trusted because nothing untyped got in.
- **Never index a grid directly.** `noUncheckedIndexedAccess` is on, and raw
  indexing would mean `!` on every access. Instead `geometry` exposes accessors
  that return `T | null` explicitly, so absence is a value you handle rather than
  a type you silence. A missing cell is the single most common case in a sparse
  grid; it deserves to be in the signature.

---

## 11. Testing

> **R-22.** `geometry`, `domain` and `sim` require unit tests and have no excuse
> not to — they are pure. Coverage is not a target, but every geometric claim
> ("you can see over a one-cube wall standing but not crouched") must exist as a
> named test that would fail if the claim broke.

> **R-23.** `render` and the apps are not unit tested. They are verified by
> running them. Do not write mocks for three.js.

---

## 12. Tech

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, strict | one language across host and both clients |
| Monorepo | npm workspaces | zero extra tooling; already on npm 11 |
| UI | **React 19** | panels, forms and lists; the largest body of learning material |
| Build | Vite (apps); packages are consumed as **source** | no build step between editing a package and seeing it (R-73) |
| Host runtime | `tsx` | runs the host's TypeScript directly; bundle with esbuild only if shipping |
| 3D | three.js | the rendering load here is boxes |
| Transport | `ws` | two clients on a LAN; nothing more is warranted |
| Validation | Zod | one schema serves types, wire checks and file migration |
| Tests | Vitest | fast, and the pure packages make it worth it |
| Storage | JSON structure + packed voxels | inspectable where it matters, small where it counts (R-59) |

> **R-68.** **React owns the DOM. three.js owns the canvas. There is exactly one
> handoff** — a `<canvas>` element handed to `render` at mount, and imperative
> calls thereafter.
>
> Specifically: **do not use react-three-fiber.** It puts the scene graph inside
> React's reconciler, which ties GPU resource lifetimes to component renders and
> makes `render` depend on the UI layer — collapsing R-32, R-64 and R-70 at once.
> The panels are React's job and it is very good at them; the scene is not.

> **R-73.** Packages are consumed as **TypeScript source**, not built artefacts.
> `exports` points at `src/index.ts`; there is no `dist`, no `composite`, no
> project references, and no `.js` extensions on relative imports. One
> `tsc -p tsconfig.json` typechecks the whole repo.
>
> The discarded setup bought a second enforcement of the dependency graph that
> `dependency-cruiser` already provides as the authority (D-027), and charged a
> build step plus daily extension friction for it. Enforcement was verified
> unchanged after the switch.

> **R-24.** No dependency is added without a numbered decision naming what it
> replaces and what it costs.

---

## 12. UI primitives

> **R-110.** A control whose purpose is not obvious from its label carries a
> **`Tooltip`** from `@tt/ui`, never a native `title`. Native tooltips are slow to
> appear, cannot be styled, and are invisible on touch.

> **R-110a.** A floating layer — tooltip, menu, popover — renders through a
> **portal into `document.body`** with viewport coordinates, never as an
> absolutely positioned child. An absolute child cannot escape an ancestor that
> scrolls or clips, and the panels are `overflow-y: auto`, so an in-place bubble
> is cut off at the panel edge.

> **R-110b.** A floating layer **flips to the opposite side** when its preferred
> side has no room and the far side has more, then **clamps to the viewport**
> regardless. Both, not one: flipping alone still overflows in a corner.

> **R-110c.** A wrapper component must not change the layout of what it wraps.
> Wrapping a control makes the wrapper the flex or block item, so a child with
> `width: 100%` or `flex: 1` resolves against the wrapper and collapses to its
> content. `Tooltip` takes a `stretch` prop for this; any future wrapper needs
> the same escape hatch.

> **R-111.** `@tt/ui` components are styled **inline**, not by a stylesheet.
> `@tt/ui` exposes only `.` (R-6), so shipping CSS would mean widening its
> `exports` map and having every app remember to import it. Primitives here are
> small enough that inline styles cost less than that coupling.

> **R-117.** A floating panel over the canvas is **sized to its content**, with a
> `max-height`, never stretched to the viewport with `bottom`.
>
> A stretched panel puts an invisible box over the canvas below its content, and
> that box eats every pointer event — the brush probe freezes wherever it was
> last seen, which reads as the app hanging.
>
> **`pointer-events: none` on the container is not the fix.** It restores hover
> but breaks the wheel: the scroll chain skips a container the pointer cannot
> hit, so an overflowing panel stops scrolling. Sizing to content fixes both,
> because below the content there is simply no box.

> **R-116.** Keyboard shortcuts are bound to **`event.code`**, the physical key,
> never `event.key`.
>
> `event.key` is whatever the layout produces, and on several Mac layouts the
> number row does not emit bare digits — so `key === '1'` silently never fires
> and the shortcut simply does not exist for that user. `code === 'Digit1'` is
> the key in that position under any layout. Numpad equivalents are accepted
> alongside, and modifier combinations are ignored so browser shortcuts still
> work.

> **R-112.** A tooltip opens on **hover and on keyboard focus**, and closes on
> Escape. A tooltip that only answers the mouse is invisible to anyone using a
> keyboard, and the label is frequently the only place an action is explained.

> **R-113.** **Confirmation of an action must not live in a tooltip.** Clicking can
> move focus or take the pointer off the control, and the tooltip closes with it —
> leaving an action that looks as though it did nothing. Tooltips explain; some
> always-visible element reports.

> **R-114.** Anything using `navigator.clipboard` needs a fallback. The GM console
> is served over plain HTTP, so the Clipboard API is **absent whenever the console
> is opened by LAN IP** rather than `localhost` — a non-secure context. Fall back
> to a hidden textarea and `execCommand`, and if that fails too, say so and let
> the GM copy by hand.

---

## Discovery and saves

> **R-18a.** The role gate **fails closed**. `permitted(role, kind)` ends in
> `return false`, so a role nobody thought about changes nothing and an intent
> nobody classified is GM-only.
>
> The gate used to test an allow-list of mutations, which meant a forgotten intent
> was *permitted* for the table display. Now the allow-list is the other one:
> `OPEN_TO_THE_TABLE` names the intents the player seat may send as well
> (R-136), and a test enumerates `IntentSchema` itself, so adding an intent
> without classifying it fails the suite instead of shipping a hole.
>
> **A spectator holds no seat and changes nothing, ever** — not even the party.
> The party belongs to the *players*, so acting on it takes a player's screen, and
> since the table seat is not exclusive (R-127) every real player screen has one.

> **R-120.** A stored key that must be unique per campaign is **derived from the
> campaign id**, not generated and then constrained. `liveSaveId(campaignId)` makes
> "exactly one save per campaign" a property of the name rather than an invariant
> something has to check, re-check after a crash, and repair.

> **R-121.** Discovery autosaves, and **there is no save or load verb anywhere in
> the UI**. Any intent that changes what the party knows writes the save in the
> same breath, exactly as campaign edits already do (R-66). A GM in the middle of a
> session must not have to remember one.
>
> A campaign has exactly one save. Snapshots were built and then removed (D-147):
> discovery only grows during play, so restoring an earlier one answers a question
> a GM does not have, and the Known/Revealed toggles are already their own undo.
> Do not reintroduce a second save per campaign without a use case that Duplicate
> does not already serve.

> **R-122.** A place reaches the table only when it is **Revealed and its chunk is
> Known**. The two flags are independent (R-16) and their independence permits a
> revealed place inside a region the party has never seen — a name and a position
> leaked out of unexplored ground.
>
> `isPoiOnTable` is the single predicate; the filter has no business re-deriving
> it. Both GM inspectors say the rule out loud when it is the reason a revealed
> marker is not on the table, so the GM is never left guessing.

> **R-123.** Chunk membership is keyed by a **string**, never by a coordinate
> object. A `Set<ChunkCoord>` dedupes by reference, so it silently holds duplicates
> of the same cell and `has` never matches a freshly built coord. `chunkKey` is the
> only way in or out.

> **R-124.** An Unknown chunk travels as a **coordinate-only entry in a separate
> list**, not as a flag on the full chunk. A `known: false` chunk still carries its
> heights and terrain over the wire, one client bug away from being drawn. A
> placeholder with no terrain field cannot leak terrain. A test asserts the
> placeholder's exact key set.

> **R-125.** Deciding *which* save to use is a rule, so it lives in `sim`. The host
> reads and writes files; `openedWith` and `restoredWith` decide whether to reuse a
> stored save, mint a fresh one, and which place ids to prune. A host reaching into
> `@tt/domain` for `restoreInto` is both a forbidden edge (R-5) and game logic
> outside the pure core (R-67) — `npm run arch` caught exactly that.

> **R-126.** Deleting authored content prunes the play state that referenced it.
> Deleting a campaign trashes its saves; deleting a place drops it from discovery. A
> save pointing at an id that no longer exists is a revealed marker for a place
> that cannot be drawn.

---

## Seats

> **R-23a.** The host's **seat arbitration is tested**, as an exception to R-23.
> R-23 excuses the apps because they are three.js and a DOM; the reason is "do not
> write mocks for what you cannot mock", not "apps are exempt". Seat arbitration is
> a rule about what happens over a socket, and it is testable with a real `ws`
> server on an ephemeral port and no mocks at all. `apps/host/test` is in the
> vitest include list for exactly this.

> **R-127.** There is one GM seat and **the newest claim wins it**. The previous
> holder is demoted to a viewer *in place* — told its new seat and sent a new view,
> not disconnected.
>
> The seat used to be defended against later claims, so that "two GMs cannot fight
> over the same campaign". That is the wrong threat model for a tool with one GM in
> the room (R-39). The later claimant is not a rival; it is the same person's
> browser in a second tab, or after a reload the host has not yet noticed.
> Defending the seat meant that console silently received a spectator seat and had
> every action rejected until the host was restarted — which is exactly what
> happened, with two GM consoles open on one machine.
>
> Demoting rather than disconnecting matters: a disconnected client reconnects,
> re-asks for `gm`, and two live consoles trade the seat forever.
>
> **`table` is not exclusive at all.** A table display and a spectator receive the
> identical view, so there is nothing for a second screen to take, and a second
> screen is a reasonable thing to want.

> **R-128.** Sockets are **pinged, and reaped when they stop answering**. TCP does
> not notice a browser that navigated away, a laptop that slept, or a LAN that
> dropped: the connection stays ESTABLISHED with nobody behind it, and it keeps its
> seat forever.
>
> No leak of this kind has actually been observed running: the two long-lived
> sockets that first looked like one were two GM tabs, both legitimate. The gap is
> real all the same — nothing in the old transport could ever have released a seat
> without a close event — and `apps/host/test/seats.test.ts` reproduces it by
> pausing a client's socket so it stops answering pings.

> **R-129.** A client **must not present controls for a seat it does not hold**.
> The seat it holds and "no view yet" are different states and must render
> differently.
>
> The GM console derived its view as `role === 'gm' ? view : null` and then
> rendered the launcher from `view?.campaigns ?? []`. Holding a spectator seat
> therefore looked identical to a fresh, empty install: a campaign list with a
> working Create button that rejected every click. The rejection was not silent
> (R-18), but the reason was incomprehensible, because the UI was lying about what
> it was.

> **R-130.** A connection abandoned **before its handshake completed** closes
> itself when the handshake lands. Calling `close()` while a socket is still
> CONNECTING is not dependably enough: if the upgrade has already completed on the
> host, the socket can finish opening, claim a seat, and then answer pings
> forever — alive enough that R-128 would never reap it.
>
> This is a guard, not a fix for something measured. It costs one branch in
> `onopen`, and the alternative failure is a socket holding the GM seat with
> nobody behind it, which is the hardest class of bug to see from the console.

---

## 6c6. Moving the party

> **R-131.** **The party can only stand in a Known chunk.** Placing or moving into
> an Unknown or unauthored chunk is refused — for the GM exactly as for the player
> seat.
>
> This is what makes `Known` load-bearing in play rather than a display filter.
> The loop is: advance to the frontier, scout off-tool (R-1), the GM reveals the
> region, then the party may enter it. Revealing a chunk is a move in the game, not
> a cosmetic toggle.
>
> Two consequences, and they are not optional:
> - **Placement is the same rule.** A new campaign's discovery is empty, so the
>   party cannot be placed until something is revealed. There is no exemption for
>   the first placement; the party panel says to reveal a chunk instead.
> - **A chunk the party occupies cannot be un-Known.** Refused with a reason
>   (R-18). An invariant that the UI can break is not worth building movement on.

> **R-132.** A move is **pick, aim, confirm**. Pick a token, move the pointer
> freely while a **ghost** renders at the hovered cell, then confirm or cancel.
>
> The pending move is **client view state** (R-64) and does not reach the host
> until it is confirmed. That is deliberate: it is the extension point. Pathfinding
> preview draws into the aim step, and the travel menu — transport, pace, days,
> confirm/cancel — replaces the confirm step, without either one restructuring the
> flow or adding a protocol round-trip per pointer move.
>
> One sequence covers every move, including the party's first appearance on the
> map. There is no separate placement gesture.
>
> Which means the sequence must be able to start with **nothing to pick up**.
> Before the first placement there is no pawn, so step one cannot run — with the
> travel tool active and the party nowhere, the sequence **arms itself** holding
> the group pawn (D-167). Aim, ghost, reachability guard and confirm are
> unchanged; only the way in differs.
>
> Any gesture whose first step selects an existing thing needs the same question
> asked of it: what happens when there is none yet?

> **R-133.** The destination is **not adjacency-checked**, and no route is drawn by
> hand. A GM who wants a particular route expresses it as **shorter trips** to
> waypoints they choose; anything longer is the pathfinder's job.
>
> When the pathfinder lands it must be **constrained to Known cells**, or it will
> happily route the party through unexplored ground and quietly defeat R-131.

> **R-134.** Travel is a **tool on the GM console** (the fifth, alongside select,
> paint, height, places). On the **table display** party pawns are directly
> interactive with no tool to select, because there is nothing else there to click.
> Same three-step sequence, different way in.
>
> This was the table display's **first interaction of any kind** (D-152). I wrote
> that it "stays the only one"; **overruled by D-174**, which adds selecting a
> Place to read what the party knows about it. What survives is the part that
> mattered: no tool palette and no roster. A click on that screen means whatever
> `tableAction` says, and a travel in progress outranks everything.

> **R-136.** The permission line is **the party is the players', the world is the
> GM's**. Anything about the party's own pawns — position, grouping — is open to
> both seats. Anything about the world is GM-only, and **discovery** most of all:
> what the party is allowed to know is not the party's to grant.
>
> `OPEN_TO_THE_TABLE` (R-18a) is the list this rule produces. Before this it held
> nothing and each candidate was a judgement call; now a new intent is classified
> by asking which side of the line it falls on.
>
> R-131 is not an instance of this rule. The party cannot enter an Unknown chunk
> because it has not been there — the GM cannot do it either.

> **R-135.** `visionRange` is **not shown on the world map**. It is an point of interest
> quantity — R-46a pins it to 12 cells at the encounter cell, which on a 1.5 km
> world cell would read as 18 km — and showing it beside a world position invites
> exactly the wrong inference. It stays in the model, unrendered, until points of interest
> exist.

> **R-137.** A stored record **read** under an older schema is tolerated; a
> stored record **written** always carries the current schema version.
>
> Reading a version-1 save fills in what it lacks — no `placement` means an
> unplaced party. But writing it back still labelled version 1 would leave a file
> whose version does not describe its contents, and later code will branch on that
> version and be wrong. `upgraded()` stamps it where the save is adopted, so the
> next autosave persists the upgrade.
>
> Refusing a *newer* version stays a hard error (R-61): filling in a missing field
> is a safe guess, and discarding a field written by a future version is not.

> **R-23b.** Policy that is a **rule** does not get to hide in a component.
>
> R-23 exempts `render` and the apps from unit tests, and its reason is three.js
> and the DOM: you cannot sensibly mock them. That reason does not cover decision
> tables, state machines or coordinate rules that happen to be *typed inside* a
> component — and using R-23 to excuse those is how three fixed bugs in a row
> shipped with no test (D-166).
>
> When a bug turns out to be a rule, extract the rule to a pure module and test
> it there. What is left in the component — layout, pointer plumbing, GL calls —
> is what R-23 actually exempts, and is verified by running it.

> **R-138.** A client **must not offer an action the host will refuse.**
>
> `sim` stays the only authority (R-3): the client's check is a second opinion,
> never the enforcement. But a ghost that follows the pointer into unexplored
> ground, a button that is enabled for something impossible, or a gesture that
> completes and then earns a red toast all teach the user that the tool is
> unreliable. Refuse earlier, and say why in place of the thing you refused.

> **R-139.** A multi-step gesture is cancelled by **Escape and by right-click**,
> and says so while it is running.
>
> Escape is the keyboard's "never mind" and right-click is the mouse's; a gesture
> driven by the mouse should not require the other hand. Right-click during a
> gesture cancels instead of doing its usual job (R-133's pan).

---

## 6c7. Undo

> **R-140.** **Undo covers authored content and nothing else.** Terrain, heights,
> Places, notes, the roster — everything in the campaign. Play state is out:
> discovery's toggles are their own undo (D-147), and party position belongs to
> the players as much as the GM (R-136), so one person's cmd+z must not rewrite
> what another did.
>
> This keeps undo purely the GM's, because only the GM edits the campaign.
>
> The history holds **whole campaign states**, which is affordable only because
> the domain is immutable with identity-preserving edits (R-12): a paint stroke
> rebuilds one chunk and shares the rest, so an entry costs about a chunk. Fifty
> are kept. It is in-memory and does not survive a host restart.
>
> Because it holds campaigns it must **never** reach a view. The GM console is
> told `canUndo` and `canRedo` and nothing more.
>
> Bound to cmd/ctrl+Z and cmd/ctrl+shift+Z, and **also to buttons**: a
> keyboard-only feature is one nobody finds, and a disabled button says when
> there is nothing left to take back. The binding is the one exception to the
> shortcut handler's "ignore modifiers" guard (R-116), so it is checked first.

> **R-140a.** The snapshot is taken at the **`apply` boundary**, by comparing
> campaign identity before and after — not inside each handler.
>
> Two reasons. With immutable edits, identity changing *is* the definition of
> "the campaign was edited", so the check is exact: an intent that changes
> nothing records nothing, for free. And a hook nobody has to remember cannot be
> forgotten when the twenty-ninth intent arrives — the lesson of D-166.
>
> Opening, closing, creating, duplicating or deleting a campaign **resets** the
> history. It belongs to one campaign; cmd+z must not reach into a world the GM
> is no longer looking at.

> **R-140b.** A **drag is one action**. Paint and height dispatch one intent per
> cell entered, so the client tags a gesture's intents with a `stroke` id and only
> the first of them records history.
>
> The id is opaque to the host, which only compares it with the previous one. The
> comparison must require a **non-null** id: two separate single clicks both carry
> nothing, and treating that as a match would collapse unrelated edits into one.
>
> **Blocks do not use it** (R-153). The rule stays general at the boundary; a map
> simply never sends a stroke, because there is no drag inside one.

> **R-141.** A selection on the table display is **re-resolved from the current
> wire every render**, never held as a copy.
>
> The GM can hide a place, or delete it, while a player has it open. A cached
> copy would leave its notes on the shared screen after the host stopped sending
> them — turning a revoked secret into a visible one, which is the single thing
> that screen must never do. The id is the only thing kept; if it is not in the
> latest snapshot, the panel is gone.

> **R-142.** A read-only panel takes **no `dispatch`**. Not "does not currently
> send anything" — has no way to. Players do not write notes, reorder them,
> rename a place or delete it, and the cheapest guarantee of that is a component
> with nothing to send it through.

> **R-143.** An **point of interest is a record, not an id**. `Place.points of interest` holds
> `{ id, name, visibleToParty }` in the GM's order, and each entry is stripped at
> the boundary exactly as a note is (R-85) — an unrevealed point of interest's *name* is
> a spoiler, so it never leaves the host.
>
> A record rather than a bare string because the point of interest **map** attaches here
> later (R-49, O-009): a name in a list can grow a grid, an id in an array cannot.
>
> Notes and points of interest are the same shape on purpose. The one genuinely fiddly
> part — reordering, with its index clamping and splice — is `moveWithin`, shared
> by both. Two copies of that is how they drift.

> **R-137a.** Schema tolerance is **normalised at the boundary**, never carried
> inward as a union.
>
> The first attempt at reading v2's bare-id points of interest typed the wire as
> `string | record`, which pushed a `typeof` check into the view filter, both
> apps and the tests. A Zod `.transform()` parses the old shape into the new one,
> so exactly one place knows the old shape existed and nothing downstream can
> forget to handle it.

---

## Vocabulary

> **R-144.** **A place is a cell of the world map; a point of interest is inside
> one.** A village is a place; its church, market and arena are points of
> interest. A point of interest owns the encounter maps (R-49), so "encounter"
> means only the scene you play — which is what it means at a table.
>
> `POI` previously meant what a place means now, and the inner list was called
> "encounters". Both were wrong the same way: the screen said *Places* while the
> code said `Poi`, and an arena is not an encounter, it is where one happens
> (D-176).
>
> **There is no migration below the current schema.** Earlier files used `pois`
> for what is now `places`, so a tolerant reader would have to infer which
> meaning a field carried from its neighbours — exactly the guesswork the rename
> exists to remove. A campaign older than the current schema is **not listed and
> does not load**.
>
> That has to be explicit in two places, and neither is optional:
> - `list()` skips it, because offering a row that cannot be opened is worse than
>   offering no row.
> - `load()` **refuses it by version**, not by validation — validation would not
>   fail. Unknown keys are stripped and `places` defaults to empty, so an old
>   manifest parses cleanly into a campaign with no places at all: silent loss
>   wearing the face of success.
>
> `load()` returns `null` rather than throwing for anything unreadable. It runs
> inside an intent, and a store that throws takes the message handler with it;
> null becomes a reason the GM can read (R-18).

---

## 6e. Encounter maps

> **R-145.** A point of interest has **exactly one map**, created with it, and a
> map is **one voxel body** (D-178, D-187). A building's floors are levels of that
> body, not separate maps — so stairs are geometry, and R-49's refusal to model
> map-to-map connectors holds without needing to be defended.
>
> *Exactly* one, not *at most* one. A point of interest is a place the party can
> walk into; one without a body is a label, and making the GM ask for the map
> separately only ever produced a second click with one possible answer (D-187).
>
> The type stays nullable for one reason, and it is not "not yet": `null` means
> **this side was not told**. The table is sent every visible point of interest
> with its body stripped (D-184), and a receiver must never invent geometry it was
> denied. On the host, an authored point of interest always has one.

> **R-146.** **Cutting planes.** A map carries GM-authored planes, each with a
> **Y value and a name** and nothing else — no X, no Z. They are the snap steps of
> a **two-sided range**: everything outside `[lower, upper]` is not drawn.
>
> One range, and the table draws only what is inside it — because only that was
> sent. Outside is **absent from the payload**, not merely undrawn (R-85).
>
> The console shows the whole body by default and can be **switched to the band**
> (R-159). It is a toggle rather than a permanent dimming: two views of one body,
> chosen, instead of a visual tax on every session. **Superseded D-182's fade.**
>
> **This supersedes R-35**, which clamped to a single upper bound. One bound can
> cut a roof away but cannot hide a cellar while the party stands on the grass
> above it; both handles are needed, and the lower one is the half a clamp misses.
>
> Planes are **authored** (campaign); the active range is **play state** (save).
> That is R-8 applied without special-casing: what the GM built versus where the
> party currently is.
>
> A plane's Y is editable and the range **snaps to steps**, with the floor and
> ceiling of the map always available as the outermost two. A map with no planes
> has exactly one range: all of it.

> **R-147.** Blocks are placed by **face adjacency** — click the face of an
> existing block and the new one attaches there (D-181).
>
> This does **not** contradict R-42. That rule is about *visibility* granularity,
> where face-level fog produces noisy half-lit geometry; picking a face to decide
> where a block goes is a different question with a different answer.

> **R-148.** **The toolset belongs to the surface, not to the app.** World tools
> (paint terrain, height, places, travel) have no meaning inside a map, and map
> tools have none outside it. Entering a map swaps the palette rather than growing
> it — otherwise every new surface adds permanently to a list that is already five
> long.

> **R-149.** A new map starts as a **flat floor at Y0**, one material thick,
> across its starting patch. Same reason a new chunk is created flat at height 0
> and entirely water (R-78): an empty grid gives the GM nothing to click, and
> face-adjacency placement needs a face to begin from.

> **R-150.** A map **grows horizontally in all four compass directions**, and its
> **height is capped** by a constant. Growing in two dimensions keeps one gesture
> familiar; an unbounded third would leave the camera with no idea how much to
> draw.
>
> The four are the **intercardinals** (D-198), because the grid's axes are what
> run diagonally on screen.
>
> The two that head toward lower coordinates grow by moving the map's **origin
> negative**, not by renumbering the body (D-196). Every block keeps the
> coordinate it already had, whichever way the map grows — the alternative is
> rewriting thousands of keys and hoping nothing remembered one of them. The
> origin is therefore part of the map, and `{0, 0}` is the right reading of a
> file that has none: such a file can only have grown in the two directions that
> never needed one.
>
> The affordance is a **rose**, and its buttons sit at the **corners** of a
> square, which is where the map grows on screen. A button labelled "East" down
> the right-hand side was pointing at the wrong place.

---

## 6f. Destroying things

> **R-151.** **Every affordance that destroys authored content asks first.** A
> `×` arms; a second, differently-labelled click commits. One click never deletes
> a campaign, a place, a note or a point of interest.
>
> The named exception is a **block**: erase is a drag (R-140b), and a prompt per
> block would make the tool unusable. A block is one stroke of work; the things
> above took typing or building.
>
> **Undo is not the answer to this.** It is the recovery, and the confirmation is
> the prevention. History is bounded (R-140a) and cleared when the active campaign
> changes, so "you can always take it back" is not a promise the GM should have to
> rely on — and the `×` sits a few pixels from the arrows that reorder the same
> list, which is how the wrong one gets clicked in the first place.
>
> Enforced by a **component**, `ConfirmDelete` in `@tt/ui`, rather than by each
> site remembering: a rule that depends on being retyped lasts until the next list
> grows a `×`. The confirmation is view state and asks the host nothing until it
> is confirmed (R-64).

---

## 6g. The camera across surfaces

> **R-152.** **The camera belongs to no surface.** Entering a map frames it,
> leaving it puts back the framing the world had, and *editing never moves it*.
>
> Three separate failures sat in the two lines that were supposed to do this, and
> all three were invisible until a point of interest always had a map to enter
> (D-190):
>
> - Framing keyed on the **body** rather than the **surface**. The console
>   resolves the open map from the wire every render (D-185), so the camera was
>   re-framed for every block placed — dragging the GM back to the middle while
>   they built at the edge.
> - Nothing **parked** the world's framing, so leaving a map left the camera at
>   the map's centre and zoom. In world coordinates that is empty space hundreds
>   of cells from where the GM had been: the world was still drawn, just nowhere
>   near. It read as "the world is gone".
> - The render loop set the world markers' visibility from the **zoom alone**,
>   re-showing on the next frame what `setMap` had just hidden. A map's zoom is
>   always under the threshold, so R-148's "one surface or the other" was true
>   only until the next frame.
>
> Turn and tilt (Q/E/R/F) therefore work on **both** surfaces. A tavern is where
> turning matters most: a wall you built is between you and the room behind it.
> The *tools* belong to the surface (R-148); the camera does not.
>
> And **every rebuild re-applies the surface** (D-191). A rebuilt group is a new
> object with `visible` true, so anything that tears down and remakes the world's
> meshes — a campaign change, a party move — puts them back on screen inside an
> open map unless it says otherwise. One method does this, and every rebuild
> calls it; relying on one effect running before another is not a rule.

---

## 6h. Building inside a map

> **R-153.** **A gesture may drag only if it does not move its own target.**
>
> That is the test, and it is not "is the tool destructive". **Build** and
> **erase** change the geometry, so the face under a stationary pointer is a
> different face a moment later: a build drag climbs its own cubes, an erase drag
> eats into what it exposes. For those two, one click is one cube, and each cube
> is its own undo (D-193). **Paint** changes only a material, so the block under
> the pointer stays exactly where it was — it drags, and the whole drag is one
> undo under one stroke id (R-140b), which is the same rule and the same reason
> as the world's terrain brush (D-194).
>
> **Fill** is excluded for a different reason: it is already a bulk action, and
> dragging one would fire a whole region per cell entered.
>
> **The cube in question is outlined before it is touched** — a white,
> cube-shaped wireframe at exactly the cell a click would edit: the empty cell
> against the hovered face when building, the hovered block itself when erasing.
> That is R-87's obligation carried down a surface, and the world's highlight
> cannot serve: it sits on a *column* and stretches to its height, while a map's
> target is one cube anywhere in the air.
>
> The outline and the readout are derived from **one** `MapAction`, so the cube
> that lights up is by construction the cube the click edits. Computing them
> separately is two chances to get R-147's off-by-one-along-the-normal wrong, and
> only one of them would look wrong on screen.

> **R-154.** **The bucket fills a connected region, through faces, by material.**
> Clicking a block repaints every block reachable from it through blocks of the
> **same material** — the 3D reading of a paint bucket (D-194).
>
> *Faces only*, the same six neighbours a block is placed by (R-147), and the 3D
> reading of a 2D bucket's four. Two cubes touching along an edge are a diagonal
> seam, which R-44 already treats as sealed; a fill that leaked through one would
> cross a wall the GM built as solid.
>
> A fill **never adds or removes a block**. Only materials change, so the shape
> of the building is the same after it as before — which is what makes it safe to
> give a one-click tool this much reach.
>
> It is **one intent**, so it is one undo without a stroke id. And because one
> click can rewrite a wing of a building, the console **counts the region on
> hover and says the number** before the GM commits: the outline can only mark
> where a fill starts, not how far it goes.
>
> Starting from air does nothing. There is no material to match, and a fill that
> began from nothing would have to guess what the GM meant (R-18: it is a no-op,
> not a silent wrong answer).

---

## 6i. Knowing which way you are facing

> **R-155.** **Every view that can be rotated shows a compass.** World map and
> point-of-interest map, GM console and table display — four views, one
> component, bottom centre (D-196).
>
> The camera is stepped and diagonal by design (R-31), so rotating cycles which
> corner faces you and there is no permanent "up". That is the right trade for
> readability and the wrong one for orientation, and a compass is what buys the
> second back without giving up the first.
>
> **North is the `(-1, -1)` diagonal of the cell grid** (D-198), chosen so the
> needle points straight up in the view a campaign opens on. That is not a
> compromise: the camera is diagonal to the grid on purpose (R-31), so *something*
> has to be diagonal, and it is better that the grid's axes are named
> north-east and south-east than that north points into a corner of the screen.
>
> The bearing is **derived, not tabulated**: it is the camera's azimuth less the
> yaw offset, which falls out of projecting that diagonal onto the screen axes.
> Four hardcoded numbers would be correct until someone changed `YAW_OFFSET`, and
> then quietly wrong.
>
> **Cameras are per client.** Each screen's camera is view state (R-64) and never
> travels on the wire, so the GM turning their console does not move the table,
> and vice versa. That is not a new rule — it is R-64 already being true — but it
> is the property that makes rotation safe to offer on the table at all.
>
> Camera freedom on the table **cannot leak**: `viewFor` stripped every secret
> before the table received anything (R-85). If an angle could reveal something,
> the boundary would be what is wrong, not the camera.

> **R-156.** **The camera behaves identically on both screens, and it moves
> smoothly.**
>
> *Parity.* Q/E turn, R/F tilt, right-drag pans, the wheel zooms — the same keys
> doing the same things on the console and on the table, from **one table in
> `client-core`** rather than two shells remembering the same four `case` labels
> (D-197). The help line both screens print comes from the same module, so it
> cannot describe controls the code does not implement. Tools are the opposite
> and deliberately so: those belong to the surface and the seat (R-148).
>
> Keyed on `event.code`, the physical key. Q and E sit either side of W and must
> stay there whatever the layout says.
>
> *Smoothness.* A turn **eases** between yaw steps instead of cutting. The steps
> are 90 degrees apart and diagonal (R-31), so a cut gives no clue which way the
> world went — the point of the transition is to show the direction, not to be
> admired, which is why the time constant is short enough that the next keypress
> never feels queued.
>
> Three things this has to get right, each with a test:
> - **The short way round.** Turning from 315 to 45 must cross north forwards,
>   not unwind three quarters backwards through the view just left.
> - **Frame-rate independence.** The easing takes elapsed seconds, so a 120Hz
>   display does not turn twice as fast as a 60Hz one.
> - **Arrival.** An exponential approach never lands, so it snaps within a
>   twentieth of a degree; a camera that is forever almost-still is a watcher
>   notified forever.
>
> Only the **angles** ease. Focus follows a drag and must not lag behind the
> hand, and zoom already arrives in small multiplicative steps.
>
> `pick` uses the **live** angles, never the target's: a click mid-turn has to
> hit what is on screen, not where the turn is heading. And `pick` must never
> advance the easing — it can run many times between frames, and a made-up `dt`
> would make the turn's speed depend on how far the pointer moved.

> **R-157.** **A map never holds a block outside its own footprint**, and the read
> boundary makes that true rather than assuming it.
>
> One was found that did: 64 by 64 of floor running from -16 to 47, on a map
> whose stored origin said zero (D-199). `inMap` rejects such cells, so the GM
> could see that floor and not erase it, paint it or fill through it — visible
> scenery that refuses to be edited, with no error to explain itself.
>
> On read, the footprint is repaired by the blocks, not the other way round:
> - **Slide** when the blocks fit inside the declared size — the size was right
>   and the origin had gone missing, so the footprint moves over the work and
>   keeps its width. Widening instead invents in-bounds cells with no floor under
>   them, which R-149 says a map does not have.
> - **Widen** only when the blocks genuinely span more than the declared size,
>   and exactly to the blocks.
> - **Never shrink.** A map dug hollow still owns the ground it was given;
>   erasing a corner is not a request to give it back.
>
> Between the blocks and the bookkeeping, **the blocks are the work**. That is
> the whole rule, and it is the same instinct as R-137a: repair at the boundary
> from what the data can tell you, rather than carrying a contradiction inward
> where every reader has to cope with it.

---

## 6j. The party in a map

> **R-158.** **The party is either on the world or in one point of interest's
> map**, and which it is, is **play state** (D-200).
>
> This is what D-185 deferred: the open map was the console's private business
> until the table had to follow the GM into a tavern, and two screens cannot
> agree on which one from view state.
>
> - **Open** stays the console's own (R-64). The GM can look into a cellar to
>   build it while the party waits outside, and a map the party has never heard
>   of can still be opened — otherwise no tavern could be built before it is
>   found.
> - **Inside** is play state, written to the save, and **remembered**: a reload
>   puts the party back in the room they were in. The GM's words: *"once they
>   are in, we should keep them."*
> - Opening a map **takes the party in when it can**, which is the GM's
>   described flow, and simply opens it when it cannot.
>
> **The party may only be taken somewhere they can see.** Revealed, chunk Known,
> point of interest shown — the same condition the boundary uses to decide
> whether the table receives it at all, so "you cannot walk them into a room they
> cannot see" and "the table gets this" are one predicate rather than two that
> can disagree. Refused with a reason, never silently (R-18), and the console
> checks before asking so a GM building a hidden tavern is not shown a rejection
> on every open.
>
> **The table is told where the party is by being sent geometry for exactly one
> map and nothing for the rest.** Not by a flag it has to interpret: a screen
> that cannot be given the wrong room cannot draw one (R-85).
>
> `inside` is **pruned at the open boundary** when the map it names is gone.
> Deleting a point of interest with the party standing in it would otherwise
> leave the table pointed at nothing.

> **R-159.** **Levelling is a toggle, and hiding a level must not let the GM
> edit through it.**
>
> The console shows the whole body or **the band alone** — the GM's own choice,
> view state (R-64), off by default because the whole body is the safe view to
> build in. While it is on, the GM sees exactly what the table sees.
>
> The band is a **slice**, not a dimming, and that is the load-bearing part: the
> hidden levels are **absent from the scene**, so they cannot be picked. A dimmed
> block is still clickable, which is how a GM edits something they cannot see.
>
> Absence alone is not enough, because a ray passes through what is not there and
> lands on the far side — so the cell in front of a visible face may hold a block
> a level down. Hence:
>
> - **Placing and repainting are separate intents**, refused for opposite
>   reasons: build will not overwrite an occupied cell, paint will not conjure a
>   block into empty space. They shared one intent while every block was drawn,
>   because a face you can see has air in front of it and the difference never
>   showed. It shows now (D-202).
> - **A placement outside the band is refused while levelling**, because the
>   block would be placed and then vanish.
> - Erase, paint and fill need no band check: they act on a block that was
>   picked, and only a visible block can be picked.
> - A **fill reports how much of its reach is unseen**, because connected
>   material runs straight through a cut and a one-click tool should not be quiet
>   about that.
>
> Both refusals are stated in the readout *before* the click and enforced again
> by the host. The client check is not the guard — it is so a gesture the readout
> already called impossible never becomes a rejection toast.
