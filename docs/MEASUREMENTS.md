# Measurements

Numbers, with the conditions that make them mean something.

They were scattered across a dozen decision entries, which is where the
*reasoning* belongs but not the figures: a decision explains why something
changed, and this says what it cost before and after. The point is to be able
to answer "is this slower than it was" a year from now without re-deriving the
baseline.

**A number without its conditions is noise.** Twice in one afternoon a reading
nearly misled us because it was taken on a different machine, at a different
canvas size, or on a frame drawn under different rules. Every row below says
where it came from. A row that cannot say is not worth keeping.

---

## How to take a reading

1. Open the cost panel with **backtick**. `shift+backtick` toggles occlusion.
2. Open **the reference scene** below, or say which scene you used.
3. **Make the screen busy** — turn the camera, or move the pointer over the
   map. Frames are drawn only when something changes (R-170), and an idle
   screen reports the heartbeat rather than a cost.
4. Wait about **three seconds**. The frame window is 120 samples and the GPU
   figure is read a frame or two late.
5. Record the machine, the canvas size, and whether occlusion was on.

**What each figure means**

| | |
| --- | --- |
| `drawn` | frames drawn in the last second — 2 while idle is correct (R-170) |
| `frame p50 / p95 / worst` | how long a drawn frame took; judged against the 33 ms cap (R-169) |
| `gpu` | GPU time for a recent frame, from a timer query. **The only figure that answers "is this expensive"** — frame time is capped and so reports lateness, not load |
| `last rebuild` | milliseconds to build a map's geometry; paid on every cube placed |
| `last push` / `pushes/s` | the view arriving over the socket |
| `geometries / textures / shaders` | climbing while nothing is created means something is not being disposed |

---

## Does the panel disturb what it measures?

Asked, and worth asking of any instrument that lives inside the thing it
reads. Same camera, six samples each, hiding the overlay between runs:

| | gpu, six samples | median |
| --- | --- | --- |
| panel painted | 11.3, 11.9, 12.4, 12.5, 11.5, 10.3 | **11.9 ms** |
| panel `display: none` | 13, 10, 12.4, 10.7, 11.9, 11 | **11.9 ms** |
| panel painted again | 11, 11.9, 10.8, 11.3, 11, 12.2 | 11.3 ms |

No, not the GPU figure — and it could not, by construction: that number comes
from a GL timer query bracketing `composer.render()` alone, and the panel is
DOM the browser composites afterwards.

**What it does cost** is main-thread time, four times a second, reading
`renderer.info` and re-rendering a small React component. `frame p50` and
`p95` cannot show you that because they are pinned to the 33 ms cap (R-169).
And `js heap` plainly includes the panel — it is the one row that measures
itself.

---

## The reference scene

**The Tollkeep**, in the campaign `The Reference`.

**It is a script, not a file** — `npm run seed` builds it, deterministically, on
any machine (R-179). The scene before it was hand-built in the console and
existed only as data on one laptop; deleting that campaign took every figure in
this document with it, because a measurement without its scene is a number
without units (D-245). Three consecutive seeds produce a byte-identical body.

| | |
| --- | --- |
| cubes | 11,398 |
| footprint | 96 × 96 |
| levels used | 14, from −4 to 9 |
| families | **9 of 9** — every one in the registry |
| distinct swatches | 12 |
| faces, as whole cubes | 68,388 |
| what is in it | a sea, a shore, an island, a brick keep with a cellar, a lava pit, glass windows, a stand of trees |
| the party | **six, inside the Tollkeep**, standing on four levels — two in the hall, one upstairs, one in the cellar, two on the grass — in daylight, nothing cut (D-262) |

**The save is part of the scene** since tokens (D-262). The copy on disk had
drifted before the reseed that added them — 28 extra cubes, a cut band, dusk —
and every one of those moves a reading. Reseed before measuring, not after.

It is built to exercise what gets measured rather than to look like anywhere:
every family so the draw calls are the real count, transparent water and glass
so the transparent pass is in the frame, a lava pit so emission is, fourteen
levels so slicing is, and a figure on six of the nine families.

**The camera is the framing a map opens with**, which needs no description and
cannot drift. Readings taken anywhere else say how far in.

---

## Baselines, on the Tollkeep

Taken 5 October 2026 in the **Pane**, the browser inside the Claude app. Six
samples a figure, median reported.

| | gpu, occlusion on | occlusion off | occlusion costs |
| --- | --- | --- | --- |
| as the map frames | **11.6 ms** | 1.9 ms | 9.7 ms |
| 12 wheel ticks in | **11.8 ms** | 2.7 ms | 9.1 ms |

### What shadows cost (added 5 October 2026)

Same scene, same camera, before and after switching them on (R-180, D-248):

| | before | after |
| --- | --- | --- |
| gpu, occlusion **off** | 1.9 ms | **3.3 ms** |
| gpu, occlusion on | 11.6 ms | 11.2 ms |
| draw calls | 23 | 23 |
| the frame that opens the map | 48.9 ms | 47.8 ms |

**1.4 ms** per frame, all of it the fragment shader sampling the shadow map,
and nothing measurable once occlusion is on. Redrawing the shadow map is not in
that figure: it happens only when the geometry or the sun moves (R-180), on the
frame that rebuilds the body anyway — and that frame did not get slower.

### What tokens cost (added 5 October 2026)

Six tokens against none (R-184, R-187), at the reference camera, in the
**Pane** — canvas 1024 × 768 at a device pixel ratio of 2. Counted per drawn
frame with the shadow map not being redrawn, so the opening frame's extra pass
is not in it.

| | draw calls | triangles |
| --- | --- | --- |
| occlusion on, no tokens | 23 | 273,557 |
| occlusion on, six tokens | **47** | 274,925 |
| occlusion off, no tokens | 9 | 136,776 |
| occlusion off, six tokens | **21** | 137,460 |

Four draw calls a token with occlusion on, two without: a base and a card, and
occlusion draws the scene twice. The token-free row is this table's baseline to
the triangle.

| | |
| --- | --- |
| rebuilding six tokens on a move | **0.35 ms** median, 1.6 ms worst, over twenty |
| shadow map redrawn by a move | **never**, over twenty — one body change marks it at once (R-180) |
| gpu | not taken that day — the pane was off screen, drawing 2–4 frames a second; **taken the next, below** (D-267) |

The GPU column was left empty on purpose. A hidden page clocks the card down
between frames, which is D-230's trap: it measures the gaps, not the work.

GPU, the next day with the pane on screen (120 frames a second, document
visible), canvas **903 × 635** at a ratio of 2, the party moved off the seeded
cubes. Camera turning, six samples each, alternating:

| | six tokens | none |
| --- | --- | --- |
| occlusion on | 6.5 / 6.3 ms | 6.1 / 7.0 ms |
| occlusion off | 2.8 / 2.7 ms | 2.7 / 2.7 ms |

Inside the noise: six tokens cost nothing measurable (D-267).

### The card on a stand (added 6 October 2026)

The token as the GM drew it (D-266): a plate, a clip and an upright card, the
whole of it turning about the vertical. Fresh seed, reference camera, Pane on
screen, canvas **1728 × 1015** at a ratio of 2 — a larger canvas than the rows
above, so compare each row with its neighbour and not with those.

| | draw calls | triangles | gpu, six samples each |
| --- | --- | --- | --- |
| occlusion on, no tokens | 23 | 273,557 | 13.1 / 12.9 ms |
| occlusion on, six tokens | **59** | 273,869 | 13.1 / 13.0 ms |
| occlusion off, no tokens | 9 | 136,776 | 3.1 / 2.5 ms |
| occlusion off, six tokens | **27** | 136,932 | 2.3 / 3.0 ms |

Three meshes a token, so six draw calls each with occlusion on; 26 triangles a
token where the coin and card had 114. Neither shows on the GPU. The question
that prompted it — would a rectangular base help with triangles — has its
answer here: it cut them by three quarters and nothing noticed.

**Occlusion is flat across the camera now**, which is R-175 holding on a scene
it was not tuned against — before that change the same sweep went from 10.5 ms
to 30.7 (D-240). Everything that is not occlusion costs 2–3 ms, with the figures
on (R-177) and a transparent sea in frame.

| | |
| --- | --- |
| draw calls | 23 |
| triangles | 273,557 — the scene rasterised twice, for occlusion's normals |
| shader programs | 28 |
| geometries / textures | 18 / 9 |
| rebuild, the whole body | **7.9 ms** |
| the GM's push | 10.7 KiB |
| frame p50 / p95 | 33.3 / 34.9 ms, against the 33 ms cap (R-169) |
| worst | 48.9 ms — the frame the map opens on, which builds the body in it |

### What a message rebuilds (added 6 October 2026)

Counted with the readout's `rebuilds` row — every map body or world built since
the screen opened — on both screens at once, in the **Pane**, the reference
scene open on the console and the table (D-270):

| | before | after |
| --- | --- | --- |
| one notch of the hour | world and map, on both screens | **nothing** |
| one block placed | world and map | **the map** |
| undo | — | **the map** |
| keeping what did not change, per message | — | **0.05 ms** median, 0.26 ms worst (GM's view, 11.6 KiB, node) |

The hour is play state and nothing else, so before this every message —
every token step among them — rebuilt the whole scene on both screens and
restaged the shadows with it.

---

## Older baselines, on a scene that no longer exists

Everything below was measured on **The Eight's Church** — 9,714 cubes, 96 × 96,
15 of 48 levels — in a campaign that was deleted when the registry was
reorganised (D-245). The figures are true of the builds that produced them and
**are not comparable with the table above**: a different scene is a different
number, not a comparison. Kept because what they *taught* outlived them.

Measured 2 October 2026 unless stated. **Two machines appear below and their
numbers are not comparable with each other** — only each with itself.

- **GM's Chrome** — the Mac this is built on, a 120 Hz display.
- **Pane** — the browser inside the Claude app, a smaller canvas.

### What one cube costs (GM's Chrome)

| | before | after | where |
| --- | --- | --- | --- |
| `campaign.json`, written every intent | 354 KiB | **1.3 KiB** | D-217 |
| `world.json`, written every intent | 143 KiB | **only when terrain changes** | D-217 |
| a map body on disk | inside the manifest | **4.2 KiB, its own file** | D-217 |
| the GM's push | 270 KiB | **7.0 KiB** | D-217, D-220, D-222 |
| `encodeCampaign`, nothing changed | 3.23 ms | **0.003 ms** | D-219, D-220 |
| one cube: encode, both views, serialise | ~17 ms | **0.417 ms** | D-219, D-220 |

A twenty-cell paint drag went from roughly **10 MB of disk and 10 MB of wire**
to a few hundred KiB.

### Encoding a body (the church, 9,714 cubes)

| | size |
| --- | --- |
| JSON, one entry per cube | 257.9 KiB |
| JSON, gzipped | 25.4 KiB |
| sparse binary, 7 bytes a block | 66.4 KiB |
| **palette + run-length** | **4.2 KiB** |

Terrain, the same idea in two dimensions: a world of 142.7 KiB packs to
**1.6 KiB** (D-220).

### Frames (GM's Chrome, the church)

| | occlusion off | occlusion on |
| --- | --- | --- |
| before the cap existed | 120 fps, p50 8.3 ms | **51 fps, p50 19.7 ms** |
| capped at 30 (R-169) | 30 fps, p50 33.3 ms | 30 fps, p50 33.4 ms |

With frames drawn only on change (R-170): **2 a second idle, 30 when anything
is happening.**

### Where the GPU time goes (Pane, the church)

| | GPU |
| --- | --- |
| straight to the canvas, no composer | **0.7 ms** |
| through the composer, occlusion pass disabled | 1.9 ms |
| composer and occlusion | **6.7 ms** |

So the composer costs about **1.2 ms** and occlusion about **4.8 ms** on top.

Occlusion is insensitive to resolution — full 3.1 ms, half 3.5, a third 3.5
(D-228) — and insensitive to geometry: cutting the church's triangles by 2.9×
left it at 4.9 ms against 5.0 (O-027). An **empty** scene costs 4.6 ms.

**Every figure in this section was taken at one camera, and that is the one
variable that moves it.** See the next table. Read "insensitive to resolution
and geometry", not "fixed".

### Occlusion against camera distance (Pane, the church, 3 October 2026)

Zooming in costs nothing to rasterise and triples the occlusion pass, because
GTAO's radius is in world units and its cost follows how many pixels that
radius covers.

| camera | gpu, occlusion on | occlusion off | occlusion costs | **after R-175** |
| --- | --- | --- | --- | --- |
| church fully out | 11.3 ms | 0.8 ms | 10.5 ms | 10.8 ms |
| 12 wheel ticks in | 17.9 ms | 2.1 ms | 15.8 ms | 16.1 ms |
| 24 ticks in | 20.4 ms | 2.1 ms | 18.3 ms | 17.6 ms |
| 36 ticks in | **31.8 ms** | 1.1 ms | **30.7 ms** | **17.7 ms** |
| 48 ticks in | 31.8 ms | 2.2 ms | 29.6 ms | 17.5 ms |

At 36 ticks the frame was entirely occlusion, against a 33 ms cap. The last
column is the same sweep with the radius measured in pixels instead of world
units — fifteen of them, chosen so a framed map looks as it did (R-175,
D-240). The cliff is gone; the rest scales with how much of the screen has
geometry on it, which is the pass doing its job.

**The world map, zoomed in: 18.8 ms on 97,890 triangles**, against the
church's 17.7 ms on 234,509. Same cost, a third of the geometry. This pass is
priced in pixels.

**And everything that is not occlusion costs 0.8–2.2 ms**, at every zoom, with
a transparent sea of 7,239 water cubes in it. Transparency is free (D-239);
the composer and GTAO are the whole bill.

### Does transparency cost anything? (Pane, the church, one camera)

Asked directly, so measured directly: the same build with water, glass and ice
forced to opacity 1, then back. Occlusion **off**, because with it on the pass
swamps the thing being measured — 18.8 ms either way.

| | raster, six samples | median |
| --- | --- | --- |
| all opaque | 1.5, 1.4, 1.4, 1.2, 1.2, 0.9 | **1.4 ms** |
| water, glass and ice see-through | 1.7, 1.0, 1.3, 1.7, 1.1, 1.3 | **1.3 ms** |

The same, inside the noise, and the noise is wider than any difference. Draw
calls are 21 either way: an opaque material never enters the transparent path
at all, because `transparent` is set from `opacity < 1` and stone's is false.

A single pair of readings had said 1.1 against 2.3 and looked like a real
doubling. Six samples each says that pair was noise — which is the whole
argument for taking more than one.

### What the figure in a surface costs (Pane, the church)

Occlusion **off**, to isolate the raster from the pass that swamps it. Same
camera, alternating, six samples each (R-177, D-244).

| | gpu | median |
| --- | --- | --- |
| figure off | 2.8, 2.8, 2.9, 2.9, 2.8, 2.8 | **2.8 ms** |
| figure on | 2.9, 2.9, 2.9, 2.9, 2.8, 2.7 | **2.9 ms** |
| figure off | 2.8, 2.9, 2.9, 2.8, 2.9, 2.5 | **2.9 ms** |
| figure on | 2.9, 3, 2.8, 2.9, 2.9, 2.8 | **2.9 ms** |

Nothing, inside the noise. No extra draw calls, no extra triangles, no
textures — arithmetic on fragments the card was shading anyway.

**Shader programs 13 → 22**, and programs compile on first draw, so the map was
reopened cold to look for a stall: **worst frame 35.2 ms**, inside the
34.7–40.7 ms already measured without patterns. None.

### Geometry (the church)

| | |
| --- | --- |
| triangles drawn, whole cubes | 116,568 |
| triangles with occlusion on | 233,141 — the scene is rasterised twice for the normal buffer |
| triangles if faces were culled | 39,540 — built, measured, reverted (O-027) |
| rebuild, instanced | **4.2 ms** |
| rebuild, meshed with culling | 16.6 ms — built and reverted (O-027) |
| rebuild, instanced with grain | **5.3 ms** — a hash and an HSL nudge per cube (R-172) |

### One mesh per material (Pane, the church, 3 October 2026)

Before and after on the same canvas minutes apart, which is the only way these
two columns are comparable. The body held **7 materials** that day — the roof's
thatch and the one lava block had been filled over, so a restored church would
read 9 meshes and 23 draw calls.

| | one mesh | one per material |
| --- | --- | --- |
| block meshes | 1 | 7 |
| draw calls, whole scene | 7 | **19** |
| triangles | 233,141 | 233,141 |
| gpu | 12.6 ms | **12.6 ms** |
| rebuild | 3.2 ms | **6.0 ms** |

Draw calls rose by twelve, not six: **occlusion rasterises the scene twice**,
so every mesh is counted in both passes. The GPU figure did not move, because
the GTAO pass is almost all of it.

The same `buildBlockBody` in node, warm, is **2.83 ms before and 2.99 after** —
the split itself costs nothing. The browser's extra milliseconds are setup
under a live renderer, and 1.4 ms of them were three.js warning twelve times a
rebuild about an `emissive: undefined` (7.4 ms before that was fixed, D-238).

---

## What the numbers taught, beyond the numbers

These outlive any particular figure, and each one cost a wrong theory to learn.

**The GPU is not the bottleneck at this scale — the post-processing is.**
This machine draws 116,568 triangles in 0.7 ms, and a whole scene with a
transparent sea in 2 ms. Every optimisation aimed at geometry has returned
nothing (O-027). Occlusion costs ten to thirty times the thing it is shading
(D-239). Look at the wire, the disk and the rebuild before looking at the
card, and at the passes before the triangles.

**Frame time cannot see load.** It is capped and vsync-locked, so it measures
*lateness*. A GPU doing three times the work reads the same until it drops a
frame. The GM's fan found what the panel could not (D-226).

**A figure needs the condition that moves it, and you do not always know
which one that is.** Occlusion was called "very nearly a fixed cost" on five
readings that varied resolution and geometry — both of which it genuinely
ignores — and none that varied the camera, which triples it (D-239).

**Measure at the boundaries, because that is where instruments lie.** Six
misreports from the cost panel, every one at an edge: the first frame, an idle
frame, a frame behind a composer, the frame after a silence (D-226, D-228,
D-229, D-230, D-231). Steady state was right every time.

**Check the state you think you are in.** A click that did not register once
produced a "world map" reading that was the church measured twice (D-228).

**An optimisation that is not measured is not an optimisation.** Half-
resolution occlusion and face culling were both built on sound-sounding
theories, both measured, both reverted (D-228, O-027).

**Measure the same thing twice in two places before blaming the change.** A
rebuild that doubled in the browser was identical in node, which is what
turned the suspect from "thirteen meshes" into "twelve `console.warn`s"
(D-238).
