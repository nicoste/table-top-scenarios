import { describe, it, expect } from 'vitest';
import {
  createCampaign, ORIGIN, SCHEMA_VERSION, DEFAULT_VISION_RANGE,
  createMember, editMember, removeMember, startingParty, nextPawnColour,
  isAuthored, creatableSlots, chunkAt, WATER, DEFAULT_BOUNDS, centreOfBounds,
} from '@tt/domain';

describe('creating a campaign (R-92)', () => {
  it('asks for a name and nothing else', () => {
    const c = createCampaign('Ashfall');
    expect(c.name).toBe('Ashfall');
    expect(c.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('trims the name and refuses an empty one', () => {
    expect(createCampaign('  Ashfall  ').name).toBe('Ashfall');
    expect(() => createCampaign('   ')).toThrow();
  });

  it('opens on one water chunk surrounded by creatable slots', () => {
    const c = createCampaign('Ashfall');
    expect(isAuthored(c.world, ORIGIN)).toBe(true);
    expect(c.world.chunks.size).toBe(1);
    expect(chunkAt(c.world, ORIGIN)?.columns.every((col) => col.terrainId === WATER)).toBe(true);
    expect(creatableSlots(c.world)).toHaveLength(8); // all eight neighbours
  });

  it('starts with exactly one member named "player"', () => {
    const c = createCampaign('Ashfall');
    expect(c.party).toHaveLength(1);
    expect(c.party[0]?.name).toBe('player');
    expect(c.party[0]?.visionRange).toBe(DEFAULT_VISION_RANGE);
  });

  it('places the first chunk in the middle of the bounds, not at a fixed 10,10', () => {
    const c = createCampaign('Ashfall');
    expect(ORIGIN).toEqual({ cx: Math.floor(DEFAULT_BOUNDS.x / 2), cz: Math.floor(DEFAULT_BOUNDS.z / 2) });
    expect(centreOfBounds({ x: 60, z: 40 })).toEqual({ cx: 30, cz: 20 });
    expect(c.world.bounds).toEqual(DEFAULT_BOUNDS);
  });

  it('gives each campaign a distinct id', () => {
    expect(createCampaign('a').id).not.toBe(createCampaign('b').id);
  });

  it('starts with no places — those are stage 2', () => {
    expect(createCampaign('Ashfall').places).toEqual([]);
  });
});

describe('the party roster (R-91, D-083)', () => {
  it('defaults vision to 12 cells, which is 60 ft (R-46a)', () => {
    expect(DEFAULT_VISION_RANGE).toBe(12);
    expect(DEFAULT_VISION_RANGE * 5).toBe(60);
  });

  it('hands out a distinct pawn colour to each new member', () => {
    let party = startingParty();
    for (let i = 0; i < 5; i++) party = [...party, createMember(party)];
    expect(new Set(party.map((m) => m.colour)).size).toBe(party.length);
  });

  it('reuses a colour once the palette runs out rather than failing', () => {
    let party = startingParty();
    for (let i = 0; i < 12; i++) party = [...party, createMember(party)];
    expect(party).toHaveLength(13);
    expect(nextPawnColour(party)).toBeTruthy();
  });

  it('edits name, colour and vision range', () => {
    const party = startingParty();
    const id = party[0]!.id;
    const edited = editMember(party, id, { name: 'Vex', colour: '#123456', visionRange: 20 });
    expect(edited[0]).toMatchObject({ name: 'Vex', colour: '#123456', visionRange: 20 });
  });

  it('keeps the old name rather than accepting a blank one', () => {
    const party = startingParty();
    expect(editMember(party, party[0]!.id, { name: '   ' })[0]?.name).toBe('player');
  });

  it('snaps vision range to a non-negative integer', () => {
    const party = startingParty();
    expect(editMember(party, party[0]!.id, { visionRange: -4 })[0]?.visionRange).toBe(0);
    expect(editMember(party, party[0]!.id, { visionRange: 7.6 })[0]?.visionRange).toBe(8);
  });

  it('refuses to empty the roster — a party of nobody has no position', () => {
    const party = startingParty();
    expect(removeMember(party, party[0]!.id)).toHaveLength(1);
  });

  it('removes a member when others remain', () => {
    const party = [...startingParty()];
    const second = createMember(party);
    expect(removeMember([...party, second], second.id)).toHaveLength(1);
  });
});
