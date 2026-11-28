/**
 * The focused view: on a big tree, only the family in the middle and its
 * nearest relatives are on the chart, and everything further off is folded
 * into the balloons of the family view (see family-view), which a press opens.
 *
 * Around the person in the middle: their partners, brothers and sisters,
 * children and grandchildren, parents and grandparents, and their partner's
 * parents, each with their partners. Above that, only one line of ancestors
 * goes on up (the "lead"): by default the father's father's line, or the line
 * through an ancestor picked instead. Every other ancestor's parents are
 * folded away, and opening one of them swaps the line that goes up.
 */
import { Scope } from '../poster/scope';
import { scopeOf, withPartners } from './family-view';
import { TreeIndex } from './tree-index';
import { TreeDocument } from './types';

export interface FocusedOptions {
  centerId: string;
  partnerId?: string;
  /** The ancestor whose line goes on up; none for the father's father's line of the person in the middle. */
  through?: string;
  /** People opened from balloons, shown with their partners. */
  opened?: ReadonlySet<string>;
}

/** Generations shown above the person in the middle for all their lines, and above their partner. */
const UP = 2;
const PARTNER_UP = 1;
/** Generations of descendants shown below the couple. */
const DOWN = 2;

export function focusedScope(doc: TreeDocument, index: TreeIndex, options: FocusedOptions): Scope {
  const { centerId, partnerId } = options;
  const base = new Set<string>();
  if (!index.person(centerId)) return scopeOf(doc, index, base);

  base.add(centerId);
  if (partnerId && index.person(partnerId)) base.add(partnerId);
  for (const id of [...base]) for (const p of index.partners(id)) base.add(p.id);

  // Brothers and sisters of the person in the middle.
  for (const f of index.parentFamilies(centerId)) for (const c of f.children) base.add(c.personId);

  // Children and grandchildren of the couple (of every partner of the person in the middle).
  let row = [centerId, ...index.partners(centerId).map((p) => p.id)];
  for (let depth = 0; depth < DOWN; depth++) {
    const next: string[] = [];
    for (const id of row) for (const f of index.partnerFamilies(id)) for (const c of f.children) if (!base.has(c.personId)) next.push(c.personId);
    for (const id of next) base.add(id);
    // Children's partners are parents of the next row as well.
    row = [...new Set(next.flatMap((id) => [id, ...index.partners(id).map((p) => p.id)]))];
  }

  // Ancestors near the couple, on all their lines.
  for (const id of ancestorsWithin(index, centerId, UP)) base.add(id);
  if (partnerId) for (const id of ancestorsWithin(index, partnerId, PARTNER_UP)) base.add(id);

  // The line that goes on up.
  for (const id of leadLine(index, centerId, partnerId, options.through)) base.add(id);

  for (const id of options.opened ?? []) if (index.person(id)) base.add(id);
  return scopeOf(doc, index, withPartners(index, base), centerId);
}

/**
 * The people whose parents, when opened, swap the line that goes on up rather than being added to the
 * chart: the person in the middle, their partner, and the ancestors of either.
 */
export function ancestorSide(index: TreeIndex, centerId: string, partnerId?: string): Set<string> {
  const out = new Set([centerId, ...index.ancestors(centerId)]);
  if (partnerId) for (const id of [partnerId, ...index.ancestors(partnerId)]) out.add(id);
  return out;
}

/** Everyone up to `generations` above a person, on all lines. */
function ancestorsWithin(index: TreeIndex, personId: string, generations: number): string[] {
  const out: string[] = [];
  let row = [personId];
  const seen = new Set(row);
  for (let g = 0; g < generations; g++) {
    const next: string[] = [];
    for (const id of row) {
      for (const p of index.parentFamilies(id).flatMap((f) => f.partners)) {
        if (seen.has(p)) continue;
        seen.add(p);
        next.push(p);
      }
    }
    out.push(...next);
    row = next;
  }
  return out;
}

/**
 * The line of ancestors that goes on up: from the person in the middle (or their partner) to `through`,
 * then on through the fathers (a mother where no father is known), with both parents at each step.
 */
function leadLine(index: TreeIndex, centerId: string, partnerId: string | undefined, through: string | undefined): string[] {
  const path = (through && (pathUp(index, centerId, through) ?? (partnerId ? pathUp(index, partnerId, through) : undefined))) || [centerId];
  const out = [...path];
  const seen = new Set(out);
  let at = path[path.length - 1];
  for (;;) {
    const parents = parentsOf(index, at).filter((p) => !seen.has(p));
    if (!parents.length) return out;
    for (const p of parents) seen.add(p);
    out.push(...parents);
    at = parents[0];
  }
}

/** The way up from a person to one of their ancestors, both ends included; undefined when they are not one. */
function pathUp(index: TreeIndex, from: string, to: string): string[] | undefined {
  const cameFrom = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) {
      const path = [id];
      for (let at = cameFrom.get(id); at; at = cameFrom.get(at)) path.unshift(at);
      return path;
    }
    for (const p of index.parentFamilies(id).flatMap((f) => f.partners)) {
      if (cameFrom.has(p)) continue;
      cameFrom.set(p, id);
      queue.push(p);
    }
  }
  return undefined;
}

/** A person's parents, from their first family (by blood, where there is one); fathers first. */
function parentsOf(index: TreeIndex, personId: string): string[] {
  const families = index.parentFamilies(personId);
  const family = families.find((f) => index.childRelation(f, personId) === 'biological') ?? families[0];
  if (!family) return [];
  const rank = (id: string) => {
    const sex = index.person(id)?.sex;
    return sex === 'male' ? 0 : sex === 'female' ? 1 : 2;
  };
  return [...family.partners].sort((a, b) => rank(a) - rank(b));
}
