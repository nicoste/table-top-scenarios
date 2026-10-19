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

### D-018 — Party fog is the union across party tokens · `agreed in D-278`
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

### O-009 — What is an encounter map, vertically? · `resolved by D-319`
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

### O-014 — Multi-cell places ("expand place") · `discarded by D-319`
Wanted, explicitly deferred. A tool to assign extra cells to an existing place, for
a realm or a city spanning several 200 m cells. Needs answers on what the extra
cells *do*: are they drawn differently, are they all valid travel targets, can
footprints overlap. Not blocking anything.

### O-015 — Do token notes use the same structure? · `resolved by D-312`
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

### O-017 — The world may be too small · `resolved by D-098`
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

### O-019 — Pathfinding on the world map · `resolved by D-293`
Deferred from round 28 deliberately. A→Z is legal (D-151), so once positions
exist the obvious next round is the route: easiest path by terrain difficulty
(R-52) and the 0.83 slope factor, **constrained to Known cells** (R-133), drawn
under the pointer during the aim step of R-132.

### O-020 — The travel confirmation menu · `closed by D-298`
The second half of the same future: confirming a move opens a menu for transport
and pace, reporting days of travel, with confirm/cancel. Blocked on O-006 (travel
pace presets) for the actual numbers. R-132 keeps the confirm step local so this
slots in rather than being retrofitted.

### O-021 — Does the party pawn show who is where when separated? · `resolved by D-319`
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

### O-022 — The group pawn is neutral-coloured · `resolved by D-314`
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

### O-025 — Two rounds running, I verified against a stale host · `closed by D-319`
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

### D-225 — The fan was a better instrument than the overlay · `agreed`
*"I can tell you that my pc is getting warmer, so this change definitely
consumes more."*

Correct, and the overlay I had just built **cannot see it**, which is the part
worth writing down. `requestAnimationFrame` is locked to the display: a GPU
doing three times the work reports the same frame time until it misses a frame
outright. Frame time measures *lateness*, not *load*. The panel would have sat
there reading a comfortable 120 fps while the machine heated up, and I would
have believed it.

The arithmetic, which I should have done before shipping rather than after
being told: at a 1024×768 canvas on a 2× display the composer works on 3.1
million pixels a pass, and GTAO takes sixteen samples at each — about **50
million AO samples a frame**, plus a normal prepass and a denoise blur, plus a
four-times-multisampled half-float target to keep the antialiasing a composer
otherwise throws away.

**Two fixes, and one of them is mine to own.**

- It is **off by default** now. The console is a tool somebody runs all
  session; a visual nicety should not be the reason a laptop is warm.
- "Off" now means the composer is **bypassed entirely**, not that one pass is
  skipped inside it. The composer costs something on its own — that
  multisampled half-float target was my addition, to stop the composer
  throwing away the renderer's antialiasing — so leaving it in the path would
  have made "off" cost more than before any of this existed, and would have
  made the switch useless as the comparison it exists to be. That was a real
  bug in the thing I shipped to measure with.

**What remains undecided**, deliberately, until it can be measured rather than
guessed: whether GTAO is affordable at half resolution (four times fewer AO
pixels, the standard lever and the one GTAOPass does not offer as a parameter),
whether fewer than sixteen samples still reads, and whether the table — the
screen where it actually matters — can carry it at all while the console never
needed it.

And a gap in the instrument to close before trusting it again: **GPU time is
not on the panel because the browser makes it hard** (`EXT_disjoint_timer_query`
is often unavailable). Worth attempting at runtime and showing when the browser
allows, because "is this expensive" is the question the overlay was built to
answer and it currently cannot.

### D-226 — Thirty frames is plenty, and the panel was lying · `agreed`
The GM measured the thing their fan had already told them, and the screenshots
settled two questions and exposed a third.

| | fps | p50 | draw calls | triangles |
| --- | --- | --- | --- | --- |
| before any of this | 120 | 8.3 ms | 2 | 116,568 |
| occlusion **on** | **51** | **19.7 ms** | 1 | **1** |
| occlusion off | 119 | 8.4 ms | 2 | 116,580 |

**Occlusion halves the frame rate** — about 11 ms a frame. Settled, with a
number rather than a guess.

**`triangles: 1` is my panel lying**, and that is the third thing. `info`
resets before each render, so with a composer in the path the only counts left
at the end belong to the last pass — a full-screen quad. The overlay reported
one triangle for 9,714 cubes, which is worse than reporting nothing: it read as
though occlusion had made the scene *cheaper*. Counted across the whole frame
now.

**Thirty frames a second**, the GM's suggestion and plainly right: *"This is
not a AAA game."* Nothing in this scene moves but a camera easing between four
fixed angles, and a 120 Hz panel was paying four times over to show the same
still picture. Three.js has no limiter, so it is a gate in the loop — with two
milliseconds of slop, which is load-bearing: a budget of exactly 33.3 ms misses
the tick at 33.3 on a 120 Hz display and waits for 41.6, giving 24 fps rather
than 30. Measured after: 30 fps, p50 33.4 ms, p95 33.7.

Two consequences inside the overlay: the frame window samples **renders**
rather than ticks, or skipped ones would read as a flattering 8 ms; and p95 is
judged against the **budget** rather than an absolute, because at 30 fps a
33 ms frame is on time and the same number at 60 is a missed one.

**And the gap that started this is closed: GPU time is on the panel**, from
`EXT_disjoint_timer_query_webgl2`, read a frame or two late because a result is
never ready on the frame that asked, and discarded whole when the driver
reports a disjoint. `n/a` where the browser hides it, rather than a number that
is wrong. It reads 0.9 ms on an empty scene here, and it is the only figure on
the panel that answers "is this expensive" — which was the question the whole
overlay was built for.

**A note on what the cap does to occlusion.** At 30 fps the budget is 33.3 ms
and occlusion cost about 19.7 — so it *fits*, where uncapped it was saturating.
That does not make it free, and it stays off by default, but it moves the
question from "can this run at all" to "is it worth 60% of a frame", which is
the GM's to answer with the panel open.

### D-227 — Occlusion at half resolution, and what the doubling meant · `agreed`
With GPU time finally on the panel, the GM read the two states and named both
numbers: *"with the AO enabled, we have doubled the triangles and GPU is many
times above without it."*

| | GPU | draw calls | triangles |
| --- | --- | --- | --- |
| occlusion off | **0.5 ms** | 2 | 116,568 |
| occlusion on | **9.4 ms** | 8 | **233,141** |

Both halves have precise causes, and they point in different directions.

**The doubling is a second render of the scene.** GTAO needs a normal buffer,
so every cube is rasterised again through an override material: 116,568 × 2,
plus the full-screen quads. Nothing can be done about that from here — the pass
can take an external g-buffer, but producing one means an MRT setup we do not
have. What it *does* mean is that **face culling now pays twice**: the round
set aside earlier would take 58,284 faces to 19,770, and occlusion re-draws all
of them.

**The nineteen-fold GPU is per-pixel, not geometry.** A 0.5 ms scene says the
cubes cost the card almost nothing; the 8.9 ms on top is the AO shader at the
device pixel ratio — sixteen samples at each of three million pixels. So the
lever is resolution, and `GTAOPass` does not offer it as a parameter: the
composer sizes every pass to the canvas, and the pass has to be shrunk again
afterwards. Occlusion is the lowest-frequency thing in the picture, so it is
also what loses least to being computed coarse.

Measured here on an empty scene it costs 4.6 ms at half resolution, which says
plainly that the pass is not cheap even with nothing in front of it. The
measurement that decides this is the GM's, on their machine with their church.

What this is really a record of: the overlay has now paid for itself twice
over. It caught its own lie about triangles (D-226), and it turned "my laptop
is warm" into two numbers with two different causes and two different answers.

### D-228 — The half-resolution change did nothing, and the reason matters · `agreed`
D-227 moved occlusion to half resolution on the theory that a per-pixel effect
at a 2× device ratio was drowning in pixels. Measured on the GM's own church,
through the console the GM pointed out I should have been driving myself:

| occlusion pass at | GPU |
| --- | --- |
| full resolution | 3.1 ms |
| half | 3.5 ms |
| a third | 3.5 ms |

**Nine times fewer pixels, no change.** The theory was wrong, so the change is
reverted: it was trading softness for nothing.

What the cost actually is, from the same session:

| scene | triangles | GPU off | GPU on | occlusion costs |
| --- | --- | --- | --- | --- |
| the church | 116,568 | 0.7 ms | 5.0 ms | **4.3 ms** |
| the world map | 97,896 | 0.5 ms | 3.9 ms | **3.4 ms** |

Nineteen percent fewer triangles, twenty-one percent less cost. **It is the
second geometry pass** — GTAO rasterises every cube again to build a normal
buffer, one draw call becoming seven and 116,568 triangles becoming 233,141.

So **face culling is the lever**, and it is worth twice what it looked like
when I set it aside as "a separate performance round": 58,284 faces to 19,770
cuts the scene pass *and* the normal pass.

Two things about how this was found, both the GM's doing:

- They asked why they had to keep telling me to use tools I already had. Fair:
  I had a browser, I held the seat in it, and I was still asking them to take
  screenshots. The measurements above took four minutes once I stopped asking.
- Repeating a reading caught a click that had not registered — the "world map"
  numbers were the church measured twice. Worth keeping as a habit: *check the
  state you think you are in before trusting what it reports.* The accidental
  repeat did pay for itself, by showing the measurement repeats to ±0.3 ms.

### D-229 — Draw when something changes · `agreed`
*"Should we buy more room and lower it to 20 so this tool becomes super
cheap?"* — the right instinct aimed at the wrong number. Twenty frames a second
buys a third less work and costs real things: the camera eases over about
300 ms, which is six frames at 20 and ten at 30, and that easing exists because
a sudden rotation confused people (R-156). Panning and the hover outline follow
a pointer, where 50 ms of latency is felt.

The bigger lever was sitting next to it, unasked: **nothing in this scene moves
on its own.** A map on a table is still for minutes while the GM looks at it
and talks. Thirty identical pictures a second is the waste, not the thirtieth.

Measured: **2 frames a second idle, 30 while anything is happening** — a
fifteenth of the work, against the third that lowering the cap would have
bought, and with no cost to how motion feels when there is any.

Two details that are the whole of whether this is safe:

- **The heartbeat is slow on purpose.** Half a second, as a net under a missed
  invalidation rather than as the mechanism. A stale screen that heals in
  500 ms is a bug somebody reports; one that heals in 30 ms is a bug nobody
  finds, and the second is worse.
- **The camera eases on every tick**, drawn or not, or a turn would advance
  only on the frames that happened to be drawn and arrive in steps.

**And the panel lied again, a third time.** It read "30 fps" while the screen
drew two, because the interval window is counted in *samples*: at two frames a
second, 120 samples is a minute of history. Frame *duration* and frame *rate*
are different questions and the second has to be counted against the clock.
It reads 2 and 30 correctly now, and immediately.

Three times this panel has reported something false — the per-pass counters
(D-226), the resolution theory it was used to disprove (D-228), and now the
rate. Each was caught by someone looking at it sceptically rather than by the
panel noticing. That is worth remembering about instruments generally: they are
only as good as the next person's suspicion of them.

### D-230 — A screen that got faster the busier it was · `agreed`
*"GPU on 10ms, but when rotating the camera, it goes down... Not up... Same for
frame p95."*

Both had the same cause and neither was the renderer. The panel was measuring
**heartbeat frames** — the half-second safety net from R-170 — as though they
were representative.

- **p95** was reporting the heartbeat itself. The interval between draws is
  500 ms when nothing is happening, by design; as a "frame time" it reads as a
  catastrophe.
- **GPU** was worse, because it was *true* and still misleading: a frame drawn
  half a second after the last one is a cold frame. The card downclocks in
  between, so an isolated frame genuinely takes longer than one drawn in a
  stream. Total energy is far lower; the per-frame figure is higher. Reported
  as a cost, it says the opposite of what is happening.

So heartbeat frames are drawn and **not measured**: not sampled into the
interval window, and not timed on the GPU. The cost figures now answer "what
does a frame cost when we draw one", and the rate answers "how often do we need
to", which are the two separate questions.

Verified: turning gives 30 fps with p50 33.3 and p95 34.4; perfectly still
gives 2 fps with p50 33.3 and p95 34.3. The costs hold steady and only the rate
moves, which is the shape the truth has.

**Fourth time the panel has misreported something**, after the per-pass
counters (D-226), the resolution theory (D-228) and the rate (D-229). A
pattern worth naming rather than apologising for each time: *every number added
to an instrument is a new claim, and a measurement taken at an unusual moment —
the first frame, an idle frame, a frame behind a composer — is where the claim
turns out to be false.* The GM has caught all four by looking at the numbers
and asking whether they could possibly be right.

### D-231 — A ten-second frame, and a box that shoved the column · `agreed`
Two the GM found in one message, both in the panel rather than the renderer.

**"Worst is normally wrong, it displayed something like 10 thousand ms."**
The clock that frame times are measured against was only moved forward on
*real* frames, and heartbeat frames returned before reaching it (D-230). So
after a quiet minute the next real frame measured the whole minute. The panel
duly reported a ten-second frame, which is not a frame — it is the gap between
two of them.

The clock moves for any frame drawn now, and a sample is taken only when this
frame **and** the one before it were real, and they were closer together than
the heartbeat. That last condition is the principled one: an interval longer
than the heartbeat cannot be a slow frame, because the heartbeat guarantees a
draw sooner than that. It is a gap in drawing, which is what `drawn` reports.

Verified by the sequence that caused it — a burst, eight seconds of silence,
another burst — which now gives a worst of 37.4 ms instead of 8,000.

**"Remove the rectangle around the bad numbers, they push all the rest of the
data."** `.warn` was already a component in that stylesheet, with a background,
a border and padding. The panel's rule added a colour on top and inherited the
box, which then shifted the column it sat in. Renamed to `hot`, which nothing
else claims. Colour alone says as much and moves nothing.

Worth noting what that collision cost: a generic class name in a shared
stylesheet is a global, and `warn` is about the most tempting global there is.

Fifth and sixth misreports from this panel. The pattern from D-230 holds and
sharpens: **every one of them appeared at a boundary** — the first frame, an
idle frame, a frame behind a composer, the frame after a silence. Steady state
has been right every time; it is the edges that lie.

### O-027 — Face culling bought nothing, and the reason is worth keeping · `closed`
Built, measured, reverted. The GM asked whether it would affect current or
future functionality; the answer turned out to be that it would not affect
*anything*, which was not on either of our lists.

It worked exactly as predicted on the geometry: 58,284 faces down to **19,770**
on the church, triangles from 116,568 to 39,540, and 233,141 to 79,085 with
occlusion on. The winding was right — every one of the six sides checked
against its own normal, which was the part most likely to be quietly wrong.

And it changed the GPU by nothing at all:

| | before culling | after |
| --- | --- | --- |
| GPU, occlusion off | 0.5 ms | 0.5 ms |
| GPU, occlusion on | 5.0 ms | 4.9 ms |
| **rebuild** | **4.2 ms** | **16.6 ms** |

**The GPU was never the bottleneck.** 116,568 triangles cost this card 0.5 ms;
there was no win available to take. And the rebuild — which runs on *every
cube placed*, while building, which is what the GM spends their time doing —
got four times slower, because the body went from 9,714 instanced matrices to
118,620 vertices written by hand.

Two theories died here, both mine. D-228 concluded occlusion's cost was the
second geometry pass, from the observation that it tracked triangle count
across two scenes. Cutting triangles by 2.9× disproved it. Isolating the chain
afterwards shows where the time actually is:

| | GPU |
| --- | --- |
| no composer | 0.7 ms |
| composer, occlusion pass disabled | 1.9 ms |
| composer and occlusion | 6.7 ms |

So occlusion costs about 4.8 ms *fixed* — insensitive to resolution (D-228)
and now to geometry too — and the composer itself costs 1.2 ms before any of
it. The evidence was already there and I had already written it down: an
**empty** scene cost 4.6 ms. I noted that it was "not cheap even with nothing
in front of it" and then went looking for geometry anyway.

Reverted rather than kept as insurance, because an unused optimisation that
makes every click worse is not insurance. **What to keep is the number**: this
machine draws 116,568 triangles for half a millisecond. If the table's box
turns out to be much weaker, or a map gets several times larger, that number is
what makes culling worth building again — and it will take an afternoon,
because it has been built once and the hard part was the winding.

### D-233 — Occlusion on for the table, off for the console · `agreed`
*"Lets keep AO"* — so the question became where it should be on, and the two
screens answer differently.

The **table is a stage.** Players look at it, it is still for minutes at a
time, and with frames drawn only when something changes (R-170) occlusion
costs nothing at all while nobody is touching anything. On by default.

The **console is a tool.** The GM builds in it, every cube already pays for a
rebuild, and the first laptop to run occlusion there got warm. Off by default,
and shift+backtick where it is wanted.

That split has been implicit since the first conversation about giving the app
some life — *the console wants clarity while working, the table wants
atmosphere* — and this is the first place it has cost a line of code.

**On SMAA, which was the other half of the question.** It would be four lines:
drop `samples` from the composer's target, add `new SMAAPass(w, h)` after the
occlusion pass, and let `composer.setSize` carry it. It is not worth doing:

- It attacks the wrong number. The composer costs **1.2 ms** and occlusion
  **4.8 ms** (O-027); the best SMAA can do is shave part of the 1.2.
- It would likely look *worse here*. A voxel scene is nothing but long,
  straight, high-contrast edges — the case 4× MSAA handles best and the one a
  morphological filter handles worst, since it infers the edge from the image
  and can soften or wobble a near-vertical line.
- It adds three full-screen passes and two lookup textures, spending back part
  of what it saves.

Written down rather than left as a maybe, so nobody spends an afternoon on it
expecting the 4.8.

### D-234 — Occlusion on for both screens, and an exposition failure · `agreed`
*"Wait, so you kept AO for the table but not for the GM? Then you mentioned
SMAAPass as a solution to what we have when SMAAPass is an antialiasing
technique and the GTAOPass is an AO technique. Why are you putting all
together?"*

**Two separate faults, and the second one is mine twice over.**

**The split was reasoned from stale evidence.** D-233 left occlusion off on the
console because "the first laptop to try it got warm" — which was measured
before the frame cap (R-169) and before frames were drawn only on change
(R-170). Occlusion cost 19.7 ms of *every* frame at 120 a second then. It costs
4.8 ms of the frames actually drawn now, and the console draws two a second
while the GM reads the map. The number that justified the decision no longer
exists.

Worse, the benefit argument was my own and I let the stale cost beat it without
looking: the original proposal for occlusion opened with *"it helps you build —
depth is much easier to judge when corners are shaded."* Shading corners is
worth more to somebody placing cubes than to anybody watching. On for both.

**And antialiasing was dragged in without saying so.** SMAA is not a cheaper
AO, and presenting it as a lever on occlusion's cost without stating the link
was the confusion. The link is real: **a composer breaks the renderer's
antialiasing.** `antialias: true` applies to the canvas's default framebuffer
only, so the moment GTAO put a composer in the path, the scene began rendering
into a buffer where it does nothing. The 4× multisampled target is me paying
that bill back, and SMAA is an alternative way to pay the *same* bill — the
antialiasing one, never the occlusion one.

That connection has been in the code comments since the composer went in, and
never once in anything said out loud. A thing explained only to the compiler
is not explained.

### D-235 — A place for the numbers · `agreed`
*"Can you create a doc to store performance metrics based on key moments? So
we don't lose them?"*

They were spread across a dozen decision entries, which is the right home for
*why* something changed and the wrong one for what it cost. Asking "is this
slower than it was" meant reading the whole argument back.

`docs/MEASUREMENTS.md` holds the figures, and three things make it worth
keeping rather than a list that rots:

- **Every row names the machine and the scene.** Twice in one afternoon a
  reading nearly misled us by coming from a different machine or a different
  canvas — the "world map" numbers that were the church measured twice
  (D-228), and a half-resolution comparison made across two GPUs (D-227). The
  file says a figure without its conditions is noise, and a test checks that
  both machines are named and that the file says they are not comparable.
- **There is a procedure.** Open the panel, make the screen *busy* — frames
  are drawn on demand now (R-170), so an idle screen reports the heartbeat
  rather than a cost — wait three seconds, write down the conditions. A
  measurement nobody can repeat is an anecdote.
- **It ends with what the numbers taught**, separately from the numbers,
  because those outlive any particular figure: the GPU is not the bottleneck
  at this scale; frame time cannot see load; instruments lie at boundaries;
  an optimisation that is not measured is not an optimisation.

Guarded like the playbook: a test checks that every rule and decision it cites
still exists. A broken citation in a file of evidence is worse than in prose —
prose can be re-reasoned, a number cannot be re-derived once the conditions
are lost.

The commit checklist now asks for a row when a change moves a number worth
comparing against later.

### D-236 — Nine pieces of maths three.js already owned · `agreed`
The audit's own recommendation, acted on. Each of these was correct, tested,
and written by hand when `three/src/math/MathUtils` had it:

| ours | theirs | sites |
| --- | --- | --- |
| `current + (goal - current) * (1 - exp(-dt / tau))` | `MathUtils.damp` | 1 |
| `(((d) % 360) + 540) % 360 - 180` | `MathUtils.euclideanModulo` | 1 |
| `(deg * Math.PI) / 180` | `MathUtils.degToRad` | 4 |
| `Math.min(hi, Math.max(lo, v))` | `MathUtils.clamp` | 3 |

Two are worth more than the line count.

**`approach` was `damp`, down to the citation.** Both are
`lerp(x, y, 1 - exp(-lambda·dt))` and both point at the same article on
frame-rate-independent damping. What stays ours is the **snap** — three.js
does not do it, and without it the easing never arrives and the render loop
never rests, which matters a great deal more here now that frames are drawn
on demand (R-170).

**`nearestAngle`'s `+ 540` was a euclidean modulo spelled out.** JavaScript's
`%` keeps the sign of its left operand, so `-10 % 360` is `-10`; adding 540
before the remainder forced it positive. Correct, and a magic number standing
in for a named function.

**The proof is that nothing changed.** Twenty-one existing camera tests —
frame-rate independence across 30 and 240 Hz, never taking the long way round,
arriving exactly rather than approaching forever — pass untouched. That is
what made this safe to do mechanically.

**Two left alone, deliberately:**

- **The cost panel's percentile clamp.** It lives in `client-core`, which has
  no business depending on a renderer's maths library for `Math.min`. The ring
  it sits in is worth more than the line.
- **The block ghost's bounding box.** `Box3.setFromPoints` exists, but the
  cells are plain `{x, y, z}` and it would mean allocating twenty-five
  `Vector3`s on every pointer move to replace an allocation-free loop. The
  rule from O-027 applies to tidiness as much as to performance: a change that
  measurably costs something and buys only neatness is not an improvement.

### D-237 — Grain, so a wall is not forty identical swatches · `agreed`
The first of the material-appearance round, and the one the GM remembered from
the original brainstorm as *"an effect to the sides of the cubes so they don't
look like legos"*.

What reads as moulded plastic is not the cube shape — it is that every cube of
one material is the **exact same colour**. A few percent of drift per cube
removes it, and costs no texture, no shader, no art, and 1.1 ms of rebuild:
4.2 ms to 5.3 on a 9,714-cube church.

Three choices inside it:

- **Deterministic, from the coordinate.** The body is rebuilt whole on every
  edit (R-171 was reverted but the rebuild remains), so a random shade would
  mean every cube in the map shimmering each time one is placed. A hash of
  x, y and z gives the same cube the same shade forever, and two maps built
  the same way look the same.
- **An integer hash, not `Math.sin(n * 12.9898)`.** The usual one-liner bands
  on integer grids, which is the precise arrangement every cube here is in —
  a run of them picks up a visible ripple that looks worse than no grain.
- **Lightness in HSL, not a multiply on RGB.** Scaling the channels together
  drags a colour toward black or past white and changes its apparent
  saturation. The registry's colours are muted deliberately — *"saturated
  blocks fight whatever stands on them"* — and a hue-preserving nudge keeps
  that intact.

The amount belongs to the material, which is the shape the GM asked for:
*"a cube with a material and that material concentrates the data that
describes how it looks."* Thatch, dirt, grass and sand wander most; snow,
metal, water and ice barely; glass not at all.

**A note on the tests, because two of them were wrong first.** The property
here is statistical and I twice asserted something stronger than a hash can
promise: that 256 samples would land in more than 160 distinct buckets (a
perfect hash collides into about 148 by birthday alone), and that *every*
adjacent pair differs (a uniform hash will occasionally match two neighbours,
and that looks fine — stone does that). Both would have been passed by tuning
the threshold until green, which is how a test ends up passing for the wrong
reason. They assert the real property now: neighbours differ **on average**,
and the row has no short period.

### D-238 — One mesh per material, so a material can own how it draws · `agreed`
The second of the material-appearance round, and the structural one. The GM's
shape for it: *"a cube with a material and that material concentrates the data
that describes how it looks, like you exemplified, the lava emitting, the
water transmiting."*

Grain (D-237) fitted in the old renderer because **colour is the one thing an
instance can carry**. Roughness and emission cannot: they are uniforms on the
material, so a single `InstancedMesh` can draw a thousand shades of one
substance and cannot draw thatch beside ice. Either the registry stops at
colour, or the body is grouped by material. Grouped, then — thirteen meshes
where there was one, `MeshLambertMaterial` to `MeshStandardMaterial`.

Two fields, both describing the **substance** and neither naming a renderer:

- **`roughness`**, how scattered the light off it is. At a table's distance it
  reads almost entirely as how differently the top face catches the sun from
  the sides. Dirt is chalk at 1, ice and glass are 0.12, metal 0.35.
- **`glow`**, how lit from inside it looks. Zero for everything but lava, at
  0.75. **It looks lit; it does not light** — a glowing block casts nothing on
  its neighbours, which needs an actual light in the scene and is a separate
  decision with a per-light cost. It glows in its own colour, right for every
  case we have; a material wanting to glow a *different* colour than it is
  would need a second field, and none does.

**`metalness` stays at zero.** It is the obvious third field and it is a trap:
a metal in this lighting model scatters almost nothing and reflects its
surroundings, so metalness with no environment map renders **black**. Metal
is a decision with an environment attached, not a number to raise. Same for
`opacity` on water, glass and ice — transparency needs render-order care and
is its own round.

**What it cost**, measured on the church before and after, same canvas, minutes
apart:

| | before | after |
| --- | --- | --- |
| block meshes | 1 | 7 (the church's palette) |
| draw calls, whole scene | 7 | 19 |
| GPU | 12.6 ms | 12.6 ms |
| triangles | 233,141 | 233,141 |
| rebuild | 3.2 ms | 6.0 ms |

Draw calls went up by twelve rather than six because **occlusion rasterises
the scene twice** — every mesh is counted in both passes. Nineteen is nothing
on this card and the GPU figure says so: unchanged, because the GTAO pass is
almost all of it (MEASUREMENTS.md).

The rebuild is the figure that moved, and it is **not the split**. The same
function in node is 2.83 ms before and 2.99 ms after — the grouping loop and
the thirteen smaller buffers cost nothing measurable. The browser's extra
milliseconds are object and buffer setup under a live renderer, and 1.4 ms of
them were **three.js warning twelve times a rebuild** that `emissive` had been
passed as `undefined`. Fixed by setting emission after construction instead of
passing a key that is usually not there; 7.4 ms to 6.0. Against a 33 ms budget
paid once per edit, the remaining 2.8 ms buys the feature.

**The thing worth remembering**: a parameter object with a conditional
`undefined` in it is not free. three.js answers each one with a `console.warn`,
and a console being captured turns that into milliseconds on the hot path.

### D-239 — Water you can see into, and the thing it uncovered · `agreed`
Third of the material-appearance round, and the one the GM named first:
*"the lava emitting, the water transmiting."* `opacity` on the registry —
water 0.58, ice 0.72, glass 0.26, everything else 1 — **retuned at the table
to water 0.75 and glass 0.4** once there was something to look at, the same
way grain was (D-237). A sea is most of the screen on an island map and at
0.58 the depth showing through it read as hatching rather than as water; 0.75
keeps a pool see-through and quiets the sea. Glass at 0.26 was so clear that
a window read as a gap.

The interesting choice is **depth writes, which stay on**. Every guide says to
turn them off for transparency so surfaces behind show through, and that
advice assumes the renderer sorts your surfaces back to front. Nothing sorts
instances inside an `InstancedMesh`: they are drawn in buffer order, so with
depth writes off a sea of seven thousand cubes blends with itself in the order
the blocks happen to sit in the map, and a cube at the far edge washes over
one at the near. Left on, the nearest face at each pixel wins and blends with
the ground behind it. One layer of overdraw rather than sixty, and a stack
that reads as solid — which is what six feet of water does.

**The cost is nothing**, and finding that out cost the afternoon's real
discovery.

Asked afterwards whether an opaque block pays anything for living in a scene
that also has transparent ones, and measured both ways rather than reasoned
about: with occlusion off, the church rasterises in a median **1.4 ms all
opaque and 1.3 ms see-through**, six samples each, 21 draw calls either way.
No, it does not. An opaque material never enters the transparent path —
`transparent` comes from `opacity < 1`, so stone's is false and it sits in the
opaque list as it always did, blending off, depth writes on, sorted front to
back.

The first reading said transparency had cost 3.7 ms — 12.6 ms of GPU before,
16.3 after. It had not. The two readings were taken at different camera
distances, and that turns out to be the only variable that matters here. With
the occlusion pass switched off, the entire scene — transparent sea, 9,771
cubes, 234,509 triangles — rasterises in **0.8 to 2.2 ms at every zoom**.

Everything above that is **GTAO, and it scales with how close the camera is**:

| camera | GPU, occlusion on | occlusion off | occlusion costs |
| --- | --- | --- | --- |
| church fully out | 11.3 ms | 0.8 ms | 10.5 ms |
| 12 ticks in | 17.9 ms | 2.1 ms | 15.8 ms |
| 24 ticks in | 20.4 ms | 2.1 ms | 18.3 ms |
| 36 ticks in | **31.8 ms** | 1.1 ms | **30.7 ms** |
| 48 ticks in | 31.8 ms | 2.2 ms | 29.6 ms |

At 36 ticks the frame is **entirely occlusion** and sitting on the 33 ms cap.
This is the opposite of what D-228 concluded and what MEASUREMENTS.md has said
since — "very nearly a fixed cost", 4.6 ms on an empty scene, insensitive to
resolution and to geometry. Those were all true and all taken at one camera.
The radius is in **world units**, so its footprint in pixels grows as the
camera comes in, and the cost follows the footprint.

Which makes it the thing to fix, and it is worth noticing *when* it bites:
hardest exactly when the GM is close in placing cubes. O-028.

### O-028 — Occlusion costs three times more up close, and the fix is probably one line · `closed`
From D-239's table: GTAO is 10.5 ms with the church framed and 30.7 ms zoomed
in, because its radius is in world units and its real cost follows how many
pixels that radius covers.

Three candidates, in the order they should be tried:

1. **Scale the radius with the camera**, so the footprint in pixels stays
   roughly fixed. One line where the camera distance is already known, and it
   makes the shading *look* the same at every zoom too, which the current
   build does not.
2. **Re-test half resolution.** D-228 measured it and found nothing, at a
   camera where occlusion cost 3.1 ms. A cost that is bound by pixel footprint
   is exactly the kind that quartering the pixels should cut, so that
   measurement should not be trusted in this regime.
3. **Drop occlusion past a zoom threshold**, which is the crude one and the
   last resort: the shading would pop.

Not urgent in the sense that the cap is holding — 31.8 ms fits inside 33 —
but there is no headroom left at all, and the GM's own screen is larger than
the one these were taken on.

**Closed by D-240**, with the first candidate and a flag three.js already had.

### D-240 — Occlusion priced in pixels · `agreed`
O-028's first candidate, and it turned out to be a flag three.js already has:
`screenSpaceRadius`, which reads GTAO's radius in hundreds of pixels instead
of world units. Four lines.

| camera | before | after |
| --- | --- | --- |
| church fully out | 10.5 ms | 10.8 ms |
| 12 ticks in | 15.8 ms | 16.1 ms |
| 24 ticks in | 18.3 ms | 17.6 ms |
| 36 ticks in | **30.7 ms** | **17.7 ms** |
| 48 ticks in | 29.6 ms | 17.5 ms |

The cliff is gone and nothing got worse. It does not go flat, and should not:
what is left scales with how much of the screen has geometry on it, which is
the pass doing its job. The world map zoomed in reads 18.8 ms on 97,890
triangles against the church's 17.7 on 234,509 — same cost, a third of the
geometry, which is the clearest statement yet that **this pass is priced in
pixels and not in triangles.**

Fifteen pixels, chosen so a framed map looks exactly as it did — that is what
0.8 world units came to at that zoom. Only the close-up changed, and for the
better: the old radius at 48 ticks in was shading most of a cube face, which
is softer than a corner wants.

**What it gives up** is that occlusion is no longer a fact about the geometry.
Zoomed out it reaches further in world terms than it should, zoomed in less.
Nobody at a table is measuring whether a shadow is one cube deep; they are
reading depth off the corners, and before this the corners cost a whole frame
at the zoom a GM builds at.

**Still on the table if 17 ms ever needs to be less**: `samples`, which is 16
and is the sampling loop itself. Halving it halves the pass and adds noise for
the denoise step to hide. Not needed — 17.6 ms sits inside a 33 ms cap with
room — but it is the next lever and it is one number.

The thing to carry forward is in R-175: **a screen-space pass is priced in
pixels.** Anything scaling it in world units is a cost that moves when the
camera does, and five careful readings taken at one camera will all agree with
each other and all be wrong.

### D-241 — Shades: the same stone, cut three ways · `agreed`
The GM asked for this before the appearance round even started: *"I will love
to have material variations but just in color, for example, having 3 types of
wood, one darker than the other, same with stones. These materials are right
now applied to define 'is this rock'? But in the future I see myself building
a house and using different types of rock."*

The whole design is in the second sentence. Different **types of rock**, which
is still rock. So not three materials — **two axes**.

**Why not just add entries to the registry.** It is the obvious move and it is
a one-way door: R-11 makes material ids permanent because every saved map
references them, so a dark stone added today can never be renamed, merged or
removed. Worse, it is multiplicative in the wrong place — fourteen materials
wanting three cuts is forty-two permanent ids and a palette the GM has to
scroll. Two axes give the same forty-two appearances from fourteen entries and
three, and a fourth shade later is one line rather than fourteen.

**What a cube holds** is a `SwatchId`: `material:stone`, or
`material:stone/dark`. A string, not a pair, because the body is a
`Map<string, …>` of nine thousand entries compared by identity — the palette
dedupes on it, `fillRegion` matches on it, and the whole packed encoding
(D-217) works on it unchanged. An object per cube would have cost nine
thousand allocations to express the same thing.

**Plain writes bare**, which is the trick that made this cost nothing:

- A map saved before today reads back as plain stone. No migration, no schema
  bump (R-137a, R-144), and the third time D-187's "the absence says what it
  means" has paid for itself.
- A body of plain blocks packs to exactly the bytes it did yesterday.
- And `material:stone/plain` is **refused** on the way in, even though its
  meaning is obvious. One value, one spelling — two spellings of one cut would
  put two entries in a palette that holds one colour, and stop a fill in the
  middle of a flat wall.

**It is free to draw.** Shades change only the colour, and colour is the one
thing an instance already carries (R-173) — dark stone and pale stone share a
mesh. Fourteen materials still make fourteen meshes. The swatch is resolved to
a tint once per *swatch*, not once per cube: a body has thousands of blocks
and at most a few dozen cuts, and `shadeColour` is a round trip through HSL.

**HSL lightness, ±0.1**, the same arithmetic grain uses and for the same
reason (D-237): scaling RGB drags a colour toward black or past white and
changes how saturated it looks, where a nudge in HSL keeps the hue the GM
picked. The two compose — a shade moves the whole cut, grain still wanders
each cube a few percent around it.

**`shadeColour` lives in the domain**, not the renderer, because two things
ask it and they must agree: the cubes on the table and the chip under the
GM's pointer. A panel that paints its swatch one way while the map draws
another is a panel that lies about what the next click will do. The material
list is drawn in the chosen cut for the same reason.

**The fill falls out of it.** `fillRegion` already matched on the stored
value, so matching on the swatch rather than the material needed no code at
all — and it is the behaviour the GM confirmed wanting when the fill tool was
built. One course of a wall in a different cut is a region, and repainting it
is one click.

### D-242 — The cuts belong to the material, and plank is gone · `agreed`
D-241 shipped one ladder — dark, plain, pale — that every material climbed.
The GM read it back and found the flaw in a sentence: *"all of them are the
same subtypes, dark plain and pale. Do we have 3 subtypes as requirement?"*

No. Three was their own phrasing repeated back at them, and a uniform ladder
is the wrong shape twice over. Snow does not come in three — a darker snow is
a shadow, which the occlusion pass already draws. And the future the GM
actually described is *"3 types of wood"*, which one day wants to be oak, pine
and ash: names that mean nothing to stone.

So `shades` is a field on the material, free-length, and empty is the
ordinary case. **Plain is not in the list** — a material *is* its plain cut,
which is why it writes bare (D-241) and why "no variations" needs no special
value. A shade id is only meaningful *through* a material, so `shadeIn` had to
stop returning a `Shade` and start returning an id, and `isKnownSwatch` asks
the material rather than a global registry: `material:snow/dark` is refused
where `material:stone/dark` is fine.

Today: stone, brick, wood, thatch, grass, metal and water carry two cuts;
dirt and sand carry one (earth is wet or dry, and there is no pale dirt);
snow, lava, glass and ice carry none. Lifts stay at ∓0.1 — the GM asked to
fine-tune them later, per material, which this shape now allows.

**The list stopped having a shade row.** The GM's design, and it is better
than the one it replaced: the cuts sit at the right of each material's row
where "see-through" already sits, so a material and its variations are one
line. Tap the row for plain, tap a square for that cut. Which means the whole
selection is **one piece of state** — a swatch — rather than a material and a
shade held apart, and the panel cannot offer a combination that does not
exist. The old row could: pick Pale, scroll to Snow, and the console believed
in a pale snow nobody had defined.

**And `plank` is removed**, which is a deliberate exception to R-11. The GM
asked and it is the right call here, but it should be recorded as what it is:
R-11 says registries are append-only because removing an entry is a migration,
not an edit. The cost is bounded and was checked before doing it — no saved
map anywhere in `data/` holds a `material:plank`, so nothing rots. Had one,
those blocks would have drawn in the renderer's magenta unknown and any intent
touching them would have been refused as an unknown material: visible and
safe, but wrong.

The exception is **this project, at this stage**: a playground with no real
campaign in it, where the GM said *"forget about maps, I don't care, feel free
to touch them."* Once a campaign exists that anyone minds losing, R-11 applies
with no exception, and removing an entry means a migration that rewrites every
map that holds it.

### D-243 — One strip, and the shared class that quietly broke the terrain list · `agreed`
D-242's row kept the old chip on the left and put the variations on the right,
which was not what the GM had asked for and they said so: *"we have now a
shade on the left and a shade or more to the right. I was specific about
having the name to the left and all the shade variations to the right."*

They were right twice. It is not what they specified, and it was **two
indicators for one selection**: picking plain lit a ring on the left chip,
picking a cut lit a square on the right, so the eye had to learn that one row
had two places to look. Now the name is the left and every look is the right,
plain included, ordered darkest first so the strip reads as a ramp.

Plain stays out of `shades` — a material is its plain cut (D-242), and nothing
about the encoding changes. The panel asks `cutsOf(material)`, which adds plain
and sorts by lift. The **ordering is a decision, not a detail**: by lift, so
the row is a ramp rather than the order somebody happened to type.

**The hover they pointed at.** Three highlights were landing on one row at
once: the row's own hover, the white ring on the left chip, and the browser's
focus ring on a square. The ring is now a single `outline` on the chosen
square — outside the border, moving nothing, legible on a dark row and on the
accent alike — and focus has a style of its own instead of the browser's.

**And the real bug underneath it**, which the screenshot showed without
either of us looking for it: the world's terrain list uses the *same*
`.palette` class. D-242 renamed `.palette button` to `.palette .pick` for the
material rows, and nothing in the terrain list is called `.pick` — so every
terrain row silently lost its width, padding, gap and transparent background.
Nobody had opened the world map between that commit and this one.

Two things follow. The shared rules are shared again, and what belongs only to
the material rows is scoped under `.swatches`. And the lesson, which is cheap
to state and was not cheap to find: **renaming a selector is an edit to every
component that matches it**, and a class named for what it looks like rather
than what it is will be matched by components you are not thinking about.

### D-244 — Figure in the surface, and a config panel we did not build · `agreed`
The last open question from the original materials brainstorm — *"an effect to
the sides of the cubes so they don't look like legos"* — answered properly.
Grain (D-237) took the flatness out of a *wall*; this takes it out of a *face*.

Three figures, named by the GM: wood in vertical stripes, grass with inner
noise, brick with squares inside.

**Built on `onBeforeCompile`**, which patches three.js's own standard material
rather than replacing it. Everything keeps working — lighting, the occlusion
pass, instancing, transparency, the per-instance shade — because none of it was
touched. D-223's lesson a second time: look for the thing the engine already
has before building the thing the internet says voxel engines build.

**No textures and no UVs.** The coordinate is the cube's own position in the
world, which the vertex shader already has. That buys three things: nothing to
load, no seams, and a figure that is continuous across cubes — a brick wall
reads as one wall instead of forty copies of one tile. The cost is that courses
do not line up with cube edges, which is correct for masonry and would be wrong
for something meant to read per cube.

**It costs nothing.** Occlusion off to isolate the raster, same camera, four
alternating passes, six samples each:

| | gpu | median |
| --- | --- | --- |
| figure off | 2.8, 2.8, 2.9, 2.9, 2.8, 2.8 | **2.8 ms** |
| figure on | 2.9, 2.9, 2.9, 2.9, 2.8, 2.7 | **2.9 ms** |
| figure off | 2.8, 2.9, 2.9, 2.8, 2.9, 2.5 | **2.9 ms** |
| figure on | 2.9, 3, 2.8, 2.9, 2.9, 2.8 | **2.9 ms** |

No extra draw calls, no extra triangles. The one risk worth checking was shader
programs — the church goes from 13 to 22, and programs compile on first draw —
so the map was reopened cold: **worst frame 35.2 ms**, inside the 34.7–40.7 ms
range measured before patterns existed. No compile stall.

**What it deliberately does not do** is perturb the normal, so there is no
relief and the figure does not catch the light as the camera turns. That is the
version that would cost something, and it can be decided on its own.

**And the panel we did not build.** The GM asked whether these graphic
additions should get a config button for enabling and disabling. The answer was
no, and the reasoning is worth keeping, because it is the shape of a mistake
this project has made twice:

- The three things are not alike. Grain costs ~1 ms at rebuild and nothing per
  frame; figure measures at zero; **occlusion is the only one with a real
  case**, at 17 ms, and R-168 already gave it a switch for exactly that reason.
  A panel would be a control for one real toggle and two that need none.
- The motive for wanting occlusion off was a warm laptop, and that was *already
  fixed* by the frame cap (R-169) and drawing on change (R-170). Building a
  setting for a solved problem is how half-resolution occlusion and face culling
  got built — both on sound reasoning, both measured, both reverted (D-228,
  O-027).
- The question did expose a real gap, just not the one asked: the occlusion
  switch is per-screen React state with no persistence anywhere in this codebase,
  and **the screen that most needs it is the one nobody has a keyboard at**. If
  the table's box ever struggles, the control belongs on the GM's console and
  travels over the socket, because the GM is the only person with input and
  keeping the table readable is their job. Not built, because nobody has yet run
  the table display on the box that will drive the TV. **Measure that first.**

### D-245 — The registry by how a thing is built · `agreed`
A conversation, not a change request. The GM: *"I'm mentally separating by the
texture, not the color or the actual thing IRL."*

**Colour was the identity axis and it was the wrong one.** The old registry had
thirteen materials distinguished by colour, and measuring the distances between
them showed four pairs within a hair of each other while describing obviously
different substances:

| | RGB distance |
| --- | --- |
| Thatch pale vs Sand plain | **8** |
| Thatch plain vs Sand dark | **9** |
| Wood dark vs Dirt plain | 14 |
| Stone plain vs Metal pale | 22 |
| Thatch plain vs *pale grass* | 60 |

The last row is the one that settled it. The GM proposed removing thatch
because it duplicated grass; the numbers said its twin was **sand**, which
nobody would confuse with a roof. Colour cannot tell a roof from a beach.
Structure can.

So: a **family** owns a structure and its **cuts** are the substances that
share it. Nine families, twenty-eight cuts, every one with a name said out
loud — limestone, oak, shore, mana.

**What decides family from cut is the renderer, not taste.** Roughness, glow
and transparency are uniforms; colour is per-instance (R-173). So a cut may
differ only in colour, and anything differing in how light behaves is its own
family. That rule answered three questions without an argument:

- **Lava is not a cut of water.** Glow is a uniform. It is its own family,
  *Glowing*, with acid and mana beside it — three substances that differ only
  in colour, which is exactly what a cut is.
- **Ice is a cut of Liquids.** It is frozen water, and 0.72 against 0.75 is the
  same number at a table.
- **Metal folds into Mineral**, which the GM suspected — *"Metal is 1 word away
  from disappearing… Don't you think?"* — and the reason is better than the
  word count: every other family names *how* something is built, and Metal
  named *what it is*. It was the one entry that did not fit the model, which is
  why it read as redundant next to Mineral. The cost is that gold is matte,
  and that costs nothing today because metalness is pinned at 0 for want of an
  environment map (D-238). If sheen ever matters, the way back is letting a cut
  carry roughness — one mesh per cut instead of per family — and the measured
  evidence says more meshes are nearly free (D-238's table). Rebuild time is
  the figure to watch, not draw calls.

**One family was added against the GM's grouping.** They put grey stone inside
Brick. Dressed stone laid in courses *is* brick and stayed there, but a dungeon
is mostly **cave wall** — irregular mass, no courses, no bond — and folding
that into Brick would have made caverns unbuildable. Mineral is its own family
for that reason.

**Thatch dies and becomes `dried` grass**, at the GM's call. What is traded is
the roof: a thatched roof is overlapping bundles laid in courses, and as a cut
of Grass it gets blade mottle. On the ground it is right; on a roof it will
read as a lawn. Named here so that if it ever grates, the fix is a family and
not a mystery.

**The UI consequence the GM's own requirement forced.** They asked for
*"self-describing labels and colored squares"* — but the cut names were living
in tooltips, and "limestone" is the word a GM says. A row has a family name and
up to four squares inside 228px with nothing left over, which is also why the
`see-through` badge moved off the rows and onto the line that names the chosen
cut. That line is where you look to confirm what the next click lays down, and
it has the width to say it.

**And the campaign was deleted**, with permission — *"Be free to delete the
whole campaign, it's ok right now."* Every map in it referenced `material:stone`,
`material:sand`, `material:metal` and the rest. This is one migration rather
than the three removals it looks like, and it is the **last cheap one**: after
this, R-11 applies with no exception and folding a family means writing a
migration that rewrites every map that holds it.

**It cost the reference scene.** Every figure in MEASUREMENTS.md is anchored to
The Eight's Church — 9,714 cubes, 96×96, fifteen levels — and that campaign no
longer exists. The numbers remain true of the build that produced them and are
no longer reproducible as written. Noted there rather than quietly left to rot.

### D-246 — Six figures, and the three families that were still flat · `agreed`
The GM went through the palette row by row. Brick *"perfect"*; wood and grass
*"subtle, I like it"* with a request to take the contrast *"a REALLY small up"*;
mineral, soil and vegetation *"I don't see the figure, looks plain"* — which was
exactly right, because those three had `pattern: 'none'` and nothing had been
written for them yet.

**Three new figures, and two of them share one idea.** Cellular noise — the
distance to the nearest of a set of scattered points, and to the second
nearest — read two ways:

- **`plates`, for Mineral.** The *gap* between the two distances goes to zero
  exactly on the line equidistant from two points, which draws a seam. Irregular
  plates divided by cracks is what a cave wall is, and it is what no amount of
  plain noise looks like. Each plate takes its own shade from the cell's id, so
  a rock face is cut from one rock without being one colour.
- **`leaves`, for Vegetation.** The same cells read by *distance* instead of
  seam: each cell is a lobe, bright at its middle and dark at the gap.
- **`grit`, for Soil.** Not cells but two octaves of value noise, much finer
  than grass's. The whole difference between soil and grass is grain size, so
  that is the only thing the two figures differ in.

**And a rule fell out of writing them.** `grit`'s fine octave is 26 cycles per
world unit, which is smaller than a pixel as soon as the camera pulls back —
and a detail finer than its pixel does not read as texture, it crawls. Faded
out with `fwidth` before it can shimmer, now in R-177, and applied to grass's
fine octave too, which had the same latent problem and nobody had zoomed out
far enough to see it.

Wood and grass went from 0.10 to **0.12** — the "really small up" asked for, and
the same kind of number the GM has tuned four times before on grain.

**Three registry changes in the same breath**, all the GM's:

- **Ice leaves Liquids for Glassy.** What ice has in common with glass is that
  you look *through* it at something hard; what it has in common with water is
  only its chemistry, and the family is the look (R-178).
- **Mana goes.** Lava and acid are enough glow.
- **Glass becomes "Glassy."** A display-name change, which R-11 leaves free —
  the id stays `material:glass` forever, and that distinction is the whole
  reason the law is about ids rather than names.

**What it cost: nothing, again.** Occlusion off, same camera, six samples:
1.4 ms with figures and 1.5 without, which is noise reading slightly in the
wrong direction. Shader programs 22 → 25 with no compile stall; worst frame
34.2 ms.

The test that every declared pattern has a shader (R-177) earned itself here:
three families gained a `pattern` name in one edit and a shader in another, and
it is the thing that would have caught them shipping apart.

### D-247 — A reference scene you cannot lose · `agreed`
Deleting the campaign (D-245) cost the scene every figure in MEASUREMENTS.md
was a measurement *of*. The obvious repair was to build another one in the
console. That would have been the same mistake with a later expiry date.

**So the scene is a script.** `npm run seed`, about two hundred lines, and
three consecutive runs produce a byte-identical body. It can be rebuilt after a
registry change, on another machine, by somebody who has never seen the old
one — which is the difference between a baseline and an anecdote.

**The Tollkeep**: a sea, a shore, an island, a brick keep with a cellar and a
lava pit, glass windows, a stand of trees. 11,398 cubes, 96 × 96, fourteen
levels, **all nine families**. Built to exercise what gets measured rather than
to look like anywhere — every family so the draw calls are the true count,
transparent water and glass so that pass is in the frame, emission so that path
is, and a figure on six of the nine.

**The camera is the framing a map opens with.** That one choice retires a whole
class of mistake: "12 wheel ticks in" depends on where you started, and D-240
was five careful readings that agreed with each other and were all taken at one
camera nobody had written down.

**Writing it found a bug in the seed and not in the code.** The island came out
as undifferentiated dirt, because a new map is floored across its whole
footprint and so is every patch it grows into (R-149), and `setBlocks` never
overwrites (R-159) — so every ground-level placement was silently refused. Both
rules did exactly what they say. The seed was asking the wrong one, and the fix
was `paintBlocks`. Worth recording because the failure was *silent*: the scene
built, saved and opened, and only a count of families said anything was wrong.

**And the new scene immediately paid for itself.** Occlusion on it costs 9.7 ms
framed and 9.1 ms twelve ticks in — flat across the camera, which is R-175
holding on a scene it was never tuned against. The same sweep before that change
went 10.5 ms to 30.7. A fix verified only on the scene that motivated it is a
fix you are taking on trust.

The old figures are kept under a heading that says they are not comparable,
rather than deleted. What they taught outlived the scene they were taken on.

### D-248 — Shadows, and an afternoon spent moving a sun that was never the problem · `agreed`
The GM wanted the building tool to look like somewhere playable before moving
on to tokens and vision, and thought lighting was the gap. Half right: there
were already three lights. What was missing was that **nothing cast a shadow
onto anything else** — `castShadow` appeared nowhere in the renderer. Faces were
shaded by angle and corners by occlusion, which is why it read as a well-shaded
diagram.

**three.js has the cheap version and this codebase was already shaped for it.**
Shadow mapping is one extra pass over the scene, redrawn every frame by
default; `shadowMap.autoUpdate = false` makes it redraw only when told. Nothing
here moves by itself, so "when told" is: the geometry changed, or the sun did.
That is R-170 one level down.

**What it costs**, on the Tollkeep at the reference camera (R-179), which is
exactly the comparison the reference scene was built to allow:

| | before shadows | after |
| --- | --- | --- |
| gpu, occlusion **off** | 1.9 ms | **3.3 ms** |
| gpu, occlusion on | 11.6 ms | 11.2 ms |
| draw calls | 23 | 23 |
| the frame that opens the map | 48.9 ms | 47.8 ms |

So **1.4 ms** of per-frame cost, which is the fragment shader sampling the
shadow map — and nothing at all against the occlusion pass, which swallows it.
Redrawing the map itself is not in that figure: it happens on the frame that
rebuilds the body anyway, and that frame did not get slower.

**And then the part worth writing down.** The first build looked unchanged. So
the sun was moved, on the theory that it threw its shadows up the screen behind
their casters; then lowered from 58° to 33°, on the theory that a keep twenty
wide and nine tall was shadowing its own footprint; then a genuine bug was found
and fixed, where `fitShadows` re-derived the light's *direction* from a position
it had just overwritten with a surface-centred one, so every edit rotated the
sun. Three changes, three rebuilds, and the scene still looked identical.

It was none of them. Setting the hemisphere and ambient lights to zero made an
enormous black shadow appear instantly: **the shadows had worked from the first
build**, and were invisible because the rig was built for a world where nothing
casts. A hemisphere at 0.9 and an ambient at 0.4 against a key of 1.1 leaves a
shadowed surface collecting more than half its light from the sky.

Two of those three changes were worth keeping anyway — the sun's angle is
better and the drift was a real bug — but they were fixes in search of a
symptom, and the symptom had one cause nobody had looked at. **The thing that
found it in thirty seconds was turning off everything except the one light
under test**, which is the oldest trick there is and was reached for last.

Fill is now 0.4 and 0.12 against a key of 1.9.

### D-249 — The GM's light controls · `agreed`
Asked for as: a directional light with angle, colour, intensity and a switch;
an ambient light with colour, intensity and a switch. Built as four controls
rather than six, and the reasons are the interesting part.

**The single angle is the best idea in the request.** Ten to a hundred and
seventy, one arc, which makes it an *hour* rather than a bearing — a thing a
GM says out loud. Elevation alone is enough because the compass direction the
sun rises in is a fact about the world, not a knob. Named as well as numbered:
dawn, morning, midday, afternoon, dusk.

**The switches went.** A level that reaches zero already is one, and two
controls for one state invites "on, but at zero". The cost panel's toggles are
not a precedent: those are diagnostics, there so a reading can be A/B'd
against the numbers beside it.

**There were two fill lights, not one.** A `HemisphereLight` *and* an
`AmbientLight`, which is two of something a GM was about to be handed one
control for. Collapsed to the hemisphere, because it tints by surface normal —
a cube's top reads sky-coloured against its sides, where a flat ambient lights
all six faces identically, and for a scene made of cubes that is most of what
shape there is. The GM picks one colour; the ground half is that colour
darkened.

**The hour has to refit the shadow camera, not just redraw it.** At the lowest
angle a shadow is five and a half times its caster's height, so a box sized
for midday clips the evening — and the growth is capped at the footprint,
because every texel the box gains is a texel the map loses (R-180).

**Console-local, deliberately and temporarily.** It belongs in the save beside
the level band, so the table is lit the way the GM set it — "it is dusk" is
scene-setting for the players, and a sun only one screen can see is worse than
no sun. But the table receives only its band (R-85, R-146), so the moment the
GM cuts away a roof the table's scene has no roof, and what a sun should do
then is a question the GM is still thinking about. The panel does not change
when it moves; only where the state is kept does.

**Two small ones found by looking at it.** The colour swatch ate its row,
because `input { width: 100% }` is a base rule and a swatch left to itself
obeys it, collapsing the slider beside it to its thumb. And a native range
control in a dark dock renders as a bright grey bar with a blue thumb, which
reads as something broken — it gets the dock's own colours.

### D-250 — The hour belongs to the table · `agreed`
D-249 shipped the light controls console-local, with a note saying they
belonged in the save. The GM's answer: *"I want the light configuration to be a
scene shareable thing, I want the GM setting it and players receiving the
configuration."* Which is right, and for the reason the note gave — a sun only
one screen can see is worse than no sun.

**It is play state, not authored.** A keep is a keep at every hour; what time
it is belongs to the session, beside where the party is standing and which band
the table is shown. A dungeon that is *always* dark would be a property of the
place, and is a different field on a different object.

**No schema bump.** A save with no `lighting` reads as daylight, which is what
every save written before there was a sun to set already meant — the fourth
time D-187's "the absence says what it means" has paid for itself, and the
reason R-144 has not been tripped once.

**The trust boundary moved, deliberately.** The table view carried exactly one
piece of save data — the party's position — with a comment saying so and a test
asserting it. That test failed the moment lighting was added, which is the test
doing its job: it exists so that sending the table something new is a decision
rather than a diff. Lighting is not a secret. Discovery answers *what is
hidden*; the bands answer *what has been cut away*; the hour tells a player
nothing they are not looking straight at. So it is sent, as its own named field
in `viewFor` rather than by widening what `save` means there, and the test now
reads "the party position and the hour, and nothing else" with a second test
that no wire ever contains `discovery` or `ranges`.

**And a bug that only shows on a round trip.** With the console reading
lighting straight from the view, setting the sun's colour and then its strength
inside one round trip lost the first: both compose a whole description from a
value that has not come back yet, so the second overwrites the first. Three of
five settings vanished in the first end-to-end test. The console now holds the
hour while the GM is working and adopts the save's value when a campaign opens
— the same shape as the tool and the brush, with a broadcast attached.

Verified on two screens: the GM set dusk with a warm sun and the table's
terrain went orange; set midday and the same terrain, same camera, went blue
and sand half a minute later.

**Still open**, and the GM is thinking about it: what a sun should do when the
band has cut the roof away. The table receives only its band, so a cellar it is
shown has no roof above it and a sun floods it, while the console — which holds
the whole body — shows it dark. Shipping shadows created that; making the hour
shareable did not change it either way.

### D-251 — Leaving a map lost the world's shadows · `closed`
Found by the GM: *"if you get into a poi map and exit, the world map loses the
shadows."*

Entering a map refitted the shadow camera to its footprint and centred it on
the map (R-180). Leaving one did not refit at all — so the camera stayed parked
over a 96-cell box somewhere the world is not, and the world, hundreds of cells
across, fell outside the frustum entirely. Nothing was wrong with the shadows;
they were being drawn for a place nobody was looking at.

One branch: `setMap(null)` now refits to the world, the same call
`setCampaign` already made.

Worth noting what made it findable. The fit is **conditional on which surface
is open** (R-148), and every conditional path has a matching one that is easy
to forget — `setCampaign` fits the world *only if no map is open*, which is
the mirror of the line that was missing. Two halves of one rule written in two
places, and only one of them was written.

### D-252 — The sun is the world's, the ambience is the place's · `agreed`
One lighting for everything was wrong, and the GM found the case that shows it
before it bit: *"what if a POI is an emerald cave, and I want to have a green
ambient light, so I create the scene add this greenish lightning and then when
I go back to the world map, I see al greenish."*

The first proposal here was a whole `Lighting` per point of interest with a
"follows the world" null and a toggle to reach it. The GM cut it to the right
shape: **the hour and the sun stay shared, because they are the world's; only
the ambience is per place** — and no toggles, because every place simply has
one. That is smaller, and it is also more honest: a cave does not have a
different *sun*, it has no sun at all.

**Two kinds of thing, two homes.** The hour is *when* — play state, in the
save, changing through a session. A place's ambience is *what that place is* —
authored, on the `Poi`, in the campaign, under undo, and carried when a
campaign is duplicated. A cave is green every session; a save that remembered
it would lose it on the next one.

**The table gets the resolved light.** Its ambience is where the party is
standing: the point of interest's inside, the world's outside. `viewFor` works
it out, because it is the one place allowed to decide what a client learns.

**And the test that was written to catch a leak caught one.** It asserts that
no wire the table receives contains the cave's colour — and it failed, because
a point of interest's ambience was riding along inside the *campaign* rather
than the lighting field. The table receives visible points of interest with
their bodies stripped (D-184); their light had to be stripped with them. Two
fields, one rule, and only one of them had been written — the same shape as
the shadow bug the GM found an hour earlier (D-251).

**One more place needed the same resolution.** The console's own stage was
still being handed the world's ambience, so a green cave stayed daylit on the
GM's screen while the table would have had it right. `viewFor` resolves for
the table; the console is not looking at a view of its own screen and has to
compose it itself.

Verified by hand afterwards: the cave green, the sun turned to zero to show it
plainly, then the sun restored and the world stepped back out to — unchanged,
blue and sand, with the card relabelling itself from "Tollkeep" to "the world".

### D-253 — The Sun is a step on the ladder · `agreed`
The GM's idea, and it is better than either option I had put up: *"we change
the 'sky' wording on levels to 'sun', whenever the GM takes the 'sun' out of
the leveling (meaning is showing something inside), we disable the sunlight and
its configuration."*

**Why it is better.** My two candidates were a heuristic (infer "interior" from
whether the band had been cut) and a derived bit sent to the table. Both have
the renderer guessing at meaning. This has the GM *stating* it — with a control
they were already using, where the consequence is visible, and where the name
of the thing says what leaving it out costs. Nothing is inferred.

It also closes the question honestly rather than cleverly. A slice does not
hide a roof, it removes it: the body handed to the renderer is an open-topped
box, and "cut away" and "no roof" are the same cubes. No amount of looking at
geometry distinguishes them. Somebody has to say which, and the GM is the only
one who knows.

**Per point of interest**, on the GM's correction mid-build — *"this is a
per-POI rule, so if I edit the levels band, it doesn't affect the world map or
other POIs."* It already was, because the band is: `rangeFor(save, poiId)`. But
"already true" is worth a test rather than a claim, so there is one that cuts
one place's band and then checks the world and a second place still have their
sun.

**The GM's setting is not written away.** Only the lighting handed to the
renderer has its sun zeroed; the save keeps the strength they chose, so raising
the band gives back the daylight they had rather than nothing. Also tested,
because the tempting implementation is to write the zero and lose it.

**One function for two screens.** `litBy` is used by `viewFor` for the table
and by the console for itself. The console is not looking at a view of its own
screen, so it cannot be told — and two screens deciding separately is two
chances to disagree, which is the shape of D-252's bug from an hour before.

**What it costs, stated plainly.** The rule applies to the whole slice, not to
the enclosed part of it: cut the roof off a keep standing on an island and the
island loses its sun too, because the GM is looking at a cross-section of
everything. Whether that is right is a judgement rather than a bug — a
cross-section of a building is not a place the sun is shining on — but it is
the thing to look at first if this ever feels wrong.

**And a known false positive**: an outdoor place with nothing above it, whose
band the GM trims to hide a tower, goes dark. Raising the band to the Sun fixes
it, and that is discoverable from the notice.

### D-254 — Tokens cast no shadow, and that is a decision not an omission · `agreed`
Written before tokens exist, because two messages before it was written I
suggested the opposite — "pawns neither cast nor receive, that's two lines to
add when we get there" — and the next person to look will have the same
instinct. A gap nobody argued for gets filled in by reflex.

The GM's design for a token: a **round base with a card clipped to it**, gold
for the party and silver for everything else, the card carrying the character
and **always turned to face the camera**.

**A billboard breaks the rule shadows are built on.** R-180 keeps the shadow
map off the per-frame path by never redrawing it when the camera moves — a
directional light's shadow camera is fixed to the scene, not the view, so
turning the camera owes a frame and owes the shadows nothing. A card that
rotates to face the camera makes that false: its geometry changes on every
orbit, so its shadow is stale unless the map is restaged on camera movement.
That converts the shadow map from on-change back to effectively every-frame,
paid on the most frequent event there is.

**And it would look wrong even if it were free.** A flat card's shadow is a
rectangle face-on and a line edge-on, so orbiting the table would make every
token's shadow swing and collapse. Geometrically correct, reads as a bug.

**Carried lights, later, for the same reason.** A point light that casts needs
a cube shadow map — six faces — redrawn whenever its bearer moves, and a
confirmed move would have to restage. When that round comes, the cheap version
is `castShadow = false`: the pool of light without the shadow, which is most
of the effect for almost none of the cost.

**Nothing is lost in grounding.** A token with no cast shadow usually reads as
floating; occlusion already darkens the crease where a round base meets the
floor, and that is the cue that makes a thing look *placed*. It is already
paid for.

**Receiving is a separate question and stays open.** `castShadow` and
`receiveShadow` are independent: receiving costs a lookup against a shadow map
that already exists and does not depend on the card's orientation, so none of
the above applies to it. A token walking into a building's shadow would
visibly darken. Whether that is wanted is legibility, not cost — on a shared
screen a token you can always see may beat a token that is correctly lit — and
it can be settled when there is a token to look at.

### D-255 — Tokens come before vision, and this round they are the party's · `agreed`
R-43 measures eye height from the floor of a token's cube, and the party had no
cube. `inside` said which map they were in and nothing about where in it — so
vision (R-40 to R-48) waits for a round that gives every member a place to
stand.

Asked whether the silver tokens come with them — everything that is not the
party (D-254) — the GM's answer: *"Later."*

The reasons it can wait are also the reasons it should:

- **Vision needs only the party's.** Fog is the union of what party tokens see
  (R-15); whether an enemy can see the party is off-tool (R-76).
- **An enemy's honest gate to the table is fog**, and fog does not exist yet. A
  per-token "shown" flag now would be the permissive version D-184 refused to
  ship and tighten later.
- **Where one lives is its own question.** A goblin placed while prepping a
  dungeon is arguably authored — campaign, under undo, there again for the next
  group — and the same goblin mid-fight is play state. R-9's Build/Play split
  was written for exactly that, and was never built.

So a token, in the code, is a party member standing in a map. Nothing in this
round assumes it stays the only kind.

### D-256 — Where the party stood is remembered per map · `agreed`
*"Remembered per map."* The same shape as the band (D-201), and for a reason
that is particular to tokens: opening a map the party can see walks them into
it (D-200). A GM who peeks at "the tavern underground" while the party stands
in the tavern moves them there, and with positions dropped on leaving, that
peek would have cost everyone their place in the room they came from.

Coming back puts them where they were. A cube that was built over while they
were away cannot be stood in, so that one position is dropped on the way back
in and the member is placed again — repaired at the boundary from what the
blocks say, which is R-157's instinct.

### D-257 — The card is the member's colour · `agreed`
*"The color of the player, no label, when we get to the point of having the
image, that will be enough. For now, the square of the card should match the
player's color."*

I had proposed the colour with an initial on it and a name label above. Neither:
the square is the colour, exactly, and that is the whole of the card until it
has a picture. Exactly is the operative word — a card lit by the scene would be
a different colour at dusk from the one in the party panel, so the card is not
lit (R-187).

### D-258 — Move is the map's third tool · `agreed`
Moving a figure is something the GM does all session, so it gets a tool rather
than a button in a panel: **Move**, key 3, beside Build and Paint. It amends
R-162's two.

The alternative — tokens clickable under Build — is the precedence R-87c
removed: a tool names what it picks, and Build picks faces. Move picks a token,
then a floor while aiming, which is Travel's sequence one surface down (R-132);
and like Travel it arms itself when there is someone to place and nothing to
pick up (D-167).

### D-259 — How a token stands, and what the table is told · `agreed`
The defaults that came with the round — *"The rest is all good"* — recorded one
by one, because each is a choice:

- **One empty cube, on a block, one token to a cube.** Placing needs footing;
  one per cube for R-119's reason, since a click on two tokens in one cube is
  ambiguous. The aim is a block's **top face** and the token goes in the cube
  above it. A side face aims at nothing, so pointing at a wall never puts
  somebody on top of it.
- **In the band means standing inside the storey shown** — the cube and the
  floor under it both inside. That is what a storey is (a plane belongs to what
  is above it, R-146), and it is the reading under which the table can check
  its own aims without being sent anything outside the band. `viewFor` sends
  only those, and a table move outside is refused with a reason that names the
  band, never a block: a refusal must not report what is behind a cut.
- **Edits never move a token.** Build clips around the party's cubes the way it
  clips around blocks already standing (R-162). Erasing under a token is
  allowed — that is a trapdoor, and a trapdoor is the GM's move — and leaves it
  floating, which is R-34's case: the base marks the cell, and a token with
  nothing under it draws a stalk to the first block below. Undo is snapshots
  (R-140a) and can still wall somebody in; the GM moves them (R-39).
- **One intent**, `moveToken`, for the first placement and every move after it
  (D-150). Open to the table seat (R-136), refused unless the party is in that
  map, and only the console arms a placement (D-167).
- **The table's third field.** `tokens` joins the party's position and the hour
  as save data the table is sent, named in `viewFor` (D-250).
- **No save schema bump.** A save without tokens is a party nobody has placed,
  which is what every save before this one meant (D-187).

### D-260 — The card faces the camera, and the base takes the shade · `superseded by D-266`
D-254 left two things to be settled by looking, once there was a token to look
at. Both were put side by side on the Tollkeep, with the alternative patched in
through the stage's debug handle so the comparison was the same frame.

**The card turns fully to the camera**, not only around the vertical. Upright,
a card is foreshortened by the cosine of the pitch: at 75°, the steepest step
(R-31), it is a quarter of its height — a coloured sliver on a gold coin. Fully
facing, it is a square at every pitch; it leans back over its base as the view
climbs, which reads as a card propped on a stand, and in an orthographic view
it projects at its true size. On a shared screen the square is the point.

**The base receives shadows; the card is unlit.** With receiving off, a token
standing in the keep's shadow keeps a bright gold base, and it looks pasted
over the shade rather than standing in it. With receiving on, the base darkens
with the floor around it — which is the grounding D-254 said occlusion would
give, and the shadow gives it too. The card stays legible either way, because
it is unlit for D-257's reason: the square must be the member's colour, at dusk
as at noon.

Proposed rather than agreed, because the call was mine by looking and D-254
said it was the GM's to make. Either half is a one-line change.

### D-261 — What six tokens cost, and what could not be measured · `agreed`
On the reference scene at the reference camera — the framing the Tollkeep opens
with (R-179) — six tokens against none, per drawn frame, shadow map not being
redrawn:

| | draw calls | triangles |
| --- | --- | --- |
| occlusion on, no tokens | 23 | 273,557 |
| occlusion on, six tokens | **47** | 274,925 |
| occlusion off, no tokens | 9 | 136,776 |
| occlusion off, six tokens | **21** | 137,460 |

Two meshes a token — the base and the card — and occlusion rasterises the
scene twice, so four draw calls each with it on. The token-free row matches
MEASUREMENTS.md to the triangle, which is the reseed proving itself (D-262).

Rebuilding the six on a move: **0.35 ms** median, 1.6 ms worst, over twenty.
And across those twenty moves the shadow map was never marked stale, where one
body change marks it at once — R-180's economy intact (D-254).

**The GPU figure was not taken.** The Browser pane was not on screen, so the
page was hidden and drawing two to four frames a second; a timer query under
those conditions measures a card clocked down between frames (D-230), not the
cost of six cards. A number taken that way would have looked like a result and
been noise, so there is none. Draw calls doubled on paper and GPU time is the
only figure that says whether that matters; R-173 measured twelve extra calls
as nothing on this card, and instancing the tokens is the lever if a reading
says otherwise (O-029).

### D-262 — The reference scene's save is part of the scene · `agreed`
R-179 made the scene a script so that nothing about a measurement depends on a
file somebody happens to still have. It was true of the body and not of the
save, which the seed wrote empty — and the copy on disk had drifted in both:

- **28 hand-placed cubes** of soil and rock on the grass south of the keep, on
  top of the documented 11,398;
- the band cut to **Bedrock–4**, so the table had no sun (R-183);
- the hour moved to **170°**, dusk;
- the party **inside the Tollkeep with no world pawn** anywhere.

Every one of those changes a reading — fewer cubes drawn, shadows gone — and
nothing on screen says the scene is not the scene. The seed now writes a save
too: chunk Known, place Revealed, the party's pawn on Toll Crossing, the party
inside the Tollkeep with six members standing on four levels — two in the
hall, one upstairs, one in the cellar, two on the grass — in daylight, uncut.
Each cube goes through the same `whyNotStand` the host uses, so a cube that
cannot be stood in fails the seed loudly instead of leaving somebody unplaced.

Two consecutive seeds: **byte-identical body**, identical token cubes. Ids are
fresh per run as before, so reseeding rewrites the tracked files under
`data/`; D-134 already accepts that churn.

### D-263 — The table works out its ceiling rather than being told its band · `agreed`
R-138 says a client must not offer a move the host will refuse, and the host
refuses a table move outside the band (R-185). The table cannot see the band:
it is sent a slice, never the cut, and D-250's test says `ranges` never reaches
it.

**Sending it the band was the obvious fix and the wrong one.** It would widen
the trust boundary for a convenience, and the second test of D-250 exists to
make exactly that an argument rather than a diff.

**It does not need it.** A band always rests on a stop (R-161), and the table
holds the plane list. So its ceiling is the first stop above the highest level
it was shown: any cube below that is certainly inside the band. That is enough
for the common cases — the whole map uncut has the Sun as its only stop above
anything, so a party can be stood on a roof; a storey cut to its planes has its
next slab as the ceiling, so nobody is stood inside it.

**Conservative, and the edge is named.** A band whose top levels hold nothing
reads as ending lower than it does, so the table refuses a cube the host would
have allowed — standing on the highest thing in an otherwise empty-topped
band. That refusal leaks nothing and asks the host nothing; it is the safe
direction to be wrong in, and the GM can make the move from the console.

### O-029 — The GPU cost of tokens · `resolved by D-267`
D-261 took everything that does not depend on frames being drawn at speed.
The GPU A/B — six tokens against none, occlusion on and off, the camera turning
so the cards work, six samples each — needs the Browser pane on screen or the
GM's Chrome. Draw calls doubled; this is the reading that says whether that
matters, and whether instancing the tokens is worth doing.

### D-264 — The seed is typechecked, and `scripts/` stays outside the graph · `agreed`
R-73 says one `tsc -p tsconfig.json` typechecks the whole repo, but its
`include` names the workspaces folder by folder, and `scripts/` arrived later
(D-247) without joining it. Nothing checked the seed's types — not even
`npm run seed`, because `tsx` strips types without checking them. A domain
signature changing under it would show only if it broke at run time;
otherwise it could quietly build a different scene, and every figure in
MEASUREMENTS.md is anchored to that scene (R-179).

**One program, one more folder.** `scripts/**/*` joins the `include` rather
than getting a tsconfig of its own, which R-73 rules out. Node types need
nothing: no `types` list is set, so `@types/node` loads for the whole program,
as it already does for the host.

**It stays outside the dependency graph.** R-5's graph is of workspaces, and
`scripts/` is not one — that would be an R-7 decision of its own. ESLint
already lints it, R-6's package-specifier check included. Adding it to
`npm run arch` was tried and adds nothing: the layer and barrel rules all start
from `packages/` or `apps/`. **The edge left open:** a relative import from
`scripts/` past a package's barrel passes `npm run verify`. The seed imports
barrels only, and closing that would be a rule of its own.

**The rest of what sat outside joins too:** `test/**/*`, so the guard that keeps
the docs honest (R-102) has its own types checked, and `vitest.config.ts` and
`apps/*/vite.config.ts`. All of it already typechecked. `eslint.config.js` is
JavaScript and stays out.

Section 3's enforcement list still named TypeScript project references, which
D-059 removed: an import of an undeclared package typechecks, and only
`npm run arch` fails it. The list now says so. No new choice, only D-059
written where it was missed.

### D-265 — The wheel's `preventDefault` never ran · `closed`
Found in the Browser pane, on both screens: every wheel tick over the canvas
logged `Unable to preventDefault inside passive event listener invocation.`

React attaches its `wheel`, `touchstart` and `touchmove` listeners as
**passive**, so the `preventDefault` in each shell's `onWheel` was ignored —
with that error, once per tick — and whatever the browser does with a wheel
went ahead regardless. The zoom itself worked, so nothing on screen said
anything was wrong.

**Both shells now add their own listener** to the canvas with
`passive: false`, in an effect keyed on the canvas and the stage. The canvas
comes from `useStage`, which already held it in state for the playbook's
callback-ref gotcha; an effect reading a ref would find no canvas on the first
run and never look again.

**And the step moved to `client-core`.** Each shell spelled out
`deltaY > 0 ? 1.12 : 1 / 1.12` for itself — the wheel was the one camera
control still kept in parity by two files remembering it, which is what D-197
ended for the keys. `wheelZoom` now sits beside `cameraAction`, with its tests
under R-156.

**Behaviour unchanged, and measured.** Before and after, each build on an
isolated host with its own copy of the data: the old one logged an error per
tick and left `defaultPrevented` false on both screens; the new one logs
nothing and cancels the event. On the console three ticks out take the zoom
from 34 to 47.77, which is 34 × 1.12³, and three back return it to 34 exactly.
On the table three ticks in frame the scene identically on both builds, and
three out return to where it opened.

Kept as it was, and worth a decision of its own: an event with no vertical
movement — `deltaY` of 0, a sideways scroll — counts as scrolling up, so it
zooms in.

### D-266 — The token is a card on a stand, and the whole of it turns · `agreed`
**Supersedes D-260's card half.** The GM, on the token D-260 described: *"the
token looks weird, I want a real 3d object for the card"* — and then, on the
options I came back with: *"I don't know why you invent so much, I wanted a
coin as base, with a card (plane) on top"*, with a photograph of a playing card
standing in a small brass clip on a flat brass plate.

What was asked for, as asked:

- **One object: a base, a clip, and a card standing in the clip.** The card is
  a plane, upright, in the member's colour; the base and the clip are gold. The
  base follows the picture — a flat square plate — because the picture was the
  answer to the question about the base, though the GM's words call it a
  coin. A round coin is one line if that was the meaning.
- **The whole token turns, and only about the vertical.** *"the full object,
  base + card, rotate together, so there is no camera facing that sets the card
  perpendicular to the camera… the coin should rotate clockwise or
  counter-clockwise to make the full token point to the camera, but the
  rotation is just in 1 axis."* It turns by the camera's own yaw, on drawn
  frames, so during a turn it keeps pointing at the view.
- **No effects.** Ordinary lit materials, like every cube around it: no
  self-glow, and the card no longer unlit. So a card is the member's colour in
  the scene's light — plainly brighter from the side the sun is on — rather
  than the panel swatch exactly. It still casts no shadow (D-254: it turns
  whenever the camera does) and it receives, as cubes do.
- **Colour only.** The image waits for its own round (D-257 stands on that).

What I got wrong is worth a line. The first card turned fully to the camera
and was unlit, which in an orthographic view looks the same from every angle —
a sticker on the glass, which is the "weird". And then, asked for a 3D card, I
answered with a lean angle, a self-glow, a choice of rotations and a texture
pipeline — four questions the GM had not asked, about a world that is cubes. A
design the GM describes is built as described before it is improved on.

From overhead an upright card is a strip, which is what a card on a table looks
like from above; the plate still says where they stand, and the strip still
says who. Triangles fell from 114 a token to 26; draw calls rose from two
meshes a token to three. Neither shows on the GPU (D-267).

### D-267 — Tokens cost nothing on the GPU, measured · `agreed`
Resolves O-029. Taken in the Pane with it on screen — 120 frames a second, the
document visible — on the Tollkeep at the framing it opens with, the camera
turning so every frame is drawn, six samples each, alternating:

| | six tokens | none |
| --- | --- | --- |
| **coin and card** (D-260), occlusion on | 6.5 / 6.3 ms | 6.1 / 7.0 ms |
| coin and card, occlusion off | 2.8 / 2.7 ms | 2.7 / 2.7 ms |
| **card on a stand** (D-266), occlusion on | 13.1 / 13.0 ms | 13.1 / 12.9 ms |
| card on a stand, occlusion off | 2.3 / 3.0 ms | 3.1 / 2.5 ms |

Inside the noise both times. The two pairs of rows are not comparable with
each other — the first was a 903 × 635 canvas with the party moved off the
seeded cubes, the second 1728 × 1015 on a fresh seed — only each row with its
neighbour. Occlusion's share grows with the canvas, as R-175 says it does.

Which answers the question the GM asked about the base — would a rectangle
help with triangles? The rectangle did cut them, from 1,368 to 312 for six
tokens with occlusion on, and the stand added draw calls, 24 to 36. The GPU
saw neither. At this scale a token's shape is a question of looks; the cost
is the post-processing, as MEASUREMENTS.md has said since the church.

### D-268 — The base is square to the grid; the clip and the card turn · `agreed`
**Amends D-266's "the whole of it turns".** The GM, having seen it: *"can we
edit that so there is an offset of 45 degrees between the base and the
grabber, in that way, the base matches the grid, but the thing that grabs the
card and the card should be like they are now… The base should not cover the
full grid."*

So the plate never turns. It sits square to the cubes around it, like the
cubes do, and from the diagonal camera (R-31) it reads as a diamond. The clip
and the card turn together about the vertical by the camera's yaw, exactly as
before — which at every one of the four resting views puts them 45° to the
plate, and through a turn leaves the plate where it is while the card follows
the view.

The plate stays at 0.7 of a cube, so it never covers the cell, and the card
turned across it stays inside its edges: a card 0.5 wide at 45° reaches 0.18
from the centre against the plate's 0.35. The pick volume already took in the
plate's corners (R-187), so picking is unchanged; so are the meshes, the
draw calls and the triangles in D-267.

### D-269 — A poker card, and a token exactly one cube tall · `agreed`
**Supersedes D-268's sizes.** The GM: *"reduce the base a little bit more, like
a 10%, then do the card to have a poker card proportion (i think it's 4:3,
confirm), but the full token should be 1unit of height, so increase the card
size."*

A poker card is **2.5 by 3.5 inches — 5:7**, not 4:3, which is nearer a
photograph's; a bridge card is narrower still, 2.25 by 3.5. The card was 5:7
already, so only its size changes.

| | was | now |
| --- | --- | --- |
| plate | 0.7 square | **0.63** square — ten percent less |
| card | 0.5 × 0.7 | **0.664 × 0.93**, 5:7 |
| top of the token | 0.77 | **1.0** exactly |

The card's foot sits where the clip grips it — plate 0.05, clip 0.12, gripped
0.1 deep, so 0.07 up — and its height is the rest of the cube. Written as that
sum in the code, so changing the clip cannot quietly push the card through the
ceiling: a token in a passage one cube high still fits, its top edge touching
the roof. The pick volume was already a cube tall and wide enough for the new
card at any turn. At rest, turned 45° across the plate, the card's corners
reach 0.235 from the centre along the grid against the plate's 0.315.

### D-270 — Every message rebuilt the map, and the world with it · `closed`
Found while reading for the vision round, which made it urgent: fog changes on
every step a token takes, and R-69 keeps fog an attribute precisely so a step
never rebuilds a mesh. Both screens were rebuilding the map and the world on
**every message from the host** — measured with a counter added to the cost
readout for the purpose: one notch of the hour slider, play state and nothing
else, built the world and the map again on the console and on the table.

**Why.** Every message is parsed from text, so every part of it arrives as a
new object, and both screens decide what to rebuild by identity — a decode
memoised on the map's wire, an effect keyed on the campaign. A map that came
back equal was never the same map. R-19a's two channels were written down and
never held on the screen side.

**Three changes, each small:**

- **The screen keeps what did not change** (`keepUnchanged`, in client-core's
  net client). The view that arrives has every part that is equal by value
  replaced by the object the screen already holds; anything that changed is new
  all the way up. Still replaced wholesale (R-64) — nothing is mutated. 0.05 ms
  a message on the reference scene.
- **The stage skips what it already has.** `setMap` with the body, materials
  and surface on screen, and `setCampaign` with the campaign on screen, return
  without building. And the terrain is rebuilt only when the *world* changed:
  a map edit makes a new campaign, but decoding hands back the same `World`
  for an unchanged world wire (a cache like D-219's, on the decode side), so a
  cube placed in a cellar no longer rebuilds the terrain outside.
- **The console's effects read what they use.** Its campaign effect was keyed
  on the whole save, so a token stepping re-ran it; it reads discovery, so it
  is keyed on discovery. The same for the pawns and the placement.

**Measured** on the reference scene, both screens, the counter in the readout:

| | before | after |
| --- | --- | --- |
| the hour changed | world and map rebuilt | **nothing** |
| one block placed | world and map | **the map** |
| undo | — | **the map** |

**And a correction.** D-261 measured that a move never marks the shadow map
stale — through the stage's debug handle, calling `setTokens` directly. True of
the stage. False of the screens until now: the message every move produced
rebuilt the map, and a rebuilt map restages the shadows.

### D-271 — Sight is of space, not of surfaces · `agreed`
The rules fixed nearly everything about vision — one eye 1.2 cubes up (R-43),
lines tested against a handful of points and any clear one wins (R-41), whole
cubes (R-42), sealed seams (R-44), only blocks occlude (R-74, R-75) — and left
one thing open: **which points a line is aimed at.** That is the whole
difference between two answers, and they part company at a chest-high wall.

- **Surfaces.** Aim at points on a block's faces: a block is seen when the eye
  can see it, the way a camera would render it — the prototype's answer. A
  member standing against a one-cube wall cannot see the floor behind it for
  about seven cubes: the wall throws a long shadow over the ground, though
  anything standing up there is seen.
- **Space.** Aim at points *inside the empty cubes*: a cube of space is seen
  when the eye can see into it — could you see someone standing there? — and
  the blocks around the space seen are what is shown: the floor under it, the
  walls beside it, the ceiling over it.

The GM, having asked how either would actually be calculated: *"It's option 2,
then."* Space.

**The technique, as built.** A line from the eye to a point is walked cube by
cube with Amanatides and Woo's traversal — exactly the cubes the segment
passes through, in order — and stops at the first block whose material stops
sight (`lineIsClear`, in `geometry`). For each member, every cube within their
range that could show something — empty and touching a block, or a block sight
passes through — is tried at nine points: its middle, then its four top
corners, then its four bottom ones, inset from the faces so no line runs along
a grid plane. The first line that gets through settles it. Open air touching
nothing is not asked about at all: it has nothing to show and nobody can stand
in it, and leaving it out is most of what makes sight cheap.

**What it buys.** R-43's rule of thumb becomes exactly true: the eye sees
into the space beyond a one-cube wall and so the floor there, two cubes block,
and standing one cube higher buys one more. It is how grid games and virtual
tabletops think about sight — squares where someone could stand — and when
silver tokens arrive (D-255), whether one is seen is the same question asked
of the cube it stands in.

**What it costs.** The floor behind a low wall is shown though the eye could
not literally see that floor. It answers *what is there*, not *what a camera
sees*, which is R-39's licence: predictable over precise.

**Seams, one step firmer than R-44 said.** A line that runs exactly along an
edge or through a corner is stopped by any solid cube that edge or corner
belongs to — two cubes touching corner to corner, which is R-44's case, and a
single cube's edge too. A line exactly on an edge is a coincidence the next
point will not repeat.

**Measured** on the reference scene: six members' sight, nothing cached,
**10 ms** median; 3,168 cubes of space seen, which show 2,706 of the 11,398
blocks.

### D-272 — The eye under a ceiling one cube up · `agreed in D-278`
A token may stand in a passage one cube high (R-184) — D-269 made the token
exactly one cube tall so that it would fit. An eye 1.2 up would then be inside
the block over its head, and an eye inside a block sees nothing at all.

So **when the cube above stops sight, the eye sits just under it**, at 0.9 —
inside the member's own cube — and they see along the passage. Anywhere else it
is R-43's 1.2. Proposed in the plan for this round as a default and not
objected to; a call of mine all the same.

### D-273 — The host keeps sight, and the table is sent only what the party has seen · `agreed`
**When the party looks.** After every intent that goes through, and when a
campaign opens. What the party sees depends on where its members stand, on the
blocks, on their ranges and on which map they are in, and nearly every kind of
intent can change one of those — undo included — so the look is a hook in
`apply` rather than a call each handler has to remember (D-169's reasoning).
Sight is kept per body, tokens and roster, so asking again when nothing changed
costs **0.26 ms**; a move costs **8 ms** for six members.

**What is kept.** What the party has seen of each map is in the save
(`explored`), beside where they stand and the band, as R-4's sketch always said
it would be: **cumulative** (R-45), remembered per map, never shrunk but by the
map's deletion, and untouched by undo, which is about the campaign (R-140).
Packed like a body (R-59): runs over its own box, so a map growing afterwards
cannot shift it. A save written before vision has seen nothing, and the look on
opening fills it in — no bump (D-187). One intent is one write: a save the look
grows replaces the write the intent already asked for.

**What the table is sent.** The map the party is in, cut to the band and then
to **only the blocks the party has been shown** — R-85's standard one step
finer than the band: what lies beyond the last wall they looked over is not on
the table, and the fog is its absence. Vision narrows the band and never widens
it (D-200). And a fourth piece of play state, `fog`, named in `viewFor` for the
hour's reason (D-250): the space seen inside the band, and which of the blocks
it was sent the party sees now. Of R-45's three states only two need saying;
the third is absence.

**Until somebody stands in the map, the party has seen nothing in it**, and the
table is shown none of it. That is the GM's brief from D-200 — *"they will see
what the tokens can see, so the GM will need to add the tokens … when the scene
is ready"* — which until now could only be the band.

**Drawn as an attribute.** In sight is lit as before; explored is greyed and
dimmed; never seen is not drawn — on the table because it was never sent. A
step that shows nothing new is a colour write and no rebuild (R-69): measured
on the table, a member walking back over ground already seen changed the
picture with the rebuild count still. A step that reveals blocks rebuilds the
table's body once, 1.9 ms.

### D-274 — The console's Party's view, and each member's sight · `agreed`
R-76 required the console to show the table's picture. Asked how, the GM chose
**a switch, off by default** — the console builds on the whole map as before,
and *Party's view* draws exactly what the table has: the band, unseen blocks
gone, explored ones greyed. Only while the party is in the open map, because
the fog is theirs. While it is on, everything R-159 says about levelling holds
— a placement outside the band is refused, a fill counts what it cannot show —
and hidden blocks are scaled to nothing, so they cannot be picked.

**Sight ranges are edited in the party card inside a map** (R-46): a field per
member, in cubes, committed when the GM is done typing (R-163). Inside a map
because a range of cubes means nothing on the world map (D-154).

### D-275 — The smaller calls that came with vision · `agreed in D-278`
Listed in the round's plan as defaults and not objected to, but each a choice:

- **Range is a sphere from the eye**: twelve cubes as the crow flies, to the
  point that is seen.
- **Explored is the map as it is now**, not a picture of it as it was. A room
  the party saw and the GM changed afterwards shows the change. R-39: the GM is
  in the room, and a remembered picture would cost a copy of every room seen.
- **The players may only stand somebody where the party has seen** — a cube of
  space in `explored`. Any block in a cube seen, and the floor under it, is one
  the table was sent, so past that check a refusal can name what is there; the
  check itself says only *"the party has not seen that"*. The table is sent the
  space seen so it can tell before asking (R-138). The GM stands anybody
  anywhere (R-39).
- **The table lights only what it has.** A building the party has not seen
  casts no shadow on their screen, because it is not there. The same family as
  D-250's open question about a sun over a cut roof.
- **D-018 — the party's fog is the union across the party — is built as
  stated**, and has been `proposed` since round 1. R-15 already said it; this
  asks for the word.

### O-030 — The diagnostics (R-48) · `closed by D-276 and D-279`
R-48 specifies two GM-only diagnostics: a **ray overlay** — the sight lines
from a chosen member to the block pointed at, green through and red stopped,
the stopping block marked — and an **eye view** from a member's position. The
GM asked what they were; explained, and not yet decided. The ray overlay is the
quick way to check D-271 is doing what it says, and is the suggestion.

### D-276 — No eye view · `agreed`
**Supersedes D-036's eye-view half.** Asked whether the two diagnostics of
R-48 should be built, the GM: *"The eye view: don't want it at all, not now nor
never."* There is one way to look at this tool, the god view of R-29, and now
not even a debugging exception to it. R-48 keeps only the ray overlay, which
is still undecided (O-030).

### D-277 — A fresh start in a map · `agreed`
The GM: *"We need a button to forget everything in the map, with confirmation
like the delete buttons we have. Because this is a normal behavior, the GM adds
a token while preparing the scene, moves it around to check walls are ok,
levels work ok, reset the memory, all fresh for the real play."*

**Forgetting takes the party off the map as well.** The party looks around
after every intent (R-190), so anybody left standing there would see it all
again the moment the memory was wiped, and the walk-through's last position
would leak into play. So `forgetMap` clears what was seen of that map and who
stands in it, and nothing else — other maps keep both. The members wait to be
placed, which is where play begins (D-167 arms the first of them).

**It asks first, like a delete** (R-151): a `×` at the foot of the party card,
then *Forget* and *Keep* in its place. Play state, so undo cannot bring it
back (R-140) — which is the reason the question is worth asking. The GM's
alone, like everything that rewrites what the table knows.

### D-278 — The GM's answers on vision's open calls · `agreed`
Each one asked plainly, after the first round of answers showed the questions
had not been — the GM asked what "fog over what you see" could mean, how a
cube that is not drawn could be lit, and what a "room" was. Answered:

- **D-272 — the eye under a ceiling one cube up: "option 1".** The eye drops to
  just under the ceiling, inside the member's own cube, and they see along the
  passage. Only a block directly on the member's head does it; a ceiling two
  cubes up or higher changes nothing. The alternative was to forbid standing
  under one — no crawlspaces for tokens.
- **D-275 — the sphere: "correct."**
- **D-275 — explored is the map as it is now.** *"Why a room? every block
  should be like this, how do you define a room?"* There is no room: "room"
  was the wrong word for what is built, which is **per block** — every block
  touching space the party has seen is shown as it is now. Removed, it is gone
  from their screen; added, it appears. That is what the GM described.
- **D-275 — where the players may stand somebody: "both, currently visible
  blocks and discovered but not visible right now."** Lit ground and greyed
  ground alike — anywhere on their screen. As built.
- **D-275 — shadows only from what the table holds: "it's ok, no change
  needed."** The question as first put said *lights*, which was the wrong word:
  it was about shadows. A block the party has not seen is not on their screen,
  so it casts no shadow there either, and sending it to them only for its
  shadow would give it away.
- **D-018 — "it's shared, correct."** One view for the whole table: whatever
  any member sees is shown to everyone, never a view per player. In the round 1
  vocabulary, the party's fog is the union of what every token sees.

The ray overlay (O-030) is the one call still open.

### D-279 — No ray overlay, until testing asks for one · `agreed`
Closes O-030. The GM: *"No ray overlay, close it, we will add it if by testing
this we find weird issues."*

So neither of R-48's diagnostics is built: the eye view never (D-276), and the
ray overlay not until the fog does something that cannot be explained without
seeing the rays. It would be a GM-only drawing of the lines `lineIsClear` walks
— from one member's eye to the points of one cube, green through and red
stopped (D-271) — and nothing in vision as built is in its way.

### D-280 — The world is painted in two axes: ground and cover · `agreed, built in D-281 to D-284`
The design for the world round, settled in conversation and written before any
of it is built, because it took several wrong turns to reach and none of them
are worth taking twice.

**What prompted it.** The world map looks plain beside a map's cubes: no grain,
no figures, and still `MeshLambertMaterial` while maps moved to Standard in
D-238. It drifted because nothing tied the two together — maps use the
**materials** registry and the world used a separate **terrain** one, so every
appearance feature since D-237 landed on one side only.

**The first answer was wrong.** I proposed terrain borrowing a material for its
appearance while keeping `defaultDifficulty` for its rule. The GM saw through
it: *"terrain is not about materials, it's about a group of them — it's not
just grass, it's not just wood, it's forest or jungle, the combination."*
Forest is not a substance. It is grass with trees standing on it.

**So the world is painted in two axes**, and a biome is what you get rather
than what you pick:

```
Column { height, ground: SwatchId, cover?: CoverId, difficulty?: Difficulty }
```

- **Ground** is a swatch from the materials registry — the same one maps use,
  so lava edited once looks like lava everywhere, which was the GM's ask.
  `Terrain` and `TerrainId` stop existing.
- **Cover** is what stands on it: trees, pines, scrub, boulders. Absent on most
  cells, and **one per cell** to begin with. A density, light scrub through to
  dense jungle, is a later question.
- `difficulty?` is the per-cell override that already exists (R-77), untouched.

**Why two axes and not a list of biomes.** Enumerating Forest, Jungle, Taiga,
Oasis, Scrub repeats the mistake D-245 undid: thirteen materials whose identity
was a colour held four near-duplicate pairs, and families × cuts gave more
expression from fewer permanent ids. A biome list has the same shape, and every
entry is forever under R-11. Ground × cover gives sixty-odd combinations from
about eighteen entries, and snow + trees is taiga without anybody inventing
taiga.

**Presets give the one click back, and cost nothing.** "Forest" sets ground to
Grass and cover to Trees in one go. The load-bearing part is that a cell stores
*ground and cover, never "Forest"* — so a preset is a shortcut, not an entity.
It can be renamed or deleted freely and R-11 never touches it.

**A cover is made of swatches too.** A tree is a Wood·oak trunk under a
Vegetation·leaves canopy; a pine is Wood·dark-oak and Vegetation·dark. Retune
the Vegetation family and every forest on every map follows. No substance is
described twice anywhere.

**Difficulty multiplies.** The existing numbers are already reciprocal speed
multipliers from the 3.5 overland table, so grass 1 × trees 1.5 = 1.5, sand
1.5 × trees 1.5 = 2.25, and impassable stays impassable whatever stands on it.
Sixty-five combinations and no hand-authored table.

**Settled along the way**

- **Derived, not stored.** A cell's colour variation and its cover's placement
  come from a hash of the coordinate, so retuning a material restyles every
  world that uses it, and two forest cells differ without storing anything.
- **Hard edges are fine.** Forest meeting grassland is a line and the GM shapes
  the transition by hand. Not worth a blending model.
- **Covers are representations.** A world cell is 1.5 km across, so a tree is a
  map symbol — the same idiom as the place markers already on the world. I
  spent four paragraphs deriving this and the GM's reply was the correct one:
  *"is the house you added as a POI in the world map at real scale? It's a
  representation."* The map was already symbolic. Nothing needed deriving.
- **The POI map does not change.** Its paint tool opens the material panel and
  paints swatches, and that is already right.

**What the round has to carry**

- `Terrain`, `TerrainId` and `DEFAULT_TERRAIN` removed; `Column.terrainId`
  becomes `ground`.
- **A world migration.** Saved worlds hold `terrain:grass` and friends, so a
  tolerant read maps the twelve old ids onto swatches — the same move as the
  pre-D-175 POI shape, read-only, written as swatches from then on (R-137a,
  R-144).
- The chunk wire, the travel cost lookup, the paint intents and
  `parseTerrainId` in `sim`.
- The world mesh: per-material split (R-173), `MeshStandardMaterial`, grain and
  figures — which is what finally makes it match the maps.
- Cover geometry, instanced, and the second paint tool.

**One correction worth keeping.** I claimed figures would be barely visible on
the world. The opposite: the world opens at zoom 34 against a framed map's
153.6, so a world cell is about four and a half times larger on screen than a
map cell. Figures will read *better* there than where they were tuned.

### D-281 — Difficulty moves onto the materials registry · `agreed`
The first piece of the world round (D-280). Before a world cell can hold a
swatch instead of a terrain id, the thing a swatch names has to be able to say
how hard it is to walk on — otherwise the move would delete a rule rather than
relocate it.

**A family carries a difficulty; a cut may override it.** `Difficulty` —
`number | 'impassable'` — moves out of `terrain` and into `materials`, where it
is now the only property a cut may vary besides colour (R-192, amending R-176
and R-178).

**The override is not a convenience.** Liquids are one family because water,
green water and a shore scatter light identically, and a shore is the one a
party can wade: 3 against impassable. Light says one mesh, movement says two
costs, and both are right. Dark leaves at 2.5 against leaves at 1.5 is the same
shape. Without the override the registry would have had to split families the
renderer wants kept together.

**Absent means inherited.** A cut states a difficulty only when it differs, so
the common case is one number on the family and retuning it reaches every cut
that did not opt out. `difficultyOf(material, cut)` is the single reader.

**First-pass numbers**, carried over from the terrain table's reasoning rather
than reinvented: Brick 0.75 (a road is dressed stone), Mineral 1.5, Soil 1 with
sand and snow at 1.5, Grass 1, Vegetation 1.5 with dark leaves 2.5, Wood 1,
Liquids impassable with shore 3, Glowing impassable, Glassy 1.5. Tuning values,
not ids — revisable (R-11 protects ids only).

**Left standing for now.** `terrain` still exists and still compiles; it just
imports `Difficulty` from its new home. It dies in the next increment, with the
tolerant read that maps the twelve old ids onto swatches.

**One thing D-280 did not notice.** `TravelMode.overrides` is keyed on terrain
ids — a boat overrides `terrain:water`. Once ground is a swatch, a boat does
not care whether it is on water or green water: it cares that the family is
Liquids. So the override table has to key on the **family**, not the swatch,
which D-280's list of work did not say. It belongs to the increment that
deletes `terrain`.

### D-282 — The world holds swatches, and both maps share one palette · `agreed`
The second piece of the world round (D-280). `Terrain`, `TerrainId` and
`DEFAULT_TERRAIN` are gone; a `Column` holds a `ground: SwatchId`.

**One palette, in two panels.** The map's material list was lifted out as
`SwatchPalette` and the world's terrain list replaced with it. They had to be
the same component rather than the same shape, because the same shape is what
drifted: the world's list was still `MeshLambertMaterial`-era while the map's
grew families, cuts, figures and a chosen line.

What differs between them is a sentence, not a layout, so that is all the
caller supplies — a map says whether what is in hand sees through, the world
says what it costs to cross. The world puts the cost on each cut's tooltip as
well, because that panel is scanned while deciding where a road goes.

**The old worlds read, and the twelve ids are a table.** `GROUND_FROM_TERRAIN`
maps them onto swatches on the way in; worlds are written as swatches from then
on (R-137a, R-144). Two of the twelve are honest losses, recorded because they
are decisions and not bugs:

- **Forest and jungle arrive as undergrowth.** A cover is the second axis and
  does not exist yet, so the closest ground is Vegetation — which happens to
  carry forest's old 1.5 exactly. The GM repaints with the Forest preset when
  covers land.
- **Hills lose their flat 1.5.** A hill is *height*, and the slope factor
  already charges for climbing it (R-52a). The old palette added a difficulty
  on top because a terrain had nowhere else to say "hilly"; two axes mean it
  does.

**The wire kept its field names.** A chunk still sends `palette` and
`terrainRuns`, now holding swatches, because renaming them would have been a
schema bump that bought nothing — the packing, the run-length encoding and the
decode cache are all unchanged (D-220, D-270). What changed is the regex, which
now admits both spellings and maps one.

**`terrainCost` became `groundCost` and lost its palette argument.** It used to
be handed the registry; it now reads the one registry there is. Its override
table keys on family first and swatch second, which is the gap D-281 flagged:
a boat cares that it is on Liquids, and only the shore is special enough to
name.

**What is left of the round.** The world mesh is still one
`MeshLambertMaterial` and still flat (increment 2), and covers do not exist
(increment 3). The world now *holds* the right values; it does not yet draw
them.

### D-283 — The world mesh splits per material, like a map's body · `agreed`
The third piece of the world round (D-280), and the one the GM asked for first:
*"I would love to share the same materials between the world map and the poi
map, it should look all the same, also using the MeshStandardMaterial both."*

**One `InstancedMesh` per material (R-173), not one for everything.** The world
was a single `MeshLambertMaterial` with a per-instance colour, which is why
lava on the world was painted grey while lava in a room glowed: roughness,
emission and opacity are uniforms, and one mesh can only hold one set of them.
The split is the same one `blocks` makes and costs the same nothing — nine
families is nine draw calls where the world already made twenty.

**What came with it, all of it already written:**

- `MeshStandardMaterial` with the family's roughness, glow and opacity. Water
  and glass transmit on the world now, which they did not.
- **Grain** (R-172): a hash of the cell's global coordinate nudges lightness in
  HSL, so two cells of one ground differ without storing anything. This is the
  "derived, not stored" variation D-280 settled, and it turned out to be a
  function that already existed.
- **Figures** (R-177), through the same `figure()` the cubes use. The
  coordinate is the world position, so a figure drawn on a world cell is at the
  same scale as one on a cube — which is right, because a world cell is a
  representation and not a photograph of 1.5 km of ground.

**The height cue stays.** High ground reads lighter, by a plain multiply after
the grain. It predates lighting and survives it: a world is seen from directly
above, where a sun says very little about which way the land slopes.

**Picking moved from one mesh to a group.** `addressOf(instanceId)` became
`cellOf(hit)`, and the stage raycasts the group's children nearest-first rather
than one mesh — otherwise a sea cube in the first mesh would hide the hill
behind it.

**The figure switch had to be reapplied on rebuild**, the same trap the blocks
hit (D-244): a rebuilt world is new materials, and new materials come up with
the figure on regardless of what the diagnostics toggle says.

### D-284 — Covers: the world's second axis, built · `agreed`
The last piece of the world round (D-280), and the one the whole two-axis
design was for. R-193 and R-194 are new.

**Four covers, not a dozen biomes.** Trees, pines, scrub and boulders, each a
couple of primitives made of swatches. Against nine ground families that is
sixty-odd combinations from thirteen permanent ids — and adding boulders gave
badlands *and* dunes without either being an entry.

**Fourteen biome presets, and they are not entities.** "Taiga" loads
Soil·snow and pines into the two brushes; the cell stores those two and has
never heard of taiga. The list is free to be renamed, retuned or deleted in a
way the twelve-entry terrain palette it replaces never was, because nothing
references it. The test that earns its keep is the one asserting taiga and
tundra share a ground and differ only in cover: neither entry was added for
either name.

**Two tools.** The GM left this open — *"2 tools grant us the chance to
customize more, 1 tool simplifies"* — and D-280 picked two. Built that way:
each brush edits one axis and neither disturbs the other, so repainting a
forest's floor to snow gives a taiga rather than a clearing. **What is not yet
answered is the stroke count**: a preset loads both brushes in one click, but
painting a forest is still two strokes over the same ground. Worth revisiting
with the GM; the fix is small either way, and nothing about the stored shape
would change.

**What the tests caught.** The "every part is a swatch the registry knows"
check failed on its first run: `material:mineral/grey-rock` is Mineral's
*default* cut, and R-176 refuses the default spelled out. That is precisely
the silent failure the test was written for — a cover part with a bad swatch
has no colour to be obviously wrong in, it simply draws nothing.

**Costs, all small.** Two meshes per cover kind however many are planted. The
wire sends a second palette and run stream, and only for chunks that have
something growing in them — a bare world sends nothing, which is also what
every chunk written before this says (D-187). No schema bump.

**Not decided, deliberately.** Covers do not fade out when the camera pulls
back. At the world's opening zoom they are already a couple of pixels and read
as a tint on the ground, which is the right answer for free; a zoom gate like
the markers' (R-83) can be added if the tint turns out to be noise.

### D-285 — No biome presets; a cover is two of a thing · `agreed`
The GM's pass over covers, and one of the five reverses a call D-280 made
before any of it existed.

**The biome presets are gone, registry and all.** *"Lets give the GM the
chance to create by parts, not a third option of doing all together."*

D-280 reasoned that two axes cost the GM a click they did not use to pay and
that presets would give it back. Having built them, the panel answered the
question: a third control that says in one word what the two beside it say in
two is not a shortcut, it is a second vocabulary. And the words it needed were
"Forest" and "Taiga" — exactly the names the two axes exist to stop anybody
having to agree on. The open question D-284 flagged (a preset is one click but
painting a forest is two strokes) is answered by deleting the preset: two
strokes is what two axes cost, and paying it is how the GM builds by parts.

`DEFAULT_BIOMES` and its module are deleted rather than left unused. A
registry with no reader is not a spare part, it is a thing that goes stale.

**Covers are two clumps, not one object.** *"I would love to have 2 trees and
pines as we have 2 boulders or scrubs per place."* Scrub and boulders were
already pairs and the trees were not, which is why a cell of forest read as a
specimen on a plinth.

This needed a real change, not two more parts: the pose was computed **per
cell** and shared by every part, so adding a second tree would have given two
trees that moved as one and every cell the same pair. The unit is now the
**clump** — `CoverPart.clump` says which object a part belongs to — and the
hash is salted by it. A trunk keeps its crown; the tree beside it goes its own
way. Yes, seeded from the coordinate exactly as a material's grain is (R-172),
never random: the world is rebuilt whole on every edit, and a random jitter
would mean every forest shimmering each time the GM paints a cell.

The clump's *offset* is deliberately not rotated by its yaw — two clumps
orbiting the cell centre by their own angles can swing on top of each other.
The yaw spins each part about its own axis instead, which is the variety
without the collision.

**A broadleaf is stacked boxes, not a cone.** *"I want a more distinguished
tree, it looks almost like the pine."* Correct, and the reason is that colour
was doing the work: two cones of two greens is two conifers. A trunk under two
boxes narrowing upward reads as a different kind of tree at a glance, and it
is the shape the rest of this world is already made of.

**Meshes are grouped by geometry and material, not by part.** Two clumps would
otherwise have doubled the draw calls to say the same thing twice. The two
trunks of a pair of oaks are one `InstancedMesh` with two instances per cell —
three meshes for every tree in the world, which is fewer than the six the
first cut would have made.

**The tool grid is paired by purpose**: select & travel, places & height,
ground & cover. And the world borrows the map's icons — `✏` for Ground, `♟`
for Travel — because the same action should be the same picture on both
surfaces. The digits follow the panel's own order, so the keyboard hint moved
from "1–5 tool · 6/7/8 brush" to "1–6 · 7/8/9".

### D-286 — Palms and dead trees, and the test every cover has to pass · `agreed`
The GM's answer to the list of covers I proposed, and it came with a rule
worth more than the two entries: *"any cover we add should be there only if it
creates more difficulty, then having a pine, a normal tree or a palm is just
for the look."*

**R-195.** A cover's difficulty is above one or it does not exist. That
settles the open half of the list in one line — ruins and cactus were on it
because they would look good somewhere, which is not a reason for a permanent
id. It also settles the other half: a palm costs exactly what a pine costs,
and the four wooded covers sharing ×1.5 is not a redundancy to clean up. Cost
is the axis; look is free once the cost is paid.

**No density.** *"Density will not be a thing, I believe is adding too much.
Toppings are already adding difficulty to a plain terrain, enough for a world
builder of this detail level."* The two-axis argument does not recurse — it
was right for ground × cover and would be a third axis here for a distinction
a GM at 1.5 km a cell cannot see. The question is closed, not deferred.

**No jungle cover either**, because palms cover it: *"palms can be reused in
the jungle biome or in the desert."* Which is the two-axis design paying out
again — the ground says whether sand or dark undergrowth is underneath, so
one entry is an oasis in one cell and a jungle in the next.

**Palms are a trunk and three planks in a helix**, the GM's own shape. That
needed one new thing in the vocabulary: `CoverPart.turn`, a rotation about the
part's own axis, added on top of the clump's. Three planks at sixty degrees
and a hair apart in height is a propeller from the god camera, which is the
only camera this world has. No droop — a drooping frond wants a second angle
on every part in the project to buy one tree.

**Dead trees are the absence of a crown.** Every other wooded cover is a trunk
under something; this is the trunk alone with two bare limbs, which reads as
blight at any distance at which it reads as anything.

**Two things the tests caught.**

- The "no two wooded covers share a silhouette" check failed on its first run,
  comparing shape names: a dead tree is a cylinder and two boxes, and so is a
  broadleaf. That was the test being a crude proxy rather than a real
  collision — what separates them is that one pair of boxes is a wide green
  crown and the other is two brown sticks — so the check now compares shape
  **and size**.
- The "stays inside its cell" check was measuring extent per axis, which a
  turned part makes meaningless: a plank 0.26 long and 0.07 wide swings its
  length into z at sixty degrees. It measures the bounding circle now. The
  palms passed either way, but only by luck.

**Appended, not slotted in beside the other trees.** The panel reads the
registry in order, so the wooded covers are no longer adjacent in the list.
Order here is purely presentational — nothing stores an index — but a registry
that is append-only except when the order looks untidy is not append-only
(R-11). Grouping them is a sort in the panel if it ever matters, not a
reorder here.

### D-287 — A label is measured in pixels, and the halo behind it is the AO pass · `agreed, half fixed`
Two bugs the GM has been looking at for a while, in one caption. They turned
out to be unrelated, and only one of them is fixed here.

**The drift: the size was in pixels and the offset was in world units.**
`scaleLabels` sized a caption so it is 13 px tall whatever the zoom, and then
the caption sat at a fixed `+0.45` **world units** above what it named. Zoom
out and 0.45 units is two pixels, so the name sits on the marker; zoom in and
it is thirty, so it flies off. The same code, the same bug, in the places and
in the pawns.

Fixed by putting both in the same frame: a label carries the world height it
must clear, and one `floatLabels` sets its size *and* its height from a pixel
gap divided by the zoom. It also folds the two copies of `scaleLabels` into
one — they caption the same way (R-90) and had the same bug twice.

**The halo is the occlusion pass, and it is not fixed.** The black
parallelogram behind every name is `GTAOPass`. It renders the scene with an
**override material**, and a `Sprite`'s geometry is a plane in its own local
XY — the camera-facing part lives in the *sprite shader*, which an override
replaces. So the AO pass sees an upright quad standing in the world where the
caption is, and shades the ground around it. That is why it is grid-aligned
rather than screen-aligned, why it is indifferent to the sun, and why it
scales with the caption rather than with the world.

Four hypotheses were wrong before that one: a shadow of the label (the sun
crossed the whole arc and the shape did not move), the sprite's own pill
(colouring it red left the black behind), the sprite's quad (filling the whole
quad green showed the quad horizontal and the black shape elsewhere), and
depth pollution (`depthWrite: false` changed nothing visible).

~~The keyboard toggle for occlusion does not reach its handler.~~ **Wrong, and
retracted (D-289.)** The toggle works; the synthetic keypress used to test it
did not carry `code: 'Backquote'`. The pass was ruled out last because of a
faulty instrument, and the entry blamed the product for it — which is the
worse of the two mistakes, because a rule that records a bug nobody has sends
the next person looking for it.

`depthWrite: false` is kept anyway. A caption that does not depth-test should
not depth-write either; it was not the cause and it is still right.

**Why it is not fixed here.** Keeping sprites means keeping them out of the
occlusion pass, and three.js gives no object filter for it: the pass renders
one scene with one camera, so layers cannot separate what the AO sees from
what the screen sees. The real fix inside the pipeline is a second scene for
captions and a second render pass — strictly more machinery than taking them
out of the pipeline altogether. See O-031.

### O-031 — Captions as DOM, not as sprites · `closed by D-288`
The question the halo raised (D-287): should a map caption stop being a
three.js `Sprite` and become an HTML element positioned over the canvas, with
`CSS2DRenderer`?

**The case for.** A sprite is in the scene, so it fights every screen-space
pass we own and every one we add later — the occlusion halo is that bill
arriving once, and bloom or fog would send it again. A DOM element is in none
of them. Text is rendered by the browser at the display's own resolution
rather than magnified from a 64 px canvas. Offsets are already in pixels,
which is the frame a caption wants (D-287). A `CSS2DObject` parents to the pin
exactly as the sprite does, so nothing about positioning changes. And it is
*less* code: no canvas per place, no texture, no `aspect`, no `floatLabels`,
no disposal.

**The case against, such as it is.** A second DOM layer over the canvas that
must not eat pointer events, and it must be sized on resize beside the
renderer. Captions would no longer be anti-aliased by the composer's
multisampled target — they would be sharper, not softer, but they would also
no longer sit *inside* the picture, which matters if we ever screenshot the
canvas alone.

**Not decided yet**, because it changes how text looks on both screens and the
GM should see it before it lands rather than after. Everything it touches is
in `render/places` and `render/pawns`, which R-23 exempts from tests, so there
is nothing to protect here but the eye.

### D-288 — Captions are DOM · `agreed`
O-031, taken. R-196 is new.

**What it fixed.** The black parallelogram behind every name, which was the
occlusion pass drawing a sprite's quad flat in world space (D-287), and which
had no cheap fix while captions were in the scene: three.js gives the pass no
object filter, so the only way out was a second scene and a second render —
more machinery than leaving the pipeline entirely. And text that is now drawn
by the browser at the display's resolution rather than magnified from a 64 px
canvas.

**What it cost.** A `<div>` over the canvas, mounted by the stage into the
canvas's parent, with `pointer-events: none`. The parent is given
`position: relative` only when it has none — both apps already position
theirs, so neither changed at all.

**One thing had to be rebuilt rather than carried over.** Clicking a place's
*name* selected it, because a `Sprite` is raycastable and the name was one.
An element that passes pointer events through is not, so the pick now tests
the pointer against each caption's rectangle before the ray. Letting the
caption take the click instead would have moved that gesture outside the
canvas handler that owns every other one (R-87c), for a name that is the
easiest target on the map.

**The stylesheet is injected by `render`, once per document**, rather than
asked of each app: `render` makes the markup, so it owns the look, and an app
that forgot the rule would get unstyled text over its map with nothing to say
why. One class at the lowest specificity, appended before an app's own sheet
runs, so overriding it stays easy.

**Checked on both screens**, by what is actually in the DOM rather than by
eye alone: the layer mounts into each canvas's parent, matches the canvas size
exactly, reports `pointer-events: none`, carries the one caption the console
is showing and none inside a map. By eye: the halo is gone, the name holds its
place from the zoom threshold down to the closest the camera goes, it still
disappears with its marker past `MARKER_ZOOM` (R-83), and clicking it still
opens the place.

**Deleted along the way**: `nameLabel`, `floatLabels`, `Label`,
`LABEL_PIXELS`, `LABEL_GAP`, both copies of `scaleLabels`, and the canvas and
texture each caption used to allocate.

### D-289 — A caption's node has to be taken out by hand · `agreed`
The ghost captions: four hundred and nineteen `<div>`s reading "Toll
Crossing", stacked where the camera had been each time, the real one
disappearing past the zoom threshold while the dead ones stayed. Reported from
a map the GM was building, with a count to match — 492 rebuilds, 419 orphans.

**The cause is a comment I wrote in D-288 and did not check.** It said the
captions need no disposal because "three.js takes their nodes out itself, on
the `removed` event every `CSS2DObject` listens for". The event is real and
the listener is real. It fires on **the object removed from a parent** — and a
caption is a grandchild: the stage removes the marker *group* from the scene,
which says nothing to the captions hanging two levels under it.

The markers are rebuilt on **every accepted intent**, so the leak ran at the
speed the GM was painting.

`dropCaption` now detaches each one explicitly, and both builders call it from
`dispose`. Two lines in it on purpose: `removeFromParent` is the event the
class is waiting for, and `remove` covers a caption built and disposed without
ever being rendered, which never parented its node to the layer at all.

**What this says about the change it followed.** D-288's ledger of what CSS2D
bought listed "nothing to dispose", and that was the one item on it that was
not true. Moving work out of the GPU pipeline moved it into the document; it
did not make it disappear. The comment asserting otherwise is what let the
code ship without the four lines it needed.

**Also retracted here**: D-287's claim that the occlusion keyboard toggle does
not reach its handler. It does. The synthetic keypress used to test it was not
carrying `code: 'Backquote'`, and a faulty instrument got written into the
record as a product bug.

**Checked, not assumed, this time.** Camera motion alone — six turns, six
tilts, twenty zooms — leaves the count at one, so nothing leaks per frame. In
a throwaway campaign, eleven rebuilds driven by real paint strokes also leave
it at one. Before the fix those eleven would have been eleven.

### D-290 — Markers are kept when nothing they draw has changed · `agreed`
The caption that "tilts while I paint the ground, even when I paint far away
from it". It is not tilting and the distance is a red herring: it is being
**destroyed and rebuilt**, and every paint anywhere does it.

**Measured before touching anything.** A twelve-step drag produced eleven
`remove`s and eleven `add`s on the caption layer, every one of them carrying
*the identical transform*. The label never moves. It is torn out of the
document and a fresh node put back, eleven times in under a second, and what
that looks like on an isometric map is a name that blinks and shifts.

**The cause is one unconditional line.** `setCampaign` disposed and rebuilt
the place markers on **every accepted intent**, whatever had changed — a cube
placed in a cellar, a note added, a coastline painted. The world next to it
has had an identity check since D-270; the markers never got one.

A marker is drawn from its place and the height of the cell under it, and
from nothing else. So `PlaceMarkers.matches(campaign)` compares exactly that,
as a string, and the stage keeps the markers when it holds. A **value** check,
not an identity one: `places` is decoded fresh from the wire on every message
and only the world has a decode cache.

**Confirmed on the GM's own map**, and it took three attempts to make the test
mean anything. The first drag ran while the caption was off-screen, so there
was no node to churn. The second painted grass onto grass, which R-165
identity-preserves into no intent at all — the rebuild counter did not move.
The third painted mineral over grass with the caption in the document: the
counter went 1 → 3, so the world really was rebuilt twice, and the DOM churn
was **zero**. Both false starts would have read as a pass.

**What it also buys.** The markers are geometry too — a handful of meshes and
materials built and thrown away on every brush cell before this.

### D-291 — The world's brushes are 1×1, 3×3 and 5×5 · `agreed`
*"Can you put brush sizes into the same shape for world map and poi? I think
POI's brush is the correct one 1x1, 3x3 and 5x5. World map 2x2 looks
uncentered and doesn't add a good use."*

Both true. **2×2 has no centre cell**, so it had to lean one way off the
pointer — forward, the voxel-editor convention, which is defensible and still
reads as the brush sitting half a cell from where you are aiming. And two
sizes one step apart said less than three a stride apart: 1, 3 and 5 is a
cell, a patch and a stroke.

The map settled this already (R-164) and the world simply had not followed.
There is a test asserting the two lists are the same, so they cannot drift
apart again.

`clampBrush` now snaps to the nearest listed size rather than rounding, and
`[` / `]` step through the list — arithmetic on the number would land between
them. `brushCentreOffset` is zero for every size now and **stays exported and
stays called**: the hover outline reads it instead of assuming, so an even
brush could return without the outline drifting off the cells that get
painted.

### D-292 — Covers get their own question, not the world's · `agreed`
The same mistake as D-290, found by looking for it rather than by being bitten:
the cover field was rebuilt whenever `sameWorld` was false, which is **every
ground paint, every height change, every cover stroke**. Painting a coastline
moves not one tree, and re-instancing a continent of forest per brush cell is
what asking the wrong question costs.

Twice in one round, from the same confusion: *"did the world change"* is not
*"did what I draw change"*.

**The signature is cached on the chunk, not recomputed over the world.** This
is the part worth keeping. A signature that walked every column of every chunk
on every intent would have swapped a rebuild for a slightly cheaper walk,
which is not a fix. A `Chunk` is identity-preserved when nothing in it changed
(R-165), so an edit makes exactly one new chunk object and every other one
answers from a `WeakMap`. The cost of asking is one chunk, whatever the world
costs to draw.

**Both signatures are exported and tested** (R-23b). The builders need three.js
and R-23 exempts them, so the rule moved out to `coverSignature` and
`markerSignature` where it can be checked — and it has to be, because neither
failure looks wrong on screen. The markers and the trees come back identical;
all that shows is the cost, and the caption that blinked.

The test states the GM's own observation as the first case: the ground painted
**far from a cover** and the ground painted **directly under one** both leave
the signature alone. The distance never mattered, because the rebuild was
never about distance.

**One thing nearly went with it.** `fitShadows` sat inside the branch I was
restructuring and followed the covers out of it. The shadow camera is sized to
the terrain, so it belongs with the terrain's rebuild; it is back there.

### D-293 — The route, and the first thing to read the difficulty model · `agreed`
O-019, opened. R-197 is new.

**Nothing read any of it.** `cellCost`, `groundCost`, `isPassable`,
`DEFAULT_SLOPE_FACTOR` and `DEFAULT_TRAVEL_MODES` had, between them, **zero
non-test consumers**. Material difficulty (R-192), a cut's override, a cover's
multiplier (R-193), a mode's family-keyed overrides, the 0.83 slope factor —
all written, all tested, all inert. A GM could paint a jungle on a mountain
and the map said what it said about a meadow. That is the strongest argument
for this round and it was sitting in a grep.

**A\\* over the world's cells**, eight-way, diagonals at √2, costed exactly as
R-52a states. Known chunks only (R-133). A budget of 12,000 settled cells,
because this runs on pointer move.

**Four tests had to be rewritten because the router was right and I was not.**
Worth recording, because each one is a fact about the model rather than about
the code:

- It walks **around** a single raised cell rather than over it. Two diagonals
  beat a climb, so a one-cell bump measures nothing; the ridge has to span the
  chunk before the slope charge is observable.
- It walks **through** a wide belt of trees. Rounding the end of a fifteen-cell
  belt costs far more than the ×1.5 once.
- Stepping aside one cell and back is two diagonals where it would have been
  two orthogonals: **2√2 against 1 + d**. So a cell is worth avoiding only
  once it costs more than **1.83** — trees at ×1.5 are not, dark undergrowth
  at ×2.5 is. That margin is tighter than it looks and is now pinned.
- Painting a whole row leaves nothing to step aside *to*, so a detour test has
  to block one cell, not a line.

**What is not here.** The route is computed and nothing draws it yet, which is
the next increment: under the pointer during the aim step of R-132, where the
sequence was built to take it. O-020's confirm menu — transport, pace, days —
follows that.

### D-294 — Diagonals, and the corner they may cross · `agreed`
I decided this silently inside D-293 and the GM caught it: *"We didn't speak
about diagonals!"* Correct, and it had already shipped a bug — water at (5,4)
and (4,5), and the route walked (4,4) → (5,5) straight across the point where
the two meet. Land that the map does not show.

**Eight-way, because days are the output.** Four-way movement can only follow
the axes, so a diagonal journey costs two steps where it should cost √2 — a
**41% overestimate**, 0.77 days against a true 0.54 over ten cells on foot.
Blocky routes are a look; a map whose job is "how long does this take"
reporting half again too long is a lie. Distance honest first, line tidy
second.

**The corner stays open, and the argument is the GM's.** I offered a guard —
refuse a diagonal when both orthogonal neighbours are impassable — and it was
turned down for a better reason than I had for adding it: *"rivers should
never be drawn like diagonals, they should be zig-zags."* Which is true of the
GM's own map, where the river runs in orthogonal steps, and true of the medium
— a diagonal chain of 1.5 km cells does not read as a river, it reads as a
dotted line.

So the squeeze needs a shape nobody paints. Guarding it would put a check on
every diagonal step of every search to forbid a case the map cannot honestly
show. **Travelling diagonally between two lakes is possible, and that is the
decision**, not an oversight.

**Two tests hold it there**: the corner crossing is asserted, with the
reasoning beside it so a later reader does not "fix" it; and the cells
themselves are still impassable, so a river one cell wide still cannot be
walked through.

**The lesson is the one about process, not pathfinding.** The diagonal rule is
a design decision with a number attached and it went into a commit without
ever being said out loud. The record is for exactly this, and it only works if
the decision reaches it before the code does.

### D-295 — The route, drawn · `agreed`
The second half of O-019: the router from D-293 now has something looking at
it. R-198 is new.

**A ribbon, and the GM chose it over outlined cells.** The outline the hover
already uses is right for one cell — it says *this one* — and wrong for forty,
where what is being read is a line going somewhere. The strip takes each point
to the height of its own cell, so it drapes rather than floats, which is half
of what the cost it previews is about.

Two pieces of arithmetic in it are worth the test they got, because both fail
as something that looks like a rendering glitch rather than a bug: the width is
laid off the **turn** and not the incoming leg, so corners neither pinch nor
notch; and it stays horizontal however steeply the ribbon climbs, or the line
would thin out exactly where the ground gets interesting.

**Recomputed on a new cell, and it needed no machinery.** The GM asked for it
and the answer was already in the codebase: `aim` is identity-preserving within
a cell (R-165) with a test that says so in as many words — *"identity, so a
pointer move does not re-render the world"*. The effect depends on the travel
state, so it does not fire until the cell changes. An A\* per pointer move was
the obvious reading of R-132 and would have been the wrong one.

**Seen working** on the GM's own map: the strip runs from the pawn to the
ghost, mitres its bends, and climbs the ground under it.

**What is deliberately still crude.** The mode is hardcoded to on foot, because
choosing it belongs to the confirm step (O-020) and putting a picker anywhere
else would have to move later. Nothing yet reports the **days** — `daysAcross`
exists, is tested, and has no reader, which is the same shape of gap this round
opened by closing. That is O-020's, and it is now the obvious next thing.

### D-296 — Gradient, not total ascent, and the mode answers it · `agreed`
The GM, watching a route: *"the travel recommends to do a huge climb instead
to go over the mountain steps."* R-52a rewritten.

**The model could not see gradient at all.** The cost was
`distance + 0.83 × total ascent` — linear in the totals, blind to how the
height was gained. Measured before changing anything: a sheer ten-level face
and a gentle ten-cell ramp, same horizontal distance, same total climb, came
to **18.30 and 18.30 exactly**. And whenever the steep line was *shorter* it
was strictly cheaper — ten levels in one step cost 9.3 against the ramp's
18.3. The router was obeying a rule that does not know what a cliff is.

**Tobler's hiking function replaces Naismith's constant**, and it is the same
kind of claim: derived, not chosen. Naismith is right about total ascent and
is only valid to about 1-in-5; we were applying it to vertical rock.
Multiplicative now, because a speed model gives a factor and because climbing
through a swamp is worse than either alone.

**The response moved onto the mode**, which was the GM's call and the better
design: *"keep these cases changeable depending on the transport… users may go
from bottom to top flying."* A walker takes 3.5, a horse 5, anything afloat 0.
A flying mode is `bite: 0` and needs nothing else built for it.

**No caps anywhere**, also the GM's call: *"players must be able to decide if
they want to do some climbing paying the cost."* The earlier worry about
stepping off a 5,000 m cliff is answered by arithmetic instead of a rule — 33
levels over one cell is 73,000 times a flat cell on foot, which nobody takes
by accident.

**Two corrections of mine, both worth keeping.**

- *Degrees are the wrong unit here.* I proposed a 31° cap for mounted travel
  and the GM objected that it would forbid the smallest possible step. They
  were reading the angle off the screen and reading it correctly: the
  renderer exaggerates height 4.5×, so one level is 5.7° in the fiction and
  **31.0° drawn** — the two collided on exactly my number. The cap would in
  fact have allowed six levels, but the lesson stands and R-52a now says to
  quote levels per cell.
- *I kept fragmenting the decision into separate questions.* Told to stop,
  and right.

**And one correction from the router, again.** My test asserted the cliff
should cost over 2.5× the ramp; it costs 1.85×. Not because the fix is weak —
because the route **takes the face at an angle**. A diagonal covers √2 cells
of ground for the same rise, so it is a gentler gradient and costs less. The
router invented switchbacks out of `grade = rise / run` and nothing else, and
that now has a test of its own.

### D-297 — The route is cells, not a ribbon · `agreed`
The GM, after we had spent a while trying to fix the cost model: *"I think
that what's adding noise is the ribbon, the diagonals with huge 2 steps of
height look weird."* Right, and it reframed the whole problem — the model was
fine and the **drawing** was lying.

**A ribbon has to interpolate and the world does not.** Between two cells a
step apart in height it drew a sloping plane the ground does not have. Across
a diagonal onto a two-level step it leant over a corner, which is the shape
that looked wrong. One flat square per cell claims nothing about what is
between, because there is nothing between — the world is cells.

Inset rather than filling each one, so a run of them can be counted. Filling
would join them into a band, which is a ribbon again with the same lie in it.

**What this closed.** We had been about to change the cost curve to make a
stepped route beat a diagonal one. It was possible — `bite > 8.37` against
Tobler's 3.5, computed exactly — but it cost the gentle end badly: a 10% hill,
the commonest slope on any map, would have dropped walking from 3.55 km/h to
1.68 against 5.04 on the flat. The GM's call was to leave the model alone:
*"we should comply with the work that's used everywhere, not invent things."*
The diagonal in their A→D example is genuinely the faster way — 41 minutes
against 51 — and it only looked wrong because the ribbon drew it wrongly.

**And one thing I kept getting wrong.** Twice in this round I proposed making
a diagonal account for the cells it passes between, which is the question
D-294 already answered. Told so the second time, plainly, and the answer has
not changed: passing between two cliffs does not make the trip harder.

**Seen working** on the GM's map: aiming across a stepped mountainside draws a
staircase of flat squares, each on its own column, instead of a plane tilted
across the steps.

### D-298 — The journey menu · `agreed`
O-020, built. R-199 is new, and O-020 is closed.

**A fourth step, not a fourth thing the click does.** The destination is
settled by the aim; what is left is how they make it. Keeping it in the
sequence rather than floating a dialog means the route stays drawn behind the
menu and **re-draws as the transport changes** — a ship and a walker do not
take the same way, so the decision is visible while it is being made.

**Every mode listed with its own answer.** The question is a comparison: a day
and a half on foot against fourteen hours mounted. One figure for the chosen
mode would hide exactly the thing being chosen. A mode that cannot make the
journey says "no way" and stays in the list, because that it was considered is
worth seeing.

That means one A\* per mode, which is affordable *because* this is the click
step. The aim step runs on a pointer crossing a cell and gets one search
(R-198); this runs once, on a click. And each mode is routed on its own rather
than re-priced off one line — a ship's way is the water a walker cannot cross,
so re-costing the walker's route for a boat would report a journey nobody
takes.

**O-006 turned out not to block it.** O-020 was recorded as waiting on travel
pace presets for the numbers. `DEFAULT_TRAVEL_MODES` has carried `kmPerDay`
for six modes all along, and transport and pace are one axis in it — "On foot
— forced march" is both. No second axis was needed or invented.

**A phrasing bug caught on screen, not in a test.** The first cut said "a day"
for anything between half a day and a day, which put the forced march and the
mounted ride on the same line when one is half again faster. Seeing them both
read *"a day"* is what showed it. It counts in hours right up to the day now,
and `journeyLength` moved to `client-core` beside `travelPrompt` — it is "what
to tell the user", the same kind of thing — so it could be tested at all.
The summary line also read "1.2 days by on foot": the mode names carry their
own preposition.

**The table display is unchanged**, and this is the one loose end. R-134 says
both screens run the same sequence, and now the console has four steps and the
table has three. Choosing transport is a GM decision about fiction and
resources, so the divergence is probably right — but it is a divergence, and
R-134 should be made to say so rather than quietly not matching.

**Not on the wire.** The transport picks the route and reports the days; the
intent is the same `moveParty`. Nothing records *how* a journey was made,
which is a travel log's job and does not exist yet.

### D-299 — The party travels by what it has, and the cell picks · `agreed`
The GM, one day after D-298 shipped: *"all tools show a set of pickable
options when selected, but the travel tool awaits until the user picks the
peon, selects start and end and then shows how. What if we switch the
order?"* R-200 is new; R-52's mixed-journey note is superseded.

**The observation was about consistency and the answer was about the model.**
Every other tool shows what it will do the moment it is picked up. Travel
asked nothing until after aiming and then asked everything. Moving the
question earlier turned out to change what a journey *is*: once the party has
a land answer and a water answer rather than one mode, the route can take
whichever suits the cell — and **walking to the coast and sailing becomes one
journey**, which R-52 had been admitting was two separate moves.

**Almost no new machinery.** A boat on grass and a walker in the sea already
came back impassable from the overrides R-52b has carried for rounds. The
router asks each conveyance the question it was already asking one, and takes
the quickest that can cross.

**One real structural change, and the GM's question found it.** They asked
how a river crossing counts: *"land → water → land. Do you split each step as
a mixed move?"* No — a step is costed by the conveyance entering the target
cell, so the medium changes at the cell boundary and nothing is half-walked.
But answering it exposed that the search was minimising **difficulty**, which
only works while one pace divides the whole journey. Mix 39 km/day with 77 and
a difficulty unit stops being a duration. The search minimises **days** now.
With one conveyance the two are the same question over a constant, so nothing
about existing behaviour moved.

**Seen working on the GM's own map**, across the river their world is split
by, without leaving the costing step:

| they have | the journey |
| --- | --- |
| nothing on the water | 1.5 days, walking round |
| swimming | 1.3 days — 1.2 on foot, 3 hours swimming |
| a canoe | 1.2 days — 1.1 on foot, 3 hours paddling |
| a flying mount | 6 hours, straight over everything |

**Six conveyances appended** — wagon, hard ride, swimming, canoe, balloon,
flying mount — never slotted in among the six that existed, because saved
worlds reference those ids (R-11). `fallback: 'free'` is new and is how
anything airborne is described.

**What this removed.** D-298's menu listed every mode with its own route, one
A\* per mode. That is gone: the transport is decided before the sequence
starts, so the costing step carries no mode and `byWay` had nothing to swap.
Dead API deleted rather than left.

**One thing I nearly got wrong.** I first hid the conveyance pickers while
the menu was open, on the grounds that transport is chosen "before". But the
route recomputes as they change, so hiding them took away a comparison for
nothing — *"what if we had a boat"* is the question a GM asks while looking
at four days on foot. They stay up.

**A free-text pace field was asked about and declined.** Modes are
append-only ids that saved worlds reference, and a typed number would sit
outside that registry and let someone enter 400 km a day. A list per medium
says the same thing and stays in the record.

### D-300 — One Travel panel, not two · `agreed`
*"We have 2, the 'Travelling By' and the 'Journey', let's unify them and call
it just 'Travel'."*

Right, and the reason is sharper than tidiness: they are **one question asked
in two halves** — what the party has, and what that makes of this journey.
Putting a heading between them made them read as two subjects, when the
second is the answer to the first. The conveyances are always there; the
journey appears under a rule when there is one to cost, and the pickers stay
live beneath it so the days move as they change.

It was two cards for a single day, which is the right length of time for that
mistake to live.

`WaysPanel` and `JourneyPanel` are deleted rather than kept around, and
`features/travel` replaces both.

**One thing the merge made visible.** Fifteen conveyance rows plus a journey
is a tall panel, and on a short window the answer sits below the fold — you
scroll past six land options to read the number you asked for. Not introduced
by the merge (the two cards stacked to the same height), but easier to see
now. Worth a look: the journey could sit *above* the pickers while it is
live, since at that moment the pickers are reference and the answer is the
point. Left alone for now rather than changed unasked.

### D-301 — Three dropdowns, not fifteen rows · `agreed`
*"Do we have dropdowns as UI objects? Or do we need to make them custom?
Because the menu look pretty long and it will be easier to see which are your
selected options per category if they are the only ones displayed."*

**No custom component needed, and none written.** `@tt/ui` has no dropdown,
but the place inspector has used a native `<select>` for its marker picker
all along, and the shell already styles `button, input, select` together. So
the answer was a control the project already had.

The rest of the reasoning is the GM's and is the right one: at rest, what a
panel needs to show is **what the party has**, not every conveyance in the
game. A closed select shows exactly that one row. The full list is for
choosing, which is when it opens.

**237 px**, down from well over five hundred — the Light panel fits under it
again, and the journey is no longer below the fold, which is the complaint
D-300 left open and did not fix.

**What a native select buys beyond height**: keyboard and screen-reader
behaviour for nothing, the platform's own open-list rendering, and no new
component to keep in step with the rest. What it costs: the pace is
truncated on a long name when closed — "Mounted — hard ride · 96 km" does not
fit 170 px. The option list shows it in full when open, which is when it is
being read, so the trade is the right way round.

### D-302 — Slowest first, and the cart was the wrong vehicle · `agreed`
Two from the GM in one breath.

**Ordered None → slowest → fastest, per medium.** A **sort in the panel**, not
a reorder of the registry: those ids are append-only and saved worlds
reference them, so the order they were added in has never been the order they
are read in (R-11). The same move D-286 named for the covers and then did not
need; this is where it is needed.

```
On land     Cannot cross · 29 · 39 · 48 · 60 · 77 · 96
On water    Cannot cross · 13 · 42 · 77 · 154
In the air  Cannot fly · 60 · 120
```

**The cart was modelled as the wrong thing.** *"I thought about a 'carreta',
the woody thing pulled by horses, slower than just a horse ride, but quicker
than any on-foot option."* I had built an ox-cart at 26 km a day — slower than
walking, which is what 5e's vehicle table says and not what the GM asked for.

Theirs is the better reading of the fiction: **the horses do the work and the
party does not tire**, so a day in a cart covers more ground than a day
marching. Less than riding, because a cart keeps to what a cart can keep to.
60 km a day, between the forced march at 48 and the mount at 77, which is
coaching-era ground without horse changes.

The `HAULING` slope stays — a cart still hates a hill more than anything else
does — and so does the id `travel:wagon`, because R-11 protects ids and not
names. The same move D-246 made renaming Glass to Glassy.

**Two tests**, because both are facts about numbers that drift quietly: the
cart sits strictly between a forced march and a mount, and no medium offers
two conveyances at the same pace — a list with nothing to choose between is
not a list.

### D-303 — One shape for a party member, two places to stand · `agreed`
*"We still have the pawn in the world view instead of the card holders."*

The world drew **chess pawns** and a map drew **standees** — a gold plate, a
clip, a card in the member's colour. The same six people in two shapes, which
is precisely what R-90 was written to prevent, and it had been true since the
standee replaced the coin (D-266) without anyone looking one surface up.

**The standee wins.** It is the one that can carry a face when portraits come
(D-257), it is a picture of a thing the GM already owns, and it reads at a
glance: a pawn in a colour says *a token is here*, a card says *this person is
here*. The pawn's only advantage was being recognisable at a few pixels, and
both vanish at the same zoom anyway (R-83).

**Extracted rather than copied.** `render/standee` now holds the shape — plate,
clip, card, the gold, the invisible pick volume, and the no-cast/do-receive
rule — and `tokens` and `pawns` each add what is theirs: a cube's floor and a
drop line on one side, a cell's surface and the split-party captions on the
other. The alternative was `pawns` importing from `tokens`, which would have
made the world's party a special case of a map's for no reason other than
which one was written first.

**Sized in cells, not metres.** A map cell is 1.5 m and a world cell is 1.5 km,
and the standee is one cell tall in both. That is not a mistake to fix later:
it is a marker saying *somebody is here*, the same claim a place marker makes
at the same scale (R-90). A party drawn to scale on a 1350 km map is invisible.

**Three things the world gained for free** by being the same object: the card
turns to the camera on drawn frames as a map's does (R-187), picking now goes
through the invisible volume instead of the drawn meshes — so a pick no longer
depends on which way the last frame left the token (R-36a) — and the ghost is a
translucent standee rather than a translucent pawn.

**Two things deliberately left alone.** The group pawn keeps its neutral card
(O-022 is still open: what the party-together card should *show* is a question
about pictures, not about shape). And the world's aim ghost stays white, where
a map's takes the mover's colour — the world ghost is reached from travel,
which does not hand the stage a colour, and threading one through is a travel
change, not a token change.

R-201 is new. R-90 and R-187 are amended.

### D-304 — The table draws the journey, and the party's conveyances move into the save · `agreed`
*"Now make the table show the travel too."*

The console drew a route and reported days; the table drew nothing. Two
screens, one journey, and only one of them could see it — on the screen
everybody at the table is actually looking at.

**The table works the route out for itself.** The alternative was sending the
console's line over the wire, and it is wrong twice: it would be a second
answer to a question the table can already answer (R-19), and it would not
cover the case that matters most — the table has its **own** aim sequence
(R-134), so there is a journey being planned there that the console knows
nothing about.

**Which made the real problem visible.** To route, the table needs what the
party travels by, and that was **React state on the console**. So the console
would have costed a crossing under sail while the table costed it on foot,
and neither screen would have been wrong from where it stood. The conveyances
were in the wrong place, not the route.

**`travelling` is now play state in the save** — the fifth thing `viewFor`
sends the table, named one at a time in the filter like the hour (D-250),
the map tokens (D-259) and the fog (D-273) before it. It is the party's, which
R-136 usually puts on the players' side, but *granting* a ship is a decision
about fiction and resources, so `setTravelling` is GM-only and the value is
shared. A reload no longer puts the party's ship back in the harbour, which
was a bug nobody had noticed because nobody had reloaded mid-journey.

**No schema bump.** Absent means on foot, which is what every save written
before a party could own a boat already meant (D-187, R-144).

**The table's discovery is its own world.** `routeAcross` wants a `Discovery`,
and the table is never told which chunks are Known — that is itself the answer
to what is hidden (R-85). It does not need to be: it is handed a world already
cut to them, so `allKnownIn(world)` says the same thing without saying anything
new. The claim was worth a function and two tests rather than a line in a
component.

**The days go in the sentence.** The console has the journey menu for them
(R-199); the table has one line of prompt and will not grow a panel (R-94).
`travelPrompt` takes the route now and reads *"Move the party here — 13 hours?
Click to confirm"* — on **both** screens, because the moment it is worth
knowing is the moment the pointer is over the destination, and that moment is
the same on each.

**Measured on the GM's own map.** The same journey across the river: 5 hours
with a ship, 13 hours without, and taking the boat away on the console
re-drew the players' route round by the ford while they watched. That is the
whole feature in one observation.

**D-298's loose end, closed.** The console has four steps and the table three,
and the missing one is `choose`. That stays, and R-134 now says so: a step may
be the GM's alone, a *result* may not differ between the screens.

R-202 is new. R-134 and R-200 are amended. O-032 is opened.

### O-032 — The console will not send a journey it cannot draw, and the table will · `resolved by D-319`
R-197 says plainly that a route of `null` means *"I cannot show you a way"* and
never *"you may not go"* — the destination is not adjacency-checked and a GM
may move the party anywhere (R-133).

The console does not behave that way. Its journey menu disables **✓ Travel**
when the route is null, which reads as "you may not go". The table, whose
confirm is a click on the map, sends it.

Both are defensible. The console's version is **useful**: a GM aiming at an
island with no boat is being told to grant one, and granting a flying mount
(`free`, R-200) makes everything reachable, so it is never a dead end. The
table's is **R-197 as written**.

Not decided here because nothing in this round required it, and because
changing either one is a change to what a click does rather than to what a
screen shows. Whichever way it goes, R-197 or the console needs editing — it
is currently a rule the product contradicts, which is the thing this file
exists to stop.

### D-305 — Travel time is information, not simulation; and O-017 was already answered · `agreed`
Two answers to two items on the "what are we missing" list.

**Time does not pass in the tool.** Proposed: a journey's days could advance a
calendar or the hour, or land in a travel log. The GM's answer, which settles
it: *"I like that time to be just informative. Players may say 'it's 2 days of
travel that we can do keeping one guard and travel non-stop' or 'it's 2 days of
travel but we will stop 2 times doing 8h rests'."*

That is R-1 exactly. How a party spends two days on the road is something the
people at the table decide faster than they could type it, and enjoy deciding.
The tool's job ends at **how far it is and how long it takes at this pace**
(R-199); what they do with the number is theirs. So no clock, no calendar, no
log — and the hour stays a slider the GM sets for the scene (R-181), because
it is scene-setting and not bookkeeping.

**O-017 was closed by D-098 and never marked.** It asked whether an 80 × 80 km
world was too small for a campaign. D-098 moved a cell from 200 m to 1.5 km a
few rounds later, for its own reasons, and that answered this: 30 chunks of 30
cells at 1.5 km is **1350 km across, about five weeks on foot**. A kingdom,
not a duchy. Marked resolved.

### D-306 — Places move and turn · `agreed`
*"The GM should be able to move and rotate places. While the Places tool is
selected, the highlighted cell should show the place token right on top of it.
1 or 2 keys to rotate it 90 degrees per tap. If a user taps on an already
created place, allow him to move and rotate it. The info should be kept; a
right click returns it to the original position."*

Reviewed together before building; R-203 is the result.

**Z / X, the GM's call**, after I argued against Q / E: those turn the camera,
and taking the camera away mid-placement is exactly when it is wanted.

**`movePlace` already existed** — domain, intent and host handler, refusing
another place's cell and accepting its own — and nothing on screen had ever
called it. The work was the gesture and the facing, not the move.

**A click that did nothing is what made room for it.** Under the Places tool a
click on an existing place was dropped (R-119 refused a second place there,
and that was all it did). So picking up took no gesture from anything. The
panel's hint had been claiming that click would *edit* the place, which it
never did — editing is Select's (D-168). The hint now says what happens and
lives in the tool card, beside every other tool's.

**Facing is a new field, `0`–`3`, absent meaning 0.** No schema bump: every
place before this was drawn as its parts are written, which is facing 0
(D-187). Intents are strict about the range (R-17); the file reader is
lenient and brings any whole number back into one turn, because a campaign
must not fail to open over which way a hut points. Every place is now written
with its facing, so the GM's campaign file gained `"facing": 0` on each place
the first time it was saved — the same places, said explicitly.

**The home copy is faint, the carried copy a ghost.** Travel and tokens leave
the original solid and ghost the destination. Here the original fades, because
what is being moved is the thing itself, not a party that is still standing
where it was until the confirm — and because "where does a right-click put it"
is the question the faint copy answers.

**A readout bug, caught on screen.** The first build worked the readout out in
the pointer handler, so after a set-down it kept offering to set down a place
that had just landed, until the pointer moved. The readout and the ghost are
now drawn from the same state by one effect, which is the reason Z / X turn
the ghost with the pointer still, too.

**Verified on the GM's own campaign without leaving a trace.** I snapshotted
the three places first. Pick-up, Z / X, right-click: file not even rewritten.
Then a real move and a turn in place, both seen on the table display as well,
then two undos — after which Undo went grey, which is the proof that only my
two edits had been in the history. The places compare identical to the
snapshot.

R-203 is new.


### D-307 — Everyone who is not the party: the design, agreed before building · `agreed`
The silver tokens D-255 parked with *"Later."* Its stated blocker — no fog
to gate an enemy's way to the table — went away with D-273. Talked through
with the GM over two rounds before any code; this is what was settled, for
the three rounds that build it.

**The shape.** A **shared library** of entries — *a goblin*, *a hobgoblin*,
*the bartender* — made once from a menu. A new map tool spawns one onto a
floor; each spawn is its own token with its own name, *"goblin N7"*. Gold
tokens are the party; silver tokens are everyone else (D-254).

**The library is shared across campaigns** — the GM's call, and the reason
behind most of what follows. *"A GM will love to have his bestiary on a
common folder so he can speed up the creation of a new campaign, do a random
encounter with already created monsters."* It lives with the host, beside
the campaigns, not inside any of them.

**Not "bestiary".** The GM flagged that the word says *monsters*, and the
library will hold a bartender and a gate guard as readily as a goblin. Named
in O-033.

**Tags, not folders.** Free tags per entry; one search box over names and
tags, and several words narrow it — `npc saltmarsh` finds what carries both.
The GM's own Owlbear habit is the case: some NPCs are shared between
campaigns and some are not, so they are tagged by campaign as well as by
kind. Tags give that for nothing; folders cannot, because an entry lives in
one folder.

**Images, optional, one pipeline for gold and silver.** Uploaded on the
console, made small, stored by the host, and sent to the table **only for a
token the table is currently sent** — nobody sees the dragon's portrait
before meeting the dragon. With no image, a gold card is the member's colour
(as now) and a silver card is **plain grey**: *"no extra work, like we do
with colors for the party, but here is always gray."* Members' images show
on the world map's standee too, since it is the same standee (R-201).

**An entry is referenced, not copied.** Change the goblin's image and every
goblin on stage changes; names stay per token. **Deleting an entry deletes
every token of it** — the GM's rule, and with a shared library that reaches
campaigns that are not open: their tokens are dropped when each next opens,
the same tolerance `pruneMembers` gives a member who left the roster. The
confirmation has to say so in those words.

**No undo anywhere in this.** The library is outside every campaign, so
campaign undo (D-169) cannot reach it, and the GM sees no value in it for
menu construction anyway. Spawned tokens are play state, which undo never
touches (R-140). The confirmations carry the weight — deleting a token,
deleting an entry.

**What the table sees: the trust boundary.** A silver token is sent only
while it stands where the party sees **right now** — not merely where they
have been, because remembering a room says nothing about who is in it now
(R-85: not sent, rather than not drawn). A GM toggle can hide one more (an
invisible stalker in plain sight); it can never show one the party cannot
see. Gold tokens are always sent; they are the players'.

**Identity is the name, shown.** Over the token on both screens, because
*"goblin N7"* is what a player says aloud. The suffix is one letter and one
digit, unique within that map, skipping I and O, which read as 1 and 0.
The GM may rename. **No highlight-on-select** — the GM's call: the visible
name is what identifies, and a second way to do it is noise.

**One token per cube, gold or silver.** Its one leak is accepted on purpose:
a member stepped into a dark cube where an unseen goblin stands is refused,
which tells the players something is there. Bumping into something in the
dark is the fiction.

**GM only.** Silver tokens are the world's, not the party's (R-136): every
intent about them is GM-only, and on the table they are drawn but not
picked.

**A GM-only note per token** — *"wounded, fleeing"* — never sent. No HP
field: damage stays out of scope (R-1), and a note covers it. Answers O-015,
which had waited for exactly this.

**Maps only, one cube each, for now.** An army on the world map, or an ogre
taking 2×2, are real and later.

**The list orders.** The map's party list becomes everyone on stage, gold
and silver, with a number the GM types, sorted high-first with blanks last,
per map. Section 1 lists *initiative order* as permanently out of scope; this
is not that. It is state the GM sets (R-1), and the tool never rolls, never
tracks whose turn it is, never has a "next turn". Section 1 is amended to
say exactly that in the round that builds it.

**The spawner stays armed.** A named exception to R-87a: creating a place
returns to Select because a place wants a name next, but a goblin is named
for you, and five goblins should be five clicks.

**Three rounds.** 1 — images, on the party first: the smaller case, and it
proves the pipeline. 2 — the library, the spawner, silver tokens, names,
deletion and the sight rule, together, because the sight rule is what makes
it safe to send a goblin anywhere. 3 — the ordered list and the notes.

### O-033 — What to call the shared library · `resolved by D-308`
"Bestiary" says monsters, and it will hold a bartender (D-307). Proposed:
**the Cast** — everyone on stage who is not the party; one entry is a *cast
member*, and one placed on a map is a token. It sits with the GM's own
words, *on stage* and *scene*, and as a heading it does not read as casting
a spell. The plainer alternative is **Library**. Needed before round 2,
which names the panel, the tool and the folder on disk.

### D-308 — Pictures on cards, the party first · `agreed`
Round 1 of D-307. R-204 is the rule.

**The library is the Tokens Library.** The GM's name for O-033, over my
*Cast* and *Library*. It says what is in it and what it is for, and it does
not say *monsters*. O-033 is closed.

**HTTP for the bytes, the socket for the choice.** A picture is bytes and the
socket is JSON views and JSON intents; stuffing a portrait into an intent
would have put a binary through the schema and the permission gate to store
something that changes nothing on any screen. So the console stores it first
and then sends an `editMember` naming it — R-3 still holds, because the
naming is the change.

**Resized in the browser, so the host stays plain.** The alternative was a
native image library on the host (`sharp`), a compiled dependency for one
feature, on a machine the GM sets up themselves. A canvas does it in the
console instead, and the host only ever receives a small card-shaped WebP —
the first test picture, 1200 × 800 PNG, arrived as 2.8 KB.

**Named by content.** Two members with the same portrait share one file; a
name is a fact about bytes rather than a counter; and a name that passes
`isImageId` is hex, one dot and an extension, so it cannot climb out of the
directory it is looked up in. The host also checks a file's first bytes, so
nothing is served as `image/png` that is not one.

**Two things caught on screen.** The first panel put the picture on its own
row, and six members pushed the roster under the address box — it is folded
into one *card* row now, colour and picture together. And the first test
picture was left-right symmetric, which could not have shown a mirrored
card; a second one reading **R7** with a stripe down its left edge did, and
it reads the right way round on both screens and after a camera turn.

**Verified on the GM's campaign and put back.** Roster and placement were
snapshotted first; Aldra wore two test pictures, on the console and the
table; then the party was regathered and the picture taken off. Both compare
identical to the snapshot, and the two test files — mine, referenced by
nothing — were removed from `data/images`.

R-204 is new. O-033 is closed.

### D-309 — The GM frames the picture · `agreed`
*"It's invisible for the GM how much of the image will be used, will it be
centered? Cropped? Like a canvas of the full picture and a rectangle that
shows where it will be clipped, so the user can adjust it (we only keep the
resulting image)."*

The cut D-308 made was right on average and invisible always. R-205 makes it
the GM's: the whole picture, a 5:7 frame over it, a live card beside it.

**Built, not borrowed** — the GM's call, after I laid out the two. The
library that matches the request is `react-image-crop`; the other common one,
`react-easy-crop`, moves the picture under a fixed frame, which hides what is
being thrown away. Neither was worth R-24's price: the apps carry no UI
library but React, every control so far is the house's own, and the whole of
the job is one rectangle of a fixed shape that moves and resizes. The part
that can be wrong — keeping it the card's shape and inside the picture — is
three small functions in `client-core`, tested through a 400-step walk of
moves and corner drags that never once produced a dishonest frame.

**It starts where the old cut was**, so *Use* at once is the D-308 result
and nothing the GM did before changes meaning.

**Rendered into `document.body`.** The console's panels blur what is behind
them, and an element with `backdrop-filter` becomes the box its
`position: fixed` children are placed in — a dialog left inside the party
panel would have been pinned to the panel.

**The dialog takes the keys while it is open**, in the capture phase, so Q
and E do not turn the camera behind it and a digit does not change tool.

**Checked with real drags on screen**, on a tall picture reading TOP, MID and
LOW: the frame moved and stopped at the bottom edge, shrank from its
top-left corner with the bottom-right held, and the preview followed every
move. Cancel and Escape stored nothing. Use, by Enter, stored a 256 × 358
picture whose corner pixel is the exact blue the test picture starts with —
the frame really was where it was put. Tested on a member added for the
purpose and removed after; the GM's party and placement compare identical
to the snapshot taken first, and the test file is gone from `data/images`.

R-205 is new; R-204 amended.

### D-310 — The Tokens Library and silver tokens · `agreed`
Round 2 of D-307, built as agreed there. R-206 is the rule.

**Where they live.** Entries in `data/library.json`, beside the campaigns;
placed tokens in the save, per map, beside the party's. Absent in every save
and every host before this, which reads as nobody placed and an empty library
— no bump (D-187).

**Present in every map, not only the party's** — the one place they differ
from the party's tokens, found while designing rather than said in D-307.
Party tokens count only in the map the party is in, because elsewhere they are
a memory. Silver tokens are the GM's setup, so they stand wherever they were
put: otherwise a cellar could not be laid out while the party is upstairs. A
member remembered in a map they left is no obstacle to a goblin, and is placed
again on the way back in if a goblin took the cube (D-256's repair, one rule
wider).

**A correction to what I said in conversation.** I told the GM a fresh start
on a map would clear silver tokens too. It must not: a fresh start is the GM
wiping what the party has *seen*, usually right before play — and it would
have wiped the goblins set out for that play with it. It forgets the party's
sight and the party's positions, and leaves the GM's people where they are.

**The table is sent the narrowest thing yet** — the sixth piece of save data
`viewFor` names, and the first that is the GM's rather than the players'.
Inside the band, in the party's present sight, not hidden; and only a name, a
cube and a picture. Six host tests hold it: in sight, behind a wall, seen a
moment ago and now walled off, hidden in plain sight, in a map the table is
not shown, and with nobody standing anywhere to see.

**Names.** One letter and one digit, at random, unique in the map without
case, skipping I and O — 240 per entry name, then two digits. The host makes
them, so two consoles cannot both pick N7.

**Moving one** is its own small sequence beside the party's, not a stretch of
it: the party's is keyed by member, shared with the table, and armed for
first placements, none of which apply to the GM's people. Move picks either
kind, the party first when both are under the pointer.

**Tested on screen against a copy of the GM's data**, on a second host on
another port. The one map in the GM's campaign is one the party has explored,
and opening it on the console walks the party in and grows what they have
seen — not something to do to a live save to test a feature. On the copy:
two entries made through the panel, one through the crop dialog; three
goblins placed with three clicks and named X7, L7 and H4; a bartender placed
beside a party member inside the keep. The table was sent the bartender and
none of the goblins on the shore outside; hidden, it was sent nothing; shown
again, the bartender came back. The hidden goblin drew faint on the console.
Rename, a confirmed delete, a move with the Move tool, and deleting the Goblin
entry — which took both goblins left on stage with it. The GM's own campaign
and save were byte-identical afterwards.

**Two slips caught by looking.** The tool hint still said *1–3 tool* with four
tools. And the table first drew no silver tokens at all — not a bug in the
table, but a bundle built before its last edit; and then a browser tab in the
background, where animation frames do not run and so nothing is ever drawn.
Neither was the feature, and both would have read as one.

R-206 is new; R-87a amended.

### D-311 — Tools own their panels; the Party's view hides who the table cannot see · `agreed`
Three from the GM, the first a general rule.

**A tool's panels only while it is in hand.** *"While the spawn tool is
active, the materials panel should be hidden. But this must be a general
rule."* The cause was the shape of the condition: the Material card and the
brush row said *not Move*, so Spawn, added after them, inherited both. The
world's tools already named their own panels and had no such bug; the map's
named the one tool they excluded. R-207 makes it one table for both surfaces,
listed rather than excluded, and a `Record`, so a new tool cannot be added
without saying what it shows. Checked on screen: Build and Paint show Material
and Brush, Move shows neither, Spawn shows the Tokens Library alone.

**The Party's view drew goblins the party cannot see.** It already promised to
cut the picture by the rule that cuts the table's payload (D-271) — and kept
that for blocks and fog, but drew every silver token the console held. The
rule is now `silverShown` in `domain`, and the host's filter and the console's
preview both call it, so they cannot disagree again. Checked: a bartender
beside a party member inside the keep and another out on the shore; the GM's
view shows both, the Party's view shows the one in sight.

**The eye.** The visibility toggle is the eye a password field uses — open
while the players may see the token, struck through while it is hidden — and
it is a fixed 28 px, so the name field beside it does not move when it
changes. Measured: the field sits at the same x and width in both states.

R-207 is new.

### D-312 — One ordered list of everyone on stage, and a note per silver token · `agreed`
Round 3 of D-307. R-208 is the rule; section 1 is amended as D-307 promised.

**One list.** *"The list we use to have to show players on scene only, now
should show all tokens."* The party card's member rows moved into *On stage*,
beside the silver tokens, and the party card kept what is about the whole
party: where they are, the Party's view, bringing them out, a fresh start.
A member row still picks them up with Move and still sets their sight.

**The number.** Whole, from −99 to 999 — any initiative a table rolls —
typed in a box at the front of each row, blank for none. Highest first,
blanks last, ties in the list's own order. Kept per map, in the save, by
token id: member ids and silver ids never collide, so one record serves both
kinds. Read through until the campaign next opens, when the numbers of
anybody gone are dropped.

**Section 1, amended rather than ignored.** It lists initiative order as
permanently out of scope, and a numbered list sorted high-first looks like
one. What is out is the tool *rolling*, *knowing whose turn it is*, and
*advancing* a turn. A number the GM sets is state (R-1), and section 1 now
says exactly that line.

**Notes on silver tokens, not on the party.** The note is the GM's record of
a goblin — wounded, fleeing, has the key. A party member's state is their
player's, and a character sheet is out of scope. Opened from the token's own
card in the list, since a row with a number, a card, a name, an eye and a ×
has no room for another button; a dot on the card says one is there, and the
note shows as a dim line under the name. Never sent: the table's view was
checked for the note's text, and for the numbers. Answers O-015.

**Checked on a copy of the GM's data**, with the real keyboard: 20 for one
bartender, 18 for another, 12 for Galion, Turdorn left blank — the list read
20, 18, 12, blank, and the numbers sat on the right ids in the save. A note
typed into a card, kept on clicking away, there after a reload. Galion's
name still picked him up with Move.

**Three things seen on screen and fixed.** The silver names were cut to
"Bartende" in the 228 px dock — inside a map the right dock is 264 px now.
The note box used the browser's monospace, because the base control style
listed `button, input, select` and not `textarea` (the place notes had
styled theirs by hand). And the first pass at the numbers seemed not to
commit — which was my scripted focus in a window without focus, not the
list; typed for real, every number landed.

R-208 is new; section 1 amended; O-015 closed.

### D-313 — A sheet link per library entry, and the On stage row rearranged · `agreed`
Four from the GM, built as asked.

**A sheet link**, between the name and the tags in the library editor: *"an
url, possibly pointing to an online sheet of it for quick stats review."* On
the entry, not the token, because every goblin shares the goblin's stats.
Opened from the console as a link, which is why it is cleaned by one rule in
`domain` wherever it enters — the editor's field, the host's handler, the
file on disk: only `http:` and `https:` survive, so a `javascript:` link
cannot get in by any of the three doors. A scheme left off is added
(`dndbeyond.com/…` becomes `https://dndbeyond.com/…`), and the editor says
plainly when what was typed is not a web address and will not be kept.

**The row, as the GM laid it out.** First row: number, picture, name, then
the eye and the × with no gap between them. Second row: the note across the
whole width, or *Add a note…*; click to write, as before. The picture had
been the way into the note, which the GM found odd — it is the way to the
**sheet** now, with a link icon over it on hover, and only when there is a
sheet: a picture that offers nothing should not look as if it does.

**The odd stroke on the note box** was the browser's own focus ring — a
double outline drawn outside the box's border. Nothing in the console styled
focus at all, so every text field had it; on a large box it looked like a
mistake. Now one rule for every field: the border turns to the accent, and
nothing is drawn outside it.

Checked on a copy of the GM's data with the real keyboard: a `javascript:`
link warned and was not kept; `dndbeyond.com/monsters/bartender` was kept as
an `https:` address; the picture opened it in a new tab, isolated
(`noopener`), with the link icon on hover; eye and × measured 0 px apart; the
focused note box drew one accent border and no outline.

R-208 amended.

### D-314 — One height for the On stage row, and the party's mosaic · `agreed`
*"It's like each component has a different height. I agree to have a small
note, but the first row should be standarized. Also, the note button with or
without a note should look the same."*

**One height for the first row.** The number, the name, the eye and the ×
were each as tall as their own padding made them — a field, a button and an
icon button are three different boxes — so the row looked stepped. Now the
list sets one row height (28 px) and every control in the first row takes
it, with the padding moved to the sides; the picture sits inside it. Measured
on the GM's data: every control in every row 28 px, party and silver alike.

**The note line looks the same written or empty.** It had a background only
when it held text, which made a written note look like a different control
from *Add a note…*. Both are now a plain line, transparent, smaller than the
row above it; the empty one is dim and in italics. Either shows a faint box
on hover, which is what says it can be clicked.

**The party standing together shows everyone** — a mosaic of the members'
cards on its one standee, in roster order: one column for two, two for up to
six, three for up to nine, then a square. Each tile is cut from the member's
picture by the same rule as a card (`coverCrop`, now in `domain` so `render`
can use it), or filled with their colour, with a dark line between tiles. It
was a blank grey card, which said a token was there and nothing about whose.
A picture for the party itself was the other idea; the GM chose the mosaic as
enough. The tiling is a pure function (`mosaicGrid`, `mosaicTiles`), tested;
drawing it is the standee workshop's, and a picture arriving later redraws
the mosaic as it does a single card. Checked on a copy of the GM's data:
Galion above Turdorn on the grouped standee.

R-201 and R-208 amended. O-022 is closed.

### D-315 — A note on each party member, across maps · `agreed`
*"How hard do you think it's to add the option to add notes for players too?
Only visible for the GM and living across maps or per map, whatever it
matches better for our coding structure."*

This reverses a line of D-312, which kept notes to silver tokens because a
member's state is their player's. The GM wants a line of their own about each
character, and a line is not a sheet: still no hit points, no stats (R-1).

**Across maps, not per map.** Every other thing the save keeps about the
stage is per map, and that is right for them: a goblin, a number in a fight,
where somebody stood are all one map's. A member is the same person in every
map, and *"owes the guild 50 gp"* goes with them into the cellar. So one note
per member, in the save beside the per-map records rather than inside them
(`memberNotes`).

**In the save, not on the member in the campaign.** Two reasons, and the
second is the one that decided it. The note is play state like a silver
token's, so undo leaves it alone (R-140) — the GM was asked and chose the
simplest consistent answer, which is no undo. And the table is sent the
campaign but **never the save**: a note on the member would ride to the table
with the roster unless every path remembered to cut it, the way place notes
are cut (R-85); a note in the save cannot get there at all. Checked on the
live socket of a copy of the GM's data, not only in the test.

**Where it shows.** Under the member's row On stage, inside a map, and under
their name in the Party panel on the world — the same note in both, since it
is the same everywhere. One component for both kinds of note (`GmNote`), the
silver token's included, so the keys (click to write, ⌘/Ctrl + Enter or
leaving to keep, Escape to put back) cannot drift between them.

**When it goes.** Removing a member leaves the note in the save until the
campaign next opens, as their position on the world already was: so undoing
the removal brings the note back with them. A fresh start keeps it, as it
keeps the silver tokens. A duplicated campaign starts with no notes, as it
starts with a fresh save.

Checked on a copy of the GM's data with the real keyboard: a note written in
the Party panel on the world appeared under the same member On stage in
Tollkeep; one written On stage was kept with ⌘Enter; both lines measured the
same plain 22 px box as the empty ones, and every first-row control 28 px; the
save file held both; the table's view held neither, nor the field.

R-208 amended.

### D-316 — The walk a moving token would take, and how far · `agreed`
*"Instead of limiting the movement, because it might vary depending on
millions of possibilities, we should just show the amount of units up to the
place where you point, showing the shortest path from current to target
position."*

Built as asked, with the GM's three answers:

**Real distance, not a game's rules.** *"Orthogonal movement is 1, diagonal
is 1.41, we are not building this to attach to existent rules, we want to
have this tool as a tool for anybody."* So not 5e's every-diagonal-is-5-ft,
nor its alternating variant: geometry.

**Height the same way.** *"You can't move down or up only, that means you end
in the air or inside a cube, at least you do up or down plus a direction, so
that's a diagonal, right?"* Right: a stair is a step across and a step up,
√2, and a stair taken diagonally √3. One block up or down per step — the
recommended answer, kept — so a ledge two blocks high is walked round, and a
pillar's top has no path.

**No path says *no path*.** Not a straight line in a different style: the
GM chose two words over a line that might be mistaken for one.

**A bare number.** *"Don't use the term cubes or units, use just the number,
for vision distance we just say 'sees 12' (twelve what? check by yourself
lazy player!)"* `7` or `7.4`: one decimal, none when whole.

Mine, stated so they can be argued with: no squeezing between two blocks that
meet at their corners; room overhead to climb and over the edge to step down;
other tokens are walked through, since only the end cube must be free; each
screen routes over what it shows, which on the table means only floors the
party has seen — a path through an unexplored room would draw the room. And
each screen draws only its own aim: the GM's path is not on the table while
they aim, as the GM's ghost never was (R-64).

**The search** is the world route's shape (A*, a binary heap shared with it,
and a budget), over the 24 ways out of a cube with the exact lower bound for
those steps, so the walk found is the shortest. Measured at about 1 ms for a
long walk on a 48 × 48 map and 9 ms for the worst case, a target nothing
connects, which searches every floor; it runs when the aim changes cube, not
on every pointer move. **The drawing** is the world route's squares (D-297)
and a caption over the ghost, through the walls in front of the floors, as
the world route is drawn over hills.

Checked on a copy of the GM's data. Turdorn, outside the tavern, walked round
its corner and a tree to read 35.6 on the console; on the table the same
member read 34.8 to another floor, over explored ground only. Galion, inside
the tavern, which has no door at ground level, read *no path* to the grass
outside — correct, and found by asking the map rather than assuming. A
silver token outside read 12.2 in grey; the one inside read *no path* to the
roof.

R-209 is new.

### D-317 — A ladder drag reads the ladder as it was grabbed · `agreed`
*"If you … attempt to slide the level range slider from a level with tokens
present to one that leaves them out (or viceversa), there is a text on the
party panel that changes and pushes the slider panel and since you are
dragging, it triggers the level switch like crazy."*

A feedback loop, and the GM's diagnosis was exact. The band decides whether
the party is inside the levels the table is shown; the party card above the
ladder says which in a sentence one line longer or shorter; the ladder moved
17 px under a pointer that had not; and the drag found the stop under the
pointer by hit-testing the rows **as drawn now** — so the same pointer was
over the next row, which moved the band back, which changed the sentence
back, as fast as the screen could draw.

**The fix is in the drag, not the sentence.** The rows' boxes are taken once,
at the press, and the whole drag reads those (`rowAt`, in `client-core`,
tested). Nothing drawn elsewhere can feed back into a drag now — not this
sentence, and not the next card someone adds above the ladder. Holding the
sentence to one height was the other way, and it would have been a promise
about every plane name a GM might type.

What remains is cosmetic: the ladder still moves by a line when the sentence
changes mid-drag, and the drag carries on from where it was grabbed.

Checked on a copy of the GM's data, with the console's left column unscrolled
as on the GM's screen (a scrolled one hides it: the browser's scroll
anchoring holds the ladder still). Dragging the top of the band between roof
2 and the water level moved the ladder 17 px each way, and 40 small moves
while holding still flipped the band 0 times. Read live, the same held
pointer was over the water level after the jump instead of roof 2 — the loop.

### D-318 — A member's row On stage says their name, not where the table is · `agreed`
*"There is a text saying 'not on the table' … that shows when the player token
is not on the level range. I think is wrong and we should not show a hint
there, we should keep the name."*

Beside a member's name the row said *not on the table* when they stood
outside the levels the table is shown. It was the longest thing in a narrow
row, and the name gave way to it — down to an ellipsis, which is what the GM
saw as a stray mark before the words. The party card above already says the
same thing in a sentence (*"Somebody is outside the levels the table is
shown…"*), so the row lost nothing by dropping it.

*To place* stays: it is short enough to leave a name whole, and it is the
row's own news — this member has no floor in this map yet, and Move will
hand them over next.

Checked on a copy of the GM's data with the band cut to the water level: the
party card said somebody was outside it, and both rows read their names
whole, untruncated.

### D-319 — Housekeeping: six open questions closed, and two that need no work · `agreed`
The GM read the "what are we missing" list and answered every item.

**O-032 — the console sends a journey it cannot draw.** The console's journey
menu disabled ✓ Travel when there was no route; the table sent it. The
console now says *"No route with what they have. Give them something for the
water, or send them anyway."* and the button works. R-197 as written, and the
rule the map's walk was just built on (R-209): a path is a preview, never a
rule. The console's old strictness was useful as a nudge to grant a boat;
the sentence keeps the nudge without the refusal.

**O-009 — what an encounter map is, vertically.** Answered by the levels:
one map is the whole building, its floors are planes inside it, and the band
cuts it for playing and for looking into (R-146, R-161). The GM, closing the
last part of it: *"we don't do multiple maps per levels, because levels are
just cuts inside the same map."* So **no stairs between maps** either — the
connector this question once anticipated has nothing to connect.

**O-014 — multi-cell places. Discarded.** *"We can add multiple places, and
each one contain their own maps, calling each place something like, north
guard, city center, south suburbs, etc."* R-50 now says so.

**O-019 — world pathfinding.** Built in D-293 to D-299 and never closed: the
route, its days, mixed conveyances.

**O-021 — whose pawn is whose when the party splits.** Answered by the
captions (R-196): a member's name stands over their pawn when the party has
split, and over nobody's when it is together, whose pawn now shows everyone's
faces (D-314).

**O-025 — the stale host.** Not a question, a note to myself; the standing
order in it stands (restart the host before verifying a change under
`packages/`) and the entry is closed.

**Two that need no work, recorded so nobody proposes them again:**

- **Light and sight.** The hour and the lighting are what the scene looks
  like; they do not shorten anybody's sight. *"Light and sight will be
  adjusted by the GM while playing."* That is R-1: the GM changes a member's
  sight number when the cave is dark.
- **The table on the TV's computer** (D-244's "measure that first"). *"No
  rush, and I'm pretty sure it will be fine, I tested on my pc many times."*
  Left as the GM's call.

No open questions remain.

### D-320 — A backup every time the host starts · `agreed`
From the "what are we missing" list, and the GM chose it next.

The reasons, all of them the tool's own design: everything is written the
moment it changes; play state has no undo (R-140); deleting a point of
interest deletes its map's file; and the data's git history (D-134) only
holds what was last committed, which a session's work rarely is. A wrong
click mid-session had nothing to go back to but the last commit.

**When: at start-up, before anything reads the data.** Nothing is writing
then, so a copy can never catch a file half-written, and it is the moment
just before a session — the state worth having back if the session goes
wrong. Restarting the host is also how the GM already asks for a fresh one.

**What: the campaigns, the saves and the Tokens Library.** Not the pictures:
they are stored under the hash of what they are, never deleted, never
rewritten, so a backup that names one can always find it in `images/` —
copying them would cost disk and protect nothing. Not the trash either,
which is the deleted campaigns already moved aside (D-108). On the GM's data
a backup is about 40 KB, so twenty of them are a megabyte.

**How many: the newest 20.** Older ones are deleted at the next start — only
folders the host named, so a copy the GM made by hand in `backups/` and named
*"before the big fight"* is left alone.

**Restoring is by hand** — stop, copy the folders back, start — and written
down in R-210. Starting again backs up the state being replaced, so a restore
cannot lose anything either. A button for it would be a second way to destroy
a session from a menu; this one needs a person to mean it.

The folder is ignored by git, for the reason the trash is: a copy of what is
already tracked.

Checked on a copy of the GM's data: the host printed the backup's folder on
start and served the console; the backup's campaigns, saves and library were
identical to the data, without the thirteen trashed campaigns; the console
loaded as usual.

R-210 is new.

### D-321 — What comes next: prefabs, items, lights, rulers and areas · `agreed in part; not built`
A design conversation, recorded before anything is built so the agreements
survive until it is (R-0). Proposals the GM has not answered are marked as
such.

**Prefabs** — agreed. A tool to select a box of a map by two corner blocks
(the band helps reach inside a building) and save it, named and tagged, to
a library shared by every campaign (`data/prefabs/`, as the Tokens Library
is, D-307). It holds the blocks and their materials — items too, once there
are any — and never tokens, which are the session's. Placing shows a ghost
of the whole prefab on the face pointed at; **Z / X turn it and it can be
mirrored** (the GM: yes). One placement is one undo step, and the host
places it from the library by id rather than receiving every block.
**The prefab's blocks win and its air leaves the map alone** (the GM: yes):
a house on grass gets its own floor and the tree beside it survives; a
*clear the box* mode carves the space for a room sunk into rock. A placed
prefab is **a stamp, not a link**: editing or deleting the prefab never
touches the copies already on maps. Whatever would land outside the map is
shown red in the ghost and left out. Proposed, not answered: a picture
taken on saving for the list, and a few starter prefabs.

**Jail bars are an item, not a material** — the GM's correction of my
proposal, for three reasons that hold: the registry is by what a cube is
made of (D-245), and *bars* is a shape — *metal* is the material; the Build
tool would be laying down its first thing that does not look like a block;
and a plane of bars inside a cube needs a facing, so Build would grow a
rotation for one material and the corners would still not meet. The rule it
leaves: **a material is what a whole cube is made of; anything that is not a
whole cube is an item**, whether or not it opens.

Proposed for bars, not answered: they **connect** — a post in the middle of
the cube and an arm toward each neighbouring bar or solid block, so a
corner, a T or a cross draws itself and nothing needs turning. The same item
with a wooden finish is a fence. The cell door and the portcullis are
separate items, with a facing and an open or closed state.

**Items** — proposed, not answered. A built-in catalogue, one cube each for
the rules, four facings. The item is the map's (authored, under undo); its
state is the session's (in the save, R-140). Two rule flags, *blocks sight*
and *blocks walking*, feeding vision and the walk (R-209) so opening a door
reveals the room. Finishes instead of painting. Ladders let the walk climb
more than one block. Secret doors hidden as silver tokens are; a GM note on
a chest; no "locked" state (R-1). Open: the name ("Props"?), whether the
table may open doors, and whether an item may be drawn up to two cubes tall
while counting as one.

**Lights** — proposed. Visual only (D-319). Items that give light (sconce,
brazier, lantern) with lit or unlit as their state, and a light a token
carries. Every light lights; only the nearest few cast shadows; no flicker
by default (R-170). The table is sent only lights in cubes the party has
seen (R-85).

**Rulers and areas** — proposed. A ruler is local and momentary, a straight
3D distance as a bare number (D-316), on both screens. An area is shared and
saved per map: circle or sphere, cone, line, square or cube; a colour, a
name, optionally attached to a token, optionally hidden. Drawn, never
resolved — nothing lists who is caught (R-1). Open: whether the table may
draw them.

**Order, proposed:** prefabs first (blocks only — they depend on nothing),
then items (doors and bars first), then lights, then rulers and areas.

### D-322 — Props: the GM's answers to D-321 · `agreed; not built`
The open points of D-321, answered. Where an answer differs from what D-321
proposed, this supersedes it.

**The names.** *Prefabs* are the saved pieces of map — boxes of blocks
captured and stamped. *Props* are the things placed one at a time: doors,
chests, bars, bookcases, lights.

**Only the GM opens and closes doors**, on the table as everywhere: *"that
[is] a GM work, we need to avoid accidents."* A prop's state is the world's,
not the party's (R-136).

**Players may draw areas from the table, and move them**: *"they will
play-around to see how can I connect more enemies at once."* The first
thing the table may create that is not the party's own pawn — so the
permission line (R-136) gains a second kind of thing open to the table when
areas are built, and says so then.

**No size limit of one cube.** A prop takes a box of whole cubes, set by
its catalogue entry — a door is **1 wide × 2 tall**. D-321's "one cube for
the rules, drawn up to two tall" is superseded: what it is drawn as and
what it occupies are the same box. Every cube of it carries the prop's
rules (sight, walking), and its facing turns the box with it. **Props
stack**: a bookcase is one size, and a tall one is two bookcases, one on
the other — so a prop may stand on another prop, not only on a block.

**Placed one per click**, never dragged along a line: *"items are
individual."*

**Bars do not connect themselves** — D-321's proposal, declined as more
work than it is worth. A bar is a prop with a facing, turned before it is
placed like any other; a corner is a block of stone or wood between two
runs. They let sight through and block walking (confirmed).

Still proposed, not answered: a picture for each prefab taken on saving,
and a few starter prefabs.

### D-323 — Prefabs, built · `agreed`
*"Go ahead with prefabs!"* — D-321 and D-322 as agreed, built, and one
change found by using it.

**A corner is the cube in front of the face, not the block.** D-321 said
"two corner blocks". The first thing tried was a tree, and a tree's box has
leaves at its edges and air at every corner: with corners that had to be
blocks, no two clicks could frame it — the box either cut leaves off or
dragged in the ground. So a corner is the cube against the face pointed at,
the one Build would fill, which may be air; **⇧ shift** takes the block
itself, for a box that should include a floor. Air at a box's edges costs
nothing, because a prefab's air leaves the map alone, and pointing at the
top of a floor leaves the floor out — what a house dropped onto grass wants.
The outline shows the box exactly, either way.

**How it is put together.** `domain/prefab` holds the rules: capturing a
box from the map's sparse keys, turning a quarter clockwise and mirroring
left to right before turning, centring the footprint on the cube pointed at,
and stamping — blocks win, air leaves the map alone, *clear box* empties it
first, nothing outside the map and nothing on anyone standing (R-186). The
format is a map's (D-217): a palette and runs over the box, so a 4 × 5 × 3
birch is 227 bytes. The sim saves from the open map and places from the
library by id, so a placement is one intent and one undo step however many
cubes it holds; renaming and removing need no campaign open and touch no
history. `persistence` keeps a file per prefab, moves a removed one aside
(D-108) and an unreadable one too, and refuses an id that could not be a
file name; backups take the folder with the rest (R-210). The console draws
the ghost as see-through cubes in their materials' colours — red where they
would fall outside the map — framed by the block outline, orange while
*clear box* is on; a prefab just saved is put in hand.

`searchLibrary` is now generic, so prefabs are found by the same rule as
tokens: every word must match the name or a tag. `editPoiMap` is exported
from places so the sim can stamp a prefab without places knowing what one is.

Checked on a copy of the GM's data with the real keyboard: a birch beside
the tavern captured as 4 × 5 × 3, 13 blocks, named and tagged with Enter,
written to `prefabs/` and put in hand; its ghost followed the pointer; one
click put all 13 blocks down on open grass, trunk and leaves where the
original had them; one ⌘Z took all 13 back; X turned it, M mirrored it; the
console logged no errors.

R-211 is new; D-321's "two corner blocks" is superseded.

### D-324 — The Prefabs tool never looks dead · `agreed`
*"I'm clicking around with the Prefabs tool and nothing happens."*

Reproduced on a copy of the GM's data with real clicks. Capturing worked;
the tool did not say how to get there. It opened on **Place**, and with an
empty library Place has nothing in hand, so every click on the map did
nothing — said only in the Tool card's readout, across the screen from the
panel the GM was looking at. Two smaller faults showed on the way.

- **An empty library opens on Capture**, and Place is greyed out until
  something is saved: a mode with nothing to do is not a mode to start in.
- **Before the first corner, the cube under the pointer is outlined** — the
  cube a click would take. Capture drew nothing until the first click, so
  hovering looked like a tool that was not listening.
- **With prefabs saved and none picked, the panel says so beside the list**:
  a click on the map does nothing until one is.
- **The box's size was printed from the corners as clicked**, so a box
  clicked from its far corner read *29 × 1 × −11*. It is printed from the box
  now, as the readout already was.

Checked again: the tool opened on Capture with Place greyed out; a blue cube
followed the pointer before any click; the same two corners read 29 × 1 × 13;
saved, and with the prefab put down, the panel asked for one to be picked.

### D-325 — Capturing a prefab is three clicks: corner, area, height · `agreed`
*"The selection should be splitted into 3 steps because a tree doesn't have
cube shape."* The GM's sequence, built as given:

1. **The first click** takes the cube outlined under the pointer — it is in,
   and it is one corner.
2. **Moving** shows the area from it to the pointer, **one cube tall**, on
   the first corner's level whatever the pointer is over.
3. **The second click** sets the area.
4. **Moving** then sets the height: up raises the box and down sinks it.
5. **The third click** ends the selection; it is named and saved from there.

Two corners in space could never frame a tree: whatever the second corner
is, it has to be something the pointer lands on, and the far top corner of a
canopy's box is air. A footprint on one level and then a height asks for
nothing that is not there.

**The height follows the pointer's height on screen**, a level for every
level's worth of pixels — measured at the box with the camera as it is
(`levelPixels`), not a fixed 18 px as the world's height drag uses, so the
top of the box stays under the pointer at any zoom. It stops at the map's
top and bottom and at a prefab's longest side. **Escape steps back a click**:
the height to the area, the area to nothing. A click on a finished box starts
a new one there, as before.

The first corner keeps D-323's rule: the cube in front of the face, or the
block with ⇧ shift.

Checked on a copy of the GM's data: the birch beside the tavern — a corner
by the trunk, the area read 4 × 1 × 3, 45 px up read 4 × 5 × 3, and the third
click finished it at the tree's 13 blocks, the outline from just above the
grass to the top of the canopy.

R-211 amended.

### D-326 — The height is the block pointed at · `agreed`
*"Whatever you point at the moment you're picking height should be the
targeted Y for 'closing' the selection … right now feels like move up and
down by unit and sometimes is difficult to understand if you are at the
correct height. If we change this, the last click will be by clicking on the
top of the tree and that's it."*

D-325's height followed the pointer's travel on screen, a level for every
level's worth of pixels. It was precise and it was the wrong question: it
asked the GM to count levels on a box they could not see the top of, rather
than to say where the top is. Now **the block under the pointer is the box's
top** — or its bottom, when it is below the area — so the third click is on
the top of the tree. Off the map the height stays as it was; it still stops
at the map's levels and a prefab's longest side.

The **block**, not the cube in front of it as the first corner takes (D-323):
the top of the tree is its top leaf, and a box that stopped in the air above
it would be a level taller than what was clicked. `levelPixels` went with the
old rule; nothing else measured a level on screen.

Checked on a copy of the GM's data with real clicks: the birch, a corner,
the area, then the pointer on the top of the canopy read 4 × 5 × 3 at once,
and the click there finished it at its 13 blocks.

R-211 amended; D-325's way of setting the height is superseded.

### D-327 — A box being captured stays while it is named · `agreed`
*"At some point the selected volume disappears, and I think it's related to
moving the mouse over the prefab menu."*

It was. Leaving the map clears every outline the canvas drew — right for a
hover, which means nothing once the pointer is elsewhere, and wrong for a box
being captured, which is exactly what the GM is naming in the panel the
pointer has just moved to. It came back only when the pointer returned.

Now the Prefabs tool keeps its own drawing when the pointer leaves: only what
followed the pointer goes — the placing ghost, and the single cube outlined
before a first corner — and the box being captured, at any of its steps,
stays. The Tool card's help, which still described two corners, now
describes the three clicks.

Checked on a copy of the GM's data: the birch captured, the pointer moved to
the panel and *Birch* typed into the name — the box stayed on the tree
throughout.

### D-328 — Props, round one: a tool of their own, doors opened with Move, no secrets · `agreed; building`
The GM's answers before building props (D-321, D-322):

- **Their own tool, key 6.** The map's brush keys move along to 7, 8, 9, 0
  and minus; `[` `]` still step through them.
- **A door is opened and closed by clicking it with Move** — the tool in hand
  during play. A click on a token still picks the token up. The Props tool is
  for building: a click there selects a prop to turn, refinish or remove.
- **The first catalogue: doors, bars and furniture** — door, cell door, bars,
  portcullis; chest, table, chair, bookcase, barrel, crate. Furniture blocks
  walking, not sight.
- **No secrets.** *"Secrecy should be avoided, a hidden something should be
  solved by the GM by adding the item at the moment in need."* A prop the
  party has seen the room of is on the table; nothing is hidden from it by a
  flag. D-321's secret doors are withdrawn.

### D-329 — Props, round one, built · `agreed`
D-321, D-322 and D-328 as agreed. R-212 is the rule; this is how it was put
together, and the two places it chose for itself.

**Where the pieces live.** The record of a prop — type, cube, facing, finish
— is on the map (`EncounterMap.props`), written with the map's file and read
leniently there, because the map module may not import the props module
(cycles are forbidden) and a door is part of the building. The catalogue and
the rules are `domain/props`: `whyNotPut` (outside, solid, taken,
unsupported), `putProp`, `editProp`, `removeProp`, and `propRules`, which
answers for a list of props and a set of open ones *which cubes stop sight,
which stop walking, which are occupied* — cached per pair, both immutable.
The box arithmetic prefabs already had moved to `domain/boxes`, so props and
prefabs agree on what a quarter turn does without importing each other.

**Every rule asks through `opened`.** Sight (`partySight`, `memberSight`,
`eyeOf`), standing (`whyNotStand`, `whyNotPlace`), settling on the way in,
and the walk each take the save's open set and default to *every door shut* —
so a caller that forgets it refuses a doorway rather than walking a token
into a closed door. The host passes it for the console's sight, the table's
fog and silver, and every move; the console and the table pass it for their
ghosts and walk previews.

**Chosen here, to be argued with:**

- **A bookcase stops sight**, though D-328 said furniture does not: a wall of
  books one cube tall is a wall. It is one line in the catalogue to change.
- **A prop is seen like a block is**: once a cube of it, or one across a face
  from it, has been explored. A shut door is seen from the room it closes,
  not from beyond it. Not dimmed by the fog as an explored block is — a
  small difference on the table, left for now.
- **Clear box leaves props standing.** It empties a prefab's box of blocks;
  a door in the way stays, as somebody standing there would.

**Drawing** is `render/props`: each prop a handful of boxes (a barrel
cylinders) in its finish, built unturned and turned about its box's middle
by the same facing the rules use; an open door swung flat against the side
of its cube, a portcullis raised into the wall, a chest's lid up. Picked by
an invisible box per prop, **only when nothing stands in front of it** — a
door behind a wall is not clicked through it, unlike a token. The pick also
says which face of a prop was hit, so a bookcase can be aimed at the top of
a bookcase. **Prefabs** carry the props wholly inside their box (D-321),
turned and mirrored with the blocks — a mirrored facing swaps one quarter
turn for the other — and re-anchored on their new box.

Checked on a copy of the GM's data with the real keyboard and mouse: a
doorway cut in Tollkeep's east wall, a door placed in it with Z / X; under
Move the readout said *Open the door* and a click opened it — in the save,
drawn swung open, and Galion, shut in the building, then had a walk of 20.1
out through it where before there was *no path*. Two bookcases, a table and a
barrel placed on the grass; a bookcase stacked on a bookcase by aiming at its
top; the table selected, turned with Z and refinished in pale wood. On the
table: the six props and the open door, once the band was widened to include
them — cut out while it stood at the water level, as the band says. No
errors on either screen.

### D-330 — Backspace removes the prop selected · `agreed`
*"Let give the backspace the remove action shortcut."* With the Props tool in
hand and a prop selected, Backspace — or Delete, on a keyboard that has one —
does what the panel's Remove button does. No confirmation: removing a prop is
building, and one undo brings it back (R-212). A field being typed in keeps
its own Backspace; the console's shortcuts never see a key meant for a field.

### D-331 — The Party's view forgets props with the room · `agreed`
*"The party remembers items after clearing what they have seen."*

The table did not: its payload is cut by what the party has explored, and a
fresh start (D-277) empties that, props and all. The **console's Party's
view** did — it is the GM's picture of the table (R-76), and it hid unseen
blocks with the fog, but a prop is no block and the fog never touched it, so
every prop in the map stayed standing in the preview of a party that had
forgotten the room.

Fixed by giving the two screens one rule, as the silver tokens' was given
(D-311): `propsSeen` — a prop is seen once a cube of it, or one across a face
from it, has been explored — cuts the table's payload in the host and the
preview's body on the console. Checked on a copy of the GM's data: with the
Party's view on, the furniture by Tollkeep's door showed; after *Forget*, the
preview showed nothing, and the table's feed held no props and named no open
door.

### D-332 — Props grey out of sight; the On stage row is the name alone · `agreed`
Two from the GM.

*"Drop the hint too."* D-318 kept *to place* beside a member's name because
it was short enough to leave the name whole. It was not: after a fresh start
the row read *Turd…*. The row is the name and nothing else now — the party
card above already says who is still to place, as it says who is outside the
band.

*"Check why the items are not graying out like the blocks when they are out
of sight."* Because the fog never reached them. It is worked out as a set of
block keys — those sight shows now — and each block is drawn in sight,
explored (greyed) or hidden by whether its key is in it. A prop is no block,
so nothing ever asked about it, and every prop was drawn as if in sight,
however far the party had walked away (D-329 noted it and left it).

Now `sightShows` adds the cubes of the props sight shows to that set, by
D-331's seen-or-beside rule, and the stage greys a prop none of whose cubes
are in it — with the blocks' own two numbers, most of the way to its grey
and dimmed, so a remembered room reads as one thing. The host builds the
table's fog with it and the console builds the Party's view with it, so the
two cannot disagree; the GM's own view, with no fog, greys nothing.

Checked on a copy of the GM's data: Galion stood beside the table with sight
cut to 1 — the table, touching what Galion saw, stayed in colour; the
bookcases, the barrel and the door greyed with the explored ground, in the
Party's view and on the table alike. The On stage rows read *Galion* and
*Turdorn*, whole.

### D-333 — A bookcase is open at the front · `agreed`
*"Is the bookcase closed? Can we do it without the covers? Like the frame with
the back and the stands."* It was drawn as a solid box with the books painted
on its face. Now it is a back, two sides, a top and a bottom, two shelves,
and a row of books standing on each — red, blue, green and dark spines of a
few heights, a different run on each shelf so the three do not read as one
stamp. Open toward the front of its facing; turned with Z / X like any prop.

Only the drawing changed. It still stops sight (D-329): a bookcase full of
books is a wall to look through.

### D-334 — The bookcase's shelves are empty · `agreed`
*"Keep it blocking sight, but remove the books, I like to use it in different
ways and having book is too much detail."* The frame and the shelves stay
(D-333); the books go. An empty set of shelves is a library, a pantry or an
armoury as the GM says it is — the fiction is the table's to fill. It still
stops sight (D-329).

### D-335 — Lights · `agreed`
The third of D-321's order, after prefabs and props. The GM's answers before
building, all three the recommended ones:

- **A token may carry a light, this round** — a party member or a silver
  token, from a flame beside their row in On stage.
- **A light's reach is a number per light**, like a sight number: its type's
  to start (candles 3, lantern 5, torch 6, brazier 8, campfire 10), and the
  GM's to change, 1 to 20.
- **Steady flames.** No flicker: the screen is drawn when something changes,
  and a flicker would draw it all the time (R-170).

R-213 is the rule. How it was put together, and what it chose for itself:

**The light fills the air instead of being three.js lights.** Every light
in three.js is a term in every material's shader, recompiled whenever the
count changes, and without a shadow of its own each one shines through
walls — a torch in one room lighting the next. A dungeon has dozens. So the
light is worked out in the domain (`lamps`): from each flame, the shortest
way through the air to every cube within its reach, by the walk's steps
(R-209), never squeezing between two cubes that stop it. Blocks stop it,
and so does whatever stops sight — a shut door, a bookcase — whose cubes are
lit on the side the light came from and pass none on. The cubes' light goes
up as one 3D texture (`render/lamplight`), and every standard material adds
the light of the cube in front of each point of its surface, blended from
the eight around it — only those light can be in, so the floor beside a
wall is not darkened by the wall and the floor beyond it is not lit by this
room. Worked out per light and cached, so moving one torch redoes that torch:
about 10 ms for a map with seven lights, reach 20 included.

**The light is eased before it is added** (`1 − e^−light`): one flame lights
a surface to about its own colour close by, and a room full of them is
bright without being daylight. Found on the test copy: seven lights in a
corner of Tollkeep, added straight, turned night into noon.

**A light is placed lit; its other state is out.** The save's `opened`
already said which props are not as they were placed, and a light's
"other" is out — so lighting and putting out are `setPropOpen`, the Move
click and the panel's button, with their own words (*Put out the torch*,
*Light the torch*). Nothing new to remember when a light is placed or
stamped with a prefab: it is lit because nothing says otherwise. Lighting
one is never refused for somebody standing there; shutting a door still is.

**Chosen here, to be argued with:**

- **A torch hangs on the wall pointed at**, its back to the block, and
  turns with nothing else — the Turn buttons and Z / X leave it alone. Over
  a floor it says *no wall behind it to hang on*.
- **Candles, a lantern and a torch stop nothing; a brazier and a campfire
  stop walking.** A walk through the campfire looked wrong; a lantern on the
  floor is stepped over.
- **The flame is the light itself**: drawn flat in its colour, lit by
  nothing and casting no shadow, and gone when the light is out — a brazier's
  coals go to ash.
- **A carried light is a torch's to start** — fire, 6 — and goes where its
  carrier goes. A member's is the same in every map; a silver token's is the
  token's.
- **Lights the party cannot see do not reach the table**: placed ones with
  their props, a member's with the members the table holds, a silver token's
  only with the token. A goblin's torch beyond the wall would say a goblin is
  there (R-85).

Checked on a copy of the GM's data at night (sun 0.1, ambience 0.14): a torch
hung on Tollkeep's wall, put out and lit from the panel; a campfire and a
brazier on the grass, a lantern on the table and candles on the barrel;
Galion and Turdorn given torches from On stage. The table drew the torch on
the wall and Galion's light over the remembered ground. No errors on either
screen.

