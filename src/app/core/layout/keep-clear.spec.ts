import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { pedigree } from '../testing/fixtures';
import { Layouter, WIDE } from './engine';
import { Fitted, fitLayout, place } from './fit';
import { Box } from './keep-clear';
import { LAYOUT } from './types';

function layouter(doc = sampleDocument()): Layouter {
  const index = new TreeIndex(doc);
  const home = doc.meta.homePersonId ?? doc.people[0].id;
  return new Layouter(index, LAYOUT, home, index.partners(home).at(-1)?.id);
}

/** The cards of a fitted tree that reach into a box of the room. */
function inBox(f: Omit<Fitted, 'shape'>, box: Box): string[] {
  return f.layout.cards
    .filter((c) => {
      const x = f.x + c.x * f.scale;
      const y = f.y + c.y * f.scale;
      return x < box.x + box.w && x + c.w * f.scale > box.x && y < box.y + box.h && y + c.h * f.scale > box.y;
    })
    .map((c) => c.key);
}

describe('keeping the tree clear of boxes on the page', () => {
  const room = { w: 1500, h: 950, centred: 0 };

  it('stands no card in the title’s or the names’ box, and stays inside the room', () => {
    const title: Box = { x: 350, y: 0, w: 800, h: 130 };
    const names: Box = { x: 0, y: 870, w: 420, h: 80 };
    for (const lay of [layouter(), layouter(pedigree(4))]) {
      const kept = fitLayout(lay, LAYOUT, { ...room, blocks: [title, names] }, 'full');
      expect(inBox(kept, title)).toEqual([]);
      expect(inBox(kept, names)).toEqual([]);
      const b = kept.layout.bounds;
      expect(kept.x + b.x * kept.scale).toBeGreaterThanOrEqual(-0.5);
      expect(kept.y + b.y * kept.scale).toBeGreaterThanOrEqual(-0.5);
      expect(kept.x + (b.x + b.w) * kept.scale).toBeLessThanOrEqual(room.w + 0.5);
      expect(kept.y + (b.y + b.h) * kept.scale).toBeLessThanOrEqual(room.h + 0.5);
    }
  });

  it('uses the room beside a box: bigger cards than with a strip across the page given up for it', () => {
    const lay = layouter();
    // A title in one corner, as wide as a third of the page.
    const corner: Box = { x: 0, y: 0, w: 500, h: 130 };
    const beside = fitLayout(lay, LAYOUT, { ...room, blocks: [corner] }, 'full');
    const under = fitLayout(lay, LAYOUT, { w: room.w, h: room.h - 130, centred: 0 }, 'full');
    expect(inBox(beside, corner)).toEqual([]);
    expect(beside.scale).toBeGreaterThanOrEqual(under.scale);
    // Never bigger than with the whole room to itself.
    expect(beside.scale).toBeLessThanOrEqual(fitLayout(lay, LAYOUT, room, 'full').scale + 1e-9);
  });

  it('leaves a tree alone that no box is near', () => {
    const l = layouter().run(WIDE);
    const open = place(l, room);
    const far = place(l, { ...room, blocks: [{ x: 5000, y: 5000, w: 10, h: 10 }] });
    expect(far.scale).toBeCloseTo(open.scale, 9);
    expect(far.x).toBeCloseTo(open.x, 6);
    expect(far.y).toBeCloseTo(open.y, 6);
  });
});
