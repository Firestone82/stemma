import { english } from '../lang/en';
import { TreeIndex } from '../model/tree-index';
import { DocBuilder } from '../testing/fixtures';
import { familyDocument } from './family-document';
import { OutlinePerson, familyOutline } from './outline';
import { crc32 } from './zip';

/** The files of a stored (uncompressed) ZIP archive, by name. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const out = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(view.getUint32(at + 14, true), name).toBe(crc32(data));
    out.set(name, dec.decode(data));
    at += 30 + nameLength + size;
  }
  return out;
}

/**
 * Jan Novák with two wives: with Eva, Petr (who has a son) and Marie (who married a Mikula and has a daughter,
 * a Mikula); with Hana, Karel. Karel is left out of prints.
 */
function tree() {
  const b = new DocBuilder();
  b.person('jan', 'Jan', 'Novák', 'male', '1900');
  b.person('eva', 'Eva', 'Nováková', 'female', '1902');
  b.person('hana', 'Hana', 'Nováková', 'female', '1910');
  b.person('petr', 'Petr', 'Novák', 'male', '1925');
  b.person('marie', 'Marie', 'Mikulová', 'female', '1927');
  b.person('karel', 'Karel', 'Novák', 'male', '1935');
  b.person('josef', 'Josef', 'Mikula', 'male', '1924');
  b.person('anna', 'Anna', 'Mikulová', 'female');
  b.person('tomas', 'Tomáš', 'Novák', 'male', '1955');
  b.person('lida', 'Lída', 'Nováková', 'female', '1930');
  b.family('f1', ['jan', 'eva'], ['petr', 'marie'], { start: { date: { value: '1924-06-01' } } });
  b.family('f2', ['jan', 'hana'], ['karel']);
  b.family('f3', ['josef', 'marie'], ['anna']);
  b.family('f4', ['petr', 'lida'], ['tomas']);
  const doc = b.build('Novákovi');
  doc.people.find((p) => p.id === 'marie')!.name.birthSurname = 'Nováková';
  doc.people.find((p) => p.id === 'eva')!.name.birthSurname = 'Dvořáková';
  doc.people.find((p) => p.id === 'hana')!.name.birthSurname = 'Malá';
  doc.people.find((p) => p.id === 'lida')!.name.birthSurname = 'Černá';
  doc.people.find((p) => p.id === 'karel')!.hiddenFromPrint = true;
  doc.people.find((p) => p.id === 'anna')!.death = {};
  const born: Record<string, string> = {
    jan: 'novak',
    petr: 'novak',
    marie: 'novak',
    karel: 'novak',
    tomas: 'novak',
    eva: 'dvorak',
    hana: 'mala',
    lida: 'cerna',
    josef: 'mikula',
    anna: 'mikula',
  };
  const labels: Record<string, string> = { novak: 'Novák', dvorak: 'Dvořák', mala: 'Malá', cerna: 'Černá', mikula: 'Mikula' };
  const birthSurnames = new Map(doc.people.map((p) => [p.id, p.name.birthSurname ?? p.name.surname]));
  return familyOutline({
    doc,
    index: new TreeIndex(doc),
    keyOf: new Map(Object.entries(born)),
    labelOf: (k) => labels[k] ?? k,
    birthSurnames,
    language: english,
    compare: (a, b) => a.localeCompare(b, 'cs'),
  });
}

describe('family document', () => {
  const families = tree();
  const novak = families.find((f) => f.key === 'novak')!;
  const people = novak.rows.filter((r): r is OutlinePerson => r.kind === 'person');

  it('has a table for each family, by name', () => {
    expect(families.map((f) => f.label)).toEqual(['Černá', 'Dvořák', 'Malá', 'Mikula', 'Novák']);
  });

  it('sets out a family from its oldest member down, children with how they are children', () => {
    expect(people.map((r) => [r.level, r.personId, r.childRelation])).toEqual([
      [0, 'jan', undefined],
      [1, 'petr', 'biological'],
      [2, 'tomas', 'biological'],
      [1, 'marie', 'biological'],
      [2, 'anna', 'biological'],
    ]);
    expect(novak.people).toBe(4);
    expect(novak.generations).toBe(3);
  });

  it('names partners with their dates and wedding, and children under the parent they had them with', () => {
    const jan = people[0];
    expect(jan.partners.map((p) => p.name)).toEqual(['Eva Nováková, née Dvořáková', 'Hana Nováková, née Malá']);
    // No wedding dates, no places.
    expect(jan.partners[0].union).toBe('married');
    expect(jan.birth).toBe('1900');
    // Not known: a question mark; died, but nobody knows when: one too.
    expect(people.find((r) => r.personId === 'marie')!.death).toBe('');
    const anna = people.find((r) => r.personId === 'anna')!;
    expect([anna.birth, anna.death]).toEqual(['?', '?']);
    // Karel, Hana's only child, is left out of prints: no heading over nobody.
    expect(novak.rows.filter((r) => r.kind === 'union')).toHaveLength(0);
  });

  it('lists a daughter’s children with the family they carry on', () => {
    const marie = people.find((r) => r.personId === 'marie')!;
    expect(marie.bornAs).toBe('née Nováková');
    const anna = people.find((r) => r.personId === 'anna')!;
    expect(anna.continuesIn).toBe('Mikula');
    expect(families.find((f) => f.key === 'mikula')!.rows.map((r) => r.kind === 'person' && r.personId)).toEqual(['josef', 'anna']);
  });

  it('numbers everyone once in the whole document, and keeps the number wherever they appear', () => {
    // Families by name: Černá (Lída), Dvořák (Eva), Malá (Hana), Mikula (Josef, Anna), Novák (Jan, Petr, Tomáš, Marie).
    const numberOf = new Map(families.flatMap((f) => f.rows.flatMap((r) => (r.kind === 'person' ? [[r.personId, r.number] as const] : []))));
    expect(Object.fromEntries(numberOf)).toEqual({ lida: '1', eva: '2', hana: '3', josef: '4', anna: '5', jan: '6', petr: '7', tomas: '8', marie: '9' });
    // Anna under her mother in the Novák table, and Eva among Jan's partners, with their own numbers.
    expect(people.find((r) => r.personId === 'anna')!.number).toBe('5');
    expect(people[0].partners[0].number).toBe('2');
  });

  it('is a Word document with the families in it', () => {
    const files = unzip(
      familyDocument({
        title: 'Novákovi & co',
        families,
        language: 'en',
        now: new Date(2026, 10, 22),
        words: {
          heading: 'Families and their branches',
          date: '22 November 2026',
          contents: 'Families',
          number: 'No.',
          name: 'Name',
          born: 'Born',
          died: 'Died',
          child: (sex) => (sex === 'male' ? 's' : sex === 'female' ? 'd' : 'c'),
          listedAbove: 'listed above',
          summary: (p, g) => `${p} people, ${g} generations`,
          with: (n) => `Children with ${n}`,
          withUnknown: 'Children with an unknown partner',
          continuesIn: (f) => `continues in the ${f} family`,
          see: (n) => `No. ${n}`,
          legend: {
            heading: 'Legend',
            entries: [
              { symbol: 's', meaning: 'son' },
              { symbol: '?', meaning: 'not known' },
            ],
          },
        },
      }),
    );
    expect([...files.keys()]).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/styles.xml',
        'word/footer1.xml',
        'word/_rels/document.xml.rels',
      ]),
    );
    const body = files.get('word/document.xml')!;
    expect(body).toContain('Novákovi &amp; co');
    expect(body).toContain('>Tomáš Novák<');
    expect(body).toContain('continues in the Mikula family');
    expect(body).toContain('<w:tblHeader/>');
    // How a child is a child, in front of the name.
    expect(body).toContain('>d  <');
    expect(body).toContain('>Legend<');
    // The contents: dots up to the page number, which points at the family's heading.
    expect(body).toContain('w:leader="dot"');
    expect(body).toContain('PAGEREF family-5');
    expect(body).toContain('w:name="family-5"');
    // With the page it is on worked out already, for programs that do not fill fields in.
    const pages = [...body.matchAll(/PAGEREF family-\d+ \\h <\/w:instrText>.*?<w:t xml:space="preserve">([^<]*)</g)].map((m) => m[1]);
    expect(pages).toHaveLength(5);
    for (const page of pages) expect(page).toMatch(/^\d+$/);
    expect(body).not.toContain('Karel');
    // Well-formed XML.
    for (const [name, xml] of files) {
      const parsed = new DOMParser().parseFromString(xml, 'application/xml');
      expect(parsed.getElementsByTagName('parsererror'), name).toHaveLength(0);
    }
  });
});
