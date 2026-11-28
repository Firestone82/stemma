/**
 * Merging a part of the tree back in (see part.ts): the people and families of a file are matched with those of
 * the tree, by id where they came from it, by name and birth where they are new in the file and may be someone
 * the tree already has. Each field is taken from the side that changed it since the part was taken out; a field
 * changed on both sides is a conflict, decided by the person merging (or by the preferred side until then).
 */
import { newId } from '../model/ids';
import { normalizeQuery, surnameKey } from '../model/names';
import { cleanupFamilies, deletePerson } from '../model/operations';
import { Family, FamilyChild, PartInfo, Person, TreeDocument } from '../model/types';
import {
  FAMILY_FIELDS,
  FamilyField,
  PERSON_FIELDS,
  PersonField,
  baseOf,
  familyFingerprints,
  familyValue,
  fingerprint,
  personFingerprints,
  personValue,
  withPersonField,
} from './part';

export type Side = 'local' | 'imported';

/** Someone in the file whom the tree does not have by id: added as new, or taken as someone the tree has. */
export interface NewPerson {
  person: Person;
  /** People of the tree who may be the same person, the likeliest first. */
  candidates: string[];
  /** Who they are taken as in the tree, or null to add them as someone new. */
  target: string | null;
  /** The target was chosen by name and date of birth, not by the person merging. */
  auto: boolean;
}

/** A field changed both in the tree and in the file since the part was taken out, or different with nothing to tell which is newer. */
export interface Conflict {
  /** Stable key for the decision (MergeDecisions.take). */
  key: string;
  kind: 'person' | 'family';
  /** The person or family in the tree. */
  localId: string;
  field: PersonField | FamilyField;
  local: Person | Family;
  imported: Person | Family;
  /** Taken until decided: the file's where both sides changed it, the tree's where nothing tells which is newer. */
  preferred: Side;
}

/** Someone the file no longer has though they were in it when it was taken out. */
export interface Removal {
  id: string;
  person: Person;
}

export interface MergeDecisions {
  /** By the id in the file: who in the tree they are, or null for someone new. */
  assign?: ReadonlyMap<string, string | null>;
  /** By conflict key: which side's value is taken. */
  take?: ReadonlyMap<string, Side>;
  /** People of the tree to delete because the file no longer has them. */
  remove?: ReadonlySet<string>;
}

export interface MergeSummary {
  added: number;
  updated: number;
  familiesAdded: number;
  familiesUpdated: number;
  removed: number;
}

export interface MergePlan {
  newPeople: NewPerson[];
  /** People of the file the tree has by id. */
  matched: number;
  conflicts: Conflict[];
  removals: Removal[];
  /** The tree with the file merged in, as decided (and as preferred where nothing was decided). */
  doc: TreeDocument;
  summary: MergeSummary;
  /** Nothing in the file differs from the tree. */
  unchanged: boolean;
}

const FAMILY_MERGED: readonly FamilyField[] = ['status', 'notes'];

/** The family `target` with `field` as `from` has it. */
function withFamilyField(target: Family, from: Family, field: FamilyField): Family {
  const next: Family = { ...target };
  if (field === 'status') {
    next.kind = from.kind;
    if (from.engagement) next.engagement = from.engagement;
    else delete next.engagement;
    if (from.end) next.end = from.end;
    else delete next.end;
  } else if (field === 'notes') {
    if (from.notes) next.notes = from.notes;
    else delete next.notes;
  }
  return next;
}

function year(p: Person): number | undefined {
  const m = /^(\d{4})/.exec(p.birth?.date?.value ?? '');
  return m ? Number(m[1]) : undefined;
}

function surnames(p: Person): Set<string> {
  return new Set([surnameKey(p.name.surname), surnameKey(p.name.birthSurname)].filter(Boolean));
}

interface Candidate {
  id: string;
  score: number;
  /** Same names and the same full date of birth: taken as the same person without asking. */
  strong: boolean;
}

/** People of `pool` who may be `p`: the same given name, a surname in common, nothing that rules it out. */
function likelySame(p: Person, pool: readonly Person[]): Candidate[] {
  const given = normalizeQuery(p.name.given);
  if (!given) return [];
  const names = surnames(p);
  const y = year(p);
  const out: Candidate[] = [];
  for (const l of pool) {
    if (normalizeQuery(l.name.given) !== given) continue;
    if (p.sex !== 'unknown' && l.sex !== 'unknown' && p.sex !== l.sex) continue;
    const theirs = surnames(l);
    if ((names.size || theirs.size) && ![...names].some((n) => theirs.has(n))) continue;
    const ly = year(l);
    if (y !== undefined && ly !== undefined && Math.abs(y - ly) > 2) continue;
    const date = p.birth?.date?.value ?? '';
    const sameDate = date.length >= 4 && date === l.birth?.date?.value;
    out.push({ id: l.id, score: 1 + (sameDate ? 2 : 0) + (y !== undefined && y === ly ? 1 : 0), strong: sameDate && date.length === 10 });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * `local` with what the file has and `local` lacks, in the file's order, less what the file dropped since `base`
 * (where `canRemove` allows). Without a base nothing is dropped. What `local` dropped since `base` is not brought back.
 */
function mergeList(local: readonly string[], file: readonly string[], base: readonly string[] | undefined, canRemove: (id: string) => boolean): string[] {
  const out = [...local];
  let after = -1;
  for (const id of file) {
    const at = out.indexOf(id);
    if (at >= 0) {
      after = at;
      continue;
    }
    if (base?.includes(id)) continue;
    out.splice(after + 1, 0, id);
    after++;
  }
  if (base) {
    for (const id of base) {
      const at = out.indexOf(id);
      if (at >= 0 && !file.includes(id) && canRemove(id)) out.splice(at, 1);
    }
  }
  return out;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** A family of the tree that is the file's family `partners` and `children` (already in the tree's ids), when it has no id in common. */
function findFamily(families: Iterable<Family>, partners: readonly string[], children: readonly string[]): Family | undefined {
  for (const f of families) {
    if (partners.length === 2 && sameSet(f.partners, partners)) return f;
    if (partners.length < 2 && sameSet(f.partners, partners) && f.children.some((c) => children.includes(c.personId))) return f;
  }
  return undefined;
}

function meaningful(f: Pick<Family, 'partners' | 'children'>): boolean {
  if (f.partners.length === 2) return true;
  if (f.partners.length === 1) return f.children.length >= 1;
  return f.children.length >= 2;
}

/** Merges the tree file `part` into `local` as `decisions` say (see the module comment). */
export function planMerge(local: TreeDocument, part: TreeDocument, decisions: MergeDecisions = {}): MergePlan {
  const base: PartInfo | undefined = part.part;
  const localPeople = new Map(local.people.map((p) => [p.id, p]));
  const localFamilies = new Map(local.families.map((f) => [f.id, f]));
  const inFile = new Set(part.people.map((p) => p.id));

  // Someone deleted from the tree since the part was taken out, and not changed in the file, stays deleted.
  const goneHere = (p: Person) => !localPeople.has(p.id) && base?.people[p.id] !== undefined && base.people[p.id] === personFingerprints(p);
  const people = part.people.filter((p) => !goneHere(p));

  // Who is who.
  const target = new Map<string, string | null>();
  const byId = new Set<string>();
  for (const p of people) {
    if (localPeople.has(p.id)) {
      target.set(p.id, p.id);
      byId.add(p.id);
    }
  }
  const taken = new Set(byId);
  const pool = local.people.filter((l) => !byId.has(l.id));
  const newPeople: NewPerson[] = [];
  for (const p of people) {
    if (target.has(p.id)) continue;
    const candidates = likelySame(p, pool);
    const decided = decisions.assign?.has(p.id);
    let chosen: string | null;
    if (decided) chosen = decisions.assign!.get(p.id) ?? null;
    else {
      const strong = candidates.filter((c) => c.strong && !taken.has(c.id));
      chosen = strong.length === 1 ? strong[0].id : null;
    }
    const to = chosen && localPeople.has(chosen) && !taken.has(chosen) ? chosen : null;
    if (to) taken.add(to);
    target.set(p.id, to);
    newPeople.push({ person: p, candidates: candidates.map((c) => c.id), target: to, auto: !decided && !!to });
  }

  // People.
  const ids = new Set<string>([...local.people.map((p) => p.id), ...local.families.map((f) => f.id)]);
  const idMap = new Map<string, string>();
  const changedPeople = new Map<string, Person>();
  const addedPeople: Person[] = [];
  const conflicts: Conflict[] = [];
  const decide = (key: string, preferred: Side) => decisions.take?.get(key) ?? preferred;

  for (const p of people) {
    const to = target.get(p.id);
    if (!to) {
      const id = ids.has(p.id) ? newId('I', ids) : p.id;
      ids.add(id);
      idMap.set(p.id, id);
      addedPeople.push(id === p.id ? p : { ...p, id });
      continue;
    }
    idMap.set(p.id, to);
    const lp = localPeople.get(to)!;
    const bases = to === p.id ? base?.people[p.id] : undefined;
    let next = lp;
    for (const field of PERSON_FIELDS) {
      const lv = personValue(lp, field);
      const iv = personValue(p, field);
      if (lv === iv) continue;
      const b = baseOf(bases, PERSON_FIELDS, field);
      let side: Side | undefined;
      if (b !== undefined) {
        if (fingerprint(lv) === b) side = 'imported';
        else if (fingerprint(iv) === b) side = 'local';
      } else if (!lv) side = 'imported';
      else if (!iv) side = 'local';
      if (!side) {
        const key = `p:${to}:${field}`;
        const preferred: Side = b !== undefined ? 'imported' : 'local';
        conflicts.push({ key, kind: 'person', localId: to, field, local: lp, imported: p, preferred });
        side = decide(key, preferred);
      }
      if (side === 'imported') next = withPersonField(next, p, field);
    }
    if (next !== lp) changedPeople.set(to, next);
  }

  // Families.
  const families = new Map<string, Family>(local.families.map((f) => [f.id, f]));
  const familyOrder = local.families.map((f) => f.id);
  const touched = new Set<string>();
  const inFileHere = new Set<string>();
  for (const p of people) {
    const to = target.get(p.id);
    if (to) inFileHere.add(to);
  }
  const canRemove = (id: string) => inFileHere.has(id);
  const mapIds = (list: readonly string[]) => [...new Set(list.map((i) => idMap.get(i)).filter((i): i is string => !!i))];
  let familiesAdded = 0;
  const filesFamilies = new Set(part.families.map((f) => f.id));

  for (const f of part.families) {
    const partners = mapIds(f.partners);
    const seen = new Set<string>();
    const children: FamilyChild[] = [];
    for (const c of f.children) {
      const id = idMap.get(c.personId);
      if (!id || seen.has(id) || partners.includes(id)) continue;
      seen.add(id);
      children.push({ ...c, personId: id });
    }
    const bf = base?.families[f.id];
    if (
      !localFamilies.has(f.id) &&
      bf &&
      bf.fields === familyFingerprints(f) &&
      sameSet(bf.partners, f.partners) &&
      sameSet(
        bf.children,
        f.children.map((c) => c.personId),
      )
    ) {
      // Deleted from the tree since, and not changed in the file.
      continue;
    }
    const here = localFamilies.has(f.id)
      ? families.get(f.id)
      : findFamily(
          [...families.values()],
          partners,
          children.map((c) => c.personId),
        );
    if (!here) {
      const fam: Family = { ...f, partners: partners.slice(0, 2), children };
      if (!meaningful(fam)) continue;
      const id = ids.has(f.id) ? newId('F', ids) : f.id;
      ids.add(id);
      families.set(id, id === f.id ? fam : { ...fam, id });
      familyOrder.push(id);
      familiesAdded++;
      continue;
    }
    const sameRecord = here.id === f.id;
    const fb = sameRecord ? bf : undefined;
    let next: Family = here;
    const partnersOut = mergeList(here.partners, partners, fb?.partners, canRemove).slice(0, 2);
    const childIds = mergeList(
      here.children.map((c) => c.personId),
      children.map((c) => c.personId),
      fb?.children,
      canRemove,
    ).filter((id) => !partnersOut.includes(id));
    // How each child is a child: the file's where the tree did not change it since.
    const localKidsUnchanged = fb ? baseOf(fb.fields, FAMILY_FIELDS, 'kids') === fingerprint(familyValue(here, 'kids')) : false;
    const childrenOut = childIds.map((id) => {
      const mine = here.children.find((c) => c.personId === id);
      const theirs = children.find((c) => c.personId === id);
      if (!mine) return theirs!;
      if (!theirs || (mine.relation === theirs.relation && mine.birthGroup === theirs.birthGroup)) return mine;
      return localKidsUnchanged || mine.relation === 'unknown' ? { ...mine, relation: theirs.relation, birthGroup: theirs.birthGroup } : mine;
    });
    if (!sameSet(partnersOut, here.partners) || partnersOut.some((p, i) => p !== here.partners[i])) next = { ...next, partners: partnersOut };
    const childrenChanged =
      childrenOut.length !== here.children.length ||
      childrenOut.some((c, i) => c !== here.children[i] && JSON.stringify(c) !== JSON.stringify(here.children[i]));
    if (childrenChanged) next = { ...next, children: childrenOut };
    for (const field of FAMILY_MERGED) {
      const lv = familyValue(here, field);
      const iv = familyValue(f, field);
      if (lv === iv) continue;
      const b = baseOf(fb?.fields, FAMILY_FIELDS, field);
      let side: Side | undefined;
      if (b !== undefined) {
        if (fingerprint(lv) === b) side = 'imported';
        else if (fingerprint(iv) === b) side = 'local';
      } else if (!lv || lv === 'unknown||') side = 'imported';
      else if (!iv || iv === 'unknown||') side = 'local';
      if (!side) {
        const key = `f:${here.id}:${field}`;
        const preferred: Side = b !== undefined ? 'imported' : 'local';
        conflicts.push({ key, kind: 'family', localId: here.id, field, local: here, imported: f, preferred });
        side = decide(key, preferred);
      }
      if (side === 'imported') next = withFamilyField(next, f, field);
    }
    if (next !== here) {
      families.set(here.id, next);
      touched.add(here.id);
    }
  }

  // Families the file no longer has: the people still in the file have left them.
  if (base) {
    for (const [id, bf] of Object.entries(base.families)) {
      if (filesFamilies.has(id)) continue;
      const here = families.get(id);
      if (!here) continue;
      const partnersOut = mergeList(here.partners, [], bf.partners, canRemove);
      const kept = mergeList(
        here.children.map((c) => c.personId),
        [],
        bf.children,
        canRemove,
      );
      if (partnersOut.length === here.partners.length && kept.length === here.children.length) continue;
      families.set(id, { ...here, partners: partnersOut, children: here.children.filter((c) => kept.includes(c.personId)) });
      touched.add(id);
    }
  }

  // People the file no longer has.
  const removals: Removal[] = [];
  if (base) {
    for (const id of Object.keys(base.people)) {
      const person = localPeople.get(id);
      if (person && !inFile.has(id)) removals.push({ id, person });
    }
  }

  let doc: TreeDocument = {
    ...local,
    people: [...local.people.map((p) => changedPeople.get(p.id) ?? p), ...addedPeople],
    families: familyOrder.map((id) => families.get(id)!),
  };
  doc = cleanupFamilies(doc, touched);
  let removed = 0;
  for (const r of removals) {
    if (!decisions.remove?.has(r.id) || !doc.people.some((p) => p.id === r.id)) continue;
    doc = deletePerson(doc, r.id);
    removed++;
  }

  const familiesUpdated = [...touched].filter((id) => localFamilies.has(id)).length;
  const summary: MergeSummary = { added: addedPeople.length, updated: changedPeople.size, familiesAdded, familiesUpdated, removed };
  const unchanged = !summary.added && !summary.updated && !familiesAdded && !familiesUpdated && !removals.length && !conflicts.length;
  return { newPeople, matched: byId.size, conflicts, removals, doc: unchanged ? local : doc, summary, unchanged };
}
