import { chartLanguage, kinLabel } from '../lang/language';
import { connectorPaths } from '../layout/paths';
import { computeLayout } from '../layout/layout';
import { DocBuilder } from '../testing/fixtures';
import { birthCount, birthGroupOf, leaveBirth, linkBirth, shareBirth, splitBirth } from './births';
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

describe('children born together', () => {
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
    const layout = computeLayout(doc);
    const c = layout.connectors.find((x) => x.familyId === 'F1')!;
    const paths = connectorPaths(c, 'square', 10);
    const dropOf = (id: string) => c.drops.find((d) => d.childId === id)!;
    // Each twin's line ends under their own card, like any other child's.
    for (const id of ['A', 'C']) {
      const target = dropOf(id).points[dropOf(id).points.length - 1];
      expect(paths.find((p) => p.childId === id)!.d.endsWith(`L${target.x},${target.y}`)).toBe(true);
    }
    const cards = layout.cards.filter((k) => ['A', 'C'].includes(k.personId)).sort((a, b) => a.x - b.x);
    expect(cards[1].x - cards[0].x).toBeLessThan(2 * cards[0].w);
    const en = chartLanguage('en');
    expect(kinLabel(en, { kind: 'line', up: 1, down: 1 }, 'female', 2)).toBe('Twin sister');
    expect(kinLabel(chartLanguage('cs'), { kind: 'line', up: 1, down: 1 }, 'male', 3)).toBe('Bratr-trojče');
    expect(kinLabel(en, { kind: 'line', up: 1, down: 1 }, 'female')).toBe('Sister');
  });
});
