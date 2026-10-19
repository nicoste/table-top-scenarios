// A copy of the GM's data each time the host starts (D-320).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backUpData, backupName, pruneBackups, BACKUPS } from '@tt/persistence';

let data: string;
beforeEach(() => { data = mkdtempSync(join(tmpdir(), 'tt-backups-')); });
afterEach(() => { rmSync(data, { recursive: true, force: true }); });

/** A data folder with a campaign and its map, a save, the library, a picture and a deleted campaign. */
function seed(): void {
  mkdirSync(join(data, 'campaigns', 'campaign_a', 'pois'), { recursive: true });
  writeFileSync(join(data, 'campaigns', 'campaign_a', 'campaign.json'), '{"name":"Ashfall"}');
  writeFileSync(join(data, 'campaigns', 'campaign_a', 'pois', 'poi_x.json'), '{"blocks":1}');
  mkdirSync(join(data, 'campaigns', '.trash-2026-01-01T00-00-00-000Z-campaign_b'), { recursive: true });
  mkdirSync(join(data, 'saves'));
  writeFileSync(join(data, 'saves', 'save_live_campaign_a.json'), '{"label":"Live"}');
  writeFileSync(join(data, 'library.json'), '{"entries":[]}');
  mkdirSync(join(data, 'images'));
  writeFileSync(join(data, 'images', `${'a'.repeat(64)}.webp`), 'picture');
}

const at = (iso: string) => new Date(iso);

describe('backing up the data (D-320)', () => {
  it('copies the campaigns, their maps, the saves and the library', () => {
    seed();
    const folder = backUpData(data, at('2026-10-18T01:38:12.123Z'), 20)!;
    expect(folder).toBe(join(data, BACKUPS, '2026-10-18T01-38-12-123Z'));
    expect(readFileSync(join(folder, 'campaigns', 'campaign_a', 'pois', 'poi_x.json'), 'utf8')).toBe('{"blocks":1}');
    expect(readFileSync(join(folder, 'saves', 'save_live_campaign_a.json'), 'utf8')).toBe('{"label":"Live"}');
    expect(readFileSync(join(folder, 'library.json'), 'utf8')).toBe('{"entries":[]}');
  });

  it('leaves out the pictures, which are never rewritten, and the trash, which is already kept', () => {
    seed();
    const folder = backUpData(data, at('2026-10-18T01:38:12.123Z'), 20)!;
    expect(existsSync(join(folder, 'images'))).toBe(false);
    expect(readdirSync(join(folder, 'campaigns'))).toEqual(['campaign_a']);
  });

  it('is a copy: the session writing afterwards does not change it', () => {
    seed();
    const folder = backUpData(data, at('2026-10-18T01:38:12.123Z'), 20)!;
    writeFileSync(join(data, 'saves', 'save_live_campaign_a.json'), '{"label":"changed"}');
    rmSync(join(data, 'campaigns', 'campaign_a', 'pois', 'poi_x.json'));
    expect(readFileSync(join(folder, 'saves', 'save_live_campaign_a.json'), 'utf8')).toBe('{"label":"Live"}');
    expect(existsSync(join(folder, 'campaigns', 'campaign_a', 'pois', 'poi_x.json'))).toBe(true);
  });

  it('takes nothing from a data folder nobody has written to', () => {
    expect(backUpData(data, at('2026-10-18T01:38:12.123Z'), 20)).toBeNull();
    expect(existsSync(join(data, BACKUPS))).toBe(false);
  });

  it('never reuses a folder, even for two starts in the same millisecond', () => {
    seed();
    const when = at('2026-10-18T01:38:12.123Z');
    const first = backUpData(data, when, 20);
    const second = backUpData(data, when, 20);
    expect(second).not.toBe(first);
    expect(second).toBe(join(data, BACKUPS, `${backupName(when)}-2`));
  });

  it('keeps the newest ones and deletes the oldest', () => {
    seed();
    for (let hour = 10; hour < 15; hour += 1) backUpData(data, at(`2026-10-18T${hour}:00:00.000Z`), 3);
    expect(readdirSync(join(data, BACKUPS)).sort()).toEqual([
      '2026-10-18T12-00-00-000Z', '2026-10-18T13-00-00-000Z', '2026-10-18T14-00-00-000Z',
    ]);
  });

  it('prunes only folders it named, so anything else in there is left alone', () => {
    mkdirSync(join(data, BACKUPS, 'before the big fight'), { recursive: true });
    mkdirSync(join(data, BACKUPS, '2026-10-18T10-00-00-000Z'));
    mkdirSync(join(data, BACKUPS, '2026-10-18T11-00-00-000Z'));
    expect(pruneBackups(join(data, BACKUPS), 1)).toEqual(['2026-10-18T10-00-00-000Z']);
    expect(readdirSync(join(data, BACKUPS)).sort()).toEqual(['2026-10-18T11-00-00-000Z', 'before the big fight']);
  });
});
