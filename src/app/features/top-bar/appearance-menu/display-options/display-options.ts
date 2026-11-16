import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CardSettings, ViewSettings } from '../../../../core/model/types';
import { CardSettingsForm } from '../../../../shared/card-settings/card-settings';
import { I18n } from '../../../../i18n/i18n';
import { Switch } from '../../../../shared/switch/switch';

/** What the cards on the chart show, and what stands behind them. */
@Component({
  selector: 'stemma-display-options',
  imports: [CardSettingsForm, Switch],
  templateUrl: './display-options.html',
  styleUrl: './display-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisplayOptions {
  readonly view = input.required<ViewSettings>();
  readonly settingsChange = output<Partial<CardSettings & Pick<ViewSettings, 'familyBackgrounds'>>>();
  protected readonly t = inject(I18n).t;
}
