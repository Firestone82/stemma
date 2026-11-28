import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CardSettings, PrintSettings } from '../../../core/model/types';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';
import { CardSettingsForm } from '../../../shared/card-settings/card-settings';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

type PageKey = 'showTitle' | 'showLegend' | 'showFrame' | 'showDecorations' | 'showHidden' | 'unionText';

const SWITCHES: readonly { key: PageKey; label: MessageKey }[] = [
  { key: 'showTitle', label: 'print.showTitle' },
  { key: 'showLegend', label: 'print.showLegend' },
  { key: 'showFrame', label: 'print.showFrame' },
  { key: 'showDecorations', label: 'print.showDecorations' },
  { key: 'unionText', label: 'print.unionText' },
  { key: 'showHidden', label: 'print.showHidden' },
];

/**
 * What the cards show (every part can be switched off) and which parts of the page there are. The words on
 * the page are in the app's language (Appearance).
 */
@Component({
  selector: 'stemma-card-options',
  imports: [Switch, CardSettingsForm],
  templateUrl: './card-options.html',
  styleUrl: './card-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-cards' },
})
export class CardOptions {
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  protected readonly settings = this.model.settings;
  protected readonly switches = computed(() => SWITCHES.map((x) => ({ ...x, on: this.model.settings()[x.key] })));

  protected setCards(patch: Partial<CardSettings>): void {
    this.model.set(patch);
  }

  protected toggle(key: PageKey, on: boolean): void {
    this.model.set({ [key]: on } as Partial<PrintSettings>);
  }
}
