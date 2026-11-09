import { czechSurnameFor } from '../lang/cs-surnames';
import { DocBuilder } from '../testing/fixtures';
import { surnameFromHusband, withMarriedSurnames } from './married-surnames';
import { updatePerson } from './operations';
import { SAME_SURNAME } from './surnames';
import { TreeIndex } from './tree-index';
import { serializeTree } from '../xml/serializer';

describe('surnames taken from husbands', () => {
  function tree() {
    const b = new DocBuilder();
    b.person('PM', 'Pavel', 'Mikula', 'male');
    b.person('JA', 'Jana', '', 'female'); // nothing recorded: Mikulová
    b.person('EV', 'Eva', 'Nováková', 'female'); // recorded, and just what her husband's gives
    b.person('KN', 'Karel', 'Novák', 'male');
    b.person('LN', 'Lenka', 'Dvořáková', 'female'); // her own, kept
    b.person('ZD', 'Zuzana', '', 'female'); // divorced: nothing to take
    b.person('OS', 'Ota', 'Svoboda', 'male');
    b.person('BP', 'Bára', '', 'female'); // partners, not married
    b.person('TH', 'Tomáš', 'Horák', 'male');
    b.family('F1', ['PM', 'JA']);
    b.family('F2', ['KN', 'EV']);
    b.family('F3', ['KN', 'LN']);
    b.family('F4', ['OS', 'ZD'], [], { end: { reason: 'divorce' } });
    b.family('F5', ['TH', 'BP'], [], { kind: 'partnership' });
    return b.build();
  }

  it('gives a wife her husband’s surname in her form, when she has none', () => {
    const doc = tree();
    const index = new TreeIndex(doc);
    const jana = doc.people.find((p) => p.id === 'JA')!;
    expect(surnameFromHusband(index, jana, czechSurnameFor)).toBe('Mikulová');
    expect(surnameFromHusband(index, jana, SAME_SURNAME)).toBe('Mikula');
    expect(
      surnameFromHusband(
        index,
        doc.people.find((p) => p.id === 'ZD')!,
        czechSurnameFor,
      ),
    ).toBe('');
    expect(
      surnameFromHusband(
        index,
        doc.people.find((p) => p.id === 'BP')!,
        czechSurnameFor,
      ),
    ).toBe('');
    expect(
      surnameFromHusband(
        index,
        doc.people.find((p) => p.id === 'PM')!,
        czechSurnameFor,
      ),
    ).toBe('');
  });

  it('fills the surnames in, marks them as taken, and leaves them out of the file', () => {
    const doc = withMarriedSurnames(tree(), czechSurnameFor);
    const name = (id: string) => doc.people.find((p) => p.id === id)!.name;
    expect(name('JA')).toEqual({ given: 'Jana', surname: 'Mikulová', derived: true });
    expect(name('EV')).toEqual({ given: 'Eva', surname: 'Nováková' });
    expect(name('LN').surname).toBe('Dvořáková');
    expect(name('ZD').surname).toBe('');
    expect(name('BP').surname).toBe('');
    expect(withMarriedSurnames(doc, czechSurnameFor)).toBe(doc);
    const xml = serializeTree(doc);
    expect(xml).toContain('<name given="Jana"/>');
    expect(xml).toContain('<name given="Eva" surname="Nováková"/>');
  });

  it('takes a recorded surname that is just the husband’s as filled in, when a file is opened', () => {
    const doc = withMarriedSurnames(tree(), czechSurnameFor, true);
    expect(doc.people.find((p) => p.id === 'EV')!.name).toEqual({ given: 'Eva', surname: 'Nováková', derived: true });
    expect(doc.people.find((p) => p.id === 'LN')!.name.derived).toBeUndefined();
  });

  it('follows the husband’s surname and the marriage, and gives way to a surname typed in', () => {
    let doc = withMarriedSurnames(tree(), czechSurnameFor);
    doc = withMarriedSurnames(updatePerson(doc, 'PM', { name: { surname: 'Mikulka' } }), czechSurnameFor);
    expect(doc.people.find((p) => p.id === 'JA')!.name.surname).toBe('Mikulková');
    doc = withMarriedSurnames(updatePerson(doc, 'JA', { name: { surname: 'Malá' } }), czechSurnameFor);
    expect(doc.people.find((p) => p.id === 'JA')!.name).toEqual({ given: 'Jana', surname: 'Malá' });
    doc = withMarriedSurnames(updatePerson(doc, 'JA', { name: { surname: '' } }), czechSurnameFor);
    expect(doc.people.find((p) => p.id === 'JA')!.name).toEqual({ given: 'Jana', surname: 'Mikulková', derived: true });
    const ended = { ...doc, families: doc.families.map((f) => (f.id === 'F1' ? { ...f, end: { reason: 'divorce' as const } } : f)) };
    expect(withMarriedSurnames(ended, czechSurnameFor).people.find((p) => p.id === 'JA')!.name).toEqual({ given: 'Jana', surname: '' });
  });
});
