/**
 * The focused view: on a big tree, only the family of the person in the middle
 * and their nearest relatives are on the chart; where the tree branches off
 * into another family it is folded into the balloons of the family view (see
 * family-view), which a press opens.
 *
 * The family: everyone joined to the person in the middle by parents and
 * children who was born into their family (by surnameKey), so the brothers and
 * sisters of a grandfather and their children, up and down the family's line.
 * The nearest relatives: partners, brothers and sisters with everyone below
 * them, children and grandchildren, parents and grandparents, each with their
 * partners, and aunts and uncles. Partners are always shown; their parents
 * (the family beyond a marriage) wait behind a balloon.
 *
 * A balloon over an ancestor swaps the family shown for that ancestor's: the
 * way up to them and their family come in, and the family shown before is
 * folded away again beyond the nearest relatives.
 */
import { Scope } from '../poster/scope';
import { scopeOf, withPartners } from './family-view';
import { TreeIndex } from './tree-index';
import { TreeDocument } from './types';

export interface FocusedOptions {
  centerId: string;
  partnerId?: string;
  /** The family each person was born into (a surnameKey); empty when not known. */
  keyOf: (personId: string) => string;
  /** The ancestor (of the person in the middle or their partner) whose family is shown; none for the person in the middle's. */
  through?: string;
  /** People opened from balloons, shown with their partners. */
  opened?: ReadonlySet<string>;
}

/** Generations shown above the person in the middle for all their lines. */
const UP = 2;
/** Generations of descendants shown below the couple. */
const DOWN = 2;

export function focusedScope(doc: TreeDocument, index: TreeIndex, options: FocusedOptions): Scope {
  const { centerId, partnerId } = options;
  const base = new Set<string>();
  if (!index.person(centerId)) return scopeOf(doc, index, base);

  base.add(centerId);
  if (partnerId && index.person(partnerId)) base.add(partnerId);
  for (const id of [...base]) for (const p of index.partners(id)) base.add(p.id);

  // Brothers and sisters of the person in the middle, with their whole families below them.
  for (const f of index.parentFamilies(centerId)) {
    for (const c of f.children) {
      if (c.personId === centerId) continue;
      base.add(c.personId);
      for (const id of index.descendants(c.personId)) base.add(id);
    }
  }

  // Children and grandchildren of the couple (of every partner of the person in the middle).
  let row = [centerId, ...index.partners(centerId).map((p) => p.id)];
  for (let depth = 0; depth < DOWN; depth++) {
    const next: string[] = [];
    for (const id of row) for (const f of index.partnerFamilies(id)) for (const c of f.children) if (!base.has(c.personId)) next.push(c.personId);
    for (const id of next) base.add(id);
    // Children's partners are parents of the next row as well.
    row = [...new Set(next.flatMap((id) => [id, ...index.partners(id).map((p) => p.id)]))];
  }

  // Ancestors near the person in the middle, on all their lines. The partner's side waits behind a balloon.
  for (const id of ancestorsWithin(index, centerId, UP)) base.add(id);

  // The family: the person in the middle's, or the one of the ancestor picked instead, with the way up to them.
  const path = (options.through && (pathUp(index, centerId, options.through) ?? (partnerId ? pathUp(index, partnerId, options.through) : undefined))) || [
    centerId,
  ];
  for (const id of path) base.add(id);
  for (const id of familyOf(index, path[path.length - 1], options.keyOf)) base.add(id);

  // Aunts and uncles, with their partners; their children wait behind a balloon.
  for (const parent of index.parentFamilies(centerId).flatMap((f) => f.partners)) {
    for (const f of index.parentFamilies(parent)) for (const c of f.children) base.add(c.personId);
  }

  for (const id of options.opened ?? []) if (index.person(id)) base.add(id);
  // Everyone's partners are always there; what lies beyond a marriage (the partner's family) waits behind balloons.
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

/** Everyone joined to `start` by parents and children who was born into the same family. */
function familyOf(index: TreeIndex, start: string, keyOf: (personId: string) => string): Set<string> {
  const key = keyOf(start);
  const out = new Set([start]);
  if (!key) return out;
  const queue = [start];
  while (queue.length) {
    const id = queue.pop()!;
    const parents = index.parentFamilies(id).flatMap((f) => f.partners);
    const children = index.partnerFamilies(id).flatMap((f) => f.children.map((c) => c.personId));
    for (const next of [...parents, ...children]) {
      if (out.has(next) || keyOf(next) !== key) continue;
      out.add(next);
      queue.push(next);
    }
  }
  return out;
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
