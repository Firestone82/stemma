import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../shared/icon/icon';

/** How far along a tree being read from Google Drive is: a bar filling up, or moving to and fro where the size is not known. */
@Component({
  selector: 'stemma-drive-loading',
  imports: [Icon],
  template: `
    <stemma-icon [name]="saving() ? 'cloudUp' : 'cloud'" [size]="18" />
    <div class="body">
      <p>{{ label() }}</p>
      <div
        class="bar"
        role="progressbar"
        [attr.aria-label]="label()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="100"
        [attr.aria-valuenow]="percent()"
        [class.unknown]="percent() === null"
      >
        <span [style.width.%]="percent() ?? 30"></span>
      </div>
      <p class="amount">{{ amount() }}</p>
    </div>
  `,
  styleUrl: './drive-loading.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status' },
})
export class DriveLoading {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  readonly saving = input(false);
  readonly loading = input.required<{ name: string; loaded: number; total: number | null }>();

  protected readonly label = computed(() => this.t(this.saving() ? 'drive.saving' : 'drive.loading', { name: this.loading().name }));

  protected readonly percent = computed(() => {
    const { loaded, total } = this.loading();
    return total ? Math.min(100, Math.round((loaded / total) * 100)) : null;
  });

  protected readonly amount = computed(() => {
    const { loaded, total } = this.loading();
    const size = new Intl.NumberFormat(this.i18n.locale().intl, { maximumFractionDigits: 1 });
    const kb = (bytes: number) => `${size.format(bytes / 1024)} kB`;
    return total ? `${kb(loaded)} / ${kb(total)} · ${this.percent()} %` : loaded ? kb(loaded) : '';
  });
}
