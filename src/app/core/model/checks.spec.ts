import { DocBuilder } from '../testing/fixtures';
import { checkTree, dateSpan } from './checks';
import { missingDetails } from './completeness';

function tree(dates: Record<string, { born?: string; died?: string; dead?: boolean; bornUnknown?: boolean; diedUnknown?: boolean }>, start?: string) {
  const b = new DocBuilder();
  b.person('F', 'Frank', 'Smith', 'male');
  b.person('M', 'Mary', 'Smith', 'female');
  b.person('C', 'Carl', 'Smith', 'male');
  b.person('D', 'Dora', 'Smith', 'female');
  b.family('F1', ['F', 'M'], ['C', 'D'], start ? { start: { date: { value: start } } } : {});
  const doc = b.build();
  for (const p of doc.people) {
    const d = dates[p.id] ?? {};
    p.birth = d.born ? { date: { value: d.born } } : d.bornUnknown ? { dateUnknown: true } : undefined;
    p.death = d.died ? { date: { value: d.died } } : d.dead || d.diedUnknown ? { dateUnknown: d.diedUnknown || undefined } : undefined;
  }
  return doc;
}

const kinds = (doc: ReturnType<typeof tree>) => checkTree(doc, new Date('2026-01-01')).problems.map((p) => `${p.kind}:${p.personIds.join(',')}`);

describe('checkTree', () => {
  it('counts what is missing, but not what is ticked as unknown', () => {
    const doc = tree({ F: { born: '1900', dead: true }, M: { bornUnknown: true, diedUnknown: true }, C: { born: '1930' } });
    const gaps = checkTree(doc, new Date('2026-01-01')).gaps;
    expect(gaps.find((g) => g.kind === 'birth')?.personIds).toEqual(['D']);
    // Frank died (and Mary, but nobody knows when): only Frank's death is missing.
    expect(gaps.find((g) => g.kind === 'death')?.personIds).toEqual(['F']);
    expect(gaps.find((g) => g.kind === 'given')).toBeUndefined();
  });

  it('flags a missing date of death on the person too, unless ticked as unknown', () => {
    const doc = tree({ F: { born: '1900', dead: true }, M: { bornUnknown: true, diedUnknown: true } });
    expect(
      missingDetails(
        doc.people.find((p) => p.id === 'F')!,
        new Date('2026-01-01'),
      ),
    ).toEqual(['deathDate']);
    expect(
      missingDetails(
        doc.people.find((p) => p.id === 'M')!,
        new Date('2026-01-01'),
      ),
    ).toEqual([]);
  });

  it('counts the long dead as dead', () => {
    const doc = tree({ F: { born: '1890' }, M: { born: '1990' }, C: { born: '2010' }, D: { born: '2012' } });
    expect(checkTree(doc, new Date('2026-01-01')).gaps.find((g) => g.kind === 'death')?.personIds).toEqual(['F']);
  });

  it('finds dates that cannot be right', () => {
    expect(kinds(tree({ C: { born: '1950', died: '1940' } }))).toEqual(['deathBeforeBirth:C']);
    expect(kinds(tree({ F: { born: '1960' }, C: { born: '1950' } }))).toEqual(['bornBeforeParent:C,F']);
    expect(kinds(tree({ M: { born: '1960' }, C: { born: '1968' } }))).toEqual(['parentTooYoung:C,M']);
    expect(kinds(tree({ M: { born: '1900' }, C: { born: '1962' } }))).toEqual(['motherTooOld:C,M']);
    expect(kinds(tree({ M: { born: '1900', died: '1940' }, C: { born: '1942' } }))).toEqual(['bornAfterMotherDied:C,M']);
    // A father may die before his child is born, but not years before.
    expect(kinds(tree({ F: { born: '1900', died: '1940-01-01' }, C: { born: '1940-08-01' } }))).toEqual([]);
    expect(kinds(tree({ F: { born: '1900', died: '1940' }, C: { born: '1943' } }))).toEqual(['bornAfterFatherDied:C,F']);
    expect(kinds(tree({ C: { born: '1950-01-10' }, D: { born: '1950-04-10' } }))).toEqual(['siblingsTooClose:D,C']);
    expect(kinds(tree({ F: { born: '1900', died: '1950' } }, '1960'))).toEqual(['unionAfterDeath:F']);
    expect(kinds(tree({ M: { born: '1950' } }, '1960'))).toEqual(['unionTooYoung:M']);
  });

  it('gives approximate and partial dates the benefit of the doubt', () => {
    const about = tree({ M: { born: '1960' }, C: { born: '1975' } });
    about.people.find((p) => p.id === 'M')!.birth = { date: { value: '1965', qualifier: 'about' } };
    expect(kinds(about)).toEqual([]);
    // Born the same year as the father died: may well have been before.
    expect(kinds(tree({ F: { born: '1900', died: '1940' }, C: { born: '1940' } }))).toEqual([]);
    expect(dateSpan({ value: '1900', qualifier: 'before' })!.lo).toBe(-Infinity);
  });
});
