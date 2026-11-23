/**
 * Gaps between two cards made wider by hand on a finished layout (PrintSettings.gaps). A gap between two cards
 * side by side is widened by cutting the layout down through the middle of the gap, from the top of those two
 * cards to the foot of the tree, and moving whatever stands to the right of the cut over by as much: the row
 * the two stand in and everything under it, so the families under them stay where they hang, and nothing above
 * the two moves (the line down from their parents is drawn out to the card that moved). A gap between a card and
 * the one under it is widened across the whole tree: everything below the cut goes down by as much, so the rows
 * stay level. Nothing comes to stand on anything else: what moves only moves away from what stays.
 */
import { LayoutCard, LayoutPlaceholder, LayoutResult, Pt } from './types';

/** The key of the gap between two people's cards: the one on the left (or on top) first. */
export function gapKey(a: string, b: string): string {
  return `${a}|${b}`;
}

/** The two people of a gap's key. */
export function gapPeople(key: string): [string, string] | undefined {
  const cut = key.indexOf('|');
  return cut > 0 && cut < key.length - 1 ? [key.slice(0, cut), key.slice(cut + 1)] : undefined;
}

/** The most a gap can be widened by, in the layout's units (a card is 188 wide). */
export const GAP_WIDEST = 2000;

/** A box on the layout: a card or the place of parents nobody knows. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Two cards side by side ('x': `a` on the left) or one over the other ('y': `a` on top), and the gap between them. */
export interface CardGap {
  axis: 'x' | 'y';
  a: string;
  b: string;
  /** Where the gap starts and ends along the axis (the edge of `a`, the edge of `b`). */
  from: number;
  to: number;
  /** Where the two cards are both, across the axis (the stretch the gap is drawn along). */
  lo: number;
  hi: number;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** The gap between two cards, if they stand side by side or one over the other (in either order); undefined otherwise. */
export function gapBetween(a: Box & { personId: string }, b: Box & { personId: string }): CardGap | undefined {
  const rows = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
  const cols = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  if (rows > 0.5) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    if (r.x < l.x + l.w - 0.5) return undefined;
    return { axis: 'x', a: l.personId, b: r.personId, from: l.x + l.w, to: r.x, lo: Math.max(a.y, b.y), hi: Math.min(a.y + a.h, b.y + b.h) };
  }
  if (cols > 0.5) {
    const [t, u] = a.y <= b.y ? [a, b] : [b, a];
    if (u.y < t.y + t.h - 0.5) return undefined;
    return { axis: 'y', a: t.personId, b: u.personId, from: t.y + t.h, to: u.y, lo: Math.max(a.x, b.x), hi: Math.min(a.x + a.w, b.x + b.w) };
  }
  return undefined;
}

/**
 * The gap a point in empty room between cards is in: between the nearest card to its left and the nearest to its
 * right that stand level with it, or the nearest over it and under it that stand in line with it, whichever of
 * the two gaps is narrower. Only gaps no wider than `widest`; ghost cards (someone drawn elsewhere too) end none.
 */
export function gapAt(cards: readonly (Box & { personId: string; ghost?: boolean })[], p: Pt, widest = Infinity): CardGap | undefined {
  const inside = cards.find((c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
  if (inside) return undefined;
  const pick = (before: (c: Box) => boolean, after: (c: Box) => boolean, far: (c: Box) => number, near: (c: Box) => number): CardGap | undefined => {
    let a: (typeof cards)[number] | undefined;
    let b: (typeof cards)[number] | undefined;
    for (const c of cards) {
      if (before(c) && (!a || far(c) > far(a))) a = c;
      if (after(c) && (!b || near(c) < near(b))) b = c;
    }
    if (!a || !b || a.ghost || b.ghost) return undefined;
    const gap = gapBetween(a, b);
    return gap && gap.to - gap.from <= widest ? gap : undefined;
  };
  const level = (c: Box) => p.y >= c.y && p.y <= c.y + c.h;
  const inLine = (c: Box) => p.x >= c.x && p.x <= c.x + c.w;
  const across = pick(
    (c) => level(c) && c.x + c.w <= p.x,
    (c) => level(c) && c.x >= p.x,
    (c) => c.x + c.w,
    (c) => c.x,
  );
  const down = pick(
    (c) => inLine(c) && c.y + c.h <= p.y,
    (c) => inLine(c) && c.y >= p.y,
    (c) => c.y + c.h,
    (c) => c.y,
  );
  if (across && down) return across.to - across.from <= down.to - down.from ? across : down;
  return across ?? down;
}

/** The layout with every gap in `gaps` (by gapKey: how much wider, in the layout's units) widened, one after the other. */
export function spreadGaps(layout: LayoutResult, gaps: Readonly<Record<string, number>>): LayoutResult {
  let out = layout;
  for (const [key, by] of Object.entries(gaps)) {
    const people = gapPeople(key);
    if (!people || !(by > 0)) continue;
    const card = (id: string) => out.cards.find((c) => c.personId === id && !c.ghost);
    const a = card(people[0]);
    const b = card(people[1]);
    const gap = a && b ? gapBetween(a, b) : undefined;
    if (!gap) continue;
    const widen = Math.min(by, GAP_WIDEST);
    const at = (gap.from + gap.to) / 2;
    if (gap.axis === 'x') out = spreadAcross(out, at, Math.min(a!.y, b!.y) - 0.5, widen);
    else out = transpose(spreadAcross(transpose(out), at, -Infinity, widen));
  }
  return out;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** The box (as the layout placed it) whose edge a point lies on. */
function boxAt<T extends Box>(boxes: readonly T[], p: Pt): T | undefined {
  return boxes.find((c) => p.x > c.x - 0.6 && p.x < c.x + c.w + 0.6 && p.y > c.y - 0.6 && p.y < c.y + c.h + 0.6);
}

/**
 * Everything to the right of `at` that reaches below `from` moved `by` to the right. A line goes in pieces: each
 * upright stretch of it goes as a whole (with the card or the marker at its end, if it has one there), so it stays
 * upright, and the level stretches between are drawn out or in to meet them.
 */
function spreadAcross(layout: LayoutResult, at: number, from: number, by: number): LayoutResult {
  const moves = (x: number, bottom: number) => x > at && bottom > from;
  const boxShift = (c: Box) => (moves(c.x + c.w / 2, c.y + c.h) ? by : 0);
  const boxes: (LayoutCard | LayoutPlaceholder)[] = [...layout.cards, ...layout.placeholders];
  const shiftAt = (p: Pt): number | undefined => {
    const c = boxAt(boxes, p);
    return c ? boxShift(c) : undefined;
  };
  // How far each point of a line goes: upright stretches whole, an end on a card (or marker) with it.
  const shifts = (points: readonly Pt[], start?: number, end?: number): number[] => {
    const out = new Array<number>(points.length).fill(0);
    let i = 0;
    while (i < points.length) {
      let j = i;
      while (j + 1 < points.length && near(points[j + 1].x, points[i].x)) j++;
      const last = j === points.length - 1;
      const bottom = Math.max(...points.slice(i, j + 1).map((p) => p.y));
      const d = last && end !== undefined ? end : i === 0 && start !== undefined ? start : moves(points[i].x, bottom) ? by : 0;
      for (let k = i; k <= j; k++) out[k] = d;
      i = j + 1;
    }
    return out;
  };
  /** The line moved: where its one upright stretch has its two ends going apart, it gets a step in the middle. */
  const moved = (points: readonly Pt[], start?: number, end?: number): Pt[] => {
    const d = shifts(points, start, end);
    const n = points.length;
    if (
      n >= 2 &&
      near(points[0].x, points[n - 1].x) &&
      points.every((p) => near(p.x, points[0].x)) &&
      start !== undefined &&
      end !== undefined &&
      !near(start, end)
    ) {
      const y = (points[0].y + points[n - 1].y) / 2;
      return [
        { x: points[0].x + start, y: points[0].y },
        { x: points[0].x + start, y },
        { x: points[n - 1].x + end, y },
        { x: points[n - 1].x + end, y: points[n - 1].y },
      ];
    }
    return points.map((p, k) => (d[k] ? { x: p.x + d[k], y: p.y } : p));
  };
  /** How far a point on a line goes, between the points either side of it. */
  const along = (points: readonly Pt[], d: readonly number[], p: Pt): number => {
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1];
      const b = points[k];
      if (near(a.x, b.x) && near(p.x, a.x) && p.y >= Math.min(a.y, b.y) - 0.01 && p.y <= Math.max(a.y, b.y) + 0.01) return d[k];
      if (near(a.y, b.y) && near(p.y, a.y) && p.x >= Math.min(a.x, b.x) - 0.01 && p.x <= Math.max(a.x, b.x) + 0.01) {
        const t = near(a.x, b.x) ? 0.5 : (p.x - a.x) / (b.x - a.x);
        return d[k - 1] + (d[k] - d[k - 1]) * t;
      }
    }
    return moves(p.x, p.y) ? by : 0;
  };
  const markers = new Map<string, number>();
  const unions = layout.unions.map((u) => {
    const start = shiftAt(u.line[0]);
    const end = shiftAt(u.line[u.line.length - 1]);
    const d = shifts(u.line, start, end);
    const shift = along(u.line, d, u);
    markers.set(u.familyId, shift);
    if (!shift && d.every((v) => !v)) return u;
    return { ...u, x: u.x + shift, line: moved(u.line, start, end) };
  });
  const lines = layout.lines.map((l) => {
    const first = l.points[0];
    const start = markers.get(l.familyId) ?? shiftAt(first);
    const end = shiftAt(l.points[l.points.length - 1]);
    const points = moved(l.points, start, end);
    return points.every((p, k) => p === l.points[k]) && points.length === l.points.length ? l : { ...l, points };
  });
  const cards = layout.cards.map((c) => (boxShift(c) ? { ...c, x: c.x + by } : c));
  const placeholders = layout.placeholders.map((c) => (boxShift(c) ? { ...c, x: c.x + by } : c));
  let x1 = layout.bounds.x + layout.bounds.w;
  for (const c of [...cards, ...placeholders]) x1 = Math.max(x1, c.x + c.w);
  const centre = moves(layout.centre.x, layout.centre.y) ? { x: layout.centre.x + by, y: layout.centre.y } : layout.centre;
  return { ...layout, cards, placeholders, unions, lines, centre, bounds: { ...layout.bounds, w: x1 - layout.bounds.x } };
}

const flip = (p: Pt): Pt => ({ x: p.y, y: p.x });
const flipBox = <T extends Box>(c: T): T => ({ ...c, x: c.y, y: c.x, w: c.h, h: c.w });

/** The layout mirrored across its diagonal: across becomes down. Twice is the layout as it was. */
function transpose(layout: LayoutResult): LayoutResult {
  return {
    ...layout,
    cards: layout.cards.map(flipBox),
    placeholders: layout.placeholders.map(flipBox),
    unions: layout.unions.map((u) => ({ ...u, x: u.y, y: u.x, line: u.line.map(flip) })),
    lines: layout.lines.map((l) => ({ ...l, points: l.points.map(flip) })),
    bounds: flipBox(layout.bounds),
    centre: flip(layout.centre),
  };
}
