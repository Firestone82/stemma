import { Painted, familyBackgrounds, familyPatches, paintBackgrounds, squareOff } from './family-patches';

const card = (x: number, y: number) => ({ x, y, w: 188, h: 66 });

describe('familyPatches', () => {
  it('makes one box of the cards that stand next to each other in a row', () => {
    const boxes = familyPatches([card(0, 0), card(218, 0), card(436, 0)], 10);
    expect(boxes).toEqual([{ x: -10, y: -10, w: 436 + 188 + 20, h: 86 }]);
  });

  it('keeps cards far apart in a row, or at other heights, in boxes of their own', () => {
    expect(familyPatches([card(0, 0), card(600, 0)], 10)).toHaveLength(2);
    // One over the other but far apart: no bridge.
    expect(familyPatches([card(0, 0), card(0, 400)], 10)).toHaveLength(2);
  });

  it('joins rows one over the other by a bridge over what they have in common across', () => {
    // Parents in a row, two children under them, a little to the right.
    const boxes = familyPatches([card(0, 0), card(218, 0), card(100, 98), card(312, 98)], 10);
    expect(boxes).toHaveLength(3);
    const bridge = boxes[2];
    expect(bridge).toEqual({ x: 90, y: 66, w: 406 - 100 + 20, h: 32 });
  });

  it('joins a column of cards, and bridges only to the nearest row under a row', () => {
    const boxes = familyPatches([card(0, 0), card(0, 76), card(0, 152)], 8);
    // Three rows, two bridges: the top one is not bridged to the bottom one past the middle one.
    expect(boxes).toHaveLength(5);
    expect(boxes.slice(3).map((b) => [b.y, b.h])).toEqual([
      [66, 10],
      [142, 10],
    ]);
  });
});

describe('familyBackgrounds', () => {
  it('puts a card in each family it is in, and stripes where two families meet, half each', () => {
    // A woman of the Mikula family married into the Bosák family, beside her husband, and their child under them.
    const cards = [card(0, 0), card(218, 0), card(100, 98)];
    const families = [['mikula', 'bosak'], ['bosak', 'mikula'], ['bosak']];
    const [mikula, bosak] = familyBackgrounds(cards, families, 10);
    expect(mikula.tincture).toBe('mikula');
    expect(mikula.boxes).toHaveLength(1);
    expect(bosak.boxes.length).toBeGreaterThan(1);
    // Each gives up the other half of the stripes where the other's boxes reach.
    expect(new Set(mikula.cuts.map((c) => c.stripe))).toEqual(new Set(['a']));
    expect(new Set(bosak.cuts.map((c) => c.stripe))).toEqual(new Set(['b']));
    expect(mikula.cuts.map((c) => c.box)).toContainEqual(bosak.boxes[0]);
  });

  it('leaves a family alone where the background of no other family reaches', () => {
    const [only] = familyBackgrounds([card(0, 0), card(218, 0)], [['a'], ['a']], 10);
    expect(only.cuts).toEqual([]);
    expect(familyBackgrounds([card(0, 0)], [[]], 10)).toEqual([]);
  });
});

describe('filling a family out to its bounding box', () => {
  it('fills a unit of parents and their own children, and no more: a grandchild makes a unit of its own', () => {
    // Grandparents, a son under them, and his son under him.
    const cards = [card(0, 0), card(218, 0), card(400, 98), card(500, 196)];
    const families = [['a'], ['a'], ['a'], ['a']];
    const [a] = familyBackgrounds(cards, families, 10, [
      [2, 0],
      [3, 2],
    ]);
    expect(a.fills.map((f) => f.box)).toEqual([
      { x: -10, y: -10, w: 588 + 20, h: 98 + 66 + 20 },
      { x: 390, y: 88, w: 100 + 188 + 20, h: 98 + 66 + 20 },
    ]);
  });

  it('does not fill a unit whose children stand far apart from it', () => {
    const cards = [card(0, 0), card(218, 0), card(2400, 98), card(0, 1200)];
    const [a] = familyBackgrounds(cards, [['a'], ['a'], ['a'], ['a']], 10, [
      [2, 0],
      [3, 0],
    ]);
    expect(a.fills).toEqual([]);
  });

  it('leaves the boxes of other families inside the bounding box to them', () => {
    // Parents over two children, one far right; another family's card under the parents, between the children.
    const cards = [card(0, 0), card(218, 0), card(0, 98), card(436, 98), card(218, 98)];
    const families = [['a'], ['a'], ['a'], ['a'], ['b']];
    // Not joined by a line, nothing is filled; the children joined to their parents, one unit with them.
    expect(familyBackgrounds(cards, families, 10)[0].fills).toEqual([]);
    const [a, b] = familyBackgrounds(cards, families, 10, [
      [2, 0],
      [3, 0],
    ]);
    expect(a.fills).toHaveLength(1);
    expect(a.fills[0].box).toEqual({ x: -10, y: -10, w: 436 + 188 + 20, h: 98 + 66 + 20 });
    expect(a.fills[0].others).toEqual(b.boxes);
  });
});

describe('filled boxes of two families that meet', () => {
  it('leaves the smaller its colour: the bigger gives way there, and nothing is filled twice', () => {
    // Family a: parents over two children far apart (a wide unit). Family b: a couple over a child, inside it.
    // Family b's couple stands between family a's two children, and their child under them.
    const cards = [card(0, 0), card(218, 0), card(0, 98), card(700, 98), card(218, 98), card(436, 98), card(330, 196)];
    const families = [['a'], ['a'], ['a'], ['a'], ['b'], ['b'], ['b']];
    const [a, b] = familyBackgrounds(cards, families, 10, [
      [2, 0],
      [3, 0],
      [6, 4],
    ]);
    const meet = (x: { x: number; y: number; w: number; h: number }, y: typeof x) => x.x < y.x + y.w && y.x < x.x + x.w && x.y < y.y + y.h && y.y < x.y + x.h;
    expect(a.fills).toHaveLength(1);
    expect(b.fills).toHaveLength(1);
    const [fa, fb] = [a.fills[0], b.fills[0]];
    expect(meet(fa.box, fb.box)).toBe(true);
    expect(fb.box.w * fb.box.h).toBeLessThan(fa.box.w * fa.box.h);
    // The bigger gives way to the smaller's filled box; the smaller gives way only to the other's own boxes.
    expect(fa.others).toContainEqual(fb.box);
    expect(fb.others).not.toContainEqual(fa.box);
  });
});

describe('paintBackgrounds', () => {
  it('draws the background of every family once, in rectangles that never overlap, striped where two families share it', () => {
    // A married-in wife (families a and b) beside her husband (a), their child under them (a), her brother (b) beside her.
    const cards = [card(0, 0), card(218, 0), card(100, 98), card(436, 0)];
    const families = [['a'], ['a', 'b'], ['a'], ['b']];
    const patches = familyBackgrounds(cards, families, 10, [[2, 0]]);
    const painted = paintBackgrounds(patches);
    const meet = (a: Painted['box'], b: Painted['box']) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
    for (let i = 0; i < painted.length; i++) for (let j = i + 1; j < painted.length; j++) expect(meet(painted[i].box, painted[j].box)).toBe(false);
    // Every card stands on its background; the wife's card on stripes of both families.
    const at = (x: number, y: number) => painted.filter((p) => x > p.box.x && x < p.box.x + p.box.w && y > p.box.y && y < p.box.y + p.box.h);
    for (const c of cards) expect(at(c.x + c.w / 2, c.y + c.h / 2)).toHaveLength(1);
    expect(at(218 + 94, 33)[0]).toMatchObject({ tincture: 'a', with: 'b' });
    expect(at(94, 33)[0]).toMatchObject({ tincture: 'a' });
    expect(at(94, 33)[0].with).toBeUndefined();
  });
});

describe('squareOff', () => {
  const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const at = (painted: readonly Painted[], x: number, y: number) =>
    painted.filter((p) => x > p.box.x && x < p.box.x + p.box.w && y > p.box.y && y < p.box.y + p.box.h).map((p) => p.tincture);
  const meet = (a: Painted['box'], b: Painted['box']) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
  // An L: a wide row, and a narrower one under it, leaving a bite out of the bottom right corner.
  const ell: Painted[] = [
    { tincture: 'a', box: box(0, 0, 400, 100) },
    { tincture: 'a', box: box(0, 100, 250, 100) },
  ];

  it('fills a small empty bite out of a corner, so the family stands in a rectangle', () => {
    const out = squareOff(ell, [], 200, 20);
    expect(at(out, 320, 150)).toEqual(['a']);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(meet(out[i].box, out[j].box)).toBe(false);
  });

  it('leaves a bite that is too big', () => {
    expect(at(squareOff(ell, [], 120, 20), 320, 150)).toEqual([]);
  });

  it('leaves a bite with a card or another family’s line in it, and fills over the family’s own line', () => {
    expect(at(squareOff(ell, [{ box: box(300, 120, 60, 40), tinctures: [] }], 200, 20), 320, 150)).toEqual([]);
    expect(at(squareOff(ell, [{ box: box(330, 99, 2, 60), tinctures: ['b'] }], 200, 20), 320, 150)).toEqual([]);
    expect(at(squareOff(ell, [{ box: box(330, 99, 2, 60), tinctures: ['a'] }], 200, 20), 320, 150)).toEqual(['a']);
  });

  it('keeps the room between two families: a gap next to another family is not filled', () => {
    const out = squareOff([...ell, { tincture: 'b', box: box(250, 210, 150, 60) }, { tincture: 'b', box: box(400, 100, 50, 170) }], [], 200, 20);
    expect(at(out, 320, 150)).toEqual([]);
  });

  it('fills a narrow channel between two parts of a family', () => {
    const u: Painted[] = [
      { tincture: 'a', box: box(0, 0, 500, 100) },
      { tincture: 'a', box: box(0, 100, 200, 100) },
      { tincture: 'a', box: box(300, 100, 200, 100) },
    ];
    expect(at(squareOff(u, [], 150, 20), 250, 150)).toEqual(['a']);
  });
});
