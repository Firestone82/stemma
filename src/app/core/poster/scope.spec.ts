import { TreeIndex } from '../model/tree-index';
import { DocBuilder } from '../testing/fixtures';
import { ScopeOptions, relativesToAdd, scopeDocument } from './scope';

/**
 * Bruno with his wife Irena, and Věra, the wife he divorced: her parents, her sister with a husband and a son,
 * and the man she married later with their daughter.
 */
function divorced() {
  const b = new DocBuilder();
  for (const [id, sex] of [
    ['BF', 'male'],
    ['BM', 'female'],
    ['B', 'male'],
    ['I', 'female'],
    ['V', 'female'],
    ['VF', 'male'],
    ['VM', 'female'],
    ['VS', 'female'],
    ['VSH', 'male'],
    ['VSC', 'male'],
    ['VN', 'male'],
    ['VNC', 'female'],
    ['K', 'male'],
  ] as const)
    b.person(id, id, '', sex);
  b.family('F1', ['BF', 'BM'], ['B']);
  b.family('F2', ['B', 'V'], ['K'], { end: { reason: 'divorce' } });
  b.family('F3', ['B', 'I']);
  b.family('F4', ['VF', 'VM'], ['V', 'VS']);
  b.family('F5', ['VSH', 'VS'], ['VSC']);
  b.family('F6', ['VN', 'V'], ['VNC']);
  const doc = b.build();
  return { doc, index: new TreeIndex(doc) };
}

const around: ScopeOptions = { centerId: 'B', partnerId: 'I', ancestors: 1, descendants: 1, branches: 0, nearFormerPartner: true };

describe('people brought onto a print by hand', () => {
  it('finds the parents, the brothers and sisters with them, or the whole family of someone', () => {
    const { index } = divorced();
    expect(relativesToAdd(index, 'V', 'parents')).toEqual(['VF', 'VM']);
    expect(relativesToAdd(index, 'V', 'siblings')).toEqual(['VF', 'VM', 'VS']);
    expect(relativesToAdd(index, 'V', 'family').sort()).toEqual(['B', 'K', 'VF', 'VM', 'VN', 'VNC', 'VS', 'VSC', 'VSH']);
    // Nobody known: nothing to bring.
    expect(relativesToAdd(index, 'VF', 'siblings')).toEqual([]);
  });

  it('puts them on the print with the families that join them, whatever its reach', () => {
    const { doc, index } = divorced();
    const plain = scopeDocument(doc, index, around);
    expect(plain.people.has('V')).toBe(true);
    expect(plain.people.has('VF')).toBe(false);
    const more = scopeDocument(doc, index, { ...around, added: new Set(['VF', 'VM']) });
    expect([...more.people].sort()).toEqual([...plain.people, 'VF', 'VM'].sort());
    // Her parents' family is on the page, with her alone of their children.
    expect(more.doc.families.find((f) => f.id === 'F4')).toEqual(
      expect.objectContaining({ partners: ['VF', 'VM'], children: [{ personId: 'V', relation: 'biological' }] }),
    );
  });

  it('keeps off those left out of the print and those hidden from prints', () => {
    const { doc, index } = divorced();
    doc.people.find((p) => p.id === 'VM')!.hiddenFromPrint = true;
    const hidden = new TreeIndex(doc);
    const s = scopeDocument(doc, hidden, { ...around, added: new Set(['VF', 'VM', 'VS']), omit: new Set(['VS']) });
    expect(s.people.has('VF')).toBe(true);
    expect(s.people.has('VM')).toBe(false);
    expect(s.people.has('VS')).toBe(false);
    expect(scopeDocument(doc, hidden, { ...around, added: new Set(['VM']), showHidden: true }).people.has('VM')).toBe(true);
    // Someone no longer in the tree is passed over.
    expect(scopeDocument(doc, index, { ...around, added: new Set(['gone']) }).people.has('gone')).toBe(false);
  });
});
