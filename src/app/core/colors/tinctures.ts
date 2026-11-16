/**
 * Colours for the chart, named after heraldic tinctures: each family name gets
 * its own colour on the small shield beside the name, the way a family once
 * had its arms. The actual colour values live in the chart styles, per theme.
 */
import { Unite, lineageSurname, surnameKey, unitingOf } from '../model/names';
import { TreeIndex } from '../model/tree-index';
import { Person, Sex, TreeDocument } from '../model/types';
import { toRoman } from '../layout/types';

/** What the shields are coloured by. The chart and the prints colour by family; the others are kept for whoever calls this. */
export type ColorBy = 'family' | 'generation' | 'sex' | 'none';

export type Tincture =
  'azure' | 'gules' | 'vert' | 'purpure' | 'or' | 'tenne' | 'sanguine' | 'celeste' | 'sable' | 'teal' | 'rose' | 'olive' | 'cendree' | 'brunatre' | 'argent';

/**
 * Colours handed out to families, most numerous family first: fourteen families get a colour each before any
 * repeats. In an order where each is as unlike the ones before it as can be: blue, red, green, gold, purple,
 * orange, teal, pink, black, lime, brown, sky, wine, grey.
 */
export const LINE_TINCTURES: readonly Tincture[] = [
  'azure',
  'gules',
  'vert',
  'or',
  'purpure',
  'tenne',
  'teal',
  'rose',
  'sable',
  'olive',
  'brunatre',
  'celeste',
  'sanguine',
  'cendree',
];

export interface LegendEntry {
  key: string;
  label: string;
  tincture: Tincture;
  count: number;
}

export interface ColorAssignment {
  byPerson: ReadonlyMap<string, Tincture>;
  legend: LegendEntry[];
}

const SEX_TINCTURE: Record<Sex, Tincture> = { male: 'azure', female: 'sanguine', other: 'vert', unknown: 'argent' };

/**
 * Colours for everyone in the tree. `lineage` gives the surname a person was
 * born with, which picks their family colour; by default the recorded one.
 * `ranks` gives each person's generation row; people without one are not on
 * the chart and are left out of the generations. When `doc` is part of a
 * bigger tree (a print of some of it), `whole` is the tree: families keep the
 * colours they have on the chart, and the legend counts the people in `doc`.
 */
export function assignColors(
  doc: TreeDocument,
  colorBy: ColorBy,
  ranks: ReadonlyMap<string, number>,
  lineage: (p: Person) => string = lineageSurname,
  whole: TreeDocument = doc,
  singles = false,
): ColorAssignment {
  const byPerson = new Map<string, Tincture>();
  switch (colorBy) {
    case 'family':
      return byFamily(doc, whole, lineage, singles);
    case 'generation': {
      // Number the rows that hold people, so the first generation gets the first colour.
      const used = new Map<number, number>();
      for (const p of doc.people) {
        const r = ranks.get(p.id);
        if (r !== undefined) used.set(r, (used.get(r) ?? 0) + 1);
      }
      const rows = [...used.keys()].sort((a, b) => a - b);
      const generation = new Map(rows.map((r, i) => [r, i]));
      for (const p of doc.people) {
        const r = ranks.get(p.id);
        const g = r === undefined ? undefined : generation.get(r);
        byPerson.set(p.id, g === undefined ? 'argent' : LINE_TINCTURES[g % LINE_TINCTURES.length]);
      }
      // Labelled with the generation's numeral; the interface and prints add the word for it.
      const legend = rows.map((r, i) => ({ key: String(r), label: toRoman(i + 1), tincture: LINE_TINCTURES[i % LINE_TINCTURES.length], count: used.get(r)! }));
      return { byPerson, legend };
    }
    case 'sex': {
      const counts = new Map<Sex, number>();
      for (const p of doc.people) {
        byPerson.set(p.id, SEX_TINCTURE[p.sex]);
        counts.set(p.sex, (counts.get(p.sex) ?? 0) + 1);
      }
      const order: Sex[] = ['female', 'male', 'other', 'unknown'];
      // Keyed by sex; the interface and prints put it in words.
      const legend = order.filter((s) => counts.has(s)).map((s) => ({ key: s, label: s, tincture: SEX_TINCTURE[s], count: counts.get(s)! }));
      return { byPerson, legend };
    }
    case 'none':
      for (const p of doc.people) byPerson.set(p.id, 'argent');
      return { byPerson, legend: [] };
  }
}

/**
 * @param singles A family of one gets a colour too (on the chart); otherwise those are "Other families", in no
 *   colour (in prints). The families of more keep the same colours either way: those of one come after them.
 */
function byFamily(doc: TreeDocument, whole: TreeDocument, lineage: (p: Person) => string, singles = false): ColorAssignment {
  // Colours go to the families of the whole tree: the lines the person in the
  // middle descends from first (a great-grandmother's family is a line of the
  // tree even when only she and her father carry its name), then the rest,
  // each most numerous first.
  // One family for the Polish, the German and the Czech spelling of a name, when the tree says so (ViewSettings.uniteSpellings, uniteForeign).
  const united = unitingOf(whole.view);
  const lines = ancestralLines(whole, lineage, united);
  const groups = familyGroups(whole.people, lineage, united);
  const ranked = [
    ...groups
      .filter(([, g]) => g.count >= 2)
      .sort((a, b) => Number(lines.has(b[0])) - Number(lines.has(a[0])) || b[1].count - a[1].count || a[1].first - b[1].first),
    ...(singles ? groups.filter(([, g]) => g.count < 2).sort((a, b) => a[1].first - b[1].first) : []),
  ];
  const tinctureOf = spreadColours(
    ranked.map(([key]) => key),
    neighbours(whole, lineage, united),
  );
  // A print of part of the tree: the families on it keep their colours from the chart where
  // they can, but no two of them share one while there are colours to go round.
  const here = new Map(familyGroups(doc.people, lineage, united));
  if (doc !== whole) {
    const taken = new Set<Tincture>();
    for (const [key] of ranked) {
      if (!here.has(key)) continue;
      let t = tinctureOf.get(key)!;
      if (taken.has(t)) t = LINE_TINCTURES.find((x) => !taken.has(x)) ?? t;
      tinctureOf.set(key, t);
      taken.add(t);
    }
  }
  const byPerson = new Map<string, Tincture>();
  let others = 0;
  for (const p of doc.people) {
    const t = tinctureOf.get(surnameKey(lineage(p), united));
    byPerson.set(p.id, t ?? 'argent');
    if (!t) others++;
  }
  // The legend counts the people in this part of the tree, in the order the colours were given.
  const legend: LegendEntry[] = [];
  for (const [key] of ranked) {
    const g = here.get(key);
    if (g) legend.push({ key, label: preferredSpelling(g.spellings), tincture: tinctureOf.get(key)!, count: g.count });
  }
  if (others) legend.push({ key: '', label: 'Others', tincture: 'argent', count: others });
  return { byPerson, legend };
}

/**
 * A colour for each family, in the order given: each the next of LINE_TINCTURES, but never one a family it is
 * joined to already has (by a marriage, or as a mother's family), while there is another to take. With more
 * families than colours, colours come round again; not between families that stand side by side on the chart.
 */
function spreadColours(keys: readonly string[], joined: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Tincture> {
  const out = new Map<string, Tincture>();
  keys.forEach((key, i) => {
    const near = new Set([...(joined.get(key) ?? [])].map((k) => out.get(k)).filter((t): t is Tincture => !!t));
    const n = LINE_TINCTURES.length;
    let pick = LINE_TINCTURES[i % n];
    for (let step = 0; step < n && near.has(pick); step++) pick = LINE_TINCTURES[(i + step + 1) % n];
    out.set(key, pick);
  });
  return out;
}

/** Families joined to each other in the tree: by a couple of the two, and by a child of one born to a parent of the other. */
function neighbours(doc: TreeDocument, lineage: (p: Person) => string, united: boolean | Unite): Map<string, Set<string>> {
  const index = new TreeIndex(doc);
  const keyOf = (id: string) => {
    const p = index.person(id);
    return p ? surnameKey(lineage(p), united) : '';
  };
  const out = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    if (!a || !b || a === b) return;
    (out.get(a) ?? out.set(a, new Set()).get(a)!).add(b);
    (out.get(b) ?? out.set(b, new Set()).get(b)!).add(a);
  };
  for (const f of doc.families) {
    const parents = f.partners.map(keyOf);
    if (parents.length === 2) join(parents[0], parents[1]);
    for (const c of f.children) for (const k of parents) join(keyOf(c.personId), k);
  }
  return out;
}

/** The family names of the home person's ancestors (and their own), as surname keys. */
function ancestralLines(doc: TreeDocument, lineage: (p: Person) => string, united: boolean | Unite): Set<string> {
  const out = new Set<string>();
  const home = doc.meta.homePersonId;
  if (!home) return out;
  const index = new TreeIndex(doc);
  const root = index.person(home);
  if (!root) return out;
  for (const id of [home, ...index.ancestors(home)]) {
    const p = index.person(id);
    const key = p && surnameKey(lineage(p), united);
    if (key) out.add(key);
  }
  return out;
}

interface FamilyGroup {
  count: number;
  first: number;
  spellings: Map<string, number>;
}

/** People by the family they were born into (Novák and Nováková together), with how each spells it. */
function familyGroups(people: readonly Person[], lineage: (p: Person) => string, united: boolean | Unite): [string, FamilyGroup][] {
  const groups = new Map<string, FamilyGroup>();
  people.forEach((p, i) => {
    const raw = lineage(p);
    const key = surnameKey(raw, united);
    if (!key) return;
    const g = groups.get(key) ?? { count: 0, first: i, spellings: new Map<string, number>() };
    g.count++;
    g.spellings.set(raw, (g.spellings.get(raw) ?? 0) + 1);
    groups.set(key, g);
  });
  return [...groups.entries()];
}

/** The shortest spelling, which is the base form (Novák, not Nováková, however many women the family has); on a tie the most used. */
export function preferredSpelling(spellings: Map<string, number>): string {
  let best = '';
  let bestCount = -1;
  for (const [s, c] of spellings) {
    if (!best || s.length < best.length || (s.length === best.length && c > bestCount)) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}
