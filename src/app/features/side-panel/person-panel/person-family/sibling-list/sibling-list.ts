import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { birthColor, birthGroupOf } from '../../../../../core/model/births';
import { FamilyActions } from '../../../../../state/family-actions';
import { Person } from '../../../../../core/model/types';
import { TreeStore } from '../../../../../core/store/tree-store';
import { I18n } from '../../../../../i18n/i18n';
import { bornTogetherLabel } from '../../../../../i18n/labels';
import { Icon } from '../../../../../shared/icon/icon';
import { PersonRow } from '../../../../../shared/person-row/person-row';
import { PersonActions } from '../../../../../state/person-actions';
import { PersonRows } from '../person-rows';

/**
 * Brothers and sisters, then half-siblings who share only one parent. Next
 * to each full sibling, whether they were born together with the person
 * (twins), which can be switched on and off here.
 */
@Component({
  selector: 'stemma-sibling-list',
  imports: [Icon, PersonRow],
  templateUrl: './sibling-list.html',
  styleUrl: './sibling-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiblingList {
  private readonly store = inject(TreeStore);
  private readonly rows = inject(PersonRows);
  protected readonly people = inject(PersonActions);
  private readonly families = inject(FamilyActions);
  protected readonly t = inject(I18n).t;

  readonly person = input.required<Person>();

  /** The person's own birth group, when they were born together with someone. */
  protected readonly myGroup = computed(() => birthGroupOf(this.store.doc(), this.person().id));

  /**
   * Each brother or sister, with the group they were born together in, if any:
   * "Twins", "Triplets"…, in the colour of that group in their family, so that
   * two pairs of twins can be told apart.
   */
  protected readonly siblings = computed(() => {
    const id = this.person().id;
    const index = this.store.index();
    const mine = this.myGroup();
    return index.siblings(id).map((p) => {
      // The family both are children of, where twins are marked.
      const family = index.parentFamilies(id).find((f) => f.children.some((c) => c.personId === p.id));
      const key = family?.children.find((c) => c.personId === p.id)?.birthGroup;
      const size = key ? family!.children.filter((c) => c.birthGroup === key).length : 0;
      return {
        ...this.rows.row(p),
        familyId: family?.id,
        withMe: !!mine?.memberIds.includes(p.id),
        group: family && key && size > 1 ? { label: bornTogetherLabel(this.t, size), color: birthColor(family, key) } : undefined,
      };
    });
  });

  /** Marks the sibling as born together with the person, or not after all. */
  protected toggleTwin(s: { id: string; familyId?: string; withMe: boolean }): void {
    if (!s.familyId) return;
    if (s.withMe) this.families.unlinkBirth(s.familyId, s.id);
    else this.families.linkBirth(s.familyId, [this.person().id, s.id]);
  }
  protected readonly halfSiblings = computed(() =>
    this.store
      .index()
      .halfSiblings(this.person().id)
      .map((p) => this.rows.row(p)),
  );
}
