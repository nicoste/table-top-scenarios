# @tt/geometry

**Owns.** Pure spatial math on a grid of cubes. What it exports today is sight:
`lineIsClear` walks a straight line between two points through a set of blocks
and says whether anything stops it, and `cubeGrid`, `cubeIndex` and `cubeAt` give
a dense grid of cubes to index into (`sight/`). That is all of it. Cover and
posture were retired (D-035); movement and route-finding live in `domain`
(`route/`, `walk/`), not here.

**Must never know about.** Anything about three.js, the network, the file system, or the domain nouns. Numbers in, numbers out.

**May depend on:** _nothing_

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
