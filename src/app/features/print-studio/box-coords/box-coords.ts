import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { PrintModel } from '../print-model';

/**
 * Where the title or the families' names stand on the page, as coordinates: how many centimetres their top
 * left corner is from the left and from the top of the paper. Typed here, they are put there (waiting to be
 * applied with the other changes of the place, like a drag) and the print remembers them with the tree.
 */
@Component({
  selector: 'stemma-box-coords',
  templateUrl: './box-coords.html',
  styleUrl: './box-coords.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BoxCoords {
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;
  readonly of = input.required<'title' | 'legend'>();

  protected readonly at = computed(() => this.model.boxCm()?.[this.of()]);
  protected readonly page = computed(() => this.model.boxCm());

  protected fmt(v: number): string {
    return (Math.round(v * 100) / 100).toString();
  }

  protected set(axis: 'x' | 'y', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value.replace(',', '.'));
    if (Number.isFinite(value)) this.model.setBoxCm(this.of(), axis, value);
  }
}
