// The order of everyone on stage (R-208): a number the GM types, and a list
// sorted by it. Not initiative tracking — nothing rolls, nothing has a turn.

import { describe, it, expect } from 'vitest';
import {
  NO_ORDER, MAX_ORDER, MIN_ORDER, cleanOrder, withOrder, inOrder, onStage, orderToJSON, orderFromJSON,
} from '@tt/domain';

const rows = [
  { id: 'member_a' }, { id: 'member_b' }, { id: 'silver_x' }, { id: 'silver_y' }, { id: 'silver_z' },
];
const ids = (list: readonly { id: string }[]) => list.map((row) => row.id);

describe('ordering who is on stage', () => {
  it('leaves the list as handed over when nobody has a number', () => {
    expect(ids(inOrder(rows, NO_ORDER))).toEqual(ids(rows));
  });

  it('puts the highest first and those without a number last', () => {
    let order = withOrder(NO_ORDER, 'silver_y', 18);
    order = withOrder(order, 'member_b', 12);
    order = withOrder(order, 'silver_x', 21);
    expect(ids(inOrder(rows, order))).toEqual(['silver_x', 'silver_y', 'member_b', 'member_a', 'silver_z']);
  });

  it('breaks a tie by the order they were handed over, party first', () => {
    let order = withOrder(NO_ORDER, 'silver_x', 15);
    order = withOrder(order, 'member_b', 15);
    expect(ids(inOrder(rows, order)).slice(0, 2)).toEqual(['member_b', 'silver_x']);
  });

  it('takes a number away with null, and is the same order when nothing changes (R-165)', () => {
    const order = withOrder(NO_ORDER, 'member_a', 7);
    expect(withOrder(order, 'member_a', 7)).toBe(order);
    expect(withOrder(order, 'member_a', null).size).toBe(0);
    expect(withOrder(NO_ORDER, 'member_a', null)).toBe(NO_ORDER);
  });

  it('keeps numbers whole and within any initiative a table rolls', () => {
    expect(cleanOrder(12.6)).toBe(13);
    expect(cleanOrder(5000)).toBe(MAX_ORDER);
    expect(cleanOrder(-500)).toBe(MIN_ORDER);
    expect(cleanOrder(Number.NaN)).toBeNull();
    expect(cleanOrder(null)).toBeNull();
  });

  it('forgets the numbers of anybody no longer on stage', () => {
    const order = withOrder(withOrder(NO_ORDER, 'silver_gone', 9), 'member_a', 3);
    expect([...onStage(order, new Set(['member_a'])).keys()]).toEqual(['member_a']);
    expect(onStage(order, new Set(['member_a', 'silver_gone']))).toBe(order);
  });

  it('round-trips, and reads anything that is not a number as none', () => {
    const order = withOrder(withOrder(NO_ORDER, 'b', 2), 'a', 1);
    expect(orderFromJSON(JSON.parse(JSON.stringify(orderToJSON(order))))).toEqual(order);
    expect([...orderFromJSON({ a: 'x', b: 4, c: null }).entries()]).toEqual([['b', 4]]);
    expect(orderFromJSON(null)).toBe(NO_ORDER);
  });
});
