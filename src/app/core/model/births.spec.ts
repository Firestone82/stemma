import { chartLanguage, kinLabel } from '../lang/language';
import { Layouter, WIDE } from '../layout/engine';
import { LAYOUT } from '../layout/types';
import { TreeIndex } from './tree-index';
import { DocBuilder } from '../testing/fixtures';
import {
  BIRTH_COLORS,
  MAX_BORN_TOGETHER,
  addBornTogether,
  birthColor,
  birthCount,
  birthGroupOf,
  leaveBirth,
  linkBirth,
  shareBirth,
  splitBirth,
} from './births';
import { updatePerson } from './operations';

function family() {
  const b = new DocBuilder();
  b.person('M', 'Mum', 'Lee', 'female');
  b.person('A', 'Ann', 'Lee', 'female', '1990-04-02');
  b.person('B', 'Ben', 'Lee', 'male', '1992');
  b.person('C', 'Cat', 'Lee', 'female');
  b.person('D', 'Dan', 'Lee', 'male');
  b.family('F1', ['M'], ['A', 'B', 'C', 'D']);
  const doc = b.build();
  doc.people.find((p) => p.id === 'A')!.birth!.place = 'Leeds';
  return doc;
}

describe('adding siblings born together', () => {
  it('adds a twin', () => {
    const r = addBornTogether(family(), 'A', { draft: { given: 'Amy', surname: 'Lee', sex: 'female' } }, 2);
    expect(birthGroupOf(r.doc, 'A')?.memberIds).toEqual(['A', r.personId]);
    expect(r.doc.people.find((p) => p.id === r.personId)!.birth).toEqual({ date: { value: '1990-04-02' }, place: 'Leeds' });
  });

  it('adds the missing siblings for quadruplets, with the surname and the shared birth', () => {
    const r = addBornTogether(family(), 'A', { draft: { given: 'Amy', surname: 'Lee', sex: 'female' } }, 4);
    const group = birthGroupOf(r.doc, 'A')!;
    expect(group.memberIds.length).toBe(4);
    expect(group.memberIds.slice(0, 2)).toEqual(['A', r.personId]);
    const extras = group.memberIds.slice(2).map((id) => r.doc.people.find((p) => p.id === id)!);
    expect(extras.map((p) => [p.name.given, p.name.surname, p.sex])).toEqual([
      ['', 'Lee', 'unknown'],
      ['', 'Lee', 'unknown'],
    ]);
    expect(extras.every((p) => p.birth?.place === 'Leeds' && p.birth?.date?.value === '1990-04-02')).toBe(true);
    expect(r.doc.people.find((p) => p.id === r.personId)!.name.given).toBe('Amy');
  });

  it('counts the group the person is already in', () => {
    const twins = linkBirth(family(), 'F1', ['A', 'C']);
    const r = addBornTogether(twins, 'A', { draft: { given: 'Eve', surname: 'Lee' } }, 5);
    expect(birthCount(r.doc, 'A')).toBe(5);
    expect(r.doc.people.length).toBe(twins.people.length + 3);
    // Asking for no more than there already are still adds the one in the form.
    expect(birthCount(addBornTogether(twins, 'A', { draft: { given: 'Eve' } }, 2).doc, 'A')).toBe(3);
  });

  it('works for someone with no parents in the tree, and stops at the most offered', () => {
    const b = new DocBuilder();
    b.person('X', 'Xena', 'Ng', 'female');
    const r = addBornTogether(b.build(), 'X', { draft: { given: 'Yan', surname: 'Ng' } }, 99);
    expect(birthCount(r.doc, 'X')).toBe(MAX_BORN_TOGETHER);
    expect(r.doc.families.length).toBe(1);
  });
});

describe('children born together', () => {
  it('gives each group in a family its own colour, in the order they stand', () => {
    const doc = linkBirth(linkBirth(family(), 'F1', ['C', 'D']), 'F1', ['A', 'B']);
    const f = doc.families[0];
    const key = (id: string) => f.children.find((c) => c.personId === id)!.birthGroup!;
    expect(f.children.map((c) => c.personId)).toEqual(['A', 'B', 'C', 'D']);
    expect(birthColor(f, key('A'))).toBe(1);
    expect(birthColor(f, key('C'))).toBe(2);
    expect(BIRTH_COLORS).toBe(6);
  });

  it('links twins, puts them side by side and gives them one birth', () => {
    const doc = linkBirth(family(), 'F1', ['A', 'C']);
    const f = doc.families[0];
    expect(f.children.map((c) => c.personId)).toEqual(['A', 'C', 'B', 'D']);
    expect(birthGroupOf(doc, 'C')?.memberIds).toEqual(['A', 'C']);
    expect(birthCount(doc, 'A')).toBe(2);
    expect(birthCount(doc, 'B')).toBe(1);
    expect(doc.people.find((p) => p.id === 'C')!.birth).toEqual({ date: { value: '1990-04-02' }, place: 'Leeds' });
  });

  it('keeps their birth the same when one of them changes', () => {
    let doc = linkBirth(family(), 'F1', ['A', 'C']);
    doc = shareBirth(updatePerson(doc, 'C', { birth: { date: { value: '1990-04-03' }, place: 'York' } }), 'C');
    expect(doc.people.find((p) => p.id === 'A')!.birth).toEqual({ date: { value: '1990-04-03' }, place: 'York' });
    expect(doc.people.find((p) => p.id === 'B')!.birth).toEqual({ date: { value: '1992' } });
  });

  it('grows into triplets and splits again', () => {
    let doc = linkBirth(linkBirth(family(), 'F1', ['A', 'C']), 'F1', ['C', 'B']);
    expect(birthGroupOf(doc, 'B')?.memberIds).toEqual(['A', 'C', 'B']);
    doc = splitBirth(doc, 'F1', 'C');
    // A and C are still twins; B is on their own again.
    expect(birthGroupOf(doc, 'A')?.memberIds).toEqual(['A', 'C']);
    expect(birthGroupOf(doc, 'B')).toBeUndefined();
    doc = splitBirth(doc, 'F1', 'A');
    expect(doc.families[0].children.every((c) => !c.birthGroup)).toBe(true);
  });

  it('lets one child leave a birth group; the others stay together', () => {
    let doc = linkBirth(linkBirth(family(), 'F1', ['A', 'C']), 'F1', ['C', 'B']);
    doc = leaveBirth(doc, 'F1', 'A');
    expect(birthGroupOf(doc, 'A')).toBeUndefined();
    expect(birthGroupOf(doc, 'C')?.memberIds).toEqual(['C', 'B']);
    doc = leaveBirth(doc, 'F1', 'B');
    expect(doc.families[0].children.every((c) => !c.birthGroup)).toBe(true);
    expect(leaveBirth(doc, 'F1', 'D')).toEqual(doc);
  });

  it('draws twins side by side with a line each and names them on the chart', () => {
    const doc = linkBirth(family(), 'F1', ['A', 'C']);
    const layout = new Layouter(new TreeIndex(doc), LAYOUT, doc.people[0].id).run(WIDE);
    // Each twin's line ends at their own card, like any other child's.
    for (const id of ['A', 'C']) {
      const card = layout.cards.find((k) => k.personId === id)!;
      const line = layout.lines.find((l) => l.familyId === 'F1' && l.childId === id)!;
      const end = line.points[line.points.length - 1];
      expect(end).toEqual({ x: card.x + card.w / 2, y: card.y });
    }
    const cards = layout.cards.filter((k) => ['A', 'C'].includes(k.personId)).sort((a, b) => a.x - b.x);
    expect(cards[1].x - cards[0].x).toBeLessThan(2 * cards[0].w);
    const en = chartLanguage('en');
    expect(kinLabel(en, { kind: 'line', up: 1, down: 1 }, 'female', 2)).toBe('Twin sister');
    expect(kinLabel(chartLanguage('cs'), { kind: 'line', up: 1, down: 1 }, 'male', 3)).toBe('Bratr-trojče');
    expect(kinLabel(en, { kind: 'line', up: 1, down: 1 }, 'female')).toBe('Sister');
  });
});
