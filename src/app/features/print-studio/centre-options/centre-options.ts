import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { SearchOption, SearchSelect } from '../../../shared/search-select/search-select';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

/** Who stands in the middle of the page, with which partner. */
@Component({
  selector: 'stemma-centre-options',
  imports: [Switch, SearchSelect, Icon],
  templateUrl: './centre-options.html',
  styleUrl: './centre-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-middle' },
})
export class CentreOptions {
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  protected readonly people = computed<SearchOption[]>(() => this.model.people().map((p) => ({ id: p.id, label: p.name, detail: p.dates })));

  protected readonly partners = computed<SearchOption[]>(() => [
    ...this.model.partners().map((p) => ({ id: p.id, label: p.label })),
    { id: '', label: this.t('print.nobody') },
  ]);

  protected setCenter(id: string): void {
    this.model.set({ centerId: id, partnerId: undefined });
  }

  protected setPartner(id: string): void {
    this.model.set({ partnerId: id ? id : null });
  }

  /** The partner goes to the middle, and the person in the middle becomes the partner. */
  protected swap(): void {
    const centerId = this.model.centerId();
    const partnerId = this.model.poster()?.partnerId;
    if (centerId && partnerId) this.model.set({ centerId: partnerId, partnerId: centerId });
  }
}
