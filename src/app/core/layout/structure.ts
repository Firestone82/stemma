/**
 * The tree as the layout sees it, worked out from the couple in the middle outwards: every person belongs
 * to one unit (themselves and their partners, drawn side by side), and units hang from each other, parents
 * above and children below. Someone met a second time on the way (they married a relative, or descend
 * from one couple twice) keeps the card they already have; a stand-in marks their second place.
 */
import { TreeIndex } from '../model/tree-index';
import { ChildRelation, Family } from '../model/types';

export interface Member {
  personId: string;
  /** Drawn elsewhere; here only a stand-in. */
  ghost: boolean;
  /** For someone in the unit as a partner: whose partner they are. */
  of?: string;
}

/** A child in a family: their own unit, or (without one) a stand-in for a card they have elsewhere. */
export interface Kid {
  personId: string;
  relation: ChildRelation;
  unit?: Unit;
}

/** The children of one of a unit's families. */
export interface Group {
  familyId: string;
  kids: Kid[];
}

/** The parents of one of a unit's members, in a unit above it. */
export interface Up {
  personId: string;
  familyId: string;
  relation: ChildRelation;
  parents: Unit;
}

export interface Unit {
  id: number;
  /** Who the unit is built around: a couple, one person, or nobody (parents nobody has entered). */
  core: Member[];
  /** The other partners of each of them, the latest first. */
  extras: Member[][];
  /** For parents nobody has entered: the family they stand for. */
  placeholder?: string;
  /** The families drawn at this unit: their marker, and their children below. */
  families: Family[];
  groups: Group[];
  ups: Up[];
  /** The child this unit was reached from, coming up from below: it is not among `groups`. */
  path?: { familyId: string; childId: string };
  /** Generations from the couple in the middle: parents -1, children 1. */
  rank: number;
  /** In the direct line of the couple in the middle. */
  trunk: boolean;
}

export interface Structure {
  centre: Unit;
  units: Unit[];
}

/**
 * The whole document as structures: the first around `centreId` and their partner, then one for every
 * group of people not joined to it, around the first of them.
 */
export function buildStructures(index: TreeIndex, centreId?: string, partnerId?: string): Structure[] {
  const state: State = { index, placed: new Set(), claimed: new Set(), nextId: 0 };
  const out: Structure[] = [];
  if (centreId && index.person(centreId)) out.push(build(state, centreId, partnerId));
  for (const p of index.doc.people) if (!state.placed.has(p.id)) out.push(build(state, p.id, undefined));
  return out;
}

/**
 * Who the chart is drawn around when it looks the same whoever the tree is centred on: the person with the
 * most ancestors, the youngest of the tree's longest lines, so that as much of the tree as can stands in the
 * direct line down the middle; among equals the one with the most descendants, then the first in the tree.
 * It follows from the shape of the tree alone. `isPerson` leaves out ids that stand for nobody (the
 * stand-ins of a family view).
 */
export function chartAnchor(index: TreeIndex, isPerson: (id: string) => boolean = () => true): string | undefined {
  const count = (ids: ReadonlySet<string>) => [...ids].filter(isPerson).length;
  let best: { id: string; up: number; down: number } | undefined;
  for (const p of index.doc.people) {
    if (!isPerson(p.id)) continue;
    const up = count(index.ancestors(p.id));
    if (best && up < best.up) continue;
    const down = count(index.descendants(p.id));
    if (!best || up > best.up || down > best.down) best = { id: p.id, up, down };
  }
  return best?.id;
}

/** The generation of everyone in the structures, 0 for the oldest. */
export function ranksOf(structures: readonly Structure[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const s of structures) {
    let min = 0;
    for (const u of s.units) min = Math.min(min, u.rank);
    for (const u of s.units) for (const m of membersOf(u)) if (!m.ghost) ranks.set(m.personId, u.rank - min);
  }
  return ranks;
}

export function membersOf(u: Unit): Member[] {
  return [...u.core, ...u.extras.flat()];
}

interface State {
  index: TreeIndex;
  placed: Set<string>;
  claimed: Set<string>;
  nextId: number;
}

function build(state: State, centreId: string, partnerId: string | undefined): Structure {
  const { index, placed, claimed } = state;
  const units: Unit[] = [];
  const inDoc = (id: string) => !!index.person(id);

  const makeUnit = (core: Member[], rank: number, trunk: boolean, placeholder?: Family): Unit => {
    const u: Unit = { id: state.nextId++, core, extras: core.map(() => []), families: [], groups: [], ups: [], rank, trunk };
    const ids = new Set(core.map((m) => m.personId));
    for (const m of core) if (!m.ghost) placed.add(m.personId);
    const gather = (personId: string, into: Member[]) => {
      for (const f of [...index.partnerFamilies(personId)].reverse()) {
        if (claimed.has(f.id)) continue;
        const other = f.partners.find((p) => p !== personId && inDoc(p));
        if (!other || ids.has(other)) continue;
        ids.add(other);
        if (placed.has(other)) {
          into.push({ personId: other, ghost: true, of: personId });
          continue;
        }
        placed.add(other);
        into.push({ personId: other, ghost: false, of: personId });
        // Their other partners stand beyond them.
        gather(other, into);
      }
    };
    core.forEach((m, i) => {
      if (!m.ghost) gather(m.personId, u.extras[i]);
    });
    if (placeholder) {
      u.placeholder = placeholder.id;
      claimed.add(placeholder.id);
      u.families.push(placeholder);
    }
    const ghosts = new Set(
      membersOf(u)
        .filter((m) => m.ghost)
        .map((m) => m.personId),
    );
    for (const m of membersOf(u)) {
      for (const f of index.partnerFamilies(m.personId)) {
        if (claimed.has(f.id)) continue;
        const partners = f.partners.filter(inDoc);
        if (!partners.length || !partners.every((p) => ids.has(p))) continue;
        // A family is drawn where at least one of the couple has their own card.
        if (partners.every((p) => ghosts.has(p))) continue;
        claimed.add(f.id);
        u.families.push(f);
      }
    }
    units.push(u);
    return u;
  };

  /** The couple with the man on the left, when they are a man and a woman. */
  const ordered = (ids: string[]): string[] => {
    if (ids.length === 2 && index.person(ids[0])?.sex === 'female' && index.person(ids[1])?.sex === 'male') return [ids[1], ids[0]];
    return ids;
  };

  const upsDone = new Set<string>();
  const addUps = (u: Unit, personId: string, trunk: boolean): Unit[] => {
    if (upsDone.has(personId)) return [];
    upsDone.add(personId);
    const made: Unit[] = [];
    const primary = index.primaryParentFamily(personId);
    const fams = [...index.parentFamilies(personId)].sort((a, b) => Number(b === primary) - Number(a === primary));
    for (const f of fams) {
      if (claimed.has(f.id)) continue;
      const partners = f.partners.filter(inDoc);
      let parents: Unit;
      if (!partners.length) {
        // Parents nobody has entered are only worth a box when brothers and sisters hang from it too.
        if (!f.children.some((c) => c.personId !== personId && inDoc(c.personId))) continue;
        parents = makeUnit([], u.rank - 1, false, f);
      } else {
        if (partners.every((p) => placed.has(p))) continue;
        parents = makeUnit(
          ordered(partners).map((p) => ({ personId: p, ghost: placed.has(p) })),
          u.rank - 1,
          trunk && f === primary,
        );
        if (!claimed.has(f.id)) continue;
      }
      parents.path = { familyId: f.id, childId: personId };
      u.ups.push({ personId, familyId: f.id, relation: index.childRelation(f, personId), parents });
      made.push(parents);
    }
    return made;
  };

  const addKids = (u: Unit) => {
    for (const f of u.families) {
      const kids: Kid[] = [];
      for (const c of f.children) {
        if (!inDoc(c.personId)) continue;
        if (u.path?.familyId === f.id && u.path.childId === c.personId) continue;
        if (placed.has(c.personId)) kids.push({ personId: c.personId, relation: c.relation });
        else kids.push({ personId: c.personId, relation: c.relation, unit: makeUnit([{ personId: c.personId, ghost: false }], u.rank + 1, false) });
      }
      if (kids.length) u.groups.push({ familyId: f.id, kids });
    }
  };

  const partner = partnerId && partnerId !== centreId && inDoc(partnerId) && !placed.has(partnerId) ? partnerId : undefined;
  const centre = makeUnit(
    ordered(partner ? [centreId, partner] : [centreId]).map((p) => ({ personId: p, ghost: false })),
    0,
    true,
  );
  // The direct line first, so every ancestor has their card there.
  // (Both lists grow as they are gone through: the parents found are looked at in their turn.)
  const line = [centre];
  for (const u of line) {
    for (const m of u.core) if (!m.ghost) line.push(...addUps(u, m.personId, true).filter((p) => p.trunk));
  }
  // Then everyone else, from the middle outwards: the parents of those who married in, and the children.
  for (const u of units) {
    for (const m of membersOf(u)) if (!m.ghost) addUps(u, m.personId, false);
    addKids(u);
  }
  return { centre, units };
}
