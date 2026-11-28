/**
 * A part of the tree taken out to a file of its own (one family, a branch), for someone else to fill in, and
 * merged back later (see merge.ts).
 *
 * The part is an ordinary tree file: it opens, is edited and saved in Stemma like any other. It also carries a
 * <part> record of how its people and families were when they were taken out, field by field (as short
 * fingerprints, not the data itself). Merging back compares the tree, the file and that record: a field changed
 * only in the file is taken from it, a field changed only in the tree stays, and only a field changed on both
 * sides is asked about.
 */
import { TreeIndex } from '../model/tree-index';
import { Family, FamilyChild, LifeEvent, PartFamilyBase, Person, TreeDocument } from '../model/types';
import { ScopeOptions, scopeDocument } from '../poster/scope';

/** How far a part reaches from the person it is taken around (see scopeDocument). */
export type PartScope = Pick<ScopeOptions, 'centerId' | 'ancestors' | 'descendants' | 'branches' | 'inLawFamilies' | 'siblingsOnly'>;

/** The fields of a person that are merged one by one. Places are not among them: the app keeps no places. */
export const PERSON_FIELDS = ['sex', 'given', 'surname', 'birthSurname', 'birth', 'death', 'notes', 'photo', 'hidden'] as const;
export type PersonField = (typeof PERSON_FIELDS)[number];

/**
 * The fields of a family that are merged one by one; partners and children are merged as lists. `status` is how the
 * couple stand (married, engaged, divorced): its kind, engagement and end together. Marriage dates are not among them.
 */
export const FAMILY_FIELDS = ['status', 'notes', 'kids'] as const;
export type FamilyField = (typeof FAMILY_FIELDS)[number];

function eventText(e: LifeEvent | undefined): string {
  if (!e) return '';
  const d = e.date;
  return [d?.value ?? '', d?.qualifier ?? '', d?.text ?? '', e.dateUnknown ? '?' : ''].join('|').replace(/^\|+$/, '');
}

/** A field of a person as text, to compare (the empty string for nothing). */
export function personValue(p: Person, field: PersonField): string {
  switch (field) {
    case 'sex':
      return p.sex === 'unknown' ? '' : p.sex;
    case 'given':
      return p.name.given.trim() + (p.name.givenUnknown ? '|?' : '');
    case 'surname':
      // A surname taken from the husband is not recorded (see PersonName.derived).
      return p.name.derived ? '' : p.name.surname.trim();
    case 'birthSurname':
      return p.name.birthSurname?.trim() ?? '';
    case 'birth':
      return eventText(p.birth);
    case 'death':
      return p.death ? `+${eventText(p.death)}` : '';
    case 'notes':
      return p.notes?.trim() ?? '';
    case 'photo':
      return p.photo ?? '';
    case 'hidden':
      return p.hiddenFromPrint ? 'hidden' : '';
  }
}

/** The person `target` with `field` as `from` has it. */
export function withPersonField(target: Person, from: Person, field: PersonField): Person {
  const next: Person = { ...target, name: { ...target.name } };
  switch (field) {
    case 'sex':
      next.sex = from.sex;
      break;
    case 'given':
      next.name.given = from.name.given;
      if (from.name.givenUnknown) next.name.givenUnknown = true;
      else delete next.name.givenUnknown;
      break;
    case 'surname':
      next.name.surname = from.name.derived ? '' : from.name.surname;
      delete next.name.derived;
      break;
    case 'birthSurname':
      if (from.name.birthSurname) next.name.birthSurname = from.name.birthSurname;
      else delete next.name.birthSurname;
      break;
    case 'birth':
      if (from.birth) next.birth = from.birth;
      else delete next.birth;
      break;
    case 'death':
      if (from.death) next.death = from.death;
      else delete next.death;
      break;
    case 'notes':
      if (from.notes) next.notes = from.notes;
      else delete next.notes;
      break;
    case 'photo':
      if (from.photo) next.photo = from.photo;
      else delete next.photo;
      break;
    case 'hidden':
      if (from.hiddenFromPrint) next.hiddenFromPrint = true;
      else delete next.hiddenFromPrint;
      break;
  }
  return next;
}

function childText(c: FamilyChild): string {
  return [c.personId, c.relation === 'biological' ? '' : c.relation, c.birthGroup ?? ''].join(':');
}

/** A field of a family as text, to compare. `kids` is how each child is a child (adopted, twins), not who they are. */
export function familyValue(f: Family, field: FamilyField): string {
  switch (field) {
    case 'status':
      return [f.kind, f.engagement ? 'engaged' : '', f.end ? `ended:${f.end.reason ?? ''}` : ''].join('|');
    case 'notes':
      return f.notes?.trim() ?? '';
    case 'kids':
      return f.children.map(childText).sort().join(' ');
  }
}

/** A short fingerprint of a text (FNV-1a), the empty string for nothing. */
export function fingerprint(text: string): string {
  if (!text) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function personFingerprints(p: Person): string {
  return PERSON_FIELDS.map((f) => fingerprint(personValue(p, f))).join('.');
}

export function familyFingerprints(f: Family): string {
  return FAMILY_FIELDS.map((k) => fingerprint(familyValue(f, k))).join('.');
}

/** The fingerprint of `field` in a record's joined fingerprints, or undefined when the record has none. */
export function baseOf<F extends string>(joined: string | undefined, fields: readonly F[], field: F): string | undefined {
  if (joined === undefined) return undefined;
  const parts = joined.split('.');
  if (parts.length !== fields.length) return undefined;
  return parts[fields.indexOf(field)];
}

export interface PartOptions extends PartScope {
  /** The part's title. */
  title: string;
  now?: Date;
}

/**
 * The part of `doc` around `centerId` (see scopeDocument for how far it reaches), as a tree of its own with the
 * record of how it was (PartInfo). Everyone is in it, hidden from prints or not; print settings stay behind.
 */
export function partDocument(doc: TreeDocument, index: TreeIndex, options: PartOptions): TreeDocument {
  const scope = scopeDocument(doc, index, { ...options, showHidden: true });
  const now = (options.now ?? new Date()).toISOString();
  const people: Record<string, string> = {};
  for (const p of scope.doc.people) people[p.id] = personFingerprints(p);
  const families: Record<string, PartFamilyBase> = {};
  for (const f of scope.doc.families) {
    families[f.id] = { fields: familyFingerprints(f), partners: [...f.partners], children: f.children.map((c) => c.personId) };
  }
  return {
    meta: { title: options.title, description: doc.meta.description, created: now, modified: now, homePersonId: options.centerId },
    view: doc.view,
    people: scope.doc.people,
    families: scope.doc.families,
    part: { source: doc.meta.title, exported: now, rootId: options.centerId, people, families },
  };
}

/** How many people and families a part would have. */
export function partSize(doc: TreeDocument, index: TreeIndex, options: PartScope): { people: number; families: number } {
  const scope = scopeDocument(doc, index, { ...options, showHidden: true });
  return { people: scope.doc.people.length, families: scope.doc.families.length };
}
