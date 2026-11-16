import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LETTERING_CM, LINE_HEIGHT } from '../../../core/model/types';
import { I18n } from '../../../i18n/i18n';
import { PrintModel } from '../print-model';

/**
 * The line height of the title, or of the families' names, in centimetres (see PrintSettings.titleSize). Where
 * none is set the field shows the size the page gives them (to suit the sheet and the cards), marked as
 * automatic; emptying the field goes back to that. Where one is set, the size the page would give is offered
 * beside the field, to take with a click. And the size of the letters in points. A size waits to be applied
 * with the other changes that wait (PrintModel.staged).
 */
@Component({
  selector: 'stemma-letter-size',
  templateUrl: './letter-size.html',
  styleUrl: './letter-size.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'field' },
})
export class LetterSize {
  private readonly model = inject(PrintModel);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly key = input.required<'titleSize' | 'legendSize'>();

  protected readonly size = computed(() => {
    const key = this.key();
    const set = this.model.view()[key];
    const drawn = this.model.poster()?.lettering;
    const auto = key === 'titleSize' ? drawn?.autoTitleCm : drawn?.autoLegendCm;
    // In the app's language: 1,5 in Czech.
    const number = new Intl.NumberFormat(this.i18n.locale().intl, { maximumFractionDigits: 1 });
    const cm = (v: number) => number.format(Math.round(v * 10) / 10);
    // Letters a fifth lower than the line, a point being 0.3528 mm.
    const pt = (v: number) => Math.round((v * 10) / LINE_HEIGHT / 0.3528);
    const shown = set ?? auto;
    return {
      id: `print-${key}`,
      label: key === 'titleSize' ? ('print.titleSize' as const) : ('print.legendSize' as const),
      value: set ? cm(set) : '',
      auto: auto !== undefined ? cm(auto) : '',
      pt: shown !== undefined ? pt(shown) : undefined,
    };
  });

  /** A size is typed in, and the page would choose another: offered in the field, to take with a click. */
  protected readonly offer = computed(() => {
    const s = this.size();
    return !!s.value && !!s.auto && s.auto !== s.value;
  });

  protected set(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(',', '.').trim();
    const value = Number(raw);
    this.model.stage({ [this.key()]: raw && Number.isFinite(value) && value > 0 ? Math.min(LETTERING_CM.max, Math.max(LETTERING_CM.min, value)) : undefined });
  }

  /** Back to the size the page chooses. */
  protected useSuggested(): void {
    this.model.stage({ [this.key()]: undefined });
  }
}
