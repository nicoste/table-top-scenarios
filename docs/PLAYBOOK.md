# Playbook

**Read this before writing code.** [ARCHITECTURE.md](ARCHITECTURE.md) is the law —
95+ numbered rules — and it is long. This is the short operational companion: what
the standard move is, in what order, and how you know you are done.

If the two ever disagree, `ARCHITECTURE.md` wins and this file is a bug.

---

## The pattern, in three sentences

1. **Hexagonal at the package level.** Dependencies point inward. The core
   (`geometry`, `domain`) knows nothing about the outside; adapters
   (`persistence`, `host`, `render`, `apps/*`) hold every side effect.
2. **Unidirectional flow at runtime.** A gesture becomes an intent, the host runs
   it through `sim`, and clients render the snapshot that comes back. Clients never
   mutate state.
3. **Feature slices inside apps.** A feature owns its panel, its local state, its
   input and its intents. Not `components/` + `utils/` + `state/`.

We are deliberately **not** using VIPER or full Clean ceremony. See D-087.

```
gesture → intent → host → sim → state' + events → viewFor(role) → channel → client store → render
```

---

## The traversal order

> **Always `domain` → `protocol` → `sim` → `render` → app. Never start in the app.**

Skip any step that needs nothing, but never reorder. Starting in the app is how
logic ends up in a panel, and it is the single most likely way this codebase goes
wrong.

| Step | Package | What goes here | Test? |
|---|---|---|---|
| 1 | `domain` (or `geometry`) | the pure operation on data | **yes** |
| 2 | `protocol` | the intent type + Zod schema; any snapshot field it touches | schema only |
| 3 | `sim` | the handler: permission check, call the pure op, emit events | **yes** |
| 4 | `persistence` | only if a persisted shape changed (then a migration) | **yes** |
| 5 | `render` | drawing whatever is new | no (R-23) |
| 6 | `apps/gm` or `apps/table` | the feature slice: panel, gesture, dispatch | no (R-23) |

`sim` is **completely pure** (R-98). It never reads a file, a clock or a socket —
the host passes in whatever it needs. That is why steps 1 and 3 are the only ones
that require tests: they are the only ones where a mistake is silent.

---

## The reference feature: paint terrain

**Paint terrain is the designated worked example (R-101).** It is a real feature in
v0.1, not sample code, so it cannot rot without a test going red.

Read it in this order:

1. **`packages/domain/src/world/index.ts`** — `paintTerrain(chunk, x, z, terrainId)`.
   Note what it does *not* do: no mutation (returns a new `Chunk`), no I/O, no
   knowledge of who asked. It returns the *same* chunk when nothing would change,
   so callers can compare by identity.
2. **`packages/domain/test/world.test.ts`** — the test named
   *"painting changes terrain and leaves height alone"*. It asserts a **rule**
   (R-88), not an implementation. That is the standard to match: a test whose name
   states the guarantee it defends.

The remaining rings land as v0.1 is built, and this section grows with them. Every
path named in this file is checked by `test/docs.test.ts`, so it cannot drift into
fiction.

### The shape each ring takes

```ts
// 1. domain — pure, testable, ignorant of everything else
export function paintTerrain(chunk: Chunk, x: number, z: number, terrainId: TerrainId): Chunk

// 2. protocol — the wire contract, validated at the edge
export const PaintTerrain = z.object({
  kind: z.literal('paintTerrain'),
  chunk: ChunkCoordSchema, x: CellIndex, z: CellIndex, terrainId: TerrainIdSchema,
});

// 3. sim — permission, then the pure op. no I/O.
//    returns a rejection with a reason; never silently ignores (R-18)
export function apply(state: State, actor: Role, intent: Intent): Applied

// 6. apps/gm/src/features/build-world — gesture in, intent out
onCellTap(cell) { dispatch({ kind: 'paintTerrain', ...cell, terrainId: selected }); }
```

---

## Definition of done

- [ ] `npm run verify` green — typecheck, dependency graph, lint, tests
- [ ] every new rule-bearing behaviour has a test **named after the rule it defends**
- [ ] a package's `README.md` updated if what it owns or must-never-know changed
- [ ] a numbered entry in [DECISIONS.md](DECISIONS.md) for anything the docs did not
      already cover (**R-0** — this is not optional)
- [ ] no new dependency without a decision naming what it replaces (R-24)
- [ ] a row in [MEASUREMENTS.md](MEASUREMENTS.md) if the change moved a number
      worth comparing against later — **with the machine and the scene it was
      measured on**, because a figure without its conditions is noise

---

## How you will be tempted to break the rules

Each of these is easier than doing it properly, which is why they are listed.

| Temptation | Why it is wrong | Do instead |
|---|---|---|
| "It's one line, I'll put the maths in the panel" | logic in an app is untestable and invisible to the graph | put it in `domain`, export it, call it |
| "The client already knows, I'll just update locally" | two sources of truth; the next snapshot silently reverts you | dispatch an intent (R-3) |
| "`sim` needs the current time" | kills purity and every test needs a fake clock | the host passes time in (R-98) |
| "I'll reach into the other package's `src/`" | fails `npm run arch` | export it from the barrel (R-6) |
| "The table needs this GM panel" | it cannot import it, by construction | move the shared part to `client-core` or `ui` (R-63) |
| "I'll add a `utils/` folder" | becomes the junk drawer | name the concept; put it in a feature or a package |
| "Fog is only rendering, I'll bake it into the mesh" | forces a re-mesh on every token step | per-cube attribute (R-69) |
| "I'll store the camera in the snapshot" | a snapshot then resets the view | view state is local (R-64) |

---

## Delegating to agents

> **Subagents run on Sonnet at high effort. Always. Set it explicitly.**

Never let an agent inherit the main loop's model. The main loop is dialled up and
down deliberately — including to Opus for heavy orchestration — and that choice
must not propagate to a fleet of agents, where one change silently multiplies
cost across every one of them.

In a Workflow script that means `{ model: 'sonnet', effort: 'high' }` on every
`agent()` call; with the Agent tool it means passing the model explicitly.

---

## Naming

- files `kebab-case.ts` · types `PascalCase` · functions `camelCase`
- registry ids are namespaced strings: `terrain:swamp` (R-11), never indices
- ids are branded: `PlaceId`, not `string` (R-10)
- never call something `visible` — say `Revealed`, `visibleToParty`, or *drawn*
  (R-84); they are three different things
- `index.ts` re-exports named symbols explicitly, never `export *`

---

## Gotcha: never import your own barrel

Inside a package, import from the sibling module (`../camera/index.js`), never
from `../index.js`. Reaching for your own barrel creates a cycle — the barrel
imports you, you import the barrel — and `npm run arch` will fail with
`no-circular`. The barrel is for *consumers*.

---

## Gotcha: a conditionally rendered canvas needs a callback ref, not a ref

`useStage` tracks the canvas in **state**, via a callback ref, and its effect
depends on it. That is deliberate.

A `useRef` does not re-render. An effect with `[]` runs once — and if the
`<canvas>` is behind a condition (`status !== 'open'`, "no campaign yet"), it is
not in the DOM yet, so the effect finds `null`, returns early, and **never runs
again**. The symptom is silent: no error, no console output, a canvas stuck at its
default 300×150 backing store, and a black screen.

The same applies to anything that must attach to a conditionally rendered element.

---

## Gotcha: `preventDefault` inside React's `onWheel` does nothing

React attaches `wheel`, `touchstart` and `touchmove` listeners as **passive**, so
`e.preventDefault()` in `onWheel` is ignored, and Chrome logs `Unable to
preventDefault inside passive event listener invocation.` on every tick. A handler
that has to cancel the browser's own handling adds its listener itself, with
`{ passive: false }`, in an effect keyed on the element in state as above. The
wheel zoom in both shells is the example (D-265).
