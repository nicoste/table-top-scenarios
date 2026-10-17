// The party's card when they travel together (D-314): every member's face in
// one card, a mosaic, so the world's group token says *who* is travelling
// rather than showing a blank grey card (O-022).
//
// The layout is a rule, so it is here as plain arithmetic and tested (R-23b);
// drawing it is the standee's.

/** One tile of the mosaic, in the card's pixels. */
export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How many columns and rows `count` faces are laid out in on a portrait card.
 *
 * Two stack, top and bottom, because side by side on a 5:7 card makes two
 * slivers. Up to six take two columns — the most a party usually is, and
 * near-square tiles at that. Past six, three columns; past nine, as square a
 * grid as fits.
 */
export function mosaicGrid(count: number): { readonly cols: number; readonly rows: number } {
  const n = Math.max(1, Math.floor(count));
  const cols = n <= 2 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * Where each face goes on a `width` × `height` card, with `gap` pixels
 * between tiles. In reading order, left to right and top to bottom; a grid
 * with room to spare leaves its last cells empty rather than stretching a
 * face to fill them.
 */
export function mosaicTiles(count: number, width: number, height: number, gap: number): readonly Tile[] {
  if (count <= 0) return [];
  const { cols, rows } = mosaicGrid(count);
  const tileWidth = (width - gap * (cols - 1)) / cols;
  const tileHeight = (height - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, i) => ({
    x: (i % cols) * (tileWidth + gap),
    y: Math.floor(i / cols) * (tileHeight + gap),
    width: tileWidth,
    height: tileHeight,
  }));
}
