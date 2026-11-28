import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { Layouter, WIDE } from './engine';
import { addBend, applyBends, applyMoves, bent, removeBend } from './moves';
import { crossing } from './route';
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
    // Mia married in: she goes with him, and the marker between them as far.
    const shift = { x: union.x - was.x, y: union.y - was.y };
    expect(shift.x).toBeCloseTo(-40, 5);
    expect(shift.y).toBeCloseTo(50, 5);
    expect(card(moved, 'I26').x).toBeCloseTo(card(l, 'I26').x - 40, 5);
    // Leo hangs under the marker: he went as far as it did, and his line with him, the same shape.
    const down = moved.lines.find((x) => x.childId === 'I29')!;
    expect(card(moved, 'I29').x).toBeCloseTo(card(l, 'I29').x + shift.x, 5);
    expect(card(moved, 'I29').y).toBeCloseTo(card(l, 'I29').y + shift.y, 5);
    expect(down.points[0].x).toBeCloseTo(union.x, 5);
    expect(down.points[0].y).toBeCloseTo(union.y, 5);
    expect(reaches(down.points.at(-1)!, card(moved, 'I29'))).toBe(true);
    expect(down.points).toHaveLength(l.lines.find((x) => x.childId === 'I29')!.points.length);
    expect(straight(down.points)).toBe(true);
    // Dragged herself, Mia takes Tomáš with her (a couple moves as one), and Leo with them.
    const mia = applyMoves(l, new Map([['I26', { x: 60, y: 0 }]]));
    expect(card(mia, 'I22').x).toBeCloseTo(card(l, 'I22').x + 60, 5);
    expect(card(mia, 'I26').x).toBeCloseTo(card(l, 'I26').x + 60, 5);
    expect(card(mia, 'I29').x).toBeCloseTo(card(l, 'I29').x + 60, 5);
    // And the line from Tomáš's own parents follows him.
    const up = moved.lines.find((x) => x.childId === 'I22')!;
    expect(reaches(up.points.at(-1)!, card(moved, 'I22'))).toBe(true);
  });

  it('moves the two partners together, the marker and the line between them with them, and the children after', () => {
    const l = sample();
    const tomas = card(l, 'I22');
    const mia = card(l, 'I26');
    // Mia put under Tomáš: he goes as far as she does, so the two stay side by side and the line between them is whole.
    const moved = applyMoves(l, new Map([['I26', { x: 0, y: tomas.h + 12 }]]));
    const union = moved.unions.find((u) => u.familyId === 'F11')!;
    const was = l.unions.find((u) => u.familyId === 'F11')!;
    expect(card(moved, 'I22').y).toBeCloseTo(tomas.y + tomas.h + 12, 5);
    expect(card(moved, 'I26').y).toBeCloseTo(mia.y + tomas.h + 12, 5);
    expect(union.line).toHaveLength(was.line.length);
    expect(union.y).toBeCloseTo(was.y + tomas.h + 12, 5);
    expect(straight(union.line)).toBe(true);
    // Their child's line starts at the marker wherever it went.
    const down = moved.lines.find((x) => x.childId === 'I29')!;
    expect(down.points[0].x).toBeCloseTo(union.x, 5);
    expect(down.points[0].y).toBeCloseTo(union.y, 5);
    expect(straight(down.points)).toBe(true);
  });

  it('leads a line again round the cards in its way, by the shortest way, straight and entering its card from above', () => {
    const l = sample();
    // Leo dragged far to the left, under people he is not related to.
    const moved = applyMoves(l, new Map([['I29', { x: -420, y: 70 }]]));
    const leo = card(moved, 'I29');
    const line = moved.lines.find((x) => x.childId === 'I29')!;
    expect(straight(line.points)).toBe(true);
    // Into the card from above, from the marker downwards.
    const last = line.points.at(-1)!;
    const before = line.points.at(-2)!;
    expect(reaches(last, leo)).toBe(true);
    expect(before.x).toBeCloseTo(last.x, 5);
    expect(before.y).toBeLessThan(last.y);
    const union = moved.unions.find((u) => u.familyId === 'F11')!;
    expect(line.points[0].x).toBeCloseTo(union.x, 5);
    expect(line.points[1].y).toBeGreaterThan(line.points[0].y);
    // Through the inside of no other card.
    for (const c of moved.cards) {
      if (c.personId === 'I29') continue;
      for (let i = 1; i < line.points.length; i++) {
        const p = line.points[i - 1];
        const q = line.points[i];
        for (let k = 0; k <= 20; k++) {
          const x = p.x + ((q.x - p.x) * k) / 20;
          const y = p.y + ((q.y - p.y) * k) / 20;
          expect(x > c.x + 0.5 && x < c.x + c.w - 0.5 && y > c.y + 0.5 && y < c.y + c.h - 0.5).toBe(false);
        }
      }
    }
  });

  it('leads the line again from a marker between two partners close together, never the old way stretched', () => {
    const l = sample();
    for (const d of [
      { x: 140, y: 0 },
      { x: -160, y: 40 },
      { x: 60, y: 80 },
    ]) {
      const moved = applyMoves(l, new Map([['I3', d]]));
      const line = moved.lines.find((x) => x.key === 'F2|I3')!;
      const before = l.lines.find((x) => x.key === 'F2|I3')!;
      expect(line.points[0]).toEqual(before.points[0]);
      expect(reaches(line.points.at(-1)!, card(moved, 'I3'))).toBe(true);
      expect(straight(line.points)).toBe(true);
      expect(crossing([line], moved.cards).size).toBe(0);
    }
  });

  it('keeps a line led by hand as it was led, its ends with the marker and the card wherever they went', () => {
    // Down, across at 40, down: the across stretch put lower by hand.
    expect(
      bent(
        [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 100, y: 40 },
          { x: 100, y: 80 },
        ],
        { x: 10, y: 5 },
        { x: 130, y: 90 },
      ),
    ).toEqual([
      { x: 10, y: 5 },
      { x: 10, y: 40 },
      { x: 130, y: 40 },
      { x: 130, y: 90 },
    ]);
    const l = sample();
    const line = l.lines.find((x) => x.childId === 'I29')!;
    const a = line.points[0];
    const z = line.points.at(-1)!;
    const led = [a, { x: a.x, y: a.y + 30 }, { x: a.x + 60, y: a.y + 30 }, { x: a.x + 60, y: z.y - 12 }, { x: z.x, y: z.y - 12 }, z];
    const out = applyBends(l, new Map([[line.key, led]])).lines.find((x) => x.key === line.key)!;
    expect(straight(out.points)).toBe(true);
    expect(out.points).toEqual(led);
    // With the child moved, the bend stays where it was put and the line still ends on the card.
    const moved = applyBends(applyMoves(l, new Map([['I29', { x: 80, y: 20 }]])), new Map([[line.key, led]]));
    const after = moved.lines.find((x) => x.key === line.key)!;
    expect(after.points.some((p) => Math.abs(p.y - (a.y + 30)) < 0.01)).toBe(true);
    expect(reaches(after.points.at(-1)!, card(moved, 'I29'))).toBe(true);
  });

  it('leads a line again into the top of the card, in its middle, after the card was moved', () => {
    const l = sample();
    for (const line of l.lines) {
      const moved = applyMoves(l, new Map([[line.childId, { x: 120, y: 30 }]]));
      const after = moved.lines.find((x) => x.key === line.key)!;
      const c = moved.cards.find((x) => x.personId === line.childId && !x.ghost)!;
      if (c.y <= after.points[0].y + 20) continue;
      const end = after.points.at(-1)!;
      const before = after.points.at(-2)!;
      expect(end.y).toBeCloseTo(c.y, 5);
      expect(end.x).toBeCloseTo(c.x + c.w / 2, 5);
      // The last stretch comes down into it.
      expect(before.x).toBeCloseTo(end.x, 5);
      expect(before.y).toBeLessThan(end.y);
    }
  });

  it('branches a line led again off the line of a brother or sister, drawn as one with it', () => {
    const l = sample();
    let branched = 0;
    for (const line of l.lines) {
      const others = l.lines.filter((x) => x.familyId === line.familyId && x.key !== line.key);
      if (!others.length) continue;
      const moved = applyMoves(l, new Map([[line.childId, { x: 60, y: 40 }]]));
      const after = moved.lines.find((x) => x.key === line.key)!;
      expect(straight(after.points)).toBe(true);
      expect(after.points[0]).toEqual(line.points[0]);
      // Its first stretches lie along a brother's or sister's line, as far as it runs with it.
      const sib = moved.lines.filter((x) => x.familyId === line.familyId && x.key !== line.key);
      if (sib.some((x) => x.points.length > 2 && x.points[1].x === after.points[1].x && x.points[1].y === after.points[1].y)) branched++;
    }
    expect(branched).toBeGreaterThan(0);
  });

  it('moves a card alone when asked, leaving its partner and children where they were', () => {
    const l = sample();
    // A parent with children on the page.
    const line = l.lines.find((x) => l.unions.some((u) => u.familyId === x.familyId))!;
    const u = l.unions.find((x) => x.familyId === line.familyId)!;
    const parent = l.cards.find((c) => !c.ghost && Math.abs(c.x + c.w - u.line[0].x) < 1 && Math.abs(c.y + c.h / 2 - u.line[0].y) < c.h)!;
    const moved = applyMoves(l, new Map([[parent.personId, { x: 0, y: 0, sx: 40, sy: 25 }]]));
    expect(card(moved, parent.personId).x).toBeCloseTo(parent.x + 40, 5);
    expect(card(moved, parent.personId).y).toBeCloseTo(parent.y + 25, 5);
    expect(card(moved, line.childId)).toEqual(card(l, line.childId));
  });

  it('takes everything that hangs under a moved card along: children, the partners they married and their children', () => {
    const l = sample();
    // Simon and Šárka, the couple in the middle, both moved alike: everyone under them goes as far.
    const d = { x: 220, y: 90 };
    const moved = applyMoves(
      l,
      new Map([
        ['I11', d],
        ['I15', d],
      ]),
    );
    // Ruth, Simon's first wife, married in: she goes with him.
    expect(card(moved, 'I14').x).toBeCloseTo(card(l, 'I14').x + d.x, 5);
    // Tomáš (their son), Mia (who married him) and Leo (their child).
    for (const id of ['I22', 'I26', 'I29']) {
      expect(card(moved, id).x).toBeCloseTo(card(l, id).x + d.x, 5);
      expect(card(moved, id).y).toBeCloseTo(card(l, id).y + d.y, 5);
    }
    // Their lines go whole.
    const before = l.lines.find((x) => x.childId === 'I29')!;
    expect(moved.lines.find((x) => x.childId === 'I29')!.points).toEqual(before.points.map((p) => ({ x: p.x + d.x, y: p.y + d.y })));
    // Simon's parents above, and his brother beside, stay where they were.
    for (const id of ['I6', 'I9', 'I12']) expect(card(moved, id)).toEqual(card(l, id));
  });

  it('adds a move of a card under a moved one to what it went along', () => {
    const l = sample();
    // Tomáš moved, Mia with him, Leo under them moved as well.
    const moved = applyMoves(
      l,
      new Map([
        ['I22', { x: 100, y: 0 }],
        ['I29', { x: -30, y: 20 }],
      ]),
    );
    expect(card(moved, 'I29').x).toBeCloseTo(card(l, 'I29').x + 70, 5);
    expect(card(moved, 'I29').y).toBeCloseTo(card(l, 'I29').y + 20, 5);
  });

  it('makes the tree as big as it now is, and is the same tree when nobody moved', () => {
    const l = sample();
    expect(applyMoves(l, new Map())).toBe(l);
    expect(applyMoves(l, new Map([['nobody', { x: 10, y: 10 }]]))).toBe(l);
    const far = applyMoves(l, new Map([['I29', { x: 4000, y: 0 }]]));
    expect(far.bounds.w).toBeGreaterThan(l.bounds.w + 3000);
    expect(far.bounds.x).toBe(l.bounds.x);
  });

  describe('bends put on a line by hand', () => {
    const z = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
    ];

    it('puts a bend on the stretch nearest the click, exactly on it', () => {
      expect(addBend(z, { x: 50, y: 43 })).toEqual({ points: [z[0], z[1], { x: 50, y: 40 }, z[2], z[3]], at: 2 });
      // At a corner already: nothing to put.
      expect(addBend(z, { x: 1, y: 41 })).toBeUndefined();
    });

    it('keeps a bend in the middle of a straight run when the line is drawn with its ends moved', () => {
      const split = [z[0], { x: 0, y: 20 }, z[1], z[2], z[3]];
      expect(bent(split, { x: 10, y: 5 }, { x: 130, y: 90 })).toEqual([
        { x: 10, y: 5 },
        { x: 10, y: 20 },
        { x: 10, y: 40 },
        { x: 130, y: 40 },
        { x: 130, y: 90 },
      ]);
    });

    it('takes a bend off: one in a straight run simply goes', () => {
      expect(removeBend([z[0], z[1], { x: 50, y: 40 }, z[2], z[3]], 2)).toEqual(z);
    });

    it('takes a corner off with its step, the stretch beyond put in line with the one before', () => {
      // Down, across, down a step, across, down into the card.
      const step = [
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 50, y: 20 },
        { x: 50, y: 40 },
        { x: 100, y: 40 },
        { x: 100, y: 80 },
      ];
      expect(removeBend(step, 3)).toEqual([
        { x: 0, y: 0 },
        { x: 0, y: 20 },
        { x: 100, y: 20 },
        { x: 100, y: 80 },
      ]);
      // A corner with only the two ends round it cannot go without the line running askew: led by the layout again.
      expect(
        removeBend(
          [
            { x: 0, y: 0 },
            { x: 0, y: 40 },
            { x: 100, y: 40 },
          ],
          1,
        ),
      ).toBeNull();
    });
  });
});
