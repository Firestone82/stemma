import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { TreeDocument } from '../model/types';
import {
  DocBuilder,
  adoptionBothFamilies,
  cousinMarriage,
  crossGeneration,
  disconnected,
  nuclearFamily,
  pedigree,
  randomFamily,
  threeSpouses,
  wideFamily,
} from '../testing/fixtures';
import { Layouter, WIDE, shapeKey } from './engine';
import { fitLayout, fitLayoutSteps, place } from './fit';
import { finish } from './steps';
import { roundedPath, sharedPaths } from './lines';
import { LAYOUT, LayoutResult, Pt, Shape } from './types';

const UNIT = LAYOUT.cardWidth + LAYOUT.partnerGap;

function layouter(doc: TreeDocument): Layouter {
  const index = new TreeIndex(doc);
  const home = doc.meta.homePersonId ?? doc.people[0]?.id;
  const partner = home ? index.partners(home).at(-1)?.id : undefined;
  return new Layouter(index, LAYOUT, home, partner);
}

/** What is wrong with a layout: cards over each other, lines that are not straight runs, lines through cards, lines crossing lines. */
function faults(l: LayoutResult): string[] {
  const out: string[] = [];
  const boxes = [...l.cards.map((c) => ({ ...c, name: c.key })), ...l.placeholders.map((h) => ({ ...h, name: `? ${h.familyId}` }))];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) out.push(`${a.name} over ${b.name}`);
    }
  }
  const runs: { key: string; family: string; a: Pt; b: Pt }[] = [];
  const add = (key: string, family: string, points: Pt[]) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) out.push(`${key} is not straight`);
      runs.push({ key, family, a, b });
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      for (const c of boxes) if (x0 < c.x + c.w - 1 && x1 > c.x + 1 && y0 < c.y + c.h - 1 && y1 > c.y + 1) out.push(`${key} through ${c.name}`);
    }
  };
  for (const line of l.lines) add(line.key, line.familyId, line.points);
  for (const u of l.unions) add(`couple ${u.familyId}`, u.familyId, u.line);
  // Lines of different families never cross: an upright run of one through a level run of another.
  for (const v of runs) {
    if (Math.abs(v.a.x - v.b.x) > 0.01) continue;
    for (const h of runs) {
      if (h.family === v.family || Math.abs(h.a.y - h.b.y) > 0.01) continue;
      const x = v.a.x;
      const y = h.a.y;
      if (x > Math.min(h.a.x, h.b.x) + 1 && x < Math.max(h.a.x, h.b.x) - 1 && y > Math.min(v.a.y, v.b.y) + 1 && y < Math.max(v.a.y, v.b.y) - 1)
        out.push(`${v.key} crosses ${h.key}`);
    }
  }
  return [...new Set(out)];
}

const TREES: Record<string, () => TreeDocument> = {
  sample: () => sampleDocument(),
  nuclear: nuclearFamily,
  spouses: threeSpouses,
  cross: crossGeneration,
  cousins: cousinMarriage,
  disconnected,
  adoption: adoptionBothFamilies,
  wide: () => wideFamily(7),
  pedigree: () => pedigree(5),
  random1: () => randomFamily(1, 40),
  random2: () => randomFamily(2, 70),
  random3: () => randomFamily(3, 110),
  random4: () => randomFamily(11, 130),
};

const SHAPES: Shape[] = [];
for (const flank of ['wing', 'band'] as const) {
  for (const stack of [false, true]) {
    for (const n of [1, 2, 4, Infinity])
      for (const m of [1, 3, Infinity])
        SHAPES.push({ down: n * UNIT, bands: [m * UNIT], wingL: n * UNIT, wingR: m * UNIT, flankL: flank, flankR: flank, stack });
  }
}

describe('the layout', () => {
  for (const [name, make] of Object.entries(TREES)) {
    it(`gives everyone in "${name}" one card, with nothing over anything else and no lines crossing, however it is shaped`, () => {
      const doc = make();
      const lay = layouter(doc);
      for (const shape of SHAPES) {
        const l = lay.run(shape);
        const own = l.cards.filter((c) => !c.ghost).map((c) => c.personId);
        expect(own.length).toBe(doc.people.length);
        expect(new Set(own).size).toBe(doc.people.length);
        expect(new Set(l.cards.map((c) => c.key)).size).toBe(l.cards.length);
        expect(faults(l)).toEqual([]);
      }
    });
  }

  it('runs from top to bottom: parents stand above their children', () => {
    const doc = sampleDocument();
    const index = new TreeIndex(doc);
    for (const shape of SHAPES) {
      const l = layouter(doc).run(shape);
      const y = new Map(l.cards.filter((c) => !c.ghost).map((c) => [c.personId, c.y]));
      for (const f of doc.families) {
        for (const c of f.children) for (const p of f.partners) expect(y.get(p)!).toBeLessThan(y.get(c.personId)!);
      }
      expect(index.person('I11')).toBeDefined();
    }
  });

  it('draws a line from every family to every child, ending at the child’s card', () => {
    const doc = sampleDocument();
    const l = layouter(doc).run({ ...WIDE, down: 2 * UNIT, bands: [2 * UNIT] });
    const cards = new Map(l.cards.filter((c) => !c.ghost).map((c) => [c.personId, c]));
    for (const f of doc.families) {
      for (const child of f.children) {
        const line = l.lines.find((x) => x.familyId === f.id && x.childId === child.personId)!;
        expect(line).toBeDefined();
        expect(line.relation).toBe(child.relation);
        const end = line.points[line.points.length - 1];
        const c = cards.get(child.personId)!;
        // At the top of the card, or at the middle of one of its sides.
        const onTop = Math.abs(end.y - c.y) < 0.01 && end.x > c.x && end.x < c.x + c.w;
        const onSide = Math.abs(end.y - (c.y + c.h / 2)) < 0.01 && (Math.abs(end.x - c.x) < 0.01 || Math.abs(end.x - (c.x + c.w)) < 0.01);
        expect(onTop || onSide).toBe(true);
      }
    }
  });

  it('marks the direct line of the couple it is drawn around', () => {
    const doc = sampleDocument();
    const index = new TreeIndex(doc);
    const l = new Layouter(index, LAYOUT, 'I11', 'I15').run(WIDE);
    const ancestors = new Set([...index.ancestors('I11'), ...index.ancestors('I15'), 'I11', 'I15']);
    const trunk = l.lines.filter((x) => x.trunk);
    expect(trunk.length).toBeGreaterThan(0);
    for (const line of trunk) expect(ancestors.has(line.childId)).toBe(true);
    for (const line of l.lines.filter((x) => !x.trunk)) expect(line.childId === 'I11' || line.childId === 'I15').toBe(false);
  });

  it('stacks children with no other connection in a column when a row would be too wide', () => {
    const doc = wideFamily(7);
    const lay = layouter(doc);
    const wide = lay.run(WIDE);
    const narrow = lay.run({ ...WIDE, down: 2 * UNIT });
    expect(narrow.bounds.w).toBeLessThan(wide.bounds.w / 2);
    expect(narrow.bounds.h).toBeGreaterThan(wide.bounds.h);
    expect(faults(narrow)).toEqual([]);
  });

  it('stacks a child whose only connection is a partner as a pair, the partner’s card under theirs', () => {
    const b = new DocBuilder();
    b.person('F', 'Father', 'Lee', 'male');
    b.person('M', 'Mother', 'Lee', 'female');
    for (const id of ['A', 'B', 'C']) b.person(id, id, 'Lee', 'female');
    b.person('S', 'Spouse', 'Kay', 'male');
    b.family('F1', ['F', 'M'], ['A', 'B', 'C']);
    b.family('F2', ['B', 'S'], []);
    const doc = b.build();
    doc.meta.homePersonId = 'F';
    const l = new Layouter(new TreeIndex(doc), LAYOUT, 'F', 'M').run({ ...WIDE, down: UNIT });
    const card = (id: string) => l.cards.find((c) => c.personId === id)!;
    // One column: the children under each other, and B's partner right under B.
    expect(card('A').x).toBe(card('B').x);
    expect(card('C').x).toBe(card('B').x);
    expect(card('S').x).toBe(card('B').x);
    expect(card('S').y).toBe(card('B').y + LAYOUT.cardHeight + LAYOUT.stackGap);
    expect(card('C').y).toBeGreaterThan(card('S').y + LAYOUT.cardHeight);
    expect(l.unions.find((u) => u.familyId === 'F2')).toBeDefined();
    expect(faults(l)).toEqual([]);
  });

  it('keeps children with families of their own side by side while the others are stacked', () => {
    const b = new DocBuilder();
    b.person('F', 'Father', 'Lee', 'male');
    b.person('M', 'Mother', 'Lee', 'female');
    for (const id of ['A', 'B', 'C', 'D', 'E']) b.person(id, id, 'Lee', 'male');
    b.person('W', 'Wife', 'Kay', 'female');
    b.person('K', 'Kid', 'Lee', 'male');
    b.family('F1', ['F', 'M'], ['A', 'B', 'C', 'D', 'E']);
    b.family('F2', ['A', 'W'], ['K']);
    const doc = b.build();
    const l = new Layouter(new TreeIndex(doc), LAYOUT, 'F', 'M').run({ ...WIDE, down: 4.5 * UNIT });
    const card = (id: string) => l.cards.find((c) => c.personId === id)!;
    // A, who has a family, heads it under the parents; the four without stand in two columns beside it.
    expect(card('K').y).toBeGreaterThan(card('A').y);
    const stack = ['B', 'C', 'D', 'E'].map(card);
    expect(new Set(stack.map((c) => c.x)).size).toBe(2);
    expect(new Set(stack.map((c) => c.y)).size).toBe(2);
    expect(faults(l)).toEqual([]);
  });

  it('gives someone who belongs in two places one card and a stand-in', () => {
    const doc = cousinMarriage();
    const l = layouter(doc).run(WIDE);
    const ghosts = l.cards.filter((c) => c.ghost);
    expect(ghosts.length).toBeGreaterThan(0);
    for (const g of ghosts) expect(l.cards.filter((c) => c.personId === g.personId && !c.ghost)).toHaveLength(1);
  });

  it('lays separate trees out side by side, apart from the first', () => {
    const doc = disconnected();
    const l = layouter(doc).run(WIDE);
    expect(l.cards.filter((c) => !c.ghost)).toHaveLength(doc.people.length);
    expect(faults(l)).toEqual([]);
  });

  it('counts the generations', () => {
    expect(layouter(sampleDocument()).run(WIDE).generations).toBe(5);
    expect(layouter(pedigree(4)).run(WIDE).generations).toBe(4);
  });
});

describe('couples and partners in a column', () => {
  /** Mark in the middle; his brother Ulric married twice (three times with `third`), his sister Ann once, without children. */
  function uncles(third = false): TreeDocument {
    const b = new DocBuilder();
    b.person('GF', 'George', 'Hale', 'male');
    b.person('GM', 'Grace', 'Hale', 'female');
    b.person('ME', 'Mark', 'Hale', 'male');
    b.person('MW', 'Mary', 'Hale', 'female');
    b.person('U', 'Ulric', 'Hale', 'male');
    b.person('W1', 'Wanda', 'Hale', 'female');
    b.person('W2', 'Wilma', 'Hale', 'female');
    b.person('W3', 'Wendy', 'Hale', 'female');
    b.person('K1', 'Kit', 'Hale', 'male');
    b.person('K2', 'Kay', 'Hale', 'female');
    b.person('A', 'Ann', 'Hale', 'female');
    b.person('AH', 'Abe', 'Low', 'male');
    b.person('B', 'Bea', 'Hale', 'female');
    b.family('F1', ['GF', 'GM'], ['A', 'U', 'ME', 'B']);
    b.family('F2', ['U', 'W1'], ['K1']);
    b.family('F3', ['U', 'W2'], ['K2']);
    if (third) b.family('F6', ['U', 'W3'], []);
    b.family('F4', ['A', 'AH'], []);
    b.family('F5', ['ME', 'MW'], []);
    const doc = b.build('Uncles');
    doc.meta.homePersonId = 'ME';
    return doc;
  }
  // Narrow enough for Mark's brothers and sisters to hang in columns at the side of the line down to him.
  const NARROW: Shape = { ...WIDE, bands: [300], wingL: 300, wingR: 300 };
  const run = (doc: TreeDocument, options = LAYOUT) => new Layouter(new TreeIndex(doc), options, 'ME', 'MW').run(NARROW);
  const at = (l: LayoutResult, id: string) => l.cards.find((c) => c.personId === id && !c.ghost)!;

  it('stands someone who married more than once between their partners, the line to them led over the one in its way', () => {
    for (const third of [false, true]) {
      const l = run(uncles(third));
      expect(faults(l)).toEqual([]);
      const u = at(l, 'U');
      const wives = ['W1', 'W2', ...(third ? ['W3'] : [])].map((id) => at(l, id));
      for (const w of wives) expect(w.y).toBe(u.y);
      // A wife on either side of him (of three, the latest on one side and the two before her on the other).
      expect(Math.min(...wives.map((w) => w.x))).toBeLessThan(u.x);
      expect(Math.max(...wives.map((w) => w.x))).toBeGreaterThan(u.x);
      // The line from his parents comes across above the row and down onto the top of his card.
      const line = l.lines.find((x) => x.childId === 'U')!.points;
      const end = line.at(-1)!;
      expect(end.y).toBeCloseTo(u.y, 5);
      expect(end.x).toBeCloseTo(u.x + u.w / 2, 5);
      expect(line.at(-2)!.y).toBeLessThan(u.y);
      // With two wives each couple has its marker between its two cards; no line between partners goes over a card.
      if (!third) expect(l.unions.filter((x) => ['F2', 'F3'].includes(x.familyId)).every((x) => x.line.length === 2)).toBe(true);
    }
  });

  it('keeps the partners all on the far side of the line when asked, the line to the further one over the nearer', () => {
    const l = run(uncles(), { ...LAYOUT, amidPartners: false });
    expect(faults(l)).toEqual([]);
    const [u, w1, w2] = [at(l, 'U'), at(l, 'W1'), at(l, 'W2')];
    // Both wives on one side of him, and the line reaches him at the side of his card.
    expect(Math.sign(w1.x - u.x)).toBe(Math.sign(w2.x - u.x));
    const end = l.lines.find((x) => x.childId === 'U')!.points.at(-1)!;
    expect(end.y).toBeCloseTo(u.y + u.h / 2, 5);
    expect(l.unions.some((x) => x.line.length === 4)).toBe(true);
  });

  it('stands a couple with nobody under them one over the other in a column, or side by side when couples are not stacked', () => {
    const stacked = run(uncles());
    expect(at(stacked, 'AH').x).toBeCloseTo(at(stacked, 'A').x, 5);
    expect(at(stacked, 'AH').y).toBeGreaterThan(at(stacked, 'A').y);
    const beside = run(uncles(), { ...LAYOUT, stackCouples: false });
    expect(faults(beside)).toEqual([]);
    expect(at(beside, 'AH').y).toBeCloseTo(at(beside, 'A').y, 5);
    expect(Math.abs(at(beside, 'AH').x - at(beside, 'A').x)).toBeCloseTo(LAYOUT.cardWidth + LAYOUT.partnerGap, 5);
    // And then never the oldest couple of a line either, whatever the shape asks.
    const lay = new Layouter(new TreeIndex(pedigree(4)), { ...LAYOUT, stackCouples: false });
    expect(lay.run({ ...WIDE, stack: true }).cards).toEqual(lay.run(WIDE).cards);
    expect(fitLayout(lay, { ...LAYOUT, stackCouples: false }, { w: 900, h: 1200, centred: 0 }).shape.stack).toBe(false);
  });
});

describe('cards of more than one width', () => {
  const wide = (doc: TreeDocument, widths: Record<string, number>, more: Partial<typeof LAYOUT> = {}) => {
    const index = new TreeIndex(doc);
    const home = doc.meta.homePersonId ?? doc.people[0]?.id;
    return new Layouter(index, { ...LAYOUT, ...more, widths }, home, home ? index.partners(home).at(-1)?.id : undefined);
  };

  it('gives a card the width asked for it and everyone else the usual, all of one height, nothing over anything', () => {
    const doc = sampleDocument();
    const widths = { I11: 260, I15: 240, I1: 282, I20: 216 };
    for (const shape of [WIDE, { ...WIDE, down: UNIT * 2, bands: [UNIT * 2], wingL: UNIT, wingR: UNIT }]) {
      const l = wide(doc, widths).run(shape);
      expect(faults(l)).toEqual([]);
      for (const c of l.cards) {
        expect(c.w).toBe(widths[c.personId as keyof typeof widths] ?? LAYOUT.cardWidth);
        expect(c.h).toBe(LAYOUT.cardHeight);
      }
    }
  });

  it('keeps the marker of a couple in the gap between their cards, and a child’s line on the middle of the child’s card', () => {
    const doc = nuclearFamily();
    const l = wide(doc, { I1: 250, I3: 230 }).run(WIDE);
    const card = (id: string) => l.cards.find((c) => c.personId === id)!;
    const [left, right] = [card('I1'), card('I2')].sort((a, b) => a.x - b.x);
    // The usual gap between the two, however wide either is; the marker half way across it.
    expect(right.x - (left.x + left.w)).toBeCloseTo(LAYOUT.partnerGap);
    expect(l.unions[0].x).toBeCloseTo(left.x + left.w + LAYOUT.partnerGap / 2);
    for (const line of l.lines) {
      const child = card(line.childId);
      const end = line.points[line.points.length - 1];
      expect(end.x).toBeCloseTo(child.x + child.w / 2);
      expect(end.y).toBeCloseTo(child.y);
    }
  });

  it('makes the two cards of a couple stood one over the other as wide as the wider of them', () => {
    const b = new DocBuilder();
    b.person('F', 'Father', 'Reed', 'male');
    b.person('M', 'Mother', 'Reed', 'female');
    for (const k of ['A', 'B', 'C']) b.person(k, `Child ${k}`, 'Reed', 'male');
    b.person('W', 'Wife with a very long name', 'Reed', 'female');
    b.family('F1', ['F', 'M'], ['A', 'B', 'C']);
    b.family('F2', ['B', 'W']);
    const doc = b.build();
    // The children in a column at the side of their line: the couple among them one over the other.
    const l = wide(doc, { W: 270 }, { stackCouples: true }).run({ ...WIDE, down: UNIT });
    expect(faults(l)).toEqual([]);
    const card = (id: string) => l.cards.find((c) => c.personId === id)!;
    if (Math.abs(card('B').x - card('W').x) < 1 && card('B').y !== card('W').y) {
      expect(card('B').w).toBe(270);
      expect(card('W').w).toBe(270);
    } else {
      // Side by side: each its own width.
      expect(card('B').w).toBe(LAYOUT.cardWidth);
      expect(card('W').w).toBe(270);
    }
    expect(card('A').w).toBe(LAYOUT.cardWidth);
  });
});

describe('fitting the layout to a page', () => {
  it('fits a piece at a time to the same page as all at once, also after a fitting that was dropped half way', () => {
    const doc = randomFamily(5, 70);
    const room = { w: 1400, h: 900, centred: 0, blocks: [{ x: 500, y: 0, w: 400, h: 60 }] };
    const whole = fitLayout(layouter(doc), LAYOUT, room);
    const stepped = layouter(doc);
    // Started and left: nothing of it stays behind to change what comes after.
    const dropped = fitLayoutSteps(stepped, LAYOUT, room);
    let steps = 0;
    for (let i = 0; i < 40 && !dropped.next().done; i++) steps++;
    expect(steps).toBe(40);
    const again = finish(fitLayoutSteps(stepped, LAYOUT, room));
    expect(shapeKey(again.shape)).toBe(shapeKey(whole.shape));
    expect(again.scale).toBeCloseTo(whole.scale, 6);
  });

  it('makes the cards bigger than the tree as wide as it comes, on a page of either format', () => {
    for (const make of [() => sampleDocument(), () => randomFamily(7, 60), () => pedigree(5), () => wideFamily(7)]) {
      const lay = layouter(make());
      for (const room of [
        { w: 1500, h: 950, centred: 1 },
        { w: 1000, h: 1300, centred: 1 },
      ]) {
        const best = fitLayout(lay, LAYOUT, room);
        const plain = place(lay.run(WIDE), room);
        expect(best.scale).toBeGreaterThanOrEqual(plain.scale);
        // Inside the room.
        const b = best.layout.bounds;
        expect(best.x + b.x * best.scale).toBeGreaterThanOrEqual(-0.5);
        expect(best.y + b.y * best.scale).toBeGreaterThanOrEqual(-0.5);
        expect(best.x + (b.x + b.w) * best.scale).toBeLessThanOrEqual(room.w + 0.5);
        expect(best.y + (b.y + b.h) * best.scale).toBeLessThanOrEqual(room.h + 0.5);
        expect(faults(best.layout)).toEqual([]);
      }
    }
  });

  it('shapes a wide family to a tall page', () => {
    const lay = layouter(wideFamily(7));
    const tall = fitLayout(lay, LAYOUT, { w: 900, h: 1300, centred: 0 });
    const wide = place(lay.run(WIDE), { w: 900, h: 1300, centred: 0 });
    expect(tall.scale).toBeGreaterThan(wide.scale * 1.5);
  });

  it('halves a deep pedigree by standing the oldest couples one over the other', () => {
    const lay = layouter(pedigree(5));
    const best = fitLayout(lay, LAYOUT, { w: 1500, h: 950, centred: 0 });
    expect(best.shape.stack).toBe(true);
    expect(best.layout.bounds.w).toBeLessThan(lay.run(WIDE).bounds.w * 0.7);
  });

  it('arranges single families wider or narrower than the rest, where that fills the page better', () => {
    const lay = layouter(randomFamily(4, 120));
    const room = { w: 1500, h: 950, centred: 0 };
    const quick = fitLayout(lay, LAYOUT, room, 'quick');
    const full = fitLayout(lay, LAYOUT, room, 'full');
    expect(full.scale).toBeGreaterThanOrEqual(quick.scale * 0.98);
    expect(full.cover).toBeGreaterThan(0);
    expect(full.cover).toBeLessThanOrEqual(1);
    expect(faults(full.layout)).toEqual([]);
    // A choice for one family alone changes that family and leaves the rest of the shape as it is.
    const some = lay.choices[0];
    expect(some).toBeDefined();
    const forced = lay.run({ ...WIDE, plans: new Map([[some.familyId, 1]]) });
    expect(forced).not.toBe(lay.run(WIDE));
    expect(faults(forced)).toEqual([]);
    // By name, as someone picks it by hand; the fitting leaves such a family alone.
    const column = lay.run({ ...WIDE, plans: new Map([[some.familyId, 'column' as const]]) });
    const row = lay.run({ ...WIDE, plans: new Map([[some.familyId, 'row' as const]]) });
    expect(column.bounds.w).toBeLessThan(row.bounds.w);
    expect(faults(column)).toEqual([]);
    const kept = fitLayout(lay, LAYOUT, room, 'full', { plans: new Map([[some.familyId, 'row' as const]]) });
    expect(kept.shape.plans?.get(some.familyId)).toBe('row');
    // Asking for an arrangement a family does not have is the same as its last.
    expect(lay.beyond(lay.run({ ...WIDE, plans: new Map([[some.familyId, 99]]) }))).toBe(true);
    expect(lay.beyond(forced)).toBe(false);
  });

  it('searches much longer when asked, for a page with less of it empty: never smaller cards, and the same page again', () => {
    const room = { w: 1500, h: 950, centred: 0, blocks: [{ x: 400, y: 0, w: 700, h: 110 }] };
    const doc = randomFamily(4, 120);
    const lay = layouter(doc);
    const usual = fitLayout(lay, LAYOUT, room, 'full');
    const longer = fitLayout(lay, LAYOUT, room, 'full', { fill: true });
    // On this tree it finds a page the usual search does not.
    expect(longer.scale).toBeGreaterThan(usual.scale * 1.03);
    expect(faults(longer.layout)).toEqual([]);
    expect(longer.layout.cards.length).toBe(usual.layout.cards.length);
    // Asked again (the page is drawn again for every setting changed), the answer is the one found before, at once.
    const again = fitLayout(layouter(doc), LAYOUT, room, 'full', { fill: true });
    expect(shapeKey(again.shape)).toBe(shapeKey(longer.shape));
    expect(again.scale).toBeCloseTo(longer.scale, 9);
    // A small tree, where there is little to find: no smaller.
    const small = layouter(sampleDocument());
    expect(fitLayout(small, LAYOUT, room, 'full', { fill: true }).scale).toBeGreaterThanOrEqual(fitLayout(small, LAYOUT, room, 'full').scale * 0.9999);
  }, 60_000);

  it('never makes the tree bigger than asked', () => {
    const lay = layouter(nuclearFamily());
    expect(fitLayout(lay, LAYOUT, { w: 5000, h: 5000, centred: 0, maxScale: 2 }).scale).toBe(2);
  });
});

describe('drawing the lines', () => {
  it('draws every stretch once: what brothers and sisters share belongs to the first of them', () => {
    const l = layouter(sampleDocument()).run(WIDE);
    const paths = sharedPaths(l.lines);
    expect(paths).toHaveLength(l.lines.length);
    // The length of all lines drawn in full, and of what is left of them.
    const runs = (d: string) => [...d.matchAll(/[ML]/g)].length;
    const full = l.lines.reduce((sum, line) => sum + runs(roundedPath(line.points, 7)), 0);
    const once = paths.reduce((sum, d) => sum + runs(d), 0);
    expect(once).toBeLessThan(full);
    // The first child of a family keeps its whole line; a later one loses the way down from the parents.
    const family = l.lines.find((a) => l.lines.some((b) => b !== a && b.familyId === a.familyId))!.familyId;
    const [first, second] = l.lines.filter((x) => x.familyId === family);
    const [a, b] = sharedPaths([first, second]);
    expect(a).toBe(roundedPath(first.points, 7));
    // Both leave the parents at one point; only the first is drawn from there.
    const start = a.slice(0, a.search(/[LQ]/));
    expect(roundedPath(second.points, 7).startsWith(start)).toBe(true);
    expect(b.startsWith(start)).toBe(false);
    expect(b).not.toBe('');
  });

  it('bends a branch off the stretch it shares, whichever side it leaves on', () => {
    // From the parents down, then one child to the left and one to the right.
    const line = (childId: string, points: Pt[]) => ({ key: childId, familyId: 'F', childId, relation: 'biological' as const, trunk: false, points });
    const left = line('a', [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: -100, y: 40 },
      { x: -100, y: 80 },
    ]);
    const right = line('b', [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
    ]);
    const [a, b] = sharedPaths([left, right], 7);
    expect(a).toBe(roundedPath(left.points, 7));
    // The second is not drawn again from the parents, but starts a little way back up the line the two share:
    // its turn to the right is rounded like the first one's to the left, and not a line that butts onto the other.
    const start = /^M\s*(-?[\d.]+)[ ,](-?[\d.]+)/.exec(b)!;
    expect(Number(start[1])).toBe(0);
    expect(Number(start[2])).toBeGreaterThan(0);
    expect(Number(start[2])).toBeLessThan(40);
    const turns = (d: string) => [...d.matchAll(/[QCA]/g)].length;
    expect(turns(b)).toBe(turns(a));
    // A branch that leaves the shared stretch straight on has nothing to bend round. It starts a little before
    // the place where the other turned off: that one's bend leaves the corner out, and the two would not meet.
    const on = line('c', [
      { x: 0, y: 0 },
      { x: 0, y: 120 },
    ]);
    const [, straight] = sharedPaths([left, on], 7);
    expect(turns(straight)).toBe(0);
    const from = /^M\s*(-?[\d.]+)[ ,](-?[\d.]+)/.exec(straight)!;
    expect(Number(from[1])).toBe(0);
    expect(Number(from[2])).toBeCloseTo(40 - 7, 5);
    // As down a line with children at its side: the second child's line runs on past the first one's turn.
    const first = line('d', [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 16, y: 50 },
    ]);
    const second = line('e', [
      { x: 0, y: 0 },
      { x: 0, y: 130 },
      { x: 16, y: 130 },
    ]);
    const [, lower] = sharedPaths([first, second], 7);
    expect(Number(/^M\s*-?[\d.]+[ ,](-?[\d.]+)/.exec(lower)![1])).toBeCloseTo(43, 5);
  });
});
