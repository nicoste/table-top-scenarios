// Pictures on disk, named by their content (R-204). Stores and finds; decides
// nothing about who a picture belongs to — an intent says that (R-3).
//
// Beside the campaigns rather than inside one, because the Tokens Library is
// shared across campaigns (D-307) and a member's portrait and a goblin's are
// the same kind of thing. One flat directory, one file per picture.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageExtension, ImageId } from '@tt/domain';
import { MAX_IMAGE_BYTES, imageExtension, imageType, isImageId } from '@tt/domain';

export interface ImageStore {
  /**
   * Stores a picture and answers its name, or `null` when it is not one this
   * store takes: an unaccepted kind, too large, or bytes that are not what
   * they say they are. Storing the same picture twice stores it once.
   */
  put(bytes: Uint8Array, contentType: string): ImageId | null;
  /**
   * Where a picture is and what it is served as, or `null` when the name is
   * not one or nothing is stored under it.
   */
  find(id: string): { readonly file: string; readonly type: string } | null;
  /**
   * The largest picture taken, so the host can stop reading a request that
   * has already passed it — said here so the host need not reach past this
   * package into `domain` for one number (R-5).
   */
  readonly maxBytes: number;
}

/** A picture's name: the SHA-256 of its bytes, and its kind. */
export function imageIdFor(bytes: Uint8Array, extension: ImageExtension): ImageId {
  return `${createHash('sha256').update(bytes).digest('hex')}.${extension}` as ImageId;
}

/**
 * Do the bytes start the way this kind of file starts?
 *
 * A request says what it is sending and nothing makes it true. Checking the
 * first few bytes means a file stored as `.png` is a PNG — so the type it is
 * served under is never a lie, whatever arrived claiming to be one.
 */
export function looksLike(bytes: Uint8Array, extension: ImageExtension): boolean {
  const at = (offset: number, ...expected: number[]) =>
    expected.every((byte, i) => bytes[offset + i] === byte);
  switch (extension) {
    case 'png': return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'jpeg': return at(0, 0xff, 0xd8, 0xff);
    // "RIFF", four bytes of length, "WEBP".
    case 'webp': return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
    default: return false;
  }
}

export function fileImageStore(root: string): ImageStore {
  mkdirSync(root, { recursive: true });
  return {
    put(bytes, contentType) {
      const extension = imageExtension(contentType);
      if (!extension || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
      if (!looksLike(bytes, extension)) return null;
      const id = imageIdFor(bytes, extension);
      const file = join(root, id);
      // Named by content, so a file already there *is* this picture.
      if (!existsSync(file)) {
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, bytes);
        renameSync(tmp, file);
      }
      return id;
    },
    find(id) {
      // The name is checked before it touches a path: a picture's name is hex,
      // one dot and an extension, so nothing that passes can climb out of root.
      if (!isImageId(id)) return null;
      const file = join(root, id);
      return existsSync(file) ? { file, type: imageType(id) } : null;
    },
    maxBytes: MAX_IMAGE_BYTES,
  };
}
