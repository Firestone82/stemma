import { DocBuilder } from '../../../../core/testing/fixtures';
import { groupByFamily } from './family-groups';

describe('people grouped by family', () => {
  it('puts the forms of one name together, base form first, members oldest first', () => {
    const b = new DocBuilder();
    b.person('J', 'Jana', 'Mikulová', 'female', '1962');
    b.person('P', 'Pavel', 'Mikula', 'male', '1990');
    b.person('K', 'Karel', 'Mikula', 'male', '1960');
    b.person('C', 'Eva', 'Černá', 'female');
    b.person('D', 'Jan', 'Černý', 'male');
    b.person('A', 'Anna', 'Ashworth', 'female');
    b.person('X', 'Someone', '', 'unknown');
    const groups = groupByFamily(b.build().people, (a, c) => a.localeCompare(c, 'cs'));
    expect(groups.map((g) => g.spellings)).toEqual([['Ashworth'], ['Černý', 'Černá'], ['Mikula', 'Mikulová'], []]);
    expect(groups[2].members.map((p) => p.id)).toEqual(['K', 'J', 'P']);
    // People with no surname come last, under an empty key.
    expect(groups[3].key).toBe('');
    expect(groups[3].members.map((p) => p.id)).toEqual(['X']);
  });

  it('puts the Polish and the Czech spelling of a name in one group when the tree unites them', () => {
    const b = new DocBuilder();
    b.person('A', 'Jan', 'Nowak', 'male', '1925');
    b.person('B', 'Bruno', 'Novák', 'male', '1950');
    b.person('C', 'Soňa', 'Nováková', 'female', '1978');
    const people = b.build().people;
    const compare = (a: string, c: string) => a.localeCompare(c, 'cs');
    expect(groupByFamily(people, compare, true)).toHaveLength(1);
    expect(groupByFamily(people, compare, true)[0].members.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(groupByFamily(people, compare)).toHaveLength(2);
  });
});
