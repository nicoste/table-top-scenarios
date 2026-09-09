# @tt/render

**Owns.** three.js: chunked greedy meshing, token and marker rendering, camera rigs, picking.

**Must never know about.** The network, the simulation, persistence, or any UI panel. It renders domain data and nothing more.

**May depend on:** `@tt/domain`, `@tt/geometry`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
