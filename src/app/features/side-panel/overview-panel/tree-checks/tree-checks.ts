import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GapKind } from '../../../../core/model/checks';
import { clearUnknownDates, unknownDateCount } from '../../../../core/model/operations';
import { TreeStore } from '../../../../core/store/tree-store';
import { I18n } from '../../../../i18n/i18n';
import { MessageKey } from '../../../../i18n/locales';
import { Icon } from '../../../../shared/icon/icon';
import { DataChecks } from '../../../../state/data-checks';
import { FamilyReview } from '../../../../state/family-review';
import { PersonActions } from '../../../../state/person-actions';

const GAP_KEYS: Record<GapKind, MessageKey> = { given: 'checks.gap.given', birth: 'checks.gap.birth', death: 'checks.gap.death' };

/**
 * What the tree still lacks and what cannot be right: how many people have no
 * given name, date of birth or date of death (unless ticked as unknown), each
 * list opening to the names, and every date that contradicts another (a child
 * born before a parent, after the mother died…). A name opens that person. The
 * dates ticked as unknown can all be unticked at once, to go through them again.
 */
@Component({
  selector: 'stemma-tree-checks',
  imports: [Icon],
  templateUrl: './tree-checks.html',
  styleUrl: './tree-checks.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeChecks {
  protected readonly store = inject(TreeStore);
  private readonly people = inject(PersonActions);
  protected readonly review = inject(FamilyReview);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  private readonly checks = inject(DataChecks);
  private readonly result = this.checks.result;

  private nameOf(id: string): string {
    const doc = this.store.doc();
    return this.i18n.name(doc.people.find((p) => p.id === id));
  }

  protected readonly gaps = computed(() =>
    this.result().gaps.map((g) => ({
      kind: g.kind,
      label: this.t(GAP_KEYS[g.kind], { count: g.personIds.length }),
      people: g.personIds.map((id) => ({ id, name: this.nameOf(id) })),
    })),
  );

  protected readonly problems = computed(() => this.checks.problems().map((p) => ({ key: p.key, personId: p.personIds[0], text: p.text })));

  protected readonly allGood = computed(() => !this.gaps().length && !this.problems().length && this.store.doc().people.length > 0);

  protected open(personId: string): void {
    this.people.select(personId);
  }

  /** How many dates of birth and death are ticked as unknown, and so not asked about. */
  protected readonly unknownDates = computed(() => unknownDateCount(this.store.doc()));

  /** Unticks them all, in one step: every missing date is listed again, to go through them afresh. */
  protected askAgain(): void {
    this.store.update(clearUnknownDates);
  }
}
