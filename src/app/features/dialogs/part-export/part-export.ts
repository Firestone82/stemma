import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { partSize } from '../../../core/part/part';
import { RELATIVES, Relatives, relativesSettings } from '../../../core/poster/scope';
import { Person, Reach } from '../../../core/model/types';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';
import { Icon } from '../../../shared/icon/icon';
import { PersonPicker } from '../../../shared/person-picker/person-picker';
import { PartActions } from '../../../state/part-actions';

const REACHES: readonly Reach[] = [0, 1, 2, 3, 4, 'all'];

/**
 * Which part of the tree goes into a file of its own: the person it is taken around, how many generations up and
 * down, and how far out to the sides, as on prints. Everyone's partners come with them.
 */
@Component({
  selector: 'stemma-part-export',
  imports: [Icon, PersonPicker],
  templateUrl: './part-export.html',
  styleUrl: './part-export.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartExport {
  private readonly store = inject(TreeStore);
  private readonly parts = inject(PartActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly done = output<void>();

  protected readonly reaches = REACHES;
  protected readonly relativesSteps = RELATIVES;

  /** The person the part is taken around: the one selected, else the one the tree is drawn around. */
  protected readonly centerId = signal<string | null>(
    this.store.selectedPerson()?.id ?? this.store.doc().meta.homePersonId ?? this.store.doc().people[0]?.id ?? null,
  );
  protected readonly choosing = signal(false);
  protected readonly up = signal<Reach>(0);
  protected readonly down = signal<Reach>('all');
  protected readonly relatives = signal<Relatives>('direct');

  protected readonly center = computed(() => {
    const id = this.centerId();
    return id ? this.store.index().person(id) : undefined;
  });

  private readonly scope = computed(() => {
    const centerId = this.center()?.id;
    if (!centerId) return null;
    return { centerId, ancestors: this.up(), descendants: this.down(), ...relativesSettings(this.relatives()) };
  });

  protected readonly size = computed(() => {
    const scope = this.scope();
    return scope ? partSize(this.store.doc(), this.store.index(), scope) : { people: 0, families: 0 };
  });

  protected reachLabel(r: Reach): string {
    return r === 'all' ? this.t('part.reach.all') : r === 0 ? this.t('part.reach.none') : this.t('part.reach.generations', { count: r });
  }

  protected name(p: Person): string {
    return this.i18n.name(p);
  }

  protected relativesLabel(r: Relatives): string {
    return this.t(`relatives.${r}` as MessageKey);
  }

  protected relativesHint(r: Relatives): string {
    return this.t(`relatives.hint.${r}` as MessageKey);
  }

  protected setReach(which: 'up' | 'down', event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const value: Reach = raw === 'all' ? 'all' : Number(raw);
    (which === 'up' ? this.up : this.down).set(value);
  }

  protected setRelatives(event: Event): void {
    this.relatives.set((event.target as HTMLSelectElement).value as Relatives);
  }

  protected choose(id: string | null): void {
    if (!id) return;
    this.centerId.set(id);
    this.choosing.set(false);
  }

  protected async export(): Promise<void> {
    const scope = this.scope();
    if (!scope) return;
    this.done.emit();
    await this.parts.savePart(scope);
  }
}
