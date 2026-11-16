import { LayoutResult, Pt } from '../../core/layout/types';

export const EMPTY_LAYOUT: LayoutResult = {
  cards: [],
  placeholders: [],
  unions: [],
  lines: [],
  bounds: { x: 0, y: 0, w: 0, h: 0 },
  ranks: new Map(),
  generations: 0,
  centre: { x: 0, y: 0 },
};

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
/** A line between two shapes with as many corners; a line that turns differently takes its new shape at once. */
const lerpPts = (a: Pt[], b: Pt[], t: number): Pt[] => (a.length === b.length ? b.map((p, i) => lerpPt(a[i], p, t)) : b);

/**
 * A frame between two layouts. Things present in both move; new things appear
 * at their destination; removed things are dropped.
 */
export function lerpLayout(a: LayoutResult, b: LayoutResult, t: number): LayoutResult {
  if (t >= 1) return b;
  const cardsA = new Map(a.cards.map((c) => [c.key, c]));
  const unionsA = new Map(a.unions.map((u) => [u.familyId, u]));
  const linesA = new Map(a.lines.map((l) => [l.key, l]));
  const holdersA = new Map(a.placeholders.map((p) => [p.familyId, p]));
  return {
    ...b,
    cards: b.cards.map((c) => {
      const p = cardsA.get(c.key);
      return p ? { ...c, x: lerp(p.x, c.x, t), y: lerp(p.y, c.y, t) } : c;
    }),
    unions: b.unions.map((u) => {
      const p = unionsA.get(u.familyId);
      return p ? { ...u, x: lerp(p.x, u.x, t), y: lerp(p.y, u.y, t), line: lerpPts(p.line, u.line, t) } : u;
    }),
    lines: b.lines.map((l) => {
      const p = linesA.get(l.key);
      return p ? { ...l, points: lerpPts(p.points, l.points, t) } : l;
    }),
    placeholders: b.placeholders.map((h) => {
      const p = holdersA.get(h.familyId);
      return p ? { ...h, x: lerp(p.x, h.x, t), y: lerp(p.y, h.y, t) } : h;
    }),
  };
}

/**
 * How far the layout moved under someone: the first of `anchorIds` on both
 * layouts, otherwise the average over everyone on both.
 */
export function anchorShift(a: LayoutResult, b: LayoutResult, anchorIds: string[]): Pt {
  const cardsA = new Map(a.cards.filter((c) => !c.ghost).map((c) => [c.personId, c]));
  for (const id of anchorIds) {
    const p = cardsA.get(id);
    const c = b.cards.find((x) => x.personId === id && !x.ghost);
    if (p && c) return { x: c.x - p.x, y: c.y - p.y };
  }
  let dx = 0;
  let dy = 0;
  let n = 0;
  for (const c of b.cards) {
    const p = c.ghost ? undefined : cardsA.get(c.personId);
    if (!p) continue;
    dx += c.x - p.x;
    dy += c.y - p.y;
    n++;
  }
  return n ? { x: dx / n, y: dy / n } : { x: 0, y: 0 };
}
