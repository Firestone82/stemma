/**
 * A poster printed in pieces: on sheets smaller than the poster, which are
 * glued together afterwards into one, as A3 sheets make an A2 (two of them),
 * an A1 (four). The sheets lie in the grid their sizes fit into, turned as
 * needed. Neighbouring sheets show the same strip of the poster, so one can be
 * trimmed at the line drawn there and glued over the other; printers leave an
 * edge unprinted besides, unless they print to the edge. The poster is drawn
 * as much smaller as that takes, keeping its shape.
 */
import { PaperSize, paperSize } from './paper';

/** The edge of a sheet left unprinted, in millimetres: what most printers cannot reach. */
export const TILE_MARGIN_MM = 5;
/** How much of the poster neighbouring sheets both show, in millimetres: room to glue. */
export const TILE_OVERLAP_MM = 8;
/** The most the poster is drawn smaller to fit the sheets. */
const MIN_SCALE = 0.85;

export interface Tile {
  /** Column and row, from the top left. */
  col: number;
  row: number;
  /** The part of the poster on this sheet, in millimetres of the poster at full size from its top left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TileGrid {
  sheet: PaperSize;
  /** The sheets are turned on their side. */
  landscape: boolean;
  /** Sheet size as printed, in millimetres. */
  sheetW: number;
  sheetH: number;
  cols: number;
  rows: number;
  /** How big the poster is drawn on the sheets: 1 at full size, a little less to fit inside the printers' edge. */
  scale: number;
  /** The unprinted edge (0 printing to the edge) and the strip neighbours share, in millimetres. */
  margin: number;
  overlap: number;
  tiles: Tile[];
}

/**
 * The fewest sheets of `sheetId` a poster `posterW` × `posterH` mm is printed
 * on, upright or on their side, the poster drawn as big as they take (never
 * bigger than it is, nor much smaller); null when the sheet is about as big as
 * the poster or bigger (it then prints on one).
 */
export function tileGrid(posterW: number, posterH: number, sheetId: string, borderless = false): TileGrid | null {
  const sheet = paperSize(sheetId);
  // A sheet about as big as the poster prints it whole, as any printer does with its own margins.
  if (!sheet || sheet.widthMm * sheet.heightMm >= posterW * posterH * 0.95) return null;
  const margin = borderless ? 0 : TILE_MARGIN_MM;
  const overlap = TILE_OVERLAP_MM;
  let best: Omit<TileGrid, 'tiles'> | null = null;
  for (const landscape of [false, true]) {
    const sheetW = landscape ? sheet.heightMm : sheet.widthMm;
    const sheetH = landscape ? sheet.widthMm : sheet.heightMm;
    const areaW = sheetW - margin * 2;
    const areaH = sheetH - margin * 2;
    if (areaW <= overlap || areaH <= overlap) continue;
    for (let cols = 1; cols <= 12; cols++) {
      for (let rows = 1; rows <= 12; rows++) {
        if (cols * rows < 2) continue;
        // What the sheets together show, the shared strips counted once.
        const coverW = cols * areaW - (cols - 1) * overlap;
        const coverH = rows * areaH - (rows - 1) * overlap;
        const scale = Math.min(1, coverW / posterW, coverH / posterH);
        if (scale < MIN_SCALE) continue;
        const better =
          !best ||
          cols * rows < best.cols * best.rows ||
          // As many sheets: the poster bigger on them.
          (cols * rows === best.cols * best.rows && scale > best.scale + 1e-6);
        if (better) best = { sheet, landscape, sheetW, sheetH, cols, rows, scale, margin, overlap };
      }
    }
  }
  if (!best) return null;
  // Each sheet's part, in the poster's own millimetres; the last column and row take what is left.
  const stepW = (best.sheetW - margin * 2 - overlap) / best.scale;
  const stepH = (best.sheetH - margin * 2 - overlap) / best.scale;
  const areaW = (best.sheetW - margin * 2) / best.scale;
  const areaH = (best.sheetH - margin * 2) / best.scale;
  const tiles: Tile[] = [];
  for (let row = 0; row < best.rows; row++) {
    for (let col = 0; col < best.cols; col++) {
      const x = col * stepW;
      const y = row * stepH;
      tiles.push({ col, row, x, y, w: Math.max(0, Math.min(areaW, posterW - x)), h: Math.max(0, Math.min(areaH, posterH - y)) });
    }
  }
  return { ...best, tiles };
}

/** "A1", "B1", … : the column as a letter, the row as a number, as on a map. */
export function tileName(tile: Pick<Tile, 'col' | 'row'>): string {
  let col = tile.col;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (col % 26)) + letters;
    col = Math.floor(col / 26) - 1;
  } while (col >= 0);
  return `${letters}${tile.row + 1}`;
}
