import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { relationshipStatus } from '../../../../../core/model/relationship';
import { ChildRelation, Family, Person } from '../../../../../core/model/types';
import { TreeStore } from '../../../../../core/store/tree-store';
import { I18n } from '../../../../../i18n/i18n';
import { MessageKey } from '../../../../../i18n/locales';
import { Icon } from '../../../../../shared/icon/icon';
import { PersonRow } from '../../../../../shared/person-row/person-row';
import { PersonActions } from '../../../../../state/person-actions';
import { PersonRows } from '../person-rows';

const GROUP_LABEL: Record<ChildRelation, MessageKey> = {
  biological: 'parents.biological',
  adopted: 'parents.adopted',
  foster: 'parents.foster',
  step: 'parents.step',
  unknown: 'parents.unknown',
};

/** The person's parents, one group per family they are a child of (birth, adoptive, foster…). */
@Component({
  selector: 'stemma-parent-groups',
  imports: [Icon, PersonRow],
  templateUrl: './parent-groups.html',
  styleUrl: './parent-groups.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParentGroups {
  private readonly store = inject(TreeStore);
  private readonly rows = inject(PersonRows);
  protected readonly people = inject(PersonActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  /** The family whose list of other couples to move to is open. */
  protected readonly moving = signal<string | null>(null);

  readonly person = input.required<Person>();

  protected readonly groups = computed(() => {
    const index = this.store.index();
    const id = this.person().id;
    const primary = index.primaryParentFamily(id);
    return index.parentFamilies(id).map((f) => ({
      family: f,
      label: GROUP_LABEL[index.childRelation(f, id)],
      parents: f.partners
        .map((p) => index.person(p))
        .filter((p): p is Person => !!p)
        .map((p) => this.rows.row(p)),
      canAdd: f === primary && f.partners.length < 2,
      targets: this.targets(f, id),
    }));
  });

  /** Other couples (or the parent alone) of the parents of `from` that the child could be moved under. */
  private targets(from: Family, childId: string): { id: string; label: string }[] {
    const index = this.store.index();
    const below = index.descendants(childId);
    const seen = new Set<string>([from.id]);
    const out: { id: string; label: string }[] = [];
    for (const parent of from.partners) {
      for (const f of index.partnerFamilies(parent)) {
        if (seen.has(f.id) || f.partners.some((p) => p === childId || below.has(p))) continue;
        seen.add(f.id);
        const names = f.partners.map((p) => this.i18n.name(index.person(p)));
        const label =
          f.partners.length === 2
            ? `${this.i18n.list(names)} (${this.t(`status.${relationshipStatus(f)}`).toLocaleLowerCase()})`
            : this.t('parents.alone', { name: names[0] });
        out.push({ id: f.id, label });
      }
    }
    return out;
  }

  protected move(from: string, to: string): void {
    this.moving.set(null);
    this.people.moveToParents(from, to, this.person().id);
  }
}
