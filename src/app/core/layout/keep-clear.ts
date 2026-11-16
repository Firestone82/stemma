/**
 * Boxes on the page a tree keeps out of: the title, the families' names. Rather than a strip across the page
 * for each, the tree is placed (and, when it has to be, made smaller) so that none of its cards or lines is
 * in a box. The room beside and between the boxes is the tree's.
 */
import { LayoutResult } from './types';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where in the room's spare width and height the tree is tried, the middle first: as shares of the spare room. */
const ANCHORS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [0.5, 1],
  [0.5, 0],
  [0, 0.5],
  [1, 0.5],
  [0, 1],
  [1, 1],
  [0, 0],
  [1, 0],
  [0.25, 1],
  [0.75, 1],
  [0.25, 0],
  [0.75, 0],
  [0, 0.25],
  [0, 0.75],
  [1, 0.25],
  [1, 0.75],
  [0.25, 0.5],
  [0.75, 0.5],
  [0.5, 0.25],
  [0.5, 0.75],
];

/** Height of the strips (and width of the columns) a layout is cut into for telling what it covers. */
const STRIP = 12;

/** How far a layout reaches in each strip across it and in each column down it. */
interface Hull {
  rows: Map<number, [number, number]>;
  cols: Map<number, [number, number]>;
}

const hulls = new WeakMap<LayoutResult, Hull>();

function hullOf(layout: LayoutResult): Hull {
  let hull = hulls.get(layout);
  if (hull) return hull;
  const rows = new Map<number, [number, number]>();
  const cols = new Map<number, [number, number]>();
  const reach = (into: Map<number, [number, number]>, from: number, to: number, lo: number, hi: number) => {
    for (let i = Math.floor(from / STRIP); i <= Math.floor(to / STRIP); i++) {
      const e = into.get(i);
      if (e) {
        e[0] = Math.min(e[0], lo);
        e[1] = Math.max(e[1], hi);
      } else into.set(i, [lo, hi]);
    }
  };
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    reach(rows, y0, y1, x0, x1);
    reach(cols, x0, x1, y0, y1);
  };
  for (const c of [...layout.cards, ...layout.placeholders]) add(c.x, c.y, c.x + c.w, c.y + c.h);
  for (const line of [...layout.lines.map((l) => l.points), ...layout.unions.map((u) => u.line)]) {
    for (let i = 1; i < line.length; i++) {
      add(Math.min(line[i - 1].x, line[i].x), Math.min(line[i - 1].y, line[i].y), Math.max(line[i - 1].x, line[i].x), Math.max(line[i - 1].y, line[i].y));
    }
  }
  hulls.set(layout, (hull = { rows, cols }));
  return hull;
}

/**
 * Whether a box may have something of the layout in it. Something is in it only if the layout reaches into
 * the box both in one of the strips it lies in and in one of its columns: a box in a notch of the tree's
 * outline, or in a gap that runs in from an edge, counts as free.
 */
function taken(hull: Hull, x0: number, y0: number, x1: number, y1: number): boolean {
  let across = false;
  for (let i = Math.floor(y0 / STRIP); i <= Math.floor(y1 / STRIP) && !across; i++) {
    const e = hull.rows.get(i);
    across = !!e && e[0] < x1 && e[1] > x0;
  }
  if (!across) return false;
  for (let i = Math.floor(x0 / STRIP); i <= Math.floor(x1 / STRIP); i++) {
    const e = hull.cols.get(i);
    if (e && e[0] < y1 && e[1] > y0) return true;
  }
  return false;
}

/**
 * The biggest the layout can be in a room `w` by `h` (no bigger than `scale`) with nothing of it in any of
 * `blocks`, and where it then stands: `x`, `y` is where the layout's origin goes. `at` is where it would stand
 * at `scale` if there were no boxes: kept when that is clear. Undefined when it fits nowhere, however small.
 */
export function keepClear(
  layout: LayoutResult,
  room: { w: number; h: number },
  blocks: readonly Box[],
  scale: number,
  at: { x: number; y: number },
): { scale: number; x: number; y: number } | undefined {
  const b = layout.bounds;
  const hull = hullOf(layout);
  const clear = (s: number, ox: number, oy: number) =>
    blocks.every((k) => !taken(hull, (k.x - ox) / s, (k.y - oy) / s, (k.x + k.w - ox) / s, (k.y + k.h - oy) / s));
  if (clear(scale, at.x, at.y)) return { scale, ...at };
  const somewhere = (s: number): { x: number; y: number } | null => {
    const spareX = room.w - b.w * s;
    const spareY = room.h - b.h * s;
    if (spareX < -0.01 || spareY < -0.01) return null;
    for (const [fx, fy] of ANCHORS) {
      const x = spareX * fx - b.x * s;
      const y = spareY * fy - b.y * s;
      if (clear(s, x, y)) return { x, y };
    }
    return null;
  };
  let found = somewhere(scale);
  if (found) return { scale, ...found };
  let low = 0;
  let high = scale;
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2;
    const got = somewhere(mid);
    if (got) {
      low = mid;
      found = got;
    } else high = mid;
  }
  return found ? { scale: low, ...found } : undefined;
}
