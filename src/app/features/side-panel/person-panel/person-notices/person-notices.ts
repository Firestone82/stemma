import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { missingDetails } from '../../../../core/model/completeness';
import { Person } from '../../../../core/model/types';
import { I18n } from '../../../../i18n/i18n';
import { Icon } from '../../../../shared/icon/icon';
import { DataChecks } from '../../../../state/data-checks';

/**
 * What is wrong with this person's record and what is still to fill in, at the top of their panel: the dates
 * that cannot be right (the same sentences as in the tree's checks) and the details nobody has entered. Shown
 * only when there is something to say.
 */
@Component({
  selector: 'stemma-person-notices',
  imports: [Icon],
  templateUrl: './person-notices.html',
  styleUrl: './person-notices.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonNotices {
  private readonly checks = inject(DataChecks);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly person = input.required<Person>();

  /** The dates that cannot be right, each as a sentence. */
  protected readonly errors = computed(() => {
    const id = this.person().id;
    return this.checks
      .problems()
      .filter((p) => p.personIds.includes(id))
      .map((p) => ({ key: p.key, text: p.text }));
  });

  /** What is still to fill in: "To fill in: year of birth and date of death". */
  protected readonly missing = computed(() => {
    const gaps = missingDetails(this.person());
    return gaps.length ? this.t('missing.title', { list: this.i18n.list(gaps.map((g) => this.t(`missing.${g}`))) }) : '';
  });
}
