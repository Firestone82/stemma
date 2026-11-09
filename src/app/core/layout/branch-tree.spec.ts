import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { DocBuilder } from '../testing/fixtures';
import { branchTree } from './branch-tree';
import { computeLayout } from './layout';
import { LayoutCard } from './layout-types';

/** Every x,y pair in path data. */
function points(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const m of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) out.push({ x: Number(m[1]), y: Number(m[2]) });
  return out;
}

const inside = (p: { x: number; y: number }, c: LayoutCard, pad = 0) =>
  p.x >= c.x - pad && p.x <= c.x + c.w + pad && p.y >= c.y - pad && p.y <= c.y + c.h + pad;

describe('tree behind the chart', () => {
  const doc = sampleDocument();
  const layout = computeLayout(doc);
  const index = new TreeIndex(doc);
  const card = (id: string) => layout.cards.find((c) => c.personId === id)!;

  it('grows from the couple: a branch to every relative, leaves above, roots down to their descendants', () => {
    const shape = branchTree(layout, index, ['I11', 'I15'])!;
    expect(shape.wood.every((d) => d.startsWith('M') && d.endsWith('Z'))).toBe(true);
    const wood = [...shape.wood, ...shape.twigs].flatMap(points);

    // Wood reaches the card of everyone joined to the family by birth: parents, grandparents, uncles, cousins, in-laws' parents.
    for (const id of ['I6', 'I9', 'I1', 'I2', 'I4', 'I5', 'I8', 'I7', 'I10', 'I12', 'I13', 'I16', 'I17', 'I19', 'I23', 'I24']) {
      expect(
        wood.some((p) => inside(p, card(id), 4)),
        id,
      ).toBe(true);
    }
    // A fork under every couple of ancestors, where the branch splits to father and mother.
    for (const familyId of ['F4', 'F1', 'F3', 'F7']) {
      const conn = layout.connectors.find((x) => x.familyId === familyId)!;
      expect(wood.some((p) => Math.abs(p.y - conn.barY) < 12 && Math.abs(p.x - conn.stem.x) < 12)).toBe(true);
    }
    // Roots reach behind the children and grandchildren.
    for (const id of ['I20', 'I21', 'I22', 'I27', 'I28', 'I29']) {
      expect(wood.some((p) => inside(p, card(id)))).toBe(true);
    }
    // Leaves up among the ancestors, over the oldest generation, and none down among the grandchildren (roots).
    const leaves = shape.foliage.leaves.flat().flatMap(points);
    const top = Math.min(...layout.cards.map((c) => c.y));
    expect(leaves.some((p) => p.y < top)).toBe(true);
    expect(leaves.every((p) => p.y < card('I27').y)).toBe(true);
    expect(shape.blooms[0].length + shape.blooms[1].length).toBeGreaterThan(5);
  });

  it('stays in the room it is given and comes out the same every time', () => {
    const b = layout.bounds;
    const room = { x: b.x - 40, y: b.y - 120, w: b.w + 80, h: b.h + 200 };
    const a = branchTree(layout, index, ['I11', 'I15'], { room })!;
    const again = branchTree(layout, index, ['I11', 'I15'], { room })!;
    expect(again.wood).toEqual(a.wood);
    expect(again.foliage.leaves).toEqual(a.foliage.leaves);
    // Twigs are kept inside the room; only the edges of their leaves may reach a little over.
    const margin = layout.cards[0].w * 0.2;
    for (const p of [...a.twigs, ...a.foliage.leaves.flat()].flatMap(points)) {
      expect(p.y).toBeGreaterThan(room.y - margin);
      expect(p.x).toBeGreaterThan(room.x - margin);
      expect(p.x).toBeLessThan(room.x + room.w + margin);
    }
  });

  it('can be drawn without leaves', () => {
    const bare = branchTree(layout, index, ['I11', 'I15'], { leaves: 0 })!;
    expect(bare.foliage.leaves.flat()).toEqual([]);
    expect(bare.blooms.flat()).toEqual([]);
    expect(bare.wood.length).toBeGreaterThan(10);
  });

  it('works for someone alone, with no relatives', () => {
    const b = new DocBuilder();
    b.person('A', 'Alone');
    const single = b.build();
    const shape = branchTree(computeLayout(single), new TreeIndex(single), ['A'])!;
    // A trunk with a flare of roots, and a few leafy twigs.
    expect(shape.wood.length).toBeGreaterThan(3);
    expect(shape.foliage.leaves.flat().length).toBeGreaterThan(5);
    expect(branchTree(computeLayout(single), new TreeIndex(single), ['missing'])).toBeNull();
  });
});
