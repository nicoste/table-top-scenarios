// A copy of the GM's data each time the host starts (D-320). Stores and
// prunes; decides nothing — when to take one, and how many to keep, are the
// composition root's (R-66).
//
// Everything the tool writes is written the moment it changes, play state has
// no undo (R-140), and deleting a point of interest deletes its map's file.
// The data folder is tracked in git (D-134), but only as of the last commit,
// and a session's work is rarely committed. So the host copies the data aside
// before it reads a byte of it: whatever goes wrong in a session, the state it
// started from is one folder away.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What a backup holds, relative to the data folder: the campaigns (worlds and
 * maps), the saves (play state) and the Tokens Library.
 *
 * **Not the pictures.** They are stored under the hash of what they are
 * (R-204) and never deleted or rewritten, so every picture a backup names is
 * still in `images/` — copying them would only cost the disk.
 */
export const BACKED_UP = ['campaigns', 'saves', 'library.json'] as const;

/** The folder backups go in, inside the data folder. */
export const BACKUPS = 'backups';

/** Deleted campaigns are already kept, moved aside (D-108); a backup need not hold them twice. */
const isTrash = (path: string) => /[\\/]\.trash-[^\\/]*$/.test(path);

/** A timestamp a folder can be named after, sorting as time does: `2026-10-18T01-38-12-123Z`. */
export function backupName(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * Copies the data aside into `backups/<when>/`, then keeps only the newest
 * `keep` backups. Returns the new backup's folder, or `null` when there was
 * nothing to copy — a data folder nobody has written to yet.
 */
export function backUpData(data: string, now: Date, keep: number): string | null {
  const present = BACKED_UP.filter((name) => existsSync(join(data, name)));
  if (present.length === 0) return null;

  const folder = join(data, BACKUPS);
  let target = join(folder, backupName(now));
  // Two starts in the same millisecond: the second gets a suffix, never the
  // first one's folder.
  for (let n = 2; existsSync(target); n += 1) target = join(folder, `${backupName(now)}-${n}`);
  mkdirSync(target, { recursive: true });
  for (const name of present) {
    cpSync(join(data, name), join(target, name), { recursive: true, filter: (source) => !isTrash(source) });
  }
  pruneBackups(folder, keep);
  return target;
}

/**
 * Keeps the newest `keep` backups and deletes the rest — only folders this
 * module named, so anything else the GM puts in `backups/` is left alone.
 */
export function pruneBackups(folder: string, keep: number): readonly string[] {
  if (!existsSync(folder)) return [];
  const ours = readdirSync(folder)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/.test(name))
    .sort();
  const gone = ours.slice(0, Math.max(0, ours.length - Math.max(1, keep)));
  for (const name of gone) rmSync(join(folder, name), { recursive: true, force: true });
  return gone;
}
