# Decisions

Append-only. Entries are never edited; a wrong decision is **superseded** by a
later one so the reasoning survives. Rules in `ARCHITECTURE.md` cite these.

Status: `agreed` · `proposed` (made unilaterally, awaiting confirmation) ·
`open` (blocking, undecided) · `superseded by D-nnn`

---

## Agreed

### D-001 — TypeScript + three.js, not Unity · `agreed`
It is a **tool**, not a game. The two things Unity gave the prototype most —
physics raycasts as vision and scenes as maps — were both being discarded anyway.
The remaining work is dominated by UI (world builder, encounter builder, POI
inspector, travel calculator, notes, palettes, campaign picker) and by
persistence, where HTML/CSS and Node are simply better tools. Browser delivery
also means the table display runs on whatever hardware is in the room.
**Cost accepted:** we assemble our own low-poly asset pipeline, and we give up
Unity as an escape hatch if this ever becomes a game with production values.

### D-002 — Two screens, one room, one party connection · `agreed`
On-site use: a GM computer and a Player computer, side by side, same table.
"Players" is plural as people but singular as a connection and a viewpoint.
**Consequences:** no accounts, no auth, no chat, no latency compensation, and no
per-token vision — visibility is party-wide (see D-018).

### D-003 — Off-tool is a first-class concept · `agreed`
Dice, damage, initiative and scouting outcomes are resolved by the humans. The
tool represents world and situation. Encoded as R-1 and R-2, and R-2 makes it a
filter on all future feature requests rather than a footnote.

### D-004 — World is 20×20 chunks of 20×20 columns · `agreed`
400 chunks × 400 cells ≈ 160k columns ≈ 1–2 MB. Trivial as data. Never rendered
at voxel detail in the world view (see R-12 and D-010).

### D-005 — Discovery is GM-granted, not computed · `agreed`
Players tap a POI, or the centre of a chunk they know nothing about. The actual
scouting happens off-tool; the GM then reveals. No world-scale line of sight.
Encoded as R-16.

---

## Round 1 — decided by me, then reviewed

D-006, D-007 and D-013 were approved on review. The rest still carry
`proposed` and are open to challenge.

### D-006 — Campaign and save are separate stores · `agreed`
Authored content (world, terrain, POIs, encounter maps, registries) lives in a
campaign file. Play state (token positions, discovery, fog, notes) lives in a
save that references the campaign by id and schema version.
**Why:** if they share a file, saving a session forks the entire world and
editing a map corrupts every earlier save. This is the decision I would least
like to reverse later.

### D-007 — One `VoxelGrid`, two brush sets · `agreed`
Chunk terrain (columnar) is a constrained case of a sparse voxel grid, so world
and encounter maps share one implementation, one serialiser and one renderer.
The world builder's brushes preserve the one-column-per-cell invariant; the
encounter builder's do not. **Why:** the alternative is two of everything.

### D-008 — GM console and table display are separate apps · `agreed`
Not one app with `if (role === 'gm')`. `apps/gm` and `apps/table` share
`packages/render` and `packages/ui`, but GM panels physically live in `apps/gm`
and are therefore unreachable from the table build. **Why:** you asked for
enforced encapsulation; this makes the most security-relevant boundary in the
product a build error instead of a code-review question. **Cost:** two Vite
builds and some duplicated shell scaffolding.

### D-009 — Terrain edits write to the campaign, never the save · `superseded by D-020`
Makes "what does saving save?" answerable in one sentence: tokens, discovery,
fog, notes. **Open sub-question:** does the GM edit terrain *during* a live
session, or only in a separate build mode? If mid-session editing matters, this
needs a real answer, because it is the one case where the two stores blur.

### D-010 — Chunks are stored sparsely; bounds are per-campaign · `proposed`
An absent chunk *is* the unknown, which lines up exactly with D-005. 20×20 is
the default bound, not a hard limit. **Why:** a real campaign authors 20–40
chunks, not 400, and a hard-coded bound is a limit you regret for free.

### D-011 — npm workspaces monorepo, 3 apps + 7 packages · `agreed; extended by D-052`
`apps/{host,gm,table}` and `packages/{geometry,domain,protocol,sim,persistence,render,ui}`.
**Why npm workspaces:** zero extra tooling. pnpm is better at monorepos; it is
not better enough to justify a second package manager here.

### D-012 — Boundaries enforced four ways · `proposed`
`exports` maps, TS project references, `dependency-cruiser` encoding the
dependency graph, and ESLint `no-restricted-imports`. All in CI and pre-commit.
**Why:** the previous `ARCHITECTURE.md` was correct and ignored, because nothing
checked it. Unchecked rules are decoration.

### D-013 — Registries are stable string ids, append-only · `agreed`
`material:mossy-stone`, never `materials[7]`. Reordering is a migration.
**Why:** palette-index drift silently re-textures every saved map. It is the most
common corruption bug in voxel projects and it is free to prevent now.

### D-014 — Branded id types · `proposed`
`type PoiId = string & { __poi: true }`. **Why:** `PoiId` and `EncounterId` are
both strings, and passing one where the other belongs should not compile.

### D-015 — Plain data + pure functions; no singletons · `proposed`
Classes only where GPU resources or genuine lifecycle exist. Dependencies passed
in, never located. **Why:** `POV.cs` became a 540-line god-object specifically
because `Token` reached for it with `FindAnyObjectByType<POV>()`.

### D-016 — JSON files on disk for storage · `superseded by D-051`
Inspectable, diffable, trivially backed up, and a campaign can be handed to
someone as a file. SQLite if and when a save exceeds what JSON handles
comfortably. **Cost:** no queries, whole-file writes.

### D-017 — Runtime validation only at boundaries · `proposed`
Zod at the WebSocket edge and at file reads; trusted types everywhere inside.
**Why:** validating in the middle is how you get three sources of truth.

### D-018 — Party fog is the union across party tokens · `proposed`
Follows from D-002, but stated explicitly because it is load-bearing: there is no
per-token vision and no per-player view. This deletes an entire axis of
complexity and matches how the prototype and the Unity build both already worked.

### D-019 — Roughly 7 files per folder, then split · `agreed`
**Flagging that the number is arbitrary.** The intent is a hard trigger for the
"big folder" failure you named, rather than a judgement call that never fires.
Happy to change the number or replace it with a different trigger.

---

## Round 1 open items — now resolved

### O-001 — Cell scale · `resolved by D-021`
How much distance is one world cell? The travel calculator has no units without
it. 1 km/cell gives a 400×400 km world (a kingdom); 200 m/cell gives 80×80 km
(a duchy). Also: do you want pace presets (forced march / normal / cautious) as
multipliers, and terrain cost derived from column height and colour?

### O-002 — Encounter map bounds · `resolved by D-022, D-023, D-024`
Default footprint and vertical extent. The prototype used 26×26×12 and it felt
small for a village, generous for a room. Is the encounter map the same 20×20 as
a chunk, or its own size per POI?

### O-003 — Mid-session terrain editing · `resolved by D-020`
See D-009. Does the GM ever reshape an encounter map while the party is standing
in it? If yes, we need an overlay in the save; if no, the model stays simple.

### O-004 — Posture model · `resolved by D-035 (rejected: no posture)`
The prototype coupled standing/crouched/prone to both eye height and vertical
clearance, which is what made "see over a wall standing, not crouched" and
"crawlspace only when crouched" work for free. Keep it, or is that already
off-tool for you?

### O-005 — What happens to the prototype in this folder · `resolved by D-028`
`table-top-scenarios/` currently contains the Node/three.js prototype at its
root, which collides with a monorepo root. Options: move it to `prototype/` as a
reference, delete it, or start the real project in a fresh directory. I have not
touched it.

---

## Round 2

### D-020 — Build mode vs Play mode; play edits go to a save overlay · `agreed`
**Supersedes D-009.** Nicolás: *"maybe the GM removes a fake wall, idk, but I see
that happening."* That breaks D-009, so it is replaced rather than patched.

Build-mode edits write the campaign. Play-mode edits write a sparse overlay in
the save. Load = `campaign + overlay`. The fake wall stays removed for this
group's save and is intact when the dungeon is run again. Encoded as R-9.

Note: the second example — toggling a cave's visibility on the world map — is
**discovery** (D-005/R-16), not editing, and needed no change.

### D-021 — World cell is 200 m · `agreed`
Chunk = 20×20 cells = 4×4 km. Default world of 20×20 chunks = 80×80 km, roughly a
duchy. Feeds the travel calculator. Stored on the campaign, not hardcoded (R-25).

### D-022 — Encounter maps have no hard maximum · `agreed`
Answering "is 200×200×200 crazy?": no, and the bound is the wrong lever. Sparse
storage means cost tracks *filled* voxels; chunked greedy meshing means rendering
tracks visible surface. The real budget is party fog, which scales with filled
voxels in range. So we declare no maximum and let cost track content. Encoded as
R-25.

### D-023 — Multi-level dungeons are linked maps, not tall volumes · `superseded by D-043`
A dungeon level is 5–10 cells tall; 200 cells at 1.5 m is a 300 m tower. Vertical
extent stays generous but modest and levels link to each other. Encoded as R-26.

### D-024 — Encounter cell is 1.5 m (5 ft) · `agreed`
Tabletop convention, and it makes the posture numbers land correctly: standing
1.8 m needs `ceil(1.8/1.5)` = 2 cells of headroom, crouched 1.0 m needs 1. **This
is my proposal, not your answer — confirm or change it.**

### D-025 — Heights in metres, clearance derived · `superseded by D-035`
All body and eye heights are metres; clearance is `ceil(height / cellSize)`. A
refinement over the prototype, which stored heights in cells and thereby assumed
1 m cells. Encoded as R-27.

### D-026 — Keep the posture model, default to standing · `REJECTED, see D-035`
Answering O-004. It is purely spatial, so R-1 includes it: "can I see over that
from a crouch" is exactly the 3D reasoning that is hard to hold in your head,
whereas dice are off-tool. Optional per token, zero cost if unused. Encoded as
R-28. **Awaiting your call.**

### D-027 — dependency-cruiser is the authority on the graph · `agreed`
Discovered while verifying the scaffold: ESLint could not catch
`apps/table` importing `../../gm/src/index.js`, because a relative-path depth
heuristic cannot distinguish an intra-package `../../index.js` from a
cross-package escape. dependency-cruiser is repo-root aware and caught both test
violations. ESLint's role is narrowed to deep imports written as package
specifiers. The four mechanisms remain, with honest scopes.

### D-028 — Prototype moved to `prototype/`, not deleted · `agreed`
Its root `package.json` collided with the monorepo root. Moved wholesale; nothing
lost, one `mv` to undo. The Unity project is untouched and now out of scope, and
its `ARCHITECTURE.md` is stale — the docs here were written fresh, citing it only
as a cautionary example of an unenforced rule.

---

## Open

### O-006 — Travel calculator specifics · `resolved by D-044`
Pace presets (forced march / normal / cautious) as multipliers on 200 m cells?
And should terrain cost be derived from column height and colour, or set by hand
per POI-to-POI link?

### O-007 — Encounter map ↔ chunk relationship · `resolved by D-042`
A POI sits on one 200 m world cell but its encounter map may be 150×150 m. Is
that a deliberate abstraction we simply accept, or should the tool relate them?
My instinct is accept it and never mention it again.

---

## Round 3 — camera

### D-029 — God view only, orthographic, stepped angles · `agreed`
Nicolás: *"I imagine this tool always as a god view, isometric... it's fog of war
shared by tokens, from an isometric view."* One camera rig across world, chunk
and encounter; zooming in changes the `MapRef`, not the camera mode. Yaw in 45°
steps, pitch stepped 30/35/40/45. Orthographic is confirmed as the choice rather
than the fallback: it keeps cube sizes and the grid legible at any zoom, and the
Unity prototype already had it working. Encoded as R-29 through R-32.

### D-030 — No first-person or per-token camera, ever · `superseded by D-036`
Explicitly rejected. Simplifies `render` (no second camera, no picture-in-picture)
and reinforces D-018: there is one shared view because there is one shared table.

### D-031 — Ray-debug overlay replaces the eye view as the correctness check · `superseded by D-036`
The prototype's eye view was the cross-check that ray maths and rendering agreed.
Dropping it removes that, and a visibility bug then stays invisible until it
confuses someone mid-session. So the GM console keeps a ray overlay drawn in the
isometric scene: every ray for a chosen observer/target pair, coloured by outcome,
with the dominant blocker boxed. GM-only, off by default. Encoded as R-38.

### D-032 — Occlusion fade is a `geometry` query, not a camera feature · `agreed`
A god view must fade geometry between the camera and the party or the party is
invisible indoors. "Which voxels lie on these segments" is spatial, so it is a
pure function in `geometry`; `render` only applies the material. This is the
direct fix for the Unity build, where ~150 lines of roof and wall dithering lived
inside `POV.cs` and were the main reason it reached 540 lines. Encoded as R-33.

### D-033 — Depth legibility measures are requirements, not polish · `partly agreed; clamp deferred to O-009`
Orthographic projection's real weakness is depth ambiguity. Three mitigations are
specified up front: a **ground stalk** under every token (R-34), a **view-height
clamp** per encounter map (R-35), and **picking that ignores faded geometry**
(R-36). The clamp is a view setting and must never affect visibility — clamping
the camera cannot reveal anything.

### D-034 — Eye height survives the removal of the eye camera · `agreed`
`eyeHeight` is what R-28 is built on. Encoded as R-37 specifically so nobody
deletes it later on the reasonable-looking grounds that nothing renders from it.

---

## Open (continued)

### O-008 — Does facing / field of view survive? · `resolved by D-039`
The prototype gave tokens a facing and a 120° view arc. Under D-018 (shared party
fog) and D-029 (one god view) most of its value evaporates: a party standing
together with 120° arcs each covers ~360° anyway, and "which way is my character
looking" is arguably off-tool (R-1) — the GM can just say.

**My proposal:** party fog is **omnidirectional**, range-limited, no facing. Facing
becomes optional metadata used only for on-demand GM queries — *"can this sentry
see the party?"* — which is genuine 3D reasoning worth keeping. That drops
per-turn rotation bookkeeping for every party token while keeping the one case
where facing earns its place.

Needs your call: omnidirectional party fog, or keep facing for everyone?

---

## Round 4 — fog of war, simplified

### D-035 — Binary fog. No cover, no posture. · `agreed`
Nicolás: *"the cover/posture thing, I dont want it, it's work for nothing. I want
a fog of war that is correct, but not overcomplicated."*

**Supersedes D-025, rejects D-026.** Retires R-27, R-28, R-37 and the graded-cover
half of R-15.

What goes:
- posture (standing/crouched/prone) and its clearance coupling
- graded cover (clear / light / heavy / total) and the fraction that produced it
- head-visible-versus-body-visible reporting
- the configurable seam policy — now fixed to sealed (R-44)

What stays, and why:
- **multi-sample rays with any-clear-wins** (R-41). Binary is the *output*, not the
  method. A single centre-to-centre ray flickers on corners and makes the diagonal
  seam painfully visible; several samples cost the same as grading did and behave
  far more predictably. Removing the sampling would make fog worse, not simpler.
- **one eye height at 0.9 × cell** (R-43), chosen for usability, not anatomy. It
  yields *"one cube of wall blocks sight; one cube of elevation lets you see over
  it"* — a rule a player can hold in their head. A literal 1.6 m eye sits above a
  1.5 m cube, so single-cube walls would not block: true, and surprising every
  time. Elevation now does the work posture used to, and terrain already varies.
- **whole-cube granularity** (R-42), never faces.
- **three cumulative fog states** (R-45), matching the Unity prototype's existing
  `FogState`. Cumulative Explored is the biggest reason fog feels calm instead of
  strobing.

### D-036 — Eye view is a GM debug tool, not a feature · `agreed`
**Supersedes D-030 and D-031.** Nicolás: *"Eye's view is ok for debugging."*
Both diagnostics exist, GM-only, off by default, never reachable from the table
display (which cannot even import them — D-008). D-030 was too absolute: the
objection was to a per-token camera as a *player-facing feature*, not to the
debug affordance.

### D-037 — The GM is in the room · `agreed`
Elevated to a first-class principle (R-39) because it is the licence behind this
whole round. Players sit beside the GM, one screen each. The tool must be correct
enough and predictable, not perfect. Wherever the choice is more precision versus
a GM override, take the override.

### D-038 — A manual reveal/hide brush is required · `REJECTED by Nicolás`
The direct consequence of D-037, and the reason binary fog is safe to ship: when
geometry does something odd, the GM overrides it at the table in two clicks rather
than waiting for us to fix an algorithm. Stored as play state, in the save.
Owlbear ships manual fog tools alongside computed line of sight for the same
reason. Encoded as R-47.

### D-039 — Omnidirectional vision, no facing · `agreed`
Answers **O-008**. Not stated outright, so flagged rather than assumed, but the
direction of this round makes it the obvious reading: facing would mean rotating
every token every turn to feed a model that no longer grades anything. Range
limit only. Encoded as R-46. **Confirm or push back.**

### D-040 — Owlbear Rodeo is the usability benchmark · `agreed`
Nicolás: *"We use owlbear.rodeo, it's just top-view, and fog of war is just wall
obstruction... we will have a 3D world, so it will be different but we gonna need
to work a lot on this to make it friendly."*

Recorded as a *reference point*, not a feature list: Owlbear's fog is understood
instantly because the mental model is one sentence. Our 3D equivalent has to earn
the same property, which is what R-41 through R-45 are each individually trying to
protect. Expect this area to be revisited more than any other in the project.

---

## Round 5 — knowledge, sight height, travel, POIs

### D-041 — Eye height is 1.2 × cell; one cube does not block, two do · `agreed`
**Reverses my own R-43 from round 4.** I had proposed 0.9 cells so that a single
cube blocks sight. Nicolás: *"I want definitely to have tokens seeing across a
1-block wall, it's a small wall, but 2-blocks wall will do the blocking, so
token > 5ft."*

He is right and I was optimising the wrong thing — I picked the number that made
*my* slogan tidy rather than the one that matches how a 1.5 m wall actually
behaves. Eye height is now **1.2 × cell size (1.8 m)**, stored as a ratio because
the rule is about cubes, not metres.

The rule of thumb is better than the one it replaces:

> A one-cube wall is chest-high — you see over it. Two cubes block.
> Each cube of elevation buys you one more cube of wall.

Formally: feet at height *f* sees over walls ≤ *f+1*, blocked by ≥ *f+2*.
**R-43a** makes the ratio's `(1.0, 2.0)` bound a tested invariant, because either
end silently destroys the rule.

### D-042 — A POI's maps have no geometric relation to its world cell · `agreed`
Answers **O-007**. A POI sits on one 200 m cell, may have a 3×3 footprint, and
its market map may be 150 m across while its dungeon is bigger than the realm
above it. Accepted abstraction, never surfaced in the UI, never validated.
Encoded as R-50 and R-51.

### D-043 — A POI owns an ordered list of encounter maps · `agreed`
**Supersedes D-023.** Nicolás: *"the POI should handle a list of encounter maps...
all floors for 1 POI. Also the reign example buys it, the main square, the market,
etc."*

This is a better model than the map-to-map linking I proposed for multi-level
dungeons. The POI is the container, so there is nothing to link — dungeon floors
and a realm's districts are the same structure. Navigation picks from a named
list, and `MapRef` gains an `encounterId` (R-13).

Connectors between maps ("these stairs lead to Level 2") are deliberately **not**
modelled: the GM says it out loud (R-1, R-39). Possible later polish, not v1.

### D-044 — Travel calculator · `agreed`
Answers **O-006**. Total distance, a pace picker from an append-only registry,
time from terrain difficulty. Per-column `difficulty` multiplier, absent = 1,
stored sparsely with an `impassable` marker. Weighted 8-way shortest path;
generic pathfinding in `geometry`, paces and the time formula in `domain`.
Encoded as R-52 through R-54, and R-56 (travel reveals nothing).

### D-045 — The player-facing estimate is computed from known chunks only · `WITHDRAWN, moot after D-048`
My addition, and the one thing in this round I did not derive from your answer —
so flagging it.

The table display estimates using only `Known` chunks, substituting default
difficulty for the rest. The GM console shows the true figure. Players plan with
the information they actually have, and a route through unknown mountains
honestly takes longer than they thought.

The knowledge model (R-16) already holds everything needed, so this is free, and
the alternative leaks the terrain difficulty of land nobody has seen. Encoded as
R-55. **Say if you would rather both screens show the true number.**

### D-046 — Chunk knowledge is two states; unknown hides terrain shape · `agreed`
A chunk is `Unknown` or `Known`; a POI is `Hidden` or `Revealed`, independently,
so a known chunk can still hold secrets.

The part worth confirming: an `Unknown` chunk renders as a **featureless
placeholder**, not a greyed-out silhouette of its real terrain. The shape of the
land is itself information — a greyed mountain range still tells you there is a
mountain range. Encoded as R-16.

### D-047 — Table selection is mirrored to the GM console · `WITHDRAWN, see D-048`
Small, and it falls out of *"if the players tap on a greyed out chunk, the GM has
to enable it."* When the table display selects something, the GM console
highlights it, so players can point instead of reciting coordinates. No request
queue, no notifications — the GM is sitting there (R-39). Cheap; say if you do not
want it.

---

## Round 6 — the scouting loop

### D-048 — Unknown chunks are inert; the map grows through a four-step loop · `agreed`
Nicolás: *"I think it could be better to forbid player to click on undiscovered
chunks, instead of that, they travel to the edge of a known chunk, do the scout
off-tool flow, the GM unveils the chunk with as many POIs are accurate, and then
the players do a separated travel. Simpler, easier."*

The loop (R-57):

1. party travels to a cell at the edge of known territory
2. scouting happens **off-tool**
3. the GM reveals the adjacent chunk and whichever POIs are accurate
4. the party makes a **separate journey** into it

Every step is an action the tool already has. No request affordance, no queue, no
notification, no special mode. `Unknown` chunks become plain scenery: not
clickable, not selectable, not a travel target (R-16a).

**This is the cheapest change we have made and it deleted the most.** Downstream:

- **D-045 withdrawn as moot.** My "the table display estimates from known chunks
  while the GM sees the truth" idea only had a purpose while a route could cross
  unknown land. Under D-050 every routed cell is in a known chunk, so its
  difficulty is known, so both estimates are identical. The cleverness was
  solving a problem this flow does not have.
- **D-047 withdrawn.** Mirroring the table's selection to the GM console was
  justified almost entirely by "players tap a greyed chunk to ask about it." That
  interaction no longer exists, and players can point at the screen with a finger
  (R-39). Withdrawn rather than kept on vague general grounds; easy to revive if
  it is actually missed.
- The "tapping the centre of an unknown chunk" idea from round 2 is retired.

### D-049 — The party has a world-map position · `agreed`
Implied by *"travel to the edge of a known chunk"*: the destination is a place, not
only a POI. So the party is a marker at a chunk coordinate plus a cell, and travel
targets are any cell in a `Known` chunk or a `Revealed` POI anchor. Time passing
stays off-tool — the tool moves the marker and reports distance and duration.
Encoded as R-58.

### D-050 — Routes path through known chunks only · `agreed`
The strict reading of D-048, and the one that makes the loop self-consistent: you
cannot route through land you have never seen. An unreachable destination is
**refused with that reason**, and the fix is the scouting loop rather than a
longer path.

The case to check before agreeing: a chunk the GM revealed from **lore** rather
than travel — *"you have all heard of the capital"* — may be `Known` but not
connected to known territory. Under this rule the party cannot travel there
directly; they have to scout their way across. I think that is correct and quite
evocative, but it is a real constraint and you may want the opposite. **Your
call.**

---

## Round 7

### D-008 — confirmed: two apps
*"Two apps, they might share common packages, but two apps definitely."*
Shared code lives in packages; the GM/table split stays a build boundary.

### D-050 — confirmed: routing through `Known` only
*"players might want to split the trip, travel up to the edge of the unknown,
scout, and then decide; but the pathfinding resolves only through Known chunks."*
That splitting is exactly R-57, so no new mechanism is needed. D-045 stays
withdrawn: every routed cell is known, so there is no estimate to diverge.

### D-051 — Hybrid storage: JSON structure, packed voxels, campaign as a directory · `agreed`
**Supersedes D-016.** My original "JSON files on disk" did not survive the
arithmetic: ~20 POIs with a few levels each is several hundred thousand filled
cubes, which is 10–35 MB as one JSON entry per cube, rewritten whole on every
save.

Structure stays JSON (manifest, world, POIs, registries, all saves); voxel bodies
get a per-32³-chunk palette plus RLE, landing the same content at 1–3 MB. And a
campaign becomes a **directory**, so editing one dungeon level rewrites one file.
Encoded as R-59, R-60, R-61.

### D-033 — partly confirmed, clamp deferred
Ground stalks and picking-ignores-faded-geometry are agreed and cheap. The
**view-height clamp** is deferred: it is entangled with the encounter-map level
question now recorded as O-009.

---

## Open

### O-009 — What is an encounter map, vertically? · `open`
Raised by Nicolás and deliberately **not** designed yet:

> *"A plaza surrounded by markets and houses, a church, they might all have
> different levels, but we can probably enforce the rule of 'an encounter map is
> about 1 level', then inside the map, a stair has an interaction that might load
> the level up/down (a new map), but we still need to show the building with its 3
> floors, we have this 3D maps for that, to illustrate height too (something
> owlbear does not have)... That's why this is so difficult to define."*

The tension, stated plainly:

- **For visibility to stay simple**, one map wants to be roughly one level. Fog,
  the eye-height rule (R-43) and the clamp all get easier.
- **For the 3D to be worth anything**, a building must *look* like it has three
  floors. Height as illustration is the whole reason not to use Owlbear.

So the same geometry is playable at one level and scenery at the others, and
"which level am I resolving vision on" becomes the hard question. This blocks the
view-height clamp (D-033), interacts with R-49 (a POI owns many maps) and with
R-42 (whole-cube granularity).

On hold at Nicolás's request until the remaining confirmations are done.

---

## Round 8 — internal structure

### D-011 — confirmed, and extended
*"I love to have these parts, and if you need more, they will be accepted."*
All ten kept; none collapsed.

### D-052 — Add `@tt/client-core` · `agreed`
The gap the confirmation exposed: `apps/gm` and `apps/table` both need a
WebSocket client, a snapshot store, the `MapRef` view stack, and the
snapshot-to-render bridge. Cross-app imports are forbidden (D-008), so that code
was heading for duplication in both apps.

`client-core` is **role-neutral by rule** — no GM branch in it. Secrets and
GM-only panels stay in `apps/gm`, so the D-008 boundary is untouched. Eleventh
workspace; graph, tsconfig references and dependency-cruiser rules updated and
verified.

### D-053 — Apps are organised by feature, never by kind · `agreed`
No top-level `components/`, `utils/`, `state/`. A feature owns its panel, its
local state, its input and its intents (R-62), and features may not import each
other (R-63) — shared things move down to `client-core` or `ui`. This is aimed
squarely at *"avoid big folders and code spaghetized"*: horizontal folders are the
usual way a codebase gets there, because each one grows without bound and every
feature is smeared across four of them.

### D-054 — Server state and view state are separate stores · `agreed`
Snapshot is deep-readonly and replaced wholesale; camera, selection, tool and
view stack are local and never overwritten by a snapshot (R-64). Prevents the
incoming-snapshot-resets-the-camera class of bug.

### D-055 — `main.ts` is the composition root · `agreed`
Nothing reaches out for a collaborator; everything is wired in one file (R-66).
D-015 made concrete, and the direct fix for `Token.cs` calling
`FindAnyObjectByType<POV>()`.

---

## Open (continued)

### O-010 — UI framework for the browser apps · `resolved by D-056`
Not chosen, and R-24 requires a decision before adding it. The internal structure
above is framework-agnostic, so this can be answered late — but not never.

The UI volume is large (two builders, POI inspector, travel, notes, palettes,
campaign picker, session control), and three.js owns the canvas regardless — the
framework only draws the panels around it.

- **Svelte 5** — my recommendation. Small output, very little boilerplate, stays
  out of three.js's way, and panel-heavy UIs are its sweet spot.
- **React** — biggest ecosystem and the most familiar; heavier, more ceremony.
- **Solid** — React-shaped with finer reactivity and a smaller runtime.
- **No framework** — what the prototype did. Fine at prototype scale; this is
  several times that, and hand-rolled DOM for a dozen panels is where the time
  would go.

---

## Round 9 — engineering audit

Requested: *"be top-tier engineer... if we are taking now a bad path due to
pre-existing things, it's the perfect moment to take a turn."* Two of the four
findings below are collisions between decisions I made myself.

### D-056 — React 19 for panels; three.js stays imperative; no react-three-fiber · `agreed`
Resolves **O-010**. I had been leaning Svelte. Reversing on the stated constraint —
no experience with this stack — because React has by far the largest body of
learning material and the best editor tooling, and Svelte 5's runes split its
tutorials between two idioms, which is a poor place to learn from. Performance is
not a factor: three.js owns the canvas and React only draws the panels around it.

**The load-bearing half of this decision is the rejection.** react-three-fiber
would put the scene graph inside React's reconciler, tying GPU resource lifetimes
to component renders and making `render` depend on the UI layer. That collapses
R-32 (camera holds no state), R-64 (server/view state split) and R-70 (meshing is
internal) simultaneously. One `<canvas>` handoff, imperative thereafter (R-68).

### D-057 — Fog is never baked into geometry · `agreed`
**A collision between R-45 and R-25, both mine.** R-45 gives every cube one of
three fog states with different appearance. R-25 committed to chunked greedy
meshing. But greedy meshing merges adjacent cubes into single quads, and cubes in
different fog states cannot share a quad — so every token step would force a
re-mesh, costing more than the meshing saved.

Fog becomes a per-cube attribute the shader reads (R-69), and the meshing strategy
becomes an internal detail of `render` behind a stable seam (R-70). **Start with
`InstancedMesh` per material** — one draw call per material, fog updates are an
attribute write, a few dozen lines — and reach for greedy meshing with a fog
lookup texture only if measurement demands it. R-25 no longer specifies meshing.

### D-058 — Two channels: geometry once plus deltas, play state whole · `agreed`
R-19 implied one snapshot per change as the only path to a client. Correct for
secrecy, wrong for performance: resending a 55k-voxel map on every token move
makes the client **re-mesh on every step**. Bandwidth is free on a LAN; the
stutter is not.

Geometry is sent on map open and thereafter only as edit deltas; play state is
small and sent whole. The single-filter security property is preserved — one
`viewFor(role, state)` still feeds both channels (R-19, R-19a).

### D-059 — Packages are consumed as source; no build step · `agreed`
**Supersedes the toolchain half of D-011/D-012.** The original setup used
`composite` project references with `NodeNext`, which means `.js` extensions on
relative TypeScript imports, a build before apps can run, and two sources of truth
per module. That is daily friction, and it bought a second enforcement of the
dependency graph that dependency-cruiser already owns as the authority (D-027).

Now: `moduleResolution: "bundler"`, `exports` points at `src/index.ts`, no `dist`,
no per-package `tsconfig.json`, one `tsc -p tsconfig.json` for the whole repo,
`tsx` to run the host. A workspace is now four things: `package.json`, `README.md`,
`src/`, `test/`.

Verified after the change: the deliberate `apps/table → apps/gm` import still
fails with `error layer:table`. Enforcement unaffected. Encoded as R-73.

### D-060 — Never index a grid directly · `agreed`
`noUncheckedIndexedAccess` is on and `!` is banned, which together would be
miserable in sparse-grid code. `geometry` exposes accessors returning `T | null`
so absence is a value you handle, not a type you silence. A missing cell is the
most common case in a sparse grid and belongs in the signature.

### D-061 — The documentation stops growing until code catches up · `agreed`
72 rules, 61 decisions, and essentially no implementation. That ratio is now a
risk in its own right: rules written without code to validate them are guesses
with authority.

From here the docs change only when code proves a rule wrong or a real choice
appears. The next commit is `packages/geometry`, tests first.

---

## Round 10 — corrections

Three errors of mine, corrected. All were over-rotation after being told I might
be anchored: I changed things that were already right rather than looking harder
at the thing that was flagged.

### D-038 — rejected
*"the encounter vision is calculated, the GM can reveal POIs or chunks in the
world map only."* No manual fog painting on encounter maps. GM revelation is
world-scale only — chunks and POIs. R-47 removed.

### D-062 — The two revelation mechanisms stay separate · `agreed`
I briefly merged R-15 and R-16 into one "revealed set with GM authorship and
line-of-sight automation". That was a regression. Encounter fog is **computed**;
world knowledge is **authored**. The original instruction not to unify them was
correct and is restored.

### D-063 — Sight range is per token and was always agreed · `agreed`
Round 5, verbatim: *"no, we should go omnidirectional with range limit."* I
wrongly listed this as an unexamined import from my prototype and replaced it with
a per-map GM setting. Reverted: omnidirectional, range-limited, range is a
property of each token (R-46).

### Kept from round 9
Removing the Unity appeals from the rules stands — a rule that needs an anecdote
about an abandoned codebase to justify it is not well argued. So does deleting
`posture` and `facing` from the `Token` model; both were rejected several rounds
earlier and had simply been left in the shape.

---

## Open

### O-011 — What happens to a cube the party has left behind? · `resolved by D-064`
Flagged by Nicolás as possibly stale. It is: three-state cumulative fog came from
the prototype and has never been chosen for this tool. Restored unchanged rather
than silently swapped, because nothing has been decided.

---

## Round 11 — encounter vision

### D-064 — Three cube fog states, Explored is cumulative · `agreed`
*"stays dim — we remember it (b)."* R-45 stands exactly as it was. Worth noting:
this is the rule I flagged as possibly stale and offered to replace with two
states. It was right as written — being inherited from the prototype did not make
it wrong, only unexamined.

### D-065 — Sight range is per token, GM-editable, default 60 ft · `agreed`
Omnidirectional with a range limit; the range lives on the token and the GM can
change it per token. Encoded as R-46 and R-46a. Unit conversion flagged as O-012.

### D-066 — Only blocks occlude; occlusion is a material property · `agreed`
*"a block / cube / voxel, however you call it, is the only sight-blocking element
in the map, and a block might be water made, glass, or whatever transparent, so
they can be non-blocking too."*

Two rules follow:

- **Tokens never occlude** (R-74). Fog becomes a pure function of terrain plus
  token positions, and the "my ally is blocking my view" class of confusion
  disappears entirely.
- **`blocksSight` is a property of the material** (R-75), not of being a block.
  `material:glass` and `material:water` are blocks that do not occlude. Adding a
  transparent material is a registry entry, not a code change.

This also gives the material registry its first defined field. Materials were
previously just an id and an appearance.

### D-067 — Enemy awareness is off-tool; the GM previews the party's view · `agreed`
The tool never computes whether an NPC can see the party. Separately, the GM
console can render its own camera using the **party's** revealed set, to check
what is on the players' screen (R-76). Distinct from the per-token eye view in
R-48, and a feature rather than a diagnostic.

---

## Open

### O-012 — 60 ft, or 60 blocks? · `resolved: 60 ft = 12 blocks`
*"We can set 60ft of radius (or 60 blocks) as default."* Those are not the same
number at our cell size, and the gap is large:

- **60 ft = 12 cells** (D-024 puts a cell at 5 ft / 1.5 m). This matches the usual
  tabletop darkvision radius.
- **60 blocks = 300 ft = 91 m**, which on most encounter maps is effectively
  unlimited.

Recorded as 12 cells because 60 ft is almost certainly what was meant, but flagged
rather than assumed.

### D-068 — Default sight range is 12 blocks · `agreed`
*"Yes, you are right, 60ft, 12 blocks!"* 60 ft at a 5 ft cell. Per token,
GM-editable (R-46, R-46a).

### D-069 — Build order is world first, encounter last · `agreed`
*"I would rather work from easiest to hardest, I want to build from the world to
the encounter."*

This supersedes the milestone sketch from round 1, which had v0.1 as a single
encounter map end-to-end on the grounds that it de-risked the most. Wrong
priority for this project: the world layer is genuinely simpler, it exercises the
same spine (data model, host authority, persistence, isometric camera, knowledge
flags, the navigation stack), and O-009 — what an encounter map even *is*
vertically — is still unresolved. Building the hard, undefined thing first would
be building on sand.

Revised order:

1. **World** — chunks, columns, the world builder, the isometric camera rig,
   chunk knowledge, save/load.
2. **Navigation and travel** — the view stack, POI markers and reveal, distance,
   pace, time.
3. **Encounter** — the voxel builder, tokens, calculated fog.

Encounter-scale rules already settled (R-15, R-40 to R-46a, R-74 to R-76) stay on
the books; they are simply not implemented until stage 3.

---

## Round 12 — the world layer

### D-070 — Two scales, not three. A chunk is not a view. · `proposed`
Nicolás, thinking aloud: *"the world map should show the chunks as they are. The
POIs are always visible too. What makes me think, whats the gain of the zoom
in..."*

He answered his own question: nothing. If the world map already renders chunks as
they are with POIs visible, zooming in adds magnification, not information — so
the chunk view was never a view. It was a leftover from assuming the world map had
to be a *simplified* overview.

A chunk stays the unit of **authoring** (a 20×20 block the GM creates) and of
**knowledge** (`Known`/`Unknown`). It stops being a place you navigate to.
`MapRef` drops to `world | encounter`, one navigation level and one set of zoom
clamps disappear, and "what does simplified mean" stops being a question (R-13a,
R-30).

Rendering is comfortable: a chunk's terrain is a heightmap, so it is one mesh per
`Known` chunk. Four hundred meshes is nothing, which is why no LOD scheme is
needed to make this work. **Marked proposed because it is structural and was
raised as a musing rather than a decision.**

### D-071 — Terrain is a palette that carries difficulty · `agreed`
*"The GM picks from a palette, difficulty should be associated to it, but the cell
should have then the chance to be overwritten."*

An append-only `Terrain` registry (R-11) of id, name, colour and
`defaultDifficulty`, plus a per-column override. Painting geography paints travel
cost in the same stroke, and the road through the swamp needs an override rather
than its own terrain type. `Column.colourId` becomes `Column.terrainId` (R-77).

### D-072 — Altitude is free; slope costs · `agreed`
*"The height must not affect the difficulty, the difference of heights must do
it."* Correct and better than a flat altitude penalty — being high up is not hard,
climbing is.

```
stepCost = baseDistance × difficulty(target) + slopeFactor × |Δheight|
```

`slopeFactor` defaults so one level of climb ≈ one extra cell of travel. Descent
charged the same as ascent, because this was asked to stay simple (R-52a).

### D-073 — New chunks are water at height 0, created with a `+` · `agreed`
*"We should show empty chunks with a plus button in the middle all around the one
created by default... every new chunk is level 0 water cells."*

A campaign starts with one chunk; every empty slot adjacent to an existing chunk
shows a `+` on the GM console only. New chunks arrive flat at height 0, entirely
water, and the GM raises land out of the sea. That makes "unfinished" and "ocean"
the same state rather than two, and it means water is a terrain-palette entry at
world scale as well (R-78, R-79).

### D-074 — Contextual tap: enter or travel · `agreed`
*"a player will tap on a cell of the chunk or a POI, and depending on the party's
token position, it will ask for getting in or travel to it."* One gesture; the
tool resolves it against the party's position (R-81).

---

## Open

### O-013 — Maximum column height · `resolved by D-075`
*"The tallest might be up to what the chunk has as height or width, in our case, I
think we said 200 cells."*

I think 200 is a crossed wire: 200 was discussed for **encounter** maps (O-002),
and separately **200 m** is the world cell size (D-021). No chunk dimension of 200
was ever set — a chunk is 20×20 columns.

The arithmetic, at 200 m per cell:

| Max height | Real elevation | |
|---|---|---|
| 10 | 2 km | a decent mountain range |
| **20** | **4 km** | Alpine; matches the chunk's own 20-cell width |
| 200 | 40 km | roughly five Everests |

**20 looks right** and has the tidy property of matching the chunk width, which is
what you reached for. Confirm?

### D-075 — Column height caps at 20 · `agreed`
4 km at 200 m per cell, matching the chunk's 20-cell width. The 200 figure was a
crossed wire between encounter-map bounds and the world cell size (R-80).

---

## Round 13 — POIs

### D-076 — One cell per POI; footprint deferred · `agreed`
*"Lets do 1 cell per POI now, in the future I would love to have an expand POI,
where you can pick the cells associated to it."* `Poi.footprint` is removed from
the model and recorded as O-014 rather than half-built. Single-cell keeps travel
targeting, marker placement and the tap gesture unambiguous (R-50).

Note this walks back part of D-042/R-50, which I had introduced with a `3×3 realm`
example. The concept survives as a future feature; the field does not exist yet.

### D-077 — Marker and name share one zoom threshold · `agreed`
*"They should disappear past some zoom and become the 3D miniature up close...
Names should be revealed at the same moment the 3D model is visible, they toggle
together."*

One threshold, both appear together. This also **refines round 12's "POIs are
always visible"**: they are always *revealed* — never fogged — but not always
*drawn*. Two different things (R-83, R-84).

### D-078 — Markers are cosmetic · `agreed`
A castle, a cave and a forest differ only in which model is drawn. No POI type,
no behaviour attached (R-82).

### D-079 — POI notes: ordered, individually visible, host-filtered · `agreed`
*"the GM should have the chance to add notes to each POI, sort them and mark them
as visible/unvisible. When Players tap on a POI, a menu panel will appear showing
the name and the visible info of that POI."*

An ordered `PoiNote[]`, each with `visibleToParty`. The GM adds, edits, reorders
and toggles. Notes marked invisible are **stripped by `viewFor`** and never reach
the table display — the same trust boundary as hidden tokens (R-85, R-19).

Reading taken: *"sort them and mark them"* refers to the **notes**, not the POIs,
since "the visible info of that POI" implies per-note visibility and POIs already
have their own `Revealed` flag. Say if you meant sorting POIs in a GM list.

### D-080 — "Visible" is three different concepts and gets three names · `agreed`
Fell out of writing D-077 and D-079 together: `Revealed` (the party knows it
exists), `visibleToParty` (a note may be shown), and *drawn* (past the zoom
threshold). Only the first two are state; the third is never persisted or
transmitted and must never be called "visible" in an identifier (R-84, glossary).

Cheap to separate now, and the sort of collision that otherwise produces a bug
where changing the camera leaks a secret.

---

## Open

### O-014 — Multi-cell POIs ("expand POI") · `open`
Wanted, explicitly deferred. A tool to assign extra cells to an existing POI, for
a realm or a city spanning several 200 m cells. Needs answers on what the extra
cells *do*: are they drawn differently, are they all valid travel targets, can
footprints overlap. Not blocking anything.

### O-015 — Do token notes use the same structure? · `open`
`PoiNote[]` is ordered with per-note visibility. `Token.notes` is currently a
single GM-only string ("internal notes to record hp or whatever"). Making them the
same shape would be consistent and would let the GM show a token's name and one
public line while keeping the rest private. Small, and not needed until stage 3.

---

## Round 14 — the builder, the party marker, and v0.1

### D-081 — Two terrain tools sharing one highlight · `agreed`
Paint (brush icon) sets terrain and leaves height alone; height (mountain icon)
takes a vertical drag on a cell and snaps to whole cubes, leaving terrain alone.
Both use the same snapped hover highlight, so the cursor never has to tell you
which mode you are in (R-87 to R-89).

Separating the two is what makes the water-at-height-0 start (D-073) work as a
workflow: paint the coastline, then pull the mountains up out of the sea.

### D-082 — The party marker is a moving, unclickable POI · `agreed`
Same miniature treatment, same zoom threshold (R-83). Differs only in moving and
in having no gesture attached (R-90).

### D-083 — Party members are campaign-level definitions · `agreed`
*"These tokens are the one that then the GM can instance into the encounter
maps."* So `PartyMember` is a template — id, name, colour, vision range — edited
once per campaign, instanced onto encounter maps on arrival. Identity survives
every map they walk through (R-91). Rendered as a chess pawn in the member's
colour.

NPC and enemy tokens are **not** modelled by this decision; they were not part of
this description and belong to stage 3.

### D-084 — This is v0.1, and it is the milestone · `agreed`
*"I love this part, I was waiting to get into this and it's the first thing I want
to see implemented."*

**v0.1 — the GM can build a world and a player can watch.**

| | |
|---|---|
| Host | serve both apps, one WebSocket, campaign list/create/load/save, report LAN address |
| GM console | campaign list → campaign view; paint and height tools; `+` chunk creation; party roster panel; connect address on screen |
| Table display | connect screen → world view, read-only, following the GM |
| Domain | Campaign, World, Chunk, Column, Terrain palette, PartyMember |
| Render | isometric rig, chunk heightmap meshes, water, snapped hover highlight, party miniature with zoom threshold |

Explicitly **not** in v0.1: POIs, travel, chunk knowledge/fog, encounter maps of
any kind, notes. Those are stages 2 and 3, and their rules stay on the books
unimplemented.

This replaces the round-1 ordering, which had a single encounter map as v0.1.

---

## Open

### O-016 — How does the table display learn the host address? · `resolved by D-086`
*"the players will be able to get into the Player web path, and they will see just
an IP textfield, with a connect button."*

There is a circularity worth resolving: if the table display is **served by the
host**, then the player already typed the address into the browser to reach the
page — so an in-app IP field asks for the same thing twice.

Options:

1. **Auto-connect (my recommendation).** The player opens
   `http://<gm-ip>:8080/table`, and the app connects to wherever it was served
   from. No field, no second step. The GM console shows the full URL (R-93), and a
   **QR code** beside it would let a player scan it off the GM's screen — which
   fits an on-site tool nicely.
2. **Keep the field**, and treat the page as a client that can point at any host.
   Useful only if the app is ever served from somewhere other than the game host.
3. **Both** — auto-connect, with the field as a fallback for a changed address.

Which did you have in mind?

### D-085 — `no-deep-imports` applies across workspaces, not inside them · `agreed`
Found by the first real code. The rule fired on `domain/src/index.ts` importing
`domain/src/world/index.ts` — which is precisely the structure R-6 and R-20
prescribe. Scoped to cross-workspace imports using a backreference to the
importer's own workspace; re-verified that a genuine cross-package deep import
still fails.

A rule that fires on correct code trains people to ignore it, which is worse than
having no rule.

### D-086 — The table display auto-connects; no address field · `agreed`
Reaching the page already required knowing the address, so asking for it again was
asking twice. The GM console shows the URL plus a QR code to scan off the screen
(R-93, R-94).

---

## Round 15 — the pattern

### D-087 — Hexagonal + unidirectional + feature slices. Not VIPER, not full Clean. · `agreed`
Asked directly which pattern we are using.

**VIPER rejected.** It solves a UIKit problem we do not have — view controllers
becoming god-objects. Its Interactor exists to hold logic away from the view,
which we already do in `sim` and `domain` behind a build-enforced package
boundary. Its Presenter formats entities, which a React component plus a selector
does in a few lines. Its Router manages navigation; we have two views and a
two-variant `MapRef`. Net effect would be roughly five files per screen to
re-solve problems already solved one ring inward.

**Full Clean ceremony rejected.** The dependency rule is kept (R-96); the
boilerplate is not. An interface per boundary and DTOs at every ring crossing buy
testability that pure functions over immutable data already give away for free.

**Adopted:** hexagonal rings at the package level, unidirectional intent/snapshot
flow at runtime, feature slices inside apps (R-95, R-96, R-99).

### D-088 — `sim` is completely pure; the host owns side effects via four ports · `agreed`
*"keep sim pure."* No clock, no filesystem, no socket, no randomness. Four ports
declared by `apps/host` where they are used, not where they are implemented:
`CampaignStore`, `SaveStore`, `Clock`, `Broadcast` (R-97, R-98).

The whole rules engine is then testable with no test doubles.

### D-089 — Operational guidance splits into PLAYBOOK.md · `agreed`
`ARCHITECTURE.md` is 100+ rules and is the law. `PLAYBOOK.md` is short and is what
you read first: the traversal order, the reference feature, the definition of done,
and a table of the ways you will be tempted to break the rules. If they disagree,
`ARCHITECTURE.md` wins.

### D-090 — The reference feature is a real one, not an illustration · `agreed`
Asked whether to mark a feature as a template or build one for illustration.
**Marked a real one: paint terrain** (R-101).

Purpose-built example code has no users, so nothing fails when it drifts, and it
reliably ends up demonstrating a pattern the codebase has abandoned. Paint terrain
is small, touches every ring, is genuinely in v0.1, and already exists in `domain`
with tests — so it cannot rot without going red.

### D-091 — The docs are tested · `agreed`
`test/docs.test.ts` checks that every path, rule number, decision number and
quoted test name in the playbook actually exists, that no rule number is defined
twice, and that no rule leans on an anecdote about the abandoned Unity project.

It found three broken references on its first run. Prose does not fail on its own,
and this project now has far more prose than code (R-102).

---

## Round 16 — first round of fixes from using it

### D-092 — Four yaw positions, 90° apart, all diagonal · `agreed`
*"rotation looks weird when hitting non-diagonals camera-sights. So lets do the
original angle, and intervals of 90 degrees."*

`YAW_STEPS` drops from 8 to 4 and gains a **45° offset**, so the positions are
45/135/225/315. The offset is the whole point: every position is a diagonal view,
the grid always reads as a diamond, and rotating cycles which corner faces you.
Axis-aligned views collapse the isometric depth cues, which is what looked wrong.

`yawRadians()` is now exported and shared, because `Stage.pan` had the old
8-step divisor hardcoded and would have drifted out of agreement with the camera.

### D-093 — Terrain is chosen by name, never by colour alone · `agreed`
*"terrain colors must have names, I'm color-blind and I see this issue happening
to other GMs haha."*

The swatch grid becomes a labelled list: colour chip, name, and difficulty
multiplier. Selection is shown by text and `aria-pressed`, not only a border, and
the panel states *"Painting Grassland."* Hovering a cell reports its terrain and
height in words.

A colour grid could not express difficulty either, so this fixes two things. If
colour still needs disambiguating later, hatching patterns on the chips are the
next step rather than more colours.

### D-094 — Paint is a drag, not a click per cell · `agreed`
Pointer-down starts a stroke and every newly entered cell is painted once,
snapping preserved (R-87). The last painted cell is remembered so re-entering it
sends nothing.

### D-095 — Chunks may be created diagonally · `agreed`
`creatableSlots` moves from 4 neighbours to all 8.

**This also fixed a rule violation of mine.** The adjacency test existed in three
places: `creatableSlots` in domain, a `creatable()` helper in `sim`, and an inline
loop in `apps/gm/src/shell/App.tsx`. The app one is exactly the *"it's one line,
I'll put it in the panel"* temptation the playbook warns about, and I wrote it
anyway — then had to change three places for a one-line rule change.

Now there is one definition, `isCreatableSlot(world, coord)` in domain. `sim`
enforces it, the GM console draws from it, neither restates it.

---

## Round 17 — terrain values and the ship problem

### D-096 — Terrain difficulties derived from D&D 3.5, normalised to grassland = 1 · `agreed`
Researched rather than invented. D&D 3.5's *Terrain and Overland Movement* table
gives speed multipliers; the **trackless** column is the honest one for open
country, and ours are its reciprocals, normalised so grassland — 5e's reference
terrain at 24 miles a day — sits at exactly 1.

| | 3.5 trackless | ours |
|---|---|---|
| Road | ×1 | 0.75 |
| Grassland / Moor | ×3/4 | 1 |
| Sand, Forest, Hills, Rock, Snow | ×1/2 | 1.5 |
| Swamp | ×1/2 | 2 |
| Jungle | ×1/4 | 3 |

Two deliberate deviations, both to avoid double counting:

- 3.5 lumps hills, mountains, forest, swamp and desert at the same ×1/2. We keep
  rock and hills at 1.5 and let **slope** supply the rest (R-52a) — charging for
  altitude twice makes a mountain range absurd.
- Swamp goes to 2 and jungle to 3. 3.5 rates swamp the same as forest, which
  matches nobody's description of crossing a swamp.

Added `moor` and `jungle`. `defaultDifficulty` is a tuning value, not an id, so
revising it is allowed — R-11 protects ids, and overridden cells are unaffected.

### D-097 — Water needs a boat, not a bigger multiplier · `agreed`
Asked whether water should be ×6 so a ship could cross between islands.
**No — and the question exposed a modelling gap.**

A multiplier of any size says *"the party can cross this, slowly"*, so ×6 would
let four people in armour wade the ocean. What is actually wanted is that water
is impossible on foot and ordinary by boat. That is not a property of the
terrain; it is a property of **how you are travelling**.

So a **travel mode** now decides both speed and what may be crossed:

```ts
TravelMode { id, name, kmPerDay, fallback: 'terrain-default' | 'impassable', overrides }
```

- `travel:foot` — terrain defaults, so water stays impassable
- `travel:ship` — `fallback: 'impassable'` with `{ water: 1, shallows: 1.5 }`,
  so a ship crosses water and **cannot sail overland**

Speeds come from 5e: 18/24/30 miles a day on foot, 48 mounted, 48 by sailing
ship, 96 by galley.

Consequences worth stating:

- An island genuinely requires a boat, which is the interesting bit of geography
  rather than an obstacle to route around.
- `shallows` is passable to both, so a boat has somewhere to put in. That is what
  the terrain is for.
- A **column override beats the mode**, so a bridge is a cell painted passable —
  a property of the place, not of the traveller.
- **Mixed journeys need no new machinery.** Walk to the port, then sail, is two
  legs — exactly the trip splitting already agreed in D-050/R-57.

---

## Open

### O-017 — The world may be too small · `open`
Falling out of putting real numbers in, and only visible once travel had units:

- the world is 20 chunks × 20 cells × 200 m = **80 × 80 km**
- a party on foot covers **39 km/day**

So **the entire world is a two-day walk across.** That is a duchy, not a
kingdom, and probably not what "enough terrain for a campaign" meant.

Three ways out, and this needs your call rather than mine:

1. **Coarser cells** — 1 km per cell gives a 400 × 400 km world, ~10 days
   across. Changes D-021 only; chunks stay 20×20 and nothing else moves.
2. **More chunks** — 50×50 gives 200 × 200 km. Changes D-004; 2500 chunk slots
   is a lot of world to author.
3. **Accept it** — a compact, dense duchy where journeys take days rather than
   weeks. Legitimate, and arguably better for actual play.

There is a test asserting the two-day figure, so whichever way this goes, the
number stops being a surprise.

### D-098 — A world cell is 1.5 km, not 200 m · `agreed`
**Supersedes D-021.** Asked whether 200 m is a normal tabletop scale. It is not —
by a wide margin.

| Reference | Scale |
|---|---|
| 5e DMG province / kingdom / continent | 1 / 6 / 60 miles per hex |
| Classic hexcrawl convention | 6-mile hex |
| Lost Mine of Phandelver | 5 miles |
| Tomb of Annihilation | 10 miles |
| Curse of Strahd, described as *exceptionally fine* | 0.25 miles |

200 m is 0.12 miles — finer than the finest published map. So the cell was the
problem, not the chunk count (O-017).

**1.5 km**, for two independent reasons: within 7% of the DMG's province scale,
and exactly 1000× the 1.5 m encounter cell. Consequences:

- a chunk is 30 km, **roughly a day on foot** — a genuinely useful mental model
- the default world is 600 × 600 km, about **15 days** across rather than two
- a POI's encounter map now fits comfortably inside its cell, which quietly
  removes the awkwardness D-042 had to wave away

### D-099 — Vertical scale is decoupled from horizontal · `agreed`
Cascaded straight out of D-098 and would have been a silent absurdity. Height is
counted in **levels of 200 m**, not cell widths; `World` carries both
`metresPerCell` and `metresPerLevel`. Otherwise the 20-level cap became a 30 km
mountain (R-104).

The renderer's `HEIGHT_SCALE = 0.6` is now documented for what it is: true scale
is 200/1500 = 0.133, so this is a ~4.5× exaggeration — the same liberty printed
relief maps take, and a legibility choice rather than a measurement.

### D-100 — Chunk bounds are a default, and derived values must follow them · `agreed`
Correct on both counts: 20×20 was illustrative, and `World.bounds` was already a
per-campaign field. But the bound *is* enforced, deliberately, so the `+`
affordance terminates and coordinates stay sane.

**A latent bug fell out of asking.** `ORIGIN` was hardcoded `{cx:10, cz:10}` —
the middle of a 20×20 world only. Change the bounds and every new campaign starts
off-centre. Now `centreOfBounds(bounds)`, with a test (R-105).

### D-101 — 20×20 cells per chunk stays, and now has a reason · `agreed`
Asked whether chunk sizes exist in tabletop. **They do not, as "chunks"** —
chunking is a voxel-game idea (Minecraft uses 16×16 for bit math). The tabletop
analogue is *nested hex scales*: the DMG's 1/6/60 tiers, or Greyhawk's 30-mile
hexes subdivided into 5-mile hexes. Chunk-and-cell is the same idea in squares —
a coarse authoring unit subdivided into detail cells.

So 20×20 was our own choice, but at 1.5 km per cell it acquires a justification
it did not have before: **a chunk is about a day's march.** Keeping it.

### D-102 — `slopeFactor` of 1 is Naismith-accurate · `agreed`
The "one level of climb ≈ one extra cell" default was chosen for memorability. It
turns out to be right: Naismith's rule charges an hour per 600 m of ascent and an
hour per 5 km flat, so 200 m of climb is worth 1.67 km of walking against a 1.5 km
cell. The rule of thumb and the real figure agree within 11% (R-52a).

### O-017 — resolved by D-098
The world is now 600 km across and takes about 15 days on foot. Four tests derive
the scales from the constants, so none of these figures can go stale silently.

---

## Round 18 — the scale settles

### D-103 — 30×30 cells, 30 levels of 150 m, 30×30 chunks · `agreed`
Proposed by Nicolás, and better than what it replaced on two counts:

| | was | now |
|---|---|---|
| Cell | 1.5 km | 1.5 km (unchanged) |
| Cells per chunk | 20×20 = 400 | **30×30 = 900** |
| Chunk edge | 30 km = 0.77 days | **45 km = 1.15 days** |
| Height level | 200 m | **150 m** |
| Height cap | 20 → 4 km | **30 → 4.5 km** |
| World default | 20×20 chunks, 600 km | **30×30 chunks, 1350 km** |

- a 45 km chunk is **closer to exactly one day on foot** than 30 km was, which
  is the mental model worth protecting
- 4.5 km is roughly Mont Blanc; 150 m gives finer sculpting than 200 m
- 1350 km across, ~35 days on foot, is a proper continent — and sparse storage
  means the 900 chunk slots cost nothing until authored

### D-104 — `slopeFactor` becomes 0.83, and is now derived · `agreed`
Consequence of the 150 m level. Naismith makes one level worth 1.25 km of flat
walking against a 1.5 km cell, so 0.83 rather than 1.

180 m per level would have kept it exactly 1.0, and I raised that — but 150 is
the rounder number for a GM sculpting terrain, and `slopeFactor` is an internal
constant nobody sees. The user-facing number wins.

A test now asserts `slopeFactor ≈ (metresPerLevel / 600) × 5000 / metresPerCell`,
so the two cannot drift apart.

### D-105 — A stored grid records its own stride · `agreed`
Changing `CHUNK_SIZE` would have silently invalidated every saved chunk, because
the arrays' stride was **implied** by the current constant.

`ChunkWire` now carries `size`, and decode re-lays any stride into the current
one. Schema 1 files have no field and default to 20, which is the honest
migration marker. Bumped to schema 2 (R-61a).

Two things fell out of doing this properly:

- The re-lay must go through `(x, z)`, not a flat index — a flat copy **shears
  the map diagonally**. The test paints a diagonal stripe precisely because a
  sheared diagonal is obvious where a sheared blob is not.
- The live campaign migrated intact: 11 chunks, 114 painted cells, 13 raised. It
  keeps its own 20×20 bounds, since bounds are per-campaign (R-105); only new
  campaigns get 30×30.

### D-106 — Magic numbers removed while in there · `agreed`
Grepping for hardcoded scale values before changing them found three: the height
clamp in the GM app's drag handler, the elevation shading ramp in `render`, and a
duplicated bounds default. All now derive from the constants. The height shading
ramp was also wrong at the new cap — it normalises against `MAX_HEIGHT` instead
of assuming 20.

---

## Round 19 — campaign list: delete and duplicate

### D-107 — The terrain palette is code, not campaign data · `agreed`
Found by running the app: Ashfall's palette still showed Sand ×1.3, Forest ×1.8,
Swamp ×3 and no Moor or Jungle — the pre-research values from before D-096.

The registry was stored inside the campaign file, so every campaign froze the
palette at creation. That directly contradicted D-096's own note that difficulty
is "a tuning value, not an id, so it may be revised" — stored as authored
content, it never could be.

- terrain **ids** stay stable, because cells reference them (R-11)
- **colours and difficulties** come from `DEFAULT_TERRAIN` at encode time
- the wire still carries the palette, so the apps can draw names and colours
- **storage drops it**; a stale palette in an old file is discarded on load

Per-campaign customisation, when it is wanted, becomes an explicit
`terrainOverrides` map — the same shape as a column overriding its terrain, one
level up.

### D-108 — Delete moves the campaign aside; it does not unlink · `agreed`
Asked for "a delete with confirmation", and the confirmation is there — a
two-step inline prompt naming the campaign.

**Deviating on the disk behaviour, and saying so.** `remove()` renames the
directory to `.trash-<timestamp>-<id>` rather than deleting it. A GM who
mis-clicks has lost hours of hand-built world with no version control to fall
back on; a rename costs nothing and leaves a way back through the filesystem.
The campaign is gone from the list and from `load()`, so the app behaves exactly
as though it were deleted.

Say if you would rather it were a hard delete, or want the trash swept on
startup.

### D-109 — Duplicate regenerates every id, and only works on the open campaign · `agreed`
*"be careful, it should count as a new campaign, no overlaping at all."*

`duplicateCampaign` regenerates **every** id in the graph: the campaign, every
party member, every POI, every note. A shallow copy with only a fresh campaign id
would leave member ids shared, and a save referencing them could later be read
against the wrong campaign. The test asserts the intersection of the two id sets
is empty rather than checking fields one by one, so ids added later are covered
automatically.

The world is shared **by reference** on purpose. `World`, `Chunk` and `Column`
are immutable and every edit is copy-on-write, so there is nothing to deep-copy
and no way for one campaign to alter the other's terrain. A test proves it.

Two constraints fell out of the design:

- **Only the open campaign can be duplicated.** `sim` cannot read the disk
  (R-97), so the source has to be in hand. TypeScript caught my first attempt —
  I had put a Duplicate button in the launcher, which only renders when *no*
  campaign is open, so it could never have been enabled.
- **Duplicating returns to the campaign list**, where both entries are visible.
  That is the confirmation, and it costs no new protocol surface. The original
  stays untouched, so Duplicate is a snapshot rather than a branch.

Names count upward — `Ashfall (copy)`, `Ashfall (copy 2)` — since versioning
means several.

---

## Round 20 — the terrain panel, and a picking bug it uncovered

### D-110 — Terrain is only shown while the brush is active · `agreed`
*"it's a bit confusing to edit heights and see be able to pick the terrain
option."* Right: offering a choice the current tool will not apply is an
invitation to wonder why nothing happened.

The terrain card renders only when the paint tool is selected. The **hover
readout moved into the Tool card**, which is always present, so "Rock, height 11"
survives the terrain card being hidden — otherwise switching to the height tool
would have lost exactly the information that tool needs.

### D-111 — The party panel moves to its own right-hand dock · `agreed`
So the terrain card appearing and disappearing cannot shift it. The keyboard
hints moved to the bottom left, clear of the party dock (top right) and the
connect address (bottom right).

### D-112 — Picking may not depend on the render loop · `agreed`
Found while testing D-110, and a genuine bug rather than a cosmetic one.

`pick()` raycast through `this.camera`, but the camera was only *positioned*
inside `render()`. A sweep of the whole canvas returned **0 column hits out of
3096 possible** while the world was plainly visible on screen. The camera sat at
`focus + offset` for a focus of `(0,0,0)` — the value from an early frame, before
the campaign had loaded — so the ray pointed away from the world entirely.

Both paths now call one `syncCamera()`, so a pick is correct regardless of frame
timing. After the fix the same sweep returns **3096 hits** and the readout reports
the right cell.

Honest about the trigger: I hit it because `requestAnimationFrame` is paused
while the browser pane is hidden, which froze the camera. But the bug is general
— a click arriving before the first frame, or a backgrounded tab, does the same
thing to a real GM, and it fails *silently* because there is nothing to throw.
Encoded as R-36a.

Two smaller things came out of the same session:

- `Stage.liveCount` now tracks live instances, because a leaked Stage means a
  leaked animation loop and a leaked WebGL context. It reported 1, which ruled
  out the double-instance theory I had been chasing and pointed at the camera.
- `window.__stage` is kept as a deliberate debug handle on both browser apps. It
  exposes nothing a client was not already sent, and it is what made this
  diagnosable at all.

---

## Round 21 — a tooltip primitive, and a copyable address

### D-113 — `Tooltip` is a generic primitive in `@tt/ui` · `agreed`
*"Lets get this tooltipeing tool a generic one so we can add tooltips the same way
in other places."*

`@tt/ui` had been empty since the scaffold; this is its first inhabitant, and it
is exactly what the package was reserved for — presentational, domain-free, and
usable by both apps.

```tsx
<Tooltip label="Click to copy" placement="left">
  <button>…</button>
</Tooltip>
```

Already used in four places: the connect address, both tool buttons, every
terrain row (which now explains the travel multiplier in words), the campaign
delete button and Duplicate. Native `title` attributes are gone (R-110).

Three decisions inside it:

- **Styled inline**, no stylesheet (R-111). `@tt/ui` exposes only `.`, so shipping
  CSS would mean widening its `exports` map and having every app remember to
  import it. A primitive this small is not worth that coupling.
- **Opens on hover *and* keyboard focus**, closes on Escape (R-112). A
  mouse-only tooltip is invisible to keyboard users, and the label is often the
  only explanation an action has.
- **`aria-describedby` sits on the wrapper**, not cloned onto the child. Cloning
  would force every caller's child to forward props; this accepts any element.

### D-114 — The connect address is a copy button · `agreed`
Click to copy, with the tooltip explaining it.

**Two things testing changed:**

1. **The confirmation cannot live in the tooltip** (R-113). Clicking moves focus
   or takes the pointer off the button, the tooltip closes with it, and the copy
   looks like it did nothing. The heading reports instead — *players join at* →
   **copied ✓** for two seconds. The tooltip is now only for discoverability.
2. **`navigator.clipboard` needs a fallback** (R-114). It requires a secure
   context, and the console is served over plain HTTP — so it is present on
   `localhost` and **absent when the GM opens the console by LAN IP**, which is
   exactly what the address on screen invites. Falls back to a hidden textarea
   with `execCommand`, then to telling the GM to copy by hand.

Worth recording about the testing itself: a programmatic `.click()` reports
failure here, because `writeText` requires genuine user activation. Only a real
click confirms it — and it does: `heading: "copied ✓"`.

### D-115 — Floating layers portal to the body, flip, and clamp · `agreed`
*"Tooltips are clipped by the section."* Correct, and inherent to the approach I
picked: the docks are `overflow-y: auto`, and an absolutely positioned child
cannot escape a clipping ancestor. No z-index fixes that.

The bubble now renders through a **portal into `document.body`** with viewport
coordinates (R-110a), so it is clipped by nothing. On top of that:

- it **flips** to the opposite side when the preferred one has no room and the
  far side has more, then **clamps to the viewport** regardless (R-110b) —
  flipping alone still overflows in a corner
- it repositions on `scroll` **with capture**, because the dock's own scroll does
  not bubble
- positioning happens in `useLayoutEffect` and the bubble is `visibility: hidden`
  until placed, so it is never seen at the wrong spot

### D-116 — A wrapper must not change the layout of what it wraps · `agreed`
Caught by comparing screenshots after fixing the clipping: the terrain rows and
tool buttons had **stopped filling their row**.

Wrapping a control makes the wrapper the flex or block item, so the button's
`width: 100%` and `flex: 1` resolved against the wrapper and collapsed to its
content. The palette's right-aligned multipliers had quietly bunched up against
the names.

`Tooltip` gained a `stretch` prop that sets `display: flex; flex: 1; width: 100%`
on the wrapper — both, so one flag works in a flex row and a block column alike.
Generalised as R-110c, because every future wrapper has this problem.

Worth noting how it was found: not by the tooltip tests, but by looking at two
screenshots side by side. The layout was still valid, still rendered, and simply
wrong — the class of bug that automated checks here will not catch, which is why
`render` and the apps are verified by running them (R-23).

---

## Round 22 — shortcuts, tilt range, brush size

### D-117 — Shortcuts bind to `event.code`, not `event.key` · `agreed`
*"The tools shortcuts (1 and 2 keys) are not being recognized by my mac with no
numbers-specific keyboard."*

A real bug, and a silent one. `event.key` is what the **layout** produces, so on
several Mac layouts the number row does not emit bare digits and `key === '1'`
never fires — the shortcut simply does not exist for that user, with nothing to
notice. `event.code === 'Digit1'` is the key in that position under any layout.

Numpad equivalents are accepted alongside, and any keypress carrying Cmd/Ctrl/Alt
is now ignored so browser shortcuts still work. Verified: `Digit1`, `Digit2`,
`Digit3/4/5`, `BracketLeft/Right` and `Numpad2` all fire. Encoded as R-116.

### D-118 — Three more pitch steps, up to 75° · `agreed`
`30/35/40/45` becomes **`30/35/40/45/55/65/75`**. Finely spaced around 45 — the
classic isometric angle, where most of the work happens — then coarser going
overhead, where a survey matters more than nuance.

It stops at **75 on purpose**: at 90 the camera sits directly above its focus and
`lookAt` with a +Y up vector is degenerate. The default is unchanged at 45.

### D-119 — Brush sizes 1×1, 2×2, 3×3 for both tools · `agreed`
Three decisions inside it:

- **A brush is one intent, not one per cell.** Nine intents for a single click
  would mean nine saves and nine broadcasts (R-19a). `size` rides on the existing
  `paintTerrain`, `setHeight` and `raiseHeight` intents and defaults to 1, so
  nothing older breaks.
- **Even sizes extend forward from the anchor**, since they have no centre cell —
  the standard voxel-editor convention, and predictable where "round one way or
  the other" is not. `domain` exports both `brushCells` and
  `brushCentreOffset`, so the hover outline is drawn over exactly the cells that
  will be edited rather than each side deriving it separately. My first attempt
  computed that offset inline in `render` and got it wrong (R-88a).
- **Brushes cross chunk boundaries**, skipping cells in chunks that do not exist
  (R-88b). That needed global cell coordinates, so `toGlobal`/`fromGlobal` are
  now in `domain`; chunk-relative coordinates cannot express a brush straddling
  an edge without special cases.

The height tool with a wide brush stamps a **flat plateau** — absolute height
across the footprint — which is what makes it useful for building. `raiseArea`
exists for relative changes if that is ever wanted instead.

Verified end to end: a single 3×3 click wrote nine `jungle` cells centred on the
anchor, and the outline scales 1/2/3 with the half-cell offset on even sizes.

### D-120 — Docks size to their content, not to the viewport · `agreed`
*"the panel on both sides are absorbing the hover outside their bounds... it
stops moving the cell probe of the brush until I go away."*

Both docks were `position: fixed` with `bottom`, so each spanned the full
viewport height while its cards filled only part of it. The empty remainder sat
over the canvas and swallowed every pointer event, freezing the brush probe —
which reads as the app hanging rather than as a layout mistake.

**My first fix was wrong and I caught it in testing.** `pointer-events: none` on
the container with `auto` on the cards restored the hover, and I assumed wheel
scrolling would still chain up from a card. It does not: the scroll chain skips a
container the pointer cannot hit. Measured — wheel over a card left `scrollTop`
at 0 with 177px of scrollable content, and the canvas did not zoom either, so the
wheel went nowhere at all.

The actual fix is not to stretch the panel: `max-height: calc(100vh - 24px)` with
the height hugging its cards. Below the content there is no box, so hover reaches
the canvas *and* the container is a real pointer target, so it scrolls.

Verified at two viewport sizes: content-height dock with the canvas reachable
below it, and — when the viewport is short enough that the dock genuinely
overflows — wheel over a card scrolls the dock to its maximum with the camera
untouched, while wheel over the canvas zooms with the dock untouched. Encoded as
R-117.

---

## Round 23 — points of interest

### D-121 — POIs are withheld from the table display until `Revealed` exists · `agreed`
Whether the party knows a place exists is **play state**, and play state lives in
a save (R-8, R-16) — and saves are not built yet. So there is nowhere to put the
flag this round.

Sending POIs before the flag exists would put every secret the GM has written
onto the players' screen, so `viewFor('table')` returns an empty POI list. A test
asserts the table payload contains neither a POI name nor any note text, by any
route. Withholding is the safe default; the markers appear on the table in the
visibility round.

### D-122 — Markers are data, not model files · `agreed`
A marker is a handful of primitives with offsets — `{ shape, at, size, colour }`
— declared in `domain` and assembled by `render`. Twelve of them: village, town,
city, castle, fort, cave, mine, forest, ruin, temple, camp, port.

`domain` cannot depend on three.js, there is no asset pipeline, and a low-poly
marker genuinely is a few boxes and cones. Adding one is a data entry. A test
asserts every part stays inside its own cell, sits on the ground and stays under
two cells tall, so a new marker cannot quietly overhang its neighbour.

glTF assets can replace this later behind the same interface; nothing outside
`render` knows how a marker is drawn (R-82).

### D-123 — POIs are a flat list on the campaign, one per cell · `agreed`
The docs said `Chunk.pois` and the code said `Campaign.pois`; the code was
right, and the doc is fixed (R-118). A flat list makes "every POI" one read,
finds a POI without knowing its chunk, and makes moving one across a chunk
boundary a field change rather than a move between containers.

**At most one POI per cell** (R-119), or the tap gesture (R-86) has no
unambiguous answer.

### D-124 — Places is a third tool; tools move to 1/2/3 and brush to 4/5/6 · `agreed`
Placing a POI needs its own mode, or a click in paint mode paints instead. Tools
are now grouped on 1/2/3 and brush sizes on 4/5/6, which is more legible than
tools on 1/2 with brush on 3/4/5.

The brush selector hides in Places mode — it does not apply, and offering it
would be the same confusion D-110 fixed for terrain.

**A marker click always means the place**, whatever the tool is, and switches to
Places. Otherwise the only way to edit a POI would be to remember to change mode
first.

### D-125 — New notes are hidden by default · `agreed`
`addNote` defaults `visibleToParty` to false. A GM writing "the baron is already
dead" should have to *choose* to show it; the failure mode of the opposite
default is a spoiled campaign, and there is no undo for something the players
have already read.

### D-126 — Every registry is stripped from storage, not just terrain · `agreed`
Caught by reading the saved manifest: `markers` was being persisted, because
D-107 stripped `terrain` by name and I added a second registry without revisiting
it — the same mistake one field later.

Both are now destructured out by name, with a comment saying that adding a
registry means deciding this again. The test was rewritten to loop over a list of
registry names rather than checking the one that existed when it was written, so
the next registry is covered by default.

Legacy manifests keep their stale copy until the next save, and it is ignored on
load either way.

---

## Open

### O-018 — Marker size against label size · `resolved by D-128`
At the default zoom the name labels are considerably more prominent than the
markers they belong to, which reads as a floating label with a speck under it.
Either the markers want to be larger or the labels smaller. A judgement call best
made by looking at it during real use rather than by me picking a number.

---

## Round 24 — labels, and the tool that was missing

### D-127 — A neutral `select` tool, and creation returns to it · `agreed`
*"this POIs feature makes us identify a condition we need and was not there: the
no-tool or pointer tool."*

Right, and it was a gap in the design rather than a bug in the code. Every tool
edited something, so there was no way to inspect a place without risking creating
another, and nothing for an action to finish *into* — placing a POI left the
Places tool armed, so the next click made another one while the marker list had
already gone.

- `select` is added as a fourth tool and is now the **default**, so opening a
  campaign cannot accidentally edit it (R-87a)
- **after placing a POI the app returns to `select` with the new POI selected**
- clicking a marker selects it **whatever the tool** and no longer switches to
  Places, which would have re-armed creation (R-87b)
- in `select`, the hover outline is hidden — there is no edit to preview

The interesting part is how the new POI gets selected: the **host** assigns the
id, so the client cannot know it when it dispatches. It remembers the *cell* it
clicked instead and claims the POI that appears there in the next snapshot —
which works only because there is at most one POI per cell (R-119). An invariant
agreed for a different reason turned out to be the handle this needed.

Tools are now 1–4 and brush sizes 5/6/7, with `[` and `]` kept as the
image-editor idiom.

### D-128 — Name labels hold a constant size on screen · `agreed`
*"Labels are too big, they should look smaller, and if possible, adjust with
zoom level."*

Both, and the second explains the first. A `Sprite` under an orthographic camera
is sized in **world units**, so one tuned at zoom 34 was more than twice as tall
at zoom 14 — which is exactly when a GM is looking closely and least wants a
label covering the map.

Labels are now scaled by the camera's zoom each frame, holding **13 px**
whatever the zoom. Measured: 13 px at zoom 10, 20, 34 and 50 (R-83a).

This also resolves **O-018**: markers and labels no longer compete, because the
label stops growing while the marker does.

### D-129 — The tool buttons are a 2×2 grid, not a wrapping flex row · `agreed`
Four tools squeezed onto one line and became unreadable. `flex: 1 1 44%` should
have wrapped them, but the flex items are the **Tooltip wrappers**, not the
buttons, and their shrink factor let all four fit however narrow the dock got —
`flex-basis` is a starting size, not a floor.

`grid-template-columns: repeat(2, minmax(0, 1fr))` cannot do that. Measured:
two rows of two at 95 px each in the 228 px dock.

A second instance of R-110c: wrapping a control changes which element the
caller's layout is actually sizing.

The brush selector got the same treatment: three fixed columns with the label
moved **above** the row rather than sitting inline, which hands the buttons the
full dock width to share. Both button groups now read as one system.

### D-130 — Subagents are Sonnet at high effort, set explicitly · `agreed`
Nicolás: *"your agents must be always Sonnet with High effort, I want to be able
to set you in Opus Ultracode if I want, and your agents must be Sonnet with High
effort."*

The main loop's model is chosen per task and changes often. An agent that
inherits it turns one dial into a fleet-wide cost multiplier, so the fleet is
pinned independently: `{ model: 'sonnet', effort: 'high' }` on every `agent()`
call, never inherited. Recorded in the playbook so it binds anyone working here,
not just this session.

---

## Round 25 — saves and visibility

### D-134 — Campaign and save data is tracked in git · `agreed`
**Reverses the `.gitignore` decision from the first commit, after it cost real work.**

`data/` was ignored on the reasoning that a store rewritten on every brush stroke
would churn the diff, and that campaign versioning is a product feature
(Duplicate) rather than a git one. That weighed the wrong things: a noisy diff is
an inconvenience, hours of hand-built world are irreplaceable.

With it ignored, a stray `rm -rf data` in a test-setup command destroyed two
campaigns — islands, thirteen POIs, party, notes — with nothing to restore from.
No git, no Trash (`rm -rf` bypasses it), no Time Machine destination configured.

Now tracked, with only `.trash-*` ignored since the app already moves deletions
aside rather than unlinking (D-108). The churn is real and accepted.

### D-135 — Permissions fail closed · `agreed`
The role gate tested membership of a `MUTATIONS` allow-list, so an intent nobody
remembered to list would be **permitted** for the table display, silently. All 22
intents happened to be listed, so nothing was actually open — but six were about
to be added.

Inverted to an `OPEN_TO_ANYONE` list, currently empty: everything is GM-only
until someone decides otherwise. A test enumerates the intent kinds **from the
protocol schema itself** and asserts every one is rejected for both `table` and
`spectator`, so a newly added intent fails the test until it is classified (R-18a).

### D-136 — A POI reaches the table only when its chunk is Known too · `agreed`
The one thing the design panel earned its keep on. Three independent critics each
found the same HIGH leak in a different design: R-16 makes `Known` and `Revealed`
independent, which I had written thinking only of *hidden inside known*. The same
independence permits a **Revealed POI inside an Unknown chunk**, which would put a
place, its name and its position on screen inside a region the party has never
seen.

`isPoiOnTable` requires both. The GM console says so out loud too, in both
inspectors, rather than letting a GM wonder why a revealed marker never appeared.

### D-137 — One live save per campaign, autosaved; snapshots are copies of it · `superseded by D-147`
Synthesised from the panel's three designs.

- The live save's id is **derived from the campaign id**, so "exactly one" is
  structural rather than an invariant something has to check.
- It autosaves on every discovery change, exactly as the campaign already does,
  so discovery cannot be lost by forgetting.
- A snapshot is the same shape under a fresh id and the GM's label, with no
  second persistence mechanism.
- Restoring pours a snapshot into the live save and **keeps the live save's
  identity**, so the next autosave cannot overwrite the snapshot the GM is
  relying on.
- A duplicate gets a fresh, empty live save: `duplicateCampaign` regenerates
  every id (D-109), so no save can follow it. Deleting a campaign trashes its
  saves, which would otherwise point at nothing.

**Correction.** As written, this justified snapshots with a quoted requirement —
*"save the world status whenever he wants"* — attributed to the GM. I cannot find
where that was said. It appears to be my own paraphrase of "save/load progress"
from the original feature list, promoted to a quote by being written down in
quotation marks and then cited as evidence. A decisions file that invents its own
authority is worse than no decisions file, so: the autosave and derived-id halves
above stand on their own merits and survive into D-147; the snapshot half rested
on that quote and is gone.

### D-138 — `isKnown` renamed to `isAuthored` · `agreed`
`isKnown(world, coord)` meant "the GM has created this chunk". R-16 uses
Known/Unknown for whether the *party* knows a chunk — authored content versus
play state, two different questions sharing one word. Flagged by the panel;
renamed before it could cause the bug it was clearly going to cause.

### D-139 — Save resolution is a rule, so it lives in `sim` · `agreed`
Caught by `npm run arch`: my first host implementation imported `createLiveSave`,
`restoreInto` and `pruneDiscovery` from `domain`, which is both a forbidden edge
(R-5) and game logic in the host (R-67).

Deciding whether to reuse a stored save, mint a fresh one, or prune stale POI ids
is a rule. `sim` gained two pure functions, `openedWith` and `restoredWith`; the
host reads files, hands the results over, and writes back what it is told to.
`liveSaveId` is re-exported through `protocol` so the host can name a storage key
without reaching into `domain` — one definition, reachable from both sides.

### D-140 — The fog overlay serves both screens · `agreed`
One mechanism, two readings. On the table display, dark tiles over unseen chunks
are R-16's featureless placeholders. On the GM console the same tiles show what
the players are missing. Both mean "not visible to the party", so they look
identical on purpose.

Unknown chunks travel as a **separate coordinate-only list**, not a `known` flag
on each chunk, so an Unknown chunk has no field that *could* carry terrain. A test
asserts the placeholder has exactly `cx` and `cz` and no `heights` or `terrain`.

---

## Round 26 — seats, found by opening a browser

### D-141 — The newest GM claim takes the seat · `agreed`
Found the moment the round was opened in a browser: the campaign list was empty
and **Create** answered *"only the GM can do that"*.

The host had two GM pages open — the browser pane had one from earlier and I had
opened another — and the first one held the seat. The second console was handed
`spectator`, and then rendered as a fresh empty install (D-144), so the symptom
gave no hint of the cause.

I first wrote this up as React StrictMode double-mounting the connecting effect.
That was wrong and worth recording as wrong: StrictMode's double effect runs in
development builds only, and the host serves production bundles. Instrumenting
the host settled it — one page load, one connection.

`taken('gm')` was defending the seat against the GM's own browser. Inverted:
the newest claim wins, and the previous holder is demoted in place rather than
disconnected — disconnecting makes two live consoles trade the seat forever.

`table` exclusivity is dropped entirely; a table display and a spectator get the
identical view, so there was never anything to defend.

### D-142 — Sockets are pinged and reaped · `agreed`
The zombie above is why. Nothing in TCP reports a browser that navigated away, so
a socket with nobody behind it holds its seat until the host restarts. 15-second
ping, terminate on a missed pong (R-128).

Also fixed alongside: the message handler closed over the `role` computed at
connection time, so a demoted socket would still have been judged as the GM.
The seat is now read from the map per message.

### D-143 — Host seat tests, as an exception to R-23 · `agreed`
R-23 exempts the apps from unit tests. Its actual reason is three.js — "do not
write mocks for what you cannot mock" — and seat arbitration needs no mocks: a
real `ws` server on an ephemeral port, real client sockets, and a client that
goes silent by pausing its socket to reproduce the zombie exactly.

Eight tests. Four of them fail against the code as it shipped, which is the only
reason to trust the other four.

### D-144 — A console must look like the seat it holds · `agreed`
The reason this cost half an hour to diagnose rather than five minutes. A
spectator-seated GM console rendered as a fresh empty install, because
`view?.campaigns ?? []` cannot tell "not entitled" from "none yet". It now says
*"Another console has the GM seat"* and offers to take it back (R-129).

### D-145 — A socket abandoned mid-handshake closes itself · `agreed`
A guard, kept on its own merits after the reasoning I first gave for it collapsed.

`connect()`'s teardown sets `closed = true` and calls `socket.close()`, which is
not dependable while the socket is still CONNECTING: if the upgrade already
completed on the host, the socket can open, claim a seat, and answer pings
forever. `onopen` now checks the flag and closes immediately.

What I originally claimed here — a measured two-sockets-per-tab leak — was a
misreading. The second socket was a second GM tab. The guard stays because it is
one branch and the failure it prevents is a seat held by nobody, but it fixed
nothing that was broken.

### D-146 — Copy: singular verb in the chunk warning · `agreed`
"1 place is marked revealed but **stay** hidden". Trivial, but the warning exists
to stop a GM misreading the state, and broken grammar in it undermines that.

---

## Round 27 — snapshots removed

### D-147 — A campaign has exactly one save, and no save/load verb · `agreed`
Supersedes the snapshot half of D-137. The GM asked what snapshots were for and
there was no answer that survived contact.

What a save holds is which chunks are Known and which places are Revealed. That
only ever grows during play — a party does not un-see an island — so "come back
to this point" answers a question a GM does not have. The two cases that sound
like snapshots are already covered: running the same world for a new group is
Duplicate (D-109, which regenerates every id so no save can follow it), and
losing your place is the autosave.

An undo was considered for the real failure mode — clicking Known on the wrong
chunk mid-session — and rejected by the GM for the right reason: **the toggle is
already the undo.** Known and Revealed are one click each in both directions, so
an undo stack would be a second way to do what the button does.

Removed: three intents, `snapshotOf`, `restoreInto`, `summarise`, `isLiveSave`,
`SaveSummary` and its wire schema, `HostState.saves`, `GmView.saves`, the
`restoreSave` and `removeSave` effects, `restoredWith`, `SaveStore.list`, and the
Saves panel. 11 tests went with them.

Kept, because it is load-bearing rather than a feature: **the campaign/save
separation** (R-8, D-006). Discovery has to live outside the authored world, or
revealing a chunk would edit the campaign and duplicating a played world would
carry the previous group's discovery into it. The derived save id (R-120) and the
autosave (R-121) stay for the same reason.

`SaveStore.removeForCampaign` still sweeps every save file belonging to a
campaign rather than deleting one derived id, so that files written during the
snapshot era are cleaned up rather than orphaned. That is the only trace left, and
a test covers it.

### D-148 — The save is thin now and will not stay thin · `agreed`
Worth writing down so nobody reads D-147 as "play state is simple". A save holds
discovery only because encounters do not exist yet (O-009). Once tokens stand on
an encounter map, play state includes their positions and per-token vision, and
that all belongs in the same save. D-147 removes a feature, not the structure
that will hold it.

---

## Round 28 — moving the party (design)

### D-149 — The party can only stand where the party has been · `agreed`
*"It cant move to unknown chunks, you go to the edge first, then users will want
to scout (off-tool), then GM reveals the zone, and then they can move. Not even
the GM can move the tokens to an unknown chunk."*

Better than all three options I offered, and worth saying why rather than just
recording it. I had framed the question as "what do we draw when a pawn is in the
fog" — auto-reveal, warn, or hide. All three treat `Known` as a display filter.
This answer makes it a **gate on play**: revealing a chunk becomes the move that
opens the frontier, the scout-off-tool loop gets teeth, and the pawn-over-fog
question stops existing rather than getting an answer.

Two consequences I decided and flagged (R-131): placement obeys the same rule, so
a fresh campaign must reveal something before the party can be put anywhere; and
a chunk the party stands in cannot be un-Known.

Checked for a leak, since the player seat can move: refusing a move tells the
table display nothing new. It already receives `unknownChunks` as coordinates
(D-140), so it can already tell authored-but-unknown from unauthored.

### D-150 — Pick, aim, confirm — one sequence for every move · `agreed`
*"pick a token (party or member), move mouse freely to the cell destination
(ghost token should be rendered), confirm or cancel the move."*

Two things follow that changed the plan:

**Placement is not a separate gesture.** *"This sequence works for the first step
into navigation up to the last one."* So `placeParty` disappears as its own
intent — the first move is a move.

**The pending move is client view state (R-64), not protocol.** This is the load
bearing part. The stated future is: the aim step draws the pathfinder's route
under the pointer, and confirming opens a menu for transport and pace that reports
days of travel before you commit. Both are extensions of steps that already exist
— *if* aiming is local. Put the pending move on the wire and every pointer move
becomes a round-trip and the confirm menu becomes a protocol negotiation.

A drag would have been the obvious gesture and it is the wrong one: it collapses
aim and confirm into the same motion, leaving nowhere for the route preview or the
travel menu to go.

### D-151 — Custom routes are short trips, not drawn paths · `agreed`
*"If players want a custom path, they define it by doing shorter trips up to the
places where the pathfinding looks correct to them."*

This settles the adjacency question I had left open: **no adjacency check.** A→Z
is legal, the pathfinder picks the easiest route, and a GM who dislikes that route
breaks the journey into legs. No route-drawing tool, ever.

Noted in R-133 because it is the easy thing to forget: the pathfinder must be
constrained to **Known cells**, or it will route through unexplored ground and
quietly undo D-149.

### D-152 — Movement is the table display's first interaction · `agreed`
Follows from *"The player seat too"*. Worth its own entry because the table
display has had **no interaction at all** until now — it is a pure viewer (R-3,
R-4) with a campaign-name badge and nothing else.

The GM console enters the sequence through a Travel tool, the fifth in the
palette. The table display has no palette, so pawns are simply clickable there;
nothing else on that screen is. Same sequence, different entry (R-134).

This is also the first use of `OPEN_TO_ANYONE`, which has been an empty list since
D-135. The schema-driven test forces each new intent to be classified either way.

**Correction.** I put `moveParty` and `movePartyMember` in the list and kept
`setPartyTogether` GM-only, reasoning that splitting the party is a narrative call
the GM makes rather than a nudge a player makes. Overruled: *"group/ungroup the
party should be an action for both, GM and Players."*

All three go in, and the correction is an improvement rather than a concession —
it replaces my per-intent judgement with a line that decides the next case on its
own (R-136). Splitting up is a table conversation; whichever screen is closer to
hand should be able to enact it.

### D-153 — Binary together/separated · `agreed`
Chosen over per-member detach and named groups. Together is one pawn; separated
is one pawn per member. Gathering reunites everyone at the **first roster
member's cell**; scattering starts everyone on the group cell to be dragged apart.
A member added while separated appears on the first member's cell.

I recommended per-member detach on the grounds that a lone scout is the common
case and a binary toggle cannot express it. Overruled, and the reason stands on
its own: a party that splits is a thing the GM narrates, and two pawns moved
together by hand is a smaller cost than a third concept in the data model.

### D-154 — Vision is not shown on the world map · `agreed`
*"vision should be hidden in the party panel while in the world map, it will
confuse the GMs or players if we end up showing it in both sides."*

`visionRange` stays in `PartyMember` for encounters and stops being rendered in
the party panel (R-135). It is an encounter quantity — 12 cells at the encounter
cell (R-46a) — and beside a 1.5 km world cell it reads as 18 km of sight.

### D-155 — Token positions live in the save · `agreed`
Not a judgement call, recorded so it is not relitigated. Where the party stands is
play state, so it sits beside `discovery` in the save (R-8, D-006), never on the
campaign. A duplicated campaign therefore starts with the party unplaced, which is
correct — the copy has not been played.

Stale positions are pruned when the campaign opens, exactly as `pruneDiscovery`
drops POI ids the GM deleted, for the same reason: a position for a member no
longer on the roster.

### D-156 — The world cell type moves to `world/` · `agreed`
`{cx, cz, x, z}` currently lives in `poi/` as `PoiCell`, with `isValidPoiCell`
beside it. The party needs to name a cell too, and `party/` importing from `poi/`
to say where someone is standing would be nonsense. Promoted to `world/` as
`WorldCell` with one validity check; `PoiCell` becomes an alias.

### O-019 — Pathfinding on the world map · `open`
Deferred from round 28 deliberately. A→Z is legal (D-151), so once positions
exist the obvious next round is the route: easiest path by terrain difficulty
(R-52) and the 0.83 slope factor, **constrained to Known cells** (R-133), drawn
under the pointer during the aim step of R-132.

### O-020 — The travel confirmation menu · `open`
The second half of the same future: confirming a move opens a menu for transport
and pace, reporting days of travel, with confirm/cancel. Blocked on O-006 (travel
pace presets) for the actual numbers. R-132 keeps the confirm step local so this
slots in rather than being retrofitted.

### O-021 — Does the party pawn show who is where when separated? · `open`
Six pawns of six colours on a 1350 km map, at the zoom where miniatures collapse
into flat markers (R-83). Names may be unreadable exactly when the party is most
spread out. Not blocking; worth a look once it can be seen running.

### D-157 — The permission line: the party is the players', the world is the GM's · `agreed`
Extracted from the D-152 correction, because the correction revealed that
`OPEN_TO_ANYONE` had no stated principle behind it — only my case-by-case
judgement, which is exactly what R-0 exists to prevent.

Open to both seats: everything about the party's own pawns — where they stand,
whether they are grouped.

GM only: everything about the world — terrain, heights, chunks, places, notes, and
above all **discovery**. What the party is allowed to know is not theirs to grant.

The line also explains why R-131 is not a permission rule. The party cannot enter
an Unknown chunk because *the party has not been there*, not because a player
lacks rights: the GM cannot do it either.

---

## Round 28b — what implementing it decided

### D-158 — Party intents are open to the table seat, not to spectators · `agreed`
Found by the enumeration test the moment the three party intents were added: the
gate's open-list was consulted before the role was, so opening an intent opened
it to **spectators** as well.

R-136 says the party belongs to the *players*, and a spectator is not a player —
it is whoever connected without asking for a seat. So the gate now asks
`permitted(role, kind)`: the GM may do anything, the table seat may do what
`OPEN_TO_THE_TABLE` lists, and everyone else may do nothing. The function ends in
`return false`, which is what makes it fail closed by construction rather than by
vigilance.

Costs nothing in practice — the table seat is not exclusive (R-127), so every
real player screen holds one.

### D-159 — A save adopted from disk is stamped with the current schema · `agreed`
Caught by looking at the file after the round worked. The live save had a
`placement` block and still said `schemaVersion: 1`, because encoding writes
whatever the object carries and the object had been read from a version-1 file.

A version field that does not describe its contents is worse than no version
field: it reads as trustworthy and it is not. `upgraded()` stamps the save where
`sim` adopts it, so the next autosave persists the upgrade — verified on the real
file, which now reads version 2 (R-137).

### D-160 — Travel takes key 5; brush moves to 6/7/8 · `agreed`
**A change to a binding already in use, so flagged rather than slipped in.**

Tools are digits, left to right, and travel is the fifth tool. That collided with
brush 1×1 on key 5, so the brush digits shifted up one. The digits still run
tools-then-brushes in order, and `[` / `]` remain the primary brush keys, so the
cost falls on the redundant half of a binding. The hint bar reads
`1–5 tool · 6/7/8 or [ ] brush`.

The alternative was a letter for travel, which would have kept brush where it was
at the price of tools no longer being "the digits".

### D-161 — Aiming is judged by cells, so fog is unpickable · `agreed`
An accident of the existing render that turned out to be the right behaviour, so
it is being kept deliberately rather than left to chance.

Fog placeholders are not columns, so `pick()` returns no cell over them. A client
therefore cannot even *form* a move into an unknown chunk — R-131 is enforced in
`sim` for correctness and by the picker for feel. Clicking into the dark cancels
the sequence, which is honest: the prompt disappears, so it does not look like a
click that did nothing.

### O-022 — The group pawn is neutral-coloured · `open`
When the party is together its single pawn is off-white rather than any member's
colour, since it is not any one of them. It reads well on water and grass and will
read badly on sand or snow. Worth a look once there is a snowy map to look at.

---

## Round 29 — picking belongs to the tool

### D-162 — `render` reports, the tool decides · `agreed`
*"you can select POIs while you are attempting to paint. Discovered this while
painting snow around the party token."*

A real bug and a rule of mine behind it. R-87b said a marker click means the
place **whatever the tool is**, justified by "otherwise the only way to edit a
POI would be to remember to change mode first". That reason was already weak —
Select is the default tool, so inspecting is the no-mode case — and the cost is
that the map has spots you cannot paint.

Two changes, and the first is the real one:

**`pick()` no longer picks a winner.** It resolved in precedence order and
returned on the first hit, so a marker hit reported `column: null` — the terrain
under a POI was not merely deprioritised, it was *unreachable*. Now pawn, POI,
cell and slot resolve independently; the ray passes through a marker to the
ground beneath it. Precedence was never `render`'s to decide.

**Each tool names what it picks** (the table in R-87c), and ignores the rest.
Paint and Height see only cells. Places sees only empty cells. Travel sees pawns,
then cells while aiming. Select sees POIs, then chunks.

Two details worth recording:

- **Chunk selection stays on Select**, though the request said "POIs only". It is
  the only route to the Known toggle, and dropping it would have stranded the
  visibility workflow. Flagged rather than assumed — if the toggle moves
  somewhere else, Select becomes POIs only.
- **A Places click on a taken cell is dropped, not dispatched.** Sending it would
  earn a rejection toast for obeying a rule (R-119). But a click that does
  nothing looks broken, so the hover readout says *"Already a place here"* before
  the click happens — the feedback moves earlier instead of disappearing.

Creating a chunk from a `+` slot stayed outside the per-tool table: it is how the
world grows (R-79), not a mode, and every tool should do it.

### D-163 — A marker does not block *its own* cell · `agreed`
Found while verifying D-162, which was itself incomplete.

Reporting the cell independently of the marker was the right move but the wrong
cell. A raycast answers "the ground visible through this pixel", and a marker or
pawn is drawn standing *above* its ground — so at an angle the ray sails over it
and hits the neighbour. D-162 turned "clicking a marker selects it" into
"clicking a marker paints the cell behind it", which is a subtler version of the
same bug.

A pawn or marker now reports the cell it stands on, pawn first because it is
drawn on top. That is what *"ignores any POI or token blocking the terrain"* has
to mean: not that the thing is transparent to the ray, but that it does not stop
you editing the ground it occupies.

Extracted to `render/picking` as a pure `intendedCell`, and unit tested. R-23
exempts `render` because three.js cannot sensibly be mocked; that reason does not
cover a cell-selection rule that needs no GL context, and four of the nine tests
fail against the behaviour this replaced.

**Verification note.** The browser check that should have caught this the first
time did not: my click landed on the terrain palette rather than the canvas,
because the Paint tool opens that panel over the left of the map. The test tells
me the rule is right; the panel-relative geometry still wants a human eye.

---

## Round 30 — the frontier on the client, and a testing audit

### D-164 — The client refuses to aim where the party cannot go · `agreed`
*"I can move the token to an unknown chunk."*

The server never allowed it — reproduced on the running host: chunk `16,15`
authored, `15,15` the only Known one, `moveParty` there answered *"the party has
not been there"* and the party did not move. The invariant held where it counts.

The defect was in the offer. **The GM console draws every authored chunk and
lays fog over the unknown ones**, so the terrain under the dark is real geometry
that raycasts perfectly well. The ghost followed the pointer into unexplored
ground, the click was accepted by the client, and only then did the host refuse
it. A gesture that completes and then fails reads as "it let me do it".

So the reachability check is now made twice: in `sim` because that is the
authority (R-3), and on the client because offering an impossible move is its own
bug (R-138). The ghost does not appear on an unreachable cell, the click cancels
instead of dispatching, and the readout says *"…have not been there — reveal the
chunk first"* rather than going quiet.

The table display needed no equivalent check — it only ever receives Known
chunks (D-140), so any cell it can raycast is reachable. Stated in the code
rather than left implicit, since that is the sort of thing that stops being true.

### D-165 — Escape and right-click both cancel · `agreed`
*"can we do right click or 'escape' to cancel the movement?"*

Escape was already bound on both screens; right-click was not, and on the GM
console it started a pan instead. It now cancels while a sequence is running and
pans the rest of the time (R-139).

Being asked for a binding that already existed is itself a finding: the prompt
said *"Click to confirm, or press Escape"* only in the GM console's readout,
which is a small line in a panel the pointer is nowhere near. It now names both
ways out, on both screens.

### D-166 — Rules do not hide in components · `agreed`
*"add tests if possible to cover every bug we discover and fix. Confirm is that
what you have been doing."*

**Partly, and the gap was systematic rather than random.** Audited honestly:

Fixed *with* a test at the time — the prototype's vision leak, the revealed-POI
leak, fail-closed permissions, registries leaking into storage, the seat race and
zombie sockets, the unstamped schema version, spectator scoping, and the marker
blocking its own cell.

Fixed *without* one — the dock swallowing pointer events, tooltip clipping,
`flex-basis` not being a floor, `event.key` versus `event.code`, the canvas mount
race, `pick()` not syncing the camera, and the per-tool picking matrix itself.

Every entry in the second list lived in an app or in CSS, and I had been treating
R-23's exemption as "apps are not tested". Its actual reason is that three.js and
the DOM cannot sensibly be mocked — which says nothing about a decision table or
a state machine that merely happens to be typed inside a component.

So the two live cases moved out and grew tests: `clickAction` in
`client-core/tools` is the R-87c matrix, including the *"painting snow around the
party token"* bug as a named test; `travel` is the pick/aim/confirm sequence
including this round's reachability guard. 32 tests between them, and the matrix
one would have caught D-162 before it was reported.

Recorded as R-23b so the next bug in a component gets asked the question: is
this a rule that can leave, or is it genuinely layout?

Honest limit: some of the first list stays untestable without a DOM harness —
whether a panel eats a wheel event, whether a tooltip is clipped by an ancestor's
overflow. Those are what R-23 means, and they get verified by running the app.
Adding jsdom to chase them would buy confidence in a fake browser.

---

## Round 31 — the party could not be placed at all

### D-167 — The sequence starts itself when there is nothing to pick up · `agreed`
*"started it from scratch, I can't get the party token in place… made it known,
but the token isnt there."*

Nothing wrong with what the GM did. Galia on disk: `chunks: ["15,15"]`, so the
reveal worked, and `placement.at: null`. **There was no way to place the party
through the UI at all.**

D-150 collapsed placement into movement — "the first move is a move", which is
still right — without noticing that step one of the sequence is *pick a pawn*,
and before the first placement no pawn exists. So the sequence could never start,
on any campaign, ever. The feature shipped with its entry point missing.

Two things made it survive review:

- **The panel instructed a flow that did not exist.** It said "Pick the travel
  tool and click a revealed cell", which is what I intended and never built. I
  wrote the guidance from the design, not from the code, and then read the
  guidance back as evidence.
- **My own test asserted the dead end as correct.** `tools.test.ts` checked that
  every tool means nothing on empty space — true of the click table, and it
  looked like coverage of exactly this area while the real gap was that nothing
  ever *armed* the sequence.

Fixed with `armed()` in the travel module: travel active and party unplaced
arms the group pawn. Aim, ghost, reachability guard (D-164) and confirm are
untouched, so placement obeys R-131 like any other move — no exemption for the
first one. Seven tests, including the disarm-on-tool-change case.

Only the GM console arms. The table display would otherwise show players a
"point at a revealed cell" prompt on the shared screen before the GM had put the
party anywhere, and the first placement is the GM's to make.

**The lesson worth keeping** is not "test more". It is that every verification I
did this round was of the *rule* — the reachability guard, the click table, the
server refusal — and none of it exercised the *first-run path*. A campaign
created from scratch is the one state I never tried, on a feature whose whole
subject is a thing that starts out absent.

### D-168 — Only the neutral tool holds a selection · `agreed`
*"we should remove the current selection panel on tool change, I see the chunk
detail if I select it and then I go to paint, or a city detail if I select it and
then I switch to whatever like height tool."*

The other half of D-162. That round stopped non-select tools from *making* a
selection but left the ones already made sitting there, so an inspector could
outlive the tool that opened it — describing something Paint cannot act on, and
offering Delete and rename for a place the GM had moved past.

Implemented as ownership rather than as a transition, which matters: clearing on
*every* tool change would have broken D-127, where placing a POI switches to
Select and pre-selects the new one. `holdsSelection(tool)` is the rule; the
effect drops the selection whenever the active tool is not the one that owns it.

A test asserts `holdsSelection` agrees with what `clickAction` can actually
select, for every tool. That is the interesting part — the two would otherwise
drift the moment a sixth tool is added, in either direction: a tool that can
select but not hold opens an inspector that the next render wipes, and one that
holds but cannot select keeps a stale panel. Neither is reachable while the test
stands.

### O-023 — The Browser pane cannot launch the host itself · `open (environment, not code)`
`.claude/launch.json` is correct and unusable on this machine. Starting it via
the Browser pane's launcher dies before any project code runs:

```
Error: EPERM: process.cwd failed with error operation not permitted, uv_cwd
```

**Not** a missing directory — the message is *Operation not permitted*, not *No
such file*. The launcher's subprocess is denied permission to read the working
directory at all, so npm throws in its own bootstrap calling `process.cwd()`.

Isolated with a controlled probe: the identical command serving from `/tmp`
starts fine, and from `~/Documents/Projects/table-top-scenarios` it fails. That
is macOS privacy protection on the Documents folder — the desktop app's spawned
process has not been granted access to it. Wrapping the command in
`sh -c 'cd <abs> && …'` does not help: the `cd` is refused for the same reason.

Nothing in this repo can fix it. Two ways out:

- Grant the app access — System Settings → Privacy & Security → Files and
  Folders (or Full Disk Access) → allow Claude, then restart it.
- Or keep doing what works: start the host from a shell (`npm run start`) and
  point the Browser pane at `http://localhost:8080/gm/`. The shell has the
  access the launcher lacks, and the pane needs no launcher to open a URL.

Left as an open item rather than "fixed" because the config is fine; the
environment is what is missing a permission.

---

## Round 32 — undo

### D-169 — Undo is snapshots of the campaign, taken at the boundary · `agreed`
*"it happens that Im painting and I fail, and I do this cmd+z automatically and
nothing happens."*

Scope agreed as **authored content only** (R-140), which keeps undo the GM's
alone and sidesteps the question the alternative raises: players can move the
party, so a shared history under one person's keyboard would let cmd+z rewrite
someone else's action.

Two designs were considered. **Inverse intents** — record each edit's opposite
and dispatch it — fails on the brush: undoing a 3×3 stroke over mixed terrain is
"paint these nine cells back to their nine different terrains", which no intent
expresses. **Snapshots** cost almost nothing here, because the domain is
immutable with identity-preserving edits: an entry shares every chunk the edit
did not touch (R-12). That the expensive-sounding option is the cheap one is a
dividend of a decision made for unrelated reasons in round 2.

The snapshot is taken by comparing campaign identity across `apply`, not in each
handler (R-140a). It makes "an intent that changed nothing records nothing" fall
out for free, and it cannot be forgotten when the next intent is added — which
is exactly how D-162 slipped through.

Also considered and rejected: doing undo *last* of the three features, on the
grounds that every feature added first makes undo bigger. Snapshot history is
intent-agnostic, so waiting buys nothing and costs a papercut every session.

In-memory, fifty deep, gone on a host restart. Persisting an undo log is a new
file format and a migration for something that matters for minutes.

### D-170 — A drag is one undo · `agreed`
The detail that decides whether the feature feels finished. Paint and height
dispatch one intent per cell entered, so a stroke across twelve cells would take
twelve presses to undo — technically correct and useless.

The client tags one gesture's intents with a `stroke` id and only the first
records history. The host keeps the id opaque and compares it with the previous
one.

The comparison requires a **non-null** id, and that is the trap: two separate
single clicks both carry `undefined`, so a plain equality check would collapse
unrelated edits into one. There is a test named for it.

### D-171 — A returned POI comes back hidden · `agreed`
Known edge, decided rather than discovered later. Deleting a POI also drops it
from discovery (R-126), and undo does not restore play state — so undoing a
deletion brings the place back **Hidden**, whatever it was before.

Kept, because it errs the safe way. The project's bias throughout is that things
are hidden until the GM says otherwise (D-121, D-125), and there is no undo for
something the players have already read.

### D-172 — One button grid, three users · `agreed`
The campaign card was a flex `row`, and adding undo and redo to it produced
exactly the failure D-129 already documented for the tool palette: "← campaigns"
wrapped onto two lines, Duplicate was clipped off the card, and the two arrows
floated in the gap. `flex-basis` is not a floor.

Fixed by the layout the GM asked for — back on its own row, duplicate on its
own row, undo and redo sharing the third — and by making the grid a **shared
class** rather than a third copy of the same four rules. `.btn-grid` holds the
fixed columns, the `wide` span and the full-width buttons; `.tools`, `.brush`
and `.campaign-actions` supply only their column count and padding.

The `:has(.wide)` selector carried over from `.tools` is the non-obvious part,
and it is why copying would have gone wrong: a Tooltip wraps its button, so the
*wrapper* is the grid item, and spanning the button alone leaves it inside a
one-column cell.

Labels spelled out rather than iconic — "Back to main menu", "Duplicate
campaign", "↶ Undo", "↷ Redo". The bare arrows were unreadable at that size, and
at dock width there is room for words.
