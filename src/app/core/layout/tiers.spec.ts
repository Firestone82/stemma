import { sampleDocument } from '../model/sample';
import { computeLayout } from './layout';
import { COMFORTABLE_LAYOUT, LayoutCard, TIER_GAP } from './layout-types';

describe('a generation drawn in two tiers', () => {
  const doc = sampleDocument();
  const plain = computeLayout(doc, COMFORTABLE_LAYOUT);
  const extent = (layout: typeof plain, generation: number) => {
    const cards = layout.cards.filter((c) => c.rank === layout.rows[generation].rank);
    return Math.max(...cards.map((c) => c.x + c.w)) - Math.min(...cards.map((c) => c.x));
  };
  const widest = plain.rows.map((_, i) => i).sort((a, b) => extent(plain, b) - extent(plain, a))[0];
  const tiered = computeLayout(doc, { ...COMFORTABLE_LAYOUT, tierGenerations: [widest] });
  const H = COMFORTABLE_LAYOUT.cardHeight;
  const overlap = (a: LayoutCard, b: LayoutCard) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('takes less width, with every other card a step lower and no two cards over each other', () => {
    expect(extent(tiered, widest)).toBeLessThan(extent(plain, widest) * 0.85);
    expect(tiered.bounds.w).toBeLessThanOrEqual(plain.bounds.w * 1.02);
    const row = tiered.rows[widest];
    expect(row.h).toBe(H * 2 + TIER_GAP);
    const cards = tiered.cards.filter((c) => c.rank === row.rank).sort((a, b) => a.x - b.x);
    expect(cards.some((c) => c.y === row.y)).toBe(true);
    expect(cards.some((c) => c.y === row.y + H + TIER_GAP)).toBe(true);
    for (const a of tiered.cards) for (const b of tiered.cards) if (a !== b) expect(overlap(a, b), `${a.personId} over ${b.personId}`).toBe(false);
    // The other rows keep one tier.
    for (const other of tiered.rows) if (other !== row) expect(other.h).toBe(H);
  });

  it('keeps every line clear of the cards: stems pass between the lower tier, lines down to it pass between the upper', () => {
    const row = tiered.rows[widest];
    const cards = tiered.cards.filter((c) => c.rank === row.rank);
    const hits = (x: number, y0: number, y1: number) => cards.filter((c) => x > c.x + 1 && x < c.x + c.w - 1 && y0 < c.y + c.h && y1 > c.y);
    for (const conn of tiered.connectors) {
      // The stem, down from the union to the bar.
      expect(hits(conn.stem.x, conn.stem.y + 1, conn.barY).map((c) => c.personId)).toEqual([]);
      for (const drop of conn.drops) {
        // The drop from the bar, and every straight piece after it, down to the child's card.
        let from = { x: drop.x, y: conn.barY };
        for (const p of drop.points) {
          if (Math.abs(p.x - from.x) < 0.5)
            expect(
              hits(p.x, from.y + 1, p.y - 1).map((c) => c.personId),
              `to ${drop.childId}`,
            ).toEqual([]);
          from = p;
        }
      }
    }
  });

  it('brings the lines down straight into the lower tier wherever the upper tier leaves room for that', () => {
    const row = tiered.rows[widest];
    const lower = new Set(tiered.cards.filter((c) => c.rank === row.rank && c.y > row.y).map((c) => c.personId));
    const upper = tiered.cards.filter((c) => c.rank === row.rank && c.y === row.y);
    // Where a lower card's middle is not under an upper card (36 either side), its line comes straight down into it.
    const free = (x: number) => upper.every((c) => x <= c.x - 36 || x >= c.x + c.w + 36);
    let straight = 0;
    let stepped = 0;
    for (const conn of tiered.connectors) {
      for (const drop of conn.drops) {
        if (!lower.has(drop.childId)) continue;
        const target = drop.points[drop.points.length - 1];
        if (drop.points.length === 1) straight++;
        else {
          stepped++;
          // A step sideways only where the card could not stand under its room.
          expect(free(target.x), `${drop.childId} steps sideways although its middle is free`).toBe(false);
        }
      }
    }
    expect(straight).toBeGreaterThan(0);
    expect(straight).toBeGreaterThanOrEqual(stepped);
  });
});
