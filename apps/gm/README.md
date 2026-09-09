# @tt/gm

**Owns.** The GM console: build tools, both builders, POI inspector, notes, secrets, session control.

**Must never know about.** Anything in apps/table.

**May depend on:** `@tt/render`, `@tt/protocol`, `@tt/domain`, `@tt/geometry`, `@tt/ui`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
