/**
 * Cards moved by hand on a finished layout. The card goes where it is put and the lines that end at it are
 * led there again: the line from its parents (the bar or the line it hangs from is drawn out to the card's new
 * place), the line to each partner with the marker on it (straight between two cards side by side, down a lane
 * beside two that stand one over the other), and with the marker the lines down to the children.
 * Nothing else moves, and nothing is checked: a card can be put on top of another, or a line led across one.
 */
import { LayoutCard, LayoutLine, LayoutResult, LayoutUnion, Pt } from './types';

const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
const level = (a: Pt, b: Pt) => near(a.y, b.y) && !near(a.x, b.x);
const upright = (a: Pt, b: Pt) => near(a.x, b.x) && !near(a.y, b.y);

/** The card (as the layout placed it) whose edge a point lies on. */
function cardAt(cards: readonly LayoutCard[], p: Pt): LayoutCard | undefined {
  return cards.find((c) => p.x > c.x - 0.6 && p.x < c.x + c.w + 0.6 && p.y > c.y - 0.6 && p.y < c.y + c.h + 0.6);
}

/** A line whose last point moved to `end`: the stretch before it slides along the one before that, or the line gets an elbow. */
function leadTo(points: readonly Pt[], end: Pt): Pt[] {
  const n = points.length;
  const last = points[n - 1];
  const prev = points[n - 2];
  if (!prev) return [end];
  const before = points[n - 3];
  if (upright(prev, last)) {
    // Dropped from a bar: the bar is drawn out to over the card.
    if (before && level(before, prev)) return [...points.slice(0, n - 2), { x: end.x, y: prev.y }, end];
    const mid = before ? prev.y : (prev.y + end.y) / 2;
    return [...points.slice(0, n - 1), { x: prev.x, y: mid }, { x: end.x, y: mid }, end];
  }
  if (level(prev, last)) {
    // Out to the side of a line that runs down: the line is drawn out to the card's height.
    if (before && upright(before, prev)) return [...points.slice(0, n - 2), { x: prev.x, y: end.y }, end];
    const mid = before ? prev.x : (prev.x + end.x) / 2;
    return [...points.slice(0, n - 1), { x: mid, y: prev.y }, { x: mid, y: end.y }, end];
  }
  return [...points.slice(0, n - 1), end];
}

/** The same from the other end: a line whose first point moved to `start`. */
function leadFrom(points: readonly Pt[], start: Pt): Pt[] {
  return leadTo([...points].reverse(), start).reverse();
}

/** The layout with the cards in `moves` (by person, how far from where they were put) moved and their lines led after them. */
export function applyMoves(layout: LayoutResult, moves: ReadonlyMap<string, Pt>): LayoutResult {
  const by = (c?: LayoutCard): Pt | undefined => (c && !c.ghost ? moves.get(c.personId) : undefined);
  if (!layout.cards.some((c) => by(c))) return layout;
  const cards = layout.cards.map((c) => {
    const d = by(c);
    return d ? { ...c, x: c.x + d.x, y: c.y + d.y } : c;
  });
  // The line between two partners, with their marker: each end goes with its card.
  const shifted = new Map<string, Pt>();
  const unions: LayoutUnion[] = layout.unions.map((u) => {
    const a = u.line[0];
    const b = u.line[u.line.length - 1];
    const da = by(cardAt(layout.cards, a));
    const db = by(cardAt(layout.cards, b));
    if (!da && !db) return u;
    const a2 = { x: a.x + (da?.x ?? 0), y: a.y + (da?.y ?? 0) };
    const b2 = { x: b.x + (db?.x ?? 0), y: b.y + (db?.y ?? 0) };
    let line: Pt[];
    let at: Pt;
    const ca = cardAt(layout.cards, a);
    const cb = cardAt(layout.cards, b);
    if (u.line.length === 4 && !level(u.line[0], u.line[1])) {
      // Over or under the cards between them.
      const y = u.line[1].y < a.y ? Math.min(a2.y, b2.y) + (u.line[1].y - a.y) : Math.max(a2.y, b2.y) + (u.line[1].y - a.y);
      line = [a2, { x: a2.x, y }, { x: b2.x, y }, b2];
      at = { x: (a2.x + b2.x) / 2, y };
    } else if (ca && cb) {
      // The two cards where they now are decide how the line runs, however it ran before: side by side it is
      // straight between them; one over the other it goes down a lane at their side; otherwise round a corner.
      const ra = { ...ca, x: ca.x + (da?.x ?? 0), y: ca.y + (da?.y ?? 0) };
      const rb = { ...cb, x: cb.x + (db?.x ?? 0), y: cb.y + (db?.y ?? 0) };
      const [left, right] = ra.x <= rb.x ? [ra, rb] : [rb, ra];
      const between = right.x - (left.x + left.w);
      const top = Math.max(ra.y, rb.y);
      const bottom = Math.min(ra.y + ra.h, rb.y + rb.h);
      const mid = (c: LayoutCard) => c.y + c.h / 2;
      if (between > 0 && bottom - top > ra.h * 0.3) {
        const y = (top + bottom) / 2;
        line = [
          { x: left.x + left.w, y },
          { x: right.x, y },
        ];
        at = { x: left.x + left.w + between / 2, y };
      } else if (between > 0) {
        const x = left.x + left.w + between / 2;
        line = [
          { x: left.x + left.w, y: mid(left) },
          { x, y: mid(left) },
          { x, y: mid(right) },
          { x: right.x, y: mid(right) },
        ];
        at = { x, y: (mid(left) + mid(right)) / 2 };
      } else {
        // The lane on the side it was on, or on the right; as far out as it was.
        const was = u.line.length === 4 ? u.line[1].x - a.x : 0;
        const out = Math.max(Math.abs(was), 12);
        const x = was < 0 ? Math.min(ra.x, rb.x) - out : Math.max(ra.x + ra.w, rb.x + rb.w) + out;
        const edge = (c: LayoutCard) => (was < 0 ? c.x : c.x + c.w);
        line = [
          { x: edge(ra), y: mid(ra) },
          { x, y: mid(ra) },
          { x, y: mid(rb) },
          { x: edge(rb), y: mid(rb) },
        ];
        at = { x, y: (mid(ra) + mid(rb)) / 2 };
      }
    } else if (near(a2.y, b2.y)) {
      line = [a2, b2];
      at = { x: (a2.x + b2.x) / 2, y: a2.y };
    } else {
      const x = (a2.x + b2.x) / 2;
      line = [a2, { x, y: a2.y }, { x, y: b2.y }, b2];
      at = { x, y: (a2.y + b2.y) / 2 };
    }
    shifted.set(u.familyId, { x: at.x - u.x, y: at.y - u.y });
    return { ...u, x: at.x, y: at.y, line };
  });
  const lines: LayoutLine[] = layout.lines.map((l) => {
    let points: Pt[] = l.points;
    // From the parents: their marker went with them, or (a parent alone) their card.
    const start = points[0];
    const from = shifted.get(l.familyId) ?? by(cardAt(layout.cards, start));
    if (from && (Math.abs(from.x) > 0.01 || Math.abs(from.y) > 0.01)) points = leadFrom(points, { x: start.x + from.x, y: start.y + from.y });
    // To the child.
    const end = l.points[l.points.length - 1];
    const to = by(cardAt(layout.cards, end));
    if (to) points = leadTo(points, { x: end.x + to.x, y: end.y + to.y });
    return points === l.points ? l : { ...l, points };
  });
  let x0 = layout.bounds.x;
  let y0 = layout.bounds.y;
  let x1 = layout.bounds.x + layout.bounds.w;
  let y1 = layout.bounds.y + layout.bounds.h;
  for (const c of cards) {
    x0 = Math.min(x0, c.x);
    y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + c.w);
    y1 = Math.max(y1, c.y + c.h);
  }
  return { ...layout, cards, unions, lines, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}
