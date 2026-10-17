// The GM's notes on the party's members (D-315): free text only the GM sees,
// *"owes the guild 50 gp"*, one per member.
//
// The silver token's note (R-208) for the other half of the stage, with one
// difference that is the reason this is not a field on the token: a goblin
// belongs to one map, and a member is the same person in every map. So the
// note is kept **per member, across maps**, and lives in the save — play
// state, beside the silver notes, which undo leaves alone (R-140). The table
// is never sent the save, so a note here cannot reach it by mistake (R-85).
//
// Not a character sheet: no hit points, no stats. A line the GM keeps.

/** Member id to the GM's note on them. Nobody without a note has an entry. */
export type MemberNotes = ReadonlyMap<string, string>;

export const NO_MEMBER_NOTES: MemberNotes = new Map();

/** As long as a silver token's note (R-208). */
export const MAX_MEMBER_NOTE = 500;

/** A note as kept: trimmed and cut to length. Empty means none. */
const clean = (note: string) => note.trim().slice(0, MAX_MEMBER_NOTE);

/**
 * Writes one member's note, or clears it with an empty one. Identity-
 * preserving (R-165), and a cleared note leaves no empty entry behind.
 */
export function withMemberNote(notes: MemberNotes, id: string, note: string): MemberNotes {
  const next = clean(note);
  if ((notes.get(id) ?? '') === next) return notes;
  const copy = new Map(notes);
  if (next === '') copy.delete(id);
  else copy.set(id, next);
  return copy;
}

/** Only the notes of members still on the roster, for tidying on the way in. */
export function notesOnRoster(notes: MemberNotes, live: ReadonlySet<string>): MemberNotes {
  const keep = [...notes].filter(([id]) => live.has(id));
  return keep.length === notes.size ? notes : new Map(keep);
}

export type MemberNotesJSON = Record<string, string>;

export function memberNotesToJSON(notes: MemberNotes): MemberNotesJSON {
  return Object.fromEntries([...notes.keys()].sort().map((id) => [id, notes.get(id)!]));
}

/** Read leniently: anything that is not text is no note, and blank is none. */
export function memberNotesFromJSON(json: Readonly<Record<string, unknown>> | undefined | null): MemberNotes {
  if (!json) return NO_MEMBER_NOTES;
  const out = new Map<string, string>();
  for (const [id, raw] of Object.entries(json)) {
    const note = typeof raw === 'string' ? clean(raw) : '';
    if (note !== '') out.set(id, note);
  }
  return out.size === 0 ? NO_MEMBER_NOTES : out;
}
