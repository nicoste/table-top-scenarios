# @tt/ui

**Owns.** Presentational primitives: panels, lists, sliders, palettes, number fields.

**Must never know about.** Any domain noun. A component here could serve a different product entirely.

**May depend on:** _nothing_

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
