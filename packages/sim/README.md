# @tt/sim

**Owns.** Authoritative simulation: (state, intent) => { state, events }, permission checks, party fog, view filtering.

**Must never know about.** Clocks, randomness, I/O, or any awareness that a network or a screen exists. It must run headless.

**May depend on:** `@tt/domain`, `@tt/geometry`, `@tt/protocol`

Adding a dependency here requires a numbered decision (R-7). The public surface
is `src/index.ts` only (R-6).
