/**
 * A married woman's surname comes from her husband's when the file does not
 * say: Mikula's wife is Mikulová (in Czech) or Mikula (in English), without
 * anyone typing it. Such a surname is filled in here, marked `derived`, kept
 * up to date as the tree changes, and left out of the file when it is saved.
 */
import { isBrokenUp, relationshipStatus } from './relationship';
import { SurnameForm } from './surnames';
import { TreeIndex } from './tree-index';
import { Person, TreeDocument } from './types';

/** The surname a woman takes from her current husband, in her form; empty when she has none, or he has no surname. */
export function surnameFromHusband(index: TreeIndex, person: Person, form: SurnameForm): string {
  if (person.sex !== 'female') return '';
  const marriages = index.partnerFamilies(person.id).filter((f) => f.kind === 'marriage' && f.partners.length === 2);
  const current = [...marriages].reverse().find((f) => !isBrokenUp(relationshipStatus(f)));
  if (!current) return '';
  const husband = current.partners.map((id) => index.person(id)).find((p) => p && p.id !== person.id && p.sex === 'male');
  const base = husband?.name.surname.trim() ?? '';
  return base && !husband?.name.derived ? form(base, 'female', [base]) : '';
}

/**
 * The document with every married woman's surname filled in from her
 * husband's where she has none of her own, and the ones filled in before
 * brought up to date (a husband renamed, a marriage ended). With `adoptEqual`
 * (when a file is opened), a recorded surname that is just what her husband's
 * gives is taken as filled in too, so it need not be kept in the file. The
 * same document comes back when nothing changes.
 */
export function withMarriedSurnames(doc: TreeDocument, form: SurnameForm, adoptEqual = false): TreeDocument {
  const index = new TreeIndex(doc);
  let changed = false;
  const people = doc.people.map((p) => {
    if (p.sex !== 'female') return p;
    const recorded = p.name.surname.trim();
    const derived = surnameFromHusband(index, p, form);
    if (p.name.derived) {
      if (recorded === derived) return p;
      changed = true;
      const name = { ...p.name, surname: derived };
      if (!derived) delete name.derived;
      return { ...p, name };
    }
    if (!derived) return p;
    if (recorded && !(adoptEqual && recorded === derived)) return p;
    changed = true;
    return { ...p, name: { ...p.name, surname: derived, derived: true } };
  });
  return changed ? { ...doc, people } : doc;
}
