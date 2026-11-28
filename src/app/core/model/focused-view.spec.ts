import { familyBalloons } from './family-view';
import { ancestorSide, focusedScope } from './focused-view';
import { TreeIndex } from './tree-index';
import { DEFAULT_VIEW, Family, Person, TreeDocument } from './types';

/**
 * C and his wife P; above C every ancestor four generations up ("C.f.m" is his father's mother), above P
 * two. C's sister S has a husband and a son; C and P have a son K, whose son G has a son of his own.
 */
function tree(): TreeDocument {
  const people: Person[] = [];
  const families: Family[] = [];
  const person = (id: string, sex: Person['sex']) => people.push({ id, sex, name: { given: id, surname: '' } });
  const family = (id: string, partners: string[], children: string[]) =>
    families.push({ id, kind: 'marriage', partners, children: children.map((personId) => ({ personId, relation: 'biological' })) });

  const pedigree = (id: string, depth: number, extra: string[] = []) => {
    if (!depth) return;
    person(`${id}.f`, 'male');
    person(`${id}.m`, 'female');
    family(`F:${id}`, [`${id}.f`, `${id}.m`], [id, ...extra]);
    pedigree(`${id}.f`, depth - 1);
    pedigree(`${id}.m`, depth - 1);
  };
  person('C', 'male');
  person('P', 'female');
  person('S', 'female');
  person('S+', 'male');
  person('N', 'male');
  person('K', 'male');
  person('K+', 'female');
  person('G', 'male');
  person('GG', 'male');
  pedigree('C', 4, ['S']);
  pedigree('P', 2);
  family('F:CP', ['C', 'P'], ['K']);
  family('F:S', ['S', 'S+'], ['N']);
  family('F:K', ['K', 'K+'], ['G']);
  family('F:G', ['G'], ['GG']);
  return { meta: { title: '' }, view: DEFAULT_VIEW, people, families };
}

describe('focused view', () => {
  const doc = tree();
  const index = new TreeIndex(doc);
  const shown = (options: { through?: string; opened?: string[] } = {}) =>
    focusedScope(doc, index, { centerId: 'C', partnerId: 'P', through: options.through, opened: new Set(options.opened ?? []) }).people;

  it('shows the couple with their nearest relatives', () => {
    const s = shown();
    for (const id of ['C', 'P', 'S', 'S+', 'K', 'K+', 'G', 'C.f', 'C.m', 'C.f.f', 'C.f.m', 'C.m.f', 'C.m.m', 'P.f', 'P.m']) expect(s.has(id), id).toBe(true);
    // Nephews, great-grandchildren and the partner's grandparents are folded away.
    for (const id of ['N', 'GG', 'P.f.f', 'P.m.m']) expect(s.has(id), id).toBe(false);
  });

  it('lets one line of ancestors go on up: the father’s father’s', () => {
    const s = shown();
    for (const id of ['C.f.f.f', 'C.f.f.m', 'C.f.f.f.f', 'C.f.f.f.m']) expect(s.has(id), id).toBe(true);
    for (const id of ['C.f.m.f', 'C.m.f.f', 'C.m.m.m', 'C.f.f.m.f', 'C.f.f.f.m.f']) expect(s.has(id), id).toBe(false);
  });

  it('folds the other lines into balloons over the ancestors', () => {
    const scope = focusedScope(doc, index, { centerId: 'C', partnerId: 'P' });
    const balloons = new Set(familyBalloons(doc, index, scope.people, () => '').map((b) => b.id));
    for (const id of ['parents:C.f.m', 'parents:C.m.f', 'parents:C.m.m', 'parents:C.f.f.m', 'parents:P.f', 'parents:P.m', 'children:F:S', 'children:F:G']) {
      expect(balloons.has(id), id).toBe(true);
    }
    expect(balloons.has('parents:C.f.f')).toBe(false);
  });

  it('swaps the line that goes up for one through another ancestor', () => {
    const s = shown({ through: 'C.m.m' });
    for (const id of ['C.m.m.f', 'C.m.m.m', 'C.m.m.f.f', 'C.m.m.f.m']) expect(s.has(id), id).toBe(true);
    // The father's father's line is folded away now; the grandparents stay.
    expect(s.has('C.f.f.f')).toBe(false);
    expect(s.has('C.f.f')).toBe(true);
    expect(s.has('C.m.m.m.f')).toBe(false);
  });

  it('can let the partner’s line go up instead', () => {
    const s = shown({ through: 'P.f' });
    expect(s.has('P.f.f')).toBe(true);
    expect(s.has('P.f.m')).toBe(true);
    expect(s.has('P.m.f')).toBe(false);
    expect(s.has('C.f.f.f')).toBe(false);
  });

  it('brings people opened from a balloon in, with their partners', () => {
    const s = shown({ opened: ['N', 'GG'] });
    expect(s.has('N')).toBe(true);
    expect(s.has('GG')).toBe(true);
  });

  it('ignores a line through someone who is no ancestor', () => {
    expect([...shown({ through: 'S+' })].sort()).toEqual([...shown()].sort());
  });

  it('tells the balloons over ancestors from the others', () => {
    const side = ancestorSide(index, 'C', 'P');
    expect(side.has('C.f.m.f')).toBe(true);
    expect(side.has('P.m')).toBe(true);
    expect(side.has('S+')).toBe(false);
    expect(side.has('K')).toBe(false);
  });

  it('shows nobody for a person in the middle who is not in the tree', () => {
    expect(focusedScope(doc, index, { centerId: 'nobody' }).people.size).toBe(0);
  });
});
