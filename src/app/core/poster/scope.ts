/**
 * Which part of the tree goes on a print or on the chart: the couple in the
 * middle, their ancestors and descendants up to a number of generations, side
 * branches up to a number of steps from the direct line, and everyone's
 * partners. Without the families of those who married in, only the people
 * whose relationship has a name are kept.
 */
import { bloodRelatives, kinship } from '../kinship/kinship';
import { isBrokenUp, relationshipStatus } from '../model/relationship';
import { TreeIndex } from '../model/tree-index';
import { Family, Reach, TreeDocument } from '../model/types';

export interface ScopeOptions {
  centerId: string;
  partnerId?: string;
  ancestors: Reach;
  descendants: Reach;
  branches: Reach;
  /**
   * False leaves out everyone the person in the middle has no relationship name
   * for (the parents of a sister-in-law, a fiancé's family), except partners of
   * the people kept. Defaults to true.
   */
  inLawFamilies?: boolean;
  /** True prints the people hidden from prints as well. Defaults to false. */
  showHidden?: boolean;
  /** With `branches` 1: brothers and sisters only, no aunts, uncles, nieces or nephews. Defaults to false. */
  siblingsOnly?: boolean;
  /** People left out of this print alone, whatever `showHidden` says; the person in the middle and their partner stay. */
  omit?: ReadonlySet<string>;
  /**
   * True keeps the side of a former partner (divorced, separated, annulled,
   * parted) to the people the person in the middle would have known: the
   * partner's parents, brothers and sisters and descendants, with their
   * partners. The settings above still apply to the person in the middle.
   * Defaults to false.
   */
  nearFormerPartner?: boolean;
}

export interface Scope {
  doc: TreeDocument;
  people: ReadonlySet<string>;
}

const limit = (r: Reach) => (r === 'all' ? Infinity : Math.max(0, r));

/**
 * The steps of the Relatives setting, from the nearest family out: the direct
 * line, brothers and sisters, aunts and uncles (with nieces and nephews), first
 * cousins, everyone with a relationship name, and everyone.
 */
export const RELATIVES = ['direct', 'siblings', 'aunts', 'cousins', 'relatives', 'everyone'] as const;
export type Relatives = (typeof RELATIVES)[number];

/** How the steps are saved: side branches, brothers and sisters only, and the families of those who married in. */
export interface RelativesSettings {
  branches: Reach;
  inLawFamilies: boolean;
  siblingsOnly: boolean;
}

/** The step for saved settings. More branches than cousins (second cousins, from a file) count as all. */
export function relativesOf(s: RelativesSettings): Relatives {
  if (s.branches === 0) return 'direct';
  if (s.branches === 1) return s.siblingsOnly ? 'siblings' : 'aunts';
  if (s.branches === 2) return 'cousins';
  return s.inLawFamilies ? 'everyone' : 'relatives';
}

export function relativesSettings(r: Relatives): RelativesSettings {
  switch (r) {
    case 'direct':
      return { branches: 0, inLawFamilies: true, siblingsOnly: false };
    case 'siblings':
      return { branches: 1, inLawFamilies: true, siblingsOnly: true };
    case 'aunts':
      return { branches: 1, inLawFamilies: true, siblingsOnly: false };
    case 'cousins':
      return { branches: 2, inLawFamilies: true, siblingsOnly: false };
    case 'relatives':
      return { branches: 'all', inLawFamilies: false, siblingsOnly: false };
    case 'everyone':
      return { branches: 'all', inLawFamilies: true, siblingsOnly: false };
  }
}

export function scopeDocument(doc: TreeDocument, index: TreeIndex, options: ScopeOptions): Scope {
  const A = limit(options.ancestors);
  const D = limit(options.descendants);
  const B = limit(options.branches);
  const unlimited = A === Infinity && D === Infinity && B === Infinity;
  const namedOnly = options.inLawFamilies === false && !!index.person(options.centerId);

  const included = new Set<string>();
  if (unlimited) {
    for (const p of doc.people) included.add(p.id);
  } else {
    const roots = [options.centerId, options.partnerId].filter((id): id is string => !!id && !!index.person(id));
    for (const root of roots) {
      included.add(root);
      for (const [id, { up, down }] of bloodRelatives(index, root)) {
        // Generations below the root; the common ancestor must be within reach,
        // and side branches are counted from the direct line. One branch out can
        // mean brothers and sisters alone, without aunts, uncles, nieces and nephews.
        const side = Math.min(up, down);
        if (side === 1 && options.siblingsOnly && B === 1 && up !== down) continue;
        if (up <= A && down - up <= D && side <= B) included.add(id);
      }
      // Foster and step children and parents of the couple themselves.
      if (D >= 1) {
        for (const f of index.partnerFamilies(root)) for (const c of f.children) included.add(c.personId);
      }
      if (A >= 1) {
        for (const f of index.parentFamilies(root)) for (const p of f.partners) included.add(p);
      }
    }
  }
  // People kept off paper, unless the print is about them.
  const hidden = (id: string) => !!options.omit?.has(id) || (!options.showHidden && !!index.person(id)?.hiddenFromPrint);
  for (const p of doc.people) if (hidden(p.id) && p.id !== options.centerId && p.id !== options.partnerId) included.delete(p.id);
  if (namedOnly) {
    // Relationship names are given from the point of view of the person in the middle.
    const named = kinship(index, options.centerId);
    for (const id of [...included]) if (!named.has(id)) included.delete(id);
  }
  if (!unlimited || namedOnly) {
    // Everyone's partners, so couples stay together.
    for (const id of [...included]) {
      for (const f of index.partnerFamilies(id)) for (const p of f.partners) if (!hidden(p)) included.add(p);
    }
  }
  if (options.nearFormerPartner && options.partnerId && index.person(options.partnerId) && index.person(options.centerId)) {
    const couple = index.familyBetween(options.centerId, options.partnerId);
    if (couple && isBrokenUp(relationshipStatus(couple))) keepNearFormerPartner(index, included, options.centerId, options.partnerId);
  }

  const families: Family[] = [];
  for (const f of doc.families) {
    const partners = f.partners.filter((p) => included.has(p));
    const children = f.children.filter((c) => included.has(c.personId));
    const keep =
      partners.length === 2 || (partners.length === 1 && children.length > 0) || (partners.length === 0 && f.partners.length === 0 && children.length > 1);
    if (!keep) continue;
    families.push(partners.length === f.partners.length && children.length === f.children.length ? f : { ...f, partners, children });
  }

  return {
    doc: {
      meta: { ...doc.meta, homePersonId: options.centerId },
      view: doc.view,
      people: included.size === doc.people.length ? doc.people : doc.people.filter((p) => included.has(p.id)),
      families,
      ...(doc.background ? { background: doc.background } : {}),
      ...(doc.arrangement ? { arrangement: doc.arrangement } : {}),
    },
    people: included,
  };
}

/**
 * Leaves out the former partner's relatives beyond their parents, brothers and
 * sisters and descendants, and then everyone who was on the page only through
 * them (an aunt's husband, a grandmother's second family). Relatives the two
 * share stay.
 */
function keepNearFormerPartner(index: TreeIndex, included: Set<string>, centerId: string, partnerId: string): void {
  const roots = [centerId, partnerId];
  const before = linked(index, included, roots);
  const ours = bloodRelatives(index, centerId);
  for (const [id, { up, down }] of bloodRelatives(index, partnerId)) {
    if (id === centerId || ours.has(id)) continue;
    const near = up === 0 || (up === 1 && down <= 1);
    if (!near) included.delete(id);
  }
  const after = linked(index, included, roots);
  for (const id of before) if (!after.has(id)) included.delete(id);
}

/** The people kept who are joined to `roots` through families of people kept. */
function linked(index: TreeIndex, included: ReadonlySet<string>, roots: readonly string[]): Set<string> {
  const seen = new Set(roots.filter((id) => included.has(id)));
  const queue = [...seen];
  for (const id of queue) {
    for (const f of [...index.parentFamilies(id), ...index.partnerFamilies(id)]) {
      for (const other of [...f.partners, ...f.children.map((c) => c.personId)]) {
        if (included.has(other) && !seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
  }
  return seen;
}
