/**
 * Where a person's surname at birth comes from when the file does not say:
 * their father's surname, in the form for their sex in the language of the chart
 * (in Czech a daughter of Mikula is Mikulová).
 */
import { surnameKey } from './names';
import { TreeIndex } from './tree-index';
import { Person, Sex } from './types';

/**
 * How a language changes a surname with sex. `known` are surnames of men in
 * the tree, to tell which masculine form a feminine one comes from.
 */
export type SurnameForm = (surname: string, sex: Sex, known?: readonly string[]) => string;

/** For languages whose surnames do not change with sex. */
export const SAME_SURNAME: SurnameForm = (surname) => surname.trim();

/** The father of the family a person was born into, when recorded. */
export function birthFather(index: TreeIndex, personId: string): Person | undefined {
  for (const f of index.parentFamilies(personId)) {
    if (index.childRelation(f, personId) !== 'biological') continue;
    for (const id of f.partners) {
      const p = index.person(id);
      if (p?.sex === 'male') return p;
    }
  }
  return undefined;
}

/**
 * A man's surname as the male line gives it: as recorded, or else the one he was born with, or else his
 * father's when nobody typed his in either, and so on up. Empty when nobody up the line has one.
 */
export function lineSurname(index: TreeIndex, man: Person, seen = new Set<string>()): string {
  const own = man.name.surname.trim() || man.name.birthSurname?.trim();
  if (own) return own;
  if (seen.has(man.id)) return '';
  seen.add(man.id);
  const father = birthFather(index, man.id);
  return father ? lineSurname(index, father, seen) : '';
}

/**
 * A person's surname taken from their father, in the form for their sex; empty when no father is recorded.
 * A father whose own surname nobody typed in passes on the one he has from his father.
 */
export function surnameFromFather(index: TreeIndex, person: Person, form: SurnameForm, sex: Sex = person.sex): string {
  const father = birthFather(index, person.id);
  const base = father ? lineSurname(index, father) : '';
  return base ? form(base, sex, [base]) : '';
}

/**
 * The surname a person was born with: as recorded, or else their father's.
 * When their own surname is a form of the same name as their father's (a
 * daughter recorded as Grant rather than Grantová), it is their own.
 */
export function birthSurname(index: TreeIndex, person: Person, form: SurnameForm): string {
  const recorded = person.name.birthSurname?.trim();
  if (recorded) return recorded;
  const own = person.name.surname.trim();
  const fromFather = surnameFromFather(index, person, form);
  if (!fromFather) return own;
  // The same name however it is written (Nováková, the daughter of a Nowak): theirs as they have it.
  return own && surnameKey(own, true) === surnameKey(fromFather, true) ? own : fromFather;
}

/**
 * Whether nobody knows the surname a married woman was born with: she bears the name of a husband (a form of
 * it, however it is written), no surname at birth is entered for her, and no father is in the tree whose name
 * it would be. A woman whose surname is not her husband's is taken to have kept her own.
 */
export function birthSurnameUnknown(index: TreeIndex, person: Person): boolean {
  if (person.sex !== 'female' || person.name.birthSurname?.trim()) return false;
  const own = person.name.surname.trim();
  if (!own) return false;
  const father = birthFather(index, person.id);
  if (father && lineSurname(index, father)) return false;
  const key = surnameKey(own, true);
  return index.partnerFamilies(person.id).some((f) => {
    if (f.kind !== 'marriage') return false;
    return f.partners.some((id) => {
      const partner = id !== person.id ? index.person(id) : undefined;
      // A husband whose surname nobody typed in has his father's, and so does she.
      return !!partner && surnameKey(partner.sex === 'male' ? lineSurname(index, partner) : partner.name.surname, true) === key;
    });
  });
}

/** Surnames of the men in the tree, most common first. */
export function maleSurnames(index: TreeIndex): string[] {
  const counts = new Map<string, number>();
  for (const p of index.doc.people) {
    const s = p.sex === 'male' ? p.name.surname.trim() : '';
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
