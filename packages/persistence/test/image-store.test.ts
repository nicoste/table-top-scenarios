// Pictures stored by their content (R-204).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileImageStore, imageIdFor } from '@tt/persistence';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tt-images-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

/** The smallest thing that starts like a PNG; the store reads no further. */
const png = (tail = 0) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tail]);
const webp = () => new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]);

describe('storing a picture', () => {
  it('names it by its content and its kind', () => {
    const id = fileImageStore(root).put(png(), 'image/png');
    expect(id).toBe(imageIdFor(png(), 'png'));
    expect(id).toMatch(/^[0-9a-f]{64}\.png$/);
    expect(readFileSync(join(root, id!))).toEqual(Buffer.from(png()));
  });

  it('stores the same picture once, however often it arrives', () => {
    const store = fileImageStore(root);
    expect(store.put(png(), 'image/png')).toBe(store.put(png(), 'image/png'));
    expect(readdirSync(root)).toHaveLength(1);
  });

  it('tells two different pictures apart', () => {
    const store = fileImageStore(root);
    expect(store.put(png(1), 'image/png')).not.toBe(store.put(png(2), 'image/png'));
  });

  it('takes WebP, which is what the console sends', () => {
    expect(fileImageStore(root).put(webp(), 'image/webp')).toMatch(/\.webp$/);
  });

  it('refuses a kind it does not take', () => {
    expect(fileImageStore(root).put(png(), 'image/svg+xml')).toBeNull();
    expect(fileImageStore(root).put(png(), 'text/html')).toBeNull();
  });

  it('refuses bytes that are not what they claim to be', () => {
    // A page called a PNG is not stored as one, so nothing is ever served
    // under a type that is not true of it.
    const page = new TextEncoder().encode('<script>alert(1)</script>');
    expect(fileImageStore(root).put(page, 'image/png')).toBeNull();
    expect(fileImageStore(root).put(png(), 'image/webp')).toBeNull();
  });

  it('refuses nothing at all, and too much', () => {
    const store = fileImageStore(root);
    expect(store.put(new Uint8Array(0), 'image/png')).toBeNull();
    const huge = new Uint8Array(store.maxBytes + 1);
    huge.set(png());
    expect(store.put(huge, 'image/png')).toBeNull();
  });
});

describe('finding a picture', () => {
  it('finds what it stored, with the type to serve it as', () => {
    const store = fileImageStore(root);
    const id = store.put(webp(), 'image/webp')!;
    expect(store.find(id)).toEqual({ file: join(root, id), type: 'image/webp' });
  });

  it('finds nothing under a name that was never stored', () => {
    expect(fileImageStore(root).find(`${'a'.repeat(64)}.png`)).toBeNull();
  });

  it('will not look outside its own directory, whatever it is asked for', () => {
    const store = fileImageStore(root);
    for (const name of ['../campaigns/x.json', '..%2F..%2Fetc%2Fpasswd', '/etc/passwd', `${'a'.repeat(64)}.png/../x`]) {
      expect(store.find(name), name).toBeNull();
    }
  });
});
