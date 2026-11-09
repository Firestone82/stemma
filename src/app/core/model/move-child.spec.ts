import { addParent, moveChildToFamily, removePartner } from './operations';
import { sampleDocument } from './sample';
import { TreeIndex } from './tree-index';
import { TreeDocument } from './types';

const familiesOf = (doc: TreeDocument, childId: string) => new TreeIndex(doc).parentFamilies(childId).map((f) => f.id);

describe('moving a child under another couple', () => {
  const doc = sampleDocument(new Date('2026-01-01T00:00:00Z'));

  it("moves a child from one of a parent's marriages to another", () => {
    // Tomáš is Simon and Šárka's son (F6); move him under Simon and Ruth (F5).
    const next = moveChildToFamily(doc, 'F6', 'F5', 'I22');
    expect(familiesOf(next, 'I22')).toEqual(['F5']);
    // Simon and Šárka stay a couple without children.
    expect(next.families.find((f) => f.id === 'F6')?.partners).toEqual(['I11', 'I15']);
  });

  it('moves a child from a parent alone under their marriage, and drops the empty family', () => {
    // Šárka leaves F6: Tomáš is then Simon's alone.
    const alone = removePartner(doc, 'F6', 'I15');
    const single = new TreeIndex(alone).parentFamilies('I22')[0];
    expect(single.partners).toEqual(['I11']);
    const next = moveChildToFamily(alone, single.id, 'F5', 'I22');
    expect(familiesOf(next, 'I22')).toEqual(['F5']);
    expect(next.families.some((f) => f.id === single.id)).toBe(false);
  });

  it("refuses to put a child under their own descendant's family", () => {
    // Emily (I20) is Simon's daughter; her family F10 cannot take Simon as a child.
    expect(() => moveChildToFamily(doc, 'F4', 'F10', 'I11')).toThrow();
  });

  it('adding a known partner as the other parent uses their marriage instead of a second one', () => {
    const alone = removePartner(doc, 'F6', 'I15');
    const families = alone.families.length;
    // Simon's son Tomáš gets Ruth, Simon's first wife, as his mother.
    const { doc: next, familyId } = addParent(alone, 'I22', { existingId: 'I14' });
    expect(familyId).toBe('F5');
    expect(familiesOf(next, 'I22')).toEqual(['F5']);
    // No second Simon and Ruth couple; the one-parent family is gone.
    expect(next.families.filter((f) => f.partners.includes('I11') && f.partners.includes('I14'))).toHaveLength(1);
    expect(next.families.length).toBe(families - 1);
  });
});
