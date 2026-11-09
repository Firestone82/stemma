import { sampleDocument } from '../model/sample';
import { DocBuilder } from '../testing/fixtures';
import { assignColors } from './tinctures';

describe('family colours', () => {
  const doc = sampleDocument();
  const byId = (id: string) => doc.people.find((p) => p.id === id)!;

  it('gives the largest family the first colour and shares it between spellings', () => {
    const { byPerson, legend } = assignColors(doc, 'family', new Map());
    expect(legend[0]).toMatchObject({ label: 'Ashworth', tincture: 'azure' });
    // Šárka was born Nováková; her father is Novák. One family, one colour.
    expect(byPerson.get('I15')).toBe(byPerson.get('I16'));
    expect(legend.find((l) => l.label === 'Novák')?.count).toBe(2);
    // Married-in women keep the colour of the family they were born into.
    expect(byPerson.get('I9')).toBe(byPerson.get('I4'));
    expect(byId('I9').name.surname).toBe('Ashworth');
  });

  it('gives fourteen families a colour each, and the families on a print colours of their own', () => {
    const b = new DocBuilder();
    for (let i = 0; i < 20; i++) {
      const name = `Fam${String(i).padStart(2, '0')}`;
      // Bigger families first, so the order of the colours is known.
      for (let n = 0; n < 40 - i; n++) b.person(`${name}-${n}`, 'X', name, 'male');
    }
    const whole = b.build();
    const chart = assignColors(whole, 'family', new Map());
    expect(new Set(chart.legend.slice(0, 14).map((l) => l.tincture)).size).toBe(14);
    // Families 0 and 14 share a colour in the whole tree; on a print with only some families, they do not.
    expect(chart.legend[14].tincture).toBe(chart.legend[0].tincture);
    const part = { ...whole, people: whole.people.filter((p) => /Fam(00|03|14|15|17)-/.test(p.id)) };
    const print = assignColors(part, 'family', new Map(), undefined, whole);
    expect(print.legend).toHaveLength(5);
    expect(new Set(print.legend.map((l) => l.tincture)).size).toBe(5);
    // The families that had a colour of their own keep it.
    expect(print.legend[0].tincture).toBe(chart.legend[0].tincture);
    expect(print.legend[1].tincture).toBe(chart.legend[3].tincture);
  });

  it('colours the lines the home person descends from before bigger families that married in', () => {
    const b = new DocBuilder();
    // Twelve in-law families of three, and the home person's great-grandmother's line of two.
    const inLaws: string[] = [];
    for (let i = 0; i < 12; i++) {
      const name = `Inlaw${i}`;
      for (const n of [1, 2, 3]) b.person(`${name}${n}`, 'X', name, 'male');
      b.family(`F${name}`, [`${name}1`], [`${name}2`, `${name}3`]);
      inLaws.push(name);
    }
    b.person('GGF', 'Jan', 'Heczko', 'male');
    b.person('GGM', 'Anna', 'Heczková', 'female');
    b.person('GM', 'Anna', 'Pinkasová', 'female');
    b.people.find((p) => p.id === 'GM')!.name.birthSurname = 'Heczková';
    b.person('GF', 'Pavel', 'Pinkas', 'male');
    b.person('ME', 'Věra', 'Pinkasová', 'female');
    b.family('FGG', ['GGF', 'GGM'], ['GM']);
    b.family('FG', ['GF', 'GM'], ['ME']);
    const doc = b.build();
    doc.meta.homePersonId = 'ME';
    const { byPerson, legend } = assignColors(doc, 'family', new Map());
    // Heczko and Pinkas are lines of the tree: they get colours although every in-law family is bigger.
    expect(byPerson.get('GGF')).not.toBe('argent');
    expect(byPerson.get('GGF')).toBe(byPerson.get('GM'));
    expect(byPerson.get('GF')).not.toBe('argent');
    expect(
      legend
        .slice(0, 2)
        .map((l) => l.label)
        .sort(),
    ).toEqual(['Heczko', 'Pinkas']);
    // The lines come first in the legend, then the in-laws, most numerous first.
    expect(legend[2].count).toBe(3);
  });

  it('leaves single members of a family neutral', () => {
    const { byPerson, legend } = assignColors(doc, 'family', new Map());
    expect(byPerson.get('I14')).toBe('argent'); // Ruth Kelly
    expect(legend[legend.length - 1]).toMatchObject({ label: 'Others', tincture: 'argent' });
  });

  it('colours by generation from the first row with people', () => {
    const ranks = new Map(doc.people.map((p, i) => [p.id, i < 5 ? 1 : 2]));
    const { byPerson, legend } = assignColors(doc, 'generation', ranks);
    expect(byPerson.get('I1')).toBe('azure');
    expect(legend.map((l) => l.label)).toEqual(['I', 'II']);
  });

  it('leaves people who are not on the chart out of the generations', () => {
    const ranks = new Map(doc.people.slice(0, 5).map((p) => [p.id, 1]));
    const { byPerson, legend } = assignColors(doc, 'generation', ranks);
    expect(legend).toEqual([{ key: '1', label: 'I', tincture: 'azure', count: 5 }]);
    expect(byPerson.get(doc.people[5].id)).toBe('argent');
  });

  it('keeps the colours of the whole tree in a part of it, and counts the part', () => {
    const all = assignColors(doc, 'family', new Map());
    // Only the Moreaus and one Ashworth.
    const part = { ...doc, people: doc.people.filter((p) => p.name.surname === 'Moreau' || p.id === 'I1') };
    const { byPerson, legend } = assignColors(part, 'family', new Map(), undefined, doc);
    for (const p of part.people) expect(byPerson.get(p.id)).toBe(all.byPerson.get(p.id));
    expect(legend.find((l) => l.label === 'Ashworth')).toMatchObject({ tincture: 'azure', count: 1 });
    expect(legend.some((l) => l.label === 'Novák')).toBe(false);
  });

  it('colours by sex', () => {
    const { byPerson } = assignColors(doc, 'sex', new Map());
    expect(byPerson.get('I1')).toBe('azure');
    expect(byPerson.get('I2')).toBe('sanguine');
  });
});
