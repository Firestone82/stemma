/**
 * The families of a tree as an outline, for the family document: each family
 * (everyone born with its name, see ChartModel.familyKeyOf) set out from its
 * oldest known members down, children under their parents, numbered by branch
 * (1, 1.2, 1.2.3). Children born into another family (a daughter's children,
 * who bear their father's name) are listed under their mother with the family
 * they carry on in, which has a table of its own.
 */
import { ChartLanguage, surnameLinesIn } from '../lang/language';
import { birthGroupOf } from '../model/births';
import { dateSortKey } from '../model/dates';
import { relationshipStatus } from '../model/relationship';
import { TreeIndex } from '../model/tree-index';
import { Family, LifeEvent, Person, TreeDocument } from '../model/types';

export interface OutlinePartner {
  /** "Jana Nová, née Dvořáková". */
  name: string;
  /** "1920 – 1990". */
  lifespan: string;
  /** "∞ 12 May 1950", "∞ 1979, divorced", "engaged"; empty when nothing is known. */
  union: string;
}

export interface OutlinePerson {
  kind: 'person';
  /** By branch: "1", "1.2", "1.2.3". */
  number: string;
  /** 0 for the oldest of a branch. */
  level: number;
  personId: string;
  /** "Marie Mikulová". */
  name: string;
  /** "née Nováková"; empty when the same as now. */
  bornAs: string;
  /** "17 May 1923, Brno"; empty when not known. */
  birth: string;
  /** The death in the same way; "†" when only known to have died; empty for the living. */
  death: string;
  partners: OutlinePartner[];
  /** "twin sister" for someone born together with brothers or sisters; empty otherwise. */
  bornWith: string;
  /** For a child born into another family: that family's name. */
  continuesIn?: string;
  /** Listed already (in a family whose parents are related): the number they are listed under. */
  seeNumber?: string;
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
  /** Only these families (by key), in this order; all of them otherwise, by name. */
  keys?: readonly string[];
}

/** The outline of each family, by name; people with no surname last. People left out of prints are left out. */
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

  const keys = input.keys
    ? input.keys.filter((k) => members.has(k))
    : [...members.keys()].sort((a, b) => Number(!a) - Number(!b) || input.compare(input.labelOf(a), input.labelOf(b)));

  const nameOf = (p: Person) => {
    const lines = surnameLinesIn(language, p, input.birthSurnames.get(p.id));
    const given = p.name.given.trim() || language.unknown(p.sex);
    return { name: lines.surname ? `${given} ${lines.surname}` : given, bornAs: lines.birth };
  };
  const partnerOf = (f: Family, personId: string): OutlinePartner | undefined => {
    const other = shown(f.partners.find((id) => id !== personId));
    if (!other) return undefined;
    const n = nameOf(other);
    return { name: n.bornAs ? `${n.name}, ${n.bornAs}` : n.name, lifespan: language.lifespan(other), union: unionText(language, f) };
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
    const listed = new Map<string, string>();
    let deepest = 0;

    const add = (p: Person, level: number, number: string) => {
      const before = listed.get(p.id);
      const n = nameOf(p);
      const group = birthGroupOf(doc, p.id);
      const base: OutlinePerson = {
        kind: 'person',
        number,
        level,
        personId: p.id,
        name: n.name,
        bornAs: n.bornAs,
        birth: eventText(language, p.birth),
        death: p.death ? eventText(language, p.death) || '†' : '',
        partners: [],
        bornWith: group ? language.bornWith(p.sex, group.memberIds.length) : '',
      };
      if (before) {
        rows.push({ ...base, seeNumber: before });
        return;
      }
      if (!inFamily.has(p.id)) {
        rows.push({ ...base, continuesIn: input.labelOf(keyFor(p.id)) });
        return;
      }
      listed.set(p.id, number);
      deepest = Math.max(deepest, level);
      const families = index.partnerFamilies(p.id);
      base.partners = families.map((f) => partnerOf(f, p.id)).filter((x): x is OutlinePartner => !!x);
      rows.push(base);

      // A family with only this parent known is among them too.
      const withChildren = families.filter((f) => childrenOf(f).length);
      let child = 0;
      for (const f of withChildren) {
        if (withChildren.length > 1) rows.push({ kind: 'union', level: level + 1, partner: partnerOf(f, p.id) });
        for (const c of childrenOf(f)) add(c, level + 1, `${number}.${++child}`);
      }
    };

    roots.forEach((p, i) => add(p, 0, String(i + 1)));
    // Anyone not reached (a loop of parents in a broken file) starts a branch of their own.
    for (const p of [...own].sort(byAge)) if (!listed.has(p.id)) add(p, 0, String(rows.filter((r) => r.kind === 'person' && r.level === 0).length + 1));

    return { key, label: input.labelOf(key), people: listed.size, generations: deepest + 1, rows };
  });
}

/** "∞ 12 May 1950", "∞ 1979, divorced", "engaged"; the wedding (or start of a partnership) and how the couple stand. */
function unionText(language: ChartLanguage, f: Family): string {
  const status = relationshipStatus(f);
  const word = language.union(status);
  const when = f.start?.date ? language.fullDate(f.start.date) : '';
  if (!when) return word;
  if (f.kind !== 'marriage') return [word, when].filter(Boolean).join(' ');
  return status === 'married' ? `∞ ${when}` : [`∞ ${when}`, word].filter(Boolean).join(', ');
}

/** "17 May 1923, Brno". */
function eventText(language: ChartLanguage, event: LifeEvent | undefined): string {
  if (!event) return '';
  return [event.date ? language.fullDate(event.date) : '', event.place?.trim() ?? ''].filter(Boolean).join(', ');
}
