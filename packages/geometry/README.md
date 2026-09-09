# @tt/geometry

**Owns.** Pure spatial math: the voxel grid, ray traversal, visibility, cover, movement graphs, pathfinding.

**Must never know about.** Anything about three.js, the network, the file system, or the domain nouns. Numbers in, numbers out.

**May depend on:** _nothing_

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
