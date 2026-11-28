import { DocBuilder } from '../testing/fixtures';
import { TreeIndex } from '../model/tree-index';
import { TreeDocument } from '../model/types';
import { parseTree } from '../xml/parser';
import { serializeTree } from '../xml/serializer';
import { planMerge } from './merge';
import { partDocument, partSize } from './part';

/** Grandparents, their two sons with wives, and a grandchild each. */
function tree(): TreeDocument {
  const b = new DocBuilder();
  b.person('G1', 'Jan', 'Novák', 'male', '1920');
  b.person('G2', 'Marie', 'Nováková', 'female', '1922');
  b.person('A', 'Karel', 'Novák', 'male', '1945');
  b.person('AW', 'Eva', 'Nováková', 'female', '1947');
  b.person('B', 'Petr', 'Novák', 'male', '1950');
  b.person('BW', 'Jana', 'Nováková', 'female', '1952');
  b.person('A1', 'Tomáš', 'Novák', 'male', '1970');
  b.person('B1', 'Lucie', 'Nováková', 'female', '1975');
  b.family('F0', ['G1', 'G2'], ['A', 'B']);
  b.family('FA', ['A', 'AW'], ['A1']);
  b.family('FB', ['B', 'BW'], ['B1']);
  return b.build('Novák family');
}

/** The part around Karel (his descendants, with partners), as it comes back from the file. */
function exported(doc = tree()): TreeDocument {
  const part = partDocument(doc, new TreeIndex(doc), {
    centerId: 'A',
    ancestors: 0,
    descendants: 'all',
    branches: 0,
    title: 'Karel',
    now: new Date('2026-11-28T10:00:00Z'),
  });
  return parseTree(serializeTree(part)).doc;
}

describe('parts of the tree', () => {
  it('takes out the branch around someone, with a record of how it was, that survives the file', () => {
    const doc = tree();
    const part = exported(doc);
    expect(part.people.map((p) => p.id).sort()).toEqual(['A', 'A1', 'AW']);
    expect(part.families.map((f) => f.id)).toEqual(['FA']);
    expect(part.meta.homePersonId).toBe('A');
    expect(part.part?.source).toBe('Novák family');
    expect(part.part?.rootId).toBe('A');
    expect(Object.keys(part.part!.people).sort()).toEqual(['A', 'A1', 'AW']);
    expect(part.part!.families['FA']).toEqual(expect.objectContaining({ partners: ['A', 'AW'], children: ['A1'] }));
    expect(partSize(doc, new TreeIndex(doc), { centerId: 'A', ancestors: 0, descendants: 'all', branches: 0 })).toEqual({ people: 3, families: 1 });
    // A part saved again keeps its record.
    expect(parseTree(serializeTree(part)).doc.part).toEqual(part.part);
  });

  it('changes nothing when the file comes back as it went', () => {
    const doc = tree();
    const plan = planMerge(doc, exported(doc));
    expect(plan.unchanged).toBe(true);
    expect(plan.doc).toBe(doc);
  });

  it('adds the people and families filled in elsewhere, under the right parents', () => {
    const doc = tree();
    const part = exported(doc);
    part.people.push({ id: 'Inew1', sex: 'female', name: { given: 'Klára', surname: 'Nováková' }, birth: { date: { value: '1973' } } });
    part.people.push({ id: 'Inew2', sex: 'female', name: { given: 'Iva', surname: 'Malá' } });
    part.people.push({ id: 'Inew3', sex: 'male', name: { given: 'Ondřej', surname: 'Novák' } });
    part.families.find((f) => f.id === 'FA')!.children.push({ personId: 'Inew1', relation: 'biological' });
    part.families.push({ id: 'Fnew', kind: 'marriage', partners: ['A1', 'Inew2'], children: [{ personId: 'Inew3', relation: 'biological' }] });
    const plan = planMerge(doc, part);
    expect(plan.conflicts).toEqual([]);
    expect(plan.summary).toEqual(expect.objectContaining({ added: 3, familiesAdded: 1, familiesUpdated: 1 }));
    const fa = plan.doc.families.find((f) => f.id === 'FA')!;
    expect(fa.children.map((c) => c.personId)).toEqual(['A1', 'Inew1']);
    expect(plan.doc.families.find((f) => f.id === 'Fnew')?.partners).toEqual(['A1', 'Inew2']);
    // The rest of the tree is as it was.
    expect(plan.doc.families.find((f) => f.id === 'F0')).toBe(doc.families.find((f) => f.id === 'F0'));
  });

  it('takes each field from the side that changed it, and asks only where both did', () => {
    const doc = tree();
    const part = exported(doc);
    // In the file: Tomáš's date of birth corrected, Eva's notes and Karel's date of death added.
    part.people.find((p) => p.id === 'A1')!.birth = { date: { value: '1971-03-02' } };
    part.people.find((p) => p.id === 'AW')!.notes = 'Teacher in Brno';
    part.people.find((p) => p.id === 'A')!.death = { date: { value: '2010' } };
    // In the tree since: Eva's birth surname, and Karel's death too, in another year.
    const local: TreeDocument = {
      ...doc,
      people: doc.people.map((p) =>
        p.id === 'AW' ? { ...p, name: { ...p.name, birthSurname: 'Malá' } } : p.id === 'A' ? { ...p, death: { date: { value: '2011' } } } : p,
      ),
    };
    const plan = planMerge(local, part);
    expect(plan.conflicts.map((c) => c.key)).toEqual(['p:A:death']);
    expect(plan.conflicts[0].preferred).toBe('imported');
    const person = (d: TreeDocument, id: string) => d.people.find((p) => p.id === id)!;
    expect(person(plan.doc, 'A1').birth?.date?.value).toBe('1971-03-02');
    expect(person(plan.doc, 'AW').notes).toBe('Teacher in Brno');
    expect(person(plan.doc, 'AW').name.birthSurname).toBe('Malá');
    expect(person(plan.doc, 'A').death?.date?.value).toBe('2010');
    const kept = planMerge(local, part, { take: new Map([['p:A:death', 'local']]) });
    expect(person(kept.doc, 'A').death?.date?.value).toBe('2011');
  });

  it('matches someone new in the file with the same person already in the tree', () => {
    const doc = tree();
    const part = exported(doc);
    // Karel's brother Petr added in the file, with his full date of birth; the tree has him with the year only.
    part.people.push({ id: 'Ip', sex: 'male', name: { given: 'Petr', surname: 'Novák' }, birth: { date: { value: '1950' } } });
    const plan = planMerge(doc, part);
    const petr = plan.newPeople.find((n) => n.person.id === 'Ip')!;
    expect(petr.candidates).toEqual(['B']);
    // Not sure enough to decide alone: added as new until someone says otherwise.
    expect(petr.target).toBeNull();
    const assigned = planMerge(doc, part, { assign: new Map([['Ip', 'B']]) });
    expect(assigned.summary.added).toBe(0);
    expect(assigned.doc.people).toHaveLength(doc.people.length);
  });

  it('takes someone with the same names and full date of birth as the same person without asking', () => {
    const b = new DocBuilder();
    b.person('X', 'Anna', 'Malá', 'female', '1900-01-05');
    const doc = b.build();
    const other = new DocBuilder();
    other.person('Y', 'Anna', 'Malá', 'female', '1900-01-05');
    other.person('Z', 'Josef', 'Malý', 'male');
    other.family('F', ['Z'], ['Y']);
    const plan = planMerge(doc, other.build());
    expect(plan.newPeople.find((n) => n.person.id === 'Y')).toEqual(expect.objectContaining({ target: 'X', auto: true }));
    expect(plan.doc.families[0].children[0].personId).toBe('X');
  });

  it('offers to delete those deleted in the file, and keeps them unless asked', () => {
    const doc = tree();
    const part = exported(doc);
    part.people = part.people.filter((p) => p.id !== 'A1');
    part.families = part.families.map((f) => ({ ...f, children: f.children.filter((c) => c.personId !== 'A1') }));
    const plan = planMerge(doc, part);
    expect(plan.removals.map((r) => r.id)).toEqual(['A1']);
    expect(plan.doc.people.some((p) => p.id === 'A1')).toBe(true);
    expect(plan.doc.families.find((f) => f.id === 'FA')!.children.map((c) => c.personId)).toEqual(['A1']);
    const removed = planMerge(doc, part, { remove: new Set(['A1']) });
    expect(removed.doc.people.some((p) => p.id === 'A1')).toBe(false);
    expect(removed.summary.removed).toBe(1);
  });

  it('does not bring back what the tree has deleted since, nor a child it moved', () => {
    const doc = tree();
    const part = exported(doc);
    const local: TreeDocument = {
      ...doc,
      people: doc.people.filter((p) => p.id !== 'A1'),
      families: doc.families.map((f) => (f.id === 'FA' ? { ...f, children: [] } : f)),
    };
    const plan = planMerge(local, part);
    expect(plan.doc.people.some((p) => p.id === 'A1')).toBe(false);
    expect(plan.newPeople).toEqual([]);
  });

  it('sees a child unlinked in the file, but keeps one the file never had', () => {
    const doc = tree();
    const part = exported(doc);
    part.families = part.families.map((f) => (f.id === 'FA' ? { ...f, children: [] } : f));
    // A child added in the tree since the part went out.
    const local: TreeDocument = {
      ...doc,
      people: [...doc.people, { id: 'A2', sex: 'female', name: { given: 'Věra', surname: 'Nováková' } }],
      families: doc.families.map((f) => (f.id === 'FA' ? { ...f, children: [...f.children, { personId: 'A2', relation: 'biological' }] } : f)),
    };
    const plan = planMerge(local, part);
    expect(plan.doc.families.find((f) => f.id === 'FA')!.children.map((c) => c.personId)).toEqual(['A2']);
  });

  it('merges a file without a record by id, filling gaps and asking about differences', () => {
    const doc = tree();
    const b = new DocBuilder();
    b.person('A', 'Karel', 'Novák', 'male', '1946');
    b.person('A1', 'Tomáš', 'Novák', 'male', '1970');
    const file = b.build();
    file.people[1].notes = 'Lives in Ostrava';
    const plan = planMerge(doc, file);
    expect(plan.conflicts.map((c) => c.key)).toEqual(['p:A:birth']);
    expect(plan.conflicts[0].preferred).toBe('local');
    expect(plan.doc.people.find((p) => p.id === 'A')!.birth?.date?.value).toBe('1945');
    expect(plan.doc.people.find((p) => p.id === 'A1')!.notes).toBe('Lives in Ostrava');
  });
});
