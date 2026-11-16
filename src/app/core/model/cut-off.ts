/**
 * Who goes when lines of a chart are taken away. A line joins a child to their parents; without it, whoever
 * is no longer joined to the person in the middle (through any line or any couple) is cut off. Where the tree
 * stays in one piece without the lines (cousins who married), only the children the lines led to go.
 */
import { TreeIndex } from './tree-index';

export interface CutLine {
  familyId: string;
  childId: string;
}

/** The people among `shown` who go with the lines `cuts`, in the order of `shown`; never the person in the middle. */
export function cutOff(index: TreeIndex, shown: Iterable<string>, centerId: string, cuts: readonly CutLine[]): string[] {
  const people = new Set(shown);
  if (!cuts.length || !people.has(centerId)) return [];
  const cut = new Set(cuts.map((c) => `${c.familyId} ${c.childId}`));
  // People and families, each person joined to the families they are a partner or a child in (so brothers and
  // sisters whose parents are not known still hold together), without the lines taken away.
  const next = new Map<string, Set<string>>();
  const join = (a: string, b: string) => {
    (next.get(a) ?? next.set(a, new Set()).get(a)!).add(b);
    (next.get(b) ?? next.set(b, new Set()).get(b)!).add(a);
  };
  for (const id of people) {
    for (const f of index.partnerFamilies(id)) join(id, `family ${f.id}`);
    for (const f of index.parentFamilies(id)) if (!cut.has(`${f.id} ${id}`)) join(id, `family ${f.id}`);
  }
  const kept = new Set([centerId]);
  const queue = [centerId];
  for (const id of queue)
    for (const n of next.get(id) ?? [])
      if (!kept.has(n)) {
        kept.add(n);
        queue.push(n);
      }
  const gone = [...people].filter((id) => !kept.has(id));
  if (gone.length) return gone;
  const children = new Set(cuts.map((c) => c.childId));
  return [...people].filter((id) => children.has(id) && id !== centerId);
}
