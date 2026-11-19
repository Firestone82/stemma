import { separate } from './lanes';
import { LayoutLine, Pt } from './types';

const line = (familyId: string, childId: string, points: Pt[], trunk = false): LayoutLine => ({
  key: `${familyId}|${childId}`,
  familyId,
  childId,
  relation: 'biological',
  trunk,
  points,
});
const card = (x: number, y: number) => ({ x, y, w: 100, h: 60 });

describe('lines of two families in one gap', () => {
  // Two couples in the row above (markers at x 120 and x 500), their children in the row below at y 100: the
  // first couple's daughter stands far to the right, so both bars run across the gap at y 80.
  const cards = [card(0, 0), card(140, 0), card(380, 0), card(520, 0), card(560, 100), card(700, 100)];
  const far = line('A', 'daughter', [
    { x: 120, y: 30 },
    { x: 120, y: 80 },
    { x: 610, y: 80 },
    { x: 610, y: 100 },
  ]);
  const son = line('B', 'son', [
    { x: 500, y: 30 },
    { x: 500, y: 80 },
    { x: 750, y: 80 },
    { x: 750, y: 100 },
  ]);

  it('moves one bar into a lane of its own, clear of the cards and ending where it did', () => {
    const [a, b] = separate([far, son], [], cards, 8);
    const bar = (l: LayoutLine) => l.points[2].y;
    expect(Math.abs(bar(a) - bar(b))).toBeGreaterThanOrEqual(8);
    for (const l of [a, b]) {
      expect(bar(l)).toBeGreaterThan(60);
      expect(bar(l)).toBeLessThan(100);
      expect(l.points[0]).toEqual(l === a ? far.points[0] : son.points[0]);
      expect(l.points.at(-1)).toEqual(l === a ? far.points.at(-1) : son.points.at(-1));
    }
  });

  it('moves brothers and sisters together, so they still share their bar', () => {
    const brother = line('B', 'brother', [
      { x: 500, y: 30 },
      { x: 500, y: 80 },
      { x: 410, y: 80 },
      { x: 410, y: 100 },
    ]);
    const out = separate([far, son, brother], [], [...cards, card(360, 100)], 8);
    const [, s, br] = out;
    expect(s.points[2].y).toBe(br.points[2].y);
    expect(out[0].points[2].y).not.toBe(s.points[2].y);
  });

  it('leaves lines that do not lie on each other as they are', () => {
    const apart = line('B', 'son', [
      { x: 500, y: 30 },
      { x: 500, y: 90 },
      { x: 750, y: 90 },
      { x: 750, y: 100 },
    ]);
    expect(separate([far, apart], [], cards, 8)).toEqual([far, apart]);
  });

  it('rather moves the line that is not in the direct line', () => {
    const [a, b] = separate([{ ...far, trunk: true }, son], [], cards, 8);
    expect(a.points[2].y).toBe(80);
    expect(b.points[2].y).not.toBe(80);
  });
});
