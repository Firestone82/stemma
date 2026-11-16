import { cousinMarriage } from '../testing/fixtures';
import { cutOff } from './cut-off';
import { sampleDocument } from './sample';
import { TreeIndex } from './tree-index';

describe('taking a line of the chart away', () => {
  const doc = sampleDocument();
  const index = new TreeIndex(doc);
  const everyone = doc.people.map((p) => p.id);
  // Simon, the person the sample is drawn around.
  const centre = 'I11';

  it('takes a child with their partner and their children', () => {
    // Emily, of Simon and Ruth: her husband Oliver and their two children go with her; her brother Jack stays.
    expect(cutOff(index, everyone, centre, [{ familyId: 'F5', childId: 'I20' }]).sort()).toEqual(['I20', 'I25', 'I27', 'I28']);
    // A child with nobody of their own goes alone.
    expect(cutOff(index, everyone, centre, [{ familyId: 'F11', childId: 'I29' }])).toEqual(['I29']);
  });

  it('takes every child of a family when the stretch they share is the one taken away', () => {
    const gone = cutOff(index, everyone, centre, [
      { familyId: 'F5', childId: 'I20' },
      { familyId: 'F5', childId: 'I21' },
    ]);
    expect(gone.sort()).toEqual(['I20', 'I21', 'I25', 'I27', 'I28']);
  });

  it('takes the parents’ side when the line leads to someone in the direct line, and never the person in the middle', () => {
    // The line from Arthur and Hélène down to Simon: everything above and beside him goes, he and his own stay.
    const gone = new Set(cutOff(index, everyone, centre, [{ familyId: 'F4', childId: centre }]));
    expect(gone.has(centre)).toBe(false);
    for (const id of ['I6', 'I1', 'I2', 'I12', 'I8']) expect(gone.has(id)).toBe(true);
    for (const id of ['I15', 'I20', 'I22', 'I29']) expect(gone.has(id)).toBe(false);
  });

  it('keeps brothers and sisters together whose parents are not known', () => {
    // Florence is Edith's sister; nobody knows their parents. Taking someone else away leaves her where she is.
    expect(cutOff(index, everyone, centre, [{ familyId: 'F11', childId: 'I29' }])).not.toContain('I3');
  });

  it('takes only the child where the tree holds together without the line', () => {
    // Sam is joined to the rest twice over: through his parents, and through his son, who married his niece.
    const cousins = cousinMarriage();
    const all = cousins.people.map((p) => p.id);
    expect(cutOff(new TreeIndex(cousins), all, 'GF', [{ familyId: 'F1', childId: 'S1' }])).toEqual(['S1']);
  });

  it('takes nobody without a line, or when the person in the middle is not on the page', () => {
    expect(cutOff(index, everyone, centre, [])).toEqual([]);
    expect(cutOff(index, ['I20', 'I25'], centre, [{ familyId: 'F5', childId: 'I20' }])).toEqual([]);
  });
});
