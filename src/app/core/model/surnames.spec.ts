import { czechSurnameFor } from '../lang/cs-surnames';
import { DocBuilder } from '../testing/fixtures';
import { surnameKey } from './names';
import { SAME_SURNAME, birthFather, birthSurname, birthSurnameUnknown, maleSurnames, surnameFromFather } from './surnames';
import { TreeIndex } from './tree-index';

describe('surnames at birth', () => {
  function tree() {
    const b = new DocBuilder();
    b.person('JN', 'Josef', 'Novák', 'male');
    b.person('MN', 'Marie', 'Nováková', 'female');
    b.person('JA', 'Jana', 'Mikulová', 'female');
    b.person('PE', 'Petr', 'Novák', 'male');
    b.person('PM', 'Pavel', 'Mikula', 'male');
    b.person('AN', 'Anna', 'Grant', 'female');
    b.person('AD', 'Adam', 'Mikula', 'male');
    b.family('F1', ['JN', 'MN'], ['JA', 'PE', 'AN']);
    b.family('F2', ['PM', 'JA'], [['AD', 'adopted']]);
    return new TreeIndex(b.build());
  }

  it('takes the surname at birth from the father, in the form for the person', () => {
    const index = tree();
    const jana = index.person('JA')!;
    expect(birthFather(index, 'JA')?.id).toBe('JN');
    // Married Jana Mikulová was born Nováková in Czech, Novák in English.
    expect(birthSurname(index, jana, czechSurnameFor)).toBe('Nováková');
    expect(birthSurname(index, jana, SAME_SURNAME)).toBe('Novák');
    // Her brother has his father's surname: nothing to add.
    expect(birthSurname(index, index.person('PE')!, czechSurnameFor)).toBe('Novák');
    // Anna is recorded as Grant, a different family from Novák, so she was born Nováková.
    expect(birthSurname(index, index.person('AN')!, czechSurnameFor)).toBe('Nováková');
    // An adopted child does not take the surname at birth from the adoptive father.
    expect(birthFather(index, 'AD')).toBeUndefined();
    expect(birthSurname(index, index.person('AD')!, czechSurnameFor)).toBe('Mikula');
    // A recorded surname at birth always wins.
    const recorded = { ...jana, name: { ...jana.name, birthSurname: 'Dvořáková' } };
    expect(birthSurname(index, recorded, czechSurnameFor)).toBe('Dvořáková');
    expect(surnameFromFather(index, jana, czechSurnameFor, 'male')).toBe('Novák');
    expect(maleSurnames(index)[0]).toBe('Novák');
  });

  it('keeps a daughter recorded under her father’s name as she is', () => {
    const b = new DocBuilder();
    b.person('F', 'Oliver', 'Grant', 'male');
    b.person('D', 'Isla', 'Grant', 'female');
    b.family('F1', ['F'], ['D']);
    const index = new TreeIndex(b.build());
    expect(birthSurname(index, index.person('D')!, czechSurnameFor)).toBe('Grant');
  });

  it('treats the forms of one name as one family', () => {
    expect(surnameKey('Mikula')).toBe(surnameKey('Mikulová'));
    expect(surnameKey('Marek')).toBe(surnameKey('Marková'));
    expect(surnameKey('Vaněk')).toBe(surnameKey('Vaňková'));
    expect(surnameKey('Němec')).toBe(surnameKey('Němcová'));
    expect(surnameKey('Havel')).toBe(surnameKey('Havlová'));
    expect(surnameKey('Novák')).not.toBe(surnameKey('Novotný'));
  });

  it('knows when nobody knows the surname a married woman was born with', () => {
    const b = new DocBuilder();
    b.person('H', 'Pavel', 'Kowala', 'male');
    b.person('W', 'Anna', 'Kowalová', 'female');
    b.person('K', 'Eva', 'Kowalová', 'female');
    b.person('S', 'Jan', 'Heczko', 'male');
    b.person('O', 'Marie', 'Pinkasová', 'female');
    b.person('P', 'Jiří', 'Borski', 'male');
    b.person('L', 'Jana', 'Lišková', 'female');
    b.person('M', 'Petr', 'Liška', 'male');
    b.family('F1', ['H', 'W'], ['K']);
    b.family('F2', ['S', 'K']);
    b.family('F3', ['P', 'O']);
    b.family('F4', ['M', 'L'], [], { kind: 'partnership' });
    const doc = b.build();
    const index = new TreeIndex(doc);
    const unknown = (id: string) => birthSurnameUnknown(index, index.person(id)!);
    // Anna bears her husband's name and has no parents in the tree: nobody knows what she was born as.
    expect(unknown('W')).toBe(true);
    // Their daughter has her father's name, whoever she married; a wife with another name than her husband kept her own.
    expect(unknown('K')).toBe(false);
    expect(unknown('O')).toBe(false);
    // Men, and couples who are not married, are left as they are.
    expect(unknown('H')).toBe(false);
    expect(unknown('L')).toBe(false);
    // A surname at birth that is entered is known.
    const entered = new TreeIndex({ ...doc, people: doc.people.map((p) => (p.id === 'W' ? { ...p, name: { ...p.name, birthSurname: 'Wiselková' } } : p)) });
    expect(birthSurnameUnknown(entered, entered.person('W')!)).toBe(false);
  });

  it('takes a daughter written the Czech way for her Polish father\u2019s daughter as she is', () => {
    const b = new DocBuilder();
    b.person('F', 'Jindřich', 'Nowak', 'male');
    b.person('M', 'Vanda', 'Nowaková', 'female');
    b.person('D', 'Jana', 'Nováková', 'female');
    b.family('F1', ['F', 'M'], ['D']);
    const index = new TreeIndex(b.build());
    expect(birthSurname(index, index.person('D')!, czechSurnameFor)).toBe('Nováková');
  });
});
