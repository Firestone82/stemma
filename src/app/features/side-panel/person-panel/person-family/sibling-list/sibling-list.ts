import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { birthGroupOf } from '../../../../../core/model/births';
import { FamilyActions } from '../../../../../state/family-actions';
import { Person } from '../../../../../core/model/types';
import { TreeStore } from '../../../../../core/store/tree-store';
import { I18n } from '../../../../../i18n/i18n';
import { bornTogetherTag } from '../../../../../i18n/labels';
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

  protected readonly siblings = computed(() => {
    const id = this.person().id;
    const index = this.store.index();
    const group = birthGroupOf(this.store.doc(), id);
    const tag = group ? bornTogetherTag(this.t, group.memberIds.length) : '';
    return index.siblings(id).map((p) => ({
      ...this.rows.row(p),
      tag: group?.memberIds.includes(p.id) ? tag : '',
      // The family both are children of, where twins are marked.
      familyId: index.parentFamilies(id).find((f) => f.children.some((c) => c.personId === p.id))?.id,
    }));
  });

  /** Marks the sibling as born together with the person, or not after all. */
  protected toggleTwin(s: { id: string; familyId?: string; tag: string }): void {
    if (!s.familyId) return;
    if (s.tag) this.families.unlinkBirth(s.familyId, s.id);
    else this.families.linkBirth(s.familyId, [this.person().id, s.id]);
  }
  protected readonly halfSiblings = computed(() =>
    this.store
      .index()
      .halfSiblings(this.person().id)
      .map((p) => this.rows.row(p)),
  );
}
