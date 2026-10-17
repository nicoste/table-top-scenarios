// Preparing a picture for a card (R-204): cut to the card's shape, made small,
// in the browser — before it is sent, so the host never resizes anything and
// needs no image library to do it.
//
// **Where** it is cut is the GM's (R-205): a frame of the card's shape over
// the whole picture, moved and resized by hand. The rules for that frame —
// that it keeps its shape and never leaves the picture — are here, because
// they are rules and the dialog that draws them is not tested (R-23b).

import { CARD_ASPECT } from '@tt/render';
import { coverCrop } from '@tt/domain';

// The cut itself is the domain's, so a card's picture and the party's mosaic
// on the world map are cut by one rule (D-314).
export { coverCrop };

/**
 * How wide a card's picture is, in pixels. Tall enough for a card at the
 * closest zoom on a large table screen, small enough that a picture is tens
 * of kilobytes rather than megabytes.
 */
export const CARD_PICTURE_WIDTH = 256;
export const CARD_PICTURE_HEIGHT = Math.round(CARD_PICTURE_WIDTH / CARD_ASPECT);

/**
 * The paper a picture is laid on: what shows through wherever the picture is
 * transparent. A portrait cut out of its background sits on card stock rather
 * than on black, which is what the GPU would otherwise show for "nothing".
 */
const CARD_STOCK = '#ece6d8';

/**
 * A part of a picture, in the picture's own pixels: where the card is cut.
 *
 * Always the card's shape, so `width / height` is the card's aspect, and
 * always inside the picture. The functions below keep it both.
 */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Which corner of the frame is being dragged. */
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

/**
 * The smallest a frame may be made, in the picture's pixels.
 *
 * Small enough to pick out a face in a crowd scene, large enough that the
 * frame cannot be shrunk to a dot that the handles then sit on top of. A
 * picture smaller than this is framed whole.
 */
export const MIN_FRAME_WIDTH = 32;

/**
 * Where the frame starts: the cut the console made by itself before the GM
 * could move it (D-308) — as large as fits, a third of a tall picture's
 * excess off the top. So choosing a picture and accepting it at once gives
 * exactly what it gave before.
 */
export function startingFrame(width: number, height: number, aspect = CARD_ASPECT): Frame {
  const { sx, sy, sw, sh } = coverCrop(width, height, aspect);
  return { x: sx, y: sy, width: sw, height: sh };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The frame moved by `dx`, `dy` picture pixels, stopping at the picture's edges. */
export function movedFrame(frame: Frame, dx: number, dy: number, width: number, height: number): Frame {
  return {
    ...frame,
    x: clamp(frame.x + dx, 0, Math.max(0, width - frame.width)),
    y: clamp(frame.y + dy, 0, Math.max(0, height - frame.height)),
  };
}

/**
 * The frame resized by dragging one corner `dx`, `dy` picture pixels.
 *
 * The **opposite corner stays put**, the frame **keeps the card's shape**,
 * and it grows only as far as the picture goes in that direction. It follows
 * whichever axis the pointer moved further, so the dragged corner stays on
 * or outside the pointer rather than lagging inside it.
 */
export function resizedFrame(
  frame: Frame,
  corner: Corner,
  dx: number,
  dy: number,
  width: number,
  height: number,
  aspect = CARD_ASPECT,
): Frame {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  // The corner that does not move.
  const anchorX = west ? right : frame.x;
  const anchorY = north ? bottom : frame.y;
  // Where the dragged corner has been taken.
  const toX = (west ? frame.x : right) + dx;
  const toY = (north ? frame.y : bottom) + dy;
  const wanted = Math.max(
    west ? anchorX - toX : toX - anchorX,
    (north ? anchorY - toY : toY - anchorY) * aspect,
  );
  // As far as the picture goes from the anchor, in the direction it grows.
  const roomX = west ? anchorX : width - anchorX;
  const roomY = north ? anchorY : height - anchorY;
  const most = Math.min(roomX, roomY * aspect);
  const next = clamp(wanted, Math.min(MIN_FRAME_WIDTH, most), most);
  const tall = next / aspect;
  return {
    x: west ? anchorX - next : anchorX,
    y: north ? anchorY - tall : anchorY,
    width: next,
    height: tall,
  };
}

/**
 * A picture made into a card's picture: the framed part, scaled to
 * `CARD_PICTURE_WIDTH`, laid on card stock, and encoded as WebP — or as PNG
 * on a browser that cannot write WebP, which the host takes as well. Only
 * this leaves the browser; the original never does (R-205).
 */
export async function cardPicture(picture: CanvasImageSource, frame: Frame): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_PICTURE_WIDTH;
  canvas.height = CARD_PICTURE_HEIGHT;
  const pen = canvas.getContext('2d');
  if (!pen) throw new Error('no 2D canvas');
  pen.fillStyle = CARD_STOCK;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.imageSmoothingQuality = 'high';
  pen.drawImage(picture, frame.x, frame.y, frame.width, frame.height, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be encoded'))),
      'image/webp',
      0.86,
    );
  });
}
