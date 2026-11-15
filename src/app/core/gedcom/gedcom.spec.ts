import { sampleDocument } from '../model/sample';
import { emptyDocument } from '../model/types';
import { gedDate, toGedcom } from './gedcom';

describe('GEDCOM export', () => {
  const doc = sampleDocument();
  const ged = toGedcom(doc, { now: new Date(2026, 10, 15, 14, 30, 0), filename: 'ashworth.ged' });
  const lines = ged.replace(/^\ufeff/, '').split('\r\n');
  /** The lines of the record that starts with `head` ("0 @I1@ INDI"), up to the next record. */
  const record = (head: string) => {
    const at = lines.indexOf(head);
    expect(at, head).toBeGreaterThanOrEqual(0);
    const end = lines.findIndex((l, i) => i > at && l.startsWith('0 '));
    return lines.slice(at, end);
  };
  const refOf = (id: string) => `@I${doc.people.findIndex((p) => p.id === id) + 1}@`;
  const famOf = (id: string) => `@F${doc.families.findIndex((f) => f.id === id) + 1}@`;

  it('is a UTF-8 GEDCOM 5.5.1 file with a header, a submitter and a trailer', () => {
    expect(ged.startsWith('\ufeff0 HEAD\r\n')).toBe(true);
    expect(ged.endsWith('0 TRLR\r\n')).toBe(true);
    const head = record('0 HEAD');
    expect(head).toContain('1 GEDC');
    expect(head).toContain('2 VERS 5.5.1');
    expect(head).toContain('2 FORM LINEAGE-LINKED');
    expect(head).toContain('1 CHAR UTF-8');
    expect(head).toContain('1 DATE 15 NOV 2026');
    expect(head).toContain('1 FILE ashworth.ged');
    expect(head).toContain('1 SUBM @SUBM@');
    expect(lines).toContain('0 @SUBM@ SUBM');
    // Every line is "level tag [value]" and short enough.
    for (const l of lines.filter(Boolean)) {
      expect(l).toMatch(/^\d+ (@[A-Z0-9]+@ )?[A-Z_]+( .*)?$/);
      expect(l.length).toBeLessThanOrEqual(255);
    }
  });

  it('writes everyone with their names, sex, birth and death', () => {
    expect(lines.filter((l) => / INDI$/.test(l))).toHaveLength(doc.people.length);
    // Šárka: born Nováková, now Ashworth.
    const sarka = record(`0 ${refOf('I15')} INDI`);
    expect(sarka).toEqual(
      expect.arrayContaining(['1 NAME Šárka /Nováková/', '2 GIVN Šárka', '2 SURN Nováková', '1 NAME Šárka /Ashworth/', '2 TYPE married', '1 SEX F']),
    );
    expect(sarka.indexOf('1 NAME Šárka /Nováková/')).toBeLessThan(sarka.indexOf('1 NAME Šárka /Ashworth/'));
    expect(sarka).toEqual(expect.arrayContaining(['1 BIRT', '2 DATE 8 MAR 1964', '2 PLAC Brno, Czechia']));
    // Someone who has died has a death, even with nothing known about it.
    const thomas = record(`0 ${refOf('I1')} INDI`);
    expect(thomas.some((l) => l.startsWith('1 DEAT'))).toBe(true);
    expect(thomas).toContain('1 SEX M');
  });

  it('writes the families: husband, wife, children in order, wedding, divorce, partners', () => {
    expect(lines.filter((l) => / FAM$/.test(l))).toHaveLength(doc.families.length);
    const f5 = record(`0 ${famOf('F5')} FAM`);
    expect(f5).toEqual([
      `0 ${famOf('F5')} FAM`,
      `1 HUSB ${refOf('I11')}`,
      `1 WIFE ${refOf('I14')}`,
      `1 CHIL ${refOf('I20')}`,
      `1 CHIL ${refOf('I21')}`,
      '1 MARR',
      '2 DATE 1979',
      '2 PLAC Manchester, England',
      '1 DIV',
      '2 DATE 1988',
    ]);
    // The partnership with an engagement.
    const f11 = record(`0 ${famOf('F11')} FAM`);
    expect(f11).toEqual(expect.arrayContaining(['1 ENGA', '2 DATE 24 DEC 2024', '1 MARR', '2 TYPE Partners', '2 DATE 2019']));
    // Brothers and sisters whose parents nobody knows: a family of children only.
    expect(record(`0 ${famOf('F2')} FAM`)).toEqual([`0 ${famOf('F2')} FAM`, `1 CHIL ${refOf('I2')}`, `1 CHIL ${refOf('I3')}`]);
    // Links back from the people, with the adopted son marked so.
    const daniel = record(`0 ${refOf('I13')} INDI`);
    expect(daniel).toEqual(expect.arrayContaining([`1 FAMC ${famOf('F4')}`, '2 PEDI adopted']));
    const simon = record(`0 ${refOf('I11')} INDI`);
    expect(simon).toEqual(expect.arrayContaining([`1 FAMC ${famOf('F4')}`, '2 PEDI birth', `1 FAMS ${famOf('F5')}`, `1 FAMS ${famOf('F6')}`]));
  });

  it('writes dates as GEDCOM does', () => {
    expect(gedDate({ value: '1923-03-07' })).toBe('7 MAR 1923');
    expect(gedDate({ value: '1923-03' })).toBe('MAR 1923');
    expect(gedDate({ value: '1923', qualifier: 'about' })).toBe('ABT 1923');
    expect(gedDate({ value: '1923', qualifier: 'before' })).toBe('BEF 1923');
    expect(gedDate({ value: '', text: 'Easter (1902)' })).toBe('(Easter 1902)');
    expect(gedDate({ value: '' })).toBe('');
  });

  it('carries long and many-line notes on, and doubles @', () => {
    const d = emptyDocument('Notes');
    d.people.push({ id: 'p', sex: 'other', name: { given: 'Al', surname: '' }, notes: `First line\nmail: al@example.com\n${'word '.repeat(80)}` });
    const out = toGedcom(d).split('\r\n');
    const at = out.indexOf('1 NOTE First line');
    expect(at).toBeGreaterThan(0);
    expect(out[at + 1]).toBe('2 CONT mail: al@@example.com');
    expect(out[at + 2].startsWith('2 CONT word')).toBe(true);
    expect(out[at + 3].startsWith('2 CONC ')).toBe(true);
    // Joined back, the long line is whole.
    let joined = out[at + 2].slice(7);
    for (let i = at + 3; out[i]?.startsWith('2 CONC '); i++) joined += out[i].slice(7);
    expect(joined.trim()).toBe('word '.repeat(80).trim());
    expect(out).toContain('1 SEX U');
    expect(out).toContain('1 NAME Al');
  });
});
