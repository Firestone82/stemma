/**
 * Merging a part of the tree back in (see part.ts): the people and families of a file are matched with those of
 * the tree, by id where they came from it, by name and birth where they are new in the file and may be someone
 * the tree already has. Each field is taken from the side that changed it since the part was taken out; a field
 * changed on both sides is a conflict, decided by the person merging (or by the preferred side until then).
 */
import { newId } from '../model/ids';
import { normalizeQuery, surnameKey } from '../model/names';
import { cleanupFamilies, deletePerson } from '../model/operations';
import { TreeIndex } from '../model/tree-index';
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
  changes: Conflict[];
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
  strong: boolean;
}

function sameGiven(a: Person, b: Person): boolean {
  const given = normalizeQuery(a.name.given);
  return !!given && given === normalizeQuery(b.name.given);
}

function sameSurname(a: Person, b: Person): boolean {
  const names = surnames(b);
  return [...surnames(a)].some((name) => names.has(name));
}

function sameDate(a?: string, b?: string): boolean {
  return !!a && a === b;
}

function related(index: TreeIndex, id: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (other: string, role: string) => {
    if (other === id) return;
    const roles = out.get(other) ?? new Set<string>();
    roles.add(role);
    out.set(other, roles);
  };
  for (const family of index.parentFamilies(id)) {
    for (const parent of family.partners) add(parent, 'parent');
    for (const child of family.children) add(child.personId, 'sibling');
  }
  for (const family of index.partnerFamilies(id)) {
    for (const partner of family.partners) add(partner, 'partner');
    for (const child of family.children) add(child.personId, 'child');
  }
  return out;
}

function likelySame(
  p: Person,
  pool: readonly Person[],
  connections: ReadonlyMap<string, Set<string>>,
  localConnections: ReadonlyMap<string, Map<string, Set<string>>>,
  standalone: boolean,
): Candidate[] {
  const y = year(p);
  const birth = p.birth?.date?.value;
  const death = p.death?.date?.value;
  const out: Candidate[] = [];
  for (const l of pool) {
    const given = sameGiven(p, l);
    const surname = sameSurname(p, l);
    const birthMatches = sameDate(birth, l.birth?.date?.value);
    const deathMatches = sameDate(death, l.death?.date?.value);
    const dated = (birthMatches && birth!.length === 10) || (deathMatches && death!.length === 10) || (birthMatches && deathMatches);
    if (!given && !surname && !dated && !connections.size) continue;
    if (p.sex !== 'unknown' && l.sex !== 'unknown' && p.sex !== l.sex) continue;
    const relatives = localConnections.get(l.id);
    const links = [...connections].filter(([id, roles]) => [...roles].some((role) => relatives?.get(id)?.has(role))).length;
    const ly = year(l);
    const distant = y !== undefined && ly !== undefined && Math.abs(y - ly) > 2;
    if (!(given && surname) && !((given || surname) && (dated || links)) && !(dated && links) && !(birthMatches && deathMatches) && links < 2) continue;
    const matchingYear = standalone && birthMatches && (!death || !l.death?.date?.value || deathMatches);
    const strong =
      (given && surname && (dated || matchingYear || (links > 0 && !distant))) || ((given || surname) && dated && links > 0) || (dated && links >= 2);
    const score = Number(given) * 3 + Number(surname) * 3 + Number(birthMatches) * 3 + Number(deathMatches) * 3 + links * 4;
    out.push({ id: l.id, score, strong });
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
  const sameTree = !!local.meta.created && local.meta.created === part.meta.created;
  const sharedIdentity = (a: Person, b: Person) =>
    (sameGiven(a, b) && sameSurname(a, b)) || (sameGiven(a, b) && sameDate(a.birth?.date?.value, b.birth?.date?.value));
  const localPeople = new Map(local.people.map((p) => [p.id, p]));
  const partBase = part.part;
  const relatedPart =
    partBase &&
    part.people.some((p) => {
      const match = localPeople.get(p.id);
      const original = partBase.people[p.id];
      return match && original !== undefined && (original === personFingerprints(match) || sharedIdentity(p, match));
    });
  const base: PartInfo | undefined = relatedPart ? partBase : undefined;
  const localFamilies = new Map(local.families.map((f) => [f.id, f]));
  const inFile = new Set(part.people.map((p) => p.id));

  // Someone deleted from the tree since the part was taken out, and not changed in the file, stays deleted.
  const goneHere = (p: Person) => !localPeople.has(p.id) && base?.people[p.id] !== undefined && base.people[p.id] === personFingerprints(p);
  const people = part.people.filter((p) => !goneHere(p));

  // Who is who.
  const target = new Map<string, string | null>();
  const byId = new Set<string>();
  for (const p of people) {
    const match = localPeople.get(p.id);
    if (match && (sameTree || base?.people[p.id] !== undefined || sharedIdentity(p, match))) {
      target.set(p.id, p.id);
      byId.add(p.id);
    }
  }
  const taken = new Set(byId);
  const pool = local.people.filter((l) => !byId.has(l.id));
  const unmatched = people.filter((p) => !byId.has(p.id));
  for (const p of unmatched) {
    if (!decisions.assign?.has(p.id)) continue;
    const chosen = decisions.assign.get(p.id);
    if (chosen && localPeople.has(chosen) && !taken.has(chosen)) {
      target.set(p.id, chosen);
      taken.add(chosen);
    } else target.set(p.id, null);
  }
  const localIndex = new TreeIndex(local);
  const partIndex = new TreeIndex(part);
  const localConnections = new Map(pool.map((p) => [p.id, related(localIndex, p.id)]));
  const partConnections = new Map(unmatched.map((p) => [p.id, related(partIndex, p.id)]));
  const candidatesFor = (p: Person) => {
    const connections = new Map<string, Set<string>>();
    for (const [id, roles] of partConnections.get(p.id) ?? []) {
      const mapped = target.get(id);
      if (mapped) connections.set(mapped, roles);
    }
    return likelySame(p, pool, connections, localConnections, !base);
  };
  // Resolve unambiguous matches together, then use those links as evidence for their relatives.
  for (;;) {
    const proposals = new Map<string, string[]>();
    for (const p of unmatched) {
      if (target.has(p.id)) continue;
      const [first, second] = candidatesFor(p).filter((c) => !taken.has(c.id));
      if (!first?.strong || (second && second.score >= first.score)) continue;
      const claims = proposals.get(first.id) ?? [];
      claims.push(p.id);
      proposals.set(first.id, claims);
    }
    const unique = [...proposals].filter(([, claims]) => claims.length === 1);
    if (!unique.length) break;
    for (const [id, [from]] of unique) {
      target.set(from, id);
      taken.add(id);
    }
  }
  const newPeople: NewPerson[] = unmatched.map((p) => ({
    person: p,
    candidates: candidatesFor(p).map((c) => c.id),
    target: target.get(p.id) ?? null,
    auto: !decisions.assign?.has(p.id) && !!target.get(p.id),
  }));

  // People.
  const ids = new Set<string>([...local.people.map((p) => p.id), ...local.families.map((f) => f.id)]);
  const idMap = new Map<string, string>();
  const changedPeople = new Map<string, Person>();
  const addedPeople: Person[] = [];
  const conflicts: Conflict[] = [];
  const changes: Conflict[] = [];
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
      if (side === 'imported') {
        next = withPersonField(next, p, field);
        changes.push({ key: `p:${to}:${field}`, kind: 'person', localId: to, field, local: lp, imported: p, preferred: 'imported' });
      }
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
    const sameId = families.get(f.id);
    const sameRelationship = sameId && sameSet(sameId.partners, partners) && (partners.length === 2 || sameId.children.some((c) => seen.has(c.personId)));
    const here = (sameTree || bf || sameRelationship ? sameId : undefined) ?? findFamily(families.values(), partners, [...seen]);
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
      if (side === 'imported') {
        next = withFamilyField(next, f, field);
        changes.push({ key: `f:${here.id}:${field}`, kind: 'family', localId: here.id, field, local: here, imported: next, preferred: 'imported' });
      }
    }
    if (childrenChanged || next.partners !== here.partners) {
      changes.push({ key: `f:${here.id}:kids`, kind: 'family', localId: here.id, field: 'kids', local: here, imported: next, preferred: 'imported' });
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
      const next = { ...here, partners: partnersOut, children: here.children.filter((c) => kept.includes(c.personId)) };
      families.set(id, next);
      changes.push({ key: `f:${id}:kids`, kind: 'family', localId: id, field: 'kids', local: here, imported: next, preferred: 'imported' });
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
  return { newPeople, matched: byId.size, conflicts, changes, removals, doc: unchanged ? local : doc, summary, unchanged };
}
