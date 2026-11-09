import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PortraitAlign, PortraitShape, PrintSettings } from '../../../core/model/types';

/** The dates on the cards: none, years, or in full as numbers. */
type Dates = 'hidden' | 'years' | 'full';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';
import { BackgroundPicker } from '../../../shared/background-picker/background-picker';
import { SegmentOption, Segmented } from '../../../shared/segmented/segmented';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

type CardKey =
  'showRelationships' | 'showPhotos' | 'showGenerations' | 'showSex' | 'sexColors' | 'showTree' | 'compactCouples' | 'tallGenerations' | 'showHidden';

const SWITCHES: readonly { key: CardKey; label: MessageKey }[] = [
  { key: 'showRelationships', label: 'display.relationships' },
  { key: 'showPhotos', label: 'display.photos' },
  { key: 'showGenerations', label: 'display.generations' },
  { key: 'showSex', label: 'display.sexSymbol' },
  { key: 'sexColors', label: 'display.sexColors' },
  { key: 'showTree', label: 'display.tree' },
  { key: 'compactCouples', label: 'print.compactCouples' },
  { key: 'tallGenerations', label: 'print.tallGenerations' },
  { key: 'showHidden', label: 'print.showHidden' },
];

/**
 * What the cards and the page show, how the portraits are shown, and the picture behind the tree. The
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
    return SWITCHES.map((x) => ({ ...x, on: s[x.key] }));
  });

  protected readonly settings = this.model.settings;
  protected readonly showTree = computed(() => this.model.settings().showTree);

  protected readonly shapes = computed<SegmentOption<PortraitShape>[]>(() => [
    { value: 'round', label: this.t('print.portrait.round') },
    { value: 'square', label: this.t('print.portrait.square') },
    { value: 'rectangle', label: this.t('print.portrait.rectangle') },
  ]);
  protected readonly aligns = computed<SegmentOption<PortraitAlign>[]>(() => [
    { value: 'middle', label: this.t('print.portraitAlign.middle') },
    { value: 'top', label: this.t('print.portraitAlign.top') },
  ]);

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

  protected readonly sizePercent = computed(() => `${Math.round(this.model.settings().portraitSize * 100)} %`);

  protected setSize(event: Event): void {
    this.model.set({ portraitSize: Number((event.target as HTMLInputElement).value) });
  }

  protected toggle(key: CardKey, on: boolean): void {
    this.model.set({ [key]: on } as Partial<PrintSettings>);
  }
}
