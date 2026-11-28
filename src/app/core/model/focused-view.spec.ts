import { familyBalloons } from './family-view';
import { ancestorSide, focusedScope } from './focused-view';
import { TreeIndex } from './tree-index';
import { DEFAULT_VIEW, Family, Person, TreeDocument } from './types';

/**
 * C and his wife P; above C every ancestor four generations up ("C.f.m" is his father's mother), above P
 * two. A man passes his family on: "C.f.f" was born into C's family, "C.m.m.f" into C.m.m's. C's sister S
 * has a husband and a son N; his uncle U a wife and a son; his grandfather's brother GU a son and a
 * daughter, whose son was born into his father's family. C and P have a son K, whose son G has a son GG.
 */
const FAMILY_C = ['S', 'U', 'UC', 'K', 'G', 'GG', 'GU', 'GUC', 'GUD'];
const keyOf = (id: string) => (id === 'MU' ? 'C.m' : FAMILY_C.includes(id) ? 'C' : /^[CP](\.[fm])*$/.test(id) ? id.replace(/(\.f)+$/, '') : id);

function tree(): TreeDocument {
  const people: Person[] = [];
  const families: Family[] = [];
  const person = (id: string, sex: Person['sex']) => people.push({ id, sex, name: { given: id, surname: '' } });
  const family = (id: string, partners: string[], children: string[]) =>
    families.push({ id, kind: 'marriage', partners, children: children.map((personId) => ({ personId, relation: 'biological' })) });

  const pedigree = (id: string, depth: number) => {
    if (!depth) return;
    person(`${id}.f`, 'male');
    person(`${id}.m`, 'female');
    family(`F:${id}`, [`${id}.f`, `${id}.m`], [id]);
    pedigree(`${id}.f`, depth - 1);
    pedigree(`${id}.m`, depth - 1);
  };
  for (const id of ['C', 'MU', 'S+', 'N', 'K', 'G', 'GG', 'U', 'UC', 'GU', 'GUC', 'GUDC']) person(id, 'male');
  for (const id of ['P', 'S', 'K+', 'U+', 'GUD']) person(id, 'female');
  pedigree('C', 4);
  pedigree('P', 2);
  const kids = (familyId: string, ...ids: string[]) =>
    families.find((f) => f.id === familyId)!.children.push(...ids.map((personId) => ({ personId, relation: 'biological' as const })));
  kids('F:C', 'S');
  kids('F:C.f', 'U');
  kids('F:C.m', 'MU');
  kids('F:C.f.f', 'GU');
  family('F:U', ['U', 'U+'], ['UC']);
  family('F:GU', ['GU'], ['GUC', 'GUD']);
  family('F:GUD', ['GUD'], ['GUDC']);
  family('F:CP', ['C', 'P'], ['K']);
  family('F:S', ['S', 'S+'], ['N']);
  family('F:K', ['K', 'K+'], ['G']);
  family('F:G', ['G'], ['GG']);
  return { meta: { title: '' }, view: DEFAULT_VIEW, people, families };
}

describe('focused view', () => {
  const doc = tree();
  const index = new TreeIndex(doc);
  const scope = (options: { through?: string; opened?: string[] } = {}) =>
    focusedScope(doc, index, { centerId: 'C', partnerId: 'P', keyOf, through: options.through, opened: new Set(options.opened ?? []) });
  const shown = (options: { through?: string; opened?: string[] } = {}) => scope(options).people;
  const expectShown = (s: ReadonlySet<string>, yes: string[], no: string[]) => {
    for (const id of yes) expect(s.has(id), id).toBe(true);
    for (const id of no) expect(s.has(id), id).toBe(false);
  };

  it('shows the nearest relatives with their partners', () => {
    expectShown(shown(), ['C', 'P', 'S', 'S+', 'N', 'K', 'K+', 'G', 'C.f', 'C.m', 'C.f.m', 'U', 'U+'], ['P.f', 'P.m', 'C.f.m.f']);
  });

  it('leaves out the family a mother who married in was born into', () => {
    expectShown(shown(), [], ['C.m.f', 'C.m.m', 'MU', 'C.m.m.f']);
  });

  it('shows the whole family of the person in the middle, up and down', () => {
    expectShown(shown(), ['C.f.f', 'C.f.f.f', 'C.f.f.f.f', 'GU', 'GUC', 'GUD', 'UC', 'GG'], []);
    // Partners of the family come with them; where it branches into another family, it stops.
    expectShown(shown(), ['C.f.f.m', 'C.f.f.f.m'], ['GUDC', 'C.f.f.m.f']);
  });

  it('folds the other families into balloons', () => {
    const balloons = new Set(familyBalloons(doc, index, scope().people, keyOf).map((b) => b.id));
    for (const id of ['parents:C.f.m', 'parents:C.m', 'parents:C.f.f.m', 'parents:P', 'children:F:GUD']) expect(balloons.has(id), id).toBe(true);
    expect(balloons.has('parents:C.f.f')).toBe(false);
  });

  it('swaps the family shown for an ancestor’s', () => {
    const s = shown({ through: 'C.m.m' });
    expectShown(s, ['C.m.m.f', 'C.m.m.f.f', 'C.m.m.m'], ['C.m.m.m.f']);
    // The family shown before is folded away beyond the nearest relatives.
    expectShown(s, ['C.f', 'C.m.f', 'K', 'G'], ['C.f.f', 'C.f.f.f', 'U', 'GU', 'UC', 'GG']);
  });

  it('can show the partner’s family instead', () => {
    expectShown(shown({ through: 'P' }), ['P.f', 'P.m', 'P.f.f'], ['P.m.f', 'C.f.f.f']);
  });

  it('brings people opened from a balloon in, with their partners', () => {
    expectShown(shown({ opened: ['GUDC'] }), ['GUDC'], []);
  });

  it('ignores an ancestor who is no ancestor', () => {
    expect([...shown({ through: 'S+' })].sort()).toEqual([...shown()].sort());
  });

  it('can show the mother’s family instead', () => {
    expectShown(shown({ through: 'C.m' }), ['C.m.f', 'C.m.m', 'MU', 'C.m.f.f'], ['C.m.m.f', 'C.f.f']);
  });

  it('tells the balloons over ancestors from the others', () => {
    const side = ancestorSide(index, 'C', 'P');
    expectShown(side, ['C.f.m.f', 'P.m'], ['S+', 'K', 'U']);
  });

  it('shows nobody for a person in the middle who is not in the tree', () => {
    expect(focusedScope(doc, index, { centerId: 'nobody', keyOf }).people.size).toBe(0);
  });
});
