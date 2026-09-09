# @tt/persistence

**Owns.** Campaign and save stores, serialisation, schema versioning and migrations.

**Must never know about.** Game rules. It stores and loads; it does not decide anything.

**May depend on:** `@tt/domain`, `@tt/protocol`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
