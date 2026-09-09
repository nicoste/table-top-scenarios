# @tt/host

**Owns.** The Node process: WebSocket transport, session lifecycle, static serving, wiring sim to persistence.

**Must never know about.** Game rules or geometry. It is plumbing.

**May depend on:** `@tt/sim`, `@tt/persistence`, `@tt/protocol`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
