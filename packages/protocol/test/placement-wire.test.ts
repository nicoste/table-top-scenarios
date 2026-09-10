// Reading a save written before placement existed (R-61). This lives in
// `protocol` and not in `domain`: the wire is protocol's business, and a domain
// test importing protocol is a backwards edge that `npm run arch` refuses (R-5).

import { describe, it, expect } from 'vitest';
import { SaveWireSchema, decodeSave, encodeSave, decodePlacement } from '@tt/protocol';
import { emptyPlacement, withGroupAt, SAVE_SCHEMA_VERSION } from '@tt/domain';

const AT = '2026-01-01T00:00:00.000Z';

const versionOneSave = {
  id: 'save_live_c1',
  campaignId: 'c1',
  campaignSchemaVersion: 2,
  schemaVersion: 1,
  label: 'Live',
  savedAt: AT,
  discovery: { chunks: ['1,1'], pois: [] },
};

describe('a save written before the party could be placed', () => {
  it('decodes with the party unplaced rather than failing to parse', () => {
    const save = decodeSave(SaveWireSchema.parse(versionOneSave));
    expect(save.placement).toEqual(emptyPlacement());
    expect([...save.discovery.chunks]).toEqual(['1,1']);
  });

  it('reports the version it was written with, not the current one', () => {
    // Upgrading is `sim`'s job when it adopts the save; decoding just reads.
    expect(decodeSave(SaveWireSchema.parse(versionOneSave)).schemaVersion).toBe(1);
    expect(SAVE_SCHEMA_VERSION).toBeGreaterThan(1);
  });
});

describe('round-tripping placement', () => {
  it('survives encode and decode', () => {
    const save = decodeSave(SaveWireSchema.parse(versionOneSave));
    const moved = { ...save, placement: withGroupAt(save.placement, { cx: 3, cz: 4, x: 5, z: 6 }) };
    const back = decodeSave(SaveWireSchema.parse(JSON.parse(JSON.stringify(encodeSave(moved)))));
    expect(back.placement.at).toEqual({ cx: 3, cz: 4, x: 5, z: 6 });
  });

  it('treats a missing placement on the table view as an unplaced party', () => {
    expect(decodePlacement(null)).toEqual(emptyPlacement());
  });
});
