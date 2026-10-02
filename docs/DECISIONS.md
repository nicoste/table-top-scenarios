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
The remaining work is dominated by UI (world builder, point of interest builder, place
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
at voxel detail in the world view (see R-165 and D-010).

### D-005 — Discovery is GM-granted, not computed · `agreed`
Players tap a place, or the centre of a chunk they know nothing about. The actual
scouting happens off-tool; the GM then reveals. No world-scale line of sight.
Encoded as R-16.

---

## Round 1 — decided by me, then reviewed

D-006, D-007 and D-013 were approved on review. The rest still carry
`proposed` and are open to challenge.

### D-006 — Campaign and save are separate stores · `agreed`
Authored content (world, terrain, places, encounter maps, registries) lives in a
campaign file. Play state (token positions, discovery, fog, notes) lives in a
save that references the campaign by id and schema version.
**Why:** if they share a file, saving a session forks the entire world and
editing a map corrupts every earlier save. This is the decision I would least
like to reverse later.

### D-007 — One `VoxelGrid`, two brush sets · `agreed`
Chunk terrain (columnar) is a constrained case of a sparse voxel grid, so world
and encounter maps share one implementation, one serialiser and one renderer.
The world builder's brushes preserve the one-column-per-cell invariant; the
point of interest builder's do not. **Why:** the alternative is two of everything.

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
`type PlaceId = string & { __poi: true }`. **Why:** `PlaceId` and `EncounterId` are
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
a chunk, or its own size per place?

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

**Correction (round 35).** Two things about this entry were wrong when audited:

The **justification is dead.** It argues 1.5 m from posture arithmetic, and
posture was retired by D-035 — R-40 has one eye height and no crouching. The
number is unaffected and stands on a better reason: it is exactly 1/1000 of the
1.5 km world cell (D-098), so the two scales relate by a round factor, and 5 ft
is what published maps use.

It was also never actually confirmed — the body asks for an answer the log never
records. It is confirmed now **by implication**, because D-098 chose the world
cell *as* 1000× this one; changing it would move the world scale with it.

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
per place-to-place link?

### O-007 — Encounter map ↔ chunk relationship · `resolved by D-042`
A place sits on one 200 m world cell but its encounter map may be 150×150 m. Is
that a deliberate abstraction we simply accept, or should the tool relate them?
My instinct is accept it and never mention it again.

---

## Round 3 — camera

### D-029 — God view only, orthographic, stepped angles · `agreed`
Nicolás: *"I imagine this tool always as a god view, isometric... it's fog of war
shared by tokens, from an isometric view."* One camera rig across world, chunk
and point of interest; zooming in changes the `MapRef`, not the camera mode. Yaw in 45°
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

## Round 5 — knowledge, sight height, travel, places

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

### D-042 — A place's maps have no geometric relation to its world cell · `agreed`
Answers **O-007**. A place sits on one 200 m cell, may have a 3×3 footprint, and
its market map may be 150 m across while its dungeon is bigger than the realm
above it. Accepted abstraction, never surfaced in the UI, never validated.
Encoded as R-50 and R-51.

### D-043 — A place owns an ordered list of encounter maps · `agreed`
**Supersedes D-023.** Nicolás: *"the place should handle a list of encounter maps...
all floors for 1 place. Also the reign example buys it, the main square, the market,
etc."*

This is a better model than the map-to-map linking I proposed for multi-level
dungeons. The place is the container, so there is nothing to link — dungeon floors
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
A chunk is `Unknown` or `Known`; a place is `Hidden` or `Revealed`, independently,
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
off-tool flow, the GM unveils the chunk with as many places are accurate, and then
the players do a separated travel. Simpler, easier."*

The loop (R-57):

1. party travels to a cell at the edge of known territory
2. scouting happens **off-tool**
3. the GM reveals the adjacent chunk and whichever places are accurate
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
only a place. So the party is a marker at a chunk coordinate plus a cell, and travel
targets are any cell in a `Known` chunk or a `Revealed` place anchor. Time passing
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
arithmetic: ~20 places with a few levels each is several hundred thousand filled
cubes, which is 10–35 MB as one JSON entry per cube, rewritten whole on every
save.

Structure stays JSON (manifest, world, places, registries, all saves); voxel bodies
get a per-32³-chunk palette plus RLE, landing the same content at 1–3 MB. And a
campaign becomes a **directory**, so editing one dungeon level rewrites one file.
Encoded as R-59, R-60, R-61.

### D-033 — partly confirmed, clamp deferred
Ground stalks and picking-ignores-faded-geometry are agreed and cheap. The
**view-height clamp** is deferred: it is entangled with the point of interest-map level
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
view-height clamp (D-033), interacts with R-49 (a place owns many maps) and with
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

The UI volume is large (two builders, place inspector, travel, notes, palettes,
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
*"the point of interest vision is calculated, the GM can reveal places or chunks in the
world map only."* No manual fog painting on encounter maps. GM revelation is
world-scale only — chunks and places. R-47 removed.

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

## Round 11 — point of interest vision

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

### D-069 — Build order is world first, point of interest last · `agreed`
*"I would rather work from easiest to hardest, I want to build from the world to
the point of interest."*

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
2. **Navigation and travel** — the view stack, place markers and reveal, distance,
   pace, time.
3. **Encounter** — the voxel builder, tokens, calculated fog.

Encounter-scale rules already settled (R-15, R-40 to R-46a, R-74 to R-76) stay on
the books; they are simply not implemented until stage 3.

---

## Round 12 — the world layer

### D-070 — Two scales, not three. A chunk is not a view. · `proposed`
Nicolás, thinking aloud: *"the world map should show the chunks as they are. The
places are always visible too. What makes me think, whats the gain of the zoom
in..."*

He answered his own question: nothing. If the world map already renders chunks as
they are with places visible, zooming in adds magnification, not information — so
the chunk view was never a view. It was a leftover from assuming the world map had
to be a *simplified* overview.

A chunk stays the unit of **authoring** (a 20×20 block the GM creates) and of
**knowledge** (`Known`/`Unknown`). It stops being a place you navigate to.
`MapRef` drops to `world | point of interest`, one navigation level and one set of zoom
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
*"a player will tap on a cell of the chunk or a place, and depending on the party's
token position, it will ask for getting in or travel to it."* One gesture; the
tool resolves it against the party's position (R-81).

---

## Open

### O-013 — Maximum column height · `resolved by D-075`
*"The tallest might be up to what the chunk has as height or width, in our case, I
think we said 200 cells."*

I think 200 is a crossed wire: 200 was discussed for **point of interest** maps (O-002),
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
crossed wire between point of interest-map bounds and the world cell size (R-80).

---

## Round 13 — places

### D-076 — One cell per place; footprint deferred · `agreed`
*"Lets do 1 cell per place now, in the future I would love to have an expand place,
where you can pick the cells associated to it."* `Place.footprint` is removed from
the model and recorded as O-014 rather than half-built. Single-cell keeps travel
targeting, marker placement and the tap gesture unambiguous (R-50).

Note this walks back part of D-042/R-50, which I had introduced with a `3×3 realm`
example. The concept survives as a future feature; the field does not exist yet.

### D-077 — Marker and name share one zoom threshold · `agreed`
*"They should disappear past some zoom and become the 3D miniature up close...
Names should be revealed at the same moment the 3D model is visible, they toggle
together."*

One threshold, both appear together. This also **refines round 12's "places are
always visible"**: they are always *revealed* — never fogged — but not always
*drawn*. Two different things (R-83, R-84).

### D-078 — Markers are cosmetic · `agreed`
A castle, a cave and a forest differ only in which model is drawn. No place type,
no behaviour attached (R-82).

### D-079 — place notes: ordered, individually visible, host-filtered · `agreed`
*"the GM should have the chance to add notes to each place, sort them and mark them
as visible/unvisible. When Players tap on a place, a menu panel will appear showing
the name and the visible info of that place."*

An ordered `PlaceNote[]`, each with `visibleToParty`. The GM adds, edits, reorders
and toggles. Notes marked invisible are **stripped by `viewFor`** and never reach
the table display — the same trust boundary as hidden tokens (R-85, R-19).

Reading taken: *"sort them and mark them"* refers to the **notes**, not the places,
since "the visible info of that place" implies per-note visibility and places already
have their own `Revealed` flag. Say if you meant sorting places in a GM list.

### D-080 — "Visible" is three different concepts and gets three names · `agreed`
Fell out of writing D-077 and D-079 together: `Revealed` (the party knows it
exists), `visibleToParty` (a note may be shown), and *drawn* (past the zoom
threshold). Only the first two are state; the third is never persisted or
transmitted and must never be called "visible" in an identifier (R-84, glossary).

Cheap to separate now, and the sort of collision that otherwise produces a bug
where changing the camera leaks a secret.

---

## Open

### O-014 — Multi-cell places ("expand place") · `open`
Wanted, explicitly deferred. A tool to assign extra cells to an existing place, for
a realm or a city spanning several 200 m cells. Needs answers on what the extra
cells *do*: are they drawn differently, are they all valid travel targets, can
footprints overlap. Not blocking anything.

### O-015 — Do token notes use the same structure? · `open`
`PlaceNote[]` is ordered with per-note visibility. `Token.notes` is currently a
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

### D-082 — The party marker is a moving, unclickable place · `agreed`
Same miniature treatment, same zoom threshold (R-83). Differs only in moving and
in having no gesture attached (R-90).

### D-083 — Party members are campaign-level definitions · `agreed`
*"These tokens are the one that then the GM can instance into the point of interest
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

Explicitly **not** in v0.1: places, travel, chunk knowledge/fog, encounter maps of
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
- a place's encounter map now fits comfortably inside its cell, which quietly
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
party member, every place, every note. A shallow copy with only a fresh campaign id
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

### D-121 — places are withheld from the table display until `Revealed` exists · `agreed`
Whether the party knows a place exists is **play state**, and play state lives in
a save (R-8, R-16) — and saves are not built yet. So there is nowhere to put the
flag this round.

Sending places before the flag exists would put every secret the GM has written
onto the players' screen, so `viewFor('table')` returns an empty place list. A test
asserts the table payload contains neither a place name nor any note text, by any
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

### D-123 — places are a flat list on the campaign, one per cell · `agreed`
The docs said `Chunk.places` and the code said `Campaign.places`; the code was
right, and the doc is fixed (R-118). A flat list makes "every place" one read,
finds a place without knowing its chunk, and makes moving one across a chunk
boundary a field change rather than a move between containers.

**At most one place per cell** (R-119), or the tap gesture (R-86) has no
unambiguous answer.

### D-124 — Places is a third tool; tools move to 1/2/3 and brush to 4/5/6 · `agreed`
Placing a place needs its own mode, or a click in paint mode paints instead. Tools
are now grouped on 1/2/3 and brush sizes on 4/5/6, which is more legible than
tools on 1/2 with brush on 3/4/5.

The brush selector hides in Places mode — it does not apply, and offering it
would be the same confusion D-110 fixed for terrain.

**A marker click always means the place**, whatever the tool is, and switches to
Places. Otherwise the only way to edit a place would be to remember to change mode
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
*"this places feature makes us identify a condition we need and was not there: the
no-tool or pointer tool."*

Right, and it was a gap in the design rather than a bug in the code. Every tool
edited something, so there was no way to inspect a place without risking creating
another, and nothing for an action to finish *into* — placing a place left the
Places tool armed, so the next click made another one while the marker list had
already gone.

- `select` is added as a fourth tool and is now the **default**, so opening a
  campaign cannot accidentally edit it (R-87a)
- **after placing a place the app returns to `select` with the new place selected**
- clicking a marker selects it **whatever the tool** and no longer switches to
  Places, which would have re-armed creation (R-87b)
- in `select`, the hover outline is hidden — there is no edit to preview

The interesting part is how the new place gets selected: the **host** assigns the
id, so the client cannot know it when it dispatches. It remembers the *cell* it
clicked instead and claims the place that appears there in the next snapshot —
which works only because there is at most one place per cell (R-119). An invariant
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
campaigns — islands, thirteen places, party, notes — with nothing to restore from.
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

### D-136 — A place reaches the table only when its chunk is Known too · `agreed`
The one thing the design panel earned its keep on. Three independent critics each
found the same HIGH leak in a different design: R-16 makes `Known` and `Revealed`
independent, which I had written thinking only of *hidden inside known*. The same
independence permits a **Revealed place inside an Unknown chunk**, which would put a
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

Deciding whether to reuse a stored save, mint a fresh one, or prune stale place ids
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
discovery only because points of interest do not exist yet (O-009). Once tokens stand on
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

`visionRange` stays in `PartyMember` for points of interest and stops being rendered in
the party panel (R-135). It is an point of interest quantity — 12 cells at the point of interest
cell (R-46a) — and beside a 1.5 km world cell it reads as 18 km of sight.

### D-155 — Token positions live in the save · `agreed`
Not a judgement call, recorded so it is not relitigated. Where the party stands is
play state, so it sits beside `discovery` in the save (R-8, D-006), never on the
campaign. A duplicated campaign therefore starts with the party unplaced, which is
correct — the copy has not been played.

Stale positions are pruned when the campaign opens, exactly as `pruneDiscovery`
drops place ids the GM deleted, for the same reason: a position for a member no
longer on the roster.

### D-156 — The world cell type moves to `world/` · `agreed`
`{cx, cz, x, z}` currently lives in `place/` as `PlaceCell`, with `isValidPoiCell`
beside it. The party needs to name a cell too, and `party/` importing from `place/`
to say where someone is standing would be nonsense. Promoted to `world/` as
`WorldCell` with one validity check; `PlaceCell` becomes an alias.

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
*"you can select places while you are attempting to paint. Discovered this while
painting snow around the party token."*

A real bug and a rule of mine behind it. R-87b said a marker click means the
place **whatever the tool is**, justified by "otherwise the only way to edit a
place would be to remember to change mode first". That reason was already weak —
Select is the default tool, so inspecting is the no-mode case — and the cost is
that the map has spots you cannot paint.

Two changes, and the first is the real one:

**`pick()` no longer picks a winner.** It resolved in precedence order and
returned on the first hit, so a marker hit reported `column: null` — the terrain
under a place was not merely deprioritised, it was *unreachable*. Now pawn, place,
cell and slot resolve independently; the ray passes through a marker to the
ground beneath it. Precedence was never `render`'s to decide.

**Each tool names what it picks** (the table in R-87c), and ignores the rest.
Paint and Height see only cells. Places sees only empty cells. Travel sees pawns,
then cells while aiming. Select sees places, then chunks.

Two details worth recording:

- **Chunk selection stays on Select**, though the request said "places only". It is
  the only route to the Known toggle, and dropping it would have stranded the
  visibility workflow. Flagged rather than assumed — if the toggle moves
  somewhere else, Select becomes places only.
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
drawn on top. That is what *"ignores any place or token blocking the terrain"* has
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

Fixed *with* a test at the time — the prototype's vision leak, the revealed-place
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
*every* tool change would have broken D-127, where placing a place switches to
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
did not touch (R-165). That the expensive-sounding option is the cheap one is a
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

### D-171 — A returned place comes back hidden · `agreed`
Known edge, decided rather than discovered later. Deleting a place also drops it
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

### D-173 — Open before Delete, and Delete says so · `agreed`
*"invert the order of the 'open' and 'x' button… I want to see 'open' and 'x',
and also change 'x' by a 'delete'"*

Open is the thing a GM does every session and it now comes first, where the
pointer already is. Delete keeps the quiet styling, so the destructive action is
not the visually obvious one sitting where a mis-aimed click lands, and it says
*Delete* instead of an `×` that could be read as "close". The confirmation step
(D-108) is unchanged.

### D-174 — Players can select a place and read its notes · `agreed`
*"Enable selection for players so they can see the notes of the places… Selection
remains selected… players don't add anything neither reorder, is just
informational."*

Cheap, because the data already crosses the boundary: `viewFor` has always
stripped notes that are not marked visible to the party (R-85), so the table has
been receiving exactly the right subset and throwing it away. This round only
renders it.

Three things worth naming:

**A travel in progress owns the click.** *"you tap on the player token, then
selecting a place should keep going with the travel flow, not select the place."*
So aiming short-circuits before anything else, and a place under the pointer
contributes its cell rather than itself — which `intendedCell` already arranged
(D-163). The policy is `tableAction` in `client-core`, tested like the GM's
matrix (R-23b), including a test that no branch of it can ever produce a
world-editing action.

**The selection is an id, re-resolved every render (R-141).** The GM can hide or
delete a place while a player has it open; a cached copy would leave revoked
notes on the shared screen. That is the failure mode this screen exists to avoid.

**The panel takes no `dispatch` (R-142).** Read-only by construction rather than
by discipline — there is nothing it could send.

This overrules the second half of R-134, where I wrote that the table's one
interaction "stays the only one" and that it would not acquire a dock. It has a
dock now. The half that mattered — no tool palette, no roster — still holds.

---

## Round 33 — points of interest on a place

### D-175 — Points of interest are a named, individually visible list · `agreed`
*"Add points of interest to a place, for now, just a list, with visibility checks, most
likely the way notes work."*

Built as notes' twin: ordered, the GM sorts them, each entry revealed or hidden
on its own, new ones hidden by default (D-125). Add, rename, reveal, reorder,
remove — the same five operations, and the same strip at the boundary, because
the name of an unrevealed point of interest is exactly the kind of spoiler R-85 exists
for.

`Place.points of interest` was already there as `EncounterId[]`, unused and unusable: an id
with no name and no flag. It is now a record (R-143), which is also what the
point of interest **map** will attach to when O-009 lands — a name in a list can grow a
grid.

Campaign schema 2 → 3. Lossless in practice: nothing could ever create an
point of interest, so every stored list was empty.

Two things fell out of doing it:

**Tolerance belongs at the boundary, not in the types (R-137a).** My first cut
typed the wire as `string | record` to accept the old shape, and the union
immediately leaked `typeof` checks into the view filter, both apps and the tests.
A Zod `.transform()` normalises on the way in, so one place knows the old shape
existed.

**Campaigns are stamped on adoption, like saves.** R-137 already said a stored
record must not be written back claiming an older schema than its contents, and I
had applied that to saves (D-159) and not to campaigns. Opening a v2 campaign now
stamps it 3. Found by reading the file after the bump rather than by a test —
which is the same way D-159 was found.

**Verified** on a copy of the GM's real data: Casilda loaded from its v2 file,
kept its notes, and the boundary sent the party "Bandits at the ford" while "The
baron is a lich" never left the host. The player's panel showed notes then
points of interest, with no editable control in it and nothing but a Close button.

**Not verified:** the GM-side points of interest editor, eyeballed. A 13×14 click scan
could not find the marker on that camera — the island sits under the dock — and
the section mirrors the notes UI it was copied from. It typechecks and its
intents are tested; the pixels are not.

### O-024 — Screenshot coordinates are not page coordinates · `open (harness)`
Worth writing down because it has cost time in three separate rounds. The
Browser pane returns screenshots in its own frame (800×600 here) while the page's
CSS pixels were 1024×768 — a factor of 1.28. Coordinates read off a screenshot
and fed to synthetic pointer events land somewhere else entirely, which looked
like picking bugs twice and a broken travel confirm once.

Always read `canvas.getBoundingClientRect()` and scale, or find targets by
probing and reading the DOM back rather than by measuring an image.

**Second pitfall, found in round 37 and it cost the same time twice.** Reading
host state through a `role=gm` socket **steals the GM seat** (R-127: the newest
claim wins). The page under test is demoted mid-verification, its GM view goes
null, and every subsequent gesture does nothing — which looks exactly like the
feature being broken. It bit hardest on maps, because the table deliberately
receives no map body (D-184), so a GM socket was the only obvious way to read
one.

Read from **disk** instead (the campaign manifest holds everything persisted), or
from a `role=table` socket, which is not exclusive and steals nothing.

---

## Round 34 — the vocabulary

### D-176 — Place, then point of interest · `agreed`
*"instead of 'ENCOUNTERS', show 'Points of interest'… While creating the map, we
add 'Places', so each option of that tool is a 'Place marker', then inside of a
place we can have 1 or more POIs… Is it confusing or clarifying?"*

Clarifying, and it fixed something already broken. Three reasons, in order of
weight:

**The code and the screen already disagreed.** The tool was labelled *Places*,
the inspector header said *Place*, the table panel was `PlaceCard` — and the
domain type was `Poi`. One concept, two names, depending on where you were
reading. That is the exact shape of D-138, where `isKnown` meant "the GM authored
this" in one place and "the party knows this" in another and I renamed it before
it could cause the bug it was clearly going to cause. This had been sitting there
since round 24.

**"Encounter" was doing two jobs, and my own test data proved it.** I seeded
"Bandits at the ford" (an event) and "The baron's study" (a location) into the
same list without noticing. An arena is not an encounter; it is where one
happens.

**It gives the word back to what it named.** R-49 always said a place owns many
encounter *maps*. Under the old vocabulary, shipping O-009 would have meant
encounters owning encounter maps. Now a point of interest owns them, and R-49
moved the ownership down a level with the rename: you fight in the arena, not in
the village.

Done as a **swap in two passes**, which is the only safe way: `Poi` → `Place`
first, freeing the name, then the inner list into it. At no point did two
concepts share an identifier. ~900 code references, ~330 doc mentions, zero
typecheck errors after each pass, 370 tests green throughout — the tests are what
made a rename this size a mechanical exercise rather than a gamble.

`pointer` and `pointed` also contain "poi", so every replacement was anchored to
a whole identifier. Nothing was a substring replace.

### D-177 — No migration; old campaigns are refused, not guessed at · `agreed`
*"no problem on doing new campaigns from scratch. I want full consistency from
scratch."*

Taken at face value, and it is the right call: the old files use `pois` for what
is now `places`, so any tolerant reader would have to infer a field's meaning
from its neighbours — the ambiguity the rename exists to delete.

Two things this exposed, both worth fixing regardless of the rename:

**`list()` did not validate at all.** It read `id` and `name` and offered the
row, so an unreadable campaign would have been listed and then failed on Open.
It now skips anything below the current schema.

**`load()` threw, and would not have caught this anyway.** Throwing from a store
inside an intent takes the whole message handler with it; it returns `null` now,
which the host already turns into a readable rejection. And validation alone
would *not* have rejected an old manifest: unknown keys are stripped and `places`
defaults to empty, so it parsed cleanly into a campaign with no places — silent
loss wearing the face of success. The version is checked explicitly instead.

Campaign schema 3 → 4, save schema 2 → 3.

---

## Round 35 — the audit, before designing maps

### D-178 — One map per point of interest, in a flat list · `agreed`
*"I like it in terms of organization, I don't think they add any to the users…
some of them will be just 'church', others 'tavern keep' and 'tavern
underground', and it will be easier to see it all at once."*

**Overrules my recommendation**, which was a point of interest owning an ordered
list of maps so a building's floors nested under it. The argument that changed my
mind, in the GM's order:

- **Scannable beats expandable.** One list of everything in a place is what the
  panel is *for* — when authoring, and when players review where they have been.
  A tree adds chrome to achieve what the list already does.
- **The grouping mechanism already exists.** Points of interest are ordered and
  the GM sorts them (D-175), so "tavern keep" and "tavern underground" sit
  together by name and position.
- **It costs nothing.** The flat model is exactly the shape shipped in D-175 — a
  point of interest gains a map field. Nesting would have meant another schema
  bump for organisation nobody asked to see.

I had no cheaper UI for the nested version and did not invent one.

### D-179 — The stale-rule audit · `agreed`
Asked for before designing encounter maps, and it found more than expected.
Twenty-two rules govern this area, most written in the prototype era, before
three vocabulary changes and two scale changes.

**The vision model survived intact** and is better than I remembered: binary
visibility with no cover and no posture (R-40), multi-sample per cube so binary
does not mean one ray (R-41), whole cubes never faces (R-42), sealed diagonal
seams (R-44), blocks as the only occluders with `blocksSight` as a *material*
property (R-74, R-75), cumulative Explored (R-45), omnidirectional per-token
range (R-46). The best of it is R-43's rule of thumb — **see over one cube,
blocked by two, and each cube of elevation buys one more cube of wall** — which
is what makes elevation mean something without a posture model.

**Fixed as stale:**
- R-51 said a place sits on a **200 m** cell. It has been 1.5 km since D-098.
- R-51 and R-59 still described a *place* owning maps; that moved to points of
  interest in D-176 and flattened in D-178.
- R-49 rewritten a third time, and the entry now says so rather than reading as
  though it had always said this.
- "20×20" chunks and cells in R-105, R-83 and the chunk definition — 30×30 since
  D-103. R-83's legibility arithmetic recomputed (900 cells across is ~2 px per
  cell, not 5) and R-53's pathfinding node count recomputed (810k, not 160k, with
  the note that routes only cross Known chunks so the live graph is far smaller).
- D-024's justification corrected: it argued 1.5 m from posture arithmetic that
  D-035 deleted, and was never explicitly confirmed. Confirmed now by
  implication, since D-098 chose the world cell as 1000× it.

**Designed but unbuilt, and now known to be prerequisites:** the materials
registry (R-75 — nothing can be transparent without it), and the depth-legibility
trio R-34 ground stalk, R-35 view-height clamp, R-36 frontmost-non-faded picking.

**Never decided at all:** how a three-floor building *looks* like three floors
when one level is playable (the half of O-009 the flat list does not answer); the
view-height clamp, still deferred here from D-033; the gesture that enters a map
and what happens to the world view; who sets a map's bounds; where per-map fog
lives, given discovery is world-scale; and whether enemy tokens exist in the
first round at all.

---

## Round 36 — what an encounter map is

### D-180 — Cutting planes, and the range that snaps to them · `agreed`
**The GM's design, and better than any of the three options I put up.** I had
framed it as a trade: one body per place (illustration, at the cost of forcing
spatial coherence), one body per point of interest (freedom, at the cost of
authoring a building's shell twice), or neighbouring levels as context (rejected —
it needs the map-to-map connectors R-49 refuses). All three trade something away.

The planes dissolve it instead:

> *"What if we add cutting planes? Invisible planes added by the GM that will
> affect how players see the world… the tool should behave as a double range
> slider, where the GM can specify the steps/planes by presetting their Y values."*

A tavern with a ground floor, an upper floor and a secret cellar is **one body**
with planes at Y4, Y8 and Y12. Outside on the land the range is `[4, 20]` — the
cellar hidden, the tavern visibly two storeys. Inside, `[4, 8]` stops the upper
floor occluding the room. Upstairs, `[4, 12]` cuts the roof. In the cellar,
`[0, 4]` cuts away the land above.

So: the building is genuinely one model with three floors, nothing is authored
twice, stairs are just geometry, and the flat one-map-per-point-of-interest list
(D-178) is untouched.

**It supersedes R-35 rather than implementing it.** R-35 clamped to a single
upper bound, which can cut a roof away but cannot hide a cellar while the party
stands on the grass above. The lower handle is the half a one-sided clamp misses,
and it is the half the cellar case needs.

Two things I decided rather than asked, both flagged: planes carry a **name** as
well as a Y, because "Ground floor" on a slider step is legible and "8" is not;
and planes are **authored** while the active range is **play state**, which is
R-8 applied without a special case.

### D-181 — Blocks are placed by face adjacency · `agreed`
**Overrules my recommendation**, which was to paint on the top of the cutting
range so one control did both jobs. The GM chose Minecraft-style: click the face
of a block, the new one attaches there.

Worth recording why my version was worse, now that I look at it: tying building to
the *table's* cutting range would have coupled authoring to a play-state setting —
move the range to show the players the cellar and you would silently change where
your next click builds. Face adjacency has no such coupling.

Noted so nobody reads it as a contradiction later: this does not violate R-42.
That rule bans face-level *visibility*, where half-lit cubes look broken. Where a
block goes is a different question (R-147).

### D-182 — The GM sees the whole body; the table gets the range · `agreed`
Also overrules my recommendation of a single shared view. The GM's reason is the
right one and I had underweighted it: peeking at the cellar while the party is
upstairs is simply what a GM does mid-session, and one shared range makes that
impossible.

The cost I flagged was two views to keep straight, and R-76's preview obligation
becoming necessary rather than optional. Resolved with one view instead of two
modes: the **GM console draws everything, fading what falls outside the range**.
Same data, two renderings — absent on the table, dimmed on the console — so the
GM can always see at a glance what the players are being shown, and there is no
mode to forget you are in.

### D-183 — Build the map before the planes · `agreed`
Scope, from *"Lets focus on map building first, we can skip token vision and token
placements for now."*

**Round A — the map exists and can be built.** A point of interest gains a map;
entering swaps the tool palette (R-148); blocks are placed and removed by face
against a materials registry; the body grows horizontally with `+` and is capped
in height; it persists; the table follows the GM into it.

**Round B — the planes.** Add, name and move them; the two-sided range; faded
on the console, absent on the table.

Planes are designed now (R-146) and built second, because a slicing tool is only
testable against something worth slicing. Vision, fog and tokens — R-40 through
R-48 — sit out both rounds entirely.

The **materials registry** (R-75) becomes a prerequisite in round A: blocks need
appearance. It ships with `blocksSight` present and unused, since the field is
already specified and leaving it out would mean editing every material later.

---

## Round 37 — the map, built

### D-184 — A map body is not sent to the table yet · `agreed`
Decided while wiring the boundary, and it changed the round's scope.

D-183 said the table would follow the GM into a map. It should not, yet: a body
can hold a cellar the party has not found, and **without the cutting range there
is no way to send part of one**. R-85's standard is that a secret is never sent
rather than merely unrendered, so sending a whole body and trusting the client to
draw a slice would be exactly the leak this project keeps refusing.

So in round A a revealed point of interest reaches the table **as a name**, with
`map: null`, and the table keeps showing the world. Round B sends the slice,
because by then there is a slice to send.

Shipping the permissive version and tightening it later was the alternative. That
is how a leak becomes permanent — nobody revisits a working screen.

### D-185 — Which map is open is view state, not play state · `agreed`
A candidate for the wire, and it should not be. Which surface the console is
showing is the console's business (R-64), and the intents that edit a map name
their place and point of interest themselves — so nothing about editing needs a
"current map" on the host.

It becomes play state in round B, when the table has to follow the GM into a map
and both screens must agree on which one. Not before.

Resolved from the current wire every render, never cached, for the same reason
the table's place selection is (R-141): a map the GM deletes must not leave a
stale body on screen.

### D-186 — Round A, verified · `agreed`
Built: the materials registry (R-75, finally — specified long ago and never
made), the voxel body with a floored starting patch (R-149) growable in X and Z
(R-150), face-adjacency placement and erasure (R-147), the map's own tool palette
replacing the world's (R-148), and persistence.

Two things came for free from earlier rounds, which is the clearest sign those
decisions were right:

- **Undo covered map edits without a line of new code.** The snapshot is taken by
  comparing campaign identity across `apply` (R-140a), so a block edit was
  undoable the moment it touched the campaign.
- **A drag became one undo** the moment the client tagged the gesture, because
  the coalescing rule was already general (R-140b).

Verified on a throwaway host: created a map (16×16, 256-block floor), clicked the
floor's top face and watched the readout say *"Build at 9,1,6"* before a stone
block landed at exactly that cell; dragged a seven-block brick row sharing one
stroke id; took the whole row back with one cmd+z (264 → 257) and restored it
with cmd+shift+z; erased with the readout saying *"Erase 9,1,7"* — the block hit,
not its neighbour; stacked to Y2 by clicking the faces that appeared as blocks
accumulated; and confirmed the table received `map: null` with no `"blocks"`
anywhere in its payload. Read back off disk at campaign schema 4.

### D-187 — A point of interest is created with its map · `agreed`
The GM's words: *"We you create a POI, it should have a map, there should not be
a '+ Map', a POI is nothing without a Map."*

Right, and the lazy version was never a real choice. `+ Map` was a button with
one possible answer, asked at a moment when the GM had just typed the name of a
tavern. A point of interest is a place the party can walk into; the name is the
label on the door.

So `addPoi` creates the body, R-145 says **exactly** one rather than at most one,
and the `addMap` intent is **deleted** — not kept for symmetry. Nothing can be
mapless, so an intent to fix maplessness has no caller, and an unreachable branch
in `apply` is a branch that rots. The inspector row is now always `▣ Map`.

**No schema bump, deliberately.** A version number exists so code can branch on
what the data cannot tell you, and a missing map tells you itself. So the read
boundary repairs it instead (R-137a): `upgradedCampaign` fills any point of
interest that arrives without a body, unconditionally rather than behind a
version gate — a v4 file is already stamped v4, and gating would skip exactly the
campaigns that need it. A floor is not an invention: there was no body to lose,
and it is the same empty patch the `+ Map` button used to hand over.

That also keeps the campaign the GM is working in alive. The previous two bumps
broke old campaigns for a reason (D-177: the rename was genuinely ambiguous).
This one is not ambiguous, so breaking anything would be gratuitous.

The nullable type stays, and its meaning narrows to one thing: **this side was
not told.** The table receives bodies stripped (D-184), and `decodeCampaign` runs
on the table — so a non-nullable field would force the receiver to fabricate the
geometry the boundary just denied it. The guard in `applyToMap` stays too, now
unreachable and saying `'that point of interest has no map'` rather than
`'…no map yet'`: a narrowing that threw would take the message handler with it,
and if it ever fires the boundary leaked (R-18).

### D-188 — The `×` asks first · `agreed`
The GM's words: *"The 'x' icon needs a confirmation, deleting it by accident
might be terrible."*

Terrible is the right word now that the `×` takes a **built map** with it. It
also sits three pixels from the arrows that reorder the same list, which is
exactly how the wrong one gets clicked.

Recorded as R-151 and enforced by `ConfirmDelete` in `@tt/ui`, not by each call
site remembering — a rule that depends on being retyped lasts until the next list
grows a `×`. The place and launcher deletes already asked; the note and the point
of interest did not. Both do now, and the note got it without being asked for,
because the reason is identical and typed prose is no cheaper to lose than a
name.

**Undo was already the recovery, and that is not the same thing.** `removePoi` is
undoable — the snapshot is taken at the `apply` boundary (R-140a), so deleting a
point of interest restores with its blocks intact, and there is now a test that
says so. But history is bounded at 50 and cleared when the campaign changes, so
"you can always take it back" is not a promise to hand the GM. The confirmation
prevents; undo recovers. Both.

What was **not** built: a policy table of what needs confirming. It would have
had one meaningful row (blocks do not ask) and no second caller, and a table with
one row is a constant wearing a costume. The exception lives in R-151's prose,
where it is read by people rather than by code.

### D-189 — A duplicated campaign was sharing its points of interest' ids · `agreed`
Found while changing `addPoi`, not reported. `duplicateCampaign` renews the
campaign id, every party member's, every place's and every note's — and never
touched poi ids, from the day points of interest were added. Fixed; the map comes
across by reference, which is safe because a map is immutable (R-165), but an id
is identity (R-106).

The interesting part is why no test caught it. There *was* a test — *"regenerates
every id in the graph"* — reading ids out of a helper whose comment said "every
identifier anywhere in a campaign" while listing places and notes and not pois.
And it would still have passed after the helper was corrected, because the
fixture it ran against was a campaign with **no places at all**.

Two lies stacked: a helper that claimed completeness it did not have, and a
fixture that made the assertion vacuous. This is the same shape as D-167 (the
party could not be placed at all, and a test asserted the dead end) and the
from-scratch failure in D-179 — *the path never exercised is the one that is
broken*. The fixture now carries a place, a note, a point of interest and a
block, and the test was confirmed to fail without the fix before being kept.

### D-190 — Entering a map made three round-A bugs visible at once · `agreed`
Found while verifying D-187, not reported. Every one of them needed the GM to
*leave* a map, or to build in one after moving the camera — and round A's
verification (D-186) did neither. It created a map, built in it, undid, and read
the table's payload. It never came back out.

Then a point of interest always had a map, entering and leaving became the normal
loop, and all three surfaced in the first minute:

1. **Leaving a map showed an empty world.** Nothing parked the world's framing,
   so the camera stayed at the map's centre and zoom — empty space hundreds of
   cells from the place the GM had been looking at. The world was drawn the whole
   time. It just was not where the camera was pointed.
2. **Every block re-framed the camera.** `setMap`'s `recentre` was `body !== null`
   and the body is a new object on every render (D-185), so building at the edge
   of a map fought a camera that kept snapping to the middle.
3. **The render loop un-hid the world's markers.** It set visibility from the
   zoom threshold alone (R-83), overriding what `setMap` had hidden on the very
   next frame. A map's zoom is always under the threshold, so village markers and
   party pawns were live inside every tavern — off-screen, and pickable.

And one more, in the keyboard: the `keydown` effect listed only `[stage]` as its
dependency, so the listener kept the `openMap` it was mounted with. Inside a map
the digits and Escape ran the **world** branch — `1`/`2` never switched
Build/Erase, Escape never left, and both silently changed the world tool behind
the map. Fixed by adding the dependency; `Q/E/R/F` also moved out of the world's
branch, since the camera belongs to no surface (R-152).

Recorded as R-152 with the framing rule extracted to `packages/render/src/surface`
and tested: `surfaceMove` and `showWorldMarkers` are four lines that were wrong
in a file needing a WebGL context to run, which is what R-23b is for. Both tests
name the bug they replace.

The lesson, again, is not about cameras. **Verification that only goes one way
proves one direction.** D-186 entered a map and stopped; D-167 placed the party
and never started from scratch; D-189's fixture never held a point of interest.
Every time, the untried step is the broken one.

### D-191 — The surface decides what is visible, and the question owns its row · `agreed`
Three corrections to the round before it.

**`setCampaign` now re-applies the surface.** It rebuilds the world mesh, the
grid, the place markers and the pawns, and a rebuilt group is a new `Object3D`
with `visible` true — so every one of them came back on screen inside an open
map. It *looked* fine only because the console runs its campaign effect before
its map effect, so `setMap` undid the damage in the same commit. That is an
ordering accident, not a rule. There is now one `applySurface`, called from
`setMap`, from `setCampaign` and from `rebuildPawns` (which `setPlacement` calls
on its own, with no `setMap` behind it to clean up after).

**"▣ Map" reads "▣ Open Map".** A noun on a button is a label; a verb is an
offer.

**The question takes the whole row, and "Keep" sits on the right.** The GM's
reasoning, and it is better than the layout it replaces: *"as the 'x' is to the
right, the option to the right must be the 'Keep' so double clicks won't
accidentally delete them."* The row is right-aligned and the `×` is its right
edge — put "Delete" there and the second click of a double-click destroys what
the first click only asked about. So the pair renders `Delete` then `Keep`, and
`ConfirmDelete` takes the row's other actions as **children** and drops them
while armed. That is what makes it fit on one line: hiding ▣/↑/↓ leaves room,
which beats the wrapped second line it replaces, and a row offering nothing but
two words is unambiguous about what is being asked.

### D-192 — The delete prompt names the thing, not its parts · `agreed`
`Delete "The Eight's Church" and its map` became `Delete "The Eight's Church"`.
The GM's reason: *"users won't get the difference."*

They are right, and the phrasing was a leftover from when a map was optional.
Now that every point of interest has one (D-187), "and its map" distinguishes
nothing — there is no other kind of point of interest to contrast it with. A
qualifier that is always true is noise, and on a warning it is worse than noise:
it invites the reader to wonder which case they are in.

The map is still the reason this delete asks at all (R-151). That reason belongs
in the code's comment and in the rule, not in the sentence the GM reads at the
moment they are trying to decide.

### D-193 — One click, one cube · `agreed`
The GM: *"I don't think we should have the drag and paint in there, sometimes I
create huge columns by accident. One click, one cube."*

The accident is structural, not clumsiness. A block is placed against the face
under the pointer, and **placing one changes which face that is**: the new cube
presents its own top, so a pointer that has not moved at all is now aimed one
level higher. Hold the button a moment too long, drift two pixels, and the drag
climbs. The world's brush has no such feedback loop — painting a cell does not
move the cell — which is why dragging is right there and wrong here.

So a map drag edits nothing. Pointer-move only *shows* what a click would do,
and each click is its own undo: no stroke id, five cubes are five presses back.
R-140b keeps its generality at the boundary; a map just never asks for it.

Erase lost its drag too, which was not literally requested. The same loop runs
in reverse — removing a block exposes the one behind it — and "one click, one
cube" is the rule the GM stated, not "one click, one cube when building".

**And the cube is now outlined before it is touched**, which the GM asked for in
the same breath: *"We need the wireframe to show where is the cube about to be
placed... a white block sized wireframe of the 'upcoming' cube."* White rather
than the world's blue, because inside a map it is the only thing outlined and it
marks a cube that does not exist yet.

The world's highlight could not be reused: it sits on a column and scales to its
height (R-87), while a map's target is one cube anywhere in the air — the same
distinction that makes the world store heights and a map store blocks. What the
two *do* share is the obligation, so R-153 states it rather than leaving the map
to invent its own answer.

`mapHover` derives the outline and the readout from one `MapAction`, and is
tested for the property that matters: the cube that lights up is the cube the
click edits. Two separate computations would have been two chances at R-147's
off-by-one along the face normal — and only one of them would have looked wrong.

### D-194 — A brush and a bucket, inside the map · `agreed`
The GM asked for two things: *"a brush to 'paint' in the material we want, the GM
can drag"*, and a bucket that *"takes the previous color of the block we touched
and does a recursive search for blocks of the same color that were neighbours of
the previous sample, like the bucket tool of 'Paint' but for 3D."*

Both built. Yes, doable — and the description was already the algorithm.

**The brush drags, and that is not a reversal of D-193.** It sharpened the rule
instead. What made a build drag dangerous was never the dragging; it was that
*placing a block changes which face the pointer is over*, so a stationary hand
ends up aimed a level higher and the gesture climbs its own cubes. Paint changes
a material and nothing else, so its target does not move under it. R-153 now
states the real test — **a gesture may drag only if it does not move its own
target** — and build, erase, paint and the world's terrain brush all fall out of
it correctly rather than each being decided by hand.

Paint reuses `setBlock`: the domain already replaces the material of a block that
is there (R-165), and paint only ever targets a block the GM can see. What differs
between build and paint is not the intent, it is the *cell the tool chose* — the
block itself rather than the space against its face. One `mapEdit` performs every
map action, because the brush runs through both pointer-down and pointer-move and
two copies of that switch would drift.

**The bucket, decided:**

- **Connected, not global.** "Recursive search of neighbours" is a flood, so one
  stone wall repaints without touching the stone floor across the room. A global
  replace is a different tool and nobody has asked for it.
- **Faces only** — six neighbours, not eighteen or twenty-six. A 2D bucket uses
  four, not eight, for the same reason: blocks meeting at an edge are a diagonal
  seam (R-44), and leaking through one crosses a wall the GM built as solid.
- **Breadth-first with an explicit queue**, not recursion. A region can be the
  whole body, which at the largest footprint is tens of thousands of cells — the
  recursive version is a stack overflow waiting for a big enough tavern.
- **It returns the region as well as applying it**, so the readout can say *"Fill
  from 5,1,3 — 42 blocks"* before the click. The outline marks where a fill
  starts; it cannot show how far one reaches, and a one-click tool with that much
  reach should not be silent about its size.
- **One intent, one undo.** No stroke id needed.

The material palette now shows for build, paint and fill, and hides for erase —
three of the four tools need a target material, and the panel offering one to a
tool that ignores it was the sort of thing that teaches a GM to distrust the UI.

### D-195 — The pan was the third camera control an early return swallowed · `agreed`
*"I can't move around the camera as we do in the world map."* Right-drag armed
`panning` in pointer-down, and then the map branch in pointer-move returned
before the `panning` check ever ran. Zoom worked (its own handler); turn and tilt
had been fixed the same way in D-190; pan was the one left.

Three of three. The lesson is not about panning: **a surface branch placed at the
top of a handler silently owns every control below it.** The camera check now
comes first in pointer-move, which is what R-152 says out loud — the camera
belongs to no surface — rather than something each handler is trusted to
remember.

### D-196 — A compass, and a rose to grow by · `agreed`
*"I will love to have a floating compass middle bottom to know where is North.
Rotating the camera confuses a little bit."*

Built, in all four views, from one `@tt/ui` component (R-155). Two things worth
recording about how.

**The bearing is derived.** North's screen bearing under this projection is
exactly the camera's azimuth: the camera sits at `focus + (sin y, ., cos y)` and
looks inward, so screen-right is `(cos y, -sin y)`, screen-up is
`(-sin y, -cos y)`, and north — the direction `(0, -1)` — projects to
`(sin y, cos y)`, a bearing of `y`. The test checks that derivation against the
projection rather than asserting four numbers, because a compass ninety degrees
out is worse than no compass, and four numbers are only right until `YAW_OFFSET`
changes.

**The stage now reports camera movement** instead of being polled. Three of the
moments the compass has to be right about — framing a map, returning to the
world, a rotate — happen inside `Stage` without the app asking for anything, so
`watchCamera` fires on every change and once on subscribe. Only the **yaw step**
is kept in React state: panning fires on every pointer move, and re-rendering a
console for a compass that did not change would be a frame's work per pixel.
Every assignment to the camera target now funnels through `setTarget`, so
nothing can move the camera quietly.

**The expand rose.** *"The '+ East' and '+ South' are not really easy to
understand. Can we add also the other directions?"* — they were not easy to
understand because they were the only two the code could do: growing north or
west meant renumbering every block, and my own comment called a renumber "how
saved references rot".

So the map got an **origin**. North and west now move it negative and every
existing block keeps its coordinate. That is a shape change with no schema bump,
for D-187's reason: a file without an origin can only be one that grew east and
south, so `{0, 0}` is not a guess about it — it is what that map already meant.

One word changed from the GM's wording: the label reads *"Expand the map to:"*
rather than *"expand the terrain to:"*. Inside a point of interest there is no
terrain — the world map has terrain with a difficulty, a map has materials — and
D-176 was a large cleanup of exactly this kind of drift.

### O-025 — Two rounds running, I verified against a stale host · `open`
The host loads TypeScript at startup, so a change under `packages/` that it
reads — protocol, sim, domain, persistence — does not reach it until it is
restarted. O-024 recorded this. I then walked into it twice more: the bucket fill
did nothing, and the expand rose did nothing, both because the host was started
before the change.

The good news is that the console **said so both times** and I did not look. The
second time the toast read `axis: Required` — the old schema naming the field it
wanted. That is R-18 working exactly as intended, and the failure was mine for
treating "nothing happened" as a mystery rather than reading the screen.

Standing order for myself: **restart the host as the first step of any browser
verification that follows a change under `packages/`**, and when a gesture
appears to do nothing, read the rejection before forming a theory.

### D-197 — Camera parity, and a turn you can follow · `agreed`
*"Lets keep the GM and Player side in parity by having same key+mouse actions
attached to the same actions for the camera behavior. Add the hints on a panel
and that's it."*

Done, and the parity is **structural rather than remembered**: `cameraAction`
and `CAMERA_HINT` live in `client-core`, both shells call them, and one test
holds the bindings and the help text to each other. The table had pan and zoom
only; it now has the console's turn and tilt, from the same four lines of table.

The table's hints bar shows the travel prompt when there is one and the camera
legend otherwise. One bar, prompt wins — being told what a gesture will do
outranks being reminded how to turn, and the table stays minimal (R-94).

**And the rotation eases.** *"Is there a chance to do the rotation a little bit
smooth? I mean, do a transition instead of a sudden change? It helps to clarify
the rotation."* — exactly right about why: at 90 degrees a cut tells you the view
changed but not which way it went, which is the confusion the compass was asked
for in the first place (D-196). The two fixes are the same fix from both ends.

The stage now keeps a **live** camera easing toward the stepped target, and three
details needed care:

- **The short way round.** 315 to 45 is one step clockwise; the naive version
  unwinds three quarters backwards through the view the GM just left.
  `nearestAngle` picks the equivalent representation nearest the current angle,
  and the angle is kept *unwrapped* so the crossing is continuous.
- **Frame-rate independence**, because `dt` is elapsed seconds. The exponential
  composes exactly under repetition, so 30Hz and 240Hz agree to six decimals.
- **Arrival**, because an exponential approach never lands. It snaps within a
  twentieth of a degree, which is also what stops the compass being notified
  forever.

The compass reads the **live** bearing, not the target's, so the dial turns with
the world. That is why `northBearing` now takes degrees rather than a step:
mid-turn there is no step to speak of.

`pick` was the subtle one. It shares `syncCamera` with `render` so a click
mid-turn hits what is on screen, and it must *not* call the easing step — picks
happen many times between frames, and feeding one a made-up `dt` would tie the
turn's speed to how far the pointer moved.

**A measurement mistake worth remembering:** my first check of this on the
console read the compass as motionless and I nearly reported the console broken.
The camera was turning fine; my sampling loop awaited `requestAnimationFrame`
every iteration and starved React's commit, so the DOM I was reading lagged
behind the scene. The `window.__stage` debug handle showed `yawStep` changing and
the dial mid-turn, which settled it. **When the DOM and the scene disagree,
suspect the instrument** — and sample with a timeout rather than a tight frame
loop when the thing being measured is React-rendered.

### D-198 — North points up, so the grid's axes are the intercardinals · `agreed`
*"Can we call North what right now is North-West? Because it's the original
rotation, and that way North 'points up'. Would that imply any issue?"*

Yes to the rename, no real issue, and it fixes something that was already wrong.

North is now the `(-1, -1)` diagonal of the cell grid. The consequence is not a
side effect to be tolerated, it is the interesting part: the camera is 45 degrees
off the grid **on purpose** (R-31) so the ground reads as a diamond, which means
the grid's *axes* are what run diagonally on screen. Something has to be
diagonal. Naming the axes north-east and south-east is strictly better than
having north point into a corner of the screen, because a GM reads "up" far more
often than they read a coordinate.

**And it exposed a lie in the rose.** The buttons used to read North / South /
East / West laid out as a cross — but "East" is `+X`, which at the default view
extends the map toward the *upper right*, not the right. The label and the arrow
of the eye disagreed. Now the four buttons are NW / NE / SW / SE at the corners
of a square, which is exactly where each one pushes the edge on screen, with the
footprint centred over them. The rose is a small picture of the map.

Nothing else moved:

- **No data.** Direction names live in the `Expand` type and the intent enum;
  neither is persisted. Maps store an origin, a size and blocks, all in cell
  coordinates, which are untouched.
- **The bearing is still derived.** `northBearing` becomes `yaw - YAW_OFFSET`,
  and the derivation is in the comment: projecting `(-1, -1)` onto screen-right
  and screen-up gives `atan2(sin y - cos y, sin y + cos y)`, which is `y - 45`.
- **The compass grew ticks** on the intercardinals, since those are the only
  directions a map can be extended toward. Four more letters would not fit at
  64px; four marks do.

A test now pins the pair that would be invisible if swapped: `-Z` is north-east
and `+X` is south-east, at every yaw step. Getting those the wrong way round
would send the map off in a direction the GM did not click, and the rose would
still look plausible.

### D-199 — A live map was holding 1792 blocks it said were not there · `agreed`
Found while verifying D-198, in the GM's own church map. Its stored footprint was
`origin {0, 0}, size 64x64`; its blocks ran from -16 to 47 on both axes. So the
size was right, the blocks were right, and the **origin had gone missing** —
leaving 1792 cells of floor outside the map's own bounds.

That is not cosmetic. `inMap` rejects anything outside the footprint, so a
quarter of that floor was visible and **un-editable**: erase refused it, paint
refused it, and a bucket fill would not cross into it. The GM would have hit this
as "that part of my map is stuck", with no message to explain why, because from
the host's point of view nothing was wrong — it was correctly refusing edits
outside a map that had lied about its own size.

**I could not determine which build produced it.** Both committed versions of
`mapToJSON` write the origin and both readers parse it, and the growth that would
have set it is refused by any mismatched host. My honest position is that I do
not know, and the archaeology was costing more than the fix.

So the fix is a guard rather than a patch: R-157, at the read boundary, repairs
the footprint from the blocks. **Slide** when they fit inside the declared size —
which is what this case needed, and what recovers the GM's map exactly as they
grew it — **widen** only when they genuinely span more, and **never shrink**,
because a map dug hollow still owns its ground.

Two tests carry it: the exact state found in the wild, and the invariant that
growing in any direction, or any two in sequence, never leaves a block outside
the footprint. The second is the one that matters going forward — if the cause
was in `growMap`, it now cannot recur silently.

The lesson for me is smaller and duller than the bug: in the previous round I
checked this map's `origin`, `size` and block *count* after growing and undoing,
and all three looked right. I never checked whether the blocks were **inside**
the footprint. A count is not an invariant.

### D-200 — The party goes in, and the table finally sees a map · `agreed`
Round B, and the answer to D-184 after four rounds of deferral. The GM's brief:
*"when a GM open a map, the party goes in, they will see what the tokens can
see, so the GM will need to add the tokens in the future when the scene is ready,
once they are in, we should keep them (like the world map, that has a different
behavior for the initial state when there is no party in the map)."*

**What the range is for, and what it is not.** Two layers, and this round builds
the outer one:

- The **range** decides which *levels* the table is shown at all. GM-authored
  cuts, GM-chosen band. Built now.
- **Vision** (R-40 to R-45) will decide which cells *within* those levels the
  party has actually seen. It narrows and never widens: a token will never see a
  level the GM has cut away.

So "they will see what the tokens can see" is the destination, and until tokens
exist the honest intermediate is that the table is shown the band — which is
precisely what R-146 always said the range was for. This round is not a
placeholder for vision; it is the layer vision sits on.

**Open is not inside.** The GM's sentence describes running a scene, and taken
literally it would have broken prepping one: the enter guard requires the place
to be Revealed, so if opening *were* entering, a GM could not open a tavern the
party has not found — which is how every map in this campaign was built. So they
are separate, and opening takes the party in *when it can*. The common case is
the GM's sentence; the prep case still works; and the map panel says which state
it is in rather than leaving the GM to infer it. Closing the map does **not**
bring the party out — the console going back to the world is the GM looking
around, not the party leaving the room.

**One predicate, two users.** `isPoiOnTable` is what the boundary uses to decide
whether the table receives a point of interest, and what the enter guard uses to
decide whether the party may be taken into it. Written once, so "you cannot walk
them into a room they cannot see" cannot drift from "the table gets this".

**The table is told nothing; it is *shown*.** It finds the open map by looking
for the one point of interest that came with a body. There is no "you are in
tavern X" field to misread, and no room it could draw that it was not given.

**The initial-state difference the GM asked for** is where tokens will go. On the
world map the first gesture *places* the party because there is no pawn to pick
up (D-167); inside a map, the analogous thing is a token that is not there yet.
For now entering is the whole of it, and `inside` is the shape a token round
slots into.

Three things the compiler and the tests caught on the way, each worth a line:

- **A save change with no write.** My three new branches mutated the save and
  never emitted `saveSave`, so entering a map would have looked right and been
  gone on reload. `commitSave` was a closure inside the discovery handler; it is
  now module-level, because the second caller for it nearly shipped without one.
- **`pruneInside` sat unused** until the compiler said so — the prune I had
  written for exactly the case of deleting a point of interest under the party's
  feet was never wired to the open boundary.
- **One written shape, one tolerated shape.** `MapJSON` is what is always
  written; `MapJSONIn` is what may arrive, with `origin` and `planes` optional.
  Neither absence needed a schema bump for D-187's reason — an older file says
  what it means — but a single type carrying both directions was what made the
  compiler shout about `exactOptionalPropertyTypes`, and it was right to.

### D-201 — The band belongs to the map, not to the party · `agreed`
*"I can't make the levels work, I can add steps, but then I can't use them."*

My bug, and a plain one. I put the range **inside** the party's location in
D-200, and then disabled the only control for it whenever the party was not
there — so a GM who cuts a map while building it, which is the main reason to cut
one, found the selects greyed out with a hint telling them to take the party in.
On a map the party cannot see yet, that was unreachable by construction.

The reasoning that led there is worth writing down because it was *nearly*
right: a range is only meaningful while somebody is looking at the map it cuts.
What I missed is that the GM is somebody. The console **fades by the range**
(D-182), so the cut has an effect the moment it is set — it is how a GM works on
one floor of a three-floor building without the other two in the way. I even
wrote "prep of the range without the party inside has no observable effect" while
building the fade that observes it.

So the band moved out: `Save.ranges`, keyed by point of interest. Consequences,
all of them improvements:

- **It is settable any time**, from the map panel, party or no party.
- **It persists per map**, so coming back to a tavern finds the cut where it was
  left. I had rejected that in D-200 as speculative; it falls out for free now
  and is the better behaviour.
- **The party walks into whatever the map is cut to**, which is right: the GM cut
  it for a reason.
- **An uncut map carries no entry**, so the record does not fill with defaults.
- `pruneRanges` drops the band of a deleted point of interest, and — the second
  time in two rounds — the compiler is what told me I had written a prune and
  never wired it to the open boundary.

The intent now names the map it cuts rather than reading it off where the party
is, which is also what lets the console cut a map the party has never seen.

### D-202 — Levelling is a toggle, and it forced a real bug into the open · `agreed`
*"Instead of applying that shadowing, can we do like 'leveling enabled/disabled
for GM' toggle? Will that affect constructing on places that look as empty but
they are occupied but invisible?"*

Both answered: yes to the toggle, and **yes it would have** — which is why the
guard ships with it.

**The toggle.** The console shows the whole body, or the band alone. Off by
default. The fade it replaces is deleted rather than kept alongside: two
mechanisms for one job is worse than either, and a permanently dimmed screen was
a tax on every session to answer a question the GM asks occasionally. Switched
on, the GM sees precisely what the table sees, cut by the same `sliceOf` the
boundary uses — which is a better preview than a dimming ever was, because it is
the same function rather than an impression of one.

**And the hazard the GM spotted.** It was real, and worse than they put it.
`setBlock` in the domain *replaces* whatever is at the cell, because that is what
the paint brush needs; build and paint shared the intent. While every block was
drawn this could not bite — a face you can see has air in front of it, so
build's target cell was always empty. Hiding levels breaks that guarantee: a ray
passes through what is not drawn and lands on the far side, so the cell "in
front" of a visible face can hold a block a level down. The GM would have clicked
bare floor and silently repainted something invisible.

Three things now stop it, and only the first is really about levelling:

1. **The band is a slice, not a dimming.** Hidden blocks are absent from the
   scene, so they are not pickable. A dimmed block is still clickable, which
   would have been the same bug with extra steps.
2. **Build and paint became separate intents**, each refusing what the other is
   for: *"there is already a block there"* and *"there is nothing there to
   paint"*. That is a fix independent of levelling — it removes a silent
   overwrite that was always wrong and merely unreachable.
3. **A placement outside the band is refused while levelling**, because the cube
   would be placed and then vanish. Client-side, since the band matters only to
   a GM who has chosen to be shown it; the readout says so before the click.

A fill also now reports how much of its reach is out of sight, because connected
material runs through a cut and the count was the only thing telling the GM how
far a click would go.

The GM's question is the kind worth answering with code rather than care: "will
this let me edit what I cannot see" has one acceptable answer, and it is not
"be careful".

### D-203 — Digging: the modifier, not the offset and not the camera · `agreed`
Three designs were on the table for "I need space below what I have already
built", and the two that lost are worth recording because each was reasonable.

**Offsetting the whole map — rejected.** Shifting the body upward to make room
renumbers every block, and R-150 already refuses that sideways for one reason:
saved references rot. Vertically it is worse, because three kinds of stored Y
would have to move together — block keys, cutting planes, and the saved band —
and any one missed silently moves geometry relative to whatever was pointing at
it. It also invalidates every height the GM knows by heart. Negative Y costs
none of that: nothing renumbers, planes keep their heights, the band keeps its
bounds, and a cellar at -1 matches how buildings are actually numbered.

**A 180-degree camera — rejected, but not wrong.** The GM's idea: let the
console tilt below the horizon, see undersides, and place against them with no
new affordance at all. It works geometrically — `faceOf` already handles any of
six normals — and that elegance is real. What sank it was the freight: the
compass would read exactly backwards below the horizon (screen-up in the ground
plane is scaled by `sin(pitch)`, so its sign flips); undersides are lit by
ambient and a near-black hemisphere ground colour, so the GM would be clicking
faces they can barely tell apart; the world map is single-sided and vanishes
from beneath; camera parity (R-156) hands all of that to the table as well; and
the pass through the horizon is an edge-on frame of a flat plane.

The deciding argument was not the freight, though. **Both ideas solve the same
single step** — creating the first block below — because even with a camera
underneath, the sane way to build a cellar is to make one block, cut the band to
that level, and look down at it normally. The levelling toggle (R-159) was
already half of this feature. Looking from beneath remains worth having as
*inspection*, judged on that merit, some other day.

**What shipped, and the GM improved it.** My proposal was a fifth tool; theirs
was Alt/Option as a modifier on build, and it is better for a reason I had
underrated: the ghost outline already exists, so pressing the key *shows* the
change. The wireframe drops under the cube and comes back on release, with the
pointer stationary — the modifier teaches itself in one press, no fifth button,
no mode to leave. Their phrasing settled the semantics too: *"it doesn't care
about the face, it cares about the cube."*

Three details that needed care, none of them obvious from the idea:

- **Re-aim on the key, not the pointer.** The outline has to move while the
  mouse is still, so the last pointer position is remembered and the pick is
  redone on keydown and keyup. Without it the GM holds Option, nothing happens,
  and the modifier reads as broken.
- **Clear on blur.** A window that loses focus mid-press never sees the keyup.
- **The floor moves.** The band's lowest step was the constant 0; it is now the
  deepest block, derived and clamped at zero, so an undug map is unchanged and a
  dug one can be cut to its cellar.

### D-204 — Sky, water level, bedrock · `agreed`
*"Floor and Sky are the limits. What if we do the initial groundstone at 0, we
call it waterlevel, and we have two unmovable levels called sky and hell (or
something that illustrates 'the bottom')."*

Right, and it fixes something D-203 had just broken. Once a map could be dug,
the lowest step became *the deepest block* — so "Floor" slid downward as the GM
worked, and zero, the height every map's starting ground is laid at, stopped
having a name at all the moment anything went beneath it. A label that means a
different height on Tuesday is not a reference point.

Three fixed steps now, and a plane may sit at none of them for the reason a
plane may not sit at a bound: it is already a step. A plane **may** sit
underground, which it could not before.

**On "Bedrock" rather than "Hell".** It is literally what the level is — the
floor you cannot dig past — it is the established word in voxel builders, and it
reads the same under a tavern as under a dungeon, where Hell presumes a
cosmology the GM may not be running. "Water level" kept as the GM named it; it
is the datum, and on an island map it is also literally true. The names live in
`domain` beside the rules, not in the console, because they are vocabulary
(D-176's lesson) — the code should say the word the GM says.

**A bug the change surfaced.** With a datum at zero, `snapRange`'s
never-select-nothing rule started handing back the wrong band: pinching both
handles at water level opened *downward*, into the underworld, which is empty on
almost every map. The old rule said "downward, or upward at the floor", and the
reasoning behind it was arbitrary when I wrote it. It is now upward — a band is
named by the step it sits on, so pinching at water level gives the storey above
— with downward only at the ceiling, where there is no up. The test that caught
it was one I had written asserting the arbitrary behaviour, which is a fair
warning about tests that encode a coin-flip as if it were a decision.

### D-205 — The level ladder · `agreed`
The GM drew it: a vertical axis capped at Sky and Bedrock, a rung per level with
its name, its height and a delete, and two round handles marking the band. Which
is R-146's original brief — *"a double range slider, where the GM can specify
the steps/planes by presetting their Y values"* — finally built. Two selects and
a list were the placeholder.

**Their drawing corrected me.** It showed water level with an ✕, like any other
level. I had pinned zero as a third immovable step in D-204; re-reading what
they actually asked for — *"two unmovable levels called sky and hell"* — they
never said that, and the sliding-floor problem stays fixed either way because
Bedrock is the anchor. So water level is a plane a new map simply starts with,
renameable and deletable. A dungeon has no use for it.

**Two things from the drawing I did not build, with reasons:**

- **The ☰ grips.** The axis is evenly spaced, which is right — proportional to
  height would put a roof at 3 and a water level at 0 six percent apart and
  overlapping. But on an ordinal axis a drag has no defined result: if Roof is
  dragged below Water level, what height did it land on? Y is a real height, not
  a position in a list. The number input is exact and was already in the
  drawing.
- **Dragging the band handles.** Clicking a rung moves the *nearer* handle,
  which needs no drag, cannot invert the band, and is one gesture for both ends.

**And building it found a live bug.** `snapRange` pulled *both* bounds onto the
nearest step on every change. The ladder sends both every time, so moving the
top handle re-snapped the bottom — and the GM's own band, which started at a
level left off-step by an earlier change, was silently dropped by a click at the
other end of the ladder. Their party would have lost sight of the cellar.

Snapping was designed for a drag, where a handle lands between steps. The ladder
can only produce a step, so the pull had nothing left to do but harm. It is now
`clampRange`: clamp to the bounds, order the two, open a band that would select
nothing — and never move a handle that was not touched. Verified end to end by
adding a plane, banding to it, deleting the plane to strand the band off-step,
then moving the other handle and watching the stranded bound survive.

Two smaller things the build turned up, both mine:

- `.tiny` was scoped to `.row input.tiny`, so the ladder's height inputs came
  out full width and squeezed every name to nothing.
- Wrapping the knob in a `Tooltip` added its wrapper as a third row of the
  rail's grid, putting every knob exactly half a row below the level it marks.
  A native `title` stays where it is put.

### D-206 — The ladder, reworked after the GM used it · `agreed`
*"It doesn't work well, and it looks bad. See that the range has only 1 knot
(the bottom one), and if I tap on cimientos, level 0 disappears. The overall
functionality is odd."*

Fair, and the two screenshots showed three separate failures rather than one
rough edge:

1. **A handle on a bound vanished.** The cap's flat marker and the handle's ring
   were the same element, so whichever style won, won. With the top handle
   resting on Sky the band appeared to have one end — which is exactly what the
   GM saw and said.
2. **Rows came and went.** `Level 0` existed only because the band rested there;
   tapping another level moved the band and the row evaporated. A list that
   rearranges itself as you touch it reads as broken.
3. **Nothing said what was draggable.** Clicking a row moved the nearer handle:
   fine once known, unguessable before, and unreadable with one visible knob.

**The root cause was an invariant I invented in D-205** and then made the UI
cope with: I let a band rest between levels, so the ladder had to grow a ghost
row to show where it was. The fix is to make that state impossible.

A band now **always rests on a stop**, and the rule is kept where the stops
change: adding, moving or deleting a level settles the band onto the nearest
remaining one. That is a visible consequence of a deliberate edit, which is
quite different from what D-205 was right to forbid — a band moving because of
an unrelated click. An ordinary band change is still clamped and never pulled.

With no state to display, the ghost rows go, the list stops moving, and every
row is a place the band can be. Then the handle can draw *over* its row's
marker rather than replacing it, and the handles can **drag**, which is what
"double range slider" meant in R-146 all along.

Existing bands are settled once at the read boundary (R-137a). The GM's own was
at -2, a height left over from an earlier change; it now rests at Cimientos to
Roof, the nearest legal equivalent.

Two smaller notes:

- The rows were also just heavy. Names now read as text and only show an input
  box on hover, which is how the GM drew them: plain names, numbers in pills.
- While verifying I saw the band read `{1,32}` once and could not reproduce it.
  Two clean runs from a known state give the right answer, so I have recorded
  the observation rather than a cause I would be guessing at.

### D-207 — A trace channel, because the ladder crosses five layers · `agreed`
*"Now it looks perfect, but still works weird. Will adding some logs be
helpful?"* — yes, and it is the only honest answer available. The band is not
local state: a handle moves only after a pointer event, a row hit-test, an
intent, a socket, the host's store, a domain rule and a view push. Six places a
gesture can go wrong, and the screen shows the same thing for all six — the
handle simply did not go where it was put.

So each step prints itself, in order, with a sequence number and a clock,
because the question is nearly always *what happened between these two things*.
Three lines are doing real work beyond narration:

- **`⇒` and `⇐` are paired and timed.** If a request gets no answer within half
  a second the trace says so. An intent the host quietly refuses looks exactly
  like a gesture that missed, and that pair is what tells them apart. Refusals
  are traced at the socket too (O-025's lesson: the console said so and I did
  not look — now it says so where the gesture is).
- **A move with no button held is called out.** That is a drag whose release
  was never seen, and from then on the band follows the bare pointer.
- **A click is timed against the end of the last drag.** A click fires on
  release and a drag ends in a release, so a click landing in the ladder right
  after a drag is a second gesture the GM did not make.

Those last two are guesses about the bug, written as questions the trace can
answer rather than as fixes. Fixing on a guess while adding the instrument
would leave us unable to say which one it was — and the GM asked to confirm the
logs match what their hands did, which only works if nothing else changed.

On by default. A trace you have to switch on is off when you need it, and this
one costs nothing when there is nothing to print. `__trace = false` silences it.
It stays as long as it earns its place; the moment it is narration, it goes.

### D-208 — Two bugs the trace caught in one gesture · `agreed`
The GM dragged the bottom handle from Roof to Bedrock. It landed back on Roof.
D-207's trace printed the whole gesture, and there were two separate faults in
it — neither of which could have been guessed from the screen, and one of which
was the *opposite* of what it looked like.

```
010  grip drag: lower crosses into Bedrock (-16)
011  ladder ⇒ drag — lower to -16
012  ladder ⇐ band: 0 → 32          ← asked for -16, told 0
013  grip up — the lower end let go at -16
014  ladder click
015  ladder tap on Roof (3)          ← a tap nobody made
016  ladder ⇒ tap Roof — lower to 3
```

**Line 012 — the drag worked, and the console misread its own success.** A band
that reaches both bounds *is* the whole map, and `withRange` stores an uncut map
as **no entry at all**, so the record does not fill with defaults. That is
sound, and it makes "no entry" a value every reader has to supply for itself.
The host supplied floor-to-sky. The console supplied **zero** to sky — correct
until R-160 let a map be dug, and never revisited, in four separate places.

The fix is not to correct the second answer but to delete it: `WHOLE_MAP` is the
value, and `rangeIn` reads the sparse record the wire carries so a console never
supplies a default at all. Worth being straight about the tests: the ones
asserting the contract would have passed *before* this fix too, because the bug
was a duplicate constant in a component, not a wrong rule in the domain. Only
the test of `rangeIn` — the console's actual read path, now that it has one —
fails against the old behaviour. A duplicated constant is not caught by testing
one of the copies (R-23b, again, and the same lesson as the POI-id fixture).

**Lines 013–016 — a click nobody made.** Exactly the suspect D-207 wrote down,
confirmed at one millisecond. A click fires on release; a drag ends in a
release; React reuses the row's `<button>` as the handle moves, so releasing
after a drag fired a click on the row the drag *started* from, whose job is
"bring the nearer end here".

Suppressing that click would have worked and would have been a patch on a
design mistake. The real error was having two gestures at all — a drag on a
handle and a click on a row — for one idea. So there is one now: **pressing any
row takes hold of the nearer handle and starts dragging it.** On a handle that
is the handle itself, since nothing is nearer to it than itself; anywhere else
the handle comes to meet you and you are already dragging. One button per row
rather than two, so React has no pair to swap handlers between. Nothing listens
for a pointer click, so the phantom cannot return — and `e.detail === 0` keeps
keyboard activation, which is a real click and the only one the ladder answers.

`grabEnd` came out of the component while doing it (R-23b): it decides the
outcome of every press now, which is far more than it used to.

**On the instrument.** D-207 wrote two guesses down as questions rather than
fixing them. One was right, one never fired, and the third fault was one I had
not thought of at all — the console disbelieving a correct answer from the host.
Worth remembering the next time it seems faster to fix the guess.

### D-209 — The trace comes out, and two things it was standing in front of · `agreed`
D-207 said the trace stays as long as it earns its place. It earned it twice —
D-208 is two bugs it caught in one gesture — and the ladder now works, so out it
goes. Kept in the history, not in the console.

Worth the note on what it cost: nothing to run, and it was written in about the
time one more wrong theory would have taken. The thing that made it pay was
pairing `⇒` with `⇐` and timing them. Both bugs were visible as a *mismatch*
between what was asked and what came back, which no amount of staring at the
result could show.

Two fixes the GM spotted once the behaviour stopped distracting from the look:

**The rail ran on below Bedrock.** The rule meant to stop it read
`.ladder li:last-child .rail i:last-child`, and the rail's last child is the
*handle*, not a segment — so it matched nothing, at either end. `:first-child`
worked by luck, because the first segment really is the rail's first child.
`:last-of-type` is what both wanted. A selector that silently matches nothing is
the CSS version of a test that never runs.

**"Cut" and "Keep" wrapped onto a second line.** `ConfirmDelete` has taken the
row's other actions as `children` since R-151, precisely so the question can
have the whole row — and the ladder passed it nothing and rendered the height
input beside it instead. Four columns, five things. Now the height goes inside
the question and steps aside while it is asked, which is what the component was
built to do; the ladder's compact button sizing just needed to cover `.danger`
as well as `.quiet`.

### D-210 — Three corrections to the dock, one of them mine for being clever · `agreed`
*"We have been using 'Delete' not 'Cut'."* Quite right, and the annoying part is
that `ConfirmDelete` already defaults to "Delete" — I passed `confirmLabel="Cut"`
because it read well beside a *cutting* plane. That is the whole bug: a word
invented at one call site, for flavour, against a default that existed to keep
the app saying one thing. The prop stays for a case that genuinely is not a
delete; the ladder no longer is one.

**The footprint gets a row.** The size sat absolutely positioned over the middle
of the rose, legible only by text shadow and landing in the seam between four
buttons. Given a row of its own between the two pairs, it is simply the middle
of the rose and needs no trick to be read. Placing it explicitly also lets the
four buttons auto-place around it, so the markup did not have to be reordered.

The buttons were also hugging the left of their cells rather than filling them,
because the grid items are `Tooltip` wrappers and the wrapper hugs its child
unless told otherwise. `stretch` has existed for exactly this since R-115 and I
did not pass it — the second time this round that a component's own answer was
sitting unused (see D-209's `children`).

**`.lbl` had no base rule.** Three callers used it; two of them — "Expand the
map to:" and the place inspector's "marker" — were rendering at the browser's
default 16px, which is what made them look like body text in the wrong font. The
two scoped overrides (`.connect .lbl`, `.ladder .lbl.at`) had quietly carried
the class for so long that the missing base was invisible. A class with no
definition is not a style, it is a hope.

One deliberate consequence: the ladder's two fixed heights, 32 and -16, now pick
up the base and read quieter than the editable ones beside them. That is honest
— they are the only two a GM cannot change.

### D-211 — Four tools become two, and gain a brush · `agreed`
The GM's design, near enough verbatim: *"I think we can have just 2 tools.
Build: has 3 sizes, 1x1, 3x3 and 5x5 (so we keep the center cube always), hold
ctrl switches to erase mode (new thing: turns the wireframe red), alt+click will
do the building down. Paint: has 3 sizes… shift+click will do the fill. For both
I will love to have the wireframe resizing when the brush changes."*

Agreed as designed, with one substitution and three details it did not cover.

**Ctrl became Shift.** macOS delivers Ctrl+left-click as a *secondary* click,
and this console already spends the secondary button on panning the camera — so
Ctrl+click in a map would have started a pan and opened a context menu on the
very machine the tool is being built on. Shift is safe everywhere and gives both
tools the same vocabulary: Shift is the tool's other mode. Alt keeps its one
meaning, downward.

**The brush is a radius, not a size.** "So we keep the center cube always" is a
requirement, and a radius makes it arithmetic: there is no radius that produces
an even brush, so nothing has to remember the rule. The world's terrain brush
counts cells and puts size 2 off-centre — genuinely a different thing, sharing
its keys and nothing else, and said out loud rather than quietly unified.

**A patch lies in the plane of the face.** The GM asked for sizes and for the
outline to follow them; neither says which way a 5×5 faces. Flat on a rooftop
and upright on a wall is what "painting the wall" means — a fixed pair of axes
would have reached five blocks into the building instead. Digging is flat
whichever side was hit, because it is aimed at the cube and not the face.

**One intent per gesture.** The part with the most consequence and the least to
see. Twenty-five cells sent one at a time would be twenty-five undo steps for
one click — a GM who erased a 5×5 by mistake pressing undo twenty-five times —
plus twenty-five writes and twenty-five broadcasts to the table. So the cells
travel together.

They travel as *cells* rather than as a radius and an axis for the host to
expand, and that was the call worth thinking about. The console has to know the
exact cells anyway, because it outlines them; deriving them again at the host is
two chances to disagree about which cube the click edits, and the outline being
the edit is a property this code has leaned on since R-147. The host still
checks every cell — footprint, bounds, occupied, empty — exactly as it did when
each arrived alone, and the list is capped at the widest brush at the edge. The
list buys one undo; it buys no trust.

It also keeps the band clip where the band lives. Whether the GM is levelling is
their own view state and never crosses the wire (R-84), so a host expanding a
radius could not have known to stop at the cut — it would have needed a flag
saying "confine this", which is view state with a hat on.

**Clip, do not refuse.** The last detail, and the one that decides whether a
wide brush is pleasant. Cells already built, cells past the edge of the map,
cells past the band: skipped. A refusal fires only when there is nothing at all
to do. Refusing a 5×5 because one of its twenty-five was occupied would make the
brush useless exactly where a GM most wants it — up against what they have
already built.

Verified by 611 tests, including the patch's shape on every face, the clipping,
the one-undo property and the edge's cap. **Not** verified on screen: the GM had
the console's seat while I finished, and taking it would have made their own
window a viewer (R-127). The resizing outline and the red tint are the two
things a test cannot show, and they are the GM's to confirm.

### D-212 — The outline is white again · `agreed`
*"The current material color makes it difficult to see."*

My addition, not the GM's, and wrong for a reason I should have seen before
offering it: a cube goes down **against cubes of the same material**, so an
outline tinted with the material disappears into exactly the surface it exists
to stand out from. The idea was that the GM would see what they were about to
lay down before clicking — but the material is already named and swatched in the
palette two cards above, so the tint was answering a question nothing was
asking, at the cost of the one job the outline has.

White for building and painting. **Red stays for erase**, which the GM asked for
and which works for the opposite reason: it is not a material, so it cannot
collide with one, and contrast is the whole point of it.

### D-213 — The brush is flat, always · `agreed`
*"What it looks weird is the tool lying flat on a roof but upright on a wall. I
would rather do always a flat."*

Following the face was my call in D-211, and it reasons well on paper: a brush
should lie on the surface it is pointed at, the way a roller does. In the hand it
is worse, and the GM named why without needing the theory — **the outline changes
orientation as the pointer crosses an edge.** One gesture means two shapes
depending on which pixel you happen to be over, and you find out after the
click. A brush that is always flat is one shape and one level, every time.

What it costs: a wall is no longer built by brushing its face. It is built by
laying flat courses, which is what the gesture was already doing on a rooftop,
and is at least the same answer twice.

Two things fall out of it, both simplifications:

- **`faceAxis` is gone**, along with the axis parameter. The patch's shape no
  longer depends on the pick at all, so there is nothing to derive and nothing
  to get wrong.
- **A patch cannot straddle a cut.** Every cell shares the anchor's height, so
  the band admits the whole gesture or none of it — which is precisely the check
  `mapAllowed` used to make for itself before R-162 moved it into the patch.
  Clipping is still how it is expressed, and it is now exact rather than partial.

Asked in the same breath and worth recording, because it is the kind of thing a
GM should be able to trust without testing: **a build skips, it never
overwrites.** A 5×5 over half-built ground fills the empty cells and leaves
every standing block exactly as it was, material included. It refuses only when
all twenty-five are occupied. Paint is the mirror — it repaints what is there
and conjures nothing. That was R-162's "clip, do not refuse", and the panel now
says it out loud rather than leaving it to be discovered.

### D-214 — A field is finished before it is an edit · `agreed`
*"When you try to edit the levels' `y` value, it's validating on change, so I
can't clear a value and write a new one."*

Exactly right, and I had this one written down as a suspect while the trace was
in and never went back for it — the note said "typing over `1` to make `12` may
send a move to `1` first". It does. Worse: clearing the box puts an empty string
through `parseInt`, which is not a number, which is refused, which puts the old
value straight back. The field cannot be typed into at all.

A draft now lives in the field until the GM leaves it or presses Enter, and is
validated once, on the way out. Escape abandons it.

**Widened past what was asked, deliberately**, because the same code was in five
other fields and two of them are worse than they look:

- A **name** could not be cleared either — backspacing to empty is refused, so
  it snapped back. Every place, point of interest, party member and level name.
- Every keystroke was **its own undo step** (R-140a). Renaming a place cost as
  many entries as the name had letters, and the history is bounded, so a long
  name quietly pushed real edits off the end of the undo stack. That one is
  invisible until the moment a GM needs it and it is gone.

Left alone, and flagged rather than half-fixed: the party's **colour** picker,
which has no clearing problem but does dispatch continuously while the picker is
open, so it has the undo-spam half of the same bug. A colour input does not blur
when the OS panel closes, so commit-on-blur is the wrong shape for it and it
needs its own answer.

`DraftInput` is a primitive rather than a convention. "Every field" is a rule,
and a rule kept by remembering to type it lasts until the next field. Its single
decision — does this finished draft become an edit? — is a pure function beside
it, since `@tt/ui` has no DOM to test a component in (R-23b): a field tabbed
through, or typed into and put back, must not dispatch.

### D-215 — Brushes become named shapes, and two of them stand up · `agreed`
*"They are actually 1x1x1, 3x3x1 and 5x5x1, they should be called 'Cube', 'Flat
3x3' and 'Flat 5x5', and then add columns. Because I found that building new
levels, or walls make them a basic need."*

Agreed, and the renaming is the smaller half. The GM is right that the old names
described two of the three dimensions and quietly dropped the one that turned
out to matter — and they only noticed because they went to build a storey and a
cellar, which a flat square cannot do.

**A radius could not describe a column**, so the brush stopped being a number.
It is a small registry now — id, name, `span`, `rise` — which is the shape
materials and markers already have, and for the same reason: another brush is a
line rather than a change. `span` is odd by construction, so "the centre cube is
always covered" stays arithmetic rather than becoming a convention again.

**On the names.** Kept as the GM wrote them, with one change: `Column 2` and
`Column 3` rather than `Column ×2`. In a list where `3×3` means dimensions, `×3`
means a multiplier, and two senses of one symbol in five adjacent buttons costs
a beat on every read. Trivial to put back if the GM prefers theirs.

**One thing the request did not settle: which way a column grows.** Upward,
except under Alt, where it goes down. That falls out of what Alt already means —
*downward* — and it makes one shape do both jobs the GM named: a column raises a
wall, and the same column under Alt sinks a shaft for the cellar. Growing *from*
the anchor rather than centred on it, because a wall grows from where you
clicked; centring would bury the bottom of every column in whatever it stood on.

**It brings back partial clipping**, which D-213 had just removed. A flat patch
is one level and the band admits it or refuses it whole; a column spans two or
three and so can straddle a cut, where it lays down what fits and stops. The
refusal is unchanged and still exact: an empty patch means the cube being aimed
at is outside the band, because a column grows *away* from the surface it was
aimed at and so can never reach back in from outside it.

### D-216 — A colour commits when it stops moving · `agreed`
*"Can we submit the color on mouse click release?"* — the right instinct, and
the one thing that cannot be written as written: **the release is not
observable.** A colour input opens the operating system's own panel, which is a
window rather than part of the page. Dragging in it streams events at the
element; the mouse-up that ends the drag is delivered to that window and never
reaches here, and the element does not reliably blur when the panel closes.

So the commit is measured from this side instead: a quarter-second with the
colour holding still. That is the same event — a GM dragging through a gradient
produces a change every few milliseconds, and a GM who has chosen produces none
— and it has the advantage of not depending on which of `input` and `change` a
particular browser decides to fire for colour inputs, which they disagree about.
Blur still commits immediately, because tabbing away is unambiguous.

The decision itself is `DraftInput`'s, reused rather than rewritten: a drag that
wanders around the wheel and lands back on the colour it started from is not an
edit, and must not cost an undo step. That was D-214's rule and it did not need
a second one.

This closes the field left open in D-214, which flagged the colour picker rather
than half-fixing it on the way past.

### O-026 — The `{1,32}` band was never a bug · `closed`
D-206 recorded an observation rather than a cause: while verifying the ladder I
read a stored band of `{1,32}` once — bottom on Cimientos, top on Sky instead of
Roof — and could not reproduce it across two clean runs.

Closed, on the GM's evidence rather than mine. They have since built a
9,714-block church across three named levels, moving the band constantly, and
report the state is kept correctly. The dull explanation was almost certainly
the right one: I had been dragging handles in that same session and read the
file after my own drag to Sky.

Left here because an open note that is actually settled is worse than no note —
the next reader would treat it as a live concern and go looking. The lesson
worth keeping is the one D-206 already drew: record what was observed, not a
cause invented to explain it, and let it close when the evidence arrives.

### D-217 — One cube cost half a megabyte · `agreed`
The GM asked for metrics before any visual work, to find out whether what we
build is cheap. The first thing measured made the question moot, so it is
recorded here rather than discovered later with an overlay.

**Every accepted intent rewrote the whole campaign and pushed it to every
screen.** For a campaign with one 9,714-block church:

| | before | after |
| --- | --- | --- |
| `campaign.json`, written every intent | 354 KiB | 1.3 KiB |
| `world.json`, written every intent | 143 KiB | only when terrain changes |
| each map body | *inside the manifest* | 4.2 KiB, its own file |
| broadcast to each screen | ~270 KiB | ~6 KiB |

A twenty-cell paint drag was about **10 MB of disk writes and 10 MB of wire**
for twenty cubes — synchronous on the host's event loop, with the broadcast
queued behind it. It scaled with how much the GM owned rather than with what
they had edited, which is the wrong shape to leave in a tool somebody is
building a world with.

**Both fixes were already written down and neither was built.** R-60 specified
one file per map and "editing one part rewrites one file"; `save` wrote every
file every time. R-59 specified packed bodies and even did the arithmetic —
*"one JSON entry per cube is 10–35 MB"* — while every cube was a JSON entry.
The module's own header stated the property it did not have. Worth saying
plainly: a comment describing an intention is indistinguishable from one
describing behaviour, and this one was wrong for long enough to matter.

**The GM asked the right question before building: is the *how* still right?**
It half was. Measured on the real church:

| encoding | size |
| --- | --- |
| JSON, one entry per cube | 257.9 KiB |
| JSON + gzip | 25.4 KiB |
| sparse binary, 7 bytes a block | 66.4 KiB |
| **palette + run-length** | **4.2 KiB** |

So packing was right, and **chunking was wrong** — R-59's per-32³ chunks
predate `MAP_PATCH` and the dig limit and align with neither. These maps turn
out to be flat storeys: the church fills 15 of 48 levels. One continuous stream
collapses the empty ones into single runs for free, scans nothing, and needs no
index. Chunking buys partial loads, which one file per map already made
unnecessary.

Two choices worth keeping:

- **Encode from the sparse keys, not by walking the box.** Cost proportional to
  what was built rather than to how far the map reaches. The box grows with
  every expansion; the content does not.
- **Repair the footprint before packing, not after reading.** A run stream can
  only describe cells inside its own box, so a block that strayed outside the
  declared footprint would be dropped on the way *out* — before the repair that
  used to catch it on the way in. That is D-199's bug arriving by a new route,
  and it is closed by computing `enclosing` first.

**Migration.** No schema bump: a map in the manifest and a map in a file are
the same map, and the absence of one says where to find the other (D-187).
A body with `blocks` and no runs is read as it is and written packed from then
on. R-144 refuses older schemas outright, so a bump here would have made the
GM's church unopenable — which is the sort of thing worth checking before
reaching for a version number.

Verified on the GM's own campaign before anything was committed: 9,714 blocks
and 256 blocks, loaded from the old layout, saved, reloaded, compared cube for
cube. Identical.

**What this does not fix.** The GM's view still carries every map in the
campaign, so the broadcast is still linear in how many maps exist — at twenty
places it would creep back up. It buys a long runway and probably means we
never need a diff protocol, which is the complexity most worth avoiding.
Coalescing writes within a short window is the obvious next step and is now
much less urgent: one cube costs one 4 KiB file.

### D-218 — Thirty citations of a rule that said something else · `agreed`
While checking that I could cite the rules accurately in an explanation, I found
that **R-12 does not say what the code says it says.** It is about there being
one `VoxelGrid` implementation with two brush sets. Thirty places across
`domain`, `sim`, `protocol`, `persistence`, the tests and this file cite it for
*immutability and identity-preserving edits*, which it never mentions.

The property is real and heavily tested — undo depends on it, the store's
file-skipping depends on it, and several tests assert it by name. It simply had
no rule. The mis-citation predates me and I added four more to it this session
without checking, which is the thing I had just written about in D-217: a
comment describing an intention is indistinguishable from one describing
behaviour, and nobody re-reads the rule a citation points at.

So: **R-165** states it, and every citation moved. R-12 keeps its own meaning
and loses the one it was carrying for something else.

Two notes on the fix:

- **The references in this file were corrected too**, though it is append-only
  in spirit. A citation is a pointer, not a claim about what was decided — a
  past entry pointing at the wrong rule is a broken link, and leaving it broken
  to preserve the letter of append-only would make the record less true rather
  than more faithful.
- **It would have been caught by a test.** `docs.test.ts` already checks that
  the playbook cites rules that exist, and these did exist — just not the ones
  meant. Nothing can check that a citation points at the *right* rule, which is
  worth knowing about every citation in this corpus: they are load-bearing
  prose, kept honest only by somebody reading them.

### D-219 — Pack a map once per version of it · `agreed`
*"Why do I get slower by the amount of maps I have, if I can edit only 1 map at
a time?"* — and the answer was that nothing was checking all the maps. It was
**rebuilding** them. `encodeCampaign` packed every body on every intent, and
the GM's view carries every map because the GM may open any of them, so one
cube cost a full repack of the campaign three times over: once for the save and
once per connected screen.

The checking the GM was objecting to — `prev === next` — is twenty pointer
comparisons and costs nothing. Their instinct was right and my explanation had
it backwards.

A `WeakMap` keyed on the map object fixes it, and the key is exact rather than
a heuristic because an edit to one map leaves every other map's object
untouched (R-165). Measured on the GM's campaign, 2 maps and 9,970 cubes:

| | before | after |
| --- | --- | --- |
| `encodeCampaign`, nothing changed | 3.23 ms | **0.09 ms** |
| `viewFor(gm)`, nothing changed | 3.19 ms | **0.08 ms** |
| one cube: encode, both views, serialise | ~17 ms | **0.65 ms** |

That was about one 60 Hz frame of host CPU per cube, synchronous, with the
table's update queued behind it — and it grew with the campaign rather than
with the edit.

**Why observe rather than declare.** The sim knows which point of interest an
intent touched and could say so. That fixes the save and not the broadcast:
`viewFor` is called fresh per socket with no effect object to carry a flag, so
declaring would mean threading "what changed" into the view builder, and then
the one function that decides what each role may see stops being a pure
function of the state. That property is what makes the trust boundary easy to
be sure of. Observing fixes both paths and changes no signature — and a new
intent kind gets it right without knowing the cache exists, where a declaration
can be forgotten.

**What it costs.** Invisible machinery resting entirely on immutability. A map
mutated in place would be served stale and the bug would be miserable. R-165 is
the thing holding it up, which is a reasonable place to stand but worth saying
out loud rather than discovering.

**What it did not fix.** The GM's push is still **153 KiB**, and now almost all
of it is *terrain*: `world.json` is 143 KiB and `encodeCampaign` rebuilds the
chunk grid every time, exactly as it used to rebuild the maps. The same trick
works there and is the obvious next one. The maps are no longer the problem;
they are 4.4 KiB of that payload.

### D-220 — The terrain was the same bug, one dimension down · `agreed`
D-219 fixed the maps and reported honestly that the GM's push was still
153 KiB. Nearly all of it was terrain: a chunk carried **900 copies of strings
like `terrain:grass`**, 126 KiB of a 143 KiB world, to every screen on every
accepted intent — the same per-cell verbosity the bodies had, in a rule that
happened to say "voxel bodies" and so never covered it.

| | before | after |
| --- | --- | --- |
| world on the wire and on disk | 142.7 KiB | **1.6 KiB** |
| the GM's whole push | 153.2 KiB | **12.2 KiB** |
| `encodeCampaign`, nothing changed | 0.086 ms | **0.003 ms** |
| one cube: encode, both views, serialise | 0.650 ms | **0.417 ms** |

Packing *and* the same `WeakMap`, for the same reason as the maps: a chunk's
wire form is built once per version of that chunk, and painting one chunk
leaves the others' objects untouched (R-165). The packing cut the bytes; the
cache stopped the packing being redone nine times a keystroke.

Two things worth recording because they are not symmetric with the maps:

- **A corrupt chunk is read as sea; a corrupt body is refused.** Terrain has a
  value in every cell by definition, so there is an obvious floor and one bad
  chunk should not cost a campaign that may hold twenty good ones. A body has
  no such floor — a map one cube askew looks like the GM's own mistake, so
  refusing is the honest answer.
- **The runs are expanded back into the flat arrays the decoder already had**,
  so the one piece of arithmetic that can shear a world — the re-lay from the
  stored stride into the current `CHUNK_SIZE` — was not touched at all.

It also flushed out a console reading the wire's own arrays to say what was
under the pointer. That now reads a decoded campaign, which the scene needed
anyway, so there is one decode per push instead of two and the readout no
longer knows how a chunk is encoded.

Verified lossless over all 8,100 columns, height and terrain, before anything
was written.

### D-221 — The overlay the GM asked for first · `agreed`
*"Can we add some metrics to every screen? FPS, draw calls, memory usage, I'm
thinking on real data, that might help us to know if what we are building is
cheap or not."*

Asked four rounds ago. I went and measured by hand instead, found that one cube
cost half a megabyte (D-217), and we spent those rounds fixing it — so every
number in this project so far exists because I ran a script and reported it.
That is the wrong arrangement: the GM should be able to see the cost of their
own table, on the machine the players are watching, without me.

What it reports and why those: frame times at p50/p95/worst rather than mean
FPS, because the hitch is what a table sees; draw calls and triangles, free
from `renderer.info`; geometries, textures and shader programs, which are both
a size proxy and a leak detector; the last map rebuild, which is the usual
cause of a hitch; and **the last view's size and how many arrived this second**,
which is the pair that explained everything in D-217 and would have found it in
a minute.

**No library.** stats.js is tiny and well made, and gives FPS, MS and an MB
panel that is just `performance.memory`. It knows nothing of draw calls, of a
rebuild, or of a payload, so most of this would have been written anyway — and
what it adds is a graph widget we would restyle.

**No GPU memory**, because no browser offers it. Worth stating in the rule
rather than leaving somebody to look for the API.

Three placement calls:

- The **arithmetic** is in `client-core` and tested on its own (R-23b). A frame
  counter that is wrong is worse than none: it sends you optimising something
  that was already fast.
- The **frame interval** is measured in the app's render loop rather than
  inside the renderer, because `render` sits below `client-core` in the rings
  and could not use the window helper — and because the interval between
  callbacks is the frame a viewer sees, where the time spent *inside* `render`
  would miss everything the browser does between calls.
- The **hook is duplicated in both apps**, like `use-stage` beside it. Sharing
  it would mean a parameter per difference between the two screens, and
  everything with an opinion in it is already shared.

Verified on the table display, which needs no GM seat: the key toggles it, the
frame numbers are real — 120 fps on that panel, p50 8.3 ms — and traffic is
measured. The GPU counters read zero there because no campaign was open and
nothing was being drawn; they come straight off `renderer.info` and are the one
part not yet seen with a scene in front of them.

### D-222 — The registries were arriving twice · `agreed`
I proposed moving the terrain and marker registries into the `hello` message,
since they are static and were being re-sent on every intent — 5.2 KiB of a
12.2 KiB push. The GM asked what was actually in them, and looking properly
turned up something better than the saving.

They were already being used **two ways in the same program**:

| | source |
| --- | --- |
| the renderer colouring the terrain mesh | `DEFAULT_TERRAIN`, imported |
| the renderer building marker models | `DEFAULT_MARKERS`, imported |
| the GM's palette, the column readout | `campaign.terrain`, off the wire |
| the GM's marker picker, the table's labels | `campaign.markers`, off the wire |

The renderer had already decided it did not need the wire copy. The panels
never caught up. So twelve markers — 46 little 3D primitives that *are* the
marker models — arrived by two routes on every intent, and a scene could be
drawn from one copy and labelled from the other if they ever diverged.

So they are not sent at all, rather than sent once. 12.2 KiB → **7.0 KiB**, and
one source of truth instead of two.

**The argument for sending them does not survive examination.** It is "the host
is the authority if a client is stale" — but a browser holding an old bundle
holds an old *renderer* too, and that renderer uses its own import regardless.
Sending buys nothing in the one case it exists for.

Two notes on what moved with them:

- The store used to destructure each registry by name while building the
  manifest, so that adding one without deciding again would be a compile error
  rather than a silent leak into a file. That guard is gone because its subject
  is: a registry cannot leak into a file it never reaches. Said in the comment
  rather than deleted quietly.
- D-107's property — an old campaign gets today's palette — is still tested,
  asked the way it has to be asked now: a stale registry in a file reaches
  nothing, and the encoded wire contains no registry at all.

### D-223 — Look for the thing the engine already has · `agreed`
I proposed ambient occlusion and described the standard voxel implementation:
mesh every body by hand, bake darkness into vertex colours, and rewrite how a
click resolves to a cube. The GM read it and said *"AO sounds really complex.
It sounds as a custom thing when it should be super normal, right? ThreeJS
should have something for this."*

They were right. Three.js ships **`GTAOPass`**, along with `SAOPass` and
`SSAOPass`, in `three/addons/postprocessing`, with types. It is a composer
chain and an afternoon:

```
EffectComposer → RenderPass → GTAOPass → OutputPass
```

No geometry change, no instancing change, no picking change — and it shades the
**world's terrain** too, which the baked version never would have, because it
works from depth and normals rather than from voxels.

What I had done was read the voxel-engine literature, where baked vertex AO is
genuinely the right answer, and not ask whether this renderer already had one.
The lesson is small and general enough to be a rule (R-168): *look for what the
engine already has before building what the field builds.*

**The trade is honest and worth stating.** Baked AO costs once, at build, and
is free thereafter; a post-process costs every frame — a normal buffer, the AO
pass, a denoise blur. Which is better depends entirely on the machine driving
the table, and that machine is not the one this was written on. So it is a
switch, with its state beside the numbers that judge it (R-166). The overlay
from the round before earns its keep immediately: it already shows GTAO's five
shader programs and eight render targets appearing.

**One trap found while wiring it.** A composer renders into its own buffer,
where the renderer's `antialias: true` does nothing, and `EffectComposer`'s
default target has no samples. Wired up naively this swaps soft corners for
jagged edges on every cube — a bad trade made silently. The target is
explicitly multisampled.

**And one thing deliberately dropped.** The first plan bundled face culling in,
because baking AO forced the meshing rewrite anyway and culling came free with
it. Decoupled, it is a plain performance change worth its own round: the GM's
church draws 58,284 faces and only 19,770 can be seen.

The judgement that remains is the GM's, and could not be anyone else's: whether
it looks better, and whether the table can afford it. Verified here only that
the chain builds, compiles and renders without error — the console's seat
belongs to the GM and claiming it would have demoted their window mid-session.

### D-224 — Shift + backtick is not backtick · `agreed`
*"I can't disable it with shift + `"* — because `e.key` for that key is a
backtick unshifted and a **tilde** shifted. The handler checked the character
first and bailed before it ever looked at the modifier, so the shifted binding
could never fire.

`e.code` is the key in that position whatever the layout or the modifiers say,
and it is **what the rest of this console already uses** — the digits and the
brackets are matched by code, with a comment beside them saying exactly why. I
wrote a new binding and did not follow the convention sitting ten lines away in
a file I had been editing all week.

Both bindings are matched by position now. Verified by dispatching the real
pair — `{key: '`', code: 'Backquote'}` and `{key: '~', code: 'Backquote',
shiftKey: true}` — and watching the panel open, the occlusion row go off and
back on, and the panel close.

Worth keeping as a habit rather than a rule: **a keyboard shortcut with a
modifier cannot be matched on the character**, because the modifier is what
changes the character. The convention already existed; the lapse was mine.
