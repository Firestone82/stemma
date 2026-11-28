import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { ChartModel } from '../../../state/chart-model';
import { FocusedView } from '../../../state/focused-view';

/**
 * Turns the focused view of the whole tree on and off (see state/focused-view), next to the zoom buttons.
 * While it is on, the button says how many people are on the chart.
 */
@Component({
  selector: 'stemma-focused-toggle',
  imports: [Icon],
  template: `
    <button type="button" class="pill" [attr.aria-pressed]="on()" [attr.aria-label]="hint()" [title]="hint()" (click)="focused.toggle()">
      <stemma-icon name="target" [size]="17" />
      <span class="label">{{ t('focusedView.button') }}</span>
      @if (on()) {
        <span class="shown">{{ t('relatives.shown', { shown: shown(), total: total() }) }}</span>
      }
    </button>
  `,
  styleUrl: './focused-toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocusedToggle {
  private readonly store = inject(TreeStore);
  private readonly model = inject(ChartModel);
  protected readonly focused = inject(FocusedView);
  protected readonly t = inject(I18n).t;

  protected readonly on = this.focused.on;
  protected readonly hint = computed(() => this.t(this.on() ? 'focusedView.on' : 'focusedView.off'));
  protected readonly total = computed(() => this.store.doc().people.length);
  protected readonly shown = computed(() => this.total() - this.model.hidden().size);
}
