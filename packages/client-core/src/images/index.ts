// Preparing a picture for a card (R-204): cut to the card's shape, made small,
// in the browser — before it is sent, so the host never resizes anything and
// needs no image library to do it.

import { CARD_ASPECT } from '@tt/render';

/**
 * How wide a card's picture is, in pixels. Tall enough for a card at the
 * closest zoom on a large table screen, small enough that a picture is tens
 * of kilobytes rather than megabytes.
 */
export const CARD_PICTURE_WIDTH = 256;
export const CARD_PICTURE_HEIGHT = Math.round(CARD_PICTURE_WIDTH / CARD_ASPECT);

/**
 * How much of a too-tall picture's excess comes off the **top**: a third,
 * and two thirds off the bottom. Portraits keep the face high in the frame,
 * so an even crop takes foreheads first. A too-wide picture is trimmed evenly
 * from both sides, because nothing says which side matters.
 */
const TOP_SHARE = 1 / 3;

/**
 * The part of a `width` × `height` picture to keep so that it fills a frame
 * of this aspect (width over height) without stretching — the picture covers
 * the card, and what does not fit is cut away.
 */
export function coverCrop(
  width: number,
  height: number,
  aspect: number,
): { readonly sx: number; readonly sy: number; readonly sw: number; readonly sh: number } {
  if (width <= 0 || height <= 0 || aspect <= 0) return { sx: 0, sy: 0, sw: width, sh: height };
  if (width / height > aspect) {
    const sw = height * aspect;
    return { sx: (width - sw) / 2, sy: 0, sw, sh: height };
  }
  const sh = width / aspect;
  return { sx: 0, sy: (height - sh) * TOP_SHARE, sw: width, sh };
}

/**
 * The paper a picture is laid on: what shows through wherever the picture is
 * transparent. A portrait cut out of its background sits on card stock rather
 * than on black, which is what the GPU would otherwise show for "nothing".
 */
const CARD_STOCK = '#ece6d8';

/**
 * A picture file made into a card's picture: cut to 5:7, scaled to
 * `CARD_PICTURE_WIDTH`, laid on card stock, and encoded as WebP — or as PNG
 * on a browser that cannot write WebP, which the host takes as well.
 */
export async function cardPicture(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height, CARD_ASPECT);
    const canvas = document.createElement('canvas');
    canvas.width = CARD_PICTURE_WIDTH;
    canvas.height = CARD_PICTURE_HEIGHT;
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('no 2D canvas');
    pen.fillStyle = CARD_STOCK;
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.imageSmoothingQuality = 'high';
    pen.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be encoded'))),
        'image/webp',
        0.86,
      );
    });
  } finally {
    bitmap.close();
  }
}
