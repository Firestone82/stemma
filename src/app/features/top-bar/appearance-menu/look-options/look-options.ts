import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../../i18n/i18n';
import { SegmentOption, Segmented } from '../../../../shared/segmented/segmented';
import { THEME_CHOICES, Theme, ThemeChoice } from '../../../../state/theme';

/** Light or dark (a setting of this browser). */
@Component({
  selector: 'stemma-look-options',
  imports: [Segmented],
  templateUrl: './look-options.html',
  styleUrl: './look-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LookOptions {
  protected readonly t = inject(I18n).t;
  protected readonly theme = inject(Theme);

  protected readonly styles = computed<SegmentOption<ThemeChoice>[]>(() => THEME_CHOICES.map((value) => ({ value, label: this.t(`look.style.${value}`) })));
}
