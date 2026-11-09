import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { parseDateInput } from '../../core/model/dates';
import { GenDate } from '../../core/model/types';
import { I18n } from '../../i18n/i18n';

/**
 * A date box that accepts the many ways people write dates ("17.5.1923",
 * "May 1923", "17. května 1923", "abt 1900", "before 1850") and says how it read
 * them, in numbers at the right of the box ("17. 5. 1923"). A stored date is shown
 * in numbers too, without month names.
 */
@Component({
  selector: 'stemma-date-field',
  templateUrl: './date-field.html',
  styleUrl: './date-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateField {
  private readonly i18n = inject(I18n);

  readonly value = input<GenDate | undefined>();
  readonly inputId = input.required<string>();
  readonly placeholder = input<string>();
  readonly valueChange = output<GenDate | undefined>();

  protected readonly t = this.i18n.t;
  protected readonly focused = signal(false);
  protected readonly text = signal('');
  private readonly typed = signal(false);

  private readonly parsed = computed(() => {
    const raw = this.text().trim();
    return this.typed() && raw ? parseDateInput(raw) : undefined;
  });

  /** A typed text that is not a calendar date: kept as words, said under the box. */
  protected readonly hint = computed<{ text: string; warn: boolean } | null>(() => {
    const parsed = this.parsed();
    return parsed && !parsed.value ? { text: this.t('date.keptAsText'), warn: true } : null;
  });

  /** How a typed date was read, in numbers, at the right of the box; nothing when it reads as typed. */
  protected readonly reading = computed(() => {
    const parsed = this.parsed();
    if (!parsed?.value) return '';
    const numeric = this.i18n.dates().numericDate(parsed);
    return numeric.replace(/\s/g, '') === this.text().trim().replace(/\s/g, '') ? '' : numeric;
  });

  constructor() {
    // Show the stored date in numbers, except while the person is typing.
    effect(() => {
      const shown = this.i18n.dates().numericDate(this.value());
      if (!untracked(this.focused)) this.text.set(shown);
    });
  }

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.text.set(raw);
    this.typed.set(true);
    this.valueChange.emit(parseDateInput(raw));
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.typed.set(false);
    this.text.set(this.i18n.dates().numericDate(this.value()));
  }
}
