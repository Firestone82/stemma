/**
 * Children born together, twins, triplets and so on, share a birth group in
 * their family (format 1.3). They stand next to each other among the children,
 * and their date and place of birth are kept the same: setting one sets all.
 */
import { OpResult, PersonSource, addSibling } from './operations';
import { ChildRelation, Family, FamilyChild, LifeEvent, TreeDocument } from './types';

/** The most children the forms offer to mark as born together at once. */
export const MAX_BORN_TOGETHER = 12;

export interface BirthGroup {
  familyId: string;
  key: string;
  /** Everyone born together, in the family's order. */
  memberIds: string[];
}

/** The children born together with someone (themselves included), or undefined. */
export function birthGroupOf(doc: TreeDocument, personId: string): BirthGroup | undefined {
  for (const f of doc.families) {
    const me = f.children.find((c) => c.personId === personId);
    if (!me?.birthGroup) continue;
    const memberIds = f.children.filter((c) => c.birthGroup === me.birthGroup).map((c) => c.personId);
    if (memberIds.length > 1) return { familyId: f.id, key: me.birthGroup, memberIds };
  }
  return undefined;
}

/** The number of birth colours (--birth-1…): groups past that reuse them. */
export const BIRTH_COLORS = 6;

/**
 * Which colour (1 to BIRTH_COLORS) a family's birth group is marked with: the
 * groups take them in the order they stand among the children.
 */
export function birthColor(family: Family, key: string): number {
  const keys = [...new Set(family.children.map((c) => c.birthGroup).filter((k): k is string => !!k))];
  return (Math.max(0, keys.indexOf(key)) % BIRTH_COLORS) + 1;
}

/** Twins, triplets…: how many were born together with someone (1 when nobody). */
export function birthCount(doc: TreeDocument, personId: string): number {
  return birthGroupOf(doc, personId)?.memberIds.length ?? 1;
}

/**
 * Adds a brother or sister born together with `personId`, and as many more
 * as it takes for `size` children to be born together: picking quadruplets
 * for a twin adds two. The first one added comes from `source`; the others
 * are new people with the same surname, waiting for their names. Everyone
 * takes the date and place of birth of the group. The result names the first
 * one added.
 */
export function addBornTogether(doc: TreeDocument, personId: string, source: PersonSource, size: number, relation?: ChildRelation): OpResult {
  const first = addSibling(doc, personId, source, relation);
  const have = birthCount(doc, personId);
  const extra = Math.max(0, Math.min(size, MAX_BORN_TOGETHER) - have - 1);
  const added = first.doc.people.find((p) => p.id === first.personId);
  const surname = 'draft' in source ? source.draft.surname : added?.name.surname;
  let next = first.doc;
  const ids = [personId, first.personId];
  for (let i = 0; i < extra; i++) {
    const more = addSibling(next, personId, { draft: { surname, sex: 'unknown' } }, relation);
    next = more.doc;
    ids.push(more.personId);
  }
  return { ...first, doc: linkBirth(next, first.familyId, ids) };
}

function nextKey(f: Family): string {
  const used = new Set(f.children.map((c) => c.birthGroup).filter(Boolean));
  let i = 1;
  while (used.has(String(i))) i++;
  return String(i);
}

/**
 * Marks children of one family as born together. Groups they are already in
 * are joined; everyone moves next to the first of them; and they all take the
 * date and place of birth of the first one who has them.
 */
export function linkBirth(doc: TreeDocument, familyId: string, childIds: readonly string[]): TreeDocument {
  const fam = doc.families.find((f) => f.id === familyId);
  if (!fam) return doc;
  const chosen = fam.children.filter((c) => childIds.includes(c.personId));
  if (chosen.length < 2 && !chosen.some((c) => c.birthGroup)) return doc;
  const joined = new Set(chosen.map((c) => c.birthGroup).filter((k): k is string => !!k));
  const key = chosen.find((c) => c.birthGroup)?.birthGroup ?? nextKey(fam);
  const isMember = (c: FamilyChild) => childIds.includes(c.personId) || (!!c.birthGroup && joined.has(c.birthGroup));
  const first = fam.children.findIndex(isMember);
  const members = fam.children.filter(isMember).map((c) => ({ ...c, birthGroup: key }));
  const others = fam.children.filter((c) => !isMember(c));
  const before = fam.children.slice(0, first).length;
  const children = [...others.slice(0, before), ...members, ...others.slice(before)];
  const next: TreeDocument = { ...doc, families: doc.families.map((f) => (f.id === familyId ? { ...f, children } : f)) };
  const source = members.map((m) => next.people.find((p) => p.id === m.personId)).find((p) => p?.birth?.date?.value || p?.birth?.date?.text || p?.birth?.place);
  return source ? shareBirth(next, source.id) : next;
}

/**
 * Cuts a birth group between `afterChildId` and the child after them: those
 * before stay together, those after form their own group, and anyone left
 * alone is no longer marked as born with someone.
 */
export function splitBirth(doc: TreeDocument, familyId: string, afterChildId: string): TreeDocument {
  return {
    ...doc,
    families: doc.families.map((f) => {
      if (f.id !== familyId) return f;
      const at = f.children.findIndex((c) => c.personId === afterChildId);
      const key = f.children[at]?.birthGroup;
      if (!key) return f;
      const side = (i: number) => f.children.filter((c, j) => c.birthGroup === key && (i <= at ? j <= at : j > at)).length;
      const before = side(at);
      const after = side(at + 1);
      const newKey = nextKey(f);
      return {
        ...f,
        children: f.children.map((c, i) => {
          if (c.birthGroup !== key) return c;
          if (i <= at) return before > 1 ? c : withoutGroup(c);
          return after > 1 ? { ...c, birthGroup: newKey } : withoutGroup(c);
        }),
      };
    }),
  };
}

/**
 * Takes one child out of their birth group; the others stay together, unless
 * only one is left, who is then no longer marked as born with someone.
 */
export function leaveBirth(doc: TreeDocument, familyId: string, childId: string): TreeDocument {
  return {
    ...doc,
    families: doc.families.map((f) => {
      if (f.id !== familyId) return f;
      const key = f.children.find((c) => c.personId === childId)?.birthGroup;
      if (!key) return f;
      const left = f.children.filter((c) => c.birthGroup === key && c.personId !== childId).length;
      return { ...f, children: f.children.map((c) => (c.birthGroup === key && (c.personId === childId || left < 2) ? withoutGroup(c) : c)) };
    }),
  };
}

function withoutGroup(c: FamilyChild): FamilyChild {
  const { birthGroup: _gone, ...rest } = c;
  return rest;
}

/** Gives everyone born with `personId` their date and place of birth. */
export function shareBirth(doc: TreeDocument, personId: string): TreeDocument {
  const group = birthGroupOf(doc, personId);
  const source = doc.people.find((p) => p.id === personId);
  if (!group || !source) return doc;
  const birth: LifeEvent | undefined = source.birth ? { date: source.birth.date, place: source.birth.place } : undefined;
  return {
    ...doc,
    people: doc.people.map((p) => {
      if (p.id === personId || !group.memberIds.includes(p.id)) return p;
      if (!birth?.date && !birth?.place) {
        const { birth: _none, ...rest } = p;
        return rest;
      }
      const next = { ...p.birth, date: birth.date, place: birth.place };
      if (!next.date) delete next.date;
      if (!next.place) delete next.place;
      return { ...p, birth: next };
    }),
  };
}
