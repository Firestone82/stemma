import { isPortal } from '../model/family-view';
import { sampleDocument } from '../model/sample';
import { TreeIndex } from '../model/tree-index';
import { DocBuilder, cousinMarriage, disconnected } from '../testing/fixtures';
import { chartAnchor } from './structure';

describe('who the chart is drawn around', () => {
  const anchor = (doc: ReturnType<typeof cousinMarriage>, isPerson?: (id: string) => boolean) => chartAnchor(new TreeIndex(doc), isPerson);

  it('is the person with the most ancestors, whoever the tree is centred on', () => {
    // Dora descends from both of the grandparents' children.
    const doc = cousinMarriage();
    expect(anchor(doc)).toBe('D');
    expect(anchor({ ...doc, meta: { ...doc.meta, homePersonId: 'GF' } })).toBe('D');
    // In the example tree, the youngest of its longest line: Leo, Simon's grandson.
    expect(chartAnchor(new TreeIndex(sampleDocument()))).toBe('I29');
  });

  it('takes the one with more descendants among equals, then the first in the tree', () => {
    const b = new DocBuilder();
    b.person('F', 'Father', 'Oak', 'male');
    b.person('M', 'Mother', 'Oak', 'female');
    b.person('A', 'Anna', 'Oak', 'female');
    b.person('B', 'Ben', 'Oak', 'male');
    b.person('W', 'Wife', 'Elm', 'female');
    b.family('F1', ['F', 'M'], ['A', 'B']);
    b.family('F2', ['B', 'W']);
    // Anna and Ben have the same parents and no children: Anna comes first.
    expect(anchor(b.build())).toBe('A');
    // A child of Ben's (with a wife from nowhere) has more ancestors still.
    b.person('K', 'Kid', 'Oak', 'male');
    b.families[1].children.push({ personId: 'K', relation: 'biological' });
    expect(anchor(b.build())).toBe('K');
    // People joined to nobody: the first.
    expect(anchor(disconnected())).toBe('A3');
  });

  it('leaves out what stands for nobody', () => {
    const doc = cousinMarriage();
    expect(anchor(doc, (id) => id !== 'D' && !isPortal(id))).toBe('C1');
  });
});
