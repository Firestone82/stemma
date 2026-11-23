import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { Layouter, WIDE } from './engine';
import { gapAt, gapBetween, gapKey, gapPeople, spreadGaps } from './gaps';
import { LAYOUT, LayoutCard, LayoutResult, Pt } from './types';

function sample(): LayoutResult {
  const doc = sampleDocument();
  const index = new TreeIndex(doc);
  const home = doc.meta.homePersonId!;
  return new Layouter(index, LAYOUT, home, index.partners(home).at(-1)?.id).run(WIDE);
}

const real = (l: LayoutResult) => l.cards.filter((c) => !c.ghost);
const card = (l: LayoutResult, id: string) => l.cards.find((c) => c.personId === id && !c.ghost)!;
const reaches = (p: Pt, c: { x: number; y: number; w: number; h: number }) => p.x > c.x - 1 && p.x < c.x + c.w + 1 && p.y > c.y - 1 && p.y < c.y + c.h + 1;
const straight = (points: readonly Pt[]) => points.slice(1).every((p, i) => Math.abs(p.x - points[i].x) < 0.01 || Math.abs(p.y - points[i].y) < 0.01);
const overlapping = (cards: readonly LayoutCard[]) =>
  cards.some((a, i) => cards.slice(i + 1).some((b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5));

/** Two cards side by side with nothing between them, in the lowest row that has two: a gap that can be widened. */
function sideBySide(l: LayoutResult): [LayoutCard, LayoutCard] {
  const cards = real(l);
  const rows = [...new Set(cards.map((c) => c.y))].sort((a, b) => b - a);
  for (const y of rows) {
    const row = cards.filter((c) => c.y === y).sort((a, b) => a.x - b.x);
    // The middle of the row: a gap with cards on both sides of the cut.
    const i = Math.floor(row.length / 2);
    if (row.length >= 2) return [row[i - 1], row[i]];
  }
  throw new Error('no row of two');
}

describe('gaps widened by hand', () => {
  it('names a gap by its two people and reads the name back', () => {
    expect(gapKey('I1', 'I2')).toBe('I1|I2');
    expect(gapPeople('I1|I2')).toEqual(['I1', 'I2']);
    expect(gapPeople('I1|')).toBeUndefined();
    expect(gapPeople('|I2')).toBeUndefined();
    expect(gapPeople('I1')).toBeUndefined();
  });

  it('finds the gap between two cards side by side or one over the other, in either order', () => {
    const a = { personId: 'a', x: 0, y: 0, w: 100, h: 50 };
    const b = { personId: 'b', x: 130, y: 0, w: 100, h: 50 };
    const under = { personId: 'c', x: 20, y: 80, w: 100, h: 50 };
    expect(gapBetween(b, a)).toEqual({ axis: 'x', a: 'a', b: 'b', from: 100, to: 130, lo: 0, hi: 50 });
    expect(gapBetween(under, a)).toEqual({ axis: 'y', a: 'a', b: 'c', from: 50, to: 80, lo: 20, hi: 100 });
    // Apart both ways, or on top of each other: no gap.
    expect(gapBetween(b, under)).toBeUndefined();
    expect(gapBetween(a, { ...a, personId: 'd', x: 50 })).toBeUndefined();
  });

  it('picks the gap a click in the empty room between two cards lands in', () => {
    const cards = [
      { personId: 'a', x: 0, y: 0, w: 100, h: 50 },
      { personId: 'b', x: 130, y: 0, w: 100, h: 50 },
      { personId: 'c', x: 400, y: 0, w: 100, h: 50 },
      { personId: 'd', x: 0, y: 90, w: 100, h: 50 },
      { personId: 'e', x: 130, y: 90, w: 100, h: 50, ghost: true },
    ];
    expect(gapAt(cards, { x: 115, y: 25 })).toMatchObject({ axis: 'x', a: 'a', b: 'b' });
    // The nearest card on either side, not one further off.
    expect(gapAt(cards, { x: 300, y: 25 })).toMatchObject({ axis: 'x', a: 'b', b: 'c' });
    expect(gapAt(cards, { x: 50, y: 70 })).toMatchObject({ axis: 'y', a: 'a', b: 'd' });
    // On a card, too wide a gap, nothing on one side, or a ghost at one end: none.
    expect(gapAt(cards, { x: 50, y: 25 })).toBeUndefined();
    expect(gapAt(cards, { x: 300, y: 25 }, 100)).toBeUndefined();
    expect(gapAt(cards, { x: 600, y: 25 })).toBeUndefined();
    expect(gapAt(cards, { x: 115, y: 115 })).toBeUndefined();
  });

  it('moves the cards beyond a gap side by side over, and nothing above them', () => {
    const l = sample();
    const [a, b] = sideBySide(l);
    const by = 60;
    const cut = (a.x + a.w + b.x) / 2;
    const s = spreadGaps(l, { [gapKey(a.personId, b.personId)]: by });
    expect(card(s, b.personId).x - (card(s, a.personId).x + a.w)).toBeCloseTo(b.x - (a.x + a.w) + by, 5);
    for (const c of l.cards) {
      const now = s.cards.find((x) => x.key === c.key)!;
      const beyond = c.x + c.w / 2 > cut && c.y + c.h > Math.min(a.y, b.y);
      expect(now.y).toBe(c.y);
      expect(now.x).toBeCloseTo(beyond ? c.x + by : c.x, 5);
    }
    // As wide as it was, or wider where what moved over now stands out beyond the rest.
    const right = Math.max(...s.cards.map((c) => c.x + c.w));
    expect(s.bounds.x + s.bounds.w).toBeCloseTo(Math.max(l.bounds.x + l.bounds.w, right), 5);
    // Nothing on anything else, every line still in straight runs from its marker (or card) to its card.
    expect(overlapping(s.cards)).toBe(false);
    for (const line of s.lines) {
      expect(straight(line.points)).toBe(true);
      expect(reaches(line.points.at(-1)!, card(s, line.childId))).toBe(true);
      const u = s.unions.find((x) => x.familyId === line.familyId);
      if (u) {
        expect(line.points[0].x).toBeCloseTo(u.x, 5);
        expect(line.points[0].y).toBeCloseTo(u.y, 5);
      }
    }
    for (const u of s.unions) expect(straight(u.line)).toBe(true);
  });

  it('widens the gap between partners with their marker in the middle of it', () => {
    const l = sample();
    const u = l.unions.find((x) => {
      const ends = [x.line[0], x.line.at(-1)!].map((p) => real(l).find((c) => reaches(p, c)));
      return x.line.length === 2 && ends.every((c) => !!c) && ends[0] !== ends[1];
    })!;
    const [p, q] = [u.line[0], u.line.at(-1)!].map((pt) => real(l).find((c) => reaches(pt, c))!);
    const [left, right] = p.x < q.x ? [p, q] : [q, p];
    const s = spreadGaps(l, { [gapKey(left.personId, right.personId)]: 40 });
    const now = s.unions.find((x) => x.familyId === u.familyId)!;
    const l2 = card(s, left.personId);
    const r2 = card(s, right.personId);
    expect(r2.x - (l2.x + l2.w)).toBeCloseTo(right.x - (left.x + left.w) + 40, 5);
    expect(now.x).toBeCloseTo((l2.x + l2.w + r2.x) / 2, 5);
    expect(straight(now.line)).toBe(true);
  });

  it('widens a gap between a card and the one under it across the whole tree', () => {
    const l = sample();
    const cards = real(l);
    const pair = cards
      .flatMap((a) => cards.map((b) => [a, b] as const))
      .map(([a, b]) => ({ a, b, gap: gapBetween(a, b) }))
      .find((x) => x.gap?.axis === 'y' && x.gap.a === x.a.personId)!;
    const by = 30;
    const cut = (pair.gap!.from + pair.gap!.to) / 2;
    const s = spreadGaps(l, { [gapKey(pair.a.personId, pair.b.personId)]: by });
    for (const c of l.cards) {
      const now = s.cards.find((x) => x.key === c.key)!;
      expect(now.x).toBe(c.x);
      expect(now.y).toBeCloseTo(c.y + c.h / 2 > cut ? c.y + by : c.y, 5);
    }
    expect(s.bounds.h).toBeCloseTo(l.bounds.h + by, 5);
    expect(overlapping(s.cards)).toBe(false);
    for (const line of s.lines) expect(straight(line.points)).toBe(true);
  });

  it('leaves the layout as it is for gaps whose cards do not stand next to each other', () => {
    const l = sample();
    const cards = real(l);
    const top = cards.reduce((a, b) => (b.y < a.y ? b : a));
    const bottom = cards.find((c) => c.y > top.y + top.h && (c.x > top.x + top.w || c.x + c.w < top.x))!;
    expect(
      spreadGaps(l, {
        [gapKey(top.personId, bottom.personId)]: 50,
        'nobody|else': 50,
        [gapKey(...(sideBySide(l).map((c) => c.personId) as [string, string]))]: 0,
      }),
    ).toBe(l);
  });
});
