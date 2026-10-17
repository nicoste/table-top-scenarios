// The GM's notes on the party's members (D-315): one per member, across every
// map, kept in the save. Free text only the GM sees.

import { describe, it, expect } from 'vitest';
import {
  NO_MEMBER_NOTES, MAX_MEMBER_NOTE, withMemberNote, notesOnRoster, memberNotesToJSON, memberNotesFromJSON,
} from '@tt/domain';

describe('a note on a party member', () => {
  it('keeps it trimmed, and an empty one clears it without leaving an entry', () => {
    const notes = withMemberNote(NO_MEMBER_NOTES, 'member_a', '  owes the guild 50 gp ');
    expect(notes.get('member_a')).toBe('owes the guild 50 gp');
    expect(withMemberNote(notes, 'member_a', '   ').size).toBe(0);
  });

  it('changes nothing when the note is the same (R-165)', () => {
    const notes = withMemberNote(NO_MEMBER_NOTES, 'member_a', 'cursed');
    expect(withMemberNote(notes, 'member_a', 'cursed ')).toBe(notes);
    expect(withMemberNote(NO_MEMBER_NOTES, 'member_a', '')).toBe(NO_MEMBER_NOTES);
  });

  it('cuts a note to length', () => {
    expect(withMemberNote(NO_MEMBER_NOTES, 'member_a', 'x'.repeat(900)).get('member_a')).toHaveLength(MAX_MEMBER_NOTE);
  });

  it('keeps only the notes of members still on the roster', () => {
    let notes = withMemberNote(NO_MEMBER_NOTES, 'member_a', 'cursed');
    notes = withMemberNote(notes, 'member_b', 'left for the coast');
    expect([...notesOnRoster(notes, new Set(['member_a'])).keys()]).toEqual(['member_a']);
    expect(notesOnRoster(notes, new Set(['member_a', 'member_b']))).toBe(notes);
  });

  it('round-trips, and reads leniently: what is not text, or is blank, is no note', () => {
    let notes = withMemberNote(NO_MEMBER_NOTES, 'member_b', 'cursed');
    notes = withMemberNote(notes, 'member_a', 'owes the guild');
    expect(memberNotesFromJSON(JSON.parse(JSON.stringify(memberNotesToJSON(notes))))).toEqual(notes);
    expect([...memberNotesFromJSON({ a: 4, b: '  ', c: ' kept ' }).entries()]).toEqual([['c', 'kept']]);
    expect(memberNotesFromJSON(null)).toBe(NO_MEMBER_NOTES);
  });
});
