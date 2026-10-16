// Which way a place faces, on the wire and on disk (R-203).

import { describe, it, expect } from 'vitest';
import { PlaceWireSchema, decodePoi } from '@tt/protocol';

const written = {
  id: 'place_inn',
  name: 'The Inn',
  cell: { cx: 15, cz: 15, x: 4, z: 4 },
  markerId: 'marker:village',
  notes: [],
};

describe('a place facing', () => {
  it('reads a place written before it could turn as facing the way its marker is written', () => {
    // Every campaign on disk before R-203: the absence says it itself (D-187).
    expect(decodePoi(PlaceWireSchema.parse(written)).facing).toBe(0);
  });

  it('carries a quarter turn through', () => {
    expect(decodePoi(PlaceWireSchema.parse({ ...written, facing: 3 })).facing).toBe(3);
  });

  it('opens a file with a facing out of range rather than refusing the campaign', () => {
    // Lenient where intents are strict: a hand-edited file must not lock the
    // GM out of a world over which way a hut points.
    expect(decodePoi(PlaceWireSchema.parse({ ...written, facing: 6 })).facing).toBe(2);
    expect(decodePoi(PlaceWireSchema.parse({ ...written, facing: -1 })).facing).toBe(3);
  });
});
