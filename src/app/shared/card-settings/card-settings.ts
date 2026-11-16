import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CardSettings, DateStyle, EmblemAlign } from '../../core/model/types';
import { I18n } from '../../i18n/i18n';
import { MessageKey } from '../../i18n/locales';
import { SegmentOption, Segmented } from '../segmented/segmented';
import { Switch } from '../switch/switch';

type CardKey = Exclude<keyof CardSettings, 'dates' | 'emblemAlign'>;

const SWITCHES: readonly { key: CardKey; label: MessageKey }[] = [
  { key: 'showEmblems', label: 'cards.emblems' },
  { key: 'showBirthNames', label: 'cards.birthNames' },
  { key: 'unknownBirthNames', label: 'cards.birthUnknown' },
  { key: 'sexColors', label: 'cards.sexAccent' },
  { key: 'showRibbons', label: 'cards.ribbons' },
];

/**
 * What the cards show: every part of the card can be switched on and off, and the dates hidden, as years or
 * in full. The chart (Appearance) and the print studio each keep their own choices.
 */
@Component({
  selector: 'stemma-card-settings',
  imports: [Switch, Segmented],
  templateUrl: './card-settings.html',
  styleUrl: './card-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardSettingsForm {
  protected readonly t = inject(I18n).t;

  readonly settings = input.required<CardSettings>();
  /** Ids on the page must be unique: the chart's menu and the print studio each have one of these. */
  readonly idPrefix = input.required<string>();
  /** The switches in two columns, where there is room. */
  readonly columns = input(false);
  readonly settingsChange = output<Partial<CardSettings>>();

  protected readonly switches = computed(() => SWITCHES.map((s) => ({ ...s, on: this.settings()[s.key] })));
  protected readonly dateOptions = computed<SegmentOption<DateStyle>[]>(() => [
    { value: 'none', label: this.t('cards.dates.none') },
    { value: 'years', label: this.t('cards.dates.years') },
    { value: 'full', label: this.t('cards.dates.full') },
  ]);

  protected toggle(key: CardKey, on: boolean): void {
    this.settingsChange.emit({ [key]: on });
  }

  protected readonly alignOptions = computed<SegmentOption<EmblemAlign>[]>(() => [
    { value: 'top', label: this.t('cards.emblemTop') },
    { value: 'center', label: this.t('cards.emblemCenter') },
  ]);

  protected setAlign(emblemAlign: EmblemAlign): void {
    this.settingsChange.emit({ emblemAlign });
  }

  protected setDates(dates: DateStyle): void {
    this.settingsChange.emit({ dates });
  }
}
