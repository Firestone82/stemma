/**
 * A married woman's surname comes from her husband's when the file does not
 * say: Mikula's wife is Mikulová (in Czech) or Mikula (in English), without
 * anyone typing it. Such a surname is filled in here, marked `derived`, kept
 * up to date as the tree changes, and left out of the file when it is saved.
 * It is her current husband's, unless she was married more than once and the
 * marriage to take it from was chosen (`surnameFrom`).
 */
import { isBrokenUp, relationshipStatus } from './relationship';
import { SurnameForm, surnameFromFather } from './surnames';
import { TreeIndex } from './tree-index';
import { Family, Person, TreeDocument } from './types';

/** A surname a woman could bear from one of her marriages. */
export interface MarriedSurname {
  /** The marriage. */
  familyId: string;
  husband: Person;
  /** His surname in her form: Mikulová for Mikula's wife in Czech. */
  surname: string;
}

function marriages(index: TreeIndex, person: Person): Family[] {
  return index.partnerFamilies(person.id).filter((f) => f.kind === 'marriage' && f.partners.length === 2);
}

/**
 * A husband's surname: as recorded, or else the one he was born with, which is his father's when nobody typed
 * his in (so his wife need not have it typed in either).
 */
function husbandSurname(index: TreeIndex, husband: Person, form: SurnameForm): string {
  return husband.name.surname.trim() || husband.name.birthSurname?.trim() || surnameFromFather(index, husband, form);
}

/** What a woman takes from one of her marriages; undefined when her husband there has no surname. */
function fromMarriage(index: TreeIndex, person: Person, family: Family, form: SurnameForm): MarriedSurname | undefined {
  const husband = family.partners.map((id) => index.person(id)).find((p) => p && p.id !== person.id && p.sex === 'male');
  const base = husband ? husbandSurname(index, husband, form) : '';
  return husband && base && !husband.name.derived ? { familyId: family.id, husband, surname: form(base, 'female', [base]) } : undefined;
}

/**
 * The surnames a woman could bear from her marriages, whatever became of them (a widow or a divorced woman
 * may keep her husband's name), first marriage first; the same surname from two marriages is listed once.
 */
export function marriedSurnames(index: TreeIndex, person: Person, form: SurnameForm): MarriedSurname[] {
  if (person.sex !== 'female') return [];
  const out: MarriedSurname[] = [];
  for (const f of marriages(index, person)) {
    const m = fromMarriage(index, person, f, form);
    if (m && !out.some((o) => o.surname === m.surname)) out.push(m);
  }
  return out;
}

/**
 * The surname a woman takes from a husband, in her form: from the marriage chosen for it while it is one of
 * hers, or else from her current husband. A divorced woman who has not married again keeps the surname of
 * her last husband (an annulled marriage gives none). Empty when she was never married, or he has no surname.
 */
export function surnameFromHusband(index: TreeIndex, person: Person, form: SurnameForm): string {
  if (person.sex !== 'female') return '';
  const all = marriages(index, person);
  const chosen = all.find((f) => f.id === person.name.surnameFrom);
  const fromChosen = chosen && fromMarriage(index, person, chosen, form);
  if (fromChosen) return fromChosen.surname;
  const latestFirst = [...all].reverse();
  const current = latestFirst.find((f) => !isBrokenUp(relationshipStatus(f)));
  const last = current ?? latestFirst.find((f) => relationshipStatus(f) !== 'annulled');
  return (last && fromMarriage(index, person, last, form)?.surname) ?? '';
}

/**
 * The document with every married woman's surname filled in from her
 * husband's where she has none of her own, and the ones filled in before
 * brought up to date (a husband renamed, a marriage ended). With `adoptEqual`
 * (when a file is opened), a recorded surname that is just what her husband's
 * gives is taken as filled in too, so it need not be kept in the file. A
 * marriage chosen to take the surname from is forgotten once she is no longer
 * a partner in it (it was removed, or she was). The same document comes back
 * when nothing changes.
 */
export function withMarriedSurnames(doc: TreeDocument, form: SurnameForm, adoptEqual = false): TreeDocument {
  const index = new TreeIndex(doc);
  let changed = false;
  const people = doc.people.map((person) => {
    let p = person;
    const from = p.name.surnameFrom;
    if (from && !index.partnerFamilies(p.id).some((f) => f.id === from)) {
      changed = true;
      const name = { ...p.name };
      delete name.surnameFrom;
      p = { ...p, name };
    }
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
