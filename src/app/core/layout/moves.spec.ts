import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { Layouter, WIDE } from './engine';
import { applyMoves } from './moves';
import { LAYOUT, LayoutCard, LayoutResult, Pt } from './types';

function sample(): LayoutResult {
  const doc = sampleDocument();
  const index = new TreeIndex(doc);
  const home = doc.meta.homePersonId!;
  return new Layouter(index, LAYOUT, home, index.partners(home).at(-1)?.id).run(WIDE);
}

const card = (l: LayoutResult, id: string) => l.cards.find((c) => c.personId === id && !c.ghost)!;
/** On the edge of a card, or inside it (lines are drawn under the cards). */
const reaches = (p: Pt, c: LayoutCard) => p.x > c.x - 1 && p.x < c.x + c.w + 1 && p.y > c.y - 1 && p.y < c.y + c.h + 1;
const straight = (points: readonly Pt[]) => points.slice(1).every((p, i) => Math.abs(p.x - points[i].x) < 0.01 || Math.abs(p.y - points[i].y) < 0.01);

describe('cards moved by hand', () => {
  it('puts the card where it was dragged and leads the line from its parents after it', () => {
    const l = sample();
    // Leo, the child of Tomáš and Mia.
    const moved = applyMoves(l, new Map([['I29', { x: 130, y: 45 }]]));
    expect(card(moved, 'I29').x).toBeCloseTo(card(l, 'I29').x + 130, 5);
    expect(card(moved, 'I29').y).toBeCloseTo(card(l, 'I29').y + 45, 5);
    const before = l.lines.find((x) => x.childId === 'I29')!;
    const after = moved.lines.find((x) => x.childId === 'I29')!;
    // Still from the parents' marker, in straight runs, to the card where it now is.
    expect(after.points[0]).toEqual(before.points[0]);
    expect(reaches(after.points.at(-1)!, card(moved, 'I29'))).toBe(true);
    expect(reaches(after.points.at(-1)!, card(l, 'I29'))).toBe(false);
    expect(straight(after.points)).toBe(true);
    // Nothing else moves: every other card and line is the very same.
    for (const c of l.cards) if (c.personId !== 'I29') expect(moved.cards).toContain(c);
    for (const line of l.lines) if (line.childId !== 'I29') expect(moved.lines).toContain(line);
    expect(moved.unions).toEqual(l.unions);
  });

  it('takes the couple’s marker along, and with it the lines down to their children', () => {
    const l = sample();
    // Tomáš, who stands beside Mia with Leo under them.
    const moved = applyMoves(l, new Map([['I22', { x: -40, y: 50 }]]));
    const union = moved.unions.find((u) => u.familyId === 'F11')!;
    const was = l.unions.find((u) => u.familyId === 'F11')!;
    expect(union).not.toEqual(was);
    // The line between the two still runs from one card to the other, the marker on it.
    expect(reaches(union.line[0], card(moved, 'I22')) || reaches(union.line.at(-1)!, card(moved, 'I22'))).toBe(true);
    expect(reaches(union.line[0], card(moved, 'I26')) || reaches(union.line.at(-1)!, card(moved, 'I26'))).toBe(true);
    expect(straight(union.line)).toBe(true);
    // Leo did not move; his line now starts at the marker's new place.
    const down = moved.lines.find((x) => x.childId === 'I29')!;
    expect(down.points[0].x).toBeCloseTo(union.x, 5);
    expect(down.points[0].y).toBeCloseTo(union.y, 5);
    expect(reaches(down.points.at(-1)!, card(l, 'I29'))).toBe(true);
    expect(straight(down.points)).toBe(true);
    // And the line from Tomáš's own parents follows him.
    const up = moved.lines.find((x) => x.childId === 'I22')!;
    expect(reaches(up.points.at(-1)!, card(moved, 'I22'))).toBe(true);
  });

  it('runs the line between two partners straight when one is put beside the other, and down a lane when one is put under', () => {
    const l = sample();
    // Tomáš and Mia stand side by side. Mia put under him: the line goes down a lane at their side.
    const tomas = card(l, 'I22');
    const mia = card(l, 'I26');
    const under = applyMoves(l, new Map([['I26', { x: tomas.x - mia.x, y: tomas.h + 12 }]]));
    const lane = under.unions.find((u) => u.familyId === 'F11')!;
    expect(lane.line).toHaveLength(4);
    expect(lane.x).toBeGreaterThan(tomas.x + tomas.w);
    expect(straight(lane.line)).toBe(true);
    expect(reaches(lane.line[0], card(under, 'I22')) || reaches(lane.line[3], card(under, 'I22'))).toBe(true);
    // Put back beside him, further off and a little lower: straight between the two cards again, the marker half way.
    const beside = applyMoves(l, new Map([['I26', { x: 60, y: 10 }]]));
    const flat = beside.unions.find((u) => u.familyId === 'F11')!;
    expect(flat.line).toHaveLength(2);
    expect(flat.line[0].y).toBeCloseTo(flat.line[1].y, 5);
    expect(flat.line[0].x).toBeCloseTo(tomas.x + tomas.w, 5);
    expect(flat.line[1].x).toBeCloseTo(mia.x + 60, 5);
    expect(flat.x).toBeCloseTo((flat.line[0].x + flat.line[1].x) / 2, 5);
    // And their child's line starts at the marker wherever it went.
    for (const moved of [under, beside]) {
      const union = moved.unions.find((u) => u.familyId === 'F11')!;
      const down = moved.lines.find((x) => x.childId === 'I29')!;
      expect(down.points[0].x).toBeCloseTo(union.x, 5);
      expect(down.points[0].y).toBeCloseTo(union.y, 5);
      expect(straight(down.points)).toBe(true);
    }
  });

  it('makes the tree as big as it now is, and is the same tree when nobody moved', () => {
    const l = sample();
    expect(applyMoves(l, new Map())).toBe(l);
    expect(applyMoves(l, new Map([['nobody', { x: 10, y: 10 }]]))).toBe(l);
    const far = applyMoves(l, new Map([['I29', { x: 4000, y: 0 }]]));
    expect(far.bounds.w).toBeGreaterThan(l.bounds.w + 3000);
    expect(far.bounds.x).toBe(l.bounds.x);
  });
});
