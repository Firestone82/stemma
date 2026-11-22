/**
 * The families of a tree as an outline, for the family document: each family
 * (everyone born with its name, see ChartModel.familyKeyOf) set out from its
 * oldest known members down, children under their parents. Everyone has one
 * number in the whole document, given in the order the families list them, and
 * keeps it wherever else they appear: among the partners, or as a child born
 * into another family (a daughter's children, who bear their father's name),
 * listed under their mother with the family they carry on in.
 */
import { ChartLanguage, surnameLinesIn } from '../lang/language';
import { dateSortKey } from '../model/dates';
import { relationshipStatus } from '../model/relationship';
import { TreeIndex } from '../model/tree-index';
import { ChildRelation, Family, Person, Sex, TreeDocument } from '../model/types';

export interface OutlinePartner {
  personId: string;
  /** Their number in the document. */
  number: string;
  /** "Jana Nová, née Dvořáková". */
  name: string;
  /** "1920 – 1990". */
  lifespan: string;
  /** How the couple stand: "married", "divorced"; empty when nothing is known. */
  union: string;
}

export interface OutlinePerson {
  kind: 'person';
  /** The person's number in the whole document. */
  number: string;
  /** 0 for the oldest of a branch. */
  level: number;
  personId: string;
  /** "Marie Mikulová". */
  name: string;
  /** "née Nováková"; empty when the same as now. */
  bornAs: string;
  /** "17 May 1923"; "?" when not known. */
  birth: string;
  /** The date of death; "?" when they died and nobody knows when; empty for the living. */
  death: string;
  sex: Sex;
  /** How they are the child of the parent they are listed under; undefined for the oldest of a branch. */
  childRelation?: ChildRelation;
  partners: OutlinePartner[];
  /** For a child born into another family: that family's name. */
  continuesIn?: string;
}

/** Above the children of one of several partners: "with Jana Nová". */
export interface OutlineUnion {
  kind: 'union';
  level: number;
  partner: OutlinePartner | undefined;
}

export type OutlineRow = OutlinePerson | OutlineUnion;

export interface OutlineFamily {
  key: string;
  label: string;
  /** Born into the family, as listed. */
  people: number;
  /** Generations from the oldest listed to the youngest. */
  generations: number;
  rows: OutlineRow[];
}

export interface OutlineInput {
  doc: TreeDocument;
  index: TreeIndex;
  /** The family each person was born into (ChartModel.familyKeyOf). */
  keyOf: ReadonlyMap<string, string>;
  /** A family's name by key (ChartModel.familyNames). */
  labelOf: (key: string) => string;
  /** The surname each person was born with (ChartModel.birthSurnames). */
  birthSurnames: ReadonlyMap<string, string>;
  language: ChartLanguage;
  /** Orders the families' names, in the language of the document. */
  compare: (a: string, b: string) => number;
  /** The families set out in full (by key); all of them when not given. */
  keys?: readonly string[];
  /**
   * Families set out only in part, by key: the people of theirs to list, the descendants of the families
   * set out in full who carry on another family (see linkedFamilies).
   */
  partial?: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * The outline of each family, by name, people with no surname last; not numbered yet (see numberOutline).
 * People left out of prints are left out.
 */
export function familyOutline(input: OutlineInput): OutlineFamily[] {
  const { doc, index, keyOf, language } = input;
  const shown = (id: string | undefined): Person | undefined => {
    const p = index.person(id);
    return p && !p.hiddenFromPrint ? p : undefined;
  };
  const keyFor = (id: string) => keyOf.get(id) ?? '';

  const members = new Map<string, Person[]>();
  for (const p of doc.people) {
    if (p.hiddenFromPrint) continue;
    const k = keyFor(p.id);
    const list = members.get(k) ?? [];
    list.push(p);
    members.set(k, list);
  }

  // A family set out in part has only the people it is set out for.
  for (const [key, ids] of input.partial ?? []) {
    if (input.keys?.includes(key)) continue;
    const list = (members.get(key) ?? []).filter((p) => ids.has(p.id));
    if (list.length) members.set(key, list);
  }
  const wanted = new Set([...(input.keys ?? members.keys()), ...(input.keys ? (input.partial?.keys() ?? []) : [])]);
  const keys = [...members.keys()].filter((k) => wanted.has(k)).sort((a, b) => Number(!a) - Number(!b) || input.compare(input.labelOf(a), input.labelOf(b)));

  const nameOf = (p: Person) => {
    const lines = surnameLinesIn(language, p, input.birthSurnames.get(p.id));
    const given = p.name.given.trim() || language.unknown(p.sex);
    return { name: lines.surname ? `${given} ${lines.surname}` : given, bornAs: lines.birth };
  };
  const partnerOf = (f: Family, personId: string): OutlinePartner | undefined => {
    const other = shown(f.partners.find((id) => id !== personId));
    if (!other) return undefined;
    const n = nameOf(other);
    return {
      personId: other.id,
      number: '',
      name: n.bornAs ? `${n.name}, ${n.bornAs}` : n.name,
      lifespan: language.lifespan(other),
      union: language.union(relationshipStatus(f)),
    };
  };
  const childrenOf = (f: Family) => f.children.map((c) => shown(c.personId)).filter((p): p is Person => !!p);

  return keys.map((key) => {
    const own = members.get(key) ?? [];
    const inFamily = new Set(own.map((p) => p.id));
    // The oldest known of each branch: nobody they descend from is listed in the family.
    const hasParentIn = (p: Person) => index.parentFamilies(p.id).some((f) => f.partners.some((id) => inFamily.has(id) && shown(id)));
    const byAge = (a: Person, b: Person) =>
      (dateSortKey(a.birth?.date) ?? Infinity) - (dateSortKey(b.birth?.date) ?? Infinity) || index.order(a.id) - index.order(b.id);
    const roots = own.filter((p) => !hasParentIn(p)).sort(byAge);

    const rows: OutlineRow[] = [];
    const listed = new Set<string>();
    let deepest = 0;

    const add = (p: Person, level: number, childRelation?: ChildRelation) => {
      // Listed already in this table (a family whose parents are related): not again.
      if (listed.has(p.id)) return;
      const n = nameOf(p);
      const base: OutlinePerson = {
        kind: 'person',
        number: '',
        level,
        personId: p.id,
        name: n.name,
        bornAs: n.bornAs,
        birth: (p.birth?.date ? language.fullDate(p.birth.date) : '') || '?',
        death: p.death ? (p.death.date ? language.fullDate(p.death.date) : '') || '?' : '',
        sex: p.sex,
        childRelation,
        partners: [],
      };
      if (!inFamily.has(p.id)) {
        rows.push({ ...base, continuesIn: input.labelOf(keyFor(p.id)) });
        return;
      }
      listed.add(p.id);
      deepest = Math.max(deepest, level);
      const families = index.partnerFamilies(p.id);
      base.partners = families.map((f) => partnerOf(f, p.id)).filter((x): x is OutlinePartner => !!x);
      rows.push(base);

      // A family with only this parent known is among them too.
      const withChildren = families.filter((f) => childrenOf(f).length);
      for (const f of withChildren) {
        if (withChildren.length > 1) rows.push({ kind: 'union', level: level + 1, partner: partnerOf(f, p.id) });
        for (const c of childrenOf(f)) add(c, level + 1, index.childRelation(f, c.id));
      }
    };

    for (const p of roots) add(p, 0);
    // Anyone not reached (a loop of parents in a broken file) starts a branch of their own.
    for (const p of [...own].sort(byAge)) if (!listed.has(p.id)) add(p, 0);

    return { key, label: input.labelOf(key), people: listed.size, generations: deepest + 1, rows };
  });
}

/**
 * Numbers everyone in the order the families, as they will be printed, set their own people out; they
 * keep the number wherever else they appear. A child carrying on a family whose table comes earlier is
 * written there already, and is not mentioned again.
 */
export function numberOutline(families: readonly OutlineFamily[]): OutlineFamily[] {
  const numbers = new Map<string, string>();
  const out = families.map((f) => {
    const rows = f.rows.filter((r) => !(r.kind === 'person' && r.continuesIn && numbers.has(r.personId)));
    for (const r of rows) if (r.kind === 'person' && !r.continuesIn && !numbers.has(r.personId)) numbers.set(r.personId, String(numbers.size + 1));
    return { ...f, rows };
  });
  for (const f of out) {
    for (const r of f.rows) {
      if (r.kind === 'person') {
        r.number = numbers.get(r.personId) ?? '';
        for (const partner of r.partners) partner.number = numbers.get(partner.personId) ?? '';
      } else if (r.partner) {
        r.partner.number = numbers.get(r.partner.personId) ?? '';
      }
    }
  }
  return out;
}

/**
 * The families the families `keys` lead into: their descendants born into other families (a daughter's
 * children, who bear their father's name), and theirs further down, by the family they carry on.
 */
export function linkedFamilies(index: TreeIndex, keyOf: ReadonlyMap<string, string>, keys: Iterable<string>): Map<string, Set<string>> {
  const full = new Set(keys);
  const out = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const stack = [...keyOf].filter(([, k]) => full.has(k)).map(([id]) => id);
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const key = keyOf.get(id) ?? '';
    if (!full.has(key)) {
      const set = out.get(key) ?? new Set<string>();
      set.add(id);
      out.set(key, set);
    }
    for (const c of index.children(id)) stack.push(c.id);
  }
  return out;
}
