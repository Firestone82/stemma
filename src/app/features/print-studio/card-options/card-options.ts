import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PrintSettings } from '../../../core/model/types';

/** The dates on the cards: none, years, or in full as numbers. */
type Dates = 'hidden' | 'years' | 'full';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';
import { BackgroundPicker } from '../../../shared/background-picker/background-picker';
import { SegmentOption, Segmented } from '../../../shared/segmented/segmented';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

type CardKey = 'showGenerations' | 'showSex' | 'sexColors' | 'showTree' | 'compactCouples' | 'tallGenerations' | 'packFamilies' | 'showEmblems' | 'showHidden';

const SWITCHES: readonly { key: CardKey; label: MessageKey }[] = [
  { key: 'showGenerations', label: 'display.generations' },
  { key: 'showEmblems', label: 'print.emblems' },
  { key: 'showSex', label: 'display.sexSymbol' },
  { key: 'sexColors', label: 'display.sexColors' },
  { key: 'showTree', label: 'display.tree' },
  { key: 'compactCouples', label: 'print.compactCouples' },
  { key: 'tallGenerations', label: 'print.tallGenerations' },
  { key: 'packFamilies', label: 'print.packFamilies' },
  { key: 'showHidden', label: 'print.showHidden' },
];

/**
 * What the cards and the page show, and the picture behind the tree. Prints have no portraits or
 * relationship names (see renderPoster). The
 * words on the page are in the app's language (Appearance), and every couple
 * has a note saying how they stand.
 */
@Component({
  selector: 'stemma-card-options',
  imports: [Switch, BackgroundPicker, Segmented],
  templateUrl: './card-options.html',
  styleUrl: './card-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-cards' },
})
export class CardOptions {
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  protected readonly switches = computed(() => {
    const s = this.model.settings();
    // Rows are not generations while families are packed together: no numbers for them.
    return SWITCHES.map((x) => {
      const off = x.key === 'showGenerations' && !!s.packFamilies;
      // Emblems are shown unless turned off (older files have no setting for them).
      const on = x.key === 'showEmblems' ? s.showEmblems !== false : !!s[x.key];
      return { ...x, on: on && !off, disabled: off };
    });
  });

  protected readonly settings = this.model.settings;
  protected readonly showTree = computed(() => this.model.settings().showTree);

  protected readonly dateOptions = computed<SegmentOption<Dates>[]>(() => [
    { value: 'hidden', label: this.t('print.dates.hidden') },
    { value: 'years', label: this.t('print.dates.years') },
    { value: 'full', label: this.t('print.dates.full') },
  ]);
  protected readonly dates = computed<Dates>(() => {
    const s = this.model.settings();
    return !s.showDates ? 'hidden' : s.fullDates ? 'full' : 'years';
  });

  protected setDates(value: Dates): void {
    this.model.set({ showDates: value !== 'hidden', fullDates: value === 'full' });
  }

  protected toggle(key: CardKey, on: boolean): void {
    this.model.set({ [key]: on } as Partial<PrintSettings>);
  }
}
