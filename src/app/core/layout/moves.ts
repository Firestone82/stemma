/**
 * Cards moved by hand on a finished layout. The card goes where it is put, and what hangs under it goes with it:
 * a partner who married in (with no parents on the page) goes with the card they stand beside, and the
 * children under a couple follow the couple's marker wherever it went, and with them their own partners and
 * children, all the way down. The lines that end at a
 * card that moved are led there again: the line from its parents (the bar or the line it hangs from is drawn
 * out to the card's new place), the line to each partner with the marker on it (straight between two cards
 * side by side, down a lane beside two that stand one over the other), and with the marker the lines down to
 * the children; a line whose two ends moved alike moves whole. Nothing above or beside it moves, and nothing
 * is checked: a card can be put on top of another, or a line led across one.
 */
import { separate } from './lanes';
import { CLEARANCE, crossing, reroute as routeLines } from './route';
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

const ZERO: Pt = { x: 0, y: 0 };

/** A card moved by hand: `x`, `y` with what hangs under it, and `sx`, `sy` on its own (nothing following). */
export type Move = Pt & { sx?: number; sy?: number };
const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });

/**
 * The line between two partners and their marker, with the card at each end moved so far (`da`, `db`). The
 * two cards where they now are decide how the line runs, however it ran before: side by side it is straight
 * between them; one over the other it goes down a lane at their side; otherwise round a corner.
 */
function reroute(u: LayoutUnion, ca: LayoutCard | undefined, cb: LayoutCard | undefined, da: Pt, db: Pt): { line: Pt[]; at: Pt } {
  const a = u.line[0];
  const b = u.line[u.line.length - 1];
  const a2 = add(a, da);
  const b2 = add(b, db);
  if (u.line.length === 4 && !level(u.line[0], u.line[1])) {
    // Over or under the cards between them.
    const y = u.line[1].y < a.y ? Math.min(a2.y, b2.y) + (u.line[1].y - a.y) : Math.max(a2.y, b2.y) + (u.line[1].y - a.y);
    return { line: [a2, { x: a2.x, y }, { x: b2.x, y }, b2], at: { x: (a2.x + b2.x) / 2, y } };
  }
  if (ca && cb) {
    const ra = { ...ca, x: ca.x + da.x, y: ca.y + da.y };
    const rb = { ...cb, x: cb.x + db.x, y: cb.y + db.y };
    const [left, right] = ra.x <= rb.x ? [ra, rb] : [rb, ra];
    const between = right.x - (left.x + left.w);
    const top = Math.max(ra.y, rb.y);
    const bottom = Math.min(ra.y + ra.h, rb.y + rb.h);
    const mid = (c: LayoutCard) => c.y + c.h / 2;
    if (between > 0 && bottom - top > ra.h * 0.3) {
      const y = (top + bottom) / 2;
      return {
        line: [
          { x: left.x + left.w, y },
          { x: right.x, y },
        ],
        at: { x: left.x + left.w + between / 2, y },
      };
    }
    if (between > 0) {
      const x = left.x + left.w + between / 2;
      return {
        line: [
          { x: left.x + left.w, y: mid(left) },
          { x, y: mid(left) },
          { x, y: mid(right) },
          { x: right.x, y: mid(right) },
        ],
        at: { x, y: (mid(left) + mid(right)) / 2 },
      };
    }
    // The lane on the side it was on, or on the right; as far out as it was.
    const was = u.line.length === 4 ? u.line[1].x - a.x : 0;
    const out = Math.max(Math.abs(was), 12);
    const x = was < 0 ? Math.min(ra.x, rb.x) - out : Math.max(ra.x + ra.w, rb.x + rb.w) + out;
    const edge = (c: LayoutCard) => (was < 0 ? c.x : c.x + c.w);
    return {
      line: [
        { x: edge(ra), y: mid(ra) },
        { x, y: mid(ra) },
        { x, y: mid(rb) },
        { x: edge(rb), y: mid(rb) },
      ],
      at: { x, y: (mid(ra) + mid(rb)) / 2 },
    };
  }
  if (near(a2.y, b2.y)) return { line: [a2, b2], at: { x: (a2.x + b2.x) / 2, y: a2.y } };
  const x = (a2.x + b2.x) / 2;
  return { line: [a2, { x, y: a2.y }, { x, y: b2.y }, b2], at: { x, y: (a2.y + b2.y) / 2 } };
}

/**
 * How far each card goes: as far as it was moved by hand, and as far as what it hangs from went. A child goes
 * as far as its parents' marker (or its one parent's card); someone with no parents on the page goes as far
 * as the partner they stand beside, when that partner has parents on it. Two with no parents on the page (a
 * couple at the top) each go only as far as they were moved themselves. Worked out from the top down, until
 * nothing changes.
 */
function offsets(layout: LayoutResult, moves: ReadonlyMap<string, Move>): Map<LayoutCard, Pt> {
  const raw = (c: LayoutCard): Pt | undefined => {
    const m = c.ghost ? undefined : moves.get(c.personId);
    return m ? { x: m.x, y: m.y } : undefined;
  };
  /** Moved on its own: nothing under it follows (see Move). */
  const solo = (c: LayoutCard): Pt => {
    const m = c.ghost ? undefined : moves.get(c.personId);
    return { x: m?.sx ?? 0, y: m?.sy ?? 0 };
  };
  const unions = new Map(layout.unions.map((u) => [u.familyId, u]));
  const ends = new Map(layout.unions.map((u) => [u.familyId, [cardAt(layout.cards, u.line[0]), cardAt(layout.cards, u.line[u.line.length - 1])] as const]));
  const lines = layout.lines
    .map((l) => ({ l, child: cardAt(layout.cards, l.points[l.points.length - 1]), parent: cardAt(layout.cards, l.points[0]) }))
    .filter((x): x is typeof x & { child: LayoutCard } => !!x.child && !x.child.ghost);
  const hangs = new Set(lines.map((x) => x.child));
  // Partners: a couple moves as one. Moving the partner who married in moves the one they stand beside (and so
  // what hangs under them), and a couple at the top, with nobody above either, goes as far as either was moved.
  const mates = new Map<LayoutCard, LayoutCard[]>();
  for (const [ca, cb] of ends.values()) {
    if (!ca || !cb || ca === cb || ca.ghost || cb.ghost) continue;
    mates.set(ca, [...(mates.get(ca) ?? []), cb]);
    mates.set(cb, [...(mates.get(cb) ?? []), ca]);
  }
  const own = (c: LayoutCard): Pt | undefined => {
    if (c.ghost) return undefined;
    const partners = mates.get(c) ?? [];
    // Married in beside someone who hangs from their parents: goes as that one goes (see `joined` below).
    if (!hangs.has(c) && partners.some((m) => hangs.has(m))) return undefined;
    let sum = raw(c) ?? ZERO;
    for (const m of partners) if (!hangs.has(m)) sum = add(sum, raw(m) ?? ZERO);
    return same(sum, ZERO) ? undefined : sum;
  };
  const inherited = new Map<LayoutCard, Pt>();
  const total = (c?: LayoutCard): Pt => (c ? add(own(c) ?? ZERO, inherited.get(c) ?? ZERO) : ZERO);
  const markerShift = (familyId: string, parent?: LayoutCard): Pt => {
    const u = unions.get(familyId);
    const [ca, cb] = ends.get(familyId) ?? [];
    if (!u) return total(parent);
    const da = total(ca);
    const db = total(cb);
    // Both went alike: the marker goes as far (see applyMoves).
    if (same(da, db)) return da;
    const { at } = reroute(u, ca, cb, da, db);
    return { x: at.x - u.x, y: at.y - u.y };
  };
  const set = (c: LayoutCard, d: Pt): boolean => {
    if (same(inherited.get(c) ?? ZERO, d)) return false;
    if (same(d, ZERO)) inherited.delete(c);
    else inherited.set(c, d);
    return true;
  };
  for (let round = 0; round < layout.cards.length + 2; round++) {
    let changed = false;
    // Every child as far as the first of its families that moved.
    const next = new Map<LayoutCard, Pt>();
    for (const { l, child, parent } of lines) {
      const d = markerShift(l.familyId, parent);
      if (!next.has(child) || (same(next.get(child)!, ZERO) && !same(d, ZERO))) next.set(child, d);
    }
    for (const [child, d] of next) changed = set(child, d) || changed;
    // Partners who married in, with their partner (the first of them that moved).
    const joined = new Map<LayoutCard, Pt>();
    for (const [ca, cb] of ends.values()) {
      if (!ca || !cb || ca.ghost || cb.ghost) continue;
      for (const [one, other] of [
        [ca, cb],
        [cb, ca],
      ] as const) {
        if (hangs.has(one) || !hangs.has(other)) continue;
        const d = total(other);
        if (!joined.has(one) || (same(joined.get(one)!, ZERO) && !same(d, ZERO))) joined.set(one, d);
      }
    }
    for (const [one, d] of joined) changed = set(one, d) || changed;
    if (!changed) break;
  }
  const out = new Map<LayoutCard, Pt>();
  for (const c of layout.cards) {
    const d = add(total(c), solo(c));
    if (!same(d, ZERO)) out.set(c, d);
  }
  return out;
}

/** The layout with the cards in `moves` (by person, how far from where they were put) moved, what hangs under them with them, and their lines led after them. */
export function applyMoves(layout: LayoutResult, moves: ReadonlyMap<string, Move>, clearance?: number): LayoutResult {
  if (!layout.cards.some((c) => !c.ghost && moves.has(c.personId))) return layout;
  const shift = offsets(layout, moves);
  const by = (c?: LayoutCard): Pt | undefined => (c ? shift.get(c) : undefined);
  const cards = layout.cards.map((c) => {
    const d = by(c);
    return d ? { ...c, x: c.x + d.x, y: c.y + d.y } : c;
  });
  // The line between two partners, with their marker: each end goes with its card.
  const shifted = new Map<string, Pt>();
  const unions: LayoutUnion[] = layout.unions.map((u) => {
    const ca = cardAt(layout.cards, u.line[0]);
    const cb = cardAt(layout.cards, u.line[u.line.length - 1]);
    const da = by(ca);
    const db = by(cb);
    if (!da && !db) return u;
    let line: Pt[];
    let at: Pt;
    if (da && db && same(da, db)) {
      // Both went alike: the line goes whole.
      line = u.line.map((p) => add(p, da));
      at = add(u, da);
    } else ({ line, at } = reroute(u, ca, cb, da ?? ZERO, db ?? ZERO));
    shifted.set(u.familyId, { x: at.x - u.x, y: at.y - u.y });
    return { ...u, x: at.x, y: at.y, line };
  });
  const lines: LayoutLine[] = layout.lines.map((l) => {
    const start = l.points[0];
    const end = l.points[l.points.length - 1];
    // From the parents: their marker went with them, or (a parent alone) their card.
    const from = shifted.get(l.familyId) ?? by(cardAt(layout.cards, start)) ?? ZERO;
    // To the child.
    const to = by(cardAt(layout.cards, end)) ?? ZERO;
    if (same(from, ZERO) && same(to, ZERO)) return l;
    // Both ends went alike: the line goes whole, bends and all.
    if (same(from, to)) return { ...l, points: l.points.map((p) => add(p, from)) };
    let points: Pt[] = l.points;
    if (!same(from, ZERO)) points = leadFrom(points, add(start, from));
    if (!same(to, ZERO)) points = leadTo(points, add(end, to));
    return { ...l, points };
  });
  // Every line to or from a card that moved is led again by the shortest way clear of the other cards, as is any
  // line that now runs through a card (one the layout itself led over cards stays as it was).
  const was = crossing(layout.lines, layout.cards, layout.placeholders);
  const again = new Set<string>();
  layout.lines.forEach((l, i) => {
    if (lines[i] !== l) again.add(l.key);
  });
  for (const key of crossing(lines, cards, layout.placeholders)) if (!was.has(key)) again.add(key);
  const led = again.size ? routeLines(lines, again, cards, layout.placeholders, clearance, unions) : lines;
  // Where a line led again still runs along a line of another family, one of them moves into a lane beside it.
  const routed = again.size ? separate(led, unions, [...cards, ...layout.placeholders], Math.max(5, Math.min(8, ((clearance ?? CLEARANCE) * 2) / 3))) : led;
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
  return { ...layout, cards, unions, lines: routed, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/**
 * The lines led by hand (PrintSettings.lineBends, by line key) drawn as they were led: the bends in between
 * where they were put, the two ends where the marker and the card now are, the first and last stretches kept
 * straight (drawn out or in to meet the ends).
 */
export function applyBends(layout: LayoutResult, bends: ReadonlyMap<string, readonly Pt[]>): LayoutResult {
  if (!bends.size) return layout;
  let changed = false;
  const lines = layout.lines.map((l) => {
    const kept = bends.get(l.key);
    if (!kept || kept.length < 2) return l;
    changed = true;
    return { ...l, points: bent(kept, l.points[0], l.points[l.points.length - 1]) };
  });
  return changed ? { ...layout, lines } : layout;
}

/** A line led by hand, its ends put where `start` and `end` now are. */
export function bent(kept: readonly Pt[], start: Pt, end: Pt): Pt[] {
  const points = kept.map((p) => ({ ...p }));
  const n = points.length;
  if (n === 2) return simplifyLine([start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end]);
  // The stretch out of each end stays upright or level, as it was led.
  const fit = (end: Pt, next: Pt, was: Pt) => {
    if (Math.abs(was.x - next.x) < 0.01) next.x = end.x;
    else next.y = end.y;
  };
  fit(start, points[1], kept[0]);
  fit(end, points[n - 2], kept[n - 1]);
  points[0] = { ...start };
  points[n - 1] = { ...end };
  return simplifyLine(points);
}

/** The points without doubles and without those in the middle of a straight run. */
function simplifyLine(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !(Math.abs(a.x - p.x) < 0.01 && Math.abs(p.x - b.x) < 0.01) && !(Math.abs(a.y - p.y) < 0.01 && Math.abs(p.y - b.y) < 0.01);
  });
}
