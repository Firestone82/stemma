/**
 * The family view: one family (or a few) on its own, apart from the rest of
 * the tree. A family is everyone born with its name (Novák and Nováková
 * together, by surnameKey), with their partners so couples stay together.
 * Everyone else the people on the chart are joined to is left off and shown
 * as a balloon instead: the family a person's parents, children or partner
 * belong to, which can be opened or added to the view.
 */
import { Scope } from '../poster/scope';
import { TreeIndex } from './tree-index';
import { Family, TreeDocument } from './types';

/** Where a balloon hangs: above a person (their parents), below a couple (their children) or beside a person (a partner). */
export type BalloonKind = 'parents' | 'children' | 'partner';

export interface FamilyBalloon {
  /** Unique for the view: the kind and what it hangs on. */
  id: string;
  kind: BalloonKind;
  /** The person it hangs on: for children, a parent on the chart. */
  personId: string;
  /** For children: the family whose children they are. */
  familyId?: string;
  /** The families of the people left off, the nearest first. */
  keys: string[];
  /** The people left off, so a jump can bring the first of each family into view. */
  people: string[];
}

/**
 * The part of the tree a family view shows: everyone born into one of the
 * families of `keys`, and their partners. `keyOf` gives the family a person
 * was born into. The tree is laid out around `centerId` when it is on the
 * chart, otherwise around the first member.
 */
export function familyViewScope(doc: TreeDocument, index: TreeIndex, keys: ReadonlySet<string>, keyOf: (personId: string) => string, centerId?: string): Scope {
  const included = new Set<string>();
  for (const p of doc.people) if (keys.has(keyOf(p.id))) included.add(p.id);
  for (const id of [...included]) {
    for (const f of index.partnerFamilies(id)) for (const p of f.partners) included.add(p);
  }

  const families: Family[] = [];
  for (const f of doc.families) {
    const partners = f.partners.filter((p) => included.has(p));
    const children = f.children.filter((c) => included.has(c.personId));
    // Couples, one parent with children, and brothers and sisters whose parents nobody knows.
    // Brothers and sisters whose parents are only left off are not joined: they each get a balloon.
    const keep =
      partners.length === 2 || (partners.length === 1 && children.length > 0) || (partners.length === 0 && f.partners.length === 0 && children.length > 1);
    if (!keep) continue;
    families.push(partners.length === f.partners.length && children.length === f.children.length ? f : { ...f, partners, children });
  }

  const people = doc.people.filter((p) => included.has(p.id));
  const home = centerId && included.has(centerId) ? centerId : people[0]?.id;
  return {
    doc: {
      meta: { ...doc.meta, homePersonId: home },
      view: doc.view,
      people,
      families,
      ...(doc.background ? { background: doc.background } : {}),
      ...(doc.arrangement ? { arrangement: doc.arrangement } : {}),
    },
    people: included,
  };
}

/**
 * The balloons for the people a family view leaves off: one above a person
 * whose parents (or, when nobody knows them, brothers and sisters) are all
 * off the chart, one below a couple for their children
 * who are off it (only when both parents are on it), and one beside a person
 * for each partner who is off it.
 */
export function familyBalloons(doc: TreeDocument, index: TreeIndex, included: ReadonlySet<string>, keyOf: (personId: string) => string): FamilyBalloon[] {
  const out: FamilyBalloon[] = [];
  const off = (id: string) => !included.has(id);
  const keysOf = (ids: readonly string[]) => [...new Set(ids.map(keyOf))];

  for (const p of doc.people) {
    if (!included.has(p.id)) continue;
    // Parents: only when none of them is on the chart. One who is brings the other in
    // as a partner, or shows them in a partner balloon of their own.
    // Brothers and sisters whose parents nobody knows are reached only through each other.
    const parentFamilies = index.parentFamilies(p.id);
    const parents = parentFamilies.flatMap((f) => f.partners);
    if (parents.every(off)) {
      // Fathers first: the family a child is usually named after.
      const sorted = [...new Set(parents)].sort((a, b) => sexOrder(index, a) - sexOrder(index, b));
      const siblings = parentFamilies
        .filter((f) => !f.partners.length)
        .flatMap((f) => f.children.map((c) => c.personId).filter((id) => id !== p.id && off(id)));
      const people = [...sorted, ...new Set(siblings)];
      if (people.length) out.push({ id: `parents:${p.id}`, kind: 'parents', personId: p.id, keys: keysOf(people), people });
    }
    for (const f of index.partnerFamilies(p.id)) {
      for (const other of f.partners) {
        if (other === p.id || !off(other)) continue;
        out.push({ id: `partner:${p.id}:${other}`, kind: 'partner', personId: p.id, familyId: f.id, keys: [keyOf(other)], people: [other] });
      }
    }
  }

  for (const f of doc.families) {
    const shown = f.partners.filter((id) => included.has(id));
    // Children come into view with both their parents: while a partner is off the chart,
    // their children wait behind that partner's balloon.
    if (!shown.length || shown.length < f.partners.length) continue;
    const children = f.children.map((c) => c.personId).filter(off);
    if (!children.length) continue;
    out.push({ id: `children:${f.id}`, kind: 'children', personId: shown[0], familyId: f.id, keys: keysOf(children), people: children });
  }
  return out;
}

function sexOrder(index: TreeIndex, id: string): number {
  const sex = index.person(id)?.sex;
  return sex === 'male' ? 0 : sex === 'female' ? 1 : 2;
}

/** The families in a view as a hash fragment: "ashworth,novak"; people with no surname are "~". */
export function encodeFamilyKeys(keys: readonly string[]): string {
  return keys.map((k) => (k ? encodeURIComponent(k) : NO_SURNAME)).join(',');
}

const NO_SURNAME = '~';

export function decodeFamilyKeys(text: string): string[] {
  if (!text) return [];
  return [
    ...new Set(
      text.split(',').map((k) => {
        if (k === NO_SURNAME) return '';
        try {
          return decodeURIComponent(k);
        } catch {
          return k;
        }
      }),
    ),
  ];
}
