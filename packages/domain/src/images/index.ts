// Pictures on cards (R-204): what a picture is called, and nothing else.
//
// A picture is **named by its own content** — the SHA-256 of its bytes, and
// the kind of file it is. So the same picture uploaded twice is stored once,
// a name can never point at a different picture than the one it was made
// from, and a name is a fact about the bytes rather than a counter somebody
// has to keep. It is also what makes it safe to put on a path: a name that
// passes `isImageId` contains nothing but hex, one dot and an extension.
//
// Kept here, beside the other ids, because a member carries one (R-91) and
// the Tokens Library will (D-307). Storing the bytes is `persistence`'s;
// sending them is the host's.

/** The kinds of picture accepted, by the extension they are stored under. */
export const IMAGE_TYPES = {
  webp: 'image/webp',
  png: 'image/png',
  jpeg: 'image/jpeg',
} as const;

export type ImageExtension = keyof typeof IMAGE_TYPES;

/** `<64 hex digits>.<extension>` — the picture's SHA-256 and its kind. */
export type ImageId = string & { readonly __image: true };

const IMAGE_ID = /^[0-9a-f]{64}\.(webp|png|jpeg)$/;

export function isImageId(value: unknown): value is ImageId {
  return typeof value === 'string' && IMAGE_ID.test(value);
}

/** The extension for a content type, or `null` for a kind that is not accepted. */
export function imageExtension(contentType: string): ImageExtension | null {
  const bare = contentType.split(';')[0]!.trim().toLowerCase();
  for (const [extension, type] of Object.entries(IMAGE_TYPES)) {
    if (type === bare) return extension as ImageExtension;
  }
  return null;
}

/** The content type an id is served as. */
export function imageType(id: ImageId): string {
  return IMAGE_TYPES[id.slice(id.lastIndexOf('.') + 1) as ImageExtension];
}

/**
 * The largest picture accepted, in bytes.
 *
 * Generous on purpose for what arrives: the console shrinks a picture to a
 * card's size before it sends it (R-204), and that comes to tens of kilobytes.
 * The ceiling is for something that skipped the shrinking — a hand-made
 * request — so the host does not write a camera's raw 12 MB to disk.
 */
export const MAX_IMAGE_BYTES = 512 * 1024;
