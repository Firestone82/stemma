import { Injectable, computed, inject } from '@angular/core';
import { checkTree, ProblemKind } from '../core/model/checks';
import { TreeStore } from '../core/store/tree-store';
import { I18n } from '../i18n/i18n';

export interface ProblemLine {
  key: string;
  /** Everyone it involves; the first is the person whose record looks wrong first. */
  personIds: string[];
  text: string;
}

/**
 * The tree checked as it stands (see checkTree): what is missing, and the
 * dates that cannot be right, worded, and by person, for the panel that lists
 * them and the red flags on cards and in lists.
 */
@Injectable({ providedIn: 'root' })
export class DataChecks {
  private readonly store = inject(TreeStore);
  private readonly i18n = inject(I18n);

  readonly result = computed(() => checkTree(this.store.doc()));

  readonly problems = computed<ProblemLine[]>(() => {
    const people = new Map(this.store.doc().people.map((p) => [p.id, p]));
    return this.result().problems.map((p, i) => {
      const [first, second] = p.personIds.map((id) => this.i18n.name(people.get(id)));
      return {
        key: `${p.kind}-${p.personIds.join('-')}-${i}`,
        personIds: p.personIds,
        text: this.i18n.t(`checks.problem.${p.kind}` as `checks.problem.${ProblemKind}`, { person: first, other: second ?? '', value: p.value ?? 0 }),
      };
    });
  });

  /**
   * For each person whose record looks wrong, what is wrong, one sentence a line. A problem is flagged on the
   * one it is about (the first of its people) only: a child born before their father is flagged, the father not.
   */
  readonly byPerson = computed(() => {
    const out = new Map<string, string>();
    for (const p of this.problems()) {
      const id = p.personIds[0];
      out.set(id, out.has(id) ? `${out.get(id)}\n${p.text}` : p.text);
    }
    return out;
  });
}
