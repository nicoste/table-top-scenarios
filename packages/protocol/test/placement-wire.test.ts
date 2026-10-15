// Reading a save written before placement existed (R-61). This lives in
// `protocol` and not in `domain`: the wire is protocol's business, and a domain
// test importing protocol is a backwards edge that `npm run arch` refuses (R-5).

import { describe, it, expect } from 'vitest';
import { SaveWireSchema, decodeSave, encodeSave, decodePlacement } from '@tt/protocol';
import { emptyPlacement, withGroupAt, SAVE_SCHEMA_VERSION, ON_FOOT } from '@tt/domain';
import type { TravelModeId } from '@tt/domain';

const AT = '2026-01-01T00:00:00.000Z';

const versionOneSave = {
  id: 'save_live_c1',
  campaignId: 'c1',
  campaignSchemaVersion: 2,
  schemaVersion: 1,
  label: 'Live',
  savedAt: AT,
  discovery: { chunks: ['1,1'], places: [] },
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

describe('round-tripping what the party travels by (D-304)', () => {
  it('reads a save written before the party could own a boat as on foot', () => {
    // The absence says it itself, so no schema bump (D-187, R-144): a save
    // with no record of conveyances is a party that walks.
    expect(decodeSave(SaveWireSchema.parse(versionOneSave)).travelling).toEqual(ON_FOOT);
  });

  it('carries a null through, because no boat is a fact and not a gap', () => {
    const save = decodeSave(SaveWireSchema.parse(versionOneSave));
    const sailing = {
      ...save,
      travelling: {
        land: 'travel:horse' as TravelModeId, water: 'travel:ship' as TravelModeId, air: null,
      },
    };
    const back = decodeSave(SaveWireSchema.parse(JSON.parse(JSON.stringify(encodeSave(sailing)))));
    expect(back.travelling).toEqual({ land: 'travel:horse', water: 'travel:ship', air: null });
  });

  it('keeps a party that has lost everything on nothing, not back on foot', () => {
    const save = decodeSave(SaveWireSchema.parse(versionOneSave));
    const stranded = { ...save, travelling: { land: null, water: null, air: null } };
    const back = decodeSave(SaveWireSchema.parse(JSON.parse(JSON.stringify(encodeSave(stranded)))));
    expect(back.travelling).toEqual({ land: null, water: null, air: null });
  });
});
