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

## The reference scene

**The Eight's Church**, in the campaign `We Can Test Here`.

| | |
| --- | --- |
| cubes | 9,714 |
| footprint | 96 × 96 |
| levels used | 15 of 48 — these maps are flat storeys, not dense volumes |
| materials | 9 |
| faces, as whole cubes | 58,284 |
| faces that can be seen | 19,770 |
| world beside it | 9 chunks, 8,100 columns, 5 terrains |

---

## Baselines

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
left it at 4.9 ms against 5.0 (O-027). An **empty** scene costs 4.6 ms. It is
very nearly a fixed cost.

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

**The GPU is not the bottleneck at this scale.** This machine draws 116,568
triangles in 0.7 ms. Every optimisation aimed at geometry has returned nothing
(O-027). Look at the wire, the disk and the rebuild before looking at the card.

**Frame time cannot see load.** It is capped and vsync-locked, so it measures
*lateness*. A GPU doing three times the work reads the same until it drops a
frame. The GM's fan found what the panel could not (D-226).

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
