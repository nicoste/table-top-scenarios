// Undo history for authored content (D-169).
//
// Cheap because the domain is immutable with identity-preserving edits (R-165):
// a paint stroke rebuilds one chunk and shares every other, so an entry costs
// roughly one chunk rather than a whole world. Keeping fifty of them is nothing.
//
// Scope is the **campaign** and nothing else. Play state is not in here:
// discovery's toggles are their own undo (D-147), and party position belongs to
// the players as much as the GM (R-136) — a shared history under one person's
// cmd+z is a different, worse feature.

import type { Campaign } from '@tt/domain';
import type { History } from '@tt/protocol';

/** How far back cmd+z reaches. Bounded so a long session cannot grow forever. */
export const MAX_HISTORY = 50;

// `History`'s shape lives in `protocol` beside `HostState`. Everything that
// *changes* it lives here, because that is a rule (R-67, R-97).
//
// On `stroke`: a paint or height drag dispatches one intent per cell entered, so
// without coalescing cmd+z would step back one cell at a time through something
// that felt like a single action. The client tags a gesture's intents with an id
// and only the first of them records history (D-170).

export function emptyHistory(): History {
  return { past: [], future: [], stroke: null };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;

/**
 * Records the state an edit is about to replace.
 *
 * Doing anything new discards the redo branch, which is what every editor does:
 * once you diverge, the path you abandoned is not reachable any more.
 */
export function remember(history: History, before: Campaign, stroke: string | null): History {
  // Mid-stroke: the first intent of this gesture already captured the state
  // before it began. `stroke !== null` matters — two separate single-shot edits
  // both carry `null` and must not collapse into one.
  if (stroke !== null && stroke === history.stroke) return history;

  const past = [...history.past, before].slice(-MAX_HISTORY);
  return { past, future: [], stroke };
}

export interface Stepped {
  readonly history: History;
  readonly campaign: Campaign;
}

export function undone(history: History, current: Campaign): Stepped | null {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return {
    campaign: previous,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, MAX_HISTORY),
      // Cleared so a gesture cannot coalesce across an undo.
      stroke: null,
    },
  };
}

export function redone(history: History, current: Campaign): Stepped | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    campaign: next,
    history: {
      past: [...history.past, current].slice(-MAX_HISTORY),
      future: history.future.slice(1),
      stroke: null,
    },
  };
}
