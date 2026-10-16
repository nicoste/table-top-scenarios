// The order of everyone on stage (R-208): a number the GM types beside each
// token, gold or silver, and the list sorted by it.
//
// **Not initiative tracking.** Section 1 rules initiative out, and this is
// not it: nothing here rolls, nothing knows whose turn it is, and there is no
// "next". It is a number the GM sets and a list that sorts by it — for a
// fight, or a queue at a bar, or anything else that needs an order (D-312).
//
// Kept per map: the tavern brawl's order is not the cellar's.

/** Token id (a member's, or a silver token's) to the number the GM gave it. */
export type StageOrder = ReadonlyMap<string, number>;

export const NO_ORDER: StageOrder = new Map();

/** The numbers the GM may type: whole, from -99 to 999 — any initiative a table rolls. */
export const MIN_ORDER = -99;
export const MAX_ORDER = 999;

/** A number as kept: whole and within range, or `null` for none. */
export function cleanOrder(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(MAX_ORDER, Math.max(MIN_ORDER, Math.round(value)));
}

/**
 * Gives a token a number, or takes it away (`null`). Identity-preserving
 * (R-165), and a map whose last number goes keeps no empty record.
 */
export function withOrder(order: StageOrder, id: string, value: number | null): StageOrder {
  const next = cleanOrder(value);
  if ((order.get(id) ?? null) === next) return order;
  const copy = new Map(order);
  if (next === null) copy.delete(id);
  else copy.set(id, next);
  return copy;
}

/**
 * The list in order: **highest first, those without a number last**, and
 * ties — and everyone without one — in the order they were handed over, which
 * is the party in roster order and then everyone else as they were placed.
 */
export function inOrder<T extends { readonly id: string }>(rows: readonly T[], order: StageOrder): readonly T[] {
  return rows
    .map((row, index) => ({ row, index, value: order.get(row.id) ?? null }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value || a.index - b.index;
    })
    .map(({ row }) => row);
}

/** Only the numbers of tokens still on stage, for tidying on the way in. */
export function onStage(order: StageOrder, live: ReadonlySet<string>): StageOrder {
  const keep = [...order].filter(([id]) => live.has(id));
  return keep.length === order.size ? order : new Map(keep);
}

export type StageOrderJSON = Record<string, number>;

export function orderToJSON(order: StageOrder): StageOrderJSON {
  return Object.fromEntries([...order.keys()].sort().map((id) => [id, order.get(id)!]));
}

/** Read leniently: anything that is not a number in range is no number. */
export function orderFromJSON(json: Readonly<Record<string, unknown>> | undefined | null): StageOrder {
  if (!json) return NO_ORDER;
  const out = new Map<string, number>();
  for (const [id, raw] of Object.entries(json)) {
    const value = typeof raw === 'number' ? cleanOrder(raw) : null;
    if (value !== null) out.set(id, value);
  }
  return out.size === 0 ? NO_ORDER : out;
}
