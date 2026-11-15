/**
 * Checks over the whole tree: details nobody has filled in, and dates that
 * cannot all be right (a daughter born before her father, a death before the
 * birth). Dates are often partial or approximate, so a date is taken as the
 * span of days it may mean, and a problem is only reported when it holds for
 * every day in those spans: "1890" against "about 1890" is never a problem.
 */
import { MissingDetail, missingDetails } from './completeness';
import { TreeIndex } from './tree-index';
import { GenDate, TreeDocument } from './types';

/** A detail missing from someone's record, not ticked as unknown. */
export type GapKind = 'given' | 'birth' | 'death';

export interface Gap {
  kind: GapKind;
  /** The people it is missing for, in the order of the tree. */
  personIds: string[];
}

export type ProblemKind =
  | 'deathBeforeBirth'
  | 'bornBeforeParent'
  | 'parentTooYoung'
  | 'motherTooOld'
  | 'fatherTooOld'
  | 'bornAfterMotherDied'
  | 'bornAfterFatherDied'
  | 'livedTooLong'
  | 'unionTooYoung'
  | 'unionAfterDeath'
  | 'siblingsTooClose';

export interface Problem {
  kind: ProblemKind;
  /** Who it is about: the person whose record looks wrong first, then the others it involves. */
  personIds: string[];
  /** A number the message needs (an age, months), when it has one. */
  value?: number;
}

/** Younger than this at a child's birth is taken to be a mistake. */
export const MIN_PARENT_AGE = 13;
export const MAX_MOTHER_AGE = 55;
export const MAX_FATHER_AGE = 80;
export const MAX_AGE = 110;
/** Younger than this at a wedding. */
export const MIN_UNION_AGE = 14;
/** Brothers and sisters born less than this many months apart, not as twins. */
export const MIN_SIBLING_MONTHS = 8;

const DAY = 1;
const YEAR = 365.25 * DAY;
/** How far "about", "estimated" and "calculated" dates may be off, either way. */
const ABOUT = 5 * YEAR;

/** The days a date may mean, as a day count, from its earliest to its latest; undefined when it has no calendar value. */
export function dateSpan(date: GenDate | undefined): { lo: number; hi: number } | undefined {
  const m = /^(\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(date?.value ?? '');
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : undefined;
  const d = m[3] ? Number(m[3]) : undefined;
  const day = (yy: number, mm: number, dd: number) => Date.UTC(yy, mm - 1, dd) / 86_400_000;
  let lo = day(y, mo ?? 1, d ?? 1);
  let hi = d ? lo : mo ? day(y, mo + 1, 1) - 1 : day(y + 1, 1, 1) - 1;
  switch (date!.qualifier) {
    case 'before':
      lo = -Infinity;
      break;
    case 'after':
      hi = Infinity;
      break;
    case 'about':
    case 'estimated':
    case 'calculated':
      lo -= ABOUT;
      hi += ABOUT;
      break;
  }
  return { lo, hi };
}

/** Everything the tree is missing, and every date that cannot be right. */
export function checkTree(doc: TreeDocument, now: Date = new Date()): { gaps: Gap[]; problems: Problem[] } {
  return { gaps: findGaps(doc, now), problems: findProblems(doc) };
}

/**
 * The given names, births and deaths nobody has filled in. A detail ticked as
 * unknown is not missing; a death is only missing for someone known to have died.
 */
export function findGaps(doc: TreeDocument, now: Date = new Date()): Gap[] {
  // The same details the flags on the cards and in the people list stand for (see missingDetails).
  const missing = doc.people.map((p) => ({ id: p.id, gaps: missingDetails(p, now) }));
  const of = (kind: GapKind, detail: MissingDetail): Gap => ({ kind, personIds: missing.filter((m) => m.gaps.includes(detail)).map((m) => m.id) });
  return [of('given', 'given'), of('birth', 'birthYear'), of('death', 'deathDate')].filter((g) => g.personIds.length);
}

/** Dates that cannot all be right, one entry for each. */
export function findProblems(doc: TreeDocument): Problem[] {
  const index = new TreeIndex(doc);
  const out: Problem[] = [];
  const born = (id: string) => dateSpan(index.person(id)?.birth?.date);
  const died = (id: string) => dateSpan(index.person(id)?.death?.date);
  // At least / at most how many years from `a` to `b`, over every day each may mean.
  const yearsAtLeast = (a: { hi: number }, b: { lo: number }) => (b.lo - a.hi) / YEAR;
  const yearsAtMost = (a: { lo: number }, b: { hi: number }) => (b.hi - a.lo) / YEAR;

  for (const p of doc.people) {
    const b = born(p.id);
    const d = died(p.id);
    if (b && d && d.hi < b.lo) out.push({ kind: 'deathBeforeBirth', personIds: [p.id] });
    else if (b && d && yearsAtLeast(b, d) > MAX_AGE) out.push({ kind: 'livedTooLong', personIds: [p.id], value: Math.floor(yearsAtLeast(b, d)) });
  }

  for (const f of doc.families) {
    const children = f.children.filter((c) => c.relation === 'biological' || c.relation === 'unknown');
    for (const parentId of f.partners) {
      const parent = index.person(parentId);
      if (!parent) continue;
      const pb = born(parentId);
      const pd = died(parentId);
      for (const c of children) {
        const cb = born(c.personId);
        if (!cb) continue;
        const ids = [c.personId, parentId];
        // One problem for each child and parent, the worst: the others usually follow from it.
        if (pb && cb.hi <= pb.lo) out.push({ kind: 'bornBeforeParent', personIds: ids });
        // A mother cannot give birth after she died; a father may have died up to about nine months before.
        else if (pd && parent.sex === 'female' && cb.lo > pd.hi) out.push({ kind: 'bornAfterMotherDied', personIds: ids });
        else if (pd && parent.sex !== 'female' && cb.lo > pd.hi + 300 * DAY) out.push({ kind: 'bornAfterFatherDied', personIds: ids });
        else if (pb && yearsAtMost(pb, cb) < MIN_PARENT_AGE)
          out.push({ kind: 'parentTooYoung', personIds: ids, value: Math.max(0, Math.floor(yearsAtMost(pb, cb))) });
        else if (pb && parent.sex === 'female' && yearsAtLeast(pb, cb) > MAX_MOTHER_AGE)
          out.push({ kind: 'motherTooOld', personIds: ids, value: Math.floor(yearsAtLeast(pb, cb)) });
        else if (pb && parent.sex === 'male' && yearsAtLeast(pb, cb) > MAX_FATHER_AGE)
          out.push({ kind: 'fatherTooOld', personIds: ids, value: Math.floor(yearsAtLeast(pb, cb)) });
      }
    }

    // The wedding: not before the partners were old enough, nor after one of them died.
    const start = dateSpan(f.start?.date);
    if (start) {
      for (const id of f.partners) {
        const pb = born(id);
        const pd = died(id);
        if (pb && yearsAtMost(pb, start) < MIN_UNION_AGE)
          out.push({ kind: 'unionTooYoung', personIds: [id], value: Math.max(0, Math.floor(yearsAtMost(pb, start))) });
        if (pd && start.lo > pd.hi) out.push({ kind: 'unionAfterDeath', personIds: [id] });
      }
    }

    // Brothers and sisters born too close together to both be right, unless born together.
    const dated = children
      .map((c) => ({ c, b: born(c.personId) }))
      .filter((x): x is { c: (typeof children)[number]; b: { lo: number; hi: number } } => !!x.b && x.b.hi - x.b.lo < 40 * DAY)
      .sort((x, y) => x.b.lo - y.b.lo);
    for (let i = 0; i + 1 < dated.length; i++) {
      const a = dated[i];
      const z = dated[i + 1];
      if (a.c.birthGroup && a.c.birthGroup === z.c.birthGroup) continue;
      const months = (z.b.lo - a.b.hi) / (YEAR / 12);
      // Born on the same days may be twins not marked as such: only a gap of some days and too few months is a problem.
      if (z.b.lo - a.b.hi > 2 * DAY && months < MIN_SIBLING_MONTHS)
        out.push({ kind: 'siblingsTooClose', personIds: [z.c.personId, a.c.personId], value: Math.max(0, Math.round(months)) });
    }
  }
  return out;
}
