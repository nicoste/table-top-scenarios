# @tt/table

**Owns.** The table display: the shared view everyone looks at, token movement, navigation.

**Must never know about.** Anything in apps/gm. It must be impossible to import a GM panel here.

**May depend on:** `@tt/render`, `@tt/protocol`, `@tt/domain`, `@tt/geometry`, `@tt/ui`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
